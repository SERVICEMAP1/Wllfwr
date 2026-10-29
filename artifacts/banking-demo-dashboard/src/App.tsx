import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { AdminDepositReviewPage, MobileDepositPage } from './pages/mobile-deposits';
import { AdminEnrollmentPage, EnrollmentGate } from './pages/enrollment';
import {
  getGetDemoOverviewQueryKey,
  useCreateDemoBillPayment,
  useCreateDemoTransfer,
  useGetDemoOverview,
  useUpdateDemoCard,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import PublicHomepage from '@/pages/public-homepage';
import {
  Activity, ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, Bell,
  Check, ChevronDown, CircleHelp, CreditCard, Download, Eye, EyeOff,
  FileText, Home, LockKeyhole, Menu, MoreHorizontal, Plus, Search, Shield,
  SlidersHorizontal, Sparkles, Wallet, X,
} from 'lucide-react';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in the app environment.');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#d71e28',
    colorForeground: '#3b3331',
    colorMutedForeground: '#6f6663',
    colorDanger: '#b01821',
    colorBackground: '#f9f7f6',
    colorInput: '#fffefa',
    colorInputForeground: '#3b3331',
    colorNeutral: '#d9d5ca',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.875rem',
  },
  elements: {
    rootBox: { display: 'flex', justifyContent: 'center', width: '100%' },
    cardBox: {
      backgroundColor: '#f9f7f6',
      borderRadius: '1rem',
      boxShadow: '0 24px 70px rgba(59, 51, 49, .18)',
      width: 'min(100%, 440px)',
      overflow: 'hidden',
    },
    card: { boxShadow: 'none', border: '0', backgroundColor: 'transparent' },
    footer: { boxShadow: 'none', border: '0', backgroundColor: 'transparent' },
    headerTitle: { color: '#141414', fontFamily: 'Manrope, sans-serif', fontWeight: '700' },
    headerSubtitle: { color: '#6f6663' },
    socialButtonsBlockButtonText: { color: '#3b3331', fontWeight: '600' },
    formFieldLabel: { color: '#514744', fontWeight: '600' },
    footerActionLink: { color: '#b01821', fontWeight: '700' },
    footerActionText: { color: '#6f6663' },
    dividerText: { color: '#756864' },
    identityPreviewEditButton: { color: '#b01821' },
    formFieldSuccessText: { color: '#326241' },
    alertText: { color: '#7f1720' },
    logoBox: { height: '34px' },
    logoImage: { height: '34px', width: 'auto' },
    socialButtonsBlockButton: {
      backgroundColor: '#fffefa',
      borderColor: '#d9d5ca',
      borderRadius: '0.75rem',
    },
    formButtonPrimary: {
      backgroundColor: '#d71e28',
      borderRadius: '0.75rem',
      color: '#ffffff',
      fontWeight: '700',
    },
    formFieldInput: {
      backgroundColor: '#fffefa',
      borderColor: '#d9d5ca',
      borderRadius: '0.75rem',
      color: '#3b3331',
    },
    footerAction: { color: '#6f6663' },
    dividerLine: { backgroundColor: '#d9d5ca' },
    alert: { backgroundColor: '#fff0ed', borderRadius: '0.75rem' },
    otpCodeFieldInput: {
      backgroundColor: '#fffefa',
      borderColor: '#d9d5ca',
      color: '#3b3331',
    },
    formFieldRow: { marginBottom: '1rem' },
    main: { backgroundColor: '#f9f7f6' },
  },
};

type ActivityItem = { id: string; name: string; date: string; account: string; amount: number; category: string; status: string };
type ModalKind = 'transfer' | 'payment' | null;

const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const formatBalance = (amount: number, hidden: boolean) => hidden ? '••••••' : money(amount);

function formatActivityDate(value: Date | string): string {
  const date = activityDate(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function activityDate(value: Date | string): Date {
  return new Date(value instanceof Date ? value.toISOString() : value);
}

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      return data.error;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

function HomePage() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: overview, isLoading, error: overviewError, refetch } = useGetDemoOverview({
    query: { queryKey: getGetDemoOverviewQueryKey(), refetchInterval: 5_000 },
  });
  const transferMutation = useCreateDemoTransfer();
  const paymentMutation = useCreateDemoBillPayment();
  const cardMutation = useUpdateDemoCard();
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<ModalKind>(null);
  const [notice, setNotice] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [paymentVendor, setPaymentVendor] = useState('Citylight Electric');
  const [transferFrom, setTransferFrom] = useState('checking');
  const [transferTo, setTransferTo] = useState('savings');
  const [amount, setAmount] = useState('');
  const [filter, setFilter] = useState('All activity');

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const checkingAccount = overview?.accounts.find((account) => account.kind === 'checking');
  const savingsAccount = overview?.accounts.find((account) => account.kind === 'savings');
  const checking = (checkingAccount?.balanceCents ?? 0) / 100;
  const savings = (savingsAccount?.balanceCents ?? 0) / 100;
  const cards = overview?.cards ?? [];
  const locked = cards[0]?.status === 'frozen';
  const activity = useMemo<ActivityItem[]>(() => (overview?.activity ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    date: formatActivityDate(item.date),
    account: item.account,
    amount: item.amountCents / 100,
    category: item.category,
    status: item.status,
  })), [overview]);
  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);
  const monthlyActivity = (overview?.activity ?? []).filter((item) =>
    activityDate(item.date) >= currentMonthStart && item.category !== 'Opening balance',
  );
  const moneyIn = monthlyActivity.reduce((sum, item) => sum + Math.max(item.amountCents, 0), 0) / 100;
  const moneyOut = monthlyActivity.reduce((sum, item) => sum + Math.max(-item.amountCents, 0), 0) / 100;
  const filteredActivity = useMemo(() => activity.filter((item) => {
    const matchesText = `${item.name} ${item.category} ${item.account}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === 'All activity' || item.category === filter;
    return matchesText && matchesFilter;
  }), [activity, query, filter]);

  const showNotice = (text: string) => setNotice(text);
  const refreshOverview = () => queryClient.invalidateQueries({ queryKey: getGetDemoOverviewQueryKey() });
  const submitTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountCents = Math.round(Number(amount) * 100);
    const from = overview?.accounts.find((account) => account.kind === transferFrom);
    const to = overview?.accounts.find((account) => account.kind === transferTo);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) { showNotice('Enter an amount greater than $0.'); return; }
    if (!from || !to || from.id === to.id) { showNotice('Choose two different accounts.'); return; }
    try {
      await transferMutation.mutateAsync({
        data: { fromAccountId: from.id, toAccountId: to.id, amountCents, idempotencyKey: window.crypto.randomUUID() },
      });
      await refreshOverview();
      setModal(null);
      setAmount('');
      showNotice(`${money(amountCents / 100)} posted between your accounts.`);
    } catch (error) {
      showNotice(apiErrorMessage(error, 'The transfer could not be recorded.'));
    }
  };
  const submitPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountCents = Math.round(Number(amount) * 100);
    if (!checkingAccount || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
      showNotice('Enter a valid payment amount.');
      return;
    }
    try {
      await paymentMutation.mutateAsync({
        data: {
          accountId: checkingAccount.id,
          payee: paymentVendor,
          amountCents,
          idempotencyKey: window.crypto.randomUUID(),
        },
      });
      await refreshOverview();
      setModal(null);
      setAmount('');
      showNotice(`${paymentVendor} payment record posted. It was not sent to the payee.`);
    } catch (error) {
      showNotice(apiErrorMessage(error, 'The payment record could not be saved.'));
    }
  };

  const openTransfer = () => { setAmount(''); setModal('transfer'); };
  const openPayment = (vendor = 'Citylight Electric', presetAmountCents?: number) => {
    setPaymentVendor(vendor);
    setAmount(presetAmountCents === undefined ? '' : (presetAmountCents / 100).toFixed(2));
    setModal('payment');
  };
  const toggleCard = async () => {
    const card = cards[0];
    if (!card) return;
    const nextStatus = locked ? 'active' : 'frozen';
    try {
      await cardMutation.mutateAsync({
        cardId: card.id,
        data: { status: nextStatus },
      });
      await refreshOverview();
      showNotice(nextStatus === 'frozen' ? 'Card profile paused.' : 'Card profile resumed.');
    } catch (error) {
      showNotice(apiErrorMessage(error, 'The card profile could not be updated.'));
    }
  };
  const downloadStatement = () => {
    const rows = [
      ['Date', 'Description', 'Account', 'Category', 'Amount (USD)', 'Status'],
      ...activity.map((item) => [
        item.date,
        item.name,
        item.account,
        item.category,
        item.amount.toFixed(2),
        item.status,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\r\n');
    const file = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = file;
    anchor.download = 'account-activity.csv';
    anchor.click();
    URL.revokeObjectURL(file);
    showNotice('Account activity downloaded.');
  };

  if (isLoading) {
    return <div className="grid min-h-[100dvh] place-items-center bg-[#f9f7f6] text-sm text-[#6f6663]" role="status">Loading your account information…</div>;
  }
  if (!overview) {
    return <div className="grid min-h-[100dvh] place-items-center bg-[#f9f7f6] p-6 text-center"><div className="max-w-md"><p className="font-display text-xl font-bold">Account information is temporarily unavailable.</p><p className="mt-2 text-sm text-[#6f6663]" role="alert">{apiErrorMessage(overviewError, 'Please try again.')}</p><button type="button" onClick={() => void refetch()} className="mt-5 rounded-lg bg-[#d71e28] px-5 py-3 text-sm font-bold text-white">Retry</button></div></div>;
  }

  return (
    <div className="min-h-[100dvh] bg-[#f9f7f6] text-[#141414]">
      <div className="sticky top-0 z-40 flex min-h-9 items-center justify-center gap-2 bg-[#ffcd41] px-4 py-2 text-center text-[11px] font-bold tracking-[.025em] text-[#3b3331]" data-testid="notice-ledger">
        <Shield size={13} strokeWidth={2.2} />
        <span>Independent app · Not affiliated with Wells Fargo · Balances are not held at a bank</span>
      </div>
      <div className="flex min-h-[calc(100dvh-36px)]">
        <aside className={`fixed inset-y-9 left-0 z-30 flex w-[248px] flex-col bg-[#3b3331] px-5 pb-5 pt-7 text-[#f9f7f6] transition-transform md:sticky md:top-9 md:h-[calc(100dvh-36px)] md:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="mb-10 flex items-center gap-3 px-2">
            <Link href="/" className="flex min-w-0 items-center gap-3" data-testid="link-dashboard-home">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ffcd41] text-[#3b3331]"><span className="font-display text-[22px] font-extrabold">W</span></div>
              <div><p className="font-display text-[19px] font-extrabold leading-5 tracking-[-.04em]">Wells Fargo</p><p className="mt-1 text-[9px] font-semibold uppercase tracking-[.19em] text-[#b6c4b8]">Independent ledger</p></div>
            </Link>
            <button className="ml-auto rounded-lg p-2 text-[#dce5dc] md:hidden" onClick={() => setMobileNav(false)} aria-label="Close navigation" data-testid="button-close-navigation"><X size={18} /></button>
          </div>
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.17em] text-[#94a99b]">Your money</p>
          <nav className="space-y-1" aria-label="Main navigation">
            <a href="#overview" onClick={() => setMobileNav(false)} className="flex items-center gap-3 rounded-xl bg-[#d71e28] px-3 py-3 text-[13px] font-semibold text-[#ffffff]" data-testid="link-nav-overview"><Home size={17} />Overview</a>
            <a href="#accounts" onClick={() => setMobileNav(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium text-[#f1eae7] transition hover:bg-[#514542]" data-testid="link-nav-accounts"><Wallet size={17} />Accounts</a>
            <a href="#activity" onClick={() => setMobileNav(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium text-[#f1eae7] transition hover:bg-[#514542]" data-testid="link-nav-activity"><Activity size={17} />Activity</a>
            <a href="#cards" onClick={() => setMobileNav(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium text-[#f1eae7] transition hover:bg-[#514542]" data-testid="link-nav-cards"><CreditCard size={17} />Cards</a>
          </nav>
          <p className="mb-3 mt-9 px-3 text-[10px] font-bold uppercase tracking-[.17em] text-[#94a99b]">Quick actions</p>
          <button onClick={openTransfer} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-medium text-[#f1eae7] transition hover:bg-[#514542]" data-testid="button-nav-transfer"><ArrowLeftRight size={17} />Move money</button>
          <button onClick={() => openPayment()} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-medium text-[#f1eae7] transition hover:bg-[#514542]" data-testid="button-nav-pay-bill"><FileText size={17} />Pay a bill</button>
          <Link href="/dashboard/deposit" onClick={() => setMobileNav(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium text-[#f1eae7] transition hover:bg-[#514542]" data-testid="link-nav-mobile-deposit"><ArrowDownLeft size={17} />Mobile deposit</Link>
          {user?.publicMetadata?.role === 'admin' && <Link href="/dashboard/admin/enrollments" onClick={() => setMobileNav(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium text-[#f1eae7] transition hover:bg-[#514542]" data-testid="link-nav-admin-enrollments"><Shield size={17} />Review enrollments</Link>}
          {user?.publicMetadata?.role === 'admin' && <Link href="/dashboard/admin/deposits" onClick={() => setMobileNav(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium text-[#f1eae7] transition hover:bg-[#514542]" data-testid="link-nav-admin-deposits"><Shield size={17} />Review deposits</Link>}
          <div className="mt-auto rounded-2xl border border-[#6b5b56] bg-[#4b403d] p-4">
            <div className="mb-3 flex items-center justify-between"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#d71e28] text-[#ffcd41]"><Sparkles size={15} /></span><span className="rounded-full bg-[#ffcd41] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#3b3331]">Preview</span></div>
            <p className="font-display text-[15px] font-bold">A little more clarity.</p>
            <p className="mt-1 text-[11px] leading-5 text-[#b8c9bc]">Explore a friendly take on everyday banking.</p>
          </div>
            <div className="mt-5 flex items-center gap-3 border-t border-[#6b5b56] px-2 pt-4">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#d2c095] text-[12px] font-bold text-[#294437]">JD</div>
            <div className="min-w-0"><p className="truncate text-[12px] font-semibold">{user?.firstName || 'Customer'}</p><p className="truncate text-[10px] text-[#a9bcad]">Account profile</p></div>
            <button onClick={() => void signOut({ redirectUrl: basePath || '/' })} className="ml-auto rounded-lg px-2 py-1 text-[10px] font-semibold text-[#f1eae7] hover:bg-[#514542]" aria-label="Sign out" data-testid="button-sign-out">Sign out</button>
          </div>
        </aside>
        {mobileNav && <button onClick={() => setMobileNav(false)} className="fixed inset-9 z-20 bg-[#3b3331]/55 md:hidden" aria-label="Close navigation overlay" data-testid="button-navigation-overlay" />}

        <main id="overview" className="min-w-0 flex-1">
          <header className="sticky top-9 z-20 flex h-[68px] items-center justify-between border-b border-[#e4e0d6] bg-[#f9f7f6]/95 px-5 backdrop-blur sm:px-8 lg:px-11">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileNav(true)} className="rounded-lg p-2 text-[#3b3331] md:hidden" aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={20} /></button>
              <div className="hidden text-[12px] font-medium text-[#829087] sm:block">Tuesday, October 27, 2026</div>
              <span className="hidden h-4 w-px bg-[#d9d5ca] sm:block" />
              <span className="text-[12px] font-semibold text-[#3b3331]">Good morning, {user?.firstName || 'there'}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => showNotice('You’re all caught up.')} className="relative grid h-10 w-10 place-items-center rounded-full text-[#3b3331] transition hover:bg-[#ece9e0]" aria-label="Notifications" data-testid="button-notifications"><Bell size={18} /><span className="absolute right-[9px] top-[9px] h-1.5 w-1.5 rounded-full bg-[#d71e28]" /></button>
              <button onClick={() => showNotice('Account support is available.')} className="grid h-10 w-10 place-items-center rounded-full text-[#3b3331] transition hover:bg-[#ece9e0]" aria-label="Help" data-testid="button-help"><CircleHelp size={18} /></button>
            </div>
          </header>

          <div className="mx-auto max-w-[1440px] px-5 pb-12 pt-8 sm:px-8 lg:px-11">
            <section className="page-enter mb-7 flex flex-wrap items-end justify-between gap-4">
              <div><div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.17em] text-[#756864]"><span className="h-px w-6 bg-[#d71e28]" />{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div><h1 className="font-display text-[32px] font-bold tracking-[-.055em] text-[#141414] sm:text-[38px]">Your money, in good shape.</h1><p className="mt-2 text-[13px] text-[#6f6663]">Here’s your financial snapshot for today.</p></div>
              <button onClick={downloadStatement} className="flex items-center gap-2 rounded-xl border border-[#d9d5ca] bg-[#fbfaf6] px-4 py-2.5 text-[12px] font-semibold text-[#385448] transition hover:bg-white" data-testid="button-download-statement"><Download size={15} />Download account activity</button>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.7fr_1fr]" aria-label="Financial overview">
              <div className="relative overflow-hidden rounded-[22px] bg-[#d71e28] p-6 text-[#ffffff] sm:p-8">
                <div className="pointer-events-none absolute -right-10 -top-20 h-72 w-72 rounded-full border border-[#ffffff14]" /><div className="pointer-events-none absolute -right-1 -top-10 h-52 w-52 rounded-full border border-[#ffffff16]" />
                <div className="relative flex flex-wrap items-start justify-between gap-5">
                   <div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[#c3d2c5]">Total available balance <span className="rounded-full bg-[#ffffff19] px-2 py-1 text-[9px] tracking-wide text-[#e6ebdf]">{overview.accounts.length} accounts</span></div><div className="mt-3 flex items-center gap-3"><p className="font-display text-[40px] font-bold leading-none tracking-[-.055em] sm:text-[48px]" data-testid="text-total-balance">{formatBalance(checking + savings, balanceHidden)}</p><button onClick={() => setBalanceHidden(!balanceHidden)} className="grid h-9 w-9 place-items-center rounded-full text-[#d4dfd3] hover:bg-white/10" aria-label={balanceHidden ? 'Show balances' : 'Hide balances'} data-testid="button-toggle-balance">{balanceHidden ? <Eye size={17} /> : <EyeOff size={17} />}</button></div><p className="mt-3 text-[11px] text-[#c3d2c5]">Internal ledger balance</p></div>
                  <button onClick={openTransfer} className="flex items-center gap-2 rounded-xl bg-[#ffcd41] px-4 py-3 text-[12px] font-bold text-[#141414] shadow-sm transition hover:bg-[#f3bd25]" data-testid="button-transfer"><ArrowLeftRight size={16} />Transfer money</button>
                </div>
                <div className="relative mt-8 grid grid-cols-2 gap-4 border-t border-[#ffffff24] pt-5">
                  <div><p className="text-[10px] font-medium uppercase tracking-[.12em] text-[#b9cdbd]">{checkingAccount?.name}</p><p className="mt-1 font-display text-[22px] font-bold tracking-[-.03em]" data-testid="text-checking-balance">{formatBalance(checking, balanceHidden)}</p><p className="mt-1 font-mono text-[10px] tracking-[.12em] text-[#b9cdbd]">{checkingAccount?.maskedNumber}</p></div>
                  <div className="border-l border-[#ffffff24] pl-5"><p className="text-[10px] font-medium uppercase tracking-[.12em] text-[#b9cdbd]">{savingsAccount?.name}</p><p className="mt-1 font-display text-[22px] font-bold tracking-[-.03em]" data-testid="text-savings-balance">{formatBalance(savings, balanceHidden)}</p><p className="mt-1 font-mono text-[10px] tracking-[.12em] text-[#b9cdbd]">{savingsAccount?.maskedNumber}</p></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-[20px] border border-[#e5e0d5] bg-[#ffffff] p-5 sm:p-6"><div className="mb-5 grid h-9 w-9 place-items-center rounded-xl bg-[#fff0bd] text-[#3b3331]"><ArrowDownLeft size={17} /></div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#6f6663]">Money in</p><p className="mt-1 font-display text-[24px] font-bold tracking-[-.045em] text-[#141414]" data-testid="text-money-in">{money(moneyIn)}</p><p className="mt-1 text-[10px] text-[#756864]">This month</p><div className="mt-5 flex h-1.5 gap-1"><i className="w-[36%] rounded-full bg-[#d71e28]" /><i className="w-[24%] rounded-full bg-[#ffcd41]" /><i className="w-[18%] rounded-full bg-[#d7c69f]" /><i className="flex-1 rounded-full bg-[#ebe7dd]" /></div></div>
                <div className="rounded-[20px] border border-[#e5e0d5] bg-[#ffffff] p-5 sm:p-6"><div className="mb-5 grid h-9 w-9 place-items-center rounded-xl bg-[#f4e4e0] text-[#d71e28]"><ArrowUpRight size={17} /></div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#6f6663]">Money out</p><p className="mt-1 font-display text-[24px] font-bold tracking-[-.045em] text-[#141414]" data-testid="text-money-out">{money(moneyOut)}</p><p className="mt-1 text-[10px] text-[#756864]">This month</p><div className="mt-5 flex h-1.5 gap-1"><i className="w-[26%] rounded-full bg-[#d71e28]" /><i className="w-[20%] rounded-full bg-[#ffcd41]" /><i className="w-[14%] rounded-full bg-[#d7c69f]" /><i className="flex-1 rounded-full bg-[#ebe7dd]" /></div></div>
              </div>
            </section>

              <section id="accounts" className="mt-9">
              <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#756864]">Your accounts</p><h2 className="mt-1 font-display text-[21px] font-bold tracking-[-.04em] text-[#141414]">A place for every dollar</h2></div><button onClick={() => showNotice('New account opening is not available yet.')} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold text-[#d71e28] hover:bg-[#fff0bd]" data-testid="button-add-account"><Plus size={15} />Add account</button></div>
              <div className="grid gap-3 md:grid-cols-2">
                {checkingAccount && <AccountCard title={checkingAccount.name} tag="Spending" number={checkingAccount.maskedNumber} balance={checking} icon={<Wallet size={18} />} onTransfer={openTransfer} hidden={balanceHidden} />}
                {savingsAccount && <AccountCard title={savingsAccount.name} tag="Save for later" number={savingsAccount.maskedNumber} balance={savings} icon={<Sparkles size={18} />} onTransfer={openTransfer} hidden={balanceHidden} />}
              </div>
            </section>

            <section className="mt-9 grid gap-5 xl:grid-cols-[1.45fr_1fr]">
              <div id="activity" className="scroll-mt-28 rounded-[20px] border border-[#e5e0d5] bg-[#fbfaf6]">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ece8df] px-5 py-5 sm:px-6">
                  <div><div className="flex items-center gap-2"><Activity size={16} className="text-[#62806c]" /><h2 className="font-display text-[19px] font-bold tracking-[-.035em]">Recent activity</h2></div><p className="mt-1 text-[11px] text-[#859087]">A little movement in your accounts</p></div>
                  <a href="#activity" onClick={() => setFilter('All activity')} className="text-[11px] font-bold text-[#3c694f]" data-testid="link-view-all-activity">View all <ArrowRight className="ml-1 inline" size={13} /></a>
                </div>
                <div className="flex flex-wrap gap-2 px-5 pb-3 pt-4 sm:px-6">
                  <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-[#e5e0d5] bg-[#fffefa] px-3 py-2 text-[#8a948a]"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search activity" className="w-full bg-transparent text-[11px] text-[#30473b] outline-none placeholder:text-[#9ba39a]" data-testid="input-search-activity" /></label>
                  <label className="flex items-center gap-2 rounded-lg border border-[#e5e0d5] bg-[#fffefa] px-3 py-2 text-[#698071]"><SlidersHorizontal size={13} /><select value={filter} onChange={(e) => setFilter(e.target.value)} className="bg-transparent text-[11px] font-medium text-[#52675b] outline-none" aria-label="Filter activity" data-testid="select-activity-filter"><option>All activity</option><option>Groceries</option><option>Deposit</option><option>Dining</option><option>Utilities</option><option>Shopping</option><option>Transfer</option></select><ChevronDown size={12} /></label>
                </div>
                <div className="px-5 pb-2 sm:px-6">
                  {filteredActivity.length ? filteredActivity.map((item) => <ActivityRow key={item.id} item={item} />) : <div className="py-10 text-center"><div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#f0eee6] text-[#839084]"><Search size={17} /></div><p className="mt-3 text-[12px] font-semibold">Nothing found just yet</p><p className="mt-1 text-[11px] text-[#8a948a]">Try another search or clear the filter.</p></div>}
                </div>
                <div className="border-t border-[#ece8df] px-6 py-3 text-[10px] text-[#929a91]">Internal ledger activity · Not a bank statement</div>
              </div>

              <div className="space-y-5">
                <section className="rounded-[20px] border border-[#e5e0d5] bg-[#fbfaf6] p-5 sm:p-6">
                  <div className="flex items-start justify-between"><div><div className="flex items-center gap-2"><FileText size={16} className="text-[#9a7951]" /><h2 className="font-display text-[19px] font-bold tracking-[-.035em]">Bills to take care of</h2></div><p className="mt-1 text-[11px] text-[#859087]">Upcoming bill records.</p></div><button onClick={() => showNotice('Bill reminders are managed in this application.')} aria-label="Bill options" className="rounded-full p-1.5 text-[#829087] hover:bg-[#efede6]" data-testid="button-bill-options"><MoreHorizontal size={18} /></button></div>
                  <div className="mt-4 divide-y divide-[#ece8df]">
                    {overview.bills.filter((bill) => bill.status === 'scheduled').map((bill) => (
                      <BillRow
                        key={bill.id}
                        name={bill.payee}
                        detail={`Due ${activityDate(bill.dueDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}`}
                        amount={money(bill.amountCents / 100)}
                        icon={bill.payee.split(' ').map((word) => word[0]).join('').slice(0, 2)}
                        onClick={() => openPayment(bill.payee, bill.amountCents)}
                        testId={`button-pay-${bill.id}`}
                      />
                    ))}
                    {!overview.bills.some((bill) => bill.status === 'scheduled') && <p className="py-5 text-center text-[11px] text-[#756864]">No bills are scheduled.</p>}
                  </div>
                  <button onClick={() => openPayment()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#dcd8cc] py-2.5 text-[11px] font-bold text-[#466650] transition hover:bg-[#f2f0e8]" data-testid="button-pay-bill"><Plus size={14} />Pay a bill</button>
                </section>
                <section id="cards" className="scroll-mt-28 relative overflow-hidden rounded-[20px] bg-[#f1e7d9] p-5 sm:p-6">
                  <div className="absolute -right-14 -top-16 h-48 w-48 rounded-full border border-[#d8c39a]" /><div className="absolute -right-5 -top-7 h-32 w-32 rounded-full border border-[#d8c39a]" />
                  <div className="relative flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#6c5b54]">Card controls</p><h2 className="mt-1 font-display text-[19px] font-bold tracking-[-.035em]">Internal card profile</h2></div><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#ffcd41] text-[#3b3331]"><CreditCard size={17} /></div></div>
                  <div className="relative mt-4 flex items-center justify-between rounded-xl bg-[#3b3331] px-4 py-3.5 text-[#f9f7f6]"><div><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-[#ffcd41]">Internal card profile</p><p className="mt-1 font-mono text-[13px] tracking-[.14em]">••••  ••••  ••••  {cards[0]?.lastFour ?? '4481'}</p></div><span className="font-display text-[12px] font-extrabold tracking-tight">INTERNAL</span></div>
                  <div className="relative mt-4 flex items-center justify-between"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${locked ? 'bg-[#d71e28]' : 'bg-[#ffcd41]'}`} /><span className="text-[11px] font-semibold text-[#3b3331]" data-testid="status-card-lock">{locked ? 'Profile paused' : 'Profile active'}</span></div><button onClick={() => void toggleCard()} disabled={cardMutation.isPending} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold transition disabled:opacity-50 ${locked ? 'bg-[#d71e28] text-white' : 'border border-[#c9b991] bg-[#fff7df] text-[#3b3331]'}`} data-testid="button-toggle-card-lock"><LockKeyhole size={13} />{locked ? 'Resume profile' : 'Pause profile'}</button></div>
                  <div className="relative mt-4 flex gap-2 border-t border-[#d3c9b1] pt-3"><button onClick={() => showNotice('Card replacement service is not connected.')} className="text-[10px] font-semibold text-[#52644e] underline decoration-[#a9a286] underline-offset-4" data-testid="button-replace-card">Request replacement</button><span className="text-[#a49a81]">·</span><button onClick={() => showNotice('External card issuer details are not connected.')} className="text-[10px] font-semibold text-[#52644e] underline decoration-[#a9a286] underline-offset-4" data-testid="button-card-details">Card details</button></div>
                </section>
              </div>
            </section>
            <footer className="mt-10 flex flex-col gap-2 border-t border-[#e2ded3] pt-5 text-[10px] text-[#8b948b] sm:flex-row sm:items-center sm:justify-between"><p>Independent application, not affiliated with Wells Fargo. It records internal ledger activity only and is not a bank.</p><div className="flex gap-4"><button onClick={() => showNotice('Check images are privately accessible only to the owner and authorized Admin.')} className="hover:text-[#43594a]" data-testid="button-privacy">Privacy</button><button onClick={() => showNotice('Account support is available.')} className="hover:text-[#43594a]" data-testid="button-support">Support</button></div></footer>
          </div>
        </main>
      </div>

      {notice && <div role="status" className="fixed bottom-5 right-5 z-[70] flex max-w-[calc(100vw-40px)] items-center gap-3 rounded-xl bg-[#3b3331] px-4 py-3 text-[12px] font-medium text-[#f9f7f6] shadow-xl" data-testid="status-feedback"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#ffcd41] text-[#141414]"><Check size={14} /></span>{notice}<button onClick={() => setNotice('')} className="ml-1 rounded p-1 text-[#f9f7f6]" aria-label="Dismiss message" data-testid="button-dismiss-notice"><X size={14} /></button></div>}
      {modal && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#3b3331]/55 p-4 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="w-full max-w-[430px] rounded-[22px] border border-[#e5e0d5] bg-[#f9f7f6] p-6 shadow-2xl sm:p-7" data-testid={modal === 'transfer' ? 'dialog-transfer' : 'dialog-payment'}>
          <div className="mb-5 flex items-start justify-between"><div><div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[#ffcd41] text-[#3b3331]">{modal === 'transfer' ? <ArrowLeftRight size={18} /> : <FileText size={18} />}</div><h2 id="dialog-title" className="font-display text-[23px] font-bold tracking-[-.04em]">{modal === 'transfer' ? 'Move money' : 'Pay a bill'}</h2><p className="mt-1 text-[11px] leading-5 text-[#6f6663]">Updates your internal ledger immediately.</p></div><button onClick={() => setModal(null)} className="rounded-full p-2 text-[#6f6663] hover:bg-[#efeae7]" aria-label="Close dialog" data-testid="button-close-dialog"><X size={18} /></button></div>
          {modal === 'transfer' ? <form onSubmit={submitTransfer} className="space-y-4">
            <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-[#6f6663]">From</span><select value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)} className="w-full rounded-xl border border-[#dedacf] bg-[#ffffff] px-3 py-3 text-[12px] outline-none focus:border-[#d71e28]" data-testid="select-transfer-from"><option value="checking">Everyday Checking · {money(checking)}</option><option value="savings">Rainy Day Savings · {money(savings)}</option></select></label>
            <div className="flex justify-center"><span className="grid h-8 w-8 place-items-center rounded-full border border-[#e1ddd2] bg-[#fff4d2] text-[#3b3331]"><ArrowDownLeft size={15} /></span></div>
            <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-[#6f6663]">To</span><select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} className="w-full rounded-xl border border-[#dedacf] bg-[#ffffff] px-3 py-3 text-[12px] outline-none focus:border-[#d71e28]" data-testid="select-transfer-to"><option value="savings">Rainy Day Savings · {money(savings)}</option><option value="checking">Everyday Checking · {money(checking)}</option></select></label>
            <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-[#78857b]">Amount</span><div className="flex items-center rounded-xl border border-[#dedacf] bg-[#fffefa] px-3 focus-within:border-[#77917d]"><span className="text-[14px] text-[#758177]">$</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full bg-transparent px-2 py-3 text-[14px] outline-none" required data-testid="input-transfer-amount" /></div></label>
            <p className="rounded-lg bg-[#f0eee6] px-3 py-2.5 text-[10px] leading-4 text-[#727e73]">This records an internal ledger transfer only; it does not move funds to another bank.</p>
            <button type="submit" disabled={transferMutation.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#d71e28] py-3 text-[12px] font-bold text-[#ffffff] transition hover:bg-[#b91822] disabled:cursor-wait disabled:opacity-60" data-testid="button-submit-transfer">{transferMutation.isPending ? 'Posting transfer…' : 'Confirm transfer'} <ArrowRight size={15} /></button>
          </form> : <form onSubmit={submitPayment} className="space-y-4">
            <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-[#78857b]">Payee</span><select value={paymentVendor} onChange={(e) => setPaymentVendor(e.target.value)} className="w-full rounded-xl border border-[#dedacf] bg-[#fffefa] px-3 py-3 text-[12px] outline-none focus:border-[#77917d]" data-testid="select-payment-payee"><option>Citylight Electric</option><option>Pine &amp; Peak Internet</option><option>Willow Water Co.</option><option>Other payee</option></select></label>
            <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-[#78857b]">Payment amount</span><div className="flex items-center rounded-xl border border-[#dedacf] bg-[#fffefa] px-3 focus-within:border-[#77917d]"><span className="text-[14px] text-[#758177]">$</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={paymentVendor === 'Citylight Electric' ? '92.18' : paymentVendor === 'Pine & Peak Internet' ? '64.00' : '38.46'} className="w-full bg-transparent px-2 py-3 text-[14px] outline-none" required data-testid="input-payment-amount" /></div></label>
            <p className="rounded-lg bg-[#f0eee6] px-3 py-2.5 text-[10px] leading-4 text-[#727e73]">This records a bill payment in the ledger. It does not send money to the payee.</p>
            <button type="submit" disabled={paymentMutation.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#d71e28] py-3 text-[12px] font-bold text-[#ffffff] transition hover:bg-[#b91822] disabled:cursor-wait disabled:opacity-60" data-testid="button-submit-payment">{paymentMutation.isPending ? 'Recording payment…' : 'Record bill payment'} <ArrowRight size={15} /></button>
          </form>}
        </div>
      </div>}
    </div>
  );
}

function AccountCard({ title, tag, number, balance, icon, onTransfer, hidden }: { title: string; tag: string; number: string; balance: number; icon: ReactNode; onTransfer: () => void; hidden: boolean }) {
  return <div className="flex items-center gap-4 rounded-[17px] border border-[#e5e0d5] bg-[#fbfaf6] p-4 sm:px-5" data-testid={`card-account-${tag.toLowerCase().replaceAll(' ', '-')}`}>
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fff0bd] text-[#3b3331]">{icon}</div>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-[12px] font-bold">{title}</p><span className="rounded-full bg-[#f0eee6] px-2 py-1 text-[9px] font-semibold text-[#78847a]">{tag}</span></div><p className="mt-1 font-mono text-[10px] tracking-[.1em] text-[#909990]">{number}</p></div>
    <div className="text-right"><p className="text-[14px] font-bold tracking-[-.02em]" data-testid={`text-account-balance-${tag.toLowerCase().replaceAll(' ', '-')}`}>{formatBalance(balance, hidden)}</p><button onClick={onTransfer} className="mt-1 text-[10px] font-bold text-[#d71e28] hover:underline" data-testid={`button-transfer-${tag.toLowerCase().replaceAll(' ', '-')}`}>Move money</button></div>
  </div>;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const positive = item.amount > 0;
  const initial = item.name.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase();
  return <div className="flex items-center gap-3 border-b border-[#efede5] py-3.5 last:border-0" data-testid={`row-activity-${item.id}`}>
    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[10px] font-bold ${positive ? 'bg-[#fff0bd] text-[#3b3331]' : 'bg-[#f1e9dc] text-[#3b3331]'}`}>{initial}</div>
    <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-[#34483c]" data-testid={`text-activity-name-${item.id}`}>{item.name}</p><p className="mt-1 truncate text-[9px] text-[#8b958c]">{item.date}<span className="mx-1.5">·</span>{item.account}</p></div>
    <div className="text-right"><p className={`text-[11px] font-bold ${positive ? 'text-[#d71e28]' : 'text-[#3b3331]'}`}>{positive ? '+' : '−'}{money(Math.abs(item.amount))}</p><p className="mt-1 text-[9px] text-[#756864]">{item.status}</p></div>
  </div>;
}

function BillRow({ name, detail, amount, icon, onClick, testId }: { name: string; detail: string; amount: string; icon: string; onClick: () => void; testId: string }) {
  return <div className="flex items-center gap-3 py-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#fff0bd] text-[9px] font-bold tracking-[-.03em] text-[#3b3331]">{icon}</div><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold">{name}</p><p className="mt-1 text-[9px] text-[#756864]">{detail} <span className="mx-1">·</span>{amount}</p></div><button onClick={onClick} className="rounded-lg border border-[#dcd8cc] px-3 py-2 text-[10px] font-bold text-[#d71e28] transition hover:bg-[#fff0bd]" data-testid={testId}>Pay</button></div>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function HomeRedirect() {
  return <>
    <Show when="signed-in"><Redirect to="/dashboard" /></Show>
    <Show when="signed-out"><PublicHomepage /></Show>
  </>;
}

function ProtectedDashboard() {
  return <>
    <Show when="signed-in"><EnrollmentGate><HomePage /></EnrollmentGate></Show>
    <Show when="signed-out"><Redirect to="/sign-in" /></Show>
  </>;
}

function ProtectedMobileDeposit() {
  return <>
    <Show when="signed-in"><EnrollmentGate><MobileDepositPage /></EnrollmentGate></Show>
    <Show when="signed-out"><Redirect to="/sign-in" /></Show>
  </>;
}

function ProtectedAdminEnrollment() {
  return <>
    <Show when="signed-in"><AdminEnrollmentPage /></Show>
    <Show when="signed-out"><Redirect to="/sign-in" /></Show>
  </>;
}

function ProtectedAdminDepositReview() {
  return <>
    <Show when="signed-in"><AdminDepositReviewPage /></Show>
    <Show when="signed-out"><Redirect to="/sign-in" /></Show>
  </>;
}

function SignInPage() {
  return <div className="grid min-h-[100dvh] place-items-center bg-[#efeae7] px-4 py-10">
    <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
  </div>;
}

function SignUpPage() {
  return <div className="grid min-h-[100dvh] place-items-center bg-[#efeae7] px-4 py-10">
    <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
  </div>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        client.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);

  return null;
}

function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={HomeRedirect} />
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route path="/dashboard/admin/enrollments" component={ProtectedAdminEnrollment} />
    <Route path="/dashboard/deposit" component={ProtectedMobileDeposit} />
    <Route path="/dashboard/admin/deposits" component={ProtectedAdminDepositReview} />
    <Route path="/dashboard" component={ProtectedDashboard} />
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Independent Wells Fargo-themed ledger · Not affiliated with Wells Fargo.' } },
      signUp: { start: { title: 'Create your account profile', subtitle: 'Independent application, not affiliated with Wells Fargo.' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkQueryClientCacheInvalidator />
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}

export default App;
