/**
 * F3A — Rapor markalaması ROTA + PG + ÇÖZÜCÜ entegrasyon harness'ı.
 *
 * Gerçek Next route handler'ları (Danışan Yolculuğu tekil + toplu Word, F1 profil, F2 logo, Kişisel Dijital Ofis
 * yükleme) + gerçek migration'lar (workspace 20271227/20271228 + expert_profiles 20280102 + client_charges) + yerel
 * embedded-postgres + PostgREST şimi + Storage emülatörü (scripts/anamnez/testEnv — yalnız içe aktarılır).
 * Production'a SIFIR temas (127.0.0.1); veriler sentetik (@example.test). Roxy / e-posta / ödeme YOK.
 *
 * Kapsam:
 *  A çözücü (resolveReportBranding): A / A2 (aynı tenant) / B (başka tenant) izolasyonu, anahtar kapalı → null,
 *    görünürlük bayrakları, purpose hd / hd-relation alan süzmesi, logo silinmiş / bozuk / başka uzmanın → logosuz
 *  B rota: A'nın raporu A'nın profil + logosunu kullanır, B'ninkini / A2'ninkini ASLA; anahtar kapalı ≡ profil yok ≡ markasız
 *  C toplu rapor: istek başına TEK profil okuması (fetch sayacı) + tek markalama
 *  D uç durumlar gerçek rota yolundan (DOCX'ler --out klasörüne; Word render ayrıca)
 *  E demo hesap: rapor üretimi değişmez (200)
 *  F rota kablolaması (statik): Kademe A rotalarının tamamı merkezi çözücüyü oturum sahibiyle çağırır; HD kuralları
 *  G tablo YOK (migration uygulanmamış): rapor 200 + anahtar kapalı çıktısıyla birebir (normalize parça)
 *  H günlüklerde profil içeriği / kimlik yok
 *  P performans: markalı / markasız rota süresi (ms) — çıktı JSON
 *
 * Çalıştır: npx tsx scripts/expert-branding/routes.harness.ts [--out <klasör>]
 */
import Module from "node:module";
import net from "node:net";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import JSZip from "jszip";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { SERVICE_KEY, ANON_KEY, seedAnamnez, startAnamnezTestEnv, type Seed, type TestEnv } from "../anamnez/testEnv";
import { normalizeDocx } from "./normalizeDocx";

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
const PROFILE_MIG = readMig("20280102000000_expert_profiles.sql");
const MIGS = [readMig("20271227000000_expert_workspace_designs_prefs.sql"), readMig("20271228000000_expert_workspace_assets_access.sql"), PROFILE_MIG];
// Danışan Yolculuğu rapor gövdesinin okuduğu tablolar (sentetik test şeması; scripts/wt7/dyTestEnv ile aynı kolonlar).
const DY_DDL = `
alter table public.clients add column if not exists updated_at timestamptz default now();
alter table public.client_notes add column if not exists updated_at timestamptz default now();
create table if not exists public.appointments (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid references public.clients(id) on delete cascade,
  title text, notes text, appointment_date timestamptz, status text, created_at timestamptz default now());
create table if not exists public.client_stones (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null references public.clients(id) on delete cascade,
  stone_name text, stone_type text, stone_date date, created_at timestamptz default now());
create table if not exists public.client_sessions (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null references public.clients(id) on delete cascade,
  session_date date, session_type text, duration_minutes int, fee numeric, session_note text, created_at timestamptz default now());
create table if not exists public.client_homeworks (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null references public.clients(id) on delete cascade,
  title text, homework_type text, description text, start_date date, end_date date, status text,
  expert_note text, client_feedback text, alert_dismissed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.client_analyses (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null references public.clients(id) on delete cascade,
  analysis_type text, analysis_data jsonb, note text, image_url text, created_at timestamptz default now());
`;
const SENTINEL = "ZZSENTINELPII";

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

