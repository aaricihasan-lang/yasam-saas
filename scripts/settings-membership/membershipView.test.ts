/**
 * F4 — Ayarlar › Üyeliğim SAF durum çözümleyicisi testleri (DB / ağ YOK).
 * Çalıştır: npx tsx scripts/settings-membership/membershipView.test.ts
 */
import {
  formatMembershipDateTime,
  NO_END_DATE_TEXT,
  profileStateFromResponse,
  resolveMembershipView,
  type MembershipView,
  type TrialStatusLite,
} from "../../lib/settings/membershipView";
import { TRIAL_MESSAGES } from "../../lib/trial/trialCore";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}

const NOW = Date.parse("2026-11-10T09:00:00.000Z"); // 10 Kasım 2026 12:00 TSİ
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

function base(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "00000000-0000-0000-0000-00000000f401", email: "ayse.yilmaz@example.invalid", full_name: "Ayşe Yılmaz",
    role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    membership_status: "active", subscription_status: "active", membership_started_at: null, membership_ends_at: null,
    trial_started_at: null, trial_ends_at: null, trial_kind: null, trial_status: null, is_demo_account: false,
    tenant_id: "10000000-0000-0000-0000-00000000f401", ...extra,
  };
}
const view = (profile: Record<string, unknown>, trial: TrialStatusLite | null = null, nowMs = NOW): MembershipView =>
  resolveMembershipView({ profile: { status: "ok", profile }, trial, nowMs });
const allText = (v: MembershipView) => JSON.stringify(v);
const FORBIDDEN = [/sınırsız/i, /ömür boyu/i, /otomatik yenilen/i, /aktif ödeme/i, /süresiz/i];

function noForbidden(v: MembershipView, label: string) {
  const t = allText(v);
  ok(FORBIDDEN.every((re) => !re.test(t)), `${label}: doğrulanmamış ifade yok (sınırsız / ömür boyu / otomatik yenileme / aktif ödeme / süresiz)`, t);
}

console.log("\n── Tarih biçimi (Europe/Istanbul) ──");
ok(formatMembershipDateTime("2026-11-10T21:00:00.000Z") === "11 Kasım 2026, 00:00", "UTC 21:00 → TSİ ertesi gün gece yarısı", formatMembershipDateTime("2026-11-10T21:00:00.000Z"));
ok(formatMembershipDateTime("2026-11-10T20:59:00.000Z") === "10 Kasım 2026, 23:59", "UTC 20:59 → aynı gün 23:59");
ok(formatMembershipDateTime("2026-12-31T21:00:00Z") === "1 Ocak 2027, 00:00", "yıl sınırı: 31 Aralık 21:00Z → 1 Ocak 2027 00:00");
ok(formatMembershipDateTime("2026-03-29T00:30:00Z") === "29 Mart 2026, 03:30", "TR'de yaz saati yok: Mart sonunda da +03");
ok(formatMembershipDateTime("2026-08-15T12:05:00+03:00") === "15 Ağustos 2026, 12:05", "+03 ofsetli ISO aynen");
ok(formatMembershipDateTime(null) === null && formatMembershipDateTime("") === null && formatMembershipDateTime("bozuk") === null, "boş / geçersiz → null (uydurma tarih yok)");

console.log("\n── Deneme üyesi aktif ──");
{
  const started = NOW - 2 * 24 * H;
  const ends = started + 168 * H;
  const p = base({ package_type: null, plan: null, trial_kind: "self_7d", trial_status: "active", trial_started_at: iso(started), trial_ends_at: iso(ends) });
  const t: TrialStatusLite = { phase: "active", startedAt: iso(started), endsAt: iso(ends), serverNow: iso(NOW), credits: { dailyLimit: 50, usedTotal: 12 }, proRequestAt: null };
  const v = view(p, t);
  ok(v.kind === "trial_active" && v.packageLabel === "Ücretsiz deneme (7 gün)" && v.statusLabel === "Deneme sürüyor", "aktif deneme etiketi (admin adlandırmasıyla aynı)", v);
  ok(v.rows.some((r) => r.term === "Deneme başlangıcı" && r.value === "8 Kasım 2026, 12:00"), "deneme başlangıcı TSİ", v.rows);
  ok(v.rows.some((r) => r.term === "Deneme bitişi" && r.value === "15 Kasım 2026, 12:00"), "deneme bitişi TSİ (168 saat)");
  ok(v.rows.some((r) => r.term === "Bugünkü Roxy krediniz" && r.value === "38 / 50"), "günlük ortak kredi: kalan / limit");
  ok(v.restrictions.some((r) => r.includes("Dijital İçerik")) && v.restrictions.some((r) => r.includes("00.00")), "deneme kısıtları: Dijital İçerik kapalı + kredi gece yarısı yenilenir");
  ok(v.contactCta?.label === "Pro üyelik talebi", "Pro üyelik talebi → mevcut İrtibat akışı");
  noForbidden(v, "aktif deneme");
  const over = view(p, { ...t, credits: { dailyLimit: 50, usedTotal: 61 } });
  ok(over.rows.some((r) => r.value === "0 / 50"), "kredi negatif gösterilmez");
  const noCredit = view(p, { ...t, credits: null });
  ok(!noCredit.rows.some((r) => r.term.includes("Roxy")), "kredi okunamadıysa satır yok (uydurma yok)");
  const offline = view(p, null);
  ok(offline.kind === "trial_active" && !offline.rows.some((r) => r.term.includes("Roxy")), "durum ucu yoksa faz profilden; kredi satırı yok");
}

