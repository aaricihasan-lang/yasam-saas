-- DIJ-03 (AŞAMA 1) fixture: private personal-archive bucket (limitsiz) + iki tenant'ın nesneleri.
-- Yerel embedded-pg; prod'a temas YOK.
INSERT INTO storage.buckets (id, name, public) VALUES ('personal-archive', 'personal-archive', false);
INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
  ('personal-archive', '10000000-0000-0000-0000-00000000000a/arc1/u1_a.pdf', '{"size": 1000, "mimetype": "application/pdf"}'),
  ('personal-archive', '10000000-0000-0000-0000-00000000000a/arc2/u2_b.jpg', '{"size": 2500}'),
  ('personal-archive', '10000000-0000-0000-0000-00000000000a/arc2/u3_c.bin', '{"size": "bozuk"}'),
  ('personal-archive', '10000000-0000-0000-0000-00000000000b/arc9/u9_d.pdf', '{"size": 7000}'),
  ('stone-photos',     '10000000-0000-0000-0000-00000000000a/x.jpg',        '{"size": 999999}');
