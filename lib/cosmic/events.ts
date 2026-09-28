/**
 * lib/cosmic/events.ts
 * Yaklaşan kozmik olaylar: Yeni Ay, Dolunay, retro başlangıç/bitiş, dış gezegen burç değişimi.
 *
 * Veri kaynakları:
 *   - Yeni Ay / Dolunay → astronomy-engine SearchMoonPhase (kesin saat, UTC+3), fallback: getMoonPhase taraması
 *   - Retrogradlar      → retro.ts getRetroPeriodsBetween (8 gezegen; start/end string tarihler)
 *   - Burç değişimi     → astronomy-engine ingress taraması (dateRange INTERNAL penceresi 2024…2101);
 *                          eski hardcoded 2025-2030 listesi kaldırıldı (AE-hesaplı, deterministik)
 */

import * as AE from "astronomy-engine";
import { getMoonPhase } from "./moon";
import { getRetroPeriodsBetween } from "./retro";
import { refineIngressMs } from "./ingressCatalog";
import { INTERNAL_START_YEAR, INTERNAL_END_YEAR_EXCLUSIVE, SUPPORT_END_KEY, isValidDate } from "./dateRange";

// Türkiye UTC+3 sabit offset (yaz saati 2016'dan beri yok)
const TR_OFFSET_MS = 3 * 3_600_000;

// ─── Tip tanımları ────────────────────────────────────────────────────────────

export type CosmicEventType =
  | "new_moon"
  | "full_moon"
  | "retro_start"
  | "retro_end"
  | "sign_change";

export type CosmicEvent = {
  date:        string;            // YYYY-MM-DD — Türkiye takvim günü
  title:       string;
  description: string;
  type:        CosmicEventType;
  symbol:      string;
  planet?:     string;            // Türkçe gezegen adı
  time?:       string;            // "HH:MM" — Türkiye saati (UTC+3), sadece Yeni Ay / Dolunay
  timeUTC?:    string;            // ISO UTC timestamp, sadece Yeni Ay / Dolunay
};

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function localIso(d: Date): string {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}

// ─── 1. Ay Fazı Olayları ──────────────────────────────────────────────────────

/**
 * Yeni Ay ve Dolunay olaylarını astronomy-engine SearchMoonPhase ile üretir.
 * date: Türkiye takvim günü (UTC+3), time: "HH:MM" TR saati.
 * Hata durumunda _getMoonEventsLegacy'ye düşer.
 */
function getMoonEvents(from: Date, daysAhead = 180): CosmicEvent[] {
  try {
    return _getMoonEventsAE(from, daysAhead);
  } catch {
    return _getMoonEventsLegacy(from, daysAhead);
  }
}

function _getMoonEventsAE(from: Date, daysAhead: number): CosmicEvent[] {
  const events: CosmicEvent[] = [];
  const endMs   = from.getTime() + daysAhead * 86_400_000;
  const SYNODIC = 29.53059;

  // Yeni Ay olayları
  let cursor = new Date(from);
  while (cursor.getTime() < endMs) {
    const nm = AE.SearchMoonPhase(0, cursor, SYNODIC + 2);
    if (!nm || nm.date.getTime() >= endMs) break;
    const trDate = new Date(nm.date.getTime() + TR_OFFSET_MS);
    events.push({
      date:        trDate.toISOString().slice(0, 10),
      title:       "Yeni Ay",
      description: "Ay döngüsünün başlangıcı; niyet, tohumlama ve yeni başlangıçlar için güçlü enerji.",
      type:        "new_moon",
      symbol:      "🌑",
      time:        trDate.toISOString().slice(11, 16),
      timeUTC:     nm.date.toISOString(),
    });
    cursor = new Date(nm.date.getTime() + 86_400_000);
  }

  // Dolunay olayları
  cursor = new Date(from);
  while (cursor.getTime() < endMs) {
    const fm = AE.SearchMoonPhase(180, cursor, SYNODIC + 2);
    if (!fm || fm.date.getTime() >= endMs) break;
    const trDate = new Date(fm.date.getTime() + TR_OFFSET_MS);
    events.push({
      date:        trDate.toISOString().slice(0, 10),
      title:       "Dolunay",
      description: "Tamamlanma, berraklık ve serbest bırakma enerjisinin doruk noktası.",
      type:        "full_moon",
      symbol:      "🌕",
      time:        trDate.toISOString().slice(11, 16),
      timeUTC:     fm.date.toISOString(),
    });
    cursor = new Date(fm.date.getTime() + 86_400_000);
  }

  return events;
}

