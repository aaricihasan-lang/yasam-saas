-- ============================================================
-- 20260615000003_aromatherapy_knowledge.sql
--
-- Aromaterapi Bilgi Bankası makaleleri
--
-- Güvenlik standardı: RLS kapalı, tenant izolasyonu uygulama katmanında.
-- tenant_id = NULL → paylaşımlı / admin yüklü içerik (herkese açık)
-- tenant_id = kullanıcı uuid → kullanıcıya özel kayıt
-- ============================================================

create table if not exists public.aromatherapy_knowledge_articles (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid,

  category    text        not null default '',
  -- 'kimyasal-bilesimler' | 'elde-etme' | 'etki-mekanizmasi' | 'klinik-uygulama' | 'genel'

  sort_order  int         not null default 0,
  title       text        not null,
  summary     text        not null default '',   -- kart önizlemesi
  content     text        not null default '',   -- tam makale metni
  source      text        not null default '',   -- kaynak referansı

  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -------------------------------------------------------
-- İndeksler
-- -------------------------------------------------------

create index if not exists aka_tenant_idx
  on public.aromatherapy_knowledge_articles (tenant_id);

create index if not exists aka_category_idx
  on public.aromatherapy_knowledge_articles (category);

create index if not exists aka_sort_idx
  on public.aromatherapy_knowledge_articles (category, sort_order);

create index if not exists aka_active_idx
  on public.aromatherapy_knowledge_articles (is_active);

-- -------------------------------------------------------
-- Trigger
-- -------------------------------------------------------

drop trigger if exists trg_aka_updated_at
  on public.aromatherapy_knowledge_articles;

create trigger trg_aka_updated_at
  before update on public.aromatherapy_knowledge_articles
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------
-- Güvenlik — proje standardı: RLS kapalı, GRANT tam yetki
-- -------------------------------------------------------

alter table public.aromatherapy_knowledge_articles disable row level security;

grant select, insert, update, delete
  on public.aromatherapy_knowledge_articles
  to anon, authenticated;
