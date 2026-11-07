// Astroloji — ATL-B02 (07.11.2026): On Porutham Rasi kriterinin Kalaprakasika kuralıyla YEREL hesabı (SAF; ağ yok).
//
// Neden: hesaplama servisi Rasi'yi "gelinden damada 6., 8. ve 12. sayım karşılanmaz, diğerleri karşılanır" kuralıyla veriyor (148
// gerçek çiftte 141 uyum; 7 çiftte 6. sayımı kendi kuralına aykırı olarak karşılanmış sayıyor). Ürünün dayanağı Kalaprakasika'dır
// (N. P. Subramania Iyer çevirisi, Bölüm XIII "To Determine the Suitability of a Match", s. 73–74; owner kararı 31.10.2026, yöntem A):
//   • Sayım gelinin Ay burcundan damadınkine (ikisi dahil); rol sırası anlamlıdır (simetri YOK).
//   • 2., 3., 4., 5., 6. konum olumsuz; bunların tersi (12., 11., 10., 9., 8.) olumlu; karşıt burçlar (7.) olumlu.
//   • İstisna 2.: damadın burcu ÇİFT burçsa olumlu, tek burçsa zararlı.
//   • İstisna 6.: Koç–Başak, Yay–Boğa, Terazi–Balık, Kova–Yengeç, Aslan–Oğlak, İkizler–Akrep çiftlerinde olumlu.
//   • Aynı burç (1. sayım): Rasi bölümünde hüküm YOK → sonuç BELİRSİZ (0 ya da 1 atanmaz; toplam da belirsiz olur).
// Genel istisna (s. 76): Rajju, Vedhai, Ganam ve Rasi'nin olumsuz etkisi, iki Ay burcunun yöneticisi aynıysa, yöneticiler dostsa ya
// da burçlar karşıtsa "dikkate alınmayabilir". Bu bir YORUM bilgisidir: Rasi puanına KATILMAZ, ayrı alan olarak taşınır. Üç koşul
// birbirini dışlar (karşıt burçların yöneticisi hiçbir çiftte aynı değildir), yani koşullar "ya da" ile okunur. Dostluk Kalaprakasika'nın
// kendi listesinden (s. 74–75) okunur; listede yalnız tek yönde belirtilen ya da hiç belirtilmeyen ilişki BELİRSİZ kalır.
//
// Diğer dokuz kriter, Rajju / Vedha kısıtları ve astronomik veri (iki Ay burcu) servisin yanıtından AYNEN alınır. Servisin genel
// değerlendirmesi kendi Rasi sonucuna dayanır: yerel Rasi servisinkinden farklıysa ya da belirsizse değerlendirme ve öneri cümlesi
// GÖSTERİLMEZ (yerine yeni bir genel karar üretilmez).

import { SIGN_LORDS } from "../model/kp";
import { SIGN_IDS, type SignId } from "../model/western";
import type { VedicGrahaId } from "../model/vedic";
import { countFrom, RASI_METHOD, type RasiClassic, type RasiParihara, type RasiRule, type VedicDashakootInterpretation, type VedicDashakootTechnical } from "../model/vedicPorutham";
import { mapRashi } from "../providers/roxy/vedic";
import type { AdapterResult } from "../providers/roxy/timing";

/** Kalaprakasika 6. konum istisnası — [gelin, damat] (damat gelinden 6.). */
export const RASI_SIXTH_EXCEPTIONS: readonly (readonly [SignId, SignId])[] = [
  ["aries", "virgo"],
  ["sagittarius", "taurus"],
  ["libra", "pisces"],
  ["aquarius", "cancer"],
  ["leo", "capricorn"],
  ["gemini", "scorpio"],
];

type Rel = "friend" | "enemy" | "unstated";
type SevenGraha = "sun" | "moon" | "mars" | "mercury" | "jupiter" | "venus" | "saturn";
/**
 * Kalaprakasika s. 74–75 (Rasyadhipathi) — metindeki ifadeler AYNEN: "friends" listelenen dosttur; "other planets are his enemies",
 * "only friend", "all except" ifadeleri kalanları açıkça belirler. Ay için yalnız dostlar, Satürn için yalnız düşman verildiğinden
 * kalan ilişkiler "unstated"tır (uydurulmaz).
 */
const KP_FRIENDSHIP: Readonly<Record<SevenGraha, { friends: readonly SevenGraha[]; rest: Rel; enemies?: readonly SevenGraha[] }>> = {
  mars: { friends: ["mercury", "venus"], rest: "enemy" },
  venus: { friends: [], enemies: ["sun", "moon"], rest: "friend" },
  mercury: { friends: [], enemies: ["sun"], rest: "friend" },
  moon: { friends: ["mercury", "jupiter"], rest: "unstated" },
  sun: { friends: ["jupiter"], rest: "enemy" },
  jupiter: { friends: [], enemies: ["mars"], rest: "friend" },
  saturn: { friends: [], enemies: ["jupiter"], rest: "unstated" },
};
export function kpRelation(from: VedicGrahaId, to: VedicGrahaId): Rel {
  const e = KP_FRIENDSHIP[from as SevenGraha];
  if (!e || from === to) return "unstated";
  if (e.friends.includes(to as SevenGraha)) return "friend";
  if (e.enemies?.includes(to as SevenGraha)) return "enemy";
  return e.rest;
}

