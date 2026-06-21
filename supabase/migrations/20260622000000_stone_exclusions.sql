-- =============================================================================
-- 20260622000000_stone_exclusions.sql
--
-- Kullanıcı bazlı taş kaldırma tablosu.
--
-- AMAÇ:
--   Doğaltaş listesinde kütüphane/admin tenant'ına ait taşlar da görünür.
--   Kullanıcı bu taşları "silmek" istediğinde gerçek DELETE yapılamaz çünkü
--   aynı taş başka kullanıcılara da görünüyor.
--   Bu tablo, kullanıcı bazında "gizleme" (soft remove) kaydı tutar.
--
-- DAVRANIR:
--   - Kullanıcıya ait taşlar (tenant_id eşleşir) → gerçek DELETE
--   - Kütüphane taşları (ADMIN_LIBRARY_TENANT_ID) → bu tabloya INSERT
--   - Liste fetch'i exclusion'ları okuyup listeden filtreler (client-side)
--
-- ─── GÜVENLİK ANALİZİ ──────────────────────────────────────────────────────
--
-- SORU: Neden RLS kapalı, neden auth.uid() kullanılmıyor?
--
-- CEVAP: Bu proje Supabase'in dahili auth sistemini (auth.users, JWT token)
--   KULLANMIYOR. Kimlik doğrulama, özel login_user RPC + localStorage üzerinden
--   yapılıyor. Bu mimaride:
--
--   1. auth.uid() = NULL: Supabase anon key ile yapılan tüm isteklerde
--      auth.uid() her zaman NULL döner. auth.uid() tabanlı RLS policy yaz →
--      tüm sorguları deny-all'a çevirir → uygulama çöker.
--
--   2. RLS açık + policy-siz = deny-all: Zaten proje geçmişte bunu yaşadı
--      (bkz. 20260609000000_stones_rls_fix.sql). Orada da aynı nedenden
--      RLS kapatıldı.
--
--   3. Tüm tablolarda aynı model: stones, healing_guides, aromatherapy_oils,
--      numerology_records vb. hepsi RLS kapalı, uygulama katmanı tenant_id
--      filtresi kullanıyor. stone_exclusions bu konuda istisna değil.
--
-- RİSK DEĞERLENDİRMESİ:
--
--   Tehdit modeli: Anon key'i bilen biri doğrudan Supabase'e bağlanarak
--   farklı bir tenant_id ile exclusion INSERT/DELETE yapabilir.
--
--   Etki (stone_exclusions için):
--     - Okuma: Bir kullanıcı başka kullanıcının hangi taşları gizlediğini görebilir
--       → Düşük hassasiyet (iş verisi değil, yalnızca UI tercihi)
--     - Yazma: Başka kullanıcı adına taş gizleyebilir
--       → Düşük etki (kütüphane taşları gizleme, iş kaydı değil)
--     - Silme: Başka kullanıcının exclusion kaydını silebilir
--       → Düşük etki (gizlenen taş tekrar görünür, veri kaybı yok)
--
--   Bu risk, stones/healing_guides/clients gibi gerçek iş verisi içeren
--   tablolardaki riskten ÇOK DAHA DÜŞÜK. stone_exclusions sadece UI davranışı.
--
--   Var olan tehdit: Bu saldırgan zaten tüm diğer tablolardaki verilere
--   (taş bilgileri, danışan kayıtları, şifa rehberi) aynı yolla erişebilir.
--   stone_exclusions'ı manipüle etmek saldırgan için anlamsız bir hedef.
--
-- GERÇEK ÇÖZÜM YOLU (şu an yapılmadı, teknik borç olarak not):
--
--   Seçenek A — Supabase Auth'a geç:
--     users tablosunu Supabase auth.users ile senkronize et, JWT token kullan.
--     Sonra auth.uid() → public.users.id bağlantısıyla RLS yazılabilir.
--     Büyük mimari değişiklik; tüm tablolara uygulanabilir.
--
--   Seçenek B — HTTP-only session cookie + API route:
--     Login'de server-side session cookie set et. API route'larda bu cookie'yi
--     doğrula, service_role key ile Supabase'e yaz.
--     Orta büyüklükte değişiklik; yalnızca kritik yazma işlemleri için uygulanabilir.
--
--   Bu tablo için Seçenek B gelecekte uygulanırsa:
--     /api/dogaltas/stone-exclusions route'u oluştur
--     service_role key (getServerDb()) ile INSERT/DELETE yap
--     Client-side excludeStonesForTenant() → fetch('/api/dogaltas/stone-exclusions')
--
-- ─── UYGULAMA ───────────────────────────────────────────────────────────────

create table if not exists public.stone_exclusions (
  tenant_id   text        not null,
  stone_id    uuid        not null,
  excluded_at timestamptz not null default now(),
  constraint stone_exclusions_pkey primary key (tenant_id, stone_id)
);

-- Proje standardına uygun: RLS kapalı.
-- Neden güvenli olduğunun tam analizi yukarıdadır.
alter table public.stone_exclusions disable row level security;

-- Anon key ile: yalnızca belirli tabloya erişim; SELECT, INSERT, DELETE.
-- UPDATE intentionally omitted: exclusion ya var ya yok, güncelleme anlamı yok.
grant select, insert, delete
  on public.stone_exclusions
  to anon, authenticated;
