// Astroloji — Vedik YOGA kural düzeyinde gösterim + BAĞIMSIZ denetim (SAF; istemci de import edebilir). 2026-10-22.
//
// Hesap motoru DEĞİLDİR: yoga kararı (var/yok, nitelik, kanıt, bastırma) kayıttaki D1 sonucundan okunur. Bu dosya yalnız
//   (1) her kayıtlı denetim için ilgili graha/bhava listesini D1 konumlarından TÜRETİR (gösterim),
//   (2) kural tabanlı yogaları D1 graha konumlarından (sağlayıcı kararına BAKMADAN) yeniden sınar (doğrulama).
// Ekolden ekole değişen koşullarda karar vermez → "uncertain". Kural ailesi kararları (Dhana, Daridra) sınanmaz → "not_checked".

import type { SignId } from "../model/western";
import { SIGN_IDS } from "../model/western";
import { SIGN_LABELS } from "../labels/tr";
import { SIGN_LORDS } from "../model/kp";
import { GRAHA_LABELS } from "../topics/vedic";
import { VEDIC_YOGA_FAMILIES, type VedicD1Technical, type VedicGraha, type VedicGrahaId, type VedicYogaFamily } from "../model/vedic";
import {
  VEDIC_YOGA_INFO,
  isVedicYogaDetectId,
  type VedicYogaConsistency,
  type VedicYogaRuleState,
  type VedicYogaStatus,
} from "../model/vedicYoga";

export type VedicYogaRuleCheck = { state: VedicYogaRuleState; detail: string };
export type VedicYogaTriggers = { grahas: VedicGrahaId[]; houses: number[] };
export type VedicYogaRow = {
  id: string;
  /** Kayıttaki ad (sağlayıcı; Sanskrit kökenli özel ad). */
  name: string;
  /** Katalogdaki Sanskritçe ad (katalog dışı kimlikte kayıttaki ad). */
  sanskrit: string;
  family: string;
  /** Kimlik 48'lik katalogda mı (değilse oluşum kuralı / denetim yok). */
  known: boolean;
  present: boolean;
  status: VedicYogaStatus;
  quality: "positive" | "negative" | "both" | null;
  formation: string | null;
  school: string | null;
  triggers: VedicYogaTriggers | null;
  evidence: string | null;
  suppressedBy: VedicYogaFamily | null;
  check: VedicYogaRuleCheck;
  consistency: VedicYogaConsistency;
};

const SEVEN: readonly VedicGrahaId[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];
const NON_LUMINARY: readonly VedicGrahaId[] = ["mars", "mercury", "jupiter", "venus", "saturn"];
const KENDRA = [1, 4, 7, 10];
const OWN: Partial<Record<VedicGrahaId, SignId[]>> = {
  mars: ["aries", "scorpio"],
  mercury: ["gemini", "virgo"],
  jupiter: ["sagittarius", "pisces"],
  venus: ["taurus", "libra"],
  saturn: ["capricorn", "aquarius"],
};
const EXALT: Record<string, SignId> = { sun: "aries", moon: "taurus", mars: "capricorn", mercury: "virgo", jupiter: "cancer", venus: "pisces", saturn: "libra" };
const MOOLA: Record<string, SignId> = { sun: "leo", moon: "taurus", mars: "aries", mercury: "virgo", jupiter: "sagittarius", venus: "libra", saturn: "aquarius" };
const MOVABLE: SignId[] = ["aries", "cancer", "libra", "capricorn"];
const FIXED: SignId[] = ["taurus", "leo", "scorpio", "aquarius"];
const DUAL: SignId[] = ["gemini", "virgo", "sagittarius", "pisces"];
const PM: Record<string, VedicGrahaId> = { ruchaka: "mars", bhadra: "mercury", hamsa: "jupiter", malavya: "venus", sasa: "saturn" };
const SANKHYA: Record<string, number> = { "gola-2": 1, yuga: 2, sula: 3, kedara: 4, pasa: 5, damni: 6, vallaki: 7 };
/** Parashari bütün-burç özel bakışlar (herkes 7.; Mars 4/8, Jüpiter 5/9, Satürn 3/10). */
const SPECIAL_ASPECTS: Partial<Record<VedicGrahaId, number[]>> = { mars: [4, 7, 8], saturn: [3, 7, 10] };
/** Nabhasa klasik öncelik normları: bastırılan aile → bastırabilen aileler. */
const PRECEDENCE: Partial<Record<VedicYogaFamily, VedicYogaFamily[]>> = { asraya: ["akriti"], sankhya: ["akriti", "asraya", "dala"] };

