import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailOtpsTable = pgTable("email_otps", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id"),
  email: text("email").notNull(),
  code: text("code").notNull(),
  type: text("type").default("signup").notNull(), // "signup" | "login"
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  blockedUntil: timestamp("blocked_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmailOtpSchema = createInsertSchema(emailOtpsTable).omit({ id: true, createdAt: true });
export type InsertEmailOtp = z.infer<typeof insertEmailOtpSchema>;
export type EmailOtp = typeof emailOtpsTable.$inferSelect;
