import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  Check,
  GraduationCap,
  LayoutGrid,
  Library,
  Menu,
  MessagesSquare,
  Plus,
  Store,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { BloomMark } from "@/components/bloom/Logo";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────────────────────
 * Public landing page. Every string comes from the landing dictionary through t();
 * every product image is a real Bloom screen rendered with demo data (no real people).
 * ──────────────────────────────────────────────────────────────────────────── */

const SECTIONS = [
  { id: "solucao", key: "solution" },
  { id: "recursos", key: "features" },
  { id: "demonstracao", key: "demo" },
  { id: "para-quem", key: "audience" },
  { id: "planos", key: "pricing" },
  { id: "duvidas", key: "faq" },
] as const;

const DEMO_IMAGES = ["/landing/app-students.webp", "/landing/app-calendar.webp", "/landing/app-finance.webp", "/landing/app-growth.webp"];
const FEATURE_ICONS: LucideIcon[][] = [
  [Users, CalendarDays, UserPlus, Wallet, LayoutGrid],
  [TrendingUp, Library],
  [MessagesSquare, GraduationCap, Store],
];
const FEATURE_COUNTS = [5, 2, 3];

const container = "mx-auto w-full max-w-[1200px] px-5 sm:px-8";
const btnPrimary =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-[0_8px_20px_-10px_oklch(0.5_0.09_150/0.7)] transition-[transform,background-color] duration-200 hover:-translate-y-px hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const eyebrowCls = "text-[13px] font-semibold uppercase tracking-[0.16em] text-accent";
const h2Cls = "font-display text-[2.15rem] font-bold leading-[1.06] tracking-[-0.025em] text-foreground sm:text-5xl";

/** Optional dictionary value: t() returns the key itself when it is missing. */
function useOptionalText() {
  const { t } = useLanguage();
  return (key: string) => {
    const value = t(key);
    return value === key ? "" : value;
  };
}

/** Adds `is-visible` once the element enters the viewport (one-shot). */
function Reveal({ children, className, delay = 0, as: Tag = "div" }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "li" | "section" }) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as never}
      className={cn("landing-reveal", visible && "is-visible", className)}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={cn(eyebrowCls, "flex items-center gap-3", light && "text-sidebar-primary")}>
      <span aria-hidden="true" className={cn("h-px w-8", light ? "bg-sidebar-primary/70" : "bg-accent/70")} />
      {children}
    </p>
  );
}

function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <BloomMark className={cn("h-8 w-8", light ? "text-sidebar-foreground" : "text-primary")} />
      <span className={cn("font-display text-xl font-bold tracking-tight", light ? "text-sidebar-foreground" : "text-foreground")}>Bloom</span>
    </span>
  );
}

