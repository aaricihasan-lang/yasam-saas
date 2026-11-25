"use client";

/**
 * "Hesaplama / Teknik Veriler" — yalnız kanonik teknik katman. Sağlayıcı metni içermez;
 * tüm etiketler Yaşam Sistemi sözlüğünden (terms; TR değerleri lib/astrology/labels/tr ile birebir).
 *
 * I18N-F1-R5: ekran metni katalogdan (atlas.natalPanel + terms). Word/PDF ile paylaşılan lib cümleleri (dağılım yöntem
 * adları/notları, eşitlik cümlesi, Ay belirsizliği, 12:00 varsayımı, özet kartı notları) lib'de AYNEN kalır; ekran aynı
 * kompozisyonu katalogla kurar — TR çıktı lib ile birebir (scripts/astrology/atlas-a-r5-i18n.harness.ts kilitler).
 */

import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Element, Modality, NatalTechnical, SignId } from "@/lib/astrology/model/western";
import { ASPECT_GLYPHS, BODY_GLYPHS, SIGN_GLYPHS, formatDegree } from "@/lib/astrology/labels/tr";
import { DIST_METHODS, ELEMENT_ORDER, MODALITY_ORDER, distributive, natalDistribution, type DistMethod } from "@/lib/astrology/view/natalDistribution";
import { fitGridCell, fitGridStyle } from "./atlas/fitGrid";
import { aspectBalanceOf, listedNatalAspects, patternInvolvesMoon, timeUnknownDistribution } from "@/lib/astrology/view/natalTimeUnknown";
import { natalKeyPlacements } from "@/lib/astrology/view/natalKeyPlacements";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{title}</h4>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function SignCell({ sign, degree, assumed = false }: { sign: SignId; degree: number; assumed?: boolean }) {
  const tt = useTranslations("terms");
  return (
    <span className="whitespace-nowrap">
      <span className="mr-1">{SIGN_GLYPHS[sign]}</span>
      {assumed ? "≈ " : ""}
      {tt(`zodiac.${sign}`)} {formatDegree(degree)}
      {assumed && <AssumedChip />}
    </span>
  );
}

/** G2 (saat bilinmiyor): yerel 12:00 varsayımı etiketi — değer kesin doğrulanmış sonuç gibi sunulmaz. */
function AssumedChip() {
  const t = useTranslations("atlas.natalPanel");
  return (
    <span className="ml-1.5 inline-flex rounded-full border border-amber-300 bg-amber-50 px-1.5 text-[10.5px] font-semibold text-amber-900" data-assumed="1">
      {t("noonAssumption")}
    </span>
  );
}

/** lib joinTr ile aynı kalıp ("A", "A ve B", "A, B ve C"); bağlaç katalogdan. */
function joinList(items: string[], and: string): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

/**
 * G2 (saat bilinmiyor, Owner kararı): dağılımda Ay'ın 12:00 burcu kesin konum sayılmaz → Ay HARİÇ 9 gezegen (≈ 12:00 varsayımı);
 * 15 puanlık analiz Yükselen/MC olmadan üretilemez. Paylaşılan dağılım modülü ve rapor DEĞİŞMEZ.
 */
