-- ============================================================
-- 20260618000000_hacamat_rules.sql
--
-- Hacamat kuralları tablosu ve başlangıç verileri
--
-- Güvenlik standardı: RLS kapalı, proje standardı.
-- Kategori değerleri: before | after | general
-- ============================================================

create table if not exists public.hacamat_rules (
  id         uuid        primary key default gen_random_uuid(),
  category   text        not null check (category in ('before', 'after', 'general')),
  rule_text  text        not null,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hacamat_rules_cat_idx
  on public.hacamat_rules (category, sort_order);

drop trigger if exists trg_hacamat_rules_updated_at
  on public.hacamat_rules;

create trigger trg_hacamat_rules_updated_at
  before update on public.hacamat_rules
  for each row execute function public.set_updated_at();

alter table public.hacamat_rules disable row level security;

grant select, insert, update, delete
  on public.hacamat_rules
  to anon, authenticated;

-- -------------------------------------------------------
-- Başlangıç verileri
-- -------------------------------------------------------

insert into public.hacamat_rules (category, rule_text, sort_order) values
  ('before', 'Hacamat gününden 2 gün öncesinde hayvansal gıda diyetine girilecek. (Yumurta, et ve süt içeren tüm gıdalar yenmeyecek.)', 1),
  ('before', 'Hacamat gününden 1 gün öncesinden cinsel ilişkiye girilmeyecek.', 2),
  ('before', 'Hacamat saatinden en az 4 saat öncesinden yeme kesilecek. Aşırıya kaçılmamak kaydıyla su içilebilir. Hacamat aç karna yapılacak. Tok karna hacamat hastalık yapar.', 3),
  ('before', 'Fıtık rahatsızlığı, hepatit, kalp rahatsızlığı ve vücudunda platin varsa hacamattan önce mutlaka söylenecek.', 4),
  ('before', 'Kan sulandırıcı kullanılıyor ise söylenecek.', 5),
  ('before', 'Hacamattan hemen önce duş alınmayacak.', 6),
  ('after',  'Hacamattan sonra en az 3 saat hiçbir şey yenmeyecek, su aşırıya kaçılmadan içilebilir. Hacamat sonrası hemen yemek yemek hastalık yapar.', 1),
  ('after',  'Hacamattan sonra en az 3 saat uyunmayacak.', 2),
  ('after',  'Hacamattan sonra 24 saat cinsel ilişkiye girilmeyecek.', 3),
  ('after',  'Hacamattan sonra 24 saat duş/banyo yapılmayacak.', 4),
  ('after',  'Hacamattan sonra 2 gün hayvansal gıda yenmeyecek.', 5),
  ('after',  'Hacamattan sonra iki gün ağır spor yapılmayacak, ağır kaldırılmayacak.', 6);
