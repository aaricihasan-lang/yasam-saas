/**
 * RANDEVU BİLDİRİMİ (AŞAMA 2 · §4.2 · M3) — saf + statik + embedded-pg harness'ı.
 *
 * Prod'a / Supabase'e / ağa TEMAS YOK. Geçici embedded-postgres üzerinde M3 migration'ı
 * (2× idempotent) uygulanır ve unique / FK cascade / CHECK / RLS / ACL doğrulanır.
 *
 * Çalıştır: npx tsx scripts/notifications/unit.harness.ts [--no-pg]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import {
  FIRST_REMIND_BEFORE_MS,
  GENERAL_APPOINTMENT_HEADING,
  HIDDEN_CLIENT_HEADING,
  NOTIFY_TOLERANCE_MS,
  REMIND_REPEAT_MS,
  buildNotificationView,
  buildStateIndex,
  buildWhenLabel,
  clientDisplayName,
  istanbulTodayWindow,
  isNotifiable,
  isUuid,
  normalizeAppointmentStatus,
  notificationQueryWindow,
  notificationStateKey,
  shouldRemind,
  type NotificationAppointment,
} from "../../lib/danisan/appointmentNotifications";

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: unknown, label: string): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.error(`  ✗ ${label}`);
  }
}

const MIN = 60_000;
/** İstanbul yerel saatini (UTC+3, DST yok) UTC Date'e çevirir. */
const ist = (isoLocal: string) => new Date(`${isoLocal}+03:00`);
const appt = (over: Partial<NotificationAppointment> = {}): NotificationAppointment => ({
  id: "11111111-1111-4111-8111-111111111111",
  title: "Biyoenerji Seansı",
  appointment_date: ist("2026-10-01T14:30:00").toISOString(),
  status: "bekliyor",
  client_id: "22222222-2222-4222-8222-222222222222",
  ...over,
});

