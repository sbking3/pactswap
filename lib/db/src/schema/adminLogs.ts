import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const adminLogsTable = pgTable("admin_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  action: text("action").notNull(),
  adminWallet: text("admin_wallet").notNull(),
  /** Target of the action — wallet address, orderId, offerId, etc. */
  target: text("target"),
  /** Extra context stored as JSON string */
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AdminLog = typeof adminLogsTable.$inferSelect;
