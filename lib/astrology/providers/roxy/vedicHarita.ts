// Astroloji — VEDİK HARİTA adaptörleri (SAF): Bhav Chalit · Chara Karaka · Arudha Pada · Bhava Bala (22.10.2026).
//
// Hesap motoru sağlayıcıdır; burada yalnız beyaz liste projeksiyon + İÇ TUTARLILIK denetimi (fail-closed) yapılır, ikinci bir
// hesap motoru YOKTUR. Uyuşmazlık → hata (sonuç KAYDEDİLMEZ, PROVIDER_INVALID_RESPONSE). Bilinmeyen alan → teknik sayılmaz,
// yalnız yolu raporlanır (*_KNOWN). Sağlayıcı serbest metni (anlam, signification, ev temaları) yalnız yorum katmanına gider.
//
// Denetimler (sağlayıcı verisinin kendi içinde çelişmemesi; ekol hesabı değil):
//   Bhav Chalit : 12 bhava sırası; bitiş = sonraki başlangıç; span = bitiş − başlangıç; 1. madhya = Yükselen, 10. madhya = MC;
//                 bhava rashisi = madhyanın burcu; graha rashisi = boylamın burcu; graha bhavası = boylamı içeren bhava;
//                 rashi evi = Lagna rashisinden bütün-burç sayımı; moved = (bhava ≠ rashi evi); movedCount; bhava.grahas listesi.
//   Chara Karaka: şema yankısı; karaka sırası şemaya göre; graha kümesi (8'li: 7 klasik + Rahu, 7'li: 7 klasik); sıralama derecesi
//                 (Rahu ters: 30° − derece) ve büyükten küçüğe sıra; AK = ilk, DK = son.
//   Arudha      : 12 pada sırası; bhava rashisi = Lagna + (ev − 1); lord = klasik burç yöneticisi; sayım + istisna formülü
//                 (1./7. → 10.) sağlayıcının rashi ve exceptionApplied alanlarıyla; Lagna'dan ev; AL = A1, UL = A12.
//   Bhava Bala  : 12 bhava sırası; toplam = 3 bileşen toplamı; rupa = virupa / 60 (2 hane); lord = klasik yönetici; rashi =
//                 madhyanın burcu; aynı lordun Bhavadhipati Bala'sı aynı; sıra = toplama göre.

import { SIGN_IDS, type SignId } from "../../model/western";
import { VEDIC_GRAHAS, type VedicAyanamsaId, type VedicGrahaId } from "../../model/vedic";
import { SIGN_LORDS } from "../../model/kp";
import {
  ARUDHA_ABBR,
  ARUDHA_PADA_IDS,
  BHAVA_BALA_COMPONENTS,
  CHARA_KARAKA_ABBR,
  CHARA_KARAKA_IDS_EIGHT,
  CHARA_KARAKA_IDS_SEVEN,
  VEDIC_ARUDHA_INTERP_SCHEMA,
  VEDIC_ARUDHA_TECHNICAL_SCHEMA,
  VEDIC_BHAVA_BALA_INTERP_SCHEMA,
  VEDIC_BHAVA_BALA_TECHNICAL_SCHEMA,
  VEDIC_BHAV_CHALIT_INTERP_SCHEMA,
  VEDIC_BHAV_CHALIT_TECHNICAL_SCHEMA,
  VEDIC_CHARA_KARAKA_INTERP_SCHEMA,
  VEDIC_CHARA_KARAKA_TECHNICAL_SCHEMA,
  type BhavaBalaComponent,
  type CharaKarakaId,
  type VedicArudhaInterpretation,
  type VedicArudhaPada,
  type VedicArudhaTechnical,
  type VedicBhavaBalaInterpretation,
  type VedicBhavaBalaTechnical,
  type VedicBhavChalitInterpretation,
  type VedicBhavChalitTechnical,
  type VedicChalitBhava,
  type VedicChalitGraha,
  type VedicCharaKarakaInterpretation,
  type VedicCharaKarakaTechnical,
} from "../../model/vedicHarita";
import { arr, findUnmapped, int, keywords, num, obj, paths, text } from "./shared";
import type { AdapterResult } from "./timing";
import { vedicBirthBody, type BirthPoint, type VedicAyanamsa } from "./requests";

