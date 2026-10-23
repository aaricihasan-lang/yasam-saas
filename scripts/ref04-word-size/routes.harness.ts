/**
 * REF-04 / REF-05 — Refleksoloji protokol Word'ü 4,5 MB yanıt sınırı. GERÇEK route + GERÇEK
 * Postgres (embedded, 127.0.0.1; PROD'A SIFIR TEMAS; ZZ_* sentetik veri).
 *
 * 1) beş görünümün hepsinde bölgesi olan protokol (en kötü tek rapor) → 200, < 4,4 MB, 5 harita
 * 2) gömülü harita PNG'leri en çok 1200 px genişlik, oran korunur; harita başlıkları + lejant aynı
 * 3) çoklu seçim sınırı aşan rapor → opak platform hatası yerine 413 + anlaşılır mesaj
 * 4) REF-05: geçersiz UUID / 150+ kimlik / geçersiz mod → 400; tekrar eden kimlik bir kez
 * 5) tenant: başka uzmanın protokolü raporlanamaz; 6) oturumsuz 401, demo 403
 * Çalıştır: npx tsx scripts/ref04-word-size/routes.harness.ts   (ölçüm: REPORT=1)
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
const H0 = harness("ref04-word-size/routes");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 500)), done: () => H0.done() };
type U = { id: string; token: string; tenant: string };
const req = (u: U | null, body: unknown) => new NextRequest("http://localhost/api/refleksoloji/protocol-report", {
  method: "POST", headers: { "content-type": "application/json", ...(u ? { "x-user-id": u.id, "x-session-token": u.token } : {}) }, body: JSON.stringify(body),
});
const MB = (n: number) => (n / 1048576).toFixed(2) + " MB";
const LIMIT = 4_400_000;

async function seedUser(su: pg.Client, label: string, demo = false): Promise<U> {
  const tenant = randomUUID();
  await su.query(`insert into public.tenants(id, name) values ($1,$2) on conflict do nothing`, [tenant, `ZZ_REF04_${label}`]);
  const id = randomUUID();
  const token = `zz-ref04-tok-${label.toLowerCase()}-${id.slice(0, 8)}`;
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, membership_status, tenant_id, is_demo_account)
     values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium','active',$5,$6)`,
    [id, `ZZ_REF04_${label}`, `zz.ref04.${label.toLowerCase()}@example.test`, JSON.stringify({ reflexology: true }), tenant, demo],
  );
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
  return { id, token, tenant };
}

const VIEWS = ["taban", "yan_ic", "yan_dis", "el_avuc", "el_sirt"] as const;
const SHAPES = ["oval", "rect", "free_draw", "thick_line", "point"] as const;
/** Organ başına her görünümde iki ayak/el × beş şekil (prod'daki yoğun atlas taklidi). */
function atlasDoc(organs: string[], footOnly: ReadonlySet<string> = new Set()) {
  const doc: Record<string, unknown> = { _meta: { version: "1", updated_at: "2026-10-23T00:00:00.000Z" } };
  let i = 0;
  for (const organ of organs) {
    const entry: Record<string, { sol: unknown[]; sag: unknown[] }> = {};
    for (const view of VIEWS) {
      entry[view] = { sol: [], sag: [] };
      if (footOnly.has(organ) && view.startsWith("el_")) continue;
      for (const side of ["sol", "sag"] as const) {
        for (const shape of SHAPES) {
          const cx = 0.15 + ((i * 0.07) % 0.7), cy = 0.2 + ((i * 0.05) % 0.6);
          const base = { id: `zz-${i++}`, organ, footSide: side === "sol" ? "left" : "right", view, shape, color: "rgba(239, 68, 68, 0.22)" };
          const geo = shape === "oval" || shape === "rect" ? { cx, cy, rx: 0.05, ry: 0.04, angle: 0 }
            : shape === "free_draw" ? { points: [{ x: cx, y: cy }, { x: cx + 0.05, y: cy + 0.03 }, { x: cx + 0.08, y: cy - 0.02 }] }
            : shape === "thick_line" ? { x1: cx, y1: cy, x2: cx + 0.1, y2: cy + 0.04, lineWidth: 0.003 } : { cx, cy };
          entry[view][side].push({ ...base, ...geo });
        }
      }
    }
    doc[organ] = entry;
  }
  return doc;
}

