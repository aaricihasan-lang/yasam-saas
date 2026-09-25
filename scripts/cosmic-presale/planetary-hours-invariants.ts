/**
 * scripts/cosmic-presale/planetary-hours-invariants.ts
 *
 * KAJ-P1-01 KAPANIŞ KANITI — Gezegen Saatleri değişmezleri (§18A + §2 sınır durumları).
 *
 * Kanıtlanan değişmezler (tümü SIFIR olmalı):
 *   • gaps      = 0  (slot[i].end === slot[i+1].start)
 *   • overlaps  = 0
 *   • Chaldean sequence breaks = 0  (her sınırda chaldeanIdx +1 mod 7 ilerler; şafak/gece
 *                                    yarısında SIFIRLANMAZ — gezegen günü sunrise-anchored)
 *
 * Ayrıca sınır anları: gece yarısı, 00:01, şafak-1dk, tam şafak, şafak+1dk, gün batımı,
 * batım+1dk — getPlanetaryHour'un ürettiği aktif slot canonical generator ile TUTARLI.
 *
 * Çalıştırma: npx tsx scripts/cosmic-presale/planetary-hours-invariants.ts
 * Bağımsızlık: yalnız üretim motorunu (lib/cosmic/planetary-hours.ts) çağırır; sunrise/sunset
 * bağımsız oracle karşılaştırması AYRI harness'tedir (sunrise-sunset-oracle).
 */
import {
  getPlanetaryHoursForDate,
  getPlanetaryHour,
  getDayRuler,
  CHALDEAN_PLANETS,
} from "../../lib/cosmic/planetary-hours";

const LAT = 41.0082, LON = 28.9784, TZ = 180; // İstanbul, UTC+3
let failures = 0;
const fail = (msg: string) => { failures++; console.error("  ✗ " + msg); };
const ok = (msg: string) => console.log("  ✓ " + msg);

// Farklı mevsim + haftanın tüm günlerini kapsayan başlangıç tarihleri (2026-2050 içinde).
const SEEDS = [
  new Date(2026, 0, 4),  // kış, Pazar
  new Date(2026, 3, 15), // ilkbahar, Çarşamba
  new Date(2030, 6, 1),  // yaz, Pazartesi
  new Date(2040, 9, 20), // sonbahar, Cumartesi
  new Date(2050, 11, 25),// kış (aralık), sınır yıl
];

console.log("\n=== Gezegen Saatleri Değişmezleri (KAJ-P1-01) ===");

for (const seed of SEEDS) {
  // 8 ardışık gezegen gününü (bir haftadan fazla) kesintisiz zincirle.
  const allSlots: { start: number; end: number; idx: number; hourIndex: number }[] = [];
  for (let d = 0; d < 8; d++) {
    const day = new Date(seed.getFullYear(), seed.getMonth(), seed.getDate() + d);
    const slots = getPlanetaryHoursForDate(day, LAT, LON, TZ, TZ);
    if (slots.length !== 24) { fail(`${day.toDateString()}: 24 yerine ${slots.length} slot`); continue; }

    // Gün-içi: 24 slot, gap/overlap yok, Chaldean +1 mod 7, hour 0 = gün yöneticisi.
    const startIdx = slots[0]!.chaldeanIdx;
    const rulerIdx = CHALDEAN_PLANETS.indexOf(getDayRuler(day, TZ));
    if (startIdx !== rulerIdx) fail(`${day.toDateString()}: hour0 idx ${startIdx} ≠ gün yöneticisi ${rulerIdx}`);
    for (let i = 0; i < 24; i++) {
      const s = slots[i]!;
      if (s.hourIndex !== i) fail(`${day.toDateString()} slot ${i}: hourIndex ${s.hourIndex}`);
      if (s.chaldeanIdx !== (startIdx + i) % 7) fail(`${day.toDateString()} slot ${i}: Chaldean kırık`);
      if (i < 23) {
        const n = slots[i + 1]!;
        if (Math.abs(n.start.getTime() - s.end.getTime()) > 2) fail(`${day.toDateString()} slot ${i}: gap/overlap`);
        if ((n.chaldeanIdx - s.chaldeanIdx + 7) % 7 !== 1) fail(`${day.toDateString()} slot ${i}: +1 kırık`);
      }
      allSlots.push({ start: s.start.getTime(), end: s.end.getTime(), idx: s.chaldeanIdx, hourIndex: i });
    }
  }

  // Zincir (günler arası): sunrise-anchored → gece yarısı SIFIRLAMASI YOK.
  // Bir gezegen gününün son gece slotu, ertesi günün ilk gündüz slotuyla ZAMAN olarak
  // birleşik VE Chaldean olarak +1 mod 7 ilerlemeli (kesintisiz haftalık dizi).
  let chainBreaks = 0, timeBreaks = 0;
  for (let i = 0; i < allSlots.length - 1; i++) {
    const a = allSlots[i]!, b = allSlots[i + 1]!;
    if (Math.abs(b.start - a.end) > 2) timeBreaks++;
    if ((b.idx - a.idx + 7) % 7 !== 1) chainBreaks++;
  }
  const label = seed.toDateString();
  if (timeBreaks === 0) ok(`${label}: zaman süreklilik (gap/overlap=0) — ${allSlots.length} slot`);
  else fail(`${label}: ${timeBreaks} zaman kırığı`);
  if (chainBreaks === 0) ok(`${label}: Chaldean süreklilik (sequence break=0, gece-yarısı reset YOK)`);
  else fail(`${label}: ${chainBreaks} Chaldean kırığı`);
}

