import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateOffer, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Info, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function CreateOffer() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: userLoading } = useGetMe();
  const createOfferMutation = useCreateOffer();

  const [priceNaira, setPriceNaira] = useState("");
  const [amountUsdt, setAmountUsdt] = useState("");
  const [minTrade, setMinTrade] = useState("");
  const [maxTrade, setMaxTrade] = useState("");

  const isKycRestricted = user?.kycLevel === 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isKycRestricted) {
      toast.error("You must complete KYC Level 1 to create offers.");
      return;
    }

    const payload = {
      escrowId: `escrow_${Date.now()}`, // Simulated escrow creation
      priceNaira: parseFloat(priceNaira),
      amountUsdt: parseFloat(amountUsdt),
      minTrade: parseFloat(minTrade),
      maxTrade: parseFloat(maxTrade),
      paymentMethod: "Bank Transfer",
    };

    if (!payload.priceNaira || !payload.amountUsdt || !payload.minTrade || !payload.maxTrade) {
      toast.error("Please fill in all fields correctly.");
      return;
    }

    if (payload.amountUsdt < 1 || payload.amountUsdt > 10000) {
      toast.error("Total amount must be between 1 and 10,000 USDT.");
      return;
    }

    if (payload.minTrade < 1) {
      toast.error("Minimum trade must be at least 1 USDT.");
      return;
    }

    if (payload.minTrade > payload.maxTrade) {
      toast.error("Min trade cannot be greater than max trade.");
      return;
    }

    if (payload.maxTrade > payload.amountUsdt) {
      toast.error("Max trade cannot exceed total amount.");
      return;
    }

    if (payload.maxTrade > 10000) {
      toast.error("Max trade cannot exceed 10,000 USDT.");
      return;
    }

    createOfferMutation.mutate({ data: payload }, {
      onSuccess: () => {
        toast.success("Offer created and funds locked in escrow.");
        setLocation("/dashboard"); // or /offers/my if we build it
      },
      onError: (error) => {
        toast.error((error as any).error || "Failed to create offer");
      }
    });
  };

  if (userLoading) {
    return (
      <div className="flex-1 flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <Button variant="ghost" asChild className="mb-4 -ml-4 text-muted-foreground hover:text-white">
          <Link href="/dashboard"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard</Link>
        </Button>
        <h1 className="text-3xl font-bold text-white tracking-tight">Create Sell Offer</h1>
        <p className="text-muted-foreground mt-1">Lock your USDT in PACTSWAP Escrow to sell for Naira.</p>
      </div>

      {isKycRestricted && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-8 flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-amber-500 font-medium mb-1">KYC Required</h4>
            <p className="text-sm text-amber-500/80 mb-3">You need to complete at least KYC Level 1 to create sell offers on the marketplace.</p>
            <Button size="sm" asChild className="bg-amber-500 text-black hover:bg-amber-600 font-medium">
              <Link href="/kyc">Complete KYC Now</Link>
            </Button>
          </div>
        </div>
      )}

      <Card className="bg-card border-border shadow-lg">
        <form onSubmit={handleSubmit}>
          <CardContent className="pt-6 space-y-6">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex gap-3">
              <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <span className="text-primary font-medium block mb-1">How Escrow Works</span>
                When you create this offer, the specified USDT amount will be transferred from your wallet to the PACTSWAP smart contract. You can cancel the offer anytime to retrieve unsold funds.
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium text-white border-b border-border pb-2">Pricing & Amount</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Price per USDT (NGN)</Label>
                  <div className="relative">
                    <Input 
                      id="price" 
                      type="number" 
                      placeholder="e.g. 1500" 
                      value={priceNaira}
                      onChange={e => setPriceNaira(e.target.value)}
                      className="bg-background border-border pl-8"
                      disabled={isKycRestricted}
                    />
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">₦</div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="amount">Total Amount to Sell</Label>
                  <div className="relative">
                    <Input 
                      id="amount" 
                      type="number" 
                      placeholder="e.g. 1000" 
                      value={amountUsdt}
                      onChange={e => setAmountUsdt(e.target.value)}
                      className="bg-background border-border pr-16"
                      disabled={isKycRestricted}
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <span className="text-primary font-bold text-sm">USDT</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium text-white border-b border-border pb-2">Order Limits</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minTrade">Minimum Trade</Label>
                  <div className="relative">
                    <Input 
                      id="minTrade" 
                      type="number" 
                      placeholder="e.g. 10" 
                      value={minTrade}
                      onChange={e => setMinTrade(e.target.value)}
                      className="bg-background border-border pr-16"
                      disabled={isKycRestricted}
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <span className="text-muted-foreground text-sm">USDT</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="maxTrade">Maximum Trade</Label>
                  <div className="relative">
                    <Input 
                      id="maxTrade" 
                      type="number" 
                      placeholder="e.g. 500" 
                      value={maxTrade}
                      onChange={e => setMaxTrade(e.target.value)}
                      className="bg-background border-border pr-16"
                      disabled={isKycRestricted}
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <span className="text-muted-foreground text-sm">USDT</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {user?.bankName ? (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-white border-b border-border pb-2">Payment Details</h3>
                <div className="bg-background border border-border rounded-lg p-4">
                  <p className="text-sm text-muted-foreground mb-1">Buyers will send Naira to:</p>
                  <p className="text-white font-medium">{user.bankName} - {user.accountNumber}</p>
                  <p className="text-white text-sm">{user.accountName}</p>
                </div>
              </div>
            ) : (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-red-500 font-medium mb-1">Bank Details Missing</h4>
                  <p className="text-sm text-red-500/80 mb-3">You need to add your bank details in your profile before creating an offer.</p>
                  <Button size="sm" variant="outline" asChild className="border-red-500/50 text-red-500 hover:bg-red-500/10">
                    <Link href="/profile">Add Bank Details</Link>
                  </Button>
                </div>
              </div>
            )}

          </CardContent>
          <CardFooter className="bg-muted/30 border-t border-border px-6 py-4">
            <Button 
              type="submit" 
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-12"
              disabled={isKycRestricted || createOfferMutation.isPending || !user?.bankName}
            >
              {createOfferMutation.isPending && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
              Lock Funds & Publish Offer
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}