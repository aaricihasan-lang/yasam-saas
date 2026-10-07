"use client";

/**
 * Aşama 5 — Vedik görünümler. Harita: Roxy'nin MIT lisanslı `@roxyapi/ui` bileşeni (`<roxy-vedic-kundli>`,
 * Kuzey/Güney/Doğu Hindistan düzeni; ikinci harita motoru YAZILMADI). Bileşene HAM sağlayıcı yanıtı
 * VERİLMEZ: yalnız kendi teknik projeksiyonumuzdan kurulan, sağlayıcı anlatısı içermeyen nesne verilir;
 * `hide-readings` ek savunmadır; self-fetch öznitelikleri (data-endpoint/publishable-key) KULLANILMAZ.
 *
 * Bileşen gezegen tıklama olayı yaymaz → gezegen/ev ayrıntısı + Bilgi Bankası eşleşmesi haritanın
 * yanındaki bağlantılı teknik tablodan açılır (harita ile tablo aynı teknik veriden beslenir).
 */

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { NAKSHATRA_LORDS, type NakshatraPlacement, type VedicD1Technical, type VedicGraha, type VedicGrahaId } from "@/lib/astrology/model/vedic";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { SIGN_GLYPHS, SIGN_LABELS, formatDegree } from "@/lib/astrology/labels/tr";
import { GRAHA_LABELS, NAKSHATRA_LABELS } from "@/lib/astrology/topics/vedic";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";

export type KbLookup = (topicKeys: string[]) => { topicKey: string; topicLabel: string; title: string; body: string }[];

const TITLE = (s: string) => s[0].toUpperCase() + s.slice(1);
const ROXY_NAME: Record<string, string> = { sun: "Sun", moon: "Moon", mars: "Mars", mercury: "Mercury", jupiter: "Jupiter", venus: "Venus", saturn: "Saturn", rahu: "Rahu", ketu: "Ketu" };
const nakName = (id: string) => NAKSHATRA_LABELS[id] ?? id;
const AYANAMSA_LABEL: Record<string, string> = { lahiri: "Lahiri (Chitrapaksha)", raman: "B.V. Raman", "kp-newcomb": "KP Newcomb", "kp-old": "KP (eski)" };

/**
 * Kanonik D1 teknik verisi → `<roxy-vedic-kundli>` veri sözleşmesi (yalnız TEKNİK alanlar). SAF; test edilir.
 * Bileşen `meta` (graha → rashi, longitude, nakshatra, isRetrograde, awastha, deeptadi), `combustion`,
 * `planetaryWar`, `frame` okur.
 */
export function toKundliData(t: VedicD1Technical) {
  const point = (g: Pick<VedicGraha, "rashi" | "longitude" | "nakshatra">, name: string) => ({
    graha: name,
    rashi: TITLE(g.rashi),
    longitude: g.longitude,
    nakshatra: { name: nakName(g.nakshatra.id), pada: g.nakshatra.pada, lord: ROXY_NAME[g.nakshatra.lord] },
  });
  const meta: Record<string, unknown> = {};
  for (const g of t.grahas) {
    meta[ROXY_NAME[g.id]] = {
      ...point(g, ROXY_NAME[g.id]),
      isRetrograde: g.retrograde,
      house: g.house,
      ...(g.avastha.baladi ? { awastha: TITLE(g.avastha.baladi) } : {}),
      ...(g.avastha.deeptadi ? { deeptadi: TITLE(g.avastha.deeptadi) } : {}),
    };
  }
  meta.Lagna = { ...point(t.lagna, "Lagna"), isRetrograde: false, house: 1 };
  return {
    frame: { ayanamsa: t.frame.ayanamsa, ayanamsaDegrees: t.frame.ayanamsaDegrees },
    meta,
    combustion: t.combustion.map((c) => ({ planet: ROXY_NAME[c.id] })),
    planetaryWar: t.planetaryWar.map((w) => ({ planet1: ROXY_NAME[w.a], planet2: ROXY_NAME[w.b], ...(w.winner ? { winner: ROXY_NAME[w.winner] } : {}) })),
  };
}

type ChartStyle = "north" | "south" | "east";

/** Roxy kundli web bileşeni (yalnız istemcide, dinamik yükleme). */
export function RoxyKundli({ data, style }: { data: ReturnType<typeof toKundliData>; style: ChartStyle }) {
  const ref = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    import("@roxyapi/ui/components/vedic-kundli")
      .then(() => alive && setReady(true))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (ready && ref.current) (ref.current as unknown as { data: unknown }).data = data;
  }, [ready, data]);
  if (failed) return <p className="text-sm text-rose-700">Harita bileşeni yüklenemedi; teknik tablo aşağıda.</p>;
  return (
    <div className="roxy-host w-full min-w-0" data-testid="astro-vedic-kundli">
      {createElement("roxy-vedic-kundli", { ref, "chart-style": style, lang: "tr", "hide-readings": "", "hide-sections": "header,tablist" })}
      {!ready && <p className="text-sm text-slate-400">Harita yükleniyor…</p>}
    </div>
  );
}

