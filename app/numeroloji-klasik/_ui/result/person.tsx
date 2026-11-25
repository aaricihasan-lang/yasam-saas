"use client";

// Kişi analizi sekme panelleri (prototip sonuc.html). Veri yalnız kayıtlı normalize sonuçtan okunur.

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type {
  BridgeItem,
  BridgeResult,
  ChaldeanPart,
  ChaldeanResult,
  ChartResult,
  ClassicNumber,
  DualResult,
  Period,
  PersonalDayResult,
  DailyResult,
} from "@/lib/numeroloji-klasik/model";
// Etiket metinleri numerology.classic.labels katalogundan (TR değerleri labels.ts ile birebir; labels.ts değişmez).
// BRIDGE_LABELS yalnız köprü anahtarlarının kanonik SIRASI için kullanılır.
import { BRIDGE_LABELS } from "@/lib/numeroloji-klasik/labels";
import { currentPeriodicChallenge, isMainChallenge, mainChallenge, periodicChallenges } from "@/lib/numeroloji-klasik/challenges";
import { fmtIsoDay, monthName } from "../../_lib/format";
import { MismatchNote, NumberBadges, NumberCard, Trace, VerificationBadge, compoundDisplay } from "../kit";

export type PersonData = {
  chart: ChartResult | null;
  bridge: BridgeResult | null;
  personalDay: PersonalDayResult | null;
  daily: DailyResult | null;
  chaldean: ChaldeanResult | null;
  dual: DualResult | null;
  referenceDate: string | null;
  birth: { year: number; month: number; day: number } | null;
};

