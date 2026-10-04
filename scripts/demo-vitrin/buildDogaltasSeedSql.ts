/**
 * DEMO VİTRİN — Doğaltaş sentetik vitrin verisi → migration SQL üreticisi (deterministik).
 *
 * Kaynak: lib/demo/demoDogaltasFixture.ts. Çıktı:
 *   supabase/migrations/20271006400000_demo_vitrin_dogaltas_seed.sql
 *
 *   npx tsx scripts/demo-vitrin/buildDogaltasSeedSql.ts          → dosyayı yazar
 *   npx tsx scripts/demo-vitrin/buildDogaltasSeedSql.ts --check  → güncel değilse exit 1
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEMO_TENANT_ID, DEMO_STONES_SEED, DEMO_ARTICLES_SEED } from "../../lib/demo/demoDogaltasFixture";
import { DEMO_ACCOUNT_EMAIL } from "../../lib/demo/demoVitrinFixture";

export const DOGALTAS_SEED_MIGRATION_FILE = "20271006400000_demo_vitrin_dogaltas_seed.sql";

const T = `'${DEMO_TENANT_ID}'::uuid`;
const q = (v: string | null | undefined) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const j = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;
const arr = (v: readonly string[]) => (v.length === 0 ? "'{}'::text[]" : `ARRAY[${v.map(q).join(", ")}]::text[]`);
const ts = (minutes: number) => `(now() + interval '${minutes} minutes')`;

function insert(table: string, cols: string[], rows: string[][]): string {
  return `INSERT INTO public.${table} (${cols.join(", ")})\nVALUES\n${rows.map((r) => `  (${r.join(", ")})`).join(",\n")}\nON CONFLICT (id) DO NOTHING;\n`;
}

export function buildDogaltasSeedSql(): string {
  const out: string[] = [];
  out.push(`-- ============================================================================
-- DEMO VİTRİN — Doğaltaş SENTETİK vitrin verisi (uzman@test.com demo tenant'ı)
--
-- OTOMATİK ÜRETİLDİ — elle düzenleme. Kaynak: lib/demo/demoDogaltasFixture.ts
-- Üretici: npx tsx scripts/demo-vitrin/buildDogaltasSeedSql.ts (harness --check ile doğrular).
--
-- NEDEN: d83ddd4a ile demo hesabın owner tenant'ındaki GERÇEK taşları okuması (cross-tenant
-- birleşim) güvenlik gereği kaldırıldı; GERİ GETİRİLMEZ. Vitrin bunun yerine demo tenant'ına ait
-- açıkça SENTETİK kayıtlarla doldurulur: ${DEMO_STONES_SEED.length} taş + ${DEMO_ARTICLES_SEED.length} Taş Bilgi Kütüphanesi makalesi.
-- Owner kayıtlarından içerik / UUID / tenant / user referansı KOPYALANMAZ; görsel YOK (images=[]).
--
-- KAPSAM: YALNIZ demo tenant ${DEMO_TENANT_ID} (users.is_demo_account=true, email=${DEMO_ACCOUNT_EMAIL}).
-- İDEMPOTENT: sabit id'ler + ON CONFLICT (id) DO NOTHING → tekrar uygulama duplicate üretmez,
-- mevcut satırı DEĞİŞTİRMEZ (overwrite yok).
-- KİLİT: tenant yoksa, demo kullanıcı yoksa veya tenant'ta demo-OLMAYAN kullanıcı varsa HATA verir ve
-- hiçbir şey yazmaz (tek transaction). Sabit id'ler başka bir tenant'ta mevcutsa da DURUR.
-- NOT: stones / stone_knowledge_articles üzerindeki Yaşam Hafızası CDC tetikleyicileri outbox olayı
-- üretir; işçi demo tenant'ını "excluded-demo" ile kapatır (index'e demo verisi YAZILMAZ).
-- ============================================================================
BEGIN;

DO $demo_dogaltas_guard$
DECLARE
  v_demo_user uuid;
  v_non_demo integer;
  v_foreign integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = ${T}) THEN
    RAISE EXCEPTION 'demo dogaltas seed: demo tenant bulunamadı';
  END IF;
  SELECT count(*) INTO v_non_demo FROM public.users
   WHERE tenant_id = ${T} AND coalesce(is_demo_account, false) = false;
  IF v_non_demo > 0 THEN
    RAISE EXCEPTION 'demo dogaltas seed: demo tenant demo-olmayan kullanıcı içeriyor (%) — durduruldu', v_non_demo;
  END IF;
  v_demo_user := (SELECT u.id FROM public.users u WHERE u.tenant_id = ${T}
                    AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = '${DEMO_ACCOUNT_EMAIL}');
  IF v_demo_user IS NULL THEN
    RAISE EXCEPTION 'demo dogaltas seed: demo kullanıcı bulunamadı';
  END IF;
  SELECT (SELECT count(*) FROM public.stones WHERE id::text LIKE 'de5a0020-c11e-4000-8000-%' AND tenant_id IS DISTINCT FROM ${T})
       + (SELECT count(*) FROM public.stone_knowledge_articles WHERE id::text LIKE 'de5a0021-c11e-4000-8000-%' AND tenant_id IS DISTINCT FROM ${T})
    INTO v_foreign;
  IF v_foreign > 0 THEN
    RAISE EXCEPTION 'demo dogaltas seed: sabit id başka tenantta mevcut (%) — durduruldu', v_foreign;
  END IF;
END
$demo_dogaltas_guard$;
`);

  out.push("-- Sentetik taşlar (görsel yok)");
  out.push(insert("stones",
    ["id", "tenant_id", "stone_name", "short_description", "general_info", "source_note", "physical_effects", "spiritual_effects",
      "other_effects", "warning_text", "warning_tags", "feng_shui", "meditation", "care", "application", "chakras", "assignments",
      "images", "created_at", "updated_at"],
    DEMO_STONES_SEED.map((s) => [
      `'${s.id}'::uuid`, T, q(s.stone_name), q(s.short_description), q(s.general_info), q(s.source_note), q(s.physical_effects),
      q(s.spiritual_effects), q(s.other_effects), q(s.warning_text), j(s.warning_tags), q(s.feng_shui), q(s.meditation), q(s.care),
      q(s.application), j(s.chakras), j(s.assignments), "'[]'::jsonb", ts(s.updatedOffsetMinutes), ts(s.updatedOffsetMinutes),
    ])));

  out.push("-- Sentetik Taş Bilgi Kütüphanesi makaleleri");
  out.push(insert("stone_knowledge_articles",
    ["id", "tenant_id", "title", "content", "category", "sub_category", "tags", "related_stones", "related_minerals", "source",
      "keyword", "is_active"],
    DEMO_ARTICLES_SEED.map((a) => [
      `'${a.id}'::uuid`, T, q(a.title), q(a.content), q(a.category), q(a.sub_category), arr(a.tags), arr(a.related_stones),
      arr(a.related_minerals), q(a.source), q(a.keyword), "true",
    ])));

  out.push("COMMIT;\n");
  return out.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const file = path.join(process.cwd(), "supabase", "migrations", DOGALTAS_SEED_MIGRATION_FILE);
  const sql = buildDogaltasSeedSql();
  if (process.argv.includes("--check")) {
    if (readFileSync(file, "utf8").replace(/\r\n/g, "\n") !== sql) {
      console.error(`✗ ${DOGALTAS_SEED_MIGRATION_FILE} güncel değil — npx tsx scripts/demo-vitrin/buildDogaltasSeedSql.ts`);
      process.exit(1);
    }
    console.log(`✓ ${DOGALTAS_SEED_MIGRATION_FILE} fixture kaynağıyla birebir aynı.`);
  } else {
    writeFileSync(file, sql);
    console.log(`yazıldı: supabase/migrations/${DOGALTAS_SEED_MIGRATION_FILE} (${sql.length} bayt)`);
  }
}
