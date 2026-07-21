import { ethers } from "ethers";
import { logger } from "./logger";

export const CONTRACT_ADDRESS = "0x8aAcD32511ef4902939541b5E9EFb6Ff6cae7AFF";
export const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const BSC_RPC = "https://bsc-dataseed1.binance.org/";

const ABI = [
  // Read-only
  "function escrows(bytes32) external view returns (address buyer, address seller, uint256 amount, uint256 createdAt, bool released, bool refunded, bool sellerConfirmed)",
  "function getActiveEscrowCount() external view returns (uint256)",
  "function activeEscrowIds(uint256) external view returns (bytes32)",
  "function arbiter() external view returns (address)",
  "function feeRecipient() external view returns (address)",
  "function FEE_BPS() external view returns (uint256)",
  "function AUTO_RELEASE_TIME() external view returns (uint256)",
  // Events (read-only)
  "event EscrowCreated(bytes32 indexed escrowId, address indexed buyer, address indexed seller, uint256 amount)",
  "event EscrowReleased(bytes32 indexed escrowId, address to, uint256 sellerAmount, uint256 feeAmount)",
  "event EscrowRefunded(bytes32 indexed escrowId, address to, uint256 amount)",
  "event SellerConfirmed(bytes32 indexed escrowId)",
];

// ── Provider (read-only, no private key needed) ───────────────────────────────

function getProvider() {
  return new ethers.JsonRpcProvider(BSC_RPC);
}

/** Read-only contract instance. Server never signs anything. */
export function getContract() {
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, getProvider());
}

// ── On-chain read helpers ─────────────────────────────────────────────────────

export async function readEscrow(escrowId: string) {
  const contract = getContract();
  const result = await contract.escrows(escrowId);
  return {
    buyer:           result[0] as string,
    seller:          result[1] as string,
    amount:          result[2] as bigint,
    createdAt:       result[3] as bigint,
    released:        result[4] as boolean,
    refunded:        result[5] as boolean,
    sellerConfirmed: result[6] as boolean,
  };
}

/**
 * Verify that a transaction hash is confirmed on BSC.
 * Returns { confirmed: true } when status === 1 (success).
 * Does NOT require any private key.
 */
export async function verifyTxHash(
  txHash: string,
): Promise<{ confirmed: boolean; blockNumber: number | null }> {
  try {
    const provider = getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return { confirmed: false, blockNumber: null };
    }
    return {
      confirmed: receipt.status === 1,
      blockNumber: receipt.blockNumber,
    };
  } catch (err) {
    logger.error({ err, txHash }, "verifyTxHash RPC error");
    return { confirmed: false, blockNumber: null };
  }
}
