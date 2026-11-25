// ============================================================
// A3 / QA-N-01 — OKUNABİLİR çıktılar ekran yetki kuralına uyar; TEKNİK JSON yedeği ham kalır.
// (PGlite; ağ / sır / production YOK; yalnız SENTETİK veri; gerçek Numeroloji motoru.)
//
//   [R1] Saf görünüm: yetkili → AYNI dizi (bayt eşitliğinin temeli); yetkisiz → kopya süzülür, girdi değişmez.
//   [R2] Yetkisiz görünümde başlamamış Değişim / Zirve / Mücadele / Harf dönemi YOK (yapısal denetim);
//        yer tutucular (999 / 9999 / -1) belgeye "gizli" olarak yazılır.
//   [R3] Profil → görünüm kararı (sunucu): uzman (modül + alt yetki) / (yalnız modül) / (alt yetki, modül kapalı) /
//        admin / profil yok / HD Sistem Yorumu.
//   [R4] Ayarlar › Dışa Aktarım "Okunabilir Arşiv" Word (buildReadableExport): yetkisiz → gelecek yıl belirteci 0 +
//        açıklama notu; yetkili → belge (docProps/core.xml zaman damgası hariç) değişiklik ÖNCESİ algoritmayla BAYT-EŞİT.
//   [R5] Premium Word Arşivi "Kayıt Dökümü" parçası (handleArchivePart → buildDataPart): aynı kurallar;
//        görünüm verilmeden çağrı → KISITLI (fail-closed).
//   [R6] HD: yetkisiz → Sistem Yorumu belgede yok; yetkili → var.
//   [R7] TEKNİK YEDEK (backup/table) HAM kalır: analysis_data DB ile birebir (geri yükleme bütünlüğü; A3 (c)).
//   [R8] Statik: tüm erişim yolları — export route profil + görünüm; arşiv parça yolu görünüm; Numeroloji / danışan
//        dosyası rapor üreticileri canSeeNumerologyFutureYears; JSON yedek yolu görünüm İÇERMEZ (bilinçli).
//   [L1] A16 dil: katalogdaki TR metinleri kod sabitleriyle BİREBİR (aynı girdilerde aynı çıktı).
//   [L2] EN Okunabilir Arşiv: sistem metinleri EN, Türkçe sistem metni yok, w:lang en-GB; yetkisiz EN görünüm de süzülü.
//   [L3] TR açık seçim = parametresiz çağrı = değişiklik öncesi algoritma (bayt-eşit).
//   [L4] Arşiv parçası dili PLANDA sabit: file_locale en → EN içerik; geçersiz / yok / kapı kapalı → TR; yol adı dil-sabit.
//   [L5] İstemci: TR planda parça gövdesi bugünküyle aynı; EN planda her parçada aynı file_locale.
//
// Çalıştırma: npx tsx scripts/settings-backup-i18n/readable-view.pg.harness.mts
// ============================================================
import Module from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeDb, type Row } from "./pgSupabase.mjs";

// Yayın kapısı bu süreçte AÇIK (L bölümleri); kapalı davranış L4'te ayrıca denenir.
process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = "on";