// Supabase istemcisinin PostgREST çağrılarını say (istek başına tek profil okuması kanıtı).
const fetchLog: string[] = [];
{
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    fetchLog.push(url);
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`harness: dış ağ yasak: ${url}`);
    return origFetch(input, init);
  }) as typeof fetch;
}
const profileReads = () => fetchLog.filter((u) => u.includes("/rest/v1/expert_profiles")).length;

type Docx = { buf: Buffer; doc: string; footer: string; all: string; media: Buffer[] };
async function openDocx(buf: Buffer): Promise<Docx> {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((f) => !zip.files[f]!.dir);
  const doc = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const footers = await Promise.all(names.filter((f) => /^word\/footer\d*\.xml$/.test(f)).map((f) => zip.file(f)!.async("string")));
  const media = await Promise.all(names.filter((f) => f.startsWith("word/media/")).map((f) => zip.file(f)!.async("nodebuffer")));
  const parts = await Promise.all(names.filter((f) => f.endsWith(".xml")).map((f) => zip.file(f)!.async("string")));
  return { buf, doc, footer: footers.join("\n"), all: parts.join("\n"), media };
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const has = (d: Docx, s: string) => d.all.includes(esc(s));

async function main(): Promise<void> {
  const env: TestEnv = await startAnamnezTestEnv({ port: await freePort(), dirName: "expert-branding-routes-pgdata", extraSql: [...MIGS, DY_DDL, readMig("20260924062228_client_charges.sql"), readMig("20271011000000_client_charges_payment_status.sql")] });
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
  // Demo vitrini prod'daki gibi KENDİ tenant'ında (aynı tenant'taki uzmanlar demo kısıtına takılmaz) + kendi danışanı.
  const TD = randomUUID();
  await env.su.query(`insert into public.tenants(id, name) values ($1,'ZZ_BRANDING_DEMO_TENANT')`, [TD]);
  await env.su.query(`update public.users set tenant_id=$1 where id=$2`, [TD, seed.users.DEMO.id]);
  const demoClient = randomUUID();
  await env.su.query(`insert into public.clients(id, tenant_id, ad, soyad) values ($1,$2,'ZZ Demo','DANIŞAN')`, [demoClient, TD]);
  console.log(`embedded-postgres + PostgREST şimi + Storage emülatörü hazır (${env.url}).`);
  const perf: Record<string, number[]> = {};

  try {
    const profileRoute = await import("../../app/api/settings/profile/route");
    const logoRoute = await import("../../app/api/settings/profile/logo/route");
    const startRoute = await import("../../app/api/settings/workspace/assets/uploads/route");
    const chunkRoute = await import("../../app/api/settings/workspace/assets/uploads/[uploadId]/chunks/[index]/route");
    const completeRoute = await import("../../app/api/settings/workspace/assets/uploads/[uploadId]/complete/route");
    const wordRoute = await import("../../app/api/clients/[id]/word-report/route");
    const bulkRoute = await import("../../app/api/clients/word-report-bulk/route");
    const { resolveReportBranding } = await import("../../lib/profile/reportBranding");
    const { resolveReportLogo } = await import("../../lib/profile/reportLogo");
    const U = seed.users;
    const asA: Auth = { id: U.A.id, token: U.A.token };
    const asA2: Auth = { id: U.A2.id, token: U.A2.token };
    const asB: Auth = { id: U.B.id, token: U.B.token };
    const asDemo: Auth = { id: U.DEMO.id, token: U.DEMO.token };
    const ownerA = { tenantId: seed.TA, userId: U.A.id };
    const ownerA2 = { tenantId: seed.TA, userId: U.A2.id };
    const ownerB = { tenantId: seed.TB, userId: U.B.id };
    const db: SupabaseClient = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    async function call(handler: unknown, method: string, auth: Auth, opts: { body?: unknown; raw?: Uint8Array; params?: Record<string, string> } = {}): Promise<{ status: number; json: Json; buf: Buffer | null }> {
      const headers: Record<string, string> = {};
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      let body: BodyInit | undefined;
      if (opts.raw) { headers["content-type"] = "application/octet-stream"; headers["content-length"] = String(opts.raw.length); body = Buffer.from(opts.raw); }
      else if (opts.body !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(opts.body); }
      const req = new NextRequest("http://localhost/api/test", { method, headers, body });
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
      const r = await call(logoRoute.PUT, "PUT", a, { body: { ...body, expectedVersion: await version(a) } });
      return r.status;
    }
    const tab = (a: Auth, client = seed.clients.a1) => call(wordRoute.POST, "POST", a, { body: { exportMode: "tab", tabName: "genel" }, params: { id: client } });
    const bulk = (a: Auth) => call(bulkRoute.POST, "POST", a, { body: { exportMode: "selected", clientIds: [seed.clients.a1, seed.clients.a2] } });
    const save = (name: string, buf: Buffer | null) => { if (OUT && buf) writeFileSync(path.join(OUT, `${name}.docx`), buf); };
    const svgLogo = (w: number, h: number, fill: string) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${h / 5}" fill="${fill}"/><circle cx="${h / 2}" cy="${h / 2}" r="${h / 3}" fill="#ffffff"/></svg>`)).png().toBuffer();

    section("Hazırlık: sentetik profiller + logolar (gerçek F1/F2 rotalarıyla)");
    const LA = await upload(asA, await svgLogo(1200, 300, "#0f766e"), "a-yatay.png");
    const LA2 = await upload(asA2, await svgLogo(400, 400, "#7c3aed"), "a2-kare.png");
    const LB = await upload(asB, await svgLogo(600, 200, "#b91c1c"), "b.png");
    const PA = { title: `Refleksoloji Uzmanı ${SENTINEL}A`, organization: "Ayşe Yılmaz Yaşam Merkezi", phone: "0532 000 00 01", contactEmail: "a@example.invalid", website: "https://ornek-a.example", reportNote: `A dipnotu ${SENTINEL}`,
      reportBrandingEnabled: true, reportShowTitle: true, reportShowOrganization: true, reportShowContact: true, reportShowNote: true };
    const PA2 = { title: "A2 Unvanı Beslenme Danışmanı", organization: "A2 Kurumu", reportBrandingEnabled: true, reportShowTitle: true, reportShowOrganization: true };
    const PB = { title: "B UNVANI GİZLİ", organization: "B KURUMU GİZLİ", phone: "0532 999 99 99", reportNote: "B DİPNOTU GİZLİ", reportBrandingEnabled: true, reportShowTitle: true, reportShowOrganization: true, reportShowContact: true, reportShowNote: true };
    await putProfile(asA, PA);
    await putProfile(asA2, PA2);
    await putProfile(asB, PB);
    ok((await setLogo(asA, { source: "custom", assetId: LA })) === 200 && (await setLogo(asA2, { source: "custom", assetId: LA2 })) === 200 && (await setLogo(asB, { source: "custom", assetId: LB })) === 200, "A / A2 / B profilleri + özel logoları kaydedildi");
    const logoA = await resolveReportLogo(db, ownerA);
    const logoA2 = await resolveReportLogo(db, ownerA2);
    const logoB = await resolveReportLogo(db, ownerB);
    ok(!!logoA && !!logoA2 && !!logoB && !logoA.data.equals(logoB.data), "F2 çözücüsü üç farklı PNG üretir");

    section("A — merkezi çözücü (resolveReportBranding)");
    const bA = await resolveReportBranding(db, ownerA, { fullName: "ZZ_ANAMNEZ_A" });
    ok(!!bA && bA.name === "ZZ_ANAMNEZ_A" && bA.title === PA.title && bA.organization === PA.organization && bA.contactLine === "0532 000 00 01 · a@example.invalid · https://ornek-a.example" && bA.note === PA.reportNote && !!bA.logoPng?.data.equals(logoA!.data), "A: tüm görünür alanlar + A logosu", bA && { ...bA, logoPng: !!bA.logoPng });
    const bA2 = await resolveReportBranding(db, ownerA2, { fullName: "ZZ_ANAMNEZ_A2" });
    ok(!!bA2 && bA2.title === PA2.title && !bA2.contactLine && !bA2.note && !!bA2.logoPng?.data.equals(logoA2!.data), "A2 (aynı tenant): yalnız kendi alanları + kendi logosu");
    const bHd = await resolveReportBranding(db, ownerA, { fullName: "ZZ_ANAMNEZ_A" }, { purpose: "hd" });
    ok(!!bHd && !bHd.name && !bHd.contactLine && !bHd.note && bHd.title === PA.title && !!bHd.logoPng, "purpose hd: ad / iletişim / dipnot YOK; unvan + kurum + logo");
    const bRel = await resolveReportBranding(db, ownerA, { fullName: "ZZ_ANAMNEZ_A" }, { purpose: "hd-relation" });
    ok(!!bRel && !bRel.name && !bRel.contactLine && !bRel.note && !bRel.logoPng && bRel.organization === PA.organization, "purpose hd-relation: yalnız unvan + kurum (logo yok)");
    ok((await resolveReportBranding(db, { tenantId: seed.TB, userId: U.A.id }, { fullName: "x" })) === null, "yanlış tenant + A kullanıcısı → null (satır yok, profil sızmaz)");
    ok((await resolveReportBranding(db, { tenantId: "", userId: "" }, { fullName: "x" })) === null, "boş sahip → null");

    section("B — rota: A'nın raporu A'nın profilini kullanır, B'ninkini / A2'ninkini ASLA");
    const rA = await tab(asA);
    ok(rA.status === 200 && !!rA.buf, "A: Danışan Yolculuğu Word (sekme) 200", rA.json);
    const dA = await openDocx(rA.buf!);
    save("rota-dy-A-markali", rA.buf);
    ok(has(dA, PA.title) && has(dA, PA.organization) && has(dA, "a@example.invalid") && has(dA, PA.reportNote), "A raporu: unvan + kurum + iletişim + dipnot");
    ok(dA.media.some((m) => m.equals(logoA!.data)), "A raporu: A'nın logosu (bayt-bayt)");
    ok(!["B UNVANI GİZLİ", "B KURUMU GİZLİ", "B DİPNOTU GİZLİ", "0532 999 99 99", PA2.title, PA2.organization].some((s) => has(dA, s)) && !dA.media.some((m) => m.equals(logoB!.data) || m.equals(logoA2!.data)), "A raporunda B / A2 bilgisi ve logosu YOK");
    ok(dA.doc.includes("Bilgilendirme") && dA.doc.includes(esc("tıbbi tanı veya tedavinin yerine geçmez")), "yasal bilgilendirme metni korunur");
    ok(dA.footer.includes(esc(PA.organization)) && dA.footer.includes("tıbbi tanı/tedavi yerine geçmez"), "alt bilgi: kurum satırı + kısa bilgilendirme notu birlikte");
    const rA2 = await tab(asA2);
    const dA2 = await openDocx(rA2.buf!);
    ok(rA2.status === 200 && has(dA2, PA2.title) && !has(dA2, PA.title) && dA2.media.some((m) => m.equals(logoA2!.data)) && !dA2.media.some((m) => m.equals(logoA!.data)), "A2 (aynı tenant, aynı danışan): A2'nin profili + logosu; A'nınki yok");
    const rB = await tab(asB, seed.clients.b1);
    const dB = await openDocx(rB.buf!);
    ok(rB.status === 200 && has(dB, "B UNVANI GİZLİ") && !has(dB, PA.title) && !dB.media.some((m) => m.equals(logoA!.data)), "B (başka tenant): kendi profili; A'nınki yok");
    ok((await tab(asB, seed.clients.a1)).status === 404, "B, A tenant'ının danışanının raporunu alamaz (mevcut koruma) → 404");

    section("Anahtar kapalı ≡ profil yok ≡ markasız (normalize parça eşitliği)");
    await putProfile(asA, { reportBrandingEnabled: false });
    const rOff = await tab(asA);
    const dOff = await openDocx(rOff.buf!);
    save("rota-dy-A-anahtar-kapali", rOff.buf);
    ok(rOff.status === 200 && !has(dOff, PA.title) && !has(dOff, PA.organization) && !dOff.media.some((m) => m.equals(logoA!.data)) && dOff.doc.includes("Hazırlayan: ZZ_ANAMNEZ_A"), "anahtar kapalı: profil bilgisi / logo yok; eski 'Hazırlayan' satırı aynen");
    const saved = (await env.su.query(`select * from public.expert_profiles where user_id=$1`, [U.A.id])).rows[0];
    await env.su.query(`delete from public.expert_profiles where user_id=$1`, [U.A.id]);
    const rNone = await tab(asA);
    ok(JSON.stringify(await normalizeDocx(rNone.buf!)) === JSON.stringify(await normalizeDocx(rOff.buf!)), "profil satırı YOK → anahtar kapalı çıktısıyla birebir");
    const cols = Object.keys(saved);
    await env.su.query(`insert into public.expert_profiles(${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map((c) => saved[c]));
    await putProfile(asA, { reportBrandingEnabled: true });

    section("Görünürlük bayrakları süzülür");
    await putProfile(asA, { reportShowOrganization: false, reportShowContact: false });
    const dFlag = await openDocx((await tab(asA)).buf!);
    ok(has(dFlag, PA.title) && !has(dFlag, PA.organization) && !has(dFlag, "a@example.invalid") && has(dFlag, PA.reportNote), "kurum + iletişim kapalı → raporda yok; unvan + dipnot var");
    await putProfile(asA, { reportShowOrganization: true, reportShowContact: true });

    section("Logo: silinmiş / bozuk / başka uzmanın → logosuz, çökme yok");
    const bucket = env.storage.objects.get("expert-workspace")!;
    const deskKey = [...bucket.keys()].find((k) => k.startsWith(`${seed.TA}/${U.A.id}/${LA}/`) && k.endsWith("desktop.webp"))!;
    const deskSaved = bucket.get(deskKey)!;
    bucket.set(deskKey, { ...deskSaved, bytes: Buffer.from("bozuk-gorsel") });
    const rCorrupt = await tab(asA);
    const dCorrupt = await openDocx(rCorrupt.buf!);
    save("rota-dy-A-bozuk-logo", rCorrupt.buf);
    ok(rCorrupt.status === 200 && has(dCorrupt, PA.title) && !dCorrupt.media.some((m) => m.equals(logoA!.data)), "bozuk görsel → rapor 200, metin markalaması var, uzman logosu yok");
    bucket.delete(deskKey);
    const rMissing = await tab(asA);
    ok(rMissing.status === 200 && !(await openDocx(rMissing.buf!)).media.some((m) => m.equals(logoA!.data)), "depoda dosya yok → logosuz rapor 200");
    bucket.set(deskKey, deskSaved);
    // Silinmiş: ayrı bir logo seçilip (yarış / eski veri senaryosu) DB'de silinmiş işaretlenir; sonra A'nın logosuna dönülür.
    const LDEL = await upload(asA, await svgLogo(500, 250, "#1d4ed8"), "a-silinecek.png");
    await setLogo(asA, { source: "custom", assetId: LDEL });
    const logoDel = await resolveReportLogo(db, ownerA);
    await env.su.query(`update public.expert_workspace_assets set deleted_at = now(), deleted_by = $2 where id = $1`, [LDEL, U.A.id]);
    const rDel = await tab(asA);
    save("rota-dy-A-logo-silinmis", rDel.buf);
    const dDel = await openDocx(rDel.buf!);
    ok(!!logoDel && rDel.status === 200 && !dDel.media.some((m) => m.equals(logoDel.data) || m.equals(logoA!.data)) && has(dDel, PA.title), "logo silinmiş işaretli → logosuz rapor 200 (metin markalaması sürer)");
    await setLogo(asA, { source: "custom", assetId: LA });
    await env.su.query(`update public.expert_profiles set logo_asset_id = $2, version = version + 1 where user_id = $1`, [U.A.id, LB]);
    const rForeign = await tab(asA);
    const dForeign = await openDocx(rForeign.buf!);
    save("rota-dy-A-baska-uzmanin-logosu", rForeign.buf);
    ok(rForeign.status === 200 && !dForeign.media.some((m) => m.equals(logoB!.data)) && !dForeign.media.some((m) => m.equals(logoA!.data)), "profilde başka uzmanın (B) logo uuid'si → B'nin logosu KULLANILMAZ, logosuz");
    await env.su.query(`update public.expert_profiles set logo_asset_id = $2, version = version + 1 where user_id = $1`, [U.A.id, LA]);

    section("C — toplu rapor: istek başına tek okuma");
    const before = profileReads();
    const rBulk = await bulk(asA);
    const reads = profileReads() - before;
    save("rota-dy-toplu-A-markali", rBulk.buf);
    ok(rBulk.status === 200 && !!rBulk.buf, "toplu Word 200", rBulk.json);
    const dBulk = await openDocx(rBulk.buf!);
    ok(reads === 1, "2 danışanlı toplu raporda expert_profiles TEK kez okunur", reads);
    ok(has(dBulk, PA.title) && dBulk.media.some((m) => m.equals(logoA!.data)) && !has(dBulk, "B UNVANI GİZLİ"), "toplu rapor: A markalaması, B yok");

    section("D — uç durumlar (gerçek rota yolu)");
    const edge: [string, Json][] = [
      ["yalniz-unvan", { title: "Refleksoloji Uzmanı", organization: "", phone: "", contactEmail: "", website: "", reportNote: "" }],
      ["yalniz-kurum", { title: "", organization: "Ayşe Yılmaz Yaşam Merkezi", phone: "", contactEmail: "", website: "", reportNote: "" }],
      ["uzun-kurum", { ...PA, organization: "Ayşe Yılmaz Bütüncül Sağlık Refleksoloji Aromaterapi ve Kişisel Gelişim Danışmanlık Merkezi Ltd. Şti. Kadıköy Şb." }],
      ["turkce-unvan", { ...PA, title: "Uzm. Psikolojik Danışman · Çocuk ve Ergen Gelişimi (İĞÜŞÖÇ ığüşöç)" }],
      ["uzun-dipnot", { ...PA, reportNote: "Birinci satır: önerileri kademeli uygulayınız.\nİkinci satır: rahatsızlıkta ara veriniz.\nÜçüncü satır: sorularınız için yazılı ulaşabilirsiniz.\nDördüncü satır: Şükran ve sevgiyle — ığüşöç ĞÜŞİÖÇ." }],
      // F1 HTML etiketlerini girişte reddeder (aşağıda kanıtlanır); izinli özel karakterler rapora kaçışlı düz metin olarak gider.
      ["ozel-karakter", { ...PA, title: "Uzman & \"Danışman\" — 5 < 7 > 3 🌿", organization: "A&B 'Şifa' Merkezi 🌸" }],
    ];
    for (const [name, patch] of edge) {
      const st = await putProfile(asA, { ...patch, reportBrandingEnabled: true });
      const r = await tab(asA);
      const d = await openDocx(r.buf!);
      save(`rota-dy-uc-${name}`, r.buf);
      const t = typeof patch.title === "string" && patch.title ? patch.title : null;
      const o = typeof patch.organization === "string" && patch.organization ? patch.organization : null;
      ok(st === 200 && r.status === 200 && (!t || has(d, t.replace(/\s+/g, " "))) && (!o || has(d, o)) && !/<script>/.test(d.all) && d.doc.includes("Bilgilendirme"), `uç durum ${name}: 200, alanlar yerinde, kaçışlı, bilgilendirme korunur`);
    }
    const html = await call(profileRoute.PUT, "PUT", asA, { body: { expectedVersion: await version(asA), profile: { title: "<script>alert(1)</script>" } } });
    ok(html.status === 400, "<script> içeren unvan F1 girişinde reddedilir (rapora hiç ulaşmaz; çizim katmanı ayrıca kaçışlar)", html.status);
    await setLogo(asA, { source: "none" });
    const rNoLogo = await tab(asA);
    save("rota-dy-uc-logo-yok", rNoLogo.buf);
    ok(rNoLogo.status === 200 && !(await openDocx(rNoLogo.buf!)).media.some((m) => m.equals(logoA!.data)), "logo kullanma (none) → logosuz");
    await putProfile(asA, PA);
    await setLogo(asA, { source: "custom", assetId: LA });

    section("D2 — diğer Kademe A kurucuları, GERÇEK çözücü çıktısıyla (A profili + A logosu)");
    {
      const { allReportCases } = await import("./reportCases");
      const PC = { ...PA, title: "Refleksoloji Uzmanı", phone: "+90 500 000 00 00", reportNote: "Bu rapor, seans sürecinizi desteklemek amacıyla hazırlanmıştır. Sorularınız için yazılı olarak ulaşabilirsiniz." };
      await putProfile(asA, PC);
      const std = await resolveReportBranding(db, ownerA, { fullName: "Ayşe Yılmaz" });
      const hdB = await resolveReportBranding(db, ownerA, { fullName: null }, { purpose: "hd" });
      const relB = await resolveReportBranding(db, ownerA, { fullName: null }, { purpose: "hd-relation" });
      for (const c of await allReportCases()) {
        if (!["nkb-tek", "klasik-kisi-tam", "hd-pro1-hazirlayan", "hd-iliski-hazirlayan", "beslenme-plan", "dy-tam"].includes(c.name)) continue;
        const b = c.name.startsWith("hd-iliski") ? relB : c.name.startsWith("hd-") ? hdB : std;
        const buf = await c.render({ branding: b });
        const off = await c.render({ branding: null });
        save(`cozucu-${c.name}-markali`, buf);
        save(`cozucu-${c.name}-markasiz`, off);
        const d = await openDocx(buf);
        const isHd = c.name.startsWith("hd-");
        ok(has(d, PC.title) && has(d, PC.organization) && (isHd ? !has(d, "a@example.invalid") && !has(d, PC.reportNote) : has(d, "a@example.invalid") && has(d, PC.reportNote))
          && (c.name.startsWith("hd-iliski") ? !d.media.some((m) => m.equals(logoA!.data)) : d.media.some((m) => m.equals(logoA!.data))),
        `${c.name}: çözücü çıktısıyla doğru alanlar (HD: iletişim/dipnot yok; ilişki: logo yok)`);
      }
      await putProfile(asA, PA);
    }

    section("E — demo hesap: rapor üretimi değişmez");
    const rDemo = await tab(asDemo, demoClient);
    ok(rDemo.status === 200 && !!rDemo.buf, "demo hesap Word 200 (salt-okunur çıktı; profili yok → markasız)", rDemo.status);

    section("P — performans (ms; markalı / markasız; logo dönüşümü dahil)");
    const time = async (key: string, fn: () => Promise<unknown>) => { const t = performance.now(); await fn(); (perf[key] ??= []).push(Math.round(performance.now() - t)); };
    for (let i = 0; i < 5; i++) await time("dy-sekme-markali", () => tab(asA));
    for (let i = 0; i < 5; i++) await time("cozucu-standard", () => resolveReportBranding(db, ownerA, { fullName: "x" }));
    for (let i = 0; i < 3; i++) await time("dy-toplu-markali", () => bulk(asA));
    await putProfile(asA, { reportBrandingEnabled: false });
    for (let i = 0; i < 5; i++) await time("dy-sekme-markasiz", () => tab(asA));
    for (let i = 0; i < 5; i++) await time("cozucu-anahtar-kapali", () => resolveReportBranding(db, ownerA, { fullName: "x" }));
    for (let i = 0; i < 3; i++) await time("dy-toplu-markasiz", () => bulk(asA));
    console.log(JSON.stringify(perf));
    if (OUT) writeFileSync(path.join(OUT, "performans.json"), JSON.stringify(perf, null, 1));
    ok(Object.values(perf).every((v) => v.length > 0), "performans ölçümleri alındı");

    section("F — rota kablolaması (statik)");
    const src = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
    const std = ["app/api/clients/[id]/word-report/route.ts", "app/api/clients/word-report-bulk/route.ts", "app/api/numeroloji/word-report/route.ts", "app/api/numeroloji-klasik/rapor/route.ts", "app/api/beslenme/plans/[id]/word/route.ts"];
    for (const p of std) {
      const s = src(p);
      const calls = s.match(/resolveReportBranding\([^)]*\)/g) ?? [];
      ok(calls.length === 1 && /userId(: guard\.userId|\b)/.test(calls[0]!) && /fullName: expertDisplayName\(guard\.profile\)/.test(s) && !/branding: null/.test(s) && !/req\.json\(\)[^;]*tenantId/.test(s), `${p}: tek merkezi çağrı, oturum sahibi + oturum adı`, calls);
    }
    const hd = src("app/api/hd/reports/professional/download/route.ts");
    ok(/layout === "pro-1" && view\.snapshot\.preparedBy\?\.trim\(\)/.test(hd) && /purpose: "hd" \}/.test(hd) && /fullName: null/.test(hd) && /expertName: null/.test(hd), "HD pro-1: yalnız pro-1 + preparedBy doluysa; purpose hd; profil adı yok");
    const rel = src("app/api/hd/relations/reports/[reportId]/download/route.ts");
    ok(/s\.preparedBy\?\.trim\(\)/.test(rel) && /purpose: "hd-relation"/.test(rel) && /fullName: null/.test(rel), "HD ilişki: yalnız preparedBy doluysa; purpose hd-relation (logosuz)");
    ok(!/resolveReportBranding/.test(src("lib/archive/server/reports.ts")), "arşiv yeniden üretimi markalamasız kalır (owner kararı bekliyor)");
    ok(!/fetch\(|createClient\(/.test(src("lib/profile/reportBranding.ts")), "merkezi çözücü yalnız verilen db'yi kullanır (yeni istemci / ağ yok)");

    section("G — tablo YOK (migration uygulanmamış prod)");
    await putProfile(asA, { reportBrandingEnabled: false });
    const offRef = await tab(asA);
    await env.su.query(`drop table public.expert_profiles cascade`);
    await env.su.query(`notify pgrst, 'reload schema'`).catch(() => undefined);
    ok((await resolveReportBranding(db, ownerA, { fullName: "x" })) === null, "çözücü → null");
    const rNoTable = await tab(asA);
    save("rota-dy-tablo-yok", rNoTable.buf);
    ok(rNoTable.status === 200 && JSON.stringify(await normalizeDocx(rNoTable.buf!)) === JSON.stringify(await normalizeDocx(offRef.buf!)), "tablo yok → rapor 200 ve anahtar kapalı çıktısıyla birebir");
    const rBulkNoTable = await bulk(asA);
    ok(rBulkNoTable.status === 200, "tablo yok → toplu rapor 200");

    section("H — günlükler");
    ok(!logged.some((l) => l.includes(SENTINEL) || l.includes(U.A.id) || l.includes(seed.TA) || l.includes("a@example.invalid")), "günlüklerde profil metni / kullanıcı / tenant / e-posta yok");
  } finally {
    await env.stop();
  }

  console.log(`\n${failures.length ? `FAILURES:\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : ""}F3A rota entegrasyonu: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
