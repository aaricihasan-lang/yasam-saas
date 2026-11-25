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
import { useLocale, useTranslations } from "next-intl";
import { dmyOf } from "../_lib/atlasDate";
import { NAKSHATRAS as NAKSHATRA_IDS, NAKSHATRA_LORDS, VEDIC_YOGA_FAMILY_LABELS, type NakshatraPlacement, type VedicD1Technical, type VedicDashaTechnical, type VedicGraha, type VedicGrahaId, type VedicVargaTechnical } from "@/lib/astrology/model/vedic";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { SIGN_GLYPHS, formatDegree } from "@/lib/astrology/labels/tr";
import { BPHS_VARGA_RULES, checkVargaAgainstBphs, type VargaCheck } from "@/lib/astrology/verify/varga";
import { KP_NODE_SIG_SOURCE, isKpNode } from "@/lib/astrology/model/kp";
import { KpNodeMethodLegend, KpNodeMethodTag } from "./KpPanels";
import { kundliLegend, type KundliLocale } from "../_lib/kundliLocalize";
import { TITLE, nakName, localizeKundliDom, type ChartStyle } from "../_lib/kundliData";
// 2026-10-15: saf harita veri yardımcıları _lib/kundliData'ya taşındı (rapor sunucusu da kullanır); eski içe aktarımlar için yeniden dışa açılır.
export { toKundliData, toVargaChartData, kundliTitles, localizeKundliDom } from "../_lib/kundliData";
import { toKundliData, toVargaChartData, kundliTitles } from "../_lib/kundliData";
import { applyCentreText } from "../_lib/chalitKundli";
import { VedicYogaTable } from "./VedicYogaTable";
import { VEDIC_YOGA_INFO, isVedicYogaDetectId } from "@/lib/astrology/model/vedicYoga";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";

export type KbLookup = (topicKeys: string[]) => { topicKey: string; topicLabel: string; title: string; body: string }[];

/** Ayanamsa kimlikleri (gösterim adı katalogda: atlas.vedic.ayanamsa.*; bilinmeyen kimlik aynen gösterilir). */
const AYANAMSA_IDS = new Set(["lahiri", "raman", "kp-newcomb", "kp-old"]);

/** I18N ATLAS-V: panel çevirmenleri. Graha / burç adları ortak terim kataloğundan (TR değerleri GRAHA_LABELS / SIGN_LABELS ile birebir). */
function useVedicText() {
  const t = useTranslations("atlas.vedic");
  const tt = useTranslations("terms");
  const loc = useLocale();
  const locale: KundliLocale = loc === "en" ? "en" : "tr";
  const graha = (id: VedicGrahaId) => tt(`graha.${id}`);
  const sign = (id: string) => tt(`zodiac.${id as (typeof SIGN_IDS)[number]}`);
  const ayan = (id: string) => (AYANAMSA_IDS.has(id) ? t(`ayanamsa.${id}`) : id);
  return { t, tt, locale, graha, sign, ayan };
}

