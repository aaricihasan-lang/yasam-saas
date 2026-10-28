-- DY-05/DB-03 (AŞAMA 1) fixture: tarihsel prod durumu — stone-photos PUBLIC + anon ALL politikası,
-- komşu bucket'lar ve komşu politika. Yerel embedded-pg; prod'a temas YOK.
INSERT INTO storage.buckets (id, name, public) VALUES
  ('stone-photos', 'stone-photos', true),
  ('store-product-images', 'store-product-images', true),
  ('dogaltas-photos', 'dogaltas-photos', false);
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('stone-photos', 'healing-guides/10000000-0000-0000-0000-000000000001/a.jpg'),
  ('stone-photos', '10000000-0000-0000-0000-000000000002/c1/s1/b.png');
CREATE POLICY "Allow all storage for stone photos" ON storage.objects
  FOR ALL TO public USING (bucket_id = 'stone-photos') WITH CHECK (bucket_id = 'stone-photos');
CREATE POLICY "stone photos anon read" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'stone-photos');
CREATE POLICY "store images public read" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'store-product-images');
