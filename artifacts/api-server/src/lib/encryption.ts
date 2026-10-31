import CryptoJS from "crypto-js";

function requireSecret(): string {
  const value = process.env.ENCRYPTION_KEY ?? (process.env.NODE_ENV === "production" ? "" : "pactswap-dev-encryption-key-32ch");
  if (!value) throw new Error("ENCRYPTION_KEY must be set in production");
  return value;
}

const KEY: string = requireSecret();

export function encrypt(plaintext: string): string {
  return CryptoJS.AES.encrypt(plaintext, KEY).toString();
}

export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}