{
  // "server-only" yalnız bu süreçte boş modüle yönlendirilir (archive.harness ile aynı yöntem).
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const { hesaplaNumeroloji } = await import("../../lib/numeroloji/numerolojiMotor");
const { currentIstanbulYear } = await import("../../lib/numeroloji/currentYear");
const { applyReadableView, readableViewFor, restrictedReadableView } = await import("../../lib/backup/readableView");
const { buildReadableExport } = await import("../../lib/backup/readableExport");
const { exportTableAll } = await import("../../lib/backup/engine");
const { MODULE_LABELS, tablesForModule } = await import("../../lib/backup/registry");
const { buildArchiveDocx, WORD_RECORD_BUDGET } = await import("../../lib/backup/wordExport");
const { handleBackupTableRequest } = await import("../../lib/backup/service");
const { buildDataPart } = await import("../../lib/archive/server/data");
const { handleArchivePart } = await import("../../lib/archive/server/handlers");
const { HD_REPORT_V2_SCHEMA_VERSION } = await import("../../lib/human-design/reporting/reportSnapshotV2");
const { SOURCE_FILE_TEXT, catalogFileText, backupFileText } = await import("../../lib/backup/fileText");
const { runArchive } = await import("../../lib/archive/client");

let pass = 0;
let fail = 0;
const ok = (n: string, c: unknown, e: unknown = "") => {
  if (c) {
    pass++;
    console.log(`  ✓ ${n}`);
  } else {
    fail++;
    console.log(`  ✗ ${n} ${typeof e === "string" ? e : JSON.stringify(e).slice(0, 500)}`);
  }
};
const section = (s: string) => console.log(`\n${s}`);

const NOW = new Date("2026-11-25T09:30:00.000Z");
const CY = currentIstanbulYear(NOW);
const TA = "aaaaaaaa-0000-4000-8000-00000000000a";
const UA = "aaaaaaaa-1111-4000-8000-00000000000a";
const id = (p: string, n: number) => `${p}-${String(n).padStart(4, "0")}-4000-8000-000000000000`;

// ── Sentetik kişiler (gerçek motor) ──
const PEOPLE = [
  { name: "Yedek", surname: "Örnekçi", bd: "15.06.1990", iso: "1990-06-15" },
  { name: "Artık", surname: "Yıl", bd: "29.02.1996", iso: "1996-02-29" },
  { name: "Genç", surname: "Kişi", bd: "02.01.2019", iso: "2019-01-02" },
];
const motorOf = (p: (typeof PEOPLE)[number]) =>
  JSON.parse(JSON.stringify(hesaplaNumeroloji({ firstName: p.name, lastName: p.surname, birthDate: p.bd }))) as Row;
const numRows: Row[] = PEOPLE.map((p, i) => ({
  id: id("11111111", i + 1),
  tenant_id: TA,
  client_id: null,
  name: p.name,
  surname: p.surname,
  birth_date: p.iso,
  created_at: "2026-02-02T10:00:00.000Z",
  analysis_data: { version: 1, motor: motorOf(p), summary: "özet" },
}));

const HD_SECRET = "SISTEM-YORUMU-GIZLI-METIN-7f3a";
const hdSnapshot = {
  schemaVersion: HD_REPORT_V2_SCHEMA_VERSION,
  generatedAt: "2026-03-01T10:00:00.000Z",
  client: { name: "HD Danışan" },
  chart: { chartId: id("22222222", 9) },
  identity: { type: "Generator" },
  activations: { status: "ok" },
  centers: [],
  channels: [],
  gates: [],
  commentary: { expert: { entries: [] }, system: { status: "included", reading: { summary: HD_SECRET } } },
  bodygraph: { status: "missing" },
};
const hdRows: Row[] = [
  { id: id("33333333", 1), tenant_id: TA, user_id: UA, client_id: null, chart_id: null, title: "HD Raporu", report_kind: "canonical", snapshot: hdSnapshot, created_at: "2026-03-01T10:00:00.000Z" },
];

// ── Profiller ──
const P_FULL = { role: "expert", module_permissions: { numerology: true, numerology_future_years: true, human_design: true, hd_system_reading: true } };
const P_MOD = { role: "expert", module_permissions: { numerology: true, human_design: true } };
const P_SUB_ONLY = { role: "expert", module_permissions: { numerology: false, numerology_future_years: true } };
const P_STRING = { role: "expert", module_permissions: { numerology: true, numerology_future_years: "true" } };
const P_ADMIN = { role: "admin", module_permissions: {} };

// ── Yardımcılar ──
type Seg = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : null);
/** Yapısal: görünür her dönem başlangıç yılı ≤ CY; yer tutucu sayısı kalmamış. */
function futureLeaks(motor: Row, birthYear: number): string[] {
  const out: string[] = [];
  const z = motor.zirveYillari as Seg | undefined;
  for (const p of (z?.peaks as Seg[] | undefined) ?? []) {
    for (const k of ["age", "yasMetot1", "yasMetot2"]) {
      const a = num(p[k]);
      if (a !== null && birthYear + a > CY) out.push(`zirve.${k}=${a}`);
    }
  }
  const m = motor.mucadeleYillari as Seg | undefined;
  for (const it of (m?.method1 as Seg[] | undefined) ?? []) {
    const a = num(it.startAge);
    if (a !== null && birthYear + a > CY) out.push(`mucadele.startAge=${a}`);
  }
  const ana = num(m?.anaMucadeleBaslangicYasi);
  if (ana !== null && birthYear + ana > CY) out.push(`anaMucadele=${ana}`);
  for (const s of (motor.harflerinYankilanisi as Seg[] | undefined) ?? []) {
    const ys = num(s.yearStart) ?? (num(s.ageStart) !== null ? birthYear + num(s.ageStart)! : null);
    if (ys !== null && ys > CY) out.push(`harf.yearStart=${ys}`);
  }
  for (const k of ["degisimDonusumMetni", "zirveYillariMetni", "mucadeleYillariMetni", "harflerinYankilanisiMetni"]) {
    const t = String(motor[k] ?? "");
    if (t.split(/\r?\n/).filter((l) => l.trim()).length > 1) out.push(`${k} çok satır`);
  }
  const js = JSON.stringify(motor);
  if (/[:,\[]\s*(999|9999|-1)\s*[,}\]]/.test(js.replace(/"[^"]*"/g, '""'))) out.push("yer tutucu sayı kaldı");
  return out;
}
async function docxText(buf: Buffer | Uint8Array): Promise<string> {
  const z = await JSZip.loadAsync(buf);
  const xml = (await z.file("word/document.xml")?.async("string")) ?? "";
  return Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => m[1]).join("\n");
}
async function docxEntries(buf: Buffer | Uint8Array): Promise<Map<string, string>> {
  const z = await JSZip.loadAsync(buf);
  const out = new Map<string, string>();
  for (const name of Object.keys(z.files).sort()) {
    if (name === "docProps/core.xml" || z.files[name].dir) continue; // oluşturma zaman damgası
    out.set(name, await z.files[name].async("string"));
  }
  return out;
}
const sameEntries = (a: Map<string, string>, b: Map<string, string>) =>
  a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