// ─── 1) isNotifiable ──────────────────────────────────────────────────────────
console.log("\n[1] isNotifiable — görünürlük sınırları");
{
  const now = ist("2026-10-01T14:00:00");
  ok(isNotifiable(appt(), now), "bekliyor + bugün + ileride → görünür");
  ok(isNotifiable(appt({ status: null }), now), "status null = bekliyor → görünür");
  ok(isNotifiable(appt({ status: "" }), now), "status boş = bekliyor → görünür");
  ok(isNotifiable(appt({ status: " Bekliyor " }), now), "status normalize (boşluk/büyük harf) → görünür");
  ok(!isNotifiable(appt({ status: "iptal" }), now), "iptal → görünmez");
  ok(!isNotifiable(appt({ status: "tamamlandi" }), now), "tamamlandi → görünmez");
  ok(!isNotifiable(appt({ status: "garip" }), now), "bilinmeyen statü → görünmez (fail-closed)");
  ok(normalizeAppointmentStatus(null) === "bekliyor" && normalizeAppointmentStatus("İPTAL") === "iptal", "normalizeAppointmentStatus (tr-TR küçük harf)");

  // Tolerans (30 dk)
  ok(isNotifiable(appt({ appointment_date: ist("2026-10-01T13:31:00").toISOString() }), now), "29 dk önce başladı → görünür (tolerans)");
  ok(isNotifiable(appt({ appointment_date: new Date(now.getTime() - NOTIFY_TOLERANCE_MS).toISOString() }), now), "tam 30 dk önce → görünür (≥ sınır dahil)");
  ok(!isNotifiable(appt({ appointment_date: new Date(now.getTime() - NOTIFY_TOLERANCE_MS - 1000).toISOString() }), now), "30 dk + 1 sn önce → görünmez");
  ok(!isNotifiable(appt({ appointment_date: ist("2026-10-02T10:00:00").toISOString() }), now), "yarın → görünmez");
  ok(!isNotifiable(appt({ appointment_date: ist("2026-09-30T23:59:00").toISOString() }), now), "dün → görünmez");
  ok(!isNotifiable(appt({ appointment_date: "geçersiz" }), now), "geçersiz tarih → görünmez");

  // İstanbul gün sınırı (UTC'de aynı gün, İstanbul'da farklı gün)
  const late = ist("2026-10-01T23:30:00"); // = 20:30Z
  ok(isNotifiable(appt({ appointment_date: ist("2026-10-01T23:50:00").toISOString() }), late), "İst 23:30 → 23:50 randevu görünür");
  ok(!isNotifiable(appt({ appointment_date: ist("2026-10-02T00:30:00").toISOString() }), late), "İst 23:30 → ertesi gün 00:30 (UTC'de aynı gün) görünmez");
  const early = ist("2026-10-02T00:30:00"); // = 21:30Z (1 Ekim UTC)
  ok(isNotifiable(appt({ appointment_date: ist("2026-10-02T00:45:00").toISOString() }), early), "İst 00:30 → 00:45 randevu görünür");
  ok(isNotifiable(appt({ appointment_date: ist("2026-10-02T00:10:00").toISOString() }), early), "İst 00:30 → 00:10 (20 dk önce) görünür");
  const justAfterMidnight = ist("2026-10-02T00:10:00");
  ok(!isNotifiable(appt({ appointment_date: ist("2026-10-01T23:50:00").toISOString() }), justAfterMidnight), "İst 00:10 → dünkü 23:50 (tolerans içinde ama dün) görünmez");

  // done / muted + yeniden planlama
  const a = appt();
  const sameInstantOtherFormat = ist("2026-10-01T14:30:00").toISOString().replace("Z", "+00:00");
  ok(!isNotifiable(a, now, [{ appointment_id: a.id, appointment_at: sameInstantOtherFormat, state: "done" }]), "done (aynı an, farklı ISO yazımı) → görünmez");
  ok(!isNotifiable(a, now, [{ appointment_id: a.id, appointment_at: "2026-10-01T14:30:00+03:00", state: "muted" }]), "muted (+03:00 yazımı) → görünmez");
  ok(isNotifiable(a, now, [{ appointment_id: a.id, appointment_at: ist("2026-10-01T12:00:00").toISOString(), state: "done" }]), "yeniden planlanan randevu (eski tarihli done) → TEKRAR görünür");
  ok(isNotifiable(a, now, [{ appointment_id: "33333333-3333-4333-8333-333333333333", appointment_at: a.appointment_date, state: "done" }]), "başka randevunun done kaydı etkilemez");
  ok(isNotifiable(a, now, [{ appointment_id: a.id, appointment_at: a.appointment_date, state: "bogus" }]), "bilinmeyen state değeri yok sayılır");
  const idx = buildStateIndex([{ appointment_id: a.id, appointment_at: a.appointment_date, state: "done" }]);
  ok(!isNotifiable(a, now, idx), "Set<string> indeks kabul edilir");
  ok(notificationStateKey(a.id, "geçersiz") === null, "geçersiz appointment_at → anahtar yok");
}

// ─── 2) shouldRemind ──────────────────────────────────────────────────────────
console.log("\n[2] shouldRemind — 30 dk ilk / 60 dk tekrar / geçince durur");
{
  const a = appt(); // 14:30 İst
  const t = new Date(a.appointment_date).getTime();
  const at = (minBefore: number) => new Date(t - minBefore * MIN);
  ok(FIRST_REMIND_BEFORE_MS === 30 * MIN && REMIND_REPEAT_MS === 60 * MIN, "sabitler: 30 dk / 60 dk");
  ok(shouldRemind(a, at(30), null), "30 dk kala, hiç hatırlatılmadı → hatırlat");
  ok(shouldRemind(a, at(25), null), "25 dk kala, hiç hatırlatılmadı → hatırlat");
  ok(!shouldRemind(a, at(25), at(28).getTime()), "25 dk kala, 3 dk önce (pencere içinde) hatırlatıldı → tekrar YOK");
  ok(shouldRemind(a, at(25), at(50).getTime()), "25 dk kala, son hatırlatma pencere öncesi (25 dk önce) → '30 dk kala' hatırlatması");
  ok(shouldRemind(a, at(180), null), "3 sa kala, cihazda hiç hatırlatılmadı → ilk hatırlatma");
  ok(!shouldRemind(a, at(180), at(180 + 59).getTime()), "3 sa kala, 59 dk önce hatırlatıldı → YOK");
  ok(shouldRemind(a, at(180), at(180 + 60).getTime()), "3 sa kala, 60 dk önce hatırlatıldı → saatlik tekrar");
  ok(!shouldRemind(a, at(0), null), "randevu anı geldi → durur");
  ok(!shouldRemind(a, new Date(t + 10 * MIN), null), "randevu geçti (tolerans içinde görünse de) → hatırlatma durur");
  ok(!shouldRemind(appt({ appointment_date: "x" }), at(10), null), "geçersiz tarih → hatırlatma yok");
}