const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => ((from - 1 + i) % 12) + 1);
const AKRITI_SETS: Record<string, number[][]> = {
  gada: [[1, 4], [4, 7], [7, 10], [10, 1]],
  "sakata-2": [[1, 7]],
  vihaga: [[4, 10]],
  sringhataka: [[1, 5, 9]],
  hala: [[2, 6, 10], [3, 7, 11], [4, 8, 12]],
  kamala: [[1, 4, 7, 10]],
  vapee: [[2, 5, 8, 11], [3, 6, 9, 12]],
  yupa: [range(1, 4)],
  ishu: [range(4, 4)],
  sakti: [range(7, 4)],
  danda: [range(10, 4)],
  nav: [range(1, 7)],
  kuta: [range(4, 7)],
  chhatra: [range(7, 7)],
  "chapa-2": [range(10, 7)],
  ardhachandra: [2, 3, 5, 6, 8, 9, 11, 12].map((s) => range(s, 7)),
  chandra: [[1, 3, 5, 7, 9, 11]],
  samudra: [[2, 4, 6, 8, 10, 12]],
};

const gl = (id: VedicGrahaId) => (GRAHA_LABELS[id] ?? id).split(" (")[0];
const sl = (s: SignId) => SIGN_LABELS[s] ?? s;
const sep = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
const fmt = (n: number) => n.toFixed(2).replace(".", ",");
const uniqSorted = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);

function grahaMap(t: VedicD1Technical): Map<VedicGrahaId, VedicGraha> | null {
  const m = new Map<VedicGrahaId, VedicGraha>();
  for (const g of Array.isArray(t?.grahas) ? t.grahas : []) {
    if (!g || typeof g.house !== "number" || typeof g.longitude !== "number" || !(SIGN_IDS as readonly string[]).includes(g.rashi)) continue;
    m.set(g.id, g);
  }
  return SEVEN.every((id) => m.has(id)) ? m : null;
}
/** Bir grahanın, başka bir grahaya göre bütün-burç ev numarası (1…12). */
const houseFrom = (g: VedicGraha, ref: VedicGraha) => ((SIGN_IDS.indexOf(g.rashi) - SIGN_IDS.indexOf(ref.rashi) + 12) % 12) + 1;
const lagnaRashi = (t: VedicD1Technical): SignId | null => (t?.lagna && (SIGN_IDS as readonly string[]).includes(t.lagna.rashi) ? t.lagna.rashi : null);
const lordOfHouse = (t: VedicD1Technical, house: number): VedicGrahaId | null => {
  const l = lagnaRashi(t);
  return l ? SIGN_LORDS[SIGN_IDS[(SIGN_IDS.indexOf(l) + house - 1) % 12]] : null;
};

function shape(g: Map<VedicGrahaId, VedicGraha>, sets: number[][]): VedicYogaRuleCheck {
  const houses = SEVEN.map((id) => g.get(id)!.house);
  const occ = uniqSorted(houses);
  let necessary = false;
  for (const s of sets) {
    if (!houses.every((h) => s.includes(h))) continue;
    if (s.every((h) => houses.includes(h))) return { state: "holds", detail: `Yedi graha ${s.join("-")}. evlerde, her biri dolu.` };
    necessary = true;
  }
  if (necessary) return { state: "uncertain", detail: `Yedi graha kalıbın evleri içinde ama her ev dolu değil (dolu evler: ${occ.join(", ")}).` };
  return { state: "fails", detail: `Dolu evler ${occ.join(", ")}; kalıp sağlanmıyor.` };
}