export const ROXY_VEDIC_BHAV_CHALIT = { endpoint: "/vedic-astrology/bhav-chalit", adapter: "astro-roxy-vedic-bhav-chalit-1", projection: "vedic-bhav-chalit-proj-1" } as const;
export const ROXY_VEDIC_CHARA_KARAKA = { endpoint: "/vedic-astrology/chara-karakas", adapter: "astro-roxy-vedic-chara-karaka-1", projection: "vedic-chara-karaka-proj-1" } as const;
export const ROXY_VEDIC_ARUDHA = { endpoint: "/vedic-astrology/arudha", adapter: "astro-roxy-vedic-arudha-1", projection: "vedic-arudha-proj-1" } as const;
export const ROXY_VEDIC_BHAVA_BALA = { endpoint: "/vedic-astrology/bhava-bala", adapter: "astro-roxy-vedic-bhava-bala-1", projection: "vedic-bhava-bala-proj-1" } as const;

export const CHARA_KARAKA_SCHEMES = ["eight", "seven"] as const;
export type CharaKarakaScheme = (typeof CHARA_KARAKA_SCHEMES)[number];

/** /vedic-astrology/chara-karakas — doğum gövdesi + karaka şeması (8'li Rahu dahil / 7'li). Şema HER ZAMAN açıkça gönderilir. */
export function charaKarakaBody(b: BirthPoint, ayanamsa: VedicAyanamsa, scheme: CharaKarakaScheme) {
  return { ...vedicBirthBody(b, ayanamsa), scheme };
}

const done = <T, I>(errors: string[], dropped: string[], technical: () => T, interpretation: () => I | null, raw: unknown, known: Set<string>): AdapterResult<T, I> => {
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  return { ok: true, technical: technical(), interpretation: interpretation(), unmappedFields: findUnmapped(raw, known, new Set()), droppedValues: [...new Set(dropped)] };
};