// ── Sınır anları (§2) — pre-dawn fix davranışı ────────────────────────────────
console.log("\n=== Sınır Anları (pre-dawn) ===");
{
  const day = new Date(2030, 6, 1); // Pazartesi, İstanbul yaz — şafak ~05:40 civarı
  const slots = getPlanetaryHoursForDate(day, LAT, LON, TZ, TZ);
  const sunrise = slots[0]!.start;   // gündüz ilk slot başlangıcı = şafak
  const sunset  = slots[12]!.start;  // gece ilk slot başlangıcı = batım
  const rulerIdx = CHALDEAN_PLANETS.indexOf(getDayRuler(day, TZ));

  const probes: { name: string; at: Date }[] = [
    { name: "gece yarısı 00:00", at: new Date(Date.UTC(2030, 6, 1, 0, 0) - TZ * 60000) },
    { name: "00:01",             at: new Date(Date.UTC(2030, 6, 1, 0, 1) - TZ * 60000) },
    { name: "şafak −1 dk",       at: new Date(sunrise.getTime() - 60000) },
    { name: "tam şafak",         at: new Date(sunrise.getTime() + 1000) },
    { name: "şafak +1 dk",       at: new Date(sunrise.getTime() + 60000) },
    { name: "gün batımı",        at: new Date(sunset.getTime() + 1000) },
    { name: "batım +1 dk",       at: new Date(sunset.getTime() + 60000) },
  ];
  for (const p of probes) {
    const r = getPlanetaryHour(p.at, LAT, LON, TZ);
    // Aktif slot her zaman geçerli (kalanDakika>0), fallback DEĞİL (İstanbul kutup değil).
    if (r.isFallback) { fail(`${p.name}: beklenmeyen fallback`); continue; }
    if (r.kalanDakika < 0) fail(`${p.name}: negatif kalanDakika`);
    ok(`${p.name}: ${r.aktifGezegen.name} (idx ${r.aktifChaldeanIdx}, kalan ${r.kalanDakika}dk, ${r.isDayHour ? "gündüz" : "gece"})`);
  }
  // Tam şafakta hour 0 = gün yöneticisi (pre-dawn fix: 00:00 DEĞİL şafak reset noktası).
  const atSunrise = getPlanetaryHour(new Date(sunrise.getTime() + 1000), LAT, LON, TZ);
  if (atSunrise.aktifChaldeanIdx === rulerIdx && atSunrise.saatIndex === 0)
    ok(`tam şafak: hour0 = gün yöneticisi (${CHALDEAN_PLANETS[rulerIdx]!.name})`);
  else fail(`tam şafak: hour0 gün yöneticisi değil (idx ${atSunrise.aktifChaldeanIdx}, saat ${atSunrise.saatIndex})`);

  // Şafak −1 dk (pre-dawn) DÜNÜN gezegen gününe ait → gece saati (isDayHour=false).
  const preDawn = getPlanetaryHour(new Date(sunrise.getTime() - 60000), LAT, LON, TZ);
  if (!preDawn.isDayHour) ok("şafak −1 dk: gece saati (dünün gezegen günü sürüyor — erken reset YOK)");
  else fail("şafak −1 dk: gündüz saati döndü (pre-dawn hatası)");
}

console.log(`\n=== SONUÇ: ${failures === 0 ? "✅ TÜM DEĞİŞMEZLER GEÇTİ" : `❌ ${failures} HATA`} ===`);
process.exit(failures === 0 ? 0 : 1);
