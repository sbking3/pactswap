import { Router } from "express";
import { ethers } from "ethers";
import { db } from "@workspace/db";
import { ordersTable, offersTable, usersTable, disputesTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { verifyTxHash, readEscrow } from "../lib/contract";
import { logger } from "../lib/logger";

const router = Router();

/** Public profile — safe to show to anyone */
function toPublicProfile(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    walletAddress: u.walletAddress,
    name: u.name,
    kycLevel: u.kycLevel,
    tradeCount: u.tradeCount,
    rating: u.rating,
    createdAt: u.createdAt,
  };
}

/**
 * Seller profile shown to the buyer in a trade.
 * Includes bank details so the buyer knows where to send fiat.
 * This is intentionally more detailed than toPublicProfile.
 */
function toSellerProfile(u: typeof usersTable.$inferSelect) {
  return {
    ...toPublicProfile(u),
    bankName: u.bankName ?? null,
    accountNumber: u.accountNumber ?? null,
    accountName: u.accountName ?? null,
  };
}

async function enrichOrder(order: typeof ordersTable.$inferSelect) {
  const [buyers, sellers, disputes] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, order.buyerId)),
    db.select().from(usersTable).where(eq(usersTable.id, order.sellerId)),
    db.select().from(disputesTable).where(eq(disputesTable.orderId, order.id)),
  ]);
  const offers = order.offerId
    ? await db.select().from(offersTable).where(eq(offersTable.id, order.offerId))
    : [];
  return {
    ...order,
    buyer:  buyers[0]  ? toPublicProfile(buyers[0])  : null,
    // Seller includes bank details — buyer needs them to send fiat payment
    seller: sellers[0] ? toSellerProfile(sellers[0]) : null,
    offer:  offers[0]  ?? null,
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

/**
 * POST /api/orders/initiate
 *
 * Buyer-initiated order. No on-chain escrow verification — the buyer has
 * already agreed to send fiat and will mark payment via PATCH .../paid.
 * The seller will lock USDT on-chain (using the same escrowId stored here)
 * once they see the order on their dashboard.
 *
 * This route MUST be registered before /orders/:id to avoid the ":id" param
 * swallowing the literal "initiate" segment.
 */
router.post("/orders/initiate", requireAuth, async (req, res) => {
  const walletAddress = req.user!.address ?? req.user!.walletAddress;
  logger.info(`=== POST /api/orders/initiate === Body: ${JSON.stringify(req.body)} | Wallet: ${walletAddress}`);

  const { email, amount, token, sellerAddress, escrowId, priceNaira, offerId } = req.body;

  const fail = (msg: string) => { res.status(400).json({ error: msg }); };

  if (!email || typeof email !== "string") return void fail("Missing field: email");
  if (amount === undefined || typeof amount !== "number" || amount <= 0)
    return void fail("amount must be a positive number");
  if (!token || typeof token !== "string") return void fail("Missing field: token");
  if (!sellerAddress || !ethers.isAddress(sellerAddress)) return void fail("Invalid sellerAddress");
  if (!escrowId || typeof escrowId !== "string") return void fail("Missing field: escrowId");
  if (!ethers.isAddress(walletAddress)) return void fail("Wallet address must be a valid Ethereum address");

  // Look up seller
  const sellers = await db.select().from(usersTable)
    .where(eq(usersTable.walletAddress, sellerAddress.toLowerCase()));
  if (sellers.length === 0) {
    res.status(400).json({ error: "Seller wallet address not registered on the platform" });
    return;
  }

  // Prevent buyer and seller being the same account
  if (walletAddress.toLowerCase() === sellerAddress.toLowerCase()) {
    res.status(400).json({ error: "You cannot trade with yourself" });
    return;
  }

  const decimals = (token.toUpperCase() === "USDT" || token.toUpperCase() === "USDC") ? 6 : 18;
  const chainId = req.user!.chainId ?? 56;

  let savedOrder: typeof ordersTable.$inferSelect;
  try {
    const inserted = await db.insert(ordersTable).values({
      escrowId,
      buyerId: req.user!.userId,
      sellerId: sellers[0].id,
      offerId: typeof offerId === "string" ? offerId : null,
      amountUsdt: amount,
      priceNaira: typeof priceNaira === "number" && priceNaira > 0 ? priceNaira : 0,
      status: 0,
      contractTx: null, // no on-chain tx yet — seller will lock escrow
      email,
      token,
      sellerAddress: ethers.getAddress(sellerAddress),
      buyerAddress: ethers.getAddress(walletAddress),
      chainId,
    }).returning();
    savedOrder = inserted[0];
    logger.info(`✓ Buyer-initiated order saved — orderId: ${savedOrder.id}`);
  } catch (err: any) {
    logger.error({ err: err?.message }, "✗ DB save failed for buyer-initiated order");
    res.status(500).json({ error: "Failed to save order — please try again" });
    return;
  }

  res.status(201).json({ success: true, orderId: savedOrder.id });
  // silence unused-var warning
  void decimals;
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
  const { email, amount, token, sellerAddress, txHash, priceNaira, offerId } = req.body;

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

  // ── 5. Validate escrowId ─────────────────────────────────────────────────
  // Frontend generates escrowId before calling createEscrow() on-chain.
  const { escrowId } = req.body;
  if (!escrowId || typeof escrowId !== "string") {
    return void fail("Missing field: escrowId");
  }

  // ── 6. Verify on-chain by reading escrow state (NOT signing anything) ─────
  // readEscrow reads contract storage — more reliable than verifyTxHash
  // because BSC RPC nodes can lag by 1-3 blocks after tx.wait() resolves.
  let onChainEscrow: Awaited<ReturnType<typeof readEscrow>>;
  try {
    onChainEscrow = await readEscrow(escrowId);
  } catch (err: any) {
    logger.error({ err: err?.message, escrowId }, "✗ readEscrow RPC error");
    res.status(502).json({ error: "Could not read escrow from BSC. RPC may be busy — please try again." });
    return;
  }

  // Escrow must have a real buyer address (zero address means it was never created)
  const ZERO = "0x0000000000000000000000000000000000000000";
  if (!onChainEscrow.buyer || onChainEscrow.buyer.toLowerCase() === ZERO) {
    logger.warn({ escrowId }, "✗ Escrow not found on-chain");
    res.status(400).json({ error: "Escrow not found on-chain. Make sure your wallet transaction was confirmed on BSC." });
    return;
  }

  // Buyer address must match the authenticated wallet
  if (onChainEscrow.buyer.toLowerCase() !== walletAddress.toLowerCase()) {
    logger.warn({ escrowId, buyer: onChainEscrow.buyer, wallet: walletAddress }, "✗ Escrow buyer mismatch");
    res.status(400).json({ error: "Escrow buyer does not match your wallet." });
    return;
  }

  // Seller address must match the offer
  if (onChainEscrow.seller.toLowerCase() !== sellerAddress.toLowerCase()) {
    logger.warn({ escrowId }, "✗ Escrow seller mismatch");
    res.status(400).json({ error: "Escrow seller does not match the selected offer." });
    return;
  }

  logger.info(`✓ Escrow verified on-chain — buyer: ${onChainEscrow.buyer}, seller: ${onChainEscrow.seller}`);

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
        offerId: typeof offerId === "string" ? offerId : null,
        amountUsdt: amount,
        // Use the offer's priceNaira sent by the frontend; fall back to 0 if missing
        priceNaira: typeof priceNaira === "number" && priceNaira > 0 ? priceNaira : 0,
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
  const orders = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id as string));
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
  const orders = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id as string));
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

