import { useState } from 'react';
import { Link } from 'wouter';
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, BadgeHelp, BookOpen,
  BriefcaseBusiness, Building2, Camera, ChevronDown, CircleHelp,
  CreditCard, FileCheck2, House, Landmark, Menu, PiggyBank, Search,
  ShieldCheck, Wallet, X,
} from 'lucide-react';

const products = [
  { label: 'Accounts', icon: Wallet, target: '#checking' },
  { label: 'Savings ledger', icon: PiggyBank, target: '#savings' },
  { label: 'Card profile', icon: CreditCard, target: '#cards' },
  { label: 'Transfers', icon: ArrowUpRight, target: '#checking' },
  { label: 'Bill records', icon: FileCheck2, target: '#checking' },
  { label: 'Check deposits', icon: Camera, target: '#checking' },
  { label: 'Activity', icon: BookOpen, target: '#checking' },
  { label: 'Account access', icon: ShieldCheck, target: '#checking' },
  { label: 'Statements', icon: ArrowDownToLine, target: '#checking' },
  { label: 'Admin review', icon: Building2, target: '#checking' },
  { label: 'Help & support', icon: CircleHelp, target: '#guidance' },
];

const shortcuts = [
  { title: 'Checking accounts', text: 'View current ledger balances and activity.', icon: Wallet, href: '#checking' },
  { title: 'Savings ledger', text: 'Track internal savings balances.', icon: PiggyBank, href: '#savings' },
  { title: 'Card profile', text: 'Manage your card-profile settings.', icon: CreditCard, href: '#cards' },
  { title: 'Check deposits', text: 'Send check images for Admin review.', icon: Camera, href: '#checking' },
];

function PublicHomepage() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const heroImage = `${import.meta.env.BASE_URL}cedarline-homepage-hero.jpg`;
  const matchingProducts = products.filter(({ label }) =>
    label.toLowerCase().includes(searchTerm.trim().toLowerCase()),
  );

  return (
    <div className="cedar-retail min-h-[100dvh] bg-[#f9f7f6] text-[#3b3331]">
      <div className="cedar-demo-ribbon sticky top-0 z-50 flex min-h-9 items-center justify-center gap-2 bg-[#ffcd41] px-4 py-2 text-center text-[11px] font-bold tracking-[.025em] text-[#3b3331]" data-testid="notice-ledger-home">
        <ShieldCheck size={14} aria-hidden="true" />
        <span>Independent app · Not affiliated with Wells Fargo · Internal ledger only · Not a bank</span>
      </div>

      <header className="cedar-retail-header" onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpenMenu(null);
          setSearchOpen(false);
          setMobileMenuOpen(false);
        }
      }}>
        <div className="cedar-masthead">
          <div className="cedar-masthead-inner">
            <Link href="/" className="cedar-retail-brand" aria-label="Wells Fargo independent ledger home" data-testid="link-home-brand">
              <span className="cedar-brand-mark" aria-hidden="true">W</span>
              <span className="cedar-brand-type"><strong>Wells Fargo</strong><small>Independent ledger</small></span>
            </Link>
            <nav className="cedar-utility" aria-label="Utility navigation">
              <a href="#guidance">Help</a>
              <a href="#about">About this ledger</a>
              <button type="button" aria-expanded={searchOpen} aria-controls="cedar-search-panel" onClick={() => {
                setSearchOpen((current) => !current);
                setOpenMenu(null);
              }}><Search size={15} aria-hidden="true" /> Search</button>
              <Link href="/sign-in" data-testid="link-utility-dashboard">Sign on <ArrowRight size={13} /></Link>
              <Link href="/sign-up" data-testid="link-utility-enroll">Enroll <ArrowRight size={13} /></Link>
            </nav>
            <button type="button" className="cedar-mobile-menu-trigger" aria-label={mobileMenuOpen ? 'Close product navigation' : 'Open product navigation'} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((current) => !current)}>
              {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>
        <nav className={`cedar-product-nav ${mobileMenuOpen ? 'is-open' : ''}`} aria-label="Products and services">
          <div className="cedar-product-scroll">
            {products.map(({ label }) => (
              <button key={label} type="button" aria-expanded={openMenu === label} aria-controls="cedar-product-menu" onClick={() => {
                setOpenMenu((current) => current === label ? null : label);
                setSearchOpen(false);
              }}>
                {label}<ChevronDown size={12} aria-hidden="true" />
              </button>
            ))}
          </div>
          {openMenu && (
            <div className="cedar-mega-menu" id="cedar-product-menu">
              <div className="cedar-mega-intro">
                <p className="cedar-eyebrow">Explore account services</p>
                <h2>{openMenu}</h2>
                <p>Review account tools and learn how internal balances are managed.</p>
              </div>
              <div className="cedar-mega-links">
                <a href={products.find(({ label }) => label === openMenu)?.target ?? '#banking'} onClick={() => setOpenMenu(null)}>{openMenu} overview <ArrowRight size={15} /></a>
                <a href="#guidance" onClick={() => setOpenMenu(null)}>Learning guides <ArrowRight size={15} /></a>
                <Link href="/dashboard" onClick={() => setOpenMenu(null)}>Open your accounts <ArrowRight size={15} /></Link>
              </div>
              <button type="button" className="cedar-menu-close" onClick={() => setOpenMenu(null)} aria-label="Close product menu"><X size={17} /></button>
            </div>
          )}
        </nav>
        {searchOpen && (
          <div className="cedar-search-panel" id="cedar-search-panel">
            <label htmlFor="cedar-search">Search account services</label>
            <div className="cedar-search-field"><Search size={17} aria-hidden="true" /><input id="cedar-search" type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search products and guidance" autoFocus /></div>
            <div className="cedar-search-results" aria-live="polite">
              {matchingProducts.length ? matchingProducts.map(({ label, target }) => <a key={label} href={target} onClick={() => setSearchOpen(false)}>{label}<ArrowRight size={14} /></a>) : <p>No matching topics.</p>}
            </div>
            <p className="cedar-search-note">Search stays in this browser and never sends information.</p>
          </div>
        )}
      </header>

      <section className="cedar-demo-access" aria-label="Account access">
        <div className="cedar-access-inner">
          <div>
            <p className="cedar-eyebrow">Independent account services</p>
            <h2>View your accounts and activity.</h2>
            <p>Sign in to view internal ledger balances, transfers, and check submissions.</p>
          </div>
          <div className="cedar-access-action">
            <Link href="/dashboard" className="cedar-red-button" data-testid="link-access-dashboard">Open your accounts <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <main>
        <section className="cedar-campaign" aria-labelledby="campaign-title">
          <img src={heroImage} alt="Two women looking together at a phone while reviewing household plans" className="cedar-campaign-image" />
          <div className="cedar-campaign-shade" aria-hidden="true" />
          <div className="cedar-campaign-copy">
            <p className="cedar-campaign-kicker">A familiar place to start</p>
            <h1 id="campaign-title">Make room for what matters.</h1>
            <p>View internal accounts, record transfers, and send check images for Admin review.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/dashboard" className="cedar-red-button" data-testid="link-hero-dashboard">Open your accounts <ArrowRight size={16} /></Link>
              <a href="#banking" className="cedar-outline-button">Explore products <ArrowRight size={16} /></a>
            </div>
            <span className="cedar-campaign-note"><ShieldCheck size={14} /> Clerk sign-in · Independent internal ledger · Not affiliated with Wells Fargo</span>
          </div>
        </section>

        <section className="cedar-shortcuts" id="banking" aria-label="Explore banking categories">
          <div className="cedar-section-kicker">Explore account services</div>
          <div className="cedar-shortcut-grid">
            {shortcuts.map(({ title, text, icon: Icon, href }) => (
              <a className="cedar-shortcut" href={href} key={title}>
                <span className="cedar-shortcut-icon"><Icon size={21} strokeWidth={1.7} /></span>
                <span className="cedar-shortcut-copy"><strong>{title}</strong><small>{text}</small></span>
                <ArrowRight className="cedar-shortcut-arrow" size={17} />
              </a>
            ))}
          </div>
        </section>

        <section className="cedar-feature-band" id="checking">
          <div className="cedar-feature-photo" style={{ backgroundImage: `linear-gradient(135deg,rgba(59,51,49,.06),rgba(59,51,49,.13)), url("${heroImage}")` }} role="img" aria-label="Bright, welcoming home interior" />
          <div className="cedar-feature-copy">
            <p className="cedar-eyebrow">Everyday checking</p>
            <h2>A little more clarity in your day.</h2>
            <p>View account balances, transaction activity, and Admin-approved deposits in one place.</p>
            <Link href="/dashboard" className="cedar-text-link" data-testid="link-checking-dashboard">View your accounts <ArrowRight size={15} /></Link>
          </div>
        </section>

        <section className="cedar-offer-area" id="savings">
          <div className="cedar-content-heading">
            <div><p className="cedar-eyebrow">A good place to begin</p><h2>Banking tools for real-life rhythms.</h2></div>
            <p>This application records account activity internally. Balances are internal records, not bank deposits.</p>
          </div>
          <div className="cedar-offer-grid">
            <article className="cedar-offer cedar-offer-red" id="cards">
              <span className="cedar-offer-label">Cards, in context</span>
              <h3>Small details.<br />More peace of mind.</h3>
              <p>Manage the card-profile status stored in your account.</p>
              <Link href="/dashboard" className="cedar-light-link" data-testid="link-card-controls">Explore card controls <ArrowRight size={15} /></Link>
              <CreditCard className="cedar-offer-watermark" size={108} strokeWidth={1} aria-hidden="true" />
            </article>
            <article className="cedar-offer cedar-offer-gold">
              <span className="cedar-offer-label">Savings & CDs</span>
              <h3>Give your next idea<br />some breathing room.</h3>
              <p>Track a savings ledger balance alongside everyday account activity.</p>
              <a href="#guidance" className="cedar-dark-link">Explore savings <ArrowRight size={15} /></a>
              <PiggyBank className="cedar-offer-watermark" size={108} strokeWidth={1} aria-hidden="true" />
            </article>
          </div>
        </section>

        <section className="cedar-rate-strip" id="loans" aria-label="Illustrative product information">
          <div className="cedar-rate-heading"><p className="cedar-eyebrow">A note on rates</p><h2>Clear information matters.</h2></div>
          <div className="cedar-rate-message"><strong>No loan rates or offers.</strong><span>This application manages an internal account ledger. It does not provide lending, bank deposits, or external payment services.</span></div>
          <a href="#guidance" className="cedar-text-link">Browse learning guides <ArrowRight size={15} /></a>
        </section>

        <section className="cedar-guidance" id="guidance">
          <div className="cedar-guidance-intro">
            <p className="cedar-eyebrow">Guidance for the everyday</p>
            <h2>Good questions deserve a clear starting point.</h2>
            <p>Short, approachable guides for thinking through money routines. These are educational examples, not financial advice.</p>
            <a href="#about" className="cedar-text-link">How this ledger works <ArrowRight size={15} /></a>
          </div>
          <div className="cedar-guide-list">
            <a href="#checking"><span className="cedar-guide-icon"><BookOpen size={18} /></span><span><strong>Making a monthly budget feel manageable</strong><small>A calm first step for mapping regular spending.</small></span><ArrowRight size={16} /></a>
            <a href="#savings"><span className="cedar-guide-icon"><PiggyBank size={18} /></span><span><strong>Turning a savings idea into small steps</strong><small>Build a routine around a goal that matters to you.</small></span><ArrowRight size={16} /></a>
            <a href="#business"><span className="cedar-guide-icon"><BriefcaseBusiness size={18} /></span><span><strong>Keeping track of the monthly essentials</strong><small>Make due dates and recurring costs easier to see.</small></span><ArrowRight size={16} /></a>
            <a href="#about"><span className="cedar-guide-icon"><BadgeHelp size={18} /></span><span><strong>How ledger balances work</strong><small>Understand internal account balances and Admin review.</small></span><ArrowRight size={16} /></a>
          </div>
        </section>

        <section className="cedar-community" id="business">
          <div className="cedar-community-mark"><Landmark size={27} strokeWidth={1.4} /></div>
          <div><p className="cedar-eyebrow">Independent account services</p><h2>Manage your accounts securely.</h2><p>Admin review posts approved check amounts to this internal ledger. It does not settle funds at a bank.</p></div>
          <Link href="/dashboard" className="cedar-red-button" data-testid="link-community-dashboard">Open your accounts <ArrowRight size={16} /></Link>
        </section>

        <section className="cedar-about" id="about">
          <div className="cedar-about-copy">
            <p className="cedar-eyebrow">About this application</p>
            <h2>This application maintains an internal account ledger.</h2>
            <p>Transfers and Admin-approved check submissions update internal ledger balances. These are not funds held by a bank; check approval does not clear or settle a check. This application is not affiliated with Wells Fargo.</p>
          </div>
          <div className="cedar-safety-note"><ShieldCheck size={23} /><span><strong>Protect check and account information.</strong><small>Submit only checks you are authorized to deposit. Images are private to the account owner and authorized Admin.</small></span></div>
        </section>
      </main>

      <footer className="cedar-retail-footer">
        <div className="cedar-footer-main">
          <div className="cedar-footer-brand">
            <Link href="/" className="cedar-retail-brand" data-testid="link-footer-brand"><span className="cedar-brand-mark">W</span><span className="cedar-brand-type"><strong>Wells Fargo</strong><small>Independent ledger</small></span></Link>
            <p>Accounts and activity managed in an independent internal ledger.</p>
            <span className="cedar-footer-demo"><ShieldCheck size={14} /> Internal ledger · Not a bank</span>
          </div>
          <div><h3>Explore</h3><a href="#banking">Products & services</a><a href="#checking">Everyday checking</a><a href="#savings">Savings & goals</a></div>
          <div><h3>Learn</h3><a href="#guidance">Guidance</a><a href="#cards">Card controls</a><a href="#about">About this ledger</a></div>
          <div><h3>Quick access</h3><Link href="/sign-in" data-testid="link-footer-dashboard">Sign on to accounts</Link><a href="#about">Privacy & safety</a><a href="#guidance"><CircleHelp size={13} /> Help center</a></div>
        </div>
        <div className="cedar-footer-bottom"><p>© 2026 Independent account ledger. Activity is maintained as internal records.</p><p>Not Wells Fargo; not affiliated with Wells Fargo or any financial institution. Not a bank.</p></div>
      </footer>
    </div>
  );
}

export default PublicHomepage;
