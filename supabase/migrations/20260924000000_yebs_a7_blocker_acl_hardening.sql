-- ============================================================
-- 20260924000000_yebs_a7_blocker_acl_hardening.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ A7 GÜVENLİK HOTFIX (ACL SERTLEŞTİRME)
--
-- KÖK NEDEN: 20260922000000_yebs_a7_quality_gates.sql içindeki altı SECURITY DEFINER
--   `_blockers` yardımcı fonksiyonu için yalnız `REVOKE ALL ... FROM PUBLIC` yazılmıştı.
--   Supabase varsayılan yetkileri (ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT
--   EXECUTE ON FUNCTIONS TO anon, authenticated, service_role) nedeniyle bu fonksiyonlar
--   oluşturulurken anon ve authenticated rollerine AÇIK (explicit) EXECUTE verilir;
--   `FROM PUBLIC` revoke bu açık grant'ları KALDIRMAZ. Sonuç: altı helper PostgREST
--   üzerinden anon/authenticated tarafından çağrılabilir; SECURITY DEFINER oldukları için
--   RLS'i baypas ederek yebs_* tablolarını okuyup blocker kodu döndürür (bilgi-ifşası /
--   RLS-baypas okuma oracle'ı). Yazma maruziyeti YOKTUR (write RPC'leri doğru kilitli).
--
-- Bu migration production'daki acil ad-hoc REVOKE ile aynı sonucu kaynak-doğru biçimde
--   kalıcılaştırır: altı helper'dan PUBLIC + anon + authenticated EXECUTE tam REVOKE.
--
-- KAPSAM (additive, minimal):
--   - Yalnız ACL değişir. Fonksiyon gövdesi/imzası DEĞİŞMEZ (CREATE/REPLACE yok).
--   - Tablo grant'ları DEĞİŞMEZ. service_role için YENİ grant AÇILMAZ.
--   - Fiziksel DELETE yok, DDL yok, veri değişmez.
--   - Owner (definer) grant'tan bağımsız kendi fonksiyonunu her zaman çalıştırabildiği
--     için eligibility/transition RPC'lerinin iç çağrıları ETKİLENMEZ (işlevsellik korunur).
--   - Idempotent: REVOKE zaten-yok yetkide no-op'tur; yeniden çalıştırma güvenlidir.
--
-- 20260921000000 (graph foundation) ve 20260922000000 (quality gates) migration
--   dosyaları DEĞİŞTİRİLMEZ (byte-exact korunur). A0–A5 ve API-TX dokunulmaz.
-- ============================================================

BEGIN;

REVOKE ALL ON FUNCTION public.yebs_a7_tradition_blockers(uuid, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.yebs_a7_school_blockers(uuid, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.yebs_a7_concept_blockers(uuid, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.yebs_a7_source_blockers(uuid, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.yebs_a7_claim_blockers(uuid, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.yebs_a7_concept_relation_blockers(uuid, text)
  FROM PUBLIC, anon, authenticated;

COMMIT;
