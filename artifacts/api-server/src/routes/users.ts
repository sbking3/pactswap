import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, ordersTable } from "@workspace/db";
import { eq, or, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
// Encryption removed — accountNumber is stored as plain text

const router = Router();

// PATCH /api/users/profile
router.patch("/users/profile", requireAuth, async (req, res) => {
  const { name, phone, country } = req.body;
  const updates: Record<string, unknown> = {};
  if (name) updates.name = name;
  if (phone) updates.phone = phone;
  if (country) updates.country = country;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const updated = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user!.userId)).returning();
  if (updated.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ ...updated[0], twoFactorSecret: undefined });
});

// PATCH /api/users/bank
router.patch("/users/bank", requireAuth, async (req, res) => {
  const { bankName, accountNumber, accountName } = req.body;
  if (!bankName || !accountNumber || !accountName) {
    res.status(400).json({ error: "bankName, accountNumber, and accountName are required" });
    return;
  }

  // Save plain text — no encryption
  await db.update(usersTable)
    .set({ bankName, accountNumber, accountName })
    .where(eq(usersTable.id, req.user!.userId));

  res.json({ message: "Bank details updated securely" });
});

// GET /api/users/me/stats
router.get("/users/me/stats", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const user = users[0];

  const allOrders = await db.select().from(ordersTable).where(
    or(eq(ordersTable.buyerId, userId), eq(ordersTable.sellerId, userId))
  );

  const successfulTrades = allOrders.filter(o => o.status === 2).length;
  const disputedTrades = allOrders.filter(o => o.status === 4).length;
  const totalVolumeUsdt = allOrders.filter(o => o.status === 2).reduce((sum, o) => sum + o.amountUsdt, 0);

  res.json({
    totalTrades: user.tradeCount,
    successfulTrades,
    disputedTrades,
    totalVolumeUsdt,
    rating: user.rating,
    memberSince: user.createdAt,
  });
});

// GET /api/users/:walletAddress (public profile)
router.get("/users/:walletAddress", async (req, res) => {
  const { walletAddress } = req.params;
  const users = await db.select().from(usersTable).where(eq(usersTable.walletAddress, walletAddress.toLowerCase()));
  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const u = users[0];
  res.json({
    id: u.id,
    walletAddress: u.walletAddress,
    name: u.name,
    kycLevel: u.kycLevel,
    tradeCount: u.tradeCount,
    rating: u.rating,
    createdAt: u.createdAt,
  });
});

export default router;
