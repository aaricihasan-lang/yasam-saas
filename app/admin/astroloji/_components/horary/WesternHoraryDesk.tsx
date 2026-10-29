"use client";

/**
 * Gökyüzü Atlası — Batı Horary (William Lilly) çalışma masası. ÖNİZLEME (NEXT_PUBLIC_ATLAS_HORARY_PREVIEW=1).
 *
 * Akış: soru → tarih/saat/konum → sorulan ev → "Haritayı Oluştur" → sunucuda GERÇEK hesaplama (lib/astrology/horary/western;
 * sağlayıcı çağrısı yok) → çark + temel bulgular + olay çizelgesi; ileri ayrıntılar kapalı <details> bölümlerinde.
 * Soru METNİ yalnız bu ekranda tutulur (sunucuya gönderilmez, kaydedilmez). Kalıcı kayıt / Word / PDF bu sürümde YOK.
 * HÜKÜM ÜRETİLMEZ: motorun aday / bilgi kayıtları adıyla ve kanıtıyla gösterilir.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { WesternHoraryResult } from "@/lib/astrology/horary/westernRun";
import type { SignId } from "@/lib/astrology/model/western";
import { astroFetch } from "../../_lib/api";
import {
  ASPECT_GLYPH,
  ASPECT_LABEL,
  CONSIDERATION_LABEL,
  HOUSE_TOPICS,
  INTERPOSITION_LABEL,
  RECEPTION_LABEL,
  SOLAR_PHASE,
  TIMELINE_TAG,
  TRANSLATION_STATUS,
  UNRESOLVED_REASON,
  accidentalLabel,
  body,
  dm,
  glyph,
  localAt,
  lonLabel,
  offsetLabel,
  sign,
  signGlyph,
  uncertaintyLabel,
} from "../../_lib/horaryWesternLabels";
import { AtlasViewTitle, atlasGhostBtn, atlasPanel, atlasPaperInput, atlasPrimaryBtn, atlasSecondaryBtn } from "../AtlasShell";
import LocationPicker, { type PickedLocation } from "../LocationPicker";
import NatalWheel, { type WheelChart } from "../NatalWheel";

const DEMO = { question: "DEMO — Bu ortaklık teklifi gerçekleşecek mi?", date: "2026-10-29", time: "14:30", place: { id: "tr-34-istanbul", label: "İstanbul, Türkiye" }, house: 7 } as const;
const ASPECT_TYPE = { 0: "conjunction", 60: "sextile", 90: "square", 120: "trine", 180: "opposition" } as const;
const SIGN_ORDER: SignId[] = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const signAt = (lon: number) => SIGN_ORDER[Math.floor((((lon % 360) + 360) % 360) / 30)];

type Err = { message: string; field?: string; ambiguous?: { choice: "earlier" | "later"; utcIso: string; offsetSeconds: number }[] };

function nowLocal(): { date: string; time: string } {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

export function horaryWheel(r: WesternHoraryResult): WheelChart {
  const c = r.chart;
  return {
    bodies: c.planets.map((p) => ({ id: p.planet, longitude: p.lon, sign: p.sign as SignId, degreeInSign: p.degree, retrograde: p.retrograde })),
    houses: c.cusps.map((lon, i) => ({ number: i + 1, longitude: lon, sign: signAt(lon), degreeInSign: ((lon % 360) + 360) % 30 })),
    angles: { ascendant: { longitude: c.cusps[0] }, midheaven: { longitude: c.cusps[9] } },
    aspects: c.aspects
      .filter((a) => a.withinMoieties)
      .map((a) => ({ a: a.a, b: a.b, type: ASPECT_TYPE[a.angle as keyof typeof ASPECT_TYPE], nature: a.angle === 60 || a.angle === 120 ? ("harmonious" as const) : a.angle === 0 ? ("neutral" as const) : ("challenging" as const) })),
  };
}

export default function WesternHoraryDesk({ onHome }: { onHome: () => void }) {
  const [question, setQuestion] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [place, setPlace] = useState<PickedLocation | null>(null);
  const [house, setHouse] = useState(7);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err | null>(null);
  const [result, setResult] = useState<{ r: WesternHoraryResult; question: string; demo: boolean } | null>(null);

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDemo(false);
  };

  async function submit(dst?: "earlier" | "later") {
    const missing = !date ? "Sorunun tarihini girin." : !time ? "Sorunun saatini girin." : !place ? "Sorunun sorulduğu konumu seçin." : null;
    if (missing) {
      setErr({ message: missing, field: !date ? "date" : !time ? "time" : "place" });
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await astroFetch<{ ok: true; result: WesternHoraryResult }>("/api/admin/astroloji/horary/western", {
      method: "POST",
      body: { date, time, locationId: place!.id, quesitedHouse: house, ...(dst ? { dst } : {}) },
    });
    setBusy(false);
    if (res.ok) {
      setResult({ r: res.data.result, question: question.trim(), demo });
      return;
    }
    const opts = res.data?.options as Err["ambiguous"] | undefined;
    setErr({ message: res.error, field: typeof res.data?.field === "string" ? res.data.field : undefined, ambiguous: res.code === "TIME_AMBIGUOUS" ? opts : undefined });
  }

  return (
    <div className="flex min-w-0 flex-col gap-5" data-testid="horary-western">
      <AtlasViewTitle
        eyebrow="Horary · Soru Haritası"
        title="William Lilly Horary"
        sub="Sorunun anına göre gerçek gökyüzü — Regiomontanus evleri, Lilly asaletleri ve olay çizelgesi."
        actions={
          <button type="button" onClick={onHome} className={atlasGhostBtn}>
            Ana ekrana dön
          </button>
        }
      />

      <form
        className={`${atlasPanel} grid min-w-0 gap-4 px-4 py-5 sm:px-6`}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        aria-label="Horary sorusu"
        data-testid="horary-form"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Önizleme · Soru metni yalnız bu ekranda kalır; sunucuya gönderilmez ve kaydedilmez.</p>
          {demo && (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.12em] text-amber-800" data-testid="horary-demo-badge">
              DEMO VERİSİ
            </span>
          )}
        </div>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-slate-700">Soru</span>
          <textarea className={`${atlasPaperInput} min-h-[64px] resize-y`} rows={2} maxLength={500} value={question} onChange={(e) => edit(setQuestion)(e.target.value)} placeholder="Danışanın sorusu (isteğe bağlı)" data-testid="horary-question" />
        </label>
        <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
          <label className="grid min-w-0 gap-1.5">
            <span className="text-sm font-medium text-slate-700">Tarih (sorunun yerel tarihi)</span>
            <input type="date" className={atlasPaperInput} value={date} onChange={(e) => edit(setDate)(e.target.value)} aria-invalid={err?.field === "date"} data-testid="horary-date" />
          </label>
          <label className="grid min-w-0 gap-1.5">
            <span className="text-sm font-medium text-slate-700">Saat (yerel)</span>
            <span className="flex gap-2">
              <input type="time" className={`${atlasPaperInput} min-w-0 flex-1`} value={time} onChange={(e) => edit(setTime)(e.target.value)} aria-invalid={err?.field === "time"} data-testid="horary-time" />
              <button
                type="button"
                className={atlasSecondaryBtn}
                onClick={() => {
                  const n = nowLocal();
                  setDate(n.date);
                  setTime(n.time);
                  setDemo(false);
                }}
              >
                Şimdi
              </button>
            </span>
          </label>
          <div className="grid min-w-0 gap-1.5" data-testid="horary-place">
            <span className="text-sm font-medium text-slate-700">Konum</span>
            <LocationPicker value={place} onChange={edit(setPlace)} />
          </div>
        </div>
        <label className="grid gap-1.5 sm:max-w-md">
          <span className="text-sm font-medium text-slate-700">Sorulan ev</span>
          <select className={atlasPaperInput} value={house} onChange={(e) => edit(setHouse)(Number(e.target.value))} data-testid="horary-house">
            {Object.entries(HOUSE_TOPICS).map(([h, t]) => (
              <option key={h} value={h}>
                {h}. ev — {t}
              </option>
            ))}
          </select>
        </label>
        {err && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" data-testid="horary-error">
            {err.message}
            {err.ambiguous && (
              <span className="mt-2 flex flex-wrap gap-2">
                {err.ambiguous.map((o) => (
                  <button key={o.choice} type="button" className={atlasSecondaryBtn} onClick={() => void submit(o.choice)}>
                    {o.choice === "earlier" ? "İlk yaşanan" : "İkinci yaşanan"} ({offsetLabel(o.offsetSeconds)})
                  </button>
                ))}
              </span>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={atlasPrimaryBtn} disabled={busy} data-testid="horary-submit">
            {busy ? "Hesaplanıyor…" : "Haritayı Oluştur"}
          </button>
          <button
            type="button"
            className={atlasSecondaryBtn}
            onClick={() => {
              setQuestion(DEMO.question);
              setDate(DEMO.date);
              setTime(DEMO.time);
              setPlace({ ...DEMO.place });
              setHouse(DEMO.house);
              setDemo(true);
              setErr(null);
            }}
            data-testid="horary-demo"
          >
            DEMO verisiyle doldur
          </button>
          <span className="text-xs text-slate-500">Yöntem: William Lilly, Christian Astrology (1647) · Regiomontanus</span>
        </div>
      </form>

      {result && <HoraryResult r={result.r} question={result.question} demo={result.demo} />}
    </div>
  );
}

function Section({ title, children, testId, open = false }: { title: string; children: ReactNode; testId?: string; open?: boolean }) {
  return (
    <details className={`${atlasPanel} group min-w-0 overflow-hidden`} open={open} data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[15px] font-medium text-[#0b1430] outline-none sm:px-6 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#c9a54e] [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="h-4 w-4 shrink-0 text-[#b8954e] motion-safe:transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="min-w-0 border-t border-[#ece3cf] px-4 pb-5 pt-4 sm:px-6">{children}</div>
    </details>
  );
}

const P = (id: string) => (
  <span className="whitespace-nowrap">
    <span aria-hidden="true">{glyph(id)} </span>
    {body(id)}
  </span>
);

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-b border-[#efe6d2] py-2.5 last:border-b-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a6a2a]">{label}</dt>
      <dd className="mt-1 text-[14.5px] leading-relaxed text-slate-800">{children}</dd>
    </div>
  );
}

function HoraryResult({ r, question, demo }: { r: WesternHoraryResult; question: string; demo: boolean }) {
  const c = r.chart;
  const tz = r.question.timezone;
  const wheel = useMemo(() => horaryWheel(r), [r]);
  const main = r.pairs.find((p) => p.role === "lord1_lordN") ?? null;
  const moonPair = r.pairs.find((p) => p.role === "moon_lordN") ?? null;
  const at = (iso: string) => localAt(iso, tz);
  const ascSign = signAt(c.cusps[0]);
  const qSign = signAt(c.cusps[r.significators.quesitedHouse - 1]);
  const candidates = r.pairs.flatMap((p) => [
    ...p.analysis.interpositions.filter((x) => x.kind !== "unresolved").map((x) => ({ k: `i${p.role}${x.atUtc}${x.third}`, text: `${INTERPOSITION_LABEL[x.kind]}: ${body(x.significator)} ${ASPECT_GLYPH[x.angle]} ${body(x.third)}`, when: x.atUtc })),
    ...p.analysis.translations.filter((t) => t.status !== "interrupted").map((t) => ({ k: `t${p.role}${t.by}${t.joinsAt}`, text: `Işık aktarımı adayı: ${body(t.by)} ${body(t.from)} → ${body(t.to)} · ${TRANSLATION_STATUS[t.status]}${t.status === "valid" ? (t.judgement.ok ? " · CA s. 125 şartları sağlanıyor" : " · CA s. 125 kabul/ayrılma şartı eksik") : ""}`, when: t.joinsAt })),
    ...p.analysis.collections.map((x) => ({ k: `c${p.role}${x.by}`, text: `Işık toplanması adayı: ${body(x.by)}${x.ok ? " · CA s. 126 şartları sağlanıyor" : " · kabul / bakmama şartı eksik"}`, when: x.aAt > x.bAt ? x.aAt : x.bAt })),
    ...(p.analysis.refranation ? [{ k: `r${p.role}`, text: `Refranation adayı: ${body(p.a)}–${body(p.b)} kesinleşmeden geri dönüyor (en küçük uzaklık ${dm(p.analysis.refranation.minOrb)})`, when: p.analysis.refranation.atUtc }] : []),
  ]);
  const unresolvedCount = r.pairs.reduce((n, p) => n + p.analysis.interpositions.filter((x) => x.kind === "unresolved").length, 0);

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="horary-result">
      <section className={`${atlasPanel} px-4 py-4 sm:px-6`} aria-label="Soru bilgisi">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {question && <p className="break-words text-[17px] font-medium text-[#0b1430] [font-family:var(--font-atlas-display)]">{question}</p>}
            <p className="mt-1 text-sm text-slate-600" data-testid="horary-moment">
              {r.question.localDate.split("-").reverse().join(".")} {r.question.localTime} — {r.question.place} ({offsetLabel(r.question.offsetSeconds)}) · {r.question.utc.replace("T", " ").replace("Z", " UTC")}
            </p>
          </div>
          {demo && <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.12em] text-amber-800">DEMO GİRDİSİ · GERÇEK HESAPLAMA</span>}
        </div>
      </section>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <section className={`${atlasPanel} flex min-w-0 items-center justify-center px-2 py-4 sm:px-4`} aria-label="Horary çarkı" data-testid="horary-wheel">
          <NatalWheel technical={wheel} label="Horary soru haritası çarkı" tinted sizeClassName="h-auto w-full max-w-[560px]" />
        </section>

        <section className={`${atlasPanel} min-w-0 px-4 py-3 sm:px-6`} aria-label="Temel bulgular" data-testid="horary-summary">
          <dl>
            <Fact label="Göstergeler">
              Soran: {P(r.significators.querent)} <span className="text-slate-500">(1. ev, {signGlyph(ascSign)} {sign(ascSign)})</span>
              <br />
              Sorulan: {P(r.significators.quesited)} <span className="text-slate-500">({r.significators.quesitedHouse}. ev, {signGlyph(qSign)} {sign(qSign)})</span>
              <br />
              Ortak gösterge: {P("moon")}
              {r.significators.sameRuler && <span className="mt-1 block text-sm text-amber-800">Soran ve sorulan aynı gezegen — gösterge çifti analizi yapılmaz; Ay ilişkisi gösterilir.</span>}
            </Fact>
            {main && (
              <Fact label="Göstergeler arasındaki ilişki">
                Şu an: {ASPECT_LABEL[main.analysis.now.angle]} ({dm(main.analysis.now.orb)} uzaklık), {main.analysis.now.applying ? "yaklaşıyor" : "ayrılıyor"}
                {main.analysis.now.withinMoieties ? " · orb içinde" : " · orb dışında"}
                <br />
                {main.analysis.perfection ? (
                  <>
                    Kesinleşme: {ASPECT_GLYPH[main.analysis.perfection.angle]} {ASPECT_LABEL[main.analysis.perfection.angle]} — {at(main.analysis.perfection.atUtc)} <span className="text-slate-500">{uncertaintyLabel(main.analysis.perfection.uncertaintySec)}</span>
                  </>
                ) : (
                  <>{r.horizonDays} gün içinde kesinleşme yok</>
                )}
              </Fact>
            )}
            {moonPair && (
              <Fact label={`Ay ile ${body(moonPair.b)}`}>
                {moonPair.analysis.perfection ? (
                  <>
                    {ASPECT_GLYPH[moonPair.analysis.perfection.angle]} {ASPECT_LABEL[moonPair.analysis.perfection.angle]} — {at(moonPair.analysis.perfection.atUtc)}
                  </>
                ) : (
                  <>{r.horizonDays} gün içinde kesinleşme yok</>
                )}
              </Fact>
            )}
            <Fact label="Ay'ın seyri">
              {signGlyph(c.moon.sign)} {sign(c.moon.sign)} · burç değişimi {at(c.moon.ingressUtc)}
              <br />
              {c.moon.voidOfCourse ? <strong className="font-semibold text-amber-800">Ay boşlukta (burç içinde yeni açı yok)</strong> : <>Burç içindeki sonraki açı: {c.moon.nextInSign[0] && <>{ASPECT_GLYPH[c.moon.nextInSign[0].angle]} {body(c.moon.nextInSign[0].b)} — {at(c.moon.nextInSign[0].atUtc)}</>}</>}
              {c.moon.last && (
                <span className="block text-sm text-slate-600">
                  Son açı: {ASPECT_GLYPH[c.moon.last.angle]} {body(c.moon.last.b)} — {at(c.moon.last.atUtc)}
                </span>
              )}
            </Fact>
            <Fact label="Aday ilişkiler">
              {candidates.length === 0 ? (
                <span className="text-slate-600">Ufuk içinde engelleme, hüsran, aktarım, toplanma veya refranation adayı yok.</span>
              ) : (
                <ul className="grid gap-1" data-testid="horary-candidates">
                  {candidates.map((x) => (
                    <li key={x.k} className="text-[14px]">
                      {x.text} <span className="text-slate-500">· {at(x.when)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {unresolvedCount > 0 && <span className="mt-1 block text-xs text-slate-500">{unresolvedCount} olay kaynak tarafından sınıflandırılamıyor — “Tüm adaylar” bölümünde.</span>}
            </Fact>
            <Fact label="Radikallik ve dikkat noktaları">
              {c.radicality && <span className="block text-sm">{c.radicality.note}</span>}
              {c.considerations.length === 0 ? (
                <span className="text-slate-600">Lilly’nin dikkat noktalarından (CA s. 121–123) hiçbiri yok.</span>
              ) : (
                <ul className="mt-1 grid gap-0.5">
                  {c.considerations.map((x) => (
                    <li key={x.key} className="text-[14px]">
                      <strong className="font-semibold">{CONSIDERATION_LABEL[x.key] ?? x.key}</strong> <span className="text-slate-500">— {x.evidence}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Fact>
          </dl>
        </section>
      </div>

      <section className={`${atlasPanel} min-w-0 px-4 py-4 sm:px-6`} aria-label="Olay çizelgesi" data-testid="horary-timeline">
        <h3 className="text-[15px] font-medium text-[#0b1430]">Olay çizelgesi · sonraki {r.horizonDays} gün</h3>
        {r.timeline.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Ufuk içinde göstergelerle ilgili olay yok.</p>
        ) : (
          <ol className="mt-2 grid gap-0">
            {r.timeline.map((e) => (
              <li key={`${e.atUtc}${e.bodies.join()}`} className="grid gap-x-3 border-b border-[#efe6d2] py-2 text-[14px] last:border-b-0 sm:grid-cols-[11.5rem_minmax(0,1fr)]">
                <span className="tabular-nums text-slate-600">
                  {at(e.atUtc)} {uncertaintyLabel(e.uncertaintySec) && <span className="text-xs text-slate-400">{uncertaintyLabel(e.uncertaintySec)}</span>}
                </span>
                <span className="min-w-0">
                  {e.bodies.length === 2 ? (
                    <>
                      {glyph(e.bodies[0])} {body(e.bodies[0])} {e.angle !== null ? ASPECT_GLYPH[e.angle] : "→"} {glyph(e.bodies[1])} {body(e.bodies[1])}
                    </>
                  ) : (
                    <>
                      {glyph(e.bodies[0])} {body(e.bodies[0])}
                    </>
                  )}
                  <span className="text-slate-500">
                    {" · "}
                    {e.tags
                      .map((t) =>
                        t.kind === "station"
                          ? `${TIMELINE_TAG.station} (${t.note === "retrograde" ? "geri" : "düz"})`
                          : t.kind === "ingress" && t.note
                            ? `${TIMELINE_TAG.ingress}: ${t.note.split("→").map(sign).join(" → ")}`
                            : t.kind === "interposition" && t.note
                              ? INTERPOSITION_LABEL[t.note] ?? TIMELINE_TAG.interposition
                              : t.kind === "translation_join" && t.note
                                ? `${TIMELINE_TAG.translation_join} · ${TRANSLATION_STATUS[t.note]}`
                                : TIMELINE_TAG[t.kind],
                      )
                      .join(" · ")}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Section title="Gezegenler · asal ve arızi asalet" testId="horary-planets">
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13.5px]">
            <thead className="text-[11px] uppercase tracking-[0.12em] text-[#8a6a2a]">
              <tr>
                {["Gezegen", "Konum", "Ev", "Hız °/gün", "Asal asalet", "Asal puan", "Arızi puan", "Güneş"].map((h) => (
                  <th key={h} className="px-1 py-1.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.planets.map((p) => {
                const e = p.essential;
                const dig = [e.domicile && "ev", e.exaltation && "yücelme", e.triplicity && "üçlü", e.term && "terim", e.face && "yüz", e.detriment && "zarar", e.fall && "düşüş", e.peregrine && "peregrine"].filter(Boolean).join(", ");
                return (
                  <tr key={p.planet} className="border-t border-[#efe6d2] align-top">
                    <td className="px-1 py-1.5">{P(p.planet)}</td>
                    <td className="px-1 py-1.5 tabular-nums">
                      {lonLabel(p.lon)}
                      {p.retrograde && <span className="ml-1 text-rose-700">℞</span>}
                    </td>
                    <td className="px-1 py-1.5">
                      {p.house}
                      {p.houseVirtue?.shifted && <span className="text-xs text-slate-500"> (etki {p.houseVirtue.virtueHouse}. ev, 5° kuralı)</span>}
                    </td>
                    <td className="px-1 py-1.5 tabular-nums">{p.speed.toFixed(3)}</td>
                    <td className="px-1 py-1.5">{dig || "—"}</td>
                    <td className="px-1 py-1.5 tabular-nums">{e.score ?? "—"}</td>
                    <td className="px-1 py-1.5 tabular-nums" title={p.accidental.items.map((i) => `${accidentalLabel(i.key)} ${i.points ?? ""}`).join(" · ")}>
                      {p.accidental.total ?? "—"}
                    </td>
                    <td className="px-1 py-1.5">{p.solar ? SOLAR_PHASE[p.solar.phase] : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 grid gap-1 text-[13px] text-slate-600">
          {c.planets.map((p) => (
            <li key={p.planet}>
              <strong className="font-medium text-slate-700">{body(p.planet)} arızi:</strong> {p.accidental.items.map((i) => `${accidentalLabel(i.key)} ${i.points !== null && i.points > 0 ? "+" : ""}${i.points ?? ""}`).join(" · ")}
              {p.mutualReception.length > 0 && <> · karşılıklı kabul: {p.mutualReception.map((m) => `${body(m.with)} (${RECEPTION_LABEL[m.by]} ${m.points ?? ""})`).join(", ")}</>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Ev başlangıçları · Regiomontanus" testId="horary-cusps">
        <ol className="grid gap-x-6 gap-y-1 text-[14px] tabular-nums sm:grid-cols-2 lg:grid-cols-3">
          {c.cusps.map((lon, i) => (
            <li key={i}>
              <span className="inline-block w-12 text-slate-500">{i + 1}. ev</span> {lonLabel(lon)}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[13px] text-slate-600">
          Şans Noktası: {lonLabel(c.partOfFortune.lon)} ({c.partOfFortune.house}. ev) · {c.sect.day ? "Gündüz haritası" : "Gece haritası"} (Güneş irtifası {c.sect.sunAltitude.toFixed(1)}°)
          {c.planetaryHour && (
            <>
              {" "}
              · Gezegen saati: {body(c.planetaryHour.hourRuler)} (günün yöneticisi {body(c.planetaryHour.dayRuler)})
            </>
          )}
        </p>
      </Section>

      <Section title="Kabul ilişkileri ve anlık açılar" testId="horary-receptions">
        <ul className="grid gap-1 text-[14px]">
          {c.receptions.map((x) => (
            <li key={`${x.guest}${x.host}`}>
              {body(x.host)}, {body(x.guest)}’i kabul eder: {x.by.map((k) => RECEPTION_LABEL[k] ?? k).join(", ")}
            </li>
          ))}
          {c.receptions.length === 0 && <li className="text-slate-600">Kabul ilişkisi yok.</li>}
        </ul>
        <h4 className="mt-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#8a6a2a]">Orb içindeki açılar</h4>
        <ul className="mt-1 grid gap-1 text-[14px]">
          {c.aspects
            .filter((a) => a.withinMoieties)
            .map((a) => (
              <li key={`${a.a}${a.b}`}>
                {body(a.a)} {ASPECT_GLYPH[a.angle]} {body(a.b)} · {dm(a.orb)} · {a.applying ? "yaklaşan" : "ayrılan"}
                {!a.bySign && <span className="text-slate-500"> · burç dışı</span>}
              </li>
            ))}
        </ul>
      </Section>

      <Section title="Tüm adaylar ve kanıtları" testId="horary-all-candidates">
        {r.pairs.map((p) => (
          <div key={p.role} className="mb-4 last:mb-0">
            <h4 className="text-[14px] font-semibold text-[#0b1430]">
              {body(p.a)} – {body(p.b)}
            </h4>
            <ul className="mt-1 grid gap-1 text-[13.5px] text-slate-700">
              {p.analysis.interpositions.map((x) => (
                <li key={`${x.atUtc}${x.third}${x.significator}`}>
                  {at(x.atUtc)} · {body(x.significator)} {ASPECT_GLYPH[x.angle]} {body(x.third)} — {INTERPOSITION_LABEL[x.kind]}
                  {x.unresolvedReason && <span className="text-slate-500"> ({UNRESOLVED_REASON[x.unresolvedReason]})</span>}
                </li>
              ))}
              {p.analysis.translations.map((t) => (
                <li key={`${t.by}${t.from}${t.to}`}>
                  Aktarım {body(t.by)}: {body(t.from)} ({at(t.separatedAt)}) → {body(t.to)} ({at(t.joinsAt)}) — {TRANSLATION_STATUS[t.status]}
                  {t.interruptions.length > 0 && <span className="text-slate-500"> · araya girenler: {t.interruptions.map((i) => `${body(i.with)} ${ASPECT_GLYPH[i.angle]}${i.orderUncertain ? " (sıra belirsiz)" : ""}`).join(", ")}</span>}
                </li>
              ))}
              {p.analysis.interpositions.length === 0 && p.analysis.translations.length === 0 && <li className="text-slate-500">Aday yok.</li>}
            </ul>
          </div>
        ))}
      </Section>

      <Section title="Yöntem ve açık noktalar" testId="horary-method">
        <ul className="grid gap-1.5 text-[13.5px] text-slate-700">
          <li>{c.profile.label}</li>
          <li>Ev sistemi: Regiomontanus · Efemeris: {c.methodology.ephemeris} · Orb: Lilly CA s. 107 birinci sütun</li>
          <li>{r.significators.rule}</li>
          {r.openPoints.map((o) => (
            <li key={o} className="text-slate-600">
              Açık nokta: {o}
            </li>
          ))}
          <li className="text-slate-600">Bu ekran hüküm üretmez; adaylar kaynak tanımıyla ve olay kanıtıyla listelenir. Kayıt, arşiv ve rapor bu önizlemede yoktur.</li>
        </ul>
      </Section>
    </div>
  );
}