console.log("\n── Deneme sınırı (bitiş anı) ──");
{
  const ends = NOW;
  const p = base({ package_type: null, plan: null, trial_kind: "self_7d", trial_status: "active", trial_started_at: iso(ends - 168 * H), trial_ends_at: iso(ends) });
  ok(view(p, null, NOW - 1).kind === "trial_active", "bitişten 1 ms önce → aktif");
  ok(view(p, null, NOW).kind === "trial_expired", "bitiş anında → sona erdi (ends > now kuralı)");
  // Sunucu fazı istemci saatine üstündür.
  const t: TrialStatusLite = { phase: "active", startedAt: null, endsAt: iso(ends), serverNow: iso(NOW - 1000), credits: null, proRequestAt: null };
  ok(view(p, t, NOW + 10 * H).kind === "trial_active", "sunucu fazı (active) cihaz saatine üstün");
}

console.log("\n── Denemesi bitmiş / durdurulmuş / inceleme / başlamamış ──");
{
  const p = base({ package_type: null, plan: null, trial_kind: "self_7d", trial_status: "active", trial_started_at: iso(NOW - 200 * H), trial_ends_at: iso(NOW - 32 * H) });
  const v = view(p, { phase: "expired", startedAt: iso(NOW - 200 * H), endsAt: iso(NOW - 32 * H), serverNow: iso(NOW), credits: { dailyLimit: 50, usedTotal: 0 }, proRequestAt: "2026-11-09T10:15:00Z" });
  ok(v.kind === "trial_expired" && v.summary === TRIAL_MESSAGES.expired, "süresi dolmuş: mevcut sunucu mesajı", v);
  ok(v.restrictions.some((r) => r.includes("görüntüleyebilir") && r.includes("dışa aktar")) && v.restrictions.some((r) => r.includes("Yeni kayıt")), "salt-okunur: görüntüleme + dışa aktarma açık, yeni işlem kapalı");
  ok(!v.rows.some((r) => r.term.includes("Roxy")), "süresi dolmuşta kredi satırı yok");
  ok(v.rows.some((r) => r.term === "Pro üyelik talebi" && r.value === "Alındı · 9 Kasım 2026, 13:15"), "açık Pro talebi tarihi gösterilir");
  noForbidden(v, "süresi dolmuş deneme");
  const s = view(base({ package_type: null, trial_kind: "self_7d", trial_status: "suspended", trial_ends_at: iso(NOW + 24 * H) }));
  ok(s.kind === "trial_suspended" && s.summary === TRIAL_MESSAGES.suspended, "durdurulmuş: salt okunur");
  const r = view(base({ package_type: null, trial_kind: "self_7d", trial_status: "review" }));
  ok(r.kind === "trial_review" && r.summary === TRIAL_MESSAGES.review && r.contactCta?.label === "Yöneticiyle iletişime geç", "inceleme: erişim yok, bilgi CTA");
  const n = view(base({ package_type: null, trial_kind: "self_7d", trial_status: "not_started" }));
  ok(n.kind === "trial_not_started" && n.rows.length === 0, "başlamamış: tarih uydurulmaz");
}

