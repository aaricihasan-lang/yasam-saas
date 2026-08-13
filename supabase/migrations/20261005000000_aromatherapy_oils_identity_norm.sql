-- 20261005000000_aromatherapy_oils_identity_norm.sql
-- =============================================================================
-- AROMATERAPİ V2 — FAZ 3: Karışım Oluşturucu identity-only typeahead için Türkçe-
-- normalize KİMLİK arama kolonu.
--
-- PROBLEM: Blend typeahead (qmode=name) ham ILIKE ile name/latin_name/english_name
-- arıyordu; ILIKE yalnız case-insensitive → Türkçe harf katlaması YOK. Bu yüzden
--   "adacayi" ↛ "Adaçayı", "corek" ↛ "Çörek", "isirgan" ↛ "Isırgan"  EŞLEŞMEZ.
-- Kütüphanenin geniş search_norm araması bunu doğru yapıyor; typeahead yapmıyordu.
--
-- ÇÖZÜM (SADECE ADDITIVE): aromatherapy_oils'e TEK generated STORED kolon:
--   identity_norm = FAZ 1 normalizer( name + latin_name + english_name )
-- Kapsam YALNIZCA 3 kimlik alanı — içerik (benefits/usage/aroma/safety…) DAHİL DEĞİL;
-- typeahead'in identity-only sözleşmesi korunur. search_norm (kütüphane) DEĞİŞMEZ.
--
-- NULL-GÜVENLİĞİ + IMMUTABILITY: `name || ' ' || latin_name` biçimi NULL propagation
-- yapardı (tek alan NULL → tüm sonuç NULL). `concat_ws` NULL-safe olurdu AMA katalogda
-- STABLE'dır (VARIADIC "any" → generated-column immutability gate'ini geçmez). Bu yüzden
-- search_norm ile AYNI desen kullanılır: `coalesce(x,'') || ' ' || …` — hem NULL-safe
-- (coalesce boş stringe indirger) hem IMMUTABLE (coalesce + `||` = textcat immutable).
-- FAZ 1 `aromatherapy_search_normalize(text)` REUSE edilir (yeni normalizer YOK).
--
-- INDEX: EKLENMEZ. Aramalar tenant-scoped (typeahead limit≤100); per-tenant alt küme
--   küçük (~yüzler), `%q%` seq-scan makul. İhtiyaç kanıtlanırsa ayrı additive migration
--   ile pg_trgm+GIN eklenebilir (search_norm ile aynı TRGM_DEFERRED gerekçesi).
--
-- RLS / GRANT / POLICY / mevcut kolon / mevcut index DEĞİŞTİRİLMEZ. DROP/DELETE/UPDATE/
-- INSERT YOK.
--
-- ROLLBACK (gerekirse):
--   ALTER TABLE public.aromatherapy_oils DROP COLUMN IF EXISTS identity_norm;
--
-- UYARI (apply): STORED generated ADD COLUMN = tablo rewrite (ACCESS EXCLUSIVE), süre
-- toplam satır sayısıyla orantılı → düşük-trafik pencere. (20261004 ile aynı şekil/risk.)
-- =============================================================================

BEGIN;

-- aromatherapy_oils.identity_norm — FAZ 1 normalizer + yalnız 3 kimlik alanı (NULL-safe).
ALTER TABLE public.aromatherapy_oils
  ADD COLUMN IF NOT EXISTS identity_norm text
  GENERATED ALWAYS AS (
    public.aromatherapy_search_normalize(
      coalesce(name, '') || ' ' ||
      coalesce(latin_name, '') || ' ' ||
      coalesce(english_name, '')
    )
  ) STORED;

COMMENT ON COLUMN public.aromatherapy_oils.identity_norm IS
  'Türkçe-normalize KİMLİK arama blob''u (name+latin_name+english_name). Yalnız Karışım '
  'Oluşturucu identity-only typeahead (qmode=name) kullanır; içerik alanı İÇERMEZ. '
  'search_norm''dan ayrıdır. FAZ 3.';

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası — beklenen). Ayrıntı: scripts/verify-aromatherapy-oils-identity-norm.sql
--   identity_norm generated stored: attgenerated='s'
--   aromatherapy_search_normalize provolatile='i' (değişmedi)
--   SELECT identity_norm FROM public.aromatherapy_oils LIMIT 1;  -- normalize dolu
--   count(*) = count(identity_norm IS NOT NULL)  -- STORED otomatik backfill
--   RLS/GRANT DEĞİŞMEDİ: has_table_privilege('anon','public.aromatherapy_oils','SELECT') -- false
--   relrowsecurity=true
-- =============================================================================
