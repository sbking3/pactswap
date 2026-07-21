import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ethers } from "ethers";
import { useListOffers } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Search, Star, ShieldCheck, ArrowDownUp, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { createEscrow } from "@/lib/contract";

const MAX_TEST_USDT = 1;

function MerchantAvatar({ name }: { name?: string }) {
  const letter = name?.charAt(0).toUpperCase() || "S";
  return (
    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
      {letter}
    </div>
  );
}

function kycLabel(level: number) {
  if (level >= 3) return <span className="text-[10px] text-primary font-medium flex items-center gap-0.5"><ShieldCheck className="w-3 h-3" /> Verified</span>;
  if (level === 2) return <span className="text-[10px] text-slate-400 font-medium flex items-center gap-0.5"><ShieldCheck className="w-3 h-3" /> KYC2</span>;
  return null;
}

export default function Marketplace() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amountFilter, setAmountFilter] = useState("");
  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<any>(null);
  const [buyAmount, setBuyAmount] = useState("");
  const [tradeStep, setTradeStep] = useState<
    "idle" | "approving" | "signing" | "verifying" | "saving"
  >("idle");

  const tradeStepLabel: Record<typeof tradeStep, string> = {
    idle:      "Open Trade",
    approving: "Step 1/3 — Approve USDT…",
    signing:   "Step 2/3 — Sign Escrow…",
    verifying: "Step 3/3 — Verifying on-chain…",
    saving:    "Saving trade…",
  };
  const isBlockchainPending = tradeStep !== "idle";

  const { user, token } = useAuth();
  const { data, isLoading } = useListOffers();

  const handleBuyClick = (offer: any) => {
    if (!token) { setLocation("/login"); return; }
    setSelectedOffer(offer);
    setBuyAmount("");
    setBuyDialogOpen(true);
  };

  const handleConfirmBuy = async () => {
    const amountNum = parseFloat(buyAmount);
    if (!buyAmount || isNaN(amountNum)) { toast.error("Please enter a valid amount"); return; }
    if (amountNum > MAX_TEST_USDT) { toast.error(`Test limit is ${MAX_TEST_USDT} USDT`); return; }
    if (amountNum < selectedOffer.minTrade || amountNum > selectedOffer.maxTrade) {
      toast.error(`Amount must be between ${selectedOffer.minTrade} and ${selectedOffer.maxTrade} USDT`); return;
    }
    if (amountNum > selectedOffer.amountUsdt) { toast.error(`Max available: ${selectedOffer.amountUsdt} USDT`); return; }

    const email = user?.email;
    if (!email) { alert("Please login"); return; }

    const sellerAddress = selectedOffer.seller?.walletAddress;
    if (!sellerAddress) { toast.error("Seller address not found"); return; }

    setTradeStep("approving");
    try {
      const escrowId = ethers.id(crypto.randomUUID());

      // User's wallet signs two transactions (approve + createEscrow).
      // Server never signs anything — it only reads the on-chain state afterwards.
      const txHash = await createEscrow({
        escrowId,
        sellerAddress,
        amountUsdt: buyAmount,
        onStep: (step) => setTradeStep(step),
      });

      setTradeStep("saving");
      const payload = { email, amount: amountNum, token: "USDT", sellerAddress, txHash, escrowId };
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const resData = await res.json();
      if (!res.ok) { toast.error(resData?.error ?? "Failed to create order"); return; }

      toast.success("Trade opened successfully!");
      setBuyDialogOpen(false);
      setLocation(`/orders/${resData.orderId}`);
    } catch (err: any) {
      const msg = err?.reason ?? err?.message ?? "Transaction failed or rejected";
      toast.error(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
    } finally {
      setTradeStep("idle");
    }
  };

  const offers = data?.offers ?? [];
  const filtered = amountFilter
    ? offers.filter((o: any) => o.minTrade <= parseFloat(amountFilter) && parseFloat(amountFilter) <= o.maxTrade)
    : offers;

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="border-b border-border/40">
        <div className="container mx-auto px-4 py-5 max-w-7xl">
          <h1 className="text-2xl font-bold text-white mb-1">P2P Trading</h1>
          <p className="text-sm text-muted-foreground">Buy and sell USDT securely via on-chain escrow</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* ── Buy / Sell tabs ──────────────────────────────────────────── */}
        <div className="flex items-center gap-1 mb-6">
          <button
            onClick={() => setTab("buy")}
            className={`px-6 py-2 rounded font-semibold text-sm transition-colors ${
              tab === "buy"
                ? "bg-primary text-black"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => setTab("sell")}
            className={`px-6 py-2 rounded font-semibold text-sm transition-colors ${
              tab === "sell"
                ? "bg-primary text-black"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            Sell
          </button>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Amount..."
                value={amountFilter}
                onChange={(e) => setAmountFilter(e.target.value)}
                className="pl-9 h-9 w-44 bg-card border-border text-sm"
              />
            </div>
            <div className="px-3 h-9 flex items-center bg-card border border-border rounded text-sm text-muted-foreground">NGN</div>
          </div>
        </div>

        {/* ── Table ────────────────────────────────────────────────────── */}
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
                      {/* Merchant */}
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
                              {kycLabel(offer.seller?.kycLevel ?? 0)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Price */}
                      <td className="px-6 py-4">
                        <span className="text-xl font-black text-primary">
                          ₦{offer.priceNaira.toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground block">per USDT</span>
                      </td>

                      {/* Limit / Available */}
                      <td className="px-6 py-4">
                        <div className="text-sm text-white font-medium">
                          {offer.minTrade} – {offer.maxTrade} USDT
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {offer.amountUsdt} USDT available
                        </div>
                      </td>

                      {/* Payment */}
                      <td className="px-6 py-4">
                        <Badge className="bg-muted/40 text-white border-border text-xs font-normal">
                          Bank Transfer
                        </Badge>
                      </td>

                      {/* Trade */}
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
                    <span>Limit: {offer.minTrade}–{offer.maxTrade} USDT</span>
                    <span>Available: {offer.amountUsdt} USDT</span>
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

      {/* ── Buy dialog ───────────────────────────────────────────────── */}
      <Dialog open={buyDialogOpen} onOpenChange={setBuyDialogOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">Buy USDT</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Funds are locked in PACTSWAP smart contract escrow until the trade completes.
            </DialogDescription>
          </DialogHeader>

          {selectedOffer && (
            <div className="py-2 space-y-5">
              {/* Offer summary */}
              <div className="flex items-center gap-3 p-3 bg-background border border-border rounded-lg">
                <MerchantAvatar name={selectedOffer.seller?.name} />
                <div className="flex-1">
                  <div className="font-semibold text-white text-sm">{selectedOffer.seller?.name}</div>
                  <div className="flex items-center gap-1 text-xs text-primary">
                    <Star className="w-3 h-3 fill-primary" />
                    {selectedOffer.seller?.rating?.toFixed(1) ?? "5.0"}
                    <span className="text-muted-foreground ml-1">{selectedOffer.seller?.tradeCount ?? 0} orders</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-primary">₦{selectedOffer.priceNaira.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">per USDT</div>
                </div>
              </div>

              {/* Amount inputs */}
              <div className="space-y-2">
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
                        setBuyAmount(!isNaN(v) && v > MAX_TEST_USDT ? MAX_TEST_USDT.toString() : e.target.value);
                      }}
                      placeholder="0.00"
                      min={0}
                      max={MAX_TEST_USDT}
                      className="pr-20 bg-background border-border text-lg h-12 font-bold"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 gap-1">
                      <button
                        className="text-[11px] text-primary border border-primary/30 rounded px-1 hover:bg-primary/10"
                        onClick={() => setBuyAmount(Math.min(selectedOffer.maxTrade, selectedOffer.amountUsdt, MAX_TEST_USDT).toString())}
                      >Max</button>
                      <span className="text-primary font-bold text-sm">USDT</span>
                    </div>
                  </div>
                  <p className="text-xs text-amber-400">⚠ Test cap: {MAX_TEST_USDT} USDT max on mainnet</p>
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
                      value={buyAmount ? (parseFloat(buyAmount) * selectedOffer.priceNaira).toLocaleString() : "0"}
                      className="pr-16 bg-muted/30 border-border text-lg h-12 font-bold text-white"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                      <span className="text-muted-foreground font-bold text-sm">NGN</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trust badge — dark themed */}
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-primary font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <a
                    href="https://bscscan.com/address/0xCf9Fd90861085135f8661C29127A1F8F9ccA4061"
                    target="_blank" rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    Verified on BSCScan
                  </a>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  Contract: 0xCf9F...A4061 · 2.5% fee on completion only
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBuyDialogOpen(false)} className="border-border">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmBuy}
              className="bg-primary text-black hover:bg-primary/90 font-bold"
              disabled={!buyAmount || parseFloat(buyAmount) <= 0 || isBlockchainPending}
            >
              {isBlockchainPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {tradeStepLabel[tradeStep]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
