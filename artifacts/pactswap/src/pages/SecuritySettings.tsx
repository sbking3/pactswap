import { useState } from "react";
import { useSetup2fa, useEnable2fa, useDisable2fa, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Lock, Shield, AlertTriangle } from "lucide-react";

export default function SecuritySettings() {
  const { data: user, refetch } = useGetMe();
  const setupMutation = useSetup2fa();
  const enableMutation = useEnable2fa();
  const disableMutation = useDisable2fa();

  const [setupData, setSetupData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [token, setToken] = useState("");

  const handleStartSetup = () => {
    setupMutation.mutate(undefined, {
      onSuccess: (data) => setSetupData(data),
      onError: (error) => toast.error((error as any).error || "Failed to generate 2FA secret")
    });
  };

  const handleEnable = (e: React.FormEvent) => {
    e.preventDefault();
    if (token.length !== 6) return;
    
    enableMutation.mutate({ data: { token } }, {
      onSuccess: () => {
        toast.success("2FA enabled successfully!");
        setSetupData(null);
        setToken("");
        refetch();
      },
      onError: (error) => toast.error((error as any).error || "Invalid verification code")
    });
  };

  const handleDisable = (e: React.FormEvent) => {
    e.preventDefault();
    if (token.length !== 6) return;

    disableMutation.mutate({ data: { token } }, {
      onSuccess: () => {
        toast.success("2FA disabled.");
        setToken("");
        refetch();
      },
      onError: (error) => toast.error((error as any).error || "Invalid verification code")
    });
  };

  if (!user) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
          <Shield className="h-8 w-8" />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Security Settings</h1>
        <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
          Protect your PACTSWAP account with Two-Factor Authentication.
        </p>
      </div>

      {user.twoFactorEnabled ? (
        <Card className="bg-card border-border shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-green-500" /> 2FA is Enabled
            </CardTitle>
            <CardDescription>Your account is secured with an authenticator app.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-lg flex items-start gap-3 mb-6 text-amber-500">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <strong className="block mb-1">Warning</strong>
                Disabling 2FA reduces your account security. You will need your authenticator app to disable it.
              </div>
            </div>

            <form onSubmit={handleDisable} className="space-y-4 max-w-sm">
              <div className="space-y-2">
                <Label>Verification Code to Disable</Label>
                <Input 
                  placeholder="123456" 
                  value={token} 
                  onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="bg-background border-border tracking-[0.5em] text-center font-mono"
                  maxLength={6}
                />
              </div>
              <Button 
                type="submit" 
                variant="destructive" 
                className="w-full"
                disabled={disableMutation.isPending || token.length !== 6}
              >
                {disableMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Disable 2FA
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" /> Setup Two-Factor Authentication
            </CardTitle>
            <CardDescription>Use Google Authenticator, Authy, or any TOTP app.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {!setupData ? (
              <div className="text-center py-6">
                <Button 
                  onClick={handleStartSetup} 
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
                  disabled={setupMutation.isPending}
                >
                  {setupMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Begin Setup
                </Button>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex flex-col md:flex-row items-center gap-8 justify-center p-6 bg-background rounded-lg border border-border">
                  <div className="bg-white p-2 rounded-lg">
                    <img src={setupData.qrCodeDataUrl} alt="QR Code" className="w-48 h-48" />
                  </div>
                  <div className="text-center md:text-left">
                    <p className="text-sm text-muted-foreground mb-2">Scan QR code or enter secret manually:</p>
                    <code className="text-lg text-primary font-bold bg-primary/10 px-3 py-1 rounded block mb-2">{setupData.secret}</code>
                  </div>
                </div>

                <form onSubmit={handleEnable} className="space-y-4 max-w-sm mx-auto">
                  <div className="space-y-2 text-center">
                    <Label>Enter the 6-digit code from your app</Label>
                    <Input 
                      placeholder="123456" 
                      value={token} 
                      onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="bg-background border-border text-2xl tracking-[0.5em] text-center font-mono h-14"
                      maxLength={6}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-12"
                    disabled={enableMutation.isPending || token.length !== 6}
                  >
                    {enableMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Verify and Enable
                  </Button>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}