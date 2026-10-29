import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateDemoBillPaymentBody,
  CreateDemoBillPaymentResponse,
  CreateDemoTransferBody,
  CreateDemoTransferResponse,
  GetDemoOverviewResponse,
  UpdateDemoCardBody,
  UpdateDemoCardParams,
  UpdateDemoCardResponse,
} from "@workspace/api-zod";
import {
  db,
  demoAccountsTable,
  demoBillsTable,
  demoCardsTable,
  demoLedgerEntriesTable,
  demoSpacesTable,
  demoTransactionsTable,
} from "@workspace/db";
import { requireApprovedCustomer } from "../lib/customer-enrollment";

const router: IRouter = Router();

const fingerprint = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const dateAfterDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function ensureDemoSpace(
  ownerUserId: string,
  accountNumber?: string,
): Promise<string> {
  const [existingSpace] = await db
    .select()
    .from(demoSpacesTable)
    .where(eq(demoSpacesTable.ownerUserId, ownerUserId))
    .limit(1);
  if (!existingSpace) {
    await db
      .insert(demoSpacesTable)
      .values({ id: randomUUID(), ownerUserId })
      .onConflictDoNothing({ target: demoSpacesTable.ownerUserId });
  }
  const [ownedSpace] = await db
    .select()
    .from(demoSpacesTable)
    .where(eq(demoSpacesTable.ownerUserId, ownerUserId))
    .limit(1);
  if (!ownedSpace) {
    throw new Error("Could not create a customer-owned account space.");
  }
  const spaceId = ownedSpace.id;
  const isNewSpace = !existingSpace;

  await db.transaction(async (tx) => {

    await tx
      .insert(demoAccountsTable)
      .values([
        {
          spaceId,
          name: "Everyday Checking",
          kind: "checking",
          maskedNumber: isNewSpace && accountNumber
            ? `•• ${accountNumber.slice(-4)}`
            : "•• 0824",
        },
        {
          spaceId,
          name: "Rainy Day Savings",
          kind: "savings",
          maskedNumber: "•• 1906",
        },
        {
          spaceId,
          name: "Internal card profile",
          kind: "credit",
          maskedNumber: "•• 4481",
        },
        {
          spaceId,
          name: "Demo clearing account",
          kind: "clearing",
          maskedNumber: "•• 0000",
          isSystem: true,
        },
      ])
      .onConflictDoNothing();

    const accounts = await tx
      .select()
      .from(demoAccountsTable)
      .where(eq(demoAccountsTable.spaceId, spaceId));
    const byKind = new Map(accounts.map((account) => [account.kind, account]));
    const checking = byKind.get("checking");
    const savings = byKind.get("savings");
    const credit = byKind.get("credit");
    const clearing = byKind.get("clearing");
    if (!checking || !savings || !credit || !clearing) {
      throw new Error("Account setup is incomplete.");
    }

    const now = Date.now();
    const seedTransactions = [
      {
        key: "seed:opening-checking",
        accountId: checking.id,
        name: "Everyday Checking opening balance",
        category: "Opening balance",
        amountCents: 223_731,
        minutesAgo: 10_080,
      },
      {
        key: "seed:opening-savings",
        accountId: savings.id,
        name: "Rainy Day Savings opening balance",
        category: "Opening balance",
        amountCents: 1_305_000,
        minutesAgo: 10_080,
      },
      {
        key: "seed:opening-credit",
        accountId: credit.id,
        name: "Internal card profile opening balance",
        category: "Opening balance",
        amountCents: 0,
        minutesAgo: 10_080,
      },
      {
        key: "seed:market",
        accountId: checking.id,
        name: "Juniper Market",
        category: "Groceries",
        amountCents: -6_842,
        minutesAgo: 22,
      },
      {
        key: "seed:deposit",
        accountId: checking.id,
        name: "Northstar Studio",
        category: "Deposit",
        amountCents: 245_000,
        minutesAgo: 155,
      },
      {
        key: "seed:coffee",
        accountId: credit.id,
        name: "Morrow Coffee Roasters",
        category: "Dining",
        amountCents: 1_475,
        minutesAgo: 1_500,
      },
      {
        key: "seed:electric",
        accountId: checking.id,
        name: "Citylight Electric",
        category: "Utilities",
        amountCents: -9_218,
        minutesAgo: 2_700,
      },
      {
        key: "seed:bookshop",
        accountId: credit.id,
        name: "Harbor Bookshop",
        category: "Shopping",
        amountCents: 3_250,
        minutesAgo: 4_100,
      },
      {
        key: "seed:transfer",
        accountId: checking.id,
        name: "Transfer from Rainy Day Savings",
        category: "Transfer",
        amountCents: 30_000,
        minutesAgo: 5_500,
        otherAccountId: savings.id,
      },
    ];

    if (!isNewSpace) {
      for (const item of seedTransactions) {
        const [created] = await tx
          .insert(demoTransactionsTable)
          .values({
            spaceId,
            primaryAccountId: item.accountId,
            name: item.name,
            category: item.category,
            status: "Opening balance",
            idempotencyKey: item.key,
            requestFingerprint: fingerprint(item),
            createdAt: new Date(now - item.minutesAgo * 60_000),
          })
          .onConflictDoNothing()
          .returning({ id: demoTransactionsTable.id });
        if (!created || item.amountCents === 0) continue;

        if (item.otherAccountId) {
          await tx.insert(demoLedgerEntriesTable).values([
            {
              transactionId: created.id,
              accountId: item.otherAccountId,
              amountCents: -item.amountCents,
            },
            {
              transactionId: created.id,
              accountId: item.accountId,
              amountCents: item.amountCents,
            },
          ]);
        } else {
          await tx.insert(demoLedgerEntriesTable).values([
            {
              transactionId: created.id,
              accountId: item.accountId,
              amountCents: item.amountCents,
            },
            {
              transactionId: created.id,
              accountId: clearing.id,
              amountCents: -item.amountCents,
            },
          ]);
        }
      }
    }

    await tx
      .insert(demoCardsTable)
      .values({
        spaceId,
        accountId: credit.id,
        name: "Internal card profile",
        lastFour: isNewSpace && accountNumber
          ? accountNumber.slice(-4)
          : "4481",
        status: "active",
      })
      .onConflictDoNothing();

    if (!isNewSpace) {
      await tx
        .insert(demoBillsTable)
        .values([
          {
            spaceId,
            payee: "Citylight Electric",
            dueDate: dateAfterDays(2),
            amountCents: 9_218,
          },
          {
            spaceId,
            payee: "Pine & Peak Internet",
            dueDate: dateAfterDays(5),
            amountCents: 6_400,
          },
          {
            spaceId,
            payee: "Willow Water Co.",
            dueDate: dateAfterDays(9),
            amountCents: 3_846,
          },
        ])
        .onConflictDoNothing();
    }
  });
  return spaceId;
}

