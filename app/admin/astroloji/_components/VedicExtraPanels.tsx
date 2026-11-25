"use client";

/**
 * Aşama 5F — Graha Drishti · Ashtakavarga · Shadbala · Janma Panchanga görünümleri. Yalnız teknik katman
 * (sağlayıcı anlatısı ayrı "Roxy Otomatik Yorumu" panelinde, yetkiye bağlı). Değerler Roxy'den gelir; burada
 * hesap YAPILMAZ — yalnız tablo/ızgara/çubuk olarak düzenlenir.
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  SHADBALA_COMPONENTS,
  type KakshaLord,
  type ShadbalaComponent,
  type VedicAshtakavargaTechnical,
  type VedicDrishtiTechnical,
  type VedicGrahaId,
  type VedicPanchangaTechnical,
  type VedicShadbalaTechnical,
  type VedicTransitTechnical,
} from "@/lib/astrology/model/vedic";
import { SIGN_IDS, type SignId } from "@/lib/astrology/model/western";
import { SIGN_GLYPHS, formatDegree } from "@/lib/astrology/labels/tr";
import { KARANA_LABELS, NAKSHATRA_LABELS, NITYA_YOGA_LABELS, TITHI_LABELS } from "@/lib/astrology/topics/vedic";
import type { KbLookup } from "./VedicPanels";
import { GOCHARA_SUMMARY_NOTE, GOCHARA_TERMS, gocharaSummary } from "@/lib/astrology/gocharaSummary";
import type { VedicPanchangaWithHours } from "@/lib/astrology/model/panchangaHours";
import { PanchangaHoursView } from "./PanchangaHoursPanels";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";
const card = "min-w-0 rounded-xl border border-slate-200 bg-white";

/** I18N ATLAS-V: panel çevirmenleri. Graha / burç adları ortak terim kataloğundan (TR değerleri GRAHA_LABELS / SIGN_LABELS ile birebir). */
function useExtraText() {
  const t = useTranslations("atlas.vedicExtra");
  const tt = useTranslations("terms");
  const locale: "tr" | "en" = useLocale() === "en" ? "en" : "tr";
  const graha = (id: VedicGrahaId) => tt(`graha.${id}`);
  const sign = (id: string) => tt(`zodiac.${id as SignId}`);
  const lbl = (id: VedicGrahaId | "lagna") => (id === "lagna" ? t("lagna") : graha(id));
  return { t, locale, graha, sign, lbl };
}

