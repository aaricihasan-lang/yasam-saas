-- =============================================================================
-- AŞAMA 4a · ESKİ ARŞİV KAYITLARININ AKTARIMI — YALNIZ OWNER'IN AYRI VE AÇIK ONAYIYLA
-- =============================================================================
-- BU BİR MİGRATION DEĞİLDİR; otomatik çalışmaz. Varsayılan son satır ROLLBACK'tir (kuru prova).
-- Ön koşul: 20280101000600_admin_member_archive_state.sql uygulanmış olmalı.
--
-- Kapsam (en dar, kanıta dayalı seçenek "A"):
--   onaylı uzman ∧ active=false ∧ archived_at IS NULL ∧ demo değil ∧
--   yönetim geçmişindeki EN SON durum olayı 'user_archived' (yani eski sistemde açıkça "Pasife Al ve Arşivle").
--   'user_deactivated' ile kapatılmış ya da hiç olay kaydı olmayan hesaplar DOKUNULMADAN "Pasif" kalır.
-- archived_at = o arşiv olayının kendi zamanı (yeni tarih uydurulmaz). active, paket, deneme, ödeme, modül,
--   onay ve oturum alanlarına DOKUNULMAZ. Her aktarılan hesap için 'user_archived' audit satırı yazılır
--   (context.backfill = true, kaynak olay kimliği) — geçmiş olaylar silinmez/değişmez.
--
-- Çalıştırma: psql ile tek işlem. Çıktıdaki "aktarilacak" sayısı salt-okunur raporla (legacy-archive-readonly.sql,
--   son_olay = user_archived, demo = false) AYNI olmalı; değilse ROLLBACK bırakın ve durun.
-- Gerçek uygulama: Owner onayıyla son satırdaki ROLLBACK → COMMIT yapılır. Aktör: ana yönetici (is_super_admin) kimliği
--   :'actor' değişkeniyle verilir: psql -v actor=<uuid> -f legacy-archive-backfill.sql
-- =============================================================================
BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'archived_at') THEN
    RAISE EXCEPTION 'archived_at kolonu yok: once 20280101000600 migration uygulanmali';
  END IF;
END
$guard$;

SELECT set_config('uye4a.actor', :'actor', true);

DO $actor$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users
                  WHERE id = current_setting('uye4a.actor')::uuid AND lower(coalesce(role, '')) = 'admin'
                    AND active IS TRUE AND coalesce(is_super_admin, false)) THEN
    RAISE EXCEPTION 'aktor ana yonetici degil';
  END IF;
END
$actor$;

CREATE TEMP TABLE uye4a_aday ON COMMIT DROP AS
WITH last_evt AS (
  SELECT DISTINCT ON (a.target_user_id) a.target_user_id, a.id AS evt_id, a.action, a.created_at
    FROM public.admin_audit_log a
   WHERE a.action IN ('user_deactivated', 'user_archived', 'user_activated')
   ORDER BY a.target_user_id, a.created_at DESC, a.id DESC
)
SELECT u.id, l.evt_id, l.created_at AS archived_at
  FROM public.users u
  JOIN last_evt l ON l.target_user_id = u.id
 WHERE lower(coalesce(u.role, '')) = 'expert'
   AND lower(coalesce(u.approval_status, '')) = 'approved'
   AND u.active IS NOT TRUE
   AND u.archived_at IS NULL
   AND coalesce(u.is_demo_account, false) = false
   AND l.action = 'user_archived';

SELECT count(*)::int AS aktarilacak FROM uye4a_aday;

UPDATE public.users u
   SET archived_at = c.archived_at
  FROM uye4a_aday c
 WHERE u.id = c.id AND u.archived_at IS NULL AND u.active IS NOT TRUE;

INSERT INTO public.admin_audit_log
  (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
SELECT current_setting('uye4a.actor')::uuid, true, c.id, 'user_archived',
       jsonb_build_object('active', false, 'archived', false),
       jsonb_build_object('active', false, 'archived', true),
       jsonb_build_object('backfill', true, 'source_audit_id', c.evt_id)
  FROM uye4a_aday c;

-- Doğrulama (toplu): aktarılan = aday; aktif hesap arşive girmedi; başka alan değişmedi (yalnız archived_at yazıldı).
SELECT (SELECT count(*) FROM public.users u JOIN uye4a_aday c ON c.id = u.id WHERE u.archived_at IS NOT NULL)::int AS aktarilan,
       (SELECT count(*) FROM public.users WHERE archived_at IS NOT NULL AND active IS TRUE)::int           AS aktif_arsiv_ihlali;

ROLLBACK; -- Owner onayıyla COMMIT yapılır.
