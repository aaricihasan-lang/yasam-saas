/**
 * KM-3 — Kozmik Takvim TAM PAKET (altı özellik, Hacamat Takvimi DAHİL) — YEREL motor (lib/cosmic, astronomy-engine),
 * sağlayıcı kredisi 0. Hesap SUNUCUDA yapılır (kota gerçekten sunucuda uygulanır); tarihler açık y/a/g + Türkiye öğlesiyle
 * kurulur, sunucu saat dilimi sonucu etkilemez.
 *
 * Bir "kullanım" = paket oturumu: ilk istek rezervasyon açar; ziyaretçi 2 saat boyunca aynı imzalı belirteçle özellikler ve
 * aylar arasında gezer (belirteç başına hız sınırı). Hacamat: YALNIZ tarafsız takvim bilgisi (Hicri gün + Ay evresi).
 * Hacamat kural metinleri, uygun/yasak gün durumları, sağlık / yarar ifadeleri ve uzman kural kayıtları KULLANILMAZ
 * (lib/cosmic/hacamat.ts ve hacamatDefaultRules.ts bu dosyaya hiç alınmaz). Hukuki inceleme sonrası ayrı yayın kapısı.
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { getMonthPhaseEvents, getMoonPhase, getMoonSign } from "@/lib/cosmic/moon";
import { getRetroPeriodsBetween } from "@/lib/cosmic/retro";
import { getPlanetSigns, getPlanetSignPeriod } from "@/lib/cosmic/planets";
import { getPlanetaryHoursForDate, locationDayAnchor } from "@/lib/cosmic/planetary-hours";
import { hijriFromGregorian } from "@/lib/cosmic/hijri";
import { isMonthSupported, isCalendarDaySupported, SUPPORT_RANGE_LABEL } from "@/lib/cosmic/dateRange";
import { formatInTimeZone, getTimeZoneOffsetMinutes } from "@/lib/location/tz";
import type { ResultBlock } from "../types";
import { daysIn, done, istanbulToday, onlyKeys, parsePlace, type FieldErrors, type Place, type VisitorRunner } from "./shared";

assertServerOnly("lib/campaign/visitor/runners/kozmik");

export const KOZMIK_FEATURES = [
  { id: "moon", name: "Ay Fazları" },
  { id: "retro", name: "Retro Takvimi" },
  { id: "hours", name: "Gezegen Saatleri" },
  { id: "power", name: "Güçlü Günler" },
  { id: "transits", name: "Transitler" },
  { id: "hacamat", name: "Hacamat Takvimi" },
] as const;
type FeatureId = (typeof KOZMIK_FEATURES)[number]["id"];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

type KozmikIn = { feature: FeatureId; year: number; month: number; day: number; place: Place | null };

/** Türkiye takvim günü için öğle anı (UTC+3, yaz saati yok). */
const trNoon = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 9, 0, 0));
const two = (n: number) => String(n).padStart(2, "0");
const trD = (y: number, m: number, d: number) => `${two(d)}.${two(m)}.${y}`;
const keyToTr = (k: string) => k.split("-").reverse().join(".");

function numerologicalDay(y: number, m: number, d: number): number {
  let n = `${d}${m}${y}`.split("").map(Number).reduce((a, b) => a + b, 0);
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) n = String(n).split("").map(Number).reduce((a, b) => a + b, 0);
  return n;
}

