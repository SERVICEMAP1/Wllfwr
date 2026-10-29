import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  Check,
  Clock3,
  FileCheck2,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  getGetAdminDemoDepositsQueryKey,
  getGetDemoDepositsQueryKey,
  getGetDemoOverviewQueryKey,
  useCreateDemoDepositDraft,
  useDeleteDemoDeposit,
  useGetAdminDemoDeposits,
  useGetDemoDeposits,
  useGetDemoOverview,
  useReviewDemoDeposit,
  useSubmitDemoDeposit,
} from "@workspace/api-client-react";
import { useUser } from "@clerk/react";

type AcceptedImageType = "image/jpeg" | "image/png" | "image/webp";
const acceptedTypes = new Set<AcceptedImageType>(["image/jpeg", "image/png", "image/webp"]);
const maxImageBytes = 10 * 1024 * 1024;

function isAcceptedImageType(value: string): value is AcceptedImageType {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

type UploadSession = {
  depositId: string;
  front: { uploadURL: string; objectPath: string };
  back: { uploadURL: string; objectPath: string };
};

type DepositStatus = "draft" | "pending_review" | "reviewed" | "posted" | "rejected";
type DepositSummary = {
  id: string;
  accountName: string;
  amountCents: number;
  status: DepositStatus;
  createdAt: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewNote?: string;
};
type AdminDepositSummary = DepositSummary & { customerId: string };

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function dateLabel(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(status: DepositStatus) {
  if (status === "posted") return "Posted to internal ledger";
  if (status === "pending_review") return "Pending admin review";
  if (status === "reviewed") return "Reviewed · not posted";
  if (status === "rejected") return "Rejected";
  return "Draft";
}

function StatusPill({ status }: { status: DepositStatus }) {
  const palette =
    status === "pending_review"
      ? "bg-[#fff0bd] text-[#6d5315]"
      : status === "reviewed"
        ? "bg-[#e7f1e8] text-[#326241]"
        : status === "rejected"
          ? "bg-[#fbe6e4] text-[#9b252c]"
          : "bg-[#efede6] text-[#70645f]";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${palette}`}>
      {statusLabel(status)}
    </span>
  );
}

function ImageCapture({
  side,
  file,
  preview,
  onFileChange,
  onClear,
  disabled,
}: {
  side: "front" | "back";
  file: File | null;
  preview: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  disabled: boolean;
}) {
  const label = side === "front" ? "Front of check" : "Back of check";
  const inputId = `check-${side}-image`;
  return (
    <div className="rounded-2xl border border-[#dedacf] bg-[#fffefa] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold text-[#3b3331]">{label}</p>
          <p className="mt-1 text-[10px] text-[#756864]">Keep all four edges visible.</p>
        </div>
        <Camera size={18} className="shrink-0 text-[#9a7951]" />
      </div>
      {preview ? (
        <div className="relative overflow-hidden rounded-xl border border-[#e5e0d5] bg-[#f5f2ed]">
          <img src={preview} alt={`${label} preview`} className="aspect-[1.58/1] w-full object-contain" />
          {!disabled && (
            <button
              type="button"
              onClick={onClear}
              className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-[#3b3331]/80 text-white"
              aria-label={`Remove ${label.toLowerCase()}`}
              data-testid={`button-remove-${side}-image`}
            >
              <X size={15} />
            </button>
          )}
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={`flex aspect-[1.58/1] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#c9c1b3] bg-[#f8f6f1] text-center transition hover:border-[#9a7951] ${disabled ? "pointer-events-none opacity-50" : ""}`}
        >
          <Upload size={20} className="mb-2 text-[#9a7951]" />
          <span className="text-[11px] font-bold text-[#514744]">Take a photo or choose a file</span>
          <span className="mt-1 text-[9px] text-[#756864]">JPEG, PNG, or WebP · Max 10 MB</span>
        </label>
      )}
      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={disabled}
        onChange={onFileChange}
        data-testid={`input-${side}-image`}
      />
      {file && (
        <p className="mt-2 truncate text-[9px] text-[#756864]">
          {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
        </p>
      )}
    </div>
  );
}

async function uploadImage(uploadURL: string, file: File) {
  const response = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error("The check image could not be uploaded. Please try again.");
  }
}

export function MobileDepositPage() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const overviewQuery = useGetDemoOverview({
    query: {
      queryKey: getGetDemoOverviewQueryKey(),
      refetchInterval: 5_000,
    },
  });
  const depositsQuery = useGetDemoDeposits({
    query: {
      queryKey: getGetDemoDepositsQueryKey(),
      refetchInterval: 5_000,
    },
  });
  const createDraft = useCreateDemoDepositDraft();
  const submitDraft = useSubmitDemoDeposit();
  const deleteDeposit = useDeleteDemoDeposit();
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState("");
  const [backPreview, setBackPreview] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [uploadSession, setUploadSession] = useState<UploadSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  useEffect(() => {
    if (!frontFile) {
      setFrontPreview("");
      return;
    }
    const url = URL.createObjectURL(frontFile);
    setFrontPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [frontFile]);

  useEffect(() => {
    if (!backFile) {
      setBackPreview("");
      return;
    }
    const url = URL.createObjectURL(backFile);
    setBackPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [backFile]);

  useEffect(() => {
    const firstAccount = overviewQuery.data?.accounts[0];
    if (!accountId && firstAccount) setAccountId(firstAccount.id);
  }, [accountId, overviewQuery.data]);

  const showMessage = (text: string, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  };
  const clearSession = () => {
    if (uploadSession) {
      void deleteDeposit.mutateAsync({ depositId: uploadSession.depositId }).catch(() => undefined);
    }
    setUploadSession(null);
  };
  const validateFile = (file: File | null, side: string) => {
    if (!file) return `${side} photo is required.`;
    if (!isAcceptedImageType(file.type)) return `${side} photo must be JPEG, PNG, or WebP.`;
    if (file.size <= 0 || file.size > maxImageBytes) return `${side} photo must be under 10 MB.`;
    return "";
  };
  const handleFileChange = (
    side: "front" | "back",
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;
    if (file) {
      const validation = validateFile(file, side);
      if (validation) {
        showMessage(validation, true);
        event.target.value = "";
        return;
      }
    }
    event.target.value = "";
    if (uploadSession) clearSession();
    if (side === "front") setFrontFile(file);
    else setBackFile(file);
    setMessage("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    if (!frontFile || !backFile) {
      showMessage(validateFile(!frontFile ? frontFile : backFile, !frontFile ? "Front" : "Back"), true);
      return;
    }
    const frontError = validateFile(frontFile, "Front");
    const backError = validateFile(backFile, "Back");
    if (frontError || backError) {
      showMessage(frontError || backError, true);
      return;
    }
    if (!isAcceptedImageType(frontFile.type) || !isAcceptedImageType(backFile.type)) {
      showMessage("Both check photos must be JPEG, PNG, or WebP.", true);
      return;
    }
    if (!confirmation) {
      showMessage("Confirm that Admin approval will post this amount to your internal ledger.", true);
      return;
    }
    if (!accountId) {
      showMessage("Choose an account for the manual review record.", true);
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      showMessage("Enter a valid amount with up to two decimal places.", true);
      return;
    }

    setBusy(true);
    try {
      let session = uploadSession;
      if (!session) {
        session = await createDraft.mutateAsync({
          data: {
            accountId,
            amountCents: Math.round(Number(amount) * 100),
            frontContentType: frontFile.type,
            frontSize: frontFile.size,
            backContentType: backFile.type,
            backSize: backFile.size,
          },
        });
        setUploadSession(session);
        try {
          await Promise.all([
            uploadImage(session.front.uploadURL, frontFile),
            uploadImage(session.back.uploadURL, backFile),
          ]);
        } catch (error) {
          await deleteDeposit.mutateAsync({ depositId: session.depositId }).catch(() => undefined);
          setUploadSession(null);
          throw error;
        }
      }
      await submitDraft.mutateAsync({ depositId: session.depositId });
      setUploadSession(null);
      setAmount("");
      setFrontFile(null);
      setBackFile(null);
      setConfirmation(false);
      showMessage("Submitted to Admin for review. Your internal balance updates after approval.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetDemoDepositsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDemoOverviewQueryKey() }),
      ]);
    } catch (error) {
      const data = error && typeof error === "object" && "data" in error
        ? (error as { data?: { error?: string } }).data
        : undefined;
      const errorMessage = data?.error ?? (error instanceof Error ? error.message : "Could not submit these images.");
      if (errorMessage.includes("Start a new submission")) setUploadSession(null);
      showMessage(errorMessage, true);
    } finally {
      setBusy(false);
    }
  };

  const adminLink = user?.publicMetadata?.role === "admin";
  const accounts = overviewQuery.data?.accounts ?? [];
  const deposits = (depositsQuery.data ?? []) as DepositSummary[];

  return (
    <div className="min-h-[100dvh] bg-[#f9f7f6] text-[#141414]">
      <div className="sticky top-0 z-40 flex min-h-9 items-center justify-center gap-2 bg-[#ffcd41] px-4 py-2 text-center text-[10px] font-bold text-[#3b3331]">
        <ShieldCheck size={14} />
        <span>Private check images · Admin review · Ledger updates after approval</span>
      </div>
      <main className="mx-auto max-w-[980px] px-4 pb-12 pt-6 sm:px-7 sm:pt-9">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-[12px] font-bold text-[#6f6663] hover:text-[#b01821]">
            <ArrowLeft size={16} /> Back to overview
          </Link>
          {adminLink && (
            <Link href="/dashboard/admin/deposits" className="rounded-lg border border-[#d9d5ca] bg-white px-3 py-2 text-[11px] font-bold text-[#514744]">
              Admin review queue
            </Link>
          )}
        </div>
        <header className="mb-6">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#9a7951]">Check images</p>
          <h1 className="font-display text-[30px] font-bold tracking-[-.05em] sm:text-[38px]">Mobile check deposit</h1>
          <p className="mt-2 max-w-[700px] text-[13px] leading-6 text-[#6f6663]">
            Capture both sides and send them to Admin. Approval posts the amount to your internal ledger; it does not clear the check or move money at a bank.
          </p>
        </header>

        <div className="mb-6 rounded-2xl border border-[#e8c0a7] bg-[#fff6ef] p-4 sm:p-5">
          <p className="text-[12px] font-bold text-[#7d3728]">Protect your check information</p>
          <p className="mt-1 text-[11px] leading-5 text-[#754c42]">
            Check photos contain routing and account numbers. Submit only checks you are authorized to deposit; images are private to you and authorized Admin.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[1.4fr_.8fr]">
          <section className="rounded-[22px] border border-[#e5e0d5] bg-white p-4 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Camera size={17} className="text-[#9a7951]" />
              <h2 className="font-display text-[17px] font-bold">Photograph both sides</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ImageCapture
                side="front"
                file={frontFile}
                preview={frontPreview}
                onFileChange={(event) => handleFileChange("front", event)}
                onClear={() => setFrontFile(null)}
                disabled={busy || Boolean(uploadSession)}
              />
              <ImageCapture
                side="back"
                file={backFile}
                preview={backPreview}
                onFileChange={(event) => handleFileChange("back", event)}
                onClear={() => setBackFile(null)}
                disabled={busy || Boolean(uploadSession)}
              />
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-[#78857b]">Deposit to</span>
                <select
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  disabled={busy || Boolean(uploadSession)}
                  className="w-full rounded-xl border border-[#dedacf] bg-[#fffefa] px-3 py-3 text-[12px] outline-none focus:border-[#77917d]"
                  required
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name} · {account.maskedNumber}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-[#78857b]">Check amount</span>
                <div className="flex items-center rounded-xl border border-[#dedacf] bg-[#fffefa] px-3 focus-within:border-[#77917d]">
                  <span className="text-[13px] text-[#758177]">$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    disabled={busy || Boolean(uploadSession)}
                    placeholder="0.00"
                    className="w-full bg-transparent px-2 py-3 text-[13px] outline-none"
                    required
                  />
                </div>
              </label>
            </div>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-[#f4f2ec] p-3.5">
              <input
                type="checkbox"
                checked={confirmation}
                onChange={(event) => setConfirmation(event.target.checked)}
                disabled={busy || Boolean(uploadSession)}
                className="mt-0.5 accent-[#d71e28]"
              />
              <span className="text-[10px] leading-5 text-[#5f5652]">
                I confirm I am authorized to submit this check and understand Admin approval posts the amount to my internal ledger, not to a bank account.
              </span>
            </label>
            {uploadSession && (
              <div className="mt-4 rounded-xl border border-[#e5e0d5] bg-[#fbfaf6] p-3 text-[10px] leading-5 text-[#6f6663]">
                Images are uploaded. If submission did not finish, retry it or discard this draft before changing the photos.
                <button
                  type="button"
                  onClick={() => clearSession()}
                  disabled={busy}
                  className="ml-2 font-bold text-[#b01821] underline"
                >
                  Discard draft
                </button>
              </div>
            )}
            {message && (
              <p className={`mt-4 rounded-lg px-3 py-2 text-[11px] ${messageIsError ? "bg-[#fff0ed] text-[#8c2028]" : "bg-[#eaf2e9] text-[#326241]"}`} role={messageIsError ? "alert" : "status"}>
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || overviewQuery.isLoading || accounts.length === 0}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#d71e28] py-3.5 text-[12px] font-bold text-white transition hover:bg-[#b91822] disabled:cursor-wait disabled:opacity-60"
              data-testid="button-submit-mobile-deposit"
            >
              {busy ? "Uploading and submitting…" : uploadSession ? "Retry submission" : "Submit for admin review"}
              {!busy && <FileCheck2 size={15} />}
            </button>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[20px] border border-[#e5e0d5] bg-[#fbfaf6] p-5">
              <h2 className="font-display text-[15px] font-bold">For a clear image</h2>
              <ul className="mt-3 space-y-2 text-[10px] leading-5 text-[#6f6663]">
                <li>Place the check on a flat, dark surface.</li>
                <li>Include all four corners and avoid glare.</li>
                <li>Use one image for the front and one for the back.</li>
                <li>Accepted formats: JPEG, PNG, and WebP.</li>
              </ul>
            </div>
            <div className="rounded-[20px] border border-[#e5e0d5] bg-white p-5">
              <div className="flex items-center gap-2">
                <Clock3 size={16} className="text-[#9a7951]" />
                <h2 className="font-display text-[15px] font-bold">Your submissions</h2>
              </div>
              {depositsQuery.isLoading ? (
                <p className="mt-3 text-[10px] text-[#756864]">Loading submissions…</p>
              ) : deposits.length === 0 ? (
                <p className="mt-3 text-[10px] leading-5 text-[#756864]">No check images submitted.</p>
              ) : (
                <ul className="mt-3 divide-y divide-[#efede5]">
                  {deposits.map((deposit) => (
                    <li key={deposit.id} className="py-3 first:pt-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-bold">{money(deposit.amountCents)}</p>
                          <p className="mt-1 text-[9px] text-[#756864]">{deposit.accountName} · {dateLabel(deposit.createdAt)}</p>
                        </div>
                        <StatusPill status={deposit.status} />
                      </div>
                      {deposit.reviewNote && <p className="mt-2 text-[9px] leading-4 text-[#6f6663]">{deposit.reviewNote}</p>}
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm("Permanently delete this submission and its images?")) {
                            await deleteDeposit.mutateAsync({ depositId: deposit.id });
                            await queryClient.invalidateQueries({ queryKey: getGetDemoDepositsQueryKey() });
                          }
                        }}
                        className="mt-2 inline-flex items-center gap-1 text-[9px] font-bold text-[#9b252c]"
                      >
                        <Trash2 size={12} /> Delete submission
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </form>
      </main>
    </div>
  );
}

export function AdminDepositReviewPage() {
  const queryClient = useQueryClient();
  const { user, isLoaded } = useUser();
  const depositsQuery = useGetAdminDemoDeposits({
    query: {
      queryKey: getGetAdminDemoDepositsQueryKey(),
      enabled: isLoaded && user?.publicMetadata?.role === "admin",
      refetchInterval: 5_000,
    },
  });
  const reviewDeposit = useReviewDemoDeposit();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isAdmin = user?.publicMetadata?.role === "admin";

  const review = async (depositId: string, decision: "posted" | "rejected") => {
    const note = notes[depositId]?.trim() ?? "";
    if (decision === "rejected" && !note) {
      setError("Add a reason before rejecting a submission.");
      return;
    }
    setError("");
    try {
      await reviewDeposit.mutateAsync({
        depositId,
        data: { decision, ...(note ? { note } : {}) },
      });
      setNotes((current) => ({ ...current, [depositId]: "" }));
      setNotice("Review recorded. This action does not credit funds.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetAdminDemoDepositsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDemoDepositsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDemoOverviewQueryKey() }),
      ]);
    } catch (requestError) {
      const data = requestError && typeof requestError === "object" && "data" in requestError
        ? (requestError as { data?: { error?: string } }).data
        : undefined;
      setError(data?.error ?? "Could not save the review.");
    }
  };

  if (!isLoaded) {
    return <div className="grid min-h-[100dvh] place-items-center bg-[#f9f7f6] text-sm text-[#6f6663]">Loading admin access…</div>;
  }
  if (!isAdmin) {
    return <div className="grid min-h-[100dvh] place-items-center bg-[#f9f7f6] p-6 text-center"><div><p className="font-display text-xl font-bold">Admin access required</p><Link href="/dashboard" className="mt-4 inline-block text-sm font-bold text-[#b01821]">Return to overview</Link></div></div>;
  }

  const deposits = (depositsQuery.data ?? []) as AdminDepositSummary[];
  return (
    <div className="min-h-[100dvh] bg-[#f9f7f6] text-[#141414]">
      <div className="sticky top-0 z-40 flex min-h-9 items-center justify-center gap-2 bg-[#ffcd41] px-4 py-2 text-center text-[10px] font-bold text-[#3b3331]">
        <ShieldCheck size={14} /> Admin-only check image review
      </div>
      <main className="mx-auto max-w-[1180px] px-4 pb-12 pt-6 sm:px-7 sm:pt-9">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-[12px] font-bold text-[#6f6663] hover:text-[#b01821]">
            <ArrowLeft size={16} /> Back to overview
          </Link>
          <Link href="/dashboard/deposit" className="rounded-lg border border-[#d9d5ca] bg-white px-3 py-2 text-[11px] font-bold text-[#514744]">Mobile deposit</Link>
        </div>
        <header className="mb-6">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#9a7951]">Private review queue</p>
          <h1 className="font-display text-[30px] font-bold tracking-[-.05em] sm:text-[38px]">Check submissions</h1>
          <p className="mt-2 max-w-[760px] text-[12px] leading-6 text-[#6f6663]">
            Approval immediately posts the amount to the customer's internal ledger. It does not clear the check or move money through a bank.
          </p>
        </header>
        {error && <p className="mb-4 rounded-lg bg-[#fff0ed] px-3 py-2 text-[11px] text-[#8c2028]" role="alert">{error}</p>}
        {notice && <p className="mb-4 rounded-lg bg-[#eaf2e9] px-3 py-2 text-[11px] text-[#326241]" role="status">{notice}</p>}
        {depositsQuery.isLoading ? (
          <p className="rounded-xl border border-[#e5e0d5] bg-white p-5 text-[12px] text-[#6f6663]">Loading pending submissions…</p>
        ) : deposits.length === 0 ? (
          <div className="rounded-[20px] border border-[#e5e0d5] bg-white p-8 text-center">
            <Check size={22} className="mx-auto text-[#62806c]" />
            <p className="mt-3 font-display text-[16px] font-bold">No checks awaiting review</p>
            <p className="mt-1 text-[11px] text-[#756864]">New customer submissions will appear here.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {deposits.map((deposit) => (
              <article key={deposit.id} className="rounded-[20px] border border-[#e5e0d5] bg-white p-4 shadow-sm sm:p-6">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-[20px] font-bold">{money(deposit.amountCents)}</p>
                    <p className="mt-1 text-[10px] text-[#756864]">{deposit.accountName} · submitted {dateLabel(deposit.submittedAt ?? deposit.createdAt)}</p>
                    <p className="mt-1 font-mono text-[9px] text-[#8d817b]">Customer •••{deposit.customerId.slice(-6)}</p>
                  </div>
                  <StatusPill status={deposit.status} />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {(["front", "back"] as const).map((side) => (
                    <figure key={side} className="rounded-xl border border-[#e5e0d5] bg-[#f8f6f1] p-2">
                      <img
                        src={`/api/demo/deposits/${deposit.id}/images/${side}`}
                        alt={`${side} of check submitted for ${money(deposit.amountCents)}`}
                        className="aspect-[1.58/1] w-full rounded-lg bg-white object-contain"
                      />
                      <figcaption className="px-1 pt-2 text-[9px] font-bold uppercase tracking-[.12em] text-[#756864]">{side} of check</figcaption>
                    </figure>
                  ))}
                </div>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-[#78857b]">Review note</span>
                  <textarea
                    value={notes[deposit.id] ?? ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [deposit.id]: event.target.value }))}
                    maxLength={400}
                    rows={2}
                    className="w-full resize-y rounded-xl border border-[#dedacf] bg-[#fffefa] px-3 py-2.5 text-[11px] outline-none focus:border-[#77917d]"
                    placeholder="Add a note; required when rejecting."
                  />
                </label>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={reviewDeposit.isPending}
                    onClick={() => void review(deposit.id, "rejected")}
                    className="rounded-lg border border-[#d9d5ca] px-4 py-2.5 text-[10px] font-bold text-[#9b252c] disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={reviewDeposit.isPending}
                    onClick={() => void review(deposit.id, "posted")}
                    className="rounded-lg bg-[#3b3331] px-4 py-2.5 text-[10px] font-bold text-white disabled:opacity-50"
                  >
                    Approve and post to balance
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
