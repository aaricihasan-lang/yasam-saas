-- ════════════════════════════════════════════════════════════════════════════
-- A4-B — Biyoenerji ATOMİK toplu silme fonksiyonu (forward-only, idempotent)
-- ════════════════════════════════════════════════════════════════════════════
--
-- NEDEN:
--   "Seçilileri Sil" sunucuda `.in("id", ids)` ile PostgREST'e gider; id listesi URL sorgu
--   metnine yazılır. ~750+ UUID URL uzunluk sınırını aşar → 500 (hiçbir şey silinmez).
--   Parça parça (100'lük) DELETE yapmak YASAK: ara bir parça hata verirse YARIM silme olur.
--
-- ÇÖZÜM:
--   id dizisini istek GÖVDESİNDE (RPC parametresi) alan, TEK ifadede silen fonksiyon.
--   Fonksiyon tek bir işlem (transaction) içinde çalışır: herhangi bir hata (ör. tetikleyici)
--   → HİÇBİR satır silinmez (mevcut atomik davranış korunur, sınır kalkar).
--
-- GÜVENLİK:
--   - SECURITY INVOKER (çağıranın yetkisiyle) + sabit search_path.
--   - Yalnız 6 Biyoenerji tablosu (izin listesi); tablo adı format(%I) ile güvenli.
--   - tenant_id ZORUNLU ve her satır için `tenant_id = p_tenant_id` → başka tenant SİLİNEMEZ.
--     (tenant_id API route'unda oturumdan türetilir; istemciden gelmez.)
--   - Üst sınır 5000 id.
--   - EXECUTE yalnız service_role; PUBLIC / anon / authenticated'dan REVOKE.
--
-- Uygulama kodu bu fonksiyon YOKKEN de güvenlidir: fonksiyon bulunamazsa (PGRST202/42883)
-- mevcut tek-ifadeli `.in()` silme yoluna düşer (bugünkü davranışın aynısı).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.bioenergy_delete_rows(
  p_table     text,
  p_tenant_id uuid,
  p_ids       uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_table IS NULL OR p_table NOT IN (
    'bioenergy_sessions',
    'bioenergy_energy_bodies',
    'bioenergy_subconscious_causes',
    'bioenergy_imaginations',
    'bioenergy_symbols',
    'bioenergy_chakras'
  ) THEN
    RAISE EXCEPTION 'bioenergy_delete_rows: izin verilmeyen tablo' USING ERRCODE = '22023';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'bioenergy_delete_rows: tenant zorunlu' USING ERRCODE = '22023';
  END IF;

  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;

  -- cardinality: tüm boyutlardaki eleman sayısı (çok boyutlu dizi ile sınır aşılamaz).
  IF cardinality(p_ids) > 5000 THEN
    RAISE EXCEPTION 'bioenergy_delete_rows: en fazla 5000 kayıt' USING ERRCODE = '22023';
  END IF;

  EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1 AND id = ANY($2)', p_table)
    USING p_tenant_id, p_ids;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bioenergy_delete_rows(text, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bioenergy_delete_rows(text, uuid, uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bioenergy_delete_rows(text, uuid, uuid[]) TO service_role;

-- Doğrulama (aynı işlemde): yalnız service_role EXECUTE.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.bioenergy_delete_rows(text, uuid, uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.bioenergy_delete_rows(text, uuid, uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'A4-B: bioenergy_delete_rows anon/authenticated için çalıştırılabilir kaldı';
  END IF;
END
$$;
