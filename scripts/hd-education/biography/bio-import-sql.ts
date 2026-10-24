/**
 * Hayat Hikâyesi içe aktarma SQL üreticisi (FAZ 10). Ağ / DB erişimi YOK; yalnız dosya okur ve SQL yazar.
 * Kullanım: npx tsx scripts/hd-education/biography/bio-import-sql.ts --dir <biyografi klasörü> --out <sql dosyası> [--report <json>]
 * Hatalı dosya SQL'e girmez ve rapora yazılır; çıkış kodu hatalı dosya varsa 2.
 */
import { writeFileSync } from "node:fs";
import { bioImportSql, loadBioDir } from "./bioImport";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const dir = arg("--dir");
const out = arg("--out");
if (!dir || !out) {
  console.error("kullanım: --dir <klasör> --out <sql> [--report <json>]");
  process.exit(1);
}
const { files, errors } = loadBioDir(dir);
writeFileSync(out, bioImportSql(files), "utf8");
const report = {
  at: new Date().toISOString(), dir, ok: files.length, failed: errors.length,
  files: files.map((f) => ({
    file: f.file, personKey: f.personKey, lang: f.lang, naturalKey: f.naturalKey, contentStatus: f.contentStatus,
    sections: f.content.sections.length, events: f.content.timeline.length, sources: f.content.sources.length,
    chars: [f.content.shortIntro, ...f.content.sections.flatMap((s) => s.paragraphs.map((p) => p.text))].join("").length,
    wikipediaSources: f.content.sources.filter((s) => s.kind === "wikipedia").length,
    nonWikipediaSources: f.content.sources.filter((s) => s.kind !== "wikipedia").length,
    directQuotes: f.content.licenseInfo.directQuotes, adaptedText: f.content.licenseInfo.adaptedText,
  })),
  errors,
};
const rp = arg("--report");
if (rp) writeFileSync(rp, JSON.stringify(report, null, 2), "utf8");
console.log(`biyografi: ${files.length} geçerli, ${errors.length} hatalı → ${out}`);
for (const e of errors) console.log(`  ✗ ${e.file} [${e.field}] ${e.error}`);
process.exit(errors.length ? 2 : 0);
