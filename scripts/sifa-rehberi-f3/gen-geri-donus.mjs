/**
 * Şifa Rehberi F3 — şema geri dönüş SQL'ini ÜRETİR (docs/sifa-rehberi-f3/geri-donus-sema.sql).
 * Fonksiyonların F3 öncesi gövdeleri elle kopyalanmaz: çekirdek (20280110000000) ve yaşam döngüsü (20280124000000)
 * migration dosyalarından AYNEN alınır. Eklenen sütunlar ve veri KORUNUR (DROP COLUMN / DELETE yok).
 * Çalıştır: node scripts/sifa-rehberi-f3/gen-geri-donus.mjs   — doğrulama: scripts/sifa-rehberi-f3/db.pg.mts (Q bölümü)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const read = (f) => readFileSync(path.resolve("supabase/migrations", f), "utf8").replace(/\r\n/g, "\n");
const CORE = read("20280110000000_sifa_rehberi_v2_core.sql");
const LC = read("20280124000000_sifa_v2_asset_lifecycle.sql");

function fn(src, name) {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`fonksiyon yok: ${name}`);
  const body = src.indexOf("$$", src.indexOf("AS $$", start) + 5);
  const end = src.indexOf(";", body) + 1;
  return src.slice(start, end);
}

const out = `-- =============================================================================
-- Şifa Rehberi F3 — ŞEMA GERİ DÖNÜŞÜ (yalnız Owner onayıyla; normal geri dönüş kod düzeyindedir — yayin-ve-geri-donus.md §3)
-- ÜRETİLMİŞ DOSYA: scripts/sifa-rehberi-f3/gen-geri-donus.mjs — elle düzenlemeyin.
-- Fonksiyonları F3 öncesine (çekirdek + yaşam döngüsü migration'ları) döndürür. Eklenen sütunlar (node_kind, parent_block_id,
-- content_updated_at) ve TÜM VERİ KALIR. Eski kısıtlar (boş olmayan başlık, kaynak türü) YALNIZ veri onlara uyuyorsa geri konur.
-- =============================================================================
BEGIN;

-- 20280130000300 (YH: not çöpü → kutular kuyruğa) — aktivasyon kapalıyken zaten no-op; tam geri dönüş için kaldırılır.
DROP TRIGGER IF EXISTS yh_cdc_sifa_v2_note_trash_trg ON public.sifa_topic_blocks;
DROP FUNCTION IF EXISTS public.yh_sifa_v2_note_trash_enqueue();
DROP TRIGGER IF EXISTS sifa_blocks_guard_nest_trg ON public.sifa_topic_blocks;
DROP FUNCTION IF EXISTS public.sifa_blocks_guard_nest();

${fn(CORE, "sifa_topics_guard_template")}

${fn(CORE, "sifa_v2_load")}

${fn(CORE, "sifa_v2__apply")}

${fn(LC, "sifa_v2__block_dead")}

${fn(LC, "sifa_v2__asset_in_use")}

-- Eski kısıtlar: yalnız veri uyuyorsa (aksi hâlde F3 kısıtı kalır; veri kaybı/hata yok).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sifa_topic_blocks WHERE char_length(btrim(title)) < 1) THEN
    ALTER TABLE public.sifa_topic_blocks DROP CONSTRAINT IF EXISTS sifa_blocks_title_len;
    ALTER TABLE public.sifa_topic_blocks ADD CONSTRAINT sifa_topic_blocks_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200);
  ELSE
    RAISE NOTICE 'boş başlıklı not/kutu var: F3 başlık kısıtı korunuyor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sifa_block_sources WHERE kind = 'baglanti') THEN
    ALTER TABLE public.sifa_block_sources DROP CONSTRAINT IF EXISTS sifa_sources_kind_chk;
    ALTER TABLE public.sifa_block_sources ADD CONSTRAINT sifa_block_sources_kind_check CHECK (kind IN ('makale','kitap','web','geleneksel','diger'));
  ELSE
    RAISE NOTICE '''baglanti'' türünde kayıt var: F3 tür kısıtı korunuyor';
  END IF;
END $$;

-- Yetkiler (çekirdek ile aynı): iç yardımcı hiçbir role açık değil; dış fonksiyonlar yalnız service_role.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.sifa_v2_load(uuid, uuid)', 'public.sifa_v2__apply(uuid, uuid, text, jsonb)',
    'public.sifa_v2__block_dead(uuid, timestamptz)', 'public.sifa_v2__asset_in_use(uuid, uuid, uuid, timestamptz)',
    'public.sifa_topics_guard_template()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.sifa_v2__apply(uuid, uuid, text, jsonb) FROM service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.sifa_v2_load(uuid, uuid) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.sifa_v2__block_dead(uuid, timestamptz) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.sifa_v2__asset_in_use(uuid, uuid, uuid, timestamptz) TO service_role';
  END IF;
END $$;

COMMIT;
`;
mkdirSync(path.resolve("docs/sifa-rehberi-f3"), { recursive: true });
writeFileSync(path.resolve("docs/sifa-rehberi-f3/geri-donus-sema.sql"), out);
console.log("docs/sifa-rehberi-f3/geri-donus-sema.sql", out.length);
