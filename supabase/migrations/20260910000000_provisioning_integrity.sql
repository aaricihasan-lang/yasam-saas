-- =============================================================================
-- 20260910000000_provisioning_integrity.sql
--
-- BF-11F-B — PROVISIONING INTEGRITY HARDENING (uzman + tenant atomik oluşturma)
--
-- KAPSAM (yalnız ADDITIVE):
--   1. FAIL-CLOSED schema contract gate (users/tenants/admin_audit_log + beklenen
--      PK/UNIQUE/FK yoksa migration DURUR — sessiz atlama YOK).
--   2. UNIQUE INDEX users (lower(btrim(email)))  → normalized email tekilliği.
--   3. CHECK users.role IN ('admin','expert')     → rol allowlist (0 invalid → güvenli).
--   4. public.provisioning_events                 → PII-DIŞI append-only self-signup kanıtı.
--   5. public.provision_expert(jsonb)             → TEK TRANSACTION tenant+user(+audit/event).
--   6. EXECUTE kilidi: service_role-only.
--
-- BU MIGRATION:
--   - public.users / public.tenants BASELINE CREATE TABLE YAZMAZ (drift örtme YASAK).
--   - Mevcut users_pkey/users_email_key/users_tenant_id_fkey/tenants_pkey/tenants_slug_key'i
--     YENİDEN OLUŞTURMAZ (yalnız fail-closed doğrular).
--   - admin_audit_log tablosunu/trigger'ını yeniden oluşturmaz (20260903000000'a bağımlı).
--   - Legacy users.password kolonuna YAZMAZ; yalnız password_hash.
--   - yasam_hafizasi_flags'e YAZMAZ (YH default KAPALI korunur).
--   - Demo/sentetik tenant'ı yeni uzmana bağlamaz/fallback yapmaz.
--
-- BAĞIMLILIK: public.admin_audit_log (migration 20260903000000) ÖNCE uygulanmalıdır;
--   yoksa fail-closed gate DURUR.
--
-- UYGULAMA: Supabase Dashboard SQL Editor (bu turda UYGULANMAZ; production'a dokunulmaz).
-- IDEMPOTENT: CREATE ... IF NOT EXISTS / CREATE OR REPLACE / guarded ADD CONSTRAINT.
-- =============================================================================

BEGIN;

-- ─── 0) FAIL-CLOSED schema contract gate ──────────────────────────────────────
DO $gate$
BEGIN
  IF to_regclass('public.users') IS NULL THEN RAISE EXCEPTION 'BF-11F-B: public.users yok'; END IF;
  IF to_regclass('public.tenants') IS NULL THEN RAISE EXCEPTION 'BF-11F-B: public.tenants yok'; END IF;
  IF to_regclass('public.admin_audit_log') IS NULL THEN
    RAISE EXCEPTION 'BF-11F-B: public.admin_audit_log yok (20260903000000 ONCE uygulanmali)';
  END IF;
  -- Beklenen kolonlar.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users'
                 AND column_name='email') THEN RAISE EXCEPTION 'BF-11F-B: users.email yok'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users'
                 AND column_name='password_hash') THEN RAISE EXCEPTION 'BF-11F-B: users.password_hash yok'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users'
                 AND column_name='tenant_id') THEN RAISE EXCEPTION 'BF-11F-B: users.tenant_id yok'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants'
                 AND column_name='slug') THEN RAISE EXCEPTION 'BF-11F-B: tenants.slug yok'; END IF;
  -- Beklenen mevcut constraint'ler (yeniden oluşturulmaz; yoksa DUR).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.users'::regclass AND contype='u' AND conname='users_email_key') THEN
    RAISE EXCEPTION 'BF-11F-B: users_email_key (UNIQUE email) beklenirken yok'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.users'::regclass AND contype='f'
                 AND pg_get_constraintdef(oid) ILIKE '%tenant_id%tenants%') THEN
    RAISE EXCEPTION 'BF-11F-B: users.tenant_id -> tenants FK beklenirken yok'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.tenants'::regclass AND contype='u' AND conname='tenants_slug_key') THEN
    RAISE EXCEPTION 'BF-11F-B: tenants_slug_key (UNIQUE slug) beklenirken yok'; END IF;
  -- Normalized email tekilliği için mevcut ihlal olmamalı (fail-closed).
  IF EXISTS (SELECT 1 FROM (SELECT lower(btrim(email)) k FROM public.users
                            WHERE email IS NOT NULL AND btrim(email)<>'' GROUP BY 1 HAVING count(*)>1) d) THEN
    RAISE EXCEPTION 'BF-11F-B: normalized email duplicate mevcut — once cleanup gerekir';
  END IF;
  -- role CHECK için mevcut ihlal olmamalı.
  IF EXISTS (SELECT 1 FROM public.users WHERE role IS NULL OR role NOT IN ('admin','expert')) THEN
    RAISE EXCEPTION 'BF-11F-B: users.role admin/expert disi deger mevcut — once cleanup gerekir';
  END IF;
