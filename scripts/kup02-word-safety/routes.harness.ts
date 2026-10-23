/**
 * KUP-02 — Kupa & Hacamat protokol Word'ü güvenlik kaydının uzman metnini (content) ve
 * kontrendikasyon sınıfını AKTARIR. GERÇEK route + GERÇEK Postgres (embedded, 127.0.0.1; PROD'A
 * SIFIR TEMAS; ZZ_* sentetik veri). Yeni tıbbi metin üretilmez: rapordaki her güvenlik metni
 * uzmanın kaydettiği metindir.
 *
 * 1) protokole bağlı güvenlik kaydı: başlık + "Kontrendikasyon · Mutlak" + uzman metni (çok satır) + protokol notu
 * 2) "none" / boş sınıf → sınıf yazılmaz; içerik boş → yalnız başlık (eski görünüm)
 * 3) protokole bağlı OLMAYAN güvenlik kaydı rapora girmez
 * 4) tenant izolasyonu: başka uzmanın protokolü 404; başka uzmanın güvenlik metni sızmaz
 * 5) route salt-okur (güvenlik / protokol tabloları hash'i birebir)
 * 6) yetki: oturumsuz 401
 * Çalıştır: npx tsx scripts/kup02-word-safety/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, readMig, startBioTestEnv } from "../bioenergy-presale-final/bioTestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";
import type pg from "pg";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const H0 = harness("kup02-word-safety/routes");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 600)), done: () => H0.done() };
type U = { id: string; token: string; tenant: string };
const req = (url: string, u: U | null) => new NextRequest(`http://localhost${url}`, {
  method: "GET", headers: u ? { "x-user-id": u.id, "x-session-token": u.token } : {},
});
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function unescapeXml(s: string) { return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }
/** Paragraf → satırlar: <w:br/> satır sonu, <w:t> metin. */
async function docText(res: Response): Promise<string> {
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  const raw = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return raw.split("</w:p>").map((p) => Array.from(p.matchAll(/<w:br\/>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g))
    .map((m) => (m[0] === "<w:br/>" ? "\n" : unescapeXml(m[1] ?? ""))).join("")).join("\n");
}

async function seedUser(su: pg.Client, label: string): Promise<U> {
  const tenant = randomUUID();
  await su.query(`insert into public.tenants(id, name) values ($1,$2) on conflict do nothing`, [tenant, `ZZ_KUP02_${label}`]);
  const id = randomUUID();
  const token = `zz-kup02-tok-${label.toLowerCase()}-${id.slice(0, 8)}`;
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, membership_status, tenant_id, is_demo_account)
     values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium','active',$5,false)`,
    [id, `ZZ_KUP02_${label}`, `zz.kup02.${label.toLowerCase()}@example.test`, JSON.stringify({ cupping: true }), tenant],
  );
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
  return { id, token, tenant };
}

const CONTENT = "ZZ Gebelikte uygulanmaz.\nKanama bozukluğu olanlarda uygulanmaz.";

