/**
 * lib/cosmic/events.ts
 * Yaklaşan kozmik olaylar: Yeni Ay, Dolunay, retro başlangıç/bitiş, dış gezegen burç değişimi.
 *
 * Veri kaynakları:
 *   - Ay fazları  → moon.ts getMoonPhase() ile tarama (180 gün ileri)
 *   - Retrogradlar → retro.ts RETRO_PERIODS (start/end string tarihler)
 *   - Burç değişimi → planets.ts dönemi tablolarıyla uyumlu hardcoded liste (2025-2030)
 */

import { getMoonPhase }      from "./moon";
import { RETRO_PERIODS }     from "./retro";

// ─── Tip tanımları ────────────────────────────────────────────────────────────

export type CosmicEventType =
  | "new_moon"
  | "full_moon"
  | "retro_start"
  | "retro_end"
  | "sign_change";

export type CosmicEvent = {
  date:        string;            // YYYY-MM-DD
  title:       string;
  description: string;
  type:        CosmicEventType;
  symbol:      string;
  planet?:     string;            // Türkçe gezegen adı
};

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function localIso(d: Date): string {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}

// ─── 1. Ay Fazı Olayları ──────────────────────────────────────────────────────
// Sadece Yeni Ay ve Dolunay geçiş günleri.

