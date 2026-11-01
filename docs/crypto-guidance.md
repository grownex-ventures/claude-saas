# Architectural Guidance: Cryptocurrency Payments (Future Scope)

> **Status:** Future Architecture / Out of Scope for Phase 1–7.
> **Context:** Architectural audit recommendations for future Web3 / crypto payment gateway integrations.

When implementing direct cryptocurrency payment processing (e.g., USDT/USDC on TRON TRC-20, Ethereum ERC-20, or Solana) for subscription renewals and balance top-ups, follow these core security and reliability principles:

---

### 1. Unique Transaction Hash Enforcement
- **Database Invariant:** Maintain a strict `@@unique([txHash, network])` constraint on all crypto transaction ledger records in Prisma/Postgres.
- **Idempotency:** Never credit tenant balance or extend subscription without an atomic transaction insertion that guarantees duplicate webhook or polling events cannot double-spend.

### 2. Confirmation Depth Verification
- **Reorg Protection:** Do not mark transactions `CONFIRMED` on immediate block receipt.
- **Required Confirmations:**
  - **Ethereum / EVM L1:** Minimum 12 block confirmations (~2.5 minutes).
  - **TRON (TRC-20):** Minimum 19–27 block confirmations (or wait for `confirmed: true` solidity node state).
  - **Arbitrum / Optimism / Polygon L2:** Require L1 batch finality or minimum 64 sequencer confirmations.
- **State Machine:** Transition payments through `PENDING` → `CONFIRMING` → `CONFIRMED` → `CREDITED`.

### 3. Safe Integer / Decimal Arithmetic
- **No Floating-Point Math:** Never use JavaScript standard IEEE-754 floats (`0.1 + 0.2 !== 0.3`) for financial calculations.
- **Fixed-Point / BigInt:**
  - Store token amounts in the database as `Decimal(36, 18)` or as base integer atomic units (wei / sun / satoshis) using `BigInt`.
  - Perform conversions using battle-tested libraries such as `bignumber.js` or `ethers.formatUnits` / `parseUnits`.
  - Reject negative values, null bytes, or scientific notation strings in input validation schemas.

### 4. Cold Storage & Sweeping Architecture
- **Deposit Addresses:** Generate deterministic HD wallet addresses (`bip32` / `bip44`) per tenant or invoice.
- **Automated Sweeps:** Sweep funds into multi-signature cold storage vaults (e.g., Gnosis Safe, Fireblocks) with strict gas thresholds and daily velocity limits.
