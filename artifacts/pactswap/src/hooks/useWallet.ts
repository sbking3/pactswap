/**
 * useWallet — reactive wallet state hook.
 *
 * Reads the already-connected accounts on mount and subscribes to
 * accountsChanged events so the rest of the UI stays in sync with MetaMask
 * without having to call connectWallet() just to read the address.
 *
 * connectWallet() here only calls eth_requestAccounts (the MetaMask popup).
 * It does NOT switch chains — that is handled separately inside contract.ts
 * when the user actually signs a transaction.
 */

import { useState, useEffect } from "react";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export function useWallet() {
  const [address, setAddress]       = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  /** Read already-authorised accounts silently (no popup). */
  const refreshAccounts = async () => {
    if (typeof window === "undefined" || !window.ethereum) return;
    try {
      const accounts: string[] = await window.ethereum.request({
        method: "eth_accounts",
      });
      if (accounts.length > 0) {
        setAddress(accounts[0].toLowerCase());
        setIsConnected(true);
      } else {
        setAddress(null);
        setIsConnected(false);
      }
    } catch {
      // eth_accounts can throw in some environments — silently ignore
    }
  };

  useEffect(() => {
    refreshAccounts();

    if (typeof window === "undefined" || !window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length > 0) {
        setAddress(accounts[0].toLowerCase());
        setIsConnected(true);
      } else {
        setAddress(null);
        setIsConnected(false);
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, []);

  /** Prompt MetaMask to request accounts (shows the connection popup). */
  const connectWallet = async () => {
    try {
      if (typeof window !== "undefined" && window.ethereum) {
        const accounts: string[] = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        if (accounts.length > 0) {
          setAddress(accounts[0].toLowerCase());
          setIsConnected(true);
        }
      }
    } catch (err) {
      console.error("[useWallet] connectWallet error:", err);
    }
  };

  return { address, isConnected, connectWallet };
}
