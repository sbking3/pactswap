import { ethers } from "ethers";
import contractABI from "./contractABI.json";
import { connectWallet } from "./wallet-provider";

export const CONTRACT_ADDRESS = "0xCf9Fd90861085135f8661C29127A1F8F9ccA4061";
export const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
// Re-export so existing callers can import from either location
export { connectWallet, BSC_CHAIN_ID } from "./wallet-provider";

const USDT_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

/** Return a read-only contract instance (no wallet needed). */
export function getReadContract() {
  const provider = new ethers.JsonRpcProvider("https://bsc-dataseed1.binance.org/");
  return new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);
}

/** Return a signer-backed contract instance. */
async function getWriteContract() {
  const signer = await connectWallet();
  return new ethers.Contract(CONTRACT_ADDRESS, contractABI, signer);
}

// ─── USDT helpers ────────────────────────────────────────────────────────────

export async function getUsdtBalance(address: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider("https://bsc-dataseed1.binance.org/");
  const usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, provider);
  const decimals: number = await usdt.decimals();
  const raw: bigint = await usdt.balanceOf(address);
  return ethers.formatUnits(raw, decimals);
}

/**
 * Approve the escrow contract to spend EXACTLY `amountWei` USDT.
 * Uses precise amount so MetaMask shows "Spend X USDT" instead of "Unlimited".
 * Contract 0xCf9…4061 (verified on BSCScan) expects 6-decimal amounts.
 * Skips the tx if the existing allowance already covers the amount.
 */
async function approveUsdt(signer: ethers.JsonRpcSigner, amountWei: bigint): Promise<void> {
  const usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, signer);

  const owner = await signer.getAddress();
  const currentAllowance: bigint = await usdt.allowance(owner, CONTRACT_ADDRESS);
  if (currentAllowance >= amountWei) return; // exact amount already covered

  // Exact amount — MetaMask shows "Spend X USDT", not "Unlimited access"
  const tx = await usdt.approve(CONTRACT_ADDRESS, amountWei);
  await tx.wait();
}

// ─── Escrow actions ──────────────────────────────────────────────────────────

export interface CreateEscrowParams {
  /** bytes32 hex string (0x…) — use ethers.id(uuid) or keccak of order id */
  escrowId: string;
  sellerAddress: string;
  /** USDT amount as a human-readable string, e.g. "100" for 100 USDT */
  amountUsdt: string;
  /** Optional callback fired as each signing step begins, for UI progress updates */
  onStep?: (step: "approving" | "signing" | "verifying") => void;
}

/**
 * 1. Approves USDT allowance if needed (user signs in wallet).
 * 2. Calls createEscrow on the contract (user signs in wallet).
 * 3. Waits for on-chain confirmation.
 *
 * Server never touches this — user's wallet does ALL signing.
 * Returns the confirmed transaction hash.
 */
export async function createEscrow({ escrowId, sellerAddress, amountUsdt, onStep }: CreateEscrowParams): Promise<string> {
  const signer = await connectWallet();
  // Contract 0xCf9…4061 (verified on BSCScan) uses 6-decimal USDT amounts
  const amountWei = ethers.parseUnits(amountUsdt, 6);

  // Step 1 — ask user to approve USDT spend in their wallet
  onStep?.("approving");
  await approveUsdt(signer, amountWei);

  // Step 2 — ask user to sign the createEscrow transaction
  onStep?.("signing");
  const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, signer);
  const tx = await contract.createEscrow(escrowId, sellerAddress, amountWei);

  // Step 3 — wait for the block to be mined (1 confirmation)
  onStep?.("verifying");
  await tx.wait();

  return tx.hash as string;
}

/**
 * Seller calls this to confirm they received the fiat payment.
 * Emits SellerConfirmed on-chain.
 */
export async function confirmDelivery(escrowId: string): Promise<string> {
  const contract = await getWriteContract();
  const tx = await contract.confirmDelivery(escrowId);
  await tx.wait();
  return tx.hash as string;
}

/**
 * Arbiter/admin releases funds to the seller.
 */
export async function releaseEscrow(escrowId: string): Promise<string> {
  const contract = await getWriteContract();
  const tx = await contract.releaseEscrow(escrowId);
  await tx.wait();
  return tx.hash as string;
}

/**
 * Arbiter/admin refunds the buyer.
 */
export async function refundEscrow(escrowId: string): Promise<string> {
  const contract = await getWriteContract();
  const tx = await contract.refundEscrow(escrowId);
  await tx.wait();
  return tx.hash as string;
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

export interface EscrowData {
  buyer: string;
  seller: string;
  amount: bigint;
  createdAt: bigint;
  released: boolean;
  refunded: boolean;
  sellerConfirmed: boolean;
}

export async function readEscrow(escrowId: string): Promise<EscrowData> {
  const contract = getReadContract();
  const r = await contract.escrows(escrowId);
  return {
    buyer: r[0] as string,
    seller: r[1] as string,
    amount: r[2] as bigint,
    createdAt: r[3] as bigint,
    released: r[4] as boolean,
    refunded: r[5] as boolean,
    sellerConfirmed: r[6] as boolean,
  };
}
