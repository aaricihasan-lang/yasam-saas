/**
 * HD Hazır Eğitim Haritaları — özel içe aktarım üreticisinin HUKUK SINIFLANDIRMASI testi (SENTETİK veri; gerçek kişi YOK).
 * Repo DIŞINDA (işletim sistemi geçici klasörü altında, her koşuda YENİ benzersiz klasör) 43 sentetik kayıt + FAZ 2-A
 * biçiminde hukuk uzlaştırma tablosu üretir ve build-private-import.ts'i alt süreçte çalıştırır. Dosya silinmez.
 * Doğrulananlar: ham matris 10/17/9/7 korunur; güncel matris uzlaştırmadan YENİDEN hesaplanır (8/17/11/7);
 * E 18 / LOW_UNREVIEWED 25 (21 + 4) / LOW_REVIEWED 0; uzlaştırma E'yi gevşetemez; bilinmeyen statü, eksik kişi,
 * repo içi çıktı ve var olan çıktı reddedilir.
 * Çalıştır: npx tsx scripts/hd-education/import-builder-harness.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 800)}` : ""}`); }
}

const ROOT = process.cwd();
const DIR = path.join(os.tmpdir(), `hd-edu-builder-harness-${Date.now()}-${randomUUID().slice(0, 8)}`);
if (existsSync(DIR)) throw new Error("benzersiz klasör zaten var");
mkdirSync(DIR);

type Cell = { utc: "DOĞRULANDI" | "HESAPLANDI-TEYİT BEKLİYOR"; csv: "E" | "DÜŞÜK RİSK"; matris: string };
const CELLS: Array<[number, Cell]> = [
  [10, { utc: "DOĞRULANDI", csv: "DÜŞÜK RİSK", matris: "UTC doğrulandı + hukuk düşük" }],
  [17, { utc: "HESAPLANDI-TEYİT BEKLİYOR", csv: "DÜŞÜK RİSK", matris: "UTC belirsiz + hukuk düşük" }],
  [9, { utc: "DOĞRULANDI", csv: "E", matris: "UTC doğrulandı + hukuk E" }],
  [7, { utc: "HESAPLANDI-TEYİT BEKLİYOR", csv: "E", matris: "UTC belirsiz + hukuk E" }],
];

function synthetic() {
  const rows: Array<Record<string, unknown>> = [];
  let i = 0;
  for (const [n, c] of CELLS) {
    for (let k = 0; k < n; k++, i++) {
      const y = 1800 + i;
      rows.push({
        no: `ZZ-${i + 1}`, ad: `ZZ Sentetik Kişi ${i + 1}`, _ad_kisa: `ZZ Kişi ${i + 1}`, _slug: `zz-sentetik-kisi-${i + 1}-${y}-01-01`, _uuid: randomUUID(),
        alan: "bilim", yasiyor: "hayır", dogum_tarihi: `${y}-01-01`, dogum_yeri: "ZZ Şehir", belgedeki_yerel_saat: "10:00",
        saat_kaynagi_alinti: "ZZ sentetik ifade", saat_kaynagi_url: "https://example.test/zz", saat_kaynagi_saat_acik: "EVET",
        utc_durumu: c.utc, nihai_utc: `${y}-01-01T09:00:00Z`, hukuk_statusu: c.csv, _matris: c.matris, veri_statusu: "A",
        _engeller: c.utc === "DOĞRULANDI" ? [] : ["UTC-TEYİT: sentetik"],
      });
    }
  }
  return rows;
}

/** FAZ 2-A biçiminde tablo: indeks 0-1 (VERIFIED+düşük) uzlaştırmayla E; 2-5 L1 teyitli düşük; diğer düşükler avukatsız. */
function legalMd(rows: Array<Record<string, unknown>>, override: (i: number, v: string) => string = (_, v) => v, drop?: number) {
  const lines = ["# ZZ sentetik hukuk", "", "## 3. tablo", "", "| Kişi | Yaşıyor | CSV hukuk | L1 risk | Geçerli hukuk | UTC | Varsayılan yayın engelleri | Not |", "|---|---|---|---|---|---|---|---|"];
  rows.forEach((r, i) => {
    if (i === drop) return;
    const v = r.hukuk_statusu === "E" ? "E" : i < 2 ? "E" : i < 6 ? "DÜŞÜK (L1 teyitli)" : "DÜŞÜK (avukat teyidi yok)";
    lines.push(`| ${r._ad_kisa} | hayır | ${r.hukuk_statusu} | - | ${override(i, v)} | ${r.utc_durumu} | - | ZZ |`);
  });
  lines.push("", "**Dağılım:** sentetik");
  return lines.join("\n");
}

