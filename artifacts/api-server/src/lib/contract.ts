import { ethers } from "ethers";
import { logger } from "./logger";

export const CONTRACT_ADDRESS = "0xCf9Fd90861085135f8661C29127A1F8F9ccA4061";
export const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const BSC_RPC = "https://bsc-dataseed1.binance.org/";

const ABI = [
  // Write
  "function createEscrow(bytes32 _escrowId, address _seller, uint256 _amount) external",
  "function confirmDelivery(bytes32 _escrowId) external",
  "function releaseEscrow(bytes32 _escrowId) external",
  "function refundEscrow(bytes32 _escrowId) external",
  "function processExpiredEscrows() external",
  // Read
  "function escrows(bytes32) external view returns (address buyer, address seller, uint256 amount, uint256 createdAt, bool released, bool refunded, bool sellerConfirmed)",
  "function getActiveEscrowCount() external view returns (uint256)",
  "function activeEscrowIds(uint256) external view returns (bytes32)",
  "function arbiter() external view returns (address)",
  "function feeRecipient() external view returns (address)",
  "function FEE_BPS() external view returns (uint256)",
  "function AUTO_RELEASE_TIME() external view returns (uint256)",
  // Events
  "event EscrowCreated(bytes32 indexed escrowId, address indexed buyer, address indexed seller, uint256 amount)",
  "event EscrowReleased(bytes32 indexed escrowId, address to, uint256 sellerAmount, uint256 feeAmount)",
  "event EscrowRefunded(bytes32 indexed escrowId, address to, uint256 amount)",
  "event SellerConfirmed(bytes32 indexed escrowId)",
];

function getProvider() {
  return new ethers.JsonRpcProvider(BSC_RPC);
}

function getSigner() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not configured");
  return new ethers.Wallet(privateKey, getProvider());
}

export function getContract(signed = false) {
  const runner = signed ? getSigner() : getProvider();
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, runner);
}

export async function releaseEscrow(escrowId: string): Promise<string | null> {
  try {
    const contract = getContract(true);
    const tx = await contract.releaseEscrow(escrowId);
    await tx.wait();
    logger.info({ txHash: tx.hash, escrowId }, "releaseEscrow executed");
    return tx.hash as string;
  } catch (err) {
    logger.error({ err, escrowId }, "releaseEscrow failed");
    return null;
  }
}

export async function refundEscrow(escrowId: string): Promise<string | null> {
  try {
    const contract = getContract(true);
    const tx = await contract.refundEscrow(escrowId);
    await tx.wait();
    logger.info({ txHash: tx.hash, escrowId }, "refundEscrow executed");
    return tx.hash as string;
  } catch (err) {
    logger.error({ err, escrowId }, "refundEscrow failed");
    return null;
  }
}

export async function processExpiredEscrows(): Promise<string | null> {
  try {
    const contract = getContract(true);
    const tx = await contract.processExpiredEscrows();
    await tx.wait();
    logger.info({ txHash: tx.hash }, "processExpiredEscrows executed");
    return tx.hash as string;
  } catch (err) {
    logger.error({ err }, "processExpiredEscrows failed");
    return null;
  }
}

export async function readEscrow(escrowId: string) {
  const contract = getContract();
  const result = await contract.escrows(escrowId);
  return {
    buyer: result[0] as string,
    seller: result[1] as string,
    amount: result[2] as bigint,
    createdAt: result[3] as bigint,
    released: result[4] as boolean,
    refunded: result[5] as boolean,
    sellerConfirmed: result[6] as boolean,
  };
}
