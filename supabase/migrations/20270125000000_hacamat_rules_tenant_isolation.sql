-- ============================================================
-- 20270125000000_hacamat_rules_tenant_isolation.sql
--
-- KOZMİK AJANDA / HACAMAT — hacamat_rules TENANT İZOLASYONU + RLS KİLİDİ
-- Güvenlik bulgusu: KAJ-P1-03
--
-- SORUN (20260618000000_hacamat_rules.sql):
--   • RLS KAPALI + `grant select,insert,update,delete to anon, authenticated`
--     → herkes (anon publishable key) doğrudan PostgREST ile INSERT/UPDATE/DELETE
--       yapabiliyordu. API'deki admin guard DB katmanında SIFIR koruma sağlıyordu.
--   • tenant_id YOK → tek global liste; her uzman aynı satırları görür/yazardı.
--
-- ÜRÜN KARARI (değişti): HER UZMAN yalnızca KENDİ TENANT'INA ait hacamat kurallarını
--   oluşturur/görür/düzenler/siler. Başka uzmanın kuralı görünmez/değiştirilemez.
--   (Uzman admin YAPILMAZ; bu yetki YALNIZ hacamat kuralları CRUD'una aittir.)
--
-- ÖNCEDEN KABUL EDİLEN YÖN: mevcut GLOBAL (sistem kurucusu/admin) kayıtları sistem
--   SAHİBİNİN gerçek tenant'ına bağlanır. Başka uzmanlara otomatik editable kayıt
--   olarak DAĞITILMAZ (yeni uzman boş başlar, kendi kurallarını oluşturur).
--
-- VERİ KAYBI YASAK: hiçbir satır silinmez; yalnız tenant_id backfill edilir.
-- SAHİPLİK BELİRSİZSE TAHMİN YOK: sistem sahibi (is_super_admin, fallback owner email)
--   çözülemezse migration RAISE EXCEPTION ile DURUR (fail-closed) → owner araştırır.
--
-- Kanonik desen: 20261229000000_nutrition_foods.sql (doğuştan-kilitli RLS) +
--   verifyUserRequest → guard.tenantId (server-side türetilen tenant; body'ye güvenilmez).
--
-- APPLY NOTU: Bu migration owner onayı + PROD YEDEK olmadan uygulanmaz. Uygulama
--   öncesi/sonrası `SELECT tenant_id, count(*) FROM public.hacamat_rules GROUP BY 1`
--   ile satır sayısı/sahiplik doğrulanmalıdır.
-- ============================================================

BEGIN;

-- 1) tenant_id kolonu (önce nullable — backfill için).
ALTER TABLE public.hacamat_rules
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- 2) Sistem sahibinin GERÇEK tenant'ını çöz ve mevcut global satırları ona bağla.
--    Öncelik: is_super_admin = true (en eski). Fallback: owner email (admin@yasamsistemi.com).
--    Çözülemezse (owner yok / tenant_id boş) → DUR (fail-closed, tahmin yok).
DO $$
DECLARE
  owner_tenant uuid;
  orphan_count integer;
BEGIN
  SELECT u.tenant_id INTO owner_tenant
  FROM public.users u
  WHERE u.is_super_admin = true
    AND u.tenant_id IS NOT NULL
  ORDER BY u.created_at ASC
  LIMIT 1;

  IF owner_tenant IS NULL THEN
    SELECT u.tenant_id INTO owner_tenant
    FROM public.users u
    WHERE lower(u.email) = 'admin@yasamsistemi.com'
      AND u.tenant_id IS NOT NULL
    ORDER BY u.created_at ASC
    LIMIT 1;
  END IF;

  -- Backfill edilecek global (tenant_id IS NULL) satır var mı?
  SELECT count(*) INTO orphan_count
  FROM public.hacamat_rules
  WHERE tenant_id IS NULL;

  IF orphan_count > 0 AND owner_tenant IS NULL THEN
    RAISE EXCEPTION
      'hacamat_rules tenant backfill DURDURULDU: sistem sahibi tenant''ı çözülemedi '
      '(is_super_admin ve admin@yasamsistemi.com bulunamadı). % adet global satır var. '
      'Sahiplik netleştirilmeden migration uygulanmamalıdır.', orphan_count
      USING ERRCODE = 'P0001';
  END IF;

  IF orphan_count > 0 THEN
    UPDATE public.hacamat_rules
    SET tenant_id = owner_tenant
    WHERE tenant_id IS NULL;
    RAISE NOTICE 'hacamat_rules: % global satır sistem sahibi tenant''ına (%) bağlandı.',
      orphan_count, owner_tenant;
  END IF;
END $$;

-- 3) Artık her satırın sahibi var → NOT NULL zorunlu kıl.
ALTER TABLE public.hacamat_rules
  ALTER COLUMN tenant_id SET NOT NULL;

-- 4) Kimlik guard: id + tenant_id + created_at değişmez (cross-tenant taşıma engellenir).
CREATE OR REPLACE FUNCTION public.hacamat_rules_identity_guard()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'hacamat_rules identity columns (id, tenant_id, created_at) are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hacamat_rules_identity_guard ON public.hacamat_rules;
CREATE TRIGGER trg_hacamat_rules_identity_guard
  BEFORE UPDATE ON public.hacamat_rules
  FOR EACH ROW EXECUTE FUNCTION public.hacamat_rules_identity_guard();

-- 5) Tenant-kapsamlı sorgu indeksi (GET: tenant + kategori + sıra).
CREATE INDEX IF NOT EXISTS hacamat_rules_tenant_cat_idx
  ON public.hacamat_rules (tenant_id, category, sort_order);

-- 6) DOĞUŞTAN-KİLİTLİ RLS: anon/authenticated DOĞRUDAN erişimi tamamen kaldırılır;
--    tüm erişim service_role kullanan server API üzerinden (tenant session'dan türetilir).
--    Bu, KAJ-P1-03 anon PostgREST write/delete açığını KAPATIR.
ALTER TABLE public.hacamat_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.hacamat_rules FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.hacamat_rules TO service_role;

COMMIT;
