/**
 * wallet-provider.ts
 *
 * Single source of truth for the wallet connection.
 * - Desktop with MetaMask installed  → uses window.ethereum directly
 * - Inside MetaMask / Trust in-app browser → uses window.ethereum directly
 * - Mobile / no extension → opens WalletConnect QR/deep-link modal
 *
 * Every escrow function in contract.ts goes through connectWallet() here,
 * so the rest of the app is 100% agnostic to which wallet the user chose.
 */

import { ethers } from "ethers";
import EthereumProvider from "@walletconnect/ethereum-provider";

export const BSC_CHAIN_ID = 56;
const BSC_RPC = "https://bsc-dataseed1.binance.org/";

// ─── Detection helpers ───────────────────────────────────────────────────────

/** True when running on a mobile browser without an injected wallet */
export function isMobileWithoutWallet(): boolean {
  if (typeof window === "undefined") return false;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return mobile && !window.ethereum;
}

/**
 * True when running inside MetaMask Mobile's in-app browser or Trust Wallet's
 * built-in browser — both inject window.ethereum automatically.
 */
export function isInWalletBrowser(): boolean {
  if (typeof window === "undefined" || !window.ethereum) return false;
  const ua = navigator.userAgent;
  const isMetaMaskBrowser = Boolean(window.ethereum?.isMetaMask) && /MetaMask/i.test(ua);
  const isTrustBrowser    = Boolean(window.ethereum?.isTrust) || /TrustWallet/i.test(ua);
  return isMetaMaskBrowser || isTrustBrowser;
}

// ─── Singleton state ─────────────────────────────────────────────────────────

// Singleton WalletConnect provider (re-used across calls)
let _wcProvider: InstanceType<typeof EthereumProvider> | null = null;

// The currently active EIP-1193 provider (MetaMask OR WalletConnect)
let _activeEip1193: any = null;

/**
 * In-flight connection promise.
 * If connectWallet() is already running (e.g. user double-clicked), we return
 * the same promise instead of opening a second wallet popup or spamming RPC.
 */
let _connectingPromise: Promise<ethers.JsonRpcSigner> | null = null;

// ─── Provider resolution ─────────────────────────────────────────────────────

/**
 * Returns an EIP-1193 provider:
 *   - window.ethereum (MetaMask / injected / in-app browser) if present
 *   - WalletConnect v2 modal otherwise (Trust Wallet, MetaMask Mobile QR, etc.)
 *
 * Throws a typed error { code: "MOBILE_NO_WALLET" } when on mobile with no
 * injected wallet AND no WalletConnect project ID — callers can catch this to
 * show the deep-link guide modal instead of a generic error.
 */
export async function getEip1193Provider(): Promise<any> {
  // Prefer injected wallet (MetaMask desktop, in-app browsers)
  if (window.ethereum) {
    _activeEip1193 = window.ethereum;
    return window.ethereum;
  }

  // No injected wallet — try WalletConnect
  const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

  if (!projectId) {
    // On mobile without WC configured → typed error so UI can show deep links
    const err: any = new Error(
      isMobileWithoutWallet()
        ? "Open this page inside MetaMask or Trust Wallet to connect."
        : "No wallet extension found. Please install MetaMask."
    );
    err.code = "MOBILE_NO_WALLET";
    throw err;
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
      params: [{ chainId: "0x38" }], // 56 = BSC Mainnet
    });
  } catch (switchErr: any) {
    // 4902 = chain not added in wallet yet
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
 *
 * Desktop / in-app browser (window.ethereum present):
 *   Uses the injected provider directly — MetaMask popup, BSC switch, signer.
 *
 * Mobile without injected wallet:
 *   Redirects immediately to the wallet's deep link so the page re-opens
 *   inside the wallet's built-in browser (where window.ethereum is injected).
 *   Android tries MetaMask first, falls back to Trust Wallet after 1 s.
 *   iPhone goes straight to MetaMask.
 *   Throws Error("OPENING_WALLET_APP") so callers know a redirect is in progress
 *   and can suppress the error (the page is navigating away anyway).
 *
 * Protected by a singleton promise: concurrent calls share one attempt —
 * no duplicate wallet popups, no RPC spam.
 */
export async function connectWallet(): Promise<ethers.JsonRpcSigner> {
  // If a connection is already in flight, return the same promise
  if (_connectingPromise) return _connectingPromise;

  _connectingPromise = (async () => {
    try {
      // ── Desktop / in-app wallet browser ─────────────────────────────────
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        await ensureBsc(window.ethereum);
        _activeEip1193 = window.ethereum;
        return provider.getSigner();
      }

      // ── Mobile without injected wallet — redirect into wallet app ────────
      const dappUrl  = window.location.host + window.location.pathname + window.location.search;
      const fullUrl  = encodeURIComponent(window.location.href);
      const isAndroid = /Android/i.test(navigator.userAgent);

      if (isAndroid) {
        // Try MetaMask; if it's not installed the OS keeps the browser open,
        // so fall back to Trust Wallet after 1 s.
        window.location.href = `https://metamask.app.link/dapp/${dappUrl}`;
        setTimeout(() => {
          window.location.href =
            `https://link.trustwallet.com/openurl?coin_id=60&url=${fullUrl}`;
        }, 1000);
      } else {
        // iPhone / iPad
        window.location.href = `https://metamask.app.link/dapp/${dappUrl}`;
      }

      // Page is navigating away — throw so callers can react appropriately
      throw new Error("OPENING_WALLET_APP");
    } finally {
      _connectingPromise = null;
    }
  })();

  return _connectingPromise;
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
  _connectingPromise = null;
}
