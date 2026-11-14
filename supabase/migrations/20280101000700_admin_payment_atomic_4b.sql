-- =============================================================================
-- ADMIN ÜYE YÖNETİMİ · AŞAMA 4b (1/2) — ÖDEME KAYDI TEK İŞLEM (ATOMİK)
-- =============================================================================
-- SORUN: app/api/admin/users/[id]/payment ödeme kaydını üç ayrı istekle yazar (users UPDATE → user_payment_history
--   INSERT → admin_audit_log INSERT). Geçmiş yazılamazsa uygulama eski değerleri geri yazmaya ÇALIŞIR (telafi, işlem
--   değil); audit hatasında kullanıcı + geçmiş değişmiş KALIR. Eşzamanlı iki kayıt hedef satırı kilitlemez.
-- ÇÖZÜM: admin_save_member_payment (YENİ) — kullanıcı ödeme alanları + ödeme geçmişi satırı + payment_status_changed
--   audit TEK İŞLEMDE; hedef satır FOR UPDATE ile kilitlenir. Yalnız gerçekten değişen kolonlar yazılır; kilit altında
--   hiçbir alan değişmiyorsa (ör. aynı kaydın eşzamanlı tekrarı) geçmiş / audit YAZILMAZ (changed=false).
--   Yeni muafiyette gerekçe zorunluluğu (PR #779) DB'de de uygulanır. Arşivdeki hesap → UY005 (4a ile aynı anlam;
--   archived_at kolonu yoksa — 4a öncesi şema — kontrol uygulanmaz).
-- DOKUNULMAYAN: mevcut fonksiyonlar, 4a tetikleyicileri, ödeme geçmişi eski satırları, ödeme durum değerleri
--   (normalize EDİLMEZ), paket fiyatları. MEVCUT SATIRLARA DML YOK. Bağımlılık: ödeme kolonları (20271001000300)
--   + admin_audit_log 'payment_status_changed'.
-- GÜVENLİK: SECURITY DEFINER + sabit search_path; EXECUTE yalnız service_role. Aktör DB'de aktif admin doğrulanır.
-- HATA KODLARI: PY400 geçersiz girdi / muafiyet gerekçesi · PY404 kullanıcı yok · UY005 arşivde · 42501 yetki.
-- DEPLOY SIRASI (ZORUNLU): ÖNCE bu migration, SONRA kod. Eski kod bu fonksiyonu kullanmaz (aynen çalışır). Yeni kod
--   bu fonksiyon yokken ödemeyi KAYDETMEZ (hiçbir yazım olmadan hata döner) → kod migration'dan ÖNCE yayınlanmamalı.
-- UYGULAMA: AYRI OWNER ONAYI. Bu PR'da production'a UYGULANMAZ.
-- =============================================================================

BEGIN;

-- ── 0) Ön koşullar (fail-closed) ────────────────────────────────────────────
DO $pre$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO v_missing
    FROM unnest(ARRAY['user_id','payment_status','payment_date','next_payment_date','paid_amount','payment_note',
                      'agreed_fee','billing_period','actor_admin_id']) AS c
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'user_payment_history' AND column_name = c);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '4b on kosul: user_payment_history kolonlari eksik: %', v_missing;
  END IF;
  SELECT string_agg(c, ', ') INTO v_missing
    FROM unnest(ARRAY['payment_status','last_payment_date','next_payment_date','paid_amount','payment_note',
                      'agreed_fee','billing_period']) AS c
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = c);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '4b on kosul: users odeme kolonlari eksik: %', v_missing;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conname = 'admin_audit_action_chk' AND c.conrelid = 'public.admin_audit_log'::regclass
                    AND pg_get_constraintdef(c.oid) LIKE '%''payment_status_changed''%') THEN
    RAISE EXCEPTION '4b on kosul: admin_audit_action_chk payment_status_changed icermiyor';
  END IF;
END
$pre$;