/**
 * Owner kuralı: başlangıç yılı ≤ CY olan dönem TAM aralığıyla görünür → AKTİF dönemin bitiş yılı (CY'den büyük
 * olabilir) gizli değildir. İzinli küme = görünür (başlamış) harf segmentlerinin bitiş yılları (süzülmüş veriden).
 */
const ACTIVE_END_YEARS = new Set<number>();
for (const r of numRows) {
  const by = Number(String(r.birth_date).slice(0, 4));
  const segs = (((r.analysis_data as Row).motor as Row).harflerinYankilanisi as Seg[] | undefined) ?? [];
  for (const s of segs) {
    const ys = num(s.yearStart) ?? (num(s.ageStart) !== null ? by + num(s.ageStart)! : null);
    const ye = num(s.yearEnd) ?? (num(s.ageEnd) !== null ? by + num(s.ageEnd)! : null);
    if (ys !== null && ys <= CY && ye !== null && ye > CY) ACTIVE_END_YEARS.add(ye);
  }
}
/** CY'den büyük ve AKTİF dönem bitişi olmayan 4 haneli yıl belirteçleri (başlamamış dönem = sızıntı). */
const futureYearTokens = (txt: string) =>
  [...txt.matchAll(/(?<![\d.])(2[01]\d\d)(?![\d])/g)].map((m) => Number(m[1])).filter((y) => y > CY && !ACTIVE_END_YEARS.has(y));

