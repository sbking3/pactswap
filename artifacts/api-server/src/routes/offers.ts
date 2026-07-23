import { Router } from "express";
import { db } from "@workspace/db";
import { offersTable, usersTable, ordersTable } from "@workspace/db";
import { eq, and, gte, lte, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";

const OFFER_MIN_USDT = 5;

const router = Router();

function toPublicProfile(u: typeof usersTable.$inferSelect) {
  return { id: u.id, walletAddress: u.walletAddress, name: u.name, kycLevel: u.kycLevel, tradeCount: u.tradeCount, rating: u.rating, createdAt: u.createdAt };
}

// GET /api/offers
router.get("/offers", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const offset = (page - 1) * limit;
  const minAmount = req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined;
  const maxAmount = req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined;

  const conditions = [eq(offersTable.isActive, true)];
  if (minAmount !== undefined) conditions.push(gte(offersTable.amountUsdt, minAmount));
  if (maxAmount !== undefined) conditions.push(lte(offersTable.amountUsdt, maxAmount));

  const allOffers = await db.select().from(offersTable).where(and(...conditions));
  const paginated = allOffers.slice(offset, offset + limit);

  // Fetch sellers
  const sellerIds = [...new Set(paginated.map(o => o.sellerId))];
  const sellers = sellerIds.length > 0
    ? await db.select().from(usersTable).where(eq(usersTable.id, sellerIds[0]))
    : [];

  // Collect all sellers more broadly
  const allSellers = await db.select().from(usersTable);
  const sellerMap = new Map(allSellers.map(s => [s.id, s]));

  const offersWithSellers = paginated.map(offer => ({
    ...offer,
    seller: sellerMap.has(offer.sellerId) ? toPublicProfile(sellerMap.get(offer.sellerId)!) : null,
  }));

  res.json({ offers: offersWithSellers, total: allOffers.length, page, limit });
});

// POST /api/offers
router.post("/offers", requireAuth, async (req, res) => {
  const { escrowId, priceNaira, amountUsdt, minTrade, maxTrade, paymentMethod } = req.body;
  if (!escrowId || !priceNaira || !amountUsdt || !minTrade || !maxTrade) {
    res.status(400).json({ error: "escrowId, priceNaira, amountUsdt, minTrade, maxTrade are required" });
    return;
  }

  if (Number(amountUsdt) < OFFER_MIN_USDT) {
    res.status(400).json({ error: `Minimum trade amount is $${OFFER_MIN_USDT} USDT` });
    return;
  }
  if (Number(minTrade) < OFFER_MIN_USDT) {
    res.status(400).json({ error: `Minimum trade limit must be at least $${OFFER_MIN_USDT} USDT` });
    return;
  }

  // Check KYC level
  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (users[0].kycLevel < 1) {
    res.status(403).json({ error: "KYC verification (Level 1) required to create offers" });
    return;
  }

  const offer = await db.insert(offersTable).values({
    escrowId,
    sellerId: req.user!.userId,
    priceNaira,
    amountUsdt,
    minTrade,
    maxTrade,
    paymentMethod: paymentMethod ?? "Bank Transfer",
  }).returning();

  const seller = users[0];
  res.status(201).json({ ...offer[0], seller: toPublicProfile(seller) });
});

// GET /api/offers/my
router.get("/offers/my", requireAuth, async (req, res) => {
  const offers = await db.select().from(offersTable).where(eq(offersTable.sellerId, req.user!.userId));
  const sellers = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  const seller = sellers[0];
  res.json(offers.map(o => ({ ...o, seller: seller ? toPublicProfile(seller) : null })));
});

// GET /api/offers/:id
router.get("/offers/:id", async (req, res) => {
  const offers = await db.select().from(offersTable).where(eq(offersTable.id, req.params.id as string));
  if (offers.length === 0) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  const offer = offers[0];
  const sellers = await db.select().from(usersTable).where(eq(usersTable.id, offer.sellerId));
  res.json({ ...offer, seller: sellers[0] ? toPublicProfile(sellers[0]) : null });
});

// PATCH /api/offers/:id  — only creator, only when isActive
router.patch("/offers/:id", requireAuth, async (req, res) => {
  const offers = await db.select().from(offersTable).where(eq(offersTable.id, req.params.id as string));
  if (offers.length === 0) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  if (offers[0].sellerId !== req.user!.userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }
  if (!offers[0].isActive) {
    res.status(400).json({ error: "Cannot edit order that is in progress" });
    return;
  }

  // Validate new amounts against $5 minimum
  if (req.body.amountUsdt !== undefined && Number(req.body.amountUsdt) < OFFER_MIN_USDT) {
    res.status(400).json({ error: `Minimum trade amount is $${OFFER_MIN_USDT} USDT` });
    return;
  }
  if (req.body.minTrade !== undefined && Number(req.body.minTrade) < OFFER_MIN_USDT) {
    res.status(400).json({ error: `Minimum trade limit must be at least $${OFFER_MIN_USDT} USDT` });
    return;
  }

  const { priceNaira, amountUsdt, minTrade, maxTrade, paymentMethod } = req.body;
  const updates: Record<string, unknown> = {};
  if (priceNaira !== undefined) updates.priceNaira = priceNaira;
  if (amountUsdt !== undefined) updates.amountUsdt = amountUsdt;
  if (minTrade !== undefined) updates.minTrade = minTrade;
  if (maxTrade !== undefined) updates.maxTrade = maxTrade;
  if (paymentMethod !== undefined) updates.paymentMethod = paymentMethod;
  updates.updatedAt = new Date();

  const updated = await db.update(offersTable).set(updates).where(eq(offersTable.id, req.params.id as string)).returning();
  const sellers = await db.select().from(usersTable).where(eq(usersTable.id, offers[0].sellerId));
  res.json({ ...updated[0], seller: sellers[0] ? toPublicProfile(sellers[0]) : null });
});

// DELETE /api/offers/:id  — creator only; blocked if trade is in progress (order status 0=created or 1=paid)
router.delete("/offers/:id", requireAuth, async (req, res) => {
  const offers = await db.select().from(offersTable).where(eq(offersTable.id, req.params.id as string));
  if (offers.length === 0) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  if (offers[0].sellerId !== req.user!.userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  // Block delete if there are open / payment-pending orders against this offer
  const liveOrders = await db.select().from(ordersTable).where(
    and(
      eq(ordersTable.offerId, req.params.id as string),
      or(eq(ordersTable.status, 0), eq(ordersTable.status, 1))
    )
  );
  if (liveOrders.length > 0) {
    res.status(400).json({ error: "Cannot delete order in progress" });
    return;
  }

  // Soft-delete: remove from marketplace by deactivating
  await db.update(offersTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(offersTable.id, req.params.id as string));
  res.json({ message: "Offer deleted" });
});

export default router;
