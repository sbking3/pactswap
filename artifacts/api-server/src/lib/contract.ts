import { ethers } from "ethers";
import { logger } from "./logger";

const CONTRACT_ADDRESS = "0x68D48B7559875261972240DeF7d0393042EFd422";
const BSC_RPC = "https://bsc-dataseed1.binance.org/";

const ABI = [
  "function createEscrow(bytes32 escrowId, address buyer, uint256 amount) external",
  "function releaseEscrow(bytes32 escrowId) external",
  "function refundEscrow(bytes32 escrowId) external",
  "function disputeEscrow(bytes32 escrowId) external",
  "function processExpiredEscrows() external",
  "function escrows(bytes32) external view returns (address seller, address buyer, uint256 amount, uint256 createdAt, uint8 status)",
  "event EscrowCreated(bytes32 indexed escrowId, address indexed seller, address indexed buyer, uint256 amount)",
  "event EscrowReleased(bytes32 indexed escrowId)",
  "event EscrowRefunded(bytes32 indexed escrowId)",
  "event EscrowDisputed(bytes32 indexed escrowId)",
];

function getProvider() {
  return new ethers.JsonRpcProvider(BSC_RPC);
}

function getSigner() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY not configured");
  }
  return new ethers.Wallet(privateKey, getProvider());
}

export function getContract(signed = false) {
  const runner = signed ? getSigner() : getProvider();
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, runner);
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
