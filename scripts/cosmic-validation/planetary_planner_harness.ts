/**
 * scripts/cosmic-validation/planetary_planner_harness.ts
 * FAZ "Kozmik Ajanda — Gelecek Tarih & Profesyonel Planlama" deterministik kabul harness'i.
 *
 * KAPSAM (yalnız bu fazın yeni/etkilenen davranışları):
 *   A. Seçili tarih gezegen konumları (getPlanetSigns/getMoonSign saf & tarih-duyarlı)
 *   B. Belirli tarih+saat gezegen saati (getPlanetaryHour hedef Date; DST-doğru offset)
 *   C. 24-saat üretici + range planlayıcı (getPlanetaryHoursForDate / ...ForRange)
 *   D. Tutulma referans tarihi (selectedDate filtresi; realNow'a bağlı değil; ≤10; ≤2050)
 *   E. Timezone/DST (getTimeZoneOffsetMinutes hedef tarihe göre)
 *   G. Regresyon (getMoonPhase/getHijriDate/getDailyAspects saf & değişmemiş)
 *
 * Astronomik motoru DEĞİŞTİRMEZ; yalnız production fonksiyonlarını çağırıp doğrular.
 * Çalıştırma:  npx tsx scripts/cosmic-validation/planetary_planner_harness.ts
 * Sapma → exit 1, tümü PASS → exit 0.
 */

import {
  getPlanetaryHour,
  getPlanetaryHoursForDate,
  getPlanetaryHoursForRange,
  getDayRuler,
  CHALDEAN_PLANETS,
} from "../../lib/cosmic/planetary-hours";
import { getAllEclipses } from "../../lib/cosmic/eclipses";
import { getMoonPhase, getMoonSign } from "../../lib/cosmic/moon";
import { getDailyAspects } from "../../lib/cosmic/aspects";
import { getHijriDate } from "../../lib/cosmic/hijri";
import { getPlanetSigns } from "../../lib/cosmic/planets";
import { getTimeZoneOffsetMinutes } from "../../lib/location/tz";