/** BAĞIMSIZ kural denetimi (yalnız D1 graha konumlarından). */
export function checkVedicYogaRule(t: VedicD1Technical, id: string): VedicYogaRuleCheck {
  if (!isVedicYogaDetectId(id)) return { state: "not_checked", detail: "Katalog dışı yoga; bağımsız denetim yok." };
  const g = grahaMap(t);
  if (!g) return { state: "not_checked", detail: "Kayıtta graha konumları eksik." };
  const moon = g.get("moon")!;
  if (id in PM) {
    const p = g.get(PM[id])!;
    const dignity = OWN[p.id]!.includes(p.rashi) ? "kendi burcu" : EXALT[p.id] === p.rashi ? "yücelim burcu" : null;
    const kendra = KENDRA.includes(p.house);
    return {
      state: dignity && kendra ? "holds" : "fails",
      detail: `${gl(p.id)} ${sl(p.rashi)} burcunda (${dignity ?? "kendi/yücelim burcu değil"}), ${p.house}. evde (${kendra ? "kendra" : "kendra değil"}).`,
    };
  }
  if (id === "budhaaditya" || id === "chandramangala") {
    const [a, b] = id === "budhaaditya" ? [g.get("sun")!, g.get("mercury")!] : [moon, g.get("mars")!];
    const d = sep(a.longitude, b.longitude);
    const off = id === "budhaaditya" ? d : Math.min(d, Math.abs(180 - d));
    const what = id === "budhaaditya" || d <= 90 ? "kavuşum" : "karşıtlık";
    if (Math.abs(off - 10) < 0.05) return { state: "uncertain", detail: `${gl(a.id)}–${gl(b.id)} ${what} sapması ${fmt(off)}° (10° sınırında).` };
    return { state: off <= 10 ? "holds" : "fails", detail: `${gl(a.id)}–${gl(b.id)} ${what} sapması ${fmt(off)}° (sınır 10°).` };
  }
  if (id === "sunapha" || id === "anapha" || id === "dhurdhura" || id === "kemadruma") {
    const second = NON_LUMINARY.filter((x) => houseFrom(g.get(x)!, moon) === 2);
    const twelfth = NON_LUMINARY.filter((x) => houseFrom(g.get(x)!, moon) === 12);
    const names = (xs: VedicGrahaId[]) => (xs.length ? xs.map(gl).join(", ") : "yok");
    const detail = `Ay'dan 2. rashide: ${names(second)}; 12. rashide: ${names(twelfth)}.`;
    if (id === "dhurdhura") return { state: second.length && twelfth.length ? "holds" : "fails", detail };
    if (id === "kemadruma") return second.length || twelfth.length ? { state: "fails", detail } : { state: "uncertain", detail: `${detail} İptal koşulları ekole bağlı.` };
    const mine = id === "sunapha" ? second : twelfth;
    const other = id === "sunapha" ? twelfth : second;
    if (!mine.length) return { state: "fails", detail };
    return other.length ? { state: "uncertain", detail: `${detail} İki yan da dolu (Durdhura); ekole bağlı.` } : { state: "holds", detail };
  }
  if (id === "gajakesari") {
    const j = g.get("jupiter")!;
    const h = houseFrom(j, moon);
    if (!KENDRA.includes(h)) return { state: "fails", detail: `Jüpiter Ay'dan ${h}. rashide (kendra değil).` };
    if (j.retrograde) return { state: "fails", detail: `Jüpiter Ay'dan ${h}. rashide (kendra) ama geri hareketli.` };
    const hits: string[] = [];
    for (const m of ["mars", "saturn"] as VedicGrahaId[]) {
      const x = g.get(m)!;
      const from = houseFrom(j, x);
      if (from === 1) hits.push(`${gl(m)} ile aynı rashide`);
      else if (SPECIAL_ASPECTS[m]!.includes(from)) hits.push(`${gl(m)} ${from}. bakışı`);
    }
    if (hits.length) return { state: "fails", detail: `Jüpiter Ay'dan ${h}. rashide (kendra), ancak zararlı etkisi: ${hits.join(", ")}.` };
    return { state: "uncertain", detail: `Jüpiter Ay'dan ${h}. rashide (kendra), geri hareketli değil, Mars/Satürn etkisi yok; Güneş ve düğümlerin sayılması ekole bağlı.` };
  }
  if (id in SANKHYA) {
    const n = new Set(SEVEN.map((x) => g.get(x)!.rashi)).size;
    return { state: n === SANKHYA[id] ? "holds" : "fails", detail: `Yedi graha ${n} farklı rashide.` };
  }
  if (id === "rajju" || id === "musala" || id === "nala") {
    const set = id === "rajju" ? MOVABLE : id === "musala" ? FIXED : DUAL;
    const out = SEVEN.filter((x) => !set.includes(g.get(x)!.rashi));
    return { state: out.length ? "fails" : "holds", detail: out.length ? `Kalıp dışında: ${out.map(gl).join(", ")}.` : "Yedi grahanın tamamı kalıbın burçlarında." };
  }
  if (id in AKRITI_SETS) return shape(g, AKRITI_SETS[id]);
  if (id === "vajra" || id === "yava" || id === "mala" || id === "sarpa") {
    const benefic: VedicGrahaId[] = ["mercury", "venus", "jupiter"];
    const malefic: VedicGrahaId[] = ["sun", "mars", "saturn"];
    if (id === "mala" || id === "sarpa") {
      const grp = id === "mala" ? benefic : malefic;
      const outside = grp.filter((x) => !KENDRA.includes(g.get(x)!.house));
      if (outside.length) return { state: "fails", detail: `Kendra dışında: ${outside.map(gl).join(", ")}.` };
      return { state: "uncertain", detail: "Grup kendralarda; karşı grubun ve Ay'ın sınıfı ekole bağlı." };
    }
    const off = SEVEN.filter((x) => !KENDRA.includes(g.get(x)!.house));
    if (off.length) return { state: "fails", detail: `Kendra dışında: ${off.map(gl).join(", ")}.` };
    const [bH, mH] = id === "vajra" ? [[1, 7], [4, 10]] : [[4, 10], [1, 7]];
    const wrong = [...benefic.filter((x) => !bH.includes(g.get(x)!.house)), ...malefic.filter((x) => !mH.includes(g.get(x)!.house))];
    if (wrong.length) return { state: "fails", detail: `Yanlış kendrada: ${wrong.map(gl).join(", ")}.` };
    return { state: "uncertain", detail: "İyicil/zararlı yerleşimi uygun; Ay'ın sınıfı ekole bağlı." };
  }
  if (id === "dhanamalika") {
    const houses = SEVEN.map((x) => g.get(x)!.house);
    const want = range(2, 7);
    const holds = want.every((h) => houses.includes(h)) && houses.every((h) => want.includes(h));
    return { state: holds ? "holds" : "fails", detail: `Dolu evler ${uniqSorted(houses).join(", ")} (gereken 2–8 kesintisiz).` };
  }
  if (id === "lakshmi") {
    const l9 = lordOfHouse(t, 9);
    if (!l9 || !g.get(l9)) return { state: "not_checked", detail: "9. ev lordu okunamadı." };
    const x = g.get(l9)!;
    const dign = SIGN_LORDS[x.rashi] === l9 || MOOLA[l9] === x.rashi || EXALT[l9] === x.rashi;
    const place = [1, 4, 5, 7, 9, 10].includes(x.house);
    const detail = `9. ev lordu ${gl(l9)} ${sl(x.rashi)} burcunda (${dign ? "kendi/mulatrikona/yücelim" : "kendi/mulatrikona/yücelim değil"}), ${x.house}. evde (${place ? "kendra/trikona" : "kendra/trikona değil"}).`;
    if (!dign || !place) return { state: "fails", detail };
    return { state: "uncertain", detail: `${detail} Lagna lordunun gücü ekole bağlı.` };
  }
  return { state: "not_checked", detail: "Kural ailesi kararı (birden çok klasik bileşim); bağımsız denetim yapılmadı, kanıt metnine bakınız." };
}

