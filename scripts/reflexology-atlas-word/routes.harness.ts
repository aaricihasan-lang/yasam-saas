/**
 * W07 — Refleksoloji Kayıtlı Atlas Word dışa aktarma. GERÇEK route + GERÇEK Postgres (embedded,
 * 127.0.0.1; PROD'A SIFIR TEMAS; ZZ_* sentetik veri).
 *
 * 1) Tümü → 200, geçerli .docx (zip + document.xml), kapak "Kayıtlı Atlas", görünüm başına harita,
 *    organ tablosu, atlas raporu altbilgisi, dosya adı; 4,4 MB altında (yoğun atlas)
 * 2) Seçili → yalnız seçilen organlar (kanonik eşleşme: büyük/küçük harf), seçilmeyenler YOK
 * 3) Seçimde atlasta olmayan ad → "bulunmayan" notu; yalnız olmayanlar → 404
 * 4) Tenant: başka uzmanın organları rapora GİRMEZ; başka tenant'ın organıyla seçim → 404
 * 5) Doğrulama: geçersiz mod / boş seçim / metin olmayan / çok uzun ad / 501 ad / gövde → 400
 * 6) Oturumsuz 401, demo 403, atlası olmayan tenant 404
 * 7) Salt okuma: rapor üretimi atlas satırını DEĞİŞTİRMEZ
 * 8) Protokol raporu korunur: altbilgi "Refleksoloji Protokol Raporu" + "Seçilen Organlar…" başlığı
 * Çalıştır: npx tsx scripts/reflexology-atlas-word/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
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
const H0 = harness("reflexology-atlas-word/routes");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 500)), done: () => H0.done() };
type U = { id: string; token: string; tenant: string };
const mkReq = (url: string, u: U | null, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: "POST", headers: { "content-type": "application/json", ...(u ? { "x-user-id": u.id, "x-session-token": u.token } : {}) },
  body: typeof body === "string" ? body : JSON.stringify(body),
});
const req = (u: U | null, body: unknown) => mkReq("/api/refleksoloji/atlas-report", u, body);
const LIMIT = 4_400_000;

async function seedUser(su: pg.Client, label: string, demo = false): Promise<U> {
  const tenant = randomUUID();
  await su.query(`insert into public.tenants(id, name) values ($1,$2) on conflict do nothing`, [tenant, `ZZ_W07_${label}`]);
  const id = randomUUID();
  const token = `zz-w07-tok-${label.toLowerCase()}-${id.slice(0, 8)}`;
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, membership_status, tenant_id, is_demo_account)
     values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium','active',$5,$6)`,
    [id, `ZZ_W07_${label}`, `zz.w07.${label.toLowerCase()}@example.test`, JSON.stringify({ reflexology: true }), tenant, demo],
  );
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
  return { id, token, tenant };
}

const VIEWS = ["taban", "yan_ic", "yan_dis", "el_avuc", "el_sirt"] as const;
const SHAPES = ["oval", "rect", "free_draw", "thick_line", "point"] as const;
/** organ → kullanılacak görünümler; her görünümde iki ayak/el × beş şekil (yoğun atlas). */
function atlasDoc(spec: Record<string, readonly (typeof VIEWS)[number][]>) {
  const doc: Record<string, unknown> = { _meta: { version: "1", updated_at: "2026-10-29T00:00:00.000Z" } };
  let i = 0;
  for (const [organ, views] of Object.entries(spec)) {
    const entry: Record<string, { sol: unknown[]; sag: unknown[] }> = {};
    for (const view of VIEWS) {
      entry[view] = { sol: [], sag: [] };
      if (!views.includes(view)) continue;
      for (const side of ["sol", "sag"] as const) {
        for (const shape of SHAPES) {
          const cx = 0.15 + ((i * 0.07) % 0.7), cy = 0.2 + ((i * 0.05) % 0.6);
          const base = { id: `zz-w07-${organ}-${i++}`, organ, footSide: side === "sol" ? "left" : "right", view, shape, color: "rgba(239, 68, 68, 0.22)" };
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

async function readDocx(r: Response) {
  const buf = Buffer.from(await r.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const footers = await Promise.all(Object.keys(zip.files).filter((f) => /^word\/footer\d*\.xml$/.test(f)).map((f) => zip.file(f)!.async("string")));
  const media = Object.keys(zip.files).filter((f) => /^word\/media\/.+\.png$/i.test(f));
  const text = xml.replace(/<[^>]+>/g, "");
  return { buf, xml, text, footer: footers.join("\n").replace(/<[^>]+>/g, ""), media, hasContentTypes: !!zip.file("[Content_Types].xml") };
}

(async () => {
  const env = await startBioTestEnv({ port: 54671, dirName: "refleks-atlas-word-pgdata" });
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
    const E = await seedUser(su, "E"); // atlası yok
    const D = await seedUser(su, "D", true);
    const ALL = VIEWS;
    const FEET = ["taban", "yan_ic", "yan_dis"] as const;
    const tDoc = atlasDoc({ "Böbrek": ALL, "Kalp": ALL, "Karaciğer": ALL, "Mide": FEET, "Akciğer": FEET, "Dalak": ["taban"] });
    await su.query(`insert into reflexology_atlas(tenant_id, document, organ_list) values ($1,$2,$3)`, [T.tenant, JSON.stringify(tDoc), JSON.stringify(Object.keys(tDoc).filter((k) => k !== "_meta"))]);
    await su.query(`insert into reflexology_atlas(tenant_id, document, organ_list) values ($1,$2,$3)`, [X.tenant, JSON.stringify(atlasDoc({ "ZZ Xorgan": ["taban"] })), JSON.stringify(["ZZ Xorgan"])]);
    const before = (await su.query(`select document::text as d, updated_at from reflexology_atlas where tenant_id = $1`, [T.tenant])).rows[0];
    const route = await import("../../app/api/refleksoloji/atlas-report/route");

    // ── 1) Tümü ──
    let r = await route.POST(req(T, { exportMode: "all" }));
    H.ok(r.status === 200, "1a: Tümü → 200", r.status);
    let d = await readDocx(r);
    // İsteğe bağlı: gerçek Word ile açılabilirlik denetimi için dosyayı diske yaz (W07_DOCX_OUT=<klasör>).
    if (process.env.W07_DOCX_OUT) { mkdirSync(process.env.W07_DOCX_OUT, { recursive: true }); writeFileSync(path.join(process.env.W07_DOCX_OUT, "atlas-tumu.docx"), d.buf); }
    H.ok(d.hasContentTypes && d.xml.startsWith("<?xml") && d.buf.length < LIMIT, `1b: geçerli .docx (zip + [Content_Types] + document.xml), 4,4 MB altında (${(d.buf.length / 1048576).toFixed(2)} MB)`);
    H.ok(d.text.includes("Kayıtlı Atlas") && d.text.includes("Refleksoloji Atlas Raporu") && d.text.includes("Tüm Atlas Kayıtları"), "1c: kapak başlığı + alt başlık + kapsam");
    H.ok(d.media.length === 5 && ["— Taban", "— Yan İç", "— Yan Dış", "— Avuç İçi", "— El Sırtı"].every((t) => d.text.includes(t)), `1d: görünüm başına tek birleşik harita (5) + başlıklar (got ${d.media.length})`);
    H.ok(["Böbrek", "Kalp", "Karaciğer", "Mide", "Akciğer", "Dalak"].every((o) => d.text.includes(o)) && d.text.includes("Organlar ve Atlas Bölgeleri") && !d.text.includes("Seçilen Organlar ve Atlas Bölgeleri"), "1e: tüm organlar + atlas tablosu başlığı (protokol başlığı DEĞİL)");
    H.ok(d.footer.includes("Refleksoloji Atlas Raporu  ·  Sayfa") && !d.footer.includes("Protokol"), "1f: altbilgi atlas raporu adını taşır");
    H.ok(/Organ Sayısı:\s*6(?!\d)/.test(d.text) && /Toplam Atlas Bölgesi/.test(d.text) && d.text.includes("Bilgilendirme"), "1g: organ sayısı 6 + bölge sayısı + bilgilendirme");
    H.ok(/refleksoloji-atlas-tumu-\d{4}-\d{2}-\d{2}\.docx/.test(r.headers.get("content-disposition") ?? ""), "1h: dosya adı refleksoloji-atlas-tumu-YYYY-MM-DD.docx", r.headers.get("content-disposition"));
    H.ok(!d.text.includes("ZZ Xorgan"), "1i: başka uzmanın organı rapora girmez");

    // ── 2) Seçili ──
    r = await route.POST(req(T, { exportMode: "selected", organs: ["kalp", "Mide", "Kalp"] }));
    H.ok(r.status === 200, "2a: Seçili → 200", r.status);
    d = await readDocx(r);
    if (process.env.W07_DOCX_OUT) writeFileSync(path.join(process.env.W07_DOCX_OUT, "atlas-secili.docx"), d.buf);
    H.ok(d.text.includes("Kalp") && d.text.includes("Mide") && !d.text.includes("Böbrek") && !d.text.includes("Karaciğer") && !d.text.includes("Dalak"), "2b: yalnız seçilen organlar (kanonik eşleşme, tekrar bir kez)");
    H.ok(!/(^|[^A-Za-zÇĞİÖŞÜçğıöşü])kalp/.test(d.text), "2e: raporda kaydın kendi yazımı ('Kalp'), istekteki 'kalp' değil");
    H.ok(d.text.includes("Seçili Atlas Kayıtları") && /Organ Sayısı:\s*2(?!\d)/.test(d.text), "2c: kapsam 'Seçili' + organ sayısı 2");
    H.ok(/refleksoloji-atlas-secili-/.test(r.headers.get("content-disposition") ?? ""), "2d: dosya adı 'secili'");

    // ── 3) Bulunmayan ad ──
    r = await route.POST(req(T, { exportMode: "selected", organs: ["Dalak", "ZZ Olmayan"] }));
    d = r.status === 200 ? await readDocx(r) : d;
    H.ok(r.status === 200 && d.text.includes("Atlas bölgesi bulunmayan organlar") && d.text.includes("ZZ Olmayan"), "3a: olmayan ad 'bulunmayan' notunda", r.status);
    r = await route.POST(req(T, { exportMode: "selected", organs: ["ZZ Olmayan"] }));
    H.ok(r.status === 404, "3b: yalnız olmayan ad → 404", r.status);

    // ── 4) Tenant ──
    r = await route.POST(req(X, { exportMode: "all" }));
    d = r.status === 200 ? await readDocx(r) : d;
    H.ok(r.status === 200 && d.text.includes("ZZ Xorgan") && !["Böbrek", "Kalp", "Karaciğer"].some((o) => d.text.includes(o)), "4a: X yalnız kendi atlasını görür", r.status);
    r = await route.POST(req(X, { exportMode: "selected", organs: ["Böbrek", "Kalp"] }));
    H.ok(r.status === 404, "4b: X, T'nin organ adlarıyla rapor alamaz → 404", r.status);
    r = await route.POST(req(T, { exportMode: "all", tenantId: X.tenant, userId: X.id }));
    d = r.status === 200 ? await readDocx(r) : d;
    H.ok(r.status === 200 && !d.text.includes("ZZ Xorgan") && d.text.includes("Böbrek"), "4c: gövdedeki tenantId/userId yok sayılır (oturum tenant'ı)", r.status);

    // ── 5) Doğrulama ──
    const bad: [unknown, string][] = [
      [{ exportMode: "her-sey" }, "geçersiz mod"],
      [{ exportMode: "selected" }, "seçimsiz"],
      [{ exportMode: "selected", organs: [] }, "boş seçim"],
      [{ exportMode: "selected", organs: [42] }, "metin olmayan ad"],
      [{ exportMode: "selected", organs: ["  "] }, "boş ad"],
      [{ exportMode: "selected", organs: ["x".repeat(201)] }, "çok uzun ad"],
      [{ exportMode: "selected", organs: Array.from({ length: 501 }, (_, i) => `ZZ ${i}`) }, "501 ad"],
      ["[1,2]", "dizi gövde"],
      ["{bozuk", "bozuk JSON"],
    ];
    for (const [body, label] of bad) {
      r = await route.POST(req(T, body));
      H.ok(r.status === 400, `5: ${label} → 400`, r.status);
    }

    // ── 6) Yetki ──
    r = await route.POST(req(null, { exportMode: "all" }));
    H.ok(r.status === 401, "6a: oturumsuz 401", r.status);
    r = await route.POST(req(D, { exportMode: "all" }));
    H.ok(r.status === 403, "6b: demo 403", r.status);
    r = await route.POST(req(E, { exportMode: "all" }));
    H.ok(r.status === 404, "6c: atlası olmayan tenant → 404", r.status);

    // ── 7) Salt okuma ──
    const after = (await su.query(`select document::text as d, updated_at from reflexology_atlas where tenant_id = $1`, [T.tenant])).rows[0];
    const count = (await su.query(`select count(*)::int as n from reflexology_atlas`)).rows[0].n;
    H.ok(after.d === before.d && String(after.updated_at) === String(before.updated_at) && count === 2, "7: atlas satırları değişmedi (belge + updated_at + satır sayısı)");

    // ── 8) Protokol raporu korunur ──
    const pr = await su.query(`insert into reflexology_protocols(tenant_id, source_uid, title, target_problem, organs, application_notes) values ($1,'zz-w07-p','ZZ W07 Protokol','ZZ hedef','Kalp | Mide','ZZ not') returning id`, [T.tenant]);
    const protoRoute = await import("../../app/api/refleksoloji/protocol-report/route");
    r = await protoRoute.POST(mkReq("/api/refleksoloji/protocol-report", T, { exportMode: "single", protocolId: pr.rows[0].id }));
    d = r.status === 200 ? await readDocx(r) : d;
    H.ok(r.status === 200 && d.footer.includes("Refleksoloji Protokol Raporu  ·  Sayfa") && d.text.includes("Seçilen Organlar ve Atlas Bölgeleri") && d.text.includes("Refleksoloji Protokol Raporu") && !d.text.includes("Kayıtlı Atlas"), "8: protokol raporu altbilgisi + başlıkları değişmedi", r.status);
  } catch (e) {
    H.ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop();
    H.done();
  }
})();