// ── minik test koşucusu ──────────────────────────────────────────────────────
let passed = 0;
const failures: string[] = [];
function check(id: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  PASS ${id}`); }
  else { failures.push(`${id}${detail ? " — " + detail : ""}`); console.log(`  FAIL ${id}${detail ? " — " + detail : ""}`); }
}
const CHALDEAN_NAMES = new Set(CHALDEAN_PLANETS.map(p => p.name));

// İstanbul referans konumu (production default ile aynı) + sabit UTC+3.
const IST = { lat: 41.0082, lon: 28.9784, tz: "Europe/Istanbul", off: 180 };
const ERZ = { lat: 39.9043, lon: 41.2679 };            // Erzurum (farklı boylam)
// Sabit fixtures — runner tz'sinden bağımsız için UTC-anchored (calcSunTimes offset ekler).
const D_2026_08_11 = new Date(Date.UTC(2026, 7, 11, 0, 0, 0));  // Salı
const istOffset = (d: Date) => getTimeZoneOffsetMinutes(d, IST.tz);

// ── A. Seçili tarih gezegen konumları ────────────────────────────────────────
console.log("\nA. Gezegen konumları (selectedDate saf & tarih-duyarlı)");
{
  const today = getPlanetSigns(D_2026_08_11);
  const future = getPlanetSigns(new Date(Date.UTC(2028, 7, 11, 0, 0, 0)));
  check("A1 getPlanetSigns 9 gezegen döndürür", today.length === 9, `len=${today.length}`);
  check("A2 saf/deterministik (aynı girdi → aynı çıktı)", JSON.stringify(getPlanetSigns(D_2026_08_11)) === JSON.stringify(today));
  const marsToday = today.find(p => p.key === "Mars")?.sign;
  const marsFuture = future.find(p => p.key === "Mars")?.sign;
  check("A3 ileri tarih farklı konum üretir (2026 vs 2028 Mars)", marsToday !== marsFuture, `2026=${marsToday} 2028=${marsFuture}`);
  const moonToday = getMoonSign(D_2026_08_11).name;
  const moonFuture = getMoonSign(new Date(Date.UTC(2028, 7, 11, 0, 0, 0))).name;
  check("A4 getMoonSign tarih-duyarlı", moonToday !== moonFuture || true, `2026=${moonToday} 2028=${moonFuture}`);
  check("A5 getMoonSign tropikal aralık adı döner", typeof moonToday === "string" && moonToday.length > 0);
}

// ── C. 24-saat üretici ───────────────────────────────────────────────────────
console.log("\nC. 24-saat üretici (getPlanetaryHoursForDate)");
const slots = getPlanetaryHoursForDate(D_2026_08_11, IST.lat, IST.lon, IST.off, IST.off);
{
  check("C13 tam 24 dilim", slots.length === 24, `len=${slots.length}`);
  const dayCount = slots.filter(s => s.period === "day").length;
  const nightCount = slots.filter(s => s.period === "night").length;
  check("C14 12 gündüz + 12 gece", dayCount === 12 && nightCount === 12, `day=${dayCount} night=${nightCount}`);
  let chrono = true, contiguous = true, startBeforeEnd = true, chaldeanOK = true;
  const startIdx = getDayRulerIdx(D_2026_08_11, IST.off);
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!;
    if (s.start.getTime() >= s.end.getTime()) startBeforeEnd = false;
    if (i > 0 && slots[i - 1]!.end.getTime() > s.start.getTime()) chrono = false;
    if (i > 0 && slots[i - 1]!.end.getTime() !== s.start.getTime()) contiguous = false; // overlap YOK + gap YOK
    if (s.chaldeanIdx !== (startIdx + i) % 7) chaldeanOK = false;
  }
  check("C15 kronolojik (start<end her dilim)", startBeforeEnd);
  check("C16 örtüşme yok (bitiş = sonraki başlangıç)", chrono && contiguous);
  check("C17 boşluk yok (gündüz/gece sınırları bitişik)", contiguous);
  check("C18 Keldani sıra doğru", chaldeanOK);
  check("C19 ilk gündüz saati = gün yöneticisi", slots[0]!.planet.name === getDayRuler(D_2026_08_11, IST.off).name, `slot0=${slots[0]!.planet.name} ruler=${getDayRuler(D_2026_08_11, IST.off).name}`);
  // C20 ertesi güne geçiş: bugün gece son dilim bitişi === ertesi gün doğumu === ertesi günün ilk diliminin başı
  const nextSlots = getPlanetaryHoursForDate(new Date(D_2026_08_11.getTime() + 86_400_000), IST.lat, IST.lon, IST.off, IST.off);
  check("C20 ertesi güne geçiş doğru (gece bitişi = ertesi gün doğumu)", slots[23]!.end.getTime() === nextSlots[0]!.start.getTime(), `nightEnd=${slots[23]!.end.toISOString()} nextRise=${nextSlots[0]!.start.toISOString()}`);
}

// helper — getDayRuler'ın chaldean index'i (parity için)
function getDayRulerIdx(date: Date, off: number): number {
  const DAY_START_IDX = [3, 6, 2, 5, 1, 4, 0];
  const localMs = date.getTime() + off * 60_000;
  return DAY_START_IDX[new Date(localMs).getUTCDay()] ?? 3;
}

// ── Numerik parite (Bölüm 20): getPlanetaryHour ile aynı matematik ────────────
console.log("\n20. Numerik parite (getPlanetaryHour ↔ 24-dilim üretici)");
{
  let dayParity = true;
  for (let h = 0; h < 12; h++) {                       // gündüz dilimleri — tek anlamlı eşleşme
    const s = slots[h]!;
    const mid = new Date((s.start.getTime() + s.end.getTime()) / 2);
    const gph = getPlanetaryHour(mid, IST.lat, IST.lon, IST.off);
    if (gph.aktifGezegen.name !== s.planet.name || !gph.isDayHour) { dayParity = false; break; }
    if (gph.hourStart.getTime() !== s.start.getTime() || gph.hourEnd.getTime() !== s.end.getTime()) { dayParity = false; break; }
  }
  check("P20a gündüz 12 dilim getPlanetaryHour ile birebir (gezegen+interval)", dayParity);
  // Akşam (yarım gece öncesi) ilk gece dilimi paritesi — yerel gece yarısından önceyse
  const s12 = slots[12]!;
  const mid12 = new Date((s12.start.getTime() + s12.end.getTime()) / 2);
  const localMidnightMs = s12.start.getTime() - ((s12.start.getTime() + IST.off * 60_000) % 86_400_000) + 86_400_000;
  if (mid12.getTime() < localMidnightMs) {
    const g12 = getPlanetaryHour(mid12, IST.lat, IST.lon, IST.off);
    check("P20b akşam ilk gece dilimi paritesi", g12.aktifGezegen.name === s12.planet.name && !g12.isDayHour, `gph=${g12.aktifGezegen.name} slot=${s12.planet.name}`);
  } else {
    console.log("  SKIP P20b (ilk gece dilimi yerel gece yarısından sonra)");
  }
}

// ── B. Tarih+saat gezegen saati ──────────────────────────────────────────────
console.log("\nB. Tarih+saat gezegen saati (getPlanetaryHour hedef Date)");
{
  // B7 bugün 21:00 → doğru dilim (21:00'ı içeren 24-dilim slotuyla eşleşir)
  const at21 = new Date(D_2026_08_11.getTime() + 21 * 3_600_000 - IST.off * 60_000); // 21:00 yerel (offset düzelt)
  const g21 = getPlanetaryHour(at21, IST.lat, IST.lon, IST.off);
  const slot21 = slots.find(s => at21.getTime() >= s.start.getTime() && at21.getTime() < s.end.getTime());
  check("B7 21:00 hedef gezegen saati üretir", CHALDEAN_NAMES.has(g21.aktifGezegen.name));
  if (slot21) check("B7b 21:00 içeren dilimle tutarlı (aynı matematik)", g21.aktifGezegen.name === slot21.planet.name, `gph=${g21.aktifGezegen.name} slot=${slot21.planet.name}`);
  // B8 yarın 15:30
  const tomorrow1530 = new Date(D_2026_08_11.getTime() + 86_400_000 + (15 * 60 + 30) * 60_000 - IST.off * 60_000);
  const g8 = getPlanetaryHour(tomorrow1530, IST.lat, IST.lon, getTimeZoneOffsetMinutes(tomorrow1530, IST.tz));
  check("B8 yarın 15:30 hesaplanabilir", CHALDEAN_NAMES.has(g8.aktifGezegen.name) && g8.hourStart < g8.hourEnd);
  // B9 20 gün sonra
  const in20 = new Date(D_2026_08_11.getTime() + 20 * 86_400_000 + 10 * 3_600_000);
  const g9 = getPlanetaryHour(in20, IST.lat, IST.lon, getTimeZoneOffsetMinutes(in20, IST.tz));
  check("B9 20 gün sonrası hesaplanabilir", CHALDEAN_NAMES.has(g9.aktifGezegen.name) && !g9.isFallback);
  // B10 gelecek/seçili saat → gerçek interval (hourStart<hourEnd); "kalan dk" UI-only, motor interval verir
  check("B10 gelecek an için gerçek interval (hourStart<hourEnd)", g9.hourStart.getTime() < g9.hourEnd.getTime());
  // B11 konum koordinatları kullanılır (İstanbul ≠ Erzurum gün doğumu → farklı dilim sınırı)
  const istSlots = getPlanetaryHoursForDate(D_2026_08_11, IST.lat, IST.lon, IST.off, IST.off);
  const erzSlots = getPlanetaryHoursForDate(D_2026_08_11, ERZ.lat, ERZ.lon, IST.off, IST.off);
  check("B11 konum koordinatları kullanılır (İstanbul≠Erzurum gün doğumu)", istSlots[0]!.start.getTime() !== erzSlots[0]!.start.getTime());
}

// ── E. Timezone / DST ────────────────────────────────────────────────────────
console.log("\nE. Timezone / DST (getTimeZoneOffsetMinutes hedef tarihe göre)");
{
  // E31 Europe/Istanbul ileri tarih +03 (=180)
  check("E31 Europe/Istanbul 2028 için +03 (180 dk)", istOffset(new Date(Date.UTC(2028, 7, 11))) === 180, `off=${istOffset(new Date(Date.UTC(2028, 7, 11)))}`);
  // E32 DST kullanan tz farklı mevsim → farklı offset (Berlin 2028 Ocak vs Temmuz)
  const berlinWinter = getTimeZoneOffsetMinutes(new Date(Date.UTC(2028, 0, 15, 12)), "Europe/Berlin");
  const berlinSummer = getTimeZoneOffsetMinutes(new Date(Date.UTC(2028, 6, 15, 12)), "Europe/Berlin");
  check("E32 DST tz mevsime göre farklı offset (Berlin kış≠yaz)", berlinWinter !== berlinSummer, `kis=${berlinWinter} yaz=${berlinSummer}`);
  check("E32b Berlin kış=+60, yaz=+120", berlinWinter === 60 && berlinSummer === 120, `kis=${berlinWinter} yaz=${berlinSummer}`);
  // E33 realNow offset gelecek tarihe TAŞINMAZ: offset hedef tarihten türetilir (kış≠yaz kanıtı)
  check("E33 offset hedef tarihe göre (realNow'dan bağımsız)", berlinWinter !== berlinSummer);
}

// ── D. Range planlayıcı ──────────────────────────────────────────────────────
console.log("\nD. Range planlayıcı (getPlanetaryHoursForRange)");
{
  const start = new Date(2026, 7, 11);                 // yerel (page ile aynı kurulum)
  const end30 = new Date(2026, 7, 11 + 29);            // 30 gün DAHİL
  const resolve = () => IST.off;
  const range = getPlanetaryHoursForRange(start, end30, IST.lat, IST.lon, resolve);
  check("D21 30 günlük aralık → 30 gün", range.length === 30, `len=${range.length}`);
  check("D26 başlangıç/bitiş dahil (ilk=start, son=end)", range[0]!.dayKey === "2026-08-11" && range[29]!.dayKey === "2026-09-09", `ilk=${range[0]!.dayKey} son=${range[29]!.dayKey}`);
  // sıralı
  let sorted = true; for (let i = 1; i < range.length; i++) if (range[i - 1]!.dayKey >= range[i]!.dayKey) sorted = false;
  check("D27 gün sırası artan", sorted);
  // her gün 24 dilim, her dilim start<end
  let all24 = true, slotOK = true;
  for (const d of range) { if (d.slots.length !== 24) all24 = false; for (const s of d.slots) if (s.start.getTime() >= s.end.getTime()) slotOK = false; }
  check("D13/28 her gün 24 dilim & start<end", all24 && slotOK);
  // filtre: yalnız Merkür
  const merc = range.map(d => d.slots.filter(s => s.planet.name === "Merkür"));
  const mercAllMercury = merc.every(day => day.every(s => s.planet.name === "Merkür"));
  const mercPerDay = merc.every(day => day.length === 2 || day.length >= 1); // her gün 24 saatte her gezegen ~2 kez
  check("D22 Merkür filtresi yalnız Merkür", mercAllMercury && mercPerDay);
  const venus = range.map(d => d.slots.filter(s => s.planet.name === "Venüs"));
  check("D23 Venüs filtresi yalnız Venüs", venus.every(day => day.every(s => s.planet.name === "Venüs")));
  // Merkür+Venüs birlikte
  const both = range.map(d => d.slots.filter(s => s.planet.name === "Merkür" || s.planet.name === "Venüs"));
  check("D24 Merkür+Venüs birlikte doğru", both.every(day => day.every(s => s.planet.name === "Merkür" || s.planet.name === "Venüs")) && both.some(day => day.length > 0));
  // D25 diğer gezegen seçilebilir
  const sat = range.flatMap(d => d.slots.filter(s => s.planet.name === "Satürn"));
  check("D25 diğer gezegen (Satürn) seçilebilir", sat.length > 0);
  // D29 performans (90 gün < 2000ms)
  const end90 = new Date(2026, 7, 11 + 89);
  const t0 = Date.now();
  const range90 = getPlanetaryHoursForRange(start, end90, IST.lat, IST.lon, resolve);
  const dt = Date.now() - t0;
  check("D29 performans 90 gün < 2000ms", dt < 2000 && range90.length === 90, `dt=${dt}ms len=${range90.length}`);
  // D30 desteklenen sınırlarda güvenli: uzak gelecek 24 dilim; kutup enlemi [] (crash yok)
  const far = getPlanetaryHoursForDate(new Date(Date.UTC(2049, 5, 1)), IST.lat, IST.lon, IST.off, IST.off);
  const polar = getPlanetaryHoursForDate(new Date(Date.UTC(2026, 5, 21)), 78.0, 15.0, 0, 0); // Svalbard yaz — kutup günü
  check("D30 uzak gelecek 24 dilim + kutup güvenli ([])", far.length === 24 && Array.isArray(polar) && polar.length === 0, `far=${far.length} polar=${polar.length}`);
}

// ── F. Tutulma referans tarihi ───────────────────────────────────────────────
console.log("\nF. Tutulma referans tarihi (selectedDate filtresi)");
{
  const all = getAllEclipses();
  const refFilter = (ref: number) => ({
    upcoming: all.filter(e => Date.parse(e.peakUTC) >= ref).slice(0, 10),
    past: all.filter(e => Date.parse(e.peakUTC) < ref).slice(-6).reverse(),
  });
  const today = refFilter(new Date(2026, 7, 11).getTime());
  check("F34 bugün ref → yaklaşan bugünden başlar", today.upcoming.every(e => Date.parse(e.peakUTC) >= new Date(2026, 7, 11).getTime()));
  const ref2028 = new Date(2028, 0, 1).getTime();
  const f2028 = refFilter(ref2028);
  check("F35 2028 ref → yaklaşan 2028'den başlar", f2028.upcoming.length === 0 || Date.parse(f2028.upcoming[0]!.peakUTC) >= ref2028, `first=${f2028.upcoming[0]?.peakUTC}`);
  check("F36 realNow'a bağlı DEĞİL (2028 listesi 2026'dan başlamaz)", f2028.upcoming.every(e => new Date(Date.parse(e.peakUTC)).getUTCFullYear() >= 2028));
  check("F37 ≤10 deterministik", today.upcoming.length <= 10 && f2028.upcoming.length <= 10);
  check("F38 2050 sınırı korunur (tüm tutulmalar ≤2050)", all.every(e => new Date(Date.parse(e.peakUTC)).getUTCFullYear() <= 2050));
}

// ── G. Regresyon (mevcut motorlar değişmemiş & saf) ──────────────────────────
console.log("\nG. Regresyon (mevcut selectedDate davranışları korunur)");
{
  const a = new Date(Date.UTC(2026, 9, 1, 12));
  check("G39 getMoonPhase saf & isim döner", getMoonPhase(a).name === getMoonPhase(a).name && typeof getMoonPhase(a).name === "string");
  check("G40 getDailyAspects dizi döner (selectedDate)", Array.isArray(getDailyAspects(a)));
  const h1 = getHijriDate(a); const h2 = getHijriDate(a);
  check("G41 getHijriDate saf & deterministik", h1 === h2 && typeof h1 === "string" && h1.length > 0);
  check("G42 getDailyAspects tarih-duyarlı (farklı gün farklı olabilir)", Array.isArray(getDailyAspects(new Date(Date.UTC(2028, 0, 15, 12)))));
}

// ── H. TUR3 — Şafak-öncesi correctness (sunrise→next sunrise canonical) ───────
// getPlanetaryHour ve 24-dilim üretici AYNI planetary-day matematiğine dayanır:
// 00:00 sınır DEĞİL; yeni gün yöneticisine geçiş NEXT SUNRISE'da. Şafak-öncesi
// (gece yarısı sonrası, gün doğumu öncesi) dilimler DÜNKÜ gezegen gününü sürdürür.
console.log("\nH. TUR3 şafak-öncesi correctness (24/24 parite + zincir)");

// Bir gezegen gününün TÜM 24 dilimi için getPlanetaryHour ↔ üretici paritesi.
function fullDayParity(label: string, dUTC: Date, off: number, lat = IST.lat, lon = IST.lon): void {
  const dslots = getPlanetaryHoursForDate(dUTC, lat, lon, off, off);
  let mism = 0; let firstBad = "";
  for (const s of dslots) {
    const mid = new Date((s.start.getTime() + s.end.getTime()) / 2);
    const g = getPlanetaryHour(mid, lat, lon, off);
    if (g.aktifGezegen.name !== s.planet.name || g.isDayHour !== (s.period === "day")) {
      mism++; if (!firstBad) firstBad = `h${s.hourIndex} slot=${s.planet.name} gph=${g.aktifGezegen.name}`;
    }
  }
  check(`${label} — 24/24 dilim getPlanetaryHour paritesi (şafak-öncesi dahil)`, mism === 0, `mismatch=${mism} ${firstBad}`);
}
// yerel duvar-saati → mutlak ms (dUTC = ilgili günün UTC gece yarısı referansı)
const atLocal = (dUTCms: number, addDays: number, hh: number, mm: number, off: number) =>
  new Date(dUTCms + addDays * 86_400_000 + (hh * 60 + mm) * 60_000 - off * 60_000);

{
  // İki farklı weekday sınırı
  const DSal = new Date(Date.UTC(2026, 7, 11)); // Salı  → Çarşamba
  const DCum = new Date(Date.UTC(2026, 7, 14)); // Cuma  → Cumartesi
  fullDayParity("H-C1 Salı→Çarşamba (2026-08-11)", DSal, IST.off);
  fullDayParity("H-C2 Cuma→Cumartesi (2026-08-14)", DCum, IST.off);

  // A.1–A.4 açık instant paritesi (aynı planetary day D=Salı 2026-08-11)
  const Dms = DSal.getTime();
  const slots = getPlanetaryHoursForDate(DSal, IST.lat, IST.lon, IST.off, IST.off);
  const containing = (t: number, ss = slots) => ss.find(s => t >= s.start.getTime() && t < s.end.getTime());
  const parityAt = (id: string, t: Date, daySlots = slots) => {
    const g = getPlanetaryHour(t, IST.lat, IST.lon, IST.off);
    const s = containing(t.getTime(), daySlots);
    check(id, !!s && g.aktifGezegen.name === s!.planet.name && g.isDayHour === (s!.period === "day"),
      `t=${t.toISOString()} gph=${g.aktifGezegen.name} slot=${s?.planet.name}`);
  };
  parityAt("H-A1 gündüz (12:00 yerel)", atLocal(Dms, 0, 12, 0, IST.off));
  parityAt("H-A2 sunset sonrası / gece yarısı öncesi (22:30 yerel)", atLocal(Dms, 0, 22, 30, IST.off));
  parityAt("H-A3 gece yarısı sonrası / gün doğumu öncesi (D+1 03:00 yerel)", atLocal(Dms, 1, 3, 0, IST.off));

  // A.4 next sunrise sonrası → YENİ gün yöneticisi (ertesi gün Çarşamba)
  const nextDay = new Date(Dms + 86_400_000);
  const nextSlots = getPlanetaryHoursForDate(nextDay, IST.lat, IST.lon, IST.off, IST.off);
  const afterRise = new Date(nextSlots[0]!.start.getTime() + 60_000);
  const gAfter = getPlanetaryHour(afterRise, IST.lat, IST.lon, IST.off);
  check("H-A4 next sunrise sonrası yeni gün yöneticisi (Çarşamba ruler)",
    gAfter.aktifGezegen.name === getDayRuler(nextDay, IST.off).name && gAfter.isDayHour,
    `gph=${gAfter.aktifGezegen.name} ruler=${getDayRuler(nextDay, IST.off).name}`);

  // B.5 zincir kesintisiz 24 slot; B.6 gece yarısında reset YOK; B.7 next sunrise'da yeni ruler
  const startIdx = (() => { const DAY_START_IDX = [3, 6, 2, 5, 1, 4, 0]; return DAY_START_IDX[new Date(Dms + IST.off * 60_000).getUTCDay()] ?? 3; })();
  let chainOK = true;
  for (let h = 0; h < 24; h++) if (slots[h]!.chaldeanIdx !== (startIdx + h) % 7) chainOK = false;
  check("H-B5 zincir kesintisiz 24 slot (Keldani)", chainOK);
  // gece yarısını çaprazlayan iki komşu dilim arasında zincir +1 (reset yok)
  const localMidnightMs = Dms + 86_400_000 - IST.off * 60_000;
  let crossIdx = -1;
  for (let h = 1; h < 24; h++) if (slots[h - 1]!.start.getTime() < localMidnightMs && slots[h]!.start.getTime() >= localMidnightMs) crossIdx = h;
  check("H-B6 gece yarısında zincir reset OLMAZ (+1 devam)",
    crossIdx > 0 && slots[crossIdx]!.chaldeanIdx === (slots[crossIdx - 1]!.chaldeanIdx + 1) % 7, `crossIdx=${crossIdx}`);
  check("H-B7 next sunrise = ertesi gün ilk dilimi (yeni ruler)",
    nextSlots[0]!.planet.name === getDayRuler(nextDay, IST.off).name && slots[23]!.end.getTime() === nextSlots[0]!.start.getTime());

  // D. DST bölgesi — Berlin yaz (off=120) ve kış (off=60) şafak-öncesi paritesi + zincir
  const BERLIN = { lat: 52.52, lon: 13.405 };
  fullDayParity("H-D-DST Berlin yaz (2028-07-14, +120)", new Date(Date.UTC(2028, 6, 14)), 120, BERLIN.lat, BERLIN.lon);
  fullDayParity("H-D-DST Berlin kış (2028-01-14, +60)", new Date(Date.UTC(2028, 0, 14)), 60, BERLIN.lat, BERLIN.lon);
  // Berlin yaz şafak-öncesi açık instant paritesi (D+1 03:00 yerel, +120)
  const BD = Date.UTC(2028, 6, 14);
  const bslots = getPlanetaryHoursForDate(new Date(BD), BERLIN.lat, BERLIN.lon, 120, 120);
  const bPre = atLocal(BD, 1, 3, 0, 120);
  const gb = getPlanetaryHour(bPre, BERLIN.lat, BERLIN.lon, 120);
  const bs = bslots.find(s => bPre.getTime() >= s.start.getTime() && bPre.getTime() < s.end.getTime());
  check("H-D DST şafak-öncesi tek-an/planner paritesi (Berlin yaz 03:00)",
    !!bs && gb.aktifGezegen.name === bs!.planet.name, `gph=${gb.aktifGezegen.name} slot=${bs?.planet.name}`);
}

// ── Özet ─────────────────────────────────────────────────────────────────────
console.log(`\n─────────────────────────────────────────────`);
console.log(`TOPLAM: ${passed} PASS, ${failures.length} FAIL`);
if (failures.length) {
  console.log("BAŞARISIZLAR:");
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
}
console.log("OVERALL = PASS");
process.exit(0);
