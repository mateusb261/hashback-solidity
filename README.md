# HashBack DApp

Aplicação descentralizada (dApp) de programa de fidelidade e cashback na rede **Ethereum Sepolia**, composta por um contrato inteligente em Solidity (`backend/contract.sol`) e um frontend web em HTML, CSS, JavaScript puros e **Web3.js 4.x** conectado à **MetaMask**.

## Integrantes e papéis

| Integrante | Papel | Responsabilidades |
|---|---|---|
| Cibele Batista | Desenvolvimento do frontend e documentação | Desenvolver a interface e organizar a documentação do projeto. |
| Marcelo Lira | QA e resolução de bugs | Testar os fluxos da aplicação, identificar problemas e apoiar a correção de bugs. |
| Mateus Bastos | Desenvolvimento do contrato e integração Web3 | Desenvolver as regras do contrato em Solidity e integrar o frontend com MetaMask, Web3.js e Sepolia. |


---

## 1. Tema, Problema e Por que Blockchain?

- **Problema nos programas tradicionais:**
  - **Falta de transparência e auditoria:** pontos podem expirar ou sumir sem rastreabilidade pública.
  - **Gasto duplo (*Double Spending*):** risco de reutilizar o mesmo voucher ou saldo em canais concorrentes.
  - **Centralização:** parceiros dependem de conciliações lentas em bancos de dados isolados.
- **Por que Blockchain resolve:**
  - **Ledger imutável:** todas as emissões, transferências e resgates ficam registrados publicamente na rede Sepolia.
  - **Execução determinística:** o contrato valida `saldo >= valor` de forma atômica, impedindo gasto duplo.
  - **Assinatura digital (ECDSA):** apenas o titular da carteira autoriza movimentações pela MetaMask.

---

## 2. Dados do Deploy e Acesso

