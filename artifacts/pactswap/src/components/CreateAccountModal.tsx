import { apiUrl } from "@/lib/api";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function apiPost(path: string, body: object) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data?.error ?? "Request failed"), { data });
  return data;
}

interface Props {
  /** Connected wallet address */
  address: string;
  /** Called when registration succeeds — parent should call login() and redirect */
  onSuccess: (token: string, walletAddress: string, name: string) => void;
  /** Called when the user cancels, or if the wallet is already registered (parent should try SIWE) */
  onCancel: () => void;
  /** Called specifically when the API says "already registered" — parent should try SIWE login */
  onAlreadyRegistered?: () => void;
}

export function CreateAccountModal({ address, onSuccess, onCancel, onAlreadyRegistered }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimName = name.trim();
    const trimEmail = email.trim();
    if (!trimName || !trimEmail) return;

    setIsLoading(true);
    try {
      const data = await apiPost("/api/auth/register", {
        walletAddress: address,
        name: trimName,
        email: trimEmail,
      });

      // Cache the profile locally so future logins show "Welcome back"
      localStorage.setItem(
        `pactswap_user_${address.toLowerCase()}`,
        JSON.stringify({ name: trimName, email: trimEmail })
      );

      onSuccess(data.token, data.user.walletAddress, trimName);
    } catch (err: any) {
      const msg: string = err?.data?.error || err?.message || "Registration failed";

      if (msg.toLowerCase().includes("already registered")) {
        // Wallet already has an account — log them in via SIWE instead
        toast.info("Wallet already has an account — signing you in…");
        onAlreadyRegistered?.();
      } else if (msg.toLowerCase().includes("email already")) {
        toast.error("That email is already linked to a different wallet. Please use another email.");
      } else {
        toast.error(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <UserPlus className="h-5 w-5 text-primary" />
            Create Your PACTSWAP Account
          </DialogTitle>
          <DialogDescription>
            Wallet{" "}
            <span className="font-mono text-white/80">{shortAddr(address)}</span>{" "}
            connected. Set a username and email to start trading.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Username */}
          <div className="space-y-1.5">
            <Label htmlFor="ca-name" className="text-white">
              Username
            </Label>
            <Input
              id="ca-name"
              placeholder="e.g. cryptotrader99"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              autoFocus
              required
              disabled={isLoading}
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="ca-email" className="text-white">
              Email
            </Label>
            <Input
              id="ca-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          {/* Privacy note */}
          <div className="flex items-start gap-2 rounded-md bg-muted/20 border border-border/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>
              Your email is used for trade notifications only. Never sold or
              shared with third parties.
            </span>
          </div>

          <DialogFooter className="gap-2 pt-2 flex-col sm:flex-row">
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              disabled={isLoading || !name.trim() || !email.trim()}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? "Creating account…" : "Create Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