function pngSize(b: Buffer): { w: number; h: number } | null {
  if (b[0] !== 0x89 || b[1] !== 0x50) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

(async () => {
  const env = await startBioTestEnv({ port: 54635, dirName: "ref04-word-size-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    await su.query(readMig("20260705120000_reflexology_notes_atlas.sql"));
    await su.query(readMig("20260924200817_reflexology_protocols_baseline_and_uid_unique.sql"));
    await su.query(`grant select, insert, update, delete on all tables in schema public to service_role; grant execute on all functions in schema public to service_role;`);
    const T = await seedUser(su, "T");
    const X = await seedUser(su, "X");
    const D = await seedUser(su, "D", true);
    const organs = ["Böbrek", "Kalp", "Karaciğer", "Mide", "Akciğer", "Dalak"];
    await su.query(`insert into reflexology_atlas(tenant_id, document) values ($1,$2)`, [T.tenant, JSON.stringify(atlasDoc(organs, new Set(["Mide", "Akciğer", "Dalak"])))]);
    const ids: string[] = [];
    // P0 = en yoğun (3 organ); diğerleri farklı organ çiftleri → her protokolün haritaları FARKLI
    // (docx aynı görseli bir kez gömer; gerçek "Tümü" raporunda haritalar protokolden protokole değişir).
    const pairs: string[][] = [];
    for (let a = 0; a < organs.length; a++) for (let b = a + 1; b < organs.length; b++) pairs.push([organs[a]!, organs[b]!]);
    for (let k = 0; k < 12; k++) {
      const org = k === 0 ? organs.slice(0, 3) : pairs[k]!;
      const r = await su.query(`insert into reflexology_protocols(tenant_id, source_uid, title, target_problem, organs, application_notes) values ($1,$2,$3,'ZZ hedef',$4,'ZZ not') returning id`,
        [T.tenant, `zz-${k}`, `ZZ Protokol ${String(k).padStart(2, "0")}`, org.join(" | ")]);
      ids.push(r.rows[0].id);
    }
    const xr = await su.query(`insert into reflexology_protocols(tenant_id, source_uid, title, organs) values ($1,'zz-x','ZZ X Protokol','Kalp') returning id`, [X.tenant]);
    const xId = xr.rows[0].id as string;
    const route = await import("../../app/api/refleksoloji/protocol-report/route");

    // ── 1/2) en kötü tek protokol ──
    let r = await route.POST(req(T, { exportMode: "single", protocolId: ids[0] }));
    const buf = r.status === 200 ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0);
    if (process.env.REPORT) console.log(`  ölçüm: tek protokol (5 görünüm × 3 organ) = ${MB(buf.length)} (HTTP ${r.status})`);
    H.ok(r.status === 200 && buf.length > 0 && buf.length < LIMIT, `1: en kötü tek protokol raporu 4,4 MB altında (${MB(buf.length)})`, r.status);
    const zip = buf.length ? await JSZip.loadAsync(buf) : null;
    const media = zip ? Object.keys(zip.files).filter((f) => /^word\/media\/.+\.png$/i.test(f)) : [];
    const xml = (await zip?.file("word/document.xml")?.async("string")) ?? "";
    H.ok(media.length === 5, `2a: 5 harita görseli (got ${media.length})`);
    const dims = await Promise.all(media.map(async (m) => pngSize(Buffer.from(await zip!.file(m)!.async("uint8array")))));
    H.ok(dims.every((d) => d && d.w <= 1200 && d.w >= 1100), "2b: gömülü PNG genişliği ≤ 1200 px (≈200 dpi baskı)", dims);
    H.ok(dims.some((d) => d && Math.abs(d.w / d.h - 1) < 0.01) && dims.some((d) => d && Math.abs(d.w / d.h - 1.5) < 0.01) && dims.some((d) => d && Math.abs(d.w / d.h - 1448 / 1086) < 0.01), "2c: görsel oranları korunur (taban 1:1, yan 3:2, el 4:3)", dims);
    H.ok(["— Taban", "— Yan İç", "— Yan Dış", "— Avuç İçi", "— El Sırtı"].every((t) => xml.includes(t)) && xml.includes("Böbrek") && xml.includes("Karaciğer"), "2d: harita başlıkları + organ lejantı korunur");

    // ── 3) çoklu seçim ── (pairs: 12=Mide|Akciğer, 13=Mide|Dalak, 14=Akciğer|Dalak → yalnız ayak haritası)
    const footIds: string[] = [];
    for (const [k, org] of [[12, "Mide | Akciğer"], [13, "Mide | Dalak"], [14, "Akciğer | Dalak"]] as const) {
      const fr = await su.query(`insert into reflexology_protocols(tenant_id, source_uid, title, organs) values ($1,$2,$3,$4) returning id`, [T.tenant, `zz-${k}`, `ZZ Ayak ${k}`, org]);
      footIds.push(fr.rows[0].id);
    }
    r = await route.POST(req(T, { exportMode: "selected", protocolIds: footIds }));
    const feet = r.status === 200 ? (await r.arrayBuffer()).byteLength : -1;
    if (process.env.REPORT) console.log(`  ölçüm: 3 ayak protokolü (farklı haritalar) = ${feet > 0 ? MB(feet) : "HTTP " + r.status}`);
    H.ok(r.status === 200 && feet > 0 && feet < LIMIT, `3a: 3 farklı ayak protokolü tek raporda 4,4 MB altında (${feet > 0 ? MB(feet) : r.status})`);
    r = await route.POST(req(T, { exportMode: "selected", protocolIds: ids.slice(1, 3) }));
    const jb2 = r.headers.get("content-type")?.includes("json") ? await r.json() as { error?: string } : {};
    if (process.env.REPORT) console.log(`  ölçüm: 2 yoğun el+ayak protokolü = HTTP ${r.status}`);
    H.ok(r.status === 413 && /daha az protokol/.test(String(jb2.error)), "3c: her biri 5 görünümlü 2 yoğun protokol sınırı aşar → 413 + mesaj (toplu raporun tam çözümü mimari karar)", { status: r.status, jb2 });
    r = await route.POST(req(T, { exportMode: "all" }));
    const jb = r.headers.get("content-type")?.includes("json") ? await r.json() as { error?: string } : {};
    H.ok(r.status === 413 && /4,4 MB/.test(String(jb.error)) && /daha az protokol/.test(String(jb.error)), "3b: sınırı aşan 'Tümü' raporu → 413 + anlaşılır mesaj (opak hata değil)", { status: r.status, jb });

    // ── 4) REF-05 ──
    r = await route.POST(req(T, { exportMode: "selected", protocolIds: ["x' or 1=1--"] }));
    H.ok(r.status === 400, "4a: UUID olmayan kimlik → 400", r.status);
    r = await route.POST(req(T, { exportMode: "selected", protocolIds: Array.from({ length: 151 }, () => randomUUID()) }));
    H.ok(r.status === 400, "4b: 151 kimlik → 400 (sınır 150)", r.status);
    r = await route.POST(req(T, { exportMode: "single", protocolId: "abc" }));
    H.ok(r.status === 400, "4c: tek protokolde geçersiz kimlik → 400", r.status);
    r = await route.POST(req(T, { exportMode: "her-sey" }));
    H.ok(r.status === 400, "4d: geçersiz mod → 400", r.status);
    r = await route.POST(req(T, { exportMode: "selected", protocolIds: [ids[1], ids[1], ids[1]] }));
    H.ok(r.status === 200 && /refleksoloji-protokol-zz-protokol-01/.test(r.headers.get("content-disposition") ?? ""), "4e: tekrar eden kimlik bir kez → tek protokol raporu", r.headers.get("content-disposition"));

    // ── 5/6) tenant + yetki ──
    r = await route.POST(req(T, { exportMode: "single", protocolId: xId }));
    H.ok(r.status === 404, "5a: başka uzmanın protokolü → 404", r.status);
    r = await route.POST(req(T, { exportMode: "selected", protocolIds: [xId] }));
    H.ok(r.status === 404, "5b: seçimde yalnız başka uzmanın protokolü → 404", r.status);
    r = await route.POST(req(null, { exportMode: "all" }));
    H.ok(r.status === 401, "6a: oturumsuz 401", r.status);
    r = await route.POST(req(D, { exportMode: "all" }));
    H.ok(r.status === 403, "6b: demo 403", r.status);
  } catch (e) {
    H.ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop();
    H.done();
  }
})();
