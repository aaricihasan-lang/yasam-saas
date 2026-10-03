/**
 * BİYOENERJİ SON KAPANIŞ — A1 / A2 / A4 GERÇEK ROUTE + GERÇEK POSTGRES HARNESS'I
 * (embedded-postgres + PostgREST shim: max-rows=1000, URL sınırı 8 KB; production'a SIFIR temas;
 * tüm veriler sentetik ZZ_*). Çalıştır: npx tsx scripts/bioenergy-presale-final/finalA1A4.harness.ts
 *
 *  A1  — XML 1.0 geçersiz karakterler: yazma yolu temizliği (6 kaynak + çakra bloğu), eski (temizlenmemiş)
 *        DB kayıtlarıyla 6 Word rotası × tek/seçili/tümü; document.xml Python expat (strict) ile doğrulanır.
 *  A2  — 6 kaynak × 1.300 kayıt (500 + 500 aynı sıralama değeri): sayfalı liste duplicate/missing 0, deterministik.
 *  A4-A — seçili Word 100/500/800/1200/2000 id; eksik/başka tenant/geçersiz id → 409; 5001 → 400; sıra korunur.
 *  A4-B — bioenergy_delete_rows: fonksiyon güvenliği, 100/500/800/1200/5000 silme, cross-tenant, zorla hata → 0 silme,
 *        RPC yokken fallback (yarım silme yok), RPC varken yeni yol.
 */
import Module from "node:module";
import path from "node:path";
import os from "node:os";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import JSZip from "jszip";
import pg from "pg";
import { SERVICE_KEY, ANON_KEY, readMig, startBioTestEnv, seedBio, type BioSeed } from "./bioTestEnv";
import { harness } from "./fakePostgrest";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const H = harness("bioenergy-presale-final/finalA1A4");
type Auth = { id: string; token: string } | null;
type Json = Record<string, unknown>;
const BASE = "http://localhost/api/biyoenerji";
const XML_DIR = path.join(os.tmpdir(), "bio-a1-xml");

function req(url: string, method: string, auth: Auth, body?: unknown, ua?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) { headers["x-user-id"] = auth.id; headers["x-session-token"] = auth.token; }
  if (ua) headers["user-agent"] = ua;
  return new NextRequest(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
async function j(res: Response): Promise<Json> { try { return (await res.clone().json()) as Json; } catch { return {}; } }
async function docXml(res: Response): Promise<string> {
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  return zip.file("word/document.xml")!.async("string");
}
const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [b[i], b[k]] = [b[k], b[i]]; } return b; };
const count = async (su: pg.Client, table: string, tenant: string, extra = "") =>
  (await su.query(`select count(*)::int n from public.${table} where tenant_id=$1 ${extra}`, [tenant])).rows[0].n as number;

/** XML 1.0 Char üretimi dışı karakter (Word'ün reddettiği) — bağımsız ikinci kontrol. */
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Python expat (strict XML 1.0 ayrıştırıcı) ile toplu doğrulama: dosya adı → "OK" | hata. */
function expatValidate(files: Record<string, string>): Record<string, string> {
  rmSync(XML_DIR, { recursive: true, force: true });
  mkdirSync(XML_DIR, { recursive: true });
  for (const [name, xml] of Object.entries(files)) writeFileSync(path.join(XML_DIR, name + ".xml"), xml, "utf8");
  const py = [
    "import sys, os, json, xml.parsers.expat as E",
    "d = sys.argv[1]; out = {}",
    "for f in sorted(os.listdir(d)):",
    "    p = E.ParserCreate()",
    "    try:",
    "        p.Parse(open(os.path.join(d, f), 'rb').read(), True); out[f[:-4]] = 'OK'",
    "    except Exception as e:",
    "        out[f[:-4]] = str(e)",
    "print(json.dumps(out))",
  ].join("\n");
  const r = spawnSync("python", ["-c", py, XML_DIR], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("python expat çalışmadı: " + r.stderr);
  return JSON.parse(r.stdout.trim()) as Record<string, string>;
}

// A1 — test dizisi (her biri ayrı + karışık)
const MARK = "ZZA1 ÇĞİÖŞÜ çğıöşü 🌿";
const SINGLE_CHARS: { name: string; ch: string; keep: boolean }[] = [
  { name: "TAB", ch: "\t", keep: true }, { name: "LF", ch: "\n", keep: true }, { name: "CR", ch: "\r", keep: true },
  { name: "NUL", ch: "\u0000", keep: false }, { name: "VT", ch: "\u000B", keep: false }, { name: "FF", ch: "\u000C", keep: false },
  { name: "ESC", ch: "\u001B", keep: false },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1c, 0x1d, 0x1e, 0x1f]
    .map((c) => ({ name: "C0-" + c.toString(16).padStart(2, "0"), ch: String.fromCharCode(c), keep: false })),
  { name: "U+FFFE", ch: "￾", keep: false }, { name: "U+FFFF", ch: "￿", keep: false },
  { name: "lone-high", ch: "\uD800", keep: false }, { name: "lone-low", ch: "\uDC00", keep: false },
  { name: "emoji-pair", ch: "🌿", keep: true }, { name: "tr-İı", ch: "İı", keep: true }, { name: "U+0085", ch: "\u0085", keep: true },
  { name: "U+D7FF", ch: "퟿", keep: true }, { name: "U+E000", ch: "", keep: true }, { name: "U+FFFD", ch: "�", keep: true },
];
// Postgres text NUL ve eşlenmemiş surrogate SAKLAYAMAZ → "eski DB kaydı" yalnız saklanabilen geçersizleri içerir.
const LEGACY_BAD = `${MARK} A\tB\nC VT[\u000B] FF[\u000C] ESC[\u001B] C01[\u0001] C1F[\u001F] NC[￾￿] SON`;
const API_BAD = `${MARK} A\tB\nC NUL[\u0000] VT[\u000B] FF[\u000C] ESC[\u001B] LONE[\uD800] SON`;
const API_CLEAN = `${MARK} A\tB\nC NUL[] VT[] FF[] ESC[] LONE[] SON`;

