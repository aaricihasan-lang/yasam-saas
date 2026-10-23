"use client";

/**
 * 2026-10-22 — Vedik aylık zamanlama görünümü (`vedic.monthly`). Değerler sağlayıcıdan gelir; burada hesap YOK — yalnız kronolojik
 * zaman çizelgesi, gezegen / tür / majör filtresi, aylık özet sayımı ve saat dilimi gösterimi (olay başına ofset; istek açmaz).
 * Yöntem uyarıları en üstte: astronomik açı ≠ graha drishti; deklinasyon ayrı alan; pencere UTC ayı. Uzun liste parça parça açılır.
 */

import { useMemo, useState } from "react";
import {
  ASPECT_VS_DRISHTI_TEXT,
  ASPECT_ZODIAC_TEXT,
  DECLINATION_TEXT,
  DECLINATION_TYPE_LABELS,
  MONTHLY_GRAHA_TR,
  MONTHLY_KIND_LABELS,
  NATAL_DECLINATION_TEXT,
  PARALLELS_SAMPLING_TEXT,
  STATION_TEXT,
  VEDIC_MONTHLY_METHOD_TEXT,
  VEDIC_MONTHLY_SECTION_LABELS,
  VEDIC_MONTHLY_WINDOW_TEXT,
  filterTimeline,
  fmtDeclination,
  monthlySignTr,
  monthlySummary,
  monthlyTimeline,
  type MonthlyTimelineKind,
  type VedicMonthlyTechnical,
} from "@/lib/astrology/model/vedicMonthly";
import { VEDIC_GRAHAS, type VedicGrahaId } from "@/lib/astrology/model/vedic";
import { formatInZone } from "@/lib/astrology/transitDetail";
import type { KbLookup } from "./VedicPanels";

const card = "min-w-0 rounded-xl border border-slate-200 bg-white";
const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const TZ = ["Europe/Istanbul", "UTC", "Europe/London", "Europe/Berlin", "America/New_York", "Asia/Dubai", "Asia/Kolkata"];
const KINDS: MonthlyTimelineKind[] = ["ingress", "aspect", "lunar", "parallel"];
const STEP = 150;
const utcL = (at: string) => `${at.slice(8, 10)}.${at.slice(5, 7)}.${at.slice(0, 4)} ${at.slice(11, 16)}`;
const deg = (v: number) => `${v.toFixed(2).replace(".", ",")}°`;

