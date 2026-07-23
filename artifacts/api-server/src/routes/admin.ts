import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  kycTable,
  ordersTable,
  disputesTable,
  offersTable,
  adminLogsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAdmin } from "../middlewares/authMiddleware";
import { readEscrow } from "../lib/contract";
import { logger } from "../lib/logger";

const router = Router();

// ─── helpers ──────────────────────────────────────────────────────────────────

function adminWallet(req: Parameters<typeof requireAdmin>[0]) {
  return req.user!.walletAddress;
}

async function logAction(
  action: string,
  wallet: string,
  target?: string,
  details?: Record<string, unknown>,
) {
  await db.insert(adminLogsTable).values({
    action,
    adminWallet: wallet.toLowerCase(),
    target: target ?? null,
    details: details ? JSON.stringify(details) : null,
  });
}

// ─── STATS ─────────────────────────────────────────────────────────────────

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
  const activeOffers = offers.filter(o => o.isActive).length;

  res.json({
    totalUsers: users.length,
    totalOffers: offers.length,
    activeOffers,
    totalOrders: orders.length,
    completedOrders,
    disputedOrders,
    totalVolumeUsdt,
    pendingKyc,
    openDisputes,
  });
});

// ─── MARKETPLACE ──────────────────────────────────────────────────────────────

// POST /api/admin/offers/clear  — soft-delete all active offers with no live trades
router.post("/admin/offers/clear", requireAdmin, async (req, res) => {
  const activeOffers = await db.select().from(offersTable).where(eq(offersTable.isActive, true));

  if (activeOffers.length === 0) {
    res.json({ deleted: 0, skipped: 0, message: "No active offers to clear." });
    return;
  }

  const offerIds = activeOffers.map(o => o.id);

  // Find which offer IDs have live orders (status 0 or 1)
  const liveOrderStatuses = await db
    .select({ offerId: ordersTable.offerId, status: ordersTable.status })
    .from(ordersTable)
    .where(inArray(ordersTable.offerId, offerIds));

  const protectedOfferIds = new Set(
    liveOrderStatuses.filter(o => o.status === 0 || o.status === 1).map(o => o.offerId).filter(Boolean) as string[],
  );

  const toDelete = activeOffers.filter(o => !protectedOfferIds.has(o.id));
  const skipped = activeOffers.length - toDelete.length;

  if (toDelete.length > 0) {
    await db
      .update(offersTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(inArray(offersTable.id, toDelete.map(o => o.id)));
  }

  await logAction("CLEAR_MARKETPLACE", adminWallet(req), undefined, {
    deleted: toDelete.length,
    skipped,
  });

  res.json({
    deleted: toDelete.length,
    skipped,
    message: `${toDelete.length} offer${toDelete.length !== 1 ? "s" : ""} cleared. ${skipped} skipped due to active trades.`,
  });
});

// ─── USERS ────────────────────────────────────────────────────────────────────

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
      u.walletAddress.toLowerCase().includes(search),
    );
  }
  const total = users.length;
  const paginated = users.slice(offset, offset + limit).map(u => ({ ...u, twoFactorSecret: undefined }));
  res.json({ users: paginated, total, page, limit });
});

// PATCH /api/admin/users/:wallet/freeze
router.patch("/admin/users/:wallet/freeze", requireAdmin, async (req, res) => {
  const wallet = (req.params.wallet as string).toLowerCase();
  const rows = await db.select().from(usersTable).where(eq(usersTable.walletAddress, wallet));
  if (rows.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await db.update(usersTable).set({ isBanned: true }).where(eq(usersTable.walletAddress, wallet));
  await logAction("FREEZE_USER", adminWallet(req), wallet);
  res.json({ message: "Account frozen successfully" });
});

// PATCH /api/admin/users/:wallet/unfreeze
router.patch("/admin/users/:wallet/unfreeze", requireAdmin, async (req, res) => {
  const wallet = (req.params.wallet as string).toLowerCase();
  const rows = await db.select().from(usersTable).where(eq(usersTable.walletAddress, wallet));
  if (rows.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await db.update(usersTable).set({ isBanned: false }).where(eq(usersTable.walletAddress, wallet));
  await logAction("UNFREEZE_USER", adminWallet(req), wallet);
  res.json({ message: "Account unfrozen successfully" });
});

// PATCH /api/admin/users/:id/ban  (kept for backwards compat)
router.patch("/admin/users/:id/ban", requireAdmin, async (req, res) => {
  const { isBanned } = req.body;
  if (typeof isBanned !== "boolean") {
    res.status(400).json({ error: "isBanned (boolean) is required" });
    return;
  }
  const updated = await db.update(usersTable).set({ isBanned }).where(eq(usersTable.id, req.params.id as string)).returning();
  if (updated.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ message: `User ${isBanned ? "banned" : "unbanned"} successfully` });
});

// ─── ORDERS ───────────────────────────────────────────────────────────────────

const ORDER_STATUS_LABELS: Record<number, string> = {
  0: "Created",
  1: "Paid",
  2: "Completed",
  3: "Cancelled",
  4: "Disputed",
};

async function enrichAdminOrder(order: typeof ordersTable.$inferSelect) {
  const [buyers, sellers, disputes] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, order.buyerId)),
    db.select().from(usersTable).where(eq(usersTable.id, order.sellerId)),
    db.select().from(disputesTable).where(eq(disputesTable.orderId, order.id)),
  ]);
  return {
    ...order,
    statusLabel: ORDER_STATUS_LABELS[order.status] ?? "Unknown",
    buyer: buyers[0] ? { id: buyers[0].id, walletAddress: buyers[0].walletAddress, name: buyers[0].name } : null,
    seller: sellers[0] ? { id: sellers[0].id, walletAddress: sellers[0].walletAddress, name: sellers[0].name, bankName: sellers[0].bankName, accountNumber: sellers[0].accountNumber, accountName: sellers[0].accountName } : null,
    dispute: disputes[0] ?? null,
  };
}