END
$gate$;

-- ─── 1) Normalized email UNIQUE index (mevcut exact users_email_key korunur) ───
-- Register/admin/login akışları e-postayı lower(btrim(...)) normalize eder; bu index
-- case/whitespace varyantı duplicate'i DB-seviyesinde engeller.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_uidx
  ON public.users (lower(btrim(email)));

-- ─── 2) role allowlist CHECK (0 invalid → güvenli; NOT VALID kullanılmaz) ──────
-- NULL invariant: PostgreSQL CHECK, NULL sonucu (unknown) veren satırı KABUL eder;
-- bu nedenle `role IN (...)` tek başına gelecekteki NULL rolü reddetmez. Fail-closed
-- için açık `role IS NOT NULL` şartı eklenir (mevcut census: role null = 0).
DO $rolechk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.users'::regclass AND conname='users_role_allowlist_chk') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_role_allowlist_chk
      CHECK (role IS NOT NULL AND role IN ('admin','expert'));
  END IF;
END
$rolechk$;

-- ─── 3) provisioning_events (PII-DIŞI, append-only, service_role-only) ─────────
CREATE TABLE IF NOT EXISTS public.provisioning_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       uuid        NOT NULL UNIQUE,          -- correlation + idempotency
  origin           text        NOT NULL,
  outcome          text        NOT NULL,
  target_user_id   uuid        REFERENCES public.users(id)   ON DELETE SET NULL,
  target_tenant_id uuid        REFERENCES public.tenants(id) ON DELETE SET NULL,
  metadata         jsonb,                                -- bounded, PII/secret YASAK
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provisioning_events_origin_chk  CHECK (origin  IN ('public_register','admin_create')),
  CONSTRAINT provisioning_events_outcome_chk CHECK (outcome IN ('provisioned','already_exists','conflict'))
);
COMMENT ON TABLE public.provisioning_events IS
  'BF-11F-B — PII-DISI append-only provisioning correlation/idempotency kanit tablosu (self-signup icin admin actor uydurulmaz).';

CREATE INDEX IF NOT EXISTS idx_provisioning_events_created ON public.provisioning_events(created_at DESC);

-- Append-only (UPDATE/DELETE engeli) — admin_audit_log deseniyle aynı.
-- search_path sabit ve pg_catalog-öncelikli (public ilk öğe DEĞİL); gövde yalnız
-- RAISE + trigger değişkeni kullanır (schema-nitelikli uygulama nesnesi yok).
CREATE OR REPLACE FUNCTION public.provisioning_events_prevent_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'provisioning_events append-only: % engellendi', TG_OP USING ERRCODE='check_violation';
END;
$$;
DROP TRIGGER IF EXISTS trg_provisioning_events_no_update ON public.provisioning_events;
CREATE TRIGGER trg_provisioning_events_no_update BEFORE UPDATE ON public.provisioning_events
  FOR EACH ROW EXECUTE FUNCTION public.provisioning_events_prevent_mutation();
DROP TRIGGER IF EXISTS trg_provisioning_events_no_delete ON public.provisioning_events;
CREATE TRIGGER trg_provisioning_events_no_delete BEFORE DELETE ON public.provisioning_events
  FOR EACH ROW EXECUTE FUNCTION public.provisioning_events_prevent_mutation();

