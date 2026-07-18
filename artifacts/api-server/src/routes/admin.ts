import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, kycTable, ordersTable, disputesTable, offersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/authMiddleware";

const router = Router();

// GET /api/admin/stats
router.get("/admin/stats", requireAdmin, async (req, res) => {
  const [users, offers, orders, disputes] = await Promise.all([
    db.select().from(usersTable),
    db.select().from(offersTable),
    db.select().from(ordersTable),
    db.select().from(disputesTable),
  ]);

  const completedOrders = orders.filter(o => o.status === 2).length;
  const disputedOrders = orders.filter(o => o.status === 4).length;
  const totalVolumeUsdt = orders.filter(o => o.status === 2).reduce((s, o) => s + o.amountUsdt, 0);
  const kycAll = await db.select().from(kycTable);
  const pendingKyc = kycAll.filter(k => k.status === "pending").length;
  const openDisputes = disputes.filter(d => d.status === "open").length;

  res.json({
    totalUsers: users.length,
    totalOffers: offers.length,
    totalOrders: orders.length,
    completedOrders,
    disputedOrders,
    totalVolumeUsdt,
    pendingKyc,
    openDisputes,
  });
});

// GET /api/admin/kyc
router.get("/admin/kyc", requireAdmin, async (req, res) => {
  const { status } = req.query;
  let kycs = await db.select().from(kycTable);
  if (status) {
    kycs = kycs.filter(k => k.status === status);
  }
  // Enrich with user
  const enriched = await Promise.all(kycs.map(async k => {
    const users = await db.select().from(usersTable).where(eq(usersTable.id, k.userId));
    const u = users[0];
    return {
      ...k,
      user: u ? { id: u.id, walletAddress: u.walletAddress, name: u.name, kycLevel: u.kycLevel, tradeCount: u.tradeCount, rating: u.rating, createdAt: u.createdAt } : null,
    };
  }));
  res.json(enriched);
});

// PATCH /api/admin/kyc/:id
router.patch("/admin/kyc/:id", requireAdmin, async (req, res) => {
  const { status, reason } = req.body;
  if (!status || !["approved", "rejected"].includes(status)) {
    res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    return;
  }

  const kycs = await db.select().from(kycTable).where(eq(kycTable.id, req.params.id));
  if (kycs.length === 0) {
    res.status(404).json({ error: "KYC submission not found" });
    return;
  }
  const kyc = kycs[0];

  const updated = await db.update(kycTable).set({ status, reason: reason ?? null, updatedAt: new Date() }).where(eq(kycTable.id, kyc.id)).returning();

  if (status === "approved") {
    // Advance KYC level
    const targetLevel = kyc.idType === "bvn" ? 2 : 3;
    await db.update(usersTable).set({ kycLevel: targetLevel, kycStatus: "approved" }).where(eq(usersTable.id, kyc.userId));
  } else {
    await db.update(usersTable).set({ kycStatus: "rejected" }).where(eq(usersTable.id, kyc.userId));
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, kyc.userId));
  const u = users[0];
  res.json({
    ...updated[0],
    user: u ? { id: u.id, walletAddress: u.walletAddress, name: u.name, kycLevel: u.kycLevel, tradeCount: u.tradeCount, rating: u.rating, createdAt: u.createdAt } : null,
  });
});

// GET /api/admin/users
router.get("/admin/users", requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const search = (req.query.search as string)?.toLowerCase();
  const offset = (page - 1) * limit;

  let users = await db.select().from(usersTable);
  if (search) {
    users = users.filter(u =>
      u.name.toLowerCase().includes(search) ||
      u.email.toLowerCase().includes(search) ||
      u.walletAddress.toLowerCase().includes(search)
    );
  }
  const total = users.length;
  const paginated = users.slice(offset, offset + limit).map(u => ({ ...u, twoFactorSecret: undefined }));
  res.json({ users: paginated, total, page, limit });
});

// PATCH /api/admin/users/:id/ban
router.patch("/admin/users/:id/ban", requireAdmin, async (req, res) => {
  const { isBanned } = req.body;
  if (typeof isBanned !== "boolean") {
    res.status(400).json({ error: "isBanned (boolean) is required" });
    return;
  }
  const updated = await db.update(usersTable).set({ isBanned }).where(eq(usersTable.id, req.params.id)).returning();
  if (updated.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ message: `User ${isBanned ? "banned" : "unbanned"} successfully` });
});

export default router;
