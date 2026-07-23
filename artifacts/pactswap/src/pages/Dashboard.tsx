import { useGetDashboardStats, useListOrders } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRight, DollarSign, Activity, CheckCircle2, AlertTriangle, Plus, ShoppingCart } from "lucide-react";
import { format } from "date-fns";

const statusMap: Record<number, { label: string; color: string }> = {
  0: { label: "Created", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  1: { label: "Paid", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  2: { label: "Released", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  3: { label: "Cancelled", color: "bg-gray-500/10 text-gray-500 border-gray-500/20" },
  4: { label: "Disputed", color: "bg-red-500/10 text-red-500 border-red-500/20" },
};

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  
  // We'll use recentOrders from stats, but if we wanted full table we could use useListOrders

  if (statsLoading || !stats) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your trading activity.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" asChild className="border-border hover:bg-muted">
            <Link href="/marketplace"><ShoppingCart className="mr-2 h-4 w-4" /> Marketplace</Link>
          </Button>
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-[0_0_15px_rgba(245,194,66,0.2)]">
            <Link href="/offers/create"><Plus className="mr-2 h-4 w-4" /> Create Offer</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="bg-card border-border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Orders</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats.activeOrders}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Completed Trades</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats.completedOrders}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Volume (USDT)</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats.totalVolumeUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Open Disputes</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats.openDisputes}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Recent Orders</h2>
          <Button variant="link" asChild className="text-primary hover:text-primary/80 px-0">
            <Link href="/orders">View all <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </div>

        {stats.recentOrders && stats.recentOrders.length > 0 ? (
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-6 py-4 font-medium tracking-wider">Order ID</th>
                    <th className="px-6 py-4 font-medium tracking-wider">Date</th>
                    <th className="px-6 py-4 font-medium tracking-wider">Role</th>
                    <th className="px-6 py-4 font-medium tracking-wider">Amount</th>
                    <th className="px-6 py-4 font-medium tracking-wider">Price (NGN)</th>
                    <th className="px-6 py-4 font-medium tracking-wider">Status</th>
                    <th className="px-6 py-4 text-right font-medium tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.recentOrders.map((order) => {
                    const statusInfo = statusMap[order.status] || { label: "Unknown", color: "bg-gray-500/10 text-gray-500" };
                    
                    return (
                      <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 font-mono text-white truncate max-w-[120px]">
                          {order.id}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                          {format(new Date(order.createdAt), "MMM d, HH:mm")}
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-medium text-white">
                            {/* Assumes we have logic to determine role, fallback to Buyer for now if user.id matches buyerId */}
                            Buyer
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium text-white whitespace-nowrap">
                          {order.amountUsdt} USDT
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
                          <Button variant="ghost" size="sm" asChild className="hover:bg-primary/10 hover:text-primary transition-colors">
                            <Link href={`/orders/${order.id}`}>View</Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border border-dashed rounded-xl p-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted text-muted-foreground mb-4">
              <Activity className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No recent orders</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">You don't have any trading activity yet. Visit the marketplace to start trading.</p>
            <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/marketplace">Browse Marketplace</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}