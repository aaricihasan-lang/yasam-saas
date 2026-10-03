-- YH satış öncesi nihai — ARA FIXTURE (yalnız yerel PG): production'daki mevcut aktivasyon
-- satırlarının taklidi (20261212 null-sentinel fix ön koşulu: worker-v2 kaynaklarının satırı vardır).
-- M3 bu satırları bozmadan kalan hedef kaynakları aktive eder.
INSERT INTO public.yh_source_activation (source_key, is_active, backfill_allowed, scope) VALUES
  ('aromaterapi:reference-rows', true, false, 'professional'),
  ('aromaterapi:reference-sheets', true, false, 'professional'),
  ('aromaterapi:oils', true, false, 'professional'),
  ('dogaltas:knowledge', true, false, 'professional'),
  ('sifa_rehberi:guide-sections', true, false, 'professional')
ON CONFLICT (source_key) DO NOTHING;
