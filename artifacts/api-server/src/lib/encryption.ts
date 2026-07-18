import CryptoJS from "crypto-js";

const KEY = process.env.ENCRYPTION_KEY ?? "pactswap-dev-encryption-key-32ch";

export function encrypt(plaintext: string): string {
  return CryptoJS.AES.encrypt(plaintext, KEY).toString();
}

export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}
