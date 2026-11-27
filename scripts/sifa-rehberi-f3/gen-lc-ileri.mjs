/**
 * Şifa Rehberi — `20280124000000_sifa_v2_asset_lifecycle.sql` için İLERİ YÖNLÜ TELAFİ migration'ını ÜRETİR.
 *
 * Neden: 20280124 production'a hiç uygulanmadı (gerçek şema karşılaştırması 27.11.2026: production'daki 6 yaşam döngüsü
 * fonksiyonunun imzası "yalnız çekirdek" ile birebir). DB-03 tohumu onu "gecmis prod:false" olarak dondurdu ve kapı onu
 * uygulamaz (AYIRMA); dosya ayrıca kapının SQL yapı kuralına (BEGIN;…COMMIT;) uymaz. Defter / kapı GEVŞETİLMEZ: gereken
 * değişiklik merkezi defterden YENİ numara alan, PR'da incelenen, kapıdan normal yoldan geçen ileri bir migration'la yapılır.
 *
 * İçerik: 20280124'ün F3 (20280130000200) ile ÇAKIŞMAYAN 4 fonksiyonu — gövde metni dosyadan AYNEN alınır (elle kopya yok):
 *   sifa_v2_gc_candidates, sifa_v2_gc_purge, sifa_v2_trash_candidates, sifa_v2_trash_purge (+ aynı yetki kuralı).
 * sifa_v2__block_dead / sifa_v2__asset_in_use BURADA YOK: F3 onların güncel (ana not / kutu farkında) hâlini tanımlar; eklenseydi
 * taze ortamda (sıra: 20280124 → F3 → bu dosya) F3'ün tanımını eski hâline döndürürdü.
 * Ön koşul: F3 (20280130000200) VE YH kutu yayılımı (20280130000300) uygulanmış olmalı → kapı sırayı zorlar.
 * YAYIN HAZIRLIK İŞARETİ (F4-R2): son adımda `sifa_v2_f3_hazir()` kurulur. Uygulama, Şifa ekranını ve API'lerini bayrak AÇIK
 * olsa bile YALNIZ bu fonksiyon varsa (= üç migration da tamam) açar; yoksa "bakımda" (lib/sifa-rehberi-v2/server/realRoute.ts).
 * Taze ortamda (20280124 kurulu) aynı tanımları yeniden yazar → şema DEĞİŞMEZ (test: lc-ileri.pg.mjs).
 *
 * Kullanım: node scripts/sifa-rehberi-f3/gen-lc-ileri.mjs <hedef dosya yolu> [--kaynak-rev origin/main]
 *   (hedef ad, `npm run migration:numara -- ayir --modul sifa-rehberi --ad sifa_v2_asset_lifecycle_ileri` ile alınır.)
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LC_DOSYA = "supabase/migrations/20280124000000_sifa_v2_asset_lifecycle.sql";
export const ILERI_FONKSIYONLAR = [
  ["sifa_v2_gc_candidates", "timestamptz, timestamptz, uuid, integer"],
  ["sifa_v2_gc_purge", "timestamptz, uuid, uuid[]"],
  ["sifa_v2_trash_candidates", "timestamptz"],
  ["sifa_v2_trash_purge", "timestamptz, uuid[]"],
];

function fonksiyon(src, ad) {
  const bas = src.indexOf(`CREATE OR REPLACE FUNCTION public.${ad}(`);
  if (bas < 0) throw new Error(`fonksiyon yok: ${ad}`);
  const govdeBas = src.indexOf("AS $$", bas);
  const govdeSon = src.indexOf("$$", govdeBas + 5);
  const son = src.indexOf(";", govdeSon) + 1;
  if (govdeBas < 0 || govdeSon < 0 || son <= 0) throw new Error(`gövde çözülemedi: ${ad}`);
  return src.slice(bas, son);
}

/** 20280124 metninden (git blob, LF) ileri migration metni. */
export function ileriSql(lcMetni, dosyaAdi) {
  const lc = lcMetni.replace(/\r\n/g, "\n");
  const govdeler = ILERI_FONKSIYONLAR.map(([ad]) => fonksiyon(lc, ad)).join("\n\n");
  const imzalar = ILERI_FONKSIYONLAR.map(([ad, a]) => `'public.${ad}(${a})'`).join(",\n    ");
  return `-- ${dosyaAdi} — modül: sifa-rehberi
-- İLERİ YÖNLÜ TELAFİ: 20280124000000_sifa_v2_asset_lifecycle.sql production'a HİÇ uygulanmadı (DB-03 tohumunda "gecmis prod:false";
-- gerçek şema karşılaştırması 27.11.2026: production = yalnız çekirdek). Bu dosya onun F3 ile çakışmayan 4 fonksiyonunu AYNEN kurar
-- (gövdeler scripts/sifa-rehberi-f3/gen-lc-ileri.mjs ile 20280124'ten alındı). __block_dead / __asset_in_use F3'te tanımlıdır.
-- Taze ortamda (20280124 + F3 kurulu) aynı tanımları yeniden yazar → değişiklik yok. Tablo / veri / Storage DEĞİŞMEZ.
-- Numara merkezi defterden ayrıldı (DB-03). Production'a yalnız uygulama kapısıyla (uygula-prod.mjs), F3'ten SONRA uygulanır.
-- Son adım: yayın hazırlık işareti sifa_v2_f3_hazir() — uygulama Şifa'yı yalnız bu fonksiyon varsa açar (üç migration tamam).
-- onkosul: to_regprocedure('public.sifa_blocks_guard_nest()') IS NOT NULL AND to_regprocedure('public.yh_sifa_v2_note_trash_enqueue()') IS NOT NULL

BEGIN;

${govdeler}

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    ${imzalar}] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f); END IF;
  END LOOP;
END $$;

-- Yayın hazırlık işareti: F3 + YH + bu migration tamam → uygulama Şifa'yı açabilir. Salt okunur; tablo okumaz.
CREATE OR REPLACE FUNCTION public.sifa_v2_f3_hazir()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_regprocedure('public.sifa_blocks_guard_nest()') IS NOT NULL
     AND to_regprocedure('public.sifa_v2_gc_candidates(timestamptz, timestamptz, uuid, integer)') IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.sifa_v2_f3_hazir() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION public.sifa_v2_f3_hazir() FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION public.sifa_v2_f3_hazir() FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN GRANT EXECUTE ON FUNCTION public.sifa_v2_f3_hazir() TO service_role; END IF;
END $$;

COMMIT;
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hedef = process.argv[2];
  if (!hedef) throw new Error("hedef dosya yolu gerekli");
  const i = process.argv.indexOf("--kaynak-rev");
  const rev = i > 0 ? process.argv[i + 1] : "origin/main";
  const lc = execFileSync("git", ["show", `${rev}:${LC_DOSYA}`], { encoding: "utf8" });
  writeFileSync(hedef, ileriSql(lc, path.basename(hedef)));
  console.log(`yazıldı: ${hedef}`);
}
