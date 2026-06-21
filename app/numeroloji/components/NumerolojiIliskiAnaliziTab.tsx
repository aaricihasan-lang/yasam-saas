"use client";

import { useState, useCallback } from "react";
import { hesaplaPinKodu, reduceToDigit, parseBirthDate } from "@/lib/numeroloji";
import type { PinKoduBoxes } from "@/lib/numeroloji";
import {
  resolveNumerolojiTenantId,
  listNumerologyAnalyses,
  type NumerologyRecordListItem,
} from "../helpers/numerolojiKayit";

// ─── Types ────────────────────────────────────────────────────────

type Pin8 = [number, number, number, number, number, number, number, number];
type ElementName = "Hava" | "Su" | "Ateş" | "Toprak" | "Nötr";
type ElementCounts = Record<ElementName, number>;

// ─── Calculation helpers (unchanged) ─────────────────────────────

function pinBoxesTo8(pin: PinKoduBoxes): Pin8 {
  return [pin.k1, pin.k2, pin.k3, pin.k4, pin.k5, pin.k6, pin.k7, pin.k8];
}

function calcRelationPin(p1: Pin8, p2: Pin8): Pin8 {
  return [
    reduceToDigit(p1[0] + p2[0]),
    reduceToDigit(p1[1] + p2[1]),
    reduceToDigit(p1[2] + p2[2]),
    reduceToDigit(p1[3] + p2[3]),
    reduceToDigit(p1[4] + p2[4]),
    reduceToDigit(p1[5] + p2[5]),
    reduceToDigit(p1[6] + p2[6]),
    reduceToDigit(p1[7] + p2[7]),
  ];
}

const DIGIT_ELEMENT: Record<number, ElementName> = {
  1: "Hava", 5: "Hava",
  2: "Su",   7: "Su",
  3: "Ateş", 6: "Ateş",
  4: "Toprak", 8: "Toprak",
  9: "Nötr",
};

const ELEMENT_ORDER: ElementName[] = ["Hava", "Su", "Ateş", "Toprak", "Nötr"];

const BASKIN_DIGITS = new Set([1, 3, 6, 8]);
const EDILGEN_DIGITS = new Set([2, 4, 5, 7]);

function calcElementCounts(pin: Pin8): ElementCounts {
  const counts: ElementCounts = { Hava: 0, Su: 0, Ateş: 0, Toprak: 0, Nötr: 0 };
  for (const d of pin) {
    const el = DIGIT_ELEMENT[d];
    if (el) counts[el]++;
  }
  return counts;
}

function calcDominance(pin: Pin8): { baskin: number; edilgen: number } {
  let baskin = 0;
  let edilgen = 0;
  for (const d of pin) {
    if (BASKIN_DIGITS.has(d)) baskin++;
    else if (EDILGEN_DIGITS.has(d)) edilgen++;
    else if (d === 9) { baskin += 0.5; edilgen += 0.5; }
  }
  return { baskin, edilgen };
}

// ─── Premium additions ────────────────────────────────────────────

const ELEMENT_EMOJI: Record<ElementName, string> = {
  Hava: "💨", Su: "💧", Ateş: "🔥", Toprak: "🌿", Nötr: "✦",
};

const ELEMENT_COLORS: Record<ElementName, {
  bg: string; text: string; bar: string; ring: string;
  heroBg: string; heroText: string;
}> = {
  Hava:   { bg: "bg-sky-50",    text: "text-sky-800",    bar: "bg-sky-400",    ring: "ring-sky-200/60",    heroBg: "bg-sky-100/60",    heroText: "text-sky-700" },
  Su:     { bg: "bg-blue-50",   text: "text-blue-800",   bar: "bg-blue-500",   ring: "ring-blue-200/60",   heroBg: "bg-blue-100/60",   heroText: "text-blue-700" },
  Ateş:   { bg: "bg-orange-50", text: "text-orange-800", bar: "bg-orange-500", ring: "ring-orange-200/60", heroBg: "bg-orange-100/60", heroText: "text-orange-700" },
  Toprak: { bg: "bg-amber-50",  text: "text-amber-800",  bar: "bg-amber-600",  ring: "ring-amber-200/60",  heroBg: "bg-amber-100/60",  heroText: "text-amber-700" },
  Nötr:   { bg: "bg-violet-50", text: "text-violet-800", bar: "bg-violet-400", ring: "ring-violet-200/60", heroBg: "bg-violet-100/60", heroText: "text-violet-700" },
};