const graha = (v: unknown): VedicGrahaId | null => {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  return (VEDIC_GRAHAS as readonly string[]).includes(k) ? (k as VedicGrahaId) : null;
};
const rashi = (v: unknown): SignId | null => {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  return (SIGN_IDS as readonly string[]).includes(k) ? (k as SignId) : null;
};
const norm = (x: number) => ((x % 360) + 360) % 360;
const signOf = (lon: number): SignId => SIGN_IDS[Math.floor(norm(lon) / 30) % 12];
const sidx = (s: SignId) => SIGN_IDS.indexOf(s);
const plus = (s: SignId, n: number): SignId => SIGN_IDS[(((sidx(s) + n) % 12) + 12) % 12];
const houseFrom = (from: SignId, to: SignId) => ((sidx(to) - sidx(from) + 12) % 12) + 1;
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const HOUSE_THEME_PATHS = ["houseThemes", ...Array.from({ length: 12 }, (_, i) => `houseThemes.${i + 1}`)];
const themesOf = (v: unknown) => Array.from({ length: 12 }, (_, i) => ({ house: i + 1, keywords: keywords(obj(v)?.[String(i + 1)]) })).filter((x) => x.keywords.length > 0);
const HOUSE_SYSTEM_RE = /^[a-z][a-z_-]{1,30}$/;
const GRAHA_ORDER: VedicGrahaId[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"];

function frameOf(r: Record<string, unknown>, ay: VedicAyanamsaId, errors: string[]): number | null {
  const f = obj(r.frame);
  const deg = num(f?.ayanamsaDegrees, 0, 40);
  if (f?.ayanamsa !== ay || deg === null) errors.push("frame: istenen ayanamsa değil");
  return deg;
}

// ═══ A · Bhav Chalit (/vedic-astrology/bhav-chalit) ═══════════════════════════
const BHAV_CHALIT_KNOWN = new Set<string>([
  ...paths("frame", ["ayanamsa", "ayanamsaDegrees"]),
  "houseSystem",
  "ascendant",
  "midheaven",
  "bhavas",
  ...paths("bhavas[]", ["house", "start", "madhya", "end", "span", "rashi", "grahas"]),
  "grahas",
  ...paths("grahas[]", ["graha", "longitude", "rashi", "bhava", "rashiHouse", "moved"]),
  "movedCount",
  ...HOUSE_THEME_PATHS,
  "focus",
]);
/** Sınır toleransı (derece): sağlayıcı boylamları 4 haneye yuvarlar. */
const EDGE = 0.001;

export function projectRoxyVedicBhavChalit(raw: unknown, opts: { ayanamsa: VedicAyanamsaId }): AdapterResult<VedicBhavChalitTechnical, VedicBhavChalitInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const ayDeg = frameOf(r, opts.ayanamsa, errors);
  const hs = typeof r.houseSystem === "string" && HOUSE_SYSTEM_RE.test(r.houseSystem) ? r.houseSystem : null;
  if (!hs) errors.push("houseSystem: alan");
  const asc = num(r.ascendant, 0, 360);
  const mc = num(r.midheaven, 0, 360);
  if (asc === null || mc === null) errors.push("ascendant/midheaven: alan");
  if (r.focus !== undefined && r.focus !== "general") dropped.push("focus");
  const bhavas: VedicChalitBhava[] = [];
  for (const it of arr(r.bhavas) ?? []) {
    const o = obj(it);
    const house = int(o?.house, 1, 12);
    const start = num(o?.start, 0, 360);
    const madhya = num(o?.madhya, 0, 360);
    const end = num(o?.end, 0, 360);
    const span = num(o?.span, 0, 60);
    const rs = rashi(o?.rashi);
    const gs = arr(o?.grahas);
    const gl = (gs ?? []).map(graha);
    if (house === null || start === null || madhya === null || end === null || span === null || !rs || !gs || gl.some((x) => x === null)) {
      errors.push("bhavas[]: alan");
      continue;
    }
    bhavas.push({ house, start, madhya, end, span, rashi: rs, grahas: gl as VedicGrahaId[] });
  }
  if (bhavas.map((b) => b.house).join() !== "1,2,3,4,5,6,7,8,9,10,11,12") errors.push("bhavas: 12 bhava sırası");
  else {
    let total = 0;
    bhavas.forEach((b, i) => {
      const next = bhavas[(i + 1) % 12];
      if (angDiff(b.end, next.start) > EDGE) errors.push(`${b.house}. bhava: bitiş sonraki başlangıç değil`);
      const sp = norm(b.end - b.start);
      if (Math.abs(sp - b.span) > 0.01) errors.push(`${b.house}. bhava: span bitiş − başlangıç değil`);
      if (norm(b.madhya - b.start) > sp + EDGE) errors.push(`${b.house}. bhava: madhya sınırlar içinde değil`);
      if (b.rashi !== signOf(b.madhya)) errors.push(`${b.house}. bhava: rashi madhyanın burcu değil`);
      total += b.span;
    });
    if (Math.abs(total - 360) > 0.05) errors.push("bhavas: toplam span 360° değil");
    if (asc !== null && angDiff(bhavas[0].madhya, asc) > EDGE) errors.push("1. bhava madhyası Yükselen değil");
    if (mc !== null && angDiff(bhavas[9].madhya, mc) > EDGE) errors.push("10. bhava madhyası MC değil");
  }
  const lagnaRashi = asc !== null ? signOf(asc) : null;
  const grahas: VedicChalitGraha[] = [];
  for (const it of arr(r.grahas) ?? []) {
    const o = obj(it);
    const id = graha(o?.graha);
    const lon = num(o?.longitude, 0, 360);
    const rs = rashi(o?.rashi);
    const bh = int(o?.bhava, 1, 12);
    const rh = int(o?.rashiHouse, 1, 12);
    if (!id || lon === null || !rs || bh === null || rh === null || typeof o?.moved !== "boolean") {
      errors.push("grahas[]: alan");
      continue;
    }
    if (rs !== signOf(lon)) errors.push(`${id}: rashi boylamla uyuşmuyor`);
    if (lagnaRashi && rh !== houseFrom(lagnaRashi, rs)) errors.push(`${id}: rashi evi Lagna'dan bütün-burç sayımı değil`);
    if (o.moved !== (bh !== rh)) errors.push(`${id}: moved bhava ≠ rashi evi değil`);
    if (bhavas.length === 12) {
      const b = bhavas[bh - 1];
      const inside = norm(lon - b.start) <= norm(b.end - b.start) + EDGE || angDiff(lon, b.start) <= EDGE;
      if (!inside) errors.push(`${id}: boylam ${bh}. bhava sınırları içinde değil`);
      if (!b.grahas.includes(id)) errors.push(`${id}: ${bh}. bhava graha listesinde yok`);
    }
    grahas.push({ id, longitude: lon, rashi: rs, bhava: bh, rashiHouse: rh, moved: o.moved });
  }
  if (grahas.map((g) => g.id).join() !== GRAHA_ORDER.join()) errors.push("grahas: 9 graha sırası");
  const listed = bhavas.flatMap((b) => b.grahas);
  if (listed.length !== grahas.length || new Set(listed).size !== listed.length) errors.push("bhavas[].grahas: her graha tek bhavada değil");
  const mv = int(r.movedCount, 0, 9);
  if (mv === null || mv !== grahas.filter((g) => g.moved).length) errors.push("movedCount: moved sayısı değil");
  return done(
    errors,
    dropped,
    () => ({ schema: VEDIC_BHAV_CHALIT_TECHNICAL_SCHEMA, zodiac: "sidereal", frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! }, houseSystem: hs!, ascendant: asc!, midheaven: mc!, lagnaRashi: lagnaRashi!, bhavas, grahas, movedCount: mv! }),
    () => {
      const houseThemes = themesOf(r.houseThemes);
      return houseThemes.length ? { schema: VEDIC_BHAV_CHALIT_INTERP_SCHEMA, houseThemes } : null;
    },
    raw,
    BHAV_CHALIT_KNOWN,
  );
}

