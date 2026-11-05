/**
 * B5 (05.11 canlı denetim) — Danışan → Doğaltaş Önerileri → Taşlar Word'ü kayıtlı kombinasyonları içerir.
 * GERÇEK route (POST /api/clients/[id]/word-report, exportMode=tab, tabName=taslar) + embedded-postgres +
 * PostgREST uyumlu kabuk. Üretilen .docx AÇILIR ve word/document.xml metni doğrulanır. Prod'a SIFIR temas.
 *  - Kombinasyon adı, taşları, amaç, not, mineral özeti, uyarı/stok özeti rapora girer.
 *  - Taş kayıtları aynen korunur (önce taşlar, sonra kombinasyonlar).
 *  - Kombinasyonu olmayan danışan: rapor eskisi gibi (kombinasyon bölümü yok).
 *  - Yalnız kombinasyonu olan danışan: artık boş-rapor uyarısı değil, Word üretilir.
 *  - Başka danışanın / başka kiracının kombinasyonu rapora karışmaz; kayıtlar değişmez.
 * Çalıştır: npx tsx scripts/dogaltas-satis-oncesi/b5-danisan-word-kombinasyon.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import { startBioTestEnv, SERVICE_KEY, ANON_KEY } from "../bioenergy-presale-final/bioTestEnv";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (c: boolean, l: string, x?: unknown) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${x !== undefined ? ` → ${JSON.stringify(x).slice(0, 500)}` : ""}`); } };

const DDL = `
create table public.clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, ad text, soyad text, created_at timestamptz default now());
create table public.client_notes (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, notlar text, created_at timestamptz default now());
create table public.client_stones (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, stone_name text, stone_type text, note text,
  usage_area text, combination_text text, warning_text text, other_notes text, stone_date date, created_at timestamptz default now());
create table public.client_stone_photos (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, stone_id uuid, file_path text, created_at timestamptz default now());
create table public.client_combinations (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  name text, description text, note text, stones_text text, notes_text text, notes_text_2 text, created_at timestamptz default now(), updated_at timestamptz);
create table public.appointments (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, title text, notes text, appointment_date timestamptz, status text, created_at timestamptz default now());
create table public.client_sessions (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, session_date date, session_type text, session_note text, created_at timestamptz default now());
create table public.client_homeworks (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, title text, created_at timestamptz default now());
create table public.client_analyses (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, analysis_type text, analysis_data jsonb, note text, image_url text, created_at timestamptz default now());
create table public.client_charges (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, charge_date date, amount numeric, created_at timestamptz default now());
grant select, insert, update, delete on public.clients, public.client_notes, public.client_stones, public.client_stone_photos, public.client_combinations,
  public.appointments, public.client_sessions, public.client_homeworks, public.client_analyses, public.client_charges to service_role;`;

/** .docx → düz metin (w:t birleştirilir; paragraflar satır). */
async function docText(buf: Buffer): Promise<{ text: string; xmlHash: string }> {
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const text = xml.replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return { text, xmlHash: createHash("md5").update(xml).digest("hex").slice(0, 12) };
}

