import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { clerkClient, getAuth } from "@clerk/express";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateDemoDepositDraftBody,
  DeleteDemoDepositParams,
  GetDemoDepositImageParams,
  ReviewDemoDepositBody,
  ReviewDemoDepositParams,
  SubmitDemoDepositParams,
} from "@workspace/api-zod";
import {
  db,
  demoAccountsTable,
  demoDepositsTable,
  demoLedgerEntriesTable,
  demoSpacesTable,
  demoTransactionsTable,
} from "@workspace/db";
import {
  getEnrollmentForUser,
  requireApprovedCustomer,
} from "../lib/customer-enrollment";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const maxImageBytes = 10 * 1024 * 1024;
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type DepositStatus = "draft" | "pending_review" | "reviewed" | "rejected";

function authenticatedUserId(req: Request, res: Response): string | null {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }
  return userId;
}

async function isDepositAdmin(userId: string): Promise<boolean> {
  const user = await clerkClient.users.getUser(userId);
  return user.publicMetadata.role === "admin";
}

async function requireDepositAdmin(
  req: Request,
  res: Response,
): Promise<string | null> {
  const userId = authenticatedUserId(req, res);
  if (!userId) return null;
  try {
    if (!(await isDepositAdmin(userId))) {
      res.status(403).json({ error: "Admin role required." });
      return null;
    }
    return userId;
  } catch {
    res.status(503).json({ error: "Admin authorization is temporarily unavailable." });
    return null;
  }
}

async function ensureDemoSpace(ownerUserId: string): Promise<string> {
  const [existing] = await db
    .select({ id: demoSpacesTable.id })
    .from(demoSpacesTable)
    .where(eq(demoSpacesTable.ownerUserId, ownerUserId))
    .limit(1);
  if (existing) return existing.id;

  await db
    .insert(demoSpacesTable)
    .values({ id: randomUUID(), ownerUserId })
    .onConflictDoNothing({ target: demoSpacesTable.ownerUserId });

  const [created] = await db
    .select({ id: demoSpacesTable.id })
    .from(demoSpacesTable)
    .where(eq(demoSpacesTable.ownerUserId, ownerUserId))
    .limit(1);
  if (!created) throw new Error("Could not create a customer-owned account space.");
  return created.id;
}

function summary(
  row: typeof demoDepositsTable.$inferSelect,
  accountName: string,
) {
  return {
    id: row.id,
    accountName,
    amountCents: row.amountCents,
    status: row.status as DepositStatus,
    createdAt: row.createdAt.toISOString(),
    ...(row.submittedAt
      ? { submittedAt: row.submittedAt.toISOString() }
      : {}),
    ...(row.reviewedAt ? { reviewedAt: row.reviewedAt.toISOString() } : {}),
    ...(row.reviewNote ? { reviewNote: row.reviewNote } : {}),
  };
}

async function validateImage(
  objectPath: string,
  expectedContentType: string,
  expectedSize: number,
) {
  const file = await storage.getObjectEntityFile(objectPath);
  const [metadata] = await file.getMetadata();
  const actualSize = Number(metadata.size);
  const contentType = metadata.contentType;
  if (
    !acceptedImageTypes.has(String(contentType)) ||
    contentType !== expectedContentType ||
    actualSize !== expectedSize ||
    actualSize <= 0 ||
    actualSize > maxImageBytes
  ) {
    throw new Error("INVALID_CHECK_IMAGE");
  }
  return file;
}

async function deleteObjectIfPresent(objectPath: string): Promise<void> {
  try {
    const file = await storage.getObjectEntityFile(objectPath);
    await file.delete({ ignoreNotFound: true });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "ObjectNotFoundError") {
      throw error;
    }
  }
}

router.post("/demo/deposits/drafts", async (req, res): Promise<void> => {
  const access = await requireApprovedCustomer(req, res);
  if (!access) return;
  const { ownerUserId } = access;

  const body = CreateDemoDepositDraftBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid check deposit draft." });
    return;
  }
  const input = body.data;
  if (
    !acceptedImageTypes.has(input.frontContentType) ||
    !acceptedImageTypes.has(input.backContentType) ||
    input.frontSize < 1 ||
    input.backSize < 1 ||
    input.frontSize > maxImageBytes ||
    input.backSize > maxImageBytes ||
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents < 1
  ) {
    res.status(400).json({
      error: "Use supported check images under 10 MB and enter a valid amount.",
    });
    return;
  }

  try {
    const spaceId = await ensureDemoSpace(ownerUserId);
    const [account] = await db
      .select({ id: demoAccountsTable.id })
      .from(demoAccountsTable)
      .where(
        and(
          eq(demoAccountsTable.id, input.accountId),
          eq(demoAccountsTable.spaceId, spaceId),
          eq(demoAccountsTable.isSystem, false),
        ),
      )
      .limit(1);
    if (!account) {
      res.status(404).json({ error: "Account not found." });
      return;
    }

    const [frontUrl, backUrl] = await Promise.all([
      storage.getObjectEntityUploadURL(),
      storage.getObjectEntityUploadURL(),
    ]);
    const frontObjectPath = storage.normalizeObjectEntityPath(frontUrl);
    const backObjectPath = storage.normalizeObjectEntityPath(backUrl);
    const [deposit] = await db
      .insert(demoDepositsTable)
      .values({
        spaceId,
        ownerUserId,
        accountId: account.id,
        amountCents: input.amountCents,
        status: "draft",
        frontObjectPath,
        frontContentType: input.frontContentType,
        frontSize: input.frontSize,
        backObjectPath,
        backContentType: input.backContentType,
        backSize: input.backSize,
      })
      .returning({ id: demoDepositsTable.id });

    res.status(201).json({
      depositId: deposit.id,
      front: { uploadURL: frontUrl, objectPath: frontObjectPath },
      back: { uploadURL: backUrl, objectPath: backObjectPath },
    });
  } catch {
    res.status(503).json({ error: "Private check image storage is unavailable." });
  }
});

router.post(
  "/demo/deposits/:depositId/submit",
  async (req, res): Promise<void> => {
    const access = await requireApprovedCustomer(req, res);
    if (!access) return;
    const { ownerUserId } = access;
    const params = SubmitDemoDepositParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid deposit identifier." });
      return;
    }

    const [deposit] = await db
      .select()
      .from(demoDepositsTable)
      .where(
        and(
          eq(demoDepositsTable.id, params.data.depositId),
          eq(demoDepositsTable.ownerUserId, ownerUserId),
        ),
      )
      .limit(1);
    if (!deposit) {
      res.status(404).json({ error: "Deposit draft not found." });
      return;
    }
    if (deposit.status !== "draft") {
      res.status(409).json({ error: "This draft is no longer ready to submit." });
      return;
    }

    try {
      await Promise.all([
        validateImage(
          deposit.frontObjectPath,
          deposit.frontContentType,
          deposit.frontSize,
        ),
        validateImage(
          deposit.backObjectPath,
          deposit.backContentType,
          deposit.backSize,
        ),
      ]);
      await Promise.all([
        storage.trySetObjectEntityAclPolicy(deposit.frontObjectPath, {
          owner: ownerUserId,
          visibility: "private",
        }),
        storage.trySetObjectEntityAclPolicy(deposit.backObjectPath, {
          owner: ownerUserId,
          visibility: "private",
        }),
      ]);

      const [updated] = await db
        .update(demoDepositsTable)
        .set({ status: "pending_review", submittedAt: new Date() })
        .where(
          and(
            eq(demoDepositsTable.id, deposit.id),
            eq(demoDepositsTable.ownerUserId, ownerUserId),
            eq(demoDepositsTable.status, "draft"),
          ),
        )
        .returning();
      if (!updated) {
        res.status(409).json({ error: "This draft is no longer ready to submit." });
        return;
      }
      const [account] = await db
        .select({ name: demoAccountsTable.name })
        .from(demoAccountsTable)
        .where(eq(demoAccountsTable.id, updated.accountId))
        .limit(1);
      res.json(summary(updated, account?.name ?? "Account"));
    } catch (error) {
      if (
        error instanceof ObjectNotFoundError ||
        (error instanceof Error && error.message === "INVALID_CHECK_IMAGE")
      ) {
        try {
          await Promise.all([
            deleteObjectIfPresent(deposit.frontObjectPath),
            deleteObjectIfPresent(deposit.backObjectPath),
          ]);
          await db
            .delete(demoDepositsTable)
            .where(
              and(
                eq(demoDepositsTable.id, deposit.id),
                eq(demoDepositsTable.ownerUserId, ownerUserId),
                eq(demoDepositsTable.status, "draft"),
              ),
            );
        } catch {
          res.status(503).json({ error: "Could not clean up this incomplete draft." });
          return;
        }
        res.status(400).json({
          error: "Both check images must be uploaded and valid supported files under 10 MB. Start a new submission.",
        });
        return;
      }
      res.status(503).json({ error: "Check image storage is temporarily unavailable." });
    }
  },
);

router.get("/demo/deposits", async (req, res): Promise<void> => {
  const access = await requireApprovedCustomer(req, res);
  if (!access) return;
  const { ownerUserId } = access;
  const rows = await db
    .select({
      deposit: demoDepositsTable,
      accountName: demoAccountsTable.name,
    })
    .from(demoDepositsTable)
    .innerJoin(
      demoAccountsTable,
      eq(demoAccountsTable.id, demoDepositsTable.accountId),
    )
    .where(eq(demoDepositsTable.ownerUserId, ownerUserId))
    .orderBy(desc(demoDepositsTable.createdAt))
    .limit(50);
  res.json(rows.map(({ deposit, accountName }) => summary(deposit, accountName)));
});

router.get("/demo/admin/deposits", async (req, res): Promise<void> => {
  const adminUserId = await requireDepositAdmin(req, res);
  if (!adminUserId) return;
  const rows = await db
    .select({
      deposit: demoDepositsTable,
      accountName: demoAccountsTable.name,
    })
    .from(demoDepositsTable)
    .innerJoin(
      demoAccountsTable,
      eq(demoAccountsTable.id, demoDepositsTable.accountId),
    )
    .where(eq(demoDepositsTable.status, "pending_review"))
    .orderBy(desc(demoDepositsTable.submittedAt))
    .limit(100);
  res.json(
    rows.map(({ deposit, accountName }) => ({
      ...summary(deposit, accountName),
      customerId: deposit.ownerUserId,
    })),
  );
});

router.get(
  "/demo/deposits/:depositId/images/:side",
  async (req, res): Promise<void> => {
    const userId = authenticatedUserId(req, res);
    if (!userId) return;
    const params = GetDemoDepositImageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid deposit image request." });
      return;
    }
    const [deposit] = await db
      .select()
      .from(demoDepositsTable)
      .where(eq(demoDepositsTable.id, params.data.depositId))
      .limit(1);
    if (!deposit) {
      res.status(404).json({ error: "Deposit image not found." });
      return;
    }

    let authorized = deposit.ownerUserId === userId;
    if (authorized) {
      const enrollment = await getEnrollmentForUser(userId);
      authorized = enrollment?.status === "approved";
    }
    if (!authorized) {
      try {
        authorized = await isDepositAdmin(userId);
      } catch {
        res.status(503).json({ error: "Admin authorization is temporarily unavailable." });
        return;
      }
    }
    if (!authorized) {
      res.status(404).json({ error: "Deposit image not found." });
      return;
    }

    try {
      const objectPath =
        params.data.side === "front"
          ? deposit.frontObjectPath
          : deposit.backObjectPath;
      const file = await storage.getObjectEntityFile(objectPath);
      const response = await storage.downloadObject(file, 0);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.setHeader("Cache-Control", "private, no-store");
      if (response.body) {
        const { Readable } = await import("node:stream");
        Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        ).pipe(res);
      } else {
        res.end();
      }
    } catch {
      res.status(404).json({ error: "Deposit image not found." });
    }
  },
);

router.patch(
  "/demo/admin/deposits/:depositId/review",
  async (req, res): Promise<void> => {
    const adminUserId = await requireDepositAdmin(req, res);
    if (!adminUserId) return;
    const params = ReviewDemoDepositParams.safeParse(req.params);
    const body = ReviewDemoDepositBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid deposit review." });
      return;
    }
    const note = body.data.note?.trim() ?? "";
    if (body.data.decision === "rejected" && !note) {
      res.status(400).json({ error: "Add a reason when rejecting a submission." });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [deposit] = await tx
        .select()
        .from(demoDepositsTable)
        .where(eq(demoDepositsTable.id, params.data.depositId))
        .for("update");
      if (!deposit) {
        return { error: "Deposit not found.", code: 404 as const };
      }
      if (deposit.status === "posted" && body.data.decision === "posted") {
        return { updated: deposit };
      }
      if (deposit.status !== "pending_review") {
        return { error: "This submission was already reviewed.", code: 409 as const };
      }

      const reviewedAt = new Date();
      if (body.data.decision === "rejected") {
        const [updated] = await tx
          .update(demoDepositsTable)
          .set({
            status: "rejected",
            reviewerUserId: adminUserId,
            reviewNote: note || null,
            reviewedAt,
          })
          .where(eq(demoDepositsTable.id, deposit.id))
          .returning();
        return { updated };
      }

      const [account] = await tx
        .select()
        .from(demoAccountsTable)
        .where(
          and(
            eq(demoAccountsTable.id, deposit.accountId),
            eq(demoAccountsTable.spaceId, deposit.spaceId),
            eq(demoAccountsTable.isSystem, false),
          ),
        )
        .for("update");
      if (!account) {
        return { error: "The destination account is unavailable.", code: 409 as const };
      }
      const [clearingAccount] = await tx
        .select()
        .from(demoAccountsTable)
        .where(
          and(
            eq(demoAccountsTable.spaceId, deposit.spaceId),
            eq(demoAccountsTable.kind, "clearing"),
          ),
        )
        .for("update");
      if (!clearingAccount) {
        return { error: "The ledger clearing account is unavailable.", code: 503 as const };
      }

      const [ledgerTransaction] = await tx
        .insert(demoTransactionsTable)
        .values({
          spaceId: deposit.spaceId,
          primaryAccountId: deposit.accountId,
          name: "Mobile check deposit",
          category: "Deposit",
          status: "Posted",
          idempotencyKey: `mobile-check-${deposit.id}`,
          requestFingerprint: `${deposit.id}:${deposit.accountId}:${deposit.amountCents}`,
        })
        .onConflictDoNothing()
        .returning({ id: demoTransactionsTable.id });
      if (!ledgerTransaction) {
        return { error: "This deposit has already been posted.", code: 409 as const };
      }

      await tx.insert(demoLedgerEntriesTable).values([
        {
          transactionId: ledgerTransaction.id,
          accountId: deposit.accountId,
          amountCents: deposit.amountCents,
        },
        {
          transactionId: ledgerTransaction.id,
          accountId: clearingAccount.id,
          amountCents: -deposit.amountCents,
        },
      ]);

      const [updated] = await tx
        .update(demoDepositsTable)
        .set({
          status: "posted",
          reviewerUserId: adminUserId,
          reviewNote: note || null,
          reviewedAt,
        })
        .where(eq(demoDepositsTable.id, deposit.id))
        .returning();
      return { updated };
    });
    if ("error" in result) {
      res.status(result.code ?? 500).json({ error: result.error });
      return;
    }
    const updated = result.updated;
    if (!updated) {
      res.status(500).json({ error: "Could not save the review." });
      return;
    }
    const [account] = await db
      .select({ name: demoAccountsTable.name })
      .from(demoAccountsTable)
      .where(eq(demoAccountsTable.id, updated.accountId))
      .limit(1);
      res.json(summary(updated, account?.name ?? "Account"));
  },
);

router.delete(
  "/demo/deposits/:depositId",
  async (req, res): Promise<void> => {
    const access = await requireApprovedCustomer(req, res);
    if (!access) return;
    const { ownerUserId } = access;
    const params = DeleteDemoDepositParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid deposit identifier." });
      return;
    }
    const [deposit] = await db
      .select()
      .from(demoDepositsTable)
      .where(
        and(
          eq(demoDepositsTable.id, params.data.depositId),
          eq(demoDepositsTable.ownerUserId, ownerUserId),
        ),
      )
      .limit(1);
    if (!deposit) {
      res.status(404).json({ error: "Deposit not found." });
      return;
    }
    try {
      await Promise.all([
        deleteObjectIfPresent(deposit.frontObjectPath),
        deleteObjectIfPresent(deposit.backObjectPath),
      ]);
      await db
        .delete(demoDepositsTable)
        .where(
          and(
            eq(demoDepositsTable.id, deposit.id),
            eq(demoDepositsTable.ownerUserId, ownerUserId),
          ),
        );
      res.status(204).end();
    } catch {
      res.status(503).json({ error: "Could not securely delete this submission." });
    }
  },
);

export default router;
