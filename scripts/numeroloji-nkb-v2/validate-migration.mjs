/**
 * NKB-V2-B — Migration statik doğrulama harness'ı.
 * Salt-okuma: migration SQL dosyasını okur, güvenlik sözleşmesini metin düzeyinde kanıtlar.
 * DB'ye bağlanmaz, SQL çalıştırmaz.
 *
 * Çalıştır: node scripts/numeroloji-nkb-v2/validate-migration.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  HERE,
  "..",
  "..",
  "supabase",
  "migrations",
  "20260803000000_numerology_content_sections_and_sources.sql",
);

const sql = readFileSync(MIGRATION, "utf8");

// Yorumları çıkar (yasak-kontroller yalnız GERÇEK ifadelere bakmalı; "DOKUNULMAZ" gibi
// söz veren yorum satırları yanlış-pozitif üretmesin). -- satır ve /* */ blok yorumları.
const sqlCode = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

// content_sections ADD COLUMN satırını izole et (DEFAULT kontrolü için).
const addContentSectionsLine =
  sql.split("\n").find((l) => /ADD COLUMN\s+content_sections\s+jsonb/i.test(l)) ?? "";

const checks = [
  // --- FAIL-CLOSED ---
  ["Fail-closed: information_schema kontrolü var", () => /information_schema/i.test(sql)],
  ["Fail-closed: RAISE EXCEPTION ile durur", () => /RAISE EXCEPTION/i.test(sql)],
  [
    "Fail-closed: beklenen 7 kolon doğrulanıyor",
    () =>
      ["id", "tenant_id", "analysis_type", "value", "source", "description", "updated_at"].every(
        (c) => new RegExp(`'${c}'`).test(sql),
      ),
  ],

  // --- content_sections ADDITİF, DEFAULT YOK ---
  ["content_sections nullable jsonb ADD COLUMN", () => /ADD COLUMN\s+content_sections\s+jsonb/i.test(sql)],
  ["content_sections satırında DEFAULT YOK", () => addContentSectionsLine !== "" && !/DEFAULT/i.test(addContentSectionsLine)],
  [
    "content_sections hafif CHECK (NULL veya jsonb array)",
    () => /content_sections IS NULL OR jsonb_typeof\(content_sections\)\s*=\s*'array'/i.test(sql),
  ],

  // --- YENİ TABLOLAR ---
  ["numerology_sources tablosu oluşturuluyor", () => /CREATE TABLE public\.numerology_sources/i.test(sql)],
  ["numerology_record_sources tablosu oluşturuluyor", () => /CREATE TABLE public\.numerology_record_sources/i.test(sql)],
  ["display_label NOT NULL (kilitli kısa ad)", () => /display_label\s+text\s+NOT NULL/i.test(sql)],

  // --- CROSS-TENANT ENGELİ: kompozit FK'ler ---
  [
    "Junction → knowledge_records kompozit FK (tenant_id, id)",
    () => /REFERENCES public\.numerology_knowledge_records \(tenant_id, id\)/i.test(sql),
  ],
  [
    "Junction → sources kompozit FK (tenant_id, id)",
    () => /REFERENCES public\.numerology_sources \(tenant_id, id\)/i.test(sql),
  ],
  [
    "Aday anahtar: knowledge_records UNIQUE (tenant_id, id)",
    () => /numerology_knowledge_records[\s\S]*?UNIQUE \(tenant_id, id\)/i.test(sql),
  ],
  ["Aday anahtar: sources UNIQUE (tenant_id, id)", () => /numerology_sources_tenant_id_unique UNIQUE \(tenant_id, id\)/i.test(sql)],

  // --- DOĞUŞTAN-KİLİTLİ RLS (her iki yeni tablo) ---
  ["RLS: iki tabloda ENABLE ROW LEVEL SECURITY", () => (sql.match(/ENABLE ROW LEVEL SECURITY/gi) || []).length >= 2],
  [
    "RLS: sources REVOKE anon/authenticated/PUBLIC",
    () => /REVOKE ALL PRIVILEGES ON TABLE public\.numerology_sources FROM anon, authenticated, PUBLIC/i.test(sql),
  ],
  [
    "RLS: record_sources REVOKE anon/authenticated/PUBLIC",
    () => /REVOKE ALL PRIVILEGES ON TABLE public\.numerology_record_sources FROM anon, authenticated, PUBLIC/i.test(sql),
  ],
  [
    "RLS: sources GRANT yalnız service_role",
    () => /GRANT\s+ALL PRIVILEGES ON TABLE public\.numerology_sources TO service_role/i.test(sql),
  ],
  [
    "RLS: record_sources GRANT yalnız service_role",
    () => /GRANT\s+ALL PRIVILEGES ON TABLE public\.numerology_record_sources TO service_role/i.test(sql),
  ],
  [
    "tenant_id NOT NULL (iki yeni tabloda)",
    () => (sql.match(/tenant_id\s+uuid\s+NOT NULL/gi) || []).length >= 2,
  ],

  // --- EXPLICIT TRANSACTION (atomiklik; harici tx garantisi yok) ---
  // NOT: DO bloğundaki PL/pgSQL `BEGIN` noktalı virgülsüzdür; `\bBEGIN\s*;` yalnız
  // transaction başlangıcını yakalar (PL/pgSQL bloğunu değil).
  ["TX: çalıştırılabilir SQL BEGIN; ile başlıyor", () => /^\s*BEGIN\s*;/i.test(sqlCode)],
  ["TX: çalıştırılabilir SQL COMMIT; ile bitiyor", () => /\bCOMMIT\s*;$/i.test(sqlCode.trim())],
  ["TX: transaction BEGIN; yalnız bir kez", () => (sqlCode.match(/\bBEGIN\s*;/gi) || []).length === 1],
  ["TX: COMMIT; yalnız bir kez", () => (sqlCode.match(/\bCOMMIT\s*;/gi) || []).length === 1],
  [
    "TX: COMMIT tüm DDL ve fail-closed DO'dan SONRA",
    () => {
      const c = sqlCode.search(/\bCOMMIT\s*;/i);
      const doBlock = sqlCode.search(/DO\s*\$\$/i);
      const lastGrant = sqlCode.toUpperCase().lastIndexOf("GRANT");
      return c > -1 && doBlock > -1 && lastGrant > -1 && c > doBlock && c > lastGrant;
    },
  ],
  [
    "TX: BEGIN; ÖNCESİ çalıştırılabilir DDL/DML yok",
    () => {
      const b = sqlCode.search(/\bBEGIN\s*;/i);
      const before = b > -1 ? sqlCode.slice(0, b) : sqlCode;
      return !/(ALTER|CREATE|DROP|REVOKE|GRANT|INSERT|UPDATE|DELETE|DO\s*\$\$)/i.test(before);
    },
  ],
  [
    "TX: COMMIT; SONRASI çalıştırılabilir DDL/DML yok",
    () => {
      const m = /\bCOMMIT\s*;/i.exec(sqlCode);
      if (!m) return false;
      const after = sqlCode.slice(m.index + m[0].length);
      return !/(ALTER|CREATE|DROP|REVOKE|GRANT|INSERT|UPDATE|DELETE|DO\s*\$\$)/i.test(after);
    },
  ],

  // --- YASAKLILAR (GERÇEK ifadelerde bulunmamalı; yorumlar hariç) ---
  ["YASAK: DROP TABLE yok", () => !/DROP\s+TABLE/i.test(sqlCode)],
  ["YASAK: DROP COLUMN yok", () => !/DROP\s+COLUMN/i.test(sqlCode)],
  ["YASAK: RENAME COLUMN yok", () => !/RENAME\s+COLUMN/i.test(sqlCode)],
  ["YASAK: description/source ALTER COLUMN yok", () => !/ALTER COLUMN\s+(description|source)\b/i.test(sqlCode)],
  ["YASAK: veri backfill UPDATE yok", () => !/\bUPDATE\s+public\./i.test(sqlCode)],
  ["YASAK: veri INSERT (knowledge_records) yok", () => !/INSERT\s+INTO\s+public\.numerology_knowledge_records/i.test(sqlCode)],
  ["YASAK: DELETE FROM yok", () => !/\bDELETE\s+FROM\b/i.test(sqlCode)],
  ["YASAK: numerology_stone_assignments'a DDL/DML yok (yorum hariç)", () => !/numerology_stone_assignments/i.test(sqlCode)],
];

