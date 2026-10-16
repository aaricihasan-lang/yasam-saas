/**
 * ASTROLOJİ — TARİHSEL SAAT DİLİMİ TEST MATRİSİ: gerçek Roxy çağrıları (owner talimatı 2026-10-14; bütçe ≤ 300).
 *
 * Her vaka ÜRÜNÜN KENDİ yolundan geçer: parseBirthData (profil kaydı) → resolveAstroLocation (sunucu konum veri seti)
 * → resolveAstroBirthTime (IANA tarihsel ofset, DST seçimi) → buildNatalRequestBody (sayısal ofset). Sonra:
 *   1) natal-chart ÜRÜN gövdesiyle (timezone = sayısal tarihsel ofset)          → "num"
 *   2) aynı gövde, timezone = IANA adı (Roxy kendi tarihsel çözümünü yapar)      → "iana" (bağımsız tz uygulaması)
 *   3) seçili vakalarda fixed-stars (ürün gövdesi, orb=3)                        → "fs"  (dönemler arası presesyon)
 * Sentetik vakalar (gerçek kişi DEĞİL). Fixture varsa çağrı YAPILMAZ. Yeniden deneme KAPALI. Anahtar kaydedilmez.
 * Defter: fixtures/golden/roxy-call-ledger-2026-10-14.jsonl
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/tzmatrix-calls.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { parseBirthData } from "@/lib/astrology/birth/profileInput";
import { resolveAstroLocation } from "@/lib/astrology/birth/location";
import { buildNatalRequestBody } from "@/lib/astrology/providers/roxy/natal";
import { fixedStarsBody, type BirthPoint } from "@/lib/astrology/providers/roxy/requests";
import { ledger } from "./fixedstars-golden-calls";

export const TZ_DIR = join(__dirname, "..", "fixtures", "tzmatrix");

export type TzCase = {
  id: string;
  group: "TR" | "EU" | "AM" | "AS" | "AF";
  date: string;
  time: string;
  locationId: string;
  dst?: "auto" | "earlier" | "later";
  /** Beklenen tarihsel UTC ofseti (saat) — tzdata kaynak kurallarından ELLE yazıldı (bağımsız beklenti). */
  expectOffset: number;
  note: string;
  fixedStars?: boolean;
  /** Ürün bu girdiyi REDDETMELİ (hiç yaşanmamış saat) → çağrı yapılmaz. */
  expectReject?: "BIRTH_TIME_NONEXISTENT" | "BIRTH_TIME_AMBIGUOUS";
};

