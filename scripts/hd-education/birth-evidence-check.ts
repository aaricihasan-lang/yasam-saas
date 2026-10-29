/**
 * FAZ 19 — doğum saati kaynak etiketi + saat standardı ayrıştırma (SAF; DB / ağ YOK).
 * Örnek seen_how / time_standard metinleri FAZ16 canlı aktarım paketindeki BİÇİMLERİN kısaltılmış kopyalarıdır (kişisel veri yok).
 * Çalıştır: npx tsx scripts/hd-education/birth-evidence-check.ts
 */
import {
  EDU_BIRTH_EVIDENCE_LABEL, birthTimeSeenHow, classifySeenHow, deriveBirthTimeEvidence, splitTimeStandard, type EduBirthTimeSourceLite,
} from "../../lib/human-design/education/birthEvidence";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""}`); }
}
const bt = (primarySecondary: string | null, seenHow: string | null, timeExplicit: boolean | null = true): EduBirthTimeSourceLite =>
  ({ role: "birth_time", primarySecondary, seenHow, timeExplicit });

console.log("[A. seen_how sınıflandırma]");
ok(classifySeenHow("belge görüntüsü görüldü (FAZ16)") === "seen", "görüldü → seen");
ok(classifySeenHow("görüntü (Antenati)") === "seen", "görüntü (arşiv portalı) → seen");
ok(classifySeenHow("belge görüntüsü GÖRÜLMEDİ — aktarım/ADB kaynak notu (FAZ16)") === "not_seen", "BÜYÜK HARF 'GÖRÜLMEDİ' (Türkçe İ) → not_seen");
ok(classifySeenHow("ADB açık MediaWiki ham metni okundu (FAZ15); birincil belge/kurum yanıtının aktarımı — belge görüntüsü görülmedi") === "not_seen",
  "'okundu' + 'görüntüsü görülmedi' birlikte → not_seen (olumsuz öncelikli)");
ok(classifySeenHow("belge görüntüsü görüldü (29.10.2026, OpenGauquelin aynası; özgün Archives de Paris sitesi kapalı)") === "mirror", "OpenGauquelin aynası → mirror");
ok(classifySeenHow(null) === null && classifySeenHow("  ") === null && classifySeenHow("arşiv notu") === null, "boş / tanınmayan metin → hiçbir şey iddia edilmez");

console.log("\n[B. Etiket düzeyi — yalnız verinin desteklediği]");
ok(deriveBirthTimeEvidence([bt("birincil", "belge görüntüsü görüldü (FAZ16)")]) === "birincil_goruldu", "birincil + görüldü → 'Birincil belge görüldü'");
ok(deriveBirthTimeEvidence([bt("birincil", "belge görüntüsü görüldü (OpenGauquelin aynası)")]) === "ayna_goruldu", "ayna → 'Ayna kopyadan görüldü'");
ok(deriveBirthTimeEvidence([bt("ikincil", "belge görüntüsü GÖRÜLMEDİ — aktarım/ADB kaynak notu (FAZ16)")]) === "aktarim", "ikincil + görülmedi → 'Aktarıma dayanır (belge görülmedi)'");
ok(deriveBirthTimeEvidence([bt("birincil", null)]) === "birincil_kaynak", "birincil, seen_how YOK → 'Birincil kaynaklı' (belge görüldü DENMEZ)");
ok(deriveBirthTimeEvidence([bt("ikincil", null)]) === "kaynakli" && deriveBirthTimeEvidence([bt(null, null, null)]) === "kaynakli", "bilgi yok → 'Kaynaklı doğum saati'");
ok(deriveBirthTimeEvidence([bt("birincil", "belge görüntüsü görüldü", false)]) === "kaynakli", "saat belgede açık DEĞİL → belge düzeyi iddia edilmez");
ok(deriveBirthTimeEvidence([bt("ikincil", "belge görüntüsü görüldü")]) === "kaynakli", "ikincil belge görüldü → birincil iddiası yok");
ok(deriveBirthTimeEvidence([]) === "kaynakli", "kaynak yok → 'Kaynaklı doğum saati'");
ok(deriveBirthTimeEvidence([{ role: "utc_standard", primarySecondary: "birincil", seenHow: "görüldü", timeExplicit: true }]) === "kaynakli", "yalnız birth_time kaynağı sayılır");
ok(deriveBirthTimeEvidence([bt("ikincil", "belge görüntüsü görülmedi"), bt("birincil", "belge görüntüsü görüldü")]) === "birincil_goruldu", "birden çok kaynak → en güçlü düzey");
ok(Object.values(EDU_BIRTH_EVIDENCE_LABEL).every((l) => !/^Belgeli doğum saati$/.test(l)), "sabit 'Belgeli doğum saati' etiketi artık yok");
ok(birthTimeSeenHow([bt("birincil", null), bt("ikincil", " görüntü (Antenati) ")]) === "görüntü (Antenati)" && birthTimeSeenHow([bt("birincil", null)]) === null, "ayrıntı: seen_how özeti (yoksa null)");

console.log("\n[C. Saat standardı ↔ harita duyarlılığı]");
const p16 = splitTimeStandard("Belçika yasal saati (GMT+0); yaz saati yok | FAZ16 duyarlılık: aday aralığı 06:00:00Z–07:00:00Z (SE+JPL) boyunca DEĞİŞMEZ.");
ok(p16.standard === "Belçika yasal saati (GMT+0); yaz saati yok" && p16.sensitivity === "Duyarlılık: aday aralığı 06:00:00Z–07:00:00Z (SE+JPL) boyunca DEĞİŞMEZ.", "' | FAZ16 duyarlılık' ayrıldı", p16);
const p15 = splitTimeStandard("Paris ortalama saati; belirsizliği 13.3 dk. | FAZ15 duyarlılık (Swiss Ephemeris, 1 dk adım): aday aralığı DEĞİŞMEZ.");
ok(p15.standard === "Paris ortalama saati; belirsizliği 13.3 dk." && /^Duyarlılık \(Swiss Ephemeris/.test(p15.sensitivity ?? ""), "' | FAZ15 duyarlılık (…)' ayrıldı", p15);
const inl = splitTimeStandard("Orta Avrupa Saati (UTC+01:00); resmî kayıt yanıtı 03:45 esas. FAZ15 duyarlılık: ±30 dk içinde DEĞİŞMEZ.");
ok(inl.standard === "Orta Avrupa Saati (UTC+01:00); resmî kayıt yanıtı 03:45 esas." && inl.sensitivity === "Duyarlılık: ±30 dk içinde DEĞİŞMEZ.", "ayırıcısız cümle sonu biçimi ('. FAZ15 duyarlılık') ayrıldı", inl);
for (const [label, t] of [
  ["işaret yok", "Londra yerel ortalama saati (mean time)."],
  ["işaret başta", "FAZ15 duyarlılık: aday aralığı DEĞİŞMEZ."],
  ["ayırıcısız sözcük içi", "Yerel saat FAZ16 duyarlılık notu ile"],
  ["boş", ""],
] as const) {
  const r = splitTimeStandard(t);
  ok(r.standard === t && r.sensitivity === null, `ayrıştırılamaz → TEK alan (${label})`, r);
}
ok(splitTimeStandard(null).standard === null && splitTimeStandard(null).sensitivity === null, "null → null");

console.log(`\nbirth-evidence-check: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
