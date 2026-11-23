/**
 * 12. aşama — Şifa Rehberi V2 GÖRSELLERİNİN GERÇEK İÇERİKLE yedeklenmesi + geri yüklenmesi (GERÇEK test projesi).
 * Uygulamanın GERÇEK yedek istemcisi (lib/backup/client.ts runBackup / runRestore) → GERÇEK rota işleyicileri
 * (/api/settings/backup*, /api/settings/restore*) → gerçek PostgREST + gerçek Storage ('sifa-arastirma').
 * Kayıp simülasyonu YALNIZ bu testin oluşturduğu sentetik nesne üzerinde (mevcut test verisine dokunulmaz).
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/backup-files.real.ts
 */
import Module from "node:module";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { applyProcessEnv, connectTestDb, installNetworkFence, loadTestTarget, redact } from "./guard";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};
type Json = Record<string, unknown>;
type Handler = (r: NextRequest) => Promise<Response>;
const PNG_BASE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function main() {
  const T = loadTestTarget();
  installNetworkFence(T);
  applyProcessEnv(T);
  process.env.SIFA_REHBERI_V2_ENABLED = "1";
  const su = await connectTestDb();
  const { createClient } = await import("@supabase/supabase-js");
  const svc = createClient(T.url, T.secretKey, { auth: { persistSession: false } });
  const R = {
    backup: await import("../../../app/api/settings/backup/route"),
    table: await import("../../../app/api/settings/backup/table/route"),
    files: await import("../../../app/api/settings/backup/files/route"),
    restore: await import("../../../app/api/settings/restore/route"),
    chunk: await import("../../../app/api/settings/restore/chunk/route"),
    rfiles: await import("../../../app/api/settings/restore/files/route"),
    ws: await import("../../../app/api/sifa-rehberi-v2/workspace/route"),
    prep: await import("../../../app/api/sifa-rehberi-v2/assets/prepare/route"),
    fin: await import("../../../app/api/sifa-rehberi-v2/assets/finalize/route"),
    urls: await import("../../../app/api/sifa-rehberi-v2/assets/signed-urls/route"),
  };
  const { runBackup, runRestore } = await import("../../../lib/backup/client");
  const { normalizeBackupFile } = await import("../../../lib/backup/format");
  const { listSifaV2BackupFiles } = await import("../../../lib/backup/sifaV2Files");

  // Test projesinde Human Design modülü yok; HD dosya listesi (mevcut hdFiles) tablolarını sorgular. Production'da
  // bu tablolar VAR. HD koduna dokunmadan: BOŞ, sentetik taslak tablolar (idempotent; RLS açık, tarayıcıya kapalı).
  await su.query(`create table if not exists public.human_design_clients (id uuid primary key default gen_random_uuid(), tenant_id uuid, chart_image_url text);
    create table if not exists public.human_design_reports (id uuid primary key default gen_random_uuid(), tenant_id uuid, snapshot jsonb);
    alter table public.human_design_clients enable row level security; alter table public.human_design_reports enable row level security;
    revoke all on public.human_design_clients, public.human_design_reports from anon, authenticated;
    notify pgrst, 'reload schema';`);
  await new Promise((r) => setTimeout(r, 1500));
  // ── Sentetik kapsam ──
  const TEN = randomUUID();
  await su.query("insert into public.tenants(id, name) values ($1, 'ZZ_SIFA_YEDEK')", [TEN]);
  const mk = async (label: string) => {
    const id = randomUUID();
    const token = `zz-sifa-yedek-${randomUUID()}`;
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, membership_status, subscription_status)
       values ($1, $2, $3, 'expert', true, 'approved', '{"sifa_rehberi": true}', 'premium', 'premium', $4, 'active', 'active')`,
      [id, `ZZ_SIFA_YEDEK_${label}`, `zz.sifa.yedek.${label.toLowerCase()}@example.test`, TEN],
    );
    await su.query("insert into public.user_sessions(user_id, session_token) values ($1, $2)", [id, token]);
    return { id, token };
  };
  const U1 = await mk("U1");
  const U2 = await mk("U2");
  const ROUTES: [string, Handler, string][] = [
    ["/api/settings/backup/table", R.table.GET as Handler, "GET"],
    ["/api/settings/backup/files", R.files.GET as Handler, "GET"],
    ["/api/settings/backup", R.backup.GET as Handler, "GET"],
    ["/api/settings/restore/chunk", R.chunk.POST as Handler, "POST"],
    ["/api/settings/restore/files", R.rfiles.POST as Handler, "POST"],
    ["/api/settings/restore", R.restore.POST as Handler, "POST"],
  ];
  const req = (u: { id: string; token: string }, url: string, method: string, body?: unknown) =>
    new NextRequest(`http://localhost${url}`, {
      method,
      headers: { "x-user-id": u.id, "x-session-token": u.token, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  const fetcherFor = (u: { id: string; token: string }) => async (url: string, init?: { method?: "GET" | "POST"; body?: unknown }) => {
    const p = url.split("?")[0];
    const hit = ROUTES.find(([pre]) => p === pre);
    if (!hit) throw new Error(`rota yok: ${p}`);
    const res = await hit[1](req(u, url, init?.method ?? hit[2], init?.body));
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* boş */
    }
    return { ok: res.ok, status: res.status, json };
  };
  const call = async (h: Handler, url: string, u: { id: string; token: string }, body?: unknown) => {
    const res = await h(req(u, url, body !== undefined ? "POST" : "GET", body));
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
  };
  const doc = (t: string, asset?: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }, ...(asset ? [{ type: "figure", attrs: { src: `sifa-asset:${asset}`, caption: "Görsel" } }] : [])] });
  const upload = async (u: { id: string; token: string }, bytes: Buffer) => {
    const pr = await call(R.prep.POST as Handler, "/api/sifa-rehberi-v2/assets/prepare", u, { mimeType: "image/png", size: bytes.length });
    const put = await fetch(String(pr.json.signedUrl), { method: "PUT", headers: { "content-type": "image/png" }, body: new Uint8Array(bytes) });
    const fz = await call(R.fin.POST as Handler, "/api/sifa-rehberi-v2/assets/finalize", u, { assetId: pr.json.assetId, path: pr.json.path, caption: "Sentetik" });
    if (!put.ok || fz.status !== 200) throw new Error(`yükleme: ${pr.status}/${put.status}/${fz.status}`);
    return { id: String(pr.json.assetId), path: String(pr.json.path) };
  };

  console.log("1) Sentetik V2 içerik: U1 (2 görsel; biri çöpteki kutuda) + U2 (1 görsel)");
  const img1 = Buffer.concat([PNG_BASE, randomBytes(4096)]);
  const img2 = Buffer.concat([PNG_BASE, randomBytes(8192)]);
  const img3 = Buffer.concat([PNG_BASE, randomBytes(2048)]);
  const a1 = await upload(U1, img1);
  const a2 = await upload(U1, img2);
  const a3 = await upload(U2, img3);
  const P = randomUUID(), B1 = randomUUID(), B2 = randomUUID(), P2 = randomUUID(), B3 = randomUUID();
  const blk = (id: string, t: string, text: string, asset: string, extra: Json = {}) => ({ id, topic_id: t, title: "Not", content_json: doc(text, asset), content_text: text, classification: null, sort_key: "a1", deleted_at: null, delete_batch_id: null, base_version: null, sources: [{ id: randomUUID(), kind: "makale", title: "Kaynak", authors: "A", year: "2024", doi: "10.1234/zz.yedek", url: null }], ...extra });
  const s1 = await call(R.ws.POST as Handler, "/api/sifa-rehberi-v2/workspace", U1, {
    topics: [{ id: P, parent_id: null, title: "ZZ Yedek Konusu", sort_key: "a1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null }],
    blocks: [blk(B1, P, "Görselli not", a1.id), { ...blk(B2, P, "Çöpteki görselli not", a2.id), sort_key: "b1", deleted_at: new Date().toISOString(), delete_batch_id: randomUUID() }],
    asset_links: [{ asset_id: a1.id, block_id: B1 }, { asset_id: a2.id, block_id: B2 }],
  });
  const s2 = await call(R.ws.POST as Handler, "/api/sifa-rehberi-v2/workspace", U2, {
    topics: [{ id: P2, parent_id: null, title: "U2 konusu", sort_key: "a1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null }],
    blocks: [blk(B3, P2, "U2 görselli", a3.id)],
    asset_links: [{ asset_id: a3.id, block_id: B3 }],
  });
  ok(s1.status === 200 && s2.status === 200, "kayıtlar + görsel bağları gerçek API ile kaydedildi", [s1.status, s2.status]);

  console.log("2) Yedek oluşturma (uygulamanın gerçek istemcisi)");
  const bk = await runBackup(fetcherFor(U1) as never);
  const v2files = (bk.file.files ?? []).filter((f) => f.bucket === "sifa-arastirma");
  ok(v2files.length === 2, "yedekte U1'in 2 V2 görseli var (çöpteki kutunun görseli dahil)", v2files.map((f) => f.path));
  ok(!(bk.file.files ?? []).some((f) => f.path === a3.path), "U2'nin görseli U1 yedeğine KARIŞMADI");
  const byPath = new Map(v2files.map((f) => [f.path, f]));
  const f1 = byPath.get(a1.path);
  const f2 = byPath.get(a2.path);
  const dec = (f?: { data_base64: string }) => Buffer.from(f?.data_base64 ?? "", "base64");
  ok(!!f1 && dec(f1).equals(img1) && f1.sha256 === sha(img1) && f1.size === img1.length, "görsel 1: GERÇEK bayt içeriği + SHA-256 + boyut birebir");
  ok(!!f2 && dec(f2).equals(img2) && f2.sha256 === sha(img2), "görsel 2 (çöpteki kutu): gerçek içerik birebir");
  const tb = Object.fromEntries(Object.entries(bk.file.tables as Record<string, { rows?: Json[] }>).map(([k, v]) => [k, v?.rows ?? []])) as Record<string, Json[]>;
  ok((tb.sifa_block_assets ?? []).length === 2 && (tb.sifa_topic_blocks ?? []).length === 2 && (tb.sifa_block_sources ?? []).length === 2 && (tb.sifa_topics ?? []).length === 1, "V2 tabloları: yalnız U1'in konu/kutu/kaynak(DOI)/görsel satırları", { a: tb.sifa_block_assets?.length, b: tb.sifa_topic_blocks?.length, s: tb.sifa_block_sources?.length, t: tb.sifa_topics?.length });
  ok((tb.sifa_block_sources ?? []).every((s) => s.doi === "10.1234/zz.yedek"), "DOI bilgisi yedekte");
  ok(!JSON.stringify(tb).includes("U2 görselli"), "U2'nin metni yedekte YOK");
  const norm = normalizeBackupFile(JSON.parse(JSON.stringify(bk.file)));
  ok(norm.ok && norm.backup.files.length === (bk.file.files ?? []).length, "yedek dosyası yeniden okunabiliyor (format doğrulaması)");
  if (!norm.ok) throw new Error("normalize");

  console.log("3) Kayıp → geri yükleme (yalnız bu testin sentetik nesnesi silinir)");
  const rm = await svc.storage.from("sifa-arastirma").remove([a1.path]);
  ok(!rm.error && (await svc.storage.from("sifa-arastirma").download(a1.path)).error !== null, "kayıp simülasyonu: görsel 1 depolamadan kaldırıldı");
  const r1 = await runRestore(norm.backup, fetcherFor(U1) as never);
  const fileRep = r1.tables.find((r) => r.table === "hd_files");
  ok(!!fileRep && fileRep.inserted === 1 && fileRep.already_present === 1 && fileRep.failed.length === 0, "dosya raporu: 1 geri yüklendi, 1 zaten var, hata 0", fileRep && { i: fileRep.inserted, a: fileRep.already_present, f: fileRep.failed });
  const back = await svc.storage.from("sifa-arastirma").download(a1.path);
  ok(!back.error && Buffer.from(await back.data!.arrayBuffer()).equals(img1), "geri yüklenen dosya baytları birebir (SHA-256 aynı)");
  const v2tables = r1.tables.filter((r) => r.table.startsWith("sifa_"));
  ok(v2tables.length > 0 && v2tables.every((r) => r.inserted === 0 && r.failed.length === 0), "V2 tablo satırları çoğaltılmadı (hepsi zaten var)", v2tables.map((r) => [r.table, r.inserted, r.already_present]));
  const su1 = await call(R.urls.POST as Handler, "/api/sifa-rehberi-v2/assets/signed-urls", U1, { ids: [a1.id] });
  const opened = await fetch(String((su1.json.urls as Json)?.[a1.id] ?? "http://127.0.0.1:9/yok"));
  const ob = Buffer.from(await opened.arrayBuffer());
  ok(opened.ok && ob.equals(img1) && ob.subarray(0, 8).equals(PNG_BASE.subarray(0, 8)), "geri yükleme sonrası görsel uygulamada AÇILIYOR (imzalı bağlantı → PNG baytları)");

  console.log("4) İkinci geri yükleme: üzerine yazma / çoğaltma yok");
  const r2 = await runRestore(norm.backup, fetcherFor(U1) as never);
  const fr2 = r2.tables.find((r) => r.table === "hd_files");
  ok(!!fr2 && fr2.inserted === 0 && fr2.already_present === 2, "dosyalar: hepsi zaten var (0 yeni)", fr2 && { i: fr2.inserted, a: fr2.already_present });
  const cnt = Number((await su.query("select count(*)::int n from public.sifa_block_assets where owner_key = $1", [U1.id])).rows[0].n);
  ok(cnt === 2, "görsel satırı sayısı değişmedi (2)", cnt);

  console.log("5) Başarısız geri yükleme veri kaybı üretmez (bozuk SHA-256)");
  await svc.storage.from("sifa-arastirma").remove([a1.path]);
  const bad = JSON.parse(JSON.stringify(bk.file));
  for (const f of bad.files) if (f.path === a1.path) f.sha256 = "0".repeat(64);
  const nb = normalizeBackupFile(bad);
  if (!nb.ok) throw new Error("normalize bad");
  const r3 = await runRestore(nb.backup, fetcherFor(U1) as never);
  const fr3 = r3.tables.find((r) => r.table === "hd_files");
  ok(!!fr3 && fr3.inserted === 0 && fr3.failed.some((x) => x.code === "file_restore_failed"), "bozuk dosya REDDEDİLDİ (422) — yanlış içerik yazılmadı", fr3 && fr3.failed);
  ok((await svc.storage.from("sifa-arastirma").download(a1.path)).error !== null, "→ hedef yolda dosya oluşmadı");
  ok(!(await svc.storage.from("sifa-arastirma").download(a2.path)).error, "→ diğer dosya etkilenmedi");
  const tmp = await svc.storage.from("sifa-arastirma").list(`${TEN}/.restore-tmp/${U1.id}`, { limit: 100 });
  ok((tmp.data ?? []).length === 0, "→ geçici parçalar temizlendi", (tmp.data ?? []).length);
  const r4 = await runRestore(norm.backup, fetcherFor(U1) as never);
  ok((r4.tables.find((r) => r.table === "hd_files")?.inserted ?? 0) === 1, "ardından doğru yedekle geri yükleme başarılı");

  console.log("6) İzolasyon: başka uzman");
  const l2 = await listSifaV2BackupFiles(svc as never, TEN, U2.id);
  ok(l2.files.length === 1 && l2.files[0].path === a3.path, "U2'nin listesi yalnız kendi görseli");
  const steal = await call(R.files.GET as Handler, `/api/settings/backup/files?path=${encodeURIComponent(a1.path)}&part=0&bucket=sifa-arastirma`, U2);
  ok(steal.status === 400 || steal.status === 404, "U2, U1'in dosyasını yedek ucundan OKUYAMAZ", steal.status);
  const r5 = await runRestore(norm.backup, fetcherFor(U2) as never);
  const fr5 = r5.tables.find((r) => r.table === "hd_files");
  ok(!!fr5 && fr5.inserted === 0, "U1'in yedeği U2 olarak geri yüklenince U2 adına dosya YAZILMAZ", fr5 && { i: fr5.inserted, f: fr5.failed.map((x) => x.code) });

  console.log("7) Eski yedek / eski istemci uyumu (kova alanı yok → HD hattı aynen)");
  const oldPart = await call(R.rfiles.POST as Handler, "/api/settings/restore/files", U1, { mode: "part", path: a1.path, upload_id: randomUUID(), index: 0, data_base64: "AAAA" });
  ok(oldPart.status === 400 || oldPart.status === 403, "kova alanı olmayan istek HD doğrulayıcısına gider (V2 yolu HD'de geçersiz → reddedilir)", oldPart.status);
  const oldPlan = await call(R.rfiles.POST as Handler, "/api/settings/restore/files", U1, { mode: "plan", files: [] });
  ok(oldPlan.status === 200 && Array.isArray(oldPlan.json.decisions), "boş dosya listeli eski yedek planı çalışır");
  const absent = await listSifaV2BackupFiles({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ data: null, error: { code: "PGRST205", message: "yok" } }) }) }) }) }) }) } as never, TEN, U1.id);
  ok(absent.files.length === 0 && absent.error === null, "V2 kurulmamış ortam (tablo yok) → boş liste, hata yok");
  await su.end();
}

main()
  .catch((e) => {
    fail++;
    console.log(`  ✗ ${redact(String((e as Error)?.stack ?? e)).slice(0, 900)}`);
  })
  .finally(() => {
    console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
  });