// GET /api/admin/orders
router.get("/admin/orders", requireAdmin, async (req, res) => {
  const { status } = req.query;
  let orders = await db.select().from(ordersTable);
  if (status !== undefined && status !== "all") {
    const s = parseInt(status as string);
    if (!isNaN(s)) orders = orders.filter(o => o.status === s);
  }
  // Sort newest first
  orders = orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const enriched = await Promise.all(orders.map(enrichAdminOrder));
  res.json(enriched);
});

// POST /api/admin/orders/:id/cancel  — force-cancel an order
router.post("/admin/orders/:id/cancel", requireAdmin, async (req, res) => {
  const orders = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id as string));
  if (orders.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const order = orders[0];
  if (order.status === 2) {
    res.status(400).json({ error: "Cannot cancel a completed order" });
    return;
  }
  if (order.status === 3) {
    res.status(400).json({ error: "Order is already cancelled" });
    return;
  }

  await db.update(ordersTable).set({ status: 3, updatedAt: new Date() }).where(eq(ordersTable.id, order.id));
  await logAction("FORCE_CANCEL_ORDER", adminWallet(req), order.id, { previousStatus: order.status });

  res.json({ message: "Order cancelled successfully" });
});

// ─── DISPUTES ─────────────────────────────────────────────────────────────────

// GET /api/admin/disputes
router.get("/admin/disputes", requireAdmin, async (req, res) => {
  // Get all disputed orders (status=4) enriched with dispute info
  let orders = await db.select().from(ordersTable).where(eq(ordersTable.status, 4));
  orders = orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const enriched = await Promise.all(orders.map(enrichAdminOrder));
  res.json(enriched);
});

// POST /api/admin/disputes/:orderId/resolve
// decision: 'release_buyer' | 'refund_seller' | 'split'
// For release_buyer and refund_seller: txHash is required (on-chain action done by admin wallet in browser)
// For split: manual — no on-chain verification (contract doesn't support native split)
router.post("/admin/disputes/:orderId/resolve", requireAdmin, async (req, res) => {
  const { decision, reason, txHash } = req.body as {
    decision: "release_buyer" | "refund_seller" | "split";
    reason?: string;
    txHash?: string;
  };

  if (!decision || !["release_buyer", "refund_seller", "split"].includes(decision)) {
    res.status(400).json({ error: "decision must be 'release_buyer', 'refund_seller', or 'split'" });
    return;
  }

  const orders = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.orderId as string));
  if (orders.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const order = orders[0];
  if (order.status !== 4) {
    res.status(400).json({ error: "Order is not in disputed status" });
    return;
  }

  // For on-chain decisions, verify the escrow state matches
  if (decision === "release_buyer") {
    // Verify escrow was actually released on-chain
    try {
      const escrow = await readEscrow(order.escrowId);
      if (!escrow.released) {
        res.status(400).json({ error: "Escrow has not been released on-chain yet. Call releaseEscrow() first." });
        return;
      }
    } catch (err: any) {
      logger.error({ err: err?.message }, "admin resolve: readEscrow error");
      res.status(502).json({ error: "Could not read escrow from BSC. Please try again." });
      return;
    }
    await db.update(ordersTable).set({ status: 2, updatedAt: new Date() }).where(eq(ordersTable.id, order.id));
  } else if (decision === "refund_seller") {
    // Verify escrow was refunded on-chain
    try {
      const escrow = await readEscrow(order.escrowId);
      if (!escrow.refunded) {
        res.status(400).json({ error: "Escrow has not been refunded on-chain yet. Call refundEscrow() first." });
        return;
      }
    } catch (err: any) {
      logger.error({ err: err?.message }, "admin resolve: readEscrow error");
      res.status(502).json({ error: "Could not read escrow from BSC. Please try again." });
      return;
    }
    await db.update(ordersTable).set({ status: 3, updatedAt: new Date() }).where(eq(ordersTable.id, order.id));
  } else {
    // split — off-chain admin decision; no on-chain verification (contract doesn't support native split)
    await db.update(ordersTable).set({ status: 2, updatedAt: new Date() }).where(eq(ordersTable.id, order.id));
  }

  // Update dispute record
  const resolutionText = reason
    ? `${decision}: ${reason}`
    : decision;

  await db
    .update(disputesTable)
    .set({ status: "resolved", resolution: resolutionText, updatedAt: new Date() })
    .where(eq(disputesTable.orderId, order.id));

  // Log
  await logAction("DISPUTE_RESOLVE", adminWallet(req), order.id, {
    decision,
    reason: reason ?? null,
    txHash: txHash ?? null,
  });

  res.json({ message: `Dispute resolved: ${decision}` });
});

// ─── KYC ──────────────────────────────────────────────────────────────────────

// GET /api/admin/kyc
router.get("/admin/kyc", requireAdmin, async (req, res) => {
  const { status } = req.query;
  let kycs = await db.select().from(kycTable);
  if (status) {
    kycs = kycs.filter(k => k.status === status);
  }
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

  const kycs = await db.select().from(kycTable).where(eq(kycTable.id, req.params.id as string));
  if (kycs.length === 0) {
    res.status(404).json({ error: "KYC submission not found" });
    return;
  }
  const kyc = kycs[0];

  const updated = await db.update(kycTable).set({ status, reason: reason ?? null, updatedAt: new Date() }).where(eq(kycTable.id, kyc.id)).returning();

  if (status === "approved") {
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

export default router;
