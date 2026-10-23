/**
 * Snapshot paketlerinden TEK SQL dosyası üretir (production'a TAŞIMA için; bu araç VERİTABANINA BAĞLANMAZ).
 * Her paket önce `verifyPackageText` ile doğrulanır (dosya SHA, gövde/ürün/kanonik özetler). Üretilen SQL:
 *   • hedef şemayı denetler (`--target`: with-body = 20271113 gövde kolonları VAR olmalı; legacy = YOK olmalı) — yanlış
 *     hedefte İSTİSNA (v2 gövdesi sessizce düşürülmez / olmayan kolona yazılmaz),
 *   • her snapshot için kişi satırının kimlik + natural_key + revizyon + kanıt alanlarını BİREBİR denetler,
 *   • aynı (kişi, istek özeti, adapter) yoksa ekler (idempotent; ikinci çalıştırma 0 satır),
 *   • ekleme SONRASI satırı yeniden okur: ürün SHA, kanonik veri (jsonb), normalize sonuç, (with-body) gövde/kanonik
 *     özetler paketle AYNI olmalı — önceden var olan farklı içerikli satır da İSTİSNA,
 *   • denetim olayı yazar ('import'). Yayın / hukuk alanlarına DOKUNMAZ (snapshot ≠ yayın).
 * Herhangi bir denetim tutmazsa İSTİSNA → BEGIN…COMMIT içindeki TÜM işlem geri alınır.
 * v1 paketleri (`hd-edu-snapshot-1`): yeniden oluşturulmuş metin birebir HTTP gövdesi İLAN EDİLMEZ → provider_body NULL,
 * yalnız kanonik özet yazılır. v2: orijinal HTTP gövdesi + DB'nin doğruladığı gövde özeti.
 * Kullanım: npx tsx scripts/hd-education/real/snapshot-sql.ts --pkg <paket> --target with-body|legacy --out <repo-dışı .sql (yeni dosya)>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { verifyPackageText, sha256, canonicalSha256, hasProviderBody } from "./snapshot-io";

export type TransferTarget = "with-body" | "legacy";
export const BODY_COLUMNS = ["provider_body", "provider_body_sha256", "provider_canonical_sha256"] as const;

const lit = (v: unknown) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const json = (v: unknown) => `${lit(JSON.stringify(v))}::jsonb`;

/** Paket klasöründen aktarım SQL'ini üretir (saf; DB yok). Paket doğrulanamazsa İSTİSNA (SQL üretilmez). */
export function buildTransferSql(pkgDir: string, target: TransferTarget): { sql: string; count: number; v1: number; v2: number } {
  if (target !== "with-body" && target !== "legacy") throw new Error("--target with-body|legacy zorunlu");
  const manifest = readFileSync(path.join(pkgDir, "manifest.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { file: string; sha256: string; natural_key: string });
  const keys = new Set<string>();
  const colCheck = `(SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'hd_education_charts' AND column_name IN (${BODY_COLUMNS.map(lit).join(", ")}))`;
  const out: string[] = [
    `-- HD Hazır Eğitim Haritaları — GERÇEK snapshot aktarımı · hedef: ${target} (üretildi: ${new Date().toISOString()})`,
    "-- Kişi kayıtları ÖNCE (aynı id'lerle) mevcut olmalı. Yayın/hukuk DEĞİŞMEZ. İdempotent. Herhangi bir hata → tamamı geri alınır.",
    target === "legacy" ? "-- legacy: v2 gövdeleri DB'ye AKTARILMAZ (pakette korunur); hedefte gövde kolonları varsa İSTİSNA." : "-- with-body: v2 orijinal gövde + özetleri; v1 yalnız kanonik özet (gövde NULL).",
    "BEGIN;",
    `DO $$ BEGIN
  IF ${colCheck} <> ${target === "with-body" ? 3 : 0} THEN
    RAISE EXCEPTION 'snapshot aktarımı: hedef şema --target ${target} ile uyumlu değil (gövde kolonları ${target === "with-body" ? "eksik — önce 20271113000000" : "MEVCUT — --target with-body kullanın"})';
  END IF;
END $$;`,
  ];
  let n = 0, v1 = 0, v2 = 0;
  for (const m of manifest) {
    if (keys.has(m.natural_key)) throw new Error(`${m.natural_key}: manifestte iki kez — SQL ÜRETİLMEDİ`);
    keys.add(m.natural_key);
    const txt = readFileSync(path.join(pkgDir, "snapshots", m.file), "utf8");
    const v = verifyPackageText(txt, m.sha256);
    if (v.error || !v.pkg) throw new Error(`${m.file}: paket doğrulanamadı (${v.error}) — SQL ÜRETİLMEDİ`);
    if (v.pkg.subject.natural_key !== m.natural_key) throw new Error(`${m.file}: manifest natural_key ≠ paket — SQL ÜRETİLMEDİ`);
    const c = v.pkg.chart; const s = v.pkg.subject;
    const isV2 = hasProviderBody(v.pkg.format);
    if (isV2) v2++; else v1++;
    const canonical = canonicalSha256(v.providerObject);
    const body = target === "with-body" && isV2 ? (v.pkg.provider_body_text as string) : null;
    const bodySha = body !== null ? (v.pkg.provider_body_sha256 as string) : null;
    const where = `subject_id = ${lit(c.subject_id)}::uuid AND request_hash = ${lit(c.request_hash)} AND adapter_version = ${lit(c.adapter_version)}`;
    out.push(`-- ${m.natural_key} · ${m.file} · ${v.pkg.format} · dosya sha256 ${m.sha256}`);
    out.push(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hd_education_subjects WHERE id = ${lit(c.subject_id)}::uuid AND natural_key = ${lit(s.natural_key)}
      AND revision = ${Number(c.subject_revision)} AND utc_status = 'VERIFIED' AND birth_utc = ${lit(s.birth_utc)}::timestamptz
      AND utc_offset_seconds ${s.utc_offset_seconds === null ? "IS NULL" : `= ${Number(s.utc_offset_seconds)}`} AND birth_date = ${lit(String(s.birth_date).slice(0, 10))}::date
      AND latitude = ${Number(s.latitude)} AND longitude = ${Number(s.longitude)}
      AND documented_local_time IS NOT DISTINCT FROM ${lit(s.documented_local_time)} AND time_standard IS NOT DISTINCT FROM ${lit(s.time_standard)}) THEN
    RAISE EXCEPTION 'snapshot aktarımı: kişi/kanıt/revizyon uyuşmuyor: %', ${lit(s.natural_key)};
  END IF;
END $$;`);
    const cols = ["id", "subject_id", "subject_revision", "version", "request_body", "request_hash", "provider", "endpoint", "adapter_version", "engine_version", "contract_version",
      "computed_result", "provider_raw", "provider_raw_sha256", "design_instant_utc", "time_check", "boundary_flags", "calc_status", "computed_at", ...(target === "with-body" ? BODY_COLUMNS : [])];
    const vals = [`${lit(c.id)}::uuid`, `${lit(c.subject_id)}::uuid`, `${Number(c.subject_revision)}`, `${Number(c.version)}`, json(c.request_body), lit(c.request_hash), lit(c.provider), lit(c.endpoint),
      lit(c.adapter_version), lit(c.engine_version), lit(c.contract_version), json(c.computed_result), json(v.providerObject), lit(c.provider_raw_sha256),
      `${lit(c.design_instant_utc)}::timestamptz`, json(c.time_check), json(c.boundary_flags), "'OK'", `${lit(c.computed_at)}::timestamptz`,
      ...(target === "with-body" ? [lit(body), lit(bodySha), lit(canonical)] : [])];
    out.push(`WITH ins AS (
  INSERT INTO public.hd_education_charts (${cols.join(", ")})
  SELECT ${vals.join(", ")}
  WHERE NOT EXISTS (SELECT 1 FROM public.hd_education_charts x WHERE x.${where.replace(/ AND /g, " AND x.")})
  RETURNING subject_id, id, version)
INSERT INTO public.hd_education_audit_events (actor_kind, actor_user_id, action, subject_id, detail)
SELECT 'import', NULL, 'chart_recorded', subject_id, jsonb_build_object('kaynak','snapshot-paketi','format',${lit(v.pkg.format)},'hedef',${lit(target)},'chart_id',id,'surum',version,'dosya_sha256',${lit(m.sha256)},'govde',${body !== null ? "'orijinal-http'" : "'yok'"}) FROM ins;`);
    // Ekleme SONRASI yeniden okuma: tek satır + içerik paketle aynı (önceden var olan farklı satır da reddedilir).
    out.push(`DO $$ BEGIN
  IF (SELECT count(*) FROM public.hd_education_charts WHERE ${where}) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.hd_education_charts WHERE ${where} AND id = ${lit(c.id)}::uuid AND version = ${Number(c.version)}
       AND calc_status = 'OK' AND subject_revision = ${Number(c.subject_revision)} AND provider_raw_sha256 = ${lit(c.provider_raw_sha256)}
       AND provider_raw = ${json(v.providerObject)} AND computed_result = ${json(c.computed_result)}${target === "with-body"
         ? `\n       AND provider_canonical_sha256 = ${lit(canonical)} AND provider_body_sha256 ${bodySha === null ? "IS NULL AND provider_body IS NULL" : `= ${lit(bodySha)} AND provider_body IS NOT NULL`}`
         : ""}) THEN
    RAISE EXCEPTION 'snapshot aktarımı: yeniden okuma kanıtı tutmadı: %', ${lit(s.natural_key)};
  END IF;
END $$;`);
    n++;
  }
  out.push("COMMIT;");
  return { sql: out.join("\n") + "\n", count: n, v1, v2 };
}

function cli() {
  const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : ""; };
  if (!arg("--pkg") || !arg("--out") || !arg("--target")) throw new Error("--pkg, --target with-body|legacy ve --out zorunlu");
  const PKG = path.resolve(arg("--pkg")); const OUT = path.resolve(arg("--out"));
  if (OUT.toLowerCase().startsWith(process.cwd().toLowerCase())) throw new Error("çıktı repo İÇİNDE olamaz (gerçek kişi verisi)");
  if (existsSync(OUT)) throw new Error(`üzerine yazılmaz: ${OUT}`);
  const r = buildTransferSql(PKG, arg("--target") as TransferTarget);
  writeFileSync(OUT, r.sql, { flag: "wx" });
  writeFileSync(OUT + ".sha256", `${sha256(r.sql)}  ${path.basename(OUT)}\n`, { flag: "wx" });
  console.log(`yazıldı: ${OUT} · ${r.count} snapshot (v1 ${r.v1} / v2 ${r.v2}) · hedef ${arg("--target")} · sha256 ${sha256(r.sql)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) cli();
