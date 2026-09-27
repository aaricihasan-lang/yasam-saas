/**
 * MEM-016 — Üye listesi sorgu sözleşmesi (SAF; API route + liste sayfası URL durumu + harness).
 *
 * - Türkçe katlama `foldTr`, DB'deki public.admin_search_fold ile BİREBİR aynı eşlemedir:
 *   İ/I/ı → i, Ş/ş → s, Ğ/ğ → g, Ü/ü → u, Ö/ö → o, Ç/ç → c, Â/Î/Û → a/i/u, sonra küçük harf.
 * - Rol araması: "uzman"/"expert" veya "yönetici"/"admin" (≥3 harf önek) → rol eşleşmesi.
 * - URL ↔ filtre: parseMemberListQuery / memberListQueryToSearch (bilinmeyen değer → hata).
 */

export const MEMBER_PAGE_SIZES = [10, 20, 50] as const;
export type MemberPageSize = (typeof MEMBER_PAGE_SIZES)[number];
export const MEMBER_DEFAULT_PAGE_SIZE: MemberPageSize = 20;
export const MEMBER_QUERY_MAX = 120;

export type MemberView = "members" | "archive";
export type MemberApprovalFilter = "all" | "pending" | "approved" | "rejected";
export type MemberActiveFilter = "all" | "active" | "passive";
export type MemberRoleFilter = "all" | "admin" | "expert";
export type MemberPaymentFilter = "all" | "paid" | "pending" | "overdue" | "exempt";

export type MemberListQuery = {
  view: MemberView;
  q: string;
  approval: MemberApprovalFilter;
  active: MemberActiveFilter;
  role: MemberRoleFilter;
  payment: MemberPaymentFilter;
  page: number;
  pageSize: MemberPageSize;
};

export const DEFAULT_MEMBER_LIST_QUERY: MemberListQuery = {
  view: "members",
  q: "",
  approval: "all",
  active: "all",
  role: "all",
  payment: "all",
  page: 1,
  pageSize: MEMBER_DEFAULT_PAGE_SIZE,
};

const VIEWS: readonly MemberView[] = ["members", "archive"];
const APPROVALS: readonly MemberApprovalFilter[] = ["all", "pending", "approved", "rejected"];
const ACTIVES: readonly MemberActiveFilter[] = ["all", "active", "passive"];
const ROLES: readonly MemberRoleFilter[] = ["all", "admin", "expert"];
const PAYMENTS: readonly MemberPaymentFilter[] = ["all", "paid", "pending", "overdue", "exempt"];

const FOLD_FROM = "İIıŞşĞğÜüÖöÇçÂâÎîÛû";
const FOLD_TO = "iiissgguuooccaaiiuu";

/** Türkçe duyarlı, locale'den bağımsız katlama (DB admin_search_fold ile aynı). */
export function foldTr(input: string): string {
  let out = "";
  for (const ch of String(input ?? "")) {
    const i = FOLD_FROM.indexOf(ch);
    out += i >= 0 ? FOLD_TO[i] : ch;
  }
  return out.toLowerCase();
}

/** Arama bir rol kelimesi mi? ("uzm", "uzman", "expert", "yönetici", "admin" …) */
export function roleMatchFromQuery(q: string): "admin" | "expert" | null {
  const f = foldTr(q).trim();
  if (f.length < 3 || /\s/.test(f)) return null;
  if ("uzman".startsWith(f) || "uzmanlar".startsWith(f) || "expert".startsWith(f)) return "expert";
  if ("yonetici".startsWith(f) || "admin".startsWith(f)) return "admin";
  return null;
}

type Search = { get(name: string): string | null };

export type MemberListQueryResult = { ok: true; value: MemberListQuery } | { ok: false; error: string };

