"use client";

/**
 * 22.10.2026 — Vedik noktalar TEKNİK görünümleri: Upagrahalar (vedic.upagraha) ve Graha Asta / Udaya (vedic.heliacal). Yalnız kanonik
 * teknik katman (sağlayıcı yanıtının doğrulanmış alanları) gösterilir; hesap YAPILMAZ (tablo yalnız düzenlemedir). İki uçta da sağlayıcı
 * yorum metni yoktur. Canlı sonuç ve kayıtlı analiz (arşiv) aynı bileşeni kullanır. 390 / 768 genişlikte tablolar yatay kaydırılır.
 */

import { SIGN_GLYPHS, SIGN_LABELS, formatDegree } from "@/lib/astrology/labels/tr";
import { GRAHA_LABELS, NAKSHATRA_LABELS } from "@/lib/astrology/topics/vedic";
import {
  GULIKA_PANCHANGA_NOTE,
  HELIACAL_EVENT_LABELS,
  HELIACAL_HORIZON_LABELS,
  HELIACAL_METHOD_NOTE,
  HELIACAL_SCOPE_NOTE,
  HELIACAL_VS_COMBUSTION_NOTE,
  UPAGRAHA_BASIS,
  UPAGRAHA_GROUP_LABELS,
  UPAGRAHA_HOUSE_NOTE,
  UPAGRAHA_NAMES,
  UPAGRAHA_NOT_BODY_NOTE,
  UPAGRAHA_PARTIAL_LABEL,
  UPAGRAHA_PARTIAL_NOTE,
  UPAGRAHA_SCHOOL_NOTE,
  UPAGRAHA_SYSTEMS_NOTE,
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
const AY: Record<string, string> = { lahiri: "Lahiri (Chitrapaksha)", raman: "B.V. Raman", "kp-newcomb": "KP-Newcomb", "kp-old": "KP (eski tablo)" };
const dec = (n: number, d = 2) => n.toFixed(d).replace(".", ",");

function KbBox({ keys, kbLookup, empty }: { keys: string[]; kbLookup?: KbLookup | null; empty: string }) {
  const kb = kbLookup ? kbLookup(keys) : null;
  return (
    <div className={`${card} px-3 py-2`} data-testid="astro-nokta-kb">
      <div className="text-xs font-semibold text-indigo-900">Bilgi Bankam</div>
      {kb === null ? (
        <p className="text-xs text-slate-500">Bilgi Bankası eşleşmeleri çalışma alanı yüklenince görünür.</p>
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

function UpagrahaTable({ title, rows, testId, showHouse }: { title: string; rows: VedicUpagrahaPoint[]; testId: string; showHouse: boolean }) {
  return (
    <section className={`${card} overflow-x-auto p-3`} data-testid={testId}>
      <h4 className="mb-2 text-sm font-semibold text-slate-700">{title}</h4>
      <table className="w-full min-w-[34rem] border-collapse">
        <thead>
          <tr className="border-b border-slate-200">
            <th className={th}>Nokta</th>
            <th className={th}>Burç · derece</th>
            <th className={th}>Boylam</th>
            <th className={th}>Nakshatra · pada</th>
            {showHouse && <th className={th}>Ev (Lagna&apos;dan)</th>}
            <th className={th}>Dayanak</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-slate-100" data-upagraha={p.id}>
              <td className={`${td} font-medium`}>{UPAGRAHA_NAMES[p.id]}</td>
              <td className={td}>
                <span className="mr-1">{SIGN_GLYPHS[p.rashi]}</span>
                {SIGN_LABELS[p.rashi]} {formatDegree(p.degreeInRashi)}
              </td>
              <td className={`${td} tabular-nums`}>{dec(p.longitude)}°</td>
              <td className={td}>
                {NAKSHATRA_LABELS[p.nakshatra] ?? p.nakshatra} · {p.pada}. pada
              </td>
              {showHouse && <td className={td}>{typeof p.house === "number" ? `${p.house}. ev` : "—"}</td>}
              <td className="px-2 py-1.5 text-xs text-slate-600">{UPAGRAHA_BASIS[p.id]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function VedicUpagrahaPanel({ t, kbLookup }: { t: VedicUpagrahaTechnical; kbLookup?: KbLookup | null }) {
  const d1 = t.d1 ?? null;
  const showHouse = !!d1;
  const keys = [...t.timeBased, ...t.sunBased].flatMap((p) => [`upagraha_in_rashi:${p.id}:${p.rashi}`, ...(typeof p.house === "number" ? [`upagraha_in_bhava:${p.id}:${p.house}`] : [])]);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-upagraha-panel">
      <section className={`${card} p-3`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-700">
            Upagrahalar — hesaplanan duyarlı noktalar
            {t.partial && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900" data-testid="astro-upagraha-partial-badge">
                {UPAGRAHA_PARTIAL_LABEL}
              </span>
            )}
          </h4>
          <span className="text-xs text-slate-500">
            sidereal · {AY[t.frame.ayanamsa] ?? t.frame.ayanamsa} ({formatDegree(t.frame.ayanamsaDegrees)})
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600" data-testid="astro-upagraha-not-body">
          {UPAGRAHA_NOT_BODY_NOTE}
        </p>
        <p className="mt-1 text-xs text-slate-600" data-testid="astro-upagraha-d1">
          {d1
            ? `Lagna (Vedik D1 kaydından): ${SIGN_LABELS[d1.lagnaRashi]} · Güneş türevli zincirin Güneş'i ${dec(t.impliedSun)}°, D1 Güneş'i ${dec(d1.sunLongitude)}° (fark ${dec(d1.sunDiff, 3)}°)`
            : "Vedik D1 kaydı bu ayanamsa ile hesaplanmamış; ev sütunu ve D1 Güneş karşılaştırması gösterilmiyor (yeni istek yapılmadı)."}
        </p>
        {d1 && !d1.sunConsistent && (
          <p className="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900" data-testid="astro-upagraha-sun-warn">
            Uyarı: Güneş türevli noktaların dayandığı Güneş boylamı Vedik D1 kaydındaki Güneş boylamından tolerans üstünde farklı. Değerler düzeltilmeden gösterilir; iki kaydın ayanamsa ve doğum verisini kontrol edin.
          </p>
        )}
      </section>
      {t.partial ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="astro-upagraha-partial">
          {UPAGRAHA_PARTIAL_NOTE}
        </p>
      ) : (
        <UpagrahaTable title={UPAGRAHA_GROUP_LABELS.time} rows={t.timeBased} testId="astro-upagraha-time" showHouse={showHouse} />
      )}
      <UpagrahaTable title={UPAGRAHA_GROUP_LABELS.sun} rows={t.sunBased} testId="astro-upagraha-sun" showHouse={showHouse} />
      <KbBox keys={keys} kbLookup={kbLookup} empty="Bu upagraha yerleşimleri için Bilgi Bankası kaydınız yok." />
      <div className="flex flex-col gap-1 text-xs leading-relaxed text-slate-500" data-testid="astro-upagraha-method">
        <p>{UPAGRAHA_SYSTEMS_NOTE}</p>
        <p>{UPAGRAHA_SCHOOL_NOTE}</p>
        <p>{GULIKA_PANCHANGA_NOTE}</p>
        <p>{UPAGRAHA_HOUSE_NOTE}</p>
      </div>
    </div>
  );
}

function EventCell({ ev, place }: { ev: VedicHeliacalEvent | null; place: VedicHeliacalTechnical["place"] }) {
  if (!ev) return <span className="text-xs text-slate-500">arama penceresinde yok</span>;
  const tt = heliacalEventTimeText(ev, place);
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-medium">{HELIACAL_EVENT_LABELS[ev.type]}</span>
      <span>{tt.local}</span>
      <span className="text-xs text-slate-500">
        {tt.utc} · {ev.horizon === "east" ? "doğu" : "batı"} ufku · {dec(ev.timeDegrees)}° / sınır {ev.kalamsa}°
      </span>
    </span>
  );
}

export function VedicHeliacalPanel({ t, kbLookup }: { t: VedicHeliacalTechnical; kbLookup?: KbLookup | null }) {
  const keys = t.grahas.map((g) => `graha_heliacal:${g.id}:${g.visible ? "visible" : "asta"}`);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-heliacal-panel">
      <section className={`${card} p-3`}>
        <h4 className="text-sm font-semibold text-slate-700">Graha Asta / Udaya — {fmtDayTr(t.date)}</h4>
        <p className="mt-1 text-xs text-slate-600" data-testid="astro-heliacal-place">
          Gözlem yeri: {heliacalPlaceText(t.place)}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Astada: {t.grahas.filter((g) => !g.visible).map((g) => GRAHA_LABELS[g.id]).join(", ") || "yok"}
          {t.omitted.length > 0 && ` · Bu gün bu enlemde ufuk geçişi olmayan: ${t.omitted.map((g) => GRAHA_LABELS[g]).join(", ")}`}
        </p>
      </section>
      <section className={`${card} overflow-x-auto p-3`} data-testid="astro-heliacal-table">
        <table className="w-full min-w-[46rem] border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className={th}>Graha</th>
              <th className={th}>Durum</th>
              <th className={th}>Ufuk</th>
              <th className={th}>Zaman derecesi / sınır</th>
              <th className={th}>Boylam farkı</th>
              <th className={th}>Son olay</th>
              <th className={th}>Sonraki olay</th>
            </tr>
          </thead>
          <tbody>
            {t.grahas.map((g) => (
              <tr key={g.id} className="border-b border-slate-100 align-top" data-heliacal={g.id}>
                <td className={`${td} font-medium`}>
                  {GRAHA_LABELS[g.id]}
                  {g.retrograde && <span className="ml-1 text-xs text-slate-500">(geri)</span>}
                </td>
                <td className={td}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${g.visible ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`} data-heliacal-state={g.visible ? "visible" : "asta"}>
                    {g.visible ? "Görünür" : "Astada"}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-xs text-slate-700">{HELIACAL_HORIZON_LABELS[g.horizon]}</td>
                <td className={`${td} tabular-nums`}>
                  {dec(g.timeDegrees)}° / {g.kalamsa}°
                </td>
                <td className={`${td} tabular-nums`}>{dec(g.longitudeSeparation)}°</td>
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
      <KbBox keys={keys} kbLookup={kbLookup} empty="Bu heliakal durumlar için Bilgi Bankası kaydınız yok." />
      <div className="flex flex-col gap-1 text-xs leading-relaxed text-slate-500" data-testid="astro-heliacal-method">
        <p>{HELIACAL_METHOD_NOTE}</p>
        <p>{HELIACAL_VS_COMBUSTION_NOTE}</p>
        <p>{HELIACAL_SCOPE_NOTE}</p>
      </div>
    </div>
  );
}