async function main() {
  const env = await startBioTestEnv({ port: Number(process.env.B5_PG_PORT ?? 54751), dirName: `zz-b5-${Date.now()}` });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    await su.query(DDL);
    const mk = async (tenant: string, label: string) => {
      const id = randomUUID(), token = `zz-b5-${label}-${randomUUID()}`;
      await su.query(`insert into public.tenants(id,name) values ($1,$2) on conflict do nothing`, [tenant, `ZZ_${label}`]);
      await su.query(`insert into public.users(id,email,full_name,role,active,approval_status,module_permissions,package_type,plan,tenant_id,membership_status)
        values ($1,$2,$3,'expert',true,'approved','{"clients":true,"stones":true}','premium','premium',$4,'active')`, [id, `zz.b5.${label}@example.test`, `ZZ Uzman ${label}`, tenant]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const T1 = randomUUID(), T2 = randomUUID();
    const U1 = await mk(T1, "u1"), U2 = await mk(T2, "u2");
    const client = async (t: string, name: string) => { const [ad, ...rest] = name.split(" "); return String((await su.query(`insert into public.clients(tenant_id,ad,soyad) values ($1,$2,$3) returning id`, [t, ad, rest.join(" ")])).rows[0].id); };
    const C1 = await client(T1, "ZZ Danışan Bir");     // taş + kombinasyon
    const C2 = await client(T1, "ZZ Danışan İki");     // aynı uzman, başka danışan (yalnız kombinasyon)
    const C3 = await client(T1, "ZZ Danışan Üç");      // yalnız taş (kombinasyon yok)
    const C4 = await client(T1, "ZZ Danışan Dört");    // hiç kayıt yok
    const C5 = await client(T2, "ZZ Başka Kiracı");    // başka kiracı
    const stone = (t: string, c: string, n: string, extra: Record<string, string> = {}) => su.query(
      `insert into public.client_stones(tenant_id,client_id,stone_name,stone_type,usage_area,combination_text,warning_text,note,stone_date) values ($1,$2,$3,$4,$5,$6,$7,$8,'2026-10-20')`,
      [t, c, n, extra.type ?? "Kolye", extra.usage ?? "Günlük kullanım", extra.combo ?? null, extra.warn ?? null, extra.note ?? null]);
    await stone(T1, C1, "ZZ AMETİST", { combo: "ZZ kombin metni", warn: "ZZ taş uyarısı", note: "ZZ taş notu" });
    await stone(T1, C1, "ZZ AKİK");
    await stone(T1, C3, "ZZ KUVARS");
    const combo = async (t: string, c: string, name: string, stones: string, extra: Record<string, string | null> = {}) => String((await su.query(
      `insert into public.client_combinations(tenant_id,client_id,name,description,note,stones_text,notes_text,notes_text_2,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [t, c, name, extra.desc ?? null, extra.note ?? null, stones, extra.n1 ?? null, extra.n2 ?? null, extra.at ?? "2026-11-01T10:00:00Z"])).rows[0].id);
    await combo(T1, C1, "ZZ Uyku Kombinasyonu", "AMETİST, LEPİDOLİT, AKİK", {
      desc: "ZZ uyku amacı", note: "ZZ kombinasyon notu",
      n1: "Arama Koşulları:\n- Mineral: Lityum ≥ %1\n\nKarşılanan: Mineral: Lityum\nEksik: —", n2: "Stok: 2/3 stokta\nUyarılı taşlar: LEPİDOLİT", at: "2026-11-02T10:00:00Z" });
    await combo(T1, C1, "ZZ Odak Kombinasyonu", "FLORİT, PİRİT", { at: "2026-11-01T10:00:00Z" });
    await combo(T1, C2, "ZZ C2 GİZLİ KOMBİ", "GİZLİ TAŞ İKİ", { desc: "C2 amacı" });
    await combo(T2, C1, "ZZ T2 GİZLİ KOMBİ", "GİZLİ TAŞ T2");   // başka kiracı ama C1 kimliği
    await combo(T2, C5, "ZZ T2 C5 KOMBİ", "GİZLİ TAŞ C5");
    const snapshot = async () => JSON.stringify((await su.query(`select * from public.client_combinations order by id`)).rows)
      + JSON.stringify((await su.query(`select * from public.client_stones order by id`)).rows);
    const before = await snapshot();

    const route = await import("../../app/api/clients/[id]/word-report/route");
    const word = async (who: { id: string; token: string }, clientId: string) => {
      const res = await route.POST(new NextRequest("http://localhost/api/test", {
        method: "POST", headers: { "x-user-id": who.id, "x-session-token": who.token, "content-type": "application/json" },
        body: JSON.stringify({ exportMode: "tab", tabName: "taslar" }),
      }), { params: Promise.resolve({ id: clientId }) });
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("officedocument")) return { status: res.status, json: await res.json().catch(() => null), text: "", hash: "", filename: "" };
      const buf = Buffer.from(await res.arrayBuffer());
      const { text, xmlHash } = await docText(buf);
      const filename = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "";
      return { status: res.status, json: null, text, hash: xmlHash, filename, size: buf.length };
    };
    const idx = (t: string, s: string) => t.indexOf(s);

    console.log("\n[B5 — kombinasyonlar Word'de]");
    const w1 = await word(U1, C1);
    ok(w1.status === 200 && w1.text.length > 0, "C1: Word üretildi ve açıldı (docx)", { status: w1.status, json: w1.json });
    ok(w1.text.includes("Kayıtlı Kombinasyonlar"), "C1: 'Kayıtlı Kombinasyonlar' alt başlığı var");
    ok(w1.text.includes("ZZ Uyku Kombinasyonu") && w1.text.includes("ZZ Odak Kombinasyonu"), "C1: iki kombinasyonun adı var");
    ok(w1.text.includes("AMETİST, LEPİDOLİT, AKİK") && w1.text.includes("FLORİT, PİRİT"), "C1: kombinasyon taşları doğru (Türkçe İ korunur)");
    ok(w1.text.includes("ZZ uyku amacı") && w1.text.includes("ZZ kombinasyon notu"), "C1: amaç ve not aktarıldı");
    ok(w1.text.includes("Mineral Özeti") && w1.text.includes("Lityum ≥ %1") && w1.text.includes("Uyarı / Stok Özeti") && w1.text.includes("Stok: 2/3 stokta") && w1.text.includes("Uyarılı taşlar: LEPİDOLİT"), "C1: mineral ve uyarı/stok özeti aktarıldı");
    ok(idx(w1.text, "ZZ Uyku Kombinasyonu") < idx(w1.text, "ZZ Odak Kombinasyonu"), "C1: kombinasyonlar uygulamadaki sırada (yeniden eskiye)");
    ok(w1.text.includes("02.11.2026"), "C1: kombinasyon kayıt tarihi yazılı");
    console.log("\n[Mevcut içerik korunur]");
    ok(w1.text.includes("ZZ AMETİST") && w1.text.includes("ZZ AKİK") && w1.text.includes("Kullanım Türü") && w1.text.includes("ZZ kombin metni") && w1.text.includes("ZZ taş uyarısı") && w1.text.includes("ZZ taş notu"), "C1: taş kayıtları ve alanları aynen var");
    ok(idx(w1.text, "ZZ AKİK") < idx(w1.text, "Kayıtlı Kombinasyonlar"), "C1: önce taş kayıtları, sonra kombinasyonlar");
    ok(w1.text.includes("Taş Önerileri") && w1.text.includes("ZZ Danışan Bir"), "C1: kapak / bölüm başlığı / danışan adı aynen");
    console.log("\n[İzolasyon]");
    ok(!w1.text.includes("C2 GİZLİ") && !w1.text.includes("GİZLİ TAŞ İKİ"), "C1: aynı uzmanın başka danışanının kombinasyonu YOK");
    ok(!w1.text.includes("T2 GİZLİ") && !w1.text.includes("GİZLİ TAŞ T2"), "C1: başka kiracının (C1 kimliğiyle) kombinasyonu YOK");
    const wx = await word(U2, C1);
    ok(wx.status === 404 && !wx.text, "başka kiracının uzmanı C1 raporunu alamaz (404)", { status: wx.status });
    const w5 = await word(U2, C5);
    ok(w5.status === 200 && w5.text.includes("ZZ T2 C5 KOMBİ") && !w5.text.includes("ZZ Uyku"), "T2 uzmanı yalnız kendi danışanının kombinasyonunu görür");
    console.log("\n[Kombinasyonsuz / boş danışan]");
    const w3 = await word(U1, C3);
    ok(w3.status === 200 && w3.text.includes("ZZ KUVARS") && !w3.text.includes("Kayıtlı Kombinasyonlar"), "C3 (kombinasyonsuz): rapor üretilir, kombinasyon bölümü yok");
    console.log(`  · C3 document.xml md5 = ${w3.hash} (eski kodla karşılaştırma için)`);
    const w2 = await word(U1, C2);
    ok(w2.status === 200 && w2.text.includes("ZZ C2 GİZLİ KOMBİ") && w2.text.includes("C2 amacı"), "C2 (yalnız kombinasyon): artık boş-rapor uyarısı değil, Word üretilir", { status: w2.status, json: w2.json });
    const w4 = await word(U1, C4);
    ok(w4.status === 422 && (w4.json as { code?: string } | null)?.code === "REPORT_EMPTY", "C4 (kayıt yok): boş rapor uyarısı aynen (422 REPORT_EMPTY)", { status: w4.status, json: w4.json });
    console.log("\n[B5 — Tam Rapor / Özel Rapor]");
    await su.query(`insert into public.client_notes(tenant_id,client_id,notlar) values ($1,$2,'ZZ danışan genel notu')`, [T1, C1]);
    const full = async (who: { id: string; token: string }, clientId: string, body: Record<string, unknown>) => {
      const res = await route.POST(new NextRequest("http://localhost/api/test", {
        method: "POST", headers: { "x-user-id": who.id, "x-session-token": who.token, "content-type": "application/json" }, body: JSON.stringify(body),
      }), { params: Promise.resolve({ id: clientId }) });
      if (!(res.headers.get("content-type") ?? "").includes("officedocument")) return { status: res.status, json: await res.json().catch(() => null), text: "", hash: "" };
      const d = await docText(Buffer.from(await res.arrayBuffer()));
      return { status: res.status, json: null, text: d.text, hash: d.xmlHash };
    };
    const f1 = await full(U1, C1, { exportMode: "full" });
    ok(f1.status === 200 && f1.text.includes("Taş Önerileri") && f1.text.includes("ZZ AMETİST") && f1.text.includes("Kayıtlı Kombinasyonlar")
      && f1.text.includes("ZZ Uyku Kombinasyonu") && f1.text.includes("ZZ Odak Kombinasyonu") && f1.text.includes("AMETİST, LEPİDOLİT, AKİK") && f1.text.includes("Stok: 2/3 stokta"),
      "Tam Rapor: Taş Önerileri bölümünde taşlar + kayıtlı kombinasyonlar (ad, taşlar, özetler)", { status: f1.status, json: f1.json });
    ok(f1.text.includes("ZZ danışan genel notu") && idx(f1.text, "ZZ danışan genel notu") < idx(f1.text, "ZZ AMETİST") && idx(f1.text, "ZZ AKİK") < idx(f1.text, "Kayıtlı Kombinasyonlar"),
      "Tam Rapor: diğer bölümler ve sıralama korunur (Notlar → taşlar → kombinasyonlar)");
    ok(!f1.text.includes("C2 GİZLİ") && !f1.text.includes("T2 GİZLİ") && !f1.text.includes("GİZLİ TAŞ"), "Tam Rapor: başka danışan / başka kiracı kombinasyonu YOK");
    const c1 = await full(U1, C1, { exportMode: "full", reportKind: "custom", sections: ["taslar"] });
    ok(c1.status === 200 && c1.text.includes("Kayıtlı Kombinasyonlar") && c1.text.includes("ZZ Uyku Kombinasyonu") && !c1.text.includes("ZZ danışan genel notu"), "Özel Rapor (yalnız Taşlar): kombinasyonlar var, seçilmeyen Notlar yok");
    const c2 = await full(U1, C1, { exportMode: "full", reportKind: "custom", sections: ["notlar"] });
    ok(c2.status === 200 && !c2.text.includes("Kayıtlı Kombinasyonlar") && !c2.text.includes("ZZ AMETİST") && c2.text.includes("ZZ danışan genel notu"), "Özel Rapor (Taşlar seçilmedi): kombinasyon ve taş yok");
    const f2 = await full(U1, C2, { exportMode: "full" });
    ok(f2.status === 200 && f2.text.includes("ZZ C2 GİZLİ KOMBİ") && !f2.text.includes("ZZ Uyku"), "Tam Rapor (yalnız kombinasyonu olan danışan): üretilir, yalnız kendi kombinasyonu", { status: f2.status, json: f2.json });
    const f3 = await full(U1, C3, { exportMode: "full" });
    ok(f3.status === 200 && f3.text.includes("ZZ KUVARS") && !f3.text.includes("Kayıtlı Kombinasyonlar"), "Tam Rapor (kombinasyonsuz danışan): kombinasyon bölümü yok");
    console.log(`  · Tam Rapor C3 document.xml md5 (saat normalize) = ${createHash("md5").update(f3.text.replace(/\d{1,2}:\d{2}/g, "HH:MM")).digest("hex").slice(0, 12)}`);
    const get = async (clientId: string) => {
      const res = await route.GET(new NextRequest("http://localhost/api/test", { headers: { "x-user-id": U1.id, "x-session-token": U1.token } }), { params: Promise.resolve({ id: clientId }) });
      return { status: res.status, json: (await res.json()) as { counts?: Record<string, number> } };
    };
    const g1 = await get(C1), g2 = await get(C2), g3 = await get(C3);
    ok(g1.status === 200 && g1.json.counts?.taslar === 4 && g2.json.counts?.taslar === 1 && g3.json.counts?.taslar === 1,
      "Özel Rapor seçenekleri: Taşlar sayısı kombinasyonları da sayar (C1 2+2, yalnız kombinasyonlu C2 seçilebilir, C3 aynı)", { g1: g1.json.counts, g2: g2.json.counts, g3: g3.json.counts, s: g1.status });

    console.log("\n[Veri değişmez]");
    ok((await snapshot()) === before, "rapor üretimi danışan taş / kombinasyon kayıtlarını değiştirmedi");
    console.log(`  · dosya adları: ${w1.filename} | ${w3.filename}`);
    ok(w1.filename.startsWith("danisan-taslar-") && w1.filename.endsWith(".docx"), "dosya adı biçimi aynen (danisan-taslar-…)", w1.filename);
    ok(w2.filename.startsWith("danisan-taslar-zz-danisan-iki-"), "Türkçe İ dosya adında bozulmaz (#712 C3 düzeltmesi; B5 değiştirmedi)", w2.filename);
  } catch (e) {
    ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop().catch(() => {});
  }
  console.log(`\nB5 Word kombinasyon harness: ${pass} PASS / ${fail} FAIL`);
  if (failures.length) console.log(" - " + failures.join("\n - "));
  process.exit(fail ? 1 : 0);
}
void main();