function elementLevelText(count: number): string {
  if (count === 0) return "Yok/Eksik";
  if (count === 1) return "Zayıf";
  if (count === 2) return "Yeterli";
  if (count === 3) return "Dengeli";
  return "Baskın/Fazla";
}

function calcCompatibilityScore(el: ElementCounts, dom: { baskin: number; edilgen: number }): number {
  let score = 50;
  const nonZero = ELEMENT_ORDER.filter((e) => el[e] > 0).length;
  score += nonZero * 5;
  const diff = Math.abs(dom.baskin - dom.edilgen);
  if (diff <= 1) score += 15;
  else if (diff <= 2) score += 8;
  else if (diff > 4) score -= 10;
  const strongEls = ELEMENT_ORDER.filter((e) => el[e] >= 3).length;
  score += strongEls * 5;
  if (el.Nötr >= 3) score -= 8;
  const zeroEls = ELEMENT_ORDER.filter((e) => e !== "Nötr" && el[e] === 0).length;
  if (zeroEls >= 3) score -= 12;
  return Math.min(97, Math.max(32, Math.round(score)));
}

function scoreLabel(score: number): { label: string; color: string; textColor: string; ringColor: string } {
  if (score >= 90) return { label: "Mükemmel Uyum",    color: "bg-emerald-500", textColor: "text-emerald-700", ringColor: "ring-emerald-200" };
  if (score >= 75) return { label: "Yüksek Uyum",      color: "bg-teal-500",    textColor: "text-teal-700",    ringColor: "ring-teal-200" };
  if (score >= 60) return { label: "İyi Uyum",          color: "bg-sky-500",     textColor: "text-sky-700",     ringColor: "ring-sky-200" };
  if (score >= 40) return { label: "Geliştirilebilir",  color: "bg-amber-500",   textColor: "text-amber-700",   ringColor: "ring-amber-200" };
  return             { label: "Zorlayıcı",              color: "bg-rose-500",    textColor: "text-rose-700",    ringColor: "ring-rose-200" };
}

function generateScoreExplanation(
  el: ElementCounts,
  dom: { baskin: number; edilgen: number },
  score: number,
): string {
  const parts: string[] = [];
  const dominant = ELEMENT_ORDER.reduce((best, e) => (el[e] > el[best] ? e : best), ELEMENT_ORDER[0]);
  const nonZero = ELEMENT_ORDER.filter((e) => el[e] > 0).length;
  const zeroMain = ELEMENT_ORDER.filter((e) => e !== "Nötr" && el[e] === 0).length;
  const diff = Math.abs(dom.baskin - dom.edilgen);

  if (el[dominant] >= 4)
    parts.push(`${ELEMENT_EMOJI[dominant]} ${dominant} elementi baskın (${el[dominant]} hane)`);
  else if (nonZero >= 4)
    parts.push(`element çeşitliliği yüksek (${nonZero}/5 element aktif)`);

  if (diff <= 1)
    parts.push(`baskın-edilgen dengesi yakın (${dom.baskin}/${dom.edilgen})`);
  else if (diff > 3)
    parts.push(`baskın-edilgen farkı yüksek (${dom.baskin}/${dom.edilgen})`);

  if (zeroMain >= 2) parts.push(`${zeroMain} ana element eksik`);
  if (el.Nötr >= 3)  parts.push(`Nötr enerji yoğun (${el.Nötr} hane)`);

  if (!parts.length) return "Genel enerji dengesi ve element dağılımı bu skoru oluşturmuştur.";
  const tail = score >= 60 ? "bu nedenle uyum skoru yüksek çıkmıştır." : "bu nedenle uyum skoru düşmüştür.";
  return parts.join("; ") + " — " + tail;
}

// ─── Input formatters ─────────────────────────────────────────────

function formatAdInput(raw: string): string {
  return raw.replace(/(?:^|[ ])[\wğüşıöçĞÜŞİÖÇ]/gu, (ch) => ch.toLocaleUpperCase("tr-TR"));
}

function formatSoyadInput(raw: string): string {
  return raw.toLocaleUpperCase("tr-TR");
}

function formatTarihInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// ─── Style constants ──────────────────────────────────────────────

const inputClass =
  "h-9 w-full rounded-lg border border-violet-200/80 bg-white px-3 text-sm font-medium text-slate-900 outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50";

const labelClass = "mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500";

// ─── Sub-components ───────────────────────────────────────────────

function PinRow({ pin, shade }: { pin: Pin8; shade: "violet" | "fuchsia" }) {
  const cls =
    shade === "violet"
      ? "bg-violet-100 text-violet-800 ring-1 ring-violet-200/60"
      : "bg-fuchsia-100 text-fuchsia-800 ring-1 ring-fuchsia-200/60";
  return (
    <div className="flex flex-wrap gap-1">
      {pin.map((d, i) => (
        <span key={i} className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-black ${cls}`}>
          {d}
        </span>
      ))}
    </div>
  );
}

function SectionCard({ title, children, accent = "violet" }: {
  title: string;
  children: React.ReactNode;
  accent?: "violet" | "emerald" | "amber" | "sky" | "rose";
}) {
  const borderMap = {
    violet: "border-violet-200/70",
    emerald: "border-emerald-200/70",
    amber: "border-amber-200/70",
    sky: "border-sky-200/70",
    rose: "border-rose-200/70",
  };
  const titleMap = {
    violet: "text-violet-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    sky: "text-sky-600",
    rose: "text-rose-600",
  };
  return (
    <div className={`min-w-0 rounded-[12px] border bg-white/90 p-3 shadow-[0_0_10px_rgba(139,92,246,0.05)] ${borderMap[accent]}`}>
      <p className={`mb-2 text-[10px] font-black uppercase tracking-wider ${titleMap[accent]}`}>{title}</p>
      {children}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────

export interface NumerolojiIliskiAnaliziTabProps {
  kisi1Name: string;
  kisi1Surname: string;
  kisi1BirthDate: string;
  kisi1Pin: PinKoduBoxes;
}

export function NumerolojiIliskiAnaliziTab({
  kisi1Name,
  kisi1Surname,
  kisi1BirthDate,
  kisi1Pin,
}: NumerolojiIliskiAnaliziTabProps) {
  const [kisi2Name, setKisi2Name] = useState("");
  const [kisi2Surname, setKisi2Surname] = useState("");
  const [kisi2BirthDate, setKisi2BirthDate] = useState("");
  const [showDanisan, setShowDanisan] = useState(false);
  const [kisi2Editing, setKisi2Editing] = useState(true);
  const [danisanList, setDanisanList] = useState<NumerologyRecordListItem[]>([]);
  const [danisanLoading, setDanisanLoading] = useState(false);
  const [danisanSearch, setDanisanSearch] = useState("");

  // ── Calculations (unchanged logic) ──────────────────────────────
  const kisi1Pin8 = pinBoxesTo8(kisi1Pin);
  const normalizedBirthDate = kisi2BirthDate.trim().replace(/\//g, ".");
  const kisi2Valid = normalizedBirthDate ? parseBirthDate(normalizedBirthDate) !== null : false;
  const kisi2PinBoxes = kisi2Valid ? hesaplaPinKodu(normalizedBirthDate) : null;
  const kisi2Pin8: Pin8 | null = kisi2PinBoxes ? pinBoxesTo8(kisi2PinBoxes) : null;
  const iliskiPin: Pin8 | null = kisi2Pin8 ? calcRelationPin(kisi1Pin8, kisi2Pin8) : null;
  const iliskiEl = iliskiPin ? calcElementCounts(iliskiPin) : null;
  const iliskiDom = iliskiPin ? calcDominance(iliskiPin) : null;
  const uyumSkoru = iliskiEl && iliskiDom ? calcCompatibilityScore(iliskiEl, iliskiDom) : null;

  // ── Danışan helpers ──────────────────────────────────────────────
  const loadDanisan = useCallback(async () => {
    setDanisanLoading(true);
    const tenantId = await resolveNumerolojiTenantId();
    if (tenantId) {
      const { data } = await listNumerologyAnalyses(tenantId);
      if (data) setDanisanList(data);
    }
    setDanisanLoading(false);
  }, []);

  const handleDanisanToggle = () => {
    if (!showDanisan && danisanList.length === 0) void loadDanisan();
    setShowDanisan((v) => !v);
    setDanisanSearch("");
  };

  const handleDanisanSec = (item: NumerologyRecordListItem) => {
    setKisi2Name(formatAdInput(item.name));
    setKisi2Surname(formatSoyadInput(item.surname));
    setKisi2BirthDate(item.birth_date);
    setShowDanisan(false);
    setDanisanSearch("");
    setKisi2Editing(false);
  };

  const filteredDanisan = danisanSearch.trim()
    ? danisanList.filter(
        (d) =>
          `${d.name} ${d.surname}`.toLocaleLowerCase("tr-TR").includes(danisanSearch.toLocaleLowerCase("tr-TR")) ||
          d.birth_date.includes(danisanSearch),
      )
    : danisanList;

  // ── Derived display values ───────────────────────────────────────
  const kisi1AdSoyad = `${kisi1Name} ${kisi1Surname}`.trim() || "—";
  const kisi2AdSoyad = kisi2Name || kisi2Surname ? `${kisi2Name} ${kisi2Surname}`.trim() : null;

  const baskinEl =
    iliskiEl
      ? ELEMENT_ORDER.reduce((best, e) => (iliskiEl[e] > iliskiEl[best] ? e : best), ELEMENT_ORDER[0])
      : null;

  const sortedEls = iliskiEl
    ? [...ELEMENT_ORDER].sort((a, b) => iliskiEl[b] - iliskiEl[a])
    : [];

  const skorInfo = uyumSkoru !== null ? scoreLabel(uyumSkoru) : null;
  const scoreExplanation =
    iliskiEl && iliskiDom && uyumSkoru !== null
      ? generateScoreExplanation(iliskiEl, iliskiDom, uyumSkoru)
      : null;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* ── Header: person cards ─────────────────────────────────── */}
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[1fr_40px_1fr]">

        {/* Kişi 1 — readonly */}
        <div className="relative min-w-0 overflow-hidden rounded-[14px] border border-violet-200/70 bg-gradient-to-br from-violet-50/80 via-white to-white px-3 py-2.5 shadow-[0_0_12px_rgba(139,92,246,0.07)]">
          <div className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-violet-200/20 blur-xl" aria-hidden />
          <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-violet-500">1. Kişi · Mevcut Kayıt</p>
          <p className="text-sm font-black text-slate-900 leading-tight">{kisi1AdSoyad}</p>
          <p className="text-[10px] text-slate-400 tabular-nums">{kisi1BirthDate || "—"}</p>
          <div className="mt-1.5">
            <PinRow pin={kisi1Pin8} shade="violet" />
          </div>
        </div>

        {/* Center connector */}
        <div className="relative flex items-center justify-center py-1 sm:py-0">
          <div className="absolute inset-y-0 left-1/2 hidden w-px -translate-x-px bg-gradient-to-b from-violet-200/0 via-violet-400/50 to-violet-200/0 sm:block" aria-hidden />
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-base text-white shadow-[0_0_0_6px_rgba(139,92,246,0.10),0_0_20px_rgba(139,92,246,0.45)]">
            ♥
          </div>
        </div>

        {/* Kişi 2 */}
        <div className="relative min-w-0 overflow-hidden rounded-[14px] border border-fuchsia-200/70 bg-gradient-to-br from-fuchsia-50/70 via-white to-white px-3 py-2.5 shadow-[0_0_12px_rgba(217,70,239,0.07)]">
          <div className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-fuchsia-200/20 blur-xl" aria-hidden />

          {/* Compact readonly mode — mirrors Kişi 1 */}
          {!kisi2Editing && kisi2Pin8 && !showDanisan ? (
            <>
              <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-fuchsia-500">2. Kişi</p>
                <button
                  type="button"
                  onClick={() => setKisi2Editing(true)}
                  className="shrink-0 rounded-md border border-violet-200/80 bg-white px-2 py-0.5 text-[9px] font-bold text-violet-600 transition hover:bg-violet-50"
                >
                  ✎ Düzenle
                </button>
              </div>
              <p className="text-sm font-black text-slate-900 leading-tight">
                {kisi2AdSoyad || "—"}
              </p>
              <p className="text-[10px] text-slate-400 tabular-nums">{kisi2BirthDate || "—"}</p>
              <div className="mt-1.5">
                <PinRow pin={kisi2Pin8} shade="fuchsia" />
              </div>
            </>
          ) : (
            /* Edit / initial form mode */
            <>
              <div className="relative mb-1.5 flex min-w-0 items-center justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-fuchsia-500">2. Kişi</p>
                <button
                  type="button"
                  onClick={handleDanisanToggle}
                  className="shrink-0 rounded-md border border-violet-200/80 bg-white px-2 py-0.5 text-[9px] font-bold text-violet-600 transition hover:bg-violet-50"
                >
                  {showDanisan ? "✕ Kapat" : "Danışandan Seç"}
                </button>
              </div>

              {showDanisan ? (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={danisanSearch}
                    onChange={(e) => setDanisanSearch(e.target.value)}
                    placeholder="İsim veya tarih ile ara..."
                    className={inputClass}
                    autoFocus
                  />
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-violet-100 bg-white">
                    {danisanLoading ? (
                      <p className="px-3 py-2 text-xs text-slate-400">Yükleniyor…</p>
                    ) : filteredDanisan.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-400">Kayıt bulunamadı.</p>
                    ) : (
                      filteredDanisan.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => handleDanisanSec(d)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-violet-50"
                        >
                          <span className="min-w-0 truncate font-bold text-slate-900">{d.name} {d.surname}</span>
                          <span className="shrink-0 tabular-nums text-slate-400">{d.birth_date}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      <label className={labelClass}>Ad</label>
                      <input
                        type="text"
                        value={kisi2Name}
                        onChange={(e) => setKisi2Name(formatAdInput(e.target.value))}
                        placeholder="Esra Nur"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Soyad</label>
                      <input
                        type="text"
                        value={kisi2Surname}
                        onChange={(e) => setKisi2Surname(formatSoyadInput(e.target.value))}
                        placeholder="ARICI"
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Doğum Tarihi (GG/AA/YYYY)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={kisi2BirthDate}
                      onChange={(e) => setKisi2BirthDate(formatTarihInput(e.target.value))}
                      placeholder="15/03/1990"
                      maxLength={10}
                      className={inputClass}
                    />
                  </div>
                  {kisi2Pin8 ? (
                    <div className="flex items-center justify-between gap-2">
                      <PinRow pin={kisi2Pin8} shade="fuchsia" />
                      <button
                        type="button"
                        onClick={() => setKisi2Editing(false)}
                        className="shrink-0 rounded-md bg-fuchsia-100 px-2 py-0.5 text-[9px] font-bold text-fuchsia-700 transition hover:bg-fuchsia-200"
                      >
                        ✓ Onayla
                      </button>
                    </div>
                  ) : normalizedBirthDate ? (
                    <p className="text-[10px] font-semibold text-rose-500">Geçerli tarih girin (GG/AA/YYYY)</p>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Results ────────────────────────────────────────────────── */}
      {iliskiPin && kisi2Pin8 ? (
        <>
          {/* ── Hero PIN card ──────────────────────────────────────── */}
          <div className="relative min-w-0 overflow-hidden rounded-[16px] bg-gradient-to-br from-violet-600 via-fuchsia-600 to-violet-700 p-4 shadow-[0_8px_32px_rgba(139,92,246,0.40)]">
            {/* Glow orbs */}
            <div className="pointer-events-none absolute -left-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" aria-hidden />
            <div className="pointer-events-none absolute -right-8 bottom-0 h-24 w-24 rounded-full bg-fuchsia-300/20 blur-2xl" aria-hidden />

            <p className="relative mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-white/70">İlişki PIN Kodu</p>

            {/* PIN digits */}
            <div className="relative grid grid-cols-4 gap-2 sm:grid-cols-8">
              {iliskiPin.map((d, i) => {
                const p1 = kisi1Pin8[i];
                const p2 = kisi2Pin8[i];
                const sum = p1 + p2;
                const formula = sum > 9 ? `${p1}+${p2}=${sum}→${d}` : `${p1}+${p2}=${d}`;
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-2xl font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_8px_rgba(0,0,0,0.15)] backdrop-blur-sm">
                      {d}
                    </span>
                    <span className="text-[8px] text-white/50 whitespace-nowrap tabular-nums text-center leading-tight">
                      {formula}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Summary chips */}
            {baskinEl && skorInfo && iliskiDom && (
              <div className="relative mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-white/10 px-2 py-2 text-center backdrop-blur-sm">
                  <p className="text-[8px] font-bold uppercase tracking-widest text-white/50">Genel Enerji</p>
                  <p className="mt-0.5 text-[11px] font-black text-white leading-tight">
                    {Math.abs(iliskiDom.baskin - iliskiDom.edilgen) <= 1 ? "Dengeli" : iliskiDom.baskin > iliskiDom.edilgen ? "Baskın" : "Alıcı"}
                  </p>
                </div>
                <div className="rounded-lg bg-white/10 px-2 py-2 text-center backdrop-blur-sm">
                  <p className="text-[8px] font-bold uppercase tracking-widest text-white/50">Baskın El.</p>
                  <p className="mt-0.5 text-[11px] font-black text-white leading-tight">
                    {ELEMENT_EMOJI[baskinEl]} {baskinEl}
                  </p>
                </div>
                <div className="rounded-lg bg-white/10 px-2 py-2 text-center backdrop-blur-sm">
                  <p className="text-[8px] font-bold uppercase tracking-widest text-white/50">Uyum</p>
                  <p className="mt-0.5 text-[11px] font-black text-white leading-tight">{uyumSkoru}/100</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Uyum Skoru kartı ───────────────────────────────────── */}
          {uyumSkoru !== null && skorInfo && (
            <SectionCard title="Uyum Skoru" accent="violet">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative shrink-0">
                  <svg width="64" height="64" viewBox="0 0 64 64" className="rotate-[-90deg]">
                    <circle cx="32" cy="32" r="26" fill="none" stroke="#e9d5ff" strokeWidth="6" />
                    <circle
                      cx="32" cy="32" r="26" fill="none" stroke="url(#scoreGrad)" strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${(uyumSkoru / 100) * 163.4} 163.4`}
                    />
                    <defs>
                      <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#d946ef" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-base font-black text-violet-700 rotate-90 [transform-origin:center]" style={{ transform: 'none' }}>
                    {uyumSkoru}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-black text-slate-900">{skorInfo.label}</p>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-violet-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
                      style={{ width: `${uyumSkoru}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[9px] text-slate-400">
                    <span>Zorlayıcı</span><span>Mükemmel</span>
                  </div>
                </div>
              </div>
              {scoreExplanation && (
                <p className="mt-2.5 border-t border-violet-100/80 pt-2 text-[10px] leading-[1.6] text-slate-500">
                  {scoreExplanation}
                </p>
              )}
            </SectionCard>
          )}

          {/* ── Hane karşılaştırması — card grid ──────────────────── */}
          <SectionCard title="Hane Karşılaştırması" accent="violet">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => {
                const p1 = kisi1Pin8[i];
                const p2 = kisi2Pin8[i];
                const sum = p1 + p2;
                const result = iliskiPin[i];
                const elName = DIGIT_ELEMENT[result];
                const elC = elName ? ELEMENT_COLORS[elName] : null;
                return (
                  <div
                    key={i}
                    className="min-w-0 rounded-xl border border-violet-100/70 bg-gradient-to-b from-white to-violet-50/30 p-2.5 text-center shadow-sm"
                  >
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{i + 1}. Hane</p>
                    <div className="mt-1.5 flex items-center justify-center gap-1 text-sm font-black">
                      <span className="text-violet-600">{p1}</span>
                      <span className="text-slate-300 text-xs">+</span>
                      <span className="text-fuchsia-600">{p2}</span>
                      {sum > 9 && <><span className="text-slate-300 text-xs">=</span><span className="text-slate-400 text-xs">{sum}</span><span className="text-slate-300 text-xs">→</span></>}
                      {sum <= 9 && <span className="text-slate-300 text-xs">=</span>}
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-black text-white shadow-sm">
                        {result}
                      </span>
                    </div>
                    {elC && elName && (
                      <p className={`mt-1 text-[9px] font-bold ${elC.text}`}>
                        {ELEMENT_EMOJI[elName]} {elName}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* ── Element dağılımı ───────────────────────────────────── */}
          {iliskiEl && (
            <SectionCard title="Element Dağılımı" accent="violet">
              {/* Summary chips */}
              {sortedEls.length > 0 && (
                <div className="mb-3 flex min-w-0 flex-wrap gap-1.5">
                  {sortedEls.slice(0, 3).map((elName, rank) => {
                    const c = ELEMENT_COLORS[elName];
                    const count = iliskiEl[elName];
                    if (count === 0 && rank > 0) return null;
                    const rankLabel = rank === 0 ? "Baskın" : rank === 1 ? "İkincil" : "Zayıf";
                    return (
                      <span
                        key={elName}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${c.bg} ${c.text} ${c.ring}`}
                      >
                        {ELEMENT_EMOJI[elName]} {rankLabel}: {elName} ({count})
                      </span>
                    );
                  })}
                  {ELEMENT_ORDER.filter((e) => iliskiEl[e] === 0).map((elName) => {
                    const c = ELEMENT_COLORS[elName];
                    return (
                      <span key={elName} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${c.bg} ${c.text} ${c.ring} opacity-60`}>
                        {ELEMENT_EMOJI[elName]} Yok: {elName}
                      </span>
                    );
                  })}
                </div>
              )}
              {/* Bars */}
              <div className="space-y-2">
                {ELEMENT_ORDER.map((elName) => {
                  const count = iliskiEl[elName];
                  const c = ELEMENT_COLORS[elName];
                  const pct = count === 0 ? 0 : Math.max(6, (count / 8) * 100);
                  return (
                    <div key={elName} className="flex min-w-0 items-center gap-2">
                      <span className={`w-14 shrink-0 text-[11px] font-bold ${c.text}`}>
                        {ELEMENT_EMOJI[elName]} {elName}
                      </span>
                      <div className="min-w-0 flex-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full transition-all duration-500 ${c.bar}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-4 shrink-0 text-center text-xs font-black text-slate-600 tabular-nums">{count}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold ring-1 ${c.bg} ${c.text} ${c.ring}`}>
                        {elementLevelText(count)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* ── Baskın / Edilgen ───────────────────────────────────── */}
          {iliskiDom && (
            <SectionCard title="Baskın / Edilgen Dengesi" accent="violet">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-rose-50 p-3 text-center ring-1 ring-rose-200/60">
                  <p className="text-[8px] font-black uppercase tracking-widest text-rose-400">Baskın</p>
                  <p className="text-3xl font-black text-rose-700 tabular-nums leading-none mt-0.5">{iliskiDom.baskin}</p>
                  <p className="mt-1 text-[9px] text-rose-400">1, 3, 6, 8</p>
                </div>
                <div className="rounded-xl bg-sky-50 p-3 text-center ring-1 ring-sky-200/60">
                  <p className="text-[8px] font-black uppercase tracking-widest text-sky-400">Edilgen</p>
                  <p className="text-3xl font-black text-sky-700 tabular-nums leading-none mt-0.5">{iliskiDom.edilgen}</p>
                  <p className="mt-1 text-[9px] text-sky-400">2, 4, 5, 7</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                {iliskiDom.baskin > iliskiDom.edilgen + 2
                  ? "Her iki taraf da yön vermek isteyebilir; güç paylaşımına dikkat edilmeli."
                  : iliskiDom.edilgen > iliskiDom.baskin + 2
                  ? "Bekleme ve pasiflik eğilimi olabilir; teşvik ve netlik değerlidir."
                  : "Baskın ve edilgen enerji dengeli dağılmıştır."}
              </p>
            </SectionCard>
          )}

          {/* ── Nötr bilgi notu ────────────────────────────────────── */}
          <div className="flex min-w-0 items-start gap-2.5 rounded-[12px] border border-slate-200/80 bg-slate-50/80 px-3 py-2.5">
            <span className="mt-px shrink-0 text-slate-400">ℹ</span>
            <p className="text-[11px] leading-[1.65] text-slate-500">
              Bu ekran yalnızca iki kişinin PIN kodu, element dağılımı ve baskın/edilgen dengesini hesaplar. Yorumlama uzman tarafından yapılmalıdır.
            </p>
          </div>
        </>
      ) : (
        <div className="min-w-0 rounded-[14px] border-2 border-dashed border-violet-200/70 bg-white/60 px-4 py-8 text-center">
          <div className="text-2xl mb-2 opacity-50">♥</div>
          <p className="text-xs font-semibold text-slate-500">2. kişinin doğum tarihini girerek ilişki enerjisini hesaplayın.</p>
        </div>
      )}
    </div>
  );
}
