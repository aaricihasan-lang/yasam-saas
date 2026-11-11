/**
 * ADMIN ÜYE YÖNETİMİ V2 · Aşama 2 — Üye listesi sorgu sözleşmesi + gösterim etiketleri (SAF; route + sayfa + harness).
 *
 * Aşama (stage) SUNUCUDA hesaplanır (public.admin_member_stage_of); burada yalnız etiket / renk eşlemesi vardır.
 * Aşama yalnız GÖSTERİM ve FİLTRE içindir — erişim yetkisini değiştirmez.
 */
import {
  foldTr,
  MEMBER_FILTER_MODULE_KEYS,
  MEMBER_LIST_PATH,
  moduleFilterDbKeys,
  type MemberModuleFilter,
} from "@/lib/admin/memberListQuery";

export const MEMBER_V2_PAGE_SIZE = 20;
export const MEMBER_V2_QUERY_MAX = 120;

export type MemberStage =
  | "yonetici" | "demo" | "basvuru" | "red" | "arsiv" | "inceleme" | "deneme_durdu"
  | "deneme_baslamadi" | "deneme" | "deneme_bitti" | "pro" | "eski_kayit";

export type MemberV2Filter =
  | "all" | "basvuru" | "trial" | "bitti" | "pro" | "prores"
  | "yeni" | "notstarted" | "inceleme" | "pay" | "paynext" | "soon" | "eski" | "askida" | "arsiv";
export type MemberV2Sort = "attn" | "new" | "login" | "name";
export type MemberV2Payment = "all" | "check" | "paid" | "pending" | "overdue" | "exempt";
export type MemberV2Role = "expert" | "admin";

/** Görünür 6 filtre (Owner PASS sürüm 3). */
export const MEMBER_V2_MAIN_FILTERS: readonly (readonly [MemberV2Filter, string])[] = [
  ["all", "Tüm üyeler"],
  ["basvuru", "Onay bekleyenler"],
  ["trial", "Denemedekiler"],
  ["bitti", "Denemesi bitenler"],
  ["pro", "Pro üyeler"],
  ["prores", "Pro talebi olanlar"],
];
/** "Diğer filtreler" altındakiler. */
export const MEMBER_V2_MORE_FILTERS: readonly (readonly [MemberV2Filter, string])[] = [
  ["yeni", "Yeni kayıtlar"],
  ["notstarted", "Başlamamış deneme"],
  ["inceleme", "İncelemedekiler"],
  ["pay", "Ödeme kontrolü"],
  ["paynext", "7 gün içinde ödeme"],
  ["soon", "2 gün içinde bitecek"],
  ["eski", "Eski kayıt"],
  ["askida", "Askıya alınanlar"],
  ["arsiv", "Arşiv"],
];
const FILTERS: readonly MemberV2Filter[] = [...MEMBER_V2_MAIN_FILTERS, ...MEMBER_V2_MORE_FILTERS].map(([k]) => k);
const SORTS: readonly MemberV2Sort[] = ["attn", "new", "login", "name"];
const PAYMENTS: readonly MemberV2Payment[] = ["all", "check", "paid", "pending", "overdue", "exempt"];
const ROLES: readonly MemberV2Role[] = ["expert", "admin"];
const MODULES: readonly MemberModuleFilter[] = ["all", ...MEMBER_FILTER_MODULE_KEYS];

export const MEMBER_V2_SORT_LABELS: Record<MemberV2Sort, string> = {
  attn: "Önce ilgilenmem gerekenler",
  new: "Yeni kayıt önce",
  login: "Son giriş",
  name: "A–Z",
};
export const MEMBER_V2_PAYMENT_LABELS: Record<MemberV2Payment, string> = {
  all: "Tümü",
  check: "Kontrol edilecek",
  paid: "Ödendi",
  pending: "Bekliyor",
  overdue: "Gecikti işaretli",
  exempt: "Ödemeden muaf",
};

export type MemberV2Query = {
  filter: MemberV2Filter;
  q: string;
  sort: MemberV2Sort;
  module: MemberModuleFilter;
  payment: MemberV2Payment;
  role: MemberV2Role;
  page: number;
};
export const DEFAULT_MEMBER_V2_QUERY: MemberV2Query = {
  filter: "all", q: "", sort: "attn", module: "all", payment: "all", role: "expert", page: 1,
};

type Search = { get(name: string): string | null };
export type MemberV2QueryResult = { ok: true; value: MemberV2Query } | { ok: false; error: string };

