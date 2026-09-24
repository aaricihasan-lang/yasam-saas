-- ============================================================================
-- NUM-004 — Numeroloji ÇEKİRDEK tablo RLS backstop (idempotent · non-destructive)
-- ============================================================================
-- AMAÇ: Kanonik numeroloji tablolarının güvenliği YALNIZ application-layer tenant
--   filtresine bağlı kalmasın. RLS açılır ve anon/authenticated taban yetkileri
--   kaldırılır → PostgREST public rolleriyle bu tablolara erişemez.
--     - numerology_records
--     - numerology_knowledge_records
--     - numerology_stone_assignments
--
-- ÖN KOŞUL (KOD): Tüm istemci CRUD + rapor + lookup zaten service-role server
--   API'lerine gidiyor (/api/numeroloji/*, /api/admin/numeroloji/*). service_role
--   BYPASSRLS taşır → server yolları ETKİLENMEZ. Numerolojide anon veri yolu YOK.
--
-- GÜVENLİK KURALLARI (BAĞLAYICI):
--   • DROP TABLE / veri silme / veri rewrite YOK.
--   • Mevcut policy DROP edilmez (POLİTİKA hiç EKLENMEZ; RLS-on + 0 policy =
--     anon/authenticated için 0 satır ve reddedilen yazma).
--   • to_regclass ile tablo varlığı korunur (tablo yoksa sessizce atlanır).
--   • ENABLE RLS + REVOKE idempotenttir → migration yeniden uygulanabilir.
--
-- CANLI DOĞRULAMA (apply öncesi/sonrası — AŞAMA 3 kapısı): bkz. AŞAMA 1 C bölümü
--   sorguları (pg_class.relrowsecurity, pg_policies, has_table_privilege anon/auth).
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'numerology_records',
    'numerology_knowledge_records',
    'numerology_stone_assignments'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end
$$;

-- ============================================================================
-- GERİ ALMA (yalnız acil durum — normal akışta ÇALIŞTIRILMAZ):
--   alter table public.numerology_records            disable row level security;
--   alter table public.numerology_knowledge_records  disable row level security;
--   alter table public.numerology_stone_assignments  disable row level security;
--   grant all on public.numerology_records            to anon, authenticated;
--   grant all on public.numerology_knowledge_records  to anon, authenticated;
--   grant all on public.numerology_stone_assignments  to anon, authenticated;
-- ============================================================================
