// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract HashBack {
    // [Recurso: StructsEEnums]
    enum RedemptionStatus { Issued, Fulfilled, Cancelled }

    struct Reward {
        bytes32 id;
        string name;
        uint256 cost;
        bool active;
    }

    struct Redemption {
        address customer;
        bytes32 rewardId;
        uint256 pointsSpent;
        uint256 createdAt;
        RedemptionStatus status;
    }

    struct MerchantStats {
        uint256 totalIssued;
        uint256 clientsServed;
    }

    // [Recurso: TiposDeDados]
    address public immutable owner;
    uint256 public constant REDEMPTION_FEE = 0.0001 ether;
    uint256 public constant MAX_PAGE_SIZE = 50;
    uint256 public collectedFees;

    // [Recurso: ArraysEMappings]
    mapping(address => uint256) public balances;
    mapping(address => bool) public authorizedMerchants;
    mapping(bytes32 => Reward) public rewards;
    mapping(address => MerchantStats) public merchantStats;
    mapping(address => mapping(address => bool)) private servedClient;
    mapping(address => uint256[]) private customerRedemptions;

    bytes32[] private rewardIds;
    Redemption[] private redemptions;

    // [Recurso: EventosEErros]
    event MerchantAuthorizationChanged(address indexed merchant, bool authorized);
    event PointsIssued(address indexed merchant, address indexed customer, uint256 amount);
    event PointsTransferred(address indexed from, address indexed to, uint256 amount);
    event RewardUpdated(bytes32 indexed rewardId, string name, uint256 cost, bool active);
    event RedemptionCreated(uint256 indexed redemptionId, address indexed customer, bytes32 rewardId);
    event RedemptionStatusChanged(uint256 indexed redemptionId, RedemptionStatus status);
    event PointsAdjusted(address indexed customer, int256 delta, address indexed admin);

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error InsufficientPoints(uint256 available, uint256 required);
    error RewardUnavailable(bytes32 rewardId);
    error IncorrectFee(uint256 expected, uint256 received);
    error InvalidRedemption();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyMerchant() {
        if (!authorizedMerchants[msg.sender]) revert Unauthorized();
        _;
    }

    modifier onlyCustomer() {
        if (!_isCustomer(msg.sender)) revert Unauthorized();
        _;
    }

    // [Recurso: Modificadores] Parameterized modifier for redemption-state checks
    modifier inRedemptionStatus(uint256 id, RedemptionStatus expected) {
        if (id >= redemptions.length) revert InvalidRedemption();
        require(redemptions[id].status == expected, "Unexpected redemption status");
        _;
    }

    constructor() {
        owner = msg.sender;

        _addReward(bytes32("REW-1"), "Cupom de R$ 20 OFF", 100);
        _addReward(bytes32("REW-2"), "Frete Gratis Nacional", 50);
        _addReward(bytes32("REW-3"), "Brinde Especial HashBack", 250);
        _addReward(bytes32("REW-4"), "Acesso VIP / Cashback em Dobro", 400);
    }

    /// @notice Owner authorizes a store to issue loyalty points.
    function authorizeMerchant(address merchant) external onlyOwner {
        if (!_validAddress(merchant)) revert InvalidAddress();
        authorizedMerchants[merchant] = true;
        emit MerchantAuthorizationChanged(merchant, true);
    }

    /// @notice Owner revokes a store's ability to issue points.
    function revokeMerchant(address merchant) external onlyOwner {
        if (!_validAddress(merchant)) revert InvalidAddress();
        authorizedMerchants[merchant] = false;
        emit MerchantAuthorizationChanged(merchant, false);
    }

    /// @notice Owner adds a reward to the catalog.
    function addReward(bytes32 id, string calldata name, uint256 cost)
        external
        onlyOwner
    {
        _addReward(id, name, cost);
    }

    /// @notice Owner enables or disables a reward.
    function setRewardActive(bytes32 id, bool active) external onlyOwner {
        if (rewards[id].id == bytes32(0)) revert RewardUnavailable(id);
        rewards[id].active = active;
        emit RewardUpdated(id, rewards[id].name, rewards[id].cost, active);
    }

    /// @notice Authorized store issues points to a customer.
    function issuePoints(address customer, uint256 amount)
        external
        onlyMerchant
    {
        if (!_isCustomer(customer)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        balances[customer] += amount;

        MerchantStats storage stats = merchantStats[msg.sender];
        stats.totalIssued += amount;
        if (!servedClient[msg.sender][customer]) {
            servedClient[msg.sender][customer] = true;
            stats.clientsServed++;
        }

        emit PointsIssued(msg.sender, customer, amount);
    }

    /// @notice Customer transfers points to another customer.
    function transferPoints(address recipient, uint256 amount)
        external
        onlyCustomer
    {
        if (!_isCustomer(recipient) || recipient == msg.sender) {
            revert InvalidAddress();
        }
        if (amount == 0) revert InvalidAmount();
        if (balances[msg.sender] < amount) {
            revert InsufficientPoints(balances[msg.sender], amount);
        }

        balances[msg.sender] -= amount;
        balances[recipient] += amount;
        emit PointsTransferred(msg.sender, recipient, amount);
    }

    /// @notice Customer redeems points and creates a voucher record.
    /// @dev Requires the exact SepoliaETH test fee.
    function redeem(bytes32 rewardId)
        external
        payable
        onlyCustomer
        returns (uint256 redemptionId)
    {
        Reward storage reward = rewards[rewardId];
        if (reward.id == bytes32(0) || !reward.active) {
            revert RewardUnavailable(rewardId);
        }
        if (msg.value != REDEMPTION_FEE) {
            revert IncorrectFee(REDEMPTION_FEE, msg.value);
        }
        if (balances[msg.sender] < reward.cost) {
            revert InsufficientPoints(balances[msg.sender], reward.cost);
        }

        // Effects: update state before emitting events or making external calls.
        balances[msg.sender] -= reward.cost;
        collectedFees += msg.value;

        redemptionId = redemptions.length;
        redemptions.push(Redemption({
            customer: msg.sender,
            rewardId: rewardId,
            pointsSpent: reward.cost,
            createdAt: block.timestamp,
            status: RedemptionStatus.Issued
        }));
        customerRedemptions[msg.sender].push(redemptionId);

        emit RedemptionCreated(redemptionId, msg.sender, rewardId);
    }

    /// @notice Owner marks an issued voucher fulfilled or cancelled.
    function setRedemptionStatus(uint256 id, RedemptionStatus newStatus)
        external
        onlyOwner
        inRedemptionStatus(id, RedemptionStatus.Issued)
    {
        require(
            newStatus == RedemptionStatus.Fulfilled ||
            newStatus == RedemptionStatus.Cancelled,
            "Invalid next status"
        );
        redemptions[id].status = newStatus;
        emit RedemptionStatusChanged(id, newStatus);
    }

    /// @notice Owner can correct a customer's balance with an auditable signed adjustment.
    /// @dev Optional rubric-driven feature; positive values add points, negative values remove them.
    function adjustPoints(address customer, int256 delta) external onlyOwner {
        if (!_isCustomer(customer)) revert InvalidAddress();
        require(delta != 0, "Adjustment cannot be zero");

        if (delta > 0) {
            balances[customer] += uint256(delta);
        } else {
            uint256 reduction = uint256(-(delta + 1)) + 1;
            if (balances[customer] < reduction) {
                revert InsufficientPoints(balances[customer], reduction);
            }
            balances[customer] -= reduction;
        }

        emit PointsAdjusted(customer, delta, msg.sender);
    }

    /// @notice Returns a customer's current points balance.
    function getBalance(address customer) public view returns (uint256) {
        return balances[customer];
    }

    /// @notice Returns a bounded page of a customer's redemption IDs.
    function getRedemptionPage(address customer, uint256 start, uint256 count)
        external
        view
        returns (uint256[] memory page)
    {
        require(count <= MAX_PAGE_SIZE, "Page too large");
        uint256[] storage ids = customerRedemptions[customer];
        if (start >= ids.length) return new uint256[](0);

        uint256 end = start + count;
        if (end > ids.length) end = ids.length;

        page = new uint256[](end - start);
        for (uint256 i = start; i < end; i++) {
            page[i - start] = ids[i];
        }
    }

    /// @notice Owner withdraws collected test fees.
    function withdrawFees(address payable destination) external onlyOwner {
        if (!_validAddress(destination)) revert InvalidAddress();

        uint256 amount = collectedFees;
        collectedFees = 0;

        (bool sent, ) = destination.call{value: amount}("");
        if (!sent) revert TransferFailed();
    }

    function _addReward(bytes32 id, string memory name, uint256 cost) private {
        require(id != bytes32(0), "Invalid reward ID");
        require(bytes(name).length > 0, "Reward name required");
        if (cost == 0) revert InvalidAmount();
        if (rewards[id].id != bytes32(0)) revert RewardUnavailable(id);

        rewards[id] = Reward(id, name, cost, true);
        rewardIds.push(id);
        emit RewardUpdated(id, name, cost, true);
    }

    function _isCustomer(address account) internal view returns (bool) {
        return account != address(0) && !authorizedMerchants[account];
    }

    function _validAddress(address account) private pure returns (bool) {
        return account != address(0);
    }
}