/**
 * wallet-provider.ts
 *
 * Single source of truth for the wallet connection.
 * - Desktop with MetaMask installed → uses window.ethereum directly
 * - Mobile / no extension → opens WalletConnect QR/deep-link modal
 *
 * Every escrow function in contract.ts goes through connectWallet() here,
 * so the rest of the app is 100% agnostic to which wallet the user chose.
 */

import { ethers } from "ethers";
import EthereumProvider from "@walletconnect/ethereum-provider";

export const BSC_CHAIN_ID = 56;
const BSC_RPC = "https://bsc-dataseed1.binance.org/";

/** True when running on a mobile browser without an injected wallet */
export function isMobileWithoutWallet(): boolean {
  if (typeof window === "undefined") return false;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return mobile && !window.ethereum;
}

// Singleton WalletConnect provider (re-used across calls)
let _wcProvider: InstanceType<typeof EthereumProvider> | null = null;

// The currently active EIP-1193 provider (MetaMask OR WalletConnect)
let _activeEip1193: any = null;

// ─── Provider resolution ─────────────────────────────────────────────────────

/**
 * Returns an EIP-1193 provider:
 *   - window.ethereum (MetaMask / injected) if present
 *   - WalletConnect v2 modal otherwise (Trust Wallet, MetaMask Mobile, etc.)
 */
export async function getEip1193Provider(): Promise<any> {
  // Prefer injected wallet (MetaMask desktop)
  if (window.ethereum) {
    _activeEip1193 = window.ethereum;
    return window.ethereum;
  }

  // No injected wallet — WalletConnect
  const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;
  if (!projectId) {
    throw new Error(
      "No wallet extension found and WalletConnect is not configured.\n" +
      "Please install MetaMask or set VITE_WALLETCONNECT_PROJECT_ID."
    );
  }

  if (!_wcProvider) {
    _wcProvider = await EthereumProvider.init({
      projectId,
      chains: [BSC_CHAIN_ID],
      rpcMap: { [BSC_CHAIN_ID]: BSC_RPC },
      showQrModal: true,
      metadata: {
        name: "PACTSWAP",
        description: "P2P USDT escrow trading on Binance Smart Chain",
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.ico`],
      },
    });
  }

  await _wcProvider.connect();
  _activeEip1193 = _wcProvider;
  return _wcProvider;
}

// ─── BSC network switch ──────────────────────────────────────────────────────

async function ensureBsc(eip1193: any): Promise<void> {
  const provider = new ethers.BrowserProvider(eip1193);
  const network = await provider.getNetwork();
  if (Number(network.chainId) === BSC_CHAIN_ID) return;

  try {
    await eip1193.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x38" }],
    });
  } catch (switchErr: any) {
    // 4902 = chain not added yet
    if (switchErr.code === 4902) {
      await eip1193.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x38",
          chainName: "BNB Smart Chain",
          nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
          rpcUrls: [BSC_RPC],
          blockExplorerUrls: ["https://bscscan.com/"],
        }],
      });
    } else {
      throw switchErr;
    }
  }
}

// ─── Main connect ────────────────────────────────────────────────────────────

/**
 * Connect wallet, switch to BSC if needed, and return an ethers signer.
 * Works identically for MetaMask and WalletConnect.
 */
export async function connectWallet(): Promise<ethers.JsonRpcSigner> {
  const eip1193 = await getEip1193Provider();

  // Request accounts (prompts MetaMask popup or WC modal)
  await new ethers.BrowserProvider(eip1193).send("eth_requestAccounts", []);

  await ensureBsc(eip1193);

  // Re-create provider after potential chain switch
  return new ethers.BrowserProvider(eip1193).getSigner();
}

// ─── Event listeners ─────────────────────────────────────────────────────────

export interface WalletEventCallbacks {
  onAccountsChanged?: (accounts: string[]) => void;
  onChainChanged?: (chainId: string) => void;
  onDisconnect?: () => void;
}

export function addWalletEventListeners(callbacks: WalletEventCallbacks): void {
  const p = _activeEip1193;
  if (!p) return;
  if (callbacks.onAccountsChanged) p.on("accountsChanged", callbacks.onAccountsChanged);
  if (callbacks.onChainChanged)    p.on("chainChanged",    callbacks.onChainChanged);
  if (callbacks.onDisconnect)      p.on("disconnect",      callbacks.onDisconnect);
}

export function removeWalletEventListeners(callbacks: WalletEventCallbacks): void {
  const p = _activeEip1193;
  if (!p) return;
  if (callbacks.onAccountsChanged) p.removeListener?.("accountsChanged", callbacks.onAccountsChanged);
  if (callbacks.onChainChanged)    p.removeListener?.("chainChanged",    callbacks.onChainChanged);
  if (callbacks.onDisconnect)      p.removeListener?.("disconnect",      callbacks.onDisconnect);
}

// ─── Disconnect ──────────────────────────────────────────────────────────────

export async function disconnectWallet(): Promise<void> {
  if (_wcProvider) {
    try { await _wcProvider.disconnect(); } catch {}
    _wcProvider = null;
  }
  _activeEip1193 = null;
}
