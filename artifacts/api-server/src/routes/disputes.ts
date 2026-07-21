import { Router } from "express";
import { db } from "@workspace/db";
import { disputesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/authMiddleware";

const router = Router();

// GET /api/disputes — admin only
router.get("/disputes", requireAdmin, async (req, res) => {
  const { status } = req.query;
  let disputes = await db.select().from(disputesTable);
  if (status) {
    disputes = disputes.filter(d => d.status === status);
  }
  res.json(disputes);
});

// GET /api/disputes/:id
router.get("/disputes/:id", requireAuth, async (req, res) => {
  const disputes = await db.select().from(disputesTable).where(eq(disputesTable.id, req.params.id as string));
  if (disputes.length === 0) {
    res.status(404).json({ error: "Dispute not found" });
    return;
  }
  res.json(disputes[0]);
});

// PATCH /api/disputes/:id — admin only
router.patch("/disputes/:id", requireAdmin, async (req, res) => {
  const { status, resolution } = req.body;
  if (!status || !["resolved", "rejected"].includes(status)) {
    res.status(400).json({ error: "status must be 'resolved' or 'rejected'" });
    return;
  }

  const disputes = await db.select().from(disputesTable).where(eq(disputesTable.id, req.params.id as string));
  if (disputes.length === 0) {
    res.status(404).json({ error: "Dispute not found" });
    return;
  }

  const updated = await db
    .update(disputesTable)
    .set({ status, resolution: resolution ?? null, updatedAt: new Date() })
    .where(eq(disputesTable.id, req.params.id as string))
    .returning();

  res.json(updated[0]);
});

export default router;
