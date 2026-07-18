import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, offersTable, usersTable, disputesTable } from "@workspace/db";
import { eq, or, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";

const router = Router();

function toPublicProfile(u: typeof usersTable.$inferSelect) {
  return { id: u.id, walletAddress: u.walletAddress, name: u.name, kycLevel: u.kycLevel, tradeCount: u.tradeCount, rating: u.rating, createdAt: u.createdAt };
}

async function enrichOrder(order: typeof ordersTable.$inferSelect) {
  const [buyers, sellers, disputes] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, order.buyerId)),
    db.select().from(usersTable).where(eq(usersTable.id, order.sellerId)),
    db.select().from(disputesTable).where(eq(disputesTable.orderId, order.id)),
  ]);
  const offers = order.offerId ? await db.select().from(offersTable).where(eq(offersTable.id, order.offerId)) : [];
  return {
    ...order,
    buyer: buyers[0] ? toPublicProfile(buyers[0]) : null,
    seller: sellers[0] ? toPublicProfile(sellers[0]) : null,
    offer: offers[0] ?? null,
    dispute: disputes[0] ?? null,
  };
}

// GET /api/orders
router.get("/orders", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const { role, status } = req.query;

  let orders: typeof ordersTable.$inferSelect[] = [];
  if (role === "buyer") {
    orders = await db.select().from(ordersTable).where(eq(ordersTable.buyerId, userId));
  } else if (role === "seller") {
    orders = await db.select().from(ordersTable).where(eq(ordersTable.sellerId, userId));
  } else {
    orders = await db.select().from(ordersTable).where(
      or(eq(ordersTable.buyerId, userId), eq(ordersTable.sellerId, userId))
    );
  }

  if (status !== undefined) {
    const s = parseInt(status as string);
    orders = orders.filter(o => o.status === s);
  }

  const enriched = await Promise.all(orders.map(enrichOrder));
  res.json(enriched);
});

// POST /api/orders
router.post("/orders", requireAuth, async (req, res) => {
  const { offerId, escrowId, amountUsdt, contractTx } = req.body;
  if (!offerId || !escrowId || !amountUsdt || !contractTx) {
    res.status(400).json({ error: "offerId, escrowId, amountUsdt, and contractTx are required" });
    return;
  }

  const offers = await db.select().from(offersTable).where(eq(offersTable.id, offerId));
  if (offers.length === 0) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  const offer = offers[0];

  if (!offer.isActive) {
    res.status(400).json({ error: "Offer is no longer active" });
    return;
  }
  if (offer.sellerId === req.user!.userId) {
    res.status(400).json({ error: "Cannot buy your own offer" });
    return;
  }

  const order = await db.insert(ordersTable).values({
    escrowId,
    offerId,
    buyerId: req.user!.userId,
    sellerId: offer.sellerId,
    amountUsdt,
    priceNaira: offer.priceNaira,
    status: 0,
    contractTx,
  }).returning();

  const enriched = await enrichOrder(order[0]);
  res.status(201).json(enriched);
});

// GET /api/orders/:id
router.get("/orders/:id", requireAuth, async (req, res) => {
  const orders = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id));
  if (orders.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const order = orders[0];
  const userId = req.user!.userId;
  if (order.buyerId !== userId && order.sellerId !== userId) {
    const adminWallet = process.env.ADMIN_WALLET?.toLowerCase();
    const users = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!adminWallet || users[0]?.walletAddress.toLowerCase() !== adminWallet) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }
  }
  res.json(await enrichOrder(order));
});

// PATCH /api/orders/:id/paid
router.patch("/orders/:id/paid", requireAuth, async (req, res) => {
  const orders = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id));
  if (orders.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const order = orders[0];
  if (order.buyerId !== req.user!.userId) {
    res.status(403).json({ error: "Only the buyer can mark as paid" });
    return;
  }
  if (order.status !== 0) {
    res.status(400).json({ error: "Order is not in 'created' status" });
    return;
  }
  const updated = await db.update(ordersTable).set({ status: 1, updatedAt: new Date() }).where(eq(ordersTable.id, order.id)).returning();
  res.json(await enrichOrder(updated[0]));
});

// PATCH /api/orders/:id/confirm
router.patch("/orders/:id/confirm", requireAuth, async (req, res) => {
  const orders = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id));
  if (orders.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const order = orders[0];
  if (order.sellerId !== req.user!.userId) {
    res.status(403).json({ error: "Only the seller can confirm payment" });
    return;
  }
  if (order.status !== 1) {
    res.status(400).json({ error: "Order is not in 'paid' status" });
    return;
  }
  // TODO: call releaseEscrow() on contract
  const updated = await db.update(ordersTable).set({ status: 2, updatedAt: new Date() }).where(eq(ordersTable.id, order.id)).returning();
  // Update trade counts
  await db.update(usersTable).set({ tradeCount: (await db.select().from(usersTable).where(eq(usersTable.id, order.buyerId)))[0].tradeCount + 1 }).where(eq(usersTable.id, order.buyerId));
  await db.update(usersTable).set({ tradeCount: (await db.select().from(usersTable).where(eq(usersTable.id, order.sellerId)))[0].tradeCount + 1 }).where(eq(usersTable.id, order.sellerId));
  res.json(await enrichOrder(updated[0]));
});

// POST /api/orders/:id/dispute
router.post("/orders/:id/dispute", requireAuth, async (req, res) => {
  const { reason, evidenceUrl } = req.body;
  if (!reason) {
    res.status(400).json({ error: "reason is required" });
    return;
  }
  const orders = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id));
  if (orders.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const order = orders[0];
  const userId = req.user!.userId;
  if (order.buyerId !== userId && order.sellerId !== userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }
  if (order.status !== 1) {
    res.status(400).json({ error: "Can only dispute orders in 'paid' status" });
    return;
  }

  const dispute = await db.insert(disputesTable).values({
    orderId: order.id,
    reason,
    evidenceUrl: evidenceUrl ?? null,
    status: "open",
  }).returning();

  await db.update(ordersTable).set({ status: 4, updatedAt: new Date() }).where(eq(ordersTable.id, order.id));

  res.status(201).json(dispute[0]);
});

export default router;
