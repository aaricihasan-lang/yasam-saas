-- ============================================================
-- 20260702100000_aromatherapy_blends.sql
--
-- Aromaterapi FAZ B1 — Blend / Karışım Oluşturucu tablosu
-- Tablo: aromatherapy_blends
--
-- AMAÇ:
--   Uzmanın oluşturduğu seyreltme/karışım reçetelerini saklar.
--   AI önerisi YOK; sistem yalnızca kullanıcının seçtiği yağları hesaplar,
--   veri-temelli güvenlik uyarısını gösterir ve reçeteyi kaydeder.
--
-- GÜVENLİK STANDARDI (aromatherapy_oils ile birebir aynı — modül standardı):
--   RLS kapalı, tenant izolasyonu uygulama katmanında.
--   tenant_id her zaman DOLU (blend'ler kullanıcıya özeldir; paylaşımlı blend yok).
--   NOT: aromatherapy_oils gibi bu tablo da anon/publishable erişimine açıktır.
--   İleride diğer kullanıcı tablolarındaki gibi service_role API + RLS kilidine
--   (bkz. 20260627130000_lock_module_tables_anon.sql) taşınabilir — ayrı faz.
--
-- SNAPSHOT MANTIĞI:
--   items JSONB, her yağın o anki bilgisini SAKLAR; böylece yağ sonradan
--   değişse/silinse bile eski blend/reçete bozulmaz. Bu yüzden yağlara FK YOK.
--   items[] eleman şeması:
--     {
--       "oil_id":            uuid | null,
--       "oil_name":          text,
--       "latin_name":        text,
--       "oil_type":          text,
--       "drops":             int,
--       "is_photosensitive": bool,
--       "contraindications": text,
--       "safety_notes":      text
--     }
--   carrier_oil_name da aynı sebeple denormalize snapshot'tır.
-- ============================================================

-- set_updated_at() fonksiyonu ilk aromaterapi migration'ında oluşturuldu; yeniden kullanılır.

create table if not exists public.aromatherapy_blends (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null,

  -- Kimlik
  name             text        not null,
  notes            text        not null default '',

  -- Taşıyıcı (snapshot + mantıksal ref; FK yok)
  carrier_oil_id   uuid,
  carrier_oil_name text        not null default '',

  -- Hesap parametreleri
  bottle_ml        numeric     not null default 0,
  dilution_percent numeric     not null default 0,
  drops_per_ml     integer     not null default 20,   -- varsayım: 1 ml ≈ 20 damla
  total_drops      integer     not null default 0,    -- hesaplanan hedef (snapshot)

  -- Karışım kalemleri (yağ + damla + güvenlik snapshot'ı)
  items            jsonb       not null default '[]'::jsonb,

  -- Meta
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- -------------------------------------------------------
-- İndeksler
-- -------------------------------------------------------

create index if not exists aro_blends_tenant_idx
  on public.aromatherapy_blends (tenant_id);

create index if not exists aro_blends_active_idx
  on public.aromatherapy_blends (is_active);

create index if not exists aro_blends_name_idx
  on public.aromatherapy_blends using btree (name);

-- -------------------------------------------------------
-- Trigger (updated_at otomatik)
-- -------------------------------------------------------

drop trigger if exists trg_aro_blends_updated_at
  on public.aromatherapy_blends;

create trigger trg_aro_blends_updated_at
  before update on public.aromatherapy_blends
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------
-- Güvenlik — modül standardı: RLS kapalı, GRANT tam yetki
-- (aromatherapy_oils ile aynı; tenant izolasyonu app katmanında)
-- -------------------------------------------------------

alter table public.aromatherapy_blends disable row level security;

grant select, insert, update, delete
  on public.aromatherapy_blends
  to anon, authenticated;
