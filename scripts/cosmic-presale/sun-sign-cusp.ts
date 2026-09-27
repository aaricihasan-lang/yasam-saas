/**
 * scripts/cosmic-presale/sun-sign-cusp.ts
 *
 * §18C Güneş burcu CUSP (ingress) doğruluğu.
 * AE ile Güneş'in her 30° burç sınırını geçtiği ANI (bisection) bulur ve üretim
 * getSunSignInfo'nun tam o anda (±1 dk) doğru burca geçtiğini doğrular:
 *   crossing − 1 dk → önceki burç ; crossing + 1 dk → yeni burç.
 * Ek akıl-testi: İlkbahar ekinoksu ingress'i (Koç'a giriş) ~20-21 Mart olmalı.
 *
 * Çalıştırma: npx tsx scripts/cosmic-presale/sun-sign-cusp.ts
 */
import * as AE from "astronomy-engine";
import { getSunSignInfo } from "../../lib/cosmic/planets";

const elon = (ms: number) => AE.Ecliptic(AE.GeoVector(AE.Body.Sun, new Date(ms), true)).elon;
const signIdx = (ms: number) => Math.floor((((elon(ms) % 360) + 360) % 360) / 30);
let failures = 0;
const ok = (m: string) => console.log("  ✓ " + m);
const bad = (m: string) => { failures++; console.error("  ✗ " + m); };

console.log("\n=== §18C Güneş Burcu Cusp (2027 ingress'leri) ===");
const FROM = Date.UTC(2027, 0, 1), TO = Date.UTC(2028, 0, 1);
const step = 12 * 3_600_000; // 12 saat
let prev = signIdx(FROM);
let ingresses = 0;
let ariesIngressMs = 0;
for (let t = FROM; t < TO; t += step) {
  const nt = Math.min(t + step, TO);
  const s = signIdx(nt);
  if (s !== prev) {
    // sınır anını bisection ile bul
    let lo = t, hi = nt;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (signIdx(mid) === prev) lo = mid; else hi = mid; }
    const cross = hi;
    const before = getSunSignInfo(new Date(cross - 60000)).name;
    const after = getSunSignInfo(new Date(cross + 60000)).name;
    if (before !== after && before && after) ok(`ingress ${new Date(cross).toISOString().slice(0,16)}Z: ${before} → ${after}`);
    else bad(`ingress ${new Date(cross).toISOString().slice(0,10)}: cusp flip yok (${before}/${after})`);
    if (s === 0) ariesIngressMs = cross; // Koç'a giriş
    ingresses++;
    prev = s;
  }
}
if (ingresses === 12) ok("2027'de 12 ingress bulundu (yıl başına tam 12)");
else bad(`2027'de ${ingresses} ingress (12 beklendi)`);

// İlkbahar ekinoksu akıl-testi (Koç'a giriş 20-21 Mart)
if (ariesIngressMs) {
  const d = new Date(ariesIngressMs);
  const marchOk = d.getUTCMonth() === 2 && d.getUTCDate() >= 19 && d.getUTCDate() <= 21;
  marchOk ? ok(`Koç'a giriş (ekinoks) = ${d.toISOString().slice(0,10)} (~20 Mart ✓)`) : bad(`Koç ingress ${d.toISOString().slice(0,10)} beklenen ~20 Mart değil`);
}

console.log(`\n=== SONUÇ: ${failures === 0 ? "✅ CUSP DOĞRU" : `❌ ${failures} SAPMA`} ===`);
process.exit(failures === 0 ? 0 : 1);
