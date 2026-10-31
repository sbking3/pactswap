import jwt from "jsonwebtoken";
import { ethers } from "ethers";

function requireSecret(): string {
  const value = process.env.SESSION_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "pactswap-dev-secret");
  if (!value) throw new Error("SESSION_SECRET must be set in production");
  return value;
}

const JWT_SECRET: string = requireSecret();

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
