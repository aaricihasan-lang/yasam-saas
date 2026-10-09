-- =============================================================================
-- WT9 — mevcut Doğaltaş içeriklerini "Kristal Şifa Kitabı" birincil kaynağına bağlama (VERİ ADIMI)
--
-- ÖN KOŞUL: 20271012000000_dogaltas_stone_sources.sql uygulanmış olmalı.
-- REPO MİGRATION'I DEĞİLDİR: owner'a özgü veri kararıdır (yeni/test ortamlarında otomatik çalışmaz).
-- Prod'a YALNIZ owner onayıyla, paket aracıyla (preflight → apply → postflight) uygulanır.
--
-- NE YAPAR:
--   primary_source_name IS NULL olan taşlara 'Kristal Şifa Kitabı' yazar.
--   İÇERİK KOLONLARINA DOKUNMAZ (short_description … chakras, source_note dahil) → veri taşınmaz,
--   kısaltılmaz, boş alan doldurulmaz, dolu alan NULL yapılmaz. updated_at DEĞİŞMEZ (sahte "düzenlendi"
--   zamanı yok). Kaynağı zaten adlandırılmış taş ATLANIR (tekrar çalıştırmak güvenli / idempotent).
--
-- HARİÇ: demo/vitrin hesabı tenant'ları (users.is_demo_account) — oradaki içerik "SENTETİK örnek"
--   olarak işaretli; gerçek bir kitaba atfedilmez ("Kaynak belirtilmemiş" kalır).
--
-- YAN ETKİ (bilinçli): her güncellenen taş için mevcut YH outbox tetikleyicisi bir 'upsert' kuyruğa
--   alır → taşlar kaynak adıyla yeniden indekslenir (outbox worker batch drenajı).
-- =============================================================================
BEGIN;

UPDATE public.stones s
   SET primary_source_name = 'Kristal Şifa Kitabı'
 WHERE s.primary_source_name IS NULL
   AND NOT EXISTS (
         SELECT 1 FROM public.users u
          WHERE u.tenant_id = s.tenant_id
            AND u.is_demo_account IS TRUE
       )
   -- Uzman bu taşa zaten "Kristal Şifa Kitabı" adlı bir EK kaynak eklediyse atlanır (aynı kaynak
   -- iki kez olmaz; tetikleyici reddederdi → tüm UPDATE geri dönerdi). Preflight bu sayıyı raporlar.
   AND NOT EXISTS (
         SELECT 1 FROM public.stone_sources ss
          WHERE ss.stone_id = s.id
            AND ss.source_name_key = public.dogaltas_source_name_key('Kristal Şifa Kitabı')
       );

COMMIT;
