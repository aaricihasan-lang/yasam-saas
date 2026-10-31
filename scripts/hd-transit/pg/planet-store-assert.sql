-- HD transit L2 gezegen önbelleği — migration sonrası doğrulama (iki kez uygulandıktan sonra da geçerli olmalı).
DO $$
DECLARE r record;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hd_transit_planet_positions'::regclass) THEN RAISE EXCEPTION 'PS1 RLS kapalı'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hd_transit_planet_positions') THEN RAISE EXCEPTION 'PS2 policy olmamalı'; END IF;
  FOR r IN SELECT unnest(ARRAY['anon','authenticated']) AS role LOOP
    IF has_table_privilege(r.role, 'public.hd_transit_planet_positions', 'SELECT') OR has_table_privilege(r.role, 'public.hd_transit_planet_positions', 'INSERT')
       OR has_table_privilege(r.role, 'public.hd_transit_planet_positions', 'UPDATE') OR has_table_privilege(r.role, 'public.hd_transit_planet_positions', 'DELETE')
       OR has_table_privilege(r.role, 'public.hd_transit_planet_positions', 'TRUNCATE') THEN RAISE EXCEPTION 'PS3 % yetkisi kaldı (varsayılan ALL REVOKE edilmedi)', r.role; END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.hd_transit_planet_positions', 'SELECT') OR NOT has_table_privilege('service_role', 'public.hd_transit_planet_positions', 'INSERT') THEN RAISE EXCEPTION 'PS4 service_role SELECT/INSERT yok'; END IF;
  IF has_table_privilege('service_role', 'public.hd_transit_planet_positions', 'UPDATE') OR has_table_privilege('service_role', 'public.hd_transit_planet_positions', 'DELETE') THEN RAISE EXCEPTION 'PS5 service_role UPDATE/DELETE olmamalı'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hd_transit_planet_positions' AND column_name ~* '(tenant|user|client|birth|name)') THEN RAISE EXCEPTION 'PS6 kişisel / tenant sütunu var'; END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.hd_transit_planet_positions'::regclass AND contype = 'c') < 7 THEN RAISE EXCEPTION 'PS7 CHECK kısıtları eksik'; END IF;
END $$;
