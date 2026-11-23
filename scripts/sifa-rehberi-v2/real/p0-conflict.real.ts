/**
 * 9. aşama P0 — sürüm çakışması GERÇEK PostgREST üzerinden (gerçek rota işleyicileri + gerçek requireModuleAccess).
 * Güvenlik: her istek 20 sn sert sınır; sınır aşılırsa döngü bağlantıları sonlandırılır ve test DURUR (tekrar yok).
 * Kanıt: süre, HTTP 409 + çakışan kayıt listesi, pg_stat_statements çağrı farkı (yeniden deneme → sayı patlar),
 * pg_stat_activity'de takılı sorgu yok, eski verinin özeti değişmedi, kazanan yazının üzerine sessizce yazılmadı.
 * Yeni sentetik ZZ_ tenant/uzmanlar oluşturur; mevcut veriye dokunmaz. Tekrar çalıştırılabilir.
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/p0-conflict.real.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { applyProcessEnv, connectTestDb, installNetworkFence, loadTestTarget, redact } from "./guard";

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
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${extra !== undefined ? ` — ${typeof extra === "string" ? extra : JSON.stringify(extra).slice(0, 300)}` : ""}`);
};
type Json = Record<string, unknown>;
const HARD_MS = 20_000;

async function main() {
  const T = loadTestTarget();
  installNetworkFence(T);
  applyProcessEnv(T);
  process.env.SIFA_REHBERI_V2_ENABLED = "1";
  const su = await connectTestDb();
  const ws = await import("../../../app/api/sifa-rehberi-v2/workspace/route");
  type H = (req: NextRequest) => Promise<Response>;

  const stopLoops = async () => {
    const r = await su.query(`select pid, pg_terminate_backend(pid) ok from pg_stat_activity
      where usename = 'authenticator' and query ilike '%sifa_v2_apply_changeset%' and pid <> pg_backend_pid()`);
    return r.rowCount ?? 0;
  };
  const stuck = async () =>
    Number((await su.query(`select count(*)::int n from pg_stat_activity where usename = 'authenticator' and query ilike '%sifa_v2_%' and state <> 'idle' and pid <> pg_backend_pid()`)).rows[0].n);
  const applyCalls = async () =>
    Number((await su.query(`select coalesce(sum(calls), 0)::bigint n from extensions.pg_stat_statements where query ilike '%sifa_v2_apply_changeset%' and query not ilike '%pg_stat_statements%'`)).rows[0].n);
  const otherDigest = async (ten: string) => {
    await su.query("SET TimeZone = 'UTC'");
    const r = await su.query(`select md5(string_agg(x::text, '|' order by x::text)) h, count(*)::int n from public.sifa_topics x where tenant_id <> $1`, [ten]);
    const b = await su.query(`select md5(string_agg(x::text, '|' order by x::text)) h, count(*)::int n from public.sifa_topic_blocks x where tenant_id <> $1`, [ten]);
    return `${r.rows[0].n}:${r.rows[0].h}/${b.rows[0].n}:${b.rows[0].h}`;
  };

  async function call(h: H, method: string, auth: { id: string; token: string }, body?: unknown) {
    const headers: Record<string, string> = { "x-user-id": auth.id, "x-session-token": auth.token };
    if (body !== undefined) headers["content-type"] = "application/json";
    const req = new NextRequest("http://localhost/api/sifa-rehberi-v2/workspace", { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const t0 = Date.now();
    let timer: NodeJS.Timeout | undefined;
    const res = await Promise.race([
      h(req),
      new Promise<null>((r) => {
        timer = setTimeout(() => r(null), HARD_MS);
      }),
    ]);
    clearTimeout(timer);
    const ms = Date.now() - t0;
    if (!res) {
      const n = await stopLoops();
      throw new Error(`SERT SINIR AŞILDI (${HARD_MS} ms) — olası yeniden deneme döngüsü; ${n} bağlantı sonlandırıldı, test DURDU`);
    }
    let json: Json = {};
    try {
      json = (await res.json()) as Json;
    } catch {
      /* boş */
    }
    return { status: res.status, json, ms };
  }

  // ── Sentetik kapsam ──
  const TEN = randomUUID();
  await su.query("insert into public.tenants(id, name) values ($1, 'ZZ_SIFA_P0')", [TEN]);
  const mk = async (label: string) => {
    const id = randomUUID();
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, membership_status, subscription_status)
       values ($1, $2, $3, 'expert', true, 'approved', '{"sifa_rehberi": true}', 'premium', 'premium', $4, 'active', 'active')`,
      [id, `ZZ_SIFA_P0_${label}`, `zz.sifa.p0.${label.toLowerCase()}@example.test`, TEN],
    );
    return id;
  };
  const session = async (uid: string) => {
    const token = `zz-sifa-v2-p0-${randomUUID()}`;
    await su.query("insert into public.user_sessions(user_id, session_token) values ($1, $2)", [uid, token]);
    return { id: uid, token };
  };
  const U1 = await mk("U1");
  const U2 = await mk("U2");
  const A = await session(U1); // Uzman 1 — pencere/cihaz A
  const B = await session(U1); // Uzman 1 — pencere/cihaz B (aynı kayıt, ayrı oturum)
  const C = await session(U2); // Uzman 2 — aynı tenant, kendi kaydı

  const otherBefore = await otherDigest(TEN);
  const callsBefore = await applyCalls();
  let requests = 0;
  const post = async (auth: { id: string; token: string }, body: unknown) => {
    requests++;
    return call(ws.POST, "POST", auth, body);
  };
  const doc = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
  const blk = (id: string, topic: string, text: string, base: number | null, title = "Not") => ({
    id, topic_id: topic, title, content_json: doc(text), content_text: text, classification: null, sort_key: "a1", deleted_at: null, delete_batch_id: null, base_version: base, sources: [],
  });

  console.log("1) Hazırlık — Uzman 1 kişisel konu + 2 kutu (X, Y)");
  const P = randomUUID();
  const X = randomUUID();
  const Y = randomUUID();
  const s0 = await post(A, {
    topics: [{ id: P, parent_id: null, title: "ZZ P0 Konusu", sort_key: "a1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null }],
    blocks: [blk(X, P, "X ilk", null, "Kutu X"), { ...blk(Y, P, "Y ilk", null, "Kutu Y"), sort_key: "b1" }],
  });
  ok(s0.status === 200, "ilk kayıt → 200", { s: s0.status, ms: s0.ms });

  console.log("2) A ve B aynı anda yükler (aynı sürümler)");
  const la = (await call(ws.GET, "GET", A)).json.workspace as { blocks: Json[] };
  const lb = (await call(ws.GET, "GET", B)).json.workspace as { blocks: Json[] };
  const vX = Number(la.blocks.find((b) => b.id === X)?.version);
  const vY = Number(lb.blocks.find((b) => b.id === Y)?.version);
  ok(vX === 1 && vY === 1, "iki pencerede X ve Y sürüm 1", { vX, vY });

  console.log("3) A, X'i kaydeder → 200");
  const sa = await post(A, { blocks: [blk(X, P, "X — A penceresi", vX, "Kutu X")] });
  ok(sa.status === 200, "A: X kaydı → 200", { s: sa.status, ms: sa.ms });

  console.log("4) B, YALNIZ Y'yi kaydeder (gerçek çakışma YOK) → 200 (yanlış çakışma yok)");
  const sbY = await post(B, { blocks: [{ ...blk(Y, P, "Y — B penceresi", vY, "Kutu Y"), sort_key: "b1" }] });
  ok(sbY.status === 200, "B: çakışmayan Y kaydı → 200", { s: sbY.status, ms: sbY.ms, j: sbY.json.code });

  console.log("5) B, bayat X'i kaydeder → 409 (sonlu sürede, çakışan yalnız X)");
  const sbX = await post(B, { blocks: [blk(X, P, "X — B penceresi (BAYAT)", vX, "Kutu X")] });
  const conf = (sbX.json.conflicts ?? []) as { id: string; kind: string; title: string }[];
  ok(sbX.status === 409, "B: bayat X → HTTP 409", { s: sbX.status, code: sbX.json.code });
  ok(sbX.ms < 5000, "yanıt sonlu ve hızlı (< 5 sn)", `${sbX.ms} ms`);
  ok(conf.length === 1 && conf[0].id === X && conf[0].kind === "block" && conf[0].title === "Kutu X", "409 gövdesi YALNIZ X'i listeler (Y yanlış çakışma değil)", conf);
  ok(sbX.json.code === "SIFA_V2_CONFLICT" && /değişiklikleriniz bu ekranda duruyor/i.test(String(sbX.json.error)), "kullanıcı mesajı: değişiklikler ekranda duruyor", sbX.json.error);

  console.log("6) Karma küme: çakışan X + yeni kutu Z → HİÇBİRİ yazılmaz (sessiz kısmi yazma yok)");
  const Z = randomUUID();
  const sMix = await post(B, { blocks: [blk(X, P, "X — B tekrar", vX, "Kutu X"), { ...blk(Z, P, "Z yeni", null, "Kutu Z"), sort_key: "c1" }] });
  ok(sMix.status === 409 && sMix.ms < 5000, "karma küme → 409 (sonlu)", { s: sMix.status, ms: sMix.ms });
  ok(Number((await su.query("select count(*)::int n from public.sifa_topic_blocks where id = $1", [Z])).rows[0].n) === 0, "Z yazılmadı (atomik)");

  console.log("7) Veri: kazanan yazı korunur, sessiz üzerine yazma yok");
  const rows = (await su.query("select id, content_text, version from public.sifa_topic_blocks where id = any($1::uuid[])", [[X, Y]])).rows;
  const rx = rows.find((r) => r.id === X);
  const ry = rows.find((r) => r.id === Y);
  ok(rx?.content_text === "X — A penceresi" && rx?.version === 2, "X = A'nın metni, sürüm 2 (B'nin bayat metni yazılmadı)", rx);
  ok(ry?.content_text === "Y — B penceresi" && ry?.version === 2, "Y = B'nin metni, sürüm 2", ry);

  console.log("8) Kullanıcı seçimiyle çözüm: B son hâli yükler, kendi metnini GÜNCEL sürümle yeniden gönderir → 200");
  const lb2 = (await call(ws.GET, "GET", B)).json.workspace as { blocks: Json[] };
  const vX2 = Number(lb2.blocks.find((b) => b.id === X)?.version);
  const sRes = await post(B, { blocks: [blk(X, P, "X — B (bilinçli üstüne uygula)", vX2, "Kutu X")] });
  ok(sRes.status === 200 && vX2 === 2, "güncel sürümle yeniden kayıt → 200", { s: sRes.status, vX2 });

  console.log("9) EŞZAMANLI: A ve B aynı tabandan X'i AYNI ANDA kaydeder → biri 200, diğeri 409; ikisi de sonlu");
  const v3 = Number(((await call(ws.GET, "GET", A)).json.workspace as { blocks: Json[] }).blocks.find((b) => b.id === X)?.version);
  const [ra, rb] = await Promise.all([post(A, { blocks: [blk(X, P, "X — eşzamanlı A", v3, "Kutu X")] }), post(B, { blocks: [blk(X, P, "X — eşzamanlı B", v3, "Kutu X")] })]);
  const st = [ra.status, rb.status].sort();
  ok(st[0] === 200 && st[1] === 409, "tam olarak biri 200, diğeri 409", { a: ra.status, b: rb.status });
  ok(Math.max(ra.ms, rb.ms) < 8000, "eşzamanlı yanıtlar sonlu (< 8 sn)", { a: ra.ms, b: rb.ms });
  const winner = ra.status === 200 ? "X — eşzamanlı A" : "X — eşzamanlı B";
  ok((await su.query("select content_text from public.sifa_topic_blocks where id = $1", [X])).rows[0].content_text === winner, "DB'de yalnız kazananın metni (kaybedenin metni sessizce yazılmadı)", winner);

  console.log("10) İki FARKLI uzman aynı anda kendi kayıtlarını kaydeder → ikisi de 200");
  const Q = randomUUID();
  const [r1, r2] = await Promise.all([
    post(A, { topics: [{ id: randomUUID(), parent_id: null, title: "ZZ U1 ikinci", sort_key: "b1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null }] }),
    post(C, { topics: [{ id: Q, parent_id: null, title: "ZZ U2 konusu", sort_key: "a1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null }] }),
  ]);
  ok(r1.status === 200 && r2.status === 200, "farklı uzmanlar eşzamanlı → 200/200", { a: r1.status, c: r2.status });

  console.log("11) Döngü yok: takılı sorgu, çağrı sayısı, diğer veriler");
  await new Promise((r) => setTimeout(r, 1500));
  ok((await stuck()) === 0, "pg_stat_activity: takılı sifa_v2 sorgusu 0");
  const delta = (await applyCalls()) - callsBefore;
  ok(delta <= requests, "pg_stat_statements: sifa_v2_apply_changeset çağrı artışı ≤ istek sayısı (yeniden deneme YOK)", { delta, requests });
  ok((await otherDigest(TEN)) === otherBefore, "diğer tenant'ların V2 verisi BİREBİR (öncesi = sonrası)");

  await su.end();
}

main()
  .catch((e) => {
    fail++;
    console.log(`  ✗ ${redact(String((e as Error)?.stack ?? e)).slice(0, 800)}`);
  })
  .finally(() => {
    console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
  });
