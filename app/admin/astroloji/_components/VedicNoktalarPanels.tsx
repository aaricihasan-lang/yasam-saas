"use client";

/**
 * 22.10.2026 — Vedik noktalar TEKNİK görünümleri: Upagrahalar (vedic.upagraha) ve Graha Asta / Udaya (vedic.heliacal). Yalnız kanonik
 * teknik katman (sağlayıcı yanıtının doğrulanmış alanları) gösterilir; hesap YAPILMAZ (tablo yalnız düzenlemedir). İki uçta da sağlayıcı
 * yorum metni yoktur. Canlı sonuç ve kayıtlı analiz (arşiv) aynı bileşeni kullanır. 390 / 768 genişlikte tablolar yatay kaydırılır.
 */

import { useLocale, useTranslations } from "next-intl";
import { dmyText } from "../_lib/atlasDate";
import { SIGN_GLYPHS, formatDegree } from "@/lib/astrology/labels/tr";
import { NAKSHATRA_LABELS } from "@/lib/astrology/topics/vedic";
import {
  GULIKA_PANCHANGA_NOTE,
  HELIACAL_EVENT_LABELS,
  HELIACAL_HORIZON_LABELS,
  HELIACAL_METHOD_NOTE,
  HELIACAL_SCOPE_NOTE,
  HELIACAL_VS_COMBUSTION_NOTE,
  upagrahaBasis,
  UPAGRAHA_GROUP_LABELS,
  UPAGRAHA_HOUSE_NOTE,
  UPAGRAHA_NAMES,
  UPAGRAHA_NOT_BODY_NOTE,
  UPAGRAHA_PARTIAL_LABEL,
  UPAGRAHA_PARTIAL_NOTE,
  upagrahaSchoolNote,
  UPAGRAHA_LEGACY_ORDER_NOTE,
  isLegacyUpagrahaOrder,
  upagrahaSystemsNote,
  fmtDayTr,
  heliacalEventTimeText,
  heliacalPlaceText,
  type VedicHeliacalEvent,
  type VedicHeliacalTechnical,
  type VedicUpagrahaPoint,
  type VedicUpagrahaTechnical,
} from "@/lib/astrology/model/vedicNoktalar";
import type { KbLookup } from "./VedicPanels";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";
const card = "min-w-0 rounded-xl border border-slate-200 bg-white";
/** Ayanamsa kimlikleri (gösterim adı ortak terim kataloğunda: terms.ayanamsa.*; bilinmeyen kimlik aynen). */
const AYANAMSA_IDS = new Set(["lahiri", "raman", "kp-newcomb", "kp-old"]);
const dec = (n: number, d = 2) => n.toFixed(d).replace(".", ",");

/** I18N ATLAS-V: panel çevirmenleri. Graha / burç / ayanamsa adları ortak terim kataloğundan (TR değerleri lib etiketleriyle birebir). */
function useNoktaText() {
  const t = useTranslations("atlas.vedicMatch");
  const tt = useTranslations("terms");
  const tr = useLocale() !== "en";
  const sign = (id: string) => tt(`zodiac.${id as "aries"}`);
  const graha = (id: string) => tt(`graha.${id as "sun"}`);
  const ay = (id: string) => (AYANAMSA_IDS.has(id) ? tt(`ayanamsa.${id as "lahiri"}`) : id);
  const num = (n: number, d = 2) => (tr ? dec(n, d) : n.toFixed(d));
  return { t, tt, tr, sign, graha, ay, num };
}