/** Roxy kundli / varga web bileşeni (yalnız istemcide, dinamik yükleme). */
export function RoxyKundli({
  data,
  style,
  kind = "kundli",
  titles = {},
  centreText,
}: {
  data: unknown;
  style: ChartStyle;
  kind?: "kundli" | "divisional";
  titles?: Record<string, string>;
  /** 22.10.2026: bileşenin merkez etiketinin ("D1 Rashi") yerine yazılacak metin (ör. Bhav Chalit). Verilmezse davranış AYNEN. */
  centreText?: string;
}) {
  const { t: tv, locale } = useVedicText();
  const ref = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    // Türkçe katalog: kütüphanenin kendi yazdığı metinler (gösterge, ipucu ekleri). Graha/burç kısaltmaları
    // kütüphanede yerelleşmez → localizeKundliDom. I18N ATLAS-V: İngilizce kütüphanenin varsayılanıdır (katalog yüklenmez).
    Promise.all([kind === "divisional" ? import("@roxyapi/ui/components/divisional-chart") : import("@roxyapi/ui/components/vedic-kundli"), locale === "tr" ? import("@roxyapi/ui/locales/tr") : Promise.resolve()])
      .then(() => alive && setReady(true))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [kind, locale]);
  useEffect(() => {
    if (ready && ref.current) (ref.current as unknown as { data: unknown }).data = data;
  }, [ready, data]);
  const titlesKey = JSON.stringify(titles);
  useEffect(() => {
    const root = ready ? ref.current?.shadowRoot : null;
    if (!root) return;
    const t = JSON.parse(titlesKey) as Record<string, string>;
    const apply = () => {
      localizeKundliDom(root, t, style, locale);
      if (centreText) applyCentreText(root, centreText);
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(root, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  }, [ready, style, titlesKey, centreText, locale]);
  if (failed) return <p className="text-sm text-rose-700">{tv("kundli.loadFailed")}</p>;
  // Mobilde bileşenin iç dolgusu (1.5rem) haritayı ~245 px'e küçültüyordu → küçük ekranda 0.5rem (CSS değişkeni gölge DOM'a miras geçer).
  return (
    <div className="roxy-host w-full min-w-0 [--roxy-space-lg:0.5rem] sm:[--roxy-space-lg:1.5rem]" data-testid="astro-vedic-kundli">
      {createElement(kind === "divisional" ? "roxy-divisional-chart" : "roxy-vedic-kundli", { ref, "chart-style": style, lang: locale, "hide-readings": "", "hide-sections": kind === "divisional" ? "header,tablist,details" : "header,tablist" })}
      {!ready && <p className="text-sm text-slate-400">{tv("kundli.loading")}</p>}
      <p className="mt-1 text-center text-[11px] leading-snug text-slate-500" data-testid="astro-vedic-kundli-legend">
        {kundliLegend(VEDIC_GRAHA_ORDER, locale)}
        {tv("kundli.legendTail")}
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
  const { t: tx, locale, graha, sign, ayan } = useVedicText();
  const [style, setStyle] = useState<ChartStyle>("north");
  const [sel, setSel] = useState<string>("lagna");
  const data = useMemo(() => toKundliData(t), [t]);
  const titles = useMemo(() => kundliTitles(t.grahas, undefined, t.combustion.map((c) => c.id), locale), [t, locale]);
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
  const pointLabel = (p: NakshatraRow["point"]) => (p === "lagna" ? tx("lagna") : graha(p));
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-d1-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-700">
          {tx("d1.framePrefix")}
          <strong>{ayan(t.frame.ayanamsa)}</strong> {t.frame.ayanamsaDegrees.toFixed(4)}
          {tx("d1.frameLagna")}{" "}
          <strong>
            {SIGN_GLYPHS[t.lagna.rashi]} {sign(t.lagna.rashi)} {formatDegree(t.lagna.degreeInRashi)}
          </strong>{" "}
          {tx("d1.frameBhava")}
        </p>
        <div className="flex gap-1" role="tablist" aria-label={tx("chartStyleLabel")}>
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
              {tx(`chartStyle.${s}`)}
            </button>
          ))}
        </div>
      </div>
      {/* Y5 (15.11.2026): harita + ayrıntı yan yana yalnız kap genişliği yetiyorsa (harita en az 22rem) — dar sol panelde etiketler küçülüyordu. */}
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        <div className="vedic-kundli-frame mx-auto w-full min-w-0 max-w-[520px] flex-[1_1_22rem]">
          <RoxyKundli data={data} style={style} titles={titles} />
        </div>
        <section className="min-w-0 flex-[1_1_16rem] rounded-xl border border-amber-200 bg-amber-50/40 p-3" aria-label={tx("d1.detailLabel")} data-testid="astro-vedic-detail">
          <h4 className="mb-1 text-sm font-semibold text-amber-900">{selected ? graha(selected.id) : tx("lagna")}</h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-slate-500">{tx("rashi")}</dt>
            <dd>
              {SIGN_GLYPHS[point.rashi]} {sign(point.rashi)} {formatDegree(point.degreeInRashi)}
            </dd>
            <dt className="text-slate-500">{tx("bhava")}</dt>
            <dd>{selected ? selected.house : 1}</dd>
            <dt className="text-slate-500">{tx("nakshatra")}</dt>
            <dd>
              {nakName(point.nakshatra.id)} · {point.nakshatra.pada}
              {tx("d1.padaLord")}
              {graha(point.nakshatra.lord)}
            </dd>
            <dt className="text-slate-500">{tx("d1.inNakshatra")}</dt>
            <dd>
              {locale === "tr" ? "%" : null}
              {Math.round(point.nakshatra.ratio * 100)}
              {tx("d1.pctRemaining")}
              {formatDegree(point.nakshatra.remaining)}
              {point.nakshatra.abhijit ? " · Abhijit" : ""}
            </dd>
            {selected && (
              <>
                <dt className="text-slate-500">{tx("d1.motion")}</dt>
                <dd>{selected.retrograde ? tx("d1.retro") : tx("d1.direct")}</dd>
                <dt className="text-slate-500">{tx("d1.avastha")}</dt>
                <dd>{avasthaText(selected)}</dd>
                {t.combustion.some((c) => c.id === selected.id) && (
                  <>
                    <dt className="text-slate-500">{tx("d1.asta")}</dt>
                    <dd>
                      {tx("d1.astaA")}
                      {t.combustion.find((c) => c.id === selected.id)!.distanceFromSun.toFixed(2)}
                      {tx("d1.astaB")}
                      {t.combustion.find((c) => c.id === selected.id)!.orb}
                      {tx("d1.astaC")}
                    </dd>
                  </>
                )}
              </>
            )}
          </dl>
          <div className="mt-2 border-t border-amber-200 pt-2" data-testid="astro-vedic-detail-kb">
            <div className="text-xs font-semibold text-indigo-900">{tx("kb.title")}</div>
            {kb === null ? (
              <p className="text-xs text-slate-500">{tx("kb.notLoaded")}</p>
            ) : kb.length === 0 ? (
              <p className="text-xs text-slate-500">{tx("kb.noneForPlacement")}</p>
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
        <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{tx("d1.grahaTableTitle")}</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full" data-testid="astro-vedic-graha-table">
            <thead>
              <tr>
                <th className={th}>{tx("col.graha")}</th>
                <th className={th}>{tx("col.rashiDegree")}</th>
                <th className={th}>{tx("bhava")}</th>
                <th className={th}>{tx("col.nakshatraPada")}</th>
                <th className={th}>{tx("col.lord")}</th>
                <th className={th}>{tx("col.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className={`cursor-pointer ${sel === "lagna" ? "bg-amber-50" : ""}`} onClick={() => setSel("lagna")} data-graha="lagna">
                <td className={`${td} font-semibold`}>{tx("lagna")}</td>
                <td className={td}>
                  {SIGN_GLYPHS[t.lagna.rashi]} {sign(t.lagna.rashi)} {formatDegree(t.lagna.degreeInRashi)}
                </td>
                <td className={td}>1</td>
                <td className={td}>
                  {nakName(t.lagna.nakshatra.id)} · {t.lagna.nakshatra.pada}
                </td>
                <td className={td}>{graha(t.lagna.nakshatra.lord)}</td>
                <td className={td}>—</td>
              </tr>
              {t.grahas.map((g) => (
                <tr key={g.id} className={`cursor-pointer ${sel === g.id ? "bg-amber-50" : ""}`} onClick={() => setSel(g.id)} data-graha={g.id}>
                  <td className={td}>{graha(g.id)}</td>
                  <td className={td}>
                    {SIGN_GLYPHS[g.rashi]} {sign(g.rashi)} {formatDegree(g.degreeInRashi)}
                  </td>
                  <td className={td}>{g.house}</td>
                  <td className={td}>
                    {nakName(g.nakshatra.id)} · {g.nakshatra.pada}
                  </td>
                  <td className={td}>{graha(g.nakshatra.lord)}</td>
                  <td className={`${td} text-xs`}>
                    {g.retrograde ? tx("d1.statusRetro") : ""}
                    {t.combustion.some((c) => c.id === g.id) ? tx("d1.statusAsta") : ""}
                    {avasthaText(g)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white" aria-label={tx("nak.sectionLabel")} data-testid="astro-vedic-nakshatra">
        <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{tx("nak.title")}</h4>
        <div className="flex flex-col gap-3 p-3">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-sm" data-testid="astro-vedic-janma">
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-800">{tx("nak.janmaTitle")}</div>
            <div className="text-slate-800">
              <strong>
                {nak.janma.nakshatra.index + 1}. {nakName(nak.janma.nakshatra.id)}
              </strong>{" "}
              · {nak.janma.nakshatra.pada}
              {tx("d1.padaLord")}
              {graha(nak.janma.nakshatra.lord)}
              {tx("nak.traversed")}
              {Math.round(nak.janma.nakshatra.ratio * 100)}
              {tx("nak.remaining")}{" "}
              {formatDegree(nak.janma.nakshatra.remaining)}
            </div>
            <p className="text-xs text-slate-500">{tx("nak.janmaNote")}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full" data-testid="astro-vedic-nakshatra-table">
              <thead>
                <tr>
                  <th className={th}>{tx("col.point")}</th>
                  <th className={th}>{tx("nakshatra")}</th>
                  <th className={th}>{tx("col.pada")}</th>
                  <th className={th}>{tx("col.progress")}</th>
                  <th className={th}>{tx("col.lordPlace")}</th>
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
                        <span className="text-xs text-slate-600">
                          {locale === "tr" ? "%" : null}
                          {Math.round(r.nakshatra.ratio * 100)}
                          {locale === "tr" ? null : "%"}
                        </span>
                      </div>
                    </td>
                    <td className={`${td} text-xs`}>
                      {graha(r.nakshatra.lord)} → {SIGN_GLYPHS[r.lordRashi as keyof typeof SIGN_GLYPHS]} {sign(r.lordRashi)}, {r.lordHouse}
                      {tx("bhavaSuffix")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">{tx("nak.byLordTitle")}</div>
            <div className="flex flex-wrap gap-1.5 text-xs" data-testid="astro-vedic-nakshatra-lords">
              {nak.byLord.map((g) => (
                <span key={g.lord} className={`rounded-full border px-2 py-0.5 ${g.points.length ? "border-indigo-200 bg-white text-slate-800" : "border-slate-100 text-slate-400"}`}>
                  <strong>{graha(g.lord)}</strong>: {g.points.length ? g.points.map(pointLabel).join(", ") : "—"}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
        <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
          {tx("yoga.sectionA")}
          {presentYogas.length}/{t.yogas.length}
          {tx("yoga.sectionB")}
        </h4>
        <div className="grid gap-3 p-3 md:grid-cols-2">
          <div className="grid grid-cols-3 gap-1 text-xs sm:grid-cols-4">
            {Array.from({ length: 12 }, (_, i) => {
              const s = SIGN_IDS[(lagnaIdx + i) % 12];
              return (
                <div key={i} className="rounded border border-slate-100 px-1.5 py-1">
                  <span className="font-semibold">{i + 1}.</span> {SIGN_GLYPHS[s]} {sign(s)}
                </div>
              );
            })}
          </div>
          <ul className="flex flex-col gap-1 text-sm" data-testid="astro-vedic-yogas">
            {presentYogas.length === 0 && <li className="text-slate-500">{tx("yoga.none")}</li>}
            {presentYogas.map((y) => (
              <li key={y.id} className="rounded-lg bg-slate-50 px-2 py-1">
                <span className="font-medium">{y.name}</span>{" "}
                <span className="text-xs text-slate-500">
                  {y.family}
                  {y.quality ? tx("yoga.qualityLine", { q: tx(`yoga.quality.${y.quality === "positive" ? "positive" : y.quality === "negative" ? "negative" : "mixed"}`) }) : ""}
                </span>
                {/* K2 (15.11.2026): oluşum kuralı Türkçe kural tablosundan; hizmetin İngilizce kanıt cümlesi yalnız açılır ayrıntıda,
                    "özgün İngilizce metin" diye işaretli (çeviri uydurulmaz). */}
                {isVedicYogaDetectId(y.id) && (
                  <div className="text-xs text-slate-600" data-testid="astro-vedic-yoga-formation">
                    {tx("yoga.formation")}
                    {VEDIC_YOGA_INFO[y.id].formation}
                  </div>
                )}
                {y.evidence && (
                  <details className="text-xs text-slate-500" data-testid="astro-vedic-yoga-evidence">
                    <summary className="cursor-pointer select-none">{tx("yoga.evidenceSummary")}</summary>
                    <div className="mt-0.5 break-words" lang="en">
                      {y.evidence}
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
        {suppressedYogas.length > 0 && (
          <div className="border-t border-slate-100 px-3 py-2" data-testid="astro-vedic-suppressed-yogas">
            <div className="mb-1 text-xs font-semibold text-slate-600">
              {tx("yoga.suppressedTitle")}
              {suppressedYogas.length})
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {suppressedYogas.map((y, i) => (
                <li key={`${y.id}-${i}`} className="rounded-lg bg-slate-50 px-2 py-1">
                  <span className="font-medium">{y.name}</span>{" "}
                  <span className="text-xs text-slate-500">
                    {y.family}
                    {tx("yoga.suppressedBy")}
                    {VEDIC_YOGA_FAMILY_LABELS[y.suppressedBy!] ?? y.suppressedBy}
                  </span>
                  {y.evidence && (
                    <div className="text-xs text-slate-600">
                      {tx("yoga.evidence")}
                      {y.evidence}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-slate-500">{tx("yoga.precedenceNote")}</p>
          </div>
        )}
      </section>
      <VedicYogaTable t={t} />
      {t.planetaryWar.length > 0 && (
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white" data-testid="astro-vedic-war">
          <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{tx("war.title")}</h4>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={th}>{tx("war.graha1")}</th>
                  <th className={th}>{tx("war.graha2")}</th>
                  <th className={th}>{tx("war.distance")}</th>
                  <th className={th}>{tx("war.winner")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {t.planetaryWar.map((w, i) => (
                  <tr key={`${w.a}-${w.b}-${i}`}>
                    <td className={td}>{graha(w.a)}</td>
                    <td className={td}>{graha(w.b)}</td>
                    <td className={`${td} tabular-nums`}>{typeof w.distance === "number" ? `${locale === "tr" ? w.distance.toFixed(2).replace(".", ",") : w.distance.toFixed(2)}°` : "—"}</td>
                    <td className={td}>{w.winner ? graha(w.winner) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-3 pb-2 text-[11px] text-slate-500">{tx("war.note")}</p>
        </section>
      )}
    </div>
  );
}

function StyleTabs({ style, setStyle }: { style: ChartStyle; setStyle: (s: ChartStyle) => void }) {
  const { t: tx } = useVedicText();
  return (
    <div className="flex gap-1" role="tablist" aria-label={tx("chartStyleLabel")}>
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
          {tx(`chartStyle.${x}`)}
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
  const { t: tx, graha, sign } = useVedicText();
  const c = vargaCheckOf(t);
  const rule = BPHS_VARGA_RULES[t.division.number];
  const dn = `D${t.division.number}`;
  if (c.status === "mismatch") {
    return (
      <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs text-rose-900" data-testid="astro-vedic-varga-check" data-varga-check="mismatch">
        <strong>{tx("varga.check.notVerified")}</strong> {dn}
        {tx("varga.check.forPrefix")}
        {c.mismatches.length}/{c.checked}
        {tx("varga.check.mismatchMid")}
        {c.method}
        {tx("varga.check.mismatchOpen")}
        {c.mismatches.map((m) => tx("varga.check.mismatchItem", { point: m.id === "lagna" ? tx("lagna") : graha(m.id as VedicGrahaId), got: sign(m.got), expected: sign(m.expected) })).join("; ")}
        {tx("varga.check.mismatchTail")}
      </div>
    );
  }
  if (c.status === "unsupported") {
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900" data-testid="astro-vedic-varga-check" data-varga-check="unsupported">
        {dn}
        {tx("varga.check.unsupported")}
      </p>
    );
  }
  return (
    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900" data-testid="astro-vedic-varga-check" data-varga-check="match">
      <strong>{tx("varga.check.independent")}</strong> {c.checked}/{c.checked}
      {tx("varga.check.matchMid")}
      {c.method}
      {tx("varga.check.matchTail")}
      {rule?.rule}
      {c.goldenConfirmed ? tx("varga.check.goldenYes") : tx("varga.check.goldenNo")}
    </p>
  );
}

export function VedicVargaPanel({ t, kbLookup }: { t: VedicVargaTechnical; kbLookup?: KbLookup | null }) {
  const { t: tx, locale, graha, sign, ayan } = useVedicText();
  const [style, setStyle] = useState<ChartStyle>("north");
  const [sel, setSel] = useState<"lagna" | VedicGrahaId>("lagna");
  const data = useMemo(() => toVargaChartData(t), [t]);
  const titles = useMemo(() => kundliTitles(t.grahas, t.division.number, [], locale), [t, locale]);
  const d9 = t.division.number === 9;
  const dn = `D${t.division.number}`;
  const dl = `${dn} ${t.division.name}`;
  const point = sel === "lagna" ? t.lagna : (t.grahas.find((g) => g.id === sel) ?? t.lagna);
  const kb = kbLookup ? kbLookup(vargaTopicKeys(t, sel)) : null;
  const rows: VargaRow[] = [{ id: "lagna", p: t.lagna, retro: false }, ...t.grahas.map((g) => ({ id: g.id, p: g, retro: g.retrograde }))];
  const label = (id: "lagna" | VedicGrahaId) => (id === "lagna" ? tx("lagna") : graha(id));
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-varga-panel" data-division={t.division.number}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-700">
          <strong>{dl}</strong>
          {t.division.degreesPerDivision ? tx("varga.divisionPart", { part: String(t.division.degreesPerDivision) }) : ""}
          {tx("varga.ayanamsaSep")}
          <strong>{ayan(t.frame.ayanamsa)}</strong> · {dn}
          {tx("varga.lagnaSuffix")}{" "}
          <strong>
            {SIGN_GLYPHS[t.lagna.rashi]} {sign(t.lagna.rashi)}
          </strong>{" "}
          (D1: {sign(t.lagna.d1Rashi)}
          {tx("varga.vargottamaSep")}
          {t.vargottama.length ? t.vargottama.map((v) => graha(v)).join(", ") : tx("none")}
        </p>
        <StyleTabs style={style} setStyle={setStyle} />
      </div>
      <VargaVerification t={t} />
      {/* Y5 (15.11.2026): harita + ayrıntı yan yana yalnız kap genişliği yetiyorsa (harita en az 22rem) — dar sol panelde etiketler küçülüyordu. */}
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        <div className="mx-auto w-full min-w-0 max-w-[520px] flex-[1_1_22rem]">
          <RoxyKundli data={data} style={style} kind="divisional" titles={titles} />
        </div>
        <section className="min-w-0 flex-[1_1_16rem] rounded-xl border border-amber-200 bg-amber-50/40 p-3" aria-label={tx("varga.detailLabel")} data-testid="astro-vedic-varga-detail">
          <h4 className="mb-1 text-sm font-semibold text-amber-900">
            {label(sel)} · {dl}
          </h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-slate-500">{tx("varga.d1Rashi")}</dt>
            <dd>
              {SIGN_GLYPHS[point.d1Rashi]} {sign(point.d1Rashi)} {formatDegree(point.longitude % 30)}
            </dd>
            <dt className="text-slate-500">
              {dn}
              {tx("varga.rashiSuffix")}
            </dt>
            <dd>
              {SIGN_GLYPHS[point.rashi]} {sign(point.rashi)}
              {point.d1Rashi === point.rashi ? " · vargottama" : ""}
            </dd>
            <dt className="text-slate-500">
              {tx("varga.bhavaOpen")}
              {dn})
            </dt>
            <dd>{point.house}</dd>
            <dt className="text-slate-500">{tx("nakshatra")}</dt>
            <dd>
              {nakName(point.nakshatra.id)} · {point.nakshatra.pada}
              {tx("padaSuffix")}
              {d9 ? tx("varga.navamsaArrow", { sign: sign(point.rashi) }) : ""}
            </dd>
          </dl>
          <div className="mt-2 border-t border-amber-200 pt-2" data-testid="astro-vedic-varga-detail-kb">
            <div className="text-xs font-semibold text-indigo-900">{tx("kb.title")}</div>
            {kb === null ? (
              <p className="text-xs text-slate-500">{tx("kb.notLoaded")}</p>
            ) : kb.length === 0 ? (
              <p className="text-xs text-slate-500">{tx("kb.noneForPlacement")}</p>
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
        <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
          D1 → {dl}
          {tx("varga.clickRow")}
        </h4>
        <div className="overflow-x-auto">
          <table className="min-w-full" data-testid="astro-vedic-varga-table">
            <thead>
              <tr>
                <th className={th}>{tx("col.point")}</th>
                <th className={th}>{tx("varga.d1Rashi")}</th>
                <th className={th}>
                  {dn}
                  {tx("varga.rashiSuffix")}
                </th>
                <th className={th}>{tx("bhava")}</th>
                <th className={th}>{tx("col.nakshatraPada")}</th>
                <th className={th}>{tx("col.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ id, p, retro }) => (
                <tr key={id} className={`cursor-pointer ${sel === id ? "bg-amber-50" : ""}`} onClick={() => setSel(id)} data-varga-point={id}>
                  <td className={`${td} font-medium`}>{label(id)}</td>
                  <td className={td}>
                    {SIGN_GLYPHS[p.d1Rashi]} {sign(p.d1Rashi)}
                  </td>
                  <td className={td}>
                    {SIGN_GLYPHS[p.rashi]} {sign(p.rashi)}
                  </td>
                  <td className={td}>{p.house}</td>
                  <td className={td}>
                    {nakName(p.nakshatra.id)} · {p.nakshatra.pada}
                  </td>
                  <td className={`${td} text-xs`}>{[p.d1Rashi === p.rashi ? "vargottama" : "", retro ? tx("varga.retro") : ""].filter(Boolean).join(" · ")}</td>
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
/** 2026-10-21: alt düzey yolu (Maha → Antar → Pratyantar → Sookshma); 4.–5. düzey anahtarları yalnız doluysa. */
export type DashaPathSel = { mahadasha: VedicGrahaId; antardasha: VedicGrahaId | null; pratyantardasha?: VedicGrahaId | null; sookshma?: VedicGrahaId | null };
/** Alt düzeyi TEMBEL yükler: aynı çalıştırma ucu (planlayıcı + önbellek) → tekrar tıklama 0 sağlayıcı isteği. */
export type DashaDrill = (o: DashaPathSel) => Promise<DashaDrillResult>;
/** "Bu düzeyi seçiciye aktar" yolu. */
export type DashaLevelSel = { mahadasha: VedicGrahaId | null; antardasha: VedicGrahaId | null; pratyantardasha?: VedicGrahaId | null; sookshma?: VedicGrahaId | null };
/** Bir düzeydeki dönemin bir alt düzey yolu (en ince düzey Prana → alt düzey yok). SAF. */
export function dashaChildPath(t: Pick<VedicDashaTechnical, "level" | "path">, lord: VedicGrahaId): DashaPathSel | null {
  const p = t.path;
  switch (t.level) {
    case "mahadasha":
      return { mahadasha: lord, antardasha: null };
    case "antardasha":
      return { mahadasha: p.mahadasha!, antardasha: lord };
    case "pratyantardasha":
      return { mahadasha: p.mahadasha!, antardasha: p.antardasha!, pratyantardasha: lord };
    case "sookshma":
      return { mahadasha: p.mahadasha!, antardasha: p.antardasha!, pratyantardasha: p.pratyantardasha!, sookshma: lord };
    default:
      return null;
  }
}
const NEXT_LEVEL_LABEL: Partial<Record<VedicDashaTechnical["level"], string>> = { mahadasha: "Antardasha", antardasha: "Pratyantardasha", pratyantardasha: "Sookshma", sookshma: "Prana" };

/** Sağlayıcı yerel tarih-saati ("YYYY-MM-DDTHH:MM:SS", doğum ofseti) → UTC ms. SAF. */
export function dashaUtcMs(local: string, offsetHours: number): number {
  return Date.parse(`${local}Z`) - offsetHours * 3_600_000;
}
/** Verilen anda süren dönemin sırası (yoksa -1). SAF. */
export function currentDashaIndex(t: Pick<VedicDashaTechnical, "periods" | "utcOffsetHours">, nowMs: number): number {
  return t.periods.findIndex((p) => dashaUtcMs(p.start, t.utcOffsetHours) <= nowMs && nowMs < dashaUtcMs(p.end, t.utcOffsetHours));
}
/** Seçili dönemin Bilgi Bankası konu anahtarı (düzeye göre). SAF. */
export function dashaTopicKey(t: Pick<VedicDashaTechnical, "path"> & { level?: VedicDashaTechnical["level"] }, lord: VedicGrahaId): string {
  // Sookshma / Prana için Bilgi Bankası konu türü yok → eşleşmeyen anahtar (üst düzey konusuna yanlış atanmaz).
  if (t.level === "sookshma" || t.level === "prana") return `dasha_${t.level}:none`;
  const { mahadasha: md, antardasha: ad } = t.path;
  return md && ad ? `dasha_pratyantardasha:${md}:${ad}:${lord}` : md ? `dasha_antardasha:${md}:${lord}` : `dasha_mahadasha:${lord}`;
}
/** ATLAS-B: gün/ay/yıl ayracı ekran diline (tr "." aynen · en "/"). */
const fmtLocal = (s: string, loc = "tr") => dmyOf(s, loc);
const fmtLocalTime = (s: string, loc = "tr") => `${fmtLocal(s, loc)} ${s.slice(11, 16)}`;
/** Süre birimi yazıcısı (katalog: atlas.vedic.unit.*; TR "{n} y" / "{n} ay" / "{n} g" / "{n} sa" / "{n} dk"). */
type UnitFmt = (unit: "y" | "mo" | "d" | "h" | "min", n: number) => string;
function fmtYears(y: number, u: UnitFmt): string {
  const yy = Math.floor(y + 1e-9);
  const mf = (y - yy) * 12;
  const mm = Math.floor(mf + 1e-9);
  const dd = Math.round((mf - mm) * 30.4375);
  return [yy ? u("y", yy) : "", mm ? u("mo", mm) : "", dd || (!yy && !mm) ? u("d", dd) : ""].filter(Boolean).join(" ");
}
/** Kısa dönemler (Sookshma günler, Prana saatler) için okunur süre. */
function fmtDur(y: number, u: UnitFmt): string {
  if (y >= 1 / 12) return fmtYears(y, u);
  const d = y * 365.25;
  if (d >= 1) return `${u("d", Math.floor(d))} ${u("h", Math.round((d % 1) * 24))}`;
  const m = Math.round(d * 1440);
  return m >= 60 ? `${u("h", Math.floor(m / 60))} ${u("min", m % 60)}` : u("min", m);
}
/** Dasha metinleri: düzey adı ortak terim kataloğundan (TR değerleri önceki LEVEL_LABEL ile birebir). */
function useDashaText() {
  const v = useVedicText();
  const u: UnitFmt = (unit, n) => v.t(`unit.${unit}`, { n: String(n) });
  const level = (l: VedicDashaTechnical["level"]) => v.tt(`dashaLevel.${l}`);
  return { ...v, u, level };
}
const deepLevel = (l: VedicDashaTechnical["level"]) => l === "sookshma" || l === "prana";
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
  const { t: tx, graha } = useVedicText();
  const loc = useLocale();
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
            {tx("dasha.today")}
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
              title={`${graha(p.lord)} · ${fmtLocal(p.start, loc)} → ${fmtLocal(p.end, loc)}`}
              className={`${LORD_TONE[p.lord]} min-w-0 border-r border-white/70 text-[10px] font-semibold text-slate-800 last:border-r-0 ${sel === i ? "ring-2 ring-inset ring-amber-600" : ""} ${current === i ? "brightness-95" : "opacity-90"}`}
              style={{ width: `${(p.durationYears / total) * 100}%` }}
              aria-label={tx("dasha.periodAria", { graha: graha(p.lord) })}
            >
              <span className="block truncate px-0.5">{(p.durationYears / total) * 100 > 5 ? graha(p.lord).split(" ")[0] : ""}</span>
            </button>
          ))}
        </div>
        {nowPct !== null && <div className="pointer-events-none absolute -top-0.5 bottom-0 w-0.5 bg-rose-600" style={{ left: `${nowPct}%` }} aria-hidden />}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{fmtLocal(t.periods[0].start, loc)}</span>
        <span>{fmtLocal(t.periods[t.periods.length - 1].end, loc)}</span>
      </div>
    </div>
  );
}

function KbList({ kb }: { kb: KbHit[] | null }) {
  const { t: tx } = useVedicText();
  return (
    <div className="mt-2 border-t border-amber-200 pt-2" data-testid="astro-vedic-dasha-detail-kb">
      <div className="text-xs font-semibold text-indigo-900">{tx("kb.title")}</div>
      {kb === null ? (
        <p className="text-xs text-slate-500">{tx("kb.notLoaded")}</p>
      ) : kb.length === 0 ? (
        <p className="text-xs text-slate-500">{tx("kb.noneForPeriod")}</p>
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
  onOpenLevel?: (o: DashaLevelSel) => void;
  depth: number;
}) {
  const { t: tx, graha, u, level } = useDashaText();
  const loc = useLocale();
  // KP düğüm yöntemi adı KP kataloğundan (TR değeri lib KP_NODE_SIG_METHODS ile birebir; atlas-kp-i18n kilidi).
  const tk = useTranslations("atlas.kp");
  const [now] = useState(() => Date.now());
  const current = currentDashaIndex(t, now);
  const [sel, setSel] = useState<number>(current >= 0 ? current : 0);
  const [open, setOpen] = useState<Record<number, DashaDrillResult | "loading">>({});
  const p = t.periods[Math.min(sel, t.periods.length - 1)];
  // 6E: KP dasha — konu anahtarları KP geleneğinde (dönem lordu + gösterdiği evler).
  const isKp = t.periods.some((x) => !!x.kp);
  const kpHouses = (x: (typeof t.periods)[number]) => (x.kp ? [...new Set([1, 2, 3, 4].flatMap((l) => x.kp!.levels[l as 1 | 2 | 3 | 4]))] : []);
  const kb = kbLookup ? kbLookup(isKp ? [`kp_dasha_lord:${p.lord}`, ...kpHouses(p).map((h) => `kp_dasha_signifies:${p.lord}:${h}`)] : [dashaTopicKey(t, p.lord)]) : null;
  // 2026-10-21: 5 düzey — Prana en ince düzeydir (alt düzey yok).
  const canDrill = !!drill && t.level !== "prana";
  const short = deepLevel(t.level);
  async function expand(i: number) {
    if (!drill) return;
    if (open[i] && open[i] !== "loading") {
      setOpen((o) => Object.fromEntries(Object.entries(o).filter(([k]) => Number(k) !== i)));
      return;
    }
    const child = dashaChildPath(t, t.periods[i].lord);
    if (!child) return;
    setOpen((o) => ({ ...o, [i]: "loading" }));
    const r = await drill(child);
    setOpen((o) => ({ ...o, [i]: r }));
  }
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${depth > 0 ? "rounded-xl border border-slate-200 bg-slate-50/60 p-2" : ""}`} data-testid={`astro-vedic-dasha-level-${t.level}`}>
      {depth > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
          <span>
            <strong>{level(t.level)}</strong> · {graha(t.path.mahadasha!)}
            {t.path.antardasha ? ` / ${graha(t.path.antardasha)}` : ""}
            {t.path.pratyantardasha ? ` / ${graha(t.path.pratyantardasha)}` : ""}
            {t.path.sookshma ? ` / ${graha(t.path.sookshma)}` : ""}
            {t.parent ? ` · ${short ? fmtLocalTime(t.parent.start, loc) : fmtLocal(t.parent.start, loc)} → ${short ? fmtLocalTime(t.parent.end, loc) : fmtLocal(t.parent.end, loc)}` : ""}
          </span>
          {onOpenLevel && (
            <button
              type="button"
              className="text-sky-700 underline"
              onClick={() => onOpenLevel({ mahadasha: t.path.mahadasha, antardasha: t.path.antardasha, pratyantardasha: t.path.pratyantardasha ?? null, sookshma: t.path.sookshma ?? null })}
            >
              {tx("dasha.openLevel")}
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
                <th className={th}>{tx("col.lord")}</th>
                <th className={th}>{tx("dasha.start")}</th>
                <th className={th}>{tx("dasha.end")}</th>
                <th className={th}>{tx("dasha.duration")}</th>
                {isKp && <th className={th}>{tx("dasha.kpHouses")}</th>}
                {canDrill && <th className={th}>{tx("dasha.subPeriod")}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {t.periods.map((x, i) => (
                <tr key={`${x.lord}-${x.start}`} className={`cursor-pointer ${sel === i ? "bg-amber-50" : ""}`} onClick={() => setSel(i)} data-dasha-lord={x.lord}>
                  <td className={`${td} font-medium`}>
                    <span className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${LORD_TONE[x.lord]}`} aria-hidden />
                    {graha(x.lord)}
                    {current === i && <span className="ml-1 rounded bg-rose-600 px-1 text-[10px] text-white">{tx("dasha.now")}</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{short ? fmtLocalTime(x.start, loc) : fmtLocal(x.start, loc)}</td>
                  <td className={`${td} whitespace-nowrap`}>{short ? fmtLocalTime(x.end, loc) : fmtLocal(x.end, loc)}</td>
                  <td className={`${td} whitespace-nowrap text-xs`}>
                    {short ? fmtDur(x.durationYears, u) : fmtYears(x.durationYears, u)}
                    {x.nominalStart ? tx("dasha.cutByBirth") : ""}
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
                        {open[i] === "loading" ? "…" : open[i] ? tx("dasha.close") : NEXT_LEVEL_LABEL[t.level]}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label={tx("dasha.selectedLabel")} data-testid="astro-vedic-dasha-detail">
          <h4 className="font-semibold text-amber-900">
            {level(t.level)}: {graha(p.lord)}
          </h4>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-slate-500">{tx("dasha.start")}</dt>
            <dd>{fmtLocalTime(p.start, loc)}</dd>
            <dt className="text-slate-500">{tx("dasha.end")}</dt>
            <dd>{fmtLocalTime(p.end, loc)}</dd>
            <dt className="text-slate-500">{tx("dasha.duration")}</dt>
            <dd>
              {short ? fmtDur(p.durationYears, u) : fmtYears(p.durationYears, u)} ({short ? tx("dasha.daysExact", { n: (p.durationYears * 365.25).toFixed(3) }) : tx("dasha.yearsExact", { n: p.durationYears.toFixed(4) })})
            </dd>
            {p.nominalStart && (
              <>
                <dt className="text-slate-500">{tx("dasha.nominalStart")}</dt>
                <dd>
                  {fmtLocalTime(p.nominalStart, loc)}
                  {tx("dasha.nominalNote")}
                </dd>
              </>
            )}
            {p.kp && (
              <>
                <dt className="text-slate-500">{tx("dasha.kpPosition")}</dt>
                <dd>
                  {p.kp.house}
                  {tx("dasha.kpHouseStar")}
                  {graha(p.kp.starLord)}
                  {tx("dasha.kpSub")}
                  {graha(p.kp.subLord)}
                </dd>
                <dt className="text-slate-500">{tx("dasha.signifiedHouses")}</dt>
                <dd data-testid="astro-kp-dasha-levels">
                  {[1, 2, 3, 4].map((l) => `L${l}: ${p.kp!.levels[l as 1 | 2 | 3 | 4].join(", ") || "—"}`).join(" · ")}
                  {isKpNode(p.lord) ? (
                    <>
                      {" "}
                      <KpNodeMethodTag method={KP_NODE_SIG_SOURCE.dasha} /> <span className="text-xs text-slate-600">({tk(`nodeMethod.${KP_NODE_SIG_SOURCE.dasha}.label`)})</span>
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
  onOpenLevel?: (o: DashaLevelSel) => void;
}) {
  const { t: tx, graha, level, ayan } = useDashaText();
  const off = t.utcOffsetHours;
  const offLabel = `UTC${off >= 0 ? "+" : "−"}${String(Math.floor(Math.abs(off))).padStart(2, "0")}:${String(Math.round((Math.abs(off) % 1) * 60)).padStart(2, "0")}`;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-dasha-panel" data-level={t.level}>
      {t.periods.some((x) => !!x.kp) && (
        <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-900" data-testid="astro-kp-dasha-method">
          <strong>{tx("dasha.kpNotForecast")}</strong>
          {tx("dasha.kpMethodNote")}
        </p>
      )}
      {t.periods.some((x) => !!x.kp && isKpNode(x.lord)) && <KpNodeMethodLegend methods={[KP_NODE_SIG_SOURCE.dasha]} context={tx("dasha.kpLegendContext")} />}
      <p className="text-sm text-slate-700">
        <strong>{tx("dasha.vimshottari")}</strong> · {level(t.level)}
        {t.path.mahadasha ? ` · ${graha(t.path.mahadasha)}` : ""}
        {t.path.antardasha ? ` / ${graha(t.path.antardasha)}` : ""}
        {t.path.pratyantardasha ? ` / ${graha(t.path.pratyantardasha)}` : ""}
        {t.path.sookshma ? ` / ${graha(t.path.sookshma)}` : ""}
        {tx("dasha.janmaNakshatra")}{" "}
        <strong>
          {t.moon.nakshatraIndex + 1}. {nakName(NAKSHATRA_IDS[t.moon.nakshatraIndex])}
        </strong>{" "}
        {tx("dasha.lordOpen")}
        {graha(t.moon.nakshatraLord)}
        {tx("dasha.lordCloseAyanamsa")}
        {ayan(t.frame.ayanamsa)}
        {t.balance ? tx("dasha.balance", { graha: graha(t.moon.nakshatraLord), y: String(t.balance.years), m: String(t.balance.months), d: String(t.balance.days) }) : ""}
      </p>
      <p className="text-xs text-slate-500">
        {tx("dasha.datesNoteA")}
        {offLabel}
        {tx("dasha.datesNoteB")}
        {!drill && t.level !== "prana" ? tx("dasha.savedNoDrill") : ""}
      </p>
      <DashaLevelView t={t} kbLookup={kbLookup ?? null} drill={drill} onOpenLevel={onOpenLevel} depth={0} />
      {t.current && <DashaChainTable c={t.current} />}
    </div>
  );
}

/** 2026-10-21: "Güncel dönem zinciri" — seçilen anda çalışan Maha → Prana (kayıtta ve raporda da aynı tablo). */
function DashaChainTable({ c }: { c: NonNullable<VedicDashaTechnical["current"]> }) {
  const { t: tx, graha, u, level, ayan } = useDashaText();
  const loc = useLocale();
  const kp = c.chain.some((x) => !!x.kp);
  const off = c.at.utcOffsetHours;
  const offLabel = `UTC${off >= 0 ? "+" : "−"}${String(Math.floor(Math.abs(off))).padStart(2, "0")}:${String(Math.round((Math.abs(off) % 1) * 60)).padStart(2, "0")}`;
  return (
    <section className="min-w-0 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 text-sm" aria-label={tx("chain.title")} data-testid="astro-dasha-chain">
      <h4 className="font-semibold text-indigo-900">{tx("chain.title")}</h4>
      <p className="text-xs text-slate-600">
        {tx("chain.atA")}
        {fmtLocalTime(c.at.utc, loc)}
        {tx("chain.atB")}
        {fmtLocalTime(c.at.local, loc)} ({offLabel}
        {tx("chain.atC")}
        {ayan(c.frame.ayanamsa)}
      </p>
      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full" data-testid="astro-dasha-chain-table">
          <thead>
            <tr>
              <th className={th}>{tx("chain.level")}</th>
              <th className={th}>{tx("col.lord")}</th>
              <th className={th}>{tx("dasha.start")}</th>
              <th className={th}>{tx("dasha.end")}</th>
              <th className={th}>{tx("dasha.duration")}</th>
              <th className={th} title={tx("chain.remainingTitle")}>
                {tx("chain.remaining")}
              </th>
              {kp && <th className={th}>{tx("dasha.kpHouses")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {c.chain.map((x) => (
              <tr key={x.level} data-dasha-chain-level={x.level}>
                <td className={`${td} whitespace-nowrap font-medium`}>{level(x.level)}</td>
                <td className={`${td} whitespace-nowrap`}>
                  <span className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${LORD_TONE[x.lord]}`} aria-hidden />
                  {graha(x.lord)}
                </td>
                <td className={`${td} whitespace-nowrap`}>{fmtLocalTime(x.start, loc)}</td>
                <td className={`${td} whitespace-nowrap`}>{fmtLocalTime(x.end, loc)}</td>
                <td className={`${td} whitespace-nowrap text-xs`}>{deepLevel(x.level) ? fmtDur(x.durationYears, u) : fmtYears(x.durationYears, u)}</td>
                <td className={`${td} whitespace-nowrap text-xs`}>{x.remainingDays === null ? "—" : x.remainingDays}</td>
                {kp && <td className={`${td} whitespace-nowrap text-xs tabular-nums`}>{x.kp ? [...new Set([1, 2, 3, 4].flatMap((l) => x.kp!.levels[l as 1 | 2 | 3 | 4]))].join(", ") : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {kp && c.commonHouses && (
        <p className="mt-1 text-xs text-slate-700" data-testid="astro-dasha-chain-common">
          {tx("chain.commonA")}
          <strong>{c.commonHouses.dashaBhuktiAntara.join(", ") || tx("none")}</strong>
          {tx("chain.commonB")}
          <strong>{c.commonHouses.allLevels.join(", ") || tx("none")}</strong>
          {tx("chain.commonC")}
        </p>
      )}
    </section>
  );
}
