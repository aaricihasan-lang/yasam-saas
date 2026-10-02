/**
 * DANIŞAN YOLCULUĞU — SATIŞ ÖNCESİ KAPANIŞ: ROUTE + DB REGRESYON HARNESS
 * (gerçek Next route handler'ları + gerçek migration'lı yerel PostgreSQL; PRODUCTION'A SIFIR TEMAS).
 *
 * Kapsam: DY-01 uzun notlar (RPC + geri düşüş), DY-02 Genel randevu (düzeltme öncesi/sonrası),
 * VALIDATION-DATE / VALIDATION-SERVER, COMPLETED-APPOINTMENT, hub sayaçları, auth/tenant regresyonu.
 * Çalıştır: npx tsx scripts/dy-presale-closeout/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { SERVICE_KEY, ANON_KEY } from "../anamnez/testEnv";
import { startDyEnv, readMig, MIG_GENERAL_APPT, MIG_NOTES_RPC } from "./env";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

type Auth = { id?: string; token?: string };
type Json = Record<string, unknown>;
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const sha = (s: string | null) => createHash("sha256").update(s ?? "", "utf8").digest("hex");

function istanbulDay(offsetDays = 0): string {
  const d = new Date(Date.now() + 3 * 3600_000 + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const { env, seed } = await startDyEnv({ port: 54393, dirName: "dy-closeout-routes-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  console.log(`embedded-postgres + PostgREST shim hazır (${env.url}).`);
  await env.su.query(`update public.users set module_permissions = '{"clients":true,"appointments":true}'::jsonb where id = any($1::uuid[])`, [[seed.users.A.id, seed.users.B.id]]);

  try {
    const clientsRoute = await import("../../app/api/clients/route");
    const clientRoute = await import("../../app/api/clients/[id]/route");
    const notesRoute = await import("../../app/api/clients/[id]/notes/route");
    const apptRoute = await import("../../app/api/appointments/route");
    const apptOneRoute = await import("../../app/api/appointments/[id]/route");
    const clientApptRoute = await import("../../app/api/clients/[id]/appointments/route");
    const statsRoute = await import("../../app/api/clients/stats/route");
    const { validateClientWrite } = await import("../../lib/danisan/clientValidation");
    const { isValidIsoDate, trDateToIso, isValidBirthDate } = await import("../../lib/danisan/dateValidation");

    const U = seed.users;
    const asA: Auth = { id: U.A.id, token: U.A.token };
    const asB: Auth = { id: U.B.id, token: U.B.token };
    const A1 = seed.clients.a1;

    async function call(handler: unknown, method: string, params: Record<string, string>, auth: Auth, body?: unknown, query = "") {
      const headers: Record<string, string> = {};
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      if (body !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest(`http://localhost/api/test${query}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
      const res = await (handler as Handler)(req, { params: Promise.resolve(params) });
      let json: Json = {};
      try { json = (await res.clone().json()) as Json; } catch { json = {}; }
      return { status: res.status, json };
    }
    const q1 = async (sql: string, args: unknown[] = []) => (await env.su.query(sql, args)).rows[0];

    // ── 1. VALIDATION-DATE (saf) ────────────────────────────────────────────
    section("1. Gerçek takvim tarihi (saf)");
    const cases: Array<[string, boolean]> = [["29.02.2024", true], ["29.02.2023", false], ["31.02.2000", false], ["31.04.2000", false], ["31.12.2000", true], ["29.02.1900", false], ["29.02.2000", true], ["00.01.2000", false], ["01.13.2000", false], ["99.99.9999", false], ["01.01.1899", false]];
    for (const [tr, exp] of cases) ok((trDateToIso(tr) !== null) === exp, `${tr} → ${exp ? "geçerli" : "geçersiz"}`);
    ok(!isValidIsoDate("9999-99-99") && !isValidIsoDate("2000-2-1") && !isValidIsoDate(" ") && !isValidIsoDate(20000101), "bozuk ISO biçimleri reddedilir");
    ok(isValidBirthDate(istanbulDay(0), istanbulDay(0)) && !isValidBirthDate(istanbulDay(1), istanbulDay(0)), "doğum: bugün geçerli, yarın geçersiz");

    // ── 2. VALIDATION-SERVER (POST/PATCH) ───────────────────────────────────
    section("2. Sunucu doğrulaması — POST /api/clients");
    const base = { ad: "ZZ Kapanış", soyad: "TEST" };
    const post = (b: Json) => call(clientsRoute.POST, "POST", {}, asA, b);
    for (const [tr, exp] of cases.slice(0, 5)) {
      const iso = `${tr.slice(6)}-${tr.slice(3, 5)}-${tr.slice(0, 2)}`;
      const r = await post({ ...base, dogum: iso });
      ok(exp ? r.status === 200 : r.status === 400 && r.json.field === "dogum", `POST dogum ${tr} → ${exp ? 200 : "400 (dogum)"}`, r.json);
    }
    const r9 = await post({ ...base, dogum: "9999-99-99" });
    ok(r9.status === 400 && r9.json.code === "INVALID_DATE", "POST dogum 9999-99-99 → 400", r9.json);
    ok((await post({ ...base, dogum: istanbulDay(1) })).status === 400, "POST gelecek doğum → 400");
    ok((await post({ ...base, gorusme: "2000-02-31" })).status === 400, "POST görüşme 31.02 → 400");
    ok((await post({ ad: "  ", soyad: "X" })).json.code === "NAME_REQUIRED", "POST boş ad → 400 NAME_REQUIRED");
    ok((await post({ ad: "X" })).json.code === "NAME_REQUIRED", "POST soyad yok → 400");
    ok((await post({ ...base, kan: "Z Rh+" })).json.field === "kan", "POST geçersiz kan → 400");
    ok((await post({ ...base, mizac: "Safra" })).json.field === "mizac", "POST geçersiz mizaç → 400");
    ok((await post({ ...base, ad: "x".repeat(121) })).json.code === "NAME_TOO_LONG", "POST 121 karakter ad → 400");
    const evil = await post({ ...base, ad: "ZZ Manipüle 🌿 'Ö' \"Ç\" & /", dogum: "1990-05-05", burc: "Koç", tenant_id: seed.TB, id: "00000000-0000-4000-8000-0000000000aa", user_id: U.B.id, hacked_col: 1, name: "legacy", saglik: "x" });
    const evilRow = evil.json.client as Json | undefined;
    ok(evil.status === 200 && evilRow?.tenant_id === seed.TA && evilRow?.id !== "00000000-0000-4000-8000-0000000000aa", "POST: tenant_id/id enjeksiyonu yok sayıldı (200)", evil.json);
    ok(evilRow?.user_id == null && evilRow?.name == null && evilRow?.saglik == null && evilRow?.burc === "Boğa", "POST: user_id/legacy/bilinmeyen kolonlar yazılmadı; burç sunucuda (Boğa)", evilRow);
    ok(evilRow?.ad === "ZZ Manipüle 🌿 'Ö' \"Ç\" & /", "POST: Türkçe/emoji/özel karakter birebir");
    const ok2402 = await post({ ...base, dogum: "2024-02-29", gorusme: istanbulDay(0), kan: "0 Rh+", mizac: "dem", telefon: "0555 000 00 00" });
    ok(ok2402.status === 200 && (ok2402.json.client as Json).burc === "Balık", "POST 29.02.2024 + tüm alanlar → 200, burç Balık", ok2402.json);

    section("3. Sunucu doğrulaması — PATCH /api/clients/[id]");
    const C = (ok2402.json.client as Json).id as string;
    const patch = (b: Json, who: Auth = asA, id = C) => call(clientRoute.PATCH, "PATCH", { id }, who, b);
    ok((await patch({ ad: null })).json.code === "NAME_REQUIRED", "PATCH ad null → 400");
    ok((await patch({ soyad: "" })).json.code === "NAME_REQUIRED", "PATCH soyad boş → 400");
    ok((await patch({ dogum: "2000-02-31" })).json.field === "dogum", "PATCH dogum 31.02 → 400");
    ok((await patch({ dogum: "9999-99-99" })).status === 400, "PATCH dogum 9999-99-99 → 400");
    ok((await patch({ gorusme: "2026-13-01" })).status === 400, "PATCH görüşme ay 13 → 400");
    ok((await patch({ hacked_col: 1, tenant_id: seed.TB })).json.code === "NO_FIELDS", "PATCH yalnız bilinmeyen/korumalı alan → 400 NO_FIELDS");
    const before = await q1(`select * from public.clients where id=$1`, [C]);
    ok(before.dogum === "2024-02-29" && before.tenant_id === seed.TA, "geçersiz PATCH'ler DB'yi değiştirmedi");
    const goodP = await patch({ dogum: "2000-12-31", telefon: "", kan: null });
    ok(goodP.status === 200 && (goodP.json.client as Json).burc === "Oğlak" && (goodP.json.client as Json).telefon === null, "PATCH geçerli → 200, burç yeniden (Oğlak), boş telefon → null", goodP.json);
    ok((await patch({ ad: "Hacked" }, asB)).status === 404, "B → A danışanı PATCH → 404 (tenant)");
    ok((await q1(`select ad from public.clients where id=$1`, [C])).ad === "ZZ Kapanış", "B'nin PATCH denemesi veri değiştirmedi");
    ok((await patch({ ad: "x" }, {})).status === 401, "kimliksiz PATCH → 401");
    ok((await patch({ ad: "x" }, { id: U.A.id, token: "zz-bogus-token" })).status === 401, "sahte token → 401");
    ok((await patch({ ad: "x" }, { id: U.B.id, token: U.A.token })).status === 403, "token/kullanıcı uyuşmazlığı → 403");
    ok(validateClientWrite({ ad: "A", soyad: "B", dogum: "" }, "create", "2026-10-02").ok, "boş doğum → temizle (null) kabul");

    // ── 4. DY-01 UZUN NOTLAR ────────────────────────────────────────────────
    const long = (n: number) => JSON.stringify([{ id: "z", content: "Şğüıöç İI 🌿 uzun not ".repeat(Math.ceil(n / 18)).slice(0, n), createdAt: "2026-10-02T09:00:00.000Z" }]);
    async function notesRound(label: string) {
      for (const size of [100, 8500, 20000, 120000]) {
        const g = await call(notesRoute.GET, "GET", { id: A1 }, asA);
        const cur = ((g.json.note as Json | null)?.notlar as string | null) ?? null;
        const r = await call(notesRoute.PATCH, "PATCH", { id: A1 }, asA, { notlar: long(size), base_version: sha(cur) });
        ok(r.status === 200, `${label}: ${size} karakter not yaz → 200`, { s: r.status, j: r.json });
        const r2 = await call(notesRoute.PATCH, "PATCH", { id: A1 }, asA, { notlar: long(size + 7), base_version: sha(long(size)) });
        ok(r2.status === 200, `${label}: ${size} karakter düzenle → 200`, r2.json);
      }
      const stale = sha(long(100));
      const conf = await call(notesRoute.PATCH, "PATCH", { id: A1 }, asA, { notlar: "[]", base_version: stale });
      ok(conf.status === 409 && conf.json.code === "NOTES_CONFLICT", `${label}: iki sekme (eski sürüm) → 409`, conf.json);
      const cur = (await q1(`select notlar from public.client_notes where client_id=$1`, [A1])).notlar as string;
      ok(cur === long(120007), `${label}: 409 sonrası veri korunur (120K)`);
      const clr = await call(notesRoute.PATCH, "PATCH", { id: A1 }, asA, { notlar: "", base_version: sha(cur) });
      ok(clr.status === 200 && (await q1(`select notlar from public.client_notes where client_id=$1`, [A1])).notlar === "", `${label}: 120K notu temizle → 200`);
      const keep = await q1(`select saglik_notu, adres from public.client_notes where client_id=$1`, [A1]);
      ok(keep.saglik_notu === "ZZ sağlık notu: referans metin" && keep.adres === "ZZ adres", `${label}: diğer not alanları korunur`);
    }
    section("4a. DY-01 — RPC migration'ı UYGULANMADAN (geri düşüş)");
    ok((await q1(`select count(*)::int n from pg_proc where proname='client_notes_cas_update'`)).n === 0, "RPC henüz yok");
    await notesRound("geri düşüş");
    section("4b. DY-01 — RPC migration'ı uygulandıktan sonra (atomik)");
    await env.su.query(readMig(MIG_NOTES_RPC));
    await env.su.query(readMig(MIG_NOTES_RPC)); // idempotent
    const acl = await q1(`select has_function_privilege('anon','public.client_notes_cas_update(uuid,uuid,uuid,text,jsonb)','EXECUTE') a,
                                 has_function_privilege('authenticated','public.client_notes_cas_update(uuid,uuid,uuid,text,jsonb)','EXECUTE') u,
                                 has_function_privilege('service_role','public.client_notes_cas_update(uuid,uuid,uuid,text,jsonb)','EXECUTE') s`);
    ok(acl.a === false && acl.u === false && acl.s === true, "RPC ACL: anon/authenticated yok, service_role var", acl);
    ok(sha("Şğ🌿") === (await q1(`select encode(sha256(convert_to($1,'UTF8')),'hex') h`, ["Şğ🌿"])).h, "SQL sha256 = uygulama notesVersion (UTF-8)");
    await notesRound("RPC");
    const fakeNote = await call(notesRoute.PATCH, "PATCH", { id: A1 }, asB, { notlar: "[]" });
    ok(fakeNote.status === 403, "B → A notları → 403");
    const outboxNotes = await q1(`select count(*)::int n from public.yasam_hafizasi_client_outbox where source_table='client_notes' and client_id=$1`, [A1]);
    ok(outboxNotes.n >= 1, "notlar CDC trigger'ı RPC yazımında da çalışıyor (outbox)");

    // ── 5. DY-02 GENEL RANDEVU ──────────────────────────────────────────────
    section("5a. DY-02 — düzeltme ÖNCESİ (kök neden yeniden üretimi)");
    const genelBody = { client_id: null, title: "ZZ Genel Toplantı", notes: null, appointment_date: "2026-10-22T08:00:00.000Z", status: "bekliyor" };
    const pre = await call(apptRoute.POST, "POST", {}, asA, genelBody);
    ok(pre.status === 500, "düzeltme öncesi Genel randevu → 500 (canlıdaki hata yeniden üretildi)", pre.json);
    let rawErr = "";
    try { await env.su.query(`insert into public.appointments(tenant_id, client_id, title, appointment_date, status) values ($1, null, 'x', now(), 'bekliyor')`, [seed.TA]); }
    catch (e) { rawErr = String((e as Error).message); }
    ok(/client_id null/.test(rawErr), "kök neden: yh_client_outbox_enqueue RAISE 'client_id null'", rawErr);

    section("5b. DY-02 — migration uygulandı");
    const oldDef = (await q1(`select pg_get_functiondef('public.yh_client_outbox_enqueue()'::regprocedure) d`)).d as string;
    await env.su.query(readMig(MIG_GENERAL_APPT));
    await env.su.query(readMig(MIG_GENERAL_APPT)); // idempotent
    const newDef = (await q1(`select pg_get_functiondef('public.yh_client_outbox_enqueue()'::regprocedure) d`)).d as string;
    ok(newDef.includes("P1-1") && oldDef !== newDef, "enqueue fonksiyonu güncellendi");
    const fnMeta = await q1(`select prosecdef, proconfig::text cfg, has_function_privilege('anon','public.yh_client_outbox_enqueue()','EXECUTE') anon from pg_proc where proname='yh_client_outbox_enqueue'`);
    ok(fnMeta.prosecdef === true && /search_path=public, pg_catalog/.test(fnMeta.cfg) && fnMeta.anon === false, "SECURITY DEFINER + search_path + ACL korundu", fnMeta);
    const trg = await q1(`select count(*)::int n from pg_trigger where not tgisinternal and tgname like 'yh_client_outbox_%_trg'`);
    ok(trg.n === 6, "6 CDC trigger bağlı");
    const outBefore = (await q1(`select count(*)::int n from public.yasam_hafizasi_client_outbox`)).n;
    const g1 = await call(apptRoute.POST, "POST", {}, asA, genelBody);
    ok(g1.status === 200 && (g1.json.appointment as Json)?.client_id === null, "Genel randevu oluştur → 200, client_id NULL", g1.json);
    const G = (g1.json.appointment as Json).id as string;
    ok((await q1(`select count(*)::int n from public.yasam_hafizasi_client_outbox`)).n === outBefore, "Genel randevu Yaşam Hafızası outbox'a YAZILMADI (danışansız)");
    const gp = (b: Json) => call(apptOneRoute.PATCH, "PATCH", { id: G }, asA, b);
    ok((await gp({ title: "ZZ Genel düzenlendi", appointment_date: "2026-10-23T09:30:00.000Z" })).status === 200, "Genel randevu tarih/saat düzenle → 200");
    const past = await call(apptRoute.POST, "POST", {}, asA, { ...genelBody, title: "ZZ Genel geçmiş", appointment_date: "2026-01-05T08:00:00.000Z" });
    const GP = (past.json.appointment as Json).id as string;
    ok((await call(apptOneRoute.PATCH, "PATCH", { id: GP }, asA, { status: "tamamlandi" })).status === 200, "geçmiş Genel randevu tamamlandı → 200");
    ok((await gp({ status: "iptal" })).status === 200, "Genel randevu iptal → 200");
    ok((await call(apptOneRoute.PATCH, "PATCH", { id: G }, asB, { title: "hack" })).status === 404, "B → A Genel randevusu PATCH → 404");
    const list = await call(apptRoute.GET, "GET", {}, asA);
    ok(((list.json.appointments as Json[]) ?? []).some((a) => a.id === G && a.status === "iptal"), "ajanda listesinde Genel randevu (refresh) görünüyor");
    ok(((await call(apptRoute.GET, "GET", {}, asB)).json.appointments as Json[]).every((a) => a.id !== G), "B'nin ajandasında A'nın Genel randevusu YOK");
    ok((await call(apptOneRoute.DELETE, "DELETE", { id: G }, asA)).status === 200, "Genel randevu sil → 200");
    ok((await q1(`select count(*)::int n from public.appointments where id=$1`, [G])).n === 0, "Genel randevu DB'den silindi");
    // Danışan randevusu CDC'si bozulmadı.
    const ca = await call(clientApptRoute.POST, "POST", { id: A1 }, asA, { title: "ZZ danışan randevusu", appointment_date: "2026-10-25T07:00:00.000Z" });
    ok(ca.status === 200, "danışan randevusu oluştur → 200", ca.json);
    ok((await q1(`select count(*)::int n from public.yasam_hafizasi_client_outbox where source_table='appointments' and client_id=$1`, [A1])).n === 1, "danışan randevusu outbox'a yazıldı (CDC korunur)");
    let otherRaise = "";
    try { await env.su.query(`insert into public.client_sessions(tenant_id, client_id) values ($1, null)`, [seed.TA]); } catch (e) { otherRaise = String((e as Error).message); }
    ok(/client_id null/.test(otherRaise), "diğer CDC tablolarında client_id NULL hâlâ reddediliyor (fail-closed)");

    // ── 6. HUB SAYAÇLARI ────────────────────────────────────────────────────
    section("6. Hub sayaçları — Genel randevu danışan randevusu sayılmaz");
    await env.su.query(`delete from public.appointments where tenant_id=$1`, [seed.TA]);
    const now = Date.now();
    const inMonth = (h: number) => new Date(now + h * 3600_000).toISOString();
    await env.su.query(`insert into public.appointments(tenant_id, client_id, title, appointment_date, status) values
      ($1,$2,'c-future',$3,'bekliyor'), ($1,null,'g-future',$4,'bekliyor'), ($1,null,'g-done',$5,'tamamlandi'), ($1,$2,'c-done',$5,'tamamlandi')`,
      [seed.TA, A1, inMonth(48), inMonth(2), inMonth(-1)]);
    const st = ((await call(statsRoute.GET, "GET", {}, asA)).json.stats ?? {}) as Json;
    const monthMatches = new Date(inMonth(48)).getUTCMonth() === new Date(now).getUTCMonth() && new Date(inMonth(-1)).getUTCMonth() === new Date(now).getUTCMonth();
    ok(st.nextApptDate !== null && new Date(String(st.nextApptDate)).getTime() === new Date(inMonth(48)).getTime(), "En Yakın Randevu = danışan randevusu (daha yakın Genel randevu sayılmadı)", st);
    if (monthMatches) {
      ok(st.thisMonthAppts === 2 && st.thisMonthCompleted === 1, "Bu Ay Randevu=2 / Tamamlanan=1 (Genel hariç)", st);
    } else {
      console.log("  · ay sınırına çok yakın — Bu Ay sayımı atlandı (zaman bağımlı)");
    }
    const stJson = JSON.stringify(await call(statsRoute.GET, "GET", {}, asA));
    ok(!/ZZ|Ayşe|telefon|notlar|title/i.test(stJson), "hub istatistik yanıtında kişisel veri yok");

    // ── 7. COMPLETED-APPOINTMENT ────────────────────────────────────────────
    section("7. Tamamlanmış randevu geleceğe taşınamaz (server)");
    const mk = async (date: string, status: string) =>
      (await q1(`insert into public.appointments(tenant_id, client_id, title, appointment_date, status) values ($1,$2,'ZZ',$3,$4) returning id`, [seed.TA, A1, date, status])).id as string;
    const done = await mk("2026-01-10T07:00:00.000Z", "tamamlandi");
    const mv = await call(apptOneRoute.PATCH, "PATCH", { id: done }, asA, { appointment_date: "2099-01-01T07:00:00.000Z" });
    ok(mv.status === 409 && mv.json.code === "COMPLETED_IN_FUTURE", "tamamlandı + gelecek tarih → 409", mv.json);
    ok(new Date(String((await q1(`select appointment_date from public.appointments where id=$1`, [done])).appointment_date)).getUTCFullYear() === 2026, "409 sonrası tarih değişmedi");
    ok((await call(apptOneRoute.PATCH, "PATCH", { id: done }, asA, { title: "yeni başlık", appointment_date: "2026-01-10T07:00:00.000Z" })).status === 200, "tamamlandı: tarih aynı + başlık düzenle → 200");
    ok((await call(apptOneRoute.PATCH, "PATCH", { id: done }, asA, { appointment_date: "2026-01-11T07:00:00.000Z" })).status === 200, "tamamlandı: geçmişte başka tarihe taşı → 200");
    ok((await call(apptOneRoute.PATCH, "PATCH", { id: done }, asA, { status: "bekliyor", appointment_date: "2099-01-01T07:00:00.000Z" })).status === 200, "durumu bekliyor yapıp geleceğe taşı → 200");
    const legacy = await mk("2099-06-01T07:00:00.000Z", "tamamlandi"); // eski hatalı veri
    ok((await call(apptOneRoute.PATCH, "PATCH", { id: legacy }, asA, { title: "düzelt", appointment_date: "2099-06-01T07:00:00.000Z" })).status === 200, "eski (gelecekte tamamlanmış) kayıt: tarih aynıyken başlık düzenlenebilir");
    const pend = await mk("2026-01-12T07:00:00.000Z", "bekliyor");
    ok((await call(apptOneRoute.PATCH, "PATCH", { id: pend }, asA, { appointment_date: "2099-02-01T07:00:00.000Z" })).status === 200, "bekleyen randevu geleceğe taşınabilir → 200");
    ok((await call(apptOneRoute.PATCH, "PATCH", { id: pend }, asA, { status: "tamamlandi" })).json.code === "APPOINTMENT_IN_FUTURE", "gelecek randevu tamamlanamaz (eski kural korunur)");
    ok((await call(apptOneRoute.PATCH, "PATCH", { id: pend }, asA, { status: "hack" })).status === 400, "geçersiz durum → 400");

    // ── 8. AUTH / TENANT REGRESYONU ─────────────────────────────────────────
    section("8. Auth / tenant regresyonu");
    ok((await call(clientsRoute.POST, "POST", {}, {}, base)).status === 401, "POST /api/clients kimliksiz → 401");
    ok((await call(notesRoute.PATCH, "PATCH", { id: A1 }, {}, { notlar: "[]" })).status === 401, "notlar kimliksiz → 401");
    ok((await call(apptRoute.POST, "POST", {}, { id: U.A.id, token: "zz-sahte" }, genelBody)).status === 401, "randevu sahte token → 401");
    ok((await call(statsRoute.GET, "GET", {}, { id: U.B.id, token: U.A.token })).status === 403, "stats token uyuşmazlığı → 403");
    ok((await call(clientRoute.GET, "GET", { id: A1 }, asB)).status === 404, "B → A danışan detayı → 404");
    ok((await call(apptRoute.POST, "POST", {}, asB, { ...genelBody, client_id: A1 })).status === 403, "B → A danışanına randevu → 403");
    const bDel = await call(apptOneRoute.DELETE, "DELETE", { id: pend }, asB);
    ok(bDel.status === 404 || (bDel.status === 200 && bDel.json.deleted === 0), "B → A randevusunu sil → etkisiz (deleted:0; tenant filtresi)", bDel);
    ok((await q1(`select count(*)::int n from public.appointments where id=$1`, [pend])).n === 1, "B'nin silme denemesi veri silmedi");
    ok((await call(clientsRoute.POST, "POST", {}, { id: U.DEMO.id, token: U.DEMO.token }, base)).json.demo === true, "demo hesap DB'ye yazmaz");
  } finally {
    await env.stop();
  }
  console.log(`\nDY satış öncesi kapanış routes harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log("FAIL:\n - " + failures.join("\n - ")); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
