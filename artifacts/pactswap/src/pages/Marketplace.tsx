import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ethers } from "ethers";
import { useListOffers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Search, Star, ShieldCheck, ArrowDownUp, ExternalLink, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { createEscrow } from "@/lib/contract";

/** Hard cap while testing on mainnet with real funds */
const MAX_TEST_USDT = 1;

export default function Marketplace() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [amountFilter, setAmountFilter] = useState("");
  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<any>(null);
  const [buyAmount, setBuyAmount] = useState("");
  const [isBlockchainPending, setIsBlockchainPending] = useState(false);

  const { user, token } = useAuth();

  const { data, isLoading } = useListOffers();

  const handleBuyClick = (offer: any) => {
    if (!token) {
      setLocation("/login");
      return;
    }
    setSelectedOffer(offer);
    setBuyAmount("");
    setBuyDialogOpen(true);
  };

  const handleConfirmBuy = async () => {
    const amountNum = parseFloat(buyAmount);
    if (!buyAmount || isNaN(amountNum)) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (amountNum > MAX_TEST_USDT) {
      toast.error(`Test limit is ${MAX_TEST_USDT} USDT — start small, verify it works`);
      return;
    }
    if (amountNum < selectedOffer.minTrade || amountNum > selectedOffer.maxTrade) {
      toast.error(`Amount must be between ${selectedOffer.minTrade} and ${selectedOffer.maxTrade} USDT`);
      return;
    }
    if (amountNum > selectedOffer.amountUsdt) {
      toast.error(`Maximum available is ${selectedOffer.amountUsdt} USDT`);
      return;
    }

    // Step 1 — get email from logged-in user
    const email = user?.email;
    if (!email) {
      alert("Please login");
      return;
    }

    // Step 2 — get sellerAddress from selected offer
    const sellerAddress = selectedOffer.seller?.walletAddress;
    if (!sellerAddress) {
      toast.error("Seller address not found");
      return;
    }

    setIsBlockchainPending(true);
    try {
      // Step 3 — approve USDT then createEscrow on-chain; get txHash from receipt
      const escrowId = ethers.id(crypto.randomUUID());
      const txHash = await createEscrow({
        escrowId,
        sellerAddress,
        amountUsdt: buyAmount,
      });

      // Step 4 — POST to /api/orders (auth token attached automatically by customFetch)
      const payload = { email, amount: amountNum, token: "USDT", sellerAddress, txHash };
      console.log("POST /api/orders payload:", payload);

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to create order");
        return;
      }

      toast.success("Order created successfully!");
      setBuyDialogOpen(false);
      setLocation(`/orders/${data.orderId}`);
    } catch (err: any) {
      const msg = err?.data?.error ?? err?.message ?? "Transaction failed";
      toast.error(msg);
    } finally {
      setIsBlockchainPending(false);
    }
  };

  const kycBadge = (level: number) => {
    switch(level) {
      case 3: return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20"><ShieldCheck className="w-3 h-3 mr-1"/> Fully Verified</Badge>;
      case 2: return <Badge variant="outline" className="bg-slate-300/10 text-slate-300 border-slate-300/20"><ShieldCheck className="w-3 h-3 mr-1"/> Verified</Badge>;
      case 1: return <Badge variant="outline" className="bg-amber-700/10 text-amber-700 border-amber-700/20"><ShieldCheck className="w-3 h-3 mr-1"/> Basic</Badge>;
      default: return <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Unverified</Badge>;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Marketplace</h1>
          <p className="text-muted-foreground mt-1">Buy USDT securely via PACTSWAP Escrow.</p>
        </div>
        
        <div className="flex w-full md:w-auto items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Filter by amount..." 
              value={amountFilter}
              onChange={(e) => setAmountFilter(e.target.value)}
              className="pl-9 bg-card border-border"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : data?.offers && data.offers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.offers.map((offer) => (
            <Card key={offer.id} className="bg-card border-border hover:border-primary/30 transition-colors shadow-md overflow-hidden flex flex-col group">
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                        {offer.seller?.name?.charAt(0).toUpperCase() || 'S'}
                      </div>
                      <div>
                        <Link href={`/users/${offer.seller?.walletAddress}`} className="font-semibold text-white hover:text-primary transition-colors">
                          {offer.seller?.name || 'Unknown Seller'}
                        </Link>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <span className="flex items-center text-primary mr-2"><Star className="w-3 h-3 fill-primary mr-0.5" /> {offer.seller?.rating?.toFixed(1) || '5.0'}</span>
                          <span>{offer.seller?.tradeCount || 0} trades</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {kycBadge(offer.seller?.kycLevel || 0)}
                </div>
              </CardHeader>
              <CardContent className="pt-4 pb-2 flex-1">
                <div className="flex justify-between items-end mb-4">
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">Price</span>
                    <span className="text-2xl font-black text-white">₦{offer.priceNaira.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-sm text-muted-foreground">Available</span>
                    <span className="text-lg font-bold text-white">{offer.amountUsdt} USDT</span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-sm py-2 px-3 bg-muted/30 rounded-md">
                  <span className="text-muted-foreground">Limits</span>
                  <span className="font-medium text-white">{offer.minTrade} - {offer.maxTrade} USDT</span>
                </div>
              </CardContent>
              <CardFooter className="pt-2 pb-4">
                <Button 
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold group-hover:shadow-[0_0_15px_rgba(245,194,66,0.3)] transition-all"
                  onClick={() => handleBuyClick(offer)}
                >
                  Buy USDT
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border border-dashed rounded-xl p-16 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted text-muted-foreground mb-4">
            <Search className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No offers found</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">There are currently no active sell offers matching your criteria.</p>
        </div>
      )}

      {/* Buy Dialog */}
      <Dialog open={buyDialogOpen} onOpenChange={setBuyDialogOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">Buy USDT</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Enter the amount of USDT you want to buy. Funds will be secured in PACTSWAP Escrow.
            </DialogDescription>
          </DialogHeader>
          
          {selectedOffer && (
            <div className="py-4 space-y-6">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Rate</span>
                  <span className="font-medium text-white">₦{selectedOffer.priceNaira.toLocaleString()} / USDT</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">Available limits</span>
                  <span className="font-medium text-white">{selectedOffer.minTrade} - {Math.min(selectedOffer.maxTrade, selectedOffer.amountUsdt)} USDT</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-white">I want to buy (USDT)</label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={buyAmount}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v > MAX_TEST_USDT) {
                          setBuyAmount(MAX_TEST_USDT.toString());
                        } else {
                          setBuyAmount(e.target.value);
                        }
                      }}
                      placeholder="0.00"
                      min={0}
                      max={MAX_TEST_USDT}
                      className="pr-16 bg-background border-border text-lg h-12"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <span className="text-primary font-bold">USDT</span>
                    </div>
                  </div>
                  <div className="flex justify-between mt-1 items-center">
                    <span className="text-xs text-amber-400 font-medium">
                      ⚠ Test cap: {MAX_TEST_USDT} USDT max
                    </span>
                    <button 
                      className="text-xs text-primary hover:underline"
                      onClick={() => setBuyAmount(Math.min(selectedOffer.maxTrade, selectedOffer.amountUsdt, MAX_TEST_USDT).toString())}
                    >
                      Max
                    </button>
                  </div>
                </div>
                
                <div className="flex justify-center text-muted-foreground py-2">
                  <ArrowDownUp className="w-5 h-5" />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-white">I will pay (NGN)</label>
                  <div className="relative">
                    <Input
                      type="text"
                      readOnly
                      value={buyAmount ? (parseFloat(buyAmount) * selectedOffer.priceNaira).toLocaleString() : "0"}
                      className="pr-16 bg-muted border-border text-lg h-12 text-white font-medium"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <span className="text-muted-foreground font-bold">NGN</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Trust indicators */}
          <div className="mx-1 mb-2 flex items-center justify-center gap-3 text-xs text-muted-foreground">
            <a
              href="https://bscscan.com/address/0xCf9Fd90861085135f8661C29127A1F8F9ccA4061#code"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-green-400 transition-colors"
            >
              <span>✅ Verified on BSCScan</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
            <span className="text-border">|</span>
            <span className="inline-flex items-center gap-1">
              🔒 Escrow Contract
            </span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBuyDialogOpen(false)} className="border-border">
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmBuy} 
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
              disabled={!buyAmount || parseFloat(buyAmount) <= 0 || isBlockchainPending}
            >
              {isBlockchainPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Open Trade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}