type Res = { resource: string; table: string; titleCol: string; longCol: string; route: string; singleKey: string; idsKey: string };
const RES: Res[] = [
  { resource: "sessions", table: "bioenergy_sessions", titleCol: "title", longCol: "content", route: "session-report", singleKey: "sessionId", idsKey: "sessionIds" },
  { resource: "energy-bodies", table: "bioenergy_energy_bodies", titleCol: "source_uid", longCol: "genel_tanim", route: "energy-body-report", singleKey: "id", idsKey: "ids" },
  { resource: "subconscious-causes", table: "bioenergy_subconscious_causes", titleCol: "title", longCol: "content", route: "subconscious-report", singleKey: "id", idsKey: "ids" },
  { resource: "imaginations", table: "bioenergy_imaginations", titleCol: "title", longCol: "text", route: "imagination-report", singleKey: "id", idsKey: "ids" },
  { resource: "symbols", table: "bioenergy_symbols", titleCol: "symbol", longCol: "meaning", route: "symbol-report", singleKey: "id", idsKey: "ids" },
  { resource: "chakras", table: "bioenergy_chakras", titleCol: "name", longCol: "notes", route: "chakra-report", singleKey: "chakraId", idsKey: "chakraIds" },
];
const ORDER: Record<string, { col: string; asc: boolean }> = {
  sessions: { col: "created_at", asc: false }, "energy-bodies": { col: "source_uid", asc: true },
  "subconscious-causes": { col: "title", asc: true }, imaginations: { col: "title", asc: true },
  symbols: { col: "title", asc: true }, chakras: { col: "name", asc: true },
};