// PATCH /api/orders/:id/lock
// Seller calls this AFTER lockEscrowBySeller() is confirmed on-chain.
// Verifies the escrow exists on-chain (buyer address set), records contractTx, keeps status=0.
router.patch("/orders/:id/lock", requireAuth, async (req, res) => {
  const { txHash } = req.body;
  if (!txHash || typeof txHash !== "string") {
    res.status(400).json({ error: "txHash is required" });
    return;
  }

  const orders = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id as string));
  if (orders.length === 0) { res.status(404).json({ error: "Order not found" }); return; }
  const order = orders[0];

  if (order.sellerId !== req.user!.userId) {
    res.status(403).json({ error: "Only the seller can lock escrow" });
    return;
  }
  if (order.status !== 0) {
    res.status(400).json({ error: "Order is not in created status" });
    return;
  }
  if (order.contractTx) {
    res.status(400).json({ error: "Escrow already locked" });
    return;
  }

  // Verify on-chain: escrow must exist (buyer address set) and not already released
  let escrowState: Awaited<ReturnType<typeof readEscrow>>;
  try {
    escrowState = await readEscrow(order.escrowId);
  } catch (err: any) {
    logger.error({ err: err?.message, escrowId: order.escrowId }, "✗ readEscrow RPC error during lock");
    res.status(502).json({ error: "Could not read escrow from BSC. RPC may be busy — try again." });
    return;
  }

  if (escrowState.buyer === "0x0000000000000000000000000000000000000000") {
    res.status(400).json({ error: "Escrow not found on-chain yet. Please wait for BSC confirmation." });
    return;
  }

  logger.info({ txHash, orderId: order.id, escrowId: order.escrowId }, "✓ lockEscrowBySeller confirmed on-chain");

  const updated = await db
    .update(ordersTable)
    .set({ contractTx: txHash, updatedAt: new Date() })
    .where(eq(ordersTable.id, order.id))
    .returning();

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

  const orders = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id as string));
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

  // Verify release by reading escrow state directly (more reliable than txHash check —
  // BSC RPC can lag 1-3 blocks, and verifyTxHash only proves a tx landed, not that
  // the escrow.released flag is actually true on-chain).
  let escrowState: Awaited<ReturnType<typeof readEscrow>>;
  try {
    escrowState = await readEscrow(order.escrowId);
  } catch (err: any) {
    logger.error({ err: err?.message, escrowId: order.escrowId }, "✗ readEscrow RPC error during confirm");
    res.status(502).json({ error: "Could not read escrow from BSC. RPC may be busy — please try again." });
    return;
  }

  if (!escrowState.released) {
    logger.warn({ escrowId: order.escrowId, txHash }, "✗ Escrow released flag is false — tx may not have landed yet");
    res.status(400).json({ error: "Escrow is not released on-chain yet. Please wait a moment and try again." });
    return;
  }
  logger.info({ txHash, orderId: order.id, escrowId: order.escrowId }, "✓ releaseEscrow confirmed — escrow.released = true");

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
  const orders = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id as string));
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verify-trade-opened
// Called by the frontend AFTER the user's wallet has signed createEscrow().
// Server is READ-ONLY — it never sends any transaction.
// Returns { valid: true, escrow } when the on-chain escrow matches the claim.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/verify-trade-opened", requireAuth, async (req, res) => {
  const { escrowId, sellerAddress, amountUsdt } = req.body;
  const walletAddress = req.user!.address ?? req.user!.walletAddress;

  if (!escrowId || typeof escrowId !== "string") {
    res.status(400).json({ error: "Missing field: escrowId" });
    return;
  }
  if (!sellerAddress || !ethers.isAddress(sellerAddress)) {
    res.status(400).json({ error: "Invalid sellerAddress" });
    return;
  }

  let escrow: Awaited<ReturnType<typeof readEscrow>>;
  try {
    escrow = await readEscrow(escrowId);
  } catch (err: any) {
    logger.error({ err: err?.message, escrowId }, "verify-trade-opened: readEscrow RPC error");
    res.status(502).json({ error: "Could not read escrow from BSC. RPC may be busy — please try again." });
    return;
  }

  const ZERO = "0x0000000000000000000000000000000000000000";
  if (!escrow.buyer || escrow.buyer.toLowerCase() === ZERO) {
    res.status(400).json({ error: "Escrow not found on-chain. Wallet transaction may not be confirmed yet." });
    return;
  }
  if (escrow.buyer.toLowerCase() !== walletAddress.toLowerCase()) {
    res.status(400).json({ error: "Escrow buyer does not match your wallet." });
    return;
  }
  if (escrow.seller.toLowerCase() !== sellerAddress.toLowerCase()) {
    res.status(400).json({ error: "Escrow seller does not match the selected offer." });
    return;
  }

  logger.info({ escrowId, buyer: escrow.buyer, seller: escrow.seller }, "✓ verify-trade-opened: escrow confirmed on-chain");

  res.json({
    valid: true,
    escrow: {
      buyer:    escrow.buyer,
      seller:   escrow.seller,
      amount:   escrow.amount.toString(),
      released: escrow.released,
      refunded: escrow.refunded,
    },
  });
});

export default router;