/** Gelin (2. rol) ve damat (1. rol) Ay burçlarından Kalaprakasika Rasi sonucu. */
export function classicalRasi(groom: SignId, bride: SignId): { count: number; rule: RasiRule; status: RasiClassic["status"] } {
  const count = countFrom(SIGN_IDS.indexOf(bride), SIGN_IDS.indexOf(groom), 12);
  if (count === 1) return { count, rule: "same_sign", status: "uncertain" };
  if (count === 2) return SIGN_IDS.indexOf(groom) % 2 === 1 ? { count, rule: "second_even", status: "matched" } : { count, rule: "second_odd", status: "unmatched" };
  if (count === 3) return { count, rule: "third", status: "unmatched" };
  if (count === 4) return { count, rule: "fourth", status: "unmatched" };
  if (count === 5) return { count, rule: "fifth", status: "unmatched" };
  if (count === 6) return RASI_SIXTH_EXCEPTIONS.some(([b, g]) => b === bride && g === groom) ? { count, rule: "sixth_listed", status: "matched" } : { count, rule: "sixth", status: "unmatched" };
  if (count === 7) return { count, rule: "seventh", status: "matched" };
  return { count, rule: "converse", status: "matched" };
}

/** Genel istisna (s. 76) — yalnız Rasi karşılanmadığında ya da belirsizken anlamlıdır; puanı değiştirmez. */
export function rasiParihara(groom: SignId, bride: SignId, status: RasiClassic["status"]): RasiParihara {
  if (status === "matched") return "not_needed";
  const l1 = SIGN_LORDS[groom];
  const l2 = SIGN_LORDS[bride];
  if (l1 === l2) return "applies_same_lord";
  // Karşıt burç koşulu Rasi'de etkisizdir (7. sayım zaten karşılanır).
  const a = kpRelation(l1, l2);
  const b = kpRelation(l2, l1);
  if (a === "friend" && b === "friend") return "applies_friends";
  if (a === "enemy" && b === "enemy") return "none";
  return "uncertain_friendship";
}

/**
 * Servis projeksiyonunun Rasi satırını Kalaprakasika sonucuyla değiştirir; toplamı satırlardan yeniden kurar (Rasi belirsizse toplam
 * null + aralık). Diğer satırlar, kısıtlar ve çerçeve DEĞİŞMEZ. Yorum katmanında servisin Rasi açıklaması çıkarılır; yerel Rasi
 * servisinkinden farklıysa genel değerlendirme + öneri cümlesi gizlenir.
 */
export function applyClassicalRasi(
  r: AdapterResult<VedicDashakootTechnical, VedicDashakootInterpretation>,
): AdapterResult<VedicDashakootTechnical, VedicDashakootInterpretation> {
  if (!r.ok) return r;
  const t = r.technical;
  const row = t.rows.find((x) => x.id === "rasi");
  const groom = row ? mapRashi(row.person1.raw) : null;
  const bride = row ? mapRashi(row.person2.raw) : null;
  if (!row || !groom || !bride || typeof row.matched !== "boolean") return { ok: false, errors: ["rasi: Kalaprakasika hesabı için iki Ay burcu okunamadı"] };
  const res = classicalRasi(groom, bride);
  const provider = row.matched;
  const local = res.status === "uncertain" ? null : res.status === "matched";
  const rasiClassic: RasiClassic = { method: RASI_METHOD, count: res.count, rule: res.rule, status: res.status, provider: { matched: provider }, parihara: rasiParihara(groom, bride, res.status) };
  const rows = t.rows.map((x) => (x.id === "rasi" ? { ...x, matched: local, points: local === null ? null : local ? (1 as const) : (0 as const), count: res.count } : x));
  const others = rows.reduce((s, x) => s + (x.id === "rasi" ? 0 : (x.points ?? 0)), 0);
  const technical: VedicDashakootTechnical =
    local === null ? { ...t, rows, total: null, totalRange: [others, others + 1], rasiClassic } : { ...t, rows, total: others + (local ? 1 : 0), rasiClassic };
  const differs = local !== provider;
  const i = r.interpretation;
  const interpretation: VedicDashakootInterpretation | null = i
    ? { ...i, notes: i.notes.filter((n) => n.id !== "rasi"), ...(differs ? { verdict: null, recommendation: null, verdictWithheld: "rasi_local" as const } : {}) }
    : null;
  return { ...r, technical, interpretation };
}
