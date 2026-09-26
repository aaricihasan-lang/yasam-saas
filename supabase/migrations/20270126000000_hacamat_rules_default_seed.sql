-- ============================================================
-- 20270126000000_hacamat_rules_default_seed.sql
--
-- KOZMİK AJANDA / HACAMAT — VARSAYILAN KURAL SEED'İ (B MODELİ) + TENANT INIT DURUMU
-- Devam: KAJ-P1-03 (20270125000000 tenant izolasyonu) üzerine.
--
-- ÜRÜN KARARI (B MODELİ): Her yeni uzman Hacamat Kuralları bölümünü İLK açtığında BOŞ
-- başlamaz; sistemin 12 başlangıç kuralının UZMANA ÖZEL fiziksel kopyası (kendi tenant'ında
-- ayrı satırlar) oluşturulur. Bu 12 kural GLOBAL/PAYLAŞILAN kayıt DEĞİLDİR — her tenant'ın
-- kendi satırları vardır; A değiştirir/siler/ekler → B ve admin ETKİLENMEZ.
--
-- İKİ DURUMU AYIRT ET: "hiç initialize edilmedi" (→ seed) vs "kullanıcı tüm kuralları bilinçli
-- sildi" (→ ASLA yeniden seed etme). Bunun için tenant-bazlı KALICI init işareti gerekir:
-- hacamat_rules_init tablosu. hacamat_rules'ta 0 satır olması TEK BAŞINA seed tetiklemez.
--
-- İDEMPOTENT + YARIŞ-GÜVENLİ: seed yalnız ilk initialization'da BİR kez olur. Sayfayı 5 kez
-- açmak 60 kayıt üretmez; eşzamanlı iki istek duplicate seed üretmez (PK + ON CONFLICT DO
-- NOTHING → yalnız bir çağrı "ilk init"i kazanır ve seed eder).
--
-- VARSAYILAN İÇERİK TEK KAYNAK: kural metinleri SQL'e GÖMÜLMEZ; server (app/api/hacamat/rules
-- GET) lib/cosmic/hacamatDefaultRules.ts sabitini RPC'ye JSONB olarak geçirir. Böylece 12 metin
-- tek yerde tutulur (drift yok). Tarihsel ilk-seed migration'ı 20260618000000 DONMUŞ geçmiştir.
--
-- MEVCUT SATIRLARI KORU (§7): hâlihazırda hacamat_rules satırı olan HER tenant (özellikle
-- sistem sahibi/admin'in 20270125 ile bağlanan 12 satırı) initialized olarak işaretlenir →
-- RPC onları ASLA yeniden seed etmez → duplicate/veri kaybı YOK.
--
-- APPLY NOTU: owner onayı + PROD YEDEK olmadan uygulanmaz. Bu tur APPLY EDİLMEZ.
-- Uygulama sonrası doğrulama:
--   SELECT count(*) FROM public.hacamat_rules_init;                 -- mevcut rule'lu tenant sayısı kadar
--   SELECT tenant_id, count(*) FROM public.hacamat_rules GROUP BY 1; -- 12'nin katı, tenant başına izole
-- ============================================================

BEGIN;

-- 1) Tenant başına KALICI initialization işareti. RLS ile doğuştan-kilitli (yalnız service_role;
--    tüm erişim server API üzerinden). PK(tenant_id) → tenant başına en fazla BİR init satırı.
CREATE TABLE IF NOT EXISTS public.hacamat_rules_init (
  tenant_id uuid        PRIMARY KEY,
  seeded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hacamat_rules_init ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.hacamat_rules_init FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.hacamat_rules_init TO service_role;

-- 2) §7 KORUMA: hâlihazırda hacamat_rules satırı olan her tenant'ı initialized işaretle.
--    Böylece sistem sahibinin mevcut 12 satırı (20270125 backfill) VE herhangi bir tenant'ın
--    mevcut kayıtları RPC tarafından bir daha ASLA seed edilmez (duplicate önlenir).
INSERT INTO public.hacamat_rules_init (tenant_id, seeded_at)
SELECT hr.tenant_id, now()
FROM public.hacamat_rules hr
WHERE hr.tenant_id IS NOT NULL
GROUP BY hr.tenant_id
ON CONFLICT (tenant_id) DO NOTHING;

-- 3) ATOMİK, YARIŞ-GÜVENLİ, TEK-SEFERLİK seed RPC'si.
--    Dönüş: true → bu çağrı ilk init idi ve kuralları seed etti; false → zaten initialize
--    edilmiş (geçmiş açılış VEYA eşzamanlı çağrı kazandı) → hiçbir şey yapmadı.
--    p_rules: [{ "category": "...", "rule_text": "...", "sort_order": n }, ...]  (server sabiti)
CREATE OR REPLACE FUNCTION public.ensure_hacamat_rules_seeded(
  p_tenant_id uuid,
  p_rules     jsonb
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ensure_hacamat_rules_seeded: p_tenant_id NULL olamaz'
      USING ERRCODE = '22004';
  END IF;

  -- İlk-init kilidi: init satırı yalnız BİR kez oluşur. PK + ON CONFLICT DO NOTHING →
  -- eşzamanlı çağrılardan biri satırı ekler (FOUND=true), diğeri conflict'e düşer
  -- (0 satır, FOUND=false). Yalnız kazanan çağrı seed eder → race-safe, duplicate YOK.
  INSERT INTO public.hacamat_rules_init (tenant_id)
  VALUES (p_tenant_id)
  ON CONFLICT (tenant_id) DO NOTHING;

  IF NOT FOUND THEN
    -- Zaten initialize edilmiş. Kullanıcı tüm kuralları bilinçli silmiş OLSA BİLE
    -- yeniden seed ETME (§6 "varsayılanlar kendiliğinden geri gelmez").
    RETURN false;
  END IF;

  -- İlk initialization: varsayılan kuralların TENANT'A ÖZEL fiziksel kopyasını üret.
  -- category CHECK kısıtı (before|after|general) geçersiz kategoriyi zaten reddeder.
  INSERT INTO public.hacamat_rules (tenant_id, category, rule_text, sort_order)
  SELECT p_tenant_id,
         (elem->>'category')::text,
         (elem->>'rule_text')::text,
         COALESCE((elem->>'sort_order')::int, 0)
  FROM jsonb_array_elements(COALESCE(p_rules, '[]'::jsonb)) AS elem;

  RETURN true;
END;
$$;

-- RPC yalnız server API (service_role) tarafından çağrılabilir; anon/authenticated ERİŞEMEZ.
REVOKE ALL ON FUNCTION public.ensure_hacamat_rules_seeded(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_hacamat_rules_seeded(uuid, jsonb) TO service_role;

COMMIT;
