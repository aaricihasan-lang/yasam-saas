"use client";

// FAZ 4 — Zamanlama & Bireysel Gelişim sekmesi.
// Premium, görünür, kart-tabanlı. Teknik provenance/status kodları kullanıcıya gösterilmez.
// Referans tarih UI'da bir kez çözülür ve engine'e açıkça geçirilir (engine'de new Date() yok).

import { useMemo, useState, type ReactNode } from "react";
import {
  computeUniversalTiming,
  computePersonalTiming,
  computeCycleTiming,
  type CalendarDate,
  type ReducedResult,
} from "@/lib/numeroloji/timing";
import { computeDevelopment } from "@/lib/numeroloji/development";
import { isValidBirthDateDisplay } from "@/lib/numeroloji";
import { NumerolojiCalculationInfo, type CalculationExplanation } from "./NumerolojiCalculationInfo";
import { CONCEPT_HELP } from "../helpers/conceptHelp";
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
  const ref = useMemo<CalendarDate>(() => fromInputValue(refInput) ?? todayCalendar(), [refInput]);

  const valid = isValidBirthDateDisplay(birthDate);

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
        Zamanlama ve gelişim hesapları için geçerli bir doğum tarihi gerekir.
      </div>
    );
  }

  const { universal: u, personal: p, cycle: c, dev: d } = data;
  const py = p.personalYear;
  // Aktif Kişisel Yıl: aktif dönemin başladığı doğum gününün takvim yılı → öğretici hesap açıklaması.
  const activeCalendarYear = py.active.periodStart.year;

  // ── Öğretici "Nasıl hesaplandı?" açıklamaları (engine sonucuyla birebir) ──────
  const nominalPyExp = nominalPersonalYearExplain(birthDate, ref.year)?.explanation;
  const activePyExp = activePersonalYearExplain(
    birthDate,
    ref,
    activeCalendarYear,
    formatTR(py.active.periodStart),
    formatTR(py.active.periodEnd),
  )?.explanation;
  const personalMonthExp = personalMonthExplain(birthDate, ref)?.explanation;
  const personalDayExp = personalDayExplain(birthDate, ref)?.explanation;
  const universalYearExp = universalYearExplain(ref.year).explanation;
  const universalMonthExp = universalMonthExplain(ref.year, ref.month).explanation;
  const universalDayExp = universalDayExplain(ref.year, ref.month, ref.day).explanation;
  const yearChakraExp = yearChakraExplain(birthDate, ref.year)?.explanation;
  const maturityExp = maturityExplain(firstName, lastName, birthDate)?.explanation;
  const birthDayEnergyExp = birthDayEnergyExplain(birthDate)?.explanation;
  const personalityEnergyExp = personalityEnergyExplain(birthDate)?.explanation;
  const lifeLessonExp = lifeLessonExplain(birthDate)?.explanation;
  const destinyExp = destinyExplain(firstName, lastName)?.explanation;
  const evreExp = c.evre ? evreExplain(c.age, c.evre.index, c.evre.energy).explanation : undefined;
  const donguExp = c.evre && c.dongu ? donguExplain(c.age, c.dongu.index).explanation : undefined;

  return (
    <div className="space-y-1">
      {/* A) ANALİZ TARİHİ */}
      <SectionTitle>Analiz Tarihi</SectionTitle>
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <label htmlFor="noj-ref-date" className="text-xs font-bold text-slate-700">
            Hesap referans tarihi
          </label>
          <p className="text-xs font-medium text-slate-500">
            Geçmiş veya gelecek bir tarih seçebilirsiniz. Bu yalnız hesabın “bugünü”nü değiştirir;
            numeroloji formülünü değiştirmez.
          </p>
        </div>
        <input
          id="noj-ref-date"
          type="date"
          value={refInput}
          onChange={(e) => setRefInput(e.target.value)}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-200/40 sm:w-auto"
        />
      </div>

      {/* B) EVRENSEL ZAMANLAMA */}
      <SectionTitle>Evrensel Zamanlama</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Evrensel Yıl" value={rr(u.universalYear)} interpretation={u.universalYear.interpretation} accent="sky" explanation={universalYearExp} meaning={CONCEPT_HELP.universalYear} />
        <Card label="Evrensel Ay" value={rr(u.universalMonth)} interpretation={u.universalMonth.interpretation} accent="sky" explanation={universalMonthExp} meaning={CONCEPT_HELP.universalMonth} />
        <Card label="Evrensel Gün" value={rr(u.universalDay)} interpretation={u.universalDay.interpretation} accent="sky" explanation={universalDayExp} meaning={CONCEPT_HELP.universalDay} />
      </div>

      {/* C) KİŞİSEL ZAMANLAMA */}
      <SectionTitle>Kişisel Zamanlama</SectionTitle>
      <p className="mb-2 rounded-xl bg-violet-50/70 px-3 py-2 text-xs font-medium leading-relaxed text-violet-900">
        Yıllık hesap takvim yılını gösterir; aktif kişisel yıl ise doğum gününüzden doğum gününüze
        ilerleyen dönemi gösterir. Bu yüzden iki değer farklı olabilir.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card
          label={`Nominal Kişisel Yıl (${ref.year})`}
          value={rr(py.nominal)}
          interpretation={py.nominal.interpretation}
          accent="violet"
          hint="Takvim yılı hesabı"
          explanation={nominalPyExp}
          meaning={CONCEPT_HELP.nominalPersonalYear}
        />
        <Card
          label="Aktif Kişisel Yıl"
          value={rr(py.active)}
          interpretation={py.active.interpretation}
          accent="violet"
          hint={`Şu anda içinde bulunulan dönem: ${formatTR(py.active.periodStart)} – ${formatTR(py.active.periodEnd)}`}
          meaning={CONCEPT_HELP.activePersonalYear}
          explanation={activePyExp}
        />
        <Card label="Kişisel Ay" value={rr(p.personalMonth)} interpretation={p.personalMonth.interpretation} accent="violet" explanation={personalMonthExp} meaning={CONCEPT_HELP.personalMonth} />
        <Card label="Kişisel Gün" value={rr(p.personalDay)} interpretation={p.personalDay.interpretation} accent="violet" explanation={personalDayExp} meaning={CONCEPT_HELP.personalDay} />
      </div>

      {/* D) YAŞAM EVRESİ */}
      <SectionTitle>Yaşam Evresi</SectionTitle>
      {c.evre ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card
              label={`Evre ${c.evre.index} · Yaş ${c.age}`}
              value={String(c.evre.energy)}
              interpretation={c.evre.interpretation}
              accent="emerald"
              hint="Evre enerjisi (PIN)"
              meaning={CONCEPT_HELP.evre}
              explanation={evreExp}
            />
            <Card
              label={`Döngü ${c.dongu?.index ?? "—"}`}
              value={String(c.dongu?.index ?? "—")}
              interpretation={c.dongu?.interpretation}
              accent="emerald"
              meaning={CONCEPT_HELP.dongu}
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
                      Evre {t.evreIndex}
                    </span>
                    <span className="text-lg font-black text-emerald-700">{t.energy}</span>
                    <span className="text-[10px] font-medium text-slate-500">
                      {t.ageStart}–{t.ageEnd} yaş
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
            ? `Yaş ${c.age}. Bu yaş için yaşam evresi döngü aralığı tanımlı değildir.`
            : "Yaşam evresi hesaplanamadı."}
        </div>
      )}

      {/* E) BİREYSEL GELİŞİM */}
      <SectionTitle>Bireysel Gelişim</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card label="Güncel Yıl Çakrası" value={rr(d.yearChakra)} interpretation={d.yearChakra.interpretation} accent="amber" explanation={yearChakraExp} meaning={CONCEPT_HELP.yearChakra} />
        <Card label="Olgunluk" value={rr(d.maturity)} interpretation={d.maturity.interpretation} accent="amber" hint="~45 yaştan itibaren belirginleşir" explanation={maturityExp} meaning={CONCEPT_HELP.maturity} />
        <Card
          label={`Doğum Günü Enerjisi (Ayın ${d.birthDayEnergy.display}. günü)`}
          value={d.birthDayEnergy.display}
          interpretation={d.birthDayEnergy.interpretation}
          accent="amber"
          explanation={birthDayEnergyExp}
          meaning={CONCEPT_HELP.birthDayEnergy}
        />
        <Card label="Kişilik Enerjisi" value={rr(d.personalityEnergy)} interpretation={d.personalityEnergy.interpretation} accent="amber" explanation={personalityEnergyExp} meaning={CONCEPT_HELP.personalityEnergy} />
        <Card label="Hayat Dersi" value={rr(d.lifeLesson)} interpretation={d.lifeLesson.interpretation} accent="amber" explanation={lifeLessonExp} meaning={CONCEPT_HELP.lifeLesson} />
        <Card label="Kader Sayısı" value={rr(d.destiny)} interpretation={d.destiny.interpretation} accent="amber" explanation={destinyExp} meaning={CONCEPT_HELP.destiny} />
      </div>
    </div>
  );
}
