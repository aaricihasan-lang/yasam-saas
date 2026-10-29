"use client";

// Kişi analizi sekme panelleri (prototip sonuc.html). Veri yalnız kayıtlı normalize sonuçtan okunur.

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
import { BRIDGE_LABELS, COMPOUND_NATURE_LABELS, CORE_NUMBER_LABELS } from "@/lib/numeroloji-klasik/labels";
import { MONTHS_TR, fmtIsoDay } from "../../_lib/format";
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

const CORE_ORDER: { key: keyof ChartResult["core"]; label: string; sub: string }[] = [
  { key: "lifePath", label: CORE_NUMBER_LABELS.lifePath, sub: "Doğum tarihinden" },
  { key: "expression", label: CORE_NUMBER_LABELS.expression, sub: "Tam adın tüm harfleri" },
  { key: "soulUrge", label: CORE_NUMBER_LABELS.soulUrge, sub: "Sesli harfler" },
  { key: "personality", label: CORE_NUMBER_LABELS.personality, sub: "Sessiz harfler" },
  { key: "birthDay", label: CORE_NUMBER_LABELS.birthDay, sub: "Doğduğu gün" },
  { key: "maturity", label: CORE_NUMBER_LABELS.maturity, sub: "Yaşam Yolu + İfade" },
];

const digitRoot = (n: number) => (n <= 0 ? 0 : 1 + ((n - 1) % 9));