function pick<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T | null {
  if (raw === null || raw === "") return fallback;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

/** URL/API sorgusu → doğrulanmış V2 filtre. Bilinmeyen değer → hata (API 400). */
export function parseMemberV2Query(sp: Search): MemberV2QueryResult {
  const filter = pick(sp.get("f"), FILTERS, "all");
  const sort = pick(sp.get("sort"), SORTS, "attn");
  const payment = pick(sp.get("pay"), PAYMENTS, "all");
  const role = pick(sp.get("rol"), ROLES, "expert");
  const moduleKey = pick(sp.get("mod"), MODULES, "all");
  if (!filter || !sort || !payment || !role || !moduleKey) return { ok: false, error: "Geçersiz filtre değeri." };
  const q = (sp.get("q") ?? "").trim();
  if (q.length > MEMBER_V2_QUERY_MAX) return { ok: false, error: "Arama metni çok uzun." };
  const pageRaw = sp.get("page");
  const page = pageRaw === null || pageRaw === "" ? 1 : Number(pageRaw);
  if (!Number.isInteger(page) || page < 1 || page > 10000) return { ok: false, error: "Geçersiz sayfa." };
  return { ok: true, value: { filter, q, sort, module: moduleKey, payment, role, page } };
}

/** Filtre → query string (varsayılanlar yazılmaz). */
export function memberV2QueryToSearch(q: MemberV2Query): string {
  const p = new URLSearchParams();
  if (q.filter !== "all") p.set("f", q.filter);
  if (q.q) p.set("q", q.q);
  if (q.sort !== "attn") p.set("sort", q.sort);
  if (q.module !== "all") p.set("mod", q.module);
  if (q.payment !== "all") p.set("pay", q.payment);
  if (q.role !== "expert") p.set("rol", q.role);
  if (q.page !== 1) p.set("page", String(q.page));
  return p.toString();
}

/** RPC argümanları (route). */
export function memberV2RpcArgs(actor: string, q: MemberV2Query) {
  return {
    p_actor: actor,
    p_filter: q.filter,
    p_q: q.q,
    p_role: q.role,
    p_module_keys: moduleFilterDbKeys(q.module),
    p_payment: q.payment,
    p_sort: q.sort,
    p_limit: MEMBER_V2_PAGE_SIZE,
    p_offset: (q.page - 1) * MEMBER_V2_PAGE_SIZE,
  };
}

/**
 * Eski (klasik) liste URL parametreleri. Bu parametrelerle /admin/users'a gelen bağlantılar (ana panel
 * "Yenileme geçti", sistem sağlığı "Onay bekleyenler / Arşiv" vb.) AYNI sonucu gösteren klasik listeye yönlenir.
 */
const LEGACY_KEYS = ["view", "approval", "active", "role", "payment", "due", "activity", "module", "security", "pageSize"];
const LEGACY_SORTS = ["default", "next_payment_asc", "next_payment_desc", "activity_desc", "activity_asc", "d7_desc", "d30_desc", "created_desc", "name_asc"];
export const MEMBER_CLASSIC_PATH = `${MEMBER_LIST_PATH}/klasik`;
export function legacyMemberListRedirect(sp: Search & { toString(): string }): string | null {
  const legacy = LEGACY_KEYS.some((k) => sp.get(k) !== null) || LEGACY_SORTS.includes(sp.get("sort") ?? "");
  if (!legacy) return null;
  const qs = sp.toString();
  return qs ? `${MEMBER_CLASSIC_PATH}?${qs}` : MEMBER_CLASSIC_PATH;
}

/** Detaydan dönüş anahtarı için V2 öneki (klasik listeyle aynı sessionStorage anahtarı paylaşılır). */
export const MEMBER_V2_RETURN_PREFIX = "v2:";

// ── Gösterim ───────────────────────────────────────────────────────────────────

export type MemberStageTone = "act" | "info" | "slate" | "warn" | "bad" | "ok" | "gold" | "muted";
export function memberStageLabel(stage: MemberStage, opts: { exempt?: boolean; trialEndsAt?: string | null; nowMs: number }): { label: string; tone: MemberStageTone } {
  switch (stage) {
    case "yonetici": return { label: "Yönetici", tone: "info" };
    case "demo": return { label: "Demo hesap", tone: "muted" };
    case "basvuru": return { label: "Başvuru · onay bekliyor", tone: "act" };
    case "red": return { label: "Reddedildi", tone: "muted" };
    case "arsiv": return { label: "Arşiv · pasif", tone: "muted" };
    case "inceleme": return { label: "İncelemede", tone: "bad" };
    case "deneme_durdu": return { label: "Deneme durduruldu", tone: "slate" };
    case "deneme_baslamadi": return { label: "Deneme · başlamadı", tone: "slate" };
    case "deneme": {
      const end = opts.trialEndsAt ? Date.parse(opts.trialEndsAt) : NaN;
      const d = Number.isFinite(end) ? Math.ceil((end - opts.nowMs) / 86_400_000) : NaN;
      return { label: Number.isFinite(d) ? (d <= 1 ? "Deneme · son gün" : `Deneme · ${d} gün`) : "Denemede", tone: "info" };
    }
    case "deneme_bitti": return { label: "Deneme bitti", tone: "warn" };
    case "pro": return opts.exempt ? { label: "Pro · ödemeden muaf", tone: "gold" } : { label: "Pro", tone: "ok" };
    case "eski_kayit": return { label: "Eski kayıt · paket eksik", tone: "bad" };
  }
}

const TZ = "Europe/Istanbul";
export function fmtDateTr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
}
export function agoTr(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const d = nowMs - t;
  if (d < 3_600_000) return `${Math.max(1, Math.round(d / 60_000))} dk önce`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)} sa önce`;
  const n = Math.round(d / 86_400_000);
  return n === 1 ? "dün" : `${n} gün önce`;
}

export type MemberV2Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  stage: MemberStage;
  is_demo: boolean;
  payment_status: string | null;
  next_payment_date: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  created_at: string | null;
  module_permissions: unknown;
  last_login_at: string | null;
  pro_request_at: string | null;
  pay_check: boolean;
};

/** "Süre / tarih" sütunu — ödeme tarihinin geçmesi BORÇ olarak yazılmaz ("kontrol edin"). */
export function memberPeriodText(r: MemberV2Row, todayIso: string, nowMs: number): string {
  const ps = (r.payment_status ?? "").toLowerCase();
  switch (r.stage) {
    case "deneme": {
      const end = r.trial_ends_at ? Date.parse(r.trial_ends_at) : NaN;
      if (!Number.isFinite(end)) return "—";
      const h = Math.round((end - nowMs) / 3_600_000);
      return h < 48 ? `${Math.max(0, h)} sa kaldı · bitiş ${fmtDateTr(r.trial_ends_at)}` : `bitiş ${fmtDateTr(r.trial_ends_at)}`;
    }
    case "deneme_baslamadi": return "ilk girişte başlar";
    case "deneme_bitti": return `bitti ${fmtDateTr(r.trial_ends_at)}`;
    case "basvuru": return `başvuru ${agoTr(r.created_at, nowMs)}`;
    case "pro":
      if (ps === "exempt") return "süresiz";
      if (ps === "overdue") return "ödeme “Gecikti” işaretli";
      if (!r.next_payment_date) return "ödeme tarihi yok";
      return r.next_payment_date < todayIso
        ? `ödeme tarihi geçti (${fmtDateTr(r.next_payment_date)}) · kontrol edin`
        : `sonraki ödeme ${fmtDateTr(r.next_payment_date)}`;
    case "eski_kayit": return r.trial_ends_at ? `eski deneme ${fmtDateTr(r.trial_ends_at)} bitti` : "—";
    default: return "—";
  }
}

export type MemberV2Counts = {
  today: number; trial: number; not_started: number; pro: number; pro_exempt: number; ended: number;
  soon: number; pay_check: number; pay_next: number; demo: number;
};
export type MemberV2Decisions = { total: number; basvuru: number; pro_talebi: number; inceleme: number; eski_kayit: number; odeme: number };
export type MemberV2Presets = Record<MemberV2Filter | "admins", number>;

const n = (r: Record<string, unknown>, k: string) => Math.max(0, Math.trunc(Number(r[k]) || 0));
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
export function parseMemberV2Counts(v: unknown): MemberV2Counts {
  const r = obj(v);
  return { today: n(r, "today"), trial: n(r, "trial"), not_started: n(r, "not_started"), pro: n(r, "pro"), pro_exempt: n(r, "pro_exempt"),
    ended: n(r, "ended"), soon: n(r, "soon"), pay_check: n(r, "pay_check"), pay_next: n(r, "pay_next"), demo: n(r, "demo") };
}
export function parseMemberV2Decisions(v: unknown): MemberV2Decisions {
  const r = obj(v);
  return { total: n(r, "total"), basvuru: n(r, "basvuru"), pro_talebi: n(r, "pro_talebi"), inceleme: n(r, "inceleme"),
    eski_kayit: n(r, "eski_kayit"), odeme: n(r, "odeme") };
}
export function parseMemberV2Presets(v: unknown): MemberV2Presets {
  const r = obj(v);
  const out = {} as MemberV2Presets;
  for (const k of [...FILTERS, "admins" as const]) out[k] = n(r, k);
  return out;
}

/** Arama katlama (DB admin_search_fold ile aynı) — harness eşlik testi için yeniden dışa açılır. */
export { foldTr };
