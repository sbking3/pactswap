import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, kycTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";

const router = Router();

// GET /api/kyc/status
router.get("/kyc/status", requireAuth, async (req, res) => {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const user = users[0];

  const submissions = await db.select().from(kycTable).where(eq(kycTable.userId, user.id));
  const latest = submissions[submissions.length - 1] ?? null;

  res.json({
    kycLevel: user.kycLevel,
    kycStatus: user.kycStatus,
    submission: latest
      ? { ...latest, user: { id: user.id, walletAddress: user.walletAddress, name: user.name, kycLevel: user.kycLevel, tradeCount: user.tradeCount, rating: user.rating, createdAt: user.createdAt } }
      : null,
  });
});

// POST /api/kyc/submit
router.post("/kyc/submit", requireAuth, async (req, res) => {
  const { idType, idNumber, selfieUrl } = req.body;
  if (!idType || !idNumber) {
    res.status(400).json({ error: "idType and idNumber are required" });
    return;
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const user = users[0];

  // Determine level based on submitted doc type
  // bvn = level 2, others (passport, nin, drivers_license) + selfie = level 3
  const targetLevel = idType === "bvn" ? 2 : 3;
  if (user.kycLevel >= targetLevel) {
    res.status(400).json({ error: `Already at KYC level ${user.kycLevel}` });
    return;
  }

  const submission = await db.insert(kycTable).values({
    userId: user.id,
    idType,
    idNumber,
    selfieUrl: selfieUrl ?? null,
    status: "pending",
  }).returning();

  // Auto-advance to pending (admin will approve)
  await db.update(usersTable).set({ kycStatus: "pending" }).where(eq(usersTable.id, user.id));

  res.json({
    kycLevel: user.kycLevel,
    kycStatus: "pending",
    submission: submission[0],
  });
});

export default router;