/** İlgili graha ve bhavalar (gösterim; D1 konumlarından türetilir). Kural ailesi kararlarında null (kanıt metni). */
export function vedicYogaTriggers(t: VedicD1Technical, id: string): VedicYogaTriggers | null {
  if (!isVedicYogaDetectId(id)) return null;
  const g = grahaMap(t);
  if (!g) return null;
  const moon = g.get("moon")!;
  const out = (ids: VedicGrahaId[]): VedicYogaTriggers => ({ grahas: ids, houses: uniqSorted(ids.map((x) => g.get(x)!.house)) });
  if (id in PM) return out([PM[id]]);
  if (id === "budhaaditya") return out(["sun", "mercury"]);
  if (id === "chandramangala") return out(["moon", "mars"]);
  if (id === "gajakesari") return out(["moon", "jupiter"]);
  if (id === "sunapha" || id === "anapha" || id === "dhurdhura" || id === "kemadruma") {
    const want = id === "sunapha" ? [2] : id === "anapha" ? [12] : [2, 12];
    return out(["moon", ...NON_LUMINARY.filter((x) => want.includes(houseFrom(g.get(x)!, moon)))]);
  }
  if (id === "lakshmi") {
    const l9 = lordOfHouse(t, 9);
    const l1 = lordOfHouse(t, 1);
    if (!l9 || !l1 || !g.get(l9) || !g.get(l1)) return null;
    return out([...new Set([l9, l1])]);
  }
  if (id === "dhana" || id === "daridra") return null;
  return out([...SEVEN]);
}

export function vedicYogaTriggerText(tr: VedicYogaTriggers | null): string {
  if (!tr) return "Kanıt metnindeki kurala bakınız";
  if (tr.grahas.length === 7) return `Yedi görünür graha · dolu evler ${tr.houses.join(", ")}`;
  return `${tr.grahas.map(gl).join(", ")} · ${tr.houses.map((h) => `${h}.`).join(", ")} ev`;
}

const QUALITIES = ["positive", "negative", "both"] as const;