function getMoonEvents(from: Date, daysAhead = 180): CosmicEvent[] {
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
// retro.ts RETRO_PERIODS string tarihlerini doğrudan kullanır.

function getRetroEvents(): CosmicEvent[] {
  const events: CosmicEvent[] = [];
  for (const r of RETRO_PERIODS) {
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
// Sadece Jüpiter, Satürn, Uranüs, Neptün, Plüton.
// planets.ts dönemi tablosuyla uyumlu, 2024-2030.

const SIGN_CHANGE_EVENTS: ReadonlyArray<CosmicEvent> = [

  // ── Jüpiter ♃ ──
  { date: "2025-06-09", symbol: "♃", planet: "Jüpiter", type: "sign_change",
    title: "Jüpiter Yengeç'e Giriyor",
    description: "Jüpiter Yengeç burcuna geçiyor; aile, duygusal büyüme ve ev konuları genişliyor." },
  { date: "2026-07-01", symbol: "♃", planet: "Jüpiter", type: "sign_change",
    title: "Jüpiter Aslan'a Giriyor",
    description: "Jüpiter Aslan burcuna geçiyor; yaratıcılık, liderlik ve öz ifade için büyüme dönemi." },
  { date: "2027-07-26", symbol: "♃", planet: "Jüpiter", type: "sign_change",
    title: "Jüpiter Başak'a Giriyor",
    description: "Jüpiter Başak burcuna geçiyor; ustalık, sağlık ve hizmet alanlarında genişleme." },
  { date: "2028-09-28", symbol: "♃", planet: "Jüpiter", type: "sign_change",
    title: "Jüpiter Terazi'ye Giriyor",
    description: "Jüpiter Terazi burcuna geçiyor; ortaklıklar, adalet ve denge üzerinde büyüme." },
  { date: "2029-11-11", symbol: "♃", planet: "Jüpiter", type: "sign_change",
    title: "Jüpiter Akrep'e Giriyor",
    description: "Jüpiter Akrep burcuna geçiyor; derin araştırma ve dönüşümde büyüme dönemi." },
  { date: "2030-12-25", symbol: "♃", planet: "Jüpiter", type: "sign_change",
    title: "Jüpiter Yay'a Giriyor",
    description: "Jüpiter kendi burcuna dönüyor; vizyon, bilgelik ve özgürlük için güçlü dönem." },

  // ── Satürn ♄ ──
  { date: "2025-05-24", symbol: "♄", planet: "Satürn", type: "sign_change",
    title: "Satürn Koç'a Giriyor",
    description: "Satürn Koç burcuna geçiyor; cesaret ve sorumluluk sınavı başlıyor." },
  { date: "2025-08-11", symbol: "♄", planet: "Satürn", type: "sign_change",
    title: "Satürn Balık'a Dönüyor",
    description: "Satürn retro ile Balık'a geri dönüyor; manevi sorumluluklar tekrar gündeme geliyor." },
  { date: "2026-01-06", symbol: "♄", planet: "Satürn", type: "sign_change",
    title: "Satürn Koç'ta Kalıcılaşıyor",
    description: "Satürn Koç burcuna kalıcı olarak yerleşiyor; disiplin ve cesaret dönemi netleşiyor." },
  { date: "2028-04-13", symbol: "♄", planet: "Satürn", type: "sign_change",
    title: "Satürn Boğa'ya Giriyor",
    description: "Satürn Boğa burcuna geçiyor; maddi güvenlik ve kalıcı değer inşası test ediliyor." },
  { date: "2028-09-11", symbol: "♄", planet: "Satürn", type: "sign_change",
    title: "Satürn Koç'a Dönüyor",
    description: "Satürn retro ile Koç'a geri dönüyor; liderlik ve cesaret testleri devam ediyor." },
  { date: "2029-01-08", symbol: "♄", planet: "Satürn", type: "sign_change",
    title: "Satürn Boğa'da Kalıcılaşıyor",
    description: "Satürn Boğa burcuna kalıcı olarak yerleşiyor; finansal disiplin ve güvenlik dönemi." },

  // ── Uranüs ♅ ──
  { date: "2025-07-07", symbol: "♅", planet: "Uranüs", type: "sign_change",
    title: "Uranüs İkizler'e Giriyor",
    description: "Uranüs İkizler burcuna geçiyor; iletişim ve teknoloji alanında büyük değişimler başlıyor." },
  { date: "2025-11-07", symbol: "♅", planet: "Uranüs", type: "sign_change",
    title: "Uranüs Boğa'ya Dönüyor",
    description: "Uranüs retro ile Boğa'ya geri dönüyor; finansal devrim sürecine son bakış." },
  { date: "2026-04-25", symbol: "♅", planet: "Uranüs", type: "sign_change",
    title: "Uranüs İkizler'de Kalıcılaşıyor",
    description: "Uranüs İkizler burcuna kalıcı olarak yerleşiyor; iletişim ve teknoloji devrimi hızlanıyor." },

  // ── Neptün ♆ ──
  { date: "2025-03-30", symbol: "♆", planet: "Neptün", type: "sign_change",
    title: "Neptün Koç'a Giriyor",
    description: "Neptün Koç burcuna geçiyor; spiritüel güç ve öncülük dönemi başlıyor." },
  { date: "2025-10-22", symbol: "♆", planet: "Neptün", type: "sign_change",
    title: "Neptün Balık'a Dönüyor",
    description: "Neptün retro ile Balık'a geri dönüyor; manevi derinlik ve empati dönemine son bakış." },
  { date: "2026-02-22", symbol: "♆", planet: "Neptün", type: "sign_change",
    title: "Neptün Koç'ta Kalıcılaşıyor",
    description: "Neptün Koç burcuna kalıcı olarak yerleşiyor; ruhsal güç ve kolektif cesaret dönemi." },

  // ── Plüton ♇ ──
  { date: "2024-11-19", symbol: "♇", planet: "Plüton", type: "sign_change",
    title: "Plüton Kova'da Kalıcılaştı",
    description: "Plüton Kova burcuna kalıcı olarak yerleşti; teknoloji ve insanlığın kolektif dönüşümü başladı." },
];

// ─── Ana Fonksiyon ─────────────────────────────────────────────────────────────

/**
 * Bugünden itibaren yaklaşan kozmik olayları döner.
 * @param from   Başlangıç tarihi (dahil)
 * @param count  Maksimum olay sayısı (varsayılan 10)
 */
export function getUpcomingCosmicEvents(from: Date, count = 10): CosmicEvent[] {
  const fromIso = localIso(from);

  const moonEvts  = getMoonEvents(from, 180);
  const retroEvts = getRetroEvents();
  const signEvts  = Array.from(SIGN_CHANGE_EVENTS);

  return [...moonEvts, ...retroEvts, ...signEvts]
    .filter(e => e.date >= fromIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, count);
}