// ── Özet ───────────────────────────────────────────────────────────────────────────────────────
export function SummaryPanel({ d }: { d: PersonData }) {
  const c = d.chart;
  const age = ageAt(d.birth, d.referenceDate);
  const cur = c ? currentPeriod(c.pinnacles, age) : null;
  const refYear = d.referenceDate?.slice(0, 4) ?? null;
  return (
    <div className="nk-card nk-panel">
      <h2 className="nk-h2">Özet</h2>
      <p className="nk-lead">Çekirdek sayılar bir bakışta. Ayrıntı ve hesap izi ilgili sekmede.</p>
      {c ? (
        <div className="nk-summary-grid" style={{ marginTop: 14 }}>
          {CORE_ORDER.map((o) => {
            const n = c.core[o.key];
            const cd = compoundDisplay(n);
            return (
              <div key={o.key} className="nk-mini" data-testid="summary-mini">
                <b>{n.value}</b>
                <span>{o.label}</span>
                <div className="nk-badges">
                  {n.karmicDebt ? <span className="nk-badge nk-karmic">Karmik {n.karmicDebt}</span> : null}
                  {n.type === "master" ? <span className="nk-badge nk-master">Usta</span> : null}
                  {cd && !n.karmicDebt ? <span className="nk-badge">{cd}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="nk-empty">Pisagor çekirdek harita bu analizde yok.</p>
      )}
      <dl className="nk-kv">
        {c ? <div><dt>Kişisel yıl{refYear ? ` (${refYear})` : ""}</dt><dd>{c.personalYear.personalYear}</dd></div> : null}
        {c && cur ? <div><dt>Şu anki zirve ({cur.startAge}–{cur.endAge ?? "…"})</dt><dd>{cur.number}</dd></div> : null}
        {c ? <div><dt>Eksik sayı (karmik ders)</dt><dd>{c.karmicLessons.missingNumbers.length ? c.karmicLessons.missingNumbers.join(", ") : "Yok"}</dd></div> : null}
        {d.chaldean ? (
          <div><dt>Kalde kader sayısı</dt><dd>{d.chaldean.destiny.compound !== null ? `${d.chaldean.destiny.compound} → ` : ""}{d.chaldean.destiny.root}{d.chaldean.numberMeaning.planet ? ` · ${d.chaldean.numberMeaning.planet}` : ""}</dd></div>
        ) : null}
        {d.personalDay ? <div><dt>Kişisel gün ({fmtIsoDay(d.personalDay.targetDate)})</dt><dd>{d.personalDay.personalDay}</dd></div> : null}
      </dl>
      {c?.summary ? <p className="nk-num-desc" style={{ marginTop: 14 }}>{c.summary}</p> : null}
    </div>
  );
}

// ── Pisagor çekirdek ───────────────────────────────────────────────────────────────────────────
export function CorePanel({ c }: { c: ChartResult }) {
  const bp = c.birthDayProfile;
  const ms = c.maturityStatus;
  return (
    <>
      <h2 className="nk-sr-only">Pisagor Çekirdek Sayılar</h2>
      <div className="nk-num-grid">
        {CORE_ORDER.map((o) => (
          <NumberCard key={o.key} name={o.label} sub={o.sub} n={c.core[o.key]}
            extra={o.key === "maturity" && ms ? <p className="nk-num-key">{ms.isActive ? "Olgunluk sayısı etkin" : "Olgunluk sayısı henüz etkin değil"} · {ms.activationRange} · şu anki yaş {ms.currentAge}</p> : null} />
        ))}
      </div>
      {bp ? (
        <div className="nk-card nk-panel" style={{ marginTop: 14 }}>
          <h2 className="nk-h2">{CORE_NUMBER_LABELS.birthDayProfile} · {bp.day}</h2>
          <p className="nk-lead">{bp.title}{bp.reducesTo ? ` · kök ${bp.reducesTo}` : ""}</p>
          {bp.keywords.length ? <p className="nk-num-key" style={{ marginTop: 6 }}>{bp.keywords.join(" · ")}</p> : null}
          {bp.description ? <p className="nk-num-desc" style={{ marginTop: 8 }}>{bp.description}</p> : null}
          <div className="nk-section-grid" style={{ marginTop: 10 }}>
            {bp.strengths.length ? <div><p className="nk-mh">Güçlü yönler</p><ul className="nk-bullets">{bp.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div> : null}
            {bp.challenges.length ? <div><p className="nk-mh">Zorlayıcı yönler</p><ul className="nk-bullets">{bp.challenges.map((s, i) => <li key={i}>{s}</li>)}</ul></div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

// ── Karmik ─────────────────────────────────────────────────────────────────────────────────────
export function KarmicPanel({ c }: { c: ChartResult }) {
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
              <h2 className="nk-h2">Karmik dersler</h2>
              <p className="nk-lead">Tam addaki harflerin 1–9 dağılımı. Hiç bulunmayan sayı, karmik ders olarak okunur.</p>
            </div>
            <VerificationBadge v={kl.verification} />
          </div>
          <div className="nk-missing-grid" role="list" aria-label="Sayı dağılımı" data-testid="karmic-grid">
            {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => {
              const cnt = kl.presentNumbers[String(n)] ?? 0;
              const zero = missing.has(n) || cnt === 0;
              return (
                <div key={n} className={`nk-mcell${zero ? " nk-zero" : ""}${hp && hp.allPassions.includes(n) ? " nk-high" : ""}`} role="listitem" aria-label={`${n}: ${zero ? "eksik" : `${cnt} harf`}`}>
                  <b>{n}</b>
                  <span>{zero ? "0 · eksik" : `${cnt} harf`}</span>
                </div>
              );
            })}
          </div>
          <div className="nk-legend">
            <span><i style={{ background: "var(--bad-bg)" }} />Eksik sayı</span>
            {hp ? <span><i style={{ background: "#e6f2fb" }} />En sık (gizli tutku: {hp.allPassions.join(", ") || hp.number})</span> : null}
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
                    {l.howToOvercome ? <p><b>Aşma yolu:</b> {l.howToOvercome}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="nk-empty">Bu adda eksik sayı yok.</p>}
        </div>
        <div className="nk-card nk-panel">
          <div className="nk-num-top">
            <div>
              <h2 className="nk-h2">Karmik borçlar</h2>
              <p className="nk-lead">13 · 14 · 16 · 19 ara toplamları.</p>
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
                    {m.challenge ? <p><b>Zorluk:</b> {m.challenge}</p> : null}
                    {m.resolution ? <p><b>Çözüm:</b> {m.resolution}</p> : null}
                    <div className="nk-badges" style={{ marginTop: 6 }}>
                      {CORE_ORDER.filter((o) => c.core[o.key].karmicDebt === m.number).map((o) => <span key={o.key} className="nk-badge nk-karmic">{o.label} {m.number}/{c.core[o.key].value}</span>)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="nk-list"><li><span className="nk-n" style={{ color: "var(--b-ink-soft)" }}>—</span><div><b>13 · 14 · 16 · 19</b><p>{kd.message ?? "Bu analizde karmik borç görünmüyor."}</p></div></li></ul>
          )}
        </div>
      </div>
      <div className="nk-section-grid" style={{ marginTop: 14 }}>
        {hp ? (
          <div className="nk-card nk-num-card">
            <div className="nk-num-top"><div><h3 className="nk-num-name">{CORE_NUMBER_LABELS.hiddenPassion}</h3><p className="nk-num-key">Adda en sık tekrar eden değer · {hp.count} kez</p></div><VerificationBadge v={hp.verification} /></div>
            <div className="nk-num-val"><span className="nk-num-big">{hp.number}</span></div>
            {hp.title ? <p className="nk-num-desc"><b>{hp.title}</b></p> : null}
            {hp.description ? <p className="nk-num-desc">{hp.description}</p> : null}
            <MismatchNote v={hp.verification} />
          </div>
        ) : null}
        {sc ? (
          <div className="nk-card nk-num-card">
            <div className="nk-num-top"><div><h3 className="nk-num-name">{CORE_NUMBER_LABELS.subconsciousSelf}</h3><p className="nk-num-key">Adda bulunan farklı değer adedi</p></div><VerificationBadge v={sc.verification} /></div>
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
              <small>{p.position}. {kind === "p" ? "zirve" : "zorluk"} · {ages} yaş{isNow ? " · şu an" : ""}</small>
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
  return (
    <ul className="nk-list">
      {periods.map((p) => (
        <li key={p.position}>
          <span className="nk-n">{p.number}</span>
          <div>
            <b>{p.position}. {kind === "p" ? "zirve" : "zorluk"}{p.title ? ` · ${p.title}` : ""}</b>
            <span style={{ marginLeft: 8 }}><VerificationBadge v={p.verification} /></span>
            {p.description ? <p>{p.description}</p> : null}
            {p.lesson ? <p><b>Ders:</b> {p.lesson}</p> : null}
            {p.howToOvercome ? <p><b>Aşma yolu:</b> {p.howToOvercome}</p> : null}
            {p.opportunities.length ? <p><b>Fırsatlar:</b> {p.opportunities.join(" · ")}</p> : null}
            {p.challenges.length ? <p><b>Zorluklar:</b> {p.challenges.join(" · ")}</p> : null}
            <MismatchNote v={p.verification} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Günün Sayısı — Kişisel Gün'den AYRI kart; sembolik olduğu açıkça yazılır, doğrulama rozeti "doğrulanamaz". */
export function DailyCard({ x }: { x: DailyResult }) {
  const n = x.number;
  return (
    <div className="nk-card nk-panel" data-testid="daily-card">
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, alignItems: "flex-end" }}>
        <div>
          <h2 className="nk-h2">Günün sayısı (sembolik)</h2>
          <p className="nk-lead">
            {fmtIsoDay(x.date)} · {x.seedMode === "common" ? "Bu güne ait ortak sayı" : "Kişiye özel tohumla üretilen sayı"}. Doğum verisinden hesaplanmaz; yukarıdaki Kişisel Gün ile aynı şey değildir.
          </p>
        </div>
        <span className="nk-badge">Sembolik · doğrulanamaz</span>
      </div>
      <div className="nk-cycle-grid" style={{ marginTop: 10 }}>
        <div className="nk-cycle">
          <p className="nk-label-cap">Günün sayısı</p><b>{n.value}</b>
          {n.meaning?.title ? <p className="nk-num-desc">{n.meaning.title}</p> : null}
          {n.type === "master" ? <span className="nk-badge nk-ice">Usta sayı</span> : null}
        </div>
      </div>
      {x.dailyMessage ? <p className="nk-num-desc" style={{ marginTop: 10 }}>{x.dailyMessage}</p> : null}
      {n.meaning?.keywords?.length ? <p className="nk-num-desc" style={{ marginTop: 6 }}><b>Anahtar sözcükler:</b> {n.meaning.keywords.slice(0, 8).join(", ")}</p> : null}
    </div>
  );
}

export function TimingPanel({ d }: { d: PersonData }) {
  const c = d.chart;
  const age = ageAt(d.birth, d.referenceDate);
  const nowP = c ? currentPeriod(c.pinnacles, age) : null;
  const nowC = c ? currentPeriod(c.challenges, age) : null;
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
            <div><h2 className="nk-h2">Zirveler ve zorluklar</h2><p className="nk-lead">Dört dönem; ilk dönem 36 − Yaşam Yolu yaşında biter, sonraki iki dönem 9’ar yıldır.</p></div>
            {age !== null ? <span className="nk-badge nk-ice nk-now-marker">Hedef tarihte {age} yaş{nowP ? ` · ${nowP.position}. dönem` : ""}</span> : null}
          </div>
          {c.pinnacles.length ? (<><p className="nk-label-cap nk-tl-row-label">Zirveler</p><Timeline periods={c.pinnacles} kind="p" now={nowP} label="Zirveler" /></>) : null}
          {c.challenges.length ? (<><p className="nk-label-cap nk-tl-row-label">Zorluklar</p><Timeline periods={c.challenges} kind="c" now={nowC} label="Zorluklar" /></>) : null}
          <details className="nk-trace" style={{ marginTop: 12 }}>
            <summary>Dönem ayrıntıları</summary>
            <div className="nk-section-grid" style={{ marginTop: 8 }}>
              <div><p className="nk-mh">Zirveler</p><PeriodList periods={c.pinnacles} kind="p" /></div>
              <div><p className="nk-mh">Zorluklar</p><PeriodList periods={c.challenges} kind="c" /></div>
            </div>
          </details>
        </div>
      ) : null}
      <div className="nk-card nk-panel">
        <h2 className="nk-h2">Kişisel döngüler</h2>
        <p className="nk-lead">{d.referenceDate ? `Hedef tarih ${fmtIsoDay(d.referenceDate)} · ` : ""}Klasik yöntemde kişisel yıl 1 Ocak’ta değişir.</p>
        <div className="nk-cycle-grid">
          {py ? (
            <div className="nk-cycle" data-testid="cycle-year">
              <p className="nk-label-cap">Kişisel yıl</p><b>{py.personalYear}</b>
              {py.theme ? <p className="nk-num-desc">{py.theme}</p> : null}
              <VerificationBadge v={py.verification} />
            </div>
          ) : null}
          {pm ? (
            <div className="nk-cycle">
              <p className="nk-label-cap">Kişisel ay{refMonth ? ` · ${MONTHS_TR[refMonth - 1]}` : ""}</p><b>{pm.personalMonth}</b>
              {pm.theme ? <p className="nk-num-desc">{pm.theme}</p> : null}
              <VerificationBadge v={pm.verification} />
            </div>
          ) : null}
          {pd ? (
            <div className="nk-cycle">
              <p className="nk-label-cap">Kişisel gün · {fmtIsoDay(pd.targetDate) || refDay}</p><b>{pd.personalDay}</b>
              {pd.theme ? <p className="nk-num-desc">{pd.theme}</p> : null}
              <VerificationBadge v={pd.verification} />
            </div>
          ) : null}
        </div>
        {py?.forecast ? <p className="nk-num-desc" style={{ marginTop: 12 }}>{py.forecast}</p> : null}
        {py?.advice ? <p className="nk-num-desc" style={{ marginTop: 6 }}><b>Öneri:</b> {py.advice}</p> : null}
        {pd?.guidance ? <p className="nk-num-desc" style={{ marginTop: 6 }}><b>Günün yönlendirmesi:</b> {pd.guidance}</p> : null}
        {py ? <MismatchNote v={py.verification} /> : null}
      </div>
      {d.daily ? <DailyCard x={d.daily} /> : null}
    </>
  );
}

// ── Köprüler ───────────────────────────────────────────────────────────────────────────────────
export function BridgesPanel({ b }: { b: BridgeResult }) {
  const items: [keyof BridgeResult, BridgeItem][] = (Object.keys(BRIDGE_LABELS) as (keyof BridgeResult)[]).filter((k) => b[k]).map((k) => [k, b[k]]);
  return (
    <div className="nk-card nk-panel">
      <h2 className="nk-h2">Köprü sayıları</h2>
      <p className="nk-lead">İki çekirdek sayı arasındaki fark; aralarındaki gerilimi yumuşatan tema.</p>
      <ul className="nk-list">
        {items.map(([k, it]) => (
          <li key={k}>
            <span className="nk-n">{it.bridge}</span>
            <div>
              <b>{BRIDGE_LABELS[k]}</b> <VerificationBadge v={it.verification} />
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
  const nl = c.nameLetters;
  const cards: { label: string; sub: string; letter: string; number: number | null; meaning: string; v: ClassicNumber["verification"] }[] = [];
  if (nl.cornerstone) cards.push({ label: CORE_NUMBER_LABELS.cornerstone, sub: "İlk adın ilk harfi", letter: nl.cornerstone.letter, number: nl.cornerstone.number, meaning: nl.cornerstone.meaning, v: nl.cornerstone.verification });
  if (nl.capstone) cards.push({ label: CORE_NUMBER_LABELS.capstone, sub: "İlk adın son harfi", letter: nl.capstone.letter, number: nl.capstone.number, meaning: nl.capstone.meaning, v: nl.capstone.verification });
  // NK-002: ilk adda A/E/I/O/U yoksa klasik ekol Y'yi sesli sayar (belgelenen kümede yok) → açıkça etiketlenir.
  if (nl.firstVowel) cards.push({ label: CORE_NUMBER_LABELS.firstVowel, sub: nl.firstVowel.letter === "Y" ? "Y burada sesli işlevinde (klasik yöntem uzlaşımı; ilk adda A/E/I/O/U yok)" : "İlk adın ilk sesli harfi", letter: nl.firstVowel.letter, number: null, meaning: nl.firstVowel.meaning, v: nl.firstVowel.verification });
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
  const cm = p.compoundMeaning;
  return (
    <article className="nk-card nk-num-card">
      <div className="nk-num-top"><div><h3 className="nk-num-name">{title}</h3><p className="nk-num-key">{sub}</p></div><VerificationBadge v={p.verification} /></div>
      <div className="nk-compound">
        {p.compound !== null ? (<><span className="nk-big">{p.compound}</span><span className="nk-arrow" aria-hidden="true">→</span><span className="nk-root-n">{p.root}</span><span className="nk-sr-only">bileşik {p.compound}, kök {p.root}</span></>) : <span className="nk-big">{p.root}</span>}
      </div>
      <div className="nk-badges">
        {cm ? <span className={`nk-badge ${NATURE_CLASS[cm.nature]}`}>{COMPOUND_NATURE_LABELS[cm.nature]}</span> : null}
        {planet ? <span className="nk-badge">{planet}</span> : null}
        {p.karmicDebt ? <span className="nk-badge nk-karmic">Karmik borç {p.karmicDebt}</span> : null}
      </div>
      {cm?.name ? <p className="nk-num-desc"><b>{cm.name}</b></p> : null}
      {cm?.meaning ? <p className="nk-num-desc">{cm.meaning}</p> : null}
      <MismatchNote v={p.verification} />
      <Trace text={p.calculation} />
    </article>
  );
}

export function KaldePanel({ k }: { k: ChaldeanResult }) {
  return (
    <>
      <div className="nk-card nk-panel" style={{ marginBottom: 14 }}>
        <h2 className="nk-h2">Kalde (Cheiro) sayıları</h2>
        <p className="nk-lead">Kalde tablosunda 9 harfe atanmaz; bileşik sayı (10–52) ayrıca yorumlanır ve köke indirgenir.</p>
        <div className="nk-badges" style={{ marginTop: 10 }}>
          <span className="nk-badge nk-ok">{COMPOUND_NATURE_LABELS.fortunate}</span><span className="nk-badge nk-bad">{COMPOUND_NATURE_LABELS.unfortunate}</span><span className="nk-badge nk-warn">{COMPOUND_NATURE_LABELS.mixed}</span>
          <span className="nk-muted" style={{ fontSize: 12.5 }}>— bileşik sayının geleneksel niteliği</span>
        </div>
        {k.caution ? <p className="nk-hint" style={{ marginTop: 8 }}>Kader sayısının kökü geleneksel okumada dikkat işaretlidir.</p> : null}
      </div>
      <div className="nk-kalde-grid">
        <KaldeCard title="Kader sayısı" sub="Tam ad" p={k.destiny} planet={k.numberMeaning.planet} />
        <KaldeCard title="Ruh sayısı" sub="Sesli harfler" p={k.soulUrge} />
        <KaldeCard title="Kişilik sayısı" sub="Sessiz harfler" p={k.personality} />
      </div>
      {k.numberMeaning.title || k.numberMeaning.meaning ? (
        <div className="nk-card nk-panel" style={{ marginTop: 14 }}>
          <h2 className="nk-h2">Kök {k.numberMeaning.number}{k.numberMeaning.planet ? ` · ${k.numberMeaning.planet}` : ""}</h2>
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
  return (
    <tr>
      <th scope="row" data-l="Kavram" style={{ fontWeight: 700 }}>{label}</th>
      <td className="nk-v" data-l="Pisagor">{py}</td>
      <td className="nk-v" data-l="Kalde">{ch}</td>
      <td data-l="Uyum">{same === null ? <span className="nk-badge">—</span> : same ? <span className="nk-badge nk-ok">Aynı kök</span> : <span className="nk-badge">Farklı</span>}</td>
    </tr>
  );
}

const pyShow = (n: ClassicNumber) => compoundDisplay(n) ?? String(n.value);
const chShow = (p: ChaldeanPart) => (p.compound !== null ? `${p.compound}/${p.root}` : String(p.root));

export function DualPanel({ dual, chart, chaldean }: { dual: DualResult; chart: ChartResult | null; chaldean: ChaldeanResult | null }) {
  return (
    <div className="nk-card nk-panel">
      <div className="nk-num-top">
        <div>
          <h2 className="nk-h2">İki sistem yan yana</h2>
          <p className="nk-lead">Pisagor ve Kalde farklı harf tablosu kullanır; aynı kavramda farklı sonuç beklenen bir durumdur. Sayılar birleştirilmez.</p>
        </div>
        <VerificationBadge v={dual.verification} />
      </div>
      <table className="nk-sys-table">
        <caption className="nk-sr-only">Pisagor ve Kalde karşılaştırması</caption>
        <thead><tr><th scope="col">Kavram</th><th scope="col">Pisagor</th><th scope="col">Kalde</th><th scope="col">Uyum</th></tr></thead>
        <tbody>
          <SysRow label="İsim (İfade / Kader)" py={pyShow(dual.pythagorean)} ch={<>{chShow(dual.chaldean)}{dual.chaldean.planet ? ` · ${dual.chaldean.planet}` : ""}</>} same={dual.agreement} />
          {chart && chaldean ? <SysRow label="Ruh" py={pyShow(chart.core.soulUrge)} ch={chShow(chaldean.soulUrge)} same={digitRoot(chart.core.soulUrge.value) === chaldean.soulUrge.root} /> : null}
          {chart && chaldean ? <SysRow label="Kişilik" py={pyShow(chart.core.personality)} ch={chShow(chaldean.personality)} same={digitRoot(chart.core.personality.value) === chaldean.personality.root} /> : null}
        </tbody>
      </table>
      {dual.note ? <p className="nk-num-desc" style={{ marginTop: 10 }}>{dual.note}</p> : null}
      <MismatchNote v={dual.verification} />
      <div className="nk-section-grid" style={{ marginTop: 12 }}>
        <div><p className="nk-mh">Pisagor · {dual.pythagorean.title}</p>{dual.pythagorean.keywords.length ? <p className="nk-num-key">{dual.pythagorean.keywords.join(" · ")}</p> : null}<NumberBadges n={dual.pythagorean} /></div>
        <div><p className="nk-mh">Kalde · {dual.chaldean.title}</p>{dual.chaldean.caution ? <span className="nk-badge nk-bad">Dikkat</span> : null}</div>
      </div>
    </div>
  );
}
