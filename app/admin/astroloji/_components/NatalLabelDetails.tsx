"use client";

/**
 * Natal çark etiket AYRINTILARI (G2; onaylı tasarım G1-R4-S2) — yalnız Natal ekranı:
 *   • NatalGroupDetails: masaüstünde bilgi panelinin üstünde SÜREKLİ görünen grup alanı (tıklama gerekmez): çarkta (sığdırılmış
 *     görünümde) grup etiketiyle gösterilen her burç için 0–30° cetvel + burç / derece / dakika / ℞ / ev tablosu.
 *   • NatalLabelSheet: çarkta bir etikete / gruba / ev başlangıcına / eksene dokununca açılan ayrıntı paneli (mobil + masaüstü).
 * Değerler kayıtlı teknik veriden okunur (formatDegree: dakika kesilir); hiçbir değer hesaplanmaz. Saat bilinmiyorken Ay'ın
 * burcu / derecesi gösterilmez (Owner metni), diğerleri "≈ 12:00 varsayımı".
 */

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BodyId, NatalTechnical, SignId } from "@/lib/astrology/model/western";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { formatDegree, NATAL_HOUSE_SYSTEM_LABELS, SIGN_ELEMENT, SIGN_GLYPHS } from "@/lib/astrology/labels/tr";
import { adist, drawnOnWheel, layoutLabels, norm } from "@/lib/astrology/view/natalLabelLayout";
import { positionRow, type PositionRow } from "@/lib/astrology/view/natalPositionView";
import type { NatalWheelDisplay } from "./NatalWheel";
import type { NatalLabelPick, NatalWheelLayoutInfo } from "./NatalWheelLabeled";
import styles from "./natalWheel.module.css";

const ELEMENT_COLOR: Record<string, string> = { fire: "#dc2626", earth: "#15803d", air: "#ca8a04", water: "#2563eb" };
const RETRO_INK = "#be123c";
const POINT_INK = "#0f766e";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 align-top text-[13px] text-slate-800";

/** Çarkta (sığdırılmış masaüstü görünümünde) grup etiketiyle gösterilen burçlar — çarkla AYNI düzen kuralı. */
export function natalWheelGroups(technical: NatalTechnical, display: NatalWheelDisplay) {
  const lab = display.labels;
  if (!lab) return [];
  const items = [
    ...technical.bodies.filter((b) => !display.hiddenBodies.has(b.id) && drawnOnWheel(lab.timeUnknown, b.id)).map((b) => ({ id: b.id as string, lon: b.longitude })),
    ...display.extraPoints.map((p) => ({ id: `x:${p.id}`, lon: p.longitude })),
  ];
  return layoutLabels(items, { detailed: lab.detailed, profile: "screen", K: 1, assumed: lab.timeUnknown }).groups;
}

/** I18N-F1-R5 (ATLAS-B): satır adı katalogdan (lib `positionRow.name` TR kalır; Word/PDF ortak). TR değerler lib ile birebir. */
function useRowName() {
  const tl = useTranslations("atlas.natalLabels");
  const tt = useTranslations("terms");
  return (r: PositionRow) => (r.kind === "point" ? tl(`point.${r.id as "fortune" | "vertex"}`) : tt(`body.${r.id as BodyId}`));
}

function SignText({ r }: { r: PositionRow }) {
  const tl = useTranslations("atlas.natalLabels");
  const tt = useTranslations("terms");
  if (r.status === "unknown") return <span className="font-medium italic text-amber-800">{tl("uncertain")}</span>;
  return (
    <span>
      <span className={styles.symbol} style={{ color: ELEMENT_COLOR[SIGN_ELEMENT[r.sign!]] }} aria-hidden="true">
        {SIGN_GLYPHS[r.sign!]}
      </span>{" "}
      {r.status === "assumed" ? "≈ " : ""}
      {tt(`zodiac.${r.sign!}`)}
    </span>
  );
}

function DegText({ r }: { r: PositionRow }) {
  const tl = useTranslations("atlas.natalLabels");
  if (r.status === "unknown") return <span className="font-medium italic text-amber-800">{tl("uncertain")}</span>;
  return (
    <span className="tabular-nums">
      {r.status === "assumed" ? "≈ " : ""}
      {r.full}
      {r.retro && (
        <span className="ml-0.5 font-semibold" style={{ color: RETRO_INK }} title={tl("retroTitle")}>
          ℞
        </span>
      )}
      {r.status === "assumed" && <AssumedChip />}
    </span>
  );
}