/** Fallback: gün bazlı getMoonPhase taraması — AE başarısız olursa */
function _getMoonEventsLegacy(from: Date, daysAhead: number): CosmicEvent[] {
  const events: CosmicEvent[] = [];
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  for (let i = 1; i <= daysAhead; i++) {
    const today = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 12);
    const prev  = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i - 1, 12);
    const tp = getMoonPhase(today);
    const pp = getMoonPhase(prev);

    if (tp.name === "Yeni Ay" && pp.name !== "Yeni Ay") {
      events.push({
        date:        localIso(today),
        title:       "Yeni Ay",
        description: "Ay döngüsünün başlangıcı; niyet, tohumlama ve yeni başlangıçlar için güçlü enerji.",
        type:        "new_moon",
        symbol:      "🌑",
      });
    }
    if (tp.name === "Dolunay" && pp.name !== "Dolunay") {
      events.push({
        date:        localIso(today),
        title:       "Dolunay",
        description: "Tamamlanma, berraklık ve serbest bırakma enerjisinin doruk noktası.",
        type:        "full_moon",
        symbol:      "🌕",
      });
    }
  }
  return events;
}

// ─── 2. Retro Başlangıç / Bitiş Olayları ──────────────────────────────────────

function getRetroEvents(fromKey: string, toKey: string): CosmicEvent[] {
  const events: CosmicEvent[] = [];
  for (const r of getRetroPeriodsBetween(fromKey, toKey)) {
    events.push({
      date:        r.start,
      title:       `${r.planet} Retrosu Başlıyor`,
      description: r.theme,
      type:        "retro_start",
      symbol:      r.symbol,
      planet:      r.planet,
    });
    events.push({
      date:        r.end,
      title:       `${r.planet} Retrosu Bitiyor`,
      description: `${r.planet} tekrar ileriye doğru hareket ediyor; ${r.theme.charAt(0).toLowerCase() + r.theme.slice(1)} konuları netleşiyor.`,
      type:        "retro_end",
      symbol:      r.symbol,
      planet:      r.planet,
    });
  }
  return events;
}

// ─── 3. Dış Gezegen Burç Değişim Olayları ─────────────────────────────────────

// Hardcoded tarih listesi KALDIRILDI. Tarihler astronomy-engine ingress hesabından
// üretilir (ekliptik boylamın 30° burç sınırını geçişi). Retro nedeniyle aynı sınır
// birden çok kez geçilebilir (giriş → retro dönüş → kalıcı giriş); hepsi yakalanır.
// Editöryel başlık/açıklama SC_OVERRIDE ile BİREBİR korunur; haritada olmayan
// (gelecek) geçişler için gezegene özgü şablon kullanılır. Türkiye saati (UTC+3).

const SC_SIGN_NAMES = ["Koç","Boğa","İkizler","Yengeç","Aslan","Başak","Terazi","Akrep","Yay","Oğlak","Kova","Balık"] as const;
const SC_DATIVE   = ["Koç'a","Boğa'ya","İkizler'e","Yengeç'e","Aslan'a","Başak'a","Terazi'ye","Akrep'e","Yay'a","Oğlak'a","Kova'ya","Balık'a"] as const;
const SC_LOCATIVE = ["Koç'ta","Boğa'da","İkizler'de","Yengeç'te","Aslan'da","Başak'ta","Terazi'de","Akrep'te","Yay'da","Oğlak'ta","Kova'da","Balık'ta"] as const;

type SCPlanet = "Jüpiter" | "Satürn" | "Uranüs" | "Neptün" | "Plüton";
type SCKind   = "enter" | "return" | "settle";

