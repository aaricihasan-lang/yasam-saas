"use client";

// FAZ 4 — Zamanlama & Bireysel Gelişim sekmesi.
// Premium, görünür, kart-tabanlı. Teknik provenance/status kodları kullanıcıya gösterilmez.
// Referans tarih UI'da bir kez çözülür ve engine'e açıkça geçirilir (engine'de new Date() yok).

import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import {
  computeUniversalTiming,
  computePersonalTiming,
  computeCycleTiming,
  type CalendarDate,
  type ReducedResult,
} from "@/lib/numeroloji/timing";
import { computeDevelopment } from "@/lib/numeroloji/development";
import { isValidBirthDateDisplay } from "@/lib/numeroloji";
import { birthParts } from "@/lib/numeroloji/timing/dateUtils";
import {
  isPreBirth,
  preBirthActiveYearText,
  preBirthActiveYearTextEn,
  preBirthEvreText,
  preBirthEvreTextEn,
  preBirthNote,
  preBirthNoteEn,
} from "../utils/preBirth";
import { NumerolojiCalculationInfo, type CalculationExplanation } from "./NumerolojiCalculationInfo";
import { useChronoView } from "../hooks/useChronoView";
import {
  nominalPersonalYearExplain,
  activePersonalYearExplain,
  personalMonthExplain,
  personalDayExplain,
  universalYearExplain,
  universalMonthExplain,
  universalDayExplain,
  yearChakraExplain,
  maturityExplain,
  birthDayEnergyExplain,
  personalityEnergyExplain,
  lifeLessonExplain,
  destinyExplain,
  evreExplain,
  donguExplain,
  type ExplainT,
} from "../utils/teachingExplain";

type Props = {
  firstName: string;
  lastName: string;
  birthDate: string; // display "GG/AA/YYYY"
};

function todayCalendar(): CalendarDate {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}
function toInputValue(cd: CalendarDate): string {
  return `${cd.year.toString().padStart(4, "0")}-${cd.month
    .toString()
    .padStart(2, "0")}-${cd.day.toString().padStart(2, "0")}`;
}
function fromInputValue(v: string): CalendarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}
function formatTR(cd: CalendarDate): string {
  return `${cd.day.toString().padStart(2, "0")}/${cd.month
    .toString()
    .padStart(2, "0")}/${cd.year}`;
}