function KbBox({ keys, kbLookup, empty }: { keys: string[]; kbLookup?: KbLookup | null; empty: string }) {
  const { t: tx } = useNoktaText();
  const kb = kbLookup ? kbLookup(keys) : null;
  return (
    <div className={`${card} px-3 py-2`} data-testid="astro-nokta-kb">
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

function UpagrahaTable({ title, rows, testId, showHouse, tech }: { title: string; rows: VedicUpagrahaPoint[]; testId: string; showHouse: boolean; tech: VedicUpagrahaTechnical }) {
  const { t: tx, sign, num } = useNoktaText();
  return (
    <section className={`${card} overflow-x-auto p-3`} data-testid={testId}>
      <h4 className="mb-2 text-sm font-semibold text-slate-700">{title}</h4>
      <table className="w-full min-w-[34rem] border-collapse">
        <thead>
          <tr className="border-b border-slate-200">
            <th className={th}>{tx("upa.point")}</th>
            <th className={th}>{tx("upa.signDegree")}</th>
            <th className={th}>{tx("upa.longitude")}</th>
            <th className={th}>{tx("upa.nakshatraPada")}</th>
            {showHouse && <th className={th}>{tx("upa.houseFromLagna")}</th>}
            <th className={th}>{tx("upa.basisCol")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-slate-100" data-upagraha={p.id}>
              <td className={`${td} font-medium`}>{UPAGRAHA_NAMES[p.id]}</td>
              <td className={td}>
                <span className="mr-1">{SIGN_GLYPHS[p.rashi]}</span>
                {sign(p.rashi)} {formatDegree(p.degreeInRashi)}
              </td>
              <td className={`${td} tabular-nums`}>{num(p.longitude)}°</td>
              <td className={td}>
                {NAKSHATRA_LABELS[p.nakshatra] ?? p.nakshatra} · {p.pada}
                {tx("padaSuffix")}
              </td>
              {showHouse && <td className={td}>{typeof p.house === "number" ? tx("upa.houseN", { n: String(p.house) }) : "—"}</td>}
              <td className="px-2 py-1.5 text-xs text-slate-600">{upagrahaBasis(tech, p.id)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function VedicUpagrahaPanel({ t, kbLookup }: { t: VedicUpagrahaTechnical; kbLookup?: KbLookup | null }) {
  const { t: tx, sign, ay, num } = useNoktaText();
  const d1 = t.d1 ?? null;
  const showHouse = !!d1;
  const keys = [...t.timeBased, ...t.sunBased].flatMap((p) => [`upagraha_in_rashi:${p.id}:${p.rashi}`, ...(typeof p.house === "number" ? [`upagraha_in_bhava:${p.id}:${p.house}`] : [])]);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-upagraha-panel">
      <section className={`${card} p-3`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-700">
            {tx("upa.title")}
            {t.partial && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900" data-testid="astro-upagraha-partial-badge">
                {UPAGRAHA_PARTIAL_LABEL}
              </span>
            )}
          </h4>
          <span className="text-xs text-slate-500">
            {tx("sidereal")}
            {ay(t.frame.ayanamsa)} ({formatDegree(t.frame.ayanamsaDegrees)})
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600" data-testid="astro-upagraha-not-body">
          {UPAGRAHA_NOT_BODY_NOTE}
        </p>
        <p className="mt-1 text-xs text-slate-600" data-testid="astro-upagraha-d1">
          {d1 ? tx("upa.d1Line", { lagna: sign(d1.lagnaRashi), implied: num(t.impliedSun), sun: num(d1.sunLongitude), diff: num(d1.sunDiff, 3) }) : tx("upa.d1Missing")}
        </p>
        {d1 && !d1.sunConsistent && (
          <p className="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900" data-testid="astro-upagraha-sun-warn">
            {tx("upa.sunWarn")}
          </p>
        )}
      </section>
      {t.partial ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="astro-upagraha-partial">
          {UPAGRAHA_PARTIAL_NOTE}
        </p>
      ) : (
        <>
          {isLegacyUpagrahaOrder(t) && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="astro-upagraha-legacy-order">
              {UPAGRAHA_LEGACY_ORDER_NOTE}
            </p>
          )}
          <UpagrahaTable title={UPAGRAHA_GROUP_LABELS.time} rows={t.timeBased} testId="astro-upagraha-time" showHouse={showHouse} tech={t} />
        </>
      )}
      <UpagrahaTable title={UPAGRAHA_GROUP_LABELS.sun} rows={t.sunBased} testId="astro-upagraha-sun" showHouse={showHouse} tech={t} />
      <KbBox keys={keys} kbLookup={kbLookup} empty={tx("upa.kbEmpty")} />
      <div className="flex flex-col gap-1 text-xs leading-relaxed text-slate-500" data-testid="astro-upagraha-method">
        <p>{upagrahaSystemsNote(t)}</p>
        <p>{upagrahaSchoolNote(t)}</p>
        <p>{GULIKA_PANCHANGA_NOTE}</p>
        <p>{UPAGRAHA_HOUSE_NOTE}</p>
      </div>
    </div>
  );
}

function EventCell({ ev, place }: { ev: VedicHeliacalEvent | null; place: VedicHeliacalTechnical["place"] }) {
  const { t: tx, num } = useNoktaText();
  if (!ev) return <span className="text-xs text-slate-500">{tx("heli.noEvent")}</span>;
  const tt = heliacalEventTimeText(ev, place);
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-medium">{HELIACAL_EVENT_LABELS[ev.type]}</span>
      <span>{tt.local}</span>
      <span className="text-xs text-slate-500">
        {tt.utc} · {ev.horizon === "east" ? tx("heli.east") : tx("heli.west")}
        {tx("heli.horizonLimit")}
        {num(ev.timeDegrees)}
        {tx("heli.limit")}
        {ev.kalamsa}°
      </span>
    </span>
  );
}

export function VedicHeliacalPanel({ t, kbLookup }: { t: VedicHeliacalTechnical; kbLookup?: KbLookup | null }) {
  const { t: tx, graha, num } = useNoktaText();
  const loc = useLocale();
  const keys = t.grahas.map((g) => `graha_heliacal:${g.id}:${g.visible ? "visible" : "asta"}`);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-heliacal-panel">
      <section className={`${card} p-3`}>
        <h4 className="text-sm font-semibold text-slate-700">
          {tx("heli.titleA")}
          {dmyText(fmtDayTr(t.date), loc)}
        </h4>
        <p className="mt-1 text-xs text-slate-600" data-testid="astro-heliacal-place">
          {tx("heli.place")}
          {heliacalPlaceText(t.place)}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {tx("heli.inAsta")}
          {t.grahas.filter((g) => !g.visible).map((g) => graha(g.id)).join(", ") || tx("none")}
          {t.omitted.length > 0 && tx("heli.omitted", { list: t.omitted.map((g) => graha(g)).join(", ") })}
        </p>
      </section>
      <section className={`${card} overflow-x-auto p-3`} data-testid="astro-heliacal-table">
        <table className="w-full min-w-[46rem] border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className={th}>{tx("heli.graha")}</th>
              <th className={th}>{tx("heli.status")}</th>
              <th className={th}>{tx("heli.horizon")}</th>
              <th className={th}>{tx("heli.timeDegree")}</th>
              <th className={th}>{tx("heli.separation")}</th>
              <th className={th}>{tx("heli.lastEvent")}</th>
              <th className={th}>{tx("heli.nextEvent")}</th>
            </tr>
          </thead>
          <tbody>
            {t.grahas.map((g) => (
              <tr key={g.id} className="border-b border-slate-100 align-top" data-heliacal={g.id}>
                <td className={`${td} font-medium`}>
                  {graha(g.id)}
                  {g.retrograde && <span className="ml-1 text-xs text-slate-500">{tx("heli.retro")}</span>}
                </td>
                <td className={td}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${g.visible ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`} data-heliacal-state={g.visible ? "visible" : "asta"}>
                    {g.visible ? tx("heli.visible") : tx("heli.asta")}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-xs text-slate-700">{HELIACAL_HORIZON_LABELS[g.horizon]}</td>
                <td className={`${td} tabular-nums`}>
                  {num(g.timeDegrees)}° / {g.kalamsa}°
                </td>
                <td className={`${td} tabular-nums`}>{num(g.longitudeSeparation)}°</td>
                <td className={td}>
                  <EventCell ev={g.lastEvent} place={t.place} />
                </td>
                <td className={td}>
                  <EventCell ev={g.nextEvent} place={t.place} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <KbBox keys={keys} kbLookup={kbLookup} empty={tx("heli.kbEmpty")} />
      <div className="flex flex-col gap-1 text-xs leading-relaxed text-slate-500" data-testid="astro-heliacal-method">
        <p>{HELIACAL_METHOD_NOTE}</p>
        <p>{HELIACAL_VS_COMBUSTION_NOTE}</p>
        <p>{HELIACAL_SCOPE_NOTE}</p>
      </div>
    </div>
  );
}
