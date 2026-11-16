-- GİRİŞ GÜVENLİĞİ F2-D fixture eki (yerel embedded-pg; prod'a temas YOK; sentetik kullanıcılar).
-- f2c fixture'ındaki admin_notifications'a prod 20280101000400'ün "tek açık karar" kısmi UNIQUE index'i,
-- okundu tablosu ve Owner bildirim geçmişi fonksiyonunun PROD sürümü (20280101000400 gövdesi birebir)
-- eklenir: 000400'ün tür listesi genişletmesi gerçek gövde üzerinde sınanır.
CREATE UNIQUE INDEX IF NOT EXISTS admin_notifications_one_open_action_uidx
  ON public.admin_notifications (type, target_user_id) WHERE kind = 'action' AND resolved_at IS NULL;
CREATE TABLE IF NOT EXISTS public.admin_notification_reads (
  notification_id bigint NOT NULL REFERENCES public.admin_notifications(id) ON DELETE CASCADE,
  admin_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, admin_id)
);
CREATE OR REPLACE FUNCTION public.admin_notif_assert_owner(p_actor uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.users
        WHERE id = p_actor AND lower(coalesce(role,'')) = 'admin' AND active IS TRUE
          AND coalesce(is_super_admin, false) IS TRUE) THEN
    RAISE EXCEPTION 'admin_notifications: yalniz owner' USING ERRCODE = 'AN401';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_notification_history(
  p_actor uuid, p_q text, p_type text, p_status text, p_from timestamptz, p_to timestamptz,
  p_limit integer, p_offset integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_q      text := nullif(lower(btrim(coalesce(p_q, ''))), '');
  v_type   text := coalesce(nullif(p_type, ''), 'all');
  v_status text := coalesce(nullif(p_status, ''), 'all');
  v_limit  integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_out    jsonb;
BEGIN
  PERFORM public.admin_notif_assert_owner(p_actor);
  IF v_type NOT IN ('all','basvuru','pro_talebi','inceleme','eski_kayit','odeme','deneme_basladi','deneme_bitti')
     OR v_status NOT IN ('all','open','resolved','unread','read') THEN
    RAISE EXCEPTION 'admin_notification_history: gecersiz filtre' USING ERRCODE = 'AN400';
  END IF;
  IF v_q IS NOT NULL THEN
    v_q := replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_');
  END IF;
  WITH base AS (
    SELECT n.*, coalesce(nullif(btrim(u.full_name), ''), u.email) AS full_name, u.email,
           EXISTS (SELECT 1 FROM public.admin_notification_reads r WHERE r.notification_id = n.id AND r.admin_id = p_actor) AS is_read
      FROM public.admin_notifications n LEFT JOIN public.users u ON u.id = n.target_user_id
     WHERE (v_type = 'all' OR n.type = v_type)
       AND (p_from IS NULL OR n.occurred_at >= p_from)
       AND (p_to IS NULL OR n.occurred_at < p_to)
       AND (v_q IS NULL OR lower(coalesce(u.full_name, '')) LIKE '%' || v_q || '%' ESCAPE '\'
                        OR lower(coalesce(u.email, '')) LIKE '%' || v_q || '%' ESCAPE '\')
  ), filtered AS (
    SELECT * FROM base
     WHERE CASE v_status
             WHEN 'open'     THEN kind = 'action' AND resolved_at IS NULL
             WHEN 'resolved' THEN kind = 'action' AND resolved_at IS NOT NULL
             WHEN 'unread'   THEN kind = 'info' AND NOT is_read
             WHEN 'read'     THEN kind = 'info' AND is_read
             ELSE true END
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
               'id', f.id, 'kind', f.kind, 'type', f.type, 'target_user_id', f.target_user_id,
               'full_name', f.full_name, 'email', f.email, 'occurred_at', f.occurred_at,
               'resolved_at', f.resolved_at, 'resolution', f.resolution, 'read', f.is_read)
               ORDER BY f.occurred_at DESC, f.id DESC)
               FROM (SELECT * FROM filtered ORDER BY occurred_at DESC, id DESC LIMIT v_limit OFFSET v_offset) f), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered))
  INTO v_out;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_notification_history(uuid, text, text, text, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notification_history(uuid, text, text, text, timestamptz, timestamptz, integer, integer) TO service_role;

-- E-posta testleri: doğrulanmamış uzman (VE), ikinci uzman (VE2), e-postasız uzman (NOMAIL).
INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, security_exempt, is_super_admin) VALUES
 ('00000000-0000-0000-0000-00000000e0d1', 'f2d-ve@test.local',  'expert', '10000000-0000-0000-0000-000000000031', true, 'approved', false, false),
 ('00000000-0000-0000-0000-00000000e0d2', 'f2d-ve2@test.local', 'expert', '10000000-0000-0000-0000-000000000032', true, 'approved', false, false),
 ('00000000-0000-0000-0000-00000000e0d3', '',                   'expert', '10000000-0000-0000-0000-000000000033', true, 'approved', false, false);