let pass = 0;
let fail = 0;
console.log("── NKB-V2-B — Migration statik doğrulama ──");
for (const [name, fn] of checks) {
  let ok = false;
  try {
    ok = Boolean(fn());
  } catch {
    ok = false;
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (ok) pass++;
  else fail++;
}
// Atomiklik gereği ROLLBACK ile sonuçlanması BEKLENEN hata senaryoları (bilgilendirme).
// Hepsi tek transaction içinde olduğundan herhangi biri COMMIT'i engeller → kısmi şema kalmaz.
console.log("\n── ROLLBACK gerektiren senaryolar (BEGIN…COMMIT ile tümü geri alınır) ──");
for (const s of [
  "Fail-closed DO bloğu RAISE EXCEPTION verirse (tablo/kolon yok veya content_sections zaten var)",
  "content_sections eklendikten sonra numerology_sources CREATE hata verirse → kolon da rollback",
  "UNIQUE (tenant_id, id) aday anahtarı eklenemezse → tüm migration rollback",
  "Kompozit FOREIGN KEY oluşturulamazsa → tüm migration rollback",
  "public.set_updated_at() yoksa CREATE TRIGGER hata verir → tüm migration rollback",
  "REVOKE/GRANT aşamasında hata olursa → tüm migration rollback",
  "İkinci çalıştırmada content_sections zaten var → RAISE EXCEPTION → yeni değişiklik yok",
]) {
  console.log(`  • ${s}`);
}
console.log("  → COMMIT yalnız TÜM adımlar başarılıysa gerçekleşir.");

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${checks.length} kontrol)`);
if (fail > 0) process.exit(1);
