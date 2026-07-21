---
name: PactSwap contract addresses
description: Live BSC Mainnet escrow contract addresses and key parameters
---

## Current contract (v2) — use this
- Address: `0x8aAcD32511ef4902939541b5E9EFb6Ff6cae7AFF`
- Arbiter / feeRecipient: `0xF71C8E88aA5e433603FB76afCea62D02b9751338`
- FEE_BPS: 250 (2.5%), AUTO_RELEASE_TIME: 604800s (7 days)
- Key fix: `releaseEscrow` allows `msg.sender == seller OR arbiter` (was arbiter-only)
- USDT goes to `e.buyer` on release (the address that called `createEscrow`)

## Old contract (v1) — do NOT use
- Address: `0xCf9Fd90861085135f8661C29127A1F8F9ccA4061`
- `releaseEscrow` was arbiter-only → sellers got "Only arbiter" revert

**Why:** v1 had arbiter-only releaseEscrow; v2 adds seller permission so the Confirm & Release USDT button works without arbiter intervention.

**How to apply:** Any future contract redeployment should use the `contracts/` Hardhat workspace. After deploy, update `CONTRACT_ADDRESS` in both `artifacts/pactswap/src/lib/contract.ts` and `artifacts/api-server/src/lib/contract.ts`.