// Dış gezegenler (mevcut özellik kapsamı — hızlı gezegenler kasıtlı hariç).
const SC_BODY: Record<SCPlanet, { body: AE.Body; symbol: string }> = {
  "Jüpiter": { body: AE.Body.Jupiter, symbol: "♃" },
  "Satürn":  { body: AE.Body.Saturn,  symbol: "♄" },
  "Uranüs":  { body: AE.Body.Uranus,  symbol: "♅" },
  "Neptün":  { body: AE.Body.Neptune, symbol: "♆" },
  "Plüton":  { body: AE.Body.Pluto,   symbol: "♇" },
};
// Haritada olmayan (gelecek) geçişler için kısa, gezegene özgü şablon teması.
const SC_FALLBACK_THEME: Record<SCPlanet, string> = {
  "Jüpiter": "büyüme, fırsat ve genişleme temaları öne çıkıyor",
  "Satürn":  "sorumluluk, yapı ve disiplin teması gündeme geliyor",
  "Uranüs":  "ani değişim, özgürleşme ve yenilik dalgası başlıyor",
  "Neptün":  "sezgi, hayal gücü ve ruhsal derinlik teması güçleniyor",
  "Plüton":  "derin dönüşüm ve güç temaları aktifleşiyor",
};
// Mevcut editöryel kayıtlar — başlık+açıklama BİREBİR korunur. Anahtar: "Gezegen:burçIndex:kind"
const SC_OVERRIDE: Record<string, { title: string; description: string }> = {
  "Jüpiter:3:enter":  { title: "Jüpiter Yengeç'e Giriyor", description: "Jüpiter Yengeç burcuna geçiyor; aile, duygusal büyüme ve ev konuları genişliyor." },
  "Jüpiter:4:enter":  { title: "Jüpiter Aslan'a Giriyor", description: "Jüpiter Aslan burcuna geçiyor; yaratıcılık, liderlik ve öz ifade için büyüme dönemi." },
  "Jüpiter:5:enter":  { title: "Jüpiter Başak'a Giriyor", description: "Jüpiter Başak burcuna geçiyor; ustalık, sağlık ve hizmet alanlarında genişleme." },
  "Jüpiter:6:enter":  { title: "Jüpiter Terazi'ye Giriyor", description: "Jüpiter Terazi burcuna geçiyor; ortaklıklar, adalet ve denge üzerinde büyüme." },
  "Jüpiter:7:enter":  { title: "Jüpiter Akrep'e Giriyor", description: "Jüpiter Akrep burcuna geçiyor; derin araştırma ve dönüşümde büyüme dönemi." },
  "Jüpiter:8:enter":  { title: "Jüpiter Yay'a Giriyor", description: "Jüpiter kendi burcuna dönüyor; vizyon, bilgelik ve özgürlük için güçlü dönem." },
  "Satürn:0:enter":   { title: "Satürn Koç'a Giriyor", description: "Satürn Koç burcuna geçiyor; cesaret ve sorumluluk sınavı başlıyor." },
  "Satürn:11:return": { title: "Satürn Balık'a Dönüyor", description: "Satürn retro ile Balık'a geri dönüyor; manevi sorumluluklar tekrar gündeme geliyor." },
  "Satürn:0:settle":  { title: "Satürn Koç'ta Kalıcılaşıyor", description: "Satürn Koç burcuna kalıcı olarak yerleşiyor; disiplin ve cesaret dönemi netleşiyor." },
  "Satürn:1:enter":   { title: "Satürn Boğa'ya Giriyor", description: "Satürn Boğa burcuna geçiyor; maddi güvenlik ve kalıcı değer inşası test ediliyor." },
  "Uranüs:2:enter":   { title: "Uranüs İkizler'e Giriyor", description: "Uranüs İkizler burcuna geçiyor; iletişim ve teknoloji alanında büyük değişimler başlıyor." },
  "Uranüs:1:return":  { title: "Uranüs Boğa'ya Dönüyor", description: "Uranüs retro ile Boğa'ya geri dönüyor; finansal devrim sürecine son bakış." },
  "Uranüs:2:settle":  { title: "Uranüs İkizler'de Kalıcılaşıyor", description: "Uranüs İkizler burcuna kalıcı olarak yerleşiyor; iletişim ve teknoloji devrimi hızlanıyor." },
  "Neptün:0:enter":   { title: "Neptün Koç'a Giriyor", description: "Neptün Koç burcuna geçiyor; spiritüel güç ve öncülük dönemi başlıyor." },
  "Neptün:11:return": { title: "Neptün Balık'a Dönüyor", description: "Neptün retro ile Balık'a geri dönüyor; manevi derinlik ve empati dönemine son bakış." },
  "Neptün:0:settle":  { title: "Neptün Koç'ta Kalıcılaşıyor", description: "Neptün Koç burcuna kalıcı olarak yerleşiyor; ruhsal güç ve kolektif cesaret dönemi." },
  "Plüton:10:settle": { title: "Plüton Kova'da Kalıcılaştı", description: "Plüton Kova burcuna kalıcı olarak yerleşti; teknoloji ve insanlığın kolektif dönüşümü başladı." },
};

