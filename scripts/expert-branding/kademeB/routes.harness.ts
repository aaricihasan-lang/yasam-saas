/**
 * F3B — Kademe B rapor markalaması ROTA + PG + ÇÖZÜCÜ izolasyon harness'ı (F3A routes.harness.ts deseni).
 *
 * Gerçek Next route handler'ları (Refleksoloji protokol + kayıtlı atlas Word, Kupa takvim Word, Hacamat Word + PDF, F1 profil,
 * F2 logo, Kişisel Dijital Ofis yükleme) + gerçek migration'lar + yerel embedded-postgres + PostgREST şimi + Storage emülatörü
 * (scripts/anamnez/testEnv — yalnız içe aktarılır). Production'a SIFIR temas (127.0.0.1); veriler sentetik. Roxy / e-posta /
 * ödeme YOK.
 *
 * Kapsam:
 *  A çözücü purpose "signature" / "named-by-form": alan süzmesi, ad yalnız oturum sahibinin kaydından (loadFullName yalnız
 *    anahtar açıkken çağrılır), A / A2 / B izolasyonu
 *  B Refleksoloji (protokol tek + toplu, kayıtlı atlas) + Kupa takvim: A'nın raporu A'nın profil + logosunu kullanır; B'ninkini /
 *    A2'ninkini ASLA; anahtar kapalı ≡ profil yok ≡ markasız (normalize parça eşitliği)
 *  C Hacamat Word + PDF: formdaki "Hazırlayan" adı KORUNUR (profil adı yazılmaz); unvan / kurum / logo / iletişim / dipnot;
 *    form adı boş → markasız; Word ve PDF aynı alanlar
 *  D Gökyüzü Atlası yükleyicisi (astroReportBrandingLoader): oturum sahibinin profili + kendi adı; başka uzmanınki asla
 *  E logo silinmiş / bozuk / başka uzmanın → logosuz, rapor 200
 *  F rota kablolaması (statik): Kademe B rotalarının tamamı merkezi çözücüyü oturum sahibiyle ve doğru purpose ile çağırır
 *  G tablo YOK → rapor 200 + anahtar kapalı çıktısıyla birebir
 *  H günlüklerde profil içeriği / kimlik yok
 *
 * Çalıştır: npx tsx scripts/expert-branding/kademeB/routes.harness.ts [--out <klasör>]
 */
import Module from "node:module";
import net from "node:net";
import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import JSZip from "jszip";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { SERVICE_KEY, ANON_KEY, seedAnamnez, startAnamnezTestEnv, type Seed, type TestEnv } from "../../anamnez/testEnv";
import { normalizeKademeBDocx, normalizePdfBytes } from "./normalize";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const OUT = arg("--out");
if (OUT) mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

type Auth = { id?: string; token?: string };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const MIGS = [readMig("20271227000000_expert_workspace_designs_prefs.sql"), readMig("20271228000000_expert_workspace_assets_access.sql"), readMig("20280102000000_expert_profiles.sql")];
// Kademe B rotalarının okuduğu tablolar (sentetik test şeması; rota kodunun okuduğu kolonlar).
const KB_DDL = `
create table if not exists public.reflexology_protocols (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, source_uid text,
  title text, target_problem text, organs text, application_notes text, raw_json jsonb, created_at timestamptz default now());
create table if not exists public.reflexology_atlas (tenant_id uuid primary key, document jsonb, updated_at timestamptz default now());
create table if not exists public.cupping_advice_templates (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, title text, before_text text,
  after_text text, general_note text, is_default boolean default false, is_active boolean default true, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.cupping_calendar_plans (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text, year int,
  description text, advice_template_id uuid, is_active boolean default true, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.cupping_calendar_plan_days (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, plan_id uuid not null,
  gregorian_date date, selection_source text, user_label text, note text, color_key text, created_at timestamptz default now(), updated_at timestamptz default now());
`;
const SENTINEL = "ZZSENTINELPII";
const FORM_NAME = "Uzm. Form Hazırlayan Adı";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error("boş port alınamadı"))));
    });
  });
}

const logged: string[] = [];
for (const k of ["log", "error", "warn", "info"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...args: unknown[]) => {
    const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    if (!line.startsWith("  ✓") && !line.startsWith("  ✗") && !line.startsWith("\n[")) logged.push(line);
    orig(...args);
  };
}
{
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`harness: dış ağ yasak: ${url}`);
    return origFetch(input, init);
  }) as typeof fetch;
}