console.log("\n── Pro aktif / bitiş tarihi yok / süresi dolmuş ──");
{
  const v = view(base({ membership_started_at: "2026-10-01T07:30:00Z" }));
  ok(v.kind === "pro_active" && v.packageLabel === "Pro üyelik" && v.statusLabel === "Aktif", "Pro (package premium) aktif", v);
  ok(v.rows.some((r) => r.term === "Üyelik başlangıcı" && r.value === "1 Ekim 2026, 10:30"), "üyelik başlangıcı TSİ");
  ok(v.rows.some((r) => r.term === "Üyelik bitişi" && r.value === NO_END_DATE_TEXT && (r.note ?? "").includes("yöneticinizle")), "bitiş yok → dürüst metin");
  ok(v.restrictions.some((r) => r.includes("yöneticinizin hesabınız için açtığı modüller")), "modül izni kuralı");
  noForbidden(v, "Pro aktif");
  const future = view(base({ membership_ends_at: "2027-11-10T21:00:00Z" }));
  ok(future.rows.some((r) => r.term === "Üyelik bitişi" && r.value === "11 Kasım 2027, 00:00" && !r.note), "gelecek bitiş tarihi gösterilir");
  const past = view(base({ membership_ends_at: "2026-11-01T00:00:00Z" }));
  ok(past.kind === "pro_active" && past.rows.some((r) => r.term === "Üyelik bitişi" && r.value === "1 Kasım 2026, 03:00" && (r.note ?? "").includes("geçmiş")), "Pro süresi dolmuş: tarih + açıklama; erişim kuralı tarih okumaz → hâlâ aktif");
  noForbidden(past, "Pro süresi dolmuş");
  // H1: Pro onayında korunan eski trial_* tarihçesi gösterilmez.
  const legacyTrialDates = view(base({ trial_started_at: "2026-09-01T00:00:00Z", trial_ends_at: "2026-09-08T00:00:00Z" }));
  ok(!legacyTrialDates.rows.some((r) => r.term.startsWith("Deneme")) && legacyTrialDates.kind === "pro_active", "deneme rejimi dışı Pro'da eski trial tarihleri GÖSTERİLMEZ");
  const converted = view(base({ trial_kind: "self_7d", trial_status: "converted", trial_ends_at: iso(NOW - 48 * H) }), { phase: "expired", startedAt: null, endsAt: null, serverNow: iso(NOW), credits: null, proRequestAt: null });
  ok(converted.kind === "pro_active", "Pro'ya geçirilmiş deneme → Pro üyelik");
  const plan = view(base({ package_type: null, plan: "premium" }));
  ok(plan.kind === "pro_active", "package_type boş, plan=premium → Pro (erişim çekirdeğiyle aynı öncelik)");
}

console.log("\n── Paket yok / onay bekleyen / hata ──");
{
  const legacy = view(base({ package_type: "trial", plan: "trial" }));
  ok(legacy.kind === "no_package" && legacy.statusLabel === "Erişim kapalı", "eski kayıt (premium değil, deneme rejiminde değil) → paket tanımlı değil");
  const pro = view(base({ package_type: "pro", plan: "pro" }));
  ok(pro.kind === "no_package", "legacy 'pro' değeri erişim açmaz → paket tanımlı değil (çekirdekle aynı)");
  const pend = resolveMembershipView({ profile: profileStateFromResponse(403, { error: "Hesabınız henüz onaylanmadı." }), nowMs: NOW });
  ok(pend.kind === "pending" && pend.contactCta === null, "onay bekleyen: 403 'onaylanmadı' → bekliyor; İrtibat CTA yok (o uç da onay ister)");
  const forb = resolveMembershipView({ profile: profileStateFromResponse(403, { error: "Oturum kimliği uyuşmuyor." }), nowMs: NOW });
  ok(forb.kind === "unavailable" && forb.rows.length === 0, "başka kullanıcı id'si (guard 403) → hiçbir veri gösterilmez");
  const unauth = resolveMembershipView({ profile: profileStateFromResponse(401, { error: "Oturum geçersiz" }), nowMs: NOW });
  ok(unauth.kind === "unavailable", "401 → bilgi alınamadı");
  ok(profileStateFromResponse(200, { ok: false }).status === "error" && profileStateFromResponse(200, null).status === "error", "bozuk gövde → hata");
}

console.log("\n── Demo / admin ──");
{
  const d = view(base({ is_demo_account: true }));
  ok(d.kind === "demo" && d.packageLabel === "Demo hesabı" && d.restrictions.some((r) => r.includes("dışa aktarma")), "demo: açıklama + kapalı işlemler");
  ok(d.rows.length === 0, "demo: tarih/paket ayrıntısı yok");
  const dt = view(base({ is_demo_account: true, trial_kind: "self_7d", trial_status: "active", trial_ends_at: iso(NOW + H) }));
  ok(dt.kind === "demo", "demo bayrağı deneme alanlarından önce gelir");
  const a = view(base({ role: "admin", package_type: null, plan: null, membership_ends_at: "2020-01-01T00:00:00Z" }));
  ok(a.kind === "admin" && a.packageLabel === "Yönetici" && a.rows.length === 0 && a.contactCta === null, "admin: Yönetici, paket kuralları uygulanmaz");
  const A = view(base({ role: "ADMIN " }));
  ok(A.kind === "admin", "rol büyük/küçük harf + boşluk toleransı");
}

console.log(`\nToplam: ${pass} geçti, ${fail} kaldı`);
if (fail > 0) process.exit(1);
