/**
 * ÜYE YÖNETİMİ 360° — ROUTE ENTEGRASYON harness'i (gerçek Next handler + gerçek PostgreSQL + gerçek RPC).
 * Ephemeral embedded-postgres + test-only PostgREST shim. Production'a SIFIR temas; sentetik veri.
 *
 * Kapsam: GET /api/admin/users (yeni filtre/sıralama + measurement), GET /api/admin/users/overview,
 * /api/admin/users/[id]/pricing-phases (GET/POST/PATCH/DELETE), ödeme route'u regresyonu, audit
 * route'unda hassas değer yokluğu, yetki negatifleri (tokensız / uzman token / spoof / pasif admin).
 *
 * Çalıştır: npx tsx scripts/uye-yonetimi-360/route-integration.harness.ts
 */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb360 } from "./testDb360";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}

const OWNER = "00000000-0000-4000-8000-00000000c3a1";
const ADMIN2 = "00000000-0000-4000-8000-00000000c3a2";
const INACTIVE_ADMIN = "00000000-0000-4000-8000-00000000c3a3";
const TOK = { owner: "zz-m360-owner-token-0001", admin2: "zz-m360-admin2-token-0001", inactive: "zz-m360-inactive-token-0001" };

function istanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const db = await startTestDb360(54393, "uye-yonetimi-360-routes");
  const { su } = db;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  try {
    const tenant = async () => {
      const id = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 12)}`]);
      return id;
    };
    for (const [id, name, email, sup, active] of [
      [OWNER, "ZZ_M360_OWNER", "zz.m360r.owner@example.test", true, true],
      [ADMIN2, "ZZ_M360_ADMIN2", "zz.m360r.admin2@example.test", false, true],
      [INACTIVE_ADMIN, "ZZ_M360_INACTIVE", "zz.m360r.inactive@example.test", false, false],
    ] as [string, string, string, boolean, boolean][]) {
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id)
         values ($1,$2,$3,'admin',$5,'approved',$4,$6,$7)`,
        [id, name, email, sup, active, sup ? "owner" : "admin", await tenant()],
      );
    }
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($3,$4),($5,$6)`,
      [OWNER, TOK.owner, ADMIN2, TOK.admin2, INACTIVE_ADMIN, TOK.inactive]);

    shim = await startPgrestShim(db.pool);
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
    console.log(`360 test DB + shim hazır (${shim.url}).\n`);

    const usersRoute = await import("../../app/api/admin/users/route");
    const overviewRoute = await import("../../app/api/admin/users/overview/route");
    const pricingRoute = await import("../../app/api/admin/users/[id]/pricing-phases/route");
    const paymentRoute = await import("../../app/api/admin/users/[id]/payment/route");
    const auditRoute = await import("../../app/api/admin/users/[id]/audit/route");
    const { mapDbUser } = await import("../../lib/admin/userManagement");
    const { parseMemberActivity, attentionReasons } = await import("../../lib/admin/member360");

    type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
    type Auth = { adminId?: string; token?: string };
    const asOwner: Auth = { adminId: OWNER, token: TOK.owner };
    const asAdmin2: Auth = { adminId: ADMIN2, token: TOK.admin2 };
    async function call(handler: unknown, method: string, url: string, auth: Auth, body?: unknown, id = "") {
      const headers: Record<string, string> = {};
      if (auth.adminId) headers["x-admin-id"] = auth.adminId;
      if (auth.token) headers["x-session-token"] = auth.token;
      if (body !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest(`http://localhost${url}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
      const res = await (handler as Handler)(req, { params: Promise.resolve({ id }) });
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
      return { status: res.status, json, headers: res.headers };
    }
    const list = (qs: string, auth: Auth = asOwner) => call(usersRoute.GET, "GET", `/api/admin/users?${qs}`, auth);
    const ov = (auth: Auth = asOwner) => call(overviewRoute.GET, "GET", "/api/admin/users/overview", auth);
    const phases = (id: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown, auth: Auth = asOwner) =>
      call(method === "GET" ? pricingRoute.GET : method === "POST" ? pricingRoute.POST : method === "PATCH" ? pricingRoute.PATCH : pricingRoute.DELETE,
        method, `/api/admin/users/${id}/pricing-phases`, auth, body, id);

    const TODAY = istanbulToday();
    const mkExpert = async (o: { name: string; approval?: string; active?: boolean; demo?: boolean; perms?: Record<string, unknown>; npd?: string | null; payment?: string | null; created?: string }) => {
      const id = randomUUID();
      const t = await tenant();
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_demo_account, module_permissions, tenant_id,
                                  payment_status, next_payment_date, package_type, plan, created_at, approved_at)
         values ($1,$2,$3,'expert',$4,$5,$6,$7,$8,$9,$10::date,'premium','premium',$11::timestamptz,$11::timestamptz)`,
        [id, o.name, `zz.m360r.${id.slice(0, 8)}@example.test`, o.active ?? true, o.approval ?? "approved", o.demo ?? false,
          JSON.stringify(o.perms ?? {}), t, o.payment ?? null, o.npd ?? null, `${o.created ?? "2025-01-01"}T09:00:00+03:00`],
      );
      return { id, tenant: t };
    };
    const usage = async (u: { id: string; tenant: string }, day: string) =>
      su.query(`insert into public.usage_daily(user_id, tenant_id, day_tr, channel, visits, active_seconds, first_at, last_at)
                values ($1,$2,$3::date,'desktop_web',1,60,($3::date + time '10:00') at time zone 'Europe/Istanbul',($3::date + time '11:00') at time zone 'Europe/Istanbul') on conflict do nothing`, [u.id, u.tenant, day]);

    // ── A) Yetki negatifleri ─────────────────────────────────────────────────────
    console.log("[A] Yetki");
    const E0 = await mkExpert({ name: "ZZ_M360R Yetki Uzman", perms: { reflexology: true } });
    const expertTok = `zz-m360r-expert-${randomUUID()}`;
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [E0.id, expertTok]);
    const negs: [string, Auth][] = [
      ["kimliksiz", {}], ["tokensız", { adminId: OWNER }], ["uzman token", { adminId: E0.id, token: expertTok }],
      ["uzman token + admin ID spoof", { adminId: OWNER, token: expertTok }], ["geçersiz token", { adminId: OWNER, token: "zz-bogus" }],
      ["pasif admin", { adminId: INACTIVE_ADMIN, token: TOK.inactive }],
    ];
    let negOk = 0, negTotal = 0;
    for (const [name, auth] of negs) {
      for (const r of [
        await list("activity=d7", auth), await ov(auth), await phases(E0.id, "GET", undefined, auth),
        await phases(E0.id, "POST", { draft: { startsOn: "2027-01-01", amount: 1, billingPeriod: "monthly" } }, auth),
        await phases(E0.id, "DELETE", { phaseId: randomUUID() }, auth),
      ]) {
        negTotal++;
        if (r.status === 401 || r.status === 403) negOk++;
        else console.error(`     ${name} → ${r.status}`);
      }
    }
    ok(negOk === negTotal, `yetkisiz 6 kimlik × 5 uç → 401/403 (${negOk}/${negTotal})`);
    const phasesAfterNeg = (await su.query(`select count(*)::int n from public.member_pricing_phases`)).rows[0].n;
    ok(phasesAfterNeg === 0, "yetkisiz denemeler DB'ye hiçbir dönem yazmadı");

    // ── B) Liste: yeni filtreler + doğrulama ────────────────────────────────────
    console.log("\n[B] Liste route");
    for (const bad of ["activity=x", "due=d1_2", "sort=hack", "module=digital_content", "module=video_ceviri", "security=1", "module=%27%3Bdrop"]) {
      const r = await list(bad);
      ok(r.status === 400, `geçersiz "${bad}" → 400 (${r.status})`);
    }
    const anchor = await mkExpert({ name: "ZZ_M360R Capa" });
    await usage(anchor, addDays(TODAY, -40));
    const A1 = await mkExpert({ name: "ZZ_M360R Aktif Bugun", perms: { reflexology: true }, payment: "pending", npd: addDays(TODAY, 3) });
    await usage(A1, TODAY);
    const A2 = await mkExpert({ name: "ZZ_M360R Pasif 35", perms: { refleksoloji: true }, payment: "pending", npd: addDays(TODAY, -12) });
    await usage(A2, addDays(TODAY, -35));
    await mkExpert({ name: "ZZ_M360R Demo", demo: true });
    const r7 = await list("activity=d7&q=ZZ_M360R");
    ok(r7.status === 200 && (r7.json.users as unknown[]).length === 1, "activity=d7 → yalnız bugün aktif uzman");
    const meas = r7.json.measurement as Record<string, unknown>;
    ok(meas && meas.start === addDays(TODAY, -40) && Number(meas.measured_days) === 41, `measurement döner (${JSON.stringify(meas)})`);
    const r30 = await list("activity=idle30&q=ZZ_M360R");
    const r30ids = (r30.json.users as Record<string, unknown>[]).map((u) => u.id);
    ok(r30ids.includes(A2.id) && !r30ids.includes(A1.id), "activity=idle30 → 35 gündür kullanılmayan");
    const rMod = await list("module=reflexology&q=ZZ_M360R");
    ok((rMod.json.users as unknown[]).length === 3, "module=reflexology → canonical (E0, A1) + TR alias (A2) = 3");
    const rDue = await list("due=d0_7&q=ZZ_M360R");
    ok((rDue.json.users as Record<string, unknown>[]).map((u) => u.id).join() === A1.id, "due=d0_7 → 3 gün sonra ödeme");
    const rSort = await list("sort=activity_desc&q=ZZ_M360R&role=expert");
    ok((rSort.json.users as Record<string, unknown>[])[0].id === A1.id, "sort=activity_desc → en yeni önce");
    const legacyQs = await list("due=due30&sort=next_payment_asc");
    ok(legacyQs.status === 200, "eski M4 sorguları (due30 / next_payment_asc) çalışmaya devam eder");
    // Satır → istemci eşleme + dikkat nedeni (skor yok)
    const rowA2 = (await list(`q=${encodeURIComponent("Pasif 35")}`)).json.users as Record<string, unknown>[];
    const act = parseMemberActivity(rowA2[0]);
    const mu = mapDbUser(rowA2[0]);
    const reasons = attentionReasons({ role: mu.role, approvalStatus: mu.approvalStatus, active: mu.active, paymentStatus: mu.payment.status,
      nextPaymentDate: String(rowA2[0].next_payment_date ?? ""), activity: act, securityAlerts: 0, todayIso: TODAY });
    ok(reasons.map((x) => x.text).join(" | ") === "Ödeme 12 gün gecikmiş | 35 gündür kullanılmıyor", `dikkat nedenleri açık metin: ${reasons.map((x) => x.text).join(" | ")}`);
    const leak = JSON.stringify(r7.json);
    ok(!/password_hash|session_token/.test(leak), "liste yanıtında parola özeti / token yok");

    // ── C) Overview ─────────────────────────────────────────────────────────────
    console.log("\n[C] Yönetim özeti");
    const o = await ov();
    const ovv = o.json.overview as Record<string, unknown>;
    ok(o.status === 200 && o.headers.get("cache-control")?.includes("no-store") === true, "overview 200 + no-store");
    ok(Number(ovv.denominator) === 4 && ovv.idle60 === null && ovv.idle90 === null && typeof ovv.idle30 === "number",
      `41 günlük ölçüm: payda 4 (demo hariç), 30+ sayı, 60+/90+ NULL (${ovv.denominator}/${ovv.idle30}/${ovv.idle60})`);
    ok(Number(ovv.payment_overdue) === 1 && Number(ovv.payment_due7) === 1, "ödeme gecikmiş 1, 7 gün içinde 1 (ham RPC sözleşmesi)");
    const { parseMemberOverview } = await import("../../lib/admin/member360");
    const parsedOv = parseMemberOverview(ovv);
    ok(parsedOv.paymentOverdue === 1 && parsedOv.paymentDue7 === 1 && parsedOv.denominator === 4,
      "istemci ayrıştırması (parseMemberOverview) route yanıtıyla tutarlı — çift dönüşüm yok");
    ok(o.json && !/email|full_name|ZZ_M360R/.test(JSON.stringify(o.json)), "overview yalnız sayı (PII yok)");
    const ovAdmin2 = await ov(asAdmin2);
    ok(ovAdmin2.status === 200, "normal admin de özeti görür (salt-okur)");

    // ── D) Fiyat dönemleri ─────────────────────────────────────────────────────
    console.log("\n[D] Fiyat dönemleri route");
    const E = await mkExpert({ name: "ZZ_M360R Fiyat" });
    const g0 = await phases(E.id, "GET");
    ok(g0.status === 200 && Array.isArray(g0.json.phases) && (g0.json.phases as unknown[]).length === 0, "boş liste");
    const c1 = await phases(E.id, "POST", { draft: { startsOn: "2026-10-01", endsOn: "2027-02-28", amount: "200", billingPeriod: "monthly", label: "İlk 5 ay", termsNote: "Tanışma" } }, asAdmin2);
    ok(c1.status === 201 && (c1.json.phase as Record<string, unknown>).amount === 200, `normal admin dönem ekler (201) ${c1.status}`);
    const c2 = await phases(E.id, "POST", { draft: { startsOn: "2027-03-01", endsOn: null, amount: 600, billingPeriod: "monthly" } });
    ok(c2.status === 201 && (c2.json.phases as unknown[]).length === 2, "açık uçlu sonraki dönem");
    const cOv = await phases(E.id, "POST", { draft: { startsOn: "2027-02-01", amount: 1, billingPeriod: "monthly" } });
    ok(cOv.status === 409 && /çakışıyor/.test(String(cOv.json.error)), `çakışma → 409 açık mesaj (${cOv.status})`);
    const cYear = await phases(E.id, "POST", { draft: { startsOn: "2025-10-01", endsOn: "2026-09-30", amount: "5000", billingPeriod: "yearly", label: "Yıllık peşin — 12 ay kullanım / 10 aylık ücret" } });
    ok(cYear.status === 201, "yıllık peşin etiketli dönem");
    for (const [label, body] of [
      ["bilinmeyen alan", { draft: { startsOn: "2030-01-01", amount: 1, billingPeriod: "monthly", hack: 1 } }],
      ["bilinmeyen üst alan", { draft: { startsOn: "2030-01-01", amount: 1, billingPeriod: "monthly" }, userId: OWNER }],
      ["geçersiz tarih", { draft: { startsOn: "2030-02-30", amount: 1, billingPeriod: "monthly" } }],
      ["negatif tutar", { draft: { startsOn: "2030-01-01", amount: -5, billingPeriod: "monthly" } }],
      ["bilinmeyen dönem", { draft: { startsOn: "2030-01-01", amount: 1, billingPeriod: "weekly" } }],
      ["bitiş < başlangıç", { draft: { startsOn: "2030-02-01", endsOn: "2030-01-01", amount: 1, billingPeriod: "monthly" } }],
      ["uzun not", { draft: { startsOn: "2030-01-01", amount: 1, billingPeriod: "monthly", termsNote: "x".repeat(501) } }],
      ["kontrol karakteri", { draft: { startsOn: "2030-01-01", amount: 1, billingPeriod: "monthly", label: "a\u0007b" } }],
    ] as [string, unknown][]) {
      const r = await phases(E.id, "POST", body);
      ok(r.status === 400, `${label} → 400 (${r.status})`);
    }
    const adminTarget = await phases(ADMIN2, "POST", { draft: { startsOn: "2030-01-01", amount: 1, billingPeriod: "monthly" } });
    ok(adminTarget.status === 409, `yönetici hedefi → 409 (${adminTarget.status})`);
    const missingUser = await phases(randomUUID(), "POST", { draft: { startsOn: "2030-01-01", amount: 1, billingPeriod: "monthly" } });
    ok(missingUser.status === 400, `olmayan kullanıcı → 400 (${missingUser.status})`);
    const badId = await call(pricingRoute.GET, "GET", "/api/admin/users/x/pricing-phases", asOwner, undefined, "not-a-uuid");
    ok(badId.status === 400, "geçersiz kullanıcı ID → 400");
    const p1 = c1.json.phase as Record<string, unknown>;
    const stale = await phases(E.id, "PATCH", { phaseId: p1.id, expectedUpdatedAt: "2020-01-01T00:00:00.000Z", draft: { startsOn: "2026-10-01", endsOn: "2027-02-28", amount: 250, billingPeriod: "monthly" } });
    ok(stale.status === 409 && /yenileyip/.test(String(stale.json.error)), `bayat güncelleme → 409 (${stale.status})`);
    const upd = await phases(E.id, "PATCH", { phaseId: p1.id, expectedUpdatedAt: p1.updatedAt, draft: { startsOn: "2026-10-01", endsOn: "2027-02-28", amount: 250, billingPeriod: "monthly", label: "İlk 5 ay", termsNote: "Tanışma" } });
    ok(upd.status === 200 && upd.json.changed === true, "güncelleme 200");
    const noop = await phases(E.id, "PATCH", { phaseId: p1.id, draft: { startsOn: "2026-10-01", endsOn: "2027-02-28", amount: 250, billingPeriod: "monthly", label: "İlk 5 ay", termsNote: "Tanışma" } });
    ok(noop.status === 200 && noop.json.changed === false, "no-op güncelleme changed:false");
    const del = await phases(E.id, "DELETE", { phaseId: (cYear.json.phase as Record<string, unknown>).id });
    ok(del.status === 200 && (del.json.phases as unknown[]).length === 2, "silme 200");
    const delOther = await phases(A1.id, "DELETE", { phaseId: p1.id });
    ok(delOther.status === 400 && (await su.query(`select 1 from public.member_pricing_phases where id=$1`, [p1.id])).rowCount === 1,
      "başka uzmanın URL'siyle dönem silinemez (IDOR yok)");

    // Audit route: hassas değer yok
    const aud = await call(auditRoute.GET, "GET", `/api/admin/users/${E.id}/audit`, asOwner, undefined, E.id);
    const audRows = aud.json.rows as Record<string, unknown>[];
    const pr = audRows.filter((r) => r.action === "pricing_phase_changed");
    ok(pr.length === 5, `audit: 3 ekleme + 1 güncelleme + 1 silme = 5 (no-op/reddedilen yazım audit üretmez) → ${pr.length}`);
    // Yapısal sözleşme (UUID/zaman damgası içindeki rastlantısal rakamlar sızıntı SAYILMAZ):
    // context anahtarları yalnız {op, phase_id, fields}; fields yalnız izinli alan ADLARI; değer objesi yok.
    const PRICING_FIELDS = new Set(["starts_on", "ends_on", "amount", "billing_period", "label", "terms_note"]);
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const SECRET_VALUES = new Set(["200", "250", "600", "5000", "İlk 5 ay", "Tanışma", "Yıllık peşin — 12 ay kullanım / 10 aylık ücret"]);
    const ctxSafe = (r: Record<string, unknown>) => {
      const c = r.context as Record<string, unknown> | null;
      if (!c || typeof c !== "object" || Array.isArray(c)) return false;
      const keys = Object.keys(c).sort().join(",");
      if (keys !== "fields,op,phase_id") return false;
      if (!["created", "updated", "deleted"].includes(String(c.op))) return false;
      if (typeof c.phase_id !== "string" || !UUID_RE.test(c.phase_id)) return false;
      if (!Array.isArray(c.fields) || !c.fields.every((f) => typeof f === "string" && PRICING_FIELDS.has(f))) return false;
      // Hiçbir context değeri gerçek ticari değere eşit olmamalı (tam eşleşme; alt dize DEĞİL).
      const leaves = [c.op, c.phase_id, ...(c.fields as unknown[])].map(String);
      return leaves.every((v) => !SECRET_VALUES.has(v)) && r.oldValue == null && r.newValue == null;
    };
    const ctxOk = pr.every(ctxSafe);
    const valueObjectsAbsent = pr.every((r) => r.oldValue == null && r.newValue == null);
    // Negatif öz-kontrol: denetim gerçek sızıntıyı yakalamalı, UUID'deki rakamları yakalamamalı.
    const pid = "00000000-0000-4000-8000-000000200600";
    ok(ctxSafe({ context: { op: "updated", phase_id: pid, fields: ["amount"] }, oldValue: null, newValue: null }),
      "öz-kontrol: UUID içindeki '200'/'600' yanlış pozitif ÜRETMEZ");
    ok(![
      { context: { op: "updated", phase_id: pid, fields: ["amount"], amount: 600 }, oldValue: null, newValue: null },
      { context: { op: "created", phase_id: pid, fields: ["label"], label: "İlk 5 ay" }, oldValue: null, newValue: null },
      { context: { op: "updated", phase_id: pid, fields: ["Tanışma"] }, oldValue: null, newValue: null },
      { context: { op: "updated", phase_id: pid, fields: ["amount"] }, oldValue: { amount: 200 }, newValue: null },
    ].some(ctxSafe), "öz-kontrol: tutar / etiket / not değeri veya eski-yeni değer objesi YAKALANIR");
    ok(ctxOk && valueObjectsAbsent, "audit context yapısal: yalnız {op, phase_id, fields}; tutar/etiket/not değeri ve eski/yeni değer objesi yok");
    ok(pr.some((r) => r.actorName === "ZZ_M360_ADMIN2"), "audit aktör adı çözülür");

    // ── E) Ödeme route regresyonu (M4 davranışı aynen) ──────────────────────────
    console.log("\n[E] Ödeme route regresyonu");
    const pay = await call(paymentRoute.POST, "POST", `/api/admin/users/${E.id}/payment`, asOwner,
      { draft: { status: "paid", lastPaymentDate: TODAY, nextPaymentDate: addDays(TODAY, 30), paidAmount: "250", note: "Havale", agreedFee: "250", billingPeriod: "monthly" } }, E.id);
    ok(pay.status === 200 && pay.json.changed === true, "ödeme kaydı 200");
    const hist = await su.query(`select paid_amount, agreed_fee, billing_period, actor_admin_id from public.user_payment_history where user_id=$1`, [E.id]);
    ok(hist.rowCount === 1 && Number(hist.rows[0].paid_amount) === 250 && hist.rows[0].actor_admin_id === OWNER, "ödeme geçmişi satırı + aktör");
    const payAgain = await call(paymentRoute.POST, "POST", `/api/admin/users/${E.id}/payment`, asOwner,
      { draft: { status: "paid", lastPaymentDate: TODAY, nextPaymentDate: addDays(TODAY, 30), paidAmount: "250", note: "Havale", agreedFee: "250", billingPeriod: "monthly" } }, E.id);
    ok(payAgain.json.changed === false, "değişmeyen ödeme → changed:false (no-op)");
    const payAudit = await su.query(`select context from public.admin_audit_log where action='payment_status_changed' and target_user_id=$1`, [E.id]);
    ok(payAudit.rowCount === 1 && !/250|Havale/.test(JSON.stringify(payAudit.rows[0].context)), "ödeme audit'i yalnız alan adları");
    const payPhases = await phases(E.id, "GET");
    ok((payPhases.json.phases as unknown[]).length === 2, "ödeme kaydı fiyat dönemlerine dokunmaz");
  } finally {
    await shim?.close().catch(() => undefined);
    await db.stop();
  }

  console.log(`\nÜYE YÖNETİMİ 360 · ROUTE: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.error("Başarısız:\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("BEKLENMEYEN:", e);
  process.exit(1);
});
