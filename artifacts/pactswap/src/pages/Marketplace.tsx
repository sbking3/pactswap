import { apiUrl } from "@/lib/api";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ethers } from "ethers";
import { useListOffers } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2, Search, Star, ShieldCheck, ArrowDownUp,
  CheckCircle2, Wallet, Lock, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { approveUsdtForEscrow, openEscrowOnChain, CONTRACT_ADDRESS } from "@/lib/contract";
import { useWallet } from "@/hooks/useWallet";
import { WalletGuideModal } from "@/components/WalletGuideModal";

const USDT_MIN = 5;
const USDT_MAX = 10000;

// ── Phase types ───────────────────────────────────────────────────────────────
type DialogPhase =
  | "input"      // Enter amount
  | "approving"  // Wallet popup: approve USDT
  | "approved"   // Approval done, waiting for user to click Open Trade
  | "opening"    // Wallet popup: createEscrow
  | "saving";    // Saving to backend

// ── Small helpers ─────────────────────────────────────────────────────────────
function MerchantAvatar({ name }: { name?: string }) {
  const letter = name?.charAt(0).toUpperCase() || "S";
  return (
    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
      {letter}
    </div>
  );
}

// ── Step indicator inside dialog ──────────────────────────────────────────────
function DialogStep({
  n, label, state,
}: { n: number; label: string; state: "done" | "active" | "pending" }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
        state === "done"    ? "bg-green-500 text-white" :
        state === "active"  ? "bg-primary text-black" :
        "bg-muted/40 text-muted-foreground border border-border"
      }`}>
        {state === "done" ? <CheckCircle2 className="w-3.5 h-3.5" /> : n}
      </div>
      <span className={`text-sm ${
        state === "done" ? "text-green-400 line-through" :
        state === "active" ? "text-white font-semibold" :
        "text-muted-foreground"
      }`}>{label}</span>
      {state === "active" && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary ml-auto" />}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Marketplace() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amountFilter, setAmountFilter] = useState("");

  // Dialog state
  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<any>(null);
  const [buyAmount, setBuyAmount] = useState("");
  const [dialogPhase, setDialogPhase] = useState<DialogPhase>("input");
  const [pendingEscrowId, setPendingEscrowId] = useState<string | null>(null);
  const [buyerLoading, setBuyerLoading] = useState(false);

  const isBusy = dialogPhase !== "input" && dialogPhase !== "approved";

  const { user, token } = useAuth();
  const { data, isLoading, refetch } = useListOffers(
    undefined,
    { query: { queryKey: ["offers"], refetchInterval: 15_000, staleTime: 0 } },
  );

  // Wallet state — used to determine buyer vs seller role in the dialog
  const { address, isConnected, isConnecting, connectWallet, showWalletGuide, setShowWalletGuide } = useWallet();

  // Is the connected wallet the seller of the selected offer?
  const isSeller =
    !!address &&
    !!selectedOffer?.seller?.walletAddress &&
    address.toLowerCase() === selectedOffer.seller.walletAddress.toLowerCase();

  // ── Open dialog ──────────────────────────────────────────────────────────────
  const handleBuyClick = (offer: any) => {
    if (!token) { setLocation("/login"); return; }
    setSelectedOffer(offer);
    // Pre-fill max allowed amount so buyer can confirm in one click
    const prefill = Math.min(offer.maxTrade, offer.amountUsdt, USDT_MAX);
    setBuyAmount(prefill > 0 ? prefill.toString() : "");
    setDialogPhase("input");
    setPendingEscrowId(null);
    setBuyDialogOpen(true);
  };

  const handleDialogClose = () => {
    if (isBusy || buyerLoading) return; // prevent closing while wallet is open
    setBuyDialogOpen(false);
    setDialogPhase("input");
    setPendingEscrowId(null);
  };

  // ── Validate amount fields ────────────────────────────────────────────────────
  function validateAmount(amountNum: number): boolean {
    if (!buyAmount || isNaN(amountNum)) { toast.error("Please enter a valid amount"); return false; }
    if (amountNum < USDT_MIN) { toast.error(`Minimum buy amount is $${USDT_MIN} USDT`); return false; }
    if (amountNum > USDT_MAX) { toast.error(`Maximum trade is ${USDT_MAX.toLocaleString()} USDT`); return false; }
    if (amountNum < selectedOffer.minTrade || amountNum > selectedOffer.maxTrade) {
      toast.error(`Amount must be ${selectedOffer.minTrade}–${selectedOffer.maxTrade} USDT`); return false;
    }
    if (amountNum > selectedOffer.amountUsdt) {
      toast.error(`Only ${parseFloat(selectedOffer.amountUsdt).toFixed(2)} USDT available`); return false;
    }
    return true;
  }

  // ── BUYER flow: create order without wallet interaction ───────────────────────
  const handleBuyerInitiate = async () => {
    const amountNum = parseFloat(buyAmount);
    if (!validateAmount(amountNum)) return;
    if (!user?.email || !selectedOffer) return;
    if (!selectedOffer.seller?.walletAddress) { toast.error("Seller address not found"); return; }

    setBuyerLoading(true);
    try {
      // Generate a client-side escrowId for the DB record.
      // The seller will lock USDT on-chain using this same ID from the order detail page.
      const escrowId = ethers.id(crypto.randomUUID());

      const res = await fetch(apiUrl("/api/orders/initiate"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          escrowId,
          offerId: selectedOffer.id,
          amount: amountNum,
          sellerAddress: selectedOffer.seller.walletAddress,
          priceNaira: selectedOffer.priceNaira,
          token: "USDT",
          email: user.email,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to create trade");
        return;
      }

      toast.success("Trade created! Send payment to the seller's bank.");
      setBuyDialogOpen(false);
      setDialogPhase("input");
      setLocation(`/orders/${data.orderId}`);
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setBuyerLoading(false);
    }
  };

  // ── SELLER flow: STEP 1 — Approve USDT ───────────────────────────────────────
  const handleApproveUsdt = async () => {
    const amountNum = parseFloat(buyAmount);
    if (!validateAmount(amountNum)) return;
    if (!user?.email) { toast.error("Please log in first"); return; }
    if (!selectedOffer.seller?.walletAddress) { toast.error("Seller address not found"); return; }

    const newEscrowId = ethers.id(crypto.randomUUID());
    setPendingEscrowId(newEscrowId);
    setDialogPhase("approving");

    try {
      await approveUsdtForEscrow(buyAmount);
      setDialogPhase("approved");
      toast.success("USDT approved ✓ — now click Open Trade to lock funds in escrow.");
    } catch (err: any) {
      setDialogPhase("input");
      setPendingEscrowId(null);
      const msg = err?.reason ?? err?.message ?? "Approval was cancelled";
      toast.error((msg as string).slice(0, 120));
    }
  };

  // ── SELLER flow: STEP 2 — Open trade on-chain, then save to backend ──────────
  const handleOpenTrade = async () => {
    if (!pendingEscrowId || !selectedOffer || !user?.email) return;

    const amountNum = parseFloat(buyAmount);
    const sellerAddress = selectedOffer.seller?.walletAddress;

    setDialogPhase("opening");

    let txHash: string;
    try {
      txHash = await openEscrowOnChain({
        escrowId: pendingEscrowId,
        sellerAddress,
        amountUsdt: buyAmount,
      });
    } catch (err: any) {
      setDialogPhase("approved");
      const msg = err?.reason ?? err?.message ?? "Transaction rejected";
      toast.error((msg as string).slice(0, 120));
      return;
    }

    setDialogPhase("saving");
    try {
      const payload = {
        email: user.email,
        amount: amountNum,
        token: "USDT",
        sellerAddress,
        txHash,
        escrowId: pendingEscrowId,
        priceNaira: selectedOffer.priceNaira,
        offerId: selectedOffer.id,
      };

      const res = await fetch(apiUrl("/api/orders"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const resData = await res.json();

      if (!res.ok) {
        setDialogPhase("approved");
        toast.error(resData?.error ?? "Failed to save trade");
        return;
      }

      toast.success("Trade opened! USDT is locked in escrow.");
      setBuyDialogOpen(false);
      setDialogPhase("input");
      setLocation(`/orders/${resData.orderId}`);
    } catch {
      setDialogPhase("approved");
      toast.error("Network error — please try again");
    }
  };

  const offers = data?.offers ?? [];
  const filtered = amountFilter
    ? offers.filter((o: any) =>
        o.minTrade <= parseFloat(amountFilter) &&
        parseFloat(amountFilter) <= o.maxTrade
      )
    : offers;

  // Step states for the seller wallet dialog progress tracker
  const step1State = ((): "done" | "active" | "pending" => {
    if (dialogPhase === "input") return "pending";
    if (dialogPhase === "approving") return "active";
    return "done";
  })();
  const step2State = ((): "done" | "active" | "pending" => {
    if (dialogPhase === "input" || dialogPhase === "approving" || dialogPhase === "approved") return "pending";
    if (dialogPhase === "opening") return "active";
    return "done";
  })();

  // NGN total for selected amount
  const ngnTotal = buyAmount && selectedOffer
    ? (parseFloat(buyAmount) * selectedOffer.priceNaira).toLocaleString()
    : "0";

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <WalletGuideModal open={showWalletGuide} onClose={() => setShowWalletGuide(false)} />

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="border-b border-border/40">
        <div className="container mx-auto px-4 py-5 max-w-7xl">
          <h1 className="text-2xl font-bold text-white mb-1">P2P Trading</h1>
          <p className="text-sm text-muted-foreground">Buy and sell USDT securely via on-chain escrow</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* ── Buy / Sell tabs + filter ─────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          {/* Tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTab("buy")}
              className={`px-6 py-2 rounded font-semibold text-sm transition-colors ${
                tab === "buy" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setTab("sell")}
              className={`px-6 py-2 rounded font-semibold text-sm transition-colors ${
                tab === "sell" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"
              }`}
            >
              Sell
            </button>
          </div>
          {/* Search — full width on mobile, auto on desktop */}
          <div className="flex items-center gap-2 sm:ml-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Amount..."
                value={amountFilter}
                onChange={(e) => setAmountFilter(e.target.value)}
                className="pl-9 h-9 w-full sm:w-40 bg-card border-border text-sm"
              />
            </div>
            <div className="px-3 h-9 flex items-center bg-card border border-border rounded text-sm text-muted-foreground flex-shrink-0">NGN</div>
          </div>
        </div>

        {/* ── Table / cards ────────────────────────────────────────────── */}
        {tab === "sell" ? (
          <div className="bg-card border border-border rounded-xl p-16 text-center">
            <p className="text-muted-foreground">Sell orders coming soon. Post an offer to start selling.</p>
            {token && (
              <Button asChild className="mt-4 bg-primary text-black font-semibold">
                <Link href="/offers/create">Post Offer</Link>
              </Button>
            )}
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-xl p-16 text-center">
            <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">No offers found</h3>
            <p className="text-sm text-muted-foreground">No active sell offers right now. Check back soon.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-xl border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-card border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="px-6 py-3 text-left font-medium">Merchant</th>
                    <th className="px-6 py-3 text-left font-medium">Price</th>
                    <th className="px-6 py-3 text-left font-medium">Limit / Available</th>
                    <th className="px-6 py-3 text-left font-medium">Payment</th>
                    <th className="px-6 py-3 text-right font-medium">Trade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filtered.map((offer: any) => (
                    <tr key={offer.id} className="bg-[#0A0A0A] hover:bg-card/60 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <MerchantAvatar name={offer.seller?.name} />
                          <div>
                            <Link
                              href={`/users/${offer.seller?.walletAddress}`}
                              className="font-semibold text-white hover:text-primary transition-colors text-sm"
                            >
                              {offer.seller?.name || "Unknown"}
                            </Link>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="flex items-center text-xs text-primary gap-0.5">
                                <Star className="w-3 h-3 fill-primary" />
                                {offer.seller?.rating?.toFixed(1) ?? "5.0"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {offer.seller?.tradeCount ?? 0} orders
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xl font-black text-primary">₦{offer.priceNaira.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground block">per USDT</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-white font-medium">{parseFloat(offer.minTrade).toFixed(2)} – {parseFloat(offer.maxTrade).toFixed(2)} USDT</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{parseFloat(offer.amountUsdt).toFixed(2)} USDT available</div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge className="bg-muted/40 text-white border-border text-xs font-normal">
                          Bank Transfer
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          onClick={() => handleBuyClick(offer)}
                          className="bg-primary hover:bg-primary/90 text-black font-bold h-9 px-6 text-sm"
                        >
                          Buy USDT
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {filtered.map((offer: any) => (
                <div key={offer.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <MerchantAvatar name={offer.seller?.name} />
                      <div>
                        <div className="font-semibold text-white text-sm">{offer.seller?.name || "Unknown"}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="flex items-center text-xs text-primary gap-0.5">
                            <Star className="w-3 h-3 fill-primary" />
                            {offer.seller?.rating?.toFixed(1) ?? "5.0"}
                          </span>
                          <span className="text-xs text-muted-foreground">{offer.seller?.tradeCount ?? 0} orders</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-lg font-black text-primary">₦{offer.priceNaira.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-3">
                    <span>Limit: {parseFloat(offer.minTrade).toFixed(2)}–{parseFloat(offer.maxTrade).toFixed(2)} USDT</span>
                    <span>Available: {parseFloat(offer.amountUsdt).toFixed(2)} USDT</span>
                  </div>
                  <Button
                    onClick={() => handleBuyClick(offer)}
                    className="w-full bg-primary hover:bg-primary/90 text-black font-bold h-10"
                  >
                    Buy USDT
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Buy dialog ───────────────────────────────────────────────────────── */}
      <Dialog open={buyDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent
          className="bg-card border-border sm:max-w-md"
          onInteractOutside={(e) => { if (isBusy || buyerLoading) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (isBusy || buyerLoading) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle className="text-xl text-white">Buy USDT</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Funds lock in PACTSWAP smart-contract escrow until the trade completes.
            </DialogDescription>
          </DialogHeader>

          {selectedOffer && (
            <div className="py-2 space-y-4">

              {/* ── Merchant summary ── */}
              <div className="flex items-center gap-3 p-3 bg-background border border-border rounded-lg">
                <MerchantAvatar name={selectedOffer.seller?.name} />
                <div className="flex-1">
                  <div className="font-semibold text-white text-sm">{selectedOffer.seller?.name}</div>
                  <div className="flex items-center gap-1 text-xs text-primary">
                    <Star className="w-3 h-3 fill-primary" />
                    {selectedOffer.seller?.rating?.toFixed(1) ?? "5.0"}
                    <span className="text-muted-foreground ml-1">
                      {selectedOffer.seller?.tradeCount ?? 0} orders
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-primary">₦{selectedOffer.priceNaira.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">per USDT</div>
                </div>
              </div>

              {/* ── Wallet connection check ── */}
              {!isConnected && (
                <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-sm text-amber-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    Connect your wallet to verify your role
                  </p>
                  <Button size="sm" variant="outline" onClick={connectWallet}
                    disabled={isConnecting}
                    className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 ml-3 flex-shrink-0">
                    {isConnecting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Connecting…</> : "Connect"}
                  </Button>
                </div>
              )}

              {/* ── Amount inputs ── */}
              <div className={`space-y-2 transition-opacity ${(isBusy || buyerLoading) ? "opacity-50 pointer-events-none" : ""}`}>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    I want to buy
                  </label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={buyAmount}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setBuyAmount(!isNaN(v) && v > USDT_MAX ? USDT_MAX.toString() : e.target.value);
                      }}
                      placeholder="0.00"
                      min={USDT_MIN}
                      max={USDT_MAX}
                      className="pr-20 bg-background border-border text-lg h-12 font-bold"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 gap-1">
                      <button
                        className="text-[11px] text-primary border border-primary/30 rounded px-1 hover:bg-primary/10"
                        onClick={() => setBuyAmount(
                          Math.min(selectedOffer.maxTrade, selectedOffer.amountUsdt, USDT_MAX).toString()
                        )}
                      >
                        Max
                      </button>
                      <span className="text-primary font-bold text-sm">USDT</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Min: {USDT_MIN} USDT · Max: {USDT_MAX.toLocaleString()} USDT</p>
                </div>
                <div className="flex justify-center">
                  <ArrowDownUp className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    I will pay
                  </label>
                  <div className="relative">
                    <Input
                      readOnly
                      value={ngnTotal}
                      className="pr-16 bg-muted/30 border-border text-lg h-12 font-bold text-white"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                      <span className="text-muted-foreground font-bold text-sm">NGN</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Role-based steps section ── */}
              {isSeller ? (
                /* SELLER: wallet steps to lock USDT in escrow */
                <div className="bg-background border border-border rounded-lg p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Wallet Steps
                  </p>
                  <DialogStep n={1} label="Approve USDT spend in wallet" state={step1State} />
                  <div className="ml-3 w-px h-3 bg-border" />
                  <DialogStep n={2} label="Sign &amp; lock funds in escrow" state={step2State} />
                </div>
              ) : (
                /* BUYER: payment steps — no wallet interaction needed */
                <div className="bg-background border border-border rounded-lg p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Payment Steps
                  </p>
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      1
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Send <span className="text-white font-semibold">₦{ngnTotal} NGN</span> to the seller's bank account (shown on the trade page)
                    </p>
                  </div>
                  <div className="ml-2.5 w-px h-3 bg-border" />
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      2
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Tap <span className="text-white font-semibold">"I Have Paid"</span> on the trade page after your transfer is complete
                    </p>
                  </div>
                </div>
              )}

              {/* ── Seller: Approved success banner ── */}
              {isSeller && (dialogPhase === "approved" || dialogPhase === "opening" || dialogPhase === "saving") && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <p className="text-sm text-green-400 font-medium">
                    USDT approved — now lock {buyAmount} USDT in escrow to open the trade.
                  </p>
                </div>
              )}

              {/* ── Contract trust badge ── */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                <a
                  href={`https://bscscan.com/address/${CONTRACT_ADDRESS}`}
                  target="_blank" rel="noopener noreferrer"
                  className="underline underline-offset-2 text-primary"
                >
                  Verified escrow contract
                </a>
                <span>· 2.5% fee on release only</span>
              </div>
            </div>
          )}

          {/* ── Action buttons ── */}
          <div className="flex gap-2 pt-2">
            {/* Cancel */}
            {!isBusy && !buyerLoading && (
              <Button variant="outline" onClick={handleDialogClose} className="border-border flex-1">
                Cancel
              </Button>
            )}

            {isSeller ? (
              /* SELLER buttons: two-step wallet flow */
              <>
                {(dialogPhase === "input" || dialogPhase === "approving") && (
                  <Button
                    onClick={handleApproveUsdt}
                    disabled={!buyAmount || parseFloat(buyAmount) <= 0 || dialogPhase === "approving"}
                    className="bg-primary text-black hover:bg-primary/90 font-bold flex-1"
                  >
                    {dialogPhase === "approving" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    <Wallet className="w-4 h-4 mr-2" />
                    {dialogPhase === "approving" ? "Waiting for wallet…" : "Step 1 — Approve USDT"}
                  </Button>
                )}
                {(dialogPhase === "approved" || dialogPhase === "opening" || dialogPhase === "saving") && (
                  <Button
                    onClick={handleOpenTrade}
                    disabled={dialogPhase === "opening" || dialogPhase === "saving"}
                    className="bg-primary text-black hover:bg-primary/90 font-bold flex-1"
                  >
                    {(dialogPhase === "opening" || dialogPhase === "saving") && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    <Lock className="w-4 h-4 mr-2" />
                    {dialogPhase === "opening"
                      ? "Confirm in wallet…"
                      : dialogPhase === "saving"
                      ? "Saving trade…"
                      : "Step 2 — Open Trade"}
                  </Button>
                )}
              </>
            ) : (
              /* BUYER button: confirm trade without wallet */
              <Button
                onClick={handleBuyerInitiate}
                disabled={!buyAmount || parseFloat(buyAmount) <= 0 || buyerLoading}
                className="bg-primary text-black hover:bg-primary/90 font-bold flex-1"
              >
                {buyerLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {buyerLoading ? "Creating trade…" : "Confirm Trade"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
