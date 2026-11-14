-- =============================================================================
-- ADMIN ÜYE YÖNETİMİ · AŞAMA 4b (0/2) — ÖDEME GEÇMİŞİNDE ÖDEME TARİHİ ZORUNLU DEĞİL
-- =============================================================================
-- SORUN (production salt-okunur ön kontrolü, 14.11.2026): canlıda user_payment_history.payment_date
--   NOT NULL DEFAULT CURRENT_DATE. Ödeme route'u (ve 4b RPC'si) geçmiş satırına payment_date'i HER ZAMAN açıkça yazar
--   (= users.last_payment_date; boşsa NULL). "Son ödeme tarihi" boş üyede (canlıda 10 uzmanın 9'u) her ödeme
--   kaydı — durum değişikliği, muafiyet, not — geçmiş insert'inde 23502 ile düşer → kayıt yapılamaz.
-- KARAR (Owner, C seçeneği): NOT NULL kaldırılır. DEFAULT CURRENT_DATE de kaldırılır, çünkü:
--   · hiçbir yazım yolu varsayılana dayanmaz: depodaki tüm yazıcılar (2026-05'ten beri) payment_date'i açıkça
--     gönderir; canlıda tabloya yazan DB fonksiyonu yoktur; yazma yetkisi yalnız postgres + service_role;
--   · canlıdaki tek mevcut satırın tarihi oluşturulma gününden FARKLI (gerçek tarih, varsayılan DEĞİL);
--   · varsayılan yalnız kolonu atlayan bir yazımda devreye girer ve gerçek ödeme olmadan "bugün" tarihini UYDURUR.
-- VERİ: MEVCUT SATIRLARA DML YOK. Hiçbir tarih doldurulmaz / değiştirilmez. Yalnız kolon kısıtı + varsayılanı.
-- KİLİT: ALTER TABLE kısa süreli ACCESS EXCLUSIVE alır (tablo canlıda 1 satır); DROP NOT NULL tablo taraması gerektirmez.
-- İLERİ UYUMLU: eski kod (açık NULL yazar) bu şemayla ÇALIŞIR — bugünkü hata da giderilir. 2× uygulanabilir.
-- SIRA: 20280101000690 → 20280101000700 → 20280101000710, SONRA kod.
-- UYGULAMA: AYRI OWNER ONAYI. Bu PR'da production'a UYGULANMAZ.
-- =============================================================================

BEGIN;

-- ── 0) Ön koşul (fail-closed): tablo ve kolon beklenen tipte ──────────────────
DO $pre$
DECLARE
  v_type text;
BEGIN
  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'user_payment_history' AND column_name = 'payment_date';
  IF v_type IS NULL THEN
    RAISE EXCEPTION '4b on kosul: user_payment_history.payment_date yok';
  END IF;
  IF v_type <> 'date' THEN
    RAISE EXCEPTION '4b on kosul: user_payment_history.payment_date tipi beklenmedik: %', v_type;
  END IF;
END
$pre$;

-- ── 1) Ödeme tarihi isteğe bağlı; uydurma "bugün" varsayılanı yok ───────────────
ALTER TABLE public.user_payment_history ALTER COLUMN payment_date DROP NOT NULL;
ALTER TABLE public.user_payment_history ALTER COLUMN payment_date DROP DEFAULT;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (salt-okunur — beklenen):
--   SELECT is_nullable, column_default FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='user_payment_history' AND column_name='payment_date';   -- YES | NULL
--   SELECT count(*), count(payment_date) FROM public.user_payment_history;                                -- önceki ile AYNI
-- GERİ ALMA (yalnız Owner kararıyla):
--   ALTER TABLE public.user_payment_history ALTER COLUMN payment_date SET DEFAULT CURRENT_DATE;
--   NOT NULL yalnız tarihi boş satır YOKSA geri konabilir (SELECT count(*) ... WHERE payment_date IS NULL = 0):
--   ALTER TABLE public.user_payment_history ALTER COLUMN payment_date SET NOT NULL;
--   Boş tarihler OTOMATİK DOLDURULMAZ (Owner kuralı); varsa geri alma bu adımda durur.
-- =============================================================================
