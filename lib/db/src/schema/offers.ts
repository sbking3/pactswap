import { pgTable, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const offersTable = pgTable("offers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  escrowId: text("escrow_id").unique().notNull(),
  sellerId: text("seller_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  asset: text("asset").default("USDT").notNull(),
  priceNaira: real("price_naira").notNull(),
  amountUsdt: real("amount_usdt").notNull(),
  minTrade: real("min_trade").notNull(),
  maxTrade: real("max_trade").notNull(),
  paymentMethod: text("payment_method").default("Bank Transfer").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOfferSchema = createInsertSchema(offersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offersTable.$inferSelect;
