-- Negatif fixture: duplicate client_notes + yetim snapshot → migration'lar RAISE EXCEPTION ile durmalı (veri silinmez)
INSERT INTO public.client_notes (tenant_id, client_id, notlar) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'dup');
INSERT INTO public.yasam_hafizasi_report_snapshots (tenant_id, client_id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444');
