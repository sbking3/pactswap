import { apiUrl } from "@/lib/api";
import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetOrder,
  useMarkOrderPaid,
  confirmPayment,
  useOpenDispute,
  useGetMe,
  getGetOrderQueryKey,
} from "@workspace/api-client-react";
import { releaseEscrow, lockEscrowBySeller } from "@/lib/contract";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, ArrowLeft, AlertCircle, Copy,
  CheckCircle2, Clock, ShieldCheck, FileWarning, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// ── Trade timer (15 minutes from order creation) ──────────────────────────────
const TRADE_WINDOW_SECS = 15 * 60;

function useCountdown(createdAt: string | undefined) {
  const [secsLeft, setSecsLeft] = useState<number>(0);

  useEffect(() => {
    if (!createdAt) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
      setSecsLeft(Math.max(0, TRADE_WINDOW_SECS - elapsed));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [createdAt]);

  const mins = String(Math.floor(secsLeft / 60)).padStart(2, "0");
  const secs = String(secsLeft % 60).padStart(2, "0");
  const progress = secsLeft / TRADE_WINDOW_SECS; // 1 → 0
  const expired = secsLeft === 0;
  return { mins, secs, progress, expired };
}

// ── Circular SVG timer ────────────────────────────────────────────────────────
function CircleTimer({ mins, secs, progress, expired }: {
  mins: string; secs: string; progress: number; expired: boolean;
}) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = circ * progress;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="140" className="-rotate-90">
        {/* Track */}
        <circle cx="70" cy="70" r={r} fill="none" stroke="#1f1f1f" strokeWidth="8" />
        {/* Progress */}
        <circle
          cx="70" cy="70" r={r} fill="none"
          stroke={expired ? "#ef4444" : progress > 0.3 ? "#F0B90B" : "#f97316"}
          strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.5s linear, stroke 0.5s" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-3xl font-black tabular-nums ${expired ? "text-red-500" : "text-white"}`}>
          {mins}:{secs}
        </span>
        <span className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">
          {expired ? "Expired" : "remaining"}
        </span>
      </div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
function Step({ n, label, done, active }: { n: number; label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold transition-colors ${
        done ? "bg-primary text-black" : active ? "bg-primary/20 text-primary border border-primary" : "bg-muted/30 text-muted-foreground border border-border"
      }`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : n}
      </div>
      <span className={`text-sm font-medium ${done || active ? "text-white" : "text-muted-foreground"}`}>{label}</span>
    </div>
  );
}

// ── Status badge map ──────────────────────────────────────────────────────────
const statusMap: Record<number, { label: string; color: string }> = {
  0: { label: "Awaiting Payment", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  1: { label: "Payment Sent", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  2: { label: "Completed", color: "bg-green-500/10 text-green-400 border-green-500/20" },
  3: { label: "Cancelled", color: "bg-muted/10 text-muted-foreground border-border" },
  4: { label: "Disputed", color: "bg-red-500/10 text-red-400 border-red-500/20" },
};

// ── Simple chat messages (instruction feed) ───────────────────────────────────
function ChatFeed({ order, isBuyer }: { order: any; isBuyer: boolean }) {
  const escrowLocked = !!order.contractTx;
  const messages = [
    { from: "system", text: "Trade created. Waiting for seller to lock USDT in escrow." },
    ...(escrowLocked ? [{ from: "system", text: "✅ Seller has locked USDT in escrow." }] : []),
    ...(escrowLocked
      ? isBuyer
        ? [
            { from: "system", text: `Transfer ₦${(order.priceNaira * Number(order.amountUsdt)).toLocaleString()} to the seller's bank account shown on the left.` },
            { from: "system", text: 'After payment, tap "I Have Paid". The seller will verify and release your USDT.' },
          ]
        : [
            { from: "system", text: "Wait for the buyer to complete their bank transfer." },
            { from: "system", text: 'Once you confirm fiat receipt, tap "Confirm Payment & Release USDT".' },
          ]
      : []
    ),
    ...(order.status >= 1 ? [{ from: "buyer", text: "Payment sent ✓" }] : []),
    ...(order.status >= 2 ? [{ from: "system", text: "USDT released. Trade complete! 🎉" }] : []),
  ];

  return (
    <div className="flex flex-col gap-2 p-4 overflow-y-auto max-h-52">
      {messages.map((m, i) => (
        <div key={i} className={`flex ${m.from === "buyer" ? "justify-end" : "justify-start"}`}>
          {m.from === "system" ? (
            <div className="bg-muted/20 border border-border/50 rounded-lg px-3 py-2 text-xs text-muted-foreground max-w-[85%]">
              {m.text}
            </div>
          ) : (
            <div className="bg-primary/15 border border-primary/20 rounded-lg px-3 py-2 text-xs text-primary max-w-[85%]">
              {m.text}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OrderDetail() {
  const [, params] = useRoute("/orders/:id");
  const orderId = params?.id;

  const { data: user, isLoading: userLoading } = useGetMe();
  const { data: order, isLoading: orderLoading, refetch } = useGetOrder(orderId || "", {
    query: { enabled: !!orderId, queryKey: getGetOrderQueryKey(orderId || "") },
  });

  const markPaidMutation = useMarkOrderPaid();
  const openDisputeMutation = useOpenDispute();

  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseTxHash, setReleaseTxHash] = useState<string | null>(null);
  const [lockLoading, setLockLoading] = useState(false);
  const [lockStep, setLockStep] = useState<"approving" | "locking" | null>(null);
  const [lockTxHash, setLockTxHash] = useState<string | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);

  const countdown = useCountdown(order?.createdAt?.toString());

  if (orderLoading || userLoading || !order || !user) {
    return (
      <div className="flex-1 flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isBuyer = user.id === order.buyerId;
  const isSeller = user.id === order.sellerId;
  const statusInfo = statusMap[order.status] ?? { label: "Unknown", color: "bg-muted" };
  const totalNaira = (order.priceNaira ?? 0) * order.amountUsdt;
  const counterparty = isBuyer ? order.seller : order.buyer;

  // Buyer: mark payment sent — no blockchain, just a DB status update
  const handleMarkPaid = () => {
    markPaidMutation.mutate({ id: order.id }, {
      onSuccess: () => { toast.success("Marked as paid. Waiting for seller."); refetch(); },
      onError: (e: any) => toast.error((e as any)?.data?.error ?? (e as any)?.message ?? "Action failed"),
    });
  };

  // Seller: lock USDT on-chain for a buyer-initiated order
  const handleLockEscrow = async () => {
    if (!order.escrowId) { toast.error("Missing escrow ID."); return; }
    if (!order.buyer?.walletAddress) { toast.error("Buyer wallet address not found."); return; }
    setLockLoading(true);
    setLockError(null);
    setLockTxHash(null);
    try {
      const txHash = await lockEscrowBySeller({
        escrowId: order.escrowId,
        buyerAddress: order.buyer.walletAddress,
        amountUsdt: String(order.amountUsdt),
        onStep: (step) => setLockStep(step),
      });
      setLockTxHash(txHash);
      toast.info("Escrow locked on-chain — recording…");

      // Tell the server to record the lock tx
      const token = localStorage.getItem("pactswap_token");
      const res = await fetch(apiUrl(`/api/orders/${order.id}/lock`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ txHash }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Server failed to record lock");
      }
      toast.success("USDT locked in escrow! Waiting for buyer to send payment.");
      refetch();
    } catch (err: any) {
      const msg = err?.reason ?? err?.message ?? "Lock failed — please try again.";
      // Double-click or retry after partial success → escrow is already recorded.
      // Don't error — just refresh so the UI advances to the next step.
      if (msg.toLowerCase().includes("already locked") || msg.toLowerCase().includes("already exists")) {
        toast.info("Escrow already locked — refreshing…");
        refetch();
        return;
      }
      setLockError(msg);
      toast.error(msg);
    } finally {
      setLockLoading(false);
      setLockStep(null);
    }
  };

  // Seller: (1) sign releaseEscrow on-chain → USDT moves to buyer → (2) tell server
  const handleRelease = async () => {
    if (!order.escrowId) { toast.error("Missing escrow ID."); return; }
    setReleaseLoading(true);
    try {
      // Step 1: seller signs releaseEscrow() — this is the tx that actually moves USDT
      toast.info("Opening wallet — sign the release transaction to send USDT to buyer.");
      const txHash = await releaseEscrow(order.escrowId);
      setReleaseTxHash(txHash);

      // Step 2: server reads escrow.released on-chain to verify, then sets status = 2
      toast.info("Blockchain confirmed — recording trade completion…");
      await confirmPayment(order.id, {
        method: "PATCH",
        body: JSON.stringify({ txHash }),
        headers: { "Content-Type": "application/json" },
      } as RequestInit);

      toast.success("USDT released to buyer! Trade complete. 🎉");
      refetch();
    } catch (err: any) {
      const msg =
        err?.data?.error ??
        err?.reason ??
        err?.message ??
        "Release failed — please try again.";
      toast.error(msg);
    } finally {
      setReleaseLoading(false);
    }
  };

  const handleOpenDispute = () => {
    if (!disputeReason) { toast.error("Please describe the issue."); return; }
    openDisputeMutation.mutate({ id: order.id, data: { reason: disputeReason } }, {
      onSuccess: () => { toast.success("Dispute opened. Admin will review."); setDisputeOpen(false); refetch(); },
      onError: (e: any) => toast.error((e as any)?.data?.error ?? (e as any)?.message ?? "Failed"),
    });
  };

  const copyText = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied!"); };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="border-b border-border/40">
        <div className="container mx-auto px-4 py-4 max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/orders" className="text-muted-foreground hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">Order #{order.id.slice(0, 8)}…</span>
                <Badge variant="outline" className={`${statusInfo.color} border text-xs`}>
                  {statusInfo.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(order.createdAt), "dd MMM yyyy 'at' HH:mm")}
              </p>
            </div>
          </div>

          {(order.status === 0 || order.status === 1) && (
            <Button
              variant="outline"
              size="sm"
              className="border-red-500/40 text-red-500 hover:bg-red-500/10 text-xs"
              onClick={() => setDisputeOpen(true)}
            >
              <FileWarning className="w-3.5 h-3.5 mr-1" /> Dispute
            </Button>
          )}
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── LEFT: Trade info + timer ────────────────────────────── */}
          <div className="lg:col-span-3 space-y-4">

            {/* Timer card */}
            {order.status <= 1 && (
              <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-4">
                <CircleTimer
                  mins={countdown.mins}
                  secs={countdown.secs}
                  progress={countdown.progress}
                  expired={countdown.expired}
                />
                <p className="text-xs text-center text-muted-foreground max-w-xs">
                  {isBuyer
                    ? "Complete your bank transfer before the timer expires."
                    : "Waiting for the buyer to send payment."}
                </p>
              </div>
            )}

            {/* Trade amount */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span className="font-semibold text-white text-sm">Escrow Details</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Amount</span>
                  <span className="text-2xl font-black text-white">{Number(order.amountUsdt).toFixed(2)}</span>
                  <span className="text-sm text-primary ml-1">USDT</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Rate</span>
                  <span className="text-xl font-black text-white">₦{(order.priceNaira ?? 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Total NGN</span>
                  <span className="text-xl font-black text-primary">₦{totalNaira.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Steps */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <span className="font-semibold text-white text-sm block">Trade Steps</span>
              <Step n={1} label="Buyer sends bank transfer" done={order.status >= 1} active={order.status === 0} />
              <div className="ml-4 w-px h-4 bg-border" />
              <Step n={2} label="Seller releases USDT from escrow" done={order.status >= 2} active={order.status === 1} />
            </div>

            {/* Bank details (buyer view, status 0) */}
            {isBuyer && order.status <= 1 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <span className="font-semibold text-white text-sm block mb-4">Seller Bank Details</span>
                <div className="space-y-3">
                  {[
                    { label: "Bank", value: (order.seller as any)?.bankName || "—" },
                    { label: "Account No.", value: (order.seller as any)?.accountNumber || "—", copy: true },
                    { label: "Account Name", value: (order.seller as any)?.accountName || "—" },
                  ].map(({ label, value, copy }) => (
                    <div key={label} className="flex justify-between items-center py-2 border-b border-border/40 last:border-0">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white font-mono">{value}</span>
                        {copy && (
                          <button onClick={() => copyText(value)} className="text-primary hover:text-primary/80">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs text-muted-foreground">
                  Send exactly <span className="text-primary font-bold">₦{totalNaira.toLocaleString()}</span> to the account above, then tap "I Have Paid".
                </div>
              </div>
            )}

            {/* Seller: check bank warning */}
            {isSeller && order.status === 1 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-400">
                  Check your bank account before releasing. Only confirm if you received{" "}
                  <strong>₦{totalNaira.toLocaleString()}</strong>.
                </p>
              </div>
            )}

            {/* Completed */}
            {order.status === 2 && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex flex-col gap-2">
                <div className="flex gap-3 items-center">
                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <p className="text-sm text-green-400 font-semibold">
                    {isBuyer ? "Trade complete — USDT has been sent to your wallet." : "Trade complete — USDT released to buyer."}
                  </p>
                </div>
                {(releaseTxHash ?? order.contractTx) && (
                  <a
                    href={`https://bscscan.com/tx/${releaseTxHash ?? order.contractTx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline underline-offset-2 hover:text-primary/80 ml-8 font-mono break-all"
                  >
                    View release tx on BSCScan ↗
                  </a>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: Chat + actions ───────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Counterparty */}
            <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                {counterparty?.name?.charAt(0).toUpperCase() || "U"}
              </div>
              <div>
                <div className="font-semibold text-white text-sm">{counterparty?.name || "Unknown"}</div>
                <div className="text-xs text-muted-foreground">{isBuyer ? "Seller" : "Buyer"}</div>
              </div>
            </div>

            {/* Chat feed */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
                <MessageSquare className="w-4 h-4 text-primary" />
                <span className="font-semibold text-white text-sm">Trade Chat</span>
              </div>
              <ChatFeed order={order} isBuyer={isBuyer} />
            </div>

            {/* Action buttons */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">

              {/* ── SELLER: status=0, escrow NOT yet locked ── */}
              {isSeller && order.status === 0 && !order.contractTx && (
                <>
                  <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-400 text-center">
                    <AlertCircle className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                    Lock your USDT in escrow so the buyer can safely send payment.
                  </div>

                  {/* Step indicators while locking */}
                  {lockLoading && (
                    <div className="space-y-2 px-1">
                      <div className={`flex items-center gap-2 text-xs ${lockStep === "approving" ? "text-primary" : lockStep === "locking" ? "text-green-400" : "text-muted-foreground"}`}>
                        {lockStep === "approving" ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Step 1 — Approve USDT spend in wallet
                      </div>
                      <div className={`flex items-center gap-2 text-xs ${lockStep === "locking" ? "text-primary" : "text-muted-foreground"}`}>
                        {lockStep === "locking" ? <Loader2 className="w-3 h-3 animate-spin" /> : <div className="w-3 h-3 rounded-full border border-muted-foreground/40" />}
                        Step 2 — Lock USDT in escrow contract
                      </div>
                    </div>
                  )}

                  <Button
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-black font-bold text-base"
                    onClick={handleLockEscrow}
                    disabled={lockLoading}
                  >
                    {lockLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {lockLoading
                      ? lockStep === "approving" ? "Approving USDT…" : "Locking in Escrow…"
                      : `Lock ${Number(order.amountUsdt).toFixed(2)} USDT in Escrow`}
                  </Button>

                  {/* Show TX hash as soon as it lands */}
                  {lockTxHash && (
                    <a
                      href={`https://bscscan.com/tx/${lockTxHash}`}
                      target="_blank" rel="noopener noreferrer"
                      className="block text-xs text-primary underline underline-offset-2 font-mono break-all text-center"
                    >
                      Locking TX: {lockTxHash.slice(0, 20)}…{lockTxHash.slice(-8)} ↗
                    </a>
                  )}

                  {/* Show full error — never hide it */}
                  {lockError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 break-words">
                      <AlertCircle className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                      {lockError}
                    </div>
                  )}
                </>
              )}

              {/* ── SELLER: status=0, escrow locked, waiting for buyer ── */}
              {isSeller && order.status === 0 && order.contractTx && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-xs text-green-400 text-center space-y-1">
                  <div><CheckCircle2 className="w-4 h-4 inline mr-1 mb-0.5" />USDT locked in escrow. Waiting for buyer to send payment…</div>
                  <a href={`https://bscscan.com/tx/${order.contractTx}`} target="_blank" rel="noopener noreferrer"
                    className="block text-primary underline underline-offset-2 font-mono break-all">
                    View lock tx on BSCScan ↗
                  </a>
                </div>
              )}

              {/* ── BUYER: status=0, escrow NOT locked yet ── */}
              {isBuyer && order.status === 0 && !order.contractTx && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-400 text-center">
                  <Clock className="w-4 h-4 inline mr-1 mb-0.5" />
                  Waiting for the seller to lock USDT in escrow…
                </div>
              )}

              {/* ── BUYER: status=0, escrow locked → can now pay ── */}
              {isBuyer && order.status === 0 && order.contractTx && (
                <Button
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-black font-bold text-base"
                  onClick={handleMarkPaid}
                  disabled={markPaidMutation.isPending}
                >
                  {markPaidMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  I Have Paid
                </Button>
              )}

              {/* ── BUYER: status=1, waiting for seller to release ── */}
              {isBuyer && order.status === 1 && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs text-yellow-400 text-center">
                  <Clock className="w-4 h-4 inline mr-1 mb-0.5" />
                  Payment submitted. Waiting for seller to verify & release USDT.
                </div>
              )}

              {/* ── SELLER: status=1, release button ── */}
              {isSeller && order.status === 1 && (
                <>
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-400 text-center">
                    <AlertCircle className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                    Buyer has marked payment as sent. Verify your bank before releasing.
                  </div>
                  <Button
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-black font-bold text-base"
                    onClick={handleRelease}
                    disabled={releaseLoading}
                  >
                    {releaseLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {releaseLoading ? "Waiting for wallet…" : "Confirm Payment & Release USDT"}
                  </Button>
                </>
              )}

              {(order.status === 0 || order.status === 1) && (
                <Button
                  variant="outline"
                  className="w-full h-10 border-red-500/30 text-red-500 hover:bg-red-500/10 text-sm"
                  onClick={() => setDisputeOpen(true)}
                >
                  <FileWarning className="w-4 h-4 mr-2" /> Cancel Trade / Open Dispute
                </Button>
              )}

              {/* ── COMPLETED ── */}
              {order.status === 2 && (
                <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-center space-y-1.5">
                  <CheckCircle2 className="w-5 h-5 text-green-400 mx-auto" />
                  <p className="text-sm font-bold text-green-400">Already Settled</p>
                  <p className="text-xs text-muted-foreground">This trade is complete. USDT has been released to the buyer.</p>
                </div>
              )}

              {/* ── CANCELLED ── */}
              {order.status === 3 && (
                <div className="p-4 bg-muted/10 border border-border rounded-xl text-center space-y-1.5">
                  <p className="text-sm font-bold text-muted-foreground">Trade Cancelled</p>
                  <p className="text-xs text-muted-foreground">This order was cancelled before completion.</p>
                </div>
              )}

              {/* ── DISPUTED ── */}
              {order.status === 4 && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-center space-y-1.5">
                  <AlertCircle className="w-5 h-5 text-red-400 mx-auto" />
                  <p className="text-sm font-bold text-red-400">Under Dispute</p>
                  <p className="text-xs text-muted-foreground">An admin is reviewing this trade. You will be notified of the outcome.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Dispute dialog ───────────────────────────────────────────── */}
      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-500 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Open Dispute
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              This halts the trade. An admin will review both sides. Describe your issue clearly.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <Textarea
              placeholder="E.g. I sent payment but seller isn't releasing, or buyer marked paid but I didn't receive money."
              className="bg-background border-border min-h-[100px] text-sm"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeOpen(false)} className="border-border">
              Cancel
            </Button>
            <Button
              onClick={handleOpenDispute}
              className="bg-red-600 text-white hover:bg-red-700 font-bold"
              disabled={openDisputeMutation.isPending || !disputeReason}
            >
              {openDisputeMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