// ═══ B · Chara Karaka (/vedic-astrology/chara-karakas) ════════════════════════
const CHARA_KARAKA_KNOWN = new Set<string>([
  ...paths("frame", ["ayanamsa", "ayanamsaDegrees"]),
  "scheme",
  "atmakaraka",
  "darakaraka",
  "karakas",
  ...paths("karakas[]", ["id", "name", "abbreviation", "graha", "rashi", "degreeInRashi", "rankingDegree", "isReversed", "meaning", "significations"]),
]);
const CLASSICAL: VedicGrahaId[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];

export function projectRoxyVedicCharaKaraka(raw: unknown, opts: { ayanamsa: VedicAyanamsaId; scheme: CharaKarakaScheme }): AdapterResult<VedicCharaKarakaTechnical, VedicCharaKarakaInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const ayDeg = frameOf(r, opts.ayanamsa, errors);
  if (r.scheme !== opts.scheme) errors.push("scheme: istenen karaka şeması değil");
  const ids: readonly CharaKarakaId[] = opts.scheme === "eight" ? CHARA_KARAKA_IDS_EIGHT : CHARA_KARAKA_IDS_SEVEN;
  const karakas: VedicCharaKarakaTechnical["karakas"] = [];
  const texts: VedicCharaKarakaInterpretation["karakas"] = [];
  for (const it of arr(r.karakas) ?? []) {
    const o = obj(it);
    const id = typeof o?.id === "string" && (ids as readonly string[]).includes(o.id) ? (o.id as CharaKarakaId) : null;
    const g = graha(o?.graha);
    const rs = rashi(o?.rashi);
    const d = num(o?.degreeInRashi, 0, 30);
    const rd = num(o?.rankingDegree, 0, 30);
    if (!id || !g || !rs || d === null || rd === null || typeof o?.isReversed !== "boolean") {
      errors.push("karakas[]: alan");
      continue;
    }
    if (o.isReversed !== (g === "rahu")) errors.push(`${id}: ters sıralama yalnız Rahu'da`);
    if (Math.abs((g === "rahu" ? 30 - d : d) - rd) > 1e-6) errors.push(`${id}: sıralama derecesi burç içi dereceyle uyuşmuyor`);
    if (o.abbreviation !== CHARA_KARAKA_ABBR[id]) dropped.push("karakas[].abbreviation");
    karakas.push({ id, graha: g, rashi: rs, degreeInRashi: d, rankingDegree: rd, reversed: o.isReversed });
    texts.push({ id, meaning: text(o.meaning), significations: text(o.significations) });
  }
  if (karakas.map((k) => k.id).join() !== ids.join()) errors.push(`karakas: ${ids.length} karaka sırası`);
  const want = opts.scheme === "eight" ? [...CLASSICAL, "rahu"] : CLASSICAL;
  if ([...karakas.map((k) => k.graha)].sort().join() !== [...want].sort().join()) errors.push("karakas: graha kümesi şemaya uymuyor");
  for (let i = 1; i < karakas.length; i++) if (karakas[i].rankingDegree > karakas[i - 1].rankingDegree + 1e-9) errors.push(`${karakas[i].id}: sıralama derecesine göre değil`);
  const ak = graha(r.atmakaraka);
  const dk = graha(r.darakaraka);
  if (!ak || ak !== karakas[0]?.graha) errors.push("atmakaraka: ilk karaka değil");
  if (!dk || dk !== karakas[karakas.length - 1]?.graha) errors.push("darakaraka: son karaka değil");
  return done(
    errors,
    dropped,
    () => ({ schema: VEDIC_CHARA_KARAKA_TECHNICAL_SCHEMA, zodiac: "sidereal", frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! }, scheme: opts.scheme, atmakaraka: ak!, darakaraka: dk!, karakas }),
    () => {
      const k = texts.filter((x) => x.meaning || x.significations);
      return k.length ? { schema: VEDIC_CHARA_KARAKA_INTERP_SCHEMA, karakas: k } : null;
    },
    raw,
    CHARA_KARAKA_KNOWN,
  );
}