export const TZ_CASES: TzCase[] = [
  // ── Türkiye ──
  { id: "tr-1979-istanbul", group: "TR", date: "1979-02-12", time: "06:30", locationId: "tr-34-istanbul", expectOffset: 3, note: "Roxy yazışma örneği; 1978–83 yıl boyu +3", fixedStars: false },
  { id: "tr-1983-ankara-plus4", group: "TR", date: "1983-08-15", time: "10:00", locationId: "tr-06-ankara", expectOffset: 4, note: "1983 yazı +4 (tzdata Turkey)" },
  { id: "tr-1985-izmir-winter", group: "TR", date: "1985-01-15", time: "09:00", locationId: "tr-35-izmir", expectOffset: 2, note: "1985 kışı +2" },
  { id: "tr-1995-izmir-after-gap", group: "TR", date: "1995-03-26", time: "02:30", locationId: "tr-35-izmir", expectOffset: 3, note: "yaz saati geçiş günü, geçişten hemen sonra" },
  { id: "tr-1995-izmir-gap", group: "TR", date: "1995-03-26", time: "01:30", locationId: "tr-35-izmir", expectOffset: 0, note: "ileri alınan saat: hiç yaşanmamış yerel saat", expectReject: "BIRTH_TIME_NONEXISTENT" },
  { id: "tr-1995-istanbul-ambig-auto", group: "TR", date: "1995-09-24", time: "01:30", locationId: "tr-34-istanbul", expectOffset: 0, note: "geri alınan saat: iki kez yaşanan saat (seçim istenmeli)", expectReject: "BIRTH_TIME_AMBIGUOUS" },
  { id: "tr-1995-istanbul-ambig-earlier", group: "TR", date: "1995-09-24", time: "01:30", locationId: "tr-34-istanbul", dst: "earlier", expectOffset: 3, note: "iki kez yaşanan saat — ilk (yaz saati)" },
  { id: "tr-1995-istanbul-ambig-later", group: "TR", date: "1995-09-24", time: "01:30", locationId: "tr-34-istanbul", dst: "later", expectOffset: 2, note: "iki kez yaşanan saat — ikinci (kış saati)" },
  { id: "tr-2016-diyarbakir-permanent", group: "TR", date: "2016-11-20", time: "07:15", locationId: "tr-21-diyarbakir", expectOffset: 3, note: "2016-09-07 sonrası kalıcı +3 (eski kural kışta +2 derdi)" },
  { id: "tr-2007-van-midnight", group: "TR", date: "2007-07-01", time: "23:50", locationId: "tr-65-van", expectOffset: 3, note: "gece yarısına yakın (yaz)" },
  { id: "tr-1962-trabzon", group: "TR", date: "1962-05-01", time: "05:00", locationId: "tr-61-trabzon", expectOffset: 2, note: "1962 (yaz saati yok)" },
  { id: "tr-1940-erzurum", group: "TR", date: "1940-07-15", time: "14:00", locationId: "tr-25-erzurum", expectOffset: 3, note: "1940 yaz saati" },
  { id: "tr-1905-istanbul-imt", group: "TR", date: "1905-06-01", time: "12:00", locationId: "tr-34-istanbul", expectOffset: 7016 / 3600, note: "İstanbul Ortalama Zamanı (IMT +1:56:56)", fixedStars: true },
  { id: "tr-2023-edirne-dayline", group: "TR", date: "2023-06-15", time: "00:20", locationId: "tr-22-edirne", expectOffset: 3, note: "yerel gün başı → UTC bir önceki gün", fixedStars: true },
  // ── Avrupa ──
  { id: "eu-1971-london-bst", group: "EU", date: "1971-01-15", time: "12:00", locationId: "gb-london", expectOffset: 1, note: "British Standard Time: 1968–71 kışın da +1" },
  { id: "eu-2015-london-dayline", group: "EU", date: "2015-06-01", time: "00:30", locationId: "gb-london", expectOffset: 1, note: "BST, UTC bir önceki gün" },
  { id: "eu-1945-berlin-midsummer", group: "EU", date: "1945-07-01", time: "12:00", locationId: "de-berlin", expectOffset: 3, note: "Berlin 1945 'çift yaz saati' +3", fixedStars: true },
  { id: "eu-1975-paris", group: "EU", date: "1975-07-01", time: "12:00", locationId: "fr-paris", expectOffset: 1, note: "Fransa 1975 yaz saati yok" },
  { id: "eu-1750-paris-lmt", group: "EU", date: "1750-03-21", time: "12:00", locationId: "fr-paris", expectOffset: 561 / 3600, note: "Paris yerel ortalama zamanı (LMT +0:09:21); presesyon ~3 yüzyıl", fixedStars: true },
  { id: "eu-1960-reykjavik", group: "EU", date: "1960-06-01", time: "12:00", locationId: "gn-3413829", expectOffset: 0, note: "İzlanda 1960 yaz saati (−1 → 0)" },
  { id: "eu-2012-moscow-plus4", group: "EU", date: "2012-01-15", time: "12:00", locationId: "ru-moscow", expectOffset: 4, note: "Moskova 2011–14 kalıcı +4" },
  // ── Amerika ──
  { id: "am-1974-newyork-energy", group: "AM", date: "1974-01-15", time: "12:00", locationId: "us-ny-new-york", expectOffset: -4, note: "1974 enerji krizi: Ocak'ta yaz saati (−4)" },
  { id: "am-2005-indianapolis", group: "AM", date: "2005-07-01", time: "12:00", locationId: "gn-4259418", expectOffset: -5, note: "Indiana 2006 öncesi yaz saati yok" },
  { id: "am-1990-phoenix", group: "AM", date: "1990-07-01", time: "12:00", locationId: "gn-5308655", expectOffset: -7, note: "Arizona yaz saati yok" },
  { id: "am-2000-la-after-gap", group: "AM", date: "2000-04-02", time: "03:30", locationId: "us-ca-los-angeles", expectOffset: -7, note: "geçiş günü, geçişten sonra" },
  { id: "am-2017-saopaulo", group: "AM", date: "2017-12-01", time: "12:00", locationId: "br-sao-paulo", expectOffset: -2, note: "güney yarıküre yaz saati" },
  { id: "am-1985-stjohns-half", group: "AM", date: "1985-07-01", time: "12:00", locationId: "gn-6324733", expectOffset: -2.5, note: "yarım saatlik ofset (NDT −2:30)" },
  { id: "am-2008-caracas-half", group: "AM", date: "2008-01-15", time: "12:00", locationId: "gn-3646738", expectOffset: -4.5, note: "Venezuela 2007–2016 −4:30" },
  // ── Asya / Pasifik ──
  { id: "as-1985-delhi-half", group: "AS", date: "1985-06-01", time: "12:00", locationId: "gn-1273294", expectOffset: 5.5, note: "Hindistan +5:30" },
  { id: "as-1984-kathmandu-half", group: "AS", date: "1984-06-01", time: "12:00", locationId: "gn-1283240", expectOffset: 5.5, note: "Nepal 1986 öncesi +5:30" },
  { id: "as-1990-kathmandu-quarter", group: "AS", date: "1990-06-01", time: "12:00", locationId: "gn-1283240", expectOffset: 5.75, note: "çeyrek saatlik ofset +5:45" },
  { id: "as-1988-shanghai-dst", group: "AS", date: "1988-07-01", time: "12:00", locationId: "cn-shanghai", expectOffset: 9, note: "Çin 1986–91 yaz saati" },
  { id: "as-2000-sydney", group: "AS", date: "2000-01-15", time: "12:00", locationId: "au-sydney", expectOffset: 11, note: "güney yarıküre yaz saati" },
  { id: "as-2001-auckland-dayline", group: "AS", date: "2001-03-18", time: "00:15", locationId: "nz-auckland", expectOffset: 13, note: "+13, UTC bir önceki gün" },
  { id: "as-2011-apia-before", group: "AS", date: "2011-12-29", time: "12:00", locationId: "gn-4035413", expectOffset: -10, note: "Samoa tarih çizgisi değişiminden önce (−10, yaz saati)" },
  { id: "as-2011-apia-after", group: "AS", date: "2011-12-31", time: "12:00", locationId: "gn-4035413", expectOffset: 14, note: "30 Aralık atlandı; +14" },
  { id: "as-2008-tehran-dst", group: "AS", date: "2008-07-01", time: "12:00", locationId: "gn-112931", expectOffset: 4.5, note: "İran yaz saati +4:30" },
  { id: "as-1995-kabul-half", group: "AS", date: "1995-06-01", time: "12:00", locationId: "gn-1138958", expectOffset: 4.5, note: "Afganistan +4:30" },
  { id: "af-1965-monrovia-lmt", group: "AF", date: "1965-06-01", time: "12:00", locationId: "gn-2274895", expectOffset: -2670 / 3600, note: "Liberya 1972'ye kadar yerel ortalama zaman −0:44:30 (20. yüzyıl LMT; yaşayan danışan olabilir)" },
  { id: "as-1990-honolulu", group: "AS", date: "1990-07-15", time: "12:00", locationId: "gn-5856195", expectOffset: -10, note: "Hawaii (yaz saati yok)" },
];

