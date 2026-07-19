import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useSiweLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Wallet, Lock, Smartphone } from "lucide-react";
import {
  getEip1193Provider,
  addWalletEventListeners,
  removeWalletEventListeners,
  disconnectWallet,
  type WalletEventCallbacks,
} from "@/lib/wallet-provider";

/** Shorten 0x1234…ABCD */
function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, logout } = useAuth();

  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [requires2FA, setRequires2FA] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [loginData, setLoginData] = useState<{ address: string; message: string; signature: string } | null>(null);

  const siweMutation = useSiweLogin();

  // ─── Wallet event listeners ────────────────────────────────────────────────

  const callbacks = useRef<WalletEventCallbacks>({
    onAccountsChanged: (accounts) => {
      if (!accounts.length) {
        // User disconnected all accounts
        setConnectedAddress(null);
        logout();
        toast.info("Wallet disconnected");
      } else {
        setConnectedAddress(accounts[0]);
      }
    },
    onChainChanged: () => {
      // Chain switch — reload to re-sync provider state
      window.location.reload();
    },
    onDisconnect: () => {
      setConnectedAddress(null);
      logout();
      toast.info("Wallet disconnected");
    },
  });

  useEffect(() => {
    const cbs = callbacks.current;
    addWalletEventListeners(cbs);
    return () => removeWalletEventListeners(cbs);
  }, []);

  // ─── Connect & sign ────────────────────────────────────────────────────────

  const handleConnectAndSign = async () => {
    try {
      setIsConnecting(true);

      // Resolves MetaMask (desktop) or opens WalletConnect modal (mobile/no extension)
      const eip1193 = await getEip1193Provider();

      const accounts: string[] = await eip1193.request({ method: "eth_requestAccounts" });
      if (!accounts?.length) throw new Error("No accounts returned");

      const address = accounts[0];
      setConnectedAddress(address);

      const message =
        `Sign this message to authenticate with PACTSWAP.\n\nAddress: ${address}\nNonce: ${Math.random().toString(36).substring(2, 15)}`;

      const signature: string = await eip1193.request({
        method: "personal_sign",
        params: [message, address],
      });

      const payload = { address, message, signature };
      setLoginData(payload);

      siweMutation.mutate(
        { data: { walletAddress: address, message, signature } },
        {
          onSuccess: (data) => {
            if (data.requires2FA) {
              setRequires2FA(true);
            } else {
              login(data.token, data.user.walletAddress);
              toast.success("Logged in successfully");
              setLocation("/dashboard");
            }
          },
          onError: (error) => {
            const msg = (error.data as any)?.error || error.message || "Login failed";
            toast.error(msg);
            setConnectedAddress(null);
          },
        }
      );
    } catch (error: any) {
      const msg =
        error?.code === 4001 || error?.message?.includes("rejected")
          ? "Connection rejected by user"
          : error?.message?.includes("not configured")
          ? "No wallet found. Please install MetaMask or use a WalletConnect-compatible wallet."
          : error?.message || "Failed to connect wallet";
      toast.error(msg);
      setConnectedAddress(null);
    } finally {
      setIsConnecting(false);
    }
  };

  // ─── 2FA ──────────────────────────────────────────────────────────────────

  const handle2FASubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginData || !totpCode) return;

    siweMutation.mutate(
      { data: { ...loginData, walletAddress: loginData.address, totpCode } },
      {
        onSuccess: (data) => {
          login(data.token, data.user.walletAddress);
          toast.success("Logged in successfully");
          setLocation("/dashboard");
        },
        onError: (error) => {
          const msg = (error.data as any)?.error || error.message || "Invalid 2FA code";
          toast.error(msg);
        },
      }
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const buttonLabel = () => {
    if (isConnecting) return "Connecting…";
    if (siweMutation.isPending) return "Signing…";
    if (connectedAddress) return shortAddr(connectedAddress);
    return "Connect & Sign In";
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card p-8 rounded-xl border border-border shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-muted-foreground text-sm">Login with your Web3 wallet.</p>
        </div>

        {!requires2FA ? (
          <div className="space-y-4">
            {/* ── Connect button ── */}
            <Button
              className="w-full h-14 text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleConnectAndSign}
              disabled={isConnecting || siweMutation.isPending}
            >
              {isConnecting || siweMutation.isPending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Wallet className="mr-2 h-5 w-5" />
              )}
              {buttonLabel()}
            </Button>

            {/* ── New to crypto helper ── */}
            <div className="rounded-lg border border-border/40 bg-muted/20 p-4 text-sm space-y-3">
              <p className="text-center text-muted-foreground flex items-center justify-center gap-1.5">
                <Smartphone className="w-4 h-4 shrink-0" />
                New to crypto? Download a wallet:
              </p>
              <div className="grid grid-cols-2 gap-3">
                {/* MetaMask */}
                <a
                  href="https://play.google.com/store/apps/details?id=io.metamask"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 rounded-lg border border-border/60 bg-background p-3 hover:border-primary/50 hover:bg-muted/40 transition-colors"
                >
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg"
                    alt="MetaMask"
                    className="w-8 h-8"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <span className="font-medium text-white text-xs">MetaMask</span>
                  <span className="text-[10px] text-muted-foreground">Google Play</span>
                </a>
                {/* Trust Wallet */}
                <a
                  href="https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 rounded-lg border border-border/60 bg-background p-3 hover:border-primary/50 hover:bg-muted/40 transition-colors"
                >
                  <img
                    src="https://trustwallet.com/assets/images/media/assets/trust_platform.svg"
                    alt="Trust Wallet"
                    className="w-8 h-8"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <span className="font-medium text-white text-xs">Trust Wallet</span>
                  <span className="text-[10px] text-muted-foreground">Google Play</span>
                </a>
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                Desktop? Use the MetaMask browser extension.
                Mobile? Open this site inside your wallet's built-in browser.
              </p>
            </div>

            <div className="text-center text-sm text-muted-foreground mt-2">
              Don't have an account?{" "}
              <Link href="/signup" className="text-primary hover:underline font-medium">
                Create one
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handle2FASubmit} className="space-y-6">
            <div className="space-y-2 text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
                <Lock className="h-8 w-8" />
              </div>
              <Label>Two-Factor Authentication</Label>
              <p className="text-xs text-muted-foreground mt-1">Enter the code from your authenticator app</p>
            </div>

            <div className="space-y-2">
              <Input
                id="totp"
                placeholder="123456"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="bg-background border-border text-center text-2xl tracking-[0.5em] font-mono h-14"
                maxLength={6}
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-12"
              disabled={siweMutation.isPending || totpCode.length !== 6}
            >
              {siweMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Verify
            </Button>

            <div className="text-center mt-4">
              <Button
                type="button"
                variant="link"
                onClick={() => setRequires2FA(false)}
                className="text-sm text-muted-foreground hover:text-primary"
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