async function getAccountBalance(accountId: string): Promise<number> {
  const [row] = await db
    .select({
      balanceCents: sql<number>`coalesce(sum(${demoLedgerEntriesTable.amountCents}), 0)::int`,
    })
    .from(demoLedgerEntriesTable)
    .where(eq(demoLedgerEntriesTable.accountId, accountId));
  return Number(row?.balanceCents ?? 0);
}

router.get("/demo/overview", async (req, res): Promise<void> => {
  const access = await requireApprovedCustomer(req, res);
  if (!access) return;

  const { ownerUserId, application } = access;
  const spaceId = await ensureDemoSpace(ownerUserId, application.accountNumber ?? undefined);
  const accountRows = await db
    .select()
    .from(demoAccountsTable)
    .where(
      and(
        eq(demoAccountsTable.spaceId, spaceId),
        eq(demoAccountsTable.isSystem, false),
        inArray(demoAccountsTable.kind, ["checking", "savings"]),
      ),
    );
  const accounts = await Promise.all(
    accountRows.map(async (account) => ({
      id: account.id,
      name: account.name,
      kind: account.kind,
      maskedNumber: account.maskedNumber,
      currency: account.currency,
      balanceCents: await getAccountBalance(account.id),
      status: account.status,
    })),
  );

  const activityRows = await db
    .select({
      id: demoTransactionsTable.id,
      name: demoTransactionsTable.name,
      date: demoTransactionsTable.createdAt,
      account: demoAccountsTable.name,
      accountKind: demoAccountsTable.kind,
      amountCents: demoLedgerEntriesTable.amountCents,
      category: demoTransactionsTable.category,
      status: demoTransactionsTable.status,
    })
    .from(demoTransactionsTable)
    .innerJoin(
      demoAccountsTable,
      eq(demoTransactionsTable.primaryAccountId, demoAccountsTable.id),
    )
    .innerJoin(
      demoLedgerEntriesTable,
      and(
        eq(demoLedgerEntriesTable.transactionId, demoTransactionsTable.id),
        eq(demoLedgerEntriesTable.accountId, demoTransactionsTable.primaryAccountId),
      ),
    )
    .where(eq(demoTransactionsTable.spaceId, spaceId))
    .orderBy(desc(demoTransactionsTable.createdAt))
    .limit(40);

  const bills = await db
    .select({
      id: demoBillsTable.id,
      payee: demoBillsTable.payee,
      dueDate: demoBillsTable.dueDate,
      amountCents: demoBillsTable.amountCents,
      status: demoBillsTable.status,
    })
    .from(demoBillsTable)
    .where(eq(demoBillsTable.spaceId, spaceId))
    .orderBy(demoBillsTable.dueDate);
  const cards = await db
    .select({
      id: demoCardsTable.id,
      name: demoCardsTable.name,
      lastFour: demoCardsTable.lastFour,
      status: demoCardsTable.status,
    })
    .from(demoCardsTable)
    .where(eq(demoCardsTable.spaceId, spaceId));

  const data = GetDemoOverviewResponse.parse({
    accounts,
    activity: activityRows.map((item) => ({
      id: item.id,
      name: item.name,
      date: item.date,
      account: item.account,
      amountCents:
        item.accountKind === "credit"
          ? -Math.abs(item.amountCents)
          : item.amountCents,
      category: item.category,
      status:
        item.status === "Demo posted"
          ? "Opening balance"
          : item.status === "Simulated"
            ? item.category === "Transfer"
              ? "Posted"
              : "Recorded"
            : item.status,
    })),
    bills,
    cards,
  });
  res.json(data);
});

