-- ============================================================================
-- NUMEROLOJİ RLS MİGRASYONU  —  P0 GÜVENLİK BLOĞU
-- ============================================================================
-- AMAÇ: numerology_records / numerology_knowledge_records /
--       numerology_stone_assignments tablolarını tenant'lar arası
--       anon (public) erişimden kapatmak.
--
-- ÖN KOŞUL (KOD): Tüm istemci CRUD + lookup artık service-role server API'ye
--   gidiyor (/api/numeroloji/{analyses,knowledge,stones} ve
--   /api/admin/numeroloji/{records,transfer}). Bu migrasyonu UYGULAMADAN ÖNCE
--   yeni kodun deploy edilmiş olması gerekir; aksi halde eski anon istemci
--   istekleri "permission denied" alır.
--
-- NASIL UYGULANIR: Supabase Dashboard → SQL Editor → aşağıdakini çalıştır.
--   (Lokal DATABASE_URL=localhost ile DDL çalışmıyor; Dashboard kullanın.)
--
-- NOT: service_role BYPASSRLS taşır → server API'ler etkilenmez.
-- ============================================================================

begin;

-- 1) RLS'i aç (politika yok → anon/authenticated için satır dönmez, yazma reddedilir)
alter table public.numerology_records            enable row level security;
alter table public.numerology_knowledge_records  enable row level security;
alter table public.numerology_stone_assignments  enable row level security;

-- 2) Taban yetkilerini de kaldır (belt-and-suspenders): PostgREST'in anon/authenticated
--    rolleriyle bu tablolara hiç erişememesini garanti eder.
revoke all on public.numerology_records            from anon, authenticated;
revoke all on public.numerology_knowledge_records  from anon, authenticated;
revoke all on public.numerology_stone_assignments  from anon, authenticated;

commit;

-- ============================================================================
-- DOĞRULAMA (uygulama sonrası):
--   • anon key ile SELECT/INSERT → 0 satır / permission denied olmalı
--   • service key ile SELECT → normal çalışmalı
--   • Uygulama akışı (analiz kaydet/listele/sil, bilgi bankası, admin görüntüleme,
--     veri paylaşımı) tamamen çalışmalı (hepsi service-role API üzerinden).
--
-- GERİ ALMA (gerekirse):
--   alter table public.numerology_records           disable row level security;
--   alter table public.numerology_knowledge_records disable row level security;
--   alter table public.numerology_stone_assignments disable row level security;
--   grant all on public.numerology_records           to anon, authenticated;
--   grant all on public.numerology_knowledge_records to anon, authenticated;
--   grant all on public.numerology_stone_assignments to anon, authenticated;
-- ============================================================================
