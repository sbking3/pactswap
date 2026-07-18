import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, usersTable, disputesTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";

const router = Router();

// GET /api/dashboard/stats
router.get("/dashboard/stats", requireAuth, async (req, res) => {
  const userId = req.user!.userId;

  const [users, allOrders] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, userId)),
    db.select().from(ordersTable).where(or(eq(ordersTable.buyerId, userId), eq(ordersTable.sellerId, userId))),
  ]);

  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const user = users[0];

  const activeOrders = allOrders.filter(o => o.status === 0 || o.status === 1).length;
  const completedOrders = allOrders.filter(o => o.status === 2).length;
  const openDisputes = allOrders.filter(o => o.status === 4).length;
  const totalVolumeUsdt = allOrders.filter(o => o.status === 2).reduce((s, o) => s + o.amountUsdt, 0);
  // Earnings: for orders where user is seller and completed
  const totalEarningsNaira = allOrders
    .filter(o => o.status === 2 && o.sellerId === userId)
    .reduce((s, o) => s + o.amountUsdt * o.priceNaira, 0);

  // Recent orders (last 5)
  const recentOrders = allOrders
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  res.json({
    activeOrders,
    completedOrders,
    totalVolumeUsdt,
    totalEarningsNaira,
    openDisputes,
    rating: user.rating,
    kycLevel: user.kycLevel,
    recentOrders,
  });
});

export default router;
