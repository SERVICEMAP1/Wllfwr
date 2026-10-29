import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const demoSpacesTable = pgTable(
  "demo_spaces",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: text("owner_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("demo_spaces_owner_user_unique").on(table.ownerUserId)],
);

export const demoAccountsTable = pgTable(
  "demo_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => demoSpacesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    maskedNumber: text("masked_number").notNull(),
    currency: text("currency").notNull().default("USD"),
    isSystem: boolean("is_system").notNull().default(false),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("demo_accounts_space_kind_unique").on(table.spaceId, table.kind)],
);

export const demoTransactionsTable = pgTable(
  "demo_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => demoSpacesTable.id, { onDelete: "cascade" }),
    primaryAccountId: uuid("primary_account_id")
      .notNull()
      .references(() => demoAccountsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("demo_transactions_space_idempotency_unique").on(
      table.spaceId,
      table.idempotencyKey,
    ),
    index("demo_transactions_space_created_idx").on(
      table.spaceId,
      table.createdAt,
    ),
  ],
);

export const demoLedgerEntriesTable = pgTable(
  "demo_ledger_entries",
  {
    id: serial("id").primaryKey(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => demoTransactionsTable.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => demoAccountsTable.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("demo_ledger_entries_transaction_idx").on(table.transactionId),
    index("demo_ledger_entries_account_idx").on(table.accountId),
  ],
);

export const demoBillsTable = pgTable(
  "demo_bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => demoSpacesTable.id, { onDelete: "cascade" }),
    payee: text("payee").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("demo_bills_space_payee_unique").on(table.spaceId, table.payee)],
);

export const demoCardsTable = pgTable(
  "demo_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => demoSpacesTable.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => demoAccountsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lastFour: text("last_four").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("demo_cards_space_last_four_unique").on(table.spaceId, table.lastFour)],
);

export const demoDepositsTable = pgTable(
  "demo_deposits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => demoSpacesTable.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => demoAccountsTable.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull().default("draft"),
    frontObjectPath: text("front_object_path").notNull(),
    frontContentType: text("front_content_type").notNull(),
    frontSize: integer("front_size").notNull(),
    backObjectPath: text("back_object_path").notNull(),
    backContentType: text("back_content_type").notNull(),
    backSize: integer("back_size").notNull(),
    reviewerUserId: text("reviewer_user_id"),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    index("demo_deposits_owner_created_idx").on(
      table.ownerUserId,
      table.createdAt,
    ),
    index("demo_deposits_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const insertDemoAccountSchema = createInsertSchema(demoAccountsTable).omit({
  id: true,
  createdAt: true,
});
export const insertDemoTransactionSchema = createInsertSchema(
  demoTransactionsTable,
).omit({ id: true, createdAt: true });
export const insertDemoLedgerEntrySchema = createInsertSchema(
  demoLedgerEntriesTable,
).omit({ id: true, createdAt: true });
export const insertDemoBillSchema = createInsertSchema(demoBillsTable).omit({
  id: true,
  createdAt: true,
});
export const insertDemoCardSchema = createInsertSchema(demoCardsTable).omit({
  id: true,
  createdAt: true,
});
export const insertDemoDepositSchema = createInsertSchema(demoDepositsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertDemoAccount = z.infer<typeof insertDemoAccountSchema>;
export type InsertDemoTransaction = z.infer<typeof insertDemoTransactionSchema>;
export type InsertDemoLedgerEntry = z.infer<typeof insertDemoLedgerEntrySchema>;
export type InsertDemoBill = z.infer<typeof insertDemoBillSchema>;
export type InsertDemoCard = z.infer<typeof insertDemoCardSchema>;
export type DemoAccount = typeof demoAccountsTable.$inferSelect;
export type DemoTransaction = typeof demoTransactionsTable.$inferSelect;
export type DemoLedgerEntry = typeof demoLedgerEntriesTable.$inferSelect;
export type DemoBill = typeof demoBillsTable.$inferSelect;
export type DemoCard = typeof demoCardsTable.$inferSelect;
export type DemoDeposit = typeof demoDepositsTable.$inferSelect;