// Sabit, deterministik INTERNAL pencere (SSR↔client) — TEK KAYNAK dateRange (public aralık +
// tampon). Public filtre getUpcomingCosmicEvents'te uygulanır (31.12.2100 sonrası gösterilmez).
const SC_STEP_MS   = 2 * 86_400_000;
// PERFORMANS (doğruluğu DEĞİŞTİRMEZ): ingress taraması 2 yıllık BLOKLAR hâlinde, yalnız istenen
// tarih çevresinde ve bir kez (memo) yapılır. Izgara INTERNAL başlangıca GLOBAL hizalıdır → sonuç
// hangi bloğun önce istendiğinden bağımsızdır (SSR↔client deterministik).
const SC_EPOCH_MS  = Date.UTC(INTERNAL_START_YEAR, 0, 1);
const SC_END_MS    = Date.UTC(INTERNAL_END_YEAR_EXCLUSIVE, 0, 1);
const SC_BLOCK_STEPS = 365;                       // 365 × 2 gün = 730 gün
const SC_BLOCK_MS  = SC_BLOCK_STEPS * SC_STEP_MS;
const SC_BLOCK_COUNT = Math.ceil((SC_END_MS - SC_EPOCH_MS) / SC_BLOCK_MS);
const scBlockOf = (ms: number) => Math.max(0, Math.min(SC_BLOCK_COUNT - 1, Math.floor((ms - SC_EPOCH_MS) / SC_BLOCK_MS)));

function scLon(body: AE.Body, ms: number): number {
  return AE.Ecliptic(AE.GeoVector(body, new Date(ms), true)).elon;
}
function scSign(lon: number): number {
  return Math.floor((((lon % 360) + 360) % 360) / 30);
}
type SCIngress = { ms: number; toSign: number; dir: 1 | -1; kind: SCKind };

const scRawCache = new Map<string, SCIngress[]>();
/** b. bloktaki ham 30° burç sınırı geçişleri (retro dönüşleri dahil; kind henüz atanmamış). */
function scRawBlock(planet: SCPlanet, b: number): SCIngress[] {
  const key = `${planet}|${b}`;
  const hit = scRawCache.get(key);
  if (hit) return hit;
  const body = SC_BODY[planet].body;
  const out: SCIngress[] = [];
  let prevS = scSign(scLon(body, SC_EPOCH_MS + b * SC_BLOCK_MS));
  for (let k = b * SC_BLOCK_STEPS; k < (b + 1) * SC_BLOCK_STEPS; k++) {
    const t = SC_EPOCH_MS + k * SC_STEP_MS, nt = t + SC_STEP_MS;
    const s = scSign(scLon(body, nt));
    if (s !== prevS) {
      let lo = t, hi = nt;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (scSign(scLon(body, mid)) === prevS) lo = mid; else hi = mid;
      }
      const toSign = scSign(scLon(body, hi));
      const dir: 1 | -1 = ((toSign - prevS + 12) % 12 === 1) ? 1 : -1;
      // G5: gece yarısı sınırındaki yavaş-gezegen geçişleri doğrulanmış katalogla düzeltilir.
      out.push({ ms: refineIngressMs(planet, toSign, hi), toSign, dir, kind: "enter" });
      prevS = toSign;
    }
  }
  scRawCache.set(key, out);
  return out;
}

