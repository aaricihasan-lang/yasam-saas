-- =============================================================================
-- 20260924062228_client_charges.sql
--
-- feat(danisan-yolculugu): merkezi Ücretlendirme tablosu (client_charges)
--
-- AMAÇ:
--   Ücret bilgisi artık tek bir seansa/modüle gömülü DEĞİL. Bir danışana ait
--   BÜTÜN ücret kayıtlarının TEK KAYNAĞI bu tablodur. Uzman istediği kadar
--   bağımsız ücret kaydı ekleyebilir:
--     01.10.2026 — Seans   — Hacamat      — 1.500 TL
--     04.10.2026 — Analiz  — Numeroloji   — 1.000 TL
--     08.10.2026 — Diğer   — Krem         —   350 TL
--
-- İLİŞKİ (client_combinations ile aynı model):
--   - client_id → public.clients(id) ON DELETE CASCADE (ZORUNLU — kurulamazsa migration FAIL)
--   - Bir danışan birden çok ücret kaydına sahip olabilir (1-N).
--
-- ALANLAR (spec §14/§20):
--   - charge_date       → TARİH
--   - category          → ANA TÜR (kontrollü: session/homework/analysis/other)
--   - detail            → DETAY / İŞLEM AÇIKLAMASI (serbest metin; category=other
--                         durumunda API server-side ZORUNLU kılar — DB'de nullable)
--   - note              → NOT / AÇIKLAMA
--   - amount            → TUTAR (numeric, >= 0; negatif reddedilir)
--   - source_session_id → SADECE eski client_sessions.fee backfill'inde doldurulur;
--                         idempotent migrasyon için (partial unique index). Kullanıcıya
--                         gösterilmesi ZORUNLU DEĞİL — yalnız duplicate güvenliği içindir.
--
-- GÜVENLİK (combinations ile aynı model):
--   - RLS açık. anon/authenticated (publishable key) için INSERT/UPDATE/DELETE
--     reddedilir; SELECT policy YOKTUR → varsayılan-deny.
--   - Tüm okuma/yazma service_role'lü sunucu API'leri üzerinden yapılır.
--
-- CASCADE:
--   - FK ON DELETE CASCADE olduğundan cascade-delete route'unda tek clients DELETE
--     ücret kayıtlarını da temizler → route'a DOKUNULMAZ.
--
-- CDC/OUTBOX: Bu tabloya Yaşam Hafızası outbox trigger'ı EKLENMEZ (finansal veri,
--   memory index kapsamı dışı; CDC/worker-v2 altyapısına dokunulmaz).
--
-- ÖNEMLİ — FK ZORUNLU (FAIL-LOUD):
--   cascade-delete route'u child tabloların FK ON DELETE CASCADE ilişkisine güvenir ve
--   client_charges için MANUEL delete YAPMAZ. FK kurulamazsa migration BAŞARILI
--   SAYILMAMALIDIR (yoksa danışan silmede ücret kayıtları orphan kalır). Tablo önce
--   FK'siz oluşturulur; FK ayrı adımda eklenir, ekleme hatası YUTULMAZ (migration durur);
--   sonda FK'nin varlığı ve ON DELETE CASCADE olduğu doğrulanır. "Uygulama düzeyinde
--   cascade" fallback'i YOKTUR.
--
-- GÜVENLİ / IDEMPOTENT:
--   - create ... if not exists, drop policy/trigger if exists, FK varlık kontrolü.
--   - Yalnız YENİ nesneler; mevcut tablolara DOKUNMAZ.
-- =============================================================================

-- ── 0) updated_at trigger fonksiyonu (idempotent garanti) ────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── 1) Tablo (FK'SİZ — kesin oluşur) ─────────────────────────────────────────
create table if not exists public.client_charges (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null,
  client_id         uuid        not null,

  charge_date       date        not null default (now() at time zone 'utc')::date,
  category          text        not null,     -- session | homework | analysis | other
  detail            text,                      -- serbest metin (other → API zorunlu)
  note              text,                      -- serbest not / açıklama
  amount            numeric     not null,      -- TUTAR (>= 0)

  source_session_id uuid,                      -- yalnız backfill; idempotency anahtarı

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint client_charges_amount_nonneg   check (amount >= 0),
  constraint client_charges_category_valid  check (category in ('session','homework','analysis','other'))
);

-- ── 2) FK (ZORUNLU — hata YUTULMAZ; kurulamazsa migration DURUR) ─────────────
-- ON DELETE CASCADE, cascade-delete route'unun TEK dayanağıdır; exception handler YOK.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'client_charges_client_id_fkey'
  ) then
    alter table public.client_charges
      add constraint client_charges_client_id_fkey
      foreign key (client_id) references public.clients (id) on delete cascade;
    raise notice 'client_charges FK eklendi.';
  end if;