-- ── 1) Ödeme kaydı: kullanıcı + geçmiş + audit TEK İŞLEM ─────────────────────────────────────────────────────
-- p_changes: route'un doğruladığı (validatePaymentDraft) ve önceki duruma göre DEĞİŞEN kolonlar → yeni değer
--   (kolon adları: payment_status, last_payment_date, next_payment_date, paid_amount, payment_note, agreed_fee,
--   billing_period). Değerler hedef kolon tiplerine jsonb_populate_record ile çevrilir (eski kolon tipleri korunur).
-- Kilit altında her kolon yeniden karşılaştırılır; yalnız GERÇEKTEN farklı olanlar yazılır. Hiçbiri farklı değilse
--   hiçbir yazım olmaz (geçmiş / audit YOK) → aynı kaydın tekrarı mükerrer geçmiş üretmez.
-- Geçmiş satırı: kaydedilen SON durumun anlık görüntüsü (buildPaymentHistoryInsertPayload ile aynı eşleme).
-- Audit: payment_status_changed, context = yalnız değişen alan ADLARI (tutar / not DEĞERİ yazılmaz).
CREATE OR REPLACE FUNCTION public.admin_save_member_payment(
  p_actor uuid, p_user_id uuid, p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c_fields  CONSTANT text[] := ARRAY['payment_status','last_payment_date','next_payment_date','paid_amount',
                                     'payment_note','agreed_fee','billing_period'];
  v_actor   public.users%ROWTYPE;
  r         public.users%ROWTYPE;
  v_next    public.users%ROWTYPE;
  v_after   public.users%ROWTYPE;
  v_changed text[] := '{}'::text[];
  v_key     text;
  v_hist    jsonb;
BEGIN
  IF p_actor IS NULL OR p_user_id IS NULL OR p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN
    RAISE EXCEPTION 'admin_save_member_payment: eksik parametre' USING ERRCODE = 'PY400';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_changes) LOOP
    IF NOT v_key = ANY (c_fields) THEN
      RAISE EXCEPTION 'admin_save_member_payment: gecersiz alan %', v_key USING ERRCODE = 'PY400';
    END IF;
  END LOOP;

  SELECT * INTO v_actor FROM public.users WHERE id = p_actor;
  IF NOT FOUND OR lower(coalesce(v_actor.role,'')) <> 'admin' OR v_actor.active IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_save_member_payment: yetkisiz aktor' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_save_member_payment: kullanici bulunamadi' USING ERRCODE = 'PY404';
  END IF;
  IF (to_jsonb(r) ->> 'archived_at') IS NOT NULL THEN
    RAISE EXCEPTION 'admin_save_member_payment: hesap arsivde' USING ERRCODE = 'UY005';
  END IF;

  v_next := jsonb_populate_record(r, p_changes);
  IF p_changes ? 'payment_status'    AND v_next.payment_status    IS DISTINCT FROM r.payment_status    THEN v_changed := array_append(v_changed, 'payment_status'); END IF;
  IF p_changes ? 'last_payment_date' AND v_next.last_payment_date IS DISTINCT FROM r.last_payment_date THEN v_changed := array_append(v_changed, 'last_payment_date'); END IF;
  IF p_changes ? 'next_payment_date' AND v_next.next_payment_date IS DISTINCT FROM r.next_payment_date THEN v_changed := array_append(v_changed, 'next_payment_date'); END IF;
  IF p_changes ? 'paid_amount'       AND v_next.paid_amount       IS DISTINCT FROM r.paid_amount       THEN v_changed := array_append(v_changed, 'paid_amount'); END IF;
  IF p_changes ? 'payment_note'      AND v_next.payment_note      IS DISTINCT FROM r.payment_note      THEN v_changed := array_append(v_changed, 'payment_note'); END IF;
  IF p_changes ? 'agreed_fee'        AND v_next.agreed_fee        IS DISTINCT FROM r.agreed_fee        THEN v_changed := array_append(v_changed, 'agreed_fee'); END IF;
  IF p_changes ? 'billing_period'    AND v_next.billing_period    IS DISTINCT FROM r.billing_period    THEN v_changed := array_append(v_changed, 'billing_period'); END IF;

  IF coalesce(array_length(v_changed, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'fields', '[]'::jsonb);
  END IF;

  -- PR #779 kuralı DB'de de: YENİ muafiyete geçişte (önceki durum muaf DEĞİLKEN) gerekçe (payment_note) zorunlu.
  IF 'payment_status' = ANY (v_changed)
     AND lower(btrim(coalesce(v_next.payment_status, ''))) = 'exempt'
     AND lower(btrim(coalesce(r.payment_status, ''))) <> 'exempt'
     AND btrim(coalesce(v_next.payment_note, '')) = '' THEN
    RAISE EXCEPTION 'admin_save_member_payment: muafiyet gerekcesi zorunlu' USING ERRCODE = 'PY400';
  END IF;

  UPDATE public.users SET
    payment_status    = CASE WHEN 'payment_status'    = ANY (v_changed) THEN v_next.payment_status    ELSE payment_status END,
    last_payment_date = CASE WHEN 'last_payment_date' = ANY (v_changed) THEN v_next.last_payment_date ELSE last_payment_date END,
    next_payment_date = CASE WHEN 'next_payment_date' = ANY (v_changed) THEN v_next.next_payment_date ELSE next_payment_date END,
    paid_amount       = CASE WHEN 'paid_amount'       = ANY (v_changed) THEN v_next.paid_amount       ELSE paid_amount END,
    payment_note      = CASE WHEN 'payment_note'      = ANY (v_changed) THEN v_next.payment_note      ELSE payment_note END,
    agreed_fee        = CASE WHEN 'agreed_fee'        = ANY (v_changed) THEN v_next.agreed_fee        ELSE agreed_fee END,
    billing_period    = CASE WHEN 'billing_period'    = ANY (v_changed) THEN v_next.billing_period    ELSE billing_period END
  WHERE id = p_user_id
  RETURNING * INTO v_after;

  v_hist := jsonb_build_object(
    'user_id', p_user_id,
    'payment_status', to_jsonb(v_after.payment_status),
    'payment_date', to_jsonb(v_after.last_payment_date),
    'next_payment_date', to_jsonb(v_after.next_payment_date),
    'paid_amount', to_jsonb(v_after.paid_amount),
    'payment_note', to_jsonb(v_after.payment_note),
    'agreed_fee', to_jsonb(v_after.agreed_fee),
    'billing_period', to_jsonb(v_after.billing_period),
    'actor_admin_id', p_actor);
  INSERT INTO public.user_payment_history
    (user_id, payment_status, payment_date, next_payment_date, paid_amount, payment_note, agreed_fee, billing_period, actor_admin_id)
  SELECT h.user_id, h.payment_status, h.payment_date, h.next_payment_date, h.paid_amount, h.payment_note,
         h.agreed_fee, h.billing_period, h.actor_admin_id
    FROM jsonb_populate_record(NULL::public.user_payment_history, v_hist) h;

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, context)
  VALUES
    (p_actor, coalesce(v_actor.is_super_admin, false), p_user_id, 'payment_status_changed',
     jsonb_build_object('fields', to_jsonb(v_changed)));

  RETURN jsonb_build_object('ok', true, 'changed', true, 'fields', to_jsonb(v_changed));
END;
$$;

-- ── 2) EXECUTE kilidi: yalnız service_role ───────────────────────────────────
REVOKE ALL ON FUNCTION public.admin_save_member_payment(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_member_payment(uuid,uuid,jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- DOĞRULAMA (salt-okunur): prosecdef = t; has_function_privilege('anon','public.admin_save_member_payment(uuid,uuid,jsonb)','EXECUTE') = false.
-- GERİ ALMA (yalnız Owner kararıyla): önce ödeme route'u eski koda döndürülür, sonra DROP FUNCTION.
