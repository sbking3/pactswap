import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useSiweLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Wallet, Lock } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  
  const [isConnecting, setIsConnecting] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [loginData, setLoginData] = useState<{ address: string, message: string, signature: string } | null>(null);
  
  const siweMutation = useSiweLogin();

  const handleConnectAndSign = async () => {
    try {
      setIsConnecting(true);
      if (!window.ethereum) {
        toast.error("MetaMask or Web3 wallet not detected. Please install a wallet extension.");
        setIsConnecting(false);
        return;
      }
      
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || !accounts[0]) {
        throw new Error("No accounts found");
      }
      
      const address = accounts[0];
      const message = `Sign this message to authenticate with PACTSWAP.\n\nAddress: ${address}\nNonce: ${Math.random().toString(36).substring(2, 15)}`;
      
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, address],
      });

      const payload = { address, message, signature };
      setLoginData(payload);
      
      // Attempt login
      siweMutation.mutate({
        data: { walletAddress: address, message, signature }
      }, {
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
        }
      });
      
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to sign message.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handle2FASubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginData || !totpCode) return;

    siweMutation.mutate({
      data: { ...loginData, walletAddress: loginData.address, totpCode }
    }, {
      onSuccess: (data) => {
        login(data.token, data.user.walletAddress);
        toast.success("Logged in successfully");
        setLocation("/dashboard");
      },
      onError: (error) => {
        const msg = (error.data as any)?.error || error.message || "Invalid 2FA code";
        toast.error(msg);
      }
    });
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card p-8 rounded-xl border border-border shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-muted-foreground text-sm">Login with your Web3 wallet.</p>
        </div>

        {!requires2FA ? (
          <div className="space-y-6">
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
              Connect & Sign In
            </Button>

            <div className="text-center text-sm text-muted-foreground mt-6">
              Don't have an account? <Link href="/signup" className="text-primary hover:underline font-medium">Create one</Link>
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
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} 
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
              <Button type="button" variant="link" onClick={() => setRequires2FA(false)} className="text-sm text-muted-foreground hover:text-primary">
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}