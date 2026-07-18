import { useListOrders } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ExternalLink, Activity } from "lucide-react";
import { format } from "date-fns";

const statusMap: Record<number, { label: string; color: string }> = {
  0: { label: "Awaiting Payment", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  1: { label: "Payment Sent", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  2: { label: "Completed", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  3: { label: "Cancelled", color: "bg-gray-500/10 text-gray-500 border-gray-500/20" },
  4: { label: "Disputed", color: "bg-red-500/10 text-red-500 border-red-500/20" },
};

export default function Orders() {
  const { data: ordersData, isLoading } = useListOrders();

  const orders = ordersData || []; // Fallback empty array if undefined
  
  // Mock categorization since useListOrders doesn't currently filter by role in frontend without explicit params, 
  // but in reality we would either fetch all and filter, or fetch twice.
  // We'll just filter what comes back. Assuming the API returns all my orders.
  // In a real implementation we'd probably use the current user ID to distinguish.
  const activeOrders = orders.filter(o => o.status === 0 || o.status === 1 || o.status === 4);
  const historyOrders = orders.filter(o => o.status === 2 || o.status === 3);

  const OrderTable = ({ data }: { data: typeof orders }) => {
    if (data.length === 0) {
      return (
        <div className="bg-card border border-border border-dashed rounded-xl p-16 text-center mt-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted text-muted-foreground mb-4">
            <Activity className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No orders found</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">You don't have any orders in this category.</p>
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
            <Link href="/marketplace">Browse Marketplace</Link>
          </Button>
        </div>
      );
    }

    return (
      <div className="bg-card border border-border rounded-xl overflow-hidden mt-6 shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-medium tracking-wider">Order ID</th>
                <th className="px-6 py-4 font-medium tracking-wider">Date</th>
                <th className="px-6 py-4 font-medium tracking-wider">Type</th>
                <th className="px-6 py-4 font-medium tracking-wider">Amount USDT</th>
                <th className="px-6 py-4 font-medium tracking-wider">Fiat (NGN)</th>
                <th className="px-6 py-4 font-medium tracking-wider">Status</th>
                <th className="px-6 py-4 text-right font-medium tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((order) => {
                const statusInfo = statusMap[order.status] || { label: "Unknown", color: "bg-gray-500/10 text-gray-500 border-gray-500/20" };
                
                return (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-white max-w-[120px] truncate">
                      {order.id}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                      {format(new Date(order.createdAt), "MMM d, HH:mm")}
                    </td>
                    <td className="px-6 py-4">
                      {/* Hardcoded Type for UI demo, needs logic based on buyerId/sellerId vs current user */}
                      <Badge variant="outline" className="bg-background border-border text-white">Buy</Badge>
                    </td>
                    <td className="px-6 py-4 font-bold text-white whitespace-nowrap">
                      {order.amountUsdt.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-white whitespace-nowrap">
                      ₦{order.priceNaira.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className={`${statusInfo.color} font-medium border`}>
                        {statusInfo.label}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
                        <Link href={`/orders/${order.id}`}>Manage</Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">My Orders</h1>
        <p className="text-muted-foreground mt-1">Manage your active trades and view history.</p>
      </div>

      {isLoading ? (
        <div className="flex-1 flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="bg-muted border border-border p-1">
            <TabsTrigger value="active" className="data-[state=active]:bg-card data-[state=active]:text-primary px-8">
              Active Trades ({activeOrders.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-card data-[state=active]:text-white px-8">
              History ({historyOrders.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active">
            <OrderTable data={activeOrders} />
          </TabsContent>
          <TabsContent value="history">
            <OrderTable data={historyOrders} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}