function pick<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T | null {
  if (raw === null || raw === "") return fallback;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

/** URL/API sorgusu → doğrulanmış filtre. Bilinmeyen enum / aşırı değer → hata (API 400). */
export function parseMemberListQuery(sp: Search): MemberListQueryResult {
  const view = pick(sp.get("view"), VIEWS, "members");
  const approval = pick(sp.get("approval"), APPROVALS, "all");
  const active = pick(sp.get("active"), ACTIVES, "all");
  const role = pick(sp.get("role"), ROLES, "all");
  const payment = pick(sp.get("payment"), PAYMENTS, "all");
  if (!view || !approval || !active || !role || !payment) return { ok: false, error: "Geçersiz filtre değeri." };
  const q = (sp.get("q") ?? "").trim();
  if (q.length > MEMBER_QUERY_MAX) return { ok: false, error: "Arama metni çok uzun." };
  const pageRaw = sp.get("page");
  const page = pageRaw === null || pageRaw === "" ? 1 : Number(pageRaw);
  if (!Number.isInteger(page) || page < 1 || page > 10000) return { ok: false, error: "Geçersiz sayfa." };
  const sizeRaw = sp.get("pageSize");
  const pageSize = sizeRaw === null || sizeRaw === "" ? MEMBER_DEFAULT_PAGE_SIZE : Number(sizeRaw);
  if (!(MEMBER_PAGE_SIZES as readonly number[]).includes(pageSize)) return { ok: false, error: "Geçersiz sayfa boyutu." };
  return { ok: true, value: { view, q, approval, active, role, payment, page, pageSize: pageSize as MemberPageSize } };
}

/** Filtre → query string (varsayılanlar yazılmaz → temiz URL). */
/** Detaydan listeye dönüşte korunacak liste sorgusu (sekme-yerel; sessionStorage). */
export const MEMBER_LIST_RETURN_KEY = "yasam_admin_member_list_qs";
export const MEMBER_LIST_PATH = "/admin/users";

/**
 * Saklanan ham sorguyu GÜVENLİ dönüş adresine çevirir: yalnız parseMemberListQuery'den geçen
 * değerler yeniden serileştirilir (bilinmeyen/bozuk değer → düz liste). Açık yönlendirme yok —
 * adres her zaman sabit MEMBER_LIST_PATH.
 */
export function memberListReturnHref(rawSearch: string | null | undefined): string {
  const raw = String(rawSearch ?? "").replace(/^\?/, "");
  if (!raw || raw.length > 1000) return MEMBER_LIST_PATH;
  const parsed = parseMemberListQuery(new URLSearchParams(raw));
  if (!parsed.ok) return MEMBER_LIST_PATH;
  const qs = memberListQueryToSearch(parsed.value);
  return qs ? `${MEMBER_LIST_PATH}?${qs}` : MEMBER_LIST_PATH;
}

export function memberListQueryToSearch(q: MemberListQuery): string {
  const p = new URLSearchParams();
  if (q.view !== "members") p.set("view", q.view);
  if (q.q) p.set("q", q.q);
  if (q.approval !== "all") p.set("approval", q.approval);
  if (q.active !== "all") p.set("active", q.active);
  if (q.role !== "all") p.set("role", q.role);
  if (q.payment !== "all") p.set("payment", q.payment);
  if (q.page !== 1) p.set("page", String(q.page));
  if (q.pageSize !== MEMBER_DEFAULT_PAGE_SIZE) p.set("pageSize", String(q.pageSize));
  return p.toString();
}

export type MemberCounts = {
  experts_total: number;
  pending: number;
  approved_active: number;
  archived: number;
  rejected: number;
  admins: number;
};

export function parseMemberCounts(raw: unknown): MemberCounts {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (k: string) => Math.max(0, Math.trunc(Number(r[k]) || 0));
  return {
    experts_total: n("experts_total"),
    pending: n("pending"),
    approved_active: n("approved_active"),
    archived: n("archived"),
    rejected: n("rejected"),
    admins: n("admins"),
  };
}