(async () => {
  const env = await startBioTestEnv({ port: 54476, dirName: "bio-final-a1a4-pgdata", maxRows: 1000, maxUrlBytes: 8192 });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const seed: BioSeed = await seedBio(env.su);
  const su = env.su;
  const A = seed.users.A;
  // Ayrı tenant'lar (testler birbirini kirletmesin): C = A2 listeleri, D = A4 silme.
  const mkUser = async (label: string) => {
    const tenant = randomUUID(); const id = randomUUID(); const token = `zz-bio-tok-${label}-${id.slice(0, 8)}`;
    await su.query(`insert into public.tenants(id, name) values ($1,$2)`, [tenant, `ZZ_BIO_TENANT_${label}`]);
    await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id)
      values ($1,$2,$3,'expert',true,'approved','{"energy_body":true}','premium','premium',$4)`, [id, `ZZ_BIO_${label}`, `zz.bio.${label}@example.test`, tenant]);
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
    return { tenant, auth: { id, token } };
  };
  const C = await mkUser("c");
  const D = await mkUser("d");

  try {
    const { sanitizeBioenergyXmlText, sanitizeBioenergyRow } = await import("../../lib/biyoenerji/xmlSafeText");
    const { __resetRateLimitForTest } = await import("../../lib/security/rateLimit");
    const list = await import("../../app/api/biyoenerji/[resource]/route");
    const blocks = await import("../../app/api/biyoenerji/chakra-blocks/route");
    const routes: Record<string, { POST: (r: NextRequest) => Promise<Response> }> = {
      "session-report": await import("../../app/api/biyoenerji/session-report/route"),
      "energy-body-report": await import("../../app/api/biyoenerji/energy-body-report/route"),
      "subconscious-report": await import("../../app/api/biyoenerji/subconscious-report/route"),
      "imagination-report": await import("../../app/api/biyoenerji/imagination-report/route"),
      "symbol-report": await import("../../app/api/biyoenerji/symbol-report/route"),
      "chakra-report": await import("../../app/api/biyoenerji/chakra-report/route"),
    };
    const report = (route: string, auth: Auth, body: Json, ua?: string) => {
      __resetRateLimitForTest();
      return routes[route].POST(req(`${BASE}/${route}`, "POST", auth, body, ua));
    };

    // ════════════════════════ A1 ════════════════════════
    console.log("A1 — XML 1.0 geçersiz karakterler");
    let a1Unit = 0;
    for (const t of SINGLE_CHARS) {
      const out = sanitizeBioenergyXmlText(`x${t.ch}y`);
      const ok = t.keep ? out === `x${t.ch}y` : out === "xy";
      H.ok(ok, `A1-unit ${t.name}: ${t.keep ? "korunur" : "kaldırılır"} (çıktı=${JSON.stringify(out)})`);
      a1Unit++;
    }
    const mixedAll = SINGLE_CHARS.map((t) => t.ch).join("|");
    const mixedOut = sanitizeBioenergyXmlText(mixedAll);
    H.ok(!XML_ILLEGAL.test(mixedOut) && mixedOut.includes("🌿") && mixedOut.includes("İı") && mixedOut.includes("\t") && mixedOut.includes("\n") && mixedOut.includes("\r"),
      "A1-unit karışık dizi: geçersiz 0, TAB/LF/CR + emoji + Türkçe korunur");
    const rowIn = { id: "x", n: 5, nul: null, t: API_BAD };
    const rowOut = sanitizeBioenergyRow(rowIn);
    H.ok(rowOut.t === API_CLEAN && rowOut.n === 5 && rowOut.nul === null && rowIn.t === API_BAD, "A1-unit sanitizeBioenergyRow: yalnız string alanlar, giriş nesnesi değişmez");
    a1Unit += 2;

    // Katman 1 — yazma yolu (API): 6 kaynak POST + PATCH; çakra bloğu POST.
    let a1Write = 0;
    for (const r of RES) {
      let res = await list.POST(req(`${BASE}/${r.resource}`, "POST", A, { [r.titleCol]: `W ${API_BAD}`, [r.longCol]: API_BAD }), ctx({ resource: r.resource }));
      const row = (await j(res)).row as Json | undefined;
      const db = row ? (await su.query(`select ${r.titleCol} as t, ${r.longCol} as l from public.${r.table} where id=$1`, [row.id])).rows[0] : null;
      H.ok(res.status === 200 && db?.t === `W ${API_CLEAN}` && db?.l === API_CLEAN, `A1-write POST ${r.resource}: NUL/VT/FF/ESC/lone kaldırıldı, TAB/LF + Türkçe + emoji korundu (${res.status})`);
      res = await (await import("../../app/api/biyoenerji/[resource]/[id]/route")).PATCH(
        req(`${BASE}/${r.resource}/${row?.id}`, "PATCH", A, { [r.longCol]: `P ${API_BAD}` }), ctx({ resource: r.resource, id: String(row?.id) }));
      const db2 = (await su.query(`select ${r.longCol} as l from public.${r.table} where id=$1`, [row?.id])).rows[0];
      H.ok(res.status === 200 && db2?.l === `P ${API_CLEAN}`, `A1-write PATCH ${r.resource}: temizlendi (${res.status})`);
      await su.query(`delete from public.${r.table} where id=$1`, [row?.id]);
      a1Write += 2;
    }
    {
      const ch = (await su.query(`insert into bioenergy_chakras(tenant_id, name) values ($1,'ZZ A1 blok çakrası') returning id`, [seed.TA])).rows[0].id;
      const res = await blocks.POST(req(`${BASE}/chakra-blocks`, "POST", A, { chakraId: ch, section_key: "genel-bakis", block_type: "overview", block_title: `BT ${API_BAD}`, editorial_explanation: `BE ${API_BAD}` }));
      const b = (await su.query(`select block_title, editorial_explanation from bioenergy_chakra_blocks where chakra_id=$1`, [ch])).rows[0];
      H.ok(res.status === 200 && b?.block_title === `BT ${API_CLEAN}`.trim() && b?.editorial_explanation === `BE ${API_CLEAN}`, `A1-write çakra bloğu POST: başlık + açıklama temizlendi (${res.status})`);
      await su.query(`delete from bioenergy_chakras where id=$1`, [ch]);
      a1Write++;
    }

    // Katman 2 — eski (temizlenmemiş) DB kayıtları doğrudan SQL ile → 6 Word rotası × tek/seçili/tümü.
    await su.query(`update public.users set full_name=$1 where id=$2`, [`ZZ Uzman\u000B\u001B Ad`, A.id]);
    const legacyIds: Record<string, string[]> = {};
    for (const r of RES) {
      legacyIds[r.resource] = [];
      for (let i = 0; i < 3; i++) {
        const id = (await su.query(`insert into public.${r.table}(tenant_id, ${r.titleCol}, ${r.longCol}${r.resource === "symbols" ? ", title" : ""}) values ($1,$2,$3${r.resource === "symbols" ? ",$2" : ""}) returning id`,
          [seed.TA, `L${i} ${LEGACY_BAD}`, LEGACY_BAD])).rows[0].id as string;
        legacyIds[r.resource].push(id);
      }
    }
    // Çakra bloğu (eski, temizlenmemiş) — çakra raporunun blok yolu.
    await su.query(`insert into bioenergy_chakra_blocks(tenant_id, chakra_id, section_key, block_type, sort_order, block_title, editorial_explanation)
      values ($1,$2,'genel-bakis','overview',10,$3,$3)`, [seed.TA, legacyIds.chakras[0], `BLK ${LEGACY_BAD}`]);
    const stored = (await su.query(`select title from bioenergy_sessions where id=$1`, [legacyIds.sessions[0]])).rows[0].title as string;
    H.ok(/\u000B/.test(stored) && /\u001B/.test(stored), "A1-legacy: DB'de geçersiz karakterli eski kayıt gerçekten var (sanitizer atlanarak yazıldı)");

    const xmlFiles: Record<string, string> = {};
    let a1Docs = 0;
    for (const r of RES) {
      for (const mode of ["single", "selected", "all"] as const) {
        const body: Json = { exportMode: mode };
        if (mode === "single") body[r.singleKey] = legacyIds[r.resource][0];
        if (mode === "selected") body[r.idsKey] = legacyIds[r.resource];
        const res = await report(r.route, A, body);
        if (res.status !== 200) { H.ok(false, `A1-word ${r.route} ${mode} → 200 (${res.status} ${JSON.stringify(await j(res)).slice(0, 160)})`); continue; }
        const xml = await docXml(res);
        const key = `${r.route}-${mode}`;
        xmlFiles[key] = xml;
        H.ok(!XML_ILLEGAL.test(xml), `A1-word ${key}: document.xml'de XML 1.0 dışı karakter yok`);
        H.ok(xml.includes(MARK) && xml.includes("VT[]") && xml.includes("SON"), `A1-word ${key}: Türkçe + emoji korunur, kontrol karakteri kaldırılır (metin kaybı yok)`);
        H.ok(xml.includes("ZZ Uzman") , `A1-word ${key}: hazırlayan adı (kontrol karakterli) güvenle yazıldı`);
        if (r.route === "chakra-report" && mode !== "all") H.ok(xml.includes("BLK ") , `A1-word ${key}: eski blok metni rapora girdi`);
        a1Docs++;
      }
    }
    // Katman 2 olmasaydı (kanıt): aynı eski metin docx kütüphanesine HAM verilirse document.xml bozuk.
    {
      const docx = await import("docx");
      const doc = new docx.Document({ sections: [{ children: [new docx.Paragraph({ children: [new docx.TextRun(LEGACY_BAD)] })] }] });
      const buf = await docx.Packer.toBuffer(doc);
      xmlFiles["__raw-docx-without-sanitizer"] = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
    }
    const ex = expatValidate(xmlFiles);
    const routeDocs = Object.keys(ex).filter((k) => !k.startsWith("__"));
    const expatOk = routeDocs.filter((k) => ex[k] === "OK");
    H.ok(routeDocs.length === 18 && expatOk.length === 18, `A1-expat: 6 rota × 3 mod = ${expatOk.length}/18 document.xml strict XML olarak ayrıştı${routeDocs.length !== expatOk.length ? " — HATA: " + JSON.stringify(routeDocs.filter((k) => ex[k] !== "OK").map((k) => k + ": " + ex[k])) : ""}`);
    H.ok(ex["__raw-docx-without-sanitizer"] !== "OK", `A1-failing-first: temizleyici OLMADAN docx çıktısı expat'ta REDDEDİLİR (${ex["__raw-docx-without-sanitizer"]})`);
    console.log(`  A1 sayım: birim=${a1Unit}, yazma yolu=${a1Write}, Word belgesi=${a1Docs} (expat OK ${expatOk.length}/18)`);
    await su.query(`update public.users set full_name='ZZ_BIO_A' where id=$1`, [A.id]);
    for (const r of RES) await su.query(`delete from public.${r.table} where tenant_id=$1`, [seed.TA]);

    // ════════════════════════ A2 ════════════════════════
    console.log("A2 — 1.300 kayıt, yoğun eşit sıralama değeri, sayfalı liste");
    const N2 = 1300;
    for (const r of RES) {
      const o = ORDER[r.resource];
      if (o.col === "created_at") {
        await su.query(`insert into public.${r.table}(tenant_id, title, created_at)
          select $1, 'ZZ A2 '||g, case when g<=500 then timestamptz '2026-09-01 10:00:00+00' when g<=1000 then timestamptz '2026-09-02 10:00:00+00' else timestamptz '2026-09-03 10:00:00+00' + g * interval '1 second' end
          from generate_series(1,$2) g`, [C.tenant, N2]);
      } else {
        await su.query(`insert into public.${r.table}(tenant_id, ${o.col})
          select $1, case when g<=500 then 'Aynı Başlık' when g<=1000 then 'Diğer' else 'Karışık '||(g%37) end from generate_series(1,$2) g`, [C.tenant, N2]);
      }
      const expected = new Set((await su.query(`select id from public.${r.table} where tenant_id=$1`, [C.tenant])).rows.map((x) => x.id as string));
      const pageSize = r.resource === "subconscious-causes" ? 20 : 50;
      const runs: string[][] = [];
      for (let run = 0; run < 2; run++) {
        const got: string[] = [];
        for (let off = 0; off < N2 + pageSize; off += pageSize) {
          const res = await list.GET(req(`${BASE}/${r.resource}?offset=${off}&limit=${pageSize}`, "GET", C.auth), ctx({ resource: r.resource }));
          const rows = ((await j(res)).rows as Json[]) ?? [];
          got.push(...rows.map((x) => String(x.id)));
          if (rows.length < pageSize) break;
        }
        runs.push(got);
      }
      const uniq = new Set(runs[0]);
      const dup = runs[0].length - uniq.size;
      const missing = [...expected].filter((id) => !uniq.has(id)).length;
      const same = runs[0].length === runs[1].length && runs[0].every((id, i) => id === runs[1][i]);
      H.ok(expected.size === N2 && uniq.size === N2 && dup === 0 && missing === 0, `A2 ${r.resource}: beklenen ${expected.size} = benzersiz ${uniq.size}; duplicate ${dup}; missing ${missing} (sayfa ${pageSize})`);
      H.ok(same, `A2 ${r.resource}: iki ayrı tam okuma AYNI sıra (deterministik)`);
      // Eski sorgu (ikinci anahtar YOK) aynı veride — bilgi amaçlı (Postgres eşit değerlerde sıra garantisi vermez).
      const old: string[] = [];
      for (let off = 0; off < N2; off += pageSize) {
        const q = await su.query(`select id from public.${r.table} where tenant_id=$1 order by ${o.col} ${o.asc ? "asc" : "desc"} nulls last limit ${pageSize} offset ${off}`, [C.tenant]);
        old.push(...q.rows.map((x) => x.id as string));
      }
      const oldUniq = new Set(old).size;
      console.log(`  (bilgi) eski sorgu ${r.resource}: benzersiz ${oldUniq}/${N2}, duplicate ${old.length - oldUniq}, missing ${N2 - oldUniq}`);
    }

    // ════════════════════════ A4-A ════════════════════════
    console.log("A4-A — seçili Word, büyük id listesi");
    const WORDS = ["Zeytin", "Çam", "ağaç", "Şifa", "İz", "ırmak", "Ölçü", "Üzüm", "Bal", "Cennet", "Dağ", "Gül", "Ğ-son", "Hilal", "Kuş", "Su"];
    // Rapor sırası = created_at DESC + id (rota sözleşmesi). 40 farklı zaman → yoğun eşitlik, id ikinci anahtar.
    await su.query(`insert into bioenergy_symbols(tenant_id, symbol, title, category, meaning, created_at)
      select $1, 'ZZSYM'||lpad(g::text,4,'0'), (array[${WORDS.map((w) => `'${w}'`).join(",")}])[1 + g % ${WORDS.length}] || ' ' || (g % 7), 'Kat', 'anlam '||g,
        timestamptz '2026-09-01 10:00:00+00' + (g % 40) * interval '1 second' + (g % 3) * interval '1 millisecond'
      from generate_series(1,2000) g`, [seed.TA]);
    const symRows = (await su.query(`select id, symbol, title, created_at from bioenergy_symbols where tenant_id=$1`, [seed.TA])).rows as { id: string; symbol: string; title: string; created_at: Date }[];
    const coll = new Intl.Collator("tr");
    const symById = new Map(symRows.map((r) => [r.id, r]));
    // Seçili raporda bir işaretçinin kayıt başına kaç kez geçtiği (2 kayıtlık referans).
    let perRecord = 0;
    {
      const res = await report("symbol-report", A, { exportMode: "selected", ids: [symRows[0].id, symRows[1].id] });
      const xml = await docXml(res);
      const c0 = (xml.match(new RegExp(symRows[0].symbol, "g")) ?? []).length;
      const c1 = (xml.match(new RegExp(symRows[1].symbol, "g")) ?? []).length;
      perRecord = c0;
      H.ok(res.status === 200 && c0 >= 1 && c0 === c1, `A4-A referans: seçili raporda işaretçi kayıt başına ${c0} kez (${c0}/${c1})`);
    }
    // Eski yol kanıtı: tek `.in()` ile 800 id URL sınırını aşar.
    {
      const { createClient } = await import("@supabase/supabase-js");
      const raw = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
      const ids800 = symRows.slice(0, 800).map((r) => r.id);
      const r = await raw.from("bioenergy_symbols").select("id").eq("tenant_id", seed.TA).in("id", ids800);
      H.ok(r.error !== null, `A4-A failing-first: eski tek .in() 800 id → hata (${(r.error as { message?: string } | null)?.message?.slice(0, 60) ?? "hata yok!"})`);
    }
    const rejectedBefore = env.stats.rejectedUrl;
    for (const n of [100, 500, 800, 1200, 2000]) {
      const pick = shuffle(symRows).slice(0, n).map((r) => r.id);
      const t0 = Date.now();
      const res = await report("symbol-report", A, { exportMode: "selected", ids: pick });
      if (res.status !== 200) { H.ok(false, `A4-A ${n} id → 200 (${res.status} ${JSON.stringify(await j(res)).slice(0, 160)})`); continue; }
      const xml = await docXml(res);
      const marks = xml.match(/ZZSYM\d{4}/g) ?? [];
      const counts = new Map<string, number>();
      for (const m of marks) counts.set(m, (counts.get(m) ?? 0) + 1);
      const want = new Set(pick.map((id) => symById.get(id)!.symbol));
      const missing = [...want].filter((m) => !counts.has(m)).length;
      const extra = [...counts.keys()].filter((m) => !want.has(m)).length;
      const dup = [...counts.values()].filter((c) => c !== perRecord).length;
      const order: string[] = [];
      const seen = new Set<string>();
      for (const m of marks) if (!seen.has(m)) { seen.add(m); order.push(m); }
      const expOrder = pick.map((id) => symById.get(id)!).sort((a, b) => (b.created_at.getTime() - a.created_at.getTime()) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((r) => r.symbol);
      const orderOk = order.length === expOrder.length && order.every((m, i) => m === expOrder[i]);
      H.ok(missing === 0 && extra === 0 && dup === 0 && counts.size === n, `A4-A ${n} id: rapordaki kayıt ${counts.size}/${n}; missing ${missing}; fazladan ${extra}; tekrar ${dup} (${Date.now() - t0} ms)`);
      H.ok(orderOk, `A4-A ${n} id: istek sırasından bağımsız, rota sırası korunur (created_at DESC + id)`);
    }
    H.ok(env.stats.rejectedUrl === rejectedBefore, `A4-A: hiçbir parça isteği URL sınırına takılmadı (en uzun URL ${env.stats.maxUrl} bayt)`);
    {
      const base = symRows.slice(0, 300).map((r) => r.id);
      let res = await report("symbol-report", A, { exportMode: "selected", ids: [...base, randomUUID()] });
      H.ok(res.status === 409 && /bulunamadı/.test(String((await j(res)).error)), `A4-A silinmiş/olmayan id → 409, eksik rapor YOK (${res.status})`);
      const bId = (await su.query(`insert into bioenergy_symbols(tenant_id, symbol, title) values ($1,'ZZ_B_SYM','ZZ_B_SYM') returning id`, [seed.TB])).rows[0].id;
      res = await report("symbol-report", A, { exportMode: "selected", ids: [...base, bId] });
      H.ok(res.status === 409, `A4-A başka tenant id → 409 (B kaydı rapora girmez) (${res.status})`);
      res = await report("symbol-report", A, { exportMode: "selected", ids: [...base, "not-a-uuid"] });
      H.ok(res.status === 409, `A4-A geçersiz uuid → 409 (500/22P02 değil) (${res.status})`);
      res = await report("symbol-report", A, { exportMode: "selected", ids: [...base, ...base.slice(0, 50)] });
      const xml = res.status === 200 ? await docXml(res) : "";
      const n = new Set(xml.match(/ZZSYM\d{4}/g) ?? []).size;
      H.ok(res.status === 200 && n === 300, `A4-A tekrar eden id → kayıt bir kez (${n}/300)`);
      res = await report("symbol-report", A, { exportMode: "selected", ids: Array.from({ length: 5001 }, () => randomUUID()) });
      H.ok(res.status === 400 && /5000/.test(String((await j(res)).error)), `A4-A 5001 id → 400 (üst sınır 5000) (${res.status})`);
      res = await report("symbol-report", A, { exportMode: "selected", ids: symRows.map((r) => r.id).concat(Array.from({ length: 3000 }, () => randomUUID())).slice(0, 5000) });
      H.ok(res.status === 409, `A4-A tam 5000 id (2000 var + 3000 yok) → sınır içinde, eksik → 409 (${res.status})`);
      res = await report("symbol-report", A, { exportMode: "single", id: "not-a-uuid" });
      H.ok(res.status === 404, `A4-A tek modda geçersiz id → 404 (${res.status})`);
      res = await report("symbol-report", A, { exportMode: "selected", ids: base }, "Mozilla/5.0 (Linux; Android 14; Pixel 8)");
      H.ok(res.status === 403, `Android UA → Word 403 (${res.status})`);
      res = await report("symbol-report", null, { exportMode: "selected", ids: base });
      H.ok(res.status === 401, `oturumsuz Word → 401 (${res.status})`);
      res = await report("symbol-report", seed.users.NOMOD, { exportMode: "selected", ids: base });
      H.ok(res.status === 403, `modül izni yok Word → 403 (${res.status})`);
    }
    // Ortak yol: diğer 4 kayıt rotası + çakra — 500 seçili + eksik → 409.
    for (const r of RES.filter((x) => x.resource !== "symbols")) {
      const n = r.resource === "chakras" ? 300 : 500;
      await su.query(`insert into public.${r.table}(tenant_id, ${r.titleCol}) select $1, 'ZZR'||lpad(g::text,4,'0') from generate_series(1,$2) g`, [seed.TA, n + 100]);
      const ids = shuffle((await su.query(`select id from public.${r.table} where tenant_id=$1`, [seed.TA])).rows.map((x) => x.id as string)).slice(0, n);
      let res = await report(r.route, A, { exportMode: "selected", [r.idsKey]: ids });
      const xml = res.status === 200 ? await docXml(res) : "";
      const got = new Set(xml.match(/ZZR\d{4}/g) ?? []).size;
      H.ok(res.status === 200 && got === n, `A4-A ${r.route} ${n} seçili → ${got}/${n} (${res.status})`);
      res = await report(r.route, A, { exportMode: "selected", [r.idsKey]: [...ids, randomUUID()] });
      H.ok(res.status === 409, `A4-A ${r.route} eksik id → 409 (${res.status})`);
      res = await report(r.route, A, { exportMode: "selected", [r.idsKey]: Array.from({ length: 5001 }, () => randomUUID()) });
      H.ok(res.status === 400, `A4-A ${r.route} 5001 → 400 (${res.status})`);
    }
    // Metin sıralı rota (energy-body-report: source_uid ASC): Türkçe baş harfler "Z"den sonraya düşmez.
    {
      await su.query(`delete from bioenergy_energy_bodies where tenant_id=$1`, [seed.TA]);
      const names = ["Zihinsel", "Çakrasal", "Şifa", "İçsel", "ırmak", "Öz", "Ünlü", "Astral", "eterik", "Gölge", "Ğ test", "Sakin", "Cesur", "Duygusal"];
      for (let i = 0; i < 300; i++) await su.query(`insert into bioenergy_energy_bodies(tenant_id, source_uid) values ($1,$2)`, [seed.TA, `${names[i % names.length]} ZZE${String(i).padStart(4, "0")}`]);
      const rows = (await su.query(`select id, source_uid from bioenergy_energy_bodies where tenant_id=$1`, [seed.TA])).rows as { id: string; source_uid: string }[];
      const res = await report("energy-body-report", A, { exportMode: "selected", ids: shuffle(rows).map((r) => r.id) });
      const xml = res.status === 200 ? await docXml(res) : "";
      const seen = new Set<string>(); const order: string[] = [];
      for (const m of xml.match(/ZZE\d{4}/g) ?? []) if (!seen.has(m)) { seen.add(m); order.push(m); }
      const exp = [...rows].sort((a, b) => coll.compare(a.source_uid, b.source_uid) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((r) => r.source_uid.slice(-7));
      H.ok(res.status === 200 && order.length === 300 && order.every((m, i) => m === exp[i]), `A4-A energy-body seçili 300: Türkçe harmanlama sırası (Ç/Ş/İ/Ö/Ü doğru yerde) (${order.length})`);
      await su.query(`delete from bioenergy_energy_bodies where tenant_id=$1`, [seed.TA]);
    }
    H.ok(env.stats.maxReturned <= 1000, `hiçbir yanıt max-rows'u aşmadı (en çok ${env.stats.maxReturned})`);

    // ════════════════════════ A4-B ════════════════════════
    console.log("A4-B — atomik toplu silme");
    const T = "bioenergy_imaginations";
    const ins = async (tenant: string, n: number, label: string) =>
      (await su.query(`insert into public.${T}(tenant_id, title) select $1, $2||'-'||g from generate_series(1,$3) g returning id`, [tenant, label, n])).rows.map((x) => x.id as string);
    const del = (auth: Auth, body: Json) => list.DELETE(req(`${BASE}/imaginations`, "DELETE", auth, body), ctx({ resource: "imaginations" }));
    const control = await ins(D.tenant, 25, "ZZ_KONTROL"); // hiçbir testte silinmemeli
    const ctrlOk = async () => (await su.query(`select count(*)::int n from public.${T} where id = any($1)`, [control])).rows[0].n === 25;

    // TEST 7 — RPC YOK (migration uygulanmadan): fallback.
    {
      const fnExists = (await su.query(`select to_regprocedure('public.bioenergy_delete_rows(text, uuid, uuid[])') is not null e`)).rows[0].e;
      H.ok(!fnExists, "T7 ön koşul: fonksiyon henüz YOK (production'daki bugünkü durum)");
      const ids100 = await ins(D.tenant, 100, "ZZ_T7_100");
      const rpc0 = env.stats.rpcCalls["rpc/bioenergy_delete_rows"] ?? 0;
      let res = await del(D.auth, { ids: ids100 });
      H.ok(res.status === 200 && (await j(res)).deleted === 100 && (await su.query(`select count(*)::int n from public.${T} where id=any($1)`, [ids100])).rows[0].n === 0,
        `T7 RPC yok + 100 id → mevcut tek-ifade .in() yolu, 100 silindi (${res.status})`);
      H.ok((env.stats.rpcCalls["rpc/bioenergy_delete_rows"] ?? 0) === rpc0, "T7 ≤150 id → RPC hiç çağrılmaz");
      const ids800 = await ins(D.tenant, 800, "ZZ_T7_800");
      const del0 = env.stats.deletes;
      res = await del(D.auth, { ids: ids800 });
      const left = (await su.query(`select count(*)::int n from public.${T} where id=any($1)`, [ids800])).rows[0].n;
      H.ok(res.status === 500 && /Hiçbir kayıt silinmedi/.test(String((await j(res)).error)) && left === 800,
        `T7 RPC yok + 800 id → açık hata, YARIM SİLME YOK: kalan ${left}/800 (${res.status})`);
      H.ok((env.stats.rpcCalls["rpc/bioenergy_delete_rows"] ?? 0) === rpc0 + 1 && env.stats.deletes === del0, "T7 800 id → RPC denendi (PGRST202), .in() isteği URL sınırında DB'ye ulaşmadı (parça DELETE yok)");
      await su.query(`delete from public.${T} where id=any($1)`, [ids800]);
    }

    // Migration'ı uygula (repo dosyası, byte-exact) — iki kez (idempotent).
    const MIG = "20271003000100_bioenergy_delete_rows_rpc.sql";
    // Supabase varsayılanı: public şemasında yeni fonksiyonlara anon/authenticated EXECUTE verilir.
    // Migration'ın REVOKE'u bu GERÇEK başlangıç durumuna karşı doğrulanır.
    await su.query(`alter default privileges in schema public grant execute on functions to anon, authenticated, service_role`);
    await su.query(readMig(MIG));
    await su.query(readMig(MIG));
    H.ok(true, "migration iki kez uygulandı (idempotent, hata yok)");
    {
      const f = (await su.query(`select p.prosecdef, p.proconfig, pg_get_function_result(p.oid) res, pg_get_function_identity_arguments(p.oid) args,
          has_function_privilege('anon', p.oid, 'EXECUTE') anon_x, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x,
          has_function_privilege('service_role', p.oid, 'EXECUTE') svc_x,
          exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type='EXECUTE') public_x
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='bioenergy_delete_rows'`)).rows;
      H.ok(f.length === 1, `fonksiyon tek imza (${f.length})`);
      const x = f[0];
      H.ok(x.args === "p_table text, p_tenant_id uuid, p_ids uuid[]" && x.res === "integer", `imza (${x.args}) → ${x.res}`);
      H.ok(x.prosecdef === false, "SECURITY INVOKER (DEFINER değil)");
      H.ok(Array.isArray(x.proconfig) && x.proconfig.some((c: string) => /^search_path=public, pg_temp$/.test(c)), `search_path sabit (${JSON.stringify(x.proconfig)})`);
      H.ok(x.anon_x === false && x.auth_x === false && x.public_x === false && x.svc_x === true, `EXECUTE: PUBLIC=${x.public_x} anon=${x.anon_x} authenticated=${x.auth_x} service_role=${x.svc_x}`);
    }
    const victim = await ins(D.tenant, 3, "ZZ_DIRECT");
    const callAs = async (role: string, args: unknown[], cast = "$3::uuid[]") => {
      const c = new pg.Client({ host: "127.0.0.1", port: env.port, user: "postgres", password: "testpw", database: "postgres" });
      await c.connect();
      try {
        await c.query(`set role ${role}`);
        const r = await c.query(`select public.bioenergy_delete_rows($1, $2, ${cast}) v`, args);
        return { v: r.rows[0].v as number, code: null as string | null };
      } catch (e) { return { v: null, code: (e as { code?: string }).code ?? "ERR" }; } finally { await c.end(); }
    };
    {
      let r = await callAs("anon", [T, D.tenant, victim]);
      H.ok(r.code === "42501", `anon doğrudan çağrı → 42501 permission denied (${r.code})`);
      r = await callAs("authenticated", [T, D.tenant, victim]);
      H.ok(r.code === "42501", `authenticated doğrudan çağrı → 42501 (${r.code})`);
      for (const bad of ["users", "user_sessions", "bioenergy_chakra_blocks", "BIOENERGY_IMAGINATIONS", "public.bioenergy_imaginations", `${T}; drop table public.users; --`, `${T}" where true; --`, ""]) {
        r = await callAs("service_role", [bad, D.tenant, victim]);
        H.ok(r.code === "22023", `izin listesi dışı tablo ${JSON.stringify(bad).slice(0, 48)} → 22023 (${r.code})`);
      }
      r = await callAs("service_role", [null, D.tenant, victim]);
      H.ok(r.code === "22023", `tablo NULL → 22023 (${r.code})`);
      r = await callAs("service_role", [T, null, victim]);
      H.ok(r.code === "22023", `tenant NULL → 22023 (${r.code})`);
      r = await callAs("service_role", [T, D.tenant, []]);
      H.ok(r.v === 0, `boş dizi → 0 (${r.v})`);
      r = await callAs("service_role", [T, D.tenant, null]);
      H.ok(r.v === 0, `NULL dizi → 0 (${r.v})`);
      r = await callAs("service_role", [T, D.tenant, `{{${victim[0]},${victim[1]}},{${randomUUID()},${randomUUID()}}}`]);
      H.ok(r.v === 2, `2-boyutlu dizi → tüm elemanlar sayılır, 2 silinir (${r.v})`);
      await su.query(`insert into public.${T}(id, tenant_id, title) values ($1,$3,'ZZ_DIRECT'),($2,$3,'ZZ_DIRECT')`, [victim[0], victim[1], D.tenant]);
      {
        const big = Array.from({ length: 2600 }, () => randomUUID());
        const two = `{${[big.slice(0, 2600), [...big.slice(0, 2599), victim[0]]].map((row) => `{${row.join(",")}}`).join(",")}}`;
        r = await callAs("service_role", [T, D.tenant, two]);
        H.ok(r.code === "22023" && (await su.query(`select count(*)::int n from public.${T} where id=$1`, [victim[0]])).rows[0].n === 1, `2-boyutlu 2×2600 dizi → 5000 sınırı aşılamaz (22023) (${r.code})`);
      }
      r = await callAs("service_role", [T, D.tenant, ["not-a-uuid"]]);
      H.ok(r.code === "22P02", `geçersiz uuid → 22P02 kontrollü hata (${r.code})`);
      r = await callAs("service_role", [T, D.tenant, (Array.from({ length: 5001 }, () => randomUUID()) as string[]).concat(victim)]);
      H.ok(r.code === "22023" && (await su.query(`select count(*)::int n from public.${T} where id=any($1)`, [victim])).rows[0].n === 3, `5001+ id → 22023, hiçbir şey silinmez (${r.code})`);
      r = await callAs("service_role", [T, seed.TB, victim]);
      H.ok(r.v === 0 && (await su.query(`select count(*)::int n from public.${T} where id=any($1)`, [victim])).rows[0].n === 3, `yanlış tenant parametresi → 0 silinir (${r.v})`);
      r = await callAs("service_role", [T, D.tenant, [victim[0], victim[0], victim[1]]]);
      H.ok(r.v === 2, `tekrar eden id → benzersiz silinen sayısı 2 (${r.v})`);
      await su.query(`delete from public.${T} where id=any($1)`, [victim]);
    }

    // TEST 1–4 (+5000) — route, RPC varken.
    for (const n of [100, 500, 800, 1200, 5000]) {
      const ids = await ins(D.tenant, n, `ZZ_T_${n}`);
      const rpc0 = env.stats.rpcCalls["rpc/bioenergy_delete_rows"] ?? 0;
      const t0 = Date.now();
      const res = await del(D.auth, { ids: shuffle(ids) });
      const left = (await su.query(`select count(*)::int n from public.${T} where id=any($1)`, [ids])).rows[0].n;
      const viaRpc = (env.stats.rpcCalls["rpc/bioenergy_delete_rows"] ?? 0) === rpc0 + 1;
      H.ok(res.status === 200 && (await j(res)).deleted === n && left === 0, `T ${n} id → ${(await j(res)).deleted} silindi, kalan ${left} (${res.status}, ${Date.now() - t0} ms)`);
      H.ok(n <= 150 ? !viaRpc : viaRpc, `T ${n} id → yol: ${viaRpc ? "RPC (gövdede uuid[])" : ".in() (≤150)"}`);
    }
    H.ok(await ctrlOk(), "kontrol kayıtları (25) hiçbir silmeden etkilenmedi");
    // TEST 5 — cross-tenant: liste içinde B kayıtları + gövdede tenant_id=B.
    {
      const mine = await ins(D.tenant, 600, "ZZ_T5_A");
      const theirs = await ins(seed.TB, 50, "ZZ_T5_B");
      const res = await del(D.auth, { ids: shuffle([...mine, ...theirs]), tenant_id: seed.TB });
      const leftMine = (await su.query(`select count(*)::int n from public.${T} where id=any($1)`, [mine])).rows[0].n;
      const leftB = (await su.query(`select count(*)::int n from public.${T} where id=any($1)`, [theirs])).rows[0].n;
      H.ok(res.status === 200 && (await j(res)).deleted === 600 && leftMine === 0 && leftB === 50,
        `T5 cross-tenant (600 kendi + 50 B, gövdede tenant_id=B): silinen ${(await j(res)).deleted}; B kalan ${leftB}/50 (tenant sunucuda oturumdan)`);
      const small = await ins(seed.TB, 10, "ZZ_T5_B_small");
      const res2 = await del(D.auth, { ids: small });
      H.ok(res2.status === 200 && (await j(res2)).deleted === 0 && (await su.query(`select count(*)::int n from public.${T} where id=any($1)`, [small])).rows[0].n === 10,
        "T5 yalnız B id'leri (kısa liste, .in() yolu) → 0 silinir, B sağlam");
      await su.query(`delete from public.${T} where tenant_id=$1`, [seed.TB]);
    }
    // 5001 → 400, hiçbir şey silinmez.
    {
      const ids = await ins(D.tenant, 20, "ZZ_CAP");
      const res = await del(D.auth, { ids: [...ids, ...Array.from({ length: 4981 }, () => randomUUID())] });
      H.ok(res.status === 400 && (await su.query(`select count(*)::int n from public.${T} where id=any($1)`, [ids])).rows[0].n === 20, `5001 id → 400, hiçbir kayıt silinmedi (${res.status})`);
      await su.query(`delete from public.${T} where id=any($1)`, [ids]);
    }
    // TEST 6 — zorla atomik hata: satır tetikleyicisi, bomba fiziksel olarak SON satır (öncekiler silinmiş olur).
    {
      await su.query(`create or replace function public.zz_bomb() returns trigger language plpgsql as $$
        begin if old.title = 'ZZ_BOMB' then raise exception 'ZZ zorla hata'; end if; return old; end $$;
        create trigger zz_bomb before delete on public.${T} for each row execute function public.zz_bomb();`);
      for (const n of [1200, 120]) {
        const ids = await ins(D.tenant, n - 1, `ZZ_T6_${n}`);
        const bomb = (await su.query(`insert into public.${T}(tenant_id, title) values ($1,'ZZ_BOMB') returning id`, [D.tenant])).rows[0].id as string;
        const all = [...ids, bomb];
        const del0 = env.stats.deletes;
        const rpc0 = env.stats.rpcCalls["rpc/bioenergy_delete_rows"] ?? 0;
        const res = await del(D.auth, { ids: all });
        const left = (await su.query(`select count(*)::int n from public.${T} where id=any($1)`, [all])).rows[0].n;
        const usedRpc = (env.stats.rpcCalls["rpc/bioenergy_delete_rows"] ?? 0) === rpc0 + 1;
        H.ok(res.status === 500 && left === n && /Hiçbir kayıt silinmedi/.test(String((await j(res)).error)),
          `T6 ${n} id (${usedRpc ? "RPC" : ".in()"}) + son satırda zorla hata → 500, kalan ${left}/${n} (deleted=0, yarım silme YOK)`);
        if (usedRpc) H.ok(env.stats.deletes === del0, "T6 RPC hatası → .in() fallback'ine DÜŞÜLMEZ (ikinci DELETE denemesi yok)");
        await su.query(`alter table public.${T} disable trigger zz_bomb`);
        await su.query(`delete from public.${T} where id=any($1)`, [all]);
        await su.query(`alter table public.${T} enable trigger zz_bomb`);
      }
      await su.query(`drop trigger zz_bomb on public.${T}; drop function public.zz_bomb();`);
    }
    // Tümünü Sil (BIO-13) RPC'den etkilenmez.
    {
      const before = await count(su, T, D.tenant);
      let res = await del(D.auth, { all: true, expectedCount: before + 1 });
      H.ok(res.status === 409 && (await count(su, T, D.tenant)) === before, `Tümünü Sil yanlış sayı → 409, hiçbir şey silinmedi (${res.status})`);
      res = await del(null, { ids: control });
      H.ok(res.status === 401 && (await ctrlOk()), `oturumsuz silme → 401 (${res.status})`);
      res = await del(seed.users.NOMOD, { ids: control });
      H.ok(res.status === 403 && (await ctrlOk()), `modül izni yok silme → 403 (${res.status})`);
      res = await del(seed.users.DEMO, { ids: control });
      const dj = await j(res);
      H.ok(res.status === 200 && dj.demo === true && dj.deleted === 0 && (await ctrlOk()), `demo hesap silme → {demo:true, deleted:0}, hiçbir şey silinmez (${res.status})`);
    }
    H.ok(await ctrlOk(), "SON: kontrol kayıtları sağlam");
  } finally {
    await env.stop();
  }
  H.done();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
