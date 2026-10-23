/**
 * AŞAMA 2 / DY-03 — Danışan Yolculuğu ATOMİK sürüm kontrolü harness'ı.
 *
 * GERÇEK route handler'ları + GERÇEK Postgres (embedded; yalnız 127.0.0.1, sentetik ZZ_ veri,
 * PRODUCTION'A SIFIR TEMAS). Migration'lar yalnız bu izole veritabanına uygulanır:
 *   20271002000000_client_notes_cas_update_rpc.sql (mevcut v1), 20271120000000_dy_subrecord_row_version.sql,
 *   20271120000100_client_notes_cas_update_v2.sql  (her ikisi İKİ KEZ → idempotent).
 *
 * Kapsam: seans / taş / ödev / analiz (row_version), Genel Bilgi kimlik alanları (clients, değer-CAS),
 * Genel Bilgi not alanları + Notlar (RPC v2). Her biri için: iki sekme (eski sürüm → 409, veri korunur),
 * eşzamanlı çift istek (tam 1×200 + 1×409), ÖN-OKUMA SONRASI KİLİT YARIŞI, sürümsüz istek → 428,
 * RPC'yi doğrudan sürümsüz çağırma → istisna, tenant / danışan izolasyonu, demo, fail-closed (503).
 *
 * Çalıştır: npx tsx scripts/asama2-dy03/harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import pg from "pg";
import { NextRequest } from "next/server";

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
const fails: string[] = [];
function ok(c: unknown, label: string, extra?: unknown) {
  if (c) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const mig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const PORT = 54661;

const SUB_DDL = `
create table public.client_sessions (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  session_date text, session_type text, duration_minutes int, fee numeric, session_note text, actions_done text, suggestions text, next_plan text,
  created_at timestamptz default now());
create table public.client_stones (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  stone_name text, stone_type text, note text, usage_area text, combination_text text, warning_text text, other_notes text, stone_date text,
  created_at timestamptz default now());
create table public.client_homeworks (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  title text, homework_type text, description text, start_date text, end_date text, status text, expert_note text, client_feedback text,
  alert_dismissed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.client_analyses (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  analysis_type text, analysis_data jsonb, note text, image_url text, created_at timestamptz default now());
create table public.client_combinations (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade, name text);
`;
const MIG_V1 = "20271002000000_client_notes_cas_update_rpc.sql";
const MIG_ROW = "20271120000000_dy_subrecord_row_version.sql";
const MIG_V2 = "20271120000100_client_notes_cas_update_v2.sql";

type Json = Record<string, unknown>;
type H = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type U = { id: string; token: string };

async function call(handler: unknown, method: string, params: Record<string, string>, auth: U, body?: unknown, query = "") {
  const req = new NextRequest(`http://localhost/api/test${query}`, {
    method,
    headers: { "content-type": "application/json", "x-user-id": auth.id, "x-session-token": auth.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await (handler as H)(req, { params: Promise.resolve(params) });
  let json: Json = {};
  try { json = (await res.clone().json()) as Json; } catch { /* boş */ }
  return { status: res.status, json };
}

