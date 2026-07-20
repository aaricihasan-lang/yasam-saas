-- ============================================================
-- 20260722000000_aromatherapy_claim_relations.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2F
-- Tablo: public.aromatherapy_claim_relations
--   (iki atomik claim arasında simetrik, editöryal, kontrollü ilişki)
--
-- Tek sorumluluk: yalnız bu ilişki tablosu.
-- Doğuştan-kilitli (satır güvenliği açık + anon/authenticated/PUBLIC REVOKE + service_role GRANT).
-- Tenant-scoped: tenant_id uuid NOT NULL (FK yok — proje standardı app-layer izolasyon;
--   kanonik public.tenants tablosu bulunmuyor).
-- Çapraz-tenant bağını DB düzeyinde engellemek için İKİ kompozit yabancı anahtar
--   (tenant_id, a_claim_id) -> aromatherapy_claims(tenant_id, id)
--   (tenant_id, b_claim_id) -> aromatherapy_claims(tenant_id, id).
-- Parent aday anahtarı (aromatherapy_claims_tenant_id_unique) C2E'de eklendiğinden
--   burada YENİDEN eklenmez.
-- Deterministik ve fail-fast: yalnız düz ekleme/oluşturma ifadeleri; idempotent-atlama yok.
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz).
--
-- Simetri: beş relation_type simetriktir. Kanonik sıralama (a_claim_id < b_claim_id)
--   çift-yön tekrarını ve self-relation'ı birlikte engeller. Bir claim çifti için
--   tek ilişki satırı (relation_type doğal anahtara dahil değildir).
-- explanation_tr her zaman EDİTÖRYALDİR; kaynak alıntısı/sadık çeviri olarak gösterilmez.
--   İlişkinin kanıt dayanağı her iki claim'in kendi kaynak provenansındadır (C2E).
--
-- Kapsam dışı (bilinçli): reviewer_note, explanation_source_based, yönlü/asimetrik ilişki,
--   method_variant ilişkileri, status/lifecycle/visibility, ilişkiye doğrudan kaynak bağı
--   (ileride ayrı claim_relation_sources fazı).
-- ============================================================

CREATE TABLE public.aromatherapy_claim_relations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  a_claim_id      uuid        NOT NULL,
  b_claim_id      uuid        NOT NULL,
  relation_type   text        NOT NULL,
  explanation_tr  text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Kompozit, tenant-güvenli claim bağı (a). İlişkili claim silinince ilişki de silinir.
  CONSTRAINT aromatherapy_claim_relations_a_claim_fk
    FOREIGN KEY (tenant_id, a_claim_id)
    REFERENCES public.aromatherapy_claims (tenant_id, id)
    ON DELETE CASCADE,

  -- Kompozit, tenant-güvenli claim bağı (b).
  CONSTRAINT aromatherapy_claim_relations_b_claim_fk
    FOREIGN KEY (tenant_id, b_claim_id)
    REFERENCES public.aromatherapy_claims (tenant_id, id)
    ON DELETE CASCADE,

  -- İlişki türü (hepsi simetrik).
  CONSTRAINT aromatherapy_claim_relations_relation_type_chk CHECK (
    relation_type IN (
      'complementary',
      'alternative',
      'partially_overlapping',
      'conflicting',
      'context_specific'
    )
  ),

  -- Kanonik sıralama: çift-yön tekrarını ve self-relation'ı birlikte engeller (a <> b kapsanır).
  CONSTRAINT aromatherapy_claim_relations_canonical_order_chk CHECK (
    a_claim_id < b_claim_id
  ),

  -- Editöryal açıklama boş/whitespace olamaz.
  CONSTRAINT aromatherapy_claim_relations_explanation_chk CHECK (
    btrim(explanation_tr) <> ''
  ),

  -- Doğal tekillik: bir claim çifti için tek ilişki satırı (relation_type dahil değil).
  CONSTRAINT aromatherapy_claim_relations_identity_key
    UNIQUE (tenant_id, a_claim_id, b_claim_id)
);

-- Tek secondary index: b-tarafı ters arama + b_claim_fk desteği.
-- a-tarafı aramalar doğal unique index'in (tenant_id, a_claim_id) prefix'iyle karşılanır.
CREATE INDEX aromatherapy_claim_relations_tenant_b_claim_idx
  ON public.aromatherapy_claim_relations (tenant_id, b_claim_id);

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tek kullanıcı trigger'ı).
CREATE TRIGGER trg_aromatherapy_claim_relations_updated_at
  BEFORE UPDATE ON public.aromatherapy_claim_relations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural yok, zorlamalı mod yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili
-- (BYPASSRLS tablo ayrıcalığının yerine geçmediğinden açık GRANT deterministiktir).
ALTER TABLE public.aromatherapy_claim_relations ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_relations FROM anon, authenticated, PUBLIC;
GRANT  ALL PRIVILEGES ON TABLE public.aromatherapy_claim_relations TO service_role;
