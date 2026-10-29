"use client";

// Numeroloji Merkezi · ortak ekran parçaları (prototip: C:/YasamSistemi-Gorsel-Tasarim/numeroloji-merkezi-2026-10-29).
// Tüm metin React ile kaçışlanır; dangerouslySetInnerHTML YOK. Sınıflar nk- önekli (nkm.css).

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, type ReactNode, type PointerEvent as RPointerEvent } from "react";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import type { ClassicNumber, MeaningBlock, Verification } from "@/lib/numeroloji-klasik/model";
import { INTERPRETATION_HEADING, NUMBER_KIND_LABELS } from "@/lib/numeroloji-klasik/labels";
import { trTrace } from "../_lib/format";
import "./nkm.css";

// ── İkonlar (prototip app.js ile aynı çizimler) ───────────────────────────────────────────────
const ICONS: Record<string, ReactNode> = {
  plus: (<><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>),
  archive: (<><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></>),
  book: (<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M8 7h7" /></>),
  link: (<><circle cx="8" cy="12" r="4" /><circle cx="16" cy="12" r="4" /></>),
  building: (<><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>),
  tag: (<><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="8" cy="8" r="1.5" /></>),
  gem: (<><path d="M6 3h12l3 6-9 12L3 9z" /><path d="M3 9h18M9 3l3 18M15 3l-3 18" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
  check: <path d="m5 12 4.5 4.5L19 7" />,
  shield: (<><path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  doc: (<><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>),
  lock: (<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  alert: (<><path d="M12 3 2 21h20z" /><path d="M12 10v5M12 18h.01" /></>),
  compare: <path d="M7 4v16M17 4v16M3 8h8M13 16h8" />,
  save: <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
  trash: (<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3" /></>),
  edit: (<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13 7 4 4" /></>),
};

export function Icon({ name, className = "nk-ico" }: { name: keyof typeof ICONS | string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[name] ?? null}
    </svg>
  );
}

// ── Kabuk ─────────────────────────────────────────────────────────────────────────────────────
export type Crumb = { href?: string; label: string };

export function Shell({ theme, crumbs, children }: { theme?: "gate" | "compare"; crumbs?: Crumb[]; children: ReactNode }) {
  return (
    <div className={`nk-root ${energyFontVars}`}>
      <div className="nk-scene" data-theme={theme}>
        <main className="nk-inner" id="icerik">
          {crumbs && crumbs.length > 0 ? (
            <nav className="nk-crumbs" aria-label="Konum">
              {crumbs.map((c, i) => (
                <span key={`${c.label}-${i}`} className="nk-crumb">
                  {i > 0 ? <span aria-hidden="true" className="nk-crumb-sep">/</span> : null}
                  {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
                </span>
              ))}
            </nav>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

export function Hero({ eyebrow, title, sub, compact, aside }: { eyebrow: string; title: string; sub?: string; compact?: boolean; aside?: ReactNode }) {
  return (
    <header className={`nk-hero${compact ? " nk-compact" : ""}`}>
      <div>
        <p className="nk-eyebrow">{eyebrow}</p>
        <h1 className="nk-title">{title}</h1>
        {sub ? <p className="nk-sub">{sub}</p> : null}
      </div>
      {aside}
    </header>
  );
}

// ── Eğimli bağlantı kartı (yalnız fare; hareketi azalt'a saygı; en çok ~2°) ──────────────────────
export function TiltLink({
  href,
  className,
  children,
  ...rest
}: { href: string; className: string; children: ReactNode; "data-testid"?: string; "aria-describedby"?: string; "aria-label"?: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const frame = useRef<number | null>(null);
  const onMove = useCallback((e: RPointerEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cx = e.clientX;
    const cy = e.clientY;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const px = Math.max(-0.5, Math.min(0.5, (cx - r.left) / r.width - 0.5));
      const py = Math.max(-0.5, Math.min(0.5, (cy - r.top) / r.height - 0.5));
      el.dataset.tilting = "true";
      el.style.setProperty("--rx", `${(-py * 4).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(px * 4).toFixed(2)}deg`);
    });
  }, []);
  const onLeave = useCallback(() => {
    const el = ref.current;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (!el) return;
    delete el.dataset.tilting;
    el.style.removeProperty("--rx");
    el.style.removeProperty("--ry");
  }, []);
  return (
    <Link ref={ref} href={href} className={`nk-card nk-link-card ${className}`} onPointerMove={onMove} onPointerLeave={onLeave} {...rest}>
      {children}
    </Link>
  );
}

// ── Durum blokları ────────────────────────────────────────────────────────────────────────────
export function Alert({ tone = "info", title, children, action, live }: { tone?: "info" | "warn" | "error" | "ok"; title?: string; children?: ReactNode; action?: ReactNode; live?: boolean }) {
  return (
    <div className={`nk-alert nk-alert-${tone}`} role={tone === "error" ? "alert" : live ? "status" : undefined}>
      <Icon name={tone === "error" || tone === "warn" ? "alert" : tone === "ok" ? "check" : "info"} />
      <div className="nk-alert-body">
        {title ? <p className="nk-alert-title">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action ? <div className="nk-alert-action">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ lines = 3, label = "Yükleniyor…" }: { lines?: number; label?: string }) {
  return (
    <div className="nk-card nk-panel nk-skel" aria-busy="true" aria-live="polite">
      <span className="nk-sr-only">{label}</span>
      <div className="nk-skel-bar nk-w40" />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`nk-skel-bar${i % 3 === 2 ? " nk-w60" : i % 2 ? " nk-w80" : ""}`} />
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="nk-num-grid" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="nk-card nk-panel nk-skel">
          <div className="nk-skel-bar nk-w40" />
          <div className="nk-skel-bar nk-tall nk-w40" />
          <div className="nk-skel-bar nk-w80" />
        </div>
      ))}
    </div>
  );
}

// ── Onay penceresi (window.confirm YOK) ───────────────────────────────────────────────────────
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Vazgeç",
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const latest = useRef({ busy, onCancel });
  useEffect(() => {
    latest.current = { busy, onCancel };
  });

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!latest.current.busy) latest.current.onCancel();
      } else if (e.key === "Tab" && boxRef.current) {
        const f = boxRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input, textarea, [tabindex]:not([tabindex='-1'])");
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      lastFocus.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="nk-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="nk-modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId} ref={boxRef}>
        <h2 className="nk-h2" id={titleId}>{title}</h2>
        <div className="nk-modal-body">{children}</div>
        <div className="nk-btn-row nk-modal-actions">
          <button ref={cancelRef} type="button" className="nk-btn" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button type="button" className={`nk-btn ${danger ? "nk-danger" : "nk-primary"}`} onClick={onConfirm} disabled={busy}>
            {busy ? "Lütfen bekleyin…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sayı kartı parçaları ──────────────────────────────────────────────────────────────────────
export function VerificationBadge({ v }: { v: Verification | null | undefined }) {
  const status = v?.status;
  if (status === "match") {
    return (
      <span className="nk-verified" title="Bağımsız hesapla doğrulandı">
        <Icon name="check" /> Doğrulandı
      </span>
    );
  }
  if (status === "mismatch") {
    return (
      <span className="nk-verified nk-mismatch" title="Bağımsız hesapla uyuşmuyor">
        <Icon name="alert" /> Uyuşmazlık
      </span>
    );
  }
  return <span className="nk-verified nk-unverified">Doğrulanmadı</span>;
}

export function MismatchNote({ v }: { v: Verification | null | undefined }) {
  if (v?.status !== "mismatch") return null;
  const ov = v.oracleValue;
  const shown = Array.isArray(ov) ? ov.join(", ") : typeof ov === "boolean" ? (ov ? "evet" : "hayır") : ov ?? null;
  return (
    <p className="nk-mismatch-note">
      Bağımsız hesap farklı sonuç verdi{shown !== null && shown !== "" ? ` (bağımsız hesap: ${String(shown)})` : ""}.
      {v.note ? ` ${v.note}` : ""} Karar uzmanındır.
    </p>
  );
}

export function Trace({ text, label = "Nasıl Hesaplandı?" }: { text: string | null | undefined; label?: string }) {
  if (!text || !text.trim()) return null;
  return (
    <details className="nk-trace">
      <summary>{label}</summary>
      <div className="nk-trace-body">{trTrace(text)}</div>
    </details>
  );
}

export function NumberBadges({ n }: { n: Pick<ClassicNumber, "type" | "karmicDebt" | "value"> }) {
  const out: ReactNode[] = [];
  if (n.type === "master" || [11, 22, 33].includes(n.value)) out.push(<span key="m" className="nk-badge nk-master">{NUMBER_KIND_LABELS.master} {n.value}</span>);
  if (n.type === "compound") out.push(<span key="c" className="nk-badge nk-ice">{NUMBER_KIND_LABELS.compound}</span>);
  if (n.karmicDebt) out.push(<span key="k" className="nk-badge nk-karmic">Karmik borç {n.karmicDebt}</span>);
  if (!out.length) return null;
  return <div className="nk-badges">{out}</div>;
}

export function MeaningDetails({ m, summaryLabel = INTERPRETATION_HEADING }: { m: MeaningBlock | null | undefined; summaryLabel?: string }) {
  if (!m) return null;
  const has = m.description || m.strengths.length || m.challenges.length || m.career || m.relationships || m.spirituality;
  if (!has) return null;
  return (
    <details className="nk-trace nk-meaning">
      <summary>{summaryLabel}</summary>
      <div className="nk-meaning-body">
        {m.keywords.length ? <p className="nk-keywords">{m.keywords.join(" · ")}</p> : null}
        {m.description ? <p>{m.description}</p> : null}
        {m.strengths.length ? (<><p className="nk-mh">Güçlü yönler</p><ul>{m.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></>) : null}
        {m.challenges.length ? (<><p className="nk-mh">Zorlayıcı yönler</p><ul>{m.challenges.map((s, i) => <li key={i}>{s}</li>)}</ul></>) : null}
        {m.career ? (<><p className="nk-mh">Kariyer</p><p>{m.career}</p></>) : null}
        {m.relationships ? (<><p className="nk-mh">İlişkiler</p><p>{m.relationships}</p></>) : null}
        {m.spirituality ? (<><p className="nk-mh">Ruhsallık</p><p>{m.spirituality}</p></>) : null}
      </div>
    </details>
  );
}

/** Ara toplam gösterimi: karmik borç varsa "14/5". */
export function compoundDisplay(n: Pick<ClassicNumber, "value" | "karmicDebt">): string | null {
  return n.karmicDebt ? `${n.karmicDebt}/${n.value}` : null;
}

export function NumberCard({ name, sub, n, extra }: { name: string; sub?: string; n: ClassicNumber; extra?: ReactNode }) {
  const cd = compoundDisplay(n);
  return (
    <article className="nk-card nk-num-card">
      <div className="nk-num-top">
        <div>
          <h3 className="nk-num-name">{name}</h3>
          {sub ? <p className="nk-num-key">{sub}</p> : null}
        </div>
        <VerificationBadge v={n.verification} />
      </div>
      <div className="nk-num-val">
        <span className="nk-num-big">{n.value}</span>
        {cd ? <span className="nk-num-sub">{cd}</span> : null}
      </div>
      <NumberBadges n={n} />
      {n.meaning?.title ? <p className="nk-num-desc"><b>{n.meaning.title}</b></p> : null}
      <MismatchNote v={n.verification} />
      {extra}
      <MeaningDetails m={n.meaning} />
      <Trace text={n.calculation} />
    </article>
  );
}
