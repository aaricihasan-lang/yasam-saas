-- 2026-10-12 UAT 2. tur (madde F) — Gökyüzü Atlası doğum profili ENVANTERİ. YALNIZ OKUMA (SELECT); hiçbir satırı
-- değiştirmez / silmez. Production'da owner onayıyla, salt-okunur bağlantıda çalıştırılır. Silme bu betikle YAPILMAZ:
-- kesin test profilleri owner'ın KAYIT BAZINDA açık onayıyla uygulamadaki güvenli silme akışından (Profili Sil /
-- arşiv silme akışı; analizler + revizyonlar + notlar birlikte, Danışan Yolculuğu kaydına DOKUNULMAZ) silinir.
--
-- Kullanım: :owner_id = owner kullanıcısının kimliği (psql: \set owner_id '''<uuid>''').
--
-- Sınıflandırma (öneri; son karar owner'ındır):
--   KESIN_TEST  : ad test kalıbına uyar (test/deneme/uat/sentetik/zz_/örnek/silinecek/rapor/çark…) VE Danışan Yolculuğu
--                 bağlantısı yok
--   OLASI_TEST  : analizi yok, Danışan Yolculuğu bağlantısı yok, ad kalıba uymuyor (arşivde hiç görünmeyen boş profil)
--   OLASI_GERCEK: Danışan Yolculuğu kaydına bağlı YA DA test kalıbı dışı adla kayıtlı analizi var → DOKUNULMAZ
WITH p AS (
  SELECT bp.id,
         bp.label,
         bp.client_id,
         c.name                                        AS client_name,
         bp.archived_at,
         bp.created_at,
         bp.updated_at,
         bp.current_revision,
         (SELECT count(*) FROM public.astro_analyses a
           WHERE a.tenant_id = bp.tenant_id AND a.profile_id = bp.id)                       AS analysis_count,
         (SELECT count(*) FROM public.astro_analyses a
           WHERE a.tenant_id = bp.tenant_id AND a.partner_profile_id = bp.id)               AS used_as_partner,
         (SELECT max(a.analysis_at) FROM public.astro_analyses a
           WHERE a.tenant_id = bp.tenant_id AND a.profile_id = bp.id)                       AS last_analysis_at,
         (SELECT r.birth_date FROM public.astro_birth_profile_revisions r
           WHERE r.tenant_id = bp.tenant_id AND r.profile_id = bp.id AND r.revision = bp.current_revision) AS birth_date,
         bp.label ~* '(test|deneme|uat|sentetik|synthetic|^zz_|örnek|ornek|silinecek|rapor |çark|cark|dummy|sample|asdf|qwe|xxx|yyy|^[a-zçğıöşü]{1,3}$)' AS name_looks_test
    FROM public.astro_birth_profiles bp
    LEFT JOIN public.clients c ON c.tenant_id = bp.tenant_id AND c.id = bp.client_id
   WHERE bp.owner_user_id = :owner_id
)
SELECT CASE
         WHEN client_id IS NULL AND name_looks_test THEN 'KESIN_TEST'
         WHEN client_id IS NULL AND analysis_count = 0 AND used_as_partner = 0 THEN 'OLASI_TEST'
         ELSE 'OLASI_GERCEK'
       END                                   AS sinif,
       id, label, client_name, analysis_count, used_as_partner, birth_date, current_revision,
       archived_at IS NOT NULL               AS arsivli,
       created_at, last_analysis_at
  FROM p
 ORDER BY sinif, created_at;