// ── PGlite ──
async function newDb(): Promise<{ pg: PGlite; db: SupabaseClient }> {
  const pg = new PGlite();
  await pg.exec("SET TimeZone = 'UTC'");
  await pg.exec(`
    CREATE TABLE public.numerology_records (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, client_id uuid, name text, surname text, birth_date text,
      analysis_data jsonb, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.human_design_reports (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, user_id uuid, client_id uuid, chart_id uuid, title text,
      report_kind text, snapshot jsonb, created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  for (const m of ["numerology", "human_design"]) {
    for (const e of tablesForModule(m)) {
      if (e.table === "numerology_records" || e.table === "human_design_reports") continue;
      await pg.exec(
        `CREATE TABLE IF NOT EXISTS public."${e.table}" (id uuid PRIMARY KEY, tenant_id uuid, user_id uuid, owner_user_id uuid, client_id uuid, created_at timestamptz DEFAULT now())`,
      );
    }
  }
  await pg.query(
    `INSERT INTO numerology_records SELECT * FROM jsonb_populate_recordset(NULL::numerology_records, $1::jsonb)`,
    [JSON.stringify(numRows)],
  );
  await pg.query(
    `INSERT INTO human_design_reports SELECT * FROM jsonb_populate_recordset(NULL::human_design_reports, $1::jsonb)`,
    [JSON.stringify(hdRows)],
  );
  return { pg, db: makeDb(pg) };
}

const { pg, db } = await newDb();
const dbRowsBefore = JSON.stringify((await pg.query("SELECT id, analysis_data FROM numerology_records ORDER BY id")).rows);

// ───────────────────────────────────────────────────────────────────────────
section("[R1] Saf görünüm: yetkili → aynı dizi; yetkisiz → kopya, girdi değişmez");
{
  const full = readableViewFor(P_FULL, NOW);
  const a = applyReadableView("numerology_records", numRows, full);
  ok("yetkili Numeroloji: AYNI dizi nesnesi (bayt eşitliği)", a.rows === numRows && a.counts.numerologyRedacted === 0);
  const h = applyReadableView("human_design_reports", hdRows, full);
  ok("yetkili HD: AYNI dizi nesnesi", h.rows === hdRows && h.counts.hdSystemReadingRedacted === 0);
  const other = applyReadableView("clients", numRows, restrictedReadableView(NOW));
  ok("kurala tabi olmayan tablo: AYNI dizi", other.rows === numRows);
  const snap = JSON.stringify(numRows);
  const r = applyReadableView("numerology_records", numRows, restrictedReadableView(NOW));
  ok("yetkisiz: yeni dizi, 3 kayıt süzüldü", r.rows !== numRows && r.counts.numerologyRedacted === 3);
  ok("yetkisiz: girdi satırları DEĞİŞMEDİ", JSON.stringify(numRows) === snap);
}

section("[R2] Yetkisiz görünümde başlamamış dönem yok (yapısal)");
{
  const r = applyReadableView("numerology_records", numRows, restrictedReadableView(NOW));
  PEOPLE.forEach((p, i) => {
    const raw = (numRows[i].analysis_data as Row).motor as Row;
    const by = Number(p.iso.slice(0, 4));
    const rawLeaks = futureLeaks(raw, by);
    ok(`${p.bd}: ham motorda gelecek dönem VAR (pozitif kontrol, ${rawLeaks.length})`, rawLeaks.length > 0, rawLeaks);
    const ad = r.rows[i].analysis_data as Row;
    const leaks = futureLeaks(ad.motor as Row, by);
    ok(`${p.bd}: süzülmüş görünümde gelecek dönem YOK`, leaks.length === 0, leaks);
    ok(`${p.bd}: görüntüleme işareti (futureYearsView) belgeye girmez`, !("futureYearsView" in ad));
    ok(`${p.bd}: özet + sürüm aynen`, ad.summary === "özet" && ad.version === 1);
  });
  const hidden = JSON.stringify(r.rows);
  ok("yer tutucular 'gizli' etiketiyle (en az bir)", hidden.includes('"gizli"'));
}

section("[R3] Profil → görünüm (yalnız sunucuda doğrulanmış profil)");
{
  const v = (p: Record<string, unknown> | null) => readableViewFor(p, NOW);
  ok("uzman: modül + alt yetki → gelecek yıllar AÇIK", v(P_FULL).numerologyFutureYears === true);
  ok("uzman: yalnız modül → KAPALI", v(P_MOD).numerologyFutureYears === false);
  ok("uzman: alt yetki var, modül kapalı → KAPALI", v(P_SUB_ONLY).numerologyFutureYears === false);
  ok("uzman: alt yetki string 'true' → KAPALI", v(P_STRING).numerologyFutureYears === false);
  ok("admin → AÇIK", v(P_ADMIN).numerologyFutureYears === true && v(P_ADMIN).hdSystemReading === true);
  ok("profil yok → KAPALI (fail-closed)", v(null).numerologyFutureYears === false && v(null).hdSystemReading === false);
  ok("HD: hd_system_reading yok → KAPALI", v(P_MOD).hdSystemReading === false);
  ok("HD: hd_system_reading var → AÇIK", v(P_FULL).hdSystemReading === true);
  ok("sınır yılı Europe/Istanbul (CY)", v(P_MOD).currentYear === CY && CY === 2026);
}

section("[R4] Okunabilir Arşiv Word (Ayarlar › Dışa Aktarım)");
{
  // Değişiklik ÖNCESİ algoritma (route'un eski gövdesi): exportTableAll + buildArchiveDocx({ title, modules }).
  const before = async (key: string) => {
    const entries = tablesForModule(key);
    const results = await Promise.all(entries.map((e) => exportTableAll(db, e, TA, { maxRows: WORD_RECORD_BUDGET, ownerUserId: UA })));
    const tables = entries.map((entry, i) => ({ entry, rows: results[i].rows, expected_count: results[i].expected_count, complete: results[i].complete, error: results[i].error }));
    return buildArchiveDocx({ title: `${MODULE_LABELS[key]} — Okunabilir Arşiv`, modules: [{ key, label: MODULE_LABELS[key], tables }], now: NOW });
  };
  const run = (profile: Record<string, unknown> | null, module = "numerology") =>
    buildReadableExport({ db, tenantId: TA, userId: UA, module, view: readableViewFor(profile, NOW), now: NOW });

  const restricted = await run(P_MOD);
  ok("yetkisiz: Word üretildi", restricted.kind === "file", restricted);
  if (restricted.kind === "file") {
    const txt = await docxText(restricted.buffer);
    const fut = futureYearTokens(txt);
    ok("yetkisiz: CY sonrası yıl belirteci 0", fut.length === 0, [...new Set(fut)].slice(0, 12));
    ok("yetkisiz: açıklama notu belgede", txt.includes("Gelecek Yılları Göster"));
    ok("yetkisiz: dosya adı değişmedi", restricted.fileName === "numerology-arsiv-2026-11-25.docx", restricted.fileName);
  }
  const base = await before("numerology");
  const baseTxt = await docxText(base.buffer);
  ok("pozitif kontrol: değişiklik öncesi algoritma gelecek yıl belirteci İÇERİR", futureYearTokens(baseTxt).length > 0);
  for (const [name, profile] of [["uzman (modül + alt yetki)", P_FULL], ["admin", P_ADMIN]] as const) {
    const auth = await run(profile);
    ok(`yetkili ${name}: Word üretildi`, auth.kind === "file");
    if (auth.kind === "file") {
      ok(`yetkili ${name}: belge değişiklik öncesiyle BAYT-EŞİT (core.xml hariç)`, sameEntries(await docxEntries(auth.buffer), await docxEntries(base.buffer)));
      ok(`yetkili ${name}: açıklama notu YOK`, !(await docxText(auth.buffer)).includes("Gelecek Yılları Göster"));
    }
  }
  const all = await run(P_MOD, "all");
  ok("'all' kapsamı da aynı kurala uyar (eksik tablolar dahil belge üretilir)", all.kind === "file" && futureYearTokens(await docxText(all.buffer)).length === 0);
  const bad = await run(P_MOD, "users");
  ok("geçersiz modül → 400 (değişmedi)", bad.kind === "json" && bad.status === 400 && bad.body.error === "Geçersiz modül.");
}

section("[R5] Premium Word Arşivi › Kayıt Dökümü parçası");
{
  const opts = { modules: ["numerology", "human_design"], clientIds: null, dateFrom: null, dateTo: null, include: { data: true, dossiers: false, reports: false, files: false, sensitive: false } };
  const ctx = (profile: Record<string, unknown> | undefined) => ({ db, tenantId: TA, userId: UA, profile, isDemo: false, isAndroid: false });
  const part = async (profile: Record<string, unknown> | undefined, module = "numerology") => {
    const r = await handleArchivePart(ctx(profile) as never, { options: opts, job: { kind: "data", module } }, NOW);
    return r.kind === "file" ? r.bytes : null;
  };
  const r1 = await part(P_MOD);
  ok("yetkisiz: parça üretildi", !!r1);
  if (r1) {
    const txt = await docxText(r1);
    ok("yetkisiz: CY sonrası yıl belirteci 0", futureYearTokens(txt).length === 0, [...new Set(futureYearTokens(txt))].slice(0, 12));
    ok("yetkisiz: açıklama notu belgede", txt.includes("Gelecek Yılları Göster"));
  }
  const r0 = await part(undefined);
  ok("profil yok: KISITLI (fail-closed)", !!r0 && futureYearTokens(await docxText(r0!)).length === 0);
  const direct = await buildDataPart(db, TA, UA, "numerology", opts as never, null, NOW);
  ok("buildDataPart görünüm verilmeden → KISITLI (fail-closed)", !!direct.buffer && futureYearTokens(await docxText(direct.buffer!)).length === 0);
  const directFull = await buildDataPart(db, TA, UA, "numerology", opts as never, null, NOW, readableViewFor(P_FULL, NOW));
  const r2 = await part(P_FULL);
  ok("yetkili: parça üretildi + gelecek yıl belirteci VAR (tam analiz)", !!r2 && futureYearTokens(await docxText(r2!)).length > 0);
  ok(
    "yetkili: parça, görünümsüz eski çağrı biçimiyle (tam veri) BAYT-EŞİT (core.xml hariç)",
    !!r2 && !!directFull.buffer && sameEntries(await docxEntries(r2!), await docxEntries(directFull.buffer!)),
  );
  ok("yetkili: açıklama notu YOK", !!r2 && !(await docxText(r2!)).includes("Gelecek Yılları Göster"));
}

section("[R6] Human Design Sistem Yorumu (aynı sınıf)");
{
  const run = (profile: Record<string, unknown>) =>
    buildReadableExport({ db, tenantId: TA, userId: UA, module: "human_design", view: readableViewFor(profile, NOW), now: NOW });
  const a = await run(P_MOD);
  ok("yetkisiz: Sistem Yorumu metni belgede YOK", a.kind === "file" && !(await docxText(a.buffer)).includes(HD_SECRET));
  ok("yetkisiz: HD açıklama notu belgede", a.kind === "file" && (await docxText(a.buffer)).includes("Sistem Yorumu bölümü"));
  const b = await run(P_FULL);
  ok("yetkili: Sistem Yorumu metni belgede VAR", b.kind === "file" && (await docxText(b.buffer)).includes(HD_SECRET));
  const opts = { modules: ["human_design"], clientIds: null, dateFrom: null, dateTo: null, include: { data: true, dossiers: false, reports: false, files: false, sensitive: false } };
  const p = await handleArchivePart({ db, tenantId: TA, userId: UA, profile: P_MOD, isDemo: false, isAndroid: false } as never, { options: opts, job: { kind: "data", module: "human_design" } }, NOW);
  ok("arşiv parçası yetkisiz: Sistem Yorumu YOK", p.kind === "file" && !(await docxText(p.bytes)).includes(HD_SECRET));
  const hdDb = (await pg.query<{ s: string }>("SELECT snapshot::text s FROM human_design_reports")).rows[0].s;
  ok("veritabanındaki HD snapshot DEĞİŞMEDİ", hdDb.includes(HD_SECRET));
}

section("[R7] Teknik JSON yedeği HAM kalır (geri yükleme bütünlüğü)");
{
  const r = await handleBackupTableRequest(db, TA, "numerology_records", null, UA);
  const body = r.body as { ok: boolean; rows: Row[] };
  ok("backup/table: 200 + 3 satır", r.status === 200 && body.ok && body.rows.length === 3);
  const dbRows = (await pg.query<Row>("SELECT id, analysis_data FROM numerology_records ORDER BY id")).rows;
  ok(
    "backup/table: analysis_data DB ile birebir (süzülmez / eksiltilmez)",
    body.rows.every((row) => JSON.stringify(row.analysis_data) === JSON.stringify(dbRows.find((d) => d.id === row.id)?.analysis_data)),
  );
  ok("hiçbir yol veritabanı kaydını değiştirmedi", JSON.stringify((await pg.query("SELECT id, analysis_data FROM numerology_records ORDER BY id")).rows) === dbRowsBefore);
}

section("[R8] Statik: erişim yolları");
{
  const ROOT = process.cwd();
  const src = (f: string) => readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const exp = src("app/api/settings/export/route.ts");
  ok("export route: profil isteniyor + görünüm sunucuda", exp.includes("includeProfile: true") && exp.includes("readableViewFor(guard.profile"));
  ok("export route: demo kapısı aynen", exp.includes("is_demo_account"));
  const h = src("lib/archive/server/handlers.ts");
  ok("arşiv parça yolu: görünüm doğrulanmış profilden", /buildDataPart\([^)]*readableViewFor\(ctx\.profile/.test(h));
  const rep = src("lib/archive/server/reports.ts");
  ok("arşiv Numeroloji kaydı raporu: canSeeNumerologyFutureYears(ctx.profile)", /buildNumerolojiWordChildren\([^;]*canSeeNumerologyFutureYears\(ctx\.profile\)/.test(rep));
  ok("arşiv danışan dosyası: numerologyFutureYears canSeeNumerologyFutureYears(ctx.profile)", /numerologyFutureYears:[^,]*canSeeNumerologyFutureYears\(ctx\.profile\)/.test(rep));
  ok("arşiv HD raporu: applyDownloadPermissions(…, hd_system_reading)", /applyDownloadPermissions\(snapshot, perm\(ctx, "hd_system_reading"\)\)/.test(rep));
  const tbl = src("app/api/settings/backup/table/route.ts") + src("lib/backup/service.ts");
  ok("JSON yedek yolu görünüm İÇERMEZ (bilinçli: teknik yedek ham)", !/readableView|redactAnalysisData/.test(tbl));
  const cl = src("lib/archive/client.ts");
  ok("BENİOKU / ARŞİV-RAPORU yalnız plan + iş sonuçlarından (satır verisi okumaz)", !/analysis_data|rows\s*\[/.test(cl));
}

section("[L1] TR katalog = kod sabitleri (A16 eşitlik kilidi)");
{
  const a = SOURCE_FILE_TEXT;
  const b = catalogFileText("tr");
  const fakeEntry = { table: "numerology_records", label: "Analiz Kayıtları" } as never;
  const probes: [string, (x: typeof a) => unknown][] = [
    ["yes/no", (x) => [x.word.yes, x.word.no]],
    ["linkedRecord", (x) => x.word.linkedRecord("abcd1234")],
    ["embeddedImage/provider", (x) => [x.word.embeddedImage, x.word.providerNeutral]],
    ["column/record", (x) => [x.word.column(3), x.word.record(12)]],
    ["generatedOn", (x) => x.word.generatedOn("25 Kasım 2026")],
    ["intro/incomplete", (x) => [x.word.intro, x.word.incompleteHeading, x.word.incompleteLead]],
    ["sectionIncomplete", (x) => [x.word.sectionIncomplete(null), x.word.sectionIncomplete("hata x")]],
    ["sectionEmpty", (x) => x.word.sectionEmpty],
    ["count", (x) => [x.word.count(0, null), x.word.count(1, null), x.word.count(1500, null), x.word.count(5, 7), x.word.count(5, 5)]],
    ["budget", (x) => [x.word.budgetRecords(12001), x.word.budgetBytes("4.2")]],
    ["colLabels", (x) => JSON.stringify(x.word.colLabels)],
    ["hidden", (x) => x.hidden],
    ["moduleLabel/tableLabel", (x) => [x.moduleLabel("numerology"), x.moduleLabel("general"), x.tableLabel(fakeEntry)]],
    ["exportTitle", (x) => [x.exportTitle("all"), x.exportTitle("numerology")]],
    ["dump", (x) => [x.dumpTitle("numerology"), x.dumpFileName("numerology", 2), x.continued]],
    ["partNote", (x) => [x.partNote(1, true, 1500), x.partNote(2, false, 1)]],
    ["filters", (x) => [x.clientFilterNote(3), x.dateRangeNote(null, null), x.dateRangeNote("2026-01-01", "2026-02-01")]],
    ["notes", (x) => [x.noteNumerologyHidden, x.noteHdSystemReadingHidden]],
  ];
  for (const [n, f] of probes) ok(`TR katalog = sabit: ${n}`, JSON.stringify(f(a)) === JSON.stringify(f(b)), [f(a), f(b)]);
  ok("kaynak dil katalog OKUNMAZ (sabit nesne)", backupFileText("tr") === SOURCE_FILE_TEXT && backupFileText() === SOURCE_FILE_TEXT);
}

const TR_SYSTEM = ["Oluşturma tarihi", "Bu belge okunabilir", "Okunabilir Arşiv", "Kayıt Dökümü", "kayıt yok", " kayıt", "Doğum tarihi: ", "Analiz Kayıtları", "Numeroloji", "Gelecek Yılları", "gizli", "Evet", "Hayır", "Bölüm "];
section("[L2] EN Okunabilir Arşiv");
{
  const en = await buildReadableExport({ db, tenantId: TA, userId: UA, module: "numerology", view: readableViewFor(P_FULL, NOW), now: NOW, locale: "en" });
  ok("EN: Word üretildi", en.kind === "file");
  if (en.kind === "file") {
    const txt = await docxText(en.buffer);
    ok("EN: başlık + oluşturma + giriş EN", txt.includes("Numerology — Readable Archive") && txt.includes("Created on: 25 November 2026") && txt.includes("This document is a readable archive"), txt.slice(0, 400));
    ok("EN: tablo başlığı EN + çoğul", txt.includes("Analysis Records — 3 records"), txt.slice(0, 600));
    ok("EN: sütun adı EN (Date of birth)", txt.includes("Date of birth"));
    const trLeft = TR_SYSTEM.filter((w) => txt.includes(w));
    ok("EN: Türkçe SİSTEM metni yok (kullanıcı içeriği hariç)", trLeft.length === 0, trLeft);
    ok("EN: dosya adı dil-bağımsız", en.fileName === "numerology-arsiv-2026-11-25.docx");
    const z = await JSZip.loadAsync(en.buffer);
    ok("EN: belge dili w:lang en-GB", ((await z.file("word/styles.xml")?.async("string")) ?? "").includes('w:val="en-GB"'));
  }
  const enR = await buildReadableExport({ db, tenantId: TA, userId: UA, module: "numerology", view: readableViewFor(P_MOD, NOW), now: NOW, locale: "en" });
  if (enR.kind === "file") {
    const txt = await docxText(enR.buffer);
    ok("EN yetkisiz: gelecek yıl belirteci 0", futureYearTokens(txt).length === 0);
    ok("EN yetkisiz: EN not + 'hidden' etiketi", txt.includes("Show Future Years") && /: hidden\b/.test(txt));
    const left = TR_SYSTEM.filter((w) => txt.includes(w));
    ok("EN yetkisiz: Türkçe sistem metni yok", left.length === 0, left);
  } else ok("EN yetkisiz: Word üretildi", false, enR);
}

section("[L3] TR açık seçim = parametresiz = değişiklik öncesi");
{
  const a = await buildReadableExport({ db, tenantId: TA, userId: UA, module: "numerology", view: readableViewFor(P_FULL, NOW), now: NOW, locale: "tr" });
  const b = await buildReadableExport({ db, tenantId: TA, userId: UA, module: "numerology", view: readableViewFor(P_FULL, NOW), now: NOW });
  const entries = tablesForModule("numerology");
  const results = await Promise.all(entries.map((e) => exportTableAll(db, e, TA, { maxRows: WORD_RECORD_BUDGET, ownerUserId: UA })));
  const base = await buildArchiveDocx({
    title: "Numeroloji — Okunabilir Arşiv",
    modules: [{ key: "numerology", label: "Numeroloji", tables: entries.map((entry, i) => ({ entry, rows: results[i].rows, expected_count: results[i].expected_count, complete: results[i].complete, error: results[i].error })) }],
    now: NOW,
  });
  ok("TR açık = parametresiz (bayt-eşit)", a.kind === "file" && b.kind === "file" && sameEntries(await docxEntries(a.buffer), await docxEntries(b.buffer)));
  ok("TR = değişiklik öncesi (bayt-eşit)", a.kind === "file" && sameEntries(await docxEntries(a.buffer), await docxEntries(base.buffer)));
  const stylesTr = a.kind === "file" ? ((await (await JSZip.loadAsync(a.buffer)).file("word/styles.xml")?.async("string")) ?? "") : "";
  ok("TR: belgeye dil işareti eklenmedi", a.kind === "file" && !stylesTr.includes('w:val="tr-TR"') && !stylesTr.includes('w:val="en-GB"'));
}

section("[L4] Arşiv parçası dili planda sabit");
{
  const opts = { modules: ["numerology"], clientIds: null, dateFrom: null, dateTo: null, include: { data: true, dossiers: false, reports: false, files: false, sensitive: false } };
  const ctx = { db, tenantId: TA, userId: UA, profile: P_FULL, isDemo: false, isAndroid: false, locale: "tr" };
  const part = async (extra: Record<string, unknown>) => handleArchivePart(ctx as never, { options: opts, job: { kind: "data", module: "numerology" }, ...extra }, NOW);
  const en = await part({ file_locale: "en" });
  const enTxt = en.kind === "file" ? await docxText(en.bytes) : "";
  ok("file_locale en → EN içerik (istek dili tr olsa da plan dili geçerli)", enTxt.includes("Numerology — Record Dump"), enTxt.slice(0, 300));
  ok("file_locale en → EN parça notu", enTxt.includes("Part 1 (last part) · 3 records"));
  ok("yol adı dil-SABİT (TR; plan klasörleriyle tutarlı)", en.kind === "file" && en.fileName === "Numeroloji — Kayıt Dökümü — Bölüm 1.docx", en.kind === "file" ? en.fileName : en);
  const tr = await part({});
  const tr2 = await buildDataPart(db, TA, UA, "numerology", opts as never, null, NOW, readableViewFor(P_FULL, NOW));
  ok("file_locale yok → TR (eski çağrıyla bayt-eşit)", tr.kind === "file" && !!tr2.buffer && sameEntries(await docxEntries(tr.bytes), await docxEntries(tr2.buffer!)));
  const xx = await part({ file_locale: "xx" });
  ok("file_locale geçersiz → TR", xx.kind === "file" && (await docxText(xx.bytes)).includes("Kayıt Dökümü"));
  process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = "off";
  const closed = await part({ file_locale: "en" });
  process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = "on";
  ok("yayın kapısı kapalı → file_locale yok sayılır (TR)", closed.kind === "file" && (await docxText(closed.bytes)).includes("Kayıt Dökümü"));
}

section("[L5] İstemci parça gövdesi");
{
  const mkPlan = (file_locale?: string) => ({
    ok: true,
    version: 1,
    archive_id: "aaaaaaaa-9999-4000-8000-000000000001",
    created_at: "2026-11-25T09:30:00.000Z",
    file_name: "yasam-arsiv-2026-11-25.zip",
    options: { modules: ["numerology"], clientIds: null, dateFrom: null, dateTo: null, include: { data: true, dossiers: false, reports: false, files: false, sensitive: false } },
    jobs: [{ kind: "data", module: "numerology", expected: 3, label: "Numeroloji — kayıt dökümü", folder: "Kayıt Dökümü (Word)/05 Numeroloji" }],
    summary: [],
    excluded: [],
    warnings: [],
    ...(file_locale ? { file_locale } : {}),
  });
  const bodies: Record<string, unknown>[] = [];
  const deps = {
    postPart: async (body: unknown) => {
      bodies.push(body as Record<string, unknown>);
      return { status: 200, isFile: false, header: () => null, json: async () => ({ ok: true, empty: true, next: null, rows: 0, errors: [] }), bytes: async () => new Uint8Array() };
    },
    getFile: async () => new Uint8Array(),
    now: () => NOW,
  };
  await runArchive(mkPlan("tr") as never, deps as never);
  ok("TR plan: gövdede file_locale YOK (bugünkü istek aynı)", bodies.length > 0 && bodies.every((b) => !("file_locale" in b)), bodies);
  bodies.length = 0;
  await runArchive(mkPlan("en") as never, deps as never);
  ok("EN plan: her parça gövdesinde file_locale en", bodies.length > 0 && bodies.every((b) => b.file_locale === "en"), bodies);
}

await pg.close();
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