// ─── 3) buildNotificationView ─────────────────────────────────────────────────
console.log("\n[3] buildNotificationView — başlık / bağlantı / zaman etiketi");
{
  const now = ist("2026-10-01T14:05:00");
  const general = buildNotificationView(appt({ client_id: null }), { clientName: "Sızmamalı", canOpenClient: true, now });
  ok(general.kind === "general" && general.heading === GENERAL_APPOINTMENT_HEADING && general.clientHref === null, "Genel randevu: başlık 'Genel randevu', danışan bağlantısı yok");
  const hidden = buildNotificationView(appt(), { clientName: "Ayşe Yılmaz", canOpenClient: false, now });
  ok(hidden.kind === "hidden_client" && hidden.heading === HIDDEN_CLIENT_HEADING && hidden.clientHref === null, "clients izni yok: ad GİZLİ ('Kayıtlı danışan'), danışan bağlantısı yok");
  ok(!JSON.stringify(hidden).includes("Ayşe"), "izinsizde ad görünümde hiçbir alanda yok");
  const named = buildNotificationView(appt(), { clientName: "Ayşe Yılmaz", canOpenClient: true, now });
  ok(named.kind === "client" && named.heading === "Ayşe Yılmaz" && named.subtitle === "Biyoenerji Seansı", "izinli: danışan adı + randevu başlığı");
  ok(clientDisplayName({ ad: "Ayşe", soyad: null }) === "Ayşe" && clientDisplayName({ ad: "  Ayşe ", soyad: "" }) === "Ayşe", "soyadsız danışan adı");
  ok(clientDisplayName({ ad: null, soyad: null }) === null && clientDisplayName(null) === null, "boş ad → null");
  const noName = buildNotificationView(appt(), { clientName: null, canOpenClient: true, now });
  ok(noName.heading === HIDDEN_CLIENT_HEADING, "izinli ama ad boş/silinmiş → 'Kayıtlı danışan'");
  const noTitle = buildNotificationView(appt({ title: "   " }), { clientName: "Ali", canOpenClient: true, now });
  ok(noTitle.subtitle === null, "boş başlık → subtitle null");
  ok(named.href === "/dashboard/ajanda?randevu=11111111-1111-4111-8111-111111111111", "href = /dashboard/ajanda?randevu=<id>");
  ok(named.clientHref === "/dashboard/clients/22222222-2222-4222-8222-222222222222?tab=randevular&randevu=11111111-1111-4111-8111-111111111111", "clientHref = /dashboard/clients/<cid>?tab=randevular&randevu=<id>");
  const enc = buildNotificationView(appt({ id: "a b/c?&x", client_id: "c/d e" }), { clientName: "Ali", canOpenClient: true, now });
  ok(enc.href === "/dashboard/ajanda?randevu=a%20b%2Fc%3F%26x" && enc.clientHref === "/dashboard/clients/c%2Fd%20e?tab=randevular&randevu=a%20b%2Fc%3F%26x", "href/clientHref encodeURIComponent");
  ok(named.whenLabel === "Bugün 14:30 · 25 dk sonra", `whenLabel ileride: "${named.whenLabel}"`);
  ok(buildWhenLabel(ist("2026-10-01T14:30:00").toISOString(), ist("2026-10-01T14:30:20")) === "Şimdi", "whenLabel ±1 dk → 'Şimdi'");
  ok(buildWhenLabel(ist("2026-10-01T15:35:00").toISOString(), now) === "Bugün 15:35 · 1 sa 30 dk sonra", "whenLabel saat+dk");
  ok(buildWhenLabel(ist("2026-10-01T16:05:00").toISOString(), now) === "Bugün 16:05 · 2 sa sonra", "whenLabel tam saat");
  ok(buildWhenLabel(ist("2026-10-01T13:55:00").toISOString(), now) === "Bugün 13:55 · 10 dk önce başladı", "whenLabel başlamış randevu");
}