(async () => {
  const env = await startBioTestEnv({ port: 54633, dirName: "kup02-word-safety-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    for (const f of ["20261216000000_cupping_schema.sql", "20261216010000_cupping_transfer_provenance.sql", "20261217000000_cupping_content_foundation.sql", "20261228000000_cupping_protocols_v2_core.sql"]) {
      await su.query(readMig(f));
    }
    await su.query(`grant select, insert, update, delete on all tables in schema public to service_role; grant execute on all functions in schema public to service_role;`);
    const T = await seedUser(su, "T");
    const X = await seedUser(su, "X");
    const route = await import("../../app/api/kupa/protocols/[id]/word-report/route");

    const ins = async (sql: string, args: unknown[]) => (await su.query(sql + " returning id", args)).rows[0].id as string;
    const proto = await ins(`insert into cupping_protocols(tenant_id, title) values ($1,'ZZ Sırt Protokolü')`, [T.tenant]);
    const sAbs = await ins(`insert into cupping_safety_notes(tenant_id, title, content, severity, contraindication_class) values ($1,'ZZ Gebelik',$2,'contraindication','absolute')`, [T.tenant, CONTENT]);
    const sRel = await ins(`insert into cupping_safety_notes(tenant_id, title, content, severity, contraindication_class) values ($1,'ZZ Antikoagülan','ZZ Hekim onayı ile.','warning','relative')`, [T.tenant]);
    const sNone = await ins(`insert into cupping_safety_notes(tenant_id, title, content, severity, contraindication_class) values ($1,'ZZ Bilgi Notu',null,'info','none')`, [T.tenant]);
    await ins(`insert into cupping_safety_notes(tenant_id, title, content, severity) values ($1,'ZZ BAĞSIZ KAYIT','ZZ BAĞSIZ METİN','warning')`, [T.tenant]);
    for (const [sid, note, ord] of [[sAbs, "ZZ Protokol notu: ilk seansta sor.", 0], [sRel, null, 1], [sNone, null, 2]] as const) {
      await su.query(`insert into cupping_protocol_safety(tenant_id, protocol_id, safety_id, protocol_note, sort_order) values ($1,$2,$3,$4,$5)`, [T.tenant, proto, sid, note, ord]);
    }
    const xProto = await ins(`insert into cupping_protocols(tenant_id, title) values ($1,'ZZ X Protokolü')`, [X.tenant]);
    const xSafe = await ins(`insert into cupping_safety_notes(tenant_id, title, content, severity, contraindication_class) values ($1,'ZZ X Güvenlik','ZZ X GİZLİ METİN','contraindication','absolute')`, [X.tenant]);
    await su.query(`insert into cupping_protocol_safety(tenant_id, protocol_id, safety_id, sort_order) values ($1,$2,$3,0)`, [X.tenant, xProto, xSafe]);

    const hash = async () => (await su.query(`select md5(coalesce(string_agg(row_to_json(t)::text,'|' order by id),'')) h from cupping_safety_notes t`)).rows[0].h
      + (await su.query(`select md5(coalesce(string_agg(row_to_json(t)::text,'|' order by id),'')) h from cupping_protocol_safety t`)).rows[0].h
      + (await su.query(`select md5(coalesce(string_agg(row_to_json(t)::text,'|' order by id),'')) h from cupping_protocols t`)).rows[0].h;
    const before = await hash();

    // ── 1/2/3) ──
    const r = await route.GET(req(`/api/kupa/protocols/${proto}/word-report`, T), ctx(proto));
    const txt = r.status === 200 ? await docText(r) : "";
    H.ok(r.status === 200 && txt.includes("GÜVENLİK / DİKKAT"), "0: Word üretildi + Güvenlik bölümü", { status: r.status });
    H.ok(txt.includes("ZZ Gebelik  — Kontrendikasyon · Mutlak"), "1a: önem + kontrendikasyon sınıfı (ekrandaki etiketle) yazılır", txt.slice(0, 900));
    H.ok(txt.includes("ZZ Gebelik  — Kontrendikasyon · Mutlak\nZZ Gebelikte uygulanmaz.\nKanama bozukluğu olanlarda uygulanmaz.\nZZ Protokol notu: ilk seansta sor."),
      "1b: uzmanın güvenlik metni satır satır AYNEN + ardından protokol notu (ayrı satır)", txt.slice(0, 900));
    H.ok(txt.includes("ZZ Antikoagülan  — Uyarı · Göreceli\nZZ Hekim onayı ile."), "1c: göreceli sınıf + metin", txt.slice(0, 900));
    H.ok(/ZZ Bilgi Notu {2}— Bilgi(\n|$)/.test(txt) && !/Bilgi · /.test(txt), "2: 'none' sınıf ve boş metin yazılmaz (yalnız başlık + önem)", txt.slice(0, 900));
    H.ok(!txt.includes("ZZ BAĞSIZ"), "3: protokole bağlı olmayan güvenlik kaydı rapora girmez");
    H.ok(!txt.includes("ZZ X"), "4a: başka uzmanın güvenlik metni sızmaz");

    // ── 4) tenant ──
    const rx = await route.GET(req(`/api/kupa/protocols/${xProto}/word-report`, T), ctx(xProto));
    H.ok(rx.status === 404, "4b: başka uzmanın protokolü → 404", rx.status);
    const rxx = await route.GET(req(`/api/kupa/protocols/${xProto}/word-report`, X), ctx(xProto));
    const xt = rxx.status === 200 ? await docText(rxx) : "";
    H.ok(xt.includes("ZZ X GİZLİ METİN") && !xt.includes("ZZ Gebelik"), "4c: X kendi metnini görür, T'ninkini görmez");

    // ── 5/6) ──
    H.ok((await hash()) === before, "5: route salt-okur (güvenlik / protokol tabloları hash birebir)");
    const ru = await route.GET(req(`/api/kupa/protocols/${proto}/word-report`, null), ctx(proto));
    H.ok(ru.status === 401, "6: oturumsuz 401", ru.status);
  } catch (e) {
    H.ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop();
    H.done();
  }
})();