function TimeUnknownDistributionSummary({ technical }: { technical: NatalTechnical }) {
  const t = useTranslations("atlas.natalPanel");
  const tt = useTranslations("terms");
  const d = timeUnknownDistribution(technical);
  const cols = d.available
    ? [
        { key: "element", title: t("colElement"), order: ELEMENT_ORDER as readonly string[], label: (k: string) => tt(`element.${k as Element}`), values: d.elements as Record<string, number>, tops: d.topElements as readonly string[] },
        { key: "modality", title: t("colModality"), order: MODALITY_ORDER as readonly string[], label: (k: string) => tt(`modality.${k as Modality}`), values: d.modalities as Record<string, number>, tops: d.topModalities as readonly string[] },
      ]
    : [];
  return (
    <div className="px-3 py-2 text-sm" data-testid="natal-distribution" data-method="time-unknown">
      <p className="mb-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs leading-5 text-amber-900" data-testid="natal-dist-time-unknown">
        {t("timeUnknownDist", { moonText: t("moonUnknownText") })}
      </p>
      {!d.available ? (
        <p className="rounded-md bg-slate-50 px-2 py-1.5 text-xs leading-5 text-slate-600" data-testid="natal-dist-unavailable">
          {t("distNoData")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cols.map((c) => (
            <div key={c.title}>
              <div className="mb-1 font-medium text-slate-600">
                {c.title} · ≈ {c.tops.map((k) => c.label(k)).join(" · ")}
              </div>
              {c.order.map((k) => (
                <div key={k} className={`flex justify-between ${c.tops.includes(k) ? "font-semibold text-slate-900" : ""}`}>
                  <span>{c.label(k)}</span>
                  <span className="tabular-nums">{c.values[k]}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Dağılım özeti — iki yöntem (2026-11-07): "10 Gezegen" (varsayılan; sağlayıcının kayıtlı sayımı AYNEN) ve "15 Puanlık Analiz"
 * (Güneş/Ay/Yükselen 3, MC + Merkür…Satürn 1; kayıtlı teknik veriden yerel). Eşitlikte tek grup "baskın" ilan edilmez; 10
 * gezegende sağlayıcının eşitlik kuralı yalnız ikincil bilgi. Seçim yalnız bu görünümün yerel durumu (kayıt / sağlayıcı yok).
 */
function DistributionSummary({ technical }: { technical: NatalTechnical }) {
  const t = useTranslations("atlas.natalPanel");
  const tt = useTranslations("terms");
  const [method, setMethod] = useState<DistMethod>("planets10");
  const d = natalDistribution(technical, method);
  const seg = (m: DistMethod) =>
    `min-h-[34px] flex-1 rounded-md px-3 py-1 text-[12.5px] font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B1430] sm:flex-none ${
      method === m ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900"
    }`;
  return (
    <div className="px-3 py-2 text-sm" data-testid="natal-distribution" data-method={method}>
      <div className="mb-1.5 flex w-full rounded-lg bg-slate-100 p-0.5 sm:inline-flex sm:w-auto" role="group" aria-label={t("distMethodAria")}>
        {DIST_METHODS.map((m) => (
          <button key={m} type="button" className={seg(m)} aria-pressed={method === m} onClick={() => setMethod(m)} data-testid={`natal-dist-method-${m}`}>
            {t(`method.${m}`)}
          </button>
        ))}
      </div>
      <p className="mb-2 text-xs leading-5 text-slate-500" data-testid="natal-dist-note">
        {t(`methodNote.${method}`)}
      </p>
      {!d.available ? (
        <p className="rounded-md bg-slate-50 px-2 py-1.5 text-xs leading-5 text-slate-600" data-testid="natal-dist-unavailable">
          {d.reason === "no_angles" ? t("distNoAngles") : t("distNoData")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <DistColumn
            title={t("colElement")}
            order={ELEMENT_ORDER}
            label={(k) => tt(`element.${k}`)}
            values={d.elements}
            topKeys={d.topElements}
            unit={d.unit}
            providerPick={d.providerDominant?.element ?? null}
            testId="natal-element-tie"
          />
          <DistColumn
            title={t("colModality")}
            order={MODALITY_ORDER}
            label={(k) => tt(`modality.${k}`)}
            values={d.modalities}
            topKeys={d.topModalities}
            unit={d.unit}
            providerPick={d.providerDominant?.modality ?? null}
            testId="natal-modality-tie"
          />
        </div>
      )}
    </div>
  );
}

function DistColumn<K extends string>({
  title,
  order,
  label,
  values,
  topKeys,
  unit,
  providerPick,
  testId,
}: {
  title: string;
  order: readonly K[];
  label: (k: K) => string;
  values: Record<K, number>;
  topKeys: K[];
  unit: "gezegen" | "puan";
  providerPick: K | null;
  testId: string;
}) {
  const t = useTranslations("atlas.natalPanel");
  const locale = useLocale();
  const names = topKeys.map((k) => label(k));
  const tie = topKeys.length > 1;
  // lib dominantHeadline / tieSentence ile AYNI kompozisyon (TR birebir; üleştirme eki lib distributive).
  const headline = names.length === 0 ? "" : names.length === 1 ? t("dominant", { name: names[0] }) : t("tieHead", { names: names.join(" · ") });
  const value = tie ? values[topKeys[0]] : 0;
  return (
    <div>
      <div className="mb-1 font-medium text-slate-600">
        {title}
        {names.length > 0 ? ` · ${headline}` : ""}
      </div>
      {tie && (
        <p className="mb-1 rounded-md bg-amber-50 px-2 py-1 text-xs leading-5 text-amber-900" data-testid={testId}>
          {t(unit === "gezegen" ? "tiePlanets" : "tiePoints", { names: joinList(names, t("and")), each: locale === "tr" ? distributive(value) : String(value), value })}
          {providerPick && (
            <span className="block text-amber-800/80">
              {t("providerTieRule")} {t("providerPick", { name: label(providerPick) })}
            </span>
          )}
        </p>
      )}
      {order.map((k) => (
        <div key={k} className={`flex justify-between ${topKeys.includes(k) ? "font-semibold text-slate-900" : ""}`}>
          <span>{label(k)}</span>
          <span className="tabular-nums">{values[k]}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * G4 (2026-11-23): Özet sekmesinin EN ÜSTÜNDE (grup alanı ve teknik bölümlerden önce; çağıran yerleştirir — kayıtlı analiz ve canlı
 * sonuç) Güneş / Ay / Yükselen kartları — kayıtlı teknik veriden (yeni hesap yok). Özet bir yan panelde
 * de açılır (1440 px'te ~370 px) → yerleşim EKRANA değil KABA göre ve yalnız iki durum: kap ≥ 19rem ise üç kart aynı satırda, daha
 * darsa üçü tam genişlikte alt alta (2 + 1 dağılım oluşmaz; saf CSS, flex-basis = (eşik − %100) × 999). Saat bilinmiyorken G2 kuralı:
 * Güneş ≈ 12:00 varsayımı, Ay belirsiz (burç / derece yazılmaz), Yükselen bilinmiyor; Owner'ın tam metni kart ipucunda ve
 * Özet'teki saat uyarısında.
 * I18N-F1-R5: başlık / burç / not / ipucu katalogdan; karar (durum) lib natalKeyPlacements'tan AYNEN.
 */
const KEY_CARD_ROW_MIN = "19rem";
export function NatalKeyPlacementCards({ technical, timeUnknown }: { technical: NatalTechnical; timeUnknown: boolean }) {
  const t = useTranslations("atlas.natalPanel");
  const tt = useTranslations("terms");
  const titleOf = (key: "sun" | "moon" | "asc") => (key === "asc" ? tt("angle.ascendant") : tt(`body.${key}`));
  const noteOf = (key: "sun" | "moon" | "asc", status: string): { note: string | null; detail: string | null } => {
    if (key === "sun" && status === "assumed") return { note: t("keySunAssumedNote"), detail: t("keySunAssumedDetail") };
    if (key === "asc" && status === "unknown") return { note: t("keyAscUnknownNote"), detail: t("keyAscUnknownDetail") };
    if (key !== "asc" && status === "unknown") return { note: t("keyMoonUnknownNote"), detail: t("moonUnknownText") };
    return { note: null, detail: null };
  };
  return (
    <div className="mb-3 flex flex-wrap gap-2" data-testid="natal-key-placements">
      {natalKeyPlacements(technical, timeUnknown).map((k) => {
        const known = k.status === "exact" || k.status === "assumed";
        const nd = noteOf(k.key, k.status);
        return (
          <div
            key={k.key}
            className="min-w-0 grow rounded-xl border border-slate-200 bg-white px-3 py-2"
            style={{ flexBasis: `calc((${KEY_CARD_ROW_MIN} - 100%) * 999)` }}
            data-key={k.key}
            data-status={k.status}
            data-sign={k.sign ?? ""}
            data-degree={k.degree ?? ""}
            title={nd.detail ?? undefined}
          >
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <span className={k.key === "asc" ? "text-[10px] font-bold" : "text-sm normal-case text-slate-600"}>{k.glyph}</span>
              {titleOf(k.key)}
            </div>
            {known ? (
              <>
                <div className="mt-0.5 flex items-baseline gap-1 whitespace-nowrap text-slate-900">
                  <span className="text-lg leading-none">{k.signGlyph}</span>
                  <span className="text-[15px] font-semibold">{k.sign ? tt(`zodiac.${k.sign}`) : k.signName}</span>
                </div>
                {/* ≈ derece satırında: dar kartta (360 px) burç adı bölünmez. */}
                <div className="text-sm tabular-nums text-slate-700">
                  {k.status === "assumed" ? "≈ " : ""}
                  {k.degree}
                </div>
              </>
            ) : (
              <div className="mt-0.5 text-[15px] font-semibold italic text-amber-800">{k.status === "unknown" ? (k.key === "asc" ? t("keyUnknown") : t("keyUncertain")) : "—"}</div>
            )}
            {k.note && <p className="mt-0.5 text-[11px] leading-4 text-amber-800">{nd.note ?? k.note}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** Açı niteliği → küçük renk etiketi (yalnız görsel ayrım; veri/etiket metni aynen). */
const NATURE_CHIP: Record<string, string> = {
  harmonious: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  challenging: "bg-rose-50 text-rose-800 ring-rose-200",
  neutral: "bg-slate-50 text-slate-700 ring-slate-200",
};

/**
 * part: sonuç çalışma masasındaki sekmeler için bölüm seçimi. Varsayılan "all" = önceki tam görünüm (kayıtlı analiz,
 * raporlar ve testler etkilenmez). Veri, yuvarlama ve etiketler bölümler arasında DEĞİŞMEZ.
 */
export default function NatalTechnicalPanel({ technical, timeUnknown, part = "all" }: { technical: NatalTechnical; timeUnknown: boolean; part?: "all" | "overview" | "planets" | "houses" | "aspects" }) {
  const tx = useTranslations("atlas.natalPanel");
  const tt = useTranslations("terms");
  const t = technical;
  const show = (p: "overview" | "planets" | "houses" | "aspects") => part === "all" || part === p;
  // G2 (saat bilinmiyor): Ay'a bağlı açılar / kalıplar kesin listede gösterilmez (ham veri silinmez).
  const aspects = listedNatalAspects(t.aspects, timeUnknown);
  const hiddenMoonAspects = t.aspects.length - aspects.length;
  const patterns = timeUnknown ? t.patterns.filter((p) => !patternInvolvesMoon(p)) : t.patterns;
  const balance = aspectBalanceOf(aspects);
  const noon = timeUnknown ? tx("noonSuffix") : "";
  const dash = (v: number | null | undefined) => (v ?? "—").toString();
  return (
    <div className="flex flex-col gap-3">
      {timeUnknown && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="natal-time-unknown-banner">
          {tx("banner", { moonText: tx("moonUnknownText") })}
          {show("aspects") && hiddenMoonAspects > 0 && tx("bannerMoonAspects", { n: hiddenMoonAspects })}
        </p>
      )}

      {show("planets") && (
      <Section title={tx("planetsTitle")}>
        <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>{tx("colBody")}</th>
              <th className={th}>{tx("colSignDegree")}</th>
              {!timeUnknown && <th className={th}>{tx("colHouse")}</th>}
              <th className={th}>{tx("colSpeed")}</th>
              <th className={th}>{tx("colDignity")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.bodies.map((b) =>
              timeUnknown && b.id === "moon" ? (
                <tr key={b.id} data-moon-unknown="1">
                  <td className={td}>
                    <span className="mr-1.5 text-base">{BODY_GLYPHS[b.id]}</span>
                    {tt(`body.${b.id}`)}
                  </td>
                  <td className={`${td} italic text-amber-800`} colSpan={3}>
                    {tx("moonUnknownRow")}
                  </td>
                </tr>
              ) : (
              <tr key={b.id}>
                <td className={td}>
                  <span className="mr-1.5 text-base">{BODY_GLYPHS[b.id]}</span>
                  {tt(`body.${b.id}`)}
                  {b.id === "lilith" && t.variants?.lilith === "mean" && <span className="ml-1 text-xs text-slate-500">{tx("variantMean")}</span>}
                  {(b.id === "north_node" || b.id === "south_node") && t.variants && (
                    <span className="ml-1 text-xs text-slate-500">{tx(t.variants.node === "true" ? "nodeVariant.true" : "nodeVariant.mean")}</span>
                  )}
                  {b.retrograde && <span className="ml-1 font-semibold text-rose-600" title={tx("retroTitle")}>℞</span>}
                </td>
                <td className={td}>
                  <SignCell sign={b.sign} degree={b.degreeInSign} assumed={timeUnknown} />
                </td>
                {!timeUnknown && <td className={td}>{b.house ?? "—"}</td>}
                <td className={`${td} tabular-nums`}>{b.speed.toFixed(4)}</td>
                <td className={td}>{b.dignity ? tt(`dignity.${b.dignity}`) : "—"}</td>
              </tr>
              ),
            )}
          </tbody>
        </table>
        </div>
      </Section>
      )}

      {(show("houses") || part === "overview") && !timeUnknown && t.angles && (
        <Section title={tx("anglesTitle")}>
          <table className="min-w-full">
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className={td}>{tx("asc")}</td>
                <td className={td}>
                  <SignCell sign={t.angles.ascendant.sign} degree={t.angles.ascendant.degreeInSign} />
                </td>
              </tr>
              <tr>
                <td className={td}>{tx("mc")}</td>
                <td className={td}>
                  <SignCell sign={t.angles.midheaven.sign} degree={t.angles.midheaven.degreeInSign} />
                </td>
              </tr>
              {t.points.partOfFortune && (
                <tr>
                  <td className={td}>
                    {tx("pof")}{t.points.partOfFortune.sect ? tx(t.points.partOfFortune.sect === "day" ? "pofDay" : "pofNight") : ""}
                  </td>
                  <td className={td}>
                    <SignCell sign={t.points.partOfFortune.sign} degree={t.points.partOfFortune.degreeInSign} />
                    {t.points.partOfFortune.house ? tx("houseSuffix", { n: String(t.points.partOfFortune.house) }) : ""}
                  </td>
                </tr>
              )}
              {t.points.vertex && (
                <tr>
                  <td className={td}>{tx("vertex")}</td>
                  <td className={td}>
                    <SignCell sign={t.points.vertex.sign} degree={t.points.vertex.degreeInSign} />
                    {t.points.vertex.house ? tx("houseSuffix", { n: String(t.points.vertex.house) }) : ""}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Section>
      )}

      {show("houses") && !timeUnknown && t.houses.length > 0 && (
        <Section title={tx("cuspsTitle")}>
          <div className="grid gap-y-1 px-3 py-2 text-sm" style={fitGridStyle()} data-fit-grid="cusps">
            {t.houses.map((h) => (
              <div key={h.number} className={fitGridCell}>
                <span className="font-medium text-slate-600">{tx("cuspLabel", { n: String(h.number) })}</span>
                <SignCell sign={h.sign} degree={h.degreeInSign} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {show("aspects") && (
      <Section title={`${tx("aspectsTitle", { n: String(aspects.length) })}${noon}`}>
        {/* 2026-10-12 (UAT 2. tur, madde I): uzun ad sütunu satıra geçer (tablo gereksiz genişlemez); kalan yatay
            kaydırma + dikey kaydırma AYNI kapta, başlık yapışkan → yatay kaydırma çubuğu 41 satırın sonunda kalmaz,
            ekranda görünür kalır. 2026-11-06 (V4-002): kutu, bilgi panelinin üstündeki yatay kaydırma şeridi (~2rem) kadar
            kısa → üst şerit ile kutunun kendi alt çubuğu AYNI ANDA ekranda. */}
        <div className="max-h-[min(calc(70vh_-_2rem),640px)] overflow-auto overscroll-contain" data-testid="astro-aspects-scroll">
        <table className="min-w-full">
          <thead className="sticky top-0 z-[1] bg-white shadow-[0_1px_0_rgb(241,245,249)]">
            <tr>
              <th className={th}>{tx("colAspect")}</th>
              <th className={th}>{tx("colType")}</th>
              <th className={th}>{tx("colOrb")}</th>
              <th className={th}>{tx("colMotion")}</th>
              <th className={th}>{tx("colStrength")}</th>
              <th className={th}>{tx("colNature")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {aspects.map((a, i) => (
              <tr key={`${a.a}-${a.b}-${a.type}-${i}`}>
                <td className={`${td} min-w-[9.5rem]`}>
                  <span className="whitespace-nowrap">
                    {BODY_GLYPHS[a.a]} <span className="mx-1 text-slate-500">{ASPECT_GLYPHS[a.type]}</span> {BODY_GLYPHS[a.b]}
                  </span>
                  <span className="block text-xs leading-snug text-slate-500">
                    {tt(`body.${a.a}`)} – {tt(`body.${a.b}`)}
                  </span>
                </td>
                <td className={td}>
                  <span className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ${NATURE_CHIP[a.nature ?? "neutral"] ?? NATURE_CHIP.neutral}`}>{tt(`aspect.${a.type}`)}</span>
                </td>
                <td className={`${td} tabular-nums`}>
                  {timeUnknown ? "≈ " : ""}
                  {formatDegree(a.orb)}
                </td>
                <td className={td}>{a.applying ? tx("applying") : tx("separating")}</td>
                <td className={`${td} tabular-nums`}>{tx("strength", { n: String(Math.round(a.strength)) })}</td>
                <td className={td}>{a.nature ? tt(`aspectNature.${a.nature}`) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Section>
      )}

      {show("aspects") && patterns.length > 0 && (
        <Section title={`${tx("patternsTitle")}${noon}`}>
          <ul className="divide-y divide-slate-100">
            {patterns.map((p, i) => (
              <li key={`${p.kind}-${i}`} className="px-3 py-2 text-sm text-slate-800">
                <span className="font-semibold">{tt(`pattern.${p.kind}`)}</span>
                <span className="ml-2">{p.bodies.map((b) => BODY_GLYPHS[b]).join(" ")}</span>
                <span className="ml-2 text-xs text-slate-500">
                  {p.bodies.map((b) => tt(`body.${b}`)).join(", ")}
                  {p.apex ? tx("apex", { name: tt(`body.${p.apex}`) }) : ""}
                  {p.element ? ` · ${tt(`element.${p.element}`)}` : ""}
                  {p.modality ? ` · ${tt(`modality.${p.modality}`)}` : ""}
                  {p.tightness !== null ? tx("tightness", { n: String(Math.round(p.tightness)) }) : ""}
                  {p.outOfSign ? tx("outOfSign") : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(part === "all" || part === "overview") && (
      <Section title={tx("distTitle")}>
        {timeUnknown ? <TimeUnknownDistributionSummary technical={t} /> : <DistributionSummary technical={t} />}
        <div className="grid gap-3 px-3 pb-2 text-sm">
          <div className="sm:col-span-2 text-slate-600">
            {timeUnknown ? (
              <span data-testid="natal-aspect-balance-time-unknown">
                {tx("balanceTimeUnknown", { h: String(balance.harmonious), c: String(balance.challenging), n: String(balance.neutral) })}
              </span>
            ) : (
              tx("balance", { h: dash(t.summary.aspectBalance.harmonious), c: dash(t.summary.aspectBalance.challenging), n: dash(t.summary.aspectBalance.neutral) })
            )}
            {t.summary.retrograde.length > 0 && tx("retroList", { list: t.summary.retrograde.map((b) => tt(`body.${b}`)).join(", ") })}
          </div>
        </div>
      </Section>
      )}
    </div>
  );
}
