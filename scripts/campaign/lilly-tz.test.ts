/**
 * LILLY-TZ-01 — Kampanya William Lilly (horary) ekran saatleri IANA 2026f.
 *
 * Kusur: lib/campaign/visitor/runners/lilly.ts `fmtUtc` → `toLocaleString(... timeZone)` çalışma ortamının Intl verisini
 * (Node 24.15 = tz 2026a) kullanıyordu → Havana / Winnipeg / Vancouver / Edmonton / Casablanca'da "Ay'ın burç
 * değiştirmesi" ve olay tablosu saatleri 1 saat kayık; Word raporu (formatZoned) doğru → ekran ↔ rapor tutarsız.
 * Hesap (soru UTC'si, gezegen saati) zaten doğruydu ve DEĞİŞMEZ.
 *
 * Beklenen değerler BAĞIMSIZ: scripts/location/fixtures/iana-2026f-kozmik.json (IANA 2026f kaynak metni → tzcomp.py).
 * Ürünün gerçek parse + run yolları; Word raporu .docx'in kendi metninden okunur.
 *
 *   npx tsx --tsconfig scripts/campaign/tsconfig.json scripts/campaign/lilly-tz.test.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import JSZip from "jszip";
import { atlasLilly } from "@/lib/campaign/visitor/runners/lilly";
import { searchGlobalLocations } from "@/lib/location/server/search";

type Ref = { zones: Record<string, [number, number][]> };
const REF: Ref = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "location", "fixtures", "iana-2026f-kozmik.json"), "utf8"));
const offSec = (z: string, utcSec: number) => { const r = REF.zones[z]; let o = r[0][1]; for (const [t, v] of r) if (t <= utcSec) o = v; return o; };
const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const p2 = (n: number) => String(n).padStart(2, "0");
/** "2 Aralık 16:03" — ürünün biçimi (gün sayısal, ay uzun, ss:dd); ofset referanstan. */
function refShow(z: string, iso: string): string {
  const s = Math.floor(Date.parse(iso) / 1000), d = new Date((s + offSec(z, s)) * 1000);
  return `${d.getUTCDate()} ${AY[d.getUTCMonth()]} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

let pass = 0, fail = 0;
function check(cond: boolean, label: string, detail = ""): void {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}
const NOW = new Date(Date.UTC(2026, 10, 19, 9));
type Block = { type: string; title?: string; rows?: string[][] };
type Out = { ok: boolean; message?: string; result?: { blocks: Block[]; reports: { kind: string; base64: string }[] } };

async function docxText(b64: string): Promise<string> {
  const zip = await JSZip.loadAsync(Buffer.from(b64, "base64"));
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml.replace(/<w:tab\/>/g, " ").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
}

async function main() {
  const gid = (q: string, cc: string) => searchGlobalLocations(q, { countryCode: cc, limit: 5 })[0]?.id;
  const PLACES: [string, string][] = [
    ["America/Havana", gid("Havana", "CU")!], ["America/Winnipeg", gid("Winnipeg", "CA")!], ["Africa/Casablanca", gid("Casablanca", "MA")!],
    ["America/Vancouver", gid("Vancouver", "CA")!], ["America/Edmonton", gid("Edmonton", "CA")!], ["Europe/Istanbul", "tr-34-istanbul"],
    ["Europe/Berlin", gid("Berlin", "DE")!], ["Europe/London", gid("London", "GB")!],
  ];
  // Ay sonu, yıl sonu, DST/geçiş yakını (Winnipeg/Havana/Vancouver 01.11 eski ICU geçişi; Berlin/Londra 25.10; Casablanca Ramazan)
  const MOMENTS = [["2026-11-30", "21:40"], ["2026-12-31", "22:15"], ["2026-10-31", "20:00"], ["2026-10-24", "23:30"], ["2027-02-06", "18:00"], ["2026-12-01", "10:00"]];
  let screenRows = 0, istanbulSame = 0;
  for (const [z, place] of PLACES) {
    check(!!place, `yer kimliği ${z}`);
    for (const [qDate, qTime] of MOMENTS) {
      const parsed = atlasLilly.parse({ qDate, qTime, place, house: "7" } as never, NOW) as { ok: boolean; value?: unknown; errors?: unknown };
      if (!parsed.ok) { check(false, `parse ${z} ${qDate} ${qTime}`, JSON.stringify(parsed.errors)); continue; }
      const out = (await atlasLilly.run({ now: NOW } as never, parsed.value as never)) as Out;
      const tag = `${z} ${qDate} ${qTime}`;
      if (!out.ok || !out.result) { check(false, `run ${tag}`, out.message ?? ""); continue; }
      const kv = (title: string) => out.result!.blocks.find((b) => b.title === title)?.rows ?? [];
      // 1–3) soru anı: girilen yerel tarih/saat ve bölge aynen; hesap UTC'si referansla aynı
      const q = kv("Soru anı");
      check(q.some((r) => r[0] === "Yerel tarih / saat" && r[1] === `${qDate} ${qTime}`) && q.some((r) => r[1] === z), `soru anı yerel aynen ${tag}`, JSON.stringify(q));
      // 5) Ay burç değiştirmesi; 6) olay tablosu — referansla aynı yerel gün + saat
      const ing = kv("Ay, radikallik ve gezegen saati").find((r) => r[0] === "Ay'ın burç değiştirmesi")?.[1];
      const ev = out.result.blocks.find((b) => b.type === "table" && /olaylar/.test(b.title ?? ""))?.rows ?? [];
      // Beklenen için olayların UTC'si: ürün sonucu ekranda yalnız yerel gösterim verir → aynı girdiyle motoru doğrudan çalıştır
      const { runWesternHorary } = await import("@/lib/astrology/horary/westernRun");
      const v = parsed.value as { date: string; time: string; place: { label: string; timezone: string; latitude: number; longitude: number }; house: number };
      const raw = runWesternHorary({ date: v.date, time: v.time, place: v.place, quesitedHouse: v.house });
      if (!raw.ok) { check(false, `motor ${tag}`); continue; }
      const R = raw.result as unknown as { question: { utc: string }; chart: { moon: { ingressUtc: string | null } }; timeline: { atUtc: string }[] };
      const naive = Date.UTC(+qDate.slice(0, 4), +qDate.slice(5, 7) - 1, +qDate.slice(8, 10), +qTime.slice(0, 2), +qTime.slice(3, 5)) / 1000;
      const wantUtc = (naive - offSec(z, naive - offSec(z, naive))) * 1000;
      check(Date.parse(R.question.utc) === wantUtc, `hesap UTC ${tag}`, `${R.question.utc} ≠ ${new Date(wantUtc).toISOString()}`);
      check(ing === (R.chart.moon.ingressUtc ? refShow(z, R.chart.moon.ingressUtc) : "—"), `Ay burç değişimi ekranı ${tag}`, `${ing} ≠ ${R.chart.moon.ingressUtc && refShow(z, R.chart.moon.ingressUtc)}`);
      const wantEv = R.timeline.slice(0, 15).map((e) => refShow(z, e.atUtc));
      check(ev.length === wantEv.length && ev.every((r, i) => r[0] === wantEv[i]), `olay tablosu saatleri ${tag}`, `${ev.map((r) => r[0]).slice(0, 2)} ≠ ${wantEv.slice(0, 2)}`);
      screenRows += ev.length + 1;
      // 7) İstanbul: çalışma ortamı Intl (İstanbul için doğru) ile bayt bayt aynı
      if (z === "Europe/Istanbul") {
        const intl = (iso: string) => new Date(iso).toLocaleString("tr-TR", { timeZone: z, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
        const same = ev.every((r, i) => r[0] === intl(R.timeline[i].atUtc)) && (!R.chart.moon.ingressUtc || ing === intl(R.chart.moon.ingressUtc));
        check(same, `İstanbul çıktısı eski biçimle bayt bayt aynı ${tag}`);
        if (same) istanbulSame++;
      }
      // 4) Word raporu: ekrandaki her yerel saat (ss:dd) rapor metninde de var (ekran = rapor)
      if (qDate === "2026-12-01" || qDate === "2026-10-24") {
        const docx = out.result.reports.find((f) => f.kind === "docx");
        if (!docx) { check(false, `Word raporu üretildi ${tag}`); continue; }
        const txt = await docxText(docx.base64);
        const times = [ing, ...ev.map((r) => r[0])].filter((s): s is string => !!s && s !== "—").map((s) => s.split(" ").pop()!);
        const missing = times.filter((t) => !txt.includes(t));
        check(missing.length === 0, `Word raporu ekranla aynı saatler ${tag}`, `eksik ${missing.join(",")}`);
      }
    }
  }
  // 8) Yaşanmamış / iki kez yaşanmış soru saati kesin sonuç olarak gösterilmez (motor ret — değişmedi)
  const hv = PLACES[0][1];
  const gap = atlasLilly.parse({ qDate: "2026-03-08", qTime: "00:30", place: hv, house: "7" } as never, NOW) as { ok: boolean; value?: unknown };
  const g = gap.ok ? ((await atlasLilly.run({ now: NOW } as never, gap.value as never)) as Out) : null;
  check(!!g && g.ok === false, "Havana 08.03.2026 00:30 (yaşanmadı) → ret, sonuç yok", JSON.stringify(g).slice(0, 120));
  const ny = searchGlobalLocations("New York", { countryCode: "US", limit: 1 })[0]?.id;
  const ov = atlasLilly.parse({ qDate: "2026-11-01", qTime: "01:30", place: ny, house: "7" } as never, NOW) as { ok: boolean; value?: unknown };
  const o = ov.ok ? ((await atlasLilly.run({ now: NOW } as never, ov.value as never)) as Out) : null;
  check(!!o && o.ok === false, "New York 01.11.2026 01:30 (iki kez yaşandı) → ret, sonuç yok", JSON.stringify(o).slice(0, 120));

  console.log(`  · ekran satırı denetlendi: ${screenRows}; İstanbul bayt bayt aynı: ${istanbulSame}`);
  console.log(`\nlilly-tz (LILLY-TZ-01): ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); console.log(`lilly-tz (LILLY-TZ-01): ${pass} PASS / ${fail + 1} FAIL`); process.exit(1); });
