import { useState } from "react";
import { useGetMyOffers, useUpdateOffer, useDeleteOffer } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Loader2, Pencil, Trash2, Store } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";

type Offer = {
  id: string;
  priceNaira: number;
  amountUsdt: number;
  minTrade: number;
  maxTrade: number;
  paymentMethod: string;
  isActive: boolean;
  createdAt: string;
};

export default function MyOffers() {
  const queryClient = useQueryClient();
  const { data: offers, isLoading } = useGetMyOffers();
  const updateOffer = useUpdateOffer();
  const deleteOffer = useDeleteOffer();

  // Edit modal state
  const [editOffer, setEditOffer] = useState<Offer | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editMin, setEditMin] = useState("");
  const [editMax, setEditMax] = useState("");
  const [editPayment, setEditPayment] = useState("");

  // Delete confirm state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openEdit = (offer: Offer) => {
    setEditOffer(offer);
    setEditPrice(String(offer.priceNaira));
    setEditAmount(String(offer.amountUsdt));
    setEditMin(String(offer.minTrade));
    setEditMax(String(offer.maxTrade));
    setEditPayment(offer.paymentMethod);
  };

  const handleEditSave = () => {
    if (!editOffer) return;
    const amountNum = parseFloat(editAmount);
    const minNum = parseFloat(editMin);
    const maxNum = parseFloat(editMax);

    if (!editPrice || isNaN(amountNum) || isNaN(minNum) || isNaN(maxNum)) {
      toast.error("Please fill in all fields correctly.");
      return;
    }
    if (amountNum < 5) { toast.error("Minimum trade amount is $5 USDT"); return; }
    if (minNum < 5) { toast.error("Minimum trade limit must be at least $5 USDT"); return; }
    if (minNum > maxNum) { toast.error("Min trade cannot be greater than max trade."); return; }
    if (maxNum > amountNum) { toast.error("Max trade cannot exceed total amount."); return; }

    updateOffer.mutate(
      {
        id: editOffer.id,
        data: {
          priceNaira: parseFloat(editPrice),
          amountUsdt: amountNum,
          minTrade: minNum,
          maxTrade: maxNum,
          paymentMethod: editPayment,
        },
      },
      {
        onSuccess: () => {
          toast.success("Offer updated and marketplace listing refreshed.");
          setEditOffer(null);
          queryClient.invalidateQueries({ queryKey: ["getMyOffers"] });
        },
        onError: (err: any) => {
          toast.error(err?.error ?? "Failed to update offer");
        },
      }
    );
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteOffer.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          toast.success("Offer removed from marketplace.");
          setDeleteId(null);
          queryClient.invalidateQueries({ queryKey: ["getMyOffers"] });
        },
        onError: (err: any) => {
          toast.error(err?.error ?? "Cannot delete this offer");
          setDeleteId(null);
        },
      }
    );
  };

  const activeOffers = (offers ?? []).filter((o) => o.isActive);
  const inactiveOffers = (offers ?? []).filter((o) => !o.isActive);

  const OfferRow = ({ offer }: { offer: Offer }) => (
    <tr key={offer.id} className="hover:bg-muted/30 transition-colors">
      <td className="px-5 py-4 text-muted-foreground whitespace-nowrap text-sm">
        {format(new Date(offer.createdAt), "MMM d, HH:mm")}
      </td>
      <td className="px-5 py-4 font-bold text-white whitespace-nowrap">
        ₦{offer.priceNaira.toLocaleString()}
      </td>
      <td className="px-5 py-4 text-white whitespace-nowrap">
        {offer.amountUsdt.toFixed(2)} USDT
      </td>
      <td className="px-5 py-4 text-muted-foreground whitespace-nowrap text-sm">
        {offer.minTrade.toFixed(2)} – {offer.maxTrade.toFixed(2)}
      </td>
      <td className="px-5 py-4 text-muted-foreground text-sm">{offer.paymentMethod}</td>
      <td className="px-5 py-4">
        {offer.isActive ? (
          <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 font-medium">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/20 font-medium">
            Inactive
          </Badge>
        )}
      </td>
      <td className="px-5 py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          {offer.isActive && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
              title="Edit offer"
              onClick={() => openEdit(offer)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500"
            title="Delete offer"
            onClick={() => setDeleteId(offer.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">My Listings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your active sell offers on the marketplace.
          </p>
        </div>
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium shrink-0">
          <Link href="/offers/create">+ New Offer</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (offers ?? []).length === 0 ? (
        <div className="bg-card border border-border border-dashed rounded-xl p-16 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted text-muted-foreground mb-4">
            <Store className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No listings yet</h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            Create your first sell offer to start trading USDT for Naira.
          </p>
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
            <Link href="/offers/create">Create Offer</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active offers */}
          {activeOffers.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">
                Active ({activeOffers.length})
              </h2>
              <div className="bg-card border border-border rounded-xl overflow-hidden shadow-md">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                      <tr>
                        <th className="px-5 py-4 font-medium tracking-wider">Created</th>
                        <th className="px-5 py-4 font-medium tracking-wider">Rate (NGN)</th>
                        <th className="px-5 py-4 font-medium tracking-wider">Amount</th>
                        <th className="px-5 py-4 font-medium tracking-wider">Limits (USDT)</th>
                        <th className="px-5 py-4 font-medium tracking-wider">Payment</th>
                        <th className="px-5 py-4 font-medium tracking-wider">Status</th>
                        <th className="px-5 py-4 text-right font-medium tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {activeOffers.map((offer) => (
                        <OfferRow key={offer.id} offer={offer} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Inactive / deleted offers */}
          {inactiveOffers.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">
                Inactive / Removed ({inactiveOffers.length})
              </h2>
              <div className="bg-card border border-border rounded-xl overflow-hidden shadow-md opacity-60">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                      <tr>
                        <th className="px-5 py-4 font-medium tracking-wider">Created</th>
                        <th className="px-5 py-4 font-medium tracking-wider">Rate (NGN)</th>
                        <th className="px-5 py-4 font-medium tracking-wider">Amount</th>
                        <th className="px-5 py-4 font-medium tracking-wider">Limits (USDT)</th>
                        <th className="px-5 py-4 font-medium tracking-wider">Payment</th>
                        <th className="px-5 py-4 font-medium tracking-wider">Status</th>
                        <th className="px-5 py-4 text-right font-medium tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {inactiveOffers.map((offer) => (
                        <OfferRow key={offer.id} offer={offer} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Edit modal ──────────────────────────────────────────────── */}
      <Dialog open={!!editOffer} onOpenChange={(open) => { if (!open) setEditOffer(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Offer</DialogTitle>
            <DialogDescription>Update the price, amount, or payment method. Changes appear on the marketplace instantly.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Price per USDT (NGN)</Label>
              <div className="relative">
                <Input
                  type="number"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="bg-background border-border pl-8"
                />
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">₦</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Total Amount (USDT)</Label>
                <Input
                  type="number"
                  min="5"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="bg-background border-border"
                />
                <p className="text-xs text-muted-foreground">Min: $5 USDT</p>
              </div>
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Input
                  value={editPayment}
                  onChange={(e) => setEditPayment(e.target.value)}
                  className="bg-background border-border"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Min Trade (USDT)</Label>
                <Input
                  type="number"
                  min="5"
                  value={editMin}
                  onChange={(e) => setEditMin(e.target.value)}
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max Trade (USDT)</Label>
                <Input
                  type="number"
                  value={editMax}
                  onChange={(e) => setEditMax(e.target.value)}
                  className="bg-background border-border"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOffer(null)} disabled={updateOffer.isPending}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
              onClick={handleEditSave}
              disabled={updateOffer.isPending}
            >
              {updateOffer.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ─────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete this offer?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from the marketplace immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-white hover:bg-muted">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white font-medium"
              onClick={handleDelete}
              disabled={deleteOffer.isPending}
            >
              {deleteOffer.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
