-- GİRİŞ GÜVENLİĞİ F2-F tohumu: 000600'DEN ÖNCE var olan denetim satırları (taşınma kanıtı). Yerel embedded-pg; sentetik.
DO $$
DECLARE
  VE  constant uuid := '00000000-0000-0000-0000-00000000e0d1';
  OWN constant uuid := '00000000-0000-0000-0000-00000000a001';
  d uuid;
BEGIN
  PERFORM public.auth_recovery_log(VE, VE, 'codes_generated', '{"seed": true}'::jsonb);
  PERFORM public.auth_recovery_log(VE, OWN, 'case_opened', '{"seed": true}'::jsonb);
  INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, device_model, state, activated_at)
  VALUES (VE, repeat('S', 120), encode(sha256('f2f-seed-dev'::bytea), 'hex'), 'SEED-DEVC', 'Seed', 'active', now()) RETURNING id INTO d;
  INSERT INTO public.auth_device_decisions (device_id, actor_id, decision, verification_method, fingerprint_confirmed)
  VALUES (d, OWN, 'approve', 'telefon', true);
END $$;