/** b. bloktaki geçişler, kind atanmış (önceki geçiş gerekirse önceki bloklardan alınır). */
function scBlock(planet: SCPlanet, b: number): SCIngress[] {
  const raw = scRawBlock(planet, b).map(e => ({ ...e }));
  // Önceki geçiş: aynı blokta yoksa geriye doğru ilk dolu blok (retro dönüş→kalıcılaşma ≤ ~1 yıl).
  let prevEv: SCIngress | undefined;
  for (let pb = b - 1; pb >= 0 && !prevEv; pb--) { const r = scRawBlock(planet, pb); prevEv = r[r.length - 1]; }
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i]!;
    const prev = i > 0 ? raw[i - 1] : prevEv;
    if (e.dir === -1) { e.kind = "return"; continue; }
    // kind: retro=dönüş; prograd ve önceki geçiş bu burçtan retro çıkışsa=kalıcılaşma; aksi=giriş
    e.kind = (prev && prev.dir === -1 && prev.toSign === (e.toSign + 11) % 12) ? "settle" : "enter";
  }
  return raw;
}
function scTitle(planet: SCPlanet, sign: number, kind: SCKind): string {
  if (kind === "return") return `${planet} ${SC_DATIVE[sign]} Dönüyor`;
  if (kind === "settle") return `${planet} ${SC_LOCATIVE[sign]} Kalıcılaşıyor`;
  return `${planet} ${SC_DATIVE[sign]} Giriyor`;
}
function scTrDate(ms: number): string {
  const d = new Date(ms + TR_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** [fromMs, toMs] aralığındaki dış gezegen burç geçişleri — AE ingress (blok memo). */
export function getSignChangeEventsBetween(fromMs: number, toMs: number): CosmicEvent[] {
  const events: CosmicEvent[] = [];
  const b0 = scBlockOf(fromMs), b1 = scBlockOf(toMs);
  for (const planet of Object.keys(SC_BODY) as SCPlanet[]) {
    const { symbol } = SC_BODY[planet];
    for (let b = b0; b <= b1; b++) {
      for (const ing of scBlock(planet, b)) {
        if (ing.ms < fromMs || ing.ms > toMs) continue;
        const ov = SC_OVERRIDE[`${planet}:${ing.toSign}:${ing.kind}`];
        events.push({
          date:        scTrDate(ing.ms),
          title:       ov?.title ?? scTitle(planet, ing.toSign, ing.kind),
          description: ov?.description ?? `${planet}, ${SC_SIGN_NAMES[ing.toSign]} burcuna geçiyor; ${SC_FALLBACK_THEME[planet]}.`,
          type:        "sign_change",
          symbol,
          planet,
        });
      }
    }
  }
  return events;
}

// ─── Ana Fonksiyon ─────────────────────────────────────────────────────────────

/** Yaklaşan olay ufku (gün) — Yeni Ay/Dolunay, retro ve burç geçişleri AYNI ufukla toplanır. */
export const UPCOMING_EVENTS_HORIZON_DAYS = 180;

/**
 * Bugünden itibaren yaklaşan kozmik olayları döner (ufuk: 180 gün; public aralıkla sınırlı).
 * @param from   Başlangıç tarihi (dahil)
 * @param count  Maksimum olay sayısı (varsayılan 10)
 */
export function getUpcomingCosmicEvents(from: Date, count = 10): CosmicEvent[] {
  if (!isValidDate(from)) return [];
  const fromIso = localIso(from);
  const horizonEnd = new Date(from.getFullYear(), from.getMonth(), from.getDate() + UPCOMING_EVENTS_HORIZON_DAYS);
  const toIso = localIso(horizonEnd);

  const moonEvts  = getMoonEvents(from, UPCOMING_EVENTS_HORIZON_DAYS);
  const retroEvts = getRetroEvents(fromIso, toIso);
  let signEvts: CosmicEvent[] = [];
  try {
    signEvts = getSignChangeEventsBetween(from.getTime() - 86_400_000, horizonEnd.getTime() + 86_400_000);
  } catch {
    signEvts = [];
  }

  return [...moonEvts, ...retroEvts, ...signEvts]
    .filter(e => e.date >= fromIso && e.date <= toIso && e.date <= SUPPORT_END_KEY)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, count);
}
