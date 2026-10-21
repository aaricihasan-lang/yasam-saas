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
import { NAKSHATRAS as NAKSHATRA_IDS, NAKSHATRA_LORDS, VEDIC_YOGA_FAMILY_LABELS, type NakshatraPlacement, type VedicD1Technical, type VedicDashaTechnical, type VedicGraha, type VedicGrahaId, type VedicVargaTechnical } from "@/lib/astrology/model/vedic";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { SIGN_GLYPHS, SIGN_LABELS, formatDegree } from "@/lib/astrology/labels/tr";
import { GRAHA_LABELS } from "@/lib/astrology/topics/vedic";
import { BPHS_VARGA_RULES, checkVargaAgainstBphs, type VargaCheck } from "@/lib/astrology/verify/varga";
import { KP_NODE_SIG_METHODS, KP_NODE_SIG_SOURCE, isKpNode } from "@/lib/astrology/model/kp";
import { KpNodeMethodLegend, KpNodeMethodTag } from "./KpPanels";
import { kundliLegend } from "../_lib/kundliLocalize";
import { TITLE, nakName, localizeKundliDom, type ChartStyle } from "../_lib/kundliData";
// 2026-10-15: saf harita veri yardımcıları _lib/kundliData'ya taşındı (rapor sunucusu da kullanır); eski içe aktarımlar için yeniden dışa açılır.
export { toKundliData, toVargaChartData, kundliTitles, localizeKundliDom } from "../_lib/kundliData";
import { toKundliData, toVargaChartData, kundliTitles } from "../_lib/kundliData";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";

export type KbLookup = (topicKeys: string[]) => { topicKey: string; topicLabel: string; title: string; body: string }[];

const AYANAMSA_LABEL: Record<string, string> = { lahiri: "Lahiri (Chitrapaksha)", raman: "B.V. Raman", "kp-newcomb": "KP Newcomb", "kp-old": "KP (eski)" };