function AssumedChip() {
  const tl = useTranslations("atlas.natalLabels");
  return <span className="ml-1.5 inline-flex rounded-full border border-amber-300 bg-amber-50 px-1.5 text-[10.5px] font-semibold text-amber-900">{tl("noonAssumption")}</span>;
}

/** Dar panelde de yatay taşmaz (hücreler satır kırar; V4 yatay kaydırma şeridi asıl tablolara bağlı kalır). */
function RowsTable({ rows, timeUnknown, testId }: { rows: PositionRow[]; timeUnknown: boolean; testId: string }) {
  const tl = useTranslations("atlas.natalLabels");
  const rowName = useRowName();
  return (
    <div>
      <table className="w-full table-fixed break-words" data-testid={testId}>
        <colgroup>
          <col className="w-[34%]" />
          <col className="w-[26%]" />
          <col className="w-[28%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr>
            <th className={th}>{tl("colPoint")}</th>
            <th className={th}>{tl("colSign")}</th>
            <th className={th}>{tl("colDegree")}</th>
            <th className={th}>{tl("colHouse")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.key} data-pos-row={r.key} data-status={r.status} data-sign={r.sign ?? ""} data-full={r.full ?? ""}>
              <td className={td}>
                <span className={`${styles.symbol} mr-1`} style={r.kind === "point" ? { color: POINT_INK } : undefined} aria-hidden="true">
                  {r.glyph}
                </span>
                {rowName(r)}
              </td>
              <td className={td}>
                <SignText r={r} />
              </td>
              <td className={td}>
                <DegText r={r} />
              </td>
              <td className={`${td} tabular-nums`}>{!timeUnknown && r.house ? tl("houseN", { n: r.house }) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Seçili burcun 0–30° cetveli: her nokta GERÇEK derecesinde çentik + dört satırlı etiket (gerekirse yana kaydırılır, bağlantılı). */
export function SignStrip({ rows, sign, timeUnknown, compact = false }: { rows: PositionRow[]; sign: SignId; timeUnknown: boolean; compact?: boolean }) {
  const o = compact ? { W: 420, MIN: 44, fg: 19, fd: 13, fs: 15, fm: 12, fr: 11 } : { W: 620, MIN: 46, fg: 20, fd: 12, fs: 15, fm: 11, fr: 10 };
  const X0 = 24;
  const X1 = o.W - 24;
  const sx = (deg: number) => X0 + ((X1 - X0) * deg) / 30;
  const shown = rows.filter((r) => r.status !== "unknown").map((r) => ({ r, x: sx(r.degreeInSign!) })).sort((a, b) => a.x - b.x);
  const xs = shown.map((s) => s.x);
  for (let it = 0; it < 200; it++) {
    let mv = false;
    for (let i = 0; i + 1 < xs.length; i++)
      if (xs[i + 1] - xs[i] < o.MIN) {
        const p = (o.MIN - (xs[i + 1] - xs[i])) / 2 + 0.01;
        xs[i] -= p;
        xs[i + 1] += p;
        mv = true;
      }
    for (let i = 0; i < xs.length; i++) xs[i] = Math.max(X0, Math.min(X1, xs[i]));
    if (!mv) break;
  }
  const H = timeUnknown ? 156 : 140;
  const tl = useTranslations("atlas.natalLabels");
  const tt = useTranslations("terms");
  return (
    <svg viewBox={`0 0 ${o.W} ${H}`} className={`${styles.symbol} block h-auto w-full rounded-lg border border-slate-200 bg-[#fffdf9]`} role="img" aria-label={tl("stripAria", { sign: tt(`zodiac.${sign}`) })} data-testid="natal-sign-strip">
      <line x1={X0} y1={22} x2={X1} y2={22} stroke="#334155" strokeWidth={1.2} />
      {Array.from({ length: 31 }, (_, d) => {
        const x = sx(d);
        const L = d % 10 === 0 ? 10 : d % 5 === 0 ? 7 : 4;
        return (
          <g key={d}>
            <line x1={x} y1={22} x2={x} y2={22 + L} stroke="#64748b" strokeWidth={d % 5 === 0 ? 0.9 : 0.5} />
            {d % 5 === 0 && (
              <text x={x} y={12} textAnchor="middle" fontSize={o.fr} fill="#475569">
                {d}°
              </text>
            )}
          </g>
        );
      })}
      {shown.map(({ r, x }, i) => (
        <g key={r.key} data-strip={r.key}>
          <line x1={x} y1={22} x2={x} y2={40} stroke="#0f172a" strokeWidth={1.8} />
          <line x1={x} y1={40} x2={xs[i]} y2={56} stroke="#94a3b8" strokeWidth={0.8} />
          <text x={xs[i]} y={70} textAnchor="middle" fontSize={o.fg} fill={r.kind === "point" ? POINT_INK : "#0f172a"}>
            {r.glyph}
          </text>
          <text x={xs[i]} y={92} textAnchor="middle" fontSize={o.fd} fontWeight={600} fill="#1e293b">
            {`${r.status === "assumed" ? "≈" : ""}${r.deg}`}
            {r.retro && <tspan fill={RETRO_INK}>℞</tspan>}
          </text>
          <text x={xs[i]} y={112} textAnchor="middle" fontSize={o.fs} fill={ELEMENT_COLOR[SIGN_ELEMENT[r.sign!]]}>
            {SIGN_GLYPHS[r.sign!]}
          </text>
          <text x={xs[i]} y={130} textAnchor="middle" fontSize={o.fm} fill="#64748b">
            {r.min}
          </text>
        </g>
      ))}
      {timeUnknown && (
        <text x={X0} y={148} fontSize={o.fr} fill="#7a4f05" data-strip-note="1">
          {tl("stripNote")}
        </text>
      )}
    </svg>
  );
}

function MoonUnknownBox() {
  const tl = useTranslations("atlas.natalLabels");
  return (
    <p className="rounded-lg border-l-[3px] border-amber-700 bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900" data-testid="natal-moon-unknown">
      <strong className="font-semibold">{tl("moonLead")}</strong> {tl("moonUnknownText")} {tl("moonTail")}
    </p>
  );
}

/**
 * Masaüstü: bilgi panelinin üstünde sürekli görünen grup alanı (varsayılan açık; isteyen daraltabilir). `layout` = çarkın o anki
 * GERÇEK düzeni (profil, gruplar); verilmezse ekran profili / ölçek 1 düzeni. Çark dar profildeyse (derece / dakika çarkta
 * yazılmaz) bütün noktaların burç / derece / dakika tablosu da burada gösterilir → tıklama gerekmez.
 */
export function NatalGroupDetails({
  technical,
  display,
  layout = null,
  collapsed = false,
}: {
  technical: NatalTechnical;
  display: NatalWheelDisplay;
  layout?: NatalWheelLayoutInfo | null;
  /** G2-K: tam konum tablosu gösteren bölümlerde (Gezegenler / Evler / Açılar) kapalı başlar — tabloyu aşağı itmez; açılabilir. */
  collapsed?: boolean;
}) {
  const tl = useTranslations("atlas.natalLabels");
  const tt = useTranslations("terms");
  const lab = display.labels;
  if (!lab) return null;
  const groups = layout ? layout.groups : natalWheelGroups(technical, display);
  const compact = layout?.profile === "compact";
  const allRows = compact
    ? [
        ...technical.bodies.filter((b) => !display.hiddenBodies.has(b.id) && drawnOnWheel(lab.timeUnknown, b.id)).map((b) => b.id as string),
        ...display.extraPoints.map((p) => `x:${p.id}`),
      ]
        .map((k) => positionRow(technical, k, lab.timeUnknown))
        .filter((r): r is PositionRow => !!r)
    : [];
  if (!lab.timeUnknown && groups.length === 0 && !compact) return null;
  return (
    <details
      key={collapsed ? "kapali" : "acik"}
      open={!collapsed}
      className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white max-md:hidden"
      data-testid="natal-group-details"
      data-groups={groups.length}
      data-profile={layout?.profile ?? "screen"}
      data-collapsed={collapsed ? "1" : undefined}
    >
      <summary className="cursor-pointer select-none border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
        {tl("groupSummary")}
        {groups.length ? tl("groupCount", { n: groups.length }) : ""}
      </summary>
      <div className="flex flex-col gap-3 px-3 py-2.5">
        {lab.timeUnknown && (
          <>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900" data-testid="natal-group-time-note">
              {tl("timeUnknownNote")}
            </p>
            <MoonUnknownBox />
          </>
        )}
        {compact && (
          <section data-testid="natal-all-positions">
            <p className="mb-1 text-[12px] leading-snug text-slate-500">{tl("compactNote")}</p>
            <RowsTable rows={allRows} timeUnknown={lab.timeUnknown} testId="natal-all-positions-table" />
          </section>
        )}
        {groups.length === 0 ? (
          !compact && <p className="text-[12.5px] text-slate-500">{tl("noGroups")}</p>
        ) : (
          <>
            <p className="text-[12px] leading-snug text-slate-500">{tl("groupsIntro")}</p>
            {groups.map((g) => {
              const rows = g.ids.map((k) => positionRow(technical, k, lab.timeUnknown)).filter((r): r is PositionRow => !!r);
              return (
                <section key={g.sign} data-group-panel={g.sign}>
                  <h4 className="mb-1 flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-800">
                    <span className={styles.symbol} style={{ color: ELEMENT_COLOR[SIGN_ELEMENT[g.sign]] }} aria-hidden="true">
                      {SIGN_GLYPHS[g.sign]}
                    </span>
                    {tl("groupHead", { sign: tt(`zodiac.${g.sign}`), n: g.ids.length })}
                  </h4>
                  <SignStrip rows={rows} sign={g.sign} timeUnknown={lab.timeUnknown} compact />
                  <RowsTable rows={rows} timeUnknown={lab.timeUnknown} testId="natal-group-table" />
                </section>
              );
            })}
          </>
        )}
      </div>
    </details>
  );
}

/** Çarkta seçilen öğenin ayrıntısı (alttan açılan panel; Esc / dışarı / ✕ kapatır). */
export function NatalLabelSheet({
  technical,
  pick,
  timeUnknown,
  onClose,
  onShowAll,
}: {
  technical: NatalTechnical;
  pick: NatalLabelPick | null;
  timeUnknown: boolean;
  onClose: () => void;
  /** "Tüm konumlar" (Gezegenler bölümü) — verilirse panelde bağlantı. */
  onShowAll?: () => void;
}) {
  const tl = useTranslations("atlas.natalLabels");
  const tt = useTranslations("terms");
  const rowName = useRowName();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Dokunmada paneli açan bırakıştan sonra tarayıcının ürettiği "click" aynı noktaya (yeni açılan perdeye) düşer → perde YALNIZ
  // basış da perdenin üzerinde başladıysa kapatır (G2-K: ev numarasına dokununca panel anında kapanıyordu).
  const downOnBackdrop = useRef(false);
  useEffect(() => {
    if (!pick) return;
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, [pick, onClose]);
  if (!pick) return null;

  let title = "";
  let body: ReactNode = null;
  const hsLabel = NATAL_HOUSE_SYSTEM_LABELS[technical.houseSystem] ? tt(`houseSystem.${technical.houseSystem as "placidus"}`) : technical.houseSystem;
  if (pick.kind === "group") {
    const rows = pick.ids.map((k) => positionRow(technical, k, timeUnknown)).filter((r): r is PositionRow => !!r);
    title = tl("groupTitle", { sign: tt(`zodiac.${pick.sign}`) });
    body = (
      <>
        <SignStrip rows={rows} sign={pick.sign} timeUnknown={timeUnknown} />
        <RowsTable rows={rows} timeUnknown={timeUnknown} testId="natal-sheet-group-table" />
        <p className="text-[12px] leading-snug text-slate-500">
          {tl("groupedWhy")} {timeUnknown ? `${tl("timeUnknownNote")} ${tl("moonUnknownText")}` : tl("stripExact")}
        </p>
      </>
    );
  } else if (pick.kind === "body" || pick.kind === "point") {
    const r = positionRow(technical, pick.kind === "point" ? `x:${pick.id}` : pick.id, timeUnknown);
    if (!r) return null;
    title = rowName(r);
    body = (
      <>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13.5px]" data-sheet-status={r.status}>
          <dt className="text-slate-500">{tl("colSign")}</dt>
          <dd data-sheet-sign={r.sign ?? ""}>
            <SignText r={r} />
          </dd>
          <dt className="text-slate-500">{tl("colDegree")}</dt>
          <dd>{r.status === "unknown" ? <span className="italic text-amber-800">{tl("uncertain")}</span> : `${r.status === "assumed" ? "≈ " : ""}${r.deg}`}</dd>
          <dt className="text-slate-500">{tl("colMinute")}</dt>
          <dd>{r.min ?? "—"}</dd>
          {r.kind === "body" && (
            <>
              <dt className="text-slate-500">{tl("colMotion")}</dt>
              <dd>{r.status === "unknown" ? "—" : r.retro ? <span style={{ color: RETRO_INK }}>{tl("retroMotion")}</span> : tl("direct")}</dd>
            </>
          )}
          <dt className="text-slate-500">{tl("colHouse")}</dt>
          <dd>{timeUnknown ? <span className="text-slate-500">{tl("houseUnknown")}</span> : r.house ? tl("houseN", { n: r.house }) : <span className="text-slate-500">{tl("houseMissing")}</span>}</dd>
        </dl>
        {r.status === "unknown" && <MoonUnknownBox />}
        {r.status === "assumed" && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">{tl("timeUnknownNote")}</p>}
      </>
    );
  } else if (pick.kind === "cusp") {
    const h = technical.houses.find((x) => x.number === pick.n);
    if (!h) return null;
    const [d, m] = formatDegree(h.degreeInSign).split("°");
    title = tl("cuspTitle", { n: h.number, hs: hsLabel });
    body = <PlainDl sign={h.sign} deg={`${d}°`} min={m} />;
  } else {
    const A = technical.angles;
    if (!A) return null;
    const raw = pick.id === "ASC" ? A.ascendant.longitude : pick.id === "DSC" ? A.ascendant.longitude + 180 : pick.id === "MC" ? A.midheaven.longitude : A.midheaven.longitude + 180;
    const l = norm(raw);
    const sign = SIGN_IDS[Math.floor(l / 30) % 12];
    const [d, m] = formatDegree(l % 30).split("°");
    const cuspN = pick.id === "ASC" ? 1 : pick.id === "DSC" ? 7 : pick.id === "MC" ? 10 : 4;
    const cusp = technical.houses.find((x) => x.number === cuspN);
    const separate = cusp && adist(cusp.longitude, l) >= 0.02;
    title = tl(`angle.${pick.id}`);
    body = (
      <>
        <PlainDl sign={sign} deg={`${d}°`} min={m} />
        {separate && (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[12.5px] text-sky-900" data-testid="natal-sheet-axis-note">
            {tl("axisNote", { axis: pick.id, hs: hsLabel, n: cuspN, sign: tt(`zodiac.${cusp!.sign}`), deg: formatDegree(cusp!.degreeInSign) })}
          </p>
        )}
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/30 sm:items-center"
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnBackdrop.current) onClose();
        downOnBackdrop.current = false;
      }}
      data-testid="natal-label-sheet-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85svh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-4 shadow-xl sm:rounded-2xl"
        data-testid="natal-label-sheet"
        data-pick={pick.kind}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[16px] font-semibold text-slate-900">{title}</h3>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={tl("close")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" data-testid="natal-label-sheet-close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {body}
        <p className="text-[11.5px] text-slate-500">{tl("storedNote")}</p>
        {onShowAll && (
          <button type="button" onClick={onShowAll} className="self-start text-[13px] font-medium text-teal-800 underline underline-offset-2" data-testid="natal-sheet-show-all">
            {tl("showAll")}
          </button>
        )}
      </div>
    </div>
  );
}

function PlainDl({ sign, deg, min }: { sign: SignId; deg: string; min: string }) {
  const tl = useTranslations("atlas.natalLabels");
  const tt = useTranslations("terms");
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13.5px]" data-sheet-status="exact">
      <dt className="text-slate-500">{tl("colSign")}</dt>
      <dd data-sheet-sign={sign}>
        <span className={styles.symbol} style={{ color: ELEMENT_COLOR[SIGN_ELEMENT[sign]] }} aria-hidden="true">
          {SIGN_GLYPHS[sign]}
        </span>{" "}
        {tt(`zodiac.${sign}`)}
      </dd>
      <dt className="text-slate-500">{tl("colDegree")}</dt>
      <dd>{deg}</dd>
      <dt className="text-slate-500">{tl("colMinute")}</dt>
      <dd>{min}</dd>
    </dl>
  );
}
