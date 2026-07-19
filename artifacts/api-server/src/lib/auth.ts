import jwt from "jsonwebtoken";
import { ethers } from "ethers";

const JWT_SECRET = process.env.SESSION_SECRET ?? "pactswap-dev-secret";

export interface JwtPayload {
  userId: string;
  walletAddress: string;
  /** Checksummed wallet address — alias for walletAddress, required by order endpoints */
  address: string;
  /** Chain ID (56 = BSC Mainnet) */
  chainId: number;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

/** Verify an EIP-191 personal_sign signature */
export function verifySiweSignature(message: string, signature: string, expectedAddress: string): boolean {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}