// ═══ C · Arudha Pada (/vedic-astrology/arudha) ════════════════════════════════
const ARUDHA_KNOWN = new Set<string>([
  ...paths("frame", ["ayanamsa", "ayanamsaDegrees"]),
  "lagnaRashi",
  "arudhaLagna",
  "upapada",
  "padas",
  ...paths("padas[]", ["id", "abbreviation", "name", "house", "bhavaRashi", "lord", "lordRashi", "rashi", "houseFromLagna", "exceptionApplied", "meaning", "significations"]),
]);

/** Klasik Arudha formülü (saf, test ve bağımsız doğrulama için): sayım, ham rashi, istisna (1./7. → 10.). */
export function arudhaOf(bhavaRashi: SignId, lordRashi: SignId): { count: number; rawRashi: SignId; rashi: SignId; exception: boolean } {
  const count = houseFrom(bhavaRashi, lordRashi);
  const rawRashi = plus(lordRashi, count - 1);
  const h = houseFrom(bhavaRashi, rawRashi);
  const exception = h === 1 || h === 7;
  return { count, rawRashi, rashi: exception ? plus(rawRashi, 9) : rawRashi, exception };
}

export function projectRoxyVedicArudha(raw: unknown, opts: { ayanamsa: VedicAyanamsaId }): AdapterResult<VedicArudhaTechnical, VedicArudhaInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const ayDeg = frameOf(r, opts.ayanamsa, errors);
  const lagna = rashi(r.lagnaRashi);
  if (!lagna) errors.push("lagnaRashi: alan");
  const padas: VedicArudhaPada[] = [];
  const texts: VedicArudhaInterpretation["padas"] = [];
  for (const it of arr(r.padas) ?? []) {
    const o = obj(it);
    const id = typeof o?.id === "string" && (ARUDHA_PADA_IDS as readonly string[]).includes(o.id) ? (o.id as VedicArudhaPada["id"]) : null;
    const house = int(o?.house, 1, 12);
    const br = rashi(o?.bhavaRashi);
    const lord = graha(o?.lord);
    const lr = rashi(o?.lordRashi);
    const rs = rashi(o?.rashi);
    const hl = int(o?.houseFromLagna, 1, 12);
    if (!id || house === null || !br || !lord || !lr || !rs || hl === null || typeof o?.exceptionApplied !== "boolean") {
      errors.push("padas[]: alan");
      continue;
    }
    if (`a${house}` !== id) errors.push(`${id}: ev kimlikle uyuşmuyor`);
    if (lagna && br !== plus(lagna, house - 1)) errors.push(`${id}: bhava rashisi Lagna'dan sayımla uyuşmuyor`);
    if (SIGN_LORDS[br] !== lord) errors.push(`${id}: lord bhava rashisinin klasik yöneticisi değil`);
    const f = arudhaOf(br, lr);
    if (f.exception !== o.exceptionApplied) errors.push(`${id}: istisna bayrağı formülle uyuşmuyor`);
    if (f.rashi !== rs) errors.push(`${id}: pada rashisi formülle uyuşmuyor`);
    if (lagna && hl !== houseFrom(lagna, rs)) errors.push(`${id}: Lagna'dan ev sayımı uyuşmuyor`);
    if (o.abbreviation !== ARUDHA_ABBR[id]) dropped.push("padas[].abbreviation");
    padas.push({ id, house, bhavaRashi: br, lord, lordRashi: lr, count: f.count, rawRashi: f.rawRashi, rashi: rs, houseFromLagna: hl, exceptionApplied: o.exceptionApplied });
    texts.push({ id, name: text(o.name), meaning: text(o.meaning), significations: text(o.significations) });
  }
  if (padas.map((p) => p.id).join() !== ARUDHA_PADA_IDS.join()) errors.push("padas: 12 pada sırası");
  const al = rashi(r.arudhaLagna);
  const ul = rashi(r.upapada);
  if (!al || al !== padas[0]?.rashi) errors.push("arudhaLagna: A1 rashisi değil");
  if (!ul || ul !== padas[11]?.rashi) errors.push("upapada: A12 rashisi değil");
  return done(
    errors,
    dropped,
    () => ({ schema: VEDIC_ARUDHA_TECHNICAL_SCHEMA, zodiac: "sidereal", frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! }, lagnaRashi: lagna!, arudhaLagna: al!, upapada: ul!, padas }),
    () => {
      const p = texts.filter((x) => x.meaning || x.significations);
      return p.length ? { schema: VEDIC_ARUDHA_INTERP_SCHEMA, padas: p } : null;
    },
    raw,
    ARUDHA_KNOWN,
  );
}