export function VedicMonthlyPanel({ t, options = {}, kbLookup = null }: { t: VedicMonthlyTechnical; options?: Record<string, unknown>; kbLookup?: KbLookup | null }) {
  const [tz, setTz] = useState<string>(typeof options.displayTz === "string" ? options.displayTz : "Europe/Istanbul");
  const [planets, setPlanets] = useState<VedicGrahaId[] | null>(null);
  const [kinds, setKinds] = useState<MonthlyTimelineKind[]>(KINDS);
  const [majorOnly, setMajorOnly] = useState(false);
  const [limit, setLimit] = useState(STEP);
  const all = useMemo(() => monthlyTimeline(t), [t]);
  const sm = useMemo(() => monthlySummary(t), [t]);
  const items = useMemo(() => filterTimeline(all, { planets, kinds, majorOnly }), [all, planets, kinds, majorOnly]);
  const w = t.window;
  const local = (at: string) => (tz === "UTC" ? null : formatInZone(at, tz));
  const togglePlanet = (p: VedicGrahaId) => {
    const cur = planets ?? [...VEDIC_GRAHAS];
    const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
    setPlanets(next.length === VEDIC_GRAHAS.length ? null : next);
    setLimit(STEP);
  };
  const kbKeys = [
    ...(t.ingress?.events ?? []).map((e) => `monthly_ingress:${e.planet}:${e.to}`),
    ...[...(t.aspects?.events ?? []), ...(t.lunar?.events ?? [])].map((e) => `monthly_aspect:${e.aspect}`),
    ...(t.parallels?.events ?? []).map((e) => `monthly_declination:${e.type}`),
  ];
  const kb = kbLookup ? kbLookup([...new Set(kbKeys)]) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vm-panel">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-700">
        <strong>
          {TR_MONTHS[w.month - 1]} {w.year}
        </strong>
        <span>· sidereal (Lahiri) · UTC takvim ayı</span>
        <label className="ml-auto flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
          Gösterim
          <select className="max-w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs" value={tz} onChange={(e) => setTz(e.target.value)} aria-label="Gösterim saat dilimi" data-testid="astro-vm-tz">
            {[...new Set([tz, ...TZ])].map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900" data-testid="astro-vm-method">
        {VEDIC_MONTHLY_METHOD_TEXT} {VEDIC_MONTHLY_WINDOW_TEXT}
      </p>
      {(t.aspects || t.lunar) && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="astro-vm-drishti-note">
          {ASPECT_VS_DRISHTI_TEXT} <span className="text-amber-800">{ASPECT_ZODIAC_TEXT}</span>
        </p>
      )}
      {t.missing.length > 0 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="astro-vm-missing">
          Gösterilmeyen bölüm: {t.missing.map((s) => VEDIC_MONTHLY_SECTION_LABELS[s]).join(", ")} (bölüm hesaplanamadı ya da doğum saati bilinmiyor).
        </p>
      )}

      <section className={`${card} p-3`} aria-label="Aylık özet" data-testid="astro-vm-summary">
        <h4 className="text-sm font-semibold text-slate-900">Aylık özet</h4>
        <ul className="mt-1 grid min-w-0 grid-cols-2 gap-x-3 gap-y-1 text-sm max-sm:grid-cols-1">
          {t.ingress && <li>Burç girişi: {sm.counts.ingress} (Ay {sm.moonIngresses}; diğer {sm.keyIngresses.length})</li>}
          {t.aspects && (
            <li>
              Gezegenler arası açı: {sm.counts.aspect} (majör {sm.majorAspects} · minör {sm.minorAspects})
            </li>
          )}
          {t.lunar && <li>Ay açısı: {sm.counts.lunar}</li>}
          {t.parallels && (
            <li>
              Deklinasyon: paralel {sm.parallels} · kontraparalel {sm.contraparallels}
            </li>
          )}
        </ul>
        {sm.keyIngresses.length > 0 && (
          <p className="mt-1 min-w-0 break-words text-xs text-slate-700">
            Ay dışındaki girişler:{" "}
            {sm.keyIngresses.map((e) => `${MONTHLY_GRAHA_TR[e.planet]} ${monthlySignTr(e.to)} (${local(e.atUtc)?.text ?? utcL(e.atUtc)}${e.retrograde && e.planet !== "rahu" && e.planet !== "ketu" ? ", geri" : ""})`).join(" · ")}
          </p>
        )}
      </section>

      <section className={`${card} p-3`} aria-label="Filtre" data-testid="astro-vm-filters">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-600">Gezegen:</span>
          {VEDIC_GRAHAS.map((p) => {
            const on = !planets || planets.includes(p);
            return (
              <button key={p} type="button" onClick={() => togglePlanet(p)} aria-pressed={on} className={`rounded-full border px-2 py-0.5 ${on ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "border-slate-200 bg-white text-slate-400"}`} data-testid={`astro-vm-planet-${p}`}>
                {MONTHLY_GRAHA_TR[p]}
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-3 text-xs">
          {KINDS.map((k) => (
            <label key={k} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={kinds.includes(k)}
                onChange={() => {
                  setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : KINDS.filter((x) => x === k || kinds.includes(x)));
                  setLimit(STEP);
                }}
                data-testid={`astro-vm-kind-${k}`}
              />
              {MONTHLY_KIND_LABELS[k]}
            </label>
          ))}
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={majorOnly} onChange={(e) => setMajorOnly(e.target.checked)} data-testid="astro-vm-major" /> Yalnız majör açılar
          </label>
        </div>
      </section>

      <section className={`${card} p-3`} aria-label="Zaman çizelgesi" data-testid="astro-vm-timeline">
        <h4 className="text-sm font-semibold text-slate-900">
          Zaman çizelgesi ({items.length}
          {items.length !== all.length ? ` / ${all.length}` : ""})
        </h4>
        {items.length === 0 ? (
          <p className="text-xs text-slate-500">Seçili filtrede olay yok.</p>
        ) : (
          <ul className="mt-1 flex min-w-0 flex-col divide-y divide-slate-100">
            {items.slice(0, limit).map((x, i) => {
              const z = local(x.atUtc);
              return (
                <li key={`${x.atUtc}-${x.kind}-${i}`} className="flex min-w-0 flex-wrap items-baseline gap-x-2 py-1 text-sm" data-vm-kind={x.kind}>
                  <span className="tabular-nums font-medium text-slate-900">{z ? `${z.text} (${z.zone})` : `${utcL(x.atUtc)} UTC`}</span>
                  {z && <span className="tabular-nums text-[11px] text-slate-500">{utcL(x.atUtc)} UTC</span>}
                  <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">{MONTHLY_KIND_LABELS[x.kind]}</span>
                  <span className="min-w-0 break-words text-slate-800">{x.text}</span>
                </li>
              );
            })}
          </ul>
        )}
        {items.length > limit && (
          <button type="button" className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700" onClick={() => setLimit(limit + STEP)} data-testid="astro-vm-more">
            {Math.min(STEP, items.length - limit)} olay daha göster
          </button>
        )}
        {t.ingress && <p className="mt-2 text-[11px] text-slate-500">{STATION_TEXT}</p>}
      </section>

      {t.ingress && (
        <details className={`${card} p-3`} data-testid="astro-vm-start">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Ay başı konumları (1. gün 00:00 UTC)</summary>
          <ul className="mt-1 grid min-w-0 grid-cols-3 gap-1 text-xs max-sm:grid-cols-2">
            {t.ingress.start.map((s) => (
              <li key={s.planet}>
                {MONTHLY_GRAHA_TR[s.planet]}: {monthlySignTr(s.sign)} {deg(s.longitude % 30)}
              </li>
            ))}
          </ul>
        </details>
      )}

      {(t.parallels || t.natalParallels) && <p className="text-xs text-slate-600">{DECLINATION_TEXT}</p>}
      {t.parallels && <p className="text-[11px] text-slate-500">{PARALLELS_SAMPLING_TEXT}</p>}
      {t.natalParallels && (
        <section className={`${card} p-3`} aria-label="Doğum anı deklinasyonları" data-testid="astro-vm-natal">
          <h4 className="text-sm font-semibold text-slate-900">Doğum anı deklinasyonları</h4>
          <p className="text-xs text-slate-500">{NATAL_DECLINATION_TEXT}</p>
          <ul className="mt-1 grid min-w-0 grid-cols-3 gap-1 text-xs max-sm:grid-cols-2">
            {t.natalParallels.planets.map((p) => (
              <li key={p.id}>
                {MONTHLY_GRAHA_TR[p.id]}: {fmtDeclination(p.declination)}
              </li>
            ))}
          </ul>
          <ul className="mt-2 flex flex-col gap-0.5 text-sm">
            {t.natalParallels.parallels.length === 0 && <li className="text-xs text-slate-500">Orb içinde paralel / kontraparalel yok.</li>}
            {t.natalParallels.parallels.map((p) => (
              <li key={`${p.a}-${p.b}-${p.type}`} className="min-w-0 break-words">
                {MONTHLY_GRAHA_TR[p.a]} – {MONTHLY_GRAHA_TR[p.b]} · {DECLINATION_TYPE_LABELS[p.type]} ({fmtDeclination(p.decA)} / {fmtDeclination(p.decB)}) · orb {deg(p.orb)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label="Aylık takvim Bilgi Bankası">
        <div className="text-xs font-semibold text-indigo-900">Bilgi Bankam</div>
        {kb === null ? (
          <p className="text-xs text-slate-500">Bilgi Bankası eşleşmeleri çalışma alanı yüklenince görünür.</p>
        ) : kb.length === 0 ? (
          <p className="text-xs text-slate-500">Bu ayın olayları için Bilgi Bankası kaydınız yok (burç girişi / astronomik açı / deklinasyon konuları).</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {kb.map((e) => (
              <li key={`${e.topicKey}-${e.title}`} className="rounded-lg bg-white px-2 py-1 text-xs">
                <div className="font-medium text-indigo-900">{e.topicLabel}</div>
                <div className="font-semibold text-slate-800">{e.title}</div>
                <p className="whitespace-pre-line text-slate-700">{e.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