/** Güçlü Günler — Kozmik Takvim'in uzman ekranındaki puanlama ile aynı kural (Dolunay 3, Yeni Ay 2, İlk Dördün 1; 11/22/33 → 3, 1/8 → 1). */
export function powerDaysOfMonth(y: number, m: number): { day: number; score: number; reasons: string[] }[] {
  const phase = new Map<number, string>();
  for (const e of getMonthPhaseEvents(y, m - 1)) if (!phase.has(e.day)) phase.set(e.day, e.name);
  const out: { day: number; score: number; reasons: string[] }[] = [];
  for (let d = 1; d <= daysIn(y, m); d++) {
    const reasons: string[] = [];
    let score = 0;
    const p = phase.get(d);
    const mp = p === "Dolunay" ? 3 : p === "Yeni Ay" ? 2 : p === "İlk Dördün" ? 1 : 0;
    if (mp) { score += mp; reasons.push(p!); }
    const num = numerologicalDay(y, m, d);
    const np = num === 11 || num === 22 || num === 33 ? 3 : num === 1 || num === 8 ? 1 : 0;
    if (np) { score += np; reasons.push(`${num} sayısı`); }
    if (score) out.push({ day: d, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score || a.day - b.day);
}

export const kozmikPaket: VisitorRunner<KozmikIn> = {
  key: "kozmik:paket",
  kind: "local",
  formLabel: "Altı özellik tek pakette — kayıt gerekmez",
  fields: [
    { k: "feature", label: "Özellik", type: "select", required: true, options: KOZMIK_FEATURES.map((f) => ({ value: f.id, label: f.name })) },
    { k: "month", label: "Ay", type: "month", hint: "Ay Fazları, Retro, Güçlü Günler ve Hacamat Takvimi için." },
    { k: "date", label: "Tarih", type: "date", hint: "Gezegen Saatleri ve Transitler için." },
    { k: "place", label: "Şehir", type: "location", hint: "Gezegen Saatleri için (boşsa İstanbul)." },
  ],
  parse(input, now) {
    const bad = onlyKeys(input, ["feature", "month", "date", "place"]);
    if (bad) return { ok: false, errors: bad };
    const errors: FieldErrors = {};
    const feature = String(input.feature ?? "") as FeatureId;
    if (!KOZMIK_FEATURES.some((f) => f.id === feature)) errors.feature = "Listeden bir özellik seçin.";
    const today = istanbulToday(now);
    let year = today.year, month = today.month, day = today.day;
    const byMonth = feature === "moon" || feature === "retro" || feature === "power" || feature === "hacamat";
    if (byMonth && input.month) {
      const m = /^(\d{4})-(\d{2})$/.exec(String(input.month));
      if (!m) errors.month = "Ayı seçin.";
      else { year = Number(m[1]); month = Number(m[2]); day = 1; }
      if (m && !isMonthSupported(year, month - 1)) errors.month = `Desteklenen aralık: ${SUPPORT_RANGE_LABEL}.`;
    }
    if (!byMonth && input.date) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input.date));
      if (!m) errors.date = "Tarihi seçin.";
      else { year = Number(m[1]); month = Number(m[2]); day = Number(m[3]); }
      if (m && !isCalendarDaySupported(year, month - 1, day)) errors.date = `Desteklenen aralık: ${SUPPORT_RANGE_LABEL}.`;
    }
    let place: Place | null = null;
    if (feature === "hours" && input.place) place = parsePlace(input, "place", errors);
    return done(errors, { feature, year, month, day, place });
  },
  async run(ctx, v) {
    const blocks: ResultBlock[] = [];
    const label = `${MONTHS[v.month - 1]} ${v.year}`;
    let title: string = KOZMIK_FEATURES.find((f) => f.id === v.feature)!.name;
    const notes: string[] = [];
    let commentsShown = false;
    switch (v.feature) {
      case "moon": {
        const ev = getMonthPhaseEvents(v.year, v.month - 1);
        blocks.push({ type: "table", title: `Ay evreleri — ${label}`, head: ["Tarih", "Evre", "Saat (TSİ)"], rows: ev.map((e) => [trD(v.year, v.month, e.day), e.name, e.timeTR]) });
        const mid = trNoon(v.year, v.month, 15);
        blocks.push({ type: "kv", title: "Ayın ortasında", rows: [["Ay evresi (15.)", getMoonPhase(mid).name], ["Ay burcu (15.)", getMoonSign(mid).name]] });
        break;
      }
      case "retro": {
        const from = `${v.year}-${two(v.month)}-01`, to = `${v.year}-${two(v.month)}-${two(daysIn(v.year, v.month))}`;
        const ps = getRetroPeriodsBetween(from, to);
        blocks.push({ type: "table", title: `Geri hareketler — ${label}`, head: ["Gezegen", "Başlangıç", "Bitiş"], rows: ps.map((p) => [p.planet, keyToTr(p.start), keyToTr(p.end)]) });
        if (!ps.length) notes.push("Bu ayda geri hareket eden gezegen yok.");
        if (ctx.commentsEnabled && ps.length) {
          // Yalnız sabit genel tema metni (kişiye özel değil). Uzman notu (expertNote) ASLA eklenmez.
          blocks.push({ type: "list", title: "Genel temalar", items: [...new Map(ps.map((p) => [p.planet, `${p.planet}: ${p.theme}`])).values()], kind: "yorum" });
          commentsShown = true;
        }
        break;
      }
      case "hours": {
        const place = v.place ?? { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
        const tzOff = (d: Date) => getTimeZoneOffsetMinutes(d, place.timezone);
        const anchor = locationDayAnchor(v.year, v.month - 1, v.day, tzOff);
        const next = locationDayAnchor(v.year, v.month - 1, v.day + 1, tzOff);
        const slots = getPlanetaryHoursForDate(anchor, place.latitude, place.longitude, tzOff(anchor), tzOff(next));
        if (!slots.length) notes.push("Bu konumda bu tarihte gün doğumu / batımı yok (kutup bölgesi); gezegen saati hesaplanamaz.");
        blocks.push({
          type: "table",
          title: `Gezegen saatleri — ${trD(v.year, v.month, v.day)}, ${place.label}`,
          head: ["Saat", "Dönem", "Gezegen", "Başlangıç", "Bitiş"],
          rows: slots.map((s) => [String((s.hourIndex % 12) + 1), s.period === "day" ? "Gündüz" : "Gece", s.planet.name, formatInTimeZone(s.start, place.timezone), formatInTimeZone(s.end, place.timezone)]),
        });
        if (ctx.commentsEnabled) {
          const seen = new Map<string, string>();
          for (const s of slots) if (s.planet.description && !seen.has(s.planet.name)) seen.set(s.planet.name, `${s.planet.name}: ${s.planet.description}`);
          if (seen.size) { blocks.push({ type: "list", title: "Gezegen saatlerinin genel anlamı", items: [...seen.values()], kind: "yorum" }); commentsShown = true; }
        }
        break;
      }
      case "power": {
        const pd = powerDaysOfMonth(v.year, v.month);
        blocks.push({ type: "table", title: `Güçlü günler — ${label}`, head: ["Tarih", "Puan", "Neden"], rows: pd.map((p) => [trD(v.year, v.month, p.day), String(p.score), p.reasons.join(" + ")]) });
        notes.push("Puan: Dolunay 3 · Yeni Ay 2 · İlk Dördün 1 · 11/22/33 günleri 3 · 1 ve 8 günleri 1.");
        break;
      }
      case "transits": {
        const at = trNoon(v.year, v.month, v.day);
        const ps = getPlanetSigns(at);
        blocks.push({
          type: "table",
          title: `Gezegenlerin burçları — ${trD(v.year, v.month, v.day)}`,
          head: ["Gezegen", "Burç", "Bu burçta"],
          rows: ps.map((p) => {
            const per = p.outOfRange ? null : getPlanetSignPeriod(p.key, at);
            return [p.key, p.outOfRange ? "Hesaplanamadı" : p.sign, per ? `${keyToTr(per.from.slice(0, 10))} – ${keyToTr(per.to.slice(0, 10))}` : "—"];
          }),
        });
        blocks.push({ type: "kv", title: "Ay", rows: [["Ay burcu", getMoonSign(at).name], ["Ay evresi", getMoonPhase(at).name]] });
        break;
      }
      case "hacamat": {
        title = "Hacamat Takvimi — tarafsız takvim bilgisi";
        const rows: string[][] = [];
        for (let d = 1; d <= daysIn(v.year, v.month); d++) {
          const h = hijriFromGregorian(v.year, v.month, d);
          rows.push([trD(v.year, v.month, d), h ? h.formatted : "—", getMoonPhase(trNoon(v.year, v.month, d)).name]);
        }
        blocks.push({ type: "table", title: `Hicri takvim ve Ay evresi — ${label}`, head: ["Miladi", "Hicri", "Ay evresi"], rows });
        notes.push("Takvim bilgisi amaçlıdır; tıbbi tavsiye, tedavi veya sağlık iddiası içermez. Uygulama kararı için sağlık profesyoneline danışın.");
        notes.push("Hicri tarih Ümmü'l-Kurâ tablosundan hesaplanır; yerel ilan ile bir gün fark edebilir.");
        break;
      }
    }
    if (!ctx.commentsEnabled && (v.feature === "retro" || v.feature === "hours")) notes.push("Genel rehber metinleri bu kampanyada kapalı.");
    return { ok: true, result: { title, subtitle: "Kozmik Takvim · ücretsiz paket", blocks, notes, commentsShown } };
  },
};