REVOKE ALL ON TABLE public.provisioning_events FROM anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.provisioning_events TO service_role;
ALTER TABLE public.provisioning_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_provisioning_events" ON public.provisioning_events;
CREATE POLICY "service_role_provisioning_events" ON public.provisioning_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 4) provision_expert — TEK TRANSACTION atomik tenant+user(+audit/event) ────
-- SECURITY DEFINER search_path: pg_catalog ÖNCE (public ilk öğe OLAMAZ) → built-in
-- fonksiyonlar (lower/btrim/gen_random_uuid/md5/now/jsonb_*) güvenle pg_catalog'tan
-- çözülür; tüm UYGULAMA nesneleri (users/tenants/admin_audit_log/provisioning_events)
-- gövdede `public.` ile schema-nitelikli yazılır.
CREATE OR REPLACE FUNCTION public.provision_expert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  c_demo  constant uuid := '40f842a0-e3e8-448c-8971-9a938e1faccb';
  c_synth constant uuid := 'aa8b960b-f4f1-4e5b-89f5-109bc030c147';

  v_mode        text := p_payload->>'mode';
  v_email       text := lower(btrim(coalesce(p_payload->>'email','')));
  v_pwhash      text := p_payload->>'password_hash';
  v_fullname    text := nullif(btrim(coalesce(p_payload->>'full_name','')), '');
  v_tname       text := nullif(btrim(coalesce(p_payload->>'tenant_name','')), '');
  v_slugbase    text := nullif(btrim(coalesce(p_payload->>'tenant_slug_base','')), '');
  v_reqid       uuid := coalesce((p_payload->>'request_id')::uuid, gen_random_uuid());
  v_origin      text;
  v_role        text;
  v_active      boolean;
  v_approval    text;
  v_modperms    jsonb;
  v_bind_digest text;
  v_actor       uuid;
  v_actor_role  text;
  v_actor_active boolean;
  v_actor_level text;
  v_actor_main  boolean := false;
  v_existing    uuid;
  -- idempotency replay/eşdeğerlik durumu
  v_prior_outcome text;
  v_prior_origin  text;
  v_prior_uid     uuid;
  v_prior_tid     uuid;
  v_prior_meta    jsonb;
  v_prior_found   boolean := false;
  v_target_email  text;
  v_tenant_id   uuid := gen_random_uuid();
  v_user_id     uuid;
  v_slug        text;
  v_slug_ok     boolean := false;
  i             integer;
