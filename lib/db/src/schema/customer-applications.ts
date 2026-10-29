import { createInsertSchema } from "drizzle-zod";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const customerApplicationsTable = pgTable(
  "customer_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id").notNull(),
    fullName: text("full_name"),
    phone: text("phone"),
    homeAddress: text("home_address"),
    accountType: text("account_type").notNull().default("personal"),
    status: text("status").notNull().default("pending_review"),
    infoRequest: text("info_request"),
    applicantResponse: text("applicant_response"),
    customerId: text("customer_id"),
    accountNumber: text("account_number"),
    reviewerUserId: text("reviewer_user_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("customer_applications_owner_unique").on(table.ownerUserId),
    uniqueIndex("customer_applications_customer_id_unique").on(table.customerId),
    uniqueIndex("customer_applications_account_number_unique").on(table.accountNumber),
    index("customer_applications_status_submitted_idx").on(
      table.status,
      table.submittedAt,
    ),
  ],
);

export const insertCustomerApplicationSchema = createInsertSchema(
  customerApplicationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertCustomerApplication = z.infer<
  typeof insertCustomerApplicationSchema
>;
export type CustomerApplication = typeof customerApplicationsTable.$inferSelect;
