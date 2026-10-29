import { useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import {
  getGetAdminEnrollmentsQueryKey,
  getGetMyEnrollmentQueryKey,
  useGetAdminEnrollments,
  useGetMyEnrollment,
  useReviewCustomerEnrollment,
  useSubmitEnrollmentInfoResponse,
  useSubmitMyEnrollment,
} from "@workspace/api-client-react";
import type { CustomerEnrollment } from "@workspace/api-client-react";

type Enrollment = CustomerEnrollment;
type ReviewDecision = "approve" | "request_info" | "reject";

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "Please try again.";
}

function PageFrame({
  children,
  eyebrow = "Wells Fargo independent ledger",
  title,
}: {
  children: ReactNode;
  eyebrow?: string;
  title: string;
}) {
  return (
    <main className="min-h-[100dvh] bg-[#f9f7f6] px-4 py-8 text-[#141414] sm:px-7 sm:py-12">
      <div className="mx-auto max-w-[760px]">
        <Link href="/" className="inline-flex items-center gap-2 text-[12px] font-bold text-[#6f6663] hover:text-[#b01821]" data-testid="link-enrollment-home">
          <span aria-hidden="true">←</span> Wells Fargo ledger home
        </Link>
        <p className="mt-4 rounded-lg bg-[#fff4d7] px-3 py-2 text-[11px] leading-5 text-[#514744]">Independent application—not operated by or affiliated with Wells Fargo. Balances are internal records, not bank deposits.</p>
        <header className="mb-7 mt-8">
          <p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#9a7951]">{eyebrow}</p>
          <h1 className="mt-2 font-display text-[30px] font-bold tracking-[-.045em] sm:text-[38px]">{title}</h1>
        </header>
        {children}
      </div>
    </main>
  );
}

function AdminLanding() {
  return (
    <PageFrame eyebrow="Independent account administration" title="Review customer requests">
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/dashboard/admin/enrollments" className="rounded-2xl border border-[#e5e0d5] bg-white p-6 hover:border-[#c8bca9]" data-testid="link-admin-enrollments">
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9a7951]">Customer onboarding</p>
          <h2 className="mt-2 font-display text-xl font-bold">Enrollment applications</h2>
          <p className="mt-2 text-[12px] leading-5 text-[#6f6663]">Review applications, request additional information, or approve customer accounts.</p>
        </Link>
        <Link href="/dashboard/admin/deposits" className="rounded-2xl border border-[#e5e0d5] bg-white p-6 hover:border-[#c8bca9]" data-testid="link-admin-deposits">
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9a7951]">Manual review</p>
          <h2 className="mt-2 font-display text-xl font-bold">Check deposits</h2>
          <p className="mt-2 text-[12px] leading-5 text-[#6f6663]">Review check images submitted by approved customers.</p>
        </Link>
      </div>
    </PageFrame>
  );
}

function CustomerEnrollmentForm({
  enrollment,
  onRefresh,
}: {
  enrollment: Enrollment;
  onRefresh: () => void;
}) {
  const client = useQueryClient();
  const submit = useSubmitMyEnrollment();
  const respond = useSubmitEnrollmentInfoResponse();
  const [fullName, setFullName] = useState(enrollment.fullName ?? "");
  const [phone, setPhone] = useState(enrollment.phone ?? "");
  const [homeAddress, setHomeAddress] = useState(enrollment.homeAddress ?? "");
  const [accountType, setAccountType] = useState<"personal" | "business">(enrollment.accountType ?? "personal");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const invalidateStatus = async () => {
    await client.invalidateQueries({ queryKey: getGetMyEnrollmentQueryKey() });
    onRefresh();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const values = { fullName: fullName.trim(), phone: phone.trim(), homeAddress: homeAddress.trim(), accountType };
    if (values.fullName.length < 2 || values.phone.length < 7 || values.homeAddress.length < 5) {
      setError("Enter your full name, a valid phone number, and your home address.");
      return;
    }
    try {
      await submit.mutateAsync({ data: values });
      setNotice("Your application was sent to Admin for review.");
      await invalidateStatus();
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    }
  };

  const handleInfoResponse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (additionalInfo.trim().length < 3) {
      setError("Add the information requested by Admin.");
      return;
    }
    try {
      await respond.mutateAsync({ data: { response: additionalInfo.trim() } });
      setAdditionalInfo("");
      setNotice("Your response was sent. Your application is back in the review queue.");
      await invalidateStatus();
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    }
  };

  if (enrollment.status === "pending_review") {
    return (
      <PageFrame title="Application under review">
        <section className="rounded-2xl border border-[#e5e0d5] bg-white p-5 sm:p-7" aria-live="polite">
          <div className="mb-4 inline-flex rounded-full bg-[#fff4d7] px-3 py-1.5 text-[11px] font-bold text-[#72551b]">Pending Admin approval</div>
          <p className="text-[13px] leading-6 text-[#514744]">Admin is reviewing your customer application. Your account features will be available after approval. You will continue signing in with Clerk.</p>
          <div className="mt-5 border-t border-[#eee9df] pt-4 text-[11px] leading-5 text-[#6f6663]">
            <p><strong className="text-[#3b3331]">Applicant:</strong> {enrollment.fullName}</p>
            <p><strong className="text-[#3b3331]">Account type:</strong> {enrollment.accountType}</p>
          </div>
          {notice && <p className="mt-4 text-[12px] text-[#326241]" role="status">{notice}</p>}
          {error && <p className="mt-4 text-[12px] text-[#9d2027]" role="alert">{error}</p>}
          <button type="button" onClick={onRefresh} className="mt-5 rounded-lg border border-[#d9d5ca] px-4 py-2.5 text-[12px] font-bold hover:bg-[#f9f7f6]" data-testid="button-refresh-enrollment">Refresh status</button>
        </section>
      </PageFrame>
    );
  }

  if (enrollment.status === "needs_info") {
    return (
      <PageFrame title="Additional information requested">
        <section className="rounded-2xl border border-[#e5e0d5] bg-white p-5 sm:p-7">
          <div className="rounded-xl bg-[#fff4d7] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#72551b]">Message from Admin</p>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[#514744]">{enrollment.infoRequest}</p>
          </div>
          {enrollment.applicantResponse && <p className="mt-4 text-[11px] text-[#6f6663]">Your latest response: {enrollment.applicantResponse}</p>}
          <form onSubmit={handleInfoResponse} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-[#514744]">Your response</span>
              <textarea value={additionalInfo} onChange={(event) => setAdditionalInfo(event.target.value)} maxLength={1200} required rows={5} className="w-full rounded-xl border border-[#d9d5ca] bg-[#fffefa] px-3 py-3 text-[13px] outline-none focus:border-[#b01821]" data-testid="input-enrollment-response" />
            </label>
            {error && <p className="text-[12px] text-[#9d2027]" role="alert">{error}</p>}
            {notice && <p className="text-[12px] text-[#326241]" role="status">{notice}</p>}
            <button type="submit" disabled={respond.isPending} className="rounded-lg bg-[#d71e28] px-5 py-3 text-[12px] font-bold text-white disabled:opacity-60" data-testid="button-submit-enrollment-response">
              {respond.isPending ? "Sending response…" : "Send response"}
            </button>
          </form>
        </section>
      </PageFrame>
    );
  }

  return (
    <PageFrame title={enrollment.status === "rejected" ? "Update your application" : "Apply for an account"}>
      <section className="rounded-2xl border border-[#e5e0d5] bg-white p-5 sm:p-7">
        {enrollment.status === "rejected" && (
          <div className="mb-5 rounded-xl bg-[#fff0ed] p-4">
            <p className="text-[11px] font-bold text-[#8f2428]">Your previous application was not approved.</p>
            {enrollment.infoRequest && <p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-[#754c42]">{enrollment.infoRequest}</p>}
            <p className="mt-2 text-[11px] leading-5 text-[#754c42]">You can update your details and submit a new application.</p>
          </div>
        )}
        <p className="mb-5 text-[12px] leading-5 text-[#6f6663]">Complete these details for Admin review. After approval, this application will show your customer ID and internal ledger account number. Clerk remains your sign-in method.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold text-[#514744]">Full legal name</span>
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={100} autoComplete="name" required className="w-full rounded-xl border border-[#d9d5ca] bg-[#fffefa] px-3 py-3 text-[13px] outline-none focus:border-[#b01821]" data-testid="input-enrollment-name" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold text-[#514744]">Phone number</span>
            <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} autoComplete="tel" required className="w-full rounded-xl border border-[#d9d5ca] bg-[#fffefa] px-3 py-3 text-[13px] outline-none focus:border-[#b01821]" data-testid="input-enrollment-phone" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold text-[#514744]">Home mailing address</span>
            <textarea value={homeAddress} onChange={(event) => setHomeAddress(event.target.value)} maxLength={500} autoComplete="street-address" required rows={3} className="w-full rounded-xl border border-[#d9d5ca] bg-[#fffefa] px-3 py-3 text-[13px] outline-none focus:border-[#b01821]" data-testid="input-enrollment-address" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold text-[#514744]">Account type</span>
            <select value={accountType} onChange={(event) => setAccountType(event.target.value as "personal" | "business")} className="w-full rounded-xl border border-[#d9d5ca] bg-[#fffefa] px-3 py-3 text-[13px] outline-none focus:border-[#b01821]" data-testid="select-enrollment-account-type">
              <option value="personal">Personal</option>
              <option value="business">Business</option>
            </select>
          </label>
          <div className="rounded-xl border border-[#eed9cc] bg-[#fff8f3] p-4 text-[11px] leading-5 text-[#754c42]">
            Do not enter a Social Security number or other government ID here. This application does not collect SSNs.
          </div>
          {error && <p className="text-[12px] text-[#9d2027]" role="alert">{error}</p>}
          {notice && <p className="text-[12px] text-[#326241]" role="status">{notice}</p>}
          <button type="submit" disabled={submit.isPending} className="rounded-lg bg-[#d71e28] px-5 py-3 text-[12px] font-bold text-white disabled:opacity-60" data-testid="button-submit-enrollment">
            {submit.isPending ? "Submitting…" : "Submit for Admin review"}
          </button>
        </form>
      </section>
    </PageFrame>
  );
}

export function EnrollmentGate({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const query = useGetMyEnrollment({ query: { queryKey: getGetMyEnrollmentQueryKey(), refetchInterval: 5_000 } });
  const isAdmin = user?.publicMetadata?.role === "admin";
  if (query.isLoading) {
    return <div className="grid min-h-[100dvh] place-items-center bg-[#f9f7f6] text-sm text-[#6f6663]" role="status">Loading enrollment status…</div>;
  }
  if (query.isError || !query.data) {
    return (
      <PageFrame title="Enrollment status unavailable">
        <div className="rounded-2xl border border-[#e5e0d5] bg-white p-6">
          <p className="text-[13px] text-[#6f6663]" role="alert">{errorMessage(query.error)}</p>
          <button type="button" onClick={() => void query.refetch()} className="mt-4 rounded-lg bg-[#d71e28] px-4 py-2.5 text-[12px] font-bold text-white" data-testid="button-retry-enrollment">Retry</button>
        </div>
      </PageFrame>
    );
  }
  if (query.data.status === "approved") {
    return (
      <>
        <div className="border-b border-[#e5e0d5] bg-white px-4 py-3 text-[11px] text-[#514744] sm:px-7">
          <div className="mx-auto flex max-w-[1440px] flex-wrap gap-x-6 gap-y-1">
            <span><strong>Customer ID:</strong> {query.data.customerId}</span>
            <span><strong>Internal ledger account:</strong> {query.data.accountNumber}</span>
          </div>
        </div>
        {children}
      </>
    );
  }
  if (isAdmin) return <AdminLanding />;
  return <CustomerEnrollmentForm enrollment={query.data} onRefresh={() => void query.refetch()} />;
}

export function AdminEnrollmentPage() {
  const { user } = useUser();
  const client = useQueryClient();
  const query = useGetAdminEnrollments({ query: { queryKey: getGetAdminEnrollmentsQueryKey(), refetchInterval: 5_000 } });
  const review = useReviewCustomerEnrollment();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (user?.publicMetadata?.role !== "admin") {
    return (
      <PageFrame title="Admin access required">
        <p className="rounded-2xl border border-[#e5e0d5] bg-white p-6 text-[13px] text-[#6f6663]" role="alert">This page is available to Admin only.</p>
      </PageFrame>
    );
  }

  const handleReview = async (applicationId: string, decision: ReviewDecision) => {
    const note = notes[applicationId]?.trim() ?? "";
    setError("");
    setMessage("");
    if ((decision === "request_info" || decision === "reject") && note.length < 3) {
      setError("Enter an Admin note before requesting information or rejecting an application.");
      return;
    }
    try {
      await review.mutateAsync({ applicationId, data: { decision, ...(note ? { note } : {}) } });
      await client.invalidateQueries({ queryKey: getGetAdminEnrollmentsQueryKey() });
      setMessage(decision === "approve" ? "Application approved. The customer ID and ledger account number are assigned." : decision === "request_info" ? "Information request sent to the applicant." : "Application rejected.");
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    }
  };

  return (
    <PageFrame eyebrow="Independent account administration" title="Customer enrollment review">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard" className="text-[12px] font-bold text-[#6f6663] hover:text-[#b01821]" data-testid="link-admin-dashboard">← Dashboard</Link>
        <Link href="/dashboard/admin/deposits" className="text-[12px] font-bold text-[#6f6663] hover:text-[#b01821]" data-testid="link-admin-deposit-queue">Check deposit review →</Link>
      </div>
      {error && <p className="mb-4 rounded-xl bg-[#fff0ed] p-3 text-[12px] text-[#9d2027]" role="alert">{error}</p>}
      {message && <p className="mb-4 rounded-xl bg-[#edf7ee] p-3 text-[12px] text-[#326241]" role="status">{message}</p>}
      {query.isLoading && <p className="rounded-2xl border border-[#e5e0d5] bg-white p-6 text-[13px] text-[#6f6663]" role="status">Loading applications…</p>}
      {query.isError && <div className="rounded-2xl border border-[#e5e0d5] bg-white p-6"><p className="text-[13px] text-[#9d2027]" role="alert">{errorMessage(query.error)}</p><button type="button" onClick={() => void query.refetch()} className="mt-3 text-[12px] font-bold text-[#b01821]">Retry</button></div>}
      {!query.isLoading && !query.isError && (query.data?.length ?? 0) === 0 && (
        <div className="rounded-2xl border border-[#e5e0d5] bg-white p-6 text-[13px] text-[#6f6663]">There are no customer applications waiting for review.</div>
      )}
      <div className="space-y-4">
        {query.data?.map((application) => (
          <article key={application.id} className="rounded-2xl border border-[#e5e0d5] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">{application.fullName || "Applicant"}</h2>
                <p className="mt-1 text-[11px] text-[#6f6663]">Clerk user: {application.ownerUserId}</p>
              </div>
              <span className="rounded-full bg-[#fff4d7] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.08em] text-[#72551b]">{application.status.replace("_", " ")}</span>
            </div>
            <div className="mt-4 grid gap-x-5 gap-y-2 border-t border-[#eee9df] pt-4 text-[12px] sm:grid-cols-2">
              <p><strong>Account type:</strong> {application.accountType}</p>
              <p><strong>Phone:</strong> {application.phone || "Not provided"}</p>
              <p className="sm:col-span-2"><strong>Home address:</strong> {application.homeAddress || "Not provided"}</p>
              {application.applicantResponse && <p className="sm:col-span-2"><strong>Applicant response:</strong> {application.applicantResponse}</p>}
            </div>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-[#6f6663]">Admin note or information request</span>
              <textarea value={notes[application.id ?? ""] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [application.id ?? ""]: event.target.value }))} maxLength={1200} rows={3} className="w-full rounded-xl border border-[#d9d5ca] bg-[#fffefa] px-3 py-3 text-[12px] outline-none focus:border-[#b01821]" data-testid={`input-admin-enrollment-note-${application.id}`} />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={review.isPending} onClick={() => application.id && void handleReview(application.id, "approve")} className="rounded-lg bg-[#326241] px-4 py-2.5 text-[11px] font-bold text-white disabled:opacity-60" data-testid={`button-approve-enrollment-${application.id}`}>Approve and assign IDs</button>
              <button type="button" disabled={review.isPending} onClick={() => application.id && void handleReview(application.id, "request_info")} className="rounded-lg border border-[#d9d5ca] px-4 py-2.5 text-[11px] font-bold text-[#514744] disabled:opacity-60" data-testid={`button-request-enrollment-info-${application.id}`}>Request information</button>
              <button type="button" disabled={review.isPending} onClick={() => application.id && void handleReview(application.id, "reject")} className="rounded-lg border border-[#e8c0a7] px-4 py-2.5 text-[11px] font-bold text-[#8f2428] disabled:opacity-60" data-testid={`button-reject-enrollment-${application.id}`}>Reject</button>
            </div>
          </article>
        ))}
      </div>
    </PageFrame>
  );
}