// ─── 4) İstanbul günü penceresi ───────────────────────────────────────────────
console.log("\n[4] İstanbul bugün / sorgu penceresi");
{
  const w = istanbulTodayWindow(ist("2026-10-01T14:00:00"));
  ok(w.dayKey === "2026-10-01" && w.dayStart.toISOString() === "2026-09-30T21:00:00.000Z" && w.dayEnd.toISOString() === "2026-10-01T20:59:59.999Z", "gün penceresi 00:00–23:59:59.999 İst");
  const w2 = istanbulTodayWindow(ist("2026-10-02T00:10:00"));
  ok(w2.dayKey === "2026-10-02" && w2.dayStart.toISOString() === "2026-10-01T21:00:00.000Z", "gece yarısı sonrası doğru İst günü (UTC'de hâlâ 1 Ekim)");
  const q = notificationQueryWindow(ist("2026-10-01T14:00:00"));
  ok(q.fromIso === "2026-10-01T10:30:00.000Z" && q.toIso === "2026-10-01T20:59:59.999Z", "sorgu: [now−30dk, gün sonu]");
  const q2 = notificationQueryWindow(ist("2026-10-02T00:10:00"));
  ok(q2.fromIso === "2026-10-01T21:00:00.000Z", "sorgu: gün başı now−30dk'dan sonra ise gün başı");
  ok(isUuid("11111111-1111-4111-8111-111111111111") && !isUuid("1; drop") && !isUuid(null) && !isUuid(42), "isUuid");
}

