/**
 * WT9 — MİGRATION ÖNCESİ ŞEMADA admin taş aktarımı (GERÇEK route + GERÇEK Postgres; prod'a SIFIR temas).
 *
 * Eski şema: public.stones prod kolonları, WT9 migration'ı UYGULANMAMIŞ → stone_sources tablosu,
 * primary_source_name / extra_sources_text kolonları YOK. Beklenen (her biri açık assert):
 *   - aktarım 200 + ok, stones bölümü "success", inserted=1, failed=0 (500/çökme yok)
 *   - ek kaynak adımı GERÇEKTEN çalıştı ve tablo-yok yanıtı (42P01) aldı → atlandı (insert denemesi YOK)
 *   - hedefte taş TAM (içerik alanları birebir), batch damgalı; yarım/fazla veri yok
 *   - şema değişmedi (tablo/kolon oluşmadı), kaynak (admin) verisi değişmedi, ledger "completed"
 * Kontrol: aynı senaryo migration SONRASI şemada ek kaynağı kopyalar (atlama yolunun yalnız eski
 * şemada devreye girdiği kanıtlanır).
 * Çalıştır: npx tsx scripts/wt9/transfer-premigration.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, applyWt9Migration, seedStone, seedStonesUser, startWt9TestEnv, type Wt9User } from "./wt9TestEnv";
import { readMig } from "../bioenergy-presale-final/bioTestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const H0 = harness("wt9/transfer-premigration");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 600)), done: () => H0.done() };
type Json = Record<string, unknown>;

// stone_sources'a giden her PostgREST isteği + yanıtı kaydedilir (atlama yolunun gerçekten çalıştığının kanıtı).
const sourceCalls: { method: string; status: number; code: string | null }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const res = await realFetch(input, init);
  if (/\/rest\/v1\/stone_sources(\?|$)/.test(url)) {
    let code: string | null = null;
    try { code = String(((await res.clone().json()) as { code?: unknown }).code ?? "") || null; } catch { /* gövde yok */ }
    sourceCalls.push({ method: (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase(), status: res.status, code });
  }
  return res;
};

const adminReq = (u: Wt9User, body: unknown) => new NextRequest("http://localhost/api/admin/veri-paylasimi/transfer", {
  method: "POST", headers: { "content-type": "application/json", "x-admin-id": u.id, "x-session-token": u.token }, body: JSON.stringify(body),
});
async function j(res: Response): Promise<Json> { try { return (await res.json()) as Json; } catch { return {}; } }
const CONTENT = ["stone_name", "short_description", "general_info", "source_note", "physical_effects", "spiritual_effects", "other_effects", "warning_text", "warning_tags", "feng_shui", "meditation", "care", "application", "chakras", "assignments"];

