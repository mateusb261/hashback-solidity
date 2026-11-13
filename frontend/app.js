// HashBack — frontend com MetaMask, Web3.js 4.x e contrato na Sepolia

let web3 = null;
let contract = null;
let account = null;
let role = { isOwner: false, isMerchant: false, isCustomer: false };
let rewards = [];

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_HEX = "0xaa36a7";
const config = window.HASHBACK_CONFIG;

const $ = (id) => document.getElementById(id);

const accountPillsContainer = $("account-pills");
const activeRoleEl = $("active-account-role");
const metricsContainer = $("metrics-container");
const operationsTitle = $("operations-title");
const segmentedTabsContainer = $("segmented-tabs");
const tabContentArea = $("tab-content-area");
const cellRewards = $("cell-rewards");
const cellMerchantSummary = $("cell-merchant-summary");
const rewardsContainer = $("rewards-container");
const vouchersContainer = $("vouchers-container");
const timelineContainer = $("blockchain-timeline");
const blocksCountEl = $("blocks-count");
const feedbackBox = $("contract-feedback-box");
const feedbackBadge = $("feedback-badge");
const feedbackMsg = $("feedback-msg");
const chainStatusText = $("chain-status-text");

function shorten(value) {
  if (!value) return "";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function safeText(value) {
  return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
}

function showFeedback(type, message, txHash = null) {
  if (!feedbackBox) return;

  feedbackBox.style.display = "flex";
  feedbackBox.className = `terminal-feedback ${type}`;

  if (type === "pending") {
    feedbackBadge.textContent = "PENDENTE";
  } else if (type === "success") {
    feedbackBadge.textContent = "CONFIRMADO";
  } else {
    feedbackBadge.textContent = "FALHOU";
  }

  feedbackMsg.textContent = message;

  const oldLink = feedbackBox.querySelector(".etherscan-link");
  if (oldLink) oldLink.remove();

  if (txHash) {
    const link = document.createElement("a");
    link.className = "etherscan-link";
    link.href = `https://sepolia.etherscan.io/tx/${txHash}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View on Sepolia Etherscan";
    feedbackBox.appendChild(link);
  }
}

function explainError(error) {
  if (error?.code === 4001) {
    return "You rejected the transaction in MetaMask.";
  }

  const message = error?.message || String(error);

  if (message.toLowerCase().includes("insufficient funds")) {
    return "This wallet needs SepoliaETH for the transaction fee and gas.";
  }

  if (
      message.toLowerCase().includes("revert") ||
      message.toLowerCase().includes("execution reverted")
  ) {
    return "The contract rejected this action. Check the wallet role, points balance, reward, or redemption fee.";
  }

  return message;
}

async function switchToSepoliaIfNeeded() {
  const currentChain = await window.ethereum.request({
    method: "eth_chainId",
  });

  if (currentChain === SEPOLIA_CHAIN_HEX) return;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_HEX }],
    });
  } catch (error) {
    if (error.code === 4001) {
      throw new Error("You cancelled the switch to Sepolia.");
    }
    throw error;
  }
}

async function connectWallet() {
    if (!window.ethereum) {
        showFeedback("error", "MetaMask was not found. Install it and reload this page.");
        return;
    }

    showFeedback("pending", "Waiting for MetaMask approval…");

    try {
        const accounts = await window.ethereum.request({
            method: "eth_requestAccounts",
        });

        if (!accounts.length) {
            showFeedback("error", "No wallet account was selected.");
            return;
        }

        account = accounts[0];
        web3 = new Web3(window.ethereum);

        const chainId = Number(await web3.eth.getChainId());

        if (chainId !== SEPOLIA_CHAIN_ID) {
            showFeedback("error", "Switch MetaMask to Sepolia, then connect again.");
            return;
        }

        if (
            !config ||
            !web3.utils.isAddress(config.contractAddress) ||
            !Array.isArray(config.abi) ||
            config.abi.length === 0
        ) {
            throw new Error("The HashBack address or ABI is missing from contract.js.");
        }

        const deployedCode = await web3.eth.getCode(config.contractAddress);

        if (deployedCode === "0x") {
            throw new Error("No contract was found at this address on Sepolia.");
        }

        contract = new web3.eth.Contract(config.abi, config.contractAddress);

        // Confirma que o endereço e a ABI permitem ler o contrato.
        await contract.methods.owner().call();

        const ethWei = await web3.eth.getBalance(account);

        $("wallet-address").textContent = account;
        $("wallet-network").textContent = `Chain ID ${chainId}`;
        $("wallet-eth-balance").textContent =
            `${web3.utils.fromWei(ethWei, "ether")} ETH`;

        const button = $("btn-connect-wallet");
        if (button) {
            button.textContent = shorten(account);
            button.title = account;
        }

        await refreshAll();

        showFeedback("success", "MetaMask and HashBack contract connected.");
    } catch (error) {
        contract = null;
        showFeedback("error", explainError(error));
    }
}

async function refreshAll() {
  if (!contract || !account) return;

  try {
    const [chainId, owner, isMerchant, points, ethWei] = await Promise.all([
      web3.eth.getChainId(),
      contract.methods.owner().call(),
      contract.methods.authorizedMerchants(account).call(),
      contract.methods.getBalance(account).call(),
      web3.eth.getBalance(account),
    ]);

    if (Number(chainId) !== SEPOLIA_CHAIN_ID) {
      showFeedback("error", "Switch MetaMask to Sepolia to use HashBack.");
      return;
    }

    role.isOwner = owner.toLowerCase() === account.toLowerCase();
    role.isMerchant = Boolean(isMerchant);
    role.isCustomer = !role.isMerchant;

    if (chainStatusText) chainStatusText.textContent = "Sepolia connected";

    renderAccount();
    renderProfile(points, ethWei);

    await Promise.all([
      loadRewards(),
      loadVouchers(),
      loadEventHistory(),
    ]);
  } catch (error) {
    showFeedback("error", `Could not read HashBack contract: ${explainError(error)}`);
  }
}

function renderAccount() {
  if (!accountPillsContainer) return;

  accountPillsContainer.replaceChildren();

  const label = document.createElement("span");
  label.className = "acc-pill active";
  label.textContent = account;
  label.title = account;
  accountPillsContainer.appendChild(label);
}

function renderProfile(points, ethWei) {
  if (!activeRoleEl || !metricsContainer) return;

  const labels = [];
  if (role.isOwner) labels.push("Owner");
  if (role.isMerchant) labels.push("Authorized store");
  if (role.isCustomer) labels.push("Customer");

  activeRoleEl.textContent = labels.join(" · ");

  const eth = web3.utils.fromWei(ethWei, "ether");

  metricsContainer.innerHTML = `
    <div class="metric-plate">
      <span class="plate-label">HashBack points</span>
      <div class="plate-balance">
        <span>${safeText(points.toString())}</span>
        <span class="token-ticker">HBC</span>
      </div>
    </div>
    <div class="metric-plate">
      <span class="plate-label">SepoliaETH for gas</span>
      <div class="plate-balance">
        <span>${safeText(eth)}</span>
        <span class="token-ticker">ETH</span>
      </div>
    </div>
    <div class="metric-plate address-plate">
      <span class="plate-label">Connected wallet</span>
      <div class="plate-mono">${safeText(account)}</div>
    </div>
  `;

  if (cellMerchantSummary) {
    cellMerchantSummary.style.display =
        role.isMerchant || role.isOwner ? "block" : "none";
  }

  if (cellRewards) {
    cellRewards.style.display = role.isCustomer ? "block" : "none";
  }

  renderOperations();
}

function renderOperations() {
  if (!tabContentArea || !segmentedTabsContainer) return;

  const panels = [];

  if (role.isOwner) {
    panels.push(`
      <section class="wallet-action">
        <h4>Owner: authorize a store</h4>
        <form id="form-authorize-store" class="haptic-form">
          <label for="store-address">Store wallet address</label>
          <input id="store-address" class="haptic-input" required placeholder="0x…">
          <button class="island-cta" type="submit">Authorize store</button>
        </form>
      </section>
      <section class="wallet-action">
        <h4>Owner: add a reward</h4>
        <form id="form-add-reward" class="haptic-form">
          <label for="reward-id">Reward ID (example: REW-5)</label>
          <input id="reward-id" class="haptic-input" required>
          <label for="reward-name">Reward name</label>
          <input id="reward-name" class="haptic-input" required>
          <label for="reward-cost">Cost in HBC points</label>
          <input id="reward-cost" class="haptic-input" type="number" min="1" required>
          <button class="island-cta" type="submit">Add reward</button>
        </form>
      </section>
    `);
  }

  if (role.isMerchant) {
    panels.push(`
      <section class="wallet-action">
        <h4>Store: issue points to a customer</h4>
        <form id="form-issue-points" class="haptic-form">
          <label for="issue-customer">Customer wallet address</label>
          <input id="issue-customer" class="haptic-input" required placeholder="0x…">
          <label for="issue-amount">Points to issue</label>
          <input id="issue-amount" class="haptic-input" type="number" min="1" required>
          <button class="island-cta" type="submit">Issue points</button>
        </form>
      </section>
    `);
  }

  if (role.isCustomer) {
    panels.push(`
      <section class="wallet-action">
        <h4>Customer: transfer points</h4>
        <form id="form-transfer-points" class="haptic-form">
          <label for="transfer-recipient">Recipient wallet address</label>
          <input id="transfer-recipient" class="haptic-input" required placeholder="0x…">
          <label for="transfer-amount">Points to transfer</label>
          <input id="transfer-amount" class="haptic-input" type="number" min="1" required>
          <button class="island-cta" type="submit">Transfer points</button>
        </form>
      </section>
    `);
  }

  operationsTitle.textContent = "HashBack actions";
  segmentedTabsContainer.replaceChildren();
  tabContentArea.innerHTML = panels.join("") || "<p>Connect a wallet to begin.</p>";

  bindForms();
}

function bindForms() {
  const authorizeForm = $("form-authorize-store");
  if (authorizeForm) {
    authorizeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await sendContractTransaction(() =>
          contract.methods.authorizeMerchant($("store-address").value.trim())
      );
    });
  }

  const addRewardForm = $("form-add-reward");
  if (addRewardForm) {
    addRewardForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const textId = $("reward-id").value.trim();
      const rewardId = web3.utils.padRight(
          web3.utils.asciiToHex(textId),
          64
      );
      const name = $("reward-name").value.trim();
      const cost = $("reward-cost").value;

      await sendContractTransaction(() =>
          contract.methods.addReward(rewardId, name, cost)
      );
    });
  }

  const issueForm = $("form-issue-points");
  if (issueForm) {
    issueForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const customer = $("issue-customer").value.trim();
      const amount = $("issue-amount").value;

      if (!web3.utils.isAddress(customer)) {
        showFeedback("error", "Enter a valid customer wallet address.");
        return;
      }

      await sendContractTransaction(() =>
          contract.methods.issuePoints(customer, amount)
      );
    });
  }

  const transferForm = $("form-transfer-points");
  if (transferForm) {
    transferForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const recipient = $("transfer-recipient").value.trim();
      const amount = $("transfer-amount").value;

      if (!web3.utils.isAddress(recipient)) {
        showFeedback("error", "Enter a valid recipient wallet address.");
        return;
      }

      await sendContractTransaction(() =>
          contract.methods.transferPoints(recipient, amount)
      );
    });
  }
}

async function sendContractTransaction(makeMethod, value = undefined) {
  try {
    const method = makeMethod();
    const options = { from: account };

    if (value !== undefined) options.value = value;

    const pending = method.send(options);

    pending.on("transactionHash", (hash) => {
      showFeedback("pending", "Transaction submitted; waiting for confirmation.", hash);
    });

    const receipt = await pending;
    showFeedback(
        "success",
        `Transaction confirmed in block ${receipt.blockNumber}.`,
        receipt.transactionHash
    );

    await refreshAll();
  } catch (error) {
    showFeedback("error", explainError(error));
  }
}

async function loadRewards() {
  if (!rewardsContainer) return;

  try {
    const count = Number(await contract.methods.getRewardCount().call());
    rewards = [];

    for (let i = 0; i < count; i++) {
      const id = await contract.methods.getRewardIdAt(i).call();
      const result = await contract.methods.getReward(id).call();

      const reward = {
        id: result.rewardId ?? result[0],
        name: result.name ?? result[1],
        cost: result.cost ?? result[2],
        active: result.active ?? result[3],
      };

      if (reward.active) rewards.push(reward);
    }

    renderRewards();
  } catch (error) {
    console.error("Could not load rewards:", error);
  }
}

function renderRewards() {
  if (!rewardsContainer) return;

  rewardsContainer.replaceChildren();

  if (!rewards.length) {
    rewardsContainer.innerHTML =
        '<p class="empty-plate">No active rewards in the catalog.</p>';
    return;
  }

  for (const reward of rewards) {
    const card = document.createElement("div");
    card.className = "vault-card";

    const info = document.createElement("div");
    info.className = "vault-info";

    const name = document.createElement("h4");
    name.textContent = reward.name;

    const cost = document.createElement("p");
    cost.textContent = `${reward.cost.toString()} HBC`;

    const button = document.createElement("button");
    button.className = "island-btn";
    button.type = "button";
    button.textContent = "Redeem";
    button.addEventListener("click", () => redeemReward(reward.id));

    info.append(name, cost);
    card.append(info, button);
    rewardsContainer.appendChild(card);
  }
}

async function redeemReward(rewardId) {
  try {
    const fee = await contract.methods.REDEMPTION_FEE().call();
    await sendContractTransaction(
        () => contract.methods.redeem(rewardId),
        fee
    );
  } catch (error) {
    showFeedback("error", explainError(error));
  }
}

async function loadVouchers() {
  if (!vouchersContainer || !role.isCustomer) return;

  try {
    const ids = await contract.methods
        .getRedemptionPage(account, 0, 50)
        .call();

    vouchersContainer.replaceChildren();

    if (!ids.length) {
      vouchersContainer.innerHTML =
          '<p class="empty-plate">No redemptions for this wallet yet.</p>';
      return;
    }

    for (const id of ids) {
      const result = await contract.methods.getRedemption(id).call();
      const redemption = {
        rewardId: result.rewardId ?? result[1],
        pointsSpent: result.pointsSpent ?? result[2],
        createdAt: result.createdAt ?? result[3],
        status: Number(result.status ?? result[4]),
      };

      const reward = rewards.find((item) => item.id === redemption.rewardId);
      const item = document.createElement("div");
      item.className = "voucher-plate";

      const description = document.createElement("div");
      description.textContent =
          `${reward?.name || "HashBack reward"} · ` +
          `${redemption.pointsSpent.toString()} HBC · ` +
          `${["Issued", "Fulfilled", "Cancelled"][redemption.status] || "Unknown"}`;

      item.appendChild(description);
      vouchersContainer.appendChild(item);
    }
  } catch (error) {
    console.error("Could not load vouchers:", error);
  }
}

async function loadEventHistory() {
  if (!timelineContainer) return;

  try {
    const currentBlock = Number(await web3.eth.getBlockNumber());
    const deploymentBlock = Number(config.deploymentBlock || 0);
    const fromBlock =
        deploymentBlock > 0
            ? deploymentBlock
            : Math.max(0, currentBlock - 5000);

    const events = await contract.getPastEvents("allEvents", {
      fromBlock,
      toBlock: "latest",
    });

    events.sort(
        (a, b) => Number(b.blockNumber) - Number(a.blockNumber)
    );

    timelineContainer.replaceChildren();

    if (blocksCountEl) blocksCountEl.textContent = String(events.length);

    if (!events.length) {
      timelineContainer.innerHTML =
          '<p class="empty-plate">No recent contract events.</p>';
      return;
    }

    for (const event of events.slice(0, 30)) {
      const card = document.createElement("div");
      card.className = "stream-card";

      const title = document.createElement("strong");
      title.textContent = event.event || "HashBack event";

      const tx = document.createElement("a");
      tx.href = `https://sepolia.etherscan.io/tx/${event.transactionHash}`;
      tx.target = "_blank";
      tx.rel = "noopener noreferrer";
      tx.textContent = shorten(event.transactionHash);

      const block = document.createElement("span");
      block.textContent = `Block ${event.blockNumber}`;

      card.append(title, document.createTextNode(" · "), tx,
          document.createTextNode(" · "), block);
      timelineContainer.appendChild(card);
    }
  } catch (error) {
    console.error("Could not load contract events:", error);
  }
}

const connectButton = $("btn-connect-wallet") || $("btn-reset-chain");

if (connectButton) {
  connectButton.textContent = "Connect MetaMask";
  connectButton.removeAttribute("title");
  connectButton.addEventListener("click", connectWallet);
}

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => window.location.reload());
  window.ethereum.on("chainChanged", () => window.location.reload());
}