type Docx = { buf: Buffer; all: string; text: string; media: Buffer[] };
async function openDocx(buf: Buffer): Promise<Docx> {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((f) => !zip.files[f]!.dir);
  const media = await Promise.all(names.filter((f) => f.startsWith("word/media/")).map((f) => zip.file(f)!.async("nodebuffer")));
  const parts = await Promise.all(names.filter((f) => f.endsWith(".xml")).map((f) => zip.file(f)!.async("string")));
  const all = parts.join("\n");
  const text = [...all.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]!.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")).join("");
  return { buf, all, text, media };
}
async function pdfInfo(buf: Buffer): Promise<{ text: string; images: number; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(doc, { mergePages: true });
  const raw = buf.toString("latin1");
  return { text: (text as string).replace(/\s+/g, ""), images: (raw.match(/\/Subtype \/Image/g) ?? []).length, pages: doc.numPages };
}
const sq = (s: string) => s.replace(/\s+/g, "");

async function main(): Promise<void> {
  const env: TestEnv = await startAnamnezTestEnv({ port: await freePort(), dirName: "expert-branding-kademeb-pgdata", extraSql: [...MIGS, KB_DDL] });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.REQUIRE_DB_SUPER_ADMIN_MARKER = "true";
  process.env.EXPERT_WORKSPACE_DESIGN_ENABLED = "true";
  process.env.EXPERT_WORKSPACE_ROLLOUT_ALL = "true";
  await env.su.query(`grant select, insert, update, delete on all tables in schema public to service_role;
                      grant usage, select on all sequences in schema public to service_role;
                      grant execute on all functions in schema public to service_role;`);
  const seed: Seed = await seedAnamnez(env.su);
  const U = seed.users;
  // Demo vitrini prod'daki gibi KENDİ tenant'ında (aynı tenant'taki uzmanlar demo salt-okuma kısıtına takılmaz) — F3A deseni.
  const TD = (await env.su.query(`insert into public.tenants(id, name) values (gen_random_uuid(),'ZZ_BRANDING_KB_DEMO_TENANT') returning id`)).rows[0].id as string;
  await env.su.query(`update public.users set tenant_id=$1 where id=$2`, [TD, U.DEMO.id]);
  await env.su.query(`update public.users set module_permissions = module_permissions || '{"reflexology":true,"cosmic_calendar":true,"cupping":true}'::jsonb where id = any($1)`, [[U.A.id, U.A2.id, U.B.id]]);
  // Sentetik Refleksoloji verisi (A tenant'ı + B tenant'ı).
  const ATLAS = {
    _meta: { version: "1", updated_at: "2026-01-01T00:00:00.000Z" },
    "Böbrek": { taban: { sol: [{ id: "f1", shape: "oval", cx: 0.3, cy: 0.55, rx: 0.05, ry: 0.05, angle: 0 }], sag: [] }, yan_ic: { sol: [], sag: [] }, yan_dis: { sol: [], sag: [] } },
    "Kalp": { taban: { sol: [{ id: "o1", shape: "rect", cx: 0.33, cy: 0.45, rx: 0.05, ry: 0.04, angle: 0 }], sag: [] }, yan_ic: { sol: [], sag: [] }, yan_dis: { sol: [], sag: [] } },
  };
  const protoA = (await env.su.query(`insert into public.reflexology_protocols(tenant_id, title, target_problem, organs, application_notes) values ($1,'ZZ Sindirim','Kısa açıklama','Böbrek | Kalp','Sabah uygulayın.'),($1,'ZZ Uyku',null,'Kalp',null) returning id`, [seed.TA])).rows.map((r) => r.id as string);
  await env.su.query(`insert into public.reflexology_atlas(tenant_id, document) values ($1,$3),($2,$3)`, [seed.TA, seed.TB, JSON.stringify(ATLAS)]);
  const protoB = (await env.su.query(`insert into public.reflexology_protocols(tenant_id, title, organs) values ($1,'ZZ B Protokol','Kalp') returning id`, [seed.TB])).rows[0].id as string;
  const tplA = (await env.su.query(`insert into public.cupping_advice_templates(tenant_id, title, before_text, after_text) values ($1,'ZZ Şablon','Önce','Sonra') returning id`, [seed.TA])).rows[0].id as string;
  const planA = (await env.su.query(`insert into public.cupping_calendar_plans(tenant_id, name, year, advice_template_id) values ($1,'ZZ Takvim',2026,$2) returning id`, [seed.TA, tplA])).rows[0].id as string;
  await env.su.query(`insert into public.cupping_calendar_plan_days(tenant_id, plan_id, gregorian_date, selection_source, user_label, color_key) values ($1,$2,'2026-09-09','manual','Sabah','yellow'),($1,$2,'2026-09-23','manual',null,'red')`, [seed.TA, planA]);
  const planB = (await env.su.query(`insert into public.cupping_calendar_plans(tenant_id, name, year) values ($1,'ZZ B Takvim',2026) returning id`, [seed.TB])).rows[0].id as string;
  console.log(`embedded-postgres + PostgREST şimi + Storage emülatörü hazır (${env.url}).`);

  try {
    const profileRoute = await import("../../../app/api/settings/profile/route");
    const logoRoute = await import("../../../app/api/settings/profile/logo/route");
    const startRoute = await import("../../../app/api/settings/workspace/assets/uploads/route");
    const chunkRoute = await import("../../../app/api/settings/workspace/assets/uploads/[uploadId]/chunks/[index]/route");
    const completeRoute = await import("../../../app/api/settings/workspace/assets/uploads/[uploadId]/complete/route");
    const protocolRoute = await import("../../../app/api/refleksoloji/protocol-report/route");
    const atlasRoute = await import("../../../app/api/refleksoloji/atlas-report/route");
    const calendarRoute = await import("../../../app/api/kupa/calendar/plans/[id]/word-report/route");
    const hacWord = await import("../../../app/api/hacamat/word-report/route");
    const hacPdf = await import("../../../app/api/hacamat/pdf-report/route");
    const { resolveReportBranding, readAccountFullName } = await import("../../../lib/profile/reportBranding");
    const { resolveReportLogo } = await import("../../../lib/profile/reportLogo");
    const { astroReportBrandingLoader } = await import("../../../lib/astrology/report/branding");
    const asA: Auth = { id: U.A.id, token: U.A.token };
    const asA2: Auth = { id: U.A2.id, token: U.A2.token };
    const asB: Auth = { id: U.B.id, token: U.B.token };
    const ownerA = { tenantId: seed.TA, userId: U.A.id };
    const ownerB = { tenantId: seed.TB, userId: U.B.id };
    const db: SupabaseClient = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    async function call(handler: unknown, method: string, auth: Auth, opts: { body?: unknown; raw?: Uint8Array; params?: Record<string, string>; url?: string } = {}): Promise<{ status: number; json: Json; buf: Buffer | null }> {
      const headers: Record<string, string> = {};
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      let body: BodyInit | undefined;
      if (opts.raw) { headers["content-type"] = "application/octet-stream"; headers["content-length"] = String(opts.raw.length); body = Buffer.from(opts.raw); }
      else if (opts.body !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(opts.body); }
      const req = new NextRequest(opts.url ?? "http://localhost/api/test", { method, headers, body });
      const res = await (handler as Handler)(req, { params: Promise.resolve(opts.params ?? {}) });
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("json")) { let json: Json = {}; try { json = (await res.json()) as Json; } catch { /* boş */ } return { status: res.status, json, buf: null }; }
      return { status: res.status, json: {}, buf: Buffer.from(await res.arrayBuffer()) };
    }
    async function upload(a: Auth, bytes: Buffer, fileName: string): Promise<string> {
      const s = await call(startRoute.POST, "POST", a, { body: { kind: "logo", fileName, mimeType: "image/png", size: bytes.length } });
      if (s.status !== 200) throw new Error(`upload start ${s.status} ${JSON.stringify(s.json)}`);
      const { uploadId, chunkSize, chunkCount } = s.json as { uploadId: string; chunkSize: number; chunkCount: number };
      for (let i = 0; i < chunkCount; i++) {
        const c = await call(chunkRoute.PUT, "PUT", a, { raw: bytes.subarray(i * chunkSize, Math.min(bytes.length, (i + 1) * chunkSize)), params: { uploadId, index: String(i) } });
        if (c.status !== 200) throw new Error(`chunk ${c.status}`);
      }
      const done = await call(completeRoute.POST, "POST", a, { params: { uploadId } });
      if (done.status !== 200) throw new Error(`complete ${done.status}`);
      return done.json.asset.id as string;
    }
    const version = async (a: Auth) => (await call(profileRoute.GET, "GET", a)).json.version as number;
    async function putProfile(a: Auth, profile: Json): Promise<number> {
      const r = await call(profileRoute.PUT, "PUT", a, { body: { expectedVersion: await version(a), profile } });
      if (r.status !== 200) throw new Error(`profil PUT ${r.status} ${JSON.stringify(r.json)}`);
      return r.status;
    }
    async function setLogo(a: Auth, body: Json): Promise<number> {
      return (await call(logoRoute.PUT, "PUT", a, { body: { ...body, expectedVersion: await version(a) } })).status;
    }
    const save = (name: string, buf: Buffer | null, ext = "docx") => { if (OUT && buf) writeFileSync(path.join(OUT, `${name}.${ext}`), buf); };
    const svgLogo = (w: number, h: number, fill: string) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${h / 5}" fill="${fill}"/><circle cx="${h / 2}" cy="${h / 2}" r="${h / 3}" fill="#ffffff"/></svg>`)).png().toBuffer();

    const refTek = (a: Auth, id = protoA[0]!) => call(protocolRoute.POST, "POST", a, { body: { exportMode: "single", protocolId: id }, url: "http://localhost/api/refleksoloji/protocol-report" });
    const refAll = (a: Auth) => call(protocolRoute.POST, "POST", a, { body: { exportMode: "all" }, url: "http://localhost/api/refleksoloji/protocol-report" });
    const refAtlas = (a: Auth) => call(atlasRoute.POST, "POST", a, { body: { exportMode: "all" }, url: "http://localhost/api/refleksoloji/atlas-report" });
    const takvim = (a: Auth, id = planA) => call(calendarRoute.GET, "GET", a, { params: { id }, url: `http://localhost/api/kupa/calendar/plans/${id}/word-report` });
    const hacBody = (expertName: string) => ({ year: 2026, month: 10, title: "HACAMAT TAKVİMİ", expertName, expertNotes: "Seans notu.", rules: [{ rule_text: "Öncesinde hafif beslenin.", category: "before" }] });
    const hacW = (a: Auth, name: string) => call(hacWord.POST, "POST", a, { body: hacBody(name), url: "http://localhost/api/hacamat/word-report" });
    const hacP = (a: Auth, name: string) => call(hacPdf.POST, "POST", a, { body: hacBody(name), url: "http://localhost/api/hacamat/pdf-report" });

    section("Hazırlık: sentetik profiller + logolar (gerçek F1/F2 rotalarıyla)");
    const LA = await upload(asA, await svgLogo(1200, 300, "#0f766e"), "a-yatay.png");
    const LA2 = await upload(asA2, await svgLogo(400, 400, "#7c3aed"), "a2-kare.png");
    const LB = await upload(asB, await svgLogo(600, 200, "#b91c1c"), "b.png");
    const PA = { title: `Refleksoloji Uzmanı ${SENTINEL}A`, organization: "Ayşe Yılmaz Yaşam Merkezi", phone: "0532 000 00 01", contactEmail: "a@example.invalid", website: "https://ornek-a.example", reportNote: `A dipnotu ${SENTINEL}`,
      reportBrandingEnabled: true, reportShowTitle: true, reportShowOrganization: true, reportShowContact: true, reportShowNote: true };
    const PA2 = { title: "A2 Unvanı Kupa Uzmanı", organization: "A2 Kurumu", reportBrandingEnabled: true, reportShowTitle: true, reportShowOrganization: true };
    const PB = { title: "B UNVANI GİZLİ", organization: "B KURUMU GİZLİ", phone: "0532 999 99 99", reportNote: "B DİPNOTU GİZLİ", reportBrandingEnabled: true, reportShowTitle: true, reportShowOrganization: true, reportShowContact: true, reportShowNote: true };
    const B_SECRETS = ["B UNVANI GİZLİ", "B KURUMU GİZLİ", "B DİPNOTU GİZLİ", "0532 999 99 99", "ZZ_ANAMNEZ_B", PA2.title, PA2.organization, "ZZ_ANAMNEZ_A2"];
    await putProfile(asA, PA);
    await putProfile(asA2, PA2);
    await putProfile(asB, PB);
    ok((await setLogo(asA, { source: "custom", assetId: LA })) === 200 && (await setLogo(asA2, { source: "custom", assetId: LA2 })) === 200 && (await setLogo(asB, { source: "custom", assetId: LB })) === 200, "A / A2 / B profilleri + özel logoları kaydedildi");
    const logoA = (await resolveReportLogo(db, ownerA))!;
    const logoA2 = (await resolveReportLogo(db, { tenantId: seed.TA, userId: U.A2.id }))!;
    const logoB = (await resolveReportLogo(db, ownerB))!;
    const foreignLogo = (d: { media: Buffer[] }) => d.media.some((m) => m.equals(logoB.data) || m.equals(logoA2.data));

    section("A — çözücü: purpose signature / named-by-form");
    let loads = 0;
    const loader = async () => { loads++; return "ZZ_ANAMNEZ_A"; };
    const sig = await resolveReportBranding(db, ownerA, { loadFullName: loader }, { purpose: "signature" });
    ok(!!sig && sig.name === "ZZ_ANAMNEZ_A" && sig.title === PA.title && sig.organization === PA.organization && !!sig.contactLine && sig.note === PA.reportNote && !!sig.logoPng?.data.equals(logoA.data) && loads === 1, "signature: profil adı (oturum kaydından) + unvan + kurum + iletişim + dipnot + A logosu", sig && { ...sig, logoPng: !!sig.logoPng });
    const nbf = await resolveReportBranding(db, ownerA, { fullName: "ZZ_ANAMNEZ_A" }, { purpose: "named-by-form" });
    ok(!!nbf && !nbf.name && nbf.title === PA.title && nbf.organization === PA.organization && !!nbf.contactLine && nbf.note === PA.reportNote && !!nbf.logoPng, "named-by-form: AD YOK; unvan + kurum + logo + iletişim + dipnot (Owner kararı)");
    ok((await readAccountFullName(db, U.A.id)) === "ZZ_ANAMNEZ_A" && (await readAccountFullName(db, "00000000-0000-4000-8000-000000000000")) === null, "readAccountFullName: oturum sahibinin kendi kaydı; olmayan kullanıcı → null");
    await putProfile(asA, { reportBrandingEnabled: false });
    loads = 0;
    ok((await resolveReportBranding(db, ownerA, { loadFullName: loader }, { purpose: "signature" })) === null && loads === 0, "anahtar kapalı → null ve ad sorgusu YAPILMAZ");
    await putProfile(asA, { reportBrandingEnabled: true });
    ok((await resolveReportBranding(db, { tenantId: seed.TB, userId: U.A.id }, { fullName: "x" }, { purpose: "signature" })) === null, "yanlış tenant + A kullanıcısı → null");

    section("B — Refleksoloji + Kupa: A'nın raporu A'nın profili; B / A2 ASLA");
    for (const [label, fn] of [["refleks-protokol-tek", () => refTek(asA)], ["refleks-protokol-toplu", () => refAll(asA)], ["refleks-atlas", () => refAtlas(asA)], ["kupa-takvim", () => takvim(asA)]] as [string, () => ReturnType<typeof call>][]) {
      const r = await fn();
      ok(r.status === 200 && !!r.buf, `${label}: 200`, r.json);
      if (!r.buf) continue;
      save(`rota-${label}-A-markali`, r.buf);
      const d = await openDocx(r.buf);
      ok(d.text.includes("ZZ_ANAMNEZ_A") && d.text.includes(PA.title) && d.text.includes(PA.organization) && d.text.includes("a@example.invalid") && d.text.includes(PA.reportNote) && d.text.includes("Hazırlayan"), `${label}: "Hazırlayan" bloğunda A'nın adı + unvan + kurum + iletişim + dipnot`);
      ok(d.media.some((m) => m.equals(logoA.data)), `${label}: A'nın logosu (bayt-bayt)`);
      ok(!B_SECRETS.some((s) => d.text.includes(s)) && !foreignLogo(d), `${label}: B / A2 bilgisi ve logosu YOK`);
    }
    const rA2 = await refTek(asA2);
    const dA2 = await openDocx(rA2.buf!);
    ok(rA2.status === 200 && dA2.text.includes("ZZ_ANAMNEZ_A2") && dA2.text.includes(PA2.title) && !dA2.text.includes(PA.title) && dA2.media.some((m) => m.equals(logoA2.data)) && !dA2.media.some((m) => m.equals(logoA.data)), "A2 (aynı tenant, aynı protokol): A2'nin adı + profili + logosu; A'nınki yok");
    const rB = await refTek(asB, protoB);
    const dB = await openDocx(rB.buf!);
    ok(rB.status === 200 && dB.text.includes("B UNVANI GİZLİ") && !dB.text.includes(PA.title) && !dB.media.some((m) => m.equals(logoA.data)), "B (başka tenant): kendi profili; A'nınki yok");
    ok((await refTek(asB, protoA[0]!)).status === 404 && (await takvim(asB, planA)).status === 404, "B, A tenant'ının protokolünü / takvimini alamaz (mevcut koruma) → 404");
    ok((await takvim(asA, planB)).status === 404, "A, B'nin takvimini alamaz → 404");

    section("B2 — anahtar kapalı ≡ profil yok ≡ markasız (normalize parça eşitliği)");
    await putProfile(asA, { reportBrandingEnabled: false });
    const offs: Record<string, Buffer> = {};
    for (const [label, fn] of [["refleks-protokol-tek", () => refTek(asA)], ["refleks-atlas", () => refAtlas(asA)], ["kupa-takvim", () => takvim(asA)], ["hacamat-word", () => hacW(asA, FORM_NAME)]] as [string, () => ReturnType<typeof call>][]) {
      const r = await fn();
      offs[label] = r.buf!;
      save(`rota-${label}-A-anahtar-kapali`, r.buf);
      const d = await openDocx(r.buf!);
      ok(r.status === 200 && !d.text.includes(PA.title) && !d.text.includes("Uzman Notu") && !d.media.some((m) => m.equals(logoA.data)), `${label}: anahtar kapalı → profil bilgisi / logo YOK`);
    }
    const hacPdfOff = (await hacP(asA, FORM_NAME)).buf!;
    const savedRow = (await env.su.query(`select * from public.expert_profiles where user_id=$1`, [U.A.id])).rows[0];
    await env.su.query(`delete from public.expert_profiles where user_id=$1`, [U.A.id]);
    for (const [label, fn] of [["refleks-protokol-tek", () => refTek(asA)], ["refleks-atlas", () => refAtlas(asA)], ["kupa-takvim", () => takvim(asA)], ["hacamat-word", () => hacW(asA, FORM_NAME)]] as [string, () => ReturnType<typeof call>][]) {
      const r = await fn();
      ok(JSON.stringify(await normalizeKademeBDocx(r.buf!)) === JSON.stringify(await normalizeKademeBDocx(offs[label]!)), `${label}: profil satırı YOK → anahtar kapalı çıktısıyla birebir`);
    }
    const pdfNone = (await hacP(asA, FORM_NAME)).buf!;
    ok((await pdfInfo(pdfNone)).text === (await pdfInfo(hacPdfOff)).text && (await pdfInfo(pdfNone)).pages === (await pdfInfo(hacPdfOff)).pages, "hacamat-pdf: profil satırı YOK → anahtar kapalı ile aynı metin / sayfa");
    const cols = Object.keys(savedRow);
    await env.su.query(`insert into public.expert_profiles(${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map((c) => savedRow[c]));
    await putProfile(asA, { reportBrandingEnabled: true });

    section("C — Hacamat Word + PDF: form adı KORUNUR, profil adı yazılmaz");
    const hw = await hacW(asA, FORM_NAME);
    const hp = await hacP(asA, FORM_NAME);
    save("rota-hacamat-word-A-form-adli", hw.buf);
    save("rota-hacamat-pdf-A-form-adli", hp.buf, "pdf");
    const dW = await openDocx(hw.buf!);
    const pP = await pdfInfo(hp.buf!);
    ok(hw.status === 200 && hp.status === 200, "Hacamat Word + PDF 200");
    ok(dW.text.includes(FORM_NAME) && !dW.text.includes("ZZ_ANAMNEZ_A"), "Word: formdaki ad var, profil adı (ZZ_ANAMNEZ_A) YOK");
    ok(pP.text.includes(sq(FORM_NAME)) && !pP.text.includes("ZZ_ANAMNEZ_A"), "PDF: formdaki ad var, profil adı YOK");
    const fields = [PA.title, PA.organization, "a@example.invalid", PA.reportNote];
    ok(fields.every((f) => dW.text.includes(f)) && dW.media.some((m) => m.equals(logoA.data)), "Word: unvan + kurum + iletişim + dipnot + A logosu");
    ok(fields.every((f) => pP.text.includes(sq(f))) && pP.images >= 1, "PDF: AYNI alanlar + logo görseli (Word ↔ PDF tutarlı)");
    ok(!B_SECRETS.some((s) => dW.text.includes(s) || pP.text.includes(sq(s))) && !foreignLogo(dW), "Hacamat: B / A2 bilgisi YOK");
    const hwEmpty = await hacW(asA, "");
    const hpEmpty = await hacP(asA, "");
    const dWE = await openDocx(hwEmpty.buf!);
    const pPE = await pdfInfo(hpEmpty.buf!);
    ok(!dWE.text.includes(PA.title) && !dWE.text.includes("Hazırlayan") && !dWE.media.some((m) => m.equals(logoA.data)) && !pPE.text.includes(sq(PA.title)) && pPE.images === 0, "form adı BOŞ → Word ve PDF markasız (profil adı da otomatik yazılmaz)");
    await putProfile(asA, { reportBrandingEnabled: false });
    const hwEmptyOff = await hacW(asA, "");
    ok(JSON.stringify(await normalizeKademeBDocx(hwEmpty.buf!)) === JSON.stringify(await normalizeKademeBDocx(hwEmptyOff.buf!)), "form adı boş + anahtar açık ≡ anahtar kapalı (normalize birebir)");
    const hpEmptyOff = await hacP(asA, "");
    ok(normalizePdfBytes(hpEmpty.buf!).length === normalizePdfBytes(hpEmptyOff.buf!).length && (await pdfInfo(hpEmptyOff.buf!)).text === pPE.text, "PDF: form adı boş + anahtar açık ≡ anahtar kapalı (metin + boyut)");
    await putProfile(asA, { reportBrandingEnabled: true });

    section("D — Gökyüzü Atlası yükleyicisi (astroReportBrandingLoader; oturum ctx)");
    const atA = await astroReportBrandingLoader({ db, tenantId: seed.TA, userId: U.A.id })();
    const atB = await astroReportBrandingLoader({ db, tenantId: seed.TB, userId: U.B.id })();
    ok(!!atA && atA.name === "ZZ_ANAMNEZ_A" && atA.title === PA.title && !!atA.logoPng?.data.equals(logoA.data), "A: kendi kaydındaki ad + A profili + A logosu");
    ok(!!atB && atB.name === "ZZ_ANAMNEZ_B" && atB.title === "B UNVANI GİZLİ" && !!atB.logoPng?.data.equals(logoB.data) && atB.title !== atA!.title, "B: yalnız B'nin profili ve adı");
    ok((await astroReportBrandingLoader({ db, tenantId: seed.TB, userId: U.A.id })()) === null, "çapraz tenant ctx → null (profil sızmaz)");
    {
      const { renderAstroReportDocx } = await import("../../../lib/astrology/report/docx");
      const { buildAstroReportPdf } = await import("../../../lib/astrology/report/pdf");
      const rep = { title: "ZZ Atlas", cover: { client: "ZZ Danışan", analysisDate: "10.11.2026", tradition: "Batı", technique: "Natal", options: "—" }, blocks: [{ kind: "heading", level: 1, text: "Bölüm" }, { kind: "para", text: "Gövde." }], fileBase: "zz", hasInterpretation: false, hasChart: false } as Parameters<typeof renderAstroReportDocx>[0];
      const font = readFileSync(path.join(process.cwd(), "public", "fonts", "Geist-Regular.ttf")).toString("base64");
      const dx = await openDocx(await renderAstroReportDocx(rep, null, null, { branding: atA }));
      const px = await pdfInfo(Buffer.from(buildAstroReportPdf(rep, null, font, null, { branding: atA })));
      const want = ["ZZ_ANAMNEZ_A", PA.title, PA.organization, "a@example.invalid", PA.reportNote];
      ok(want.every((w) => dx.text.includes(w)) && want.every((w) => px.text.includes(sq(w))) && dx.media.some((m) => m.equals(logoA.data)) && px.images >= 1, "Atlas Word ↔ PDF: aynı çözücü çıktısıyla aynı alanlar + logo", { w: want.filter((w) => !dx.text.includes(w)), p: want.filter((w) => !px.text.includes(sq(w))), img: px.images });
    }

    section("E — logo silinmiş / bozuk / başka uzmanın → logosuz, rapor 200");
    const bucket = env.storage.objects.get("expert-workspace")!;
    const deskKey = [...bucket.keys()].find((k) => k.startsWith(`${seed.TA}/${U.A.id}/${LA}/`) && k.endsWith("desktop.webp"))!;
    const deskSaved = bucket.get(deskKey)!;
    bucket.set(deskKey, { ...deskSaved, bytes: Buffer.from("bozuk-gorsel") });
    const rCorrupt = await refTek(asA);
    const pCorrupt = await hacP(asA, FORM_NAME);
    ok(rCorrupt.status === 200 && (await openDocx(rCorrupt.buf!)).text.includes(PA.title) && !(await openDocx(rCorrupt.buf!)).media.some((m) => m.equals(logoA.data)) && pCorrupt.status === 200 && (await pdfInfo(pCorrupt.buf!)).images === 0, "bozuk görsel → Word + PDF 200, metin markalaması var, logo yok");
    bucket.delete(deskKey);
    ok((await takvim(asA)).status === 200, "depoda dosya yok → rapor 200");
    bucket.set(deskKey, deskSaved);
    await env.su.query(`update public.expert_profiles set logo_asset_id = $2, version = version + 1 where user_id = $1`, [U.A.id, LB]);
    const rForeign = await refAtlas(asA);
    const pForeign = await hacP(asA, FORM_NAME);
    ok(rForeign.status === 200 && !(await openDocx(rForeign.buf!)).media.some((m) => m.equals(logoB.data)) && (await pdfInfo(pForeign.buf!)).images === 0, "profilde başka uzmanın (B) logo uuid'si → B'nin logosu KULLANILMAZ (Word + PDF)");
    await env.su.query(`update public.expert_profiles set logo_asset_id = $2, version = version + 1 where user_id = $1`, [U.A.id, LA]);
    const LDEL = await upload(asA, await svgLogo(500, 250, "#1d4ed8"), "a-silinecek.png");
    await setLogo(asA, { source: "custom", assetId: LDEL });
    await env.su.query(`update public.expert_workspace_assets set deleted_at = now(), deleted_by = $2 where id = $1`, [LDEL, U.A.id]);
    const rDel = await refTek(asA);
    ok(rDel.status === 200 && (await openDocx(rDel.buf!)).media.length === (await openDocx(offs["refleks-protokol-tek"]!)).media.length, "logo silinmiş işaretli → logosuz rapor 200");
    await setLogo(asA, { source: "custom", assetId: LA });

    section("F — rota kablolaması (statik)");
    const src = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
    for (const p of ["app/api/refleksoloji/protocol-report/route.ts", "app/api/refleksoloji/atlas-report/route.ts", "app/api/kupa/protocols/[id]/word-report/route.ts", "app/api/kupa/calendar/plans/[id]/word-report/route.ts"]) {
      const s = src(p);
      const calls = s.match(/resolveReportBranding\([^;]*\);/g) ?? [];
      ok(calls.length === 1 && /\{ tenantId, userId: guard\.userId \}/.test(calls[0]!) && /fullName: expertDisplayName\(guard\.profile\)/.test(calls[0]!) && /purpose: "signature"/.test(calls[0]!) && /branding \}\)|branding\);|, branding \}/.test(s), `${p}: tek çağrı, oturum sahibi + oturum adı, purpose signature, kurucuya iletilir`, calls);
    }
    for (const p of ["app/api/hacamat/word-report/route.ts", "app/api/hacamat/pdf-report/route.ts"]) {
      const s = src(p);
      ok(/if \(!expertName\.trim\(\)\) return null;/.test(s) && /\{ tenantId: guard\.tenantId, userId: guard\.userId \}, \{ fullName: null \}, \{ purpose: "named-by-form" \}/.test(s) && /name: null \}/.test(s) && /fallbackName: expertName/.test(s), `${p}: yalnız form adı doluyken; purpose named-by-form; profil adı yok; ad formdan`);
    }
    for (const p of ["app/api/admin/astroloji/analyses/[id]/report/route.ts", "app/api/admin/astroloji/analyses/report/route.ts", "app/api/admin/astroloji/horary/western/report/route.ts", "app/api/admin/astroloji/horary/western/records/[id]/report/route.ts"]) {
      ok(/astroReportBrandingLoader\(gate\.ctx\)/.test(src(p)), `${p}: markalama yalnız kapı ctx'inden (gate.ctx)`);
    }
    ok(/purpose: "signature"/.test(src("lib/astrology/report/branding.ts")) && /loadFullName: \(\) => readAccountFullName\(ctx\.db, ctx\.userId\)/.test(src("lib/astrology/report/branding.ts")), "Atlas yükleyicisi: purpose signature + ad oturum sahibinin kaydından");
    ok(!/resolveReportBranding|astroReportBrandingLoader|loadBranding/.test(src("lib/archive/server/reports.ts")) && !/loadBranding|branding/.test(src("lib/campaign/visitor/reports/atlas.ts")), "arşiv yeniden üretimi ve kampanya (ziyaretçi) Atlas raporu markalamasız kalır (kapsam dışı)");

    section("G — tablo YOK (migration uygulanmamış prod)");
    await putProfile(asA, { reportBrandingEnabled: false });
    const offRef = { tek: (await refTek(asA)).buf!, takvim: (await takvim(asA)).buf!, hac: (await hacW(asA, FORM_NAME)).buf! };
    await env.su.query(`drop table public.expert_profiles cascade`);
    await env.su.query(`notify pgrst, 'reload schema'`).catch(() => undefined);
    ok((await resolveReportBranding(db, ownerA, { fullName: "x" }, { purpose: "signature" })) === null && (await astroReportBrandingLoader({ db, tenantId: seed.TA, userId: U.A.id })()) === null, "çözücü + Atlas yükleyicisi → null");
    const nt = { tek: await refTek(asA), takvim: await takvim(asA), hac: await hacW(asA, FORM_NAME), hacPdf: await hacP(asA, FORM_NAME), atlas: await refAtlas(asA) };
    save("rota-refleks-tablo-yok", nt.tek.buf);
    ok(Object.values(nt).every((r) => r.status === 200), "tablo yok → tüm Kademe B rotaları 200");
    ok(JSON.stringify(await normalizeKademeBDocx(nt.tek.buf!)) === JSON.stringify(await normalizeKademeBDocx(offRef.tek)) && JSON.stringify(await normalizeKademeBDocx(nt.takvim.buf!)) === JSON.stringify(await normalizeKademeBDocx(offRef.takvim)) && JSON.stringify(await normalizeKademeBDocx(nt.hac.buf!)) === JSON.stringify(await normalizeKademeBDocx(offRef.hac)), "tablo yok → anahtar kapalı çıktısıyla birebir (Refleksoloji / Kupa / Hacamat)");

    section("H — günlükler");
    ok(!logged.some((l) => l.includes(SENTINEL) || l.includes(U.A.id) || l.includes(seed.TA) || l.includes("a@example.invalid") || l.includes(FORM_NAME)), "günlüklerde profil metni / form adı / kullanıcı / tenant / e-posta yok");
  } finally {
    await env.stop();
  }

  console.log(`\n${failures.length ? `FAILURES:\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : ""}F3B rota entegrasyonu: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
