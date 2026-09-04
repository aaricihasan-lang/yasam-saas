"use client";

import { useState, useCallback } from "react";
import type { PinKoduBoxes } from "@/lib/numeroloji";
import { analyzeRelationship, type RelationshipAnalysisResult } from "@/lib/numeroloji";
import {
  resolveNumerolojiTenantId,
  listNumerologyAnalyses,
  type NumerologyRecordListItem,
} from "../helpers/numerolojiKayit";
import { NumerolojiCalculationInfo } from "./NumerolojiCalculationInfo";
import { CONCEPT_HELP } from "../helpers/conceptHelp";
import {
  lifeCodeBreakdown,
  birthdayBreakdown,
  acquisitionBreakdown,
  nameNumberBreakdown,
  commonDigitBreakdown,
} from "../utils/relationshipCalcBreakdown";

// ─────────────────────────────────────────────────────────────────────────────
// PROFESYONEL İLİŞKİ ANALİZİ (canonical v2)
//
// FAZ 1 forensic sonrası: SOURCE-DIŞI "Uyum 90/100" metriği (calcCompatibilityScore
// / scoreLabel / generateScoreExplanation) TAMAMEN KALDIRILDI. Genel/global uyum
// skoru YOKTUR. Hesaplar lib/numeroloji/relationship canonical engine'inden gelir;
// bu bileşen yalnızca render eder.
// ─────────────────────────────────────────────────────────────────────────────

const ELEMENT_EMOJI: Record<string, string> = {
  Hava: "💨", Su: "💧", Ateş: "🔥", Toprak: "🌿", Nötr: "✦",
};

const ELEMENT_COLORS: Record<string, { text: string; bar: string; bg: string; ring: string }> = {
  Hava:   { text: "text-sky-800",    bar: "bg-sky-400",    bg: "bg-sky-50",    ring: "ring-sky-200/60" },
  Su:     { text: "text-blue-800",   bar: "bg-blue-500",   bg: "bg-blue-50",   ring: "ring-blue-200/60" },
  Ateş:   { text: "text-orange-800", bar: "bg-orange-500", bg: "bg-orange-50", ring: "ring-orange-200/60" },
  Toprak: { text: "text-amber-800",  bar: "bg-amber-600",  bg: "bg-amber-50",  ring: "ring-amber-200/60" },
  Nötr:   { text: "text-violet-800", bar: "bg-violet-400", bg: "bg-violet-50", ring: "ring-violet-200/60" },
};

const ELEMENT_ORDER = ["Hava", "Su", "Ateş", "Toprak", "Nötr"] as const;

// ─── Input formatters ─────────────────────────────────────────────────────────

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

// ─── Style constants ──────────────────────────────────────────────────────────

const inputClass =
  "h-9 w-full rounded-lg border border-violet-200/80 bg-white px-3 text-sm font-medium text-slate-900 outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50";
const labelClass = "mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500";

// ─── Sub-components ────────────────────────────────────────────────────────────

function PinRow({ pin, shade }: { pin: number[]; shade: "violet" | "fuchsia" }) {
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

function SectionCard({ title, subtitle, children, accent = "violet", info }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent?: "violet" | "emerald" | "amber" | "sky" | "rose";
  info?: React.ReactNode;
}) {
  const borderMap = {
    violet: "md:border-violet-200/70",
    emerald: "md:border-emerald-200/70",
    amber: "md:border-amber-200/70",
    sky: "md:border-sky-200/70",
    rose: "md:border-rose-200/70",
  };
  const titleMap = {
    violet: "text-violet-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    sky: "text-sky-600",
    rose: "text-rose-600",
  };
  return (
    <div className={`min-w-0 border-b border-slate-100/70 pb-3 last:border-b-0 last:pb-0 md:border md:rounded-[12px] md:bg-white/90 md:p-3 md:pb-3 md:shadow-[0_0_10px_rgba(139,92,246,0.05)] md:last:border md:last:pb-3 ${borderMap[accent]}`}>
      <div className="flex items-center gap-1.5">
        <p className={`text-[10px] font-black uppercase tracking-wider ${titleMap[accent]}`}>{title}</p>
        {info}
      </div>
      {subtitle && <p className="mb-2 mt-0.5 text-[10px] text-slate-400">{subtitle}</p>}
      {!subtitle && <div className="mb-2" />}
      {children}
    </div>
  );
}