/** Roxy kundli / varga web bileşeni (yalnız istemcide, dinamik yükleme). */
export function RoxyKundli({ data, style, kind = "kundli", titles = {} }: { data: unknown; style: ChartStyle; kind?: "kundli" | "divisional"; titles?: Record<string, string> }) {
  const ref = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    // Türkçe katalog: kütüphanenin kendi yazdığı metinler (gösterge, ipucu ekleri). Graha/burç kısaltmaları
    // kütüphanede yerelleşmez → localizeKundliDom.
    Promise.all([kind === "divisional" ? import("@roxyapi/ui/components/divisional-chart") : import("@roxyapi/ui/components/vedic-kundli"), import("@roxyapi/ui/locales/tr")])
      .then(() => alive && setReady(true))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [kind]);
  useEffect(() => {
    if (ready && ref.current) (ref.current as unknown as { data: unknown }).data = data;
  }, [ready, data]);
  const titlesKey = JSON.stringify(titles);
  useEffect(() => {
    const root = ready ? ref.current?.shadowRoot : null;
    if (!root) return;
    const t = JSON.parse(titlesKey) as Record<string, string>;
    const apply = () => localizeKundliDom(root, t, style);
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(root, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  }, [ready, style, titlesKey]);
  if (failed) return <p className="text-sm text-rose-700">Harita bileşeni yüklenemedi; teknik tablo aşağıda.</p>;
  // Mobilde bileşenin iç dolgusu (1.5rem) haritayı ~245 px'e küçültüyordu → küçük ekranda 0.5rem (CSS değişkeni gölge DOM'a miras geçer).
  return (
    <div className="roxy-host w-full min-w-0 [--roxy-space-lg:0.5rem] sm:[--roxy-space-lg:1.5rem]" data-testid="astro-vedic-kundli">
      {createElement(kind === "divisional" ? "roxy-divisional-chart" : "roxy-vedic-kundli", { ref, "chart-style": style, lang: "tr", "hide-readings": "", "hide-sections": kind === "divisional" ? "header,tablist,details" : "header,tablist" })}
      {!ready && <p className="text-sm text-slate-400">Harita yükleniyor…</p>}
      <p className="mt-1 text-center text-[11px] leading-snug text-slate-500" data-testid="astro-vedic-kundli-legend">
        {kundliLegend(VEDIC_GRAHA_ORDER)} · ʳ vakri · ᶜ yanık (asta) · ʷ graha yuddha. Kuzey/Doğu düzeninde 3+, Güney&apos;de 5+ grahalı hücrede derece haritada gösterilmez (tabloda ve ipucunda).
      </p>
    </div>
  );
}
const VEDIC_GRAHA_ORDER: VedicGrahaId[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"];

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
  const titles = useMemo(() => kundliTitles(t.grahas, undefined, t.combustion.map((c) => c.id)), [t]);
  const selected = sel === "lagna" ? null : t.grahas.find((g) => g.id === sel) ?? null;
  const keys = selected
    ? [`graha_in_rashi:${selected.id}:${selected.rashi}`, `graha_in_bhava:${selected.id}:${selected.house}`, `graha_in_nakshatra:${selected.id}:${selected.nakshatra.id}`, `graha_nakshatra_pada:${selected.id}:${selected.nakshatra.id}:${selected.nakshatra.pada}`]
    : [`lagna_rashi:${t.lagna.rashi}`, `lagna_nakshatra:${t.lagna.nakshatra.id}`];
  const kb = kbLookup ? kbLookup(keys) : null;
  const point = selected ?? { ...t.lagna, id: "lagna" as const };
  const lagnaIdx = SIGN_IDS.indexOf(t.lagna.rashi);
  const presentYogas = t.yogas.filter((y) => y.present);
  // AŞAMA 2: kuralı sağlayan ama üst aile tarafından bastırılan yogalar (eski kayıtta alan yok → liste boş, uydurulmaz).
  const suppressedYogas = t.yogas.filter((y) => !y.present && typeof y.suppressedBy === "string");
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
          <RoxyKundli data={data} style={style} titles={titles} />
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
            <p className="text-xs text-slate-500">Vimshottari dasha bu nakshatranın yöneticisiyle ve kalan oranla başlar (dasha değerleri ayrıca hesaplama sonucundan alınır).</p>
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
                  {y.quality ? ` · sınıf: ${y.quality === "positive" ? "olumlu" : y.quality === "negative" ? "olumsuz" : "karma"}` : ""}
                </span>
                {y.evidence && <div className="text-xs text-slate-600">Oluşum: {y.evidence}</div>}
              </li>
            ))}
          </ul>
        </div>
        {suppressedYogas.length > 0 && (
          <div className="border-t border-slate-100 px-3 py-2" data-testid="astro-vedic-suppressed-yogas">
            <div className="mb-1 text-xs font-semibold text-slate-600">Bastırılan yogalar — kural sağlandı, üst sıradaki aile öncelik aldı ({suppressedYogas.length})</div>
            <ul className="flex flex-col gap-1 text-sm">
              {suppressedYogas.map((y, i) => (
                <li key={`${y.id}-${i}`} className="rounded-lg bg-slate-50 px-2 py-1">
                  <span className="font-medium">{y.name}</span>{" "}
                  <span className="text-xs text-slate-500">
                    {y.family} · bastıran aile: {VEDIC_YOGA_FAMILY_LABELS[y.suppressedBy!] ?? y.suppressedBy}
                  </span>
                  {y.evidence && <div className="text-xs text-slate-600">Kanıt: {y.evidence}</div>}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-slate-500">Klasik öncelik: Akriti, Asraya&apos;nın; Akriti, Asraya ve Dala, Sankhya&apos;nın önüne geçer. Bu yogalar haritada oluşmuş sayılmaz.</p>
          </div>
        )}
      </section>
      {t.planetaryWar.length > 0 && (
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white" data-testid="astro-vedic-war">
          <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Graha yuddha (gezegen savaşı)</h4>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={th}>Graha 1</th>
                  <th className={th}>Graha 2</th>
                  <th className={th}>Uzaklık</th>
                  <th className={th}>Kazanan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {t.planetaryWar.map((w, i) => (
                  <tr key={`${w.a}-${w.b}-${i}`}>
                    <td className={td}>{GRAHA_LABELS[w.a]}</td>
                    <td className={td}>{GRAHA_LABELS[w.b]}</td>
                    <td className={`${td} tabular-nums`}>{typeof w.distance === "number" ? `${w.distance.toFixed(2).replace(".", ",")}°` : "—"}</td>
                    <td className={td}>{w.winner ? GRAHA_LABELS[w.winner] : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-3 pb-2 text-[11px] text-slate-500">Görünür iki graha 1° içinde; kazanan daha kuzey ekliptik enlemli grahadır, kaybeden zayıflar.</p>
        </section>
      )}
    </div>
  );
}

function StyleTabs({ style, setStyle }: { style: ChartStyle; setStyle: (s: ChartStyle) => void }) {
  return (
    <div className="flex gap-1" role="tablist" aria-label="Harita düzeni">
      {(["north", "south", "east"] as const).map((x) => (
        <button
          key={x}
          type="button"
          role="tab"
          aria-selected={style === x}
          onClick={() => setStyle(x)}
          className={`rounded-lg border px-2 py-1 text-xs ${style === x ? "border-amber-600 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-600"}`}
          data-chart-style={x}
        >
          {x === "north" ? "Kuzey Hindistan" : x === "south" ? "Güney Hindistan" : "Doğu Hindistan"}
        </button>
      ))}
    </div>
  );
}

/** Seçili noktanın varga konu anahtarları (KB eşleşmesi; D9 kendi türleri, diğerleri dN). */
export function vargaTopicKeys(t: VedicVargaTechnical, point: "lagna" | VedicGrahaId): string[] {
  const d9 = t.division.number === 9;
  const d = `d${t.division.number}`;
  if (point === "lagna") return [d9 ? `navamsa_lagna_rashi:${t.lagna.rashi}` : `varga_lagna_rashi:${d}:${t.lagna.rashi}`];
  const g = t.grahas.find((x) => x.id === point);
  if (!g) return [];
  const keys = d9 ? [`navamsa_graha_in_rashi:${g.id}:${g.rashi}`, `navamsa_graha_in_bhava:${g.id}:${g.house}`] : [`varga_graha_in_rashi:${d}:${g.id}:${g.rashi}`, `varga_graha_in_bhava:${d}:${g.id}:${g.house}`];
  if (g.vargottama) keys.push(d9 ? `navamsa_vargottama:${g.id}` : `varga_vargottama:${d}:${g.id}`);
  return keys;
}

type VargaRow = { id: "lagna" | VedicGrahaId; p: VedicVargaTechnical["lagna"] | VedicVargaTechnical["grahas"][number]; retro: boolean };

/** 5.1B: Roxy varga rashilerinin BPHS (Parashari) kuralıyla bağımsız denetimi — her görüntülemede, hesap ÜRETMEZ. */
export function vargaCheckOf(t: VedicVargaTechnical): VargaCheck {
  return checkVargaAgainstBphs(t.division.number, [{ id: "lagna", longitude: t.lagna.longitude, rashi: t.lagna.rashi }, ...t.grahas.map((g) => ({ id: g.id, longitude: g.longitude, rashi: g.rashi }))]);
}
function VargaVerification({ t }: { t: VedicVargaTechnical }) {
  const c = vargaCheckOf(t);
  const rule = BPHS_VARGA_RULES[t.division.number];
  const dn = `D${t.division.number}`;
  if (c.status === "mismatch") {
    return (
      <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs text-rose-900" data-testid="astro-vedic-varga-check" data-varga-check="mismatch">
        <strong>Doğrulanmadı:</strong> {dn} için {c.mismatches.length}/{c.checked} noktada hesaplanan rashi {c.method} kuralından farklı (
        {c.mismatches.map((m) => `${m.id === "lagna" ? "Lagna" : GRAHA_LABELS[m.id]}: hesaplanan ${SIGN_LABELS[m.got]}, kural ${SIGN_LABELS[m.expected]}`).join("; ")}). Yöntem/ekol farkı olabilir;
        bu harita doğrulanmış sayılmaz.
      </div>
    );
  }
  if (c.status === "unsupported") {
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900" data-testid="astro-vedic-varga-check" data-varga-check="unsupported">
        {dn} için bağımsız referans kuralı yok — doğrulanmadı.
      </p>
    );
  }
  return (
    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900" data-testid="astro-vedic-varga-check" data-varga-check="match">
      <strong>Bağımsız denetim:</strong> {c.checked}/{c.checked} nokta (Lagna + 9 graha) {c.method} kuralıyla aynı — {rule?.rule}
      {c.goldenConfirmed ? " Yöntem gerçek bir hesaplama örneğiyle de teyit edildi." : " (Bu bölüm ayrıca gerçek bir hesaplama örneğiyle teyit edilmedi; denetim bu haritanın kendi verisiyle yapıldı.)"}
    </p>
  );
}

export function VedicVargaPanel({ t, kbLookup }: { t: VedicVargaTechnical; kbLookup?: KbLookup | null }) {
  const [style, setStyle] = useState<ChartStyle>("north");
  const [sel, setSel] = useState<"lagna" | VedicGrahaId>("lagna");
  const data = useMemo(() => toVargaChartData(t), [t]);
  const titles = useMemo(() => kundliTitles(t.grahas, t.division.number), [t]);
  const d9 = t.division.number === 9;
  const dn = `D${t.division.number}`;
  const dl = `${dn} ${t.division.name}`;
  const point = sel === "lagna" ? t.lagna : (t.grahas.find((g) => g.id === sel) ?? t.lagna);
  const kb = kbLookup ? kbLookup(vargaTopicKeys(t, sel)) : null;
  const rows: VargaRow[] = [{ id: "lagna", p: t.lagna, retro: false }, ...t.grahas.map((g) => ({ id: g.id, p: g, retro: g.retrograde }))];
  const label = (id: "lagna" | VedicGrahaId) => (id === "lagna" ? "Lagna" : GRAHA_LABELS[id]);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-varga-panel" data-division={t.division.number}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-700">
          <strong>{dl}</strong>
          {t.division.degreesPerDivision ? ` · bölüm ${t.division.degreesPerDivision}` : ""} · ayanamsa <strong>{AYANAMSA_LABEL[t.frame.ayanamsa] ?? t.frame.ayanamsa}</strong> · {dn} Lagna{" "}
          <strong>
            {SIGN_GLYPHS[t.lagna.rashi]} {SIGN_LABELS[t.lagna.rashi]}
          </strong>{" "}
          (D1: {SIGN_LABELS[t.lagna.d1Rashi]}) · vargottama: {t.vargottama.length ? t.vargottama.map((v) => GRAHA_LABELS[v]).join(", ") : "yok"}
        </p>
        <StyleTabs style={style} setStyle={setStyle} />
      </div>
      <VargaVerification t={t} />
      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[520px]">
          <RoxyKundli data={data} style={style} kind="divisional" titles={titles} />
        </div>
        <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3" aria-label="Seçili nokta ayrıntısı" data-testid="astro-vedic-varga-detail">
          <h4 className="mb-1 text-sm font-semibold text-amber-900">
            {label(sel)} · {dl}
          </h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-slate-500">D1 rashi</dt>
            <dd>
              {SIGN_GLYPHS[point.d1Rashi]} {SIGN_LABELS[point.d1Rashi]} {formatDegree(point.longitude % 30)}
            </dd>
            <dt className="text-slate-500">{dn} rashi</dt>
            <dd>
              {SIGN_GLYPHS[point.rashi]} {SIGN_LABELS[point.rashi]}
              {point.d1Rashi === point.rashi ? " · vargottama" : ""}
            </dd>
            <dt className="text-slate-500">Bhava ({dn})</dt>
            <dd>{point.house}</dd>
            <dt className="text-slate-500">Nakshatra</dt>
            <dd>
              {nakName(point.nakshatra.id)} · {point.nakshatra.pada}. pada
              {d9 ? ` → navamsa ${SIGN_LABELS[point.rashi]}` : ""}
            </dd>
          </dl>
          <div className="mt-2 border-t border-amber-200 pt-2" data-testid="astro-vedic-varga-detail-kb">
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
        <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">D1 → {dl} — satıra tıklayın</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full" data-testid="astro-vedic-varga-table">
            <thead>
              <tr>
                <th className={th}>Nokta</th>
                <th className={th}>D1 rashi</th>
                <th className={th}>{dn} rashi</th>
                <th className={th}>Bhava</th>
                <th className={th}>Nakshatra · pada</th>
                <th className={th}>Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ id, p, retro }) => (
                <tr key={id} className={`cursor-pointer ${sel === id ? "bg-amber-50" : ""}`} onClick={() => setSel(id)} data-varga-point={id}>
                  <td className={`${td} font-medium`}>{label(id)}</td>
                  <td className={td}>
                    {SIGN_GLYPHS[p.d1Rashi]} {SIGN_LABELS[p.d1Rashi]}
                  </td>
                  <td className={td}>
                    {SIGN_GLYPHS[p.rashi]} {SIGN_LABELS[p.rashi]}
                  </td>
                  <td className={td}>{p.house}</td>
                  <td className={td}>
                    {nakName(p.nakshatra.id)} · {p.nakshatra.pada}
                  </td>
                  <td className={`${td} text-xs`}>{[p.d1Rashi === p.rashi ? "vargottama" : "", retro ? "℞ vakri" : ""].filter(Boolean).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ═══ 5E Vimshottari Dasha ═══════════════════════════════════════════════════
type KbHit = { topicKey: string; topicLabel: string; title: string; body: string };
export type DashaDrillResult = { ok: true; technical: VedicDashaTechnical; kb: KbHit[] } | { ok: false; error: string };
/** Alt düzeyi TEMBEL yükler: aynı çalıştırma ucu (planlayıcı + önbellek) → tekrar tıklama 0 sağlayıcı isteği. */
export type DashaDrill = (o: { mahadasha: VedicGrahaId; antardasha: VedicGrahaId | null }) => Promise<DashaDrillResult>;

/** Sağlayıcı yerel tarih-saati ("YYYY-MM-DDTHH:MM:SS", doğum ofseti) → UTC ms. SAF. */
export function dashaUtcMs(local: string, offsetHours: number): number {
  return Date.parse(`${local}Z`) - offsetHours * 3_600_000;
}
/** Verilen anda süren dönemin sırası (yoksa -1). SAF. */
export function currentDashaIndex(t: Pick<VedicDashaTechnical, "periods" | "utcOffsetHours">, nowMs: number): number {
  return t.periods.findIndex((p) => dashaUtcMs(p.start, t.utcOffsetHours) <= nowMs && nowMs < dashaUtcMs(p.end, t.utcOffsetHours));
}
/** Seçili dönemin Bilgi Bankası konu anahtarı (düzeye göre). SAF. */
export function dashaTopicKey(t: Pick<VedicDashaTechnical, "path">, lord: VedicGrahaId): string {
  const { mahadasha: md, antardasha: ad } = t.path;
  return md && ad ? `dasha_pratyantardasha:${md}:${ad}:${lord}` : md ? `dasha_antardasha:${md}:${lord}` : `dasha_mahadasha:${lord}`;
}
const fmtLocal = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
const fmtLocalTime = (s: string) => `${fmtLocal(s)} ${s.slice(11, 16)}`;
function fmtYears(y: number): string {
  const yy = Math.floor(y + 1e-9);
  const mf = (y - yy) * 12;
  const mm = Math.floor(mf + 1e-9);
  const dd = Math.round((mf - mm) * 30.4375);
  return [yy ? `${yy} y` : "", mm ? `${mm} ay` : "", dd || (!yy && !mm) ? `${dd} g` : ""].filter(Boolean).join(" ");
}
const LEVEL_LABEL: Record<VedicDashaTechnical["level"], string> = { mahadasha: "Mahadasha", antardasha: "Antardasha (bhukti)", pratyantardasha: "Pratyantardasha" };
const LORD_TONE: Record<VedicGrahaId, string> = {
  sun: "bg-amber-300",
  moon: "bg-slate-200",
  mars: "bg-rose-300",
  mercury: "bg-emerald-300",
  jupiter: "bg-yellow-200",
  venus: "bg-pink-200",
  saturn: "bg-indigo-300",
  rahu: "bg-zinc-400",
  ketu: "bg-stone-300",
};

/** 6.1B: "bugün" rozetinin yatay kayması — uçlara yakınken rozet çizginin içe doğru tarafına hizalanır (taşma yok). */
export function todayShift(pct: number): string {
  return pct < 8 ? "0%" : pct > 92 ? "-100%" : "-50%";
}

function DashaTimeline({ t, current, sel, onSel, now }: { t: VedicDashaTechnical; current: number; sel: number; onSel: (i: number) => void; now: number }) {
  const total = t.periods.reduce((a, p) => a + p.durationYears, 0) || 1;
  const startMs = dashaUtcMs(t.periods[0].start, t.utcOffsetHours);
  const endMs = dashaUtcMs(t.periods[t.periods.length - 1].end, t.utcOffsetHours);
  const nowPct = now >= startMs && now < endMs ? ((now - startMs) / (endMs - startMs)) * 100 : null;
  return (
    <div className="relative" data-testid="astro-vedic-dasha-timeline">
      {/* 6.1B: rozet kendi satırında (başlığa / üst metne taşmaz); uçlarda kapsayıcı içinde kalacak şekilde hizalanır. */}
      {nowPct !== null && (
        <div className="relative mb-0.5 h-4" data-testid="astro-dasha-today-row">
          <span
            className="absolute top-0 whitespace-nowrap rounded bg-rose-600 px-1 text-[10px] leading-4 text-white"
            style={{ left: `${nowPct}%`, transform: `translateX(${todayShift(nowPct)})` }}
            data-testid="astro-dasha-today"
          >
            bugün
          </span>
        </div>
      )}
      <div className="relative">
        <div className="flex h-9 w-full overflow-hidden rounded-lg border border-slate-200">
          {t.periods.map((p, i) => (
            <button
              key={`${p.lord}-${p.start}`}
              type="button"
              onClick={() => onSel(i)}
              title={`${GRAHA_LABELS[p.lord]} · ${fmtLocal(p.start)} → ${fmtLocal(p.end)}`}
              className={`${LORD_TONE[p.lord]} min-w-0 border-r border-white/70 text-[10px] font-semibold text-slate-800 last:border-r-0 ${sel === i ? "ring-2 ring-inset ring-amber-600" : ""} ${current === i ? "brightness-95" : "opacity-90"}`}
              style={{ width: `${(p.durationYears / total) * 100}%` }}
              aria-label={`${GRAHA_LABELS[p.lord]} dönemi`}
            >
              <span className="block truncate px-0.5">{(p.durationYears / total) * 100 > 5 ? GRAHA_LABELS[p.lord].split(" ")[0] : ""}</span>
            </button>
          ))}
        </div>
        {nowPct !== null && <div className="pointer-events-none absolute -top-0.5 bottom-0 w-0.5 bg-rose-600" style={{ left: `${nowPct}%` }} aria-hidden />}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{fmtLocal(t.periods[0].start)}</span>
        <span>{fmtLocal(t.periods[t.periods.length - 1].end)}</span>
      </div>
    </div>
  );
}

function KbList({ kb }: { kb: KbHit[] | null }) {
  return (
    <div className="mt-2 border-t border-amber-200 pt-2" data-testid="astro-vedic-dasha-detail-kb">
      <div className="text-xs font-semibold text-indigo-900">Bilgi Bankam</div>
      {kb === null ? (
        <p className="text-xs text-slate-500">Bilgi Bankası eşleşmeleri çalışma alanı yüklenince görünür.</p>
      ) : kb.length === 0 ? (
        <p className="text-xs text-slate-500">Bu dönem için Bilgi Bankası kaydınız yok.</p>
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

function DashaLevelView({
  t,
  kbLookup,
  drill,
  onOpenLevel,
  depth,
}: {
  t: VedicDashaTechnical;
  kbLookup: ((keys: string[]) => KbHit[]) | null;
  drill?: DashaDrill;
  onOpenLevel?: (o: { mahadasha: VedicGrahaId | null; antardasha: VedicGrahaId | null }) => void;
  depth: number;
}) {
  const [now] = useState(() => Date.now());
  const current = currentDashaIndex(t, now);
  const [sel, setSel] = useState<number>(current >= 0 ? current : 0);
  const [open, setOpen] = useState<Record<number, DashaDrillResult | "loading">>({});
  const p = t.periods[Math.min(sel, t.periods.length - 1)];
  // 6E: KP dasha — konu anahtarları KP geleneğinde (dönem lordu + gösterdiği evler).
  const isKp = t.periods.some((x) => !!x.kp);
  const kpHouses = (x: (typeof t.periods)[number]) => (x.kp ? [...new Set([1, 2, 3, 4].flatMap((l) => x.kp!.levels[l as 1 | 2 | 3 | 4]))] : []);
  const kb = kbLookup ? kbLookup(isKp ? [`kp_dasha_lord:${p.lord}`, ...kpHouses(p).map((h) => `kp_dasha_signifies:${p.lord}:${h}`)] : [dashaTopicKey(t, p.lord)]) : null;
  const canDrill = !!drill && t.level !== "pratyantardasha";
  async function expand(i: number) {
    if (!drill) return;
    if (open[i] && open[i] !== "loading") {
      setOpen((o) => Object.fromEntries(Object.entries(o).filter(([k]) => Number(k) !== i)));
      return;
    }
    setOpen((o) => ({ ...o, [i]: "loading" }));
    const lord = t.periods[i].lord;
    const r = await drill(t.level === "mahadasha" ? { mahadasha: lord, antardasha: null } : { mahadasha: t.path.mahadasha!, antardasha: lord });
    setOpen((o) => ({ ...o, [i]: r }));
  }
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${depth > 0 ? "rounded-xl border border-slate-200 bg-slate-50/60 p-2" : ""}`} data-testid={`astro-vedic-dasha-level-${t.level}`}>
      {depth > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
          <span>
            <strong>{LEVEL_LABEL[t.level]}</strong> · {GRAHA_LABELS[t.path.mahadasha!]}
            {t.path.antardasha ? ` / ${GRAHA_LABELS[t.path.antardasha]}` : ""}
            {t.parent ? ` · ${fmtLocal(t.parent.start)} → ${fmtLocal(t.parent.end)}` : ""}
          </span>
          {onOpenLevel && (
            <button type="button" className="text-sky-700 underline" onClick={() => onOpenLevel({ mahadasha: t.path.mahadasha, antardasha: t.path.antardasha })}>
              Bu düzeyi seçiciye aktar (not / kayıt için)
            </button>
          )}
        </div>
      )}
      <DashaTimeline t={t} current={current} sel={sel} onSel={setSel} now={now} />
      {/* 5.1C: 5 sütunlu dönem tablosu yan sütuna sığmıyordu (masaüstünde yatay kaydırma) → tablo tam genişlik, ayrıntı altında. */}
      <div className="grid min-w-0 gap-2">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full" data-testid={`astro-vedic-dasha-table-${t.level}`}>
            <thead>
              <tr>
                <th className={th}>Yönetici</th>
                <th className={th}>Başlangıç</th>
                <th className={th}>Bitiş</th>
                <th className={th}>Süre</th>
                {isKp && <th className={th}>KP evleri (L1→L4)</th>}
                {canDrill && <th className={th}>Alt dönem</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {t.periods.map((x, i) => (
                <tr key={`${x.lord}-${x.start}`} className={`cursor-pointer ${sel === i ? "bg-amber-50" : ""}`} onClick={() => setSel(i)} data-dasha-lord={x.lord}>
                  <td className={`${td} font-medium`}>
                    <span className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${LORD_TONE[x.lord]}`} aria-hidden />
                    {GRAHA_LABELS[x.lord]}
                    {current === i && <span className="ml-1 rounded bg-rose-600 px-1 text-[10px] text-white">şimdi</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{fmtLocal(x.start)}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmtLocal(x.end)}</td>
                  <td className={`${td} whitespace-nowrap text-xs`}>
                    {fmtYears(x.durationYears)}
                    {x.nominalStart ? " · doğumla kesilmiş" : ""}
                  </td>
                  {isKp && (
                    <td className={`${td} whitespace-nowrap text-xs tabular-nums`}>
                      {kpHouses(x).join(", ") || "—"}
                      {/* 6.1A: düğüm listesi ajan ekli (dasha ucu kuralı) — harita tablosundaki sade listeyle aynı şey DEĞİL. */}
                      {isKpNode(x.lord) && <KpNodeMethodTag method={KP_NODE_SIG_SOURCE.dasha} />}
                    </td>
                  )}
                  {canDrill && (
                    <td className={td}>
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          void expand(i);
                        }}
                        aria-expanded={!!open[i] && open[i] !== "loading"}
                        data-dasha-drill={x.lord}
                      >
                        {open[i] === "loading" ? "…" : open[i] ? "Kapat" : t.level === "mahadasha" ? "Antardasha" : "Pratyantardasha"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label="Seçili dönem" data-testid="astro-vedic-dasha-detail">
          <h4 className="font-semibold text-amber-900">
            {LEVEL_LABEL[t.level]}: {GRAHA_LABELS[p.lord]}
          </h4>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-slate-500">Başlangıç</dt>
            <dd>{fmtLocalTime(p.start)}</dd>
            <dt className="text-slate-500">Bitiş</dt>
            <dd>{fmtLocalTime(p.end)}</dd>
            <dt className="text-slate-500">Süre</dt>
            <dd>
              {fmtYears(p.durationYears)} ({p.durationYears.toFixed(4)} y)
            </dd>
            {p.nominalStart && (
              <>
                <dt className="text-slate-500">Teorik başlangıç</dt>
                <dd>{fmtLocalTime(p.nominalStart)} (doğumdan önce; dönem doğumla kesildi)</dd>
              </>
            )}
            {p.kp && (
              <>
                <dt className="text-slate-500">KP konumu</dt>
                <dd>
                  {p.kp.house}. ev (Placidus) · star lord {GRAHA_LABELS[p.kp.starLord]} · sub lord {GRAHA_LABELS[p.kp.subLord]}
                </dd>
                <dt className="text-slate-500">Gösterdiği evler</dt>
                <dd data-testid="astro-kp-dasha-levels">
                  {[1, 2, 3, 4].map((l) => `L${l}: ${p.kp!.levels[l as 1 | 2 | 3 | 4].join(", ") || "—"}`).join(" · ")}
                  {isKpNode(p.lord) ? (
                    <>
                      {" "}
                      <KpNodeMethodTag method={KP_NODE_SIG_SOURCE.dasha} /> <span className="text-xs text-slate-600">({KP_NODE_SIG_METHODS[KP_NODE_SIG_SOURCE.dasha].label})</span>
                    </>
                  ) : null}
                </dd>
              </>
            )}
          </dl>
          <KbList kb={kb} />
        </section>
      </div>
      {t.periods.map((x, i) => {
        const r = open[i];
        if (!r || r === "loading") return null;
        return (
          <div key={`child-${x.lord}-${x.start}`} className="ml-2 sm:ml-4" data-testid={`astro-vedic-dasha-child-${x.lord}`}>
            {r.ok ? (
              <DashaLevelView t={r.technical} kbLookup={(keys) => r.kb.filter((e) => keys.includes(e.topicKey))} drill={drill} onOpenLevel={onOpenLevel} depth={depth + 1} />
            ) : (
              <p className="text-sm text-rose-700">{r.error}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function VedicDashaPanel({
  t,
  kbLookup,
  drill,
  onOpenLevel,
}: {
  t: VedicDashaTechnical;
  kbLookup?: KbLookup | null;
  drill?: DashaDrill;
  onOpenLevel?: (o: { mahadasha: VedicGrahaId | null; antardasha: VedicGrahaId | null }) => void;
}) {
  const off = t.utcOffsetHours;
  const offLabel = `UTC${off >= 0 ? "+" : "−"}${String(Math.floor(Math.abs(off))).padStart(2, "0")}:${String(Math.round((Math.abs(off) % 1) * 60)).padStart(2, "0")}`;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-dasha-panel" data-level={t.level}>
      {t.periods.some((x) => !!x.kp) && (
        <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-900" data-testid="astro-kp-dasha-method">
          <strong>Olay tahmini değildir.</strong> Tarihler Vimshottari (KP ayanamsa); dönem lordlarının KP significator&apos;ları hesaplama sonucundan. Bu teknik KP olay
          zamanlaması (ev grubu → dönem eşleştirmesi) sunmaz, Yaşam Sistemi de üretmez; dönemleri yorumlamak uzmana aittir.
        </p>
      )}
      {t.periods.some((x) => !!x.kp && isKpNode(x.lord)) && <KpNodeMethodLegend methods={[KP_NODE_SIG_SOURCE.dasha]} context="KP dasha (dasha ucu, significators açık)" />}
      <p className="text-sm text-slate-700">
        <strong>Vimshottari</strong> · {LEVEL_LABEL[t.level]}
        {t.path.mahadasha ? ` · ${GRAHA_LABELS[t.path.mahadasha]}` : ""}
        {t.path.antardasha ? ` / ${GRAHA_LABELS[t.path.antardasha]}` : ""} · Janma nakshatra{" "}
        <strong>
          {t.moon.nakshatraIndex + 1}. {nakName(NAKSHATRA_IDS[t.moon.nakshatraIndex])}
        </strong>{" "}
        (yönetici {GRAHA_LABELS[t.moon.nakshatraLord]}) · ayanamsa {AYANAMSA_LABEL[t.frame.ayanamsa] ?? t.frame.ayanamsa}
        {t.balance ? ` · doğumda kalan ${GRAHA_LABELS[t.moon.nakshatraLord]} dönemi: ${t.balance.years} y ${t.balance.months} ay ${t.balance.days} g` : ""}
      </p>
      <p className="text-xs text-slate-500">
        Tarihler doğum yerel saatiyle ({offLabel}) sağlayıcıdan gelir; yeniden hesaplanmaz. Alt dönemler tıklanınca yüklenir (önbellekte varsa yeni istek yok).
        {!drill && t.level !== "pratyantardasha" ? " Kayıtlı analizde alt dönem yüklenmez — çalışma alanında açın." : ""}
      </p>
      <DashaLevelView t={t} kbLookup={kbLookup ?? null} drill={drill} onOpenLevel={onOpenLevel} depth={0} />
    </div>
  );
}