function run(tag: string, rows: Array<Record<string, unknown>>, md: string, outOverride?: string) {
  const d = path.join(DIR, tag);
  mkdirSync(d);
  const input = path.join(d, "envanter.json");
  const legal = path.join(d, "hukuk.md");
  writeFileSync(input, JSON.stringify(rows), { flag: "wx" });
  writeFileSync(legal, md, { flag: "wx" });
  const out = outOverride ?? path.join(d, "import.sql");
  const r = spawnSync(process.execPath, [path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/hd-education/build-private-import.ts", "--input", input, "--legal", legal, "--out", out], { cwd: ROOT, encoding: "utf8" });
  return { code: r.status, out, stdout: r.stdout, stderr: r.stderr };
}

const rows = synthetic();
console.log(`[geçerli uzlaştırma] klasör: ${DIR}`);
{
  const r = run("gecerli", rows, legalMd(rows));
  ok(r.code === 0, "geçerli girdi kabul edildi", r.stderr);
  const oz = JSON.parse(readFileSync(`${r.out}.ozet.json`, "utf8")) as Record<string, Record<string, number> | number | string[]>;
  ok(JSON.stringify(oz.ham_arastirma_matrisi) === JSON.stringify({ "UTC doğrulandı + hukuk düşük": 10, "UTC belirsiz + hukuk düşük": 17, "UTC doğrulandı + hukuk E": 9, "UTC belirsiz + hukuk E": 7 }), "ham araştırma matrisi 10/17/9/7 değişmeden raporlandı", oz.ham_arastirma_matrisi);
  const g = oz.guncel_matris as Record<string, number>;
  ok(g["UTC doğrulandı + hukuk düşük"] === 8 && g["UTC belirsiz + hukuk düşük"] === 17 && g["UTC doğrulandı + hukuk E"] === 11 && g["UTC belirsiz + hukuk E"] === 7, "güncel matris uzlaştırmadan yeniden hesaplandı: 8/17/11/7", g);
  ok(JSON.stringify(oz.guncel_hukuk) === JSON.stringify({ E: 18, LOW_UNREVIEWED: 25, LOW_REVIEWED: 0 }), "hukuk: E 18 / LOW_UNREVIEWED 25 / LOW_REVIEWED 0", oz.guncel_hukuk);
  ok(JSON.stringify(oz.low_unreviewed_ayrimi) === JSON.stringify({ avukat_teyidi_yok: 21, arastirma_raporu_dusuk_risk_avukat_onayi_degil: 4 }), "25 = 21 avukat teyidi yok + 4 araştırma raporu (avukat onayı DEĞİL)", oz.low_unreviewed_ayrimi);
  ok((oz.uzlastirmayla_E_olan as string[]).length === 2 && oz.yayinlanabilir === 0, "uzlaştırmayla E'ye çıkan 2 kişi; yayınlanabilir 0");
  const sql = readFileSync(r.out, "utf8");
  ok(!/'LOW_REVIEWED'/.test(sql), "SQL'de hiçbir kişi LOW_REVIEWED (avukat onaylı) yazılmadı");
  ok((sql.match(/\[Araştırma raporu \(L1\): düşük risk — AVUKAT ONAYI DEĞİL\]/g) ?? []).length === 4, "4 araştırma-raporu kişisi hukuk notunda 'avukat onayı DEĞİL' işaretli");
  ok((sql.match(/\[FAZ 2-A hukuk uzlaştırması/g) ?? []).length === 2, "2 uzlaştırma kişisi hukuk notunda işaretli");
  ok(!/INSERT INTO public\.hd_education_publications \(subject_id, status/.test(sql), "yayın satırları yalnız varsayılan draft ile eklenir");
  const again = run("ayni-cikti", rows, legalMd(rows), r.out);
  ok(again.code === 1 && /üzerine YAZILMAZ/.test(again.stderr), "var olan çıktının üzerine yazılmaz", again.stderr);
}
{
  const r = run("gevsetme", rows, legalMd(rows, (i, v) => (rows[i].hukuk_statusu === "E" && i === 30 ? "DÜŞÜK (avukat teyidi yok)" : v)));
  ok(r.code === 1 && /gevşetiyor/.test(r.stderr), "uzlaştırma E'yi DÜŞÜK'e çeviremez (içe aktarım durur)", r.stderr);
}
{
  const r = run("bilinmeyen", rows, legalMd(rows, (i, v) => (i === 7 ? "DÜŞÜK (avukat onaylı)" : v)));
  ok(r.code === 1 && /bilinmeyen geçerli hukuk/.test(r.stderr), "bilinmeyen hukuk statüsü (ör. 'avukat onaylı') reddedilir", r.stderr);
}
{
  const r = run("eksik", rows, legalMd(rows, undefined, 12));
  ok(r.code === 1 && /hukuk tablosu 42 satır/.test(r.stderr), "hukuk tablosunda eksik kişi reddedilir", r.stderr);
}
{
  const r = run("repo-ici", rows, legalMd(rows), path.join(ROOT, "zz-import-harness.sql"));
  ok(r.code === 1 && /repo DIŞINA/.test(r.stderr) && !existsSync(path.join(ROOT, "zz-import-harness.sql")), "repo içine çıktı reddedilir", r.stderr);
}

console.log(`\nhd-education import-builder harness: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