export type NakshatraRow = {
  point: "lagna" | VedicGrahaId;
  nakshatra: NakshatraPlacement;
  /** Nakshatra yöneticisinin AYNI haritadaki yeri (Roxy verisinden okunur; hesap yok). */
  lordRashi: string;
  lordHouse: number;
};

/**
 * 5C: Nakshatra/Pada özeti — SAF; yalnız Roxy D1 alanlarını yeniden düzenler (yeni hesap YOK).
 * Janma nakshatra = Chandra'nın nakshatrası (Vimshottari'nin başlangıcı). Gruplar Vimshottari yönetici
 * sırasıyla (Ketu → Venüs → … → Merkür) verilir.
 */
export function nakshatraSummary(t: VedicD1Technical): { rows: NakshatraRow[]; janma: NakshatraRow; byLord: { lord: VedicGrahaId; points: NakshatraRow["point"][] }[] } {
  const place = new Map(t.grahas.map((g) => [g.id, g]));
  const row = (point: NakshatraRow["point"], n: NakshatraPlacement): NakshatraRow => {
    const l = place.get(n.lord)!;
    return { point, nakshatra: n, lordRashi: l.rashi, lordHouse: l.house };
  };
  const rows = [row("lagna", t.lagna.nakshatra), ...t.grahas.map((g) => row(g.id, g.nakshatra))];
  const byLord = NAKSHATRA_LORDS.map((lord) => ({ lord, points: rows.filter((r) => r.nakshatra.lord === lord).map((r) => r.point) }));
  return { rows, janma: rows.find((r) => r.point === "moon")!, byLord };
}

function avasthaText(g: VedicGraha): string {
  return [g.avastha.baladi, g.avastha.jagradadi, g.avastha.deeptadi].filter(Boolean).map((x) => TITLE(String(x))).join(" · ") || "—";
}

