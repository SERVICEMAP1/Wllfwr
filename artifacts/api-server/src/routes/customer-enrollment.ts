import { and, asc, eq, inArray } from "drizzle-orm";
import { clerkClient, getAuth } from "@clerk/express";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ReviewCustomerEnrollmentBody,
  ReviewCustomerEnrollmentParams,
  SubmitEnrollmentInfoResponseBody,
  SubmitMyEnrollmentBody,
} from "@workspace/api-zod";
import { customerApplicationsTable, db } from "@workspace/db";
import {
  getEnrollmentForUser,
  newCustomerId,
  newLedgerAccountNumber,
} from "../lib/customer-enrollment";

const router: IRouter = Router();

function enrollmentResponse(
  application: typeof customerApplicationsTable.$inferSelect | null,
) {
  if (!application) {
    return { status: "not_started", accountType: "personal" };
  }

  return {
    id: application.id,
    status: application.status,
    ...(application.fullName ? { fullName: application.fullName } : {}),
    ...(application.phone ? { phone: application.phone } : {}),
    ...(application.homeAddress ? { homeAddress: application.homeAddress } : {}),
    accountType: application.accountType,
    ...(application.infoRequest ? { infoRequest: application.infoRequest } : {}),
    ...(application.applicantResponse
      ? { applicantResponse: application.applicantResponse }
      : {}),
    ...(application.customerId ? { customerId: application.customerId } : {}),
    ...(application.accountNumber
      ? { accountNumber: application.accountNumber }
      : {}),
    ...(application.submittedAt
      ? { submittedAt: application.submittedAt.toISOString() }
      : {}),
    ...(application.reviewedAt
      ? { reviewedAt: application.reviewedAt.toISOString() }
      : {}),
  };
}

function authenticatedUserId(
  req: Request,
  res: Response,
): string | null {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }
  return userId;
}

async function requireAdmin(
  req: Request,
  res: Response,
): Promise<string | null> {
  const userId = authenticatedUserId(req, res);
  if (!userId) return null;
  try {
    const user = await clerkClient.users.getUser(userId);
    if (user.publicMetadata.role !== "admin") {
      res.status(403).json({ error: "Admin role required." });
      return null;
    }
    return userId;
  } catch {
    res.status(503).json({ error: "Admin authorization is temporarily unavailable." });
    return null;
  }
}

router.get("/enrollment/me", async (req, res): Promise<void> => {
  const ownerUserId = authenticatedUserId(req, res);
  if (!ownerUserId) return;
  const application = await getEnrollmentForUser(ownerUserId);
  res.json(enrollmentResponse(application));
});

router.post("/enrollment/me", async (req, res): Promise<void> => {
  const ownerUserId = authenticatedUserId(req, res);
  if (!ownerUserId) return;
  const body = SubmitMyEnrollmentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Check the application details and try again." });
    return;
  }
  const fullName = body.data.fullName.trim();
  const phone = body.data.phone.trim();
  const homeAddress = body.data.homeAddress.trim();
  if (fullName.length < 2 || phone.length < 7 || homeAddress.length < 5) {
    res.status(400).json({ error: "Complete each required application field." });
    return;
  }

  const current = await getEnrollmentForUser(ownerUserId);
  if (current?.status === "approved") {
    res.status(409).json({ error: "This customer application is already approved." });
    return;
  }

  const now = new Date();
  const values = {
    ownerUserId,
    fullName,
    phone,
    homeAddress,
    accountType: body.data.accountType,
    status: "pending_review",
    infoRequest: null,
    applicantResponse: null,
    reviewerUserId: null,
    reviewedAt: null,
    submittedAt: now,
  };

  const [saved] = current
    ? await db
        .update(customerApplicationsTable)
        .set(values)
        .where(
          and(
            eq(customerApplicationsTable.id, current.id),
            inArray(customerApplicationsTable.status, [
              "pending_review",
              "rejected",
            ]),
          ),
        )
        .returning()
    : await db
        .insert(customerApplicationsTable)
        .values(values)
        .onConflictDoNothing({ target: customerApplicationsTable.ownerUserId })
        .returning();

  if (saved) {
    res.json(enrollmentResponse(saved));
    return;
  }

  const latest = await getEnrollmentForUser(ownerUserId);
  if (latest?.status === "approved") {
    res.status(409).json({ error: "This customer application is already approved." });
    return;
  }
  res.status(409).json({ error: "The application changed; refresh and try again." });
});

router.post("/enrollment/me/response", async (req, res): Promise<void> => {
  const ownerUserId = authenticatedUserId(req, res);
  if (!ownerUserId) return;
  const body = SubmitEnrollmentInfoResponseBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter the requested information." });
    return;
  }
  const current = await getEnrollmentForUser(ownerUserId);
  if (!current || current.status !== "needs_info") {
    res.status(409).json({ error: "There is no Admin information request to answer." });
    return;
  }
  const [saved] = await db
    .update(customerApplicationsTable)
    .set({
      applicantResponse: body.data.response.trim(),
      status: "pending_review",
      submittedAt: new Date(),
    })
    .where(
      and(
        eq(customerApplicationsTable.id, current.id),
        eq(customerApplicationsTable.status, "needs_info"),
      ),
    )
    .returning();
  if (!saved) {
    res.status(409).json({ error: "The application changed; refresh and try again." });
    return;
  }
  res.json(enrollmentResponse(saved));
});

router.get("/admin/enrollments", async (req, res): Promise<void> => {
  const adminUserId = await requireAdmin(req, res);
  if (!adminUserId) return;
  const applications = await db
    .select()
    .from(customerApplicationsTable)
    .where(
      inArray(customerApplicationsTable.status, ["pending_review", "needs_info"]),
    )
    .orderBy(asc(customerApplicationsTable.submittedAt));
  res.json(
    applications.map((application) => ({
      ...enrollmentResponse(application),
      ownerUserId: application.ownerUserId,
    })),
  );
});

router.patch(
  "/admin/enrollments/:applicationId/review",
  async (req, res): Promise<void> => {
    const adminUserId = await requireAdmin(req, res);
    if (!adminUserId) return;
    const params = ReviewCustomerEnrollmentParams.safeParse(req.params);
    const body = ReviewCustomerEnrollmentBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Check the review decision and try again." });
      return;
    }
    const [application] = await db
      .select()
      .from(customerApplicationsTable)
      .where(eq(customerApplicationsTable.id, params.data.applicationId))
      .limit(1);
    if (!application) {
      res.status(404).json({ error: "Application not found." });
      return;
    }
    if (!["pending_review", "needs_info"].includes(application.status)) {
      res.status(409).json({ error: "This application is no longer awaiting review." });
      return;
    }

    const decision = body.data.decision;
    const note = body.data.note?.trim() ?? "";
    if ((decision === "request_info" || decision === "reject") && !note) {
      res.status(400).json({ error: "Add a note for this decision." });
      return;
    }
    if (decision === "request_info" && note.length < 3) {
      res.status(400).json({ error: "The information request is too short." });
      return;
    }

    const now = new Date();
    const [saved] = await db
      .update(customerApplicationsTable)
      .set({
        status:
          decision === "approve"
            ? "approved"
            : decision === "request_info"
              ? "needs_info"
              : "rejected",
        infoRequest: decision === "approve" ? null : note,
        customerId:
          decision === "approve"
            ? application.customerId ?? newCustomerId()
            : application.customerId,
        accountNumber:
          decision === "approve"
            ? application.accountNumber ?? newLedgerAccountNumber()
            : application.accountNumber,
        reviewerUserId: adminUserId,
        reviewedAt: now,
      })
      .where(
        and(
          eq(customerApplicationsTable.id, application.id),
          inArray(customerApplicationsTable.status, ["pending_review", "needs_info"]),
        ),
      )
      .returning();
    if (!saved) {
      res.status(409).json({ error: "The application changed; refresh and try again." });
      return;
    }
    res.json({
      ...enrollmentResponse(saved),
      ownerUserId: saved.ownerUserId,
    });
  },
);

export default router;