end$$;

-- ── 2b) FK DOĞRULAMASI (fail-loud) — FK yoksa VEYA cascade değilse migration FAIL ─
do $$
declare
  v_delete_rule text;
begin
  select rc.delete_rule into v_delete_rule
  from information_schema.referential_constraints rc
  where rc.constraint_name = 'client_charges_client_id_fkey'
    and rc.constraint_schema = 'public';

  if v_delete_rule is null then
    raise exception 'client_charges_client_id_fkey FK kurulamadi — cascade-delete FK cascade''e guveniyor; migration FAIL.';
  end if;
  if v_delete_rule <> 'CASCADE' then
    raise exception 'client_charges_client_id_fkey ON DELETE % (CASCADE bekleniyordu) — migration FAIL.', v_delete_rule;
  end if;
end$$;

-- ── 3) İndeksler ─────────────────────────────────────────────────────────────
create index if not exists client_charges_tenant_idx
  on public.client_charges (tenant_id);
create index if not exists client_charges_client_idx
  on public.client_charges (client_id);
create index if not exists client_charges_created_idx
  on public.client_charges (created_at desc);

-- Backfill idempotency: her eski seans için EN FAZLA bir ücret kaydı.
-- (source_session_id NULL olan manuel kayıtlar bu kısıttan etkilenmez.)
create unique index if not exists client_charges_source_session_uidx
  on public.client_charges (source_session_id)
  where source_session_id is not null;

-- ── 4) updated_at trigger ────────────────────────────────────────────────────
drop trigger if exists trg_client_charges_updated_at
  on public.client_charges;
create trigger trg_client_charges_updated_at
  before update on public.client_charges
  for each row execute function public.set_updated_at();

-- ── 5) RLS: service_role-only (anon/authenticated yazma reddi, SELECT yok) ───
alter table public.client_charges enable row level security;

drop policy if exists "client_charges_insert_denied" on public.client_charges;
create policy "client_charges_insert_denied"
  on public.client_charges
  for insert to anon, authenticated
  with check (false);

drop policy if exists "client_charges_update_denied" on public.client_charges;
create policy "client_charges_update_denied"
  on public.client_charges
  for update to anon, authenticated
  using (false);

drop policy if exists "client_charges_delete_denied" on public.client_charges;
create policy "client_charges_delete_denied"
  on public.client_charges
  for delete to anon, authenticated
  using (false);

-- ── 6) PostgREST şema önbelleğini yenile (API tabloyu hemen görsün) ──────────
notify pgrst, 'reload schema';

-- =============================================================================
-- BACKFILL (eski client_sessions.fee → client_charges) — spec §21
--
--   Anlamsız kayıt üretme: yalnız fee IS NOT NULL AND fee > 0 olan seanslar taşınır.
--   Idempotent: source_session_id partial-unique index sayesinde ikinci çalıştırma
--   duplicate üretmez (ON CONFLICT DO NOTHING).
--
--   Bu blok ayrı komut olarak da (bu migration dışında) tekrar çalıştırılabilir.
-- =============================================================================
insert into public.client_charges
  (tenant_id, client_id, charge_date, category, detail, note, amount, source_session_id)
select
  s.tenant_id,
  s.client_id,
  coalesce(s.session_date, (s.created_at at time zone 'utc')::date) as charge_date,
  'session' as category,
  nullif(btrim(s.session_type), '')            as detail,
  nullif(btrim(s.session_note), '')            as note,
  s.fee                                         as amount,
  s.id                                          as source_session_id
from public.client_sessions s
where s.fee is not null
  and s.fee > 0
  and s.tenant_id is not null
  and s.client_id is not null
on conflict (source_session_id) where source_session_id is not null do nothing;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası):
--   select count(*) from public.client_charges;                              -- toplam
--   select count(*) from public.client_charges where source_session_id is not null; -- backfill
--   -- backfill kayıp/duplicate kontrolü (0 dönmeli):
--   select count(*) from public.client_sessions s
--     where s.fee > 0 and not exists (
--       select 1 from public.client_charges c where c.source_session_id = s.id);
--   select conname from pg_constraint where conname='client_charges_client_id_fkey';
-- =============================================================================