(async () => {
  const env = await startWt9TestEnv({ port: 54500, dirName: "wt9-transfer-premig-pgdata", withMigration: false });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    await su.query(readMig("20260903000000_admin_audit_log.sql")).catch(() => undefined);
    await su.query(`create table if not exists public.admin_library_transfer_batches (
      batch_id uuid primary key, actor_admin_id uuid not null, target_user_id uuid, source_tenant_id uuid not null, target_tenant_id uuid not null,
      status text not null default 'processing', requested_count integer not null default 0, inserted_count integer not null default 0,
      counts jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
      grant select, insert, update, delete on all tables in schema public to service_role;`);

    // Ön koşul: gerçekten ESKİ şema.
    const schemaOld = async () => ({
      table: (await su.query(`select to_regclass('public.stone_sources') r`)).rows[0].r as string | null,
      cols: (await su.query(`select count(*)::int n from information_schema.columns where table_name='stones' and column_name in ('primary_source_name','extra_sources_text')`)).rows[0].n as number,
    });
    const s0 = await schemaOld();
    H.ok(s0.table === null && s0.cols === 0, "ön koşul: migration öncesi şema (stone_sources yok, yeni kolonlar yok)", s0);

    const ADMIN = await seedStonesUser(su, "ADMIN", { role: "admin" });
    const B = await seedStonesUser(su, "B");
    const aStone = await seedStone(su, ADMIN.tenant, {
      stone_name: "ZZ Akik", short_description: "Kısa", general_info: "Genel bilgi ŞİFA çğıöşü " + "uzun ".repeat(2000) + "SON",
      source_note: "Kristal Şifa kitabı", physical_effects: "Fiziksel", spiritual_effects: null, other_effects: "", warning_text: "Uyarı",
      warning_tags: ["Su ile temizlenmez"], feng_shui: "Feng", meditation: null, care: "Bakım", application: "Uygulama",
      chakras: ["Kök Çakra", "Kalp Çakrası"], assignments: { Mineraller: [["Kuvars", "60"]], Burçlar: [["Koç"]] }, images: [],
    });
    const aBefore = (await su.query(`select md5(row_to_json(s)::text) h from stones s where tenant_id=$1`, [ADMIN.tenant])).rows.map((r) => r.h).join(",");

    const transfer = await import("../../app/api/admin/veri-paylasimi/transfer/route");
    const batch = randomUUID();
    let res: Response | null = null;
    let thrown: unknown = null;
    try {
      res = await transfer.POST(adminReq(ADMIN, { batchId: batch, targetUserId: B.id, targetTenantId: B.tenant, groups: ["stones"], filterMap: { stones: [aStone] } }));
    } catch (e) { thrown = e; }
    H.ok(thrown === null, "çökme yok (route istisna fırlatmadı)", String(thrown));
    const body = res ? await j(res) : {};
    H.ok(res?.status === 200 && body.ok === true, "aktarım 200 + ok:true (500 YOK)", { status: res?.status, body });
    const sec = (body.sections as Json[] | undefined)?.find((s) => s.group === "stones");
    H.ok(sec?.status === "success" && sec?.inserted === 1 && sec?.requested === 1, "stones bölümü success, requested=1, inserted=1", sec);
    H.ok(body.failedSectionCount === 0 && body.insertedCount === 1, "başarısız bölüm 0, toplam inserted 1", body);

    // Atlama yolu GERÇEKTEN çalıştı: stone_sources okuması yapıldı, tablo-yok yanıtı alındı, insert denenmedi.
    H.ok(sourceCalls.length === 1 && sourceCalls[0]!.method === "GET" && sourceCalls[0]!.code === "42P01",
      "ek kaynak adımı çalıştı: tek GET stone_sources → tablo yok (42P01) → güvenle atlandı", sourceCalls);
    H.ok(!sourceCalls.some((c) => c.method === "POST"), "ek kaynak INSERT denemesi YOK", sourceCalls);

    // Hedefte tam taş, yarım/fazla veri yok.
    const bRows = (await su.query(`select * from stones where tenant_id=$1`, [B.tenant])).rows;
    H.ok(bRows.length === 1, "hedefte TAM OLARAK 1 taş (yarım/fazla kopya yok)", bRows.length);
    const a = (await su.query(`select * from stones where id=$1`, [aStone])).rows[0];
    const b = bRows[0] ?? {};
    const diffs = CONTENT.filter((c) => JSON.stringify(a[c]) !== JSON.stringify(b[c]) && !(c === "other_effects" && a[c] === "" && b[c] === ""));
    H.ok(diffs.length === 0, "taş içerik alanları birebir (uzun metin, Türkçe, jsonb çakra/atama/uyarı)", diffs);
    H.ok(b.id !== aStone && b.origin_source_id === aStone && b.origin_transfer_batch_id === batch && b.tenant_id === B.tenant, "yeni id + B tenant + batch damgası (rollback/idempotency izi)", b);
    const s1 = await schemaOld();
    H.ok(s1.table === null && s1.cols === 0, "şema değişmedi (aktarım tablo/kolon oluşturmadı)", s1);
    H.ok((await su.query(`select md5(row_to_json(s)::text) h from stones s where tenant_id=$1`, [ADMIN.tenant])).rows.map((r) => r.h).join(",") === aBefore, "kaynak (admin) verisi değişmedi");
    const ledger = (await su.query(`select status, inserted_count, counts from admin_library_transfer_batches where batch_id=$1`, [batch])).rows[0];
    H.ok(ledger?.status === "completed" && ledger?.inserted_count === 1 && ledger?.counts?.stones === 1, "ledger completed, counts.stones=1", ledger);

    // ── KONTROL: migration SONRASI aynı akış ek kaynağı kopyalar (atlama yalnız eski şemada) ──
    await applyWt9Migration(su);
    await su.query(`insert into stone_sources(tenant_id, stone_id, source_name, general_info) values ($1,$2,'Ahmet Hoca Eğitim Notu','Ahmet genel')`, [ADMIN.tenant, aStone]);
    sourceCalls.length = 0;
    const C = await seedStonesUser(su, "C");
    res = await transfer.POST(adminReq(ADMIN, { batchId: randomUUID(), targetUserId: C.id, targetTenantId: C.tenant, groups: ["stones"], filterMap: { stones: [aStone] } }));
    const cStone = (await su.query(`select id from stones where tenant_id=$1`, [C.tenant])).rows;
    const cSrc = cStone.length ? (await su.query(`select source_name, general_info, tenant_id from stone_sources where stone_id=$1`, [cStone[0].id])).rows : [];
    H.ok(res.status === 200 && cStone.length === 1 && cSrc.length === 1 && cSrc[0].source_name === "Ahmet Hoca Eğitim Notu" && cSrc[0].tenant_id === C.tenant,
      "kontrol: migration sonrası ek kaynak KOPYALANDI (atlama yolu yalnız eski şemada)", { status: res.status, cSrc });
    H.ok(sourceCalls.some((c) => c.method === "GET" && c.status === 200) && sourceCalls.some((c) => c.method === "POST" && c.status < 300),
      "kontrol: yeni şemada stone_sources okundu (200) ve yazıldı", sourceCalls);
  } catch (e) {
    H.ok(false, `beklenmeyen hata: ${e instanceof Error ? e.stack : String(e)}`);
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }
  H.done();
})();
