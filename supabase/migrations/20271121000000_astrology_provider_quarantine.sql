-- ASTROLOJİ — GA-P2-05: ücretli sağlayıcı ham yanıtı KARANTİNASI (yeni tablo; mevcut tablolara DOKUNMAZ).
--
-- Amaç: ücretli sağlayıcı yanıtı
--   (a) adaptör şemasına uymadığında (PROVIDER_INVALID_RESPONSE) veya
--   (b) sonuç kaydı DETERMİNİSTİK bir hatayla (ör. raw_response 2 MB CHECK 23514) yazılamadığında
-- ham yanıt kaybolmasın; aynı girdi için tekrar ücretli çağrı yapılmasın (negatif önbellek); düzeltme sonrası
-- 0 yeni çağrıyla onarılabilsin (scripts/astrology/quarantine-recover.ts).
--   (c) sonuç kaydı başarılı + yorum kaydı kalıcı başarısız → yalnız PROJEKSİYON BAĞLAMI saklanır (raw_response = '{}';
--       ham yanıt zaten astro_provider_results'ta — kişisel veri ikinci kez kopyalanmaz) → scripts/astrology/interp-backfill.ts.
--
-- Güvenlik: born-locked (RLS açık, politika YOK; anon/authenticated hiçbir yetki); service_role yalnız SELECT/INSERT/DELETE
-- (UPDATE YOK: ham yanıt değiştirilemez). Tenant + uzman tutarlılığı DB düzeyinde: bileşik FK
-- (tenant_id, owner_user_id, profile_id) → astro_birth_profiles (tenant_id, owner_user_id, id) [7A anahtarı astro_bp_owner_key];
-- karşı taraf profili için aynı bileşik FK. Profil silinince CASCADE (KVKK). Ham yanıt doğum verisini yansıtır →
-- expires_at varsayılan 30 gün (≤ 90 gün CHECK) + fırsatçı temizlik (uygulama, aynı tenant+uzman) + owner betiği.
-- Okuma yolları (görünüm/rapor/analiz) bu tabloyu SEÇMEZ; istemciye ham veri gitmez.
--
-- İdempotent: CREATE TABLE/INDEX IF NOT EXISTS; yetkiler her uygulamada aynı allowlist'e yeniden kurulur; mevcut satırlar
-- korunur (ikinci uygulama veri silmez/değiştirmez).
-- Geri dönüş: DROP TABLE public.astro_provider_quarantine; (yalnız karantina verisi kaybolur; başka tablo buna bağlı değil;
-- uygulama tablo yokken — 42P01/PGRST205 — eski davranışa döner).

CREATE TABLE IF NOT EXISTS public.astro_provider_quarantine (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL,
  owner_user_id             uuid        NOT NULL,
  profile_id                uuid        NOT NULL,
  profile_revision          integer     NOT NULL,
  partner_profile_id        uuid        NULL,
  partner_profile_revision  integer     NULL,
  technique                 text        NOT NULL,
  provider                  text        NOT NULL,
  endpoint                  text        NOT NULL,
  adapter_version           text        NOT NULL,
  input_hash                text        NOT NULL,
  reason                    text        NOT NULL,
  error_codes               text[]      NOT NULL DEFAULT '{}',
  raw_response              jsonb       NOT NULL,
  context                   jsonb       NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  expires_at                timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  CONSTRAINT astro_pq_technique_chk CHECK (technique ~ '^[a-z][a-z0-9_.]{2,63}$'),
  CONSTRAINT astro_pq_provider_chk CHECK (char_length(provider) BETWEEN 1 AND 64),
  CONSTRAINT astro_pq_endpoint_chk CHECK (char_length(endpoint) BETWEEN 1 AND 300),
  CONSTRAINT astro_pq_adapter_chk CHECK (char_length(adapter_version) BETWEEN 1 AND 120),
  CONSTRAINT astro_pq_revision_chk CHECK (profile_revision >= 1),
  CONSTRAINT astro_pq_partner_pair_chk CHECK ((partner_profile_id IS NULL) = (partner_profile_revision IS NULL)),
  CONSTRAINT astro_pq_reason_chk CHECK (reason IN ('invalid_response', 'write_failed', 'interp_write_failed')),
  CONSTRAINT astro_pq_hash_chk CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT astro_pq_errors_chk CHECK (cardinality(error_codes) <= 20 AND pg_column_size(error_codes) <= 8192),
  CONSTRAINT astro_pq_raw_chk CHECK (jsonb_typeof(raw_response) = 'object' AND pg_column_size(raw_response) <= 4194304),
  CONSTRAINT astro_pq_context_chk CHECK (jsonb_typeof(context) = 'object' AND pg_column_size(context) <= 65536),
  CONSTRAINT astro_pq_expiry_chk CHECK (expires_at > created_at AND expires_at <= created_at + interval '90 days'),
  CONSTRAINT astro_pq_unique UNIQUE (tenant_id, owner_user_id, input_hash, adapter_version),
  CONSTRAINT astro_pq_profile_fk FOREIGN KEY (tenant_id, owner_user_id, profile_id)
    REFERENCES public.astro_birth_profiles (tenant_id, owner_user_id, id) ON DELETE CASCADE,
  CONSTRAINT astro_pq_partner_fk FOREIGN KEY (tenant_id, owner_user_id, partner_profile_id)
    REFERENCES public.astro_birth_profiles (tenant_id, owner_user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS astro_pq_expires_idx ON public.astro_provider_quarantine (tenant_id, owner_user_id, expires_at);
CREATE INDEX IF NOT EXISTS astro_pq_profile_idx ON public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id);
CREATE INDEX IF NOT EXISTS astro_pq_partner_idx ON public.astro_provider_quarantine (tenant_id, owner_user_id, partner_profile_id)
  WHERE partner_profile_id IS NOT NULL;

COMMENT ON TABLE public.astro_provider_quarantine IS
  'GA-P2-05: kaydedilemeyen ücretli sağlayıcı ham yanıtı + projeksiyon bağlamı (yalnız sunucu; 30 gün). Negatif önbellek + 0 çağrılı onarım.';

ALTER TABLE public.astro_provider_quarantine ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.astro_provider_quarantine FROM PUBLIC;
REVOKE ALL ON TABLE public.astro_provider_quarantine FROM anon;
REVOKE ALL ON TABLE public.astro_provider_quarantine FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.astro_provider_quarantine FROM service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.astro_provider_quarantine TO service_role;

NOTIFY pgrst, 'reload schema';
