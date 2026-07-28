-- ============================================================
-- 20260822000000_hd_editorial_sources_and_expert_notes.sql
--
-- Human Design — Uzman Bilgi Bankası: dinamik KAYNAK sekmeleri + "Hasan Notlarım"
--
-- AMAÇ (additif; mevcut modül yeniden yazılmaz):
--   1) human_design_knowledge_records'a nullable `expert_notes` kolonu ekler
--      ("Hasan Notlarım" — editöryal özet `content`'ten AYRI; rapora akmaz).
--   2) human_design_knowledge_sources tablosunu kurar: her ana bilgi kaydının
--      altında BİRDEN ÇOK dinamik kaynak; kaynaklar birbirine karıştırılmaz
--      (her satır ayrı sekme). Künye + özgün metin + sadık TR çeviri + hak/kullanım
--      katmanları AYRI kolonlarda tutulur.
--
-- KAPSAM DIŞI / DEĞİŞTİRİLMEZ:
--   * Mevcut knowledge_records / charts / reports şeması, rapor snapshot akışı,
--     gerçek silme, tenant izolasyonu, harita-tabanlı otomatik eşleştirme.
--   * HD-2B/2C/2D1 kanonik tablolar (hd_canonical_store / hd_sources / ...) —
--     bu akışa BAĞLANMAZ, DOKUNULMAZ.
--   * Kaynak özgün metinleri / uzun sadık çeviriler VARSAYILAN RAPORA EKLENMEZ
--     (yalnız uzman ekranında görünür); rapor yalnız `content` editöryal özetini kullanır.
--
-- SİLME: record silinince FK ON DELETE CASCADE ile kaynakları da silinir (gerçek
--   silme). Kaydedilmiş raporlar snapshot olduğundan (generated_content/edited_content)
--   bundan ETKİLENMEZ.
--
-- GÜVENLİK (server-only): tablo yalnız /api/hd/knowledge-sources server route'undan
--   (getServerDb = service_role) erişilir. Born-locked: RLS ENABLE (policy yok),
--   PUBLIC/anon/authenticated REVOKE ALL, service_role önce REVOKE sonra yalnız
--   SELECT/INSERT/UPDATE/DELETE GRANT (postgres/public default privilege genişliğini
--   daraltır). Tenant izolasyonu persistence katmanında (.eq tenant_id).
-- ============================================================

begin;

-- 1) "Hasan Notlarım" — ana kayıtta editöryal özetten ayrı (additif, nullable)
alter table public.human_design_knowledge_records
  add column if not exists expert_notes text;

-- 2) Dinamik kaynak tablosu
create table if not exists public.human_design_knowledge_sources (
  id                          uuid        primary key default gen_random_uuid(),
  tenant_id                   uuid,
  user_id                     uuid,
  record_id                   uuid        not null
                                references public.human_design_knowledge_records(id)
                                on delete cascade,

  -- Künye katmanları (ayrı tutulur; karıştırılmaz)
  source_name                 text        not null,
  source_type                 text        not null default 'other',
  author_or_organization      text,
  title                       text,
  page_or_section             text,
  source_url                  text,
  accessed_on                 date,

  -- Özgün metin + SADIK çeviri (yorum/sadeleştirme/ekleme yok — UI/politika zorlar)
  original_language_tag       text,
  original_text               text,
  faithful_translation_tr     text,
  source_specific_note        text,

  -- Hak / kullanım (default-deny; bağımsız eksenler)
  rights_status               text        not null default 'unknown',
  permission_reference        text,
  private_use_allowed         boolean     not null default false,
  client_report_allowed       boolean     not null default false,
  expert_distribution_allowed boolean     not null default false,
  commercial_use_allowed      boolean     not null default false,

  sort_order                  int         not null default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint hd_knowledge_sources_source_type_chk check (
    source_type in (
      'book', 'article', 'website', 'video', 'teaching_note',
      'regulatory_document', 'oral_source', 'other'
    )
  ),
  -- permission_pending desteklenir (izin beklenen kaynaklar)
  constraint hd_knowledge_sources_rights_status_chk check (
    rights_status in (
      'public_domain', 'licensed', 'permission_granted',
      'permission_pending', 'restricted', 'unknown'
    )
  ),

  -- Kısıtlı / izin bekleyen / belirsiz telif = private-only: rapor/uzman/ticari
  -- dağıtım bayrakları DB düzeyinde de true OLAMAZ (UI + server'a ek son savunma).
  -- private_use_allowed bu kısıttan etkilenmez (ürün kararı korunur).
  constraint hd_knowledge_sources_locked_distribution_chk check (
    rights_status not in ('restricted', 'permission_pending', 'unknown')
    or (
      client_report_allowed = false
      and expert_distribution_allowed = false
      and commercial_use_allowed = false
    )
  )
);

create index if not exists hd_knowledge_sources_record_id_idx
  on public.human_design_knowledge_sources (record_id);
create index if not exists hd_knowledge_sources_tenant_id_idx
  on public.human_design_knowledge_sources (tenant_id);
create index if not exists hd_knowledge_sources_record_sort_idx
  on public.human_design_knowledge_sources (record_id, sort_order);

drop trigger if exists trg_hd_knowledge_sources_updated_at
  on public.human_design_knowledge_sources;
create trigger trg_hd_knowledge_sources_updated_at
  before update on public.human_design_knowledge_sources
  for each row execute function public.set_updated_at();

-- Born-locked güvenlik (server-only; service_role yalnız S/I/U/D)
alter table public.human_design_knowledge_sources enable row level security;
revoke all privileges on table public.human_design_knowledge_sources from public;
revoke all privileges on table public.human_design_knowledge_sources from anon;
revoke all privileges on table public.human_design_knowledge_sources from authenticated;
revoke all privileges on table public.human_design_knowledge_sources from service_role;
grant select, insert, update, delete
  on table public.human_design_knowledge_sources to service_role;

commit;