// ─── 5) Statik sözleşmeler ────────────────────────────────────────────────────
console.log("\n[5] Statik: route güvenliği + bileşen sözleşmesi");
{
  const getSrc = read("app/api/appointments/notifications/route.ts");
  const postSrc = read("app/api/appointments/notifications/state/route.ts");
  for (const [name, src] of [["GET", getSrc], ["POST state", postSrc]] as const) {
    ok(/requireModuleAccess\(req, "appointments"\)/.test(src), `${name}: requireModuleAccess("appointments")`);
    ok(/Cache-Control": "no-store"/.test(src), `${name}: no-store`);
    ok(!/error\.message|\.message\s*\}/.test(src), `${name}: ham hata mesajı yanıtta yok`);
    ok(!/searchParams\.get\("tenant|body\.tenant|body\.user|x-tenant/i.test(src), `${name}: tenant/user istemciden alınmaz`);
    // Her okuma zinciri tenant ile bağlı; yazma (upsert) satırı tenant'ı guard'dan yazar.
    const chains = src.split(".from(").slice(1).map((seg) => seg.slice(0, seg.indexOf(";")));
    ok(chains.length > 0, `${name}: en az bir sorgu`);
    for (const c of chains) {
      const table = c.slice(0, c.indexOf(")"));
      if (/\.upsert\(/.test(c)) ok(/tenant_id: tenantId/.test(c) && /user_id: userId/.test(c), `${name}: ${table} upsert tenant_id/user_id guard'dan`);
      else ok(/\.eq\("tenant_id", tenantId\)/.test(c), `${name}: ${table} sorgusu .eq("tenant_id", tenantId)`);
      const sel = /\.select\("([^"]*)"\)/.exec(c)?.[1] ?? "";
      ok(!/\bnotes\b/.test(sel) && sel !== "*", `${name}: ${table} select'inde notes / * yok`);
    }
  }
  ok(/\.eq\("user_id", userId\)/.test(getSrc), "GET: states yalnız kullanıcının kendi kayıtları");
  ok(/resolveModuleAccess\(profile\.role, profile\.module_permissions, "clients"\)/.test(getSrc) && /if \(canClients && clientIds\.length > 0\)/.test(getSrc), "GET: danışan adı yalnız clients izniyle");
  ok(/\.in\("id", clientIds\)/.test(getSrc), "GET: danışan adları tek batch .in()");
  ok(/select\("id, title, appointment_date, status, client_id"\)/.test(getSrc), "GET: randevu kolon izin listesi (notes YOK)");
  ok(/isUuid\(appointmentId\)/.test(postSrc) && /isNotificationStateValue\(state\)/.test(postSrc), "POST: UUID + state allowlist");
  ok(/MAX_BODY_BYTES = 1024/.test(postSrc) && /413/.test(postSrc), "POST: gövde sınırı (413)");
  ok(/is_demo_account/.test(postSrc) && /demo: true/.test(postSrc), "POST: demo hesap → yazma yok");
  ok(/appointment_at: appointmentAt/.test(postSrc) && !/body\.appointment_?[aA]t/.test(postSrc), "POST: appointment_at sunucudaki randevu tarihinden");
  ok(/onConflict: "user_id,appointment_id,appointment_at"/.test(postSrc), "POST: upsert anahtarı (user, appointment, appointment_at)");
  ok(!/from\("appointments"\)[\s\S]{0,200}\.update\(/.test(postSrc), "POST: randevu statüsü DEĞİŞTİRİLMEZ");

  const registry = read("lib/auth/moduleRouteRegistry.ts");
  ok(/prefix: "app\/api\/appointments", key: "appointments"/.test(registry), "moduleRouteRegistry: app/api/appointments prefix'i yeni route'ları kapsar");

  const bell = read("components/notifications/NotificationBell.tsx");
  const store = read("components/notifications/notificationStore.ts");
  ok(!/position:\s*["']?fixed|\bfixed\b(?![-\w])/.test(bell.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), "NotificationBell: position fixed YOK");
  const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  ok(!/\balert\(/.test(stripComments(bell + store)), "alert() YOK");
  ok(/aria-label="Bildirimler"/.test(bell) && /aria-expanded=\{open\}/.test(bell), "zil: aria-label + aria-expanded");
  ok(/absolute right-0 top-full/.test(bell) && /min\(320px, calc\(100vw - 32px\)\)/.test(bell), "dropdown absolute right-0 top-full, min(320px, 100vw−32px)");
  ok(/shouldSkipAppointmentNotifications\(pathname\)/.test(bell), "zil: /dogaltas* + /admin* atlama kuralı");
  ok(/export type NotificationBellProps = \{\s*className\?: string;[\s\S]*compact\?: boolean;\s*\}/.test(bell), "props: { className?, compact? }");
  ok(/res\.status === 401 \|\| res\.status === 403/.test(store) && /stopTimers\(\)/.test(store), "401/403 → polling durur");
  ok(/POLL_MS = 5 \* 60 \* 1000/.test(store), "polling 5 dk");
  ok(/type Persisted = \{ seen: string\[\]; reminded: Record<string, number> \}/.test(store), "localStorage yalnız anahtar + zaman (PII yok)");
  ok(/hasNotificationSession\(\)/.test(bell) && /if \(!hasNotificationSession\(\)\)/.test(store), "oturumsuz ziyaretçide istek yok");

  const legacy = read("shared/DashboardNotifications.tsx");
  ok(/pathname === "\/admin" \|\|\s*\(pathname \?\? ""\)\.startsWith\("\/admin\/"\)/.test(legacy), "uye-yonetimi-faz2 harness regex'i (MEM-020) shared/DashboardNotifications.tsx'te korunur");
  ok(/startsWith\("\/dogaltas\/"\)/.test(legacy) && !/position:\s*"fixed"/.test(legacy), "legacy dosya: dogaltas kuralı var, fixed render YOK");

  const ajanda = read("app/dashboard/ajanda/page.tsx");
  ok(/useSearchParams\(\)/.test(ajanda) && /searchParams\.get\("randevu"\)/.test(ajanda) && /<Suspense fallback=/.test(ajanda), "ajanda: ?randevu + Suspense");
  ok(/router\.replace\("\/dashboard\/ajanda"/.test(ajanda) && /Randevu bulunamadı/.test(ajanda) && /setSelectedAppointment\(target\)/.test(ajanda), "ajanda: bulunca modal, yoksa toast, param temizlenir");
  ok(/max-h-\[calc\(100dvh-2rem\)\][^"]*overflow-y-auto/.test(ajanda), "ajanda: randevu detay modalı max-h + scroll (4.10)");
  const clientPage = read("app/dashboard/clients/[id]/page.tsx");
  ok(/initialAppointmentId=\{deepLinkAppointmentId\}/.test(clientPage) && /searchParams\.get\("randevu"\)/.test(clientPage), "danışan kartı: ?randevu → AppointmentsTab initialAppointmentId");
  ok(/if \(tabParam !== prevTabParam\)/.test(clientPage), "danışan kartı: ?tab değişiminde aktif sekme senkronu");
  ok(/max-h-\[calc\(100dvh-2rem\)\] w-\[min\(560px,100%\)\] overflow-y-auto/.test(clientPage), "danışan kartı: randevu modalı max-h + scroll (4.10)");

  const manifest = read("scripts/usage360/route-events/appointments.json");
  const hasManifest = /"route":\s*"appointments\/notifications\/state"/.test(manifest);
  console.log(hasManifest
    ? "  ✓ usage360 manifest: appointments/notifications/state girdisi var"
    : "  ! BEKLİYOR (orkestratör): usage360 manifest'e appointments/notifications/state#POST exempt girdisi");
}

// ─── 6) M3 migration — embedded-pg ────────────────────────────────────────────
async function pgSuite(): Promise<void> {
  console.log("\n[6] M3 migration — embedded-postgres (2× idempotent)");
  const MIG = "supabase/migrations/20271001000200_appointment_notification_states.sql";
  const migSql = read(MIG);
  ok(/ENABLE ROW LEVEL SECURITY/.test(migSql) && !/CREATE POLICY/i.test(migSql), "migration: RLS açık, policy yok");
  ok(!/yh_client_outbox|yasam_hafizasi|CREATE TRIGGER/i.test(migSql.replace(/--.*$/gm, "")), "migration: Yaşam Hafızası CDC trigger'ı YOK");
  ok(/NOTIFY pgrst, 'reload schema'/.test(migSql) && /Rollback:/.test(migSql), "migration: NOTIFY pgrst + Rollback notu");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "notif-pg-"));
  const port = 52000 + Math.floor(Math.random() * 3000);
  const server = new EmbeddedPostgres({
    databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
    initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {},
  });
  await server.initialise();
  await server.start();
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  try {
    await c.connect();
    await c.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
      END $$;
      CREATE TABLE public.tenants (id uuid PRIMARY KEY);
      CREATE TABLE public.users (id uuid PRIMARY KEY, tenant_id uuid REFERENCES public.tenants(id));
      CREATE TABLE public.appointments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid,
        user_id uuid, title text, notes text, appointment_date timestamptz NOT NULL, status text,
        created_at timestamptz DEFAULT now());
      -- Eski geniş grant'ler (prod'da olabilecek) → migration REVOKE etmeli.
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
      INSERT INTO public.tenants VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      INSERT INTO public.users VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
                                      ('b1b1b1b1-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      INSERT INTO public.appointments (id, tenant_id, appointment_date, status) VALUES
        ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-10-01T11:30:00Z', 'bekliyor'),
        ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-10-01T12:30:00Z', NULL);
    `);
    let migErr: unknown = null;
    try {
      await c.query(migSql);
      await c.query(migSql); // idempotency
    } catch (e) {
      migErr = e;
    }
    ok(!migErr, `migration 2× uygulandı (idempotent)${migErr ? `: ${(migErr as Error).message}` : ""}`);
    if (migErr) return;

    const code = async (sql: string, params: unknown[] = []): Promise<string | null> => {
      try {
        await c.query(sql, params);
        return null;
      } catch (e) {
        return (e as { code?: string }).code ?? "ERR";
      }
    };
    const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const U = "a1a1a1a1-0000-4000-8000-000000000001";
    const A1 = "11111111-1111-4111-8111-111111111111";
    const A2 = "22222222-2222-4222-8222-222222222222";
    const ins = `INSERT INTO public.appointment_notification_states (tenant_id, user_id, appointment_id, appointment_at, state) VALUES ($1,$2,$3,$4,$5)`;

    ok((await code(ins, [T, U, A1, "2026-10-01T11:30:00Z", "done"])) === null, "insert done");
    ok((await code(ins, [T, U, A1, "2026-10-01T14:30:00+03:00", "muted"])) === "23505", "UNIQUE (user, appointment, appointment_at): aynı an farklı yazım → 23505");
    ok((await code(ins, [T, U, A1, "2026-10-01T13:00:00Z", "muted"])) === null, "yeniden planlanan an → yeni kayıt (izinli)");
    ok((await code(ins, [T, U, A2, "2026-10-01T12:30:00Z", "snooze"])) === "23514", "CHECK state IN (done, muted) → 23514");
    ok((await code(ins, [T, U, "99999999-9999-4999-8999-999999999999", "2026-10-01T12:30:00Z", "done"])) === "23503", "FK appointments → 23503");
    ok((await code(ins, [T, "c1c1c1c1-0000-4000-8000-000000000009", A2, "2026-10-01T12:30:00Z", "done"])) === "23503", "FK users → 23503");
    ok((await code(ins, [T, U, A2, null, "done"])) === "23502", "appointment_at NOT NULL → 23502");

    // ON CONFLICT upsert (API deseni)
    const up = await c.query(
      `INSERT INTO public.appointment_notification_states (tenant_id, user_id, appointment_id, appointment_at, state)
       VALUES ($1,$2,$3,$4,'muted')
       ON CONFLICT (user_id, appointment_id, appointment_at) DO UPDATE SET state = EXCLUDED.state, updated_at = now()
       RETURNING state`,
      [T, U, A1, "2026-10-01T11:30:00Z"],
    );
    ok(up.rows[0]?.state === "muted", "upsert onConflict(user_id, appointment_id, appointment_at) çalışır");

    const count = async (where = "true") =>
      Number((await c.query(`SELECT count(*)::int AS n FROM public.appointment_notification_states WHERE ${where}`)).rows[0].n);
    const before = await count(`appointment_id = '${A1}'`);
    await c.query(`DELETE FROM public.appointments WHERE id = $1`, [A1]);
    ok(before === 2 && (await count(`appointment_id = '${A1}'`)) === 0, "randevu silinince durumlar CASCADE silinir");
    await c.query(ins, [T, U, A2, "2026-10-01T12:30:00Z", "done"]);
    await c.query(`DELETE FROM public.users WHERE id = $1`, [U]);
    ok((await count()) === 0, "kullanıcı silinince durumlar CASCADE silinir");
    await c.query(`INSERT INTO public.users VALUES ($1, $2)`, [U, T]);
    await c.query(ins, [T, U, A2, "2026-10-01T12:30:00Z", "done"]);
    await c.query(`DELETE FROM public.users WHERE tenant_id = $1`, [T]);
    await c.query(`DELETE FROM public.tenants WHERE id = $1`, [T]);
    ok((await count()) === 0, "tenant silinince durumlar CASCADE silinir");

    const rls = await c.query(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.appointment_notification_states'::regclass`);
    ok(rls.rows[0]?.relrowsecurity === true, "RLS ENABLE");
    const pol = await c.query(`SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'appointment_notification_states'`);
    ok(pol.rows[0].n === 0, "policy yok (yalnız service_role)");
    const priv = await c.query(`
      SELECT has_table_privilege('anon', 'public.appointment_notification_states', 'SELECT') AS anon_sel,
             has_table_privilege('authenticated', 'public.appointment_notification_states', 'INSERT') AS auth_ins,
             has_table_privilege('authenticated', 'public.appointment_notification_states', 'SELECT') AS auth_sel,
             has_table_privilege('service_role', 'public.appointment_notification_states', 'SELECT,INSERT,UPDATE,DELETE') AS svc`);
    const p = priv.rows[0];
    ok(p.anon_sel === false && p.auth_ins === false && p.auth_sel === false, "anon/authenticated: yetki YOK (varsayılan geniş grant'e rağmen REVOKE)");
    ok(p.svc === true, "service_role: tam yetki");
    const idx = await c.query(`SELECT indexdef FROM pg_indexes WHERE tablename = 'appointment_notification_states'`);
    const defs = idx.rows.map((r: { indexdef: string }) => r.indexdef).join("\n");
    ok(/\(tenant_id, user_id\)/.test(defs), "index (tenant_id, user_id)");
    ok(/UNIQUE INDEX[\s\S]*\(user_id, appointment_id, appointment_at\)/.test(defs), "unique index (user_id, appointment_id, appointment_at)");
    const trg = await c.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid = 'public.appointment_notification_states'::regclass AND NOT tgisinternal`);
    ok(trg.rows[0].n === 0, "tabloda trigger yok (CDC eklenmedi)");
  } finally {
    await c.end().catch(() => {});
    await server.stop().catch(() => {});
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows: postgres süreci dosyaları geç bırakabilir — geçici dizin kalabilir.
    }
  }
}

(async () => {
  if (!process.argv.includes("--no-pg")) {
    try {
      await pgSuite();
    } catch (e) {
      ok(false, `embedded-pg çalıştırılamadı: ${(e as Error).message}`);
    }
  }
  console.log(`\nnotifications.harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.error(failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
})();
