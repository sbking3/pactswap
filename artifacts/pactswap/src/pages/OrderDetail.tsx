import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { 
  useGetOrder, 
  useMarkOrderPaid, 
  useConfirmPayment, 
  useOpenDispute, 
  useGetMe,
  getGetOrderQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft, AlertCircle, Copy, CheckCircle2, Clock, ShieldCheck, FileWarning } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const statusMap: Record<number, { label: string; color: string }> = {
  0: { label: "Awaiting Payment", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  1: { label: "Payment Sent", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  2: { label: "Completed (Crypto Released)", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  3: { label: "Cancelled", color: "bg-gray-500/10 text-gray-500 border-gray-500/20" },
  4: { label: "Disputed", color: "bg-red-500/10 text-red-500 border-red-500/20" },
};

export default function OrderDetail() {
  const [, params] = useRoute("/orders/:id");
  const orderId = params?.id;
  const queryClient = useQueryClient();
  
  const { data: user, isLoading: userLoading } = useGetMe();
  const { data: order, isLoading: orderLoading, refetch } = useGetOrder(orderId || "", {
    query: {
      enabled: !!orderId,
      queryKey: getGetOrderQueryKey(orderId || ""),
    }
  });

  const markPaidMutation = useMarkOrderPaid();
  const confirmPaymentMutation = useConfirmPayment();
  const openDisputeMutation = useOpenDispute();

  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  if (orderLoading || userLoading || !order || !user) {
    return (
      <div className="flex-1 flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isBuyer = user.id === order.buyerId;
  const isSeller = user.id === order.sellerId;
  const statusInfo = statusMap[order.status] || { label: "Unknown", color: "bg-gray-500/10 text-gray-500" };
  const totalNaira = order.priceNaira * order.amountUsdt;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const handleMarkPaid = () => {
    markPaidMutation.mutate({ data: { orderId: order.id } }, {
      onSuccess: () => {
        toast.success("Marked as paid. Seller will verify.");
        refetch();
      },
      onError: (error) => toast.error(error.error || "Action failed")
    });
  };

  const handleConfirmPayment = () => {
    confirmPaymentMutation.mutate({ data: { orderId: order.id } }, {
      onSuccess: () => {
        toast.success("Payment confirmed. USDT released from escrow.");
        refetch();
      },
      onError: (error) => toast.error(error.error || "Action failed")
    });
  };

  const handleOpenDispute = () => {
    if (!disputeReason) {
      toast.error("Please provide a reason for the dispute.");
      return;
    }
    openDisputeMutation.mutate({ data: { orderId: order.id, reason: disputeReason } }, {
      onSuccess: () => {
        toast.success("Dispute opened. Admin will review.");
        setDisputeOpen(false);
        refetch();
      },
      onError: (error) => toast.error(error.error || "Failed to open dispute")
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Button variant="ghost" asChild className="mb-4 -ml-4 text-muted-foreground hover:text-white">
          <Link href="/orders"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Orders</Link>
        </Button>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              Order #{order.id.slice(0, 8)}...
              <Badge variant="outline" className={`${statusInfo.color} font-medium border text-sm ml-2`}>
                {statusInfo.label}
              </Badge>
            </h1>
            <p className="text-muted-foreground mt-1">Created on {format(new Date(order.createdAt), "PPP 'at' p")}</p>
          </div>
          
          <div className="flex gap-2">
            {(order.status === 1 || order.status === 0) && (
              <Button 
                variant="outline" 
                className="border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-400"
                onClick={() => setDisputeOpen(true)}
              >
                <FileWarning className="w-4 h-4 mr-2" /> Open Dispute
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="bg-card border-border shadow-md">
            <CardHeader className="border-b border-border/50 pb-4 bg-muted/10">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Escrow Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center p-4 bg-primary/5 border border-primary/20 rounded-lg mb-6">
                <div>
                  <span className="block text-sm text-muted-foreground mb-1">Locked Amount</span>
                  <span className="text-2xl font-black text-white">{order.amountUsdt} USDT</span>
                </div>
                <div className="text-right">
                  <span className="block text-sm text-muted-foreground mb-1">Rate</span>
                  <span className="text-lg font-bold text-white">₦{order.priceNaira.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary/20 before:via-border before:to-transparent">
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-primary bg-primary/20 text-primary shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-lg bg-background border border-border">
                    <div className="font-bold text-white mb-1">Order Created</div>
                    <div className="text-sm text-muted-foreground">Crypto locked in smart contract.</div>
                  </div>
                </div>

                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ${order.status >= 1 ? 'border-primary bg-primary/20 text-primary' : 'border-border bg-background text-muted-foreground'}`}>
                    {order.status >= 1 ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                  </div>
                  <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-lg bg-background border ${order.status >= 1 ? 'border-primary/50' : 'border-border'}`}>
                    <div className="font-bold text-white mb-1">Fiat Payment</div>
                    <div className="text-sm text-muted-foreground">{order.status >= 1 ? 'Buyer marked as paid.' : 'Awaiting buyer payment.'}</div>
                  </div>
                </div>

                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ${order.status >= 2 ? 'border-primary bg-primary/20 text-primary' : 'border-border bg-background text-muted-foreground'}`}>
                    {order.status >= 2 ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                  </div>
                  <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-lg bg-background border ${order.status >= 2 ? 'border-primary/50' : 'border-border'}`}>
                    <div className="font-bold text-white mb-1">Crypto Released</div>
                    <div className="text-sm text-muted-foreground">{order.status >= 2 ? 'USDT released to buyer wallet.' : 'Pending seller confirmation.'}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-card border-border shadow-md">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-lg text-white">Payment Details</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Total to Pay</span>
                <span className="text-2xl font-black text-white">₦{totalNaira.toLocaleString()}</span>
              </div>
              
              <div className="p-4 bg-background border border-border rounded-lg space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Bank Name</span>
                  <span className="font-medium text-white">{order.seller?.bankName || "Unknown Bank"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Account Number</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-white">{order.seller?.accountNumber || "N/A"}</span>
                    <button onClick={() => copyToClipboard(order.seller?.accountNumber || "")} className="text-primary hover:text-primary/80">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Account Name</span>
                  <span className="font-medium text-white">{order.seller?.accountName || "N/A"}</span>
                </div>
              </div>

              {isBuyer && order.status === 0 && (
                <div className="pt-4">
                  <p className="text-sm text-muted-foreground mb-4">Please transfer the exact amount to the seller's account above, then click the button below.</p>
                  <Button 
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-12"
                    onClick={handleMarkPaid}
                    disabled={markPaidMutation.isPending}
                  >
                    {markPaidMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    I Have Paid
                  </Button>
                </div>
              )}

              {isSeller && order.status === 1 && (
                <div className="pt-4">
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3 mb-4 text-sm text-amber-500">
                    <AlertCircle className="w-4 h-4 inline mr-1 mb-0.5" />
                    Check your bank account. Only release crypto if you have received the exact amount.
                  </div>
                  <Button 
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-12"
                    onClick={handleConfirmPayment}
                    disabled={confirmPaymentMutation.isPending}
                  >
                    {confirmPaymentMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Confirm Payment Received
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-md">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-lg text-white">Counterparty</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                  {(isBuyer ? order.seller?.name : order.buyer?.name)?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <div className="font-medium text-white">
                    {isBuyer ? order.seller?.name : order.buyer?.name || "Unknown User"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Role: {isBuyer ? "Seller" : "Buyer"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-red-500 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Open Dispute
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Opening a dispute halts the escrow process. An admin will review the case. Please describe the issue clearly.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Textarea 
              placeholder="E.g. I sent the money but seller isn't releasing, or buyer marked paid but no money received."
              className="bg-background border-border min-h-[100px]"
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
              className="bg-red-500 text-white hover:bg-red-600 font-bold"
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