| Item | Informação |
|---|---|
| **Rede** | Ethereum Sepolia Testnet (Chain ID `11155111` / `0xaa36a7`) |
| **Endereço do contrato** | `0xc423cf72710e48e98d4bC9EF0e3cac80DE41e28a` |
| **Sepolia Etherscan** | https://sepolia.etherscan.io/address/0xc423cf72710e48e98d4bC9EF0e3cac80DE41e28a |
| **Aplicação na Vercel** | [HashBack DApp](https://hashback-solidity-ncngvstsd-hashback.vercel.app/) |
| **Vídeo de demonstração** | [Assistir no Google Drive](https://drive.google.com/file/d/1sMbV9ogKzpv7fEfPa0y5bSrUCvlkl2ul/view?usp=sharing) |

---

## 3. O que fica On-Chain vs. Off-Chain

| Dado / Componente | Onde fica? | Motivo |
|---|---|---|
| **Saldos de pontos (`balances`)** | **On-Chain (Contrato)** | Garantia determinística contra gasto duplo. |
| **Lojistas autorizados (`authorizedMerchants`)** | **On-Chain (Contrato)** | Controle de acesso auditável para emissão de pontos. |
| **Catálogo e Vouchers (`rewards`, `redemptions`)** | **On-Chain (Contrato)** | Controle de disponibilidade e máquina de estados (`Issued` → `Fulfilled`/`Cancelled`). |
| **Eventos (`PointsIssued`, `RedemptionCreated`, etc.)** | **On-Chain (Logs)** | Histórico imutável consultado via `getPastEvents` e Etherscan. |
| **Interface Web (`frontend/`)** | **Off-Chain (Vercel)** | HTML, CSS, JS e ABI servidos estaticamente via HTTPS. |

---

## 4. Funções do Contrato (`backend/contract.sol`)

### Funções de Escrita (Transações)

| Função | Quem pode chamar | O que faz | Eventos / Erros principais |
|---|---|---|---|
| `authorizeMerchant(merchant)` | `onlyOwner` | Autoriza uma loja a emitir pontos. | `MerchantAuthorizationChanged` / `Unauthorized`, `InvalidAddress` |
| `revokeMerchant(merchant)` | `onlyOwner` | Revoga a autorização de uma loja. | `MerchantAuthorizationChanged` / `Unauthorized`, `InvalidAddress` |
| `addReward(id, name, cost)` | `onlyOwner` | Adiciona uma nova recompensa ao catálogo. | `RewardUpdated` / `Unauthorized`, `InvalidAmount`, `RewardUnavailable` |
| `setRewardActive(id, active)` | `onlyOwner` | Ativa ou desativa uma recompensa existente. | `RewardUpdated` / `Unauthorized`, `RewardUnavailable` |
| `issuePoints(customer, amount)` | `onlyMerchant` | Emite pontos para um cliente e atualiza estatísticas da loja. | `PointsIssued` / `Unauthorized`, `InvalidAddress`, `InvalidAmount` |
| `transferPoints(recipient, amount)` | `onlyCustomer` | Transfere pontos entre clientes. | `PointsTransferred` / `Unauthorized`, `InvalidAddress`, `InvalidAmount`, `InsufficientPoints` |
| `redeem(rewardId)` *(payable)* | `onlyCustomer` | Resgata uma recompensa pagando `REDEMPTION_FEE` (`0.0001 ether`) e cria um voucher `Issued`. | `RedemptionCreated` / `RewardUnavailable`, `IncorrectFee`, `InsufficientPoints` |
| `setRedemptionStatus(id, newStatus)` | `onlyOwner` | Marca um voucher `Issued` como `Fulfilled` ou `Cancelled`. | `RedemptionStatusChanged` / `Unauthorized`, `InvalidRedemption` |
| `adjustPoints(customer, delta)` | `onlyOwner` | Ajusta o saldo de um cliente (positivo ou negativo). | `PointsAdjusted` / `Unauthorized`, `InvalidAddress`, `InsufficientPoints` |
| `withdrawFees(destination)` | `onlyOwner` | Transfere as taxas em ETH coletadas para `destination` (padrão CEI). | `Unauthorized`, `InvalidAddress`, `TransferFailed` |

### Funções de Leitura (`view`)

- `getBalance(customer)`: retorna o saldo de pontos de um cliente.
- `getRewardCount()`, `getRewardIdAt(index)`, `getReward(id)`: consultam o catálogo de recompensas.
- `getRedemptionPage(customer, start, count)`: retorna página limitada (`MAX_PAGE_SIZE = 50`) de IDs de resgate do cliente.
- `getRedemption(id)`: retorna os detalhes e o status de um resgate específico.

---

## 5. Tabela de Recursos Obrigatórios (Solidity)

| Grupo | Onde aparece em `backend/contract.sol` | Por que foi usado |
|---|---|---|
| **TiposDeDados** | `owner` (`address immutable`, L29), `REDEMPTION_FEE` e `MAX_PAGE_SIZE` (`uint256 constant`, L30–31), `int256 delta` (L214), `bytes32`, `string`, `bool` | `immutable` e `constant` reduzem custo de gas; `int256` permite ajustes positivos e negativos de pontos. |
| **Funcoes** | `constructor` (L85), `external` (`redeem`, `issuePoints`), `public view` (`getBalance`, L232), `internal view` (`_isCustomer`, L317), `private` (`_addReward`, L306), `private pure` (`_validAddress`, L321), `payable` (`redeem`, L163) | Separa a interface externa dos helpers internos/privados e permite receber a taxa em ETH no resgate. |
| **EstruturasDeControle** | `if/else` (`adjustPoints`, L218–226), laço `for` limitado por `MAX_PAGE_SIZE = 50` (`getRedemptionPage`, L250–252), `require` (L81, L203, L216, L242, L307–308) | Previne *out-of-gas* com paginação limitada e valida pré-condições de negócio. |
| **ArraysEMappings** | Arrays dinâmicos `rewardIds`, `redemptions` (L42–43); mappings `balances`, `authorizedMerchants`, `rewards`, `merchantStats` (L35–38); mapping aninhado `servedClient[merchant][customer]` (L39) | Acesso O(1) a saldos/recompensas e contagem única de clientes atendidos por lojista. |
| **StructsEEnums** | `enum RedemptionStatus { Issued, Fulfilled, Cancelled }` (L6); `struct Reward`, `struct Redemption` (5 campos) e `struct MerchantStats` (L8–26) | Modela de forma clara o ciclo de vida dos vouchers, catálogo e métricas. |
| **Modificadores** | `onlyOwner`, `onlyMerchant`, `onlyCustomer` e parametrizado `inRedemptionStatus(uint256 id, RedemptionStatus expected)` (L63–83) | Centraliza controle de acesso por papel e garante transições válidas de estado. |
| **EventosEErros** | 7 eventos com `indexed` (L46–52, ex.: `PointsIssued`, `RedemptionCreated`) e 8 custom errors (L54–61, ex.: `InsufficientPoints`, `IncorrectFee`, `RewardUnavailable`) | Facilita auditoria na timeline/Etherscan e reduz gas em falhas comparado a strings longas. |

---

## 6. Como Executar e Configurar a MetaMask

### Acesso Online (Vercel)
Acesse diretamente: [HashBack DApp](https://hashback-solidity-l0sy1w2nx-hashback.vercel.app/)

### Executar o Frontend Localmente
Na raiz do projeto, execute:

```bash
python run.py
```

Depois, abra no navegador o endereço local exibido no terminal.

### Configurar a MetaMask na Sepolia
1. Instale a extensão **MetaMask** no navegador.
2. Ative a exibição de redes de teste (*Show test networks*) nas configurações da MetaMask e selecione **Sepolia** (Chain ID `11155111`).
3. Caso esteja em outra rede, a própria dApp exibirá o aviso e solicitará a troca automática (`wallet_switchEthereumChain`).
4. Obtenha **SepoliaETH** gratuito em um faucet da Sepolia para pagar gas e a taxa de resgate (`0.0001 ETH`).

---

## 7. Roteiro de Teste (Fluxo Principal)

1. **Conectar carteira:** clique em conectar na interface e aprove a conexão na MetaMask (rede Sepolia).
2. **Leitura de dados:** confira o endereço conectado, saldo em ETH, papel da conta, catálogo de recompensas e histórico de eventos.
3. **Emissão de pontos (Lojista):** com uma conta autorizada pelo `owner` (`authorizeMerchant`), emita pontos para a carteira de um cliente (`issuePoints`).
4. **Resgate com ETH (Cliente):** com a conta do cliente, selecione uma recompensa e confirme `redeem()`, enviando `0.0001 ETH` + gas.
5. **Acompanhar transação e evento:** observe o status `PENDENTE → CONFIRMADO`, o link para o **Sepolia Etherscan** e o novo evento na timeline.
6. **Testar erro tratado:** tente resgatar sem saldo suficiente de pontos ou rejeite a transação na MetaMask para validar a mensagem amigável de erro na UI.

---

## 8. Limitações Conhecidas e Melhorias Futuras

- **Limitações atuais:**
  - Cancelar um voucher (`Cancelled`) altera apenas o status para auditoria, sem estorno automático dos pontos ao cliente.
  - O catálogo de recompensas é global e gerenciado exclusivamente pelo `owner`.
  - A timeline carrega eventos via `getPastEvents` diretamente do nó RPC, o que pode ficar mais lento conforme o histórico cresce.
- **Melhorias futuras:**
  - Reembolso automático de pontos em cancelamentos de resgate.
  - Catálogo segmentado por lojista parceiro.
  - Indexação off-chain (ex.: *The Graph*) para consultas históricas em escala.

---

## 9. Declaração de Uso de Ferramentas de IA

O **ChatGPT (OpenAI)** foi utilizado como ferramenta de apoio durante o desenvolvimento do HashBack DApp para:

- esclarecer conceitos relacionados a Solidity, Web3.js, MetaMask e à rede Sepolia;
- analisar trechos do contrato inteligente e do frontend, ajudando a interpretar erros e o fluxo de interação com a carteira;
- apoiar a organização e a revisão da documentação deste README.

As sugestões da ferramenta foram avaliadas pela equipe, que permanece responsável pelas decisões de implementação e pelo conteúdo final do projeto.