router.post("/demo/transfers", async (req, res): Promise<void> => {
  const access = await requireApprovedCustomer(req, res);
  if (!access) return;
  const { ownerUserId, application } = access;
  const body = CreateDemoTransferBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid transfer request." });
    return;
  }

  const input = body.data;
  const spaceId = await ensureDemoSpace(ownerUserId, application.accountNumber ?? undefined);
  const result = await db.transaction(async (tx) => {
    const accountIds = [input.fromAccountId, input.toAccountId].sort();
    const lockedAccounts = await tx
      .select()
      .from(demoAccountsTable)
      .where(
        and(
          eq(demoAccountsTable.spaceId, spaceId),
          eq(demoAccountsTable.isSystem, false),
          inArray(demoAccountsTable.id, accountIds),
        ),
      )
      .orderBy(demoAccountsTable.id)
      .for("update");
    if (lockedAccounts.length !== 2 || input.fromAccountId === input.toAccountId) {
      return { error: "Choose two different accounts.", code: 400 as const };
    }

    const requestFingerprint = fingerprint({
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amountCents: input.amountCents,
    });
    const [existing] = await tx
      .select()
      .from(demoTransactionsTable)
      .where(
        and(
          eq(demoTransactionsTable.spaceId, spaceId),
          eq(demoTransactionsTable.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        return { error: "That idempotency key was already used for a different action.", code: 409 as const };
      }
      return { transactionId: existing.id, status: existing.status };
    }

    const balanceRows = await tx
      .select({
        balanceCents: sql<number>`coalesce(sum(${demoLedgerEntriesTable.amountCents}), 0)::int`,
      })
      .from(demoLedgerEntriesTable)
      .where(eq(demoLedgerEntriesTable.accountId, input.fromAccountId));
    if (Number(balanceRows[0]?.balanceCents ?? 0) < input.amountCents) {
      return { error: "Amount is greater than the available balance.", code: 409 as const };
    }

    const fromAccount = lockedAccounts.find((item) => item.id === input.fromAccountId);
    const toAccount = lockedAccounts.find((item) => item.id === input.toAccountId);
    const [transaction] = await tx
      .insert(demoTransactionsTable)
      .values({
        spaceId,
        primaryAccountId: input.fromAccountId,
        name: `Transfer to ${toAccount?.name ?? "Account"}`,
        category: "Transfer",
        status: "Posted",
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
      })
      .onConflictDoNothing()
      .returning({ id: demoTransactionsTable.id, status: demoTransactionsTable.status });
    if (!transaction) {
      return { error: "Transfer could not be recorded; retry with the same key.", code: 409 as const };
    }
    await tx.insert(demoLedgerEntriesTable).values([
      {
        transactionId: transaction.id,
        accountId: input.fromAccountId,
        amountCents: -input.amountCents,
      },
      {
        transactionId: transaction.id,
        accountId: input.toAccountId,
        amountCents: input.amountCents,
      },
    ]);
    void fromAccount;
    return { transactionId: transaction.id, status: transaction.status };
  });

  if ("error" in result) {
    res.status(result.code ?? 400).json({ error: result.error });
    return;
  }
  res.status(201).json(CreateDemoTransferResponse.parse(result));
});

router.post("/demo/bill-payments", async (req, res): Promise<void> => {
  const access = await requireApprovedCustomer(req, res);
  if (!access) return;
  const { ownerUserId, application } = access;
  const body = CreateDemoBillPaymentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid payment request." });
    return;
  }

  const input = body.data;
  const spaceId = await ensureDemoSpace(ownerUserId, application.accountNumber ?? undefined);
  const result = await db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(demoAccountsTable)
      .where(
        and(
          eq(demoAccountsTable.spaceId, spaceId),
          eq(demoAccountsTable.id, input.accountId),
          eq(demoAccountsTable.kind, "checking"),
          eq(demoAccountsTable.isSystem, false),
        ),
      )
      .for("update");
    if (!account) return { error: "Choose a checking account.", code: 404 as const };

    const requestFingerprint = fingerprint({
      accountId: input.accountId,
      payee: input.payee,
      amountCents: input.amountCents,
    });
    const [existing] = await tx
      .select()
      .from(demoTransactionsTable)
      .where(
        and(
          eq(demoTransactionsTable.spaceId, spaceId),
          eq(demoTransactionsTable.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        return { error: "That idempotency key was already used for a different action.", code: 409 as const };
      }
      return { transactionId: existing.id, status: existing.status };
    }

    const balanceRows = await tx
      .select({
        balanceCents: sql<number>`coalesce(sum(${demoLedgerEntriesTable.amountCents}), 0)::int`,
      })
      .from(demoLedgerEntriesTable)
      .where(eq(demoLedgerEntriesTable.accountId, account.id));
    if (Number(balanceRows[0]?.balanceCents ?? 0) < input.amountCents) {
      return { error: "Amount is greater than the available balance.", code: 409 as const };
    }

    const [clearing] = await tx
      .select()
      .from(demoAccountsTable)
      .where(
        and(
          eq(demoAccountsTable.spaceId, spaceId),
          eq(demoAccountsTable.kind, "clearing"),
        ),
      );
    if (!clearing) throw new Error("Demo clearing account is missing.");

    const [transaction] = await tx
      .insert(demoTransactionsTable)
      .values({
        spaceId,
        primaryAccountId: account.id,
        name: input.payee,
        category: "Bill payment",
        status: "Recorded",
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
      })
      .onConflictDoNothing()
      .returning({ id: demoTransactionsTable.id, status: demoTransactionsTable.status });
    if (!transaction) {
      return { error: "Payment could not be recorded; retry with the same key.", code: 409 as const };
    }
    await tx.insert(demoLedgerEntriesTable).values([
      {
        transactionId: transaction.id,
        accountId: account.id,
        amountCents: -input.amountCents,
      },
      {
        transactionId: transaction.id,
        accountId: clearing.id,
        amountCents: input.amountCents,
      },
    ]);
    await tx
      .update(demoBillsTable)
      .set({ status: "recorded" })
      .where(
        and(
          eq(demoBillsTable.spaceId, spaceId),
          eq(demoBillsTable.payee, input.payee),
          eq(demoBillsTable.amountCents, input.amountCents),
          eq(demoBillsTable.status, "scheduled"),
        ),
      );
    return { transactionId: transaction.id, status: transaction.status };
  });

  if ("error" in result) {
    res.status(result.code ?? 400).json({ error: result.error });
    return;
  }
  res.status(201).json(CreateDemoBillPaymentResponse.parse(result));
});

router.patch("/demo/cards/:cardId", async (req, res): Promise<void> => {
  const access = await requireApprovedCustomer(req, res);
  if (!access) return;
  const { ownerUserId, application } = access;
  const params = UpdateDemoCardParams.safeParse(req.params);
  const body = UpdateDemoCardBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid card update." });
    return;
  }

  const spaceId = await ensureDemoSpace(ownerUserId, application.accountNumber ?? undefined);
  const [card] = await db
    .update(demoCardsTable)
    .set({ status: body.data.status })
    .where(
      and(
        eq(demoCardsTable.spaceId, spaceId),
        eq(demoCardsTable.id, params.data.cardId),
      ),
    )
    .returning({
      id: demoCardsTable.id,
      name: demoCardsTable.name,
      lastFour: demoCardsTable.lastFour,
      status: demoCardsTable.status,
    });
  if (!card) {
    res.status(404).json({ error: "Demo card not found." });
    return;
  }
  res.json(UpdateDemoCardResponse.parse(card));
});

export default router;
