/**
 * REFLEKSOLOJİ FINAL — Danışan Haritası ROUTE + DB HARNESS
 * (gerçek Next route handler'ları + GERÇEK migration 20271013000000 + yerel embedded-postgres).
 *
 * Production'a SIFIR temas (127.0.0.1). Tüm veriler sentetik (ZZ_ANAMNEZ_* seed + ZZ_RF_*).
 * Çalıştır: npx tsx scripts/refleksoloji-final/marks.routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { SERVICE_KEY, ANON_KEY, seedAnamnez, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";

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
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

type Auth = { id?: string; token?: string };
type Json = Record<string, unknown>;
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const MIGRATION = readFileSync(path.join(process.cwd(), "supabase/migrations/20271013000000_reflexology_client_marks.sql"), "utf8");

async function main(): Promise<void> {
  const env: TestEnv = await startAnamnezTestEnv({ port: 54417, dirName: "rf-marks-routes-pgdata", extraSql: [MIGRATION] });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const seed = await seedAnamnez(env.su);
  const su = env.su;
  // Refleksoloji modül izni: A/A2/B/DEMO açık; NOREFLEX = danışan açık, refleksoloji KAPALI.
  await su.query(`update public.users set module_permissions = '{"clients":true,"reflexology":true}'::jsonb`);
  const noRefId = randomUUID();
  const noRefTok = `zz-rf-tok-noreflex-${noRefId.slice(0, 8)}`;
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id)
     values ($1,'ZZ_RF_NOREFLEX','zz.rf.noreflex@example.test','expert',true,'approved','{"clients":true,"reflexology":false}'::jsonb,'premium','premium',$2)`,
    [noRefId, seed.TA],
  );
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [noRefId, noRefTok]);
  console.log(`embedded-postgres + PostgREST shim hazır (${env.url}).`);

  try {
    const sessionsRoute = await import("../../app/api/refleksoloji/marks/sessions/route");
    const sessionRoute = await import("../../app/api/refleksoloji/marks/sessions/[id]/route");
    const marksRoute = await import("../../app/api/refleksoloji/marks/sessions/[id]/marks/route");
    const itemRoute = await import("../../app/api/refleksoloji/marks/items/[markId]/route");
    const { marksForSurface, MARK_SURFACES, SURFACE_DEFS } = await import("../../lib/refleksoloji/markSurfaces");
    const { collectDeletePreview } = await import("../../lib/danisan/deletePreview");
    const { createClient } = await import("@supabase/supabase-js");

    const U = seed.users;
    const asA: Auth = { id: U.A.id, token: U.A.token };
    const asA2: Auth = { id: U.A2.id, token: U.A2.token };
    const asB: Auth = { id: U.B.id, token: U.B.token };
    const asDemo: Auth = { id: U.DEMO.id, token: U.DEMO.token };
    const asNoRef: Auth = { id: noRefId, token: noRefTok };
    const { a1, a2, b1 } = seed.clients;

    async function call(handler: unknown, method: string, params: Record<string, string>, auth: Auth, body?: unknown, query = "") {
      const headers: Record<string, string> = {};
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      if (body !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest(`http://localhost/api/test${query}`, {
        method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const res = await (handler as Handler)(req, { params: Promise.resolve(params) });
      let json: Json = {};
      try { json = (await res.clone().json()) as Json; } catch { json = {}; }
      return { status: res.status, json };
    }
    const markRow = async (id: string) => (await su.query(`select * from public.reflexology_marks where id=$1`, [id])).rows[0];
    const countMarks = async (where: string, args: unknown[]) =>
      Number((await su.query(`select count(*)::int n from public.reflexology_marks where ${where}`, args)).rows[0].n);

    // ── 1. Kimlik / yetki ─────────────────────────────────────────────────────
    section("1. Kimlik / yetki");
    ok((await call(sessionsRoute.GET, "GET", {}, {}, undefined, `?client_id=${a1}`)).status === 401, "header yok → 401");
    ok((await call(sessionsRoute.GET, "GET", {}, asNoRef, undefined, `?client_id=${a1}`)).status === 403, "refleksoloji modülü kapalı → 403");
    ok((await call(sessionsRoute.GET, "GET", {}, asA, undefined, `?client_id=not-a-uuid`)).status === 400, "geçersiz client_id → 400");
    ok((await call(sessionsRoute.GET, "GET", {}, asA, undefined, `?client_id=${b1}`)).status === 404, "Uzman A → B'nin danışanı (liste) → 404");
    ok((await call(sessionsRoute.POST, "POST", {}, asA, { client_id: b1, session_date: "2026-10-10" })).status === 404, "Uzman A → B'nin danışanına seans → 404");
    ok((await call(sessionsRoute.GET, "GET", {}, asA, undefined, `?client_id=${randomUUID()}`)).status === 404, "var olmayan danışan → 404");

    // ── 2. Seans oluşturma + idempotency ──────────────────────────────────────
    section("2. Seans");
    const badDate = await call(sessionsRoute.POST, "POST", {}, asA, { client_id: a1, session_date: "2026-02-30" });
    ok(badDate.status === 400, "geçersiz tarih (30 Şubat) → 400", badDate.json);
    const uid = `zz-rf-${randomUUID()}`;
    const s1 = await call(sessionsRoute.POST, "POST", {}, asA, {
      client_id: a1, session_date: "2026-10-10", title: "ZZ_RF 1. seans", note: "Bel bölgesi hassas", source_uid: uid,
      tenant_id: seed.TB, created_by_user_id: U.B.id,
    });
    ok(s1.status === 201, "seans oluşturuldu → 201", s1.json);
    const S1 = (s1.json.session as Json).id as string;
    const s1Row = (await su.query(`select * from public.reflexology_mark_sessions where id=$1`, [S1])).rows[0];
    ok(s1Row.tenant_id === seed.TA && s1Row.client_id === a1 && s1Row.created_by_user_id === U.A.id, "tenant/danışan/created_by SUNUCUDAN (body enjeksiyonu yok sayıldı)", s1Row);
    const dup = await call(sessionsRoute.POST, "POST", {}, asA, { client_id: a1, session_date: "2026-10-10", source_uid: uid });
    ok(dup.status === 200 && (dup.json.session as Json).id === S1 && dup.json.duplicate === true, "aynı source_uid tekrar → aynı seans (çift tık)", dup.json);
    ok(Number((await su.query(`select count(*) n from public.reflexology_mark_sessions where client_id=$1`, [a1])).rows[0].n) === 1, "çift tık sonrası DB'de TEK seans");
    const list1 = await call(sessionsRoute.GET, "GET", {}, asA, undefined, `?client_id=${a1}`);
    ok(list1.status === 200 && (list1.json.sessions as Json[]).length === 1 && (list1.json.client as Json).name === "ZZ Ayşe YILMAZ", "liste: 1 seans + danışan adı", list1.json);
    const pat = await call(sessionRoute.PATCH, "PATCH", { id: S1 }, asA, { note: "Güncel not", title: "  " });
    ok(pat.status === 200 && (pat.json.session as Json).note === "Güncel not" && (pat.json.session as Json).title === null, "seans PATCH (not + boş başlık → null)", pat.json);

    // ── 3. Nokta ekleme — tüm yüzeyler ────────────────────────────────────────
    section("3. Yüzeyler (B–H) + nokta ekleme (I)");
    const placements: Array<{ surface: string; side: string; x: number; y: number }> = [
      { surface: "foot_sole", side: "right", x: 0.41, y: 0.33 },
      { surface: "foot_sole", side: "left", x: 0.52, y: 0.61 },
      { surface: "foot_inner", side: "right", x: 0.3, y: 0.5 },
      { surface: "foot_outer", side: "left", x: 0.7, y: 0.45 },
      { surface: "hand_palm", side: "right", x: 0.5, y: 0.6 },
      { surface: "hand_palm", side: "left", x: 0.48, y: 0.58 },
      { surface: "hand_dorsum", side: "right", x: 0.55, y: 0.4 },
      { surface: "hand_dorsum", side: "left", x: 0.45, y: 0.41 },
      { surface: "face", side: "none", x: 0.5, y: 0.3 },
    ];
    const ids: string[] = [];
    for (const p of placements) {
      const r = await call(marksRoute.POST, "POST", { id: S1 }, asA, {
        ...p, size: "medium", intensity: "light", note: `ZZ ${p.surface}/${p.side}`,
        client_id: a2, tenant_id: seed.TB, session_id: randomUUID(),
      });
      ok(r.status === 201 && (r.json.mark as Json).surface === p.surface && (r.json.mark as Json).side === p.side, `nokta eklendi: ${p.surface}/${p.side}`, r.json);
      ids.push((r.json.mark as Json).id as string);
    }
    const row0 = await markRow(ids[0]);
    ok(row0.client_id === a1 && row0.tenant_id === seed.TA && row0.session_id === S1, "nokta client_id SEANSTAN (body client_id/tenant_id/session_id yok sayıldı)", row0);
    ok(Math.abs(row0.x - 0.41) < 1e-9 && Math.abs(row0.y - 0.33) < 1e-9, "normalize koordinat birebir saklandı");
    // Yüz otomatik side=none
    const faceAuto = await call(marksRoute.POST, "POST", { id: S1 }, asA, { surface: "face", x: 0.4, y: 0.4 });
    ok(faceAuto.status === 201 && (faceAuto.json.mark as Json).side === "none" && (faceAuto.json.mark as Json).size === "medium", "yüz: side verilmezse none, boyut varsayılan orta");
    ids.push((faceAuto.json.mark as Json).id as string);

    section("3b. Geçersiz girdiler");
    const bads: Array<[string, Json]> = [
      ["yüz + sağ taraf", { surface: "face", side: "right", x: 0.5, y: 0.5 }],
      ["el + taraf yok", { surface: "hand_palm", x: 0.5, y: 0.5 }],
      ["ayak + none", { surface: "foot_sole", side: "none", x: 0.5, y: 0.5 }],
      ["x > 1", { surface: "foot_sole", side: "right", x: 1.2, y: 0.5 }],
      ["y < 0", { surface: "foot_sole", side: "right", x: 0.2, y: -0.1 }],
      ["x metin", { surface: "foot_sole", side: "right", x: "0.5", y: 0.5 }],
      ["bilinmeyen yüzey", { surface: "back", side: "right", x: 0.5, y: 0.5 }],
      ["geçersiz boyut", { surface: "foot_sole", side: "right", x: 0.5, y: 0.5, size: "huge" }],
      ["geçersiz yoğunluk", { surface: "foot_sole", side: "right", x: 0.5, y: 0.5, intensity: "max" }],
    ];
    for (const [label, body] of bads) {
      const r = await call(marksRoute.POST, "POST", { id: S1 }, asA, body);
      ok(r.status === 400, `${label} → 400`, r);
    }
    ok((await call(marksRoute.POST, "POST", { id: "x" }, asA, placements[0])).status === 400, "geçersiz seans id → 400");

    // ── 4. Yüzey ayrımı (kayıtlar arası karışma yok) ──────────────────────────
    section("4. Yüzey ayrımı");
    const g = await call(sessionRoute.GET, "GET", { id: S1 }, asA);
    const marks = g.json.marks as Array<{ surface: never; side: never; id: string }>;
    ok(g.status === 200 && marks.length === 10, "seans GET: 10 nokta", g.json);
    for (const s of MARK_SURFACES) {
      const sides = SURFACE_DEFS[s].sided ? (["right", "left"] as const) : (["none"] as const);
      for (const side of sides) {
        const got = marksForSurface(marks, s, side);
        const expect = placements.filter((p) => p.surface === s && p.side === side).length + (s === "face" ? 1 : 0);
        ok(got.length === expect && got.every((m) => (m as { surface: string }).surface === s && (m as { side: string }).side === side), `${s}/${side}: yalnız kendi noktası (${expect})`);
      }
    }
    ok(marksForSurface(marks, "face", "right").every((m) => (m as { side: string }).side === "none"), "yüz yönsüz: taraf parametresi yok sayılır");

    // ── 5. Güncelleme (taşı, boyut, yoğunluk, not) ────────────────────────────
    section("5. PATCH (J–L)");
    const mv = await call(itemRoute.PATCH, "PATCH", { markId: ids[4] }, asA, { x: 0.123456789, y: 0.9 });
    ok(mv.status === 200 && (mv.json.mark as Json).x === 0.1235 && (mv.json.mark as Json).y === 0.9, "taşı → 4 ondalık normalize", mv.json);
    const sz = await call(itemRoute.PATCH, "PATCH", { markId: ids[4] }, asA, { size: "large" });
    ok(sz.status === 200 && (sz.json.mark as Json).size === "large", "boyut → büyük (K)");
    const it1 = await call(itemRoute.PATCH, "PATCH", { markId: ids[4] }, asA, { intensity: "strong" });
    ok(it1.status === 200 && (it1.json.mark as Json).intensity === "strong", "yoğunluk → yoğun (L)");
    const it2 = await call(itemRoute.PATCH, "PATCH", { markId: ids[4] }, asA, { intensity: null, note: "" });
    ok(it2.status === 200 && (it2.json.mark as Json).intensity === null && (it2.json.mark as Json).note === null, "yoğunluk kaldır + boş not → null");
    const onlySurface = await call(itemRoute.PATCH, "PATCH", { markId: ids[4] }, asA, { surface: "face", side: "none" });
    ok(onlySurface.status === 400, "yalnız yüzey/taraf PATCH → 400 (yüzeyler arası taşıma YOK)");
    await call(itemRoute.PATCH, "PATCH", { markId: ids[4] }, asA, { surface: "face", side: "none", size: "small" });
    const r4 = await markRow(ids[4]);
    ok(r4.surface === "hand_palm" && r4.side === "right" && r4.size === "small", "yüzey alanı sessizce yok sayıldı, yalnız boyut değişti", r4);
    let trigBlocked = false;
    try { await su.query(`update public.reflexology_marks set surface='face', side='none' where id=$1`, [ids[4]]); } catch { trigBlocked = true; }
    ok(trigBlocked, "DB trigger: yüzey/taraf doğrudan SQL ile de değiştirilemez");
    ok((await call(itemRoute.PATCH, "PATCH", { markId: ids[4] }, asA, { x: 2, y: 0 })).status === 400, "PATCH x>1 → 400");

    // ── 6. Tenant izolasyonu (R) ──────────────────────────────────────────────
    section("6. Tenant izolasyonu (Uzman B → A verisi)");
    ok((await call(sessionRoute.GET, "GET", { id: S1 }, asB)).status === 404, "B okuyamaz (seans) → 404");
    const bPatch = await call(itemRoute.PATCH, "PATCH", { markId: ids[0] }, asB, { size: "large", x: 0.9, y: 0.9 });
    ok(bPatch.status === 404 && (await markRow(ids[0])).size === "medium", "B düzenleyemez (nokta) → 404, satır değişmedi");
    ok((await call(itemRoute.DELETE, "DELETE", { markId: ids[0] }, asB)).status === 404 && !!(await markRow(ids[0])), "B silemez (nokta) → 404, satır duruyor");
    ok((await call(marksRoute.POST, "POST", { id: S1 }, asB, placements[0])).status === 404, "B A'nın seansına yazamaz → 404");
    ok((await call(marksRoute.DELETE, "DELETE", { id: S1 }, asB, { expected_count: 10 })).status === 404, "B toplu silemez → 404");
    ok((await call(sessionRoute.PATCH, "PATCH", { id: S1 }, asB, { note: "hack" })).status === 404, "B seans düzenleyemez → 404");
    ok((await call(sessionRoute.DELETE, "DELETE", { id: S1 }, asB, undefined, "?expected_marks=10")).status === 404, "B seans silemez → 404");
    ok((await countMarks("session_id=$1", [S1])) === 10, "B denemeleri sonrası A'nın 10 noktası yerinde");
    const a2g = await call(sessionRoute.GET, "GET", { id: S1 }, asA2);
    ok(a2g.status === 200, "aynı tenant'taki 2. uzman (A2) tenant verisini görür (mevcut tenant modeli)");

    // ── 7. Danışan izolasyonu (Q) ─────────────────────────────────────────────
    section("7. Danışan izolasyonu");
    const s2 = await call(sessionsRoute.POST, "POST", {}, asA, { client_id: a2, session_date: "2026-10-09" });
    const S2 = (s2.json.session as Json).id as string;
    await call(marksRoute.POST, "POST", { id: S2 }, asA, { surface: "face", x: 0.1, y: 0.1 });
    const la1 = await call(sessionsRoute.GET, "GET", {}, asA, undefined, `?client_id=${a1}`);
    const la2 = await call(sessionsRoute.GET, "GET", {}, asA, undefined, `?client_id=${a2}`);
    ok((la1.json.sessions as Json[]).every((s) => s.client_id === a1) && (la1.json.sessions as Json[]).length === 1, "a1 listesi yalnız a1 seansı");
    ok((la2.json.sessions as Json[]).length === 1 && (la2.json.sessions as Json[])[0].mark_count === 1, "a2 listesi yalnız a2 seansı (1 nokta)");
    ok((la1.json.sessions as Json[])[0].mark_count === 10, "a1 seansı nokta sayısı 10");
    let fkBlocked = false;
    try {
      await su.query(
        `insert into public.reflexology_marks(tenant_id, client_id, session_id, surface, side, x, y) values ($1,$2,$3,'face','none',0.5,0.5)`,
        [seed.TA, a2, S1],
      );
    } catch { fkBlocked = true; }
    ok(fkBlocked, "DB composite FK: a2 noktası a1 seansına bağlanamaz");
    let crossTenant = false;
    try {
      await su.query(
        `insert into public.reflexology_mark_sessions(tenant_id, client_id, session_date) values ($1,$2,'2026-10-10')`,
        [seed.TB, a1],
      );
    } catch { crossTenant = true; }
    ok(crossTenant, "DB composite FK: B tenant'ı A'nın danışanına seans açamaz");

    // ── 8. Tek nokta silme (J) + toplu silme (U) ─────────────────────────────
    section("8. Silme güvenliği");
    const del1 = await call(itemRoute.DELETE, "DELETE", { markId: ids[8] }, asA);
    ok(del1.status === 200 && !(await markRow(ids[8])), "tek nokta silme (tek istek, toplu kural yok)");
    ok((await call(itemRoute.DELETE, "DELETE", { markId: ids[8] }, asA)).status === 404, "silinmiş nokta tekrar → 404");
    for (const p of [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }]) {
      await call(marksRoute.POST, "POST", { id: S1 }, asA, { surface: "hand_palm", side: "right", ...p });
    }
    const palmR = await countMarks("session_id=$1 and surface='hand_palm' and side='right'", [S1]);
    ok(palmR === 3, "sağ avuç: 3 nokta", palmR);
    const total0 = await countMarks("session_id=$1", [S1]);
    ok((await call(marksRoute.DELETE, "DELETE", { id: S1 }, asA, { surface: "hand_palm", side: "right" })).status === 400, "toplu silme expected_count yok → 400");
    const stale = await call(marksRoute.DELETE, "DELETE", { id: S1 }, asA, { surface: "hand_palm", side: "right", expected_count: 2 });
    ok(stale.status === 409 && stale.json.code === "MARK_COUNT_CHANGED" && stale.json.current_count === 3, "onaylanan sayı ≠ gerçek → 409, hiçbir şey silinmez", stale.json);
    ok((await countMarks("session_id=$1", [S1])) === total0, "409 sonrası sayı aynı");
    ok((await call(marksRoute.DELETE, "DELETE", { id: S1 }, asA, { side: "right", expected_count: 3 })).status === 400, "taraf filtresi yüzeysiz → 400");
    const bulk = await call(marksRoute.DELETE, "DELETE", { id: S1 }, asA, { surface: "hand_palm", side: "right", expected_count: 3 });
    ok(bulk.status === 200 && bulk.json.deleted === 3, "doğru onay → yalnız sağ avuç 3 nokta silindi", bulk.json);
    ok((await countMarks("session_id=$1 and surface='hand_palm' and side='left'", [S1])) === 1, "sol avuç noktası KORUNDU");
    ok((await countMarks("session_id=$1", [S1])) === total0 - 3, "diğer yüzeyler korunur");

    // Seans silme: 3+ nokta varken onay sayısı zorunlu.
    const remaining = await countMarks("session_id=$1", [S1]);
    const sdNo = await call(sessionRoute.DELETE, "DELETE", { id: S1 }, asA);
    ok(sdNo.status === 409 && sdNo.json.current_count === remaining, "3+ noktalı seans: onay sayısı yoksa → 409", sdNo.json);
    // (seansı aşağıdaki cascade testinde kullanıyoruz; ayrı seansla sil)
    const s3 = await call(sessionsRoute.POST, "POST", {}, asA, { client_id: a1, session_date: "2026-10-08" });
    const S3 = (s3.json.session as Json).id as string;
    for (let i = 0; i < 3; i++) await call(marksRoute.POST, "POST", { id: S3 }, asA, { surface: "foot_sole", side: "left", x: 0.1 * (i + 1), y: 0.5 });
    ok((await call(sessionRoute.DELETE, "DELETE", { id: S3 }, asA, undefined, "?expected_marks=2")).status === 409, "seans silme yanlış sayı → 409");
    const sd = await call(sessionRoute.DELETE, "DELETE", { id: S3 }, asA, undefined, "?expected_marks=3");
    ok(sd.status === 200 && sd.json.deleted_marks === 3 && (await countMarks("session_id=$1", [S3])) === 0, "seans silme doğru sayı → seans + 3 nokta (CASCADE)", sd.json);
    const s4 = await call(sessionsRoute.POST, "POST", {}, asA, { client_id: a1, session_date: "2026-10-07" });
    const S4 = (s4.json.session as Json).id as string;
    ok((await call(sessionRoute.DELETE, "DELETE", { id: S4 }, asA)).status === 200, "boş seans (0 nokta) tek onayla silinir");

    // ── 9. Demo ───────────────────────────────────────────────────────────────
    section("9. Demo vitrin");
    const dg = await call(sessionsRoute.GET, "GET", {}, asDemo, undefined, `?client_id=${a1}`);
    ok(dg.status === 200, "demo okuma → 200 (tenant-scoped)");
    const dp = await call(sessionsRoute.POST, "POST", {}, asDemo, { client_id: a1, session_date: "2026-10-10" });
    ok(dp.status === 403 && dp.json.code === "DEMO_READONLY", "demo seans yazma → 403");
    ok((await call(marksRoute.POST, "POST", { id: S1 }, asDemo, placements[0])).status === 403, "demo nokta yazma → 403");
    ok((await call(itemRoute.PATCH, "PATCH", { markId: ids[0] }, asDemo, { size: "small" })).status === 403, "demo PATCH → 403");
    ok((await call(itemRoute.DELETE, "DELETE", { markId: ids[0] }, asDemo)).status === 403, "demo DELETE → 403");

    // ── 10. Seans başı sınır ──────────────────────────────────────────────────
    section("10. Seans başı 400 nokta sınırı");
    const s5 = await call(sessionsRoute.POST, "POST", {}, asA, { client_id: a2, session_date: "2026-10-06" });
    const S5 = (s5.json.session as Json).id as string;
    await su.query(
      `insert into public.reflexology_marks(tenant_id, client_id, session_id, surface, side, x, y)
       select $1, $2, $3, 'foot_sole', 'right', (g % 100) / 100.0, 0.5 from generate_series(1, 400) g`,
      [seed.TA, a2, S5],
    );
    const lim = await call(marksRoute.POST, "POST", { id: S5 }, asA, placements[0]);
    ok(lim.status === 422 && lim.json.code === "MARK_LIMIT", "401. nokta → 422 MARK_LIMIT", lim.json);
    const g5 = await call(sessionRoute.GET, "GET", { id: S5 }, asA);
    ok((g5.json.marks as unknown[]).length === 400, "400 noktalı seans tam okunur");
    const l5 = await call(sessionsRoute.GET, "GET", {}, asA, undefined, `?client_id=${a2}`);
    ok((l5.json.sessions as Json[]).find((s) => s.id === S5)?.mark_count === 400, "liste sayımı 400 (sayfalı okuma)", l5.json);

    // ── 11. DB güvenlik: RLS / yetki / YH CDC yok / idempotent migration ──────
    section("11. DB güvenlik + Yaşam Hafızası");
    const rls = (await su.query(`select relname, relrowsecurity from pg_class where relname in ('reflexology_marks','reflexology_mark_sessions')`)).rows;
    ok(rls.length === 2 && rls.every((r: { relrowsecurity: boolean }) => r.relrowsecurity), "RLS açık (2 tablo)");
    const priv = (await su.query(`select has_table_privilege('anon','public.reflexology_marks','SELECT') a, has_table_privilege('authenticated','public.reflexology_mark_sessions','SELECT') b, has_table_privilege('authenticated','public.reflexology_marks','INSERT') c`)).rows[0];
    ok(!priv.a && !priv.b && !priv.c, "anon/authenticated erişimi YOK", priv);
    const yhTrig = (await su.query(`select tgname from pg_trigger where tgrelid in ('public.reflexology_marks'::regclass,'public.reflexology_mark_sessions'::regclass) and not tgisinternal`)).rows.map((r: { tgname: string }) => r.tgname);
    ok(yhTrig.every((t: string) => !t.startsWith("yh_")) && yhTrig.length === 2, "YH CDC trigger YOK (yalnız 2 guard trigger) → koordinat gürültüsü indekslenmez", yhTrig);
    let reapply = true;
    try { await su.query(MIGRATION); } catch (e) { reapply = false; console.error(e); }
    ok(reapply, "migration idempotent (2. uygulama hatasız)");
    ok((await countMarks("session_id=$1", [S1])) === remaining, "2. uygulama veriyi değiştirmedi");
    // anon anahtarıyla PostgREST → shim service_role çalıştırır; gerçek PostgREST anon rolünü kullanır.
    // Burada doğrudan rol testi: anon rolü ile SELECT reddedilir.
    let anonDenied = false;
    try { await su.query(`set role anon; select * from public.reflexology_marks limit 1;`); } catch { anonDenied = true; } finally { await su.query(`reset role`); }
    ok(anonDenied, "anon rolü SELECT → permission denied");
    void createClient;

    // ── 12. Danışan silme politikası (CASCADE) + önizleme ─────────────────────
    section("12. Danışan silme (mevcut politika: hard delete + CASCADE)");
    const svc = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
    const pv = await collectDeletePreview(svc, seed.TA, a1);
    const pvMap = new Map(pv.counts.map((c) => [c.key, c.count]));
    ok(pvMap.get("reflexologyMarkSessions") === 1 && pvMap.get("reflexologyMarks") === remaining, "silme önizlemesi refleksoloji seans/nokta sayısını gösterir", [...pvMap.entries()].filter(([k]) => k.startsWith("reflex")));
    const a2Before = await countMarks("client_id=$1", [a2]);
    await su.query(`delete from public.clients where id=$1`, [a1]);
    ok((await countMarks("client_id=$1", [a1])) === 0 && Number((await su.query(`select count(*) n from public.reflexology_mark_sessions where client_id=$1`, [a1])).rows[0].n) === 0, "danışan silinince seans + noktalar CASCADE silindi");
    ok((await countMarks("client_id=$1", [a2])) === a2Before, "diğer danışanın noktaları etkilenmedi");
    ok((await call(sessionRoute.GET, "GET", { id: S1 }, asA)).status === 404, "silinen danışanın seansı → 404");
  } finally {
    await env.stop();
  }

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.error("BAŞARISIZ:\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
