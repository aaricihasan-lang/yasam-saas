"use client";

/**
 * TRANSİT-01 (2026-10-17) — Batı Transit (tek an) ve Transit Takvimi profesyonel görünümleri.
 *
 * Yalnız kanonik TEKNİK katman kullanılır (sağlayıcı yorum metni bu dosyada GÖRÜNMEZ; yorum ayrı panelde ve yetkiyle).
 * Yeni astrolojik hesap yapılmaz: güç / orb / yaklaşan-ayrılan sağlayıcıdan, kesinleşme anları sağlayıcının takvim
 * olaylarından okunur; tek türetilmiş değer transit gezegeninin içinden geçtiği natal evdir (açıkça etiketli).
 * Takvim gün ayrıntısı ek istek GÖNDERMEZ; günün transit haritası yalnız uzman isteyince, önce ücretsiz plan
 * gösterilerek hesaplanır (kayıtlı sonuç varsa 0 istek).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { AspectType, BodyId, SignId } from "@/lib/astrology/model/western";
import type { ForecastEvent, ForecastTechnical, PointId, TransitAspect, TransitTechnical } from "@/lib/astrology/model/westernTiming";
import { ASPECT_GLYPHS, ASPECT_LABELS, BODY_GLYPHS, BODY_LABELS, NATURE_LABELS, SIGN_GLYPHS, SIGN_LABELS, formatDegree } from "@/lib/astrology/labels/tr";
import {
  dayInWindow,
  MAJOR_ASPECTS,
  aspectTypeCounts,
  eventMinuteUtc,
  exactTimesOf,
  formatInZone,
  groupEventsByDay,
  isIanaZone,
  isPersonalEvent,
  middayUtcOf,
  momentLabel,
  significanceBand,
  strongestTransits,
  transitNatalHouses,
} from "@/lib/astrology/transitDetail";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";
const inp = "max-w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs";

function Section({ title, right, children, testId }: { title: string; right?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white max-sm:-mx-3 max-sm:rounded-none max-sm:border-x-0" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        {right}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

const pointLabel = (p: PointId) => (p === "ascendant" ? "Yükselen" : p === "midheaven" ? "MC" : BODY_LABELS[p as BodyId]);
const pointGlyph = (p: PointId) => (p === "ascendant" ? "ASC" : p === "midheaven" ? "MC" : BODY_GLYPHS[p as BodyId]);

/** I18N mod-g: nokta adı katalogdan (Yükselen = terms.angle.ascendant; MC kısaltması; gövdeler terms.body — TR birebir). */
function usePointLabel() {
  const tt = useTranslations("terms");
  const t = useTranslations("atlas.transit");
  return (p: PointId) => (p === "ascendant" ? tt("angle.ascendant") : p === "midheaven" ? t("pointMc") : tt(`body.${p as BodyId}`));
}

/**
 * I18N mod-g: lib/astrology/transitDetail.ts relativeTo ile AYNI aritmetik (yuvarlama, gün/saat/dakika bölümü, işaret); metin
 * katalogdan. TR çıktı relativeTo ile birebir (scripts/astrology/atlas-transit-i18n.harness.ts kilitler).
 */
function useRelativeTo() {
  const t = useTranslations("atlas.transit.rel");
  return (atUtc: string, exactUtc: string): string => {
    const a = Date.parse(/Z$/.test(atUtc) ? atUtc : `${atUtc}Z`);
    const b = Date.parse(exactUtc);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
    const diff = b - a;
    const m = Math.round(Math.abs(diff) / 60_000);
    if (m < 1) return t("same");
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    const mm = m % 60;
    const span = d > 0 ? (h ? t("daysHours", { d, h }) : t("days", { d })) : h > 0 ? (mm ? t("hoursMinutes", { h, m: mm }) : t("hours", { h })) : t("minutes", { m: mm });
    return diff > 0 ? t("after", { span }) : t("before", { span });
  };
}

function Point({ id, prefix }: { id: PointId; prefix?: string }) {
  const label = usePointLabel();
  return (
    <span className="whitespace-nowrap">
      {prefix && <span className="mr-1 text-[11px] text-slate-500">{prefix}</span>}
      <span className="mr-1">{pointGlyph(id)}</span>
      {label(id)}
    </span>
  );
}

