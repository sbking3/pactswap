import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { offersTable } from "./offers";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  escrowId: text("escrow_id").unique().notNull(),
  orderId: text("order_id").notNull().$defaultFn(() => crypto.randomUUID()),
  offerId: text("offer_id").references(() => offersTable.id),
  buyerId: text("buyer_id").notNull().references(() => usersTable.id),
  sellerId: text("seller_id").notNull().references(() => usersTable.id),
  amountUsdt: real("amount_usdt").notNull(),
  priceNaira: real("price_naira").notNull(),
  // 0=created, 1=paid, 2=released, 3=cancelled, 4=disputed
  status: integer("status").default(0).notNull(),
  contractTx: text("contract_tx"),
  // Order-level fields saved at creation time
  email: text("email"),
  token: text("token"),
  sellerAddress: text("seller_address"),
  buyerAddress: text("buyer_address"),
  chainId: integer("chain_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, orderId: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
