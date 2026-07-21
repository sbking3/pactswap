/**
 * useWallet — reactive wallet state hook.
 *
 * Reads already-connected accounts on mount and subscribes to
 * accountsChanged events so the UI stays in sync without calling
 * connectWallet() just to read the address.
 *
 * connectWallet() routes through wallet-provider.ts so it gets:
 *   - BSC chain switch / add
 *   - WalletConnect fallback
 *   - isConnecting guard (no double popups, no RPC spam)
 *   - mobile-without-wallet detection → sets showWalletGuide=true
 *     so any consumer can open the deep-link modal
 */

import { useState, useEffect } from "react";
import {
  connectWallet as providerConnect,
  isMobileWithoutWallet,
} from "@/lib/wallet-provider";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export function useWallet() {
  const [address, setAddress]             = useState<string | null>(null);
  const [isConnected, setIsConnected]     = useState(false);
  const [isConnecting, setIsConnecting]   = useState(false);
  const [showWalletGuide, setShowWalletGuide] = useState(false);

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

  /**
   * Prompt the user to connect their wallet.
   *
   * - Desktop / in-app browser: opens MetaMask popup, switches to BSC.
   * - Mobile without injected wallet: sets showWalletGuide=true so the
   *   consumer can render <WalletGuideModal> with deep links.
   * - Protected against double-clicks via the guard in wallet-provider.ts.
   */
  const connectWallet = async () => {
    if (isConnecting) return; // local guard for button state

    // Mobile with no injected wallet → show deep-link guide, don't hang
    if (isMobileWithoutWallet()) {
      setShowWalletGuide(true);
      return;
    }

    setIsConnecting(true);
    try {
      const signer = await providerConnect();
      const addr = await signer.getAddress();
      setAddress(addr.toLowerCase());
      setIsConnected(true);
    } catch (err: any) {
      // Typed error from wallet-provider when mobile + no WC project ID
      if (err?.code === "MOBILE_NO_WALLET") {
        setShowWalletGuide(true);
        return;
      }
      console.error("[useWallet] connectWallet error:", err);
    } finally {
      setIsConnecting(false);
    }
  };

  return {
    address,
    isConnected,
    isConnecting,
    showWalletGuide,
    setShowWalletGuide,
    connectWallet,
  };
}