/** Kayıttaki (hesaplanmış) yoga denetimlerini kural düzeyinde satırlara çevirir. Kayıtta olmayan yoga ÜRETİLMEZ. */
export function analyzeVedicYogas(t: VedicD1Technical): VedicYogaRow[] {
  const list = Array.isArray(t?.yogas) ? t.yogas : [];
  return list
    .filter((y) => y && typeof y.id === "string" && typeof y.present === "boolean")
    .map((y) => {
      const info = isVedicYogaDetectId(y.id) ? VEDIC_YOGA_INFO[y.id] : null;
      const sup = typeof y.suppressedBy === "string" && (VEDIC_YOGA_FAMILIES as readonly string[]).includes(y.suppressedBy) ? (y.suppressedBy as VedicYogaFamily) : null;
      const status: VedicYogaStatus = y.present ? "present" : sup ? "suppressed" : "absent";
      const check = checkVedicYogaRule(t, y.id);
      // Sağlayıcı "kural sağlandı" = oluştu YA DA bastırıldı. Eski kayıtta (alan yok) olumsuz karar belirsizdir.
      const providerHeld: boolean | null = y.present || sup ? true : y.suppressedBy === undefined && y.family !== "classical" ? null : false;
      let consistency: VedicYogaConsistency;
      if (check.state === "not_checked") consistency = "not_checked";
      else if (check.state === "uncertain") consistency = "uncertain";
      else if (providerHeld === null) consistency = check.state === "holds" ? "uncertain" : "consistent";
      else consistency = (check.state === "holds") === providerHeld ? "consistent" : "inconsistent";
      return {
        id: y.id,
        name: y.name || y.id,
        sanskrit: info?.sanskrit ?? (y.name || y.id).replace(/\s+Yoga$/i, ""),
        family: y.family,
        known: !!info,
        present: y.present,
        status,
        quality: (QUALITIES as readonly string[]).includes(String(y.quality)) ? y.quality : null,
        formation: info?.formation ?? null,
        school: info?.school ?? null,
        triggers: vedicYogaTriggers(t, y.id),
        evidence: typeof y.evidence === "string" ? y.evidence : null,
        suppressedBy: sup,
        check,
        consistency,
      };
    });
}

export function vedicYogaSummary(rows: VedicYogaRow[]) {
  const c = (f: (r: VedicYogaRow) => boolean) => rows.filter(f).length;
  return {
    total: rows.length,
    present: c((r) => r.status === "present"),
    suppressed: c((r) => r.status === "suppressed"),
    consistent: c((r) => r.consistency === "consistent"),
    inconsistent: c((r) => r.consistency === "inconsistent"),
    uncertain: c((r) => r.consistency === "uncertain"),
    notChecked: c((r) => r.consistency === "not_checked"),
  };
}

/**
 * Bir yoga karar öğesinin (D1 `yogas[]` ya da tespit ucu `yogas[]`) KENDİ İÇİNDE tutarlılığı: nitelik/aile sözlüğü, katalog ailesi,
 * bastırma yalnız present=false iken ve yalnız klasik öncelik normuyla. Şema örneklerinin gerçek yanıt yerine kullanılamayacağını
 * gösterir (örnek alanlar birbirinden bağımsız seçilmiştir).
 */
export function checkYogaVerdictShape(item: unknown): string[] {
  const issues: string[] = [];
  const o = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
  if (!o) return ["öğe nesne değil"];
  if (typeof o.id !== "string" || !/^[a-z0-9-]{2,60}$/.test(o.id)) issues.push("id biçimi");
  if (typeof o.present !== "boolean") issues.push("present boolean değil");
  if (!["Positive", "Negative", "Both"].includes(String(o.quality))) issues.push("quality sözlük dışı");
  const fam = String(o.family);
  if (!(VEDIC_YOGA_FAMILIES as readonly string[]).includes(fam)) issues.push("aile sözlük dışı");
  if (isVedicYogaDetectId(o.id) && VEDIC_YOGA_INFO[o.id].family !== fam) issues.push(`aile uyuşmuyor: ${o.id} katalogda ${VEDIC_YOGA_INFO[o.id].family}, öğede ${fam}`);
  if (o.suppressedBy !== undefined) {
    const sup = String(o.suppressedBy) as VedicYogaFamily;
    if (o.present !== false) issues.push("suppressedBy yalnız present=false iken olabilir");
    if (!(PRECEDENCE[fam as VedicYogaFamily] ?? []).includes(sup)) issues.push(`aile önceliği: ${sup}, ${fam} ailesini bastıramaz`);
  }
  return issues;
}