function Card({
  label,
  value,
  interpretation,
  accent = "violet",
  hint,
  explanation,
  meaning,
}: {
  label: string;
  value: string;
  interpretation?: string;
  accent?: "violet" | "amber" | "emerald" | "sky";
  hint?: string;
  explanation?: CalculationExplanation;
  meaning?: string;
}) {
  const ring = {
    violet: "border-violet-200/70 from-violet-50/80",
    amber: "border-amber-200/70 from-amber-50/80",
    emerald: "border-emerald-200/70 from-emerald-50/80",
    sky: "border-sky-200/70 from-sky-50/80",
  }[accent];
  const badge = {
    violet: "bg-violet-600",
    amber: "bg-amber-500",
    emerald: "bg-emerald-600",
    sky: "bg-sky-600",
  }[accent];
  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border bg-gradient-to-br to-white/90 p-4 shadow-sm ${ring}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-black text-white shadow ${badge}`}
        >
          {value}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            {explanation || meaning ? (
              <NumerolojiCalculationInfo
                title={label}
                meaning={meaning}
                explanation={explanation}
                tone={accent}
              />
            ) : null}
          </div>
          {hint ? <p className="text-xs font-medium text-slate-500">{hint}</p> : null}
        </div>
      </div>
      {interpretation ? (
        <p className="text-sm leading-relaxed text-slate-700">{interpretation}</p>
      ) : null}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-6 mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-violet-900">
      <span className="h-4 w-1 rounded-full bg-gradient-to-b from-violet-500 to-indigo-500" />
      {children}
    </h3>
  );
}

const rr = (r: ReducedResult): string => (r ? r.display : "—");

export function NumerolojiZamanlamaGelisimTab({ firstName, lastName, birthDate }: Props) {
  const [refInput, setRefInput] = useState<string>(() => toInputValue(todayCalendar()));
  // "Gelecek Yılları Göster" alt-yetkisi yoksa (owner 25.10.2026) referans tarih en geç İÇİNDE BULUNULAN yılın
  // sonudur: geçmiş ve bu yılın ay/gün hesapları açık, gelecek takvim yıllarının hesabı yapılmaz.
  const { futureYears, limitYear } = useChronoView();
  const maxRefInput = futureYears ? undefined : `${limitYear}-12-31`;
  const ref = useMemo<CalendarDate>(() => {
    const r = fromInputValue(refInput) ?? todayCalendar();
    return !futureYears && r.year > limitYear ? { year: limitYear, month: 12, day: 31 } : r;
  }, [refInput, futureYears, limitYear]);

  const valid = isValidBirthDateDisplay(birthDate);
  // I18N: etiketler katalogdan; TR'de "Nasıl hesaplandı?" açıklamaları varsayılan (kaynak) metinle birebir, diğer dillerde
  // ekran dilinin `numerology.analysis.explain` çevirisiyle üretilir (hesap/değer aynı).
  const tz = useTranslations("numerology.tabs.timing");
  const tc = useTranslations("numerology.analysis.concept");
  const tPre = useTranslations("numerology.tabs.timing.preBirth");
  const tExplain = useTranslations("numerology.analysis.explain");
  const isSourceLocale = useLocale() === DEFAULT_LOCALE;
  const ex: ExplainT | undefined = isSourceLocale ? undefined : (tExplain as unknown as ExplainT);

  const data = useMemo(() => {
    if (!valid) return null;
    return {
      universal: computeUniversalTiming(ref),
      personal: computePersonalTiming(birthDate, ref),
      cycle: computeCycleTiming(birthDate, ref),
      dev: computeDevelopment(firstName, lastName, birthDate, ref),
    };
  }, [valid, birthDate, firstName, lastName, ref]);

  if (!valid || !data) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm font-semibold text-amber-900">
        {tz("invalidBirth")}
      </div>
    );
  }

  const { universal: u, personal: p, cycle: c, dev: d } = data;
  const py = p.personalYear;
  // Doğum öncesi (planlanan doğum tarihi referans tarihten sonra): yaş / aktif dönem / şu anki evre gösterilmez.
  const bp = birthParts(birthDate);
  const preBirth = isPreBirth(c) && bp !== null;
  // Aktif Kişisel Yıl: aktif dönemin başladığı doğum gününün takvim yılı → öğretici hesap açıklaması.
  const activeCalendarYear = py.active.periodStart.year;

  // ── Öğretici "Nasıl hesaplandı?" açıklamaları (engine sonucuyla birebir) ──────
  const nominalPyExp = nominalPersonalYearExplain(birthDate, ref.year, ex)?.explanation;
  const activePyExp = activePersonalYearExplain(
    birthDate,
    ref,
    activeCalendarYear,
    formatTR(py.active.periodStart),
    formatTR(py.active.periodEnd),
    ex,
  )?.explanation;
  const personalMonthExp = personalMonthExplain(birthDate, ref, ex)?.explanation;
  const personalDayExp = personalDayExplain(birthDate, ref, ex)?.explanation;
  const universalYearExp = universalYearExplain(ref.year, ex).explanation;
  const universalMonthExp = universalMonthExplain(ref.year, ref.month, ex).explanation;
  const universalDayExp = universalDayExplain(ref.year, ref.month, ref.day, ex).explanation;
  const yearChakraExp = yearChakraExplain(birthDate, ref.year, ex)?.explanation;
  const maturityExp = maturityExplain(firstName, lastName, birthDate, ex)?.explanation;
  const birthDayEnergyExp = birthDayEnergyExplain(birthDate, ex)?.explanation;
  const personalityEnergyExp = personalityEnergyExplain(birthDate, ex)?.explanation;
  const lifeLessonExp = lifeLessonExplain(birthDate, ex)?.explanation;
  const destinyExp = destinyExplain(firstName, lastName, ex)?.explanation;
  const evreExp = c.evre ? evreExplain(c.age, c.evre.index, c.evre.energy, ex).explanation : undefined;
  const donguExp = c.evre && c.dongu ? donguExplain(c.age, c.dongu.index, ex).explanation : undefined;

  return (
    <div className="space-y-1">
      {/* A) ANALİZ TARİHİ */}
      <SectionTitle>{tz("analysisDate")}</SectionTitle>
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <label htmlFor="noj-ref-date" className="text-xs font-bold text-slate-700">
            {tz("refDate")}
          </label>
          <p className="text-xs font-medium text-slate-500">
            {futureYears
              ? tz("refAny")
              : tz("refLimited", { year: String(limitYear) })}{" "}
            {tz("refNote")}
          </p>
        </div>
        <input
          id="noj-ref-date"
          type="date"
          value={refInput}
          max={maxRefInput}
          onChange={(e) => setRefInput(e.target.value)}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-200/40 sm:w-auto"
        />
      </div>

      {preBirth && bp ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-900" data-testid="noj-prebirth-note">
          {isSourceLocale ? preBirthNote(bp, ref) : preBirthNoteEn(tPre, bp, ref)}
        </p>
      ) : null}

      {/* B) EVRENSEL ZAMANLAMA */}
      <SectionTitle>{tz("universal")}</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card label={tz("universalYear")} value={rr(u.universalYear)} interpretation={u.universalYear.interpretation} accent="sky" explanation={universalYearExp} meaning={tc("universalYear")} />
        <Card label={tz("universalMonth")} value={rr(u.universalMonth)} interpretation={u.universalMonth.interpretation} accent="sky" explanation={universalMonthExp} meaning={tc("universalMonth")} />
        <Card label={tz("universalDay")} value={rr(u.universalDay)} interpretation={u.universalDay.interpretation} accent="sky" explanation={universalDayExp} meaning={tc("universalDay")} />
      </div>

      {/* C) KİŞİSEL ZAMANLAMA */}
      <SectionTitle>{tz("personal")}</SectionTitle>
      <p className="mb-2 rounded-xl bg-violet-50/70 px-3 py-2 text-xs font-medium leading-relaxed text-violet-900">
        {tz("personalIntro")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card
          label={tz("nominalPy", { year: String(ref.year) })}
          value={rr(py.nominal)}
          interpretation={py.nominal.interpretation}
          accent="violet"
          hint={tz("calendarYearCalc")}
          explanation={nominalPyExp}
          meaning={tc("nominalPersonalYear")}
        />
        {preBirth && bp ? (
          <Card
            label={tz("activePy")}
            value="—"
            accent="violet"
            hint={isSourceLocale ? preBirthActiveYearText(bp) : preBirthActiveYearTextEn(tPre, bp)}
            meaning={tc("activePersonalYear")}
          />
        ) : (
          <Card
            label={tz("activePy")}
            value={rr(py.active)}
            interpretation={py.active.interpretation}
            accent="violet"
            hint={tz("currentPeriod", { start: formatTR(py.active.periodStart), end: formatTR(py.active.periodEnd) })}
            meaning={tc("activePersonalYear")}
            explanation={activePyExp}
          />
        )}
        <Card label={tz("personalMonth")} value={rr(p.personalMonth)} interpretation={p.personalMonth.interpretation} accent="violet" explanation={personalMonthExp} meaning={tc("personalMonth")} />
        <Card label={tz("personalDay")} value={rr(p.personalDay)} interpretation={p.personalDay.interpretation} accent="violet" explanation={personalDayExp} meaning={tc("personalDay")} />
      </div>

      {/* D) YAŞAM EVRESİ */}
      <SectionTitle>{tz("lifePhase")}</SectionTitle>
      {preBirth ? (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm font-medium text-slate-600" data-testid="noj-prebirth-evre">
            {isSourceLocale ? preBirthEvreText(c.timeline[0]?.energy) : preBirthEvreTextEn(tPre, c.timeline[0]?.energy)}
          </div>
          <div className="mt-3 overflow-x-auto">
            <div className="flex min-w-max gap-1.5">
              {c.timeline.map((t) => (
                <div key={t.evreIndex} className="flex w-20 shrink-0 flex-col items-center rounded-xl border border-slate-200 bg-white/70 p-2 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{tz("phaseN", { n: String(t.evreIndex) })}</span>
                  <span className="text-lg font-black text-emerald-700">{t.energy}</span>
                  <span className="text-[10px] font-medium text-slate-500">
                    {tz("ageRange", { start: String(t.ageStart), end: String(t.ageEnd) })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : c.evre ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card
              label={tz("phaseAge", { n: String(c.evre.index), age: String(c.age) })}
              value={String(c.evre.energy)}
              interpretation={c.evre.interpretation}
              accent="emerald"
              hint={tz("phaseEnergy")}
              meaning={tc("evre")}
              explanation={evreExp}
            />
            <Card
              label={tz("cycleN", { n: String(c.dongu?.index ?? "—") })}
              value={String(c.dongu?.index ?? "—")}
              interpretation={c.dongu?.interpretation}
              accent="emerald"
              meaning={tc("dongu")}
              explanation={donguExp}
            />
          </div>
          {/* 9 yıllık timeline */}
          <div className="mt-3 overflow-x-auto">
            <div className="flex min-w-max gap-1.5">
              {c.timeline.map((t) => {
                const isCurrent = t.evreIndex === c.evre?.index;
                return (
                  <div
                    key={t.evreIndex}
                    className={`flex w-20 shrink-0 flex-col items-center rounded-xl border p-2 text-center ${
                      isCurrent
                        ? "border-emerald-400 bg-emerald-50 shadow"
                        : "border-slate-200 bg-white/70"
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {tz("phaseN", { n: String(t.evreIndex) })}
                    </span>
                    <span className="text-lg font-black text-emerald-700">{t.energy}</span>
                    <span className="text-[10px] font-medium text-slate-500">
                      {tz("ageRange", { start: String(t.ageStart), end: String(t.ageEnd) })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm font-medium text-slate-600">
          {c.age > 81
            ? tz("ageOutOfRange", { age: String(c.age) })
            : tz("phaseFailed")}
        </div>
      )}

      {/* E) BİREYSEL GELİŞİM */}
      <SectionTitle>{tz("development")}</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card label={tz("yearChakra")} value={rr(d.yearChakra)} interpretation={d.yearChakra.interpretation} accent="amber" explanation={yearChakraExp} meaning={tc("yearChakra")} />
        <Card label={tz("maturity")} value={rr(d.maturity)} interpretation={d.maturity.interpretation} accent="amber" hint={tz("maturityHint")} explanation={maturityExp} meaning={tc("maturity")} />
        <Card
          label={tz("birthDayEnergy", { day: d.birthDayEnergy.display })}
          value={d.birthDayEnergy.display}
          interpretation={d.birthDayEnergy.interpretation}
          accent="amber"
          explanation={birthDayEnergyExp}
          meaning={tc("birthDayEnergy")}
        />
        <Card label={tz("personalityEnergy")} value={rr(d.personalityEnergy)} interpretation={d.personalityEnergy.interpretation} accent="amber" explanation={personalityEnergyExp} meaning={tc("personalityEnergy")} />
        <Card label={tz("lifeLesson")} value={rr(d.lifeLesson)} interpretation={d.lifeLesson.interpretation} accent="amber" explanation={lifeLessonExp} meaning={tc("lifeLesson")} />
        <Card label={tz("destiny")} value={rr(d.destiny)} interpretation={d.destiny.interpretation} accent="amber" explanation={destinyExp} meaning={tc("destiny")} />
      </div>
    </div>
  );
}
