import { Router } from "express";
import { ethers } from "ethers";
import { db } from "@workspace/db";
import { ordersTable, offersTable, usersTable, disputesTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { verifyTxHash, readEscrow } from "../lib/contract";
import { logger } from "../lib/logger";

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
  // ── 2. Log entire request at start ────────────────────────────────────────
  const walletAddress = req.user!.address ?? req.user!.walletAddress;
  const chainId = req.user!.chainId ?? 56;
  logger.info(
    `=== POST /api/orders === Body: ${JSON.stringify(req.body)} | Wallet: ${walletAddress} | Chain: ${chainId}`,
  );

  // ── 1. Extract fields ─────────────────────────────────────────────────────
  const { email, amount, token, sellerAddress, txHash } = req.body;

  // ── 3. Validate all fields (return 400 on any failure) ───────────────────
  const fail = (msg: string): false => {
    logger.warn(`✗ Validation failed: ${msg}`);
    res.status(400).json({ error: msg });
    return false;
  };

  if (!email || typeof email !== "string" || !email.trim())
    return void fail("Missing field: email");
  if (amount === undefined || amount === null)
    return void fail("Missing field: amount");
  if (typeof amount !== "number" || amount <= 0)
    return void fail("amount must be a number greater than 0");
  if (!token || typeof token !== "string" || !token.trim())
    return void fail("Missing field: token");
  if (!sellerAddress || typeof sellerAddress !== "string" || !sellerAddress.trim())
    return void fail("Missing field: sellerAddress");
  if (!ethers.isAddress(sellerAddress))
    return void fail("sellerAddress must be a valid Ethereum address");
  if (!txHash || typeof txHash !== "string" || !txHash.trim())
    return void fail("Missing field: txHash");
  if (!ethers.isAddress(walletAddress))
    return void fail("Wallet address must be a valid Ethereum address");

  logger.info("✓ All validations passed");

  // ── 4. Token → unit conversion ────────────────────────────────────────────
  const tokenUpper = token.toUpperCase();
  const decimals = tokenUpper === "USDT" || tokenUpper === "USDC" ? 6 : 18;
  const amountInUnits = ethers.parseUnits(amount.toString(), decimals);
  logger.info(
    `✓ Converted ${amount} ${tokenUpper} to ${amountInUnits.toString()} units (${decimals} decimals)`,
  );

  // ── 5. Verify txHash on BSC (read-only — server never signs) ─────────────
  // The frontend wallet already called createEscrow(); we just confirm the tx.
  const { confirmed: txConfirmed } = await verifyTxHash(txHash);
  if (!txConfirmed) {
    logger.warn({ txHash }, "✗ txHash not confirmed on BSC");
    res.status(400).json({ error: "Transaction not confirmed on BSC. Please wait for confirmation and try again." });
    return;
  }
  logger.info(`✓ txHash confirmed on BSC: ${txHash}`);

  // ── 6. Read escrow data from contract to get the escrowId ─────────────────
  // The frontend sends escrowId it used when calling createEscrow()
  const { escrowId } = req.body;
  if (!escrowId || typeof escrowId !== "string") {
    res.status(400).json({ error: "Missing field: escrowId" });
    return;
  }

  // ── 7. Database save ──────────────────────────────────────────────────────
  const sellers = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.walletAddress, sellerAddress.toLowerCase()));
  if (sellers.length === 0) {
    res.status(400).json({ error: "Seller wallet address not registered on the platform" });
    return;
  }

  let savedOrder: typeof ordersTable.$inferSelect;
  try {
    const inserted = await db
      .insert(ordersTable)
      .values({
        escrowId,
        buyerId: req.user!.userId,
        sellerId: sellers[0].id,
        amountUsdt: amount,
        priceNaira: 0,
        status: 0,
        contractTx: txHash,
        email,
        token,
        sellerAddress: ethers.getAddress(sellerAddress),
        buyerAddress: ethers.getAddress(walletAddress),
        chainId,
      })
      .returning();
    savedOrder = inserted[0];
    logger.info(`✓ Order saved — orderId: ${savedOrder.id}`);
  } catch (err: any) {
    logger.error({ err: err?.message }, "✗ DB save failed after on-chain success");
    res.status(500).json({ error: "Order verified on-chain but failed to save locally", txHash });
    return;
  }

  // ── 8. Success ────────────────────────────────────────────────────────────
  res.status(201).json({ success: true, orderId: savedOrder.id, txHash });
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
// Seller calls this AFTER their wallet has already called releaseEscrow() on-chain.
// Body: { txHash: string }  — the on-chain release transaction hash
router.patch("/orders/:id/confirm", requireAuth, async (req, res) => {
  const { txHash } = req.body;
  if (!txHash || typeof txHash !== "string") {
    res.status(400).json({ error: "txHash is required (the on-chain releaseEscrow transaction)" });
    return;
  }

  const orders = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id));
  if (orders.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const order = orders[0];
  if (order.sellerId !== req.user!.userId) {
    res.status(403).json({ error: "Only the seller can confirm release" });
    return;
  }
  if (order.status !== 1) {
    res.status(400).json({ error: "Order is not in 'paid' status" });
    return;
  }

  // Verify release tx on BSC (read-only — server never signs)
  const { confirmed } = await verifyTxHash(txHash);
  if (!confirmed) {
    res.status(400).json({ error: "Release transaction not confirmed on BSC yet. Please wait and try again." });
    return;
  }
  logger.info({ txHash, orderId: order.id }, "releaseEscrow tx verified on-chain");

  const updated = await db
    .update(ordersTable)
    .set({ status: 2, updatedAt: new Date() })
    .where(eq(ordersTable.id, order.id))
    .returning();

  // Update trade counts for both parties
  const [buyer, seller] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, order.buyerId)),
    db.select().from(usersTable).where(eq(usersTable.id, order.sellerId)),
  ]);
  await Promise.all([
    db.update(usersTable).set({ tradeCount: (buyer[0]?.tradeCount ?? 0) + 1 }).where(eq(usersTable.id, order.buyerId)),
    db.update(usersTable).set({ tradeCount: (seller[0]?.tradeCount ?? 0) + 1 }).where(eq(usersTable.id, order.sellerId)),
  ]);

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
