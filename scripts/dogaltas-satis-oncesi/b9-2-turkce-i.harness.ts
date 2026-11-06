/**
 * B9.2 (05.11 canlı denetim) — Türkçe İ/I Word dosya adı bozulması: "AKİK" → "dogaltas-aki-k-…" idi.
 * GERÇEK taş rapor kurucusu + GERÇEK mineral / kombinasyon Word route'ları (embedded-postgres, prod'a SIFIR temas).
 * Dosya adı düzelir; Word İÇERİĞİ (başlıktaki Türkçe ad) değişmez.
 * Çalıştır: npx tsx scripts/dogaltas-satis-oncesi/b9-2-turkce-i.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { NextRequest } from "next/server";
import { Packer } from "docx";
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
const ok = (c: boolean, l: string, x?: unknown) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${x !== undefined ? ` → ${JSON.stringify(x).slice(0, 300)}` : ""}`); } };

/** .docx (zip) içinden word/document.xml metni (bağımlılıksız; yalnız deflate/stored). */
function docxText(buf: Buffer): string {
  let i = 0;
  while (i < buf.length - 30) {
    if (buf.readUInt32LE(i) !== 0x04034b50) { i++; continue; }
    const method = buf.readUInt16LE(i + 8), csize = buf.readUInt32LE(i + 18), nlen = buf.readUInt16LE(i + 26), xlen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nlen).toString("utf8");
    const start = i + 30 + nlen + xlen;
    if (name === "word/document.xml") {
      const raw = buf.subarray(start, start + csize);
      const xml = (method === 8 ? inflateRawSync(raw) : raw).toString("utf8");
      return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    }
    i = start + csize;
  }
  return "";
}
const fnameOf = (res: Response) => /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "";

const DDL = `
create table public.minerals (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, source_id text, name text, aciklama text,
  organ_etkileri jsonb default '[]'::jsonb, fiziksel jsonb default '[]'::jsonb, zihinsel jsonb default '[]'::jsonb,
  cakralar jsonb default '[]'::jsonb, fizyoloji jsonb default '[]'::jsonb, eksiklik_belirtileri jsonb default '[]'::jsonb,
  fazlalik_belirtileri jsonb default '[]'::jsonb, doz_asimi jsonb default '[]'::jsonb, iceren_taslar jsonb default '[]'::jsonb,
  kategori text, created_at timestamptz default now(), origin_type text, origin_label text, origin_source_id uuid,
  origin_transfer_batch_id uuid, transferred_at timestamptz, updated_at timestamptz not null default now());
create table public.combinations (id uuid primary key default gen_random_uuid(), tenant_id uuid, source_id text, issue text, description text,
  variant_index int default 1, source text, stones_text text, notes_text text, notes_text_2 text, notes_text_3 text, created_at timestamptz default now(), updated_at timestamptz default now());
grant select, insert, update, delete on public.minerals, public.combinations to service_role;`;

async function main() {
  console.log("\n[Taş raporu kurucusu (saf)]");
  const { buildStoneReportDoc } = await import("../../app/api/dogaltas/stones/[id]/word-report/buildStoneReport");
  const now = new Date("2026-11-05T09:00:00Z");
  for (const [name, slug] of [["AKİK", "akik"], ["ALBİNİZM TAŞI", "albinizm-tasi"], ["Işık Taşı", "isik-tasi"], ["AMETIST", "ametist"]] as const) {
    const { doc, filename } = buildStoneReportDoc({ stone: { id: randomUUID(), stone_name: name } as never, imageBuf: null, isLibrary: false, now });
    const text = docxText(await Packer.toBuffer(doc));
    ok(filename === `dogaltas-${slug}-2026-11-05.docx` && text.includes(name), `taş "${name}" → ${filename} (Word içinde ad aynen)`, { filename });
  }

  const env = await startBioTestEnv({ port: Number(process.env.B92_PG_PORT ?? 54751), dirName: `zz-b92-${Date.now()}` });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    await su.query(DDL);
    const T = randomUUID(), U = randomUUID(), TOK = `zz-b92-${randomUUID()}`;
    await su.query(`insert into public.tenants(id,name) values ($1,'ZZ_B92')`, [T]);
    await su.query(`insert into public.users(id,email,full_name,role,active,approval_status,module_permissions,package_type,plan,tenant_id,membership_status)
      values ($1,'zz.b92@example.test','ZZ Uzman','expert',true,'approved','{"stones":true}','premium','premium',$2,'active')`, [U, T]);
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [U, TOK]);
    const MID = String((await su.query(`insert into public.minerals(tenant_id,source_id,name,aciklama,fiziksel) values ($1,'x','İNCİ MİNERALİ','ZZ açıklama','["ZZ fiziksel"]') returning id`, [T])).rows[0].id);
    await su.query(`insert into public.combinations(tenant_id,source_id,issue,description,stones_text) values ($1,'k1','QA KOMBİNASYON 0411','ZZ amaç','AKİK, AMETİST')`, [T]);
    const H = { "x-user-id": U, "x-session-token": TOK, "content-type": "application/json" };

    console.log("\n[Mineral Word route]");
    const mRoute = await import("../../app/api/dogaltas/minerals/[id]/word-report/route");
    const mRes = await mRoute.POST(new NextRequest("http://localhost/api/test", { method: "POST", headers: H, body: "{}" }), { params: Promise.resolve({ id: MID }) });
    const mBuf = Buffer.from(await mRes.arrayBuffer());
    ok(mRes.status === 200 && /^mineral-inci-minerali-\d{4}-\d{2}-\d{2}\.docx$/.test(fnameOf(mRes)), `mineral "İNCİ MİNERALİ" → ${fnameOf(mRes)}`, { s: mRes.status, f: fnameOf(mRes) });
    ok(docxText(mBuf).includes("İNCİ MİNERALİ") && docxText(mBuf).includes("ZZ fiziksel"), "mineral Word içeriği aynen (Türkçe ad + alan)");

    console.log("\n[Kombinasyon Word route]");
    const cRoute = await import("../../app/api/dogaltas/combinations/word-report/route");
    const cRes = await cRoute.POST(new NextRequest("http://localhost/api/test", { method: "POST", headers: H, body: JSON.stringify({ exportMode: "single", combinationTitle: "QA KOMBİNASYON 0411" }) }));
    const cBuf = Buffer.from(await cRes.arrayBuffer());
    ok(cRes.status === 200 && /^kombinasyon-qa-kombinasyon-0411-\d{4}-\d{2}-\d{2}\.docx$/.test(fnameOf(cRes)), `kombinasyon "QA KOMBİNASYON 0411" → ${fnameOf(cRes)}`, { s: cRes.status, f: fnameOf(cRes) });
    ok(docxText(cBuf).includes("QA KOMBİNASYON 0411") && docxText(cBuf).includes("AKİK"), "kombinasyon Word içeriği aynen");
  } catch (e) {
    ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop().catch(() => {});
  }
  console.log(`\nB9.2 Türkçe İ harness: ${pass} PASS / ${fail} FAIL`);
  if (failures.length) console.log(" - " + failures.join("\n - "));
  process.exit(fail ? 1 : 0);
}
void main();
