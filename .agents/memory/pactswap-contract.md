---
name: PactSwap contract addresses
description: Active and retired BSC Mainnet contract addresses for PactSwap escrow
---

## Active contract (v3)

**Address:** `0x3FE1bAbd4aC5bB5107767d913e6d4A2b63D4385d`
- Arbiter / feeRecipient: `0xF71C8E88aA5e433603FB76afCea62D02b9751338`
- FEE_BPS: 250 (2.5%), AUTO_RELEASE_TIME: 604800s (7 days)
- Added: `lockEscrowBySeller(bytes32 escrowId, address buyer, uint256 amount)` — seller locks USDT for buyer-initiated orders

**Why:**
- v2 fixed arbiter-only releaseEscrow (added seller permission)
- v3 adds `lockEscrowBySeller` so sellers can lock USDT when the buyer initiated the trade (no on-chain escrow exists yet)

**How to apply:** CONTRACT_ADDRESS must be updated in BOTH:
- `artifacts/pactswap/src/lib/contract.ts`
- `artifacts/api-server/src/lib/contract.ts`

## Retired addresses — NEVER USE

- `0xCf9Fd90861085135f8661C29127A1F8F9ccA4061` — v1, arbiter-only releaseEscrow
- `0x8aAcD32511ef4902939541b5E9EFb6Ff6cae7AFF` — v2, missing lockEscrowBySeller

## Trade flow (v3)

### Buyer-initiated (current default)
1. Buyer clicks Buy → `POST /api/orders/initiate` → order created, status=0, contractTx=null
2. **Seller** sees "Lock X USDT in Escrow" button → signs two wallet txs (approve USDT + lockEscrowBySeller)
3. TX hash shown immediately; server verifies on-chain via `PATCH /api/orders/:id/lock` → saves contractTx
4. Buyer sees "I Have Paid" button (only shown after contractTx is set) → sends NGN fiat → status=1
5. Seller confirms NGN receipt → signs releaseEscrow() → USDT goes to buyer → `PATCH /api/orders/:id/confirm` → status=2

### releaseEscrow sends USDT to e.buyer (whoever called lockEscrowBySeller's _buyer param)
