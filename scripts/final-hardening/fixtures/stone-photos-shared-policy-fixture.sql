-- DY-05/DB-03 negatif fixture: stone-photos ile BAŞKA bucket'ı birlikte kapsayan istemci politikası.
-- Beklenen: migration RAISE ile durur, hiçbir bucket/politika değişmez. Yerel embedded-pg.
INSERT INTO storage.buckets (id, name, public) VALUES
  ('stone-photos', 'stone-photos', true),
  ('store-product-images', 'store-product-images', true);
CREATE POLICY "shared public read" ON storage.objects
  FOR SELECT TO anon USING (bucket_id IN ('stone-photos', 'store-product-images'));
