import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import {
  customerApplicationsTable,
  db,
  demoSpacesTable,
  type CustomerApplication,
} from "@workspace/db";

export function newCustomerId(): string {
  return `CL-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

export function newLedgerAccountNumber(): string {
  return String(randomInt(1_000_000_000, 9_999_999_999));
}

export async function getEnrollmentForUser(
  ownerUserId: string,
): Promise<CustomerApplication | null> {
  const [current] = await db
    .select()
    .from(customerApplicationsTable)
    .where(eq(customerApplicationsTable.ownerUserId, ownerUserId))
    .limit(1);
  if (current) return current;

  // Existing customers keep their opening balances and are grandfathered in.
  const [existingSpace] = await db
    .select({ id: demoSpacesTable.id })
    .from(demoSpacesTable)
    .where(eq(demoSpacesTable.ownerUserId, ownerUserId))
    .limit(1);
  if (!existingSpace) return null;

  const [created] = await db
    .insert(customerApplicationsTable)
    .values({
      ownerUserId,
      accountType: "personal",
      status: "approved",
      customerId: newCustomerId(),
      accountNumber: newLedgerAccountNumber(),
      reviewedAt: new Date(),
    })
    .onConflictDoNothing({ target: customerApplicationsTable.ownerUserId })
    .returning();
  if (created) return created;

  const [raced] = await db
    .select()
    .from(customerApplicationsTable)
    .where(eq(customerApplicationsTable.ownerUserId, ownerUserId))
    .limit(1);
  return raced ?? null;
}

export async function requireApprovedCustomer(
  req: Request,
  res: Response,
): Promise<{ ownerUserId: string; application: CustomerApplication } | null> {
  const ownerUserId = getAuth(req).userId;
  if (!ownerUserId) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }

  const application = await getEnrollmentForUser(ownerUserId);
  if (!application || application.status !== "approved") {
    res.status(403).json({
      error: "Complete enrollment and wait for Admin approval before using customer account features.",
      code: "CUSTOMER_APPROVAL_REQUIRED",
    });
    return null;
  }

  return { ownerUserId, application };
}
