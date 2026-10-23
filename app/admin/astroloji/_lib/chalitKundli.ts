// Astroloji — Bhav Chalit kundli VERİ yardımcıları (22.10.2026; SAF, istemci + sunucu ortak).
//
// Mevcut `<roxy-vedic-kundli>` bileşeni DEĞİŞTİRİLMEDEN yeni bir kullanımla Bhav Chalit görünümü: bileşen grahaları burca göre
// yerleştirir; chalit görünümünde her graha, Lagna rashisinden sayılan CHALIT BHAVASININ hücresine konur (hücre = bhava).
// Böylece Kuzey düzeninde 1. ev üst ortada, grahalar chalit bhavalarındadır. Bhavası rashi evinden farklı grahaların
// burç içi derecesi hücrede gösterilmez (bileşen kuralı: boylam hücre burcuyla uyuşmuyor) — gerçek rashi ve derece ipucunda ve
// tablodadır. Merkez etiketi "Bhav Chalit" olarak değiştirilir (D1 Rashi ile KARIŞMAZ).

import type { VedicBhavChalitTechnical } from "@/lib/astrology/model/vedicHarita";
import { SIGN_IDS, type SignId } from "@/lib/astrology/model/western";
import { SIGN_LABELS, formatDegree } from "@/lib/astrology/labels/tr";
import { ROXY_NAME, TITLE } from "./kundliData";
import { grahaTrName } from "./kundliLocalize";

export const CHALIT_CENTRE_TEXT = "Bhav Chalit";

const plus = (s: SignId, n: number): SignId => SIGN_IDS[(((SIGN_IDS.indexOf(s) + n) % 12) + 12) % 12];

/** Chalit bhavasının haritadaki hücre burcu (Lagna rashisinden bhava − 1 ileri). */
export function chalitCellRashi(lagnaRashi: SignId, bhava: number): SignId {
  return plus(lagnaRashi, bhava - 1);
}

/** Kanonik Bhav Chalit teknik verisi → `<roxy-vedic-kundli>` veri sözleşmesi (yalnız TEKNİK alanlar). SAF; test edilir. */
export function toChalitKundliData(t: VedicBhavChalitTechnical) {
  const meta: Record<string, unknown> = {};
  for (const g of t.grahas) {
    meta[ROXY_NAME[g.id]] = { graha: ROXY_NAME[g.id], rashi: TITLE(chalitCellRashi(t.lagnaRashi, g.bhava)), longitude: g.longitude, isRetrograde: false, house: g.bhava };
  }
  meta.Lagna = { graha: "Lagna", rashi: TITLE(t.lagnaRashi), longitude: t.ascendant, isRetrograde: false, house: 1 };
  return { frame: { ayanamsa: t.frame.ayanamsa, ayanamsaDegrees: t.frame.ayanamsaDegrees }, meta, combustion: [], planetaryWar: [] };
}

/** Haritadaki graha ipucu: Türkçe ad · chalit bhavası · gerçek rashi + derece · D1 rashi evi. Anahtar = kütüphanenin İngilizce adı. */
export function chalitKundliTitles(t: VedicBhavChalitTechnical): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of t.grahas) {
    out[ROXY_NAME[g.id]] = [grahaTrName(g.id), `chalit ${g.bhava}. bhava`, `${SIGN_LABELS[g.rashi]} ${formatDegree(g.longitude % 30)}`, `D1 rashi evi ${g.rashiHouse}`, g.moved ? "bhava değişti" : ""].filter(Boolean).join(" · ");
  }
  return out;
}

/** Merkez etiketini değiştirir (idempotent: aynı metinse dokunmaz → MutationObserver döngüye girmez). Tarayıcı DOM'u ve rapor mini DOM'u. */
export function applyCentreText(root: ParentNode, text: string) {
  for (const el of root.querySelectorAll("text.centre-label")) {
    const n = [...el.childNodes].find((c): c is Text => c.nodeType === 3 && (c as Text).data.trim() !== "");
    if (n && n.data !== text) n.data = text;
  }
}

export const CHALIT_KUNDLI_NOTE =
  "Harita hücreleri bhavalardır (Kuzey düzeninde 1. bhava üst ortada); her graha CHALIT bhavasında gösterilir. Hücredeki burç numarası Lagna rashisinden bütün-burç sırasıdır; bhavası rashi evinden farklı grahaların derecesi hücrede yazılmaz (gerçek rashi ve derece tabloda). Bu harita Vedik D1 (Rashi) haritası DEĞİLDİR.";