BEGIN
  -- Mod allowlist.
  IF v_mode IS NULL OR v_mode NOT IN ('public','admin') THEN
    RAISE EXCEPTION 'provision_expert: gecersiz mode';
  END IF;
  -- Ortak fail-closed doğrulama.
  IF v_email = '' OR position('@' in v_email) = 0 THEN RAISE EXCEPTION 'provision_expert: gecersiz email'; END IF;
  IF v_pwhash IS NULL OR length(btrim(v_pwhash)) = 0 THEN RAISE EXCEPTION 'provision_expert: password_hash zorunlu'; END IF;
  IF v_tname IS NULL THEN RAISE EXCEPTION 'provision_expert: tenant_name zorunlu'; END IF;
  IF v_slugbase IS NULL THEN v_slugbase := 'uzman'; END IF;
  IF v_tenant_id IN (c_demo, c_synth) THEN RAISE EXCEPTION 'provision_expert: uretilen tenant kanonik'; END IF;
  v_origin := CASE WHEN v_mode = 'public' THEN 'public_register' ELSE 'admin_create' END;

  -- Mode-özel server-forced default'lar (client bunları belirleyemez).
  IF v_mode = 'public' THEN
    v_role := 'expert'; v_active := false; v_approval := 'pending';
    v_actor := NULL;
  ELSE
    v_role := CASE WHEN (p_payload->>'role') = 'admin' THEN 'admin' ELSE 'expert' END;
    v_active := coalesce((p_payload->>'active')::boolean, true);
    v_approval := CASE WHEN v_active THEN 'approved' ELSE 'pending' END;
    v_actor := (p_payload->>'actor_admin_id')::uuid;
    IF v_actor IS NULL THEN RAISE EXCEPTION 'provision_expert: admin mode actor_admin_id zorunlu'; END IF;
    -- DB defense-in-depth: actor gerçekten admin + aktif mi?
    SELECT role, active, admin_level INTO v_actor_role, v_actor_active, v_actor_level
      FROM public.users WHERE id = v_actor;
    IF NOT FOUND THEN RAISE EXCEPTION 'provision_expert: actor bulunamadi'; END IF;
    IF v_actor_role IS DISTINCT FROM 'admin' OR v_actor_active IS NOT TRUE THEN
      RAISE EXCEPTION 'provision_expert: actor admin/aktif degil';
    END IF;
    v_actor_main := (coalesce(lower(btrim(v_actor_level)),'') = 'owner');
  END IF;

  -- module_permissions yalnız expert için; jsonb object doğrulaması.
  IF v_role = 'expert' THEN
    v_modperms := p_payload->'module_permissions';
    IF v_modperms IS NULL OR jsonb_typeof(v_modperms) <> 'object' THEN
      RAISE EXCEPTION 'provision_expert: module_permissions gecersiz';
    END IF;
  ELSE
    v_modperms := NULL;
  END IF;

  -- Idempotency payload-binding digest: provisioning davranışını belirleyen NON-PII
  -- alanların kanonik parmak izi. E-POSTA/HASH DAHİL EDİLMEZ (event tablosuna PII/
  -- email-hash yazma yasağı) — e-posta eşdeğerliği ayrıca target_user üzerinden okunur.
  v_bind_digest := md5(
    coalesce(v_mode,'')     || '|' || coalesce(v_role,'')       || '|' ||
    coalesce(v_active::text,'') || '|' || coalesce(v_approval,'') || '|' ||
    coalesce(md5(v_modperms::text),'none')
  );

  -- Idempotency eşdeğerlik kapısı: aynı request_id daha önce işlendiyse YALNIZCA
  -- kanonik istek birebir eşdeğerse (origin + bind_digest + target_user normalize
  -- email) önceki güvenli sonucu döndür. Aksi halde MUTASYONSUZ deterministik
  -- idempotency_key_conflict (yeni tenant/user/event/audit YOK; fail-closed).
  SELECT pe.outcome, pe.origin, pe.target_user_id, pe.target_tenant_id, pe.metadata, true
    INTO v_prior_outcome, v_prior_origin, v_prior_uid, v_prior_tid, v_prior_meta, v_prior_found
    FROM public.provisioning_events pe WHERE pe.request_id = v_reqid;
  IF v_prior_found THEN
    v_target_email := NULL;
    IF v_prior_uid IS NOT NULL THEN
      SELECT lower(btrim(email)) INTO v_target_email FROM public.users WHERE id = v_prior_uid;
    END IF;
    IF v_prior_origin IS NOT DISTINCT FROM v_origin
       AND (v_prior_meta->>'bind_digest') IS NOT DISTINCT FROM v_bind_digest
       AND v_target_email IS NOT NULL
       AND v_target_email = v_email THEN
      RETURN jsonb_build_object('ok', (v_prior_outcome = 'provisioned'), 'outcome', v_prior_outcome,
                                'user_id', v_prior_uid, 'tenant_id', v_prior_tid,
                                'request_id', v_reqid, 'idempotent_replay', true);
    END IF;
    -- Eşdeğerlik kanıtlanamadı (farklı email/mode/role/default veya silinmiş/null target).
    RETURN jsonb_build_object('ok', false, 'outcome', 'idempotency_key_conflict',
                              'user_id', NULL, 'tenant_id', NULL, 'request_id', v_reqid);
  END IF;

  -- Duplicate e-posta (normalize) ön-kontrol → tenant OLUŞTURMADAN already_exists.
  SELECT id INTO v_existing FROM public.users WHERE lower(btrim(email)) = v_email LIMIT 1;
  IF v_existing IS NOT NULL THEN
    INSERT INTO public.provisioning_events(request_id, origin, outcome, target_user_id, metadata)
      VALUES (v_reqid, v_origin, 'already_exists', v_existing,
              jsonb_build_object('mode', v_mode, 'role', v_role, 'active', v_active, 'bind_digest', v_bind_digest));
    RETURN jsonb_build_object('ok', false, 'outcome','already_exists','user_id', v_existing,
                              'tenant_id', NULL, 'request_id', v_reqid);
  END IF;

  -- Tenant INSERT (slug race-safe: base, sonra bounded suffix; UNIQUE(slug) otorite).
  FOR i IN 1..5 LOOP
    v_slug := CASE WHEN i=1 THEN left(v_slugbase,48)
                   ELSE left(v_slugbase,40) || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6) END;
    BEGIN
      INSERT INTO public.tenants(id, name, slug, status, created_at)
        VALUES (v_tenant_id, v_tname, v_slug, 'active', now());
      v_slug_ok := true; EXIT;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;  -- slug çakışması → sonraki aday (tenant satırı oluşmadı)
    END;
  END LOOP;
  IF NOT v_slug_ok THEN RAISE EXCEPTION 'provision_expert: benzersiz slug uretilemedi'; END IF;

  -- User INSERT (aynı transaction). İki-dal: mevcut route kolon-set davranışını
  -- BİREBİR korur (expert → module_permissions + trial açık; admin → DB default'lar).
  -- Email yarışı → savepoint rollback + tenant geri al (ORPHAN YOK).
  v_user_id := gen_random_uuid();
  BEGIN
    IF v_role = 'expert' THEN
      INSERT INTO public.users(
        id, full_name, email, password_hash, role, active, approval_status,
        module_permissions, tenant_id, plan, subscription_status, trial_started_at, trial_ends_at
      ) VALUES (
        v_user_id, v_fullname, v_email, v_pwhash, 'expert', v_active, v_approval,
        v_modperms, v_tenant_id, 'trial', 'trial', now(), now() + interval '7 days'
      );
    ELSE
      -- admin: module_permissions + plan/subscription/trial DB default'una bırakılır
      -- (mevcut admin create route bunları PAYLOAD'a KOYMAZ → drift YOK). Legacy
      -- users.password kolonuna YAZILMAZ.
      INSERT INTO public.users(
        id, full_name, email, password_hash, role, active, approval_status, tenant_id
      ) VALUES (
        v_user_id, v_fullname, v_email, v_pwhash, 'admin', v_active, v_approval, v_tenant_id
      );
    END IF;
  EXCEPTION WHEN unique_violation THEN
    -- Eşzamanlı aynı-email: bu transaction'daki tenant'ı geri al (ORPHAN YOK).
    DELETE FROM public.tenants WHERE id = v_tenant_id;
    SELECT id INTO v_existing FROM public.users WHERE lower(btrim(email)) = v_email LIMIT 1;
    INSERT INTO public.provisioning_events(request_id, origin, outcome, target_user_id, metadata)
      VALUES (v_reqid, v_origin, 'already_exists', v_existing,
              jsonb_build_object('mode', v_mode, 'role', v_role, 'active', v_active, 'race', true, 'bind_digest', v_bind_digest));
    RETURN jsonb_build_object('ok', false, 'outcome','already_exists','user_id', v_existing,
                              'tenant_id', NULL, 'request_id', v_reqid);
  END;

  -- Admin mode: aynı transaction'da admin_audit_log (PII-DISI metadata).
  IF v_mode = 'admin' THEN
    INSERT INTO public.admin_audit_log(actor_admin_id, actor_is_main_admin, target_user_id, action, new_value, context)
      VALUES (v_actor, v_actor_main, v_user_id, 'user_created',
              jsonb_build_object('role', v_role, 'active', v_active, 'approval_status', v_approval),
              jsonb_build_object('source','provision_expert','request_id', v_reqid));
  END IF;

  -- Her iki mod: append-only provisioning event (PII yok; idempotency bind_digest dahil).
  INSERT INTO public.provisioning_events(request_id, origin, outcome, target_user_id, target_tenant_id, metadata)
    VALUES (v_reqid, v_origin, 'provisioned', v_user_id, v_tenant_id,
            jsonb_build_object('mode', v_mode, 'role', v_role, 'active', v_active, 'bind_digest', v_bind_digest));

  RETURN jsonb_build_object('ok', true, 'outcome','provisioned','user_id', v_user_id,
                            'tenant_id', v_tenant_id, 'request_id', v_reqid, 'role', v_role, 'active', v_active);
END;
$fn$;

-- ─── 5) EXECUTE kilidi: yalnız service_role ───────────────────────────────────
REVOKE ALL ON FUNCTION public.provision_expert(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_expert(jsonb) TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen; RPC ÇAĞIRMA, catalog kullan):
--   SELECT indexdef FROM pg_indexes WHERE indexname='users_email_normalized_uidx';       -- lower(btrim(email))
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='users_role_allowlist_chk';
--     -- CHECK ((role IS NOT NULL) AND (role = ANY (ARRAY['admin','expert'])))
--   SELECT prosecdef, proconfig FROM pg_proc WHERE proname='provision_expert';
--     -- t, {"search_path=pg_catalog, public"}  (public İLK ÖĞE DEĞİL)
--   SELECT proconfig FROM pg_proc WHERE proname='provisioning_events_prevent_mutation';   -- {search_path=pg_catalog}
--   SELECT has_function_privilege('anon','public.provision_expert(jsonb)','EXECUTE');     -- false
--   SELECT relrowsecurity FROM pg_class WHERE relname='provisioning_events';              -- true
--   SELECT has_table_privilege('anon','public.provisioning_events','SELECT');             -- false
-- =============================================================================