export function ageAt(birth: PersonData["birth"], iso: string | null): number | null {
  if (!birth || !iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  let age = y - birth.year;
  if (mo < birth.month || (mo === birth.month && d < birth.day)) age--;
  return age >= 0 ? age : null;
}

function currentPeriod(periods: Period[], age: number | null): Period | null {
  if (age === null) return null;
  return periods.find((p) => age >= p.startAge && (p.endAge === null || age <= p.endAge)) ?? null;
}

/** Çekirdek sayı sırası (kanonik anahtarlar); ad: labels.core.<key>, alt satır: person.coreSub.<key>. */
const CORE_ORDER: { key: keyof ChartResult["core"] }[] = [
  { key: "lifePath" },
  { key: "expression" },
  { key: "soulUrge" },
  { key: "personality" },
  { key: "birthDay" },
  { key: "maturity" },
];

const digitRoot = (n: number) => (n <= 0 ? 0 : 1 + ((n - 1) % 9));

// ── Özet ───────────────────────────────────────────────────────────────────────────────────────
export function SummaryPanel({ d }: { d: PersonData }) {
  const t = useTranslations("numerology.classic");
  const locale = useLocale();
  const c = d.chart;
  const age = ageAt(d.birth, d.referenceDate);
  const cur = c ? currentPeriod(c.pinnacles, age) : null;
  const refYear = d.referenceDate?.slice(0, 4) ?? null;
  return (
    <div className="nk-card nk-panel">
      <h2 className="nk-h2">{t("person.summary.title")}</h2>
      <p className="nk-lead">{t("person.summary.lead")}</p>
      {c ? (
        <div className="nk-summary-grid" style={{ marginTop: 14 }}>
          {CORE_ORDER.map((o) => {
            const n = c.core[o.key];
            const cd = compoundDisplay(n);
            return (
              <div key={o.key} className="nk-mini" data-testid="summary-mini">
                <b>{n.value}</b>
                <span>{t(`labels.core.${o.key}`)}</span>
                <div className="nk-badges">
                  {n.karmicDebt ? <span className="nk-badge nk-karmic">{t("person.summary.karmic", { n: String(n.karmicDebt) })}</span> : null}
                  {n.type === "master" ? <span className="nk-badge nk-master">{t("person.summary.master")}</span> : null}
                  {cd && !n.karmicDebt ? <span className="nk-badge">{cd}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="nk-empty">{t("person.summary.noChart")}</p>
      )}
      <dl className="nk-kv">
        {c ? <div><dt>{refYear ? t("person.summary.personalYearRef", { year: refYear }) : t("person.summary.personalYear")}</dt><dd>{c.personalYear.personalYear}</dd></div> : null}
        {c && cur ? <div><dt>{t("person.summary.currentPinnacle", { start: String(cur.startAge), end: cur.endAge === null ? "…" : String(cur.endAge) })}</dt><dd>{cur.number}</dd></div> : null}
        {c ? <div><dt>{t("person.summary.missing")}</dt><dd>{c.karmicLessons.missingNumbers.length ? c.karmicLessons.missingNumbers.join(", ") : t("person.summary.none")}</dd></div> : null}
        {d.chaldean ? (
          <div><dt>{t("person.summary.chaldeanDestiny")}</dt><dd>{d.chaldean.destiny.compound !== null ? `${d.chaldean.destiny.compound} → ` : ""}{d.chaldean.destiny.root}{d.chaldean.numberMeaning.planet ? ` · ${d.chaldean.numberMeaning.planet}` : ""}</dd></div>
        ) : null}
        {d.personalDay ? <div><dt>{t("person.summary.personalDayAt", { date: fmtIsoDay(d.personalDay.targetDate, locale) })}</dt><dd>{d.personalDay.personalDay}</dd></div> : null}
      </dl>
      {/* c.summary: motor/sağlayıcı anlatı metni (snapshot) → çevrilmez. */}
      {c?.summary ? <p className="nk-num-desc" style={{ marginTop: 14 }}>{c.summary}</p> : null}
    </div>
  );
}

// ── Pisagor çekirdek ───────────────────────────────────────────────────────────────────────────
export function CorePanel({ c }: { c: ChartResult }) {
  const t = useTranslations("numerology.classic");
  const bp = c.birthDayProfile;
  const ms = c.maturityStatus;
  return (
    <>
      <h2 className="nk-sr-only">{t("person.core.srTitle")}</h2>
      <div className="nk-num-grid">
        {CORE_ORDER.map((o) => (
          <NumberCard key={o.key} name={t(`labels.core.${o.key}`)} sub={t(`person.coreSub.${o.key}`)} n={c.core[o.key]}
            extra={o.key === "maturity" && ms ? <p className="nk-num-key">{t("person.core.maturityLine", { status: ms.isActive ? t("person.core.maturityActive") : t("person.core.maturityInactive"), range: String(ms.activationRange), age: String(ms.currentAge) })}</p> : null} />
        ))}
      </div>
      {bp ? (
        <div className="nk-card nk-panel" style={{ marginTop: 14 }}>
          <h2 className="nk-h2">{t("labels.core.birthDayProfile")} · {bp.day}</h2>
          {/* bp.title / keywords / description / strengths / challenges: motor metni (snapshot) → çevrilmez. */}
          <p className="nk-lead">{bp.title}{bp.reducesTo ? ` · ${t("person.core.root", { n: String(bp.reducesTo) })}` : ""}</p>
          {bp.keywords.length ? <p className="nk-num-key" style={{ marginTop: 6 }}>{bp.keywords.join(" · ")}</p> : null}
          {bp.description ? <p className="nk-num-desc" style={{ marginTop: 8 }}>{bp.description}</p> : null}
          <div className="nk-section-grid" style={{ marginTop: 10 }}>
            {bp.strengths.length ? <div><p className="nk-mh">{t("labels.meaning.strengths")}</p><ul className="nk-bullets">{bp.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div> : null}
            {bp.challenges.length ? <div><p className="nk-mh">{t("labels.meaning.challenges")}</p><ul className="nk-bullets">{bp.challenges.map((s, i) => <li key={i}>{s}</li>)}</ul></div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

// ── Karmik ─────────────────────────────────────────────────────────────────────────────────────
export function KarmicPanel({ c }: { c: ChartResult }) {
  const t = useTranslations("numerology.classic");
  const kl = c.karmicLessons;
  const kd = c.karmicDebt;
  const hp = c.hiddenPassion;
  const sc = c.subconsciousSelf;
  const missing = new Set(kl.missingNumbers);
  return (
    <>
      <div className="nk-section-grid">
        <div className="nk-card nk-panel">
          <div className="nk-num-top">
            <div>
              <h2 className="nk-h2">{t("person.karmic.lessonsTitle")}</h2>
              <p className="nk-lead">{t("person.karmic.lessonsLead")}</p>
            </div>
            <VerificationBadge v={kl.verification} />
          </div>
          <div className="nk-missing-grid" role="list" aria-label={t("person.karmic.gridLabel")} data-testid="karmic-grid">
            {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => {
              const cnt = kl.presentNumbers[String(n)] ?? 0;
              const zero = missing.has(n) || cnt === 0;
              return (
                <div key={n} className={`nk-mcell${zero ? " nk-zero" : ""}${hp && hp.allPassions.includes(n) ? " nk-high" : ""}`} role="listitem" aria-label={`${n}: ${zero ? t("person.karmic.cellMissing") : t("person.karmic.cellLetters", { n: String(cnt) })}`}>
                  <b>{n}</b>
                  <span>{zero ? t("person.karmic.cellZero") : t("person.karmic.cellLetters", { n: String(cnt) })}</span>
                </div>
              );
            })}
          </div>
          <div className="nk-legend">
            <span><i style={{ background: "var(--bad-bg)" }} />{t("person.karmic.legendMissing")}</span>
            {hp ? <span><i style={{ background: "#e6f2fb" }} />{t("person.karmic.legendHigh", { list: hp.allPassions.join(", ") || String(hp.number) })}</span> : null}
          </div>
          <MismatchNote v={kl.verification} />
          {kl.lessons.length ? (
            <ul className="nk-list">
              {kl.lessons.map((l) => (
                <li key={l.number}>
                  <span className="nk-n">{l.number}</span>
                  <div>
                    <b>{l.lesson}</b>
                    {l.description ? <p>{l.description}</p> : null}
                    {l.howToOvercome ? <p><b>{t("person.karmic.howToOvercome")}</b> {l.howToOvercome}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="nk-empty">{t("person.karmic.noMissing")}</p>}
        </div>
        <div className="nk-card nk-panel">
          <div className="nk-num-top">
            <div>
              <h2 className="nk-h2">{t("person.karmic.debtsTitle")}</h2>
              <p className="nk-lead">{t("person.karmic.debtsLead")}</p>
            </div>
            <VerificationBadge v={kd.verification} />
          </div>
          <MismatchNote v={kd.verification} />
          {kd.hasKarmicDebt && kd.meanings.length ? (
            <ul className="nk-list">
              {kd.meanings.map((m) => (
                <li key={m.number}>
                  <span className="nk-n">{m.number}</span>
                  <div>
                    {m.description ? <p>{m.description}</p> : null}
                    {m.challenge ? <p><b>{t("person.karmic.challenge")}</b> {m.challenge}</p> : null}
                    {m.resolution ? <p><b>{t("person.karmic.resolution")}</b> {m.resolution}</p> : null}
                    <div className="nk-badges" style={{ marginTop: 6 }}>
                      {CORE_ORDER.filter((o) => c.core[o.key].karmicDebt === m.number).map((o) => <span key={o.key} className="nk-badge nk-karmic">{t(`labels.core.${o.key}`)} {m.number}/{c.core[o.key].value}</span>)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="nk-list"><li><span className="nk-n" style={{ color: "var(--b-ink-soft)" }}>—</span><div><b>13 · 14 · 16 · 19</b><p>{kd.message ?? t("person.karmic.noDebt")}</p></div></li></ul>
          )}
        </div>
      </div>
      <div className="nk-section-grid" style={{ marginTop: 14 }}>
        {hp ? (
          <div className="nk-card nk-num-card">
            <div className="nk-num-top"><div><h3 className="nk-num-name">{t("labels.core.hiddenPassion")}</h3><p className="nk-num-key">{t("person.karmic.hpKey", { n: String(hp.count) })}</p></div><VerificationBadge v={hp.verification} /></div>
            <div className="nk-num-val"><span className="nk-num-big">{hp.number}</span></div>
            {hp.title ? <p className="nk-num-desc"><b>{hp.title}</b></p> : null}
            {hp.description ? <p className="nk-num-desc">{hp.description}</p> : null}
            <MismatchNote v={hp.verification} />
          </div>
        ) : null}
        {sc ? (
          <div className="nk-card nk-num-card">
            <div className="nk-num-top"><div><h3 className="nk-num-name">{t("labels.core.subconsciousSelf")}</h3><p className="nk-num-key">{t("person.karmic.scKey")}</p></div><VerificationBadge v={sc.verification} /></div>
            <div className="nk-num-val"><span className="nk-num-big">{sc.number}</span></div>
            {sc.title ? <p className="nk-num-desc"><b>{sc.title}</b></p> : null}
            {sc.description ? <p className="nk-num-desc">{sc.description}</p> : null}
            <MismatchNote v={sc.verification} />
          </div>
        ) : null}
      </div>
    </>
  );
}

// ── Zamanlama ──────────────────────────────────────────────────────────────────────────────────
function Timeline({ periods, kind, now, label }: { periods: Period[]; kind: "p" | "c"; now: Period | null; label: string }) {
  const t = useTranslations("numerology.classic.person.timing");
  const cols = periods.map((p, i) => (p.endAge === null || i === periods.length - 1 ? 21 : Math.max(4, p.endAge - p.startAge + 1)));
  const tl = cols.map((x) => `${x}fr`).join(" ");
  return (
    <>
      <div className="nk-timeline" role="list" aria-label={label} style={{ ["--nk-tl" as string]: tl }}>
        {periods.map((p) => {
          const isNow = now?.position === p.position;
          const ages = `${p.startAge}${p.endAge === null ? "+" : `–${p.endAge}`}`;
          return (
            <div key={p.position} className={`nk-tl-seg nk-${kind}${isNow ? " nk-now" : ""}`} role="listitem" aria-current={isNow ? "step" : undefined}>
              <b>{p.number}</b>
              <small>{t(kind === "p" ? "segPinnacle" : "segChallenge", { position: String(p.position), ages })}{isNow ? t("nowSuffix") : ""}</small>
            </div>
          );
        })}
      </div>
      <div className="nk-tl-axis" aria-hidden="true" style={{ ["--nk-tl" as string]: tl }}>
        {periods.map((p) => <span key={p.position}>{p.startAge}{p.endAge === null ? "+" : ""}</span>)}
      </div>
    </>
  );
}

function PeriodList({ periods, kind }: { periods: Period[]; kind: "p" | "c" }) {
  const t = useTranslations("numerology.classic.person.timing");
  return (
    <ul className="nk-list">
      {periods.map((p) => (
        <li key={p.position}>
          <span className="nk-n">{p.number}</span>
          <div>
            {/* p.title / description / lesson / howToOvercome / opportunities / challenges: motor metni (snapshot) → çevrilmez. */}
            <b>{t(kind === "p" ? "periodPinnacle" : "periodChallenge", { position: String(p.position) })}{kind === "c" && isMainChallenge(p) ? ` · ${t("mainLabel")}` : ""}{p.title ? ` · ${p.title}` : ""}</b>
            <span style={{ marginLeft: 8 }}><VerificationBadge v={p.verification} /></span>
            {p.description ? <p>{p.description}</p> : null}
            {p.lesson ? <p><b>{t("lesson")}</b> {p.lesson}</p> : null}
            {p.howToOvercome ? <p><b>{t("howToOvercome")}</b> {p.howToOvercome}</p> : null}
            {p.opportunities.length ? <p><b>{t("opportunities")}</b> {p.opportunities.join(" · ")}</p> : null}
            {p.challenges.length ? <p><b>{t("challenges")}</b> {p.challenges.join(" · ")}</p> : null}
            <MismatchNote v={p.verification} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Günün Sayısı — Kişisel Gün'den AYRI kart; sembolik olduğu açıkça yazılır, doğrulama rozeti "doğrulanamaz". */
export function DailyCard({ x }: { x: DailyResult }) {
  const t = useTranslations("numerology.classic");
  const locale = useLocale();
  const n = x.number;
  return (
    <div className="nk-card nk-panel" data-testid="daily-card">
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, alignItems: "flex-end" }}>
        <div>
          <h2 className="nk-h2">{t("person.daily.title")}</h2>
          <p className="nk-lead">
            {t("person.daily.lead", { date: fmtIsoDay(x.date, locale), seed: x.seedMode === "common" ? t("person.daily.seedCommon") : t("person.daily.seedPersonal") })}
          </p>
        </div>
        <span className="nk-badge">{t("person.daily.badge")}</span>
      </div>
      <div className="nk-cycle-grid" style={{ marginTop: 10 }}>
        <div className="nk-cycle">
          <p className="nk-label-cap">{t("person.daily.numberCap")}</p><b>{n.value}</b>
          {n.meaning?.title ? <p className="nk-num-desc">{n.meaning.title}</p> : null}
          {n.type === "master" ? <span className="nk-badge nk-ice">{t("labels.numberKind.master")}</span> : null}
        </div>
      </div>
      {/* dailyMessage / meaning: sağlayıcı metni (snapshot) → çevrilmez. */}
      {x.dailyMessage ? <p className="nk-num-desc" style={{ marginTop: 10 }}>{x.dailyMessage}</p> : null}
      {n.meaning?.keywords?.length ? <p className="nk-num-desc" style={{ marginTop: 6 }}><b>{t("person.daily.keywords")}</b> {n.meaning.keywords.slice(0, 8).join(", ")}</p> : null}
    </div>
  );
}

export function TimingPanel({ d }: { d: PersonData }) {
  const t = useTranslations("numerology.classic.person.timing");
  const locale = useLocale();
  const c = d.chart;
  const age = ageAt(d.birth, d.referenceDate);
  const nowP = c ? currentPeriod(c.pinnacles, age) : null;
  // D3: "şu an" yalnız yaş dönemine bağlı zorluklardan seçilir; 3. (ana) zorluk tüm yaşam için ayrı gösterilir.
  const nowC = c ? currentPeriodicChallenge(c.challenges, age) : null;
  const mainC = c ? mainChallenge(c.challenges) : null;
  const perC = c ? periodicChallenges(c.challenges) : [];
  const py = c?.personalYear ?? null;
  const pm = py?.personalMonth ?? null;
  const pd = d.personalDay;
  const refMonth = d.referenceDate ? Number(d.referenceDate.slice(5, 7)) : null;
  const refDay = d.referenceDate ? Number(d.referenceDate.slice(8, 10)) : null;
  return (
    <>
      {c && (c.pinnacles.length || c.challenges.length) ? (
        <div className="nk-card nk-panel">
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, alignItems: "flex-end" }}>
            <div><h2 className="nk-h2">{t("pcTitle")}</h2><p className="nk-lead">{t("pcLead")}</p></div>
            {age !== null ? <span className="nk-badge nk-ice nk-now-marker">{t("ageBadge", { age: String(age) })}{nowP ? t("periodSuffix", { n: String(nowP.position) }) : ""}</span> : null}
          </div>
          {c.pinnacles.length ? (<><p className="nk-label-cap nk-tl-row-label">{t("pinnacles")}</p><Timeline periods={c.pinnacles} kind="p" now={nowP} label={t("pinnacles")} /></>) : null}
          {perC.length ? (<><p className="nk-label-cap nk-tl-row-label">{t("challengesPeriods")}</p><Timeline periods={perC} kind="c" now={nowC} label={t("challengesList")} /></>) : null}
          {mainC ? (
            <div className="nk-timeline" role="list" aria-label={t("mainAria")} style={{ ["--nk-tl" as string]: "1fr" }} data-testid="main-challenge">
              <div className="nk-tl-seg nk-c" role="listitem">
                <b>{mainC.number}</b>
                <small>{t("mainSeg")}</small>
              </div>
            </div>
          ) : null}
          {mainC && age !== null && !nowC ? <p className="nk-lead" style={{ marginTop: 6 }} data-testid="no-periodic-challenge">{t("noPeriodic")}</p> : null}
          <details className="nk-trace" style={{ marginTop: 12 }}>
            <summary>{t("details")}</summary>
            <div className="nk-section-grid" style={{ marginTop: 8 }}>
              <div><p className="nk-mh">{t("pinnacles")}</p><PeriodList periods={c.pinnacles} kind="p" /></div>
              <div><p className="nk-mh">{t("challengesList")}</p><PeriodList periods={c.challenges} kind="c" /></div>
            </div>
          </details>
        </div>
      ) : null}
      <div className="nk-card nk-panel">
        <h2 className="nk-h2">{t("cyclesTitle")}</h2>
        <p className="nk-lead">{d.referenceDate ? t("cyclesTarget", { date: fmtIsoDay(d.referenceDate, locale) }) : ""}{t("cyclesLead")}</p>
        <div className="nk-cycle-grid">
          {py ? (
            <div className="nk-cycle" data-testid="cycle-year">
              <p className="nk-label-cap">{t("personalYear")}</p><b>{py.personalYear}</b>
              {py.theme ? <p className="nk-num-desc">{py.theme}</p> : null}
              <VerificationBadge v={py.verification} />
            </div>
          ) : null}
          {pm ? (
            <div className="nk-cycle">
              <p className="nk-label-cap">{t("personalMonth")}{refMonth ? ` · ${monthName(refMonth, locale)}` : ""}</p><b>{pm.personalMonth}</b>
              {pm.theme ? <p className="nk-num-desc">{pm.theme}</p> : null}
              <VerificationBadge v={pm.verification} />
            </div>
          ) : null}
          {pd ? (
            <div className="nk-cycle">
              <p className="nk-label-cap">{t("personalDay", { date: fmtIsoDay(pd.targetDate, locale) || String(refDay) })}</p><b>{pd.personalDay}</b>
              {pd.theme ? <p className="nk-num-desc">{pd.theme}</p> : null}
              <VerificationBadge v={pd.verification} />
            </div>
          ) : null}
        </div>
        {/* theme / forecast / advice / guidance: sağlayıcı metni (snapshot) → çevrilmez. */}
        {py?.forecast ? <p className="nk-num-desc" style={{ marginTop: 12 }}>{py.forecast}</p> : null}
        {py?.advice ? <p className="nk-num-desc" style={{ marginTop: 6 }}><b>{t("advice")}</b> {py.advice}</p> : null}
        {pd?.guidance ? <p className="nk-num-desc" style={{ marginTop: 6 }}><b>{t("guidance")}</b> {pd.guidance}</p> : null}
        {py ? <MismatchNote v={py.verification} /> : null}
      </div>
      {d.daily ? <DailyCard x={d.daily} /> : null}
    </>
  );
}

// ── Köprüler ───────────────────────────────────────────────────────────────────────────────────
export function BridgesPanel({ b }: { b: BridgeResult }) {
  const t = useTranslations("numerology.classic");
  const items: [keyof BridgeResult, BridgeItem][] = (Object.keys(BRIDGE_LABELS) as (keyof BridgeResult)[]).filter((k) => b[k]).map((k) => [k, b[k]]);
  return (
    <div className="nk-card nk-panel">
      <h2 className="nk-h2">{t("person.bridges.title")}</h2>
      <p className="nk-lead">{t("person.bridges.lead")}</p>
      <ul className="nk-list">
        {items.map(([k, it]) => (
          <li key={k}>
            <span className="nk-n">{it.bridge}</span>
            <div>
              <b>{t(`labels.bridge.${k}`)}</b> <VerificationBadge v={it.verification} />
              <p>|{it.from.number} − {it.to.number}| = {it.bridge}{it.meaning ? ` · ${it.meaning}` : ""}</p>
              <MismatchNote v={it.verification} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── İsim harfleri ──────────────────────────────────────────────────────────────────────────────
export function LettersPanel({ c }: { c: ChartResult }) {
  const t = useTranslations("numerology.classic");
  const nl = c.nameLetters;
  const cards: { label: string; sub: string; letter: string; number: number | null; meaning: string; v: ClassicNumber["verification"] }[] = [];
  if (nl.cornerstone) cards.push({ label: t("labels.core.cornerstone"), sub: t("person.letters.cornerstone"), letter: nl.cornerstone.letter, number: nl.cornerstone.number, meaning: nl.cornerstone.meaning, v: nl.cornerstone.verification });
  if (nl.capstone) cards.push({ label: t("labels.core.capstone"), sub: t("person.letters.capstone"), letter: nl.capstone.letter, number: nl.capstone.number, meaning: nl.capstone.meaning, v: nl.capstone.verification });
  // NK-002: ilk adda A/E/I/O/U yoksa klasik ekol Y'yi sesli sayar (belgelenen kümede yok) → açıkça etiketlenir.
  if (nl.firstVowel) cards.push({ label: t("labels.core.firstVowel"), sub: nl.firstVowel.letter === "Y" ? t("person.letters.firstVowelY") : t("person.letters.firstVowel"), letter: nl.firstVowel.letter, number: null, meaning: nl.firstVowel.meaning, v: nl.firstVowel.verification });
  return (
    <div className="nk-kalde-grid">
      {cards.map((x) => (
        <article key={x.label} className="nk-card nk-num-card">
          <div className="nk-num-top"><div><h3 className="nk-num-name">{x.label}</h3><p className="nk-num-key">{x.sub}</p></div><VerificationBadge v={x.v} /></div>
          <div className="nk-num-val"><span className="nk-num-big">{x.letter}</span>{x.number !== null ? <span className="nk-num-sub">= {x.number}</span> : null}</div>
          {x.meaning ? <p className="nk-num-desc">{x.meaning}</p> : null}
          <MismatchNote v={x.v} />
        </article>
      ))}
    </div>
  );
}

// ── Kalde ──────────────────────────────────────────────────────────────────────────────────────
const NATURE_CLASS = { fortunate: "nk-ok", unfortunate: "nk-bad", mixed: "nk-warn" } as const;

function KaldeCard({ title, sub, p, planet }: { title: string; sub: string; p: ChaldeanPart; planet?: string | null }) {
  const t = useTranslations("numerology.classic");
  const cm = p.compoundMeaning;
  return (
    <article className="nk-card nk-num-card">
      <div className="nk-num-top"><div><h3 className="nk-num-name">{title}</h3><p className="nk-num-key">{sub}</p></div><VerificationBadge v={p.verification} /></div>
      <div className="nk-compound">
        {p.compound !== null ? (<><span className="nk-big">{p.compound}</span><span className="nk-arrow" aria-hidden="true">→</span><span className="nk-root-n">{p.root}</span><span className="nk-sr-only">{t("person.kalde.sr", { compound: String(p.compound), root: String(p.root) })}</span></>) : <span className="nk-big">{p.root}</span>}
      </div>
      <div className="nk-badges">
        {cm ? <span className={`nk-badge ${NATURE_CLASS[cm.nature]}`}>{t(`labels.compoundNature.${cm.nature}`)}</span> : null}
        {/* planet / cm.name / cm.meaning: sağlayıcı metni (snapshot) → çevrilmez. */}
        {planet ? <span className="nk-badge">{planet}</span> : null}
        {p.karmicDebt ? <span className="nk-badge nk-karmic">{t("kit.karmicDebt", { value: String(p.karmicDebt) })}</span> : null}
      </div>
      {cm?.name ? <p className="nk-num-desc"><b>{cm.name}</b></p> : null}
      {cm?.meaning ? <p className="nk-num-desc">{cm.meaning}</p> : null}
      <MismatchNote v={p.verification} />
      <Trace text={p.calculation} />
    </article>
  );
}

export function KaldePanel({ k }: { k: ChaldeanResult }) {
  const t = useTranslations("numerology.classic");
  return (
    <>
      <div className="nk-card nk-panel" style={{ marginBottom: 14 }}>
        <h2 className="nk-h2">{t("person.kalde.title")}</h2>
        <p className="nk-lead">{t("person.kalde.lead")}</p>
        <div className="nk-badges" style={{ marginTop: 10 }}>
          <span className="nk-badge nk-ok">{t("labels.compoundNature.fortunate")}</span><span className="nk-badge nk-bad">{t("labels.compoundNature.unfortunate")}</span><span className="nk-badge nk-warn">{t("labels.compoundNature.mixed")}</span>
          <span className="nk-muted" style={{ fontSize: 12.5 }}>{t("person.kalde.natureLegend")}</span>
        </div>
        {k.caution ? <p className="nk-hint" style={{ marginTop: 8 }}>{t("person.kalde.caution")}</p> : null}
      </div>
      <div className="nk-kalde-grid">
        <KaldeCard title={t("person.kalde.destiny")} sub={t("person.kalde.fullName")} p={k.destiny} planet={k.numberMeaning.planet} />
        <KaldeCard title={t("person.kalde.soul")} sub={t("person.kalde.vowels")} p={k.soulUrge} />
        <KaldeCard title={t("person.kalde.personality")} sub={t("person.kalde.consonants")} p={k.personality} />
      </div>
      {k.numberMeaning.title || k.numberMeaning.meaning ? (
        <div className="nk-card nk-panel" style={{ marginTop: 14 }}>
          <h2 className="nk-h2">{t("person.kalde.rootHeading", { n: String(k.numberMeaning.number) })}{k.numberMeaning.planet ? ` · ${k.numberMeaning.planet}` : ""}</h2>
          {k.numberMeaning.title ? <p className="nk-lead">{k.numberMeaning.title}</p> : null}
          {k.numberMeaning.keywords.length ? <p className="nk-num-key" style={{ marginTop: 6 }}>{k.numberMeaning.keywords.join(" · ")}</p> : null}
          {k.numberMeaning.meaning ? <p className="nk-num-desc" style={{ marginTop: 6 }}>{k.numberMeaning.meaning}</p> : null}
        </div>
      ) : null}
    </>
  );
}

// ── İki sistem ─────────────────────────────────────────────────────────────────────────────────
function SysRow({ label, py, ch, same }: { label: string; py: ReactNode; ch: ReactNode; same: boolean | null }) {
  const t = useTranslations("numerology.classic");
  return (
    <tr>
      <th scope="row" data-l={t("person.dual.colConcept")} style={{ fontWeight: 700 }}>{label}</th>
      <td className="nk-v" data-l={t("other.colPythagorean")}>{py}</td>
      <td className="nk-v" data-l={t("other.colChaldean")}>{ch}</td>
      <td data-l={t("other.colAgreement")}>{same === null ? <span className="nk-badge">—</span> : same ? <span className="nk-badge nk-ok">{t("other.sameRoot")}</span> : <span className="nk-badge">{t("other.different")}</span>}</td>
    </tr>
  );
}

const pyShow = (n: ClassicNumber) => compoundDisplay(n) ?? String(n.value);
const chShow = (p: ChaldeanPart) => (p.compound !== null ? `${p.compound}/${p.root}` : String(p.root));

export function DualPanel({ dual, chart, chaldean }: { dual: DualResult; chart: ChartResult | null; chaldean: ChaldeanResult | null }) {
  const t = useTranslations("numerology.classic");
  return (
    <div className="nk-card nk-panel">
      <div className="nk-num-top">
        <div>
          <h2 className="nk-h2">{t("person.dual.title")}</h2>
          <p className="nk-lead">{t("person.dual.lead")}</p>
        </div>
        <VerificationBadge v={dual.verification} />
      </div>
      <table className="nk-sys-table">
        <caption className="nk-sr-only">{t("person.dual.caption")}</caption>
        <thead><tr><th scope="col">{t("person.dual.colConcept")}</th><th scope="col">{t("other.colPythagorean")}</th><th scope="col">{t("other.colChaldean")}</th><th scope="col">{t("other.colAgreement")}</th></tr></thead>
        <tbody>
          <SysRow label={t("person.dual.rowName")} py={pyShow(dual.pythagorean)} ch={<>{chShow(dual.chaldean)}{dual.chaldean.planet ? ` · ${dual.chaldean.planet}` : ""}</>} same={dual.agreement} />
          {chart && chaldean ? <SysRow label={t("person.dual.rowSoul")} py={pyShow(chart.core.soulUrge)} ch={chShow(chaldean.soulUrge)} same={digitRoot(chart.core.soulUrge.value) === chaldean.soulUrge.root} /> : null}
          {chart && chaldean ? <SysRow label={t("person.dual.rowPersonality")} py={pyShow(chart.core.personality)} ch={chShow(chaldean.personality)} same={digitRoot(chart.core.personality.value) === chaldean.personality.root} /> : null}
        </tbody>
      </table>
      {/* dual.note / title / keywords: sağlayıcı metni (snapshot) → çevrilmez. */}
      {dual.note ? <p className="nk-num-desc" style={{ marginTop: 10 }}>{dual.note}</p> : null}
      <MismatchNote v={dual.verification} />
      <div className="nk-section-grid" style={{ marginTop: 12 }}>
        <div><p className="nk-mh">{t("other.pythagoreanTitle", { title: dual.pythagorean.title ?? "" })}</p>{dual.pythagorean.keywords.length ? <p className="nk-num-key">{dual.pythagorean.keywords.join(" · ")}</p> : null}<NumberBadges n={dual.pythagorean} /></div>
        <div><p className="nk-mh">{t("person.dual.chaldeanTitle", { title: dual.chaldean.title ?? "" })}</p>{dual.chaldean.caution ? <span className="nk-badge nk-bad">{t("person.dual.caution")}</span> : null}</div>
      </div>
    </div>
  );
}
