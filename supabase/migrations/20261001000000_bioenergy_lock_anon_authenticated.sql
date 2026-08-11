-- =============================================================================
-- 20261001000000_bioenergy_lock_anon_authenticated.sql
--
-- BİYOENERJİ FAZ 1 — Tarayıcı/publishable DB yüzeyini KAPAT (deny-by-default).
--
-- CANLI PREFLIGHT BULGUSU (production read-only introspection):
--   6 bioenergy_* tablosunda anon ve authenticated rollerine DOĞRUDAN table
--   privilege (SELECT/INSERT/UPDATE/DELETE + REFERENCES/TRIGGER/TRUNCATE) verilmiş;
--   permissive policy'ler (*_select_open USING(true), *_insert/update/delete_no_demo)
--   yalnız DEMO tenant'ı dışlıyordu. Sonuç: publishable/anon key ile cross-tenant
--   OKUMA (R1) + (demo hariç) cross-tenant YAZMA/GÜNCELLEME/SİLME (R2) mümkündü.
--   RLS POLICY ile POSTGRES GRANT ayrı katmanlar olduğundan her ikisi de kapatılır.
--
-- ÇÖZÜM (bu migration):
--   1. anon + authenticated'tan 6 tabloda TÜM table privilege'larını REVOKE et.
--   2. Eski permissive Biyoenerji policy'lerini (select_open + *_no_demo) KALDIR.
--   3. RLS ENABLED kalır. RLS FORCE durumu (mevcut: false) bu fazda DEĞİŞTİRİLMEZ.
--   service_role ve postgres'a DOKUNULMAZ (server erişimi + tablo sahipliği korunur).
--   Başka tablo / şema-seviyesi / global grant / başka modül DEĞİŞTİRİLMEZ.
--
-- SON DURUM:
--   anon/authenticated direct table privilege = YOK
--   cross-tenant permissive Biyoenerji policy = YOK
--   RLS = ENABLED (policy yok → anon/authenticated için deny-by-default)
--   service_role (BYPASSRLS) server erişimi = ÇALIŞIR
--
-- MİMARİ ÖNKOŞUL (aynı PR):
--   Tüm uzman CRUD + admin import + admin workspace sessions read + DOCX rapor +
--   admin→uzman snapshot transfer service_role SERVER route'larından geçer. Tarayıcı
--   doğrudan bioenergy_* erişimine artık İHTİYAÇ DUYMAZ (kod bu PR ile taşındı).
--
-- GERİ ALMA (gerekirse):
--   20260623200000_bioenergy_rls_tenant_isolation.sql yeniden uygulanabilir
--   (SELECT açık + demo-only write policy + anon/authenticated grant geri gelir).
-- =============================================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'bioenergy_sessions',
    'bioenergy_energy_bodies',
    'bioenergy_subconscious_causes',
    'bioenergy_imaginations',
    'bioenergy_symbols',
    'bioenergy_chakras'
  ] LOOP

    -- 1. RLS etkin kalır (idempotent; FORCE durumu değiştirilmez).
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- 2. Eski permissive Biyoenerji policy'lerini kaldır (idempotent).
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select_open', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_insert_no_demo', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_update_no_demo', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_delete_no_demo', tbl);

    -- 3. anon + authenticated'tan TÜM table privilege'larını REVOKE et
    --    (SELECT/INSERT/UPDATE/DELETE + REFERENCES/TRIGGER/TRUNCATE dahil).
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', tbl);

    RAISE NOTICE 'bioenergy locked (deny-by-default browser surface): %', tbl;
  END LOOP;
END
$$;

-- =============================================================================
-- Doğrulama (salt-okunur) — apply sonrası beklenen:
--   (A) 6 tabloda HİÇBİR policy kalmamalı (0 satır).
--   (B) anon/authenticated için HİÇBİR grant kalmamalı (0 satır).
-- =============================================================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'bioenergy%'
ORDER BY tablename, cmd;

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name LIKE 'bioenergy%'
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;