function KbBox({ kb, empty }: { kb: ReturnType<KbLookup> | null; empty: string }) {
  const { t: tx } = useExtraText();
  return (
    <div className="mt-2 border-t border-amber-200 pt-2" data-testid="astro-vedic-extra-kb">
      <div className="text-xs font-semibold text-indigo-900">{tx("kb.title")}</div>
      {kb === null ? (
        <p className="text-xs text-slate-500">{tx("kb.notLoaded")}</p>
      ) : kb.length === 0 ? (
        <p className="text-xs text-slate-500">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {kb.map((e) => (
            <li key={`${e.topicKey}-${e.title}`} className="rounded-lg bg-white px-2 py-1 text-xs">
              <div className="font-medium text-indigo-900">{e.topicLabel}</div>
              <div className="font-semibold text-slate-800">{e.title}</div>
              <p className="whitespace-pre-line text-slate-700">{e.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Graha Drishti ──────────────────────────────────────────────────────────
export function VedicDrishtiPanel({ t, kbLookup }: { t: VedicDrishtiTechnical; kbLookup?: KbLookup | null }) {
  const { t: tx, graha, sign } = useExtraText();
  const [sel, setSel] = useState(0);
  const a = t.aspects[Math.min(sel, t.aspects.length - 1)] ?? null;
  const kb = a && kbLookup ? kbLookup([`graha_drishti:${a.from}:${a.to}`]) : null;
  const isMutual = (x: { from: VedicGrahaId; to: VedicGrahaId }) => t.mutual.some((m) => (m.a === x.from && m.b === x.to) || (m.a === x.to && m.b === x.from));
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-drishti-panel">
      <p className="text-sm text-slate-700" data-testid="astro-vedic-drishti-method">
        <strong>{tx("drishti.title")}</strong>
        {tx("drishti.methodA")}
        <strong>{tx("drishti.methodName")}</strong>
        {tx("drishti.methodB")}
      </p>
      <p className="text-xs text-slate-500">{tx("drishti.scopeNote")}</p>
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className={`${card} overflow-x-auto`}>
          <table className="min-w-full" data-testid="astro-vedic-drishti-table">
            <thead>
              <tr>
                <th className={th}>{tx("drishti.from")}</th>
                <th className={th}>{tx("drishti.to")}</th>
                <th className={th}>{tx("drishti.type")}</th>
                <th className={th}>{tx("drishti.orb")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {t.aspects.length === 0 && (
                <tr>
                  <td className={td} colSpan={4}>
                    {tx("drishti.none")}
                  </td>
                </tr>
              )}
              {t.aspects.map((x, i) => (
                <tr key={`${x.from}-${x.to}-${x.type}`} className={`cursor-pointer ${sel === i ? "bg-amber-50" : ""}`} onClick={() => setSel(i)} data-drishti={`${x.from}-${x.to}`}>
                  <td className={`${td} font-medium`}>{graha(x.from)}</td>
                  <td className={td}>{graha(x.to)}</td>
                  <td className={td}>
                    {x.type}.{isMutual(x) ? <span className="ml-1 rounded bg-indigo-100 px-1 text-[10px] text-indigo-800">{tx("drishti.mutual")}</span> : null}
                  </td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{x.orb.toFixed(2)}°</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label={tx("drishti.selectedLabel")}>
          {a ? (
            <>
              <h4 className="font-semibold text-amber-900">
                {graha(a.from)} → {graha(a.to)} · {a.type}
                {tx("drishti.aspectSuffix")}
              </h4>
              <p className="text-xs text-slate-600">
                {graha(a.from)} {formatDegree(t.positions.find((p) => p.id === a.from)!.longitude % 30)} {sign(t.positions.find((p) => p.id === a.from)!.rashi)} ·{" "}
                {graha(a.to)} {formatDegree(t.positions.find((p) => p.id === a.to)!.longitude % 30)} {sign(t.positions.find((p) => p.id === a.to)!.rashi)} · {a.type}
                {tx("drishti.detailMid")}
                {a.orb.toFixed(2)}
                {tx("drishti.detailTail")}
              </p>
              <KbBox kb={kb} empty={tx("kb.emptyDrishti")} />
            </>
          ) : (
            <p className="text-slate-500">{tx("drishti.noneSelected")}</p>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── 5.1A Gochara (Vedik transit) ───────────────────────────────────────────
export function VedicTransitPanel({ t, kbLookup }: { t: VedicTransitTechnical; kbLookup?: KbLookup | null }) {
  const { t: tx, graha, sign, lbl } = useExtraText();
  const KAKSHA_LORD_LABEL = (l: KakshaLord) => lbl(l);
  const drishtiLabel = (n: number) => (n === 1 ? tx("transit.sameRashi") : `${n}.`);
  const [sel, setSel] = useState<VedicGrahaId>(t.slow[0] ?? t.transits[0]?.id ?? "sun");
  const x = t.transits.find((y) => y.id === sel) ?? t.transits[0];
  const kb = x && kbLookup ? kbLookup([`gochara_graha_in_rashi:${x.id}:${x.rashi}`, `gochara_from_moon:${x.id}:${x.houseFromMoon}`, `gochara_in_bhava:${x.id}:${x.natalHouse}`, ...x.drishti.map((d) => `gochara_drishti:${x.id}:${d.to}`)]) : null;
  const local = `${t.at.local.slice(8, 10)}.${t.at.local.slice(5, 7)}.${t.at.local.slice(0, 4)} ${t.at.local.slice(11, 16)}`;
  const off = `${t.at.utcOffsetHours >= 0 ? "+" : "−"}${Math.abs(t.at.utcOffsetHours)}`;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-transit-panel">
      <p className="text-sm text-slate-700">
        <strong>{tx("transit.title")}</strong> · {t.at.utc.slice(8, 10)}.{t.at.utc.slice(5, 7)}.{t.at.utc.slice(0, 4)} {t.at.utc.slice(11, 16)}
        {tx("transit.utcBirthOffset")}
        {local}
        {tx("transit.utcSep")}
        {off}
        {tx("transit.frameA")}
        {t.frame.ayanamsaDegrees !== null ? tx("transit.birthAyanamsa", { deg: formatDegree(t.frame.ayanamsaDegrees) }) : ""}
        {tx("transit.janmaRashi")}
        <strong>{sign(t.janmaRashi)}</strong>
        {tx("transit.lagna")}
        <strong>{sign(t.lagnaRashi)}</strong>
      </p>
      <p className="text-xs text-slate-500">{tx("transit.methodNote")}</p>
      <div className="min-w-0 overflow-x-auto" data-testid="astro-vedic-transit-moonstrip">
        <ol className="grid min-w-[36rem] grid-cols-12 gap-1">
          {Array.from({ length: 12 }, (_, i) => {
            const rashi = SIGN_IDS[(SIGN_IDS.indexOf(t.janmaRashi) + i) % 12];
            const here = t.transits.filter((y) => y.houseFromMoon === i + 1);
            return (
              <li key={i} className={`rounded-lg border px-1 py-1 text-center ${i === 0 ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`} title={tx("transit.stripTitle", { n: String(i + 1), sign: sign(rashi) })}>
                <div className="text-[10px] font-semibold text-slate-500">{i + 1}</div>
                <div className="text-xs text-slate-600">{SIGN_GLYPHS[rashi]}</div>
                <div className="flex min-h-[1rem] flex-wrap justify-center gap-0.5">
                  {here.map((y) => (
                    <button key={y.id} type="button" onClick={() => setSel(y.id)} className={`rounded px-0.5 text-[10px] font-semibold ${sel === y.id ? "bg-amber-200 text-amber-950" : "text-indigo-900"}`} title={graha(y.id)}>
                      {graha(y.id).split(" ")[0]}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      {/* 6 sütunlu tablo dar yan sütuna sığmaz (Drishti/Kaksha kaydırmaya gizlenirdi) → tablo tam genişlik, ayrıntı altında. */}
      <div className="grid min-w-0 gap-3">
        <div className={`${card} overflow-x-auto`}>
          <table className="min-w-full" data-testid="astro-vedic-transit-table">
            <thead>
              <tr>
                <th className={th}>{tx("transit.colGraha")}</th>
                <th className={th}>{tx("rashi")}</th>
                <th className={th}>{tx("transit.fromJanma")}</th>
                <th className={th}>{tx("transit.fromLagna")}</th>
                <th className={th}>{tx("transit.colDrishti")}</th>
                <th className={th}>{tx("kaksha")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {t.transits.map((y) => (
                <tr key={y.id} className={`cursor-pointer ${sel === y.id ? "bg-amber-50" : ""}`} onClick={() => setSel(y.id)} data-gochara={y.id}>
                  <td className={`${td} whitespace-nowrap font-medium`}>
                    {graha(y.id)}
                    {t.slow.includes(y.id) && <span className="ml-1 rounded bg-indigo-100 px-1 text-[10px] text-indigo-800">{tx("transit.slow")}</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {SIGN_GLYPHS[y.rashi]} {sign(y.rashi)} {formatDegree(y.degreeInRashi)}
                  </td>
                  <td className={`${td} tabular-nums`}>{y.houseFromMoon}.</td>
                  <td className={`${td} tabular-nums`}>{y.natalHouse}.</td>
                  <td className={`${td} text-xs`}>{y.drishti.length === 0 ? "—" : y.drishti.map((d) => `${drishtiLabel(d.type)} → ${graha(d.to).split(" ")[0]}`).join(", ")}</td>
                  <td className={`${td} whitespace-nowrap text-xs`}>
                    {y.kaksha.number}. · {KAKSHA_LORD_LABEL(y.kaksha.lord).split(" ")[0]}
                    {y.kaksha.bindu === null ? "" : y.kaksha.bindu ? tx("transit.binduYes") : tx("transit.binduNo")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {x && (
          <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label={tx("transit.selectedLabel")} data-testid="astro-vedic-transit-detail">
            <h4 className="font-semibold text-amber-900">
              {tx("transit.detailPrefix")}
              {graha(x.id)} · {sign(x.rashi)} {formatDegree(x.degreeInRashi)}
            </h4>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-slate-500">{tx("transit.fromJanma")}</dt>
              <dd>
                {x.houseFromMoon}
                {tx("evSuffix")}
              </dd>
              <dt className="text-slate-500">{tx("transit.fromLagna")}</dt>
              <dd>
                {x.natalHouse}
                {tx("bhavaSuffix")}
              </dd>
              <dt className="text-slate-500">{tx("transit.drishti")}</dt>
              <dd>
                {x.drishti.length === 0
                  ? x.id === "rahu" || x.id === "ketu"
                    ? tx("transit.nodeNoDrishti")
                    : tx("transit.noNatalInAspected")
                  : x.drishti.map((d) => tx("transit.drishtiItem", { d: drishtiLabel(d.type), graha: graha(d.to), orb: d.orb.toFixed(2) })).join("; ")}
              </dd>
              <dt className="text-slate-500">{tx("kaksha")}</dt>
              <dd>
                {x.kaksha.number}/8 · {formatDegree(x.kaksha.start)}–{formatDegree(x.kaksha.end)}
                {tx("transit.lordSep")}
                {KAKSHA_LORD_LABEL(x.kaksha.lord)}
                {x.kaksha.bindu === null
                  ? tx("transit.nodeNoBav")
                  : tx("transit.kakshaBindu", { given: x.kaksha.bindu ? tx("transit.binduGiven") : tx("transit.binduNotGiven"), n: String(x.kaksha.binduCount) })}
              </dd>
            </dl>
            <KbBox kb={kb} empty={tx("kb.emptyTransit")} />
          </section>
        )}
      </div>
      <section className={`${card} p-3`} data-testid="astro-vedic-transit-summary" aria-label={tx("transit.summaryTitle")}>
        <h4 className="text-sm font-semibold text-slate-800">{tx("transit.summaryTitle")}</h4>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{GOCHARA_SUMMARY_NOTE}</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-slate-800">
          {gocharaSummary(t).map((g) => (
            <li key={g.id} className={`rounded-lg px-2 py-1 ${g.slow ? "bg-indigo-50/60" : ""}`} data-gochara-summary={g.id}>
              {g.text}
            </li>
          ))}
        </ul>
      </section>
      <details className="text-xs text-slate-600" data-testid="astro-vedic-transit-terms">
        <summary className="cursor-pointer">{tx("transit.terms")}</summary>
        <dl className="mt-1 grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
          {GOCHARA_TERMS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-slate-700">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </details>
      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer">{tx("transit.natalRef")}</summary>
        <ul className="mt-1 grid gap-x-4 sm:grid-cols-3">
          {t.natal.map((n) => (
            <li key={n.id}>
              {graha(n.id)}: {sign(n.rashi)} {formatDegree(n.longitude % 30)} · {n.house}
              {tx("bhavaSuffix")}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ─── Ashtakavarga ───────────────────────────────────────────────────────────
export function VedicAshtakavargaPanel({ t }: { t: VedicAshtakavargaTechnical }) {
  const { t: tx, sign, lbl } = useExtraText();
  const SIGN_SHORT = SIGN_IDS.map((s) => sign(s).slice(0, 3));
  const [reduced, setReduced] = useState(false);
  const rows = reduced ? t.reducedBav : t.bav;
  const sav = reduced ? t.reducedSav : t.sav;
  const maxSav = Math.max(...sav.bindus, 1);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-ashtakavarga-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-700">
          <strong>{tx("av.title")}</strong>
          {tx("av.headA")}
          {t.sav.total}
          {reduced ? tx("av.reducedTotal", { n: String(t.reducedSav.total) }) : ""}
        </p>
        <div className="flex gap-1" role="tablist" aria-label={tx("av.viewLabel")}>
          {[false, true].map((r) => (
            <button
              key={String(r)}
              type="button"
              role="tab"
              aria-selected={reduced === r}
              onClick={() => setReduced(r)}
              className={`rounded-lg border px-2 py-1 text-xs ${reduced === r ? "border-amber-600 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-600"}`}
            >
              {r ? tx("av.reduced") : tx("av.bhinnaSarva")}
            </button>
          ))}
        </div>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="min-w-full text-center" data-testid="astro-vedic-ashtakavarga-grid">
          <thead>
            <tr>
              <th className={th}>{tx("graha")}</th>
              {SIGN_IDS.map((s, i) => (
                <th key={s} className={`${th} text-center`} title={sign(s)}>
                  {SIGN_GLYPHS[s]} {SIGN_SHORT[i]}
                </th>
              ))}
              <th className={th}>{tx("av.totalShort")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className={r.id === "lagna" ? "text-slate-500" : ""}>
                <td className={`${td} whitespace-nowrap text-left font-medium`}>{lbl(r.id)}</td>
                {r.bindus.map((b, i) => (
                  <td key={i} className={`${td} tabular-nums`}>
                    {b}
                  </td>
                ))}
                <td className={`${td} font-semibold tabular-nums`}>{r.total}</td>
              </tr>
            ))}
            <tr className="bg-amber-50/60" data-testid="astro-vedic-sav-row">
              <td className={`${td} text-left font-semibold`}>{tx("av.sav")}</td>
              {sav.bindus.map((b, i) => (
                <td key={i} className={`${td} font-semibold tabular-nums`}>
                  <span className="inline-block min-w-[1.6rem] rounded" style={{ background: `rgba(217,119,6,${0.08 + 0.32 * (b / maxSav)})` }}>
                    {b}
                  </span>
                </td>
              ))}
              <td className={`${td} font-semibold tabular-nums`}>{sav.total}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">{tx("av.savNote")}</p>
      <div className={`${card} overflow-x-auto`}>
        <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{tx("av.shodhyaTitle")}</h4>
        <table className="min-w-full" data-testid="astro-vedic-shodhya-table">
          <thead>
            <tr>
              <th className={th}>{tx("graha")}</th>
              <th className={th}>{tx("av.rashiPinda")}</th>
              <th className={th}>{tx("av.grahaPinda")}</th>
              <th className={th}>{tx("av.shodhyaPinda")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.shodhyaPinda.map((p) => (
              <tr key={p.id}>
                <td className={`${td} font-medium`}>{lbl(p.id)}</td>
                <td className={`${td} tabular-nums`}>{p.rashiPinda}</td>
                <td className={`${td} tabular-nums`}>{p.grahaPinda}</td>
                <td className={`${td} font-semibold tabular-nums`}>{p.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Shadbala ───────────────────────────────────────────────────────────────
const COMP_LABEL: Record<ShadbalaComponent, string> = {
  sthanaBala: "Sthana",
  digBala: "Dig",
  kalaBala: "Kala",
  chestaBala: "Chesta",
  naisargikaBala: "Naisargika",
  drikBala: "Drik",
};
export function VedicShadbalaPanel({ t, kbLookup }: { t: VedicShadbalaTechnical; kbLookup?: KbLookup | null }) {
  const { t: tx, graha } = useExtraText();
  const [sel, setSel] = useState<VedicGrahaId>(t.planets.find((p) => p.rank === 1)?.id ?? "sun");
  const p = t.planets.find((x) => x.id === sel) ?? t.planets[0];
  const kb = kbLookup ? kbLookup([`${p.strengthRatio >= 1 ? "shadbala_above_min" : "shadbala_below_min"}:${p.id}`]) : null;
  const maxRatio = Math.max(...t.planets.map((x) => x.strengthRatio), 1.2);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-shadbala-panel">
      <p className="text-sm text-slate-700">
        <strong>{tx("sb.title")}</strong>
        {tx("sb.methodNote")}
      </p>
      <div className={`${card} p-3`} data-testid="astro-vedic-shadbala-bars">
        {[...t.planets]
          .sort((a, b) => a.rank - b.rank)
          .map((x) => (
            <button key={x.id} type="button" onClick={() => setSel(x.id)} className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs ${sel === x.id ? "bg-amber-50" : ""}`}>
              <span className="w-28 shrink-0 truncate font-medium">
                {x.rank}. {graha(x.id)}
              </span>
              <span className="relative h-3 flex-1 overflow-hidden rounded bg-slate-100">
                <span className={`absolute inset-y-0 left-0 ${x.strengthRatio >= 1 ? "bg-emerald-400" : "bg-rose-300"}`} style={{ width: `${(Math.max(0, x.strengthRatio) / maxRatio) * 100}%` }} />
                <span className="absolute inset-y-0 w-0.5 bg-slate-700" style={{ left: `${(1 / maxRatio) * 100}%` }} aria-hidden />
              </span>
              <span className="w-12 shrink-0 text-right tabular-nums">{x.strengthRatio.toFixed(2)}</span>
            </button>
          ))}
      </div>
      {/* 5.1C: 9 sütunlu Shadbala tablosu yan sütuna sığmaz → tablo tam genişlik, ayrıntı altında. */}
      <div className="grid min-w-0 gap-3">
        <div className={`${card} overflow-x-auto`}>
          <table className="min-w-full" data-testid="astro-vedic-shadbala-table">
            <thead>
              <tr>
                <th className={th}>{tx("graha")}</th>
                {SHADBALA_COMPONENTS.map((c) => (
                  <th key={c} className={th}>
                    {COMP_LABEL[c]}
                  </th>
                ))}
                <th className={th}>{tx("sb.rupa")}</th>
                <th className={th}>{tx("sb.minimum")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {t.planets.map((x) => (
                <tr key={x.id} className={`cursor-pointer ${sel === x.id ? "bg-amber-50" : ""}`} onClick={() => setSel(x.id)} data-shadbala={x.id}>
                  <td className={`${td} font-medium`}>{graha(x.id)}</td>
                  {SHADBALA_COMPONENTS.map((c) => (
                    <td key={c} className={`${td} tabular-nums text-xs`}>
                      {x[c].toFixed(2)}
                    </td>
                  ))}
                  <td className={`${td} font-semibold tabular-nums`}>{x.totalRupas.toFixed(2)}</td>
                  <td className={`${td} tabular-nums`}>{x.minRequired}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label={tx("sb.selectedLabel")}>
          <h4 className="font-semibold text-amber-900">
            {graha(p.id)}
            {tx("sb.rankSep")}
            {p.rank}/7
          </h4>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-slate-500">{tx("sb.total")}</dt>
            <dd>
              {p.totalVirupas.toFixed(2)}
              {tx("sb.virupaEq")}
              {p.totalRupas.toFixed(2)}
              {tx("sb.rupaSuffix")}
            </dd>
            <dt className="text-slate-500">{tx("sb.ratio")}</dt>
            <dd>
              {p.strengthRatio.toFixed(2)} ({p.strengthRatio >= 1 ? tx("sb.aboveMin") : tx("sb.belowMin")})
            </dd>
            <dt className="text-slate-500">{tx("sb.ishtaKashta")}</dt>
            <dd>
              {p.ishtaPhala.toFixed(2)} / {p.kashtaPhala.toFixed(2)}
            </dd>
          </dl>
          <KbBox kb={kb} empty={tx("kb.emptyShadbala")} />
        </section>
      </div>
    </div>
  );
}

// ─── Janma Panchanga ────────────────────────────────────────────────────────
function Limb({ title, name, sub, percent, testId }: { title: string; name: string; sub: string; percent: number | null; testId: string }) {
  const { t: tx, locale } = useExtraText();
  return (
    <div className={`${card} p-3`} data-testid={testId}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="text-base font-semibold text-slate-900">{name}</div>
      <div className="text-xs text-slate-600">{sub}</div>
      {percent !== null && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-100" aria-hidden>
            <div className="h-full bg-amber-400" style={{ width: `${Math.round(percent)}%` }} />
          </div>
          <span className="text-[11px] tabular-nums text-slate-600">
            {locale === "tr" ? "%" : null}
            {Math.round(percent)}
            {tx("limb.passed")}
          </span>
        </div>
      )}
    </div>
  );
}
export function VedicPanchangaPanel({ t, kbLookup }: { t: VedicPanchangaTechnical; kbLookup?: KbLookup | null }) {
  const { t: tx, graha, sign } = useExtraText();
  const { locale } = useExtraText();
  const elementTr = (v: string) => {
    const k = ELEMENT_KEY[v.trim().toLowerCase()] ?? ELEMENT_KEY_TR[v.trim().toLocaleLowerCase("tr-TR")];
    return k ? tx(`element.${k}`) : v;
  };
  // ATLAS-B (I18N-F1-R5): sağlayıcının yerelleştirilmiş nakshatra devata / sembol metni teknik katmanda SAKLI kalır (değişmez).
  // TR ekran saklı metni aynen gösterir (bayt-eşit); diğer dillerde nakshatra kimliğinden klasik devata / sembol (katalog).
  const deityOf = (v: string) => (locale === "tr" ? v : tx(`nakshatraDeity.${t.nakshatra.id}`));
  const symbolOf = (v: string) => (locale === "tr" ? v : tx(`nakshatraSymbol.${t.nakshatra.id}`));
  const kb = kbLookup ? kbLookup([`panchanga_tithi:${t.tithi.number}`, `panchanga_nitya_yoga:${t.nityaYoga.number}`, `panchanga_karana:${t.karana.id}`]) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-panchanga-panel">
      <p className="text-sm text-slate-700">
        <strong>{tx("pa.title")}</strong>
        {tx("pa.headSun")}
        {formatDegree(t.sunLongitude % 30)} {sign(SIGN_IDS[Math.floor(t.sunLongitude / 30)])}
        {tx("pa.headMoon")}{" "}
        {formatDegree(t.moonLongitude % 30)} {sign(SIGN_IDS[Math.floor(t.moonLongitude / 30)])}
      </p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Limb
          testId="astro-vedic-panchanga-tithi"
          title={tx("pa.tithi")}
          name={`${t.tithi.number}. ${TITHI_LABELS[t.tithi.number - 1]}`}
          sub={[
            t.tithi.paksha === "shukla" ? tx("pa.shukla") : tx("pa.krishna"),
            t.tithi.deity ? tx("limb.deity", { v: t.tithi.deity }) : "",
            t.tithi.rulingPlanet ? tx("limb.lord", { v: graha(t.tithi.rulingPlanet) }) : "",
            t.tithi.element ? tx("limb.element", { v: elementTr(t.tithi.element) }) : "",
          ]
            .filter(Boolean)
            .join(" · ")}
          percent={t.tithi.percent}
        />
        <Limb
          testId="astro-vedic-panchanga-nakshatra"
          title={tx("pa.nakshatra")}
          name={`${t.nakshatra.index + 1}. ${NAKSHATRA_LABELS[t.nakshatra.id]}`}
          sub={[tx("limb.pada", { n: String(t.nakshatra.pada) }), tx("limb.lord", { v: graha(t.nakshatra.lord) }), t.nakshatra.deity ? tx("limb.deity", { v: deityOf(t.nakshatra.deity) }) : "", t.nakshatra.symbol ? tx("limb.symbol", { v: symbolOf(t.nakshatra.symbol) }) : ""].filter(Boolean).join(" · ")}
          percent={null}
        />
        <Limb testId="astro-vedic-panchanga-yoga" title={tx("pa.nityaYoga")} name={`${t.nityaYoga.number}. ${NITYA_YOGA_LABELS[t.nityaYoga.number - 1]}`} sub={tx("pa.nityaSub")} percent={t.nityaYoga.percent} />
        <Limb testId="astro-vedic-panchanga-karana" title={tx("pa.karana")} name={KARANA_LABELS[t.karana.id]} sub={t.karana.movable ? tx("pa.karanaMovable") : tx("pa.karanaFixed")} percent={t.karana.percent} />
      </div>
      {t.detail && <PanchangaDetailView d={t.detail} />}
      {(t as VedicPanchangaWithHours).hours && <PanchangaHoursView h={(t as VedicPanchangaWithHours).hours!} />}
      <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label={tx("pa.kbLabel")}>
        <KbBox kb={kb} empty={tx("kb.emptyPanchanga")} />
      </section>
    </div>
  );
}

/** Sağlayıcı element adı (küçük harf) → katalog anahtarı (atlas.vedicExtra.element.*; bilinmeyen değer aynen gösterilir). */
const ELEMENT_KEY: Record<string, "fire" | "earth" | "air" | "water" | "ether"> = { fire: "fire", earth: "earth", air: "air", water: "water", ether: "ether", akasha: "ether", space: "ether" };
/**
 * ATLAS-B (I18N-F1-R5): sağlayıcının TR yanıtındaki element adı (gerçek kayıt: "Toprak") → aynı katalog anahtarı. TR ekranda
 * katalog TR değeri sağlayıcı metniyle aynı (Ateş / Toprak / Hava / Su) → TR görünüm bayt-eşit; EN ekranda İngilizce.
 * Akasha'nın TR yanıt biçimi doğrulanmadığı için eklenmedi (bilinmeyen değer aynen gösterilir).
 */
const ELEMENT_KEY_TR: Record<string, "fire" | "earth" | "air" | "water"> = { "ateş": "fire", toprak: "earth", hava: "air", su: "water" };
const VARA_IDS = new Set(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]);
const hm = (s: string | null) => (s ? s.slice(11, 16) : "—");
const dmy = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
const winTxt = (w: { start: string; end: string } | null, none: string) => (w ? `${hm(w.start)} – ${w.end.slice(0, 10) === w.start.slice(0, 10) ? hm(w.end) : `${dmy(w.end)} ${hm(w.end)}`}` : none);

/** 2026-10-21: Ayrıntılı Panchanga (seçilen gün + yer) — gün doğumu/batımı, vara, muhurta pencereleri. Hesap YOK; yalnız düzen. */
function PanchangaDetailView({ d }: { d: NonNullable<VedicPanchangaTechnical["detail"]> }) {
  const { t: tx, graha } = useExtraText();
  const none = tx("pd.noneToday");
  const day18 = tx("pd.rule.dayEighth");
  const ghati = tx("pd.rule.ghati");
  const off = d.place.utcOffsetHours;
  const offLabel = `UTC${off >= 0 ? "+" : "−"}${String(Math.floor(Math.abs(off))).padStart(2, "0")}:${String(Math.round((Math.abs(off) % 1) * 60)).padStart(2, "0")}`;
  const rows: [string, string, string][] = [
    ["Rahu Kaal", winTxt(d.rahuKaal, none), day18],
    ["Yamaganda", winTxt(d.yamaganda, none), day18],
    ["Gulika", winTxt(d.gulika, none), day18],
    ["Abhijit muhurta", winTxt(d.abhijit, none), tx("pd.rule.abhijit")],
    ["Vijaya muhurta", winTxt(d.vijaya, none), tx("pd.rule.vijaya")],
    ["Brahma muhurta", winTxt(d.brahma, none), tx("pd.rule.brahma")],
    ...d.durMuhurta.map((w): [string, string, string] => ["Dur muhurta", winTxt(w, none), tx("pd.rule.weekday")]),
    ...d.varjyam.map((w): [string, string, string] => ["Varjyam", winTxt(w, none), ghati]),
    ...d.amritKalam.map((w): [string, string, string] => ["Amrit Kalam", winTxt(w, none), ghati]),
  ];
  return (
    <section className={`${card} p-3`} aria-label={tx("pd.title")} data-testid="astro-vedic-panchanga-detail">
      <h4 className="text-sm font-semibold text-slate-900">
        {tx("pd.titleSep")}
        {dmy(d.date)}
      </h4>
      <p className="text-xs text-slate-600">
        {d.place.label ? `${d.place.label} · ` : ""}
        {d.place.latitude.toFixed(4)}°, {d.place.longitude.toFixed(4)}
        {tx("pd.localHours")}
        {offLabel}
        {tx("pd.vara")}
        <strong>{VARA_IDS.has(d.vara.id) ? tx(`vara.${d.vara.id as "sunday"}`) : undefined}</strong>
        {tx("pd.lordOpen")}
        {graha(d.vara.lord)})
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500">{tx("pd.sunRiseSet")}</dt>
        <dd data-testid="astro-panchanga-sun">
          {hm(d.sunrise)} / {hm(d.sunset)}
        </dd>
        <dt className="text-slate-500">{tx("pd.moonRiseSet")}</dt>
        <dd>
          {d.moonrise ? (d.moonrise.slice(0, 10) === d.date ? hm(d.moonrise) : `${dmy(d.moonrise)} ${hm(d.moonrise)}`) : none} / {d.moonset ? (d.moonset.slice(0, 10) === d.date ? hm(d.moonset) : `${dmy(d.moonset)} ${hm(d.moonset)}`) : none}
        </dd>
        {d.atSunrise && (
          <>
            <dt className="text-slate-500">{tx("pd.atSunrise")}</dt>
            <dd>
              {tx("pd.tithiPrefix")}
              {d.atSunrise.tithi}. {TITHI_LABELS[d.atSunrise.tithi - 1]}
              {tx("pd.nakPrefix")}
              {d.atSunrise.nakshatra}. ({d.atSunrise.nakshatraPada}
              {tx("pd.padaNitya")}
              {d.atSunrise.nityaYoga}. {NITYA_YOGA_LABELS[d.atSunrise.nityaYoga - 1]}
            </dd>
          </>
        )}
      </dl>
      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full" data-testid="astro-panchanga-windows">
          <thead>
            <tr>
              <th className={th}>{tx("pd.window")}</th>
              <th className={th}>{tx("pd.time")}</th>
              <th className={th}>{tx("pd.rule.title")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(([k, v, r], i) => (
              <tr key={`${k}-${i}`}>
                <td className={`${td} whitespace-nowrap font-medium`}>{k}</td>
                <td className={`${td} whitespace-nowrap tabular-nums`}>{v}</td>
                <td className={`${td} text-xs text-slate-600`}>{r}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{tx("pd.hoursSeparate")}</p>
    </section>
  );
}