// ═══ D · Bhava Bala (/vedic-astrology/bhava-bala) ═════════════════════════════
const BHAVA_BALA_KNOWN = new Set<string>([
  ...paths("frame", ["ayanamsa", "ayanamsaDegrees"]),
  "houseSystem",
  "bhavas",
  ...paths("bhavas[]", ["house", "rashi", "madhya", "lord", ...BHAVA_BALA_COMPONENTS, "totalVirupas", "totalRupas", "rank"]),
  ...HOUSE_THEME_PATHS,
  "focus",
]);

export function projectRoxyVedicBhavaBala(raw: unknown, opts: { ayanamsa: VedicAyanamsaId }): AdapterResult<VedicBhavaBalaTechnical, VedicBhavaBalaInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const ayDeg = frameOf(r, opts.ayanamsa, errors);
  const hs = typeof r.houseSystem === "string" && HOUSE_SYSTEM_RE.test(r.houseSystem) ? r.houseSystem : null;
  if (!hs) errors.push("houseSystem: alan");
  if (r.focus !== undefined && r.focus !== "general") dropped.push("focus");
  const bhavas: VedicBhavaBalaTechnical["bhavas"] = [];
  for (const it of arr(r.bhavas) ?? []) {
    const o = obj(it);
    const house = int(o?.house, 1, 12);
    const rs = rashi(o?.rashi);
    const madhya = num(o?.madhya, 0, 360);
    const lord = graha(o?.lord);
    const comp = Object.fromEntries(BHAVA_BALA_COMPONENTS.map((c) => [c, num(o?.[c], -2000, 3000)])) as Record<BhavaBalaComponent, number | null>;
    const tv = num(o?.totalVirupas, -2000, 5000);
    const tr = num(o?.totalRupas, -40, 100);
    const rank = int(o?.rank, 1, 12);
    if (house === null || !rs || madhya === null || !lord || Object.values(comp).some((x) => x === null) || tv === null || tr === null || rank === null) {
      errors.push("bhavas[]: alan");
      continue;
    }
    const sum = BHAVA_BALA_COMPONENTS.reduce((a, c) => a + (comp[c] as number), 0);
    if (Math.abs(sum - tv) > 0.05) errors.push(`${house}. bhava: toplam virupa bileşen toplamı değil`);
    if (Math.abs(tv / 60 - tr) > 0.006) errors.push(`${house}. bhava: rupa = virupa/60 değil`);
    if (rs !== signOf(madhya)) errors.push(`${house}. bhava: rashi madhyanın burcu değil`);
    if (SIGN_LORDS[rs] !== lord) errors.push(`${house}. bhava: lord rashinin klasik yöneticisi değil`);
    bhavas.push({ house, rashi: rs, madhya, lord, ...(comp as Record<BhavaBalaComponent, number>), totalVirupas: tv, totalRupas: tr, rank });
  }
  if (bhavas.map((b) => b.house).join() !== "1,2,3,4,5,6,7,8,9,10,11,12") errors.push("bhavas: 12 bhava sırası");
  const byLord = new Map<string, number>();
  for (const b of bhavas) {
    const prev = byLord.get(b.lord);
    if (prev !== undefined && Math.abs(prev - b.bhavadhipatiBala) > 0.011) errors.push(`${b.house}. bhava: aynı lordun Bhavadhipati Bala'sı farklı`);
    byLord.set(b.lord, b.bhavadhipatiBala);
  }
  const ranks = [...bhavas].sort((a, b) => a.rank - b.rank);
  if (ranks.map((b) => b.rank).join() !== "1,2,3,4,5,6,7,8,9,10,11,12") errors.push("bhavas: sıra 1–12 tekil değil");
  for (let i = 1; i < ranks.length; i++) if (ranks[i].totalVirupas > ranks[i - 1].totalVirupas + 1e-9) errors.push(`${ranks[i].house}. bhava: sıra toplama göre değil`);
  return done(
    errors,
    dropped,
    () => ({ schema: VEDIC_BHAVA_BALA_TECHNICAL_SCHEMA, zodiac: "sidereal", frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! }, houseSystem: hs!, bhavas }),
    () => {
      const houseThemes = themesOf(r.houseThemes);
      return houseThemes.length ? { schema: VEDIC_BHAVA_BALA_INTERP_SCHEMA, houseThemes } : null;
    },
    raw,
    BHAVA_BALA_KNOWN,
  );
}