function PersonCatalogText({ who, name, digit, text, shade }: { who: string; name: string; digit: number; text: string | null; shade: "violet" | "fuchsia" }) {
  return (
    <details className="min-w-0 rounded-lg bg-slate-50/70 p-2 ring-1 ring-slate-200/60">
      <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-slate-700">
        <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs font-black ${shade === "violet" ? "bg-violet-100 text-violet-800" : "bg-fuchsia-100 text-fuchsia-800"}`}>{digit}</span>
        <span className="min-w-0 truncate">{who}: {name}</span>
      </summary>
      <p className="mt-1.5 max-h-40 overflow-y-auto text-[11px] leading-[1.55] text-slate-600">
        {text ?? <span className="text-slate-400">Kaynak metni bekleniyor.</span>}
      </p>
    </details>
  );
}

/** Kişi başına ayrı 1–9 katalog metni gösteren katman (İsim/Yaşam Kodu/Edinim/Doğum Günü). */
function PerPersonLayer({
  label,
  p1,
  p2,
  layer,
  info,
}: {
  label: string;
  p1: string;
  p2: string | null;
  layer: { aDigit: number; bDigit: number; aText: string | null; bText: string | null };
  info?: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-100/70 py-2 last:border-b-0">
      <div className="mb-1 flex items-center gap-1.5">
        <p className="text-[10px] font-black uppercase tracking-wide text-sky-700">{label}</p>
        {info}
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <PersonCatalogText who="1. Kişi" name={p1} digit={layer.aDigit} text={layer.aText} shade="violet" />
        <PersonCatalogText who="2. Kişi" name={p2 || "—"} digit={layer.bDigit} text={layer.bText} shade="fuchsia" />
      </div>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

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
}: NumerolojiIliskiAnaliziTabProps) {
  const [kisi2Name, setKisi2Name] = useState("");
  const [kisi2Surname, setKisi2Surname] = useState("");
  const [kisi2BirthDate, setKisi2BirthDate] = useState("");
  const [showDanisan, setShowDanisan] = useState(false);
  const [kisi2Editing, setKisi2Editing] = useState(true);
  const [danisanList, setDanisanList] = useState<NumerologyRecordListItem[]>([]);
  const [danisanLoading, setDanisanLoading] = useState(false);
  const [danisanSearch, setDanisanSearch] = useState("");

  // ── Canonical engine ─────────────────────────────────────────────────────────
  const analiz: RelationshipAnalysisResult | null = analyzeRelationship({
    person1: { name: kisi1Name, surname: kisi1Surname, birthDate: kisi1BirthDate },
    person2: { name: kisi2Name, surname: kisi2Surname, birthDate: kisi2BirthDate },
  });

  const kisi2Valid = analiz !== null;

  // ── Danışan helpers ────────────────────────────────────────────────────────────
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

  const kisi1AdSoyad = `${kisi1Name} ${kisi1Surname}`.trim() || "—";
  const kisi2AdSoyad = kisi2Name || kisi2Surname ? `${kisi2Name} ${kisi2Surname}`.trim() : null;
  const kisi1Pin8 = analiz?.persons[0].pin8 ?? [];
  const kisi2Pin8 = analiz?.persons[1].pin8 ?? [];

  const normalizedBirthDate = kisi2BirthDate.trim().replace(/\//g, ".");

  // ── "Nasıl hesaplandı?" sunum dökümleri (presentation-only; motor değişmez) ──────
  const kisi2Label = kisi2AdSoyad ?? "2. Kişi";
  const pairSteps = (
    aBd: { steps: string[] } | null,
    bBd: { steps: string[] } | null,
  ): string[] => {
    const lines: string[] = [];
    if (aBd) lines.push(`1. Kişi — ${kisi1AdSoyad}`, ...aBd.steps);
    if (bBd) lines.push("", `2. Kişi — ${kisi2Label}`, ...bBd.steps);
    return lines;
  };
  const lifeBdA = lifeCodeBreakdown(kisi1BirthDate);
  const lifeBdB = lifeCodeBreakdown(kisi2BirthDate);
  const nameBdA = nameNumberBreakdown(kisi1Name, kisi1Surname);
  const nameBdB = nameNumberBreakdown(kisi2Name, kisi2Surname);
  const edBdA = acquisitionBreakdown(kisi1BirthDate);
  const edBdB = acquisitionBreakdown(kisi2BirthDate);
  const bdBdA = birthdayBreakdown(kisi1BirthDate);
  const bdBdB = birthdayBreakdown(kisi2BirthDate);
  const commonBd = commonDigitBreakdown(kisi1Name, kisi1Surname, kisi2Name, kisi2Surname);

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* ── Header: person cards ─────────────────────────────────────────────── */}
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[1fr_40px_1fr]">
        {/* Kişi 1 */}
        <div className="relative min-w-0 overflow-hidden border-b border-slate-100/70 pb-3 md:border-b-0 md:pb-0 md:rounded-[14px] md:border md:border-violet-200/70 md:bg-gradient-to-br md:from-violet-50/80 md:via-white md:to-white md:px-3 md:py-2.5 md:shadow-[0_0_12px_rgba(139,92,246,0.07)]">
          <div className="mb-1 flex flex-wrap items-center gap-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-violet-500">1. Kişi · Mevcut Kayıt</p>
            <NumerolojiCalculationInfo title="Kişisel PIN" meaning={CONCEPT_HELP.kisiselPin} tone="violet" />
          </div>
          <p className="text-sm font-black text-slate-900 leading-tight">{kisi1AdSoyad}</p>
          <p className="text-[10px] text-slate-400 tabular-nums">{kisi1BirthDate || "—"}</p>
          {kisi1Pin8.length > 0 && <div className="mt-1.5"><PinRow pin={kisi1Pin8} shade="violet" /></div>}
        </div>

        {/* Connector */}
        <div className="relative flex items-center justify-center py-1 sm:py-0">
          <div className="absolute inset-y-0 left-1/2 hidden w-px -translate-x-px bg-gradient-to-b from-violet-200/0 via-violet-400/50 to-violet-200/0 sm:block" aria-hidden />
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-base text-white shadow-[0_0_0_6px_rgba(139,92,246,0.10),0_0_20px_rgba(139,92,246,0.45)]">
            ♥
          </div>
        </div>

        {/* Kişi 2 */}
        <div className="relative min-w-0 overflow-hidden border-b border-slate-100/70 pb-3 md:border-b-0 md:pb-0 md:rounded-[14px] md:border md:border-fuchsia-200/70 md:bg-gradient-to-br md:from-fuchsia-50/70 md:via-white md:to-white md:px-3 md:py-2.5 md:shadow-[0_0_12px_rgba(217,70,239,0.07)]">
          {!kisi2Editing && kisi2Valid && !showDanisan ? (
            <>
              <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-fuchsia-500">2. Kişi</p>
                <button type="button" onClick={() => setKisi2Editing(true)} className="shrink-0 rounded-md border border-violet-200/80 bg-white px-2 py-0.5 text-[9px] font-bold text-violet-600 transition hover:bg-violet-50">
                  ✎ Düzenle
                </button>
              </div>
              <p className="text-sm font-black text-slate-900 leading-tight">{kisi2AdSoyad || "—"}</p>
              <p className="text-[10px] text-slate-400 tabular-nums">{kisi2BirthDate || "—"}</p>
              {kisi2Pin8.length > 0 && <div className="mt-1.5"><PinRow pin={kisi2Pin8} shade="fuchsia" /></div>}
            </>
          ) : (
            <>
              <div className="relative mb-1.5 flex min-w-0 items-center justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-fuchsia-500">2. Kişi</p>
                <button type="button" onClick={handleDanisanToggle} className="shrink-0 rounded-md border border-violet-200/80 bg-white px-2 py-0.5 text-[9px] font-bold text-violet-600 transition hover:bg-violet-50">
                  {showDanisan ? "✕ Kapat" : "Danışandan Seç"}
                </button>
              </div>

              {showDanisan ? (
                <div className="space-y-1.5">
                  <input type="text" value={danisanSearch} onChange={(e) => setDanisanSearch(e.target.value)} placeholder="İsim veya tarih ile ara..." className={inputClass} autoFocus />
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-violet-100 bg-white">
                    {danisanLoading ? (
                      <p className="px-3 py-2 text-xs text-slate-400">Yükleniyor…</p>
                    ) : filteredDanisan.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-400">Kayıt bulunamadı.</p>
                    ) : (
                      filteredDanisan.map((d) => (
                        <button key={d.id} type="button" onClick={() => handleDanisanSec(d)} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-violet-50">
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
                      <input type="text" value={kisi2Name} onChange={(e) => setKisi2Name(formatAdInput(e.target.value))} placeholder="Esra Nur" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Soyad</label>
                      <input type="text" value={kisi2Surname} onChange={(e) => setKisi2Surname(formatSoyadInput(e.target.value))} placeholder="KONUK" className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Doğum Tarihi (GG/AA/YYYY)</label>
                    <input type="text" inputMode="numeric" value={kisi2BirthDate} onChange={(e) => setKisi2BirthDate(formatTarihInput(e.target.value))} placeholder="15/03/1990" maxLength={10} className={inputClass} />
                  </div>
                  {kisi2Valid ? (
                    <div className="flex items-center justify-between gap-2">
                      <PinRow pin={kisi2Pin8} shade="fuchsia" />
                      <button type="button" onClick={() => setKisi2Editing(false)} className="shrink-0 rounded-md bg-fuchsia-100 px-2 py-0.5 text-[9px] font-bold text-fuchsia-700 transition hover:bg-fuchsia-200">
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

      {/* ── Results ─────────────────────────────────────────────────────────────── */}
      {analiz ? (
        <>
          {/* Sinerji PIN hero — NO SCORE */}
          <div className="relative min-w-0 overflow-hidden bg-gradient-to-br from-violet-600 via-fuchsia-600 to-violet-700 px-[clamp(8px,2.5vw,14px)] py-4 md:rounded-[16px] md:px-4 md:shadow-[0_8px_32px_rgba(139,92,246,0.40)]">
            <div className="pointer-events-none absolute -left-8 -top-8 hidden h-32 w-32 rounded-full bg-white/10 blur-2xl md:block" aria-hidden />
            <div className="relative mb-3 flex items-center gap-1.5">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/70">Sinerji PIN Kodu</p>
              <NumerolojiCalculationInfo
                title="Sinerji PIN Kodu"
                tone="white"
                meaning={CONCEPT_HELP.synergyPin}
                formula="İki kişinin PIN kodunun ilk 8 hanesi aynı pozisyonda toplanır; çift haneli sonuçlar tek haneye indirilir."
                steps={analiz.synergyPin.steps.map(
                  (s) => `${s.index}. Hane: ${s.a} + ${s.b} = ${s.sum}${s.sum > 9 ? ` → ${s.result}` : ""}`,
                )}
                result={`Sinerji PIN: ${analiz.synergyPin.pin.join(" ")}`}
              />
            </div>
            <div className="relative grid grid-cols-4 gap-2 sm:grid-cols-8">
              {analiz.synergyPin.pin.map((d, i) => {
                const s = analiz.synergyPin.steps[i];
                const formula = s.sum > 9 ? `${s.a}+${s.b}=${s.sum}→${d}` : `${s.a}+${s.b}=${d}`;
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-2xl font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_8px_rgba(0,0,0,0.15)] backdrop-blur-sm">{d}</span>
                    <span className="text-[8px] text-white/50 whitespace-nowrap tabular-nums text-center leading-tight">{formula}</span>
                  </div>
                );
              })}
            </div>
            {/* 9. hane + Ruh Duygusu */}
            <div className="relative mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white/10 px-2 py-2 text-center backdrop-blur-sm">
                <p className="text-[8px] font-bold uppercase tracking-widest text-white/50">9. Hane · Neden Bir Aradayız</p>
                <p className="mt-0.5 text-lg font-black text-white leading-tight">{analiz.whyTogether.digit}</p>
                <p className="text-[8px] text-white/45 tabular-nums">Σ={analiz.whyTogether.sum}</p>
              </div>
              <div className="rounded-lg bg-white/10 px-2 py-2 text-center backdrop-blur-sm">
                <p className="text-[8px] font-bold uppercase tracking-widest text-white/50">Ruh Duygusu · 8. Hane</p>
                <p className="mt-0.5 text-lg font-black text-white leading-tight">{analiz.relationshipSoulFeeling.digit}</p>
              </div>
            </div>
          </div>

          {/* 3) Hane karşılaştırması — DEFAULT KAPALI, Sinerji PIN'in hemen altında */}
          <SectionCard title="Sinerji Hane Karşılaştırması" accent="violet">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-bold text-violet-700">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-violet-200 bg-white text-[11px] leading-none text-violet-600">ⓘ</span>
                <span className="group-open:hidden">Hane karşılaştırmasını göster · Nasıl hesaplandı?</span>
                <span className="hidden group-open:inline">Hane karşılaştırmasını gizle</span>
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {analiz.synergyPin.steps.map((s) => (
                  <div key={s.index} className="min-w-0 p-1.5 text-center md:rounded-xl md:border md:border-violet-100/70 md:bg-gradient-to-b md:from-white md:to-violet-50/30 md:p-2.5 md:shadow-sm">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{s.index}. Hane</p>
                    <div className="mt-1.5 flex items-center justify-center gap-1 text-sm font-black">
                      <span className="text-violet-600">{s.a}</span>
                      <span className="text-slate-300 text-xs">+</span>
                      <span className="text-fuchsia-600">{s.b}</span>
                      {s.sum > 9 && <><span className="text-slate-300 text-xs">=</span><span className="text-slate-400 text-xs">{s.sum}</span><span className="text-slate-300 text-xs">→</span></>}
                      {s.sum <= 9 && <span className="text-slate-300 text-xs">=</span>}
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-black text-white shadow-sm">{s.result}</span>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </SectionCard>

          {/* 4) İlişki Üçgeni — Sinerji PIN Yorumu (canonical hane→alan eşlemesi) */}
          <SectionCard title="İlişki Üçgeni — Sinerji PIN Yorumu" subtitle="Sinerji PIN haneleri 1,2,3,6,7,8 · dışında: 4 (Yaşam Döngüsü), 5 (Ders)" accent="violet" info={<NumerolojiCalculationInfo title="İlişki Üçgeni" meaning={CONCEPT_HELP.relationshipTriangle} tone="violet" />}>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {analiz.relationshipTriangle.nodes.map((n) => (
                <div key={n.position} className="min-w-0 rounded-lg bg-violet-50/70 p-2 ring-1 ring-violet-200/50">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9px] font-bold uppercase tracking-wide text-violet-500">{n.position}. hane</span>
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-violet-500 px-1 text-[10px] font-black text-white">{n.value}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-700">{n.field}</p>
                  {n.text && <p className="mt-1 text-[9px] leading-[1.4] text-slate-500 line-clamp-3">{n.text}</p>}
                </div>
              ))}
            </div>
            {analiz.relationshipTriangle.ruleText && (
              <p className="mt-2 text-[10px] leading-[1.55] text-slate-500">{analiz.relationshipTriangle.ruleText}</p>
            )}
          </SectionCard>

          {/* 5) Ruh Duygusu — Sinerji PIN 8. hane */}
          <SectionCard title="Ruh Duygusu" subtitle="Sinerji PIN · 8. hane" accent="violet" info={<NumerolojiCalculationInfo title="Ruh Duygusu" meaning={CONCEPT_HELP.relationshipSoulFeeling} tone="violet" />}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500 text-sm font-black text-white">{analiz.relationshipSoulFeeling.digit}</span>
              <p className="min-w-0 text-[11px] leading-[1.55] text-slate-700">
                {analiz.relationshipSoulFeeling.text ?? <span className="text-slate-400">Kaynak metni bekleniyor.</span>}
              </p>
            </div>
          </SectionCard>

          {/* 6) Neden Bir Aradayız? — Sinerji PIN 9. hane */}
          <SectionCard
            title="Neden Bir Aradayız?"
            subtitle={`Sinerji PIN · 9. hane · Σ=${analiz.whyTogether.sum}`}
            accent="violet"
            info={
              <NumerolojiCalculationInfo
                title="Neden Bir Aradayız (9. Hane)"
                tone="fuchsia"
                meaning={CONCEPT_HELP.whyTogether}
                formula="Sinerji PIN'in ilk 8 hanesi toplanır, tek haneye indirilir."
                steps={[
                  `${analiz.synergyPin.pin.join(" + ")} = ${analiz.whyTogether.sum ?? 0}`,
                  ...((analiz.whyTogether.sum ?? 0) > 9 ? [`${String(analiz.whyTogether.sum ?? 0).split("").join(" + ")} = ${analiz.whyTogether.digit}`] : []),
                ]}
                result={`9. Hane: ${analiz.whyTogether.digit}`}
              />
            }
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fuchsia-500 text-sm font-black text-white">{analiz.whyTogether.digit}</span>
              <p className="min-w-0 text-[11px] leading-[1.55] text-slate-700">
                {analiz.whyTogether.text ?? <span className="text-slate-400">Bu hane için kaynak metni PDF dosyasından bekleniyor.</span>}
              </p>
            </div>
          </SectionCard>

          {/* 7) İlişki Dinamikleri — kaynak katalog metinleri (kitap 2. seviye) */}
          <SectionCard title="İlişki Dinamikleri" subtitle="Kaynak: eğitim notu katalogları" accent="sky">
            <PerPersonLayer
              label="Yaşam Kodu Sayısı"
              p1={kisi1AdSoyad}
              p2={kisi2AdSoyad}
              layer={analiz.lifeCodeCompatibility}
              info={
                <NumerolojiCalculationInfo
                  title="Yaşam Kodu Sayısı"
                  tone="sky"
                  meaning={CONCEPT_HELP.lifeCode}
                  formula="Her kişinin doğum tarihindeki tüm rakamlar toplanır, tek haneye indirilir."
                  steps={pairSteps(lifeBdA, lifeBdB)}
                  result={`1. Kişi: ${analiz.lifeCodeCompatibility.aDigit} · 2. Kişi: ${analiz.lifeCodeCompatibility.bDigit}`}
                />
              }
            />
            <PerPersonLayer
              label="İsim Sayısı"
              p1={kisi1AdSoyad}
              p2={kisi2AdSoyad}
              layer={analiz.nameNumberCompatibility}
              info={
                <NumerolojiCalculationInfo
                  title="İsim Sayısı"
                  tone="sky"
                  meaning={CONCEPT_HELP.nameNumber}
                  formula="İsim + soyisim harflerinin sayısal karşılıkları toplanır, tek haneye indirilir (kaynak: kitap 2. seviye)."
                  steps={pairSteps(nameBdA, nameBdB)}
                  result={`1. Kişi: ${analiz.nameNumberCompatibility.aDigit} · 2. Kişi: ${analiz.nameNumberCompatibility.bDigit}`}
                />
              }
            />
            <PerPersonLayer
              label="Edinim Sayısı"
              p1={kisi1AdSoyad}
              p2={kisi2AdSoyad}
              layer={analiz.acquisitionCompatibility}
              info={
                <NumerolojiCalculationInfo
                  title="Edinim Sayısı"
                  tone="sky"
                  meaning={CONCEPT_HELP.acquisition}
                  formula="Doğum günü ve doğum ayının rakamları toplanır, tek haneye indirilir."
                  steps={pairSteps(edBdA, edBdB)}
                  result={`1. Kişi: ${analiz.acquisitionCompatibility.aDigit} · 2. Kişi: ${analiz.acquisitionCompatibility.bDigit}`}
                />
              }
            />
            <PerPersonLayer
              label="Doğum Günü Sayısı"
              p1={kisi1AdSoyad}
              p2={kisi2AdSoyad}
              layer={analiz.birthdayCompatibility}
              info={
                <NumerolojiCalculationInfo
                  title="Doğum Günü Sayısı"
                  tone="sky"
                  meaning={CONCEPT_HELP.birthdayNumber}
                  formula="Doğum gününün rakamları toplanır, tek haneye indirilir."
                  steps={pairSteps(bdBdA, bdBdB)}
                  result={`1. Kişi: ${analiz.birthdayCompatibility.aDigit} · 2. Kişi: ${analiz.birthdayCompatibility.bDigit}`}
                />
              }
            />

            {/* Kiminle ne tür ilişki — yönlü (kişi adı + Yaşam Kodu ile bağlamlı) */}
            <div className="border-b border-slate-100/70 py-2 last:border-b-0">
              <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-sky-700">Kiminle Ne Tür İlişki (yönlü)</p>
              <details className="group">
                <summary className="flex cursor-pointer flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                  <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-violet-800">
                    <span className="min-w-0 truncate font-bold">{kisi1AdSoyad}</span>
                    <span className="font-black">— Yaşam Kodu {analiz.relationshipType.aDigit}</span>
                  </span>
                  <span className="text-slate-400">→</span>
                  <span className="inline-flex items-center gap-1 rounded bg-fuchsia-100 px-1.5 py-0.5 text-fuchsia-800">
                    <span className="min-w-0 truncate font-bold">{kisi2Label}</span>
                    <span className="font-black">— Yaşam Kodu {analiz.relationshipType.bDigit}</span>
                  </span>
                  <span className="text-slate-400 group-open:hidden">· Yorumu göster</span>
                </summary>
                <p className="mt-1.5 text-[11px] leading-[1.55] text-slate-700">{analiz.relationshipType.aToB ?? "—"}</p>
                <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[11px] leading-[1.55] text-slate-500">
                  <span className="font-bold">{kisi2Label} — Yaşam Kodu {analiz.relationshipType.bDigit} → {kisi1AdSoyad} — Yaşam Kodu {analiz.relationshipType.aDigit}:</span> {analiz.relationshipType.bToA ?? "—"}
                </p>
              </details>
            </div>

            {/* Ortak Konu Sayısı — bağlamlı (İsim Sayısı + İsim Sayısı = Ortak Rakam) */}
            <div className="py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="text-[10px] font-black uppercase tracking-wide text-sky-700">Ortak Konu Sayısı — Hangi Konularda Anlaşırız?</p>
                  <NumerolojiCalculationInfo
                    title="Ortak Konu Sayısı"
                    tone="sky"
                    meaning={CONCEPT_HELP.commonDigit}
                    formula="Her iki kişinin İsim Sayısı (isim + soyisim harfleri → tek hane) toplanır, yine tek haneye indirilir. Kaynak terimi: “Ortak Rakam”."
                    steps={commonBd ? commonBd.steps : undefined}
                    result={`Ortak Rakam: ${analiz.commonTopics.commonDigit}`}
                  />
                </div>
                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-sky-500 px-2 text-sm font-black text-white">{analiz.commonTopics.commonDigit}</span>
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-bold text-slate-700">
                <span className="min-w-0 truncate">{kisi1AdSoyad} — İsim Sayısı {analiz.commonTopics.aNameNumber}</span>
                <span className="text-slate-300">+</span>
                <span className="min-w-0 truncate">{kisi2Label} — İsim Sayısı {analiz.commonTopics.bNameNumber}</span>
                <span className="text-slate-400">= Ortak Rakam</span>
                <span className="tabular-nums text-sky-700">{analiz.commonTopics.commonDigit}</span>
              </p>
              {analiz.commonTopics.text && <p className="mt-1.5 text-[11px] leading-[1.55] text-slate-700">{analiz.commonTopics.text}</p>}
            </div>
          </SectionCard>

          {/* 8) Enerji Dağılımı — element (tie korunur) + işleme tipi */}
          <SectionCard title="Enerji Dağılımı" accent="amber" info={<NumerolojiCalculationInfo title="Enerji Dağılımı" meaning={CONCEPT_HELP.elementBalance} tone="amber" />}>
            {/* Öne çıkan elementler — TIE KORUNUR (keyfi sıralama yok) */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-500">Öne Çıkan Elementler:</span>
              {analiz.elementBalance.highlighted.length === 0 ? (
                <span className="text-[10px] text-slate-400">—</span>
              ) : (
                analiz.elementBalance.highlighted.map((el) => (
                  <span key={el} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${ELEMENT_COLORS[el]?.bg} ${ELEMENT_COLORS[el]?.text} ${ELEMENT_COLORS[el]?.ring}`}>
                    {ELEMENT_EMOJI[el]} {el} ({analiz.elementBalance.counts[el as keyof typeof analiz.elementBalance.counts]})
                  </span>
                ))
              )}
            </div>
            <div className="space-y-2">
              {ELEMENT_ORDER.map((el) => {
                const count = analiz.elementBalance.counts[el];
                const lvl = analiz.elementBalance.levels.find((l) => l.element === el)?.level ?? null;
                const c = ELEMENT_COLORS[el];
                const pct = count === 0 ? 0 : Math.max(6, (count / 8) * 100);
                return (
                  <div key={el} className="flex min-w-0 items-center gap-2">
                    <span className={`w-14 shrink-0 text-[11px] font-bold ${c.text}`}>{ELEMENT_EMOJI[el]} {el}</span>
                    <div className="min-w-0 flex-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full transition-all duration-500 ${c.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-4 shrink-0 text-center text-xs font-black text-slate-600 tabular-nums">{count}</span>
                    <span className="w-14 shrink-0 text-right text-[9px] font-semibold text-slate-400">{lvl ?? ""}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-[9px] text-slate-400">Kaynak miktar sınıfı yalnızca 1=eksik · 2=yeterli · 3=dengeli için tanımlıdır; diğer sayılar için etiket üretilmez.</p>
          </SectionCard>

          {/* İşleme Tipi (Baskın/Edilgen) — SKOR DEĞİLDİR */}
          <SectionCard title="İlişkinin İşleme Tipi" subtitle="Baskın / Edilgen dağılımı — bu bir uyum puanı DEĞİLDİR" accent="rose" info={<NumerolojiCalculationInfo title="İlişkinin İşleme Tipi" meaning={CONCEPT_HELP.dominance} tone="rose" />}>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-rose-50 p-3 text-center ring-1 ring-rose-200/60">
                <p className="text-[8px] font-black uppercase tracking-widest text-rose-400">Baskın (Etken)</p>
                <p className="mt-0.5 text-3xl font-black text-rose-700 tabular-nums leading-none">{analiz.dominance.baskin}</p>
                <p className="mt-1 text-[9px] text-rose-400">1, 3, 6, 8</p>
              </div>
              <div className="rounded-xl bg-sky-50 p-3 text-center ring-1 ring-sky-200/60">
                <p className="text-[8px] font-black uppercase tracking-widest text-sky-400">Edilgen (Alıcı)</p>
                <p className="mt-0.5 text-3xl font-black text-sky-700 tabular-nums leading-none">{analiz.dominance.edilgen}</p>
                <p className="mt-1 text-[9px] text-sky-400">2, 4, 5, 7</p>
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Her 9 hanesi baskın ve edilgene 0,5’er katkı verir. Bu değerler ilişkinin işleme biçimini gösterir; tek başına iyi/kötü hükmü üretmez.</p>
          </SectionCard>

          {/* FAZ 6: Eş Uyumu (Ayrı Motor) ve Nikâh / Birliktelik Tarihi Etkisi bölümleri
              ürün kapsamından KALDIRILDI. İlişki Üçgeni yukarı (Sinerji PIN'in altına) taşındı. */}

          {/* Bilgi notu */}
          <div className="flex min-w-0 items-start gap-2.5 rounded-[12px] border border-slate-200/80 bg-slate-50/80 px-3 py-2.5">
            <span className="mt-px shrink-0 text-slate-400">ℹ</span>
            <p className="text-[11px] leading-[1.65] text-slate-500">
              Bu ekran ilişkinin Sinerji PIN’ini, element dağılımını ve işleme tipini hesaplar. <span className="font-bold">Genel/tek bir uyum yüzdesi üretilmez.</span> Yorumlama uzman tarafından, ilgili eğitim notu esas alınarak yapılmalıdır.
            </p>
          </div>
        </>
      ) : (
        <div className="min-w-0 px-[clamp(8px,2.5vw,14px)] py-8 text-center md:rounded-[14px] md:border-2 md:border-dashed md:border-violet-200/70 md:bg-white/60 md:px-4">
          <div className="text-2xl mb-2 opacity-50">♥</div>
          <p className="text-xs font-semibold text-slate-500">2. kişinin doğum tarihini girerek ilişki enerjisini hesaplayın.</p>
        </div>
      )}
    </div>
  );
}
