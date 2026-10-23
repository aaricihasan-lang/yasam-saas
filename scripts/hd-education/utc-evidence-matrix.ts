/**
 * HD Hazır Eğitim Haritaları — UTC KANIT MATRİSİ (FAZ 2-B2). Gerçek kişi verisi okur → çıktı YALNIZ repo DIŞINA.
 * Her kayıt için eğitim UTC katmanını (lib/human-design/education/educationUtc.ts) çalıştırır:
 *   belgedeki yerel saat + kayıtlı ofset → bağımsız UTC ↔ kayıtlı nihai UTC; modern IANA farkı (bilgi).
 * VERIFIED statüsünü DEĞİŞTİRMEZ; yalnız kanıtın kendi içinde tutarlı olup olmadığını raporlar.
 * Ağ / DB / sağlayıcı çağrısı YOK.
 *
 * Kullanım: npx tsx scripts/hd-education/utc-evidence-matrix.ts --input <repo-dışı>/_43_envanter.json --out <repo-dışı>/utc-matris.md
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseUtcOffsetText, resolveEducationBirthUtc } from "../../lib/human-design/education/educationUtc";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
function die(m: string): never { console.error(`DUR: ${m}`); process.exit(1); }
function insideGitTree(p: string): boolean {
  const abs = path.resolve(p);
  const rel = path.relative(REPO_ROOT, abs);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) return true;
  for (let dir = path.dirname(abs); ; ) {
    if (existsSync(path.join(dir, ".git"))) return true;
    const up = path.dirname(dir);
    if (up === dir) return false;
    dir = up;
  }
}
const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const leadingUtc = (v: unknown) => /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z)/.exec(s(v))?.[1] ?? null;

const input = arg("--input");
const out = arg("--out");
if (!input || !out) die("--input ve --out zorunlu");
if (insideGitTree(input) || insideGitTree(out)) die("girdi/çıktı git çalışma ağacının içinde — gerçek kişi verisi repo dışında kalmalı");
if (existsSync(out)) die(`çıktı var, üzerine yazılmaz: ${out}`);

const data = JSON.parse(readFileSync(input, "utf8")) as Array<Record<string, unknown>>;
type Row = { slug: string; status: string; local: string; offset: string; utc: string; result: string; iana: string };
const rows: Row[] = [];
const tally: Record<string, number> = {};
for (const r of data) {
  const verified = s(r.utc_durumu) === "DOĞRULANDI";
  const lat = Number(s(r.enlem)); const lon = Number(s(r.boylam));
  // VERIFIED dışı kayıtlar da yalnız "kanıt kendi içinde tutarlı mı" sorusu için VERIFIED varsayımıyla denetlenir (statü değişmez).
  const res = resolveEducationBirthUtc({
    birthDate: s(r.dogum_tarihi), documentedLocalTime: s(r.belgedeki_yerel_saat), timeStandard: s(r.fiili_saat_standardi) || null,
    utcOffsetSeconds: parseUtcOffsetText(s(r.utc_ofseti)), birthUtc: leadingUtc(r.nihai_utc), utcStatus: "VERIFIED", ianaZone: s(r.iana) || null,
    latitude: Number.isFinite(lat) && s(r.enlem) ? lat : null, longitude: Number.isFinite(lon) && s(r.boylam) ? lon : null,
  });
  const key = `${verified ? "VERIFIED" : "PENDING"}:${res.ok ? "TUTARLI" : res.code}`;
  tally[key] = (tally[key] ?? 0) + 1;
  rows.push({
    slug: s(r._slug), status: verified ? "VERIFIED" : "PENDING (hesaplanmaz)",
    local: res.ok ? res.localWall : s(r.belgedeki_yerel_saat).slice(0, 40), offset: s(r.utc_ofseti).slice(0, 12), utc: leadingUtc(r.nihai_utc) ?? "—",
    result: res.ok ? `TUTARLI${res.secondsNonZero ? " · saniyeli" : ""}` : res.code,
    iana: res.ok && res.ianaModern ? `${res.ianaModern.zone} Δ ${res.ianaModern.deltaSeconds} sn` : "—",
  });
}
const md = [
  "# UTC Kanıt Matrisi — Hazır Eğitim Haritaları (ÖZEL; repo dışı)",
  "",
  `Üretim: ${new Date().toISOString()} · kayıt: ${data.length} · yöntem: belgedeki yerel saat − kayıtlı ofset = kayıtlı UTC (±1 sn).`,
  "VERIFIED statüsü bu betikle DEĞİŞTİRİLMEZ. PENDING kayıtlar hiçbir koşulda hesaplanmaz (tutarlılık yalnız bilgi).",
  "",
  "## Özet", "", ...Object.entries(tally).sort().map(([k, v]) => `- ${k}: ${v}`), "",
  "| Kayıt | UTC statüsü | Yerel (belge) | Ofset | Kayıtlı UTC | Bağımsız denetim | Modern IANA farkı (bilgi) |",
  "|---|---|---|---|---|---|---|",
  ...rows.map((x) => `| ${x.slug} | ${x.status} | ${x.local.replace(/\|/g, "/")} | ${x.offset} | ${x.utc} | ${x.result} | ${x.iana} |`),
  "",
].join("\n");
writeFileSync(out, md, { encoding: "utf8", flag: "wx" });
console.log(`yazıldı: ${path.resolve(out)} · ${JSON.stringify(tally)}`);