function NatureBadge({ n }: { n: keyof typeof NATURE_LABELS | null }) {
  const tt = useTranslations("terms");
  if (!n) return <span className="text-slate-400">—</span>;
  const c = n === "harmonious" ? "bg-sky-50 text-sky-800" : n === "challenging" ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] ${c}`}>{tt(`aspectNature.${n}`)}</span>;
}

function StrengthBar({ v }: { v: number }) {
  const t = useTranslations("atlas.transit");
  const w = Math.max(0, Math.min(100, v));
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums" title={t("strengthTitle")}>
      <span className="inline-block h-1.5 w-12 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <span className="block h-full rounded-full bg-indigo-400" style={{ width: `${w}%` }} />
      </span>
      {t("strengthPct", { v: String(Math.round(w)) })}
    </span>
  );
}

function SignCell({ sign, degree }: { sign: SignId; degree: number }) {
  const tt = useTranslations("terms");
  return (
    <span className="whitespace-nowrap">
      <span className="mr-1">{SIGN_GLYPHS[sign]}</span>
      {tt(`zodiac.${sign}`)} {formatDegree(degree)}
    </span>
  );
}

const zoneOf = (tz: unknown): string => (isIanaZone(tz) ? tz : "UTC");
/**
 * I18N-F1-R5: EN ekranda gün/ay/yıl ayırıcısı "/" (Owner A8 en-GB sırası; ATLAS-E aylık efemeris dateTr ile aynı biçim).
 * TR çıktı DEĞİŞMEZ (GG.AA.YYYY). Yalnız sunum; anlar, saat dilimi ve hesap aynı.
 */
const dmyFor = (locale: string) => (s: string): string => (locale === "en" ? s.replace(/(\d{2})\.(\d{2})\.(\d{4})/g, "$1/$2/$3") : s);
const at = (utcIso: string, tz: string) => (tz === "UTC" ? `${utcIso.slice(8, 10)}.${utcIso.slice(5, 7)}.${utcIso.slice(0, 4)} ${utcIso.slice(11, 16)} UTC` : (() => {
  const z = formatInZone(utcIso, tz);
  return z ? `${z.text} ${z.zone}` : utcIso;
})());

// ═══ TRANSİT (tek an) ════════════════════════════════════════════════════════

/**
 * Kap genişliği (px). Transit ayrıntısı geniş ekranda dar yan panelde de açılır → tablo/kart seçimi ekran değil KAP
 * genişliğine göre yapılır (ölçülene kadar ekran kırılımı kullanılır).
 */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number | null] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((es) => setW(Math.round(es[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

type Applying = "all" | "applying" | "separating";

export function TransitPanel({ t, options = {} }: { t: TransitTechnical; options?: Record<string, unknown> }) {
  const tx = useTranslations("atlas.transit");
  const tt = useTranslations("terms");
  const locale = useLocale();
  const dmy = dmyFor(locale);
  const pointLabel = usePointLabel();
  const relativeTo = useRelativeTo();
  const tz = zoneOf(options.displayTz);
  const [scope, setScope] = useState<"major" | "all">("major");
  const [body, setBody] = useState<BodyId | "">("");
  const [target, setTarget] = useState<PointId | "">("");
  const [aspType, setAspType] = useState<AspectType | "">("");
  const [minStrength, setMinStrength] = useState(0);
  const [applying, setApplying] = useState<Applying>("all");
  const houses = useMemo(() => transitNatalHouses(t), [t]);
  const ce = t.calendarExact ?? null;
  const showExact = !!ce;
  const list = useMemo(
    () =>
      [...t.aspects]
        .filter((a) => scope === "all" || MAJOR_ASPECTS.has(a.type))
        .filter((a) => !body || a.transit === body)
        .filter((a) => !target || a.natal === target)
        .filter((a) => !aspType || a.type === aspType)
        .filter((a) => a.strength >= minStrength)
        .filter((a) => applying === "all" || (applying === "applying" ? a.applying : !a.applying))
        .sort((a, b) => a.orb - b.orb),
    [t.aspects, scope, body, target, aspType, minStrength, applying],
  );
  const top = useMemo(() => strongestTransits(t.aspects, 5), [t.aspects]);
  const byType = useMemo(() => aspectTypeCounts(t.aspects), [t.aspects]);
  const bodies = [...new Set(t.aspects.map((a) => a.transit))];
  const targets = [...new Set(t.aspects.map((a) => a.natal))];
  const types = [...new Set(t.aspects.map((a) => a.type))];
  const filtered = !!body || !!target || !!aspType || minStrength > 0 || applying !== "all";
  const cal = options.calendar as { startDate?: string; days?: number } | undefined;
  const [boxRef, boxW] = useWidth<HTMLDivElement>();
  // 640 px altı kap: bilgi kartı (sütun kesilmez); üstü: tam tablo. Ölçülmeden önce ekran kırılımı (sm).
  const cardsCls = boxW === null ? "sm:hidden" : boxW < 640 ? "" : "hidden";
  const tableCls = boxW === null ? "hidden sm:table" : boxW < 640 ? "hidden" : "table";

  const exactCell = (a: TransitAspect) => {
    const xs = exactTimesOf(ce, a);
    if (xs.length === 0) return <span className="text-slate-400">—</span>;
    return (
      <span className="flex flex-col gap-0.5">
        {xs.map((x) => (
          <span key={x} className="whitespace-nowrap text-xs tabular-nums">
            {dmy(at(x, tz))} <span className="text-slate-500">· {relativeTo(t.atUtc, x)}</span>
          </span>
        ))}
      </span>
    );
  };

  return (
    <div ref={boxRef} className="flex flex-col gap-3" data-testid="astro-transit-panel">
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-700" data-testid="astro-transit-moment-info">
        <p>
          {tx.rich("momentLabel", { moment: dmy(momentLabel(t.atUtc, tz)), strong: (c) => <strong data-testid="astro-transit-at">{c}</strong> })}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {tx("frameLine", { node: tt(`nodeType.${t.nodeType}`) })}
          {cal?.startDate ? ` · ${tx("sourceCalendar", { start: dmy(cal.startDate.split("-").reverse().join(".")), days: String(cal.days) })}` : ""}
        </p>
      </div>

      <Section title={tx("summaryTitle")} testId="astro-transit-summary">
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 text-xs text-slate-600">
          <span className="rounded-full bg-slate-100 px-2 py-0.5">{tx("total", { n: t.aspects.length })}</span>
          {t.summary.harmonious !== null && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-800">{tx("harmonious", { n: t.summary.harmonious })}</span>}
          {t.summary.challenging !== null && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-800">{tx("challenging", { n: t.summary.challenging })}</span>}
          {t.summary.neutral !== null && <span className="rounded-full bg-slate-100 px-2 py-0.5">{tx("neutral", { n: t.summary.neutral })}</span>}
          <span className="mx-1 text-slate-300">|</span>
          {byType.map(([k, n]) => (
            <span key={k} className="rounded-full border border-slate-200 px-2 py-0.5" data-aspect-type={k}>
              {ASPECT_GLYPHS[k]} {tt(`aspect.${k}`)} {n}
            </span>
          ))}
        </div>
      </Section>

      <Section title={tx("strongestTitle")} testId="astro-transit-strongest">
        {top.length === 0 ? (
          <p className="px-3 py-2 text-sm text-slate-500">{tx("noAspects")}</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {top.map((a, i) => (
              <li key={`${a.transit}-${a.type}-${a.natal}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm text-slate-800">
                <span className="w-5 text-xs font-semibold text-slate-400">{i + 1}.</span>
                <span className="flex flex-wrap items-center gap-x-1.5">
                  <Point id={a.transit} />
                  <span className="text-slate-600">
                    {ASPECT_GLYPHS[a.type]} {tt(`aspect.${a.type}`)}
                  </span>
                  <Point id={a.natal} prefix={tx("natalPrefix")} />
                </span>
                <span className="flex flex-wrap items-center gap-x-3 text-xs text-slate-600">
                  <StrengthBar v={a.strength} />
                  <span className="tabular-nums">{tx("orb", { orb: formatDegree(a.orb) })}</span>
                  <span>{a.applying ? tx("applying") : tx("separating")}</span>
                  {showExact && exactTimesOf(ce, a).length > 0 && <span className="tabular-nums">{tx("exactAt", { at: dmy(at(exactTimesOf(ce, a)[0], tz)) })}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">{tx("strongestNote")}</p>
      </Section>

      <Section
        title={tx("tableTitle", { shown: list.length, total: t.aspects.length })}
        testId="astro-transit-table"
        right={
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={tx("filtersLabel")}>
            <select className={inp} value={scope} onChange={(e) => setScope(e.target.value as "major" | "all")} aria-label={tx("scopeLabel")}>
              <option value="major">{tx("scopeMajor")}</option>
              <option value="all">{tx("scopeAll")}</option>
            </select>
            <select className={inp} value={body} onChange={(e) => setBody(e.target.value as BodyId | "")} aria-label={tx("bodyFilterLabel")}>
              <option value="">{tx("bodyAll")}</option>
              {bodies.map((b) => (
                <option key={b} value={b}>
                  {BODY_GLYPHS[b]} {tt(`body.${b}`)}
                </option>
              ))}
            </select>
            <select className={inp} value={target} onChange={(e) => setTarget(e.target.value as PointId | "")} aria-label={tx("targetFilterLabel")}>
              <option value="">{tx("targetAll")}</option>
              {targets.map((p) => (
                <option key={p} value={p}>
                  {tx("targetOption", { point: pointLabel(p) })}
                </option>
              ))}
            </select>
            <select className={inp} value={aspType} onChange={(e) => setAspType(e.target.value as AspectType | "")} aria-label={tx("typeFilterLabel")}>
              <option value="">{tx("typeAll")}</option>
              {types.map((k) => (
                <option key={k} value={k}>
                  {ASPECT_GLYPHS[k]} {tt(`aspect.${k}`)}
                </option>
              ))}
            </select>
            <select className={inp} value={minStrength} onChange={(e) => setMinStrength(Number(e.target.value))} aria-label={tx("strengthFilterLabel")}>
              {[0, 25, 50, 75, 90].map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? tx("strengthAny") : tx("strengthMin", { v: String(v) })}
                </option>
              ))}
            </select>
            <select className={inp} value={applying} onChange={(e) => setApplying(e.target.value as Applying)} aria-label={tx("motionFilterLabel")}>
              <option value="all">{tx("motionAll")}</option>
              <option value="applying">{tx("motionApplying")}</option>
              <option value="separating">{tx("motionSeparating")}</option>
            </select>
            {filtered && (
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  setBody("");
                  setTarget("");
                  setAspType("");
                  setMinStrength(0);
                  setApplying("all");
                }}
              >
                {tx("clearFilters")}
              </button>
            )}
          </div>
        }
      >
        {list.length === 0 ? (
          <p className="px-3 py-3 text-sm text-slate-500" data-testid="astro-transit-empty">
            {tx("noMatch")}
          </p>
        ) : (
          <>
            {/* Telefon (<640 px): her açı bir bilgi kartı — hiçbir sütun kesilmez / gizlenmez (2026-10-12 UAT madde 9). */}
            <ul className={`divide-y divide-slate-100 ${cardsCls}`} data-testid="astro-transit-cards">
              {list.map((a, i) => (
                <li key={`${a.transit}-${a.type}-${a.natal}-${i}`} className="px-3 py-2 text-sm text-slate-800">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <Point id={a.transit} />
                    <span className="text-slate-600">
                      {ASPECT_GLYPHS[a.type]} {tt(`aspect.${a.type}`)}
                    </span>
                    <Point id={a.natal} prefix={tx("natalPrefix")} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span className="tabular-nums">{tx("orb", { orb: formatDegree(a.orb) })}</span>
                    <StrengthBar v={a.strength} />
                    <span>{a.applying ? tx("applying") : tx("separating")}</span>
                    <NatureBadge n={a.nature} />
                  </div>
                  {showExact && exactTimesOf(ce, a).length > 0 && <div className="mt-1 text-xs text-slate-600">{tx("exactLabel")} {exactCell(a)}</div>}
                </li>
              ))}
            </ul>
            <table className={`min-w-full ${tableCls}`} data-testid="astro-transit-grid">
              <thead>
                <tr>
                  <th className={th}>{tx("colTransit")}</th>
                  <th className={th}>{tx("colAspect")}</th>
                  <th className={th}>{tx("colNatal")}</th>
                  <th className={th}>{tx("colOrb")}</th>
                  <th className={th}>{tx("colStrength")}</th>
                  <th className={th}>{tx("colMotion")}</th>
                  <th className={th}>{tx("colNature")}</th>
                  {showExact && <th className={th}>{tx("colExact")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((a, i) => (
                  <tr key={`${a.transit}-${a.type}-${a.natal}-${i}`}>
                    <td className={td}>
                      <Point id={a.transit} />
                    </td>
                    <td className={td}>
                      {ASPECT_GLYPHS[a.type]} {tt(`aspect.${a.type}`)}
                    </td>
                    <td className={td}>
                      <Point id={a.natal} prefix={tx("natalPrefix")} />
                    </td>
                    <td className={`${td} tabular-nums`}>{formatDegree(a.orb)}</td>
                    <td className={td}>
                      <StrengthBar v={a.strength} />
                    </td>
                    <td className={td}>{a.applying ? tx("applying") : tx("separating")}</td>
                    <td className={td}>
                      <NatureBadge n={a.nature} />
                    </td>
                    {showExact && <td className={td}>{exactCell(a)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] leading-snug text-slate-500" data-testid="astro-transit-exact-note">
          {showExact
            ? tx("exactNote", {
                start: dmy(ce!.window.start.split("-").reverse().join(".")),
                end: dmy(ce!.window.end.split("-").reverse().join(".")),
                partial: ce!.complete ? "" : tx("exactNotePartial"),
                unmatched: tx("calendarUnmatched"),
              })
            : tx("noExactNote")}
        </p>
      </Section>

      <Section title={tx("bodiesTitle")}>
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>{tx("colBody")}</th>
              <th className={th}>{tx("colSignDegree")}</th>
              <th className={th}>{tx("colSpeed")}</th>
              {houses.size > 0 && <th className={th}>{tx("colNatalHouse")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.bodies.map((b) => (
              <tr key={b.id}>
                <td className={td}>
                  <span className="mr-1.5">{BODY_GLYPHS[b.id]}</span>
                  {tt(`body.${b.id}`)}
                  {b.retrograde && <span className="ml-1 font-semibold text-rose-600">℞</span>}
                </td>
                <td className={td}>
                  <SignCell sign={b.sign} degree={b.degreeInSign} />
                </td>
                <td className={`${td} tabular-nums`}>{locale === "tr" ? b.speed.toFixed(3).replace(".", ",") : b.speed.toFixed(3)}</td>
                {houses.size > 0 && <td className={td}>{houses.get(b.id) ?? "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {houses.size > 0 && <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">{tx("natalHouseNote")}</p>}
      </Section>
    </div>
  );
}

// ═══ TRANSİT TAKVİMİ ═════════════════════════════════════════════════════════

const EVENT_LABELS: Record<ForecastEvent["type"], string> = {
  transit_aspect: "Transit açı",
  sign_ingress: "Burç girişi",
  retrograde_station: "İstasyon",
  eclipse: "Tutulma",
  lunar_phase: "Ay evresi",
};
const EVENT_TYPES = Object.keys(EVENT_LABELS) as ForecastEvent["type"][];
const ECLIPSE_LABELS: Record<string, string> = { penumbral: "yarıgölge", partial: "parçalı", annular: "halkalı", total: "tam" };

/** Olay cümlesi (TR; Word/PDF ve eski çağıranlar için korunur). Ekran useEventText ile katalogdan — TR çıktı birebir aynı. */
export function eventText(e: ForecastEvent): string {
  const body = e.body ? `${BODY_GLYPHS[e.body]} ${BODY_LABELS[e.body]}` : "";
  switch (e.type) {
    case "transit_aspect":
      return `${body} ${e.aspect ? `${ASPECT_GLYPHS[e.aspect]} ${ASPECT_LABELS[e.aspect]}` : ""} natal ${e.targetBody ? `${pointGlyph(e.targetBody)} ${pointLabel(e.targetBody)}` : ""}`;
    case "sign_ingress":
      return `${body} ${e.targetSign ? `${SIGN_GLYPHS[e.targetSign]} ${SIGN_LABELS[e.targetSign]}` : ""} burcuna girer`;
    case "retrograde_station":
      return `${body} ${e.station === "retrograde" ? "retro" : "direkt"} istasyonu`;
    case "eclipse":
      return `${e.body === "moon" ? "Ay" : "Güneş"} tutulması${e.eclipseKind ? ` (${ECLIPSE_LABELS[e.eclipseKind]})` : ""}${e.obscuration !== null ? ` · örtme %${Math.round(e.obscuration * 100)}` : ""}`;
    case "lunar_phase":
      return `${e.phase === "new_moon" ? "Yeni Ay" : "Dolunay"}${e.targetSign ? ` — ${SIGN_GLYPHS[e.targetSign]} ${SIGN_LABELS[e.targetSign]}` : ""}`;
  }
}

/** I18N-F1-R5: eventText ile AYNI kompozisyon; metin katalogdan (atlas.forecast.ev + terms). TR çıktı eventText ile birebir (harness kilidi). */
function useEventText() {
  const t = useTranslations("atlas.forecast");
  const tt = useTranslations("terms");
  const point = usePointLabel();
  return (e: ForecastEvent): string => {
    const body = e.body ? `${BODY_GLYPHS[e.body]} ${tt(`body.${e.body}`)}` : "";
    const sign = e.targetSign ? `${SIGN_GLYPHS[e.targetSign]} ${tt(`zodiac.${e.targetSign}`)}` : "";
    switch (e.type) {
      case "transit_aspect":
        return t("ev.aspect", {
          body,
          aspect: e.aspect ? `${ASPECT_GLYPHS[e.aspect]} ${tt(`aspect.${e.aspect}`)}` : "",
          target: e.targetBody ? `${pointGlyph(e.targetBody)} ${point(e.targetBody)}` : "",
        });
      case "sign_ingress":
        return t("ev.ingress", { body, sign });
      case "retrograde_station":
        return t(e.station === "retrograde" ? "ev.stationRetro" : "ev.stationDirect", { body });
      case "eclipse":
        return (
          t(e.body === "moon" ? "ev.eclipseMoon" : "ev.eclipseSun") +
          (e.eclipseKind ? t("ev.eclipseKindSuffix", { kind: t(`eclipseKind.${e.eclipseKind}`) }) : "") +
          (e.obscuration !== null ? t("ev.obscuration", { n: String(Math.round(e.obscuration * 100)) }) : "")
        );
      case "lunar_phase":
        return t(e.phase === "new_moon" ? "ev.newMoon" : "ev.fullMoon") + (e.targetSign ? t("ev.phaseSignSuffix", { sign }) : "");
    }
  };
}

function SignificanceBadge({ v }: { v: number | null }) {
  const t = useTranslations("atlas.forecast");
  const b = significanceBand(v);
  if (!b || v === null) return <span className="text-[11px] text-slate-400">{t("sigNone")}</span>;
  const c = b === "high" ? "bg-amber-100 text-amber-900" : b === "mid" ? "bg-slate-100 text-slate-700" : "bg-white text-slate-500 ring-1 ring-slate-200";
  return (
    <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${c}`} title={t("significanceNote")} data-significance={Math.round(v)}>
      {t("sigValue", { n: String(Math.round(v)), band: t(`band.${b}`) })}
    </span>
  );
}

/** Takvimden günün transit haritası: ücretsiz plan → (kayıtlıysa 0 istek) → uzman onayıyla hesap. */
export type CalendarTransitApi = {
  plan: (atUtc: string) => Promise<{ ok: true; newRequests: number } | { ok: false; error: string }>;
  open: (atUtc: string, confirmNewRequests: number) => Promise<{ ok: true } | { ok: false; error: string }>;
};

type Pending = { atUtc: string; label: string; state: "planning" | "ready" | "running" | "error"; newRequests?: number; error?: string };

/** I18N-F1-R5: dışa aktarım yalnız test çizimi içindir (davranış değişmedi). */
export function DayDetail({ day, events, tz, api, onClose }: { day: string; events: ForecastEvent[]; tz: string; api: CalendarTransitApi | null; onClose: () => void }) {
  const t = useTranslations("atlas.forecast");
  const evText = useEventText();
  const dmy = dmyFor(useLocale());
  const personal = events.filter(isPersonalEvent).sort((a, b) => (b.significance ?? -1) - (a.significance ?? -1) || a.datetime.localeCompare(b.datetime));
  const sky = events.filter((e) => !isPersonalEvent(e));
  const [pending, setPending] = useState<Pending | null>(null);
  const noon = middayUtcOf(day, tz);

  async function ask(atUtc: string, label: string) {
    if (!api) return;
    setPending({ atUtc, label, state: "planning" });
    const r = await api.plan(atUtc);
    setPending((p) => (p && p.atUtc === atUtc ? (r.ok ? { ...p, state: "ready", newRequests: r.newRequests } : { ...p, state: "error", error: r.error }) : p));
  }
  async function confirm() {
    if (!api || !pending || pending.state !== "ready") return;
    const p = pending;
    setPending({ ...p, state: "running" });
    const r = await api.open(p.atUtc, p.newRequests ?? 0);
    setPending(r.ok ? null : { ...p, state: "error", error: r.error });
  }

  const row = (e: ForecastEvent, i: number) => (
    <li key={`${e.datetime}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm text-slate-800">
      <span className="w-full text-xs tabular-nums text-slate-500 sm:w-auto">{dmy(at(e.datetime, tz))}</span>
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{t(`eventType.${e.type}`)}</span>
      <span className="min-w-0 break-words">{evText(e)}</span>
      {e.orb !== null && <span className="text-xs tabular-nums text-slate-500">{t("orb", { orb: formatDegree(e.orb) })}</span>}
      <SignificanceBadge v={e.significance} />
      {api && isPersonalEvent(e) && eventMinuteUtc(e.datetime) && (
        <button
          type="button"
          className="ml-auto rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-900 hover:bg-indigo-100"
          onClick={() => void ask(eventMinuteUtc(e.datetime)!, t("exactLabel", { event: evText(e) }))}
          data-testid="astro-day-open-exact"
        >
          {t("exactChartBtn")}
        </button>
      )}
    </li>
  );

  return (
    <section className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 max-sm:-mx-3 max-sm:rounded-none max-sm:border-x-0" data-testid="astro-day-detail" aria-label={t("dayAria")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 px-3 py-2">
        <h4 className="text-sm font-semibold text-indigo-950">
          {t("dayTitle", { date: dmy(day.split("-").reverse().join(".")) })} <span className="font-normal text-indigo-900/70">({tz})</span>
        </h4>
        <button type="button" className="rounded-lg border border-indigo-200 bg-white px-2 py-0.5 text-xs text-indigo-900" onClick={onClose} data-testid="astro-day-close">
          {t("close")}
        </button>
      </div>
      <div className="flex flex-col gap-2 px-0 py-2">
        <div className="px-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-900/80">{t("personalTitle", { n: String(personal.length) })}</p>
          {personal.length === 0 ? <p className="py-1 text-sm text-slate-500">{t("personalNone")}</p> : null}
        </div>
        {personal.length > 0 && <ul className="divide-y divide-indigo-100 bg-white" data-testid="astro-day-personal">{personal.map(row)}</ul>}
        <div className="px-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("skyTitle", { n: String(sky.length) })}</p>
          {sky.length === 0 ? <p className="py-1 text-sm text-slate-500">{t("skyNone")}</p> : null}
        </div>
        {sky.length > 0 && <ul className="divide-y divide-slate-100 bg-white" data-testid="astro-day-sky">{sky.map(row)}</ul>}
        <div className="flex flex-wrap items-center gap-2 px-3 pt-1">
          {api ? (
            noon && (
              <button type="button" className="rounded-lg bg-indigo-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800" onClick={() => void ask(noon, t("noonLabel"))} data-testid="astro-day-open-noon">
                {t("noonBtn")}
              </button>
            )
          ) : (
            <p className="text-xs text-slate-500">{t("noonFromDesk")}</p>
          )}
        </div>
        {pending && (
          <div className="mx-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" role="status" data-testid="astro-day-plan">
            <p className="text-slate-700">
              <strong>{pending.label}</strong> · {dmy(at(pending.atUtc, tz))}
            </p>
            {pending.state === "planning" && <p className="text-xs text-slate-500">{t("planChecking")}</p>}
            {pending.state === "error" && <p className="text-xs text-rose-700">{pending.error}</p>}
            {(pending.state === "ready" || pending.state === "running") && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-600" data-testid="astro-day-plan-count">
                  {pending.newRequests === 0 ? t("planCached") : t("planNew", { n: pending.newRequests ?? 0 })}
                </span>
                <button type="button" disabled={pending.state === "running"} className="rounded-lg bg-[#0b1430] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50" onClick={() => void confirm()} data-testid="astro-day-plan-confirm">
                  {pending.state === "running" ? t("opening") : pending.newRequests === 0 ? t("openTransit") : t("calcOpen")}
                </button>
                <button type="button" className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600" onClick={() => setPending(null)}>
                  {t("cancel")}
                </button>
              </div>
            )}
          </div>
        )}
        <p className="px-3 text-[11px] leading-snug text-slate-500">{t("dayFootnote")}</p>
      </div>
    </section>
  );
}

export function ForecastPanel({ t, options = {}, calendarTransit = null }: { t: ForecastTechnical; options?: Record<string, unknown>; calendarTransit?: CalendarTransitApi | null }) {
  const tf = useTranslations("atlas.forecast");
  const evText = useEventText();
  const locale = useLocale();
  const dmy = dmyFor(locale);
  const [tz, setTz] = useState(zoneOf(options.displayTz));
  const [types, setTypes] = useState<Set<ForecastEvent["type"]>>(() => new Set(["transit_aspect", "sign_ingress", "retrograde_station", "eclipse", "lunar_phase"]));
  const [minSig, setMinSig] = useState(0);
  const [onlyPersonal, setOnlyPersonal] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of t.events) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return m;
  }, [t.events]);
  const shown = useMemo(() => t.events.filter((e) => types.has(e.type) && (!onlyPersonal || isPersonalEvent(e)) && (minSig === 0 || (e.significance ?? -1) >= minSig)), [t.events, types, onlyPersonal, minSig]);
  const byDay = useMemo(() => groupEventsByDay(shown, tz), [shown, tz]);
  const allByDay = useMemo(() => new Map(groupEventsByDay(t.events, tz)), [t.events, tz]);
  const byMonth = useMemo(() => {
    const m = new Map<string, [string, ForecastEvent[]][]>();
    for (const [d, evs] of byDay) m.set(d.slice(0, 7), [...(m.get(d.slice(0, 7)) ?? []), [d, evs]]);
    return [...m.entries()];
  }, [byDay]);
  const hasSig = t.events.some((e) => e.significance !== null);
  const zones = [...new Set([zoneOf(options.displayTz), "Europe/Istanbul", "UTC"])];

  return (
    <div className="flex flex-col gap-3" data-testid="astro-forecast-panel">
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-700">
        {tf.rich("period", {
          start: dmy(t.window.start.split("-").reverse().join(".")),
          end: dmy(t.window.end.split("-").reverse().join(".")),
          n: String(t.events.length),
          strong: (c) => <strong>{c}</strong>,
        })}
        <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500">
          {tf("pickDay")}
          <input
            type="date"
            className={inp}
            min={t.window.start}
            max={t.window.end}
            value={day ?? ""}
            onChange={(e) => setDay(dayInWindow(e.target.value, t.window) ? e.target.value : null)}
            aria-label={tf("pickDayAria")}
            data-testid="astro-forecast-pick-day"
          />
        </span>
        <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500">
          {tf("timeZone")}
          <select className={inp} value={tz} onChange={(e) => setTz(e.target.value)} aria-label={tf("timeZoneAria")}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={tf("typeFilterAria")}>
        {EVENT_TYPES.map((k) => (
          <label key={k} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${types.has(k) ? "border-sky-300 bg-sky-50 text-sky-900" : "border-slate-200 text-slate-500"}`}>
            <input
              type="checkbox"
              checked={types.has(k)}
              onChange={(e) => {
                const n = new Set(types);
                if (e.target.checked) n.add(k);
                else n.delete(k);
                setTypes(n);
              }}
            />
            {tf("typeCount", { label: tf(`eventType.${k}`), n: String(counts.get(k) ?? 0) })}
          </label>
        ))}
        <label className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-700">
          <input type="checkbox" checked={onlyPersonal} onChange={(e) => setOnlyPersonal(e.target.checked)} data-testid="astro-forecast-only-personal" /> {tf("onlyPersonal")}
        </label>
        {hasSig && (
          <select className={inp} value={minSig} onChange={(e) => setMinSig(Number(e.target.value))} aria-label={tf("minSigAria")} data-testid="astro-forecast-min-sig">
            <option value={0}>{tf("sigAny")}</option>
            <option value={40}>{tf("sigMin", { n: "40" })}</option>
            <option value={70}>{tf("sigMin", { n: "70" })}</option>
          </select>
        )}
      </div>
      <p className="text-[11px] leading-snug text-slate-500" data-testid="astro-forecast-scope-note">
        {tf("scopeNote")}
      </p>
      {hasSig && (
        <p className="text-[11px] leading-snug text-slate-500" data-testid="astro-significance-note">
          {tf("significanceNote")}
        </p>
      )}
      {day && <DayDetail key={`${day}|${tz}`} day={day} events={allByDay.get(day) ?? []} tz={tz} api={calendarTransit} onClose={() => setDay(null)} />}
      {byMonth.length === 0 ? (
        <p className="text-sm text-slate-500">{tf("noMatch")}</p>
      ) : (
        byMonth.map(([month, days]) => (
          <Section key={month} title={`${month.slice(5, 7)}${locale === "en" ? "/" : "."}${month.slice(0, 4)} (${days.reduce((n, [, l]) => n + l.length, 0)})`}>
            <div className="divide-y divide-slate-100" data-testid="astro-forecast-cards">
              {days.map(([d, list]) => (
                <div key={d} className={day === d ? "bg-indigo-50/60" : undefined}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={() => setDay(day === d ? null : d)}
                    aria-expanded={day === d}
                    data-testid="astro-forecast-day"
                    data-day={d}
                  >
                    <span>
                      {tf("dayEvents", { date: dmy(d.split("-").reverse().join(".")), n: String(list.length) })}
                      {list.some(isPersonalEvent) && <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-900">{tf("natalBadge")}</span>}
                    </span>
                    <span className="text-[11px] font-normal text-indigo-800">{day === d ? tf("detailOpen") : tf("detailClosed")}</span>
                  </button>
                  <ul className="divide-y divide-slate-50">
                    {list.map((e, i) => (
                      <li key={`${e.datetime}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5 text-sm text-slate-800">
                        <span className="text-xs tabular-nums text-slate-500">{at(e.datetime, tz).slice(11)}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{tf(`eventType.${e.type}`)}</span>
                        <span className="min-w-0 break-words">{evText(e)}</span>
                        {e.orb !== null && <span className="text-xs tabular-nums text-slate-500">{tf("orb", { orb: formatDegree(e.orb) })}</span>}
                        {hasSig && <SignificanceBadge v={e.significance} />}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        ))
      )}
    </div>
  );
}