export function productBirth(c: TzCase): { ok: true; birth: BirthPoint; tz: string; utcIso: string; locLabel: string } | { ok: false; code: string } {
  const r = parseBirthData({ birthDate: c.date, birthTime: c.time, timeKnown: true, timeAccuracy: "exact_record", locationId: c.locationId, dstChoice: c.dst ?? "auto" }, resolveAstroLocation);
  if (!r.ok) return { ok: false, code: r.err.code };
  const v = r.value;
  return {
    ok: true,
    birth: { birthDate: v.birthDate, birthTime: v.birthTime, utcOffsetSeconds: v.utcOffsetSeconds, latitude: v.location.latitude, longitude: v.location.longitude },
    tz: v.location.timezone,
    utcIso: v.birthUtcIso,
    locLabel: v.location.label,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(TZ_DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  const onlyPlan = process.argv.includes("--plan");
  let made = 0;
  for (const c of TZ_CASES) {
    const pb = productBirth(c);
    if (!pb.ok) {
      console.log(`${c.id}: ürün REDDETTİ (${pb.code}) — çağrı yok`);
      continue;
    }
    const body = buildNatalRequestBody(pb.birth, { houseSystem: "placidus", nodeType: "true" });
    const jobs: { kind: string; endpoint: string; body: Record<string, unknown>; query?: Record<string, string> }[] = [
      { kind: "num", endpoint: "/astrology/natal-chart", body },
      { kind: "iana", endpoint: "/astrology/natal-chart", body: { ...body, timezone: pb.tz } },
    ];
    // 2026-10-14 LMT dengelemesi: eski (dengeleme öncesi) "num" fixture'ı güncel ürün gövdesinden farklıysa, dengelenmiş
    // ürün gövdesi "lmt" olarak AYRICA çağrılır (eski yanıt bilinen sağlayıcı kısıtının kanıtı olarak korunur).
    const numPath = join(TZ_DIR, `${c.id}.num.json`);
    if (existsSync(numPath)) {
      const old = JSON.parse(readFileSync(numPath, "utf8")).body;
      if (JSON.stringify(old) !== JSON.stringify(body)) jobs.push({ kind: "lmt", endpoint: "/astrology/natal-chart", body });
    }
    if (c.fixedStars) jobs.push({ kind: "fs", endpoint: "/astrology/fixed-stars", body: fixedStarsBody(pb.birth, "true"), query: { orb: "3" } });
    for (const j of jobs) {
      const out = join(TZ_DIR, `${c.id}.${j.kind}.json`);
      if (existsSync(out)) continue;
      if (onlyPlan) {
        console.log(`PLAN ${c.id}.${j.kind} tz=${String(j.body.timezone)}`);
        continue;
      }
      if (!cfg) {
        console.log("ROXY_API_KEY yok — çağrı yapılmadı");
        process.exit(2);
      }
      const r = await callRoxy(cfg, j.endpoint, j.body, { maxRetries: 0, query: j.query });
      made += r.attempts;
      ledger({ purpose: `tzmatrix ${c.id}.${j.kind}`, endpoint: j.endpoint, query: j.query ?? null, attempts: r.attempts, ok: r.ok, status: r.ok ? 200 : (r.status ?? null) });
      if (!r.ok) {
        console.log(`${c.id}.${j.kind}: BAŞARISIZ kind=${r.kind} status=${r.status ?? "-"}`);
        await sleep(1500);
        continue;
      }
      if (JSON.stringify(r.raw).includes(cfg.apiKey)) {
        console.log(`${c.id}.${j.kind}: anahtar metni — KAYDEDİLMEDİ`);
        continue;
      }
      writeFileSync(out, JSON.stringify({ case: c, product: { tz: pb.tz, utcIso: pb.utcIso, locLabel: pb.locLabel }, endpoint: j.endpoint, query: j.query ?? null, body: j.body, response: r.raw }, null, 1) + "\n");
      console.log(`${c.id}.${j.kind}: OK`);
      await sleep(700);
    }
  }
  console.log(`bu çalıştırmada gerçek Roxy istek sayısı: ${made}`);
}

if (require.main === module) {
  void main().catch((e) => {
    console.error("tzmatrix hata:", (e as Error).message);
    process.exit(1);
  });
}
