/**
 * Snapshot paketlerinden TEK SQL dosyası üretir (production'a TAŞIMA için; bu araç VERİTABANINA BAĞLANMAZ).
 * Her paket önce `verifyPackageText` ile doğrulanır (dosya SHA, gövde/ürün/kanonik özetler). Üretilen SQL her snapshot için:
 *   • kişi satırının kimlik + natural_key + revizyon + kanıt alanlarını BİREBİR denetler (uymazsa İSTİSNA → tüm işlem geri alınır),
 *   • aynı (kişi, istek özeti, adapter) yoksa ekler (idempotent; ikinci çalıştırma 0 satır),
 *   • denetim olayı yazar ('import'). Yayın / hukuk alanlarına DOKUNMAZ (snapshot ≠ yayın).
 * Çıktı BEGIN…COMMIT içindedir; owner önce aynı dosyayı yerel/izole kopyada ve/veya `BEGIN; … ROLLBACK;` ile dener.
 * Kullanım: npx tsx scripts/hd-education/real/snapshot-sql.ts --pkg <paket> --out <repo-dışı .sql (yeni dosya)>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { verifyPackageText, sha256 } from "./snapshot-io";

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : ""; };
const PKG = path.resolve(arg("--pkg")); const OUT = path.resolve(arg("--out"));
if (!arg("--pkg") || !arg("--out")) throw new Error("--pkg ve --out zorunlu");
if (OUT.toLowerCase().startsWith(process.cwd().toLowerCase())) throw new Error("çıktı repo İÇİNDE olamaz (gerçek kişi verisi)");
if (existsSync(OUT)) throw new Error(`üzerine yazılmaz: ${OUT}`);
const lit = (v: unknown) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const json = (v: unknown) => `${lit(JSON.stringify(v))}::jsonb`;
const manifest = readFileSync(path.join(PKG, "manifest.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { file: string; sha256: string; natural_key: string });
const out: string[] = [
  "-- HD Hazır Eğitim Haritaları — GERÇEK snapshot aktarımı (üretildi: " + new Date().toISOString() + ")",
  "-- Kişi kayıtları ÖNCE (aynı _uuid'lerle) mevcut olmalı. Yayın/hukuk DEĞİŞMEZ. İdempotent. Hata → tamamı geri alınır.",
  "BEGIN;",
];
let n = 0;
for (const m of manifest) {
  const txt = readFileSync(path.join(PKG, "snapshots", m.file), "utf8");
  const v = verifyPackageText(txt, m.sha256);
  if (v.error || !v.pkg) throw new Error(`${m.file}: paket doğrulanamadı (${v.error}) — SQL ÜRETİLMEDİ`);
  const c = v.pkg.chart; const s = v.pkg.subject;
  out.push(`-- ${m.natural_key} · ${m.file} · dosya sha256 ${m.sha256}`);
  out.push(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hd_education_subjects WHERE id = ${lit(c.subject_id)}::uuid AND natural_key = ${lit(s.natural_key)}
      AND revision = ${Number(c.subject_revision)} AND utc_status = 'VERIFIED' AND birth_utc = ${lit(s.birth_utc)}::timestamptz
      AND utc_offset_seconds ${s.utc_offset_seconds === null ? "IS NULL" : `= ${Number(s.utc_offset_seconds)}`} AND birth_date = ${lit(String(s.birth_date).slice(0, 10))}::date
      AND latitude = ${Number(s.latitude)} AND longitude = ${Number(s.longitude)}) THEN
    RAISE EXCEPTION 'snapshot aktarımı: kişi/kanıt/revizyon uyuşmuyor: %', ${lit(s.natural_key)};
  END IF;
END $$;`);
  out.push(`WITH ins AS (
  INSERT INTO public.hd_education_charts (id, subject_id, subject_revision, version, request_body, request_hash, provider, endpoint, adapter_version, engine_version, contract_version,
    computed_result, provider_raw, provider_raw_sha256, design_instant_utc, time_check, boundary_flags, calc_status, computed_at)
  SELECT ${lit(c.id)}::uuid, ${lit(c.subject_id)}::uuid, ${Number(c.subject_revision)}, ${Number(c.version)}, ${json(c.request_body)}, ${lit(c.request_hash)}, ${lit(c.provider)}, ${lit(c.endpoint)},
    ${lit(c.adapter_version)}, ${lit(c.engine_version)}, ${lit(c.contract_version)}, ${json(c.computed_result)}, ${json(v.providerObject)}, ${lit(c.provider_raw_sha256)},
    ${lit(c.design_instant_utc)}::timestamptz, ${json(c.time_check)}, ${json(c.boundary_flags)}, 'OK', ${lit(c.computed_at)}::timestamptz
  WHERE NOT EXISTS (SELECT 1 FROM public.hd_education_charts x WHERE x.subject_id = ${lit(c.subject_id)}::uuid AND x.request_hash = ${lit(c.request_hash)} AND x.adapter_version = ${lit(c.adapter_version)})
  RETURNING subject_id, id, version)
INSERT INTO public.hd_education_audit_events (actor_kind, actor_user_id, action, subject_id, detail)
SELECT 'import', NULL, 'chart_recorded', subject_id, jsonb_build_object('kaynak','snapshot-paketi','format',${lit(v.pkg.format)},'chart_id',id,'surum',version,'dosya_sha256',${lit(m.sha256)}) FROM ins;`);
  n++;
}
out.push("COMMIT;");
const sql = out.join("\n") + "\n";
writeFileSync(OUT, sql, { flag: "wx" });
writeFileSync(OUT + ".sha256", `${sha256(sql)}  ${path.basename(OUT)}\n`, { flag: "wx" });
console.log(`yazıldı: ${OUT} · ${n} snapshot · sha256 ${sha256(sql)}`);