async function main() {
  const { startAnamnezTestEnv, seedAnamnez, SERVICE_KEY, ANON_KEY } = await import("../anamnez/testEnv");
  const env = await startAnamnezTestEnv({
    port: PORT,
    dirName: "asama2-dy03-pgdata",
    rpcAllow: ["client_notes_cas_update", "client_notes_cas_update_v2"],
    extraSql: [SUB_DDL, mig(MIG_V1)],
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY ?? "anon";
  const su = env.su;
  const q = async (sql: string, a: unknown[] = []) => (await su.query(sql, a)).rows;
  const q1 = async (sql: string, a: unknown[] = []) => (await q(sql, a))[0];
  try {
    const S = await seedAnamnez(su);
    const { A, A2, B, DEMO } = S.users;
    const a1 = S.clients.a1;
    const a2 = S.clients.a2;

    // ── Migration (izole DB; iki kez) ─────────────────────────────────────────
    section("Migration (yalnız izole yerel DB; idempotent)");
    // Mevcut satırlar migration'dan ÖNCE eklenir → varsayılan 1 almalı.
    const preSess = (await q1(`insert into client_sessions(tenant_id, client_id, session_type) values ($1,$2,'ZZ Eski Seans') returning id`, [S.TA, a1])).id;
    for (const m of [MIG_ROW, MIG_V2, MIG_ROW, MIG_V2]) await su.query(mig(m));
    await su.query(`grant select, insert, update, delete on public.client_sessions, public.client_stones, public.client_homeworks,
      public.client_analyses, public.client_combinations to service_role;`);
    ok((await q1(`select row_version from client_sessions where id=$1`, [preSess])).row_version === "1", "mevcut satır row_version=1 (veri değişmedi)");
    const cols = await q(`select table_name from information_schema.columns where column_name='row_version' and table_schema='public' order by 1`);
    ok(JSON.stringify(cols.map((c) => c.table_name)) === JSON.stringify(["client_analyses", "client_homeworks", "client_sessions", "client_stones"]), "4 tabloda row_version", cols);
    await q(`update client_sessions set session_type='x', row_version=999 where id=$1`, [preSess]);
    ok((await q1(`select row_version from client_sessions where id=$1`, [preSess])).row_version === "2", "tetikleyici: her UPDATE +1; istemcinin yazdığı sürüm (999) YOK SAYILIR");
    const acl = await q1(`select has_function_privilege('anon','public.client_notes_cas_update_v2(uuid,uuid,uuid,text,text,jsonb)','EXECUTE') a,
                                 has_function_privilege('authenticated','public.client_notes_cas_update_v2(uuid,uuid,uuid,text,text,jsonb)','EXECUTE') b,
                                 has_function_privilege('service_role','public.client_notes_cas_update_v2(uuid,uuid,uuid,text,text,jsonb)','EXECUTE') c,
                                 (select prosecdef from pg_proc where proname='client_notes_cas_update_v2') d`);
    ok(acl.a === false && acl.b === false && acl.c === true && acl.d === false, "RPC v2: anon/authenticated EXECUTE yok, service_role var, SECURITY INVOKER", acl);
    ok((await q1(`select count(*)::int n from pg_trigger where tgname='trg_dy_row_version'`)).n === 4, "tetikleyici tek (iki kez uygulama sonrası 4 tablo × 1)");

    const R = "../../app/api/clients/[id]";
    const sessions = await import(`${R}/sessions/route`);
    const stones = await import(`${R}/stones/route`);
    const homeworks = await import(`${R}/homeworks/route`);
    const analyses = await import(`${R}/analyses/route`);
    const clientR = await import(`${R}/route`);
    const notesR = await import(`${R}/notes/route`);

    // ── Ortak alt kayıt matrisi ────────────────────────────────────────────────
    type Spec = {
      name: string; table: string; handler: unknown;
      insert: () => Promise<string>;
      body: (id: string, v: unknown, mark: string) => Json;
      read: (id: string) => Promise<string>;
    };
    const specs: Spec[] = [
      {
        name: "Seans", table: "client_sessions", handler: sessions,
        insert: async () => (await q1(`insert into client_sessions(tenant_id, client_id, session_type, session_note) values ($1,$2,'Enerji','ilk') returning id`, [S.TA, a1])).id,
        body: (id, v, mark) => ({ id, row_version: v, session_note: mark }),
        read: async (id) => (await q1(`select session_note x from client_sessions where id=$1`, [id])).x,
      },
      {
        name: "Taş", table: "client_stones", handler: stones,
        insert: async () => (await q1(`insert into client_stones(tenant_id, client_id, stone_name, note) values ($1,$2,'Ametist','ilk') returning id`, [S.TA, a1])).id,
        body: (id, v, mark) => ({ id, row_version: v, note: mark }),
        read: async (id) => (await q1(`select note x from client_stones where id=$1`, [id])).x,
      },
      {
        name: "Ödev", table: "client_homeworks", handler: homeworks,
        insert: async () => (await q1(`insert into client_homeworks(tenant_id, client_id, title, description, status) values ($1,$2,'Nefes','ilk','bekliyor') returning id`, [S.TA, a1])).id,
        body: (id, v, mark) => ({ homeworkId: id, row_version: v, patch: { description: mark } }),
        read: async (id) => (await q1(`select description x from client_homeworks where id=$1`, [id])).x,
      },
      {
        name: "Analiz", table: "client_analyses", handler: analyses,
        insert: async () => (await q1(`insert into client_analyses(tenant_id, client_id, analysis_type, analysis_data, note) values ($1,$2,'chakra','{"values":{"before_energy_ruhsal":{"mark":"+1"}}}','ilk') returning id`, [S.TA, a1])).id,
        body: (id, v, mark) => ({ id, row_version: v, note: mark, analysis_data: { values: { before_energy_ruhsal: { mark: mark } } } }),
        read: async (id) => (await q1(`select note x from client_analyses where id=$1`, [id])).x,
      },
    ];
    const P = (handler: unknown) => (handler as { PATCH: unknown }).PATCH;

    for (const sp of specs) {
      section(`${sp.name} — atomik row_version`);
      const id = await sp.insert();
      const ver = async () => Number((await q1(`select row_version v from ${sp.table} where id=$1`, [id])).v);
      ok((await ver()) === 1, "yeni kayıt sürüm 1");
      // İki sekme aynı sürümü (1) açtı.
      const tabA = await call(P(sp.handler), "PATCH", { id: a1 }, A, sp.body(id, 1, "SEKME-A"));
      ok(tabA.status === 200 && (await sp.read(id)) === "SEKME-A" && (await ver()) === 2, "Sekme A (v1) → 200, sürüm 2", tabA);
      const tabB = await call(P(sp.handler), "PATCH", { id: a1 }, A2, sp.body(id, 1, "SEKME-B-ESKI"));
      ok(tabB.status === 409 && tabB.json.code === "RECORD_CONFLICT" && (await sp.read(id)) === "SEKME-A", "Sekme B eski sürümle (v1) → 409, Sekme A verisi KORUNDU", tabB);
      ok(!!tabB.json.current && typeof tabB.json.error === "string" && /başka bir sekmede/.test(String(tabB.json.error)), "409 yanıtı güncel kaydı + Türkçe mesajı taşır");
      const noV = await call(P(sp.handler), "PATCH", { id: a1 }, A, sp.body(id, undefined, "SURUMSUZ"));
      ok(noV.status === 428 && noV.json.code === "VERSION_REQUIRED" && (await sp.read(id)) === "SEKME-A", "sürümsüz istek → 428, yazım YOK (eski istemci atlatamaz)", noV);
      const badV = await call(P(sp.handler), "PATCH", { id: a1 }, A, sp.body(id, "abc", "BOZUK"));
      ok(badV.status === 428 && (await sp.read(id)) === "SEKME-A", "biçimsiz sürüm → 428");
      const future = await call(P(sp.handler), "PATCH", { id: a1 }, A, sp.body(id, 99, "GELECEK"));
      ok(future.status === 409 && (await sp.read(id)) === "SEKME-A", "uydurma ileri sürüm → 409 (sahteleme yok)");
      // Eşzamanlı çift istek × 5 tur.
      let raceOk = true;
      for (let i = 0; i < 5; i++) {
        const v = await ver();
        const [x, y] = await Promise.all([
          call(P(sp.handler), "PATCH", { id: a1 }, A, sp.body(id, v, `X${i}`)),
          call(P(sp.handler), "PATCH", { id: a1 }, A2, sp.body(id, v, `Y${i}`)),
        ]);
        const codes = [x.status, y.status].sort().join(",");
        const win = x.status === 200 ? `X${i}` : `Y${i}`;
        if (codes !== "200,409" || (await sp.read(id)) !== win || (await ver()) !== v + 1) { raceOk = false; console.error("   tur", i, codes); }
      }
      ok(raceOk, "eşzamanlı çift PATCH (5 tur): her turda tam 1×200 + 1×409, sürüm +1");
      // Kilit yarışı: başka işlem satırı değiştirip kilidi tutarken gelen istek, kilit bırakılınca 409 almalı.
      const vBefore = await ver();
      const locker = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: "testpw", database: "postgres" });
      await locker.connect();
      await locker.query("begin");
      await locker.query(`update ${sp.table} set tenant_id = tenant_id where id=$1`, [id]);
      const pending = call(P(sp.handler), "PATCH", { id: a1 }, A, sp.body(id, vBefore, "KILITTE-BEKLEYEN"));
      await new Promise((r) => setTimeout(r, 800));
      await locker.query("commit");
      await locker.end();
      const late = await pending;
      ok(late.status === 409 && (await sp.read(id)) !== "KILITTE-BEKLEYEN", "KİLİT YARIŞI: paralel yazar commit edince bekleyen istek 409 (yarış penceresi yok)", late.status);
      // İzolasyon
      const vNow = await ver();
      const other = await call(P(sp.handler), "PATCH", { id: a2 }, A, sp.body(id, vNow, "BASKA-DANISAN"));
      ok(other.status === 404 && (await sp.read(id)) !== "BASKA-DANISAN", "başka danışanın yolu üzerinden → 404, değişiklik yok", other.status);
      const tenantB = await call(P(sp.handler), "PATCH", { id: a1 }, B, sp.body(id, vNow, "B-TENANT"));
      ok((tenantB.status === 403 || tenantB.status === 404) && (await sp.read(id)) !== "B-TENANT", "başka tenant → reddedilir", tenantB.status);
      const demo = await call(P(sp.handler), "PATCH", { id: a1 }, DEMO, sp.body(id, vNow, "DEMO"));
      ok(demo.status === 403 && (await sp.read(id)) !== "DEMO", "demo → 403");
      const okNow = await call(P(sp.handler), "PATCH", { id: a1 }, A, sp.body(id, vNow, "GUNCEL"));
      ok(okNow.status === 200 && (await sp.read(id)) === "GUNCEL", "güncel sürümle tekrar → 200 (akış kilitlenmez)");
    }

    section("Ödev hızlı işlemler (durum / uyarı kapatma) da sürümlü");
    const hw = await specs[2]!.insert();
    const st1 = await call(P(homeworks), "PATCH", { id: a1 }, A, { homeworkId: hw, row_version: 1, patch: { status: "tamamlandi" } });
    ok(st1.status === 200 && Number(st1.json.row_version) === 2, "durum değişikliği 200 + yeni sürüm yanıtta", st1.json);
    const st2 = await call(P(homeworks), "PATCH", { id: a1 }, A2, { homeworkId: hw, row_version: 1, patch: { alert_dismissed_at: new Date().toISOString() } });
    ok(st2.status === 409 && (await q1(`select alert_dismissed_at from client_homeworks where id=$1`, [hw])).alert_dismissed_at === null, "eski sürümle uyarı kapatma → 409, yazım yok");
    const st3 = await call(P(homeworks), "PATCH", { id: a1 }, A, { homeworkId: hw, patch: { status: "iptal" } });
    ok(st3.status === 428 && (await q1(`select status from client_homeworks where id=$1`, [hw])).status === "tamamlandi", "sürümsüz durum değişikliği → 428");

    section("Silme iş kuralları korunur");
    const delId = await specs[0]!.insert();
    const del = await call((sessions as { DELETE: unknown }).DELETE, "DELETE", { id: a1 }, A, undefined, `?id=${delId}`);
    ok(del.status === 200 && !(await q1(`select 1 x from client_sessions where id=$1`, [delId])), "seans silme 200 (sürüm gerekmez, mevcut kural)", del);

    section("Fail-closed: row_version kolonu yoksa korumasız yazım YOK");
    const stoneId = await specs[1]!.insert();
    await su.query(`drop trigger trg_dy_row_version on client_stones; alter table client_stones rename column row_version to row_version_x;`);
    const unav = await call(P(stones), "PATCH", { id: a1 }, A, { id: stoneId, row_version: 1, note: "KORUMASIZ" });
    await su.query(`alter table client_stones rename column row_version_x to row_version;`);
    await su.query(mig(MIG_ROW));
    ok(unav.status === 503 && unav.json.code === "VERSION_UNAVAILABLE" && (await specs[1]!.read(stoneId)) === "ilk", "kolon yok → 503, kayıt değişmedi", unav);

    // ── Genel Bilgi kimlik alanları (clients) ─────────────────────────────────
    section("Genel Bilgi kimlik alanları — değer koşullu atomik CAS");
    const getC = async (u: U = A) => call((clientR as { GET: unknown }).GET, "GET", { id: a1 }, u);
    const g0 = await getC();
    const cv0 = g0.json.client_version as string;
    ok(g0.status === 200 && /^[0-9a-f]{64}$/.test(cv0), "GET client_version");
    const PC = (clientR as { PATCH: unknown }).PATCH;
    const ca = await call(PC, "PATCH", { id: a1 }, A, { telefon: "05551112233", base_version: cv0 });
    ok(ca.status === 200 && (await q1(`select telefon from clients where id=$1`, [a1])).telefon === "05551112233", "Sekme A → 200");
    const cb = await call(PC, "PATCH", { id: a1 }, A2, { telefon: "05559998877", base_version: cv0 });
    ok(cb.status === 409 && cb.json.code === "CLIENT_CONFLICT" && (await q1(`select telefon from clients where id=$1`, [a1])).telefon === "05551112233", "Sekme B eski sürüm → 409, A korundu");
    const cn = await call(PC, "PATCH", { id: a1 }, A, { telefon: "0000" });
    ok(cn.status === 428 && cn.json.code === "VERSION_REQUIRED", "sürümsüz kimlik alanı yazımı → 428");
    const cg = await call(PC, "PATCH", { id: a1 }, A, { gorusme: "2026-10-22" });
    ok(cg.status === 200, "sürüm dışı alan (gorusme, randevu akışı) sürümsüz → 200 (yanlış çakışma yok)", cg);
    let craceOk = true;
    for (let i = 0; i < 5; i++) {
      const v = (await getC()).json.client_version as string;
      const [x, y] = await Promise.all([
        call(PC, "PATCH", { id: a1 }, A, { telefon: `X${i}`, base_version: v }),
        call(PC, "PATCH", { id: a1 }, A2, { telefon: `Y${i}`, base_version: v }),
      ]);
      const codes = [x.status, y.status].sort().join(",");
      const win = x.status === 200 ? `X${i}` : `Y${i}`;
      if (codes !== "200,409" || (await q1(`select telefon from clients where id=$1`, [a1])).telefon !== win) { craceOk = false; console.error("   tur", i, codes); }
    }
    ok(craceOk, "eşzamanlı çift PATCH (5 tur): tam 1×200 + 1×409");
    {
      const v = (await getC()).json.client_version as string;
      const locker = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: "testpw", database: "postgres" });
      await locker.connect();
      await locker.query("begin");
      await locker.query(`update clients set kan='AB Rh-' where id=$1`, [a1]);
      const pending = call(PC, "PATCH", { id: a1 }, A, { telefon: "KILIT", base_version: v });
      await new Promise((r) => setTimeout(r, 800));
      await locker.query("commit");
      await locker.end();
      const late = await pending;
      const row = await q1(`select telefon, kan from clients where id=$1`, [a1]);
      ok(late.status === 409 && row.kan === "AB Rh-" && row.telefon !== "KILIT", "KİLİT YARIŞI: ön-okuma sonrası değişen satır → 409, paralel yazarın değeri korunur (eskiden ezilirdi)", { s: late.status, row });
    }
    const cB = await call(PC, "PATCH", { id: a1 }, B, { telefon: "B", base_version: cv0 });
    ok(cB.status === 403 || cB.status === 404, "başka tenant → reddedilir", cB.status);

    // ── Notlar + Genel Bilgi not alanları (RPC v2) ─────────────────────────────
    section("Genel Bilgi not alanları + Notlar — RPC v2 (sürüm zorunlu)");
    const GN = (notesR as { GET: unknown }).GET;
    const PN = (notesR as { PATCH: unknown }).PATCH;
    const n0 = await call(GN, "GET", { id: a1 }, A);
    const gv0 = n0.json.general_version as string;
    const nv0 = n0.json.notlar_version as string;
    ok(/^[0-9a-f]{64}$/.test(gv0) && /^[0-9a-f]{64}$/.test(nv0), "GET notlar_version + general_version");
    const ga = await call(PN, "PATCH", { id: a1 }, A, { saglik_notu: "A sağlık", adres: "A adres", oneriler: "A öneri", general_base_version: gv0 });
    ok(ga.status === 200 && (await q1(`select saglik_notu from client_notes where client_id=$1`, [a1])).saglik_notu === "A sağlık", "Genel not alanları Sekme A → 200", ga);
    const gb = await call(PN, "PATCH", { id: a1 }, A2, { saglik_notu: "B eski", adres: "B", oneriler: "B", general_base_version: gv0 });
    ok(gb.status === 409 && gb.json.code === "NOTES_CONFLICT" && (await q1(`select saglik_notu from client_notes where client_id=$1`, [a1])).saglik_notu === "A sağlık", "Sekme B eski sürüm → 409, A korundu (eskiden sürümsüz → ezilirdi)", gb.status);
    const gnoV = await call(PN, "PATCH", { id: a1 }, A, { saglik_notu: "SURUMSUZ" });
    ok(gnoV.status === 428 && (await q1(`select saglik_notu from client_notes where client_id=$1`, [a1])).saglik_notu === "A sağlık", "genel alanlar sürümsüz → 428");
    const nnoV = await call(PN, "PATCH", { id: a1 }, A, { notlar: "SURUMSUZ NOT" });
    ok(nnoV.status === 428, "notlar sürümsüz → 428 (eski istemci atlatamaz)");
    const nA = await call(PN, "PATCH", { id: a1 }, A, { notlar: "Not A", base_version: nv0 });
    ok(nA.status === 200, "notlar sürümle → 200");
    const nB = await call(PN, "PATCH", { id: a1 }, A2, { notlar: "Not B eski", base_version: nv0 });
    ok(nB.status === 409 && (await q1(`select notlar from client_notes where client_id=$1`, [a1])).notlar === "Not A", "notlar eski sürüm → 409");
    const gvNow = (await call(GN, "GET", { id: a1 }, A)).json.general_version as string;
    const indep = await call(PN, "PATCH", { id: a1 }, A2, { adres: "Bağımsız adres", general_base_version: gvNow });
    ok(indep.status === 200, "notlar değişimi genel alanlarda YANLIŞ çakışma üretmez (ayrı sürümler)");
    let nrace = true;
    for (let i = 0; i < 5; i++) {
      const v = (await call(GN, "GET", { id: a1 }, A)).json.general_version as string;
      const [x, y] = await Promise.all([
        call(PN, "PATCH", { id: a1 }, A, { adres: `X${i}`, general_base_version: v }),
        call(PN, "PATCH", { id: a1 }, A2, { adres: `Y${i}`, general_base_version: v }),
      ]);
      if ([x.status, y.status].sort().join(",") !== "200,409") { nrace = false; console.error("   tur", i, x.status, y.status); }
    }
    ok(nrace, "genel not alanları eşzamanlı çift PATCH (5 tur): tam 1×200 + 1×409");
    // RPC'yi doğrudan sürümsüz çağırma (sunucu kodu dışından atlatma girişimi).
    const noteId = (await q1(`select id from client_notes where client_id=$1`, [a1])).id;
    let rpcErr = "";
    try { await su.query(`select * from client_notes_cas_update_v2($1,$2,$3,null,null,'{"adres":"ATLATMA"}'::jsonb)`, [S.TA, a1, noteId]); } catch (e) { rpcErr = String((e as Error).message); }
    ok(/general_version_required/.test(rpcErr) && (await q1(`select adres from client_notes where id=$1`, [noteId])).adres !== "ATLATMA", "RPC v2 sürümsüz doğrudan çağrı → istisna (veritabanı düzeyinde atlatılamaz)", rpcErr);
    rpcErr = "";
    try { await su.query(`select * from client_notes_cas_update_v2($1,$2,$3,null,null,'{"notlar":"ATLATMA"}'::jsonb)`, [S.TA, a1, noteId]); } catch (e) { rpcErr = String((e as Error).message); }
    ok(/client_notes_version_required/.test(rpcErr), "RPC v2 notlar sürümsüz → istisna");
    const nTB = await call(PN, "PATCH", { id: a1 }, B, { adres: "B", general_base_version: gvNow });
    ok(nTB.status === 403 && (await q1(`select adres from client_notes where id=$1`, [noteId])).adres !== "B", "başka tenant → 403");
    // Fail-closed: v2 yoksa 503 (v1'e / koşulsuz yazıma geri düşüş YOK).
    await su.query(`alter function public.client_notes_cas_update_v2(uuid,uuid,uuid,text,text,jsonb) rename to client_notes_cas_update_v2_x`);
    const gvx = (await call(GN, "GET", { id: a1 }, A)).json.general_version as string;
    const un = await call(PN, "PATCH", { id: a1 }, A, { adres: "KORUMASIZ", general_base_version: gvx });
    await su.query(`alter function public.client_notes_cas_update_v2_x(uuid,uuid,uuid,text,text,jsonb) rename to client_notes_cas_update_v2`);
    ok(un.status === 503 && (await q1(`select adres from client_notes where id=$1`, [noteId])).adres !== "KORUMASIZ", "RPC v2 yoksa → 503, korumasız yazım YOK", un);
    // Notu olmayan danışan: ilk kayıt (insert) yolu da sürüm ister ve çalışır.
    const emptyGv = (await call(GN, "GET", { id: a2 }, A)).json.general_version as string;
    const ins = await call(PN, "PATCH", { id: a2 }, A, { adres: "İlk kayıt", general_base_version: emptyGv });
    ok(ins.status === 200 && (await q1(`select adres from client_notes where client_id=$1`, [a2])).adres === "İlk kayıt", "notu olmayan danışanda ilk kayıt (sürümle) → 200");
  } finally {
    await env.stop();
  }
}

main()
  .catch((e) => { fail++; fails.push(String(e)); console.error(e); })
  .finally(() => {
    console.log(`\nAŞAMA 2 / DY-03 harness: ${pass} PASS / ${fail} FAIL`);
    if (fails.length) console.log("FAILURES:\n - " + fails.join("\n - "));
    process.exit(fail ? 1 : 0);
  });