export function VedicD1Panel({ t, kbLookup }: { t: VedicD1Technical; kbLookup?: KbLookup | null }) {
  const [style, setStyle] = useState<ChartStyle>("north");
  const [sel, setSel] = useState<string>("lagna");
  const data = useMemo(() => toKundliData(t), [t]);
  const selected = sel === "lagna" ? null : t.grahas.find((g) => g.id === sel) ?? null;
  const keys = selected
    ? [`graha_in_rashi:${selected.id}:${selected.rashi}`, `graha_in_bhava:${selected.id}:${selected.house}`, `graha_in_nakshatra:${selected.id}:${selected.nakshatra.id}`, `graha_nakshatra_pada:${selected.id}:${selected.nakshatra.id}:${selected.nakshatra.pada}`]
    : [`lagna_rashi:${t.lagna.rashi}`, `lagna_nakshatra:${t.lagna.nakshatra.id}`];
  const kb = kbLookup ? kbLookup(keys) : null;
  const point = selected ?? { ...t.lagna, id: "lagna" as const };
  const lagnaIdx = SIGN_IDS.indexOf(t.lagna.rashi);
  const presentYogas = t.yogas.filter((y) => y.present);
  const nak = useMemo(() => nakshatraSummary(t), [t]);
  const pointLabel = (p: NakshatraRow["point"]) => (p === "lagna" ? "Lagna" : GRAHA_LABELS[p]);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-d1-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-700">
          Sidereal (nirayana) · ayanamsa <strong>{AYANAMSA_LABEL[t.frame.ayanamsa] ?? t.frame.ayanamsa}</strong> {t.frame.ayanamsaDegrees.toFixed(4)}° · Lagna{" "}
          <strong>
            {SIGN_GLYPHS[t.lagna.rashi]} {SIGN_LABELS[t.lagna.rashi]} {formatDegree(t.lagna.degreeInRashi)}
          </strong>{" "}
          · bhava: bütün-burç (rashi chakra)
        </p>
        <div className="flex gap-1" role="tablist" aria-label="Harita düzeni">
          {(["north", "south", "east"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={style === s}
              onClick={() => setStyle(s)}
              className={`rounded-lg border px-2 py-1 text-xs ${style === s ? "border-amber-600 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-600"}`}
              data-chart-style={s}
            >
              {s === "north" ? "Kuzey Hindistan" : s === "south" ? "Güney Hindistan" : "Doğu Hindistan"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="vedic-kundli-frame mx-auto w-full max-w-[520px]">
          <RoxyKundli data={data} style={style} />
        </div>
        <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3" aria-label="Seçili graha ayrıntısı" data-testid="astro-vedic-detail">
          <h4 className="mb-1 text-sm font-semibold text-amber-900">{selected ? GRAHA_LABELS[selected.id] : "Lagna"}</h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-slate-500">Rashi</dt>
            <dd>
              {SIGN_GLYPHS[point.rashi]} {SIGN_LABELS[point.rashi]} {formatDegree(point.degreeInRashi)}
            </dd>
            <dt className="text-slate-500">Bhava</dt>
            <dd>{selected ? selected.house : 1}</dd>
            <dt className="text-slate-500">Nakshatra</dt>
            <dd>
              {nakName(point.nakshatra.id)} · {point.nakshatra.pada}. pada · yönetici {GRAHA_LABELS[point.nakshatra.lord]}
            </dd>
            <dt className="text-slate-500">Nakshatra içi</dt>
            <dd>
              %{Math.round(point.nakshatra.ratio * 100)} · kalan {formatDegree(point.nakshatra.remaining)}
              {point.nakshatra.abhijit ? " · Abhijit" : ""}
            </dd>
            {selected && (
              <>
                <dt className="text-slate-500">Hareket</dt>
                <dd>{selected.retrograde ? "Vakri (retro)" : "Direkt"}</dd>
                <dt className="text-slate-500">Avastha</dt>
                <dd>{avasthaText(selected)}</dd>
                {t.combustion.some((c) => c.id === selected.id) && (
                  <>
                    <dt className="text-slate-500">Asta</dt>
                    <dd>Güneş&apos;e {t.combustion.find((c) => c.id === selected.id)!.distanceFromSun.toFixed(2)}° (orb {t.combustion.find((c) => c.id === selected.id)!.orb}°) — yanık</dd>
                  </>
                )}
              </>
            )}
          </dl>
          <div className="mt-2 border-t border-amber-200 pt-2" data-testid="astro-vedic-detail-kb">
            <div className="text-xs font-semibold text-indigo-900">Bilgi Bankam</div>
            {kb === null ? (
              <p className="text-xs text-slate-500">Bilgi Bankası eşleşmeleri çalışma alanı yüklenince görünür.</p>
            ) : kb.length === 0 ? (
              <p className="text-xs text-slate-500">Bu yerleşim için Bilgi Bankası kaydınız yok.</p>
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
        </section>
      </div>
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
        <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Graha yerleşimleri (D1) — satıra tıklayın</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full" data-testid="astro-vedic-graha-table">
            <thead>
              <tr>
                <th className={th}>Graha</th>
                <th className={th}>Rashi / derece</th>
                <th className={th}>Bhava</th>
                <th className={th}>Nakshatra · pada</th>
                <th className={th}>Yönetici</th>
                <th className={th}>Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className={`cursor-pointer ${sel === "lagna" ? "bg-amber-50" : ""}`} onClick={() => setSel("lagna")} data-graha="lagna">
                <td className={`${td} font-semibold`}>Lagna</td>
                <td className={td}>
                  {SIGN_GLYPHS[t.lagna.rashi]} {SIGN_LABELS[t.lagna.rashi]} {formatDegree(t.lagna.degreeInRashi)}
                </td>
                <td className={td}>1</td>
                <td className={td}>
                  {nakName(t.lagna.nakshatra.id)} · {t.lagna.nakshatra.pada}
                </td>
                <td className={td}>{GRAHA_LABELS[t.lagna.nakshatra.lord]}</td>
                <td className={td}>—</td>
              </tr>
              {t.grahas.map((g) => (
                <tr key={g.id} className={`cursor-pointer ${sel === g.id ? "bg-amber-50" : ""}`} onClick={() => setSel(g.id)} data-graha={g.id}>
                  <td className={td}>{GRAHA_LABELS[g.id]}</td>
                  <td className={td}>
                    {SIGN_GLYPHS[g.rashi]} {SIGN_LABELS[g.rashi]} {formatDegree(g.degreeInRashi)}
                  </td>
                  <td className={td}>{g.house}</td>
                  <td className={td}>
                    {nakName(g.nakshatra.id)} · {g.nakshatra.pada}
                  </td>
                  <td className={td}>{GRAHA_LABELS[g.nakshatra.lord]}</td>
                  <td className={`${td} text-xs`}>
                    {g.retrograde ? "℞ vakri · " : ""}
                    {t.combustion.some((c) => c.id === g.id) ? "asta · " : ""}
                    {avasthaText(g)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white" aria-label="Nakshatra ve pada" data-testid="astro-vedic-nakshatra">
        <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Nakshatra &amp; Pada (27 nakshatra · 4 pada = 3°20′)</h4>
        <div className="flex flex-col gap-3 p-3">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-sm" data-testid="astro-vedic-janma">
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-800">Janma nakshatra (Chandra)</div>
            <div className="text-slate-800">
              <strong>
                {nak.janma.nakshatra.index + 1}. {nakName(nak.janma.nakshatra.id)}
              </strong>{" "}
              · {nak.janma.nakshatra.pada}. pada · yönetici {GRAHA_LABELS[nak.janma.nakshatra.lord]} · katedilen %{Math.round(nak.janma.nakshatra.ratio * 100)}, kalan{" "}
              {formatDegree(nak.janma.nakshatra.remaining)}
            </div>
            <p className="text-xs text-slate-500">Vimshottari dasha bu nakshatranın yöneticisiyle ve kalan oranla başlar (dasha değerleri ayrıca Roxy&apos;den alınır).</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full" data-testid="astro-vedic-nakshatra-table">
              <thead>
                <tr>
                  <th className={th}>Nokta</th>
                  <th className={th}>Nakshatra</th>
                  <th className={th}>Pada</th>
                  <th className={th}>İlerleme</th>
                  <th className={th}>Yönetici → yeri</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {nak.rows.map((r) => (
                  <tr key={r.point} className={`cursor-pointer ${sel === r.point ? "bg-amber-50" : ""}`} onClick={() => setSel(r.point)} data-nakshatra-point={r.point}>
                    <td className={`${td} font-medium`}>{pointLabel(r.point)}</td>
                    <td className={td}>
                      {r.nakshatra.index + 1}. {nakName(r.nakshatra.id)}
                      {r.nakshatra.abhijit ? " · Abhijit" : ""}
                    </td>
                    <td className={td}>{r.nakshatra.pada}</td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded bg-slate-100" aria-hidden>
                          <div className="h-full bg-indigo-400" style={{ width: `${Math.round(r.nakshatra.ratio * 100)}%` }} />
                        </div>
                        <span className="text-xs text-slate-600">%{Math.round(r.nakshatra.ratio * 100)}</span>
                      </div>
                    </td>
                    <td className={`${td} text-xs`}>
                      {GRAHA_LABELS[r.nakshatra.lord]} → {SIGN_GLYPHS[r.lordRashi as keyof typeof SIGN_GLYPHS]} {SIGN_LABELS[r.lordRashi as keyof typeof SIGN_LABELS]}, {r.lordHouse}. bhava
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">Nakshatra yöneticisine göre (Vimshottari sırası)</div>
            <div className="flex flex-wrap gap-1.5 text-xs" data-testid="astro-vedic-nakshatra-lords">
              {nak.byLord.map((g) => (
                <span key={g.lord} className={`rounded-full border px-2 py-0.5 ${g.points.length ? "border-indigo-200 bg-white text-slate-800" : "border-slate-100 text-slate-400"}`}>
                  <strong>{GRAHA_LABELS[g.lord]}</strong>: {g.points.length ? g.points.map(pointLabel).join(", ") : "—"}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
        <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
          Bhava → rashi (bütün-burç) · Oluşan yogalar ({presentYogas.length}/{t.yogas.length} denetlendi)
        </h4>
        <div className="grid gap-3 p-3 md:grid-cols-2">
          <div className="grid grid-cols-3 gap-1 text-xs sm:grid-cols-4">
            {Array.from({ length: 12 }, (_, i) => {
              const s = SIGN_IDS[(lagnaIdx + i) % 12];
              return (
                <div key={i} className="rounded border border-slate-100 px-1.5 py-1">
                  <span className="font-semibold">{i + 1}.</span> {SIGN_GLYPHS[s]} {SIGN_LABELS[s]}
                </div>
              );
            })}
          </div>
          <ul className="flex flex-col gap-1 text-sm" data-testid="astro-vedic-yogas">
            {presentYogas.length === 0 && <li className="text-slate-500">Oluşan yoga yok.</li>}
            {presentYogas.map((y) => (
              <li key={y.id} className="rounded-lg bg-slate-50 px-2 py-1">
                <span className="font-medium">{y.name}</span>{" "}
                <span className="text-xs text-slate-500">
                  {y.family}
                  {y.quality ? ` · Roxy sınıfı: ${y.quality === "positive" ? "olumlu" : y.quality === "negative" ? "olumsuz" : "karma"}` : ""}
                </span>
                {y.evidence && <div className="text-xs text-slate-600">Oluşum: {y.evidence}</div>}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
