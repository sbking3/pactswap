import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  AlertTriangle,
  Trash2,
  Ban,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Shield,
  Activity,
  DollarSign,
  Gavel,
  X,
} from "lucide-react";
import { releaseEscrow, refundEscrow } from "@/lib/contract";

const ADMIN_WALLET = "0xf71c8e88aa5e433603fb76afcea62d02b9751338";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("pactswap_token");
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

// ─── status helpers ────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<number, string> = {
  0: "Created",
  1: "Paid",
  2: "Completed",
  3: "Cancelled",
  4: "Disputed",
};
const STATUS_COLORS: Record<number, string> = {
  0: "bg-blue-500/20 text-blue-300",
  1: "bg-yellow-500/20 text-yellow-300",
  2: "bg-green-500/20 text-green-300",
  3: "bg-gray-500/20 text-gray-400",
  4: "bg-red-500/20 text-red-400",
};

function shortAddr(addr?: string | null) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── TAB 1 — Marketplace ───────────────────────────────────────────────────────
function MarketplaceTab({ stats }: { stats: any }) {
  const { toast } = useToast();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  async function doClear() {
    setLoading(true);
    try {
      const r = await apiFetch("/api/admin/offers/clear", { method: "POST" });
      toast({ description: r.message });
      setStep(0);
      setConfirmText("");
    } catch (e: any) {
      toast({ variant: "destructive", description: e.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<ShoppingCart className="w-5 h-5 text-primary" />} label="Active Offers" value={stats?.activeOffers ?? "—"} />
        <StatCard icon={<Users className="w-5 h-5 text-blue-400" />} label="Total Users" value={stats?.totalUsers ?? "—"} />
        <StatCard icon={<DollarSign className="w-5 h-5 text-green-400" />} label="Volume (USDT)" value={stats ? stats.totalVolumeUsdt.toFixed(2) : "—"} />
        <StatCard icon={<Activity className="w-5 h-5 text-yellow-400" />} label="Total Orders" value={stats?.totalOrders ?? "—"} />
      </div>

      {/* clear marketplace */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-red-400" /> Clear Marketplace
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Soft-deletes all active offers that have no ongoing trades. Offers locked in an active order are protected.
        </p>
        <Button
          variant="destructive"
          onClick={() => setStep(1)}
          className="flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4" /> Clear Marketplace
        </Button>
      </div>

      {/* Step 1 warning */}
      <AlertDialog open={step === 1} onOpenChange={o => !o && setStep(0)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Warning
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will delete <strong>all active offers</strong> that have no ongoing trades.
              Offers locked in an active order are protected. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setStep(2)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2 type DELETE */}
      <Dialog open={step === 2} onOpenChange={o => { if (!o) { setStep(0); setConfirmText(""); } }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Confirm Clear Marketplace</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Type <strong className="text-foreground font-mono">DELETE</strong> to confirm.
          </p>
          <Input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className="font-mono"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStep(0); setConfirmText(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== "DELETE" || loading}
              onClick={doClear}
            >
              {loading ? "Clearing…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── TAB 2 — Users ─────────────────────────────────────────────────────────────
function UsersTab() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/admin/users?limit=100${search ? `&search=${encodeURIComponent(search)}` : ""}`);
      setUsers(r.users);
    } catch (e: any) {
      toast({ variant: "destructive", description: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function freeze(wallet: string) {
    try {
      const r = await apiFetch(`/api/admin/users/${wallet}/freeze`, { method: "PATCH" });
      toast({ description: r.message });
      load();
    } catch (e: any) {
      toast({ variant: "destructive", description: e.message });
    }
  }

  async function unfreeze(wallet: string) {
    try {
      const r = await apiFetch(`/api/admin/users/${wallet}/unfreeze`, { method: "PATCH" });
      toast({ description: r.message });
      load();
    } catch (e: any) {
      toast({ variant: "destructive", description: e.message });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email or wallet…"
          className="max-w-sm"
          onKeyDown={e => e.key === "Enter" && load()}
        />
        <Button onClick={load} variant="outline" size="icon"><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Wallet</TableHead>
              <TableHead>Name / Email</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Trades</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell>
              </TableRow>
            )}
            {!loading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users found</TableCell>
              </TableRow>
            )}
            {users.map(u => (
              <TableRow key={u.id} className="hover:bg-muted/20">
                <TableCell className="font-mono text-xs">{shortAddr(u.walletAddress)}</TableCell>
                <TableCell>
                  <div className="font-medium text-sm">{u.name}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtDate(u.createdAt)}</TableCell>
                <TableCell className="text-sm">{u.tradeCount}</TableCell>
                <TableCell>
                  {u.isBanned
                    ? <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Frozen</Badge>
                    : <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  {u.isBanned ? (
                    <Button size="sm" variant="outline" onClick={() => unfreeze(u.walletAddress)}
                      className="text-green-400 border-green-500/30 hover:bg-green-500/10">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Unfreeze
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => freeze(u.walletAddress)}
                      className="text-red-400 border-red-500/30 hover:bg-red-500/10">
                      <Ban className="w-3 h-3 mr-1" /> Freeze
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── TAB 3 — Orders ────────────────────────────────────────────────────────────
function OrdersTab() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [cancelId, setCancelId] = useState<string | null>(null);

  async function load(status = filter) {
    setLoading(true);
    try {
      const q = status !== "all" ? `?status=${status}` : "";
      const r = await apiFetch(`/api/admin/orders${q}`);
      setOrders(r);
    } catch (e: any) {
      toast({ variant: "destructive", description: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function forceCancel(id: string) {
    try {
      const r = await apiFetch(`/api/admin/orders/${id}/cancel`, { method: "POST" });
      toast({ description: r.message });
      setCancelId(null);
      load();
    } catch (e: any) {
      toast({ variant: "destructive", description: e.message });
    }
  }

  const filterOptions = [
    { value: "all", label: "All" },
    { value: "0", label: "Created" },
    { value: "1", label: "Paid" },
    { value: "4", label: "Disputed" },
    { value: "2", label: "Completed" },
    { value: "3", label: "Cancelled" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Select value={filter} onValueChange={v => { setFilter(v); load(v); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {filterOptions.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => load()} variant="outline" size="icon"><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Order ID</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Seller</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell>
              </TableRow>
            )}
            {!loading && orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No orders found</TableCell>
              </TableRow>
            )}
            {orders.map(o => (
              <TableRow key={o.id} className="hover:bg-muted/20">
                <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}…</TableCell>
                <TableCell className="text-sm">{o.buyer?.name ?? shortAddr(o.buyerAddress)}</TableCell>
                <TableCell className="text-sm">{o.seller?.name ?? shortAddr(o.sellerAddress)}</TableCell>
                <TableCell className="text-sm font-medium">{o.amountUsdt} USDT</TableCell>
                <TableCell>
                  <Badge className={`text-xs ${STATUS_COLORS[o.status] ?? "bg-gray-500/20 text-gray-400"}`}>
                    {STATUS_LABELS[o.status] ?? "Unknown"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtDate(o.createdAt)}</TableCell>
                <TableCell className="text-right">
                  {o.status !== 2 && o.status !== 3 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCancelId(o.id)}
                      className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                    >
                      <XCircle className="w-3 h-3 mr-1" /> Force Cancel
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!cancelId} onOpenChange={o => !o && setCancelId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Force Cancel Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will set the order status to Cancelled. If USDT is locked on-chain, you must
              manually call <strong>refundEscrow</strong> from the admin wallet to return funds to the seller.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelId && forceCancel(cancelId)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Cancel Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── TAB 4 — Disputes ──────────────────────────────────────────────────────────
function DisputesTab() {
  const { toast } = useToast();
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [resolving, setResolving] = useState(false);
  const [reason, setReason] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await apiFetch("/api/admin/disputes");
      setDisputes(r);
    } catch (e: any) {
      toast({ variant: "destructive", description: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function timeInDispute(createdAt: string) {
    const ms = Date.now() - new Date(createdAt).getTime();
    const h = Math.floor(ms / 3_600_000);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  async function resolve(decision: "release_buyer" | "refund_seller" | "split") {
    if (!selected) return;
    setResolving(true);
    try {
      let txHash: string | undefined;

      if (decision === "release_buyer") {
        toast({ description: "Waiting for on-chain releaseEscrow…" });
        txHash = await releaseEscrow(selected.escrowId);
      } else if (decision === "refund_seller") {
        toast({ description: "Waiting for on-chain refundEscrow…" });
        txHash = await refundEscrow(selected.escrowId);
      }
      // split: no on-chain call needed (manual BEP-20)

      const r = await apiFetch(`/api/admin/disputes/${selected.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ decision, reason, txHash }),
      });
      toast({ description: r.message });
      setSelected(null);
      setReason("");
      load();
    } catch (e: any) {
      toast({ variant: "destructive", description: e.message });
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{disputes.length} dispute{disputes.length !== 1 ? "s" : ""} awaiting resolution</p>
        <Button onClick={load} variant="outline" size="icon"><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Order ID</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Seller</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Evidence</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell>
              </TableRow>
            )}
            {!loading && disputes.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No open disputes 🎉</TableCell>
              </TableRow>
            )}
            {disputes.map(d => (
              <TableRow key={d.id} className="hover:bg-muted/20">
                <TableCell className="font-mono text-xs">{d.id.slice(0, 8)}…</TableCell>
                <TableCell className="text-sm">{d.buyer?.name ?? shortAddr(d.buyerAddress)}</TableCell>
                <TableCell className="text-sm">{d.seller?.name ?? shortAddr(d.sellerAddress)}</TableCell>
                <TableCell className="text-sm font-medium">{d.amountUsdt} USDT</TableCell>
                <TableCell className="text-sm">
                  {d.dispute?.evidenceUrl
                    ? <a href={d.dispute.evidenceUrl} target="_blank" rel="noreferrer" className="text-primary underline text-xs">View</a>
                    : <span className="text-muted-foreground text-xs">None</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{timeInDispute(d.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" onClick={() => setSelected(d)} className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30">
                    <Gavel className="w-3 h-3 mr-1" /> Resolve
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dispute Detail Modal */}
      <Dialog open={!!selected} onOpenChange={o => { if (!o) { setSelected(null); setReason(""); } }}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel className="w-5 h-5 text-primary" /> Dispute Resolution
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              {/* Trade info */}
              <div className="grid grid-cols-2 gap-3">
                <InfoBox label="Buyer" value={selected.buyer?.name ?? shortAddr(selected.buyerAddress)} sub={shortAddr(selected.buyerAddress)} />
                <InfoBox label="Seller" value={selected.seller?.name ?? shortAddr(selected.sellerAddress)} sub={shortAddr(selected.sellerAddress)} />
                <InfoBox label="Amount" value={`${selected.amountUsdt} USDT`} />
                <InfoBox label="Escrow ID" value={shortAddr(selected.escrowId)} mono />
              </div>

              {/* Seller bank details */}
              {selected.seller && (
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Seller Bank Details</p>
                  <p className="text-sm">{selected.seller.bankName ?? "—"} · {selected.seller.accountNumber ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">{selected.seller.accountName ?? "—"}</p>
                </div>
              )}

              {/* Dispute reason */}
              {selected.dispute && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-xs text-red-400 mb-1 font-medium uppercase tracking-wide">Dispute Reason</p>
                  <p className="text-sm">{selected.dispute.reason}</p>
                  {selected.dispute.evidenceUrl && (
                    <a href={selected.dispute.evidenceUrl} target="_blank" rel="noreferrer"
                      className="mt-2 inline-block text-xs text-primary underline">View evidence →</a>
                  )}
                </div>
              )}

              {/* Admin reason */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Resolution note (optional)</label>
                <Textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Add a reason or note for your decision…"
                  className="text-sm resize-none"
                  rows={2}
                />
              </div>

              {/* Split notice */}
              <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2">
                <strong>Note:</strong> Release and Refund trigger an on-chain wallet transaction from your admin wallet.
                Split records the decision only — you must manually send 50% to the buyer via BEP-20 transfer (contract does not support native split).
              </p>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => { setSelected(null); setReason(""); }}
              className="sm:mr-auto"
            >
              <X className="w-4 h-4 mr-1" /> Close
            </Button>
            <Button
              disabled={resolving}
              onClick={() => resolve("refund_seller")}
              className="bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/30"
            >
              <XCircle className="w-4 h-4 mr-1" /> Refund to Seller
            </Button>
            <Button
              disabled={resolving}
              onClick={() => resolve("split")}
              className="bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30"
            >
              <Shield className="w-4 h-4 mr-1" /> Split 50/50
            </Button>
            <Button
              disabled={resolving}
              onClick={() => resolve("release_buyer")}
              className="bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/30"
            >
              <CheckCircle2 className="w-4 h-4 mr-1" /> Release to Buyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── sub-components ────────────────────────────────────────────────────────────
function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-muted/40 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}

function InfoBox({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground font-mono">{sub}</p>}
    </div>
  );
}

// ─── TABS ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "marketplace", label: "Marketplace", icon: ShoppingCart },
  { id: "users", label: "Users", icon: Users },
  { id: "orders", label: "Orders", icon: Activity },
  { id: "disputes", label: "Disputes", icon: Gavel },
];

// ─── MAIN ──────────────────────────────────────────────────────────────────────
export default function Admin() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState("marketplace");
  const [stats, setStats] = useState<any>(null);
  const { toast } = useToast();

  const isAdmin = user?.walletAddress?.toLowerCase() === ADMIN_WALLET;

  useEffect(() => {
    if (!user) { setLocation("/login"); return; }
    if (!isAdmin) { setLocation("/dashboard"); return; }
    apiFetch("/api/admin/stats")
      .then(setStats)
      .catch((e: any) => toast({ variant: "destructive", description: e.message }));
  }, [user]);

  if (!user || !isAdmin) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <LayoutDashboard className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">PACTSWAP Control Panel</p>
        </div>
        <Badge className="ml-auto bg-primary/20 text-primary border-primary/30">
          <Shield className="w-3 h-3 mr-1" /> Admin
        </Badge>
      </div>

      {/* tab bar */}
      <div className="flex gap-1 bg-muted/30 rounded-xl p-1 mb-6 w-fit">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? "bg-card text-foreground shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {t.id === "disputes" && stats?.openDisputes > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs">
                  {stats.openDisputes}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* tab content */}
      {tab === "marketplace" && <MarketplaceTab stats={stats} />}
      {tab === "users" && <UsersTab />}
      {tab === "orders" && <OrdersTab />}
      {tab === "disputes" && <DisputesTab />}
    </div>
  );
}
