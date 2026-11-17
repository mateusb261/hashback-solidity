# Demonstração e Apresentação do HashBack DApp

## 1. Justificativa do Problema e Uso de Blockchain
- **Problema Real dos Programas Tradicionais:**
  - **Falta de transparência e auditoria:** Pontos podem expirar ou sumir sem rastreabilidade.
  - **Gasto Duplo (Double Spending):** Risco de usar o mesmo voucher ou pontuação em dois canais concorrentes.
  - **Centralização:** Parceiros comerciais dependem de conciliações lentas e bancos de dados relacionais centralizados vulneráveis.
- **Por que Blockchain resolve:**
  - **Ledger Imutável:** Blocos encadeados por SHA-256 e timestamps imutáveis.
  - **Contrato Inteligente:** Execução determinística de regras de negócio. Impede gasto duplo atômico (`saldo < valor = rejeição`).
  - **Criptografia Asimétrica:** Assinaturas digitais ECDSA secp256k1 para garantir que apenas o legítimo proprietário autoriza a movimentação.

---

## Integrantes e papéis

| Integrante | Papel | Responsabilidades |
|---|---|---|
| Nome1| Desenvolvimento do contrato | Implementação e documentação das regras em Solidity. |
| Nome2| Desenvolvimento do frontend | Interface em HTML/CSS e apresentação dos dados. |
| Nome3 | Integração Web3 | Conexão com MetaMask, Sepolia e chamadas ao contrato. |


## Endereço do contrato na Sepolia

| Rede | Chain ID | Endereço do contrato | Etherscan |
|---|---:|---|---|
| Sepolia | `11155111` | `0xc423cf72710e48e98d4bC9EF0e3cac80DE41e28a` | https://sepolia.etherscan.io/address/0xc423cf72710e48e98d4bC9EF0e3cac80DE41e28a |


## 2. O que fica na Blockchain vs. O que fica fora
| Dado | Onde fica? | Motivo |
| :--- | :--- | :--- |
| **Índice do Bloco & Timestamp** | **Na Blockchain** | Garantia cronológica imutável. |
| **Hash Anterior & Hash Atual** | **Na Blockchain** | Encadeamento e integridade criptográfica. |
| **Transações (MINT, TRANSFER, REDEEM)** | **Na Blockchain** | Histórico imutável de todas as ações assinadas. |
| **Assinatura Digital ECDSA & Nonce** | **Na Blockchain** | Comprovação de autoria e prevenção contra replay attack. |
| **Saldos Atuais dos Clientes** | **World State (Contrato)** | Calculados deterministicamente pela soma/subtração dos blocos. |
| **Vouchers Ativos e Catálogo** | **World State (Contrato)** | Controle de status e regras de queima de tokens. |

---

## Acesso e execução

### Aplicação publicada na Vercel

[HashBack DApp](https://hashback-solidity-l0sy1w2nx-hashback.vercel.app/)

### Executar o frontend localmente

Na raiz do projeto, execute:

```bash
python run.py