/* ── Header ─────────────────────────────────────────────────────────────── */
function Header() {
  const { t } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled ? "border-b border-border/70 bg-background/85 backdrop-blur-md" : "border-b border-transparent bg-transparent",
      )}
    >
      <div className={cn(container, "flex h-16 items-center justify-between gap-6 lg:h-[72px]")}>
        <a href="#topo" aria-label={t("landing.nav.home")} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Wordmark />
        </a>
        <nav aria-label={t("landing.nav.label")} className="hidden lg:block">
          <ul className="flex items-center gap-8">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-[15px] font-medium text-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none">
                  {t(`landing.nav.${s.key}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Link to="/auth" className="inline-flex h-10 items-center rounded-full px-4 text-[15px] font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t("landing.nav.signIn")}
          </Link>
          <Link to="/auth" className={cn(btnPrimary, "h-10 px-5 text-sm")}>
            {t("landing.nav.start")}
          </Link>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label={t("landing.nav.openMenu")}
              className="grid h-11 w-11 place-items-center rounded-full text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="flex w-[86vw] max-w-sm flex-col bg-background p-6">
            <SheetHeader className="text-left">
              <SheetTitle className="sr-only">{t("landing.nav.menuTitle")}</SheetTitle>
              <Wordmark />
            </SheetHeader>
            <nav aria-label={t("landing.nav.label")} className="mt-8 flex-1">
              <ul className="space-y-1">
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <SheetClose asChild>
                      <a href={`#${s.id}`} className="block rounded-xl px-3 py-3 font-display text-2xl font-semibold text-foreground transition-colors hover:bg-secondary">
                        {t(`landing.nav.${s.key}`)}
                      </a>
                    </SheetClose>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="grid gap-3">
              <Link to="/auth" className={cn(btnPrimary, "w-full")}>{t("landing.nav.start")}</Link>
              <Link to="/auth" className="inline-flex h-12 items-center justify-center rounded-full border border-border text-[15px] font-semibold text-foreground hover:bg-secondary">
                {t("landing.nav.signIn")}
              </Link>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

/* ── Hero ───────────────────────────────────────────────────────────────── */
function Hero() {
  const { t } = useLanguage();
  return (
    <section id="topo" className="relative isolate overflow-x-clip pt-28 sm:pt-36 lg:pt-44">
      <div className={container}>
        <p className={cn(eyebrowCls, "landing-rise relative z-10")}>{t("landing.hero.eyebrow")}</p>
        <h1 className="landing-rise relative z-10 mt-6 max-w-[15ch] font-display text-[2.85rem] font-bold leading-[1] tracking-[-0.04em] text-foreground sm:max-w-none sm:text-[4.4rem] lg:text-[5.6rem]" style={{ "--rise-delay": "80ms" } as CSSProperties}>
          <span className="block">{t("landing.hero.titleA")}</span>
          <span className="block">
            {t("landing.hero.titleB")}{" "}
            <span className="relative inline-block text-primary">
              {t("landing.hero.titleHighlight")}
              <svg aria-hidden="true" viewBox="0 0 220 18" preserveAspectRatio="none" className="landing-underline absolute -bottom-1.5 left-0 h-3 w-[96%] text-accent sm:-bottom-3 sm:h-4">
                <path d="M3 12 C 50 4, 120 3, 217 9" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" pathLength={1} />
              </svg>
            </span>
          </span>
        </h1>
        <p className="landing-rise relative z-10 mx-auto mt-8 max-w-[36rem] text-balance text-center text-lg leading-relaxed text-foreground/70 sm:text-xl lg:mt-10" style={{ "--rise-delay": "160ms" } as CSSProperties}>
          {t("landing.hero.subtitle")}
        </p>

        {/* Product: the real Overview screen, large, with the phone view overlapping its corner */}
        <div className="landing-rise relative mt-12 sm:mt-14 lg:mt-16" style={{ "--rise-delay": "240ms" } as CSSProperties}>
          {/* Warm brand field: from the top of the page down to the middle of the product screen */}
          <div aria-hidden="true" className="pointer-events-none absolute bottom-[42%] left-1/2 -z-20 h-[300vh] w-screen -translate-x-1/2 bg-header-bg" />
          {/* Phones: the real mobile screen is the main visual (the desktop screen would be too small to read) */}
          <div className="mx-auto w-[72%] max-w-[300px] sm:hidden">
            <div className="overflow-hidden rounded-[2rem] border-[7px] border-sidebar bg-sidebar shadow-[0_40px_70px_-30px_oklch(0.26_0.03_150/0.6)]">
              <img src="/landing/app-mobile-index.webp" alt={t("landing.hero.phoneAlt")} width={780} height={1328} fetchPriority="high" className="block h-auto w-full" />
            </div>
          </div>
          <div className="hidden overflow-hidden rounded-[22px] border-[6px] border-white/70 bg-card shadow-[0_50px_100px_-45px_oklch(0.26_0.03_150/0.5)] sm:block">
            <img
              src="/landing/app-index.webp"
              alt={t("landing.hero.imageAlt")}
              width={2400}
              height={1500}
              fetchPriority="high"
              className="block h-auto w-full"
            />
          </div>
          <div className="absolute hidden w-[27%] max-w-[250px] sm:-bottom-12 sm:right-8 sm:block lg:-bottom-16 lg:-right-6">
            <div className="overflow-hidden rounded-[1.4rem] border-[5px] border-sidebar bg-sidebar shadow-[0_30px_60px_-25px_oklch(0.26_0.03_150/0.6)] sm:rounded-[2.2rem] sm:border-[8px]">
              <img src="/landing/app-mobile-index.webp" alt={t("landing.hero.phoneAlt")} width={780} height={1328} className="block h-auto w-full" />
            </div>
          </div>
        </div>
      </div>
      <div className="h-16 sm:h-24" />
    </section>
  );
}

/* ── Problem ────────────────────────────────────────────────────────────── */
function Problem() {
  const { t } = useLanguage();
  return (
    <section aria-labelledby="problema-titulo" className="py-24 sm:py-32">
      <div className={cn(container, "grid gap-14 lg:grid-cols-12 lg:gap-10")}>
        <Reveal className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <Eyebrow>{t("landing.problem.eyebrow")}</Eyebrow>
            <h2 id="problema-titulo" className={cn(h2Cls, "mt-6")}>
              <span className="block">{t("landing.problem.titleA")}</span>
              <span className="block text-foreground/45">{t("landing.problem.titleB")}</span>
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-foreground/70">{t("landing.problem.lead")}</p>
          </div>
        </Reveal>
        <ol className="lg:col-span-6 lg:col-start-7">
          {[0, 1, 2, 3, 4].map((i) => (
            <Reveal as="li" key={i} delay={i * 60} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 border-t border-border py-7 last:border-b sm:grid-cols-[4rem_minmax(0,1fr)]">
              <span className="pt-1 font-display text-sm font-semibold tabular-nums text-accent">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{t(`landing.problem.items.${i}.title`)}</h3>
                <p className="mt-2 text-base leading-relaxed text-foreground/65">{t(`landing.problem.items.${i}.text`)}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ── Solution ───────────────────────────────────────────────────────────── */
function Solution() {
  const { t } = useLanguage();
  return (
    <section id="solucao" aria-labelledby="solucao-titulo" className="scroll-mt-20 px-3 sm:px-5">
      <div className="mx-auto max-w-[1360px] overflow-hidden rounded-[2rem] bg-sidebar text-sidebar-foreground sm:rounded-[2.75rem]">
        <div className={cn(container, "grid gap-14 py-20 sm:py-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16")}>
          <Reveal>
            <Eyebrow light>{t("landing.solution.eyebrow")}</Eyebrow>
            <h2 id="solucao-titulo" className="mt-6 font-display text-[2.15rem] font-bold leading-[1.06] tracking-[-0.025em] text-sidebar-foreground sm:text-5xl">
              <span className="block">{t("landing.solution.titleA")}</span>
              <span className="block text-[oklch(0.82_0.08_150)]">{t("landing.solution.titleB")}</span>
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-sidebar-foreground/75">{t("landing.solution.lead")}</p>
            <dl className="mt-10 space-y-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="grid gap-1 border-l border-sidebar-border pl-5 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4">
                  <dt className="font-display text-base font-semibold text-sidebar-foreground">{t(`landing.solution.items.${i}.title`)}</dt>
                  <dd className="text-[15px] leading-relaxed text-sidebar-foreground/70">{t(`landing.solution.items.${i}.text`)}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
          <Reveal delay={120} className="relative">
            <div className="overflow-hidden rounded-2xl border border-sidebar-border shadow-[0_40px_80px_-40px_rgba(0,0,0,0.6)]">
              <img src="/landing/app-overview-crop.webp" alt={t("landing.solution.imageAlt")} width={1230} height={1050} loading="lazy" className="block h-auto w-full" />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ── Features ───────────────────────────────────────────────────────────── */
function StatusTag({ status }: { status?: string }) {
  const { t } = useLanguage();
  if (!status) return null;
  const soon = status === "soon";
  return (
    <span className={cn(
      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide",
      soon ? "bg-lilac-soft text-[oklch(0.45_0.1_305)]" : "bg-primary-soft text-primary",
    )}>
      {soon ? t("landing.features.soon") : t("landing.features.partial")}
    </span>
  );
}

function Features() {
  const { t } = useLanguage();
  const optional = useOptionalText();
  return (
    <section id="recursos" aria-labelledby="recursos-titulo" className="scroll-mt-20 py-24 sm:py-32">
      <div className={container}>
        <Reveal className="max-w-3xl">
          <Eyebrow>{t("landing.features.eyebrow")}</Eyebrow>
          <h2 id="recursos-titulo" className={cn(h2Cls, "mt-6")}>
            <span className="block">{t("landing.features.titleA")}</span>
            <span className="block text-foreground/45">{t("landing.features.titleB")}</span>
          </h2>
        </Reveal>
        <div className="mt-16 grid gap-14 lg:grid-cols-[1.35fr_1fr_1fr] lg:gap-12">
          {FEATURE_COUNTS.map((count, g) => (
            <Reveal key={g} delay={g * 90}>
              <h3 className="flex items-baseline gap-3 border-b border-foreground/80 pb-4 font-display text-lg font-semibold text-foreground">
                <span className="text-sm tabular-nums text-accent">{String(g + 1).padStart(2, "0")}</span>
                {t(`landing.features.groups.${g}.title`)}
              </h3>
              <ul>
                {Array.from({ length: count }, (_, i) => {
                  const Icon = FEATURE_ICONS[g][i];
                  const status = optional(`landing.features.groups.${g}.items.${i}.status`);
                  const validStatus = status === "soon" || status === "partial" ? status : undefined;
                  return (
                    <li key={i} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-b border-border py-5">
                      <span className={cn("mt-0.5 grid h-8 w-8 place-items-center rounded-lg", validStatus === "soon" ? "bg-muted text-foreground/45" : "bg-primary-soft text-primary")}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={cn("font-display text-[17px] font-semibold", validStatus === "soon" ? "text-foreground/60" : "text-foreground")}>
                            {t(`landing.features.groups.${g}.items.${i}.title`)}
                          </p>
                          <StatusTag status={validStatus} />
                        </div>
                        <p className="mt-1 text-[15px] leading-relaxed text-foreground/65">{t(`landing.features.groups.${g}.items.${i}.text`)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Demo (real screens) ────────────────────────────────────────────────── */
function Demo() {
  const { t } = useLanguage();
  const optional = useOptionalText();
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (e.key in keys) {
      e.preventDefault();
      const next = (active + keys[e.key] + DEMO_IMAGES.length) % DEMO_IMAGES.length;
      setActive(next);
      tabRefs.current[next]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const next = e.key === "Home" ? 0 : DEMO_IMAGES.length - 1;
      setActive(next);
      tabRefs.current[next]?.focus();
    }
  };
  const note = optional(`landing.demo.tabs.${active}.note`);
  return (
    <section id="demonstracao" aria-labelledby="demo-titulo" className="scroll-mt-20 overflow-x-clip bg-header-bg py-24 sm:py-32">
      <div className={container}>
        <Reveal className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Eyebrow>{t("landing.demo.eyebrow")}</Eyebrow>
            <h2 id="demo-titulo" className={cn(h2Cls, "mt-6")}>
              <span className="block">{t("landing.demo.titleA")}</span>
              <span className="block text-primary">{t("landing.demo.titleB")}</span>
            </h2>
          </div>
          <p className="text-sm text-foreground/55">{t("landing.demo.caption")}</p>
        </Reveal>

        <div className="mt-12 grid gap-8 lg:mt-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12">
          <div role="tablist" aria-label={t("landing.demo.tabsLabel")} aria-orientation="vertical" onKeyDown={onKeyDown}
            className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0">
            {DEMO_IMAGES.map((_, i) => {
              const selected = i === active;
              return (
                <button
                  key={i}
                  ref={(el) => { tabRefs.current[i] = el; }}
                  type="button"
                  role="tab"
                  id={`demo-tab-${i}`}
                  aria-selected={selected}
                  aria-controls="demo-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(i)}
                  className={cn(
                    "shrink-0 rounded-full border px-4 py-2.5 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "lg:rounded-none lg:border-0 lg:border-l-2 lg:px-6 lg:py-5",
                    selected ? "border-primary bg-primary text-primary-foreground lg:bg-transparent lg:text-foreground" : "border-border bg-card/60 text-foreground/70 hover:text-foreground lg:border-foreground/10 lg:bg-transparent",
                  )}
                >
                  <span className="lg:font-display lg:text-xl">{t(`landing.demo.tabs.${i}.label`)}</span>
                  <span className={cn("hidden lg:block lg:overflow-hidden lg:transition-[max-height,opacity] lg:duration-500", selected ? "lg:mt-3 lg:max-h-48 lg:opacity-100" : "lg:max-h-0 lg:opacity-0")}>
                    <span className="block font-display text-base font-semibold text-primary">{t(`landing.demo.tabs.${i}.title`)}</span>
                    <span className="mt-1.5 block text-[15px] font-normal leading-relaxed text-foreground/70">{t(`landing.demo.tabs.${i}.text`)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div id="demo-panel" role="tabpanel" aria-labelledby={`demo-tab-${active}`}>
            {/* Mobile copy for the selected screen (desktop shows it inside the tab) */}
            <div key={`copy-${active}`} className="landing-fade-in mb-6 lg:hidden">
              <p className="font-display text-xl font-semibold text-foreground">{t(`landing.demo.tabs.${active}.title`)}</p>
              <p className="mt-2 text-base leading-relaxed text-foreground/70">{t(`landing.demo.tabs.${active}.text`)}</p>
            </div>
            <div className="relative overflow-hidden rounded-[14px] border border-foreground/10 bg-card shadow-[0_40px_90px_-45px_oklch(0.26_0.03_150/0.5)] sm:rounded-[20px] lg:-mr-[18%]">
              <img key={active} src={DEMO_IMAGES[active]} alt={t(`landing.demo.tabs.${active}.alt`)} width={2400} height={1500} loading="lazy" className="landing-fade-in block h-auto w-full" />
            </div>
            {note && <p className="mt-4 text-sm text-foreground/55">{note}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Benefits ───────────────────────────────────────────────────────────── */
function Benefits() {
  const { t } = useLanguage();
  return (
    <section aria-labelledby="beneficios-titulo" className="py-24 sm:py-32">
      <div className={container}>
        <Reveal className="max-w-2xl">
          <Eyebrow>{t("landing.benefits.eyebrow")}</Eyebrow>
          <h2 id="beneficios-titulo" className={cn(h2Cls, "mt-6")}>
            <span className="block">{t("landing.benefits.titleA")}</span>
            <span className="block text-foreground/45">{t("landing.benefits.titleB")}</span>
          </h2>
        </Reveal>
        <div className="mt-16 grid gap-x-16 gap-y-14 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Reveal key={i} delay={(i % 2) * 100} className={cn(i % 2 === 1 && "sm:translate-y-16")}>
              <div className="border-t-2 border-primary pt-7">
                <p className="font-display text-[1.7rem] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[2rem]">{t(`landing.benefits.items.${i}.title`)}</p>
                <p className="mt-4 max-w-md text-[17px] leading-relaxed text-foreground/65">{t(`landing.benefits.items.${i}.text`)}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="hidden h-16 sm:block" />
      </div>
    </section>
  );
}

/* ── Audience ───────────────────────────────────────────────────────────── */
function Audience() {
  const { t } = useLanguage();
  return (
    <section id="para-quem" aria-labelledby="para-quem-titulo" className="scroll-mt-20 bg-primary-soft/45 py-24 sm:py-32">
      <div className={cn(container, "grid gap-12 lg:grid-cols-12")}>
        <Reveal className="lg:col-span-4">
          <Eyebrow>{t("landing.audience.eyebrow")}</Eyebrow>
          <h2 id="para-quem-titulo" className={cn(h2Cls, "mt-6")}>
            <span className="block">{t("landing.audience.titleA")}</span>
            <span className="block text-primary">{t("landing.audience.titleB")}</span>
          </h2>
        </Reveal>
        <ul className="lg:col-span-7 lg:col-start-6">
          {[0, 1, 2, 3].map((i) => (
            <Reveal as="li" key={i} delay={i * 70} className="grid gap-2 border-t border-primary/25 py-8 last:border-b sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-10">
              <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[1.7rem]">{t(`landing.audience.items.${i}.title`)}</h3>
              <p className="text-[17px] leading-relaxed text-foreground/70">{t(`landing.audience.items.${i}.text`)}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ── Pricing (no invented prices: the price line is a dictionary value, ready for real values) ── */
function Plan({ plan, dark = false }: { plan: "free" | "premium"; dark?: boolean }) {
  const { t } = useLanguage();
  const note = useOptionalText()(`landing.pricing.${plan}.note`);
  return (
    <div className={cn(
      "flex h-full flex-col rounded-[1.75rem] p-8 sm:p-10",
      dark ? "bg-sidebar text-sidebar-foreground" : "border border-border bg-card text-foreground",
    )}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-2xl font-bold">{t(`landing.pricing.${plan}.name`)}</h3>
        {dark && <BloomMark className="h-7 w-7 text-sidebar-primary" />}
      </div>
      <p className={cn("mt-2 text-[15px]", dark ? "text-sidebar-foreground/70" : "text-foreground/65")}>{t(`landing.pricing.${plan}.tagline`)}</p>
      <p className={cn("mt-8 font-display text-4xl font-bold tracking-tight", dark && "text-sidebar-foreground")}>{t(`landing.pricing.${plan}.price`)}</p>
      <ul className="mt-8 flex-1 space-y-3.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-snug">
            <Check className={cn("mt-0.5 h-4 w-4 shrink-0", dark ? "text-sidebar-primary" : "text-primary")} aria-hidden="true" />
            <span className={dark ? "text-sidebar-foreground/85" : "text-foreground/80"}>{t(`landing.pricing.${plan}.items.${i}`)}</span>
          </li>
        ))}
      </ul>
      {note && <p className={cn("mt-8 text-sm", dark ? "text-sidebar-foreground/60" : "text-foreground/55")}>{note}</p>}
      <Link
        to="/auth"
        className={cn(
          "mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-[transform,background-color] duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2",
          dark ? "bg-[#F4EBE1] text-sidebar hover:bg-white focus-visible:ring-sidebar-primary" : "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring",
        )}
      >
        {t(`landing.pricing.${plan}.cta`)}
      </Link>
    </div>
  );
}

function Pricing() {
  const { t } = useLanguage();
  return (
    <section id="planos" aria-labelledby="planos-titulo" className="scroll-mt-20 py-24 sm:py-32">
      <div className={container}>
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className={cn(eyebrowCls)}>{t("landing.pricing.eyebrow")}</p>
          <h2 id="planos-titulo" className={cn(h2Cls, "mt-6")}>
            <span className="block">{t("landing.pricing.titleA")}</span>
            <span className="block text-primary">{t("landing.pricing.titleB")}</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-foreground/70">{t("landing.pricing.lead")}</p>
        </Reveal>
        <div className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
          <Reveal><Plan plan="free" /></Reveal>
          <Reveal delay={100}><Plan plan="premium" dark /></Reveal>
        </div>
      </div>
    </section>
  );
}

/* ── FAQ (native disclosure: keyboard and screen-reader friendly, no dependency) ── */
function Faq() {
  const { t } = useLanguage();
  return (
    <section id="duvidas" aria-labelledby="duvidas-titulo" className="scroll-mt-20 border-t border-border py-24 sm:py-32">
      <div className={cn(container, "grid gap-12 lg:grid-cols-12")}>
        <Reveal className="lg:col-span-4">
          <Eyebrow>{t("landing.faq.eyebrow")}</Eyebrow>
          <h2 id="duvidas-titulo" className={cn(h2Cls, "mt-6")}>{t("landing.faq.title")}</h2>
        </Reveal>
        <Reveal delay={80} className="lg:col-span-7 lg:col-start-6">
          <div className="border-t border-border">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <details key={i} className="group border-b border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 font-display text-lg font-semibold text-foreground marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-xl [&::-webkit-details-marker]:hidden">
                  {t(`landing.faq.items.${i}.q`)}
                  <Plus className="h-5 w-5 shrink-0 text-primary transition-transform duration-300 group-open:rotate-45" aria-hidden="true" />
                </summary>
                <p className="-mt-1 pb-6 pr-10 text-[17px] leading-relaxed text-foreground/70">{t(`landing.faq.items.${i}.a`)}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Final CTA ──────────────────────────────────────────────────────────── */
function FinalCta() {
  const { t } = useLanguage();
  return (
    <section aria-labelledby="cta-titulo" className="px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="relative mx-auto max-w-[1360px] overflow-hidden rounded-[2rem] bg-sidebar sm:rounded-[2.75rem]">
        <BloomMark className="pointer-events-none absolute -right-32 -top-24 h-[520px] w-[520px] text-sidebar-foreground opacity-[0.07] sm:-right-16" />
        <Reveal className={cn(container, "relative py-24 sm:py-32")}>
          <h2 id="cta-titulo" className="max-w-3xl font-display text-[2.4rem] font-bold leading-[1.04] tracking-[-0.03em] text-sidebar-foreground sm:text-6xl">
            <span className="block">{t("landing.cta.titleA")}</span>
            <span className="block text-[oklch(0.82_0.08_150)]">{t("landing.cta.titleB")}</span>
          </h2>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-sidebar-foreground/75">{t("landing.cta.text")}</p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link to="/auth" className="inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-[#F4EBE1] px-7 text-base font-semibold text-sidebar transition-[transform,background-color] duration-200 hover:-translate-y-px hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary">
              {t("landing.cta.button")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to="/auth" className="inline-flex h-[52px] items-center justify-center rounded-full px-5 text-base font-semibold text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary">
              {t("landing.cta.secondary")}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Footer ─────────────────────────────────────────────────────────────── */
function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="py-16">
      <div className={cn(container, "grid gap-12 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]")}>
        <div className="max-w-sm">
          <Wordmark />
          <p className="mt-4 text-[15px] leading-relaxed text-foreground/65">{t("landing.footer.description")}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{t("landing.footer.product")}</p>
          <ul className="mt-4 space-y-3">
            {SECTIONS.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} className="text-[15px] text-foreground/65 transition-colors hover:text-foreground">{t(`landing.nav.${s.key}`)}</a></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{t("landing.footer.account")}</p>
          <ul className="mt-4 space-y-3">
            <li><Link to="/auth" className="text-[15px] text-foreground/65 transition-colors hover:text-foreground">{t("landing.footer.signIn")}</Link></li>
            <li><Link to="/auth" className="text-[15px] text-foreground/65 transition-colors hover:text-foreground">{t("landing.footer.createAccount")}</Link></li>
          </ul>
        </div>
      </div>
      <div className={cn(container, "mt-14 border-t border-border pt-6")}>
        <p className="text-sm text-foreground/55">© {new Date().getFullYear()} Bloom. {t("landing.footer.rights")}</p>
      </div>
    </footer>
  );
}

export function LandingPage() {
  // Reveal animations hide content only after mount (SSR HTML stays fully visible); smooth anchor
  // scrolling only while this page is mounted and when the visitor allows motion.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("landing-motion");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const previous = root.style.scrollBehavior;
    if (!reduce) root.style.scrollBehavior = "smooth";
    return () => {
      root.classList.remove("landing-motion");
      root.style.scrollBehavior = previous;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased">
      <Header />
      <main>
        <Hero />
        <Problem />
        <Solution />
        <Features />
        <Demo />
        <Benefits />
        <Audience />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
