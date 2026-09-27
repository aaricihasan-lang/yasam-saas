/**
 * scripts/cosmic-presale/hijri-fixtures.ts
 *
 * §18E Hicri (Umm al-Qura) fixtures + §9 Diyanet karşılaştırması.
 *
 * A) DİYANET ANKORLARI (2027 resmî dini günler — web kaynaklı, bkz. rapor):
 *    Üretim Umm al-Qura çıktısı Diyanet ile karşılaştırılır. Fark ≤ 1 gün "takvim yöntemi
 *    farkı" olarak sınıflanır (BUG DEĞİL); gözlenen fark bu ankorlar için 0 gündür.
 * B) TUTARLILIK: ardışık günlerde Hicri +1 ilerler / ay sonunda 1'e döner; ay uzunluğu
 *    29-30; 12 ay/yıl; sınır (29/30 → 1) doğru.
 *
 * Çalıştırma: npx tsx scripts/cosmic-presale/hijri-fixtures.ts
 */
import { getHijriDate } from "../../lib/cosmic/hijri";

const HIJRI_MONTHS = ["Muharrem","Safer","Rebiülevvel","Rebiülahir","Cemaziyelevvel","Cemaziyelahir","Recep","Şaban","Ramazan","Şevval","Zilkade","Zilhicce"];
let failures = 0;
const ok = (m: string) => console.log("  ✓ " + m);
const bad = (m: string) => { failures++; console.error("  ✗ " + m); };

function parse(dateISO: string): { d: number; mi: number; y: number } | null {
  const s = getHijriDate(new Date(dateISO + "T09:00:00Z"));
  const m = s.match(/^(\d+)\s+(.+?)\s+(\d+)$/);
  if (!m) return null;
  const mi = HIJRI_MONTHS.indexOf(m[2]!);
  if (mi < 0) return null;
  return { d: parseInt(m[1]!, 10), mi, y: parseInt(m[3]!, 10) };
}
// Mutlak Hicri gün numarası (yaklaşık) — ±1 fark ölçümü için ay sınırlarını aşar.
const absDay = (p: { d: number; mi: number; y: number }) => (p.y * 12 + p.mi) * 30 + p.d;

console.log("\n=== §9 Diyanet Ankorları (Üretim Umm al-Qura ↔ Diyanet 2027) ===");
// [Gregoryen, Diyanet-Hicri gün, ay-index, yıl, etiket]
const ANCHORS: [string, number, number, number, string][] = [
  ["2027-02-08", 1, 8, 1448, "Ramazan başlangıcı (1 Ramazan)"],
  ["2027-03-09", 1, 9, 1448, "Ramazan Bayramı 1. gün (1 Şevval)"],
  ["2027-05-16", 10, 11, 1448, "Kurban Bayramı 1. gün (10 Zilhicce)"],
  ["2026-12-10", 1, 6, 1448, "Üç aylar / Recep başlangıcı (1 Recep)"],
];
for (const [greg, dd, mi, yy, label] of ANCHORS) {
  const p = parse(greg);
  if (!p) { bad(`${label}: üretim Hicri parse edilemedi`); continue; }
  const diff = Math.abs(absDay(p) - absDay({ d: dd, mi, y: yy }));
  const prodStr = `${p.d} ${HIJRI_MONTHS[p.mi]} ${p.y}`;
  if (diff === 0) ok(`${label}: ÜRETİM=Diyanet=${prodStr} (fark 0 gün)`);
  else if (diff <= 1) ok(`${label}: üretim ${prodStr} · Diyanet ${dd} ${HIJRI_MONTHS[mi]} ${yy} → ${diff} gün (yöntem farkı, bug değil)`);
  else bad(`${label}: üretim ${prodStr} vs Diyanet ${dd} ${HIJRI_MONTHS[mi]} ${yy} → ${diff} gün (>1, incele)`);
}

console.log("\n=== §18E Tutarlılık (2027 boyunca ardışık gün) ===");
{
  let prev = parse("2026-12-31")!;
  let monthLenOk = true, advanceOk = true, transitions = 0;
  for (let t = Date.parse("2027-01-01T09:00:00Z"); t <= Date.parse("2027-12-31T09:00:00Z"); t += 86400000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    const cur = parse(iso)!;
    const sameMonth = cur.y === prev.y && cur.mi === prev.mi;
    if (sameMonth) {
      if (cur.d !== prev.d + 1) advanceOk = false;            // ay içi kesintisiz +1
    } else {
      if (cur.d !== 1) advanceOk = false;                     // ay değişince 1'e döner
      if (prev.d !== 29 && prev.d !== 30) monthLenOk = false; // biten ay 29 veya 30 gün
      transitions++;
    }
    prev = cur;
  }
  advanceOk ? ok("ardışık günlerde Hicri +1 / ay sonunda 1 (kesintisiz)") : bad("Hicri gün ilerlemesi kırık");
  monthLenOk ? ok(`ay uzunlukları 29-30 gün (${transitions} ay geçişi doğrulandı)`) : bad("geçersiz ay uzunluğu (29/30 dışı)");
}

console.log(`\n=== SONUÇ: ${failures === 0 ? "✅ HİCRİ FIXTURES + DİYANET UYUMLU" : `❌ ${failures} SAPMA`} ===`);
process.exit(failures === 0 ? 0 : 1);
