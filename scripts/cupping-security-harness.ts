/**
 * KUPA & HACAMAT — GÜVENLİK REGRESYON HARNESS'I (satış öncesi zorunlu).
 *
 * Bu testler ASLA silinmemelidir. Kalıcı güvenlik kontratları RUNTIME davranışıyla
 * doğrulanır (yalnız kaynak grep DEĞİL): tenant izolasyonu, cross-tenant FK enjeksiyonu,
 * mass-assignment engeli, payload sınırları/enum, modül entitlement + /kupa page guard.
 *
 * Çalıştır:  npx tsx scripts/cupping-security-harness.ts   (veya  npm run test:cupping:security)
 *
 * DB GEREKTİRMEZ — lib/cupping/api.ts yardımcıları enjekte edilen SAHTE bir Supabase client
 * üzerinde koşar (production/staging mutation YOK). 54 route'un tenant sözleşmesi bu tek
 * chokepoint (api.ts) + citation factory seam'i üzerinden temsil edilir.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NextRequest } from "next/server";
import {
  getEntity,
  updateEntity,
  deleteEntity,
  insertEntity,
  assertOwnedRef,
  pickWritable,
  validateWritable,
  normalizeNullableEnums,
} from "@/lib/cupping/api";
import { trFold, trIncludes } from "@/app/kupa/lib/trFold";
// Gerçek route handler'ları + auth resolver'ları (runtime davranış doğrulaması; grep DEĞİL).
import { GET as pointsGET, POST as pointsPOST } from "@/app/api/kupa/points/route";
import { POST as topicNotesPOST } from "@/app/api/kupa/topic-notes/route";
import { getActiveSessionUserId } from "@/lib/auth/sessionSecurity";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import {
  CUPPING_TABLES,
  POINT_WRITABLE,
  SOURCE_WRITABLE,
  KNOWLEDGE_WRITABLE,
  CUPPING_ARRAY_MAX_ITEMS,
} from "@/lib/cupping/fields";
import {
  normalizeSortOrder,
  normalizeNullableNumber,
  withSafeSortOrder,
} from "@/lib/cupping/normalize";
import {
  isLaterality,
  isSeverity,
  isSourceType,
  isTechniqueType,
  isRelationStrength,
} from "@/lib/cupping/vocab";
import {
  parseModulePermissions,
  hasAnyModulePermissionFlag,
  buildPremiumModulePermissionsPayload,
  DEFAULT_MODULE_PERMISSIONS,
} from "@/lib/auth/modulePermissions";
import { ADMIN_MODULE_UI_KEYS, parseAdminModulePermissions } from "@/lib/admin/userManagement";
import { findRouteModuleRule, canExpertAccessRoutePath } from "@/lib/auth/routeModuleAccess";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.error(`  ❌ ${name}`); }
}

// ─── Sahte Supabase client (yalnız api.ts'in kullandığı zincirler) ───────────
type Row = Record<string, unknown>;
function makeFakeDb(seed: Record<string, Row[]>) {
  const store = new Map<string, Row[]>();
  for (const [t, rows] of Object.entries(seed)) store.set(t, rows.map((r) => ({ ...r })));
  const rowsOf = (t: string): Row[] => {
    if (!store.has(t)) store.set(t, []);
    return store.get(t)!;
  };

  function from(table: string) {
    const filters: Row = {};
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row = {};
    const match = (r: Row) => Object.entries(filters).every(([k, v]) => r[k] === v);

    function runAwaited() {
      if (op === "delete") {
        const arr = rowsOf(table);
        const removed = arr.filter(match);
        store.set(table, arr.filter((r) => !match(r)));
        return { data: removed.map((r) => ({ id: r.id })), error: null };
      }
      return { data: rowsOf(table).filter(match), error: null }; // list
    }
    function terminal(isSingleInsert: boolean) {
      if (op === "insert") {
        const arr = rowsOf(table);
        const id = (payload.id as string) ?? `id-${arr.length + 1}`;
        const row = { ...payload, id };
        arr.push(row);
        return { data: row, error: null };
      }
      if (op === "update") {
        const arr = rowsOf(table);
        const idx = arr.findIndex(match);
        if (idx === -1) return { data: null, error: null };
        arr[idx] = { ...arr[idx], ...payload };
        return { data: arr[idx], error: null };
      }
      const found = rowsOf(table).find(match) ?? null;
      void isSingleInsert;
      return { data: found, error: null };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: () => builder,
      insert: (obj: Row) => { op = "insert"; payload = obj; return builder; },
      update: (obj: Row) => { op = "update"; payload = obj; return builder; },
      delete: () => { op = "delete"; return builder; },
      eq: (col: string, val: unknown) => { filters[col] = val; return builder; },
      order: () => builder,
      in: () => builder,
      single: async () => terminal(true),
      maybeSingle: async () => terminal(false),
      then: (resolve: (v: unknown) => void) => resolve(runAwaited()),
    };
    return builder;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from } as any;
}

// K9 — insert/update/delete'te belirli Postgres hata KODUYLA dönen sahte client (error mapping testi).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeErrorDb(code: string): any {
  const res = { data: null, error: { code } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => b, insert: () => b, update: () => b, delete: () => b,
    eq: () => b, order: () => b, in: () => b,
    single: async () => res,
    maybeSingle: async () => res,
    then: (resolve: (v: unknown) => void) => resolve(res),
  };
  return { from: () => b };
}

// Basit user kurucu (yalnız izin mantığının okuduğu alanlar).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const U = (role: string, perms?: Row): any => ({ role, module_permissions: perms ?? {} });

const T = CUPPING_TABLES.points;

async function run() {
  console.log("\n── validateWritable: payload sınırları + enum (HAC-UX-2/3/4) ──");
  ok("kısa 'name' → geçerli (null)", validateWritable(T, { name: "Bel Bölgesi" }) === null);
  const longName = "x".repeat(5000);
  const r1 = validateWritable(T, { name: longName });
  ok("aşırı uzun 'name' → 400", !!r1 && r1.status === 400);
  ok("geçersiz enum laterality 'banana' → 400", validateWritable(T, { laterality: "banana" })?.status === 400);
  ok("geçerli enum laterality 'left' → null", validateWritable(T, { laterality: "left" }) === null);
  ok("boş string enum '' → null (değer yok / temizle)", validateWritable(T, { laterality: "" }) === null);
  const bigArr = Array.from({ length: CUPPING_ARRAY_MAX_ITEMS + 5 }, (_, i) => `s${i}`);
  ok("aşırı büyük array 'synonyms' → 400", validateWritable(T, { synonyms: bigArr })?.status === 400);
  ok("array içinde string-olmayan öğe → 400", validateWritable(T, { synonyms: [1, 2] as unknown[] })?.status === 400);
  ok("geçerli array 'synonyms' → null", validateWritable(T, { synonyms: ["a", "b"] }) === null);
  ok("bilinmeyen tablo → denetim yok (null)", validateWritable("baska_tablo", { name: longName }) === null);
  ok("kural tanımsız numeric 'sort_order' sınırsız → null", validateWritable(T, { sort_order: 999999 }) === null);

  console.log("\n── pickWritable: mass-assignment engeli ──");
  const picked = pickWritable({ name: "X", tenant_id: "evil", id: "evil", created_at: "x" }, POINT_WRITABLE);
  ok("server-owned tenant_id payload'dan STRIP", !("tenant_id" in picked));
  ok("server-owned id payload'dan STRIP", !("id" in picked));
  ok("allowlist alanı 'name' KORUNUR", picked.name === "X");

  console.log("\n── vocab enum guard'ları (server-side) ──");
  ok("isLaterality('left') true / ('x') false", isLaterality("left") && !isLaterality("x"));
  ok("isSeverity('warning') true / ('') false", isSeverity("warning") && !isSeverity(""));
  ok("isSourceType('academic_article') true", isSourceType("academic_article") && !isSourceType("nope"));
  ok("isTechniqueType('wet') true / ('foo') false", isTechniqueType("wet") && !isTechniqueType("foo"));
  ok("isRelationStrength('modern_supported') true", isRelationStrength("modern_supported") && !isRelationStrength("x"));

  console.log("\n── Tenant izolasyonu + FK enjeksiyonu (fake-db; api.ts chokepoint) ──");
  const db = makeFakeDb({
    [T]: [
      { id: "p1", tenant_id: "t-1", name: "A" },
      { id: "p2", tenant_id: "t-2", name: "B" },
    ],
  });

  const readCross = await getEntity(db, T, "t-2", "p1");
  ok("Tenant-B, Tenant-A kaydını OKUYAMAZ (404)", !readCross.ok && readCross.response.status === 404);
  const readOwn = await getEntity(db, T, "t-1", "p1");
  ok("Tenant-A kendi kaydını okur (ok)", readOwn.ok === true);

  const updCross = await updateEntity(db, T, "t-2", "p1", { name: "HACK" });
  ok("Tenant-B, Tenant-A kaydını UPDATE EDEMEZ (404)", !updCross.ok && updCross.response.status === 404);
  const afterUpd = await getEntity(db, T, "t-1", "p1");
  ok("cross-tenant update sonrası p1.name DEĞİŞMEDİ", afterUpd.ok && afterUpd.data.name === "A");

  const delCross = await deleteEntity(db, T, "t-2", "p1");
  ok("Tenant-B, Tenant-A kaydını DELETE EDEMEZ (deleted=0)", delCross.ok === true && delCross.data === 0);
  const stillThere = await getEntity(db, T, "t-1", "p1");
  ok("cross-tenant delete sonrası p1 HÂLÂ VAR", stillThere.ok === true);

  ok("assertOwnedRef: Tenant-B kendi p2'si → true", (await assertOwnedRef(db, T, "t-2", "p2")) === true);
  ok("assertOwnedRef: Tenant-B, Tenant-A p1 FK enjeksiyonu → false", (await assertOwnedRef(db, T, "t-2", "p1")) === false);

  const ins = await insertEntity(db, T, "t-9", { name: "Yeni", tenant_id: "evil-injected" });
  ok("insertEntity tenant_id'yi SERVER'dan yazar (body enjeksiyonu ezilir)", ins.ok && ins.data.tenant_id === "t-9");

  const delOwn = await deleteEntity(db, T, "t-1", "p1");
  ok("Tenant-A kendi kaydını siler (deleted=1)", delOwn.ok === true && delOwn.data === 1);

  console.log("\n── Modül entitlement (HAC-ENT-1) ──");
  ok("DEFAULT_MODULE_PERMISSIONS.cupping === false (fail-closed)", DEFAULT_MODULE_PERMISSIONS.cupping === false);
  ok("parseModulePermissions({cupping:true}).cupping === true (persist)", parseModulePermissions({ cupping: true }).cupping === true);
  ok("parseModulePermissions({}).cupping === false (default)", parseModulePermissions({}).cupping === false);
  ok("yeni Premium payload cupping=true (mevcut hesaplar ETKİLENMEZ)", buildPremiumModulePermissionsPayload().cupping === true);
  ok("izinsiz uzman → cupping erişim YOK", hasAnyModulePermissionFlag(U("expert", {}), ["cupping", "kupa"]) === false);
  ok("cupping izinli uzman → erişim VAR", hasAnyModulePermissionFlag(U("expert", { cupping: true }), ["cupping"]) === true);
  ok("TR alias {kupa:true} → erişim VAR", hasAnyModulePermissionFlag(U("expert", { kupa: true }), ["cupping", "kupa"]) === true);
  ok("admin → her zaman erişim", hasAnyModulePermissionFlag(U("admin"), ["cupping"]) === true);
  ok("admin toggle listesi 'cupping' içerir", (ADMIN_MODULE_UI_KEYS as readonly string[]).includes("cupping"));
  ok("admin parse TR alias {kupa:true} → cupping true", parseAdminModulePermissions({ kupa: true }).cupping === true);

  console.log("\n── /kupa page guard (HAC-ENT-2) ──");
  ok("findRouteModuleRule('/kupa') keys cupping+kupa", (findRouteModuleRule("/kupa")?.keys ?? []).includes("cupping"));
  ok("findRouteModuleRule('/kupa/protokoller') → cupping kuralı", (findRouteModuleRule("/kupa/protokoller")?.keys ?? []).includes("cupping"));
  ok("izinsiz uzman /kupa AÇAMAZ", canExpertAccessRoutePath(U("expert", {}), "/kupa") === false);
  ok("izinsiz uzman /kupa/noktalar AÇAMAZ (direct URL)", canExpertAccessRoutePath(U("expert", {}), "/kupa/noktalar") === false);
  ok("cupping izinli uzman /kupa erişir", canExpertAccessRoutePath(U("expert", { cupping: true }), "/kupa") === true);
  ok("admin /kupa erişir", canExpertAccessRoutePath(U("admin"), "/kupa") === true);

  console.log("\n── Route handler runtime: unauth kontratı (GERÇEK GET/POST handler) ──");
  // verifyUserRequest header eksikliğini getServerDb'DEN ÖNCE reddeder → DB/env GEREKMEZ.
  const reqNoAuth = new NextRequest("http://localhost/api/kupa/points", { headers: {} });
  const gNoAuth = await pointsGET(reqNoAuth);
  ok("points GET: header YOK → 401 (canonical unauth)", gNoAuth.status === 401);
  const reqNoToken = new NextRequest("http://localhost/api/kupa/points", { headers: { "x-user-id": "u1" } });
  const gNoToken = await pointsGET(reqNoToken);
  ok("points GET: session token YOK → 401 (x-user-id'ye güvenilmez)", gNoToken.status === 401);
  const pNoAuth = await pointsPOST(
    new NextRequest("http://localhost/api/kupa/points", { method: "POST", headers: {}, body: JSON.stringify({ name: "x" }) }),
  );
  ok("points POST: header YOK → 401 (yazma auth öncesi reddi)", pNoAuth.status === 401);
  const tnNoAuth = await topicNotesPOST(
    new NextRequest("http://localhost/api/kupa/topic-notes", { method: "POST", headers: {}, body: JSON.stringify({ topic_id: "t", note: "n" }) }),
  );
  ok("topic-notes POST (custom route): header YOK → 401", tnNoAuth.status === 401);

  console.log("\n── Session + permission resolver runtime (gerçek fonksiyonlar; fake db/pure) ──");
  const FRESH = new Date().toISOString(); // taze → last_seen update dalını tetiklemez
  const sessDb = makeFakeDb({
    user_sessions: [
      { id: "s1", session_token: "tok-ok", is_active: true, user_id: "u1", last_seen_at: FRESH },
      { id: "s2", session_token: "tok-revoked", is_active: false, user_id: "u1", last_seen_at: FRESH },
    ],
  });
  ok("getActiveSessionUserId: geçerli aktif token → userId", (await getActiveSessionUserId(sessDb, "tok-ok")) === "u1");
  ok("getActiveSessionUserId: revoke edilmiş (is_active=false) → null", (await getActiveSessionUserId(sessDb, "tok-revoked")) === null);
  ok("getActiveSessionUserId: bilinmeyen token → null", (await getActiveSessionUserId(sessDb, "yok")) === null);
  ok("getActiveSessionUserId: boş token → null", (await getActiveSessionUserId(sessDb, "")) === null);

  ok("resolveModuleAccess: izinsiz uzman → false (403 yolu)", resolveModuleAccess("expert", {}, "cupping") === false);
  ok("resolveModuleAccess: cupping:true → true (handler İLERLER)", resolveModuleAccess("expert", { cupping: true }, "cupping") === true);
  ok("resolveModuleAccess: TR alias {kupa:true} → true", resolveModuleAccess("expert", { kupa: true }, "cupping") === true);
  ok("resolveModuleAccess: admin → true", resolveModuleAccess("admin", {}, "cupping") === true);

  console.log("\n── KUP-NEW-1: sort_order boş-alan regresyonu (GERÇEK davranış) ──");
  // A) Pure sözleşme: sort_order (NOT NULL DEFAULT 0) boş/geçersiz/null → 0; gerçek sayı korunur.
  ok("normalizeSortOrder('') → 0 (boş Sıra)", normalizeSortOrder("") === 0);
  ok("normalizeSortOrder('   ') → 0 (whitespace)", normalizeSortOrder("   ") === 0);
  ok("normalizeSortOrder(null) → 0", normalizeSortOrder(null) === 0);
  ok("normalizeSortOrder(undefined) → 0", normalizeSortOrder(undefined) === 0);
  ok("normalizeSortOrder('0') → 0 (gerçek sıfır korunur)", normalizeSortOrder("0") === 0);
  ok("normalizeSortOrder('7') → 7 (gerçek sayı korunur)", normalizeSortOrder("7") === 7);
  ok("normalizeSortOrder(7) → 7 (number geçişi)", normalizeSortOrder(7) === 7);
  ok("normalizeSortOrder('abc') → 0 (geçersiz)", normalizeSortOrder("abc") === 0);
  // B) NULLABLE numeric (year) geriye-uyum: boş → null (HAC-UX-5 KORUNUR; year→0 regresyonu YOK).
  ok("normalizeNullableNumber('') → null (year boş)", normalizeNullableNumber("") === null);
  ok("normalizeNullableNumber('  ') → null", normalizeNullableNumber("  ") === null);
  ok("normalizeNullableNumber('1990') → 1990 (gerçek yıl)", normalizeNullableNumber("1990") === 1990);
  ok("normalizeNullableNumber('abc') → null (geçersiz)", normalizeNullableNumber("abc") === null);
  ok("normalizeNullableNumber(0) → 0 (gerçek sıfır korunur)", normalizeNullableNumber(0) === 0);

  // C) Server backstop (withSafeSortOrder): sort_order VARSA 0'a zorlanır; YOKSA dokunulmaz.
  ok("withSafeSortOrder: sort_order YOK → değişmez (DB DEFAULT 0)", !("sort_order" in withSafeSortOrder({ name: "X" })));
  ok("withSafeSortOrder: sort_order=null → 0", withSafeSortOrder({ sort_order: null }).sort_order === 0);
  ok("withSafeSortOrder: sort_order=5 → 5 korunur", withSafeSortOrder({ sort_order: 5 }).sort_order === 5);
  ok("withSafeSortOrder: year NULLABLE bozulmaz (year=null korunur)", withSafeSortOrder({ sort_order: null, year: null }).year === null);

  // D) GERÇEK insert payload (fake-db) — 3 create yüzeyi (Nokta/Kaynak/Bilgi) aynı chokepoint.
  //    Boş "Sıra" → DB'ye giden payload'da sort_order === 0 (ASLA null). NOT NULL ihlali önlenir.
  const sortDb = makeFakeDb({});
  const insPoint = await insertEntity(sortDb, CUPPING_TABLES.points, "t-1", { name: "Nokta", sort_order: null });
  ok("Nokta create — Sıra boş → insert payload sort_order=0 (null DEĞİL)", insPoint.ok && insPoint.data.sort_order === 0);
  ok("Nokta create — insert payload sort_order null DEĞİLDİR", insPoint.ok && insPoint.data.sort_order !== null);
  const insSource = await insertEntity(sortDb, CUPPING_TABLES.sources, "t-1", { source_name: "Kaynak", sort_order: null, year: null });
  ok("Kaynak create — Sıra boş → insert payload sort_order=0", insSource.ok && insSource.data.sort_order === 0);
  ok("Kaynak create — NULLABLE year boş → payload year null KALIR (regresyon yok)", insSource.ok && insSource.data.year === null);
  const insKnow = await insertEntity(sortDb, CUPPING_TABLES.knowledge, "t-1", { title: "Bilgi", sort_order: null });
  ok("Bilgi Kütüphanesi create — Sıra boş → insert payload sort_order=0", insKnow.ok && insKnow.data.sort_order === 0);
  const insReal = await insertEntity(sortDb, CUPPING_TABLES.points, "t-1", { name: "Nokta2", sort_order: 7 });
  ok("Nokta create — Sıra=7 → payload sort_order=7 (gerçek değer korunur)", insReal.ok && insReal.data.sort_order === 7);

  // E) UPDATE: kullanıcı "Sıra" alanını temizlerse (sort_order null) → 0 (DB'ye null gitmez).
  const updDb = makeFakeDb({ [CUPPING_TABLES.points]: [{ id: "pu", tenant_id: "t-1", name: "U", sort_order: 3 }] });
  const updClear = await updateEntity(updDb, CUPPING_TABLES.points, "t-1", "pu", { sort_order: null });
  ok("Sıra temizleme (update) → sort_order=0 (null DEĞİL)", updClear.ok && updClear.data.sort_order === 0);

  // F) sort_order backstop mass-assignment korumasını BOZMAZ (tenant_id/id hâlâ strip).
  const pickedSort = pickWritable({ sort_order: null, tenant_id: "evil", id: "evil" }, POINT_WRITABLE);
  ok("sort_order allowlist'te KALIR, tenant_id/id STRIP", "sort_order" in pickedSort && !("tenant_id" in pickedSort) && !("id" in pickedSort));
  // SOURCE_WRITABLE / KNOWLEDGE_WRITABLE sort_order içerdiğini doğrula (3 yüzey allowlist eşlemesi).
  ok("SOURCE_WRITABLE sort_order içerir (Kaynak yüzeyi)", (SOURCE_WRITABLE as readonly string[]).includes("sort_order"));
  ok("KNOWLEDGE_WRITABLE sort_order içerir (Bilgi yüzeyi)", (KNOWLEDGE_WRITABLE as readonly string[]).includes("sort_order"));

  console.log("\n── Kaynak kontratı (regression lock) ──");
  const pointsSrc = readFileSync(join(ROOT, "app/api/kupa/points/route.ts"), "utf8");
  const protocolsSrc = readFileSync(join(ROOT, "app/api/kupa/protocols/route.ts"), "utf8");
  const routeGuardSrc = readFileSync(join(ROOT, "lib/auth/routeModuleAccess.ts"), "utf8");
  const permsSrc = readFileSync(join(ROOT, "lib/auth/modulePermissions.ts"), "utf8");
  const apiSrc = readFileSync(join(ROOT, "lib/cupping/api.ts"), "utf8");

  ok("points route: requireModuleAccess(req,'cupping')", /requireModuleAccess\(\s*req\s*,\s*["']cupping["']\s*\)/.test(pointsSrc));
  ok("points route: demo write koruması (is_demo_account)", /is_demo_account/.test(pointsSrc));
  ok("protocols route: requireModuleAccess(req,'cupping')", /requireModuleAccess\(\s*req\s*,\s*["']cupping["']\s*\)/.test(protocolsSrc));
  ok("routeModuleAccess: '/kupa' kuralı kayıtlı", /prefix:\s*["']\/kupa["']/.test(routeGuardSrc));
  ok("modulePermissions: 'cupping' anahtarı var", /["']cupping["']/.test(permsSrc));
  ok("api.ts: validateWritable + tenant_id filtresi", /validateWritable/.test(apiSrc) && /\.eq\(\s*["']tenant_id["']/.test(apiSrc));
  ok("api.ts: KUP-NEW-1 sort_order backstop (withSafeSortOrder)", /withSafeSortOrder/.test(apiSrc));

  // ── K1 (KUP-LIVE-1): nullable enum boş-string → null (GERÇEK davranış; grep DEĞİL) ──
  console.log("\n── K1 KUP-LIVE-1: nullable enum '' → null (server backstop) ──");
  ok("normalizeNullableEnums: laterality '' → null", normalizeNullableEnums({ laterality: "" }).laterality === null);
  ok("normalizeNullableEnums: source_type '   ' (whitespace) → null", normalizeNullableEnums({ source_type: "   " }).source_type === null);
  ok("normalizeNullableEnums: geçerli enum ('midline') KORUNUR", normalizeNullableEnums({ laterality: "midline" }).laterality === "midline");
  ok("normalizeNullableEnums: 'unspecified' KORUNUR (null'a çevrilmez)", normalizeNullableEnums({ technique_type: "unspecified" }).technique_type === "unspecified");
  ok("normalizeNullableEnums: severity '' DOKUNULMAZ (NOT NULL enum; whitelist DIŞI)", normalizeNullableEnums({ severity: "" }).severity === "");
  ok("normalizeNullableEnums: normal string '' DOKUNULMAZ (global '' → null YOK)", normalizeNullableEnums({ name: "" }).name === "");
  const enumDb = makeFakeDb({});
  const insLat = await insertEntity(enumDb, CUPPING_TABLES.points, "t-1", { name: "N", laterality: "" });
  ok("insertEntity: laterality '' → DB'ye null (points)", insLat.ok && insLat.data.laterality === null);
  const insSrcType = await insertEntity(enumDb, CUPPING_TABLES.sources, "t-1", { source_name: "K", source_type: "" });
  ok("insertEntity: source_type '' → DB'ye null (sources)", insSrcType.ok && insSrcType.data.source_type === null);
  const insValid = await insertEntity(enumDb, CUPPING_TABLES.points, "t-1", { name: "N2", laterality: "bilateral" });
  ok("insertEntity: geçerli laterality DB'ye AYNEN yazılır", insValid.ok && insValid.data.laterality === "bilateral");

  // ── K9: Postgres 23505/23503 → 409 (ham hata sızmaz) ──
  console.log("\n── K9: DB hata kodu → kontrollü HTTP (23505/23503 → 409) ──");
  const dupIns = await insertEntity(makeErrorDb("23505"), CUPPING_TABLES.points, "t-1", { name: "dup" });
  ok("insertEntity: 23505 (unique) → 409", !dupIns.ok && dupIns.response.status === 409);
  const dupBody = !dupIns.ok ? ((await dupIns.response.json()) as { error?: string }) : {};
  ok("insertEntity: 23505 mesajı GÜVENLİ (kod/constraint/tablo sızmaz)",
    typeof dupBody.error === "string" && !/\d{5}|constraint|relation|duplicate key|cupping_/i.test(dupBody.error));
  const delRestrict = await deleteEntity(makeErrorDb("23503"), CUPPING_TABLES.points, "t-1", "p1");
  ok("deleteEntity: 23503 (RESTRICT/in-use) → 409", !delRestrict.ok && delRestrict.response.status === 409);
  const insFk = await insertEntity(makeErrorDb("23503"), CUPPING_TABLES.points, "t-1", { name: "x" });
  ok("insertEntity: 23503 → generic 500 (in-use mesajı YALNIZ delete'te)", !insFk.ok && insFk.response.status === 500);
  const insOther = await insertEntity(makeErrorDb("99999"), CUPPING_TABLES.points, "t-1", { name: "y" });
  ok("insertEntity: bilinmeyen hata → güvenli 500", !insOther.ok && insOther.response.status === 500);

  // ── K3/K4: Türkçe-duyarlı arama (I/İ/ı/i) ──
  console.log("\n── K3/K4: Türkçe arama katlaması (trFold) ──");
  ok("trFold: İ ve i eşdeğer ('İstanbul' ~ 'istanbul')", trFold("İstanbul") === trFold("istanbul"));
  ok("trIncludes: 'istanbul' → 'İstanbul Noktası' bulur", trIncludes("İstanbul Noktası", "istanbul"));
  ok("trIncludes: 'KIRIK' → 'Kırık' bulur (I/ı katlaması)", trIncludes("Kırık Bölgesi", "KIRIK"));
  ok("trIncludes: array (synonyms) alanında arar", trIncludes(["Kalp", "Sırt Bölgesi"], "sirt"));
  ok("trIncludes: eşleşmeyen sorgu false", trIncludes("Baş", "omuz") === false);
  ok("trIncludes: boş sorgu her şeyi geçirir", trIncludes("herhangi", "  ") === true);

  // ── K1/K9 kaynak kontratı (grep — davranış testlerini DESTEKLER, tek başına DEĞİL) ──
  ok("api.ts: K1 normalizeNullableEnums bağlı (insert/update)", /normalizeNullableEnums/.test(apiSrc));
  ok("api.ts: K9 hata kodu eşlemesi (23505/23503)", /23505/.test(apiSrc) && /23503/.test(apiSrc));

  console.log(`\nSONUÇ: ${pass} passed, ${fail} failed`);
  if (fail > 0) { process.exitCode = 1; console.error("HARNESS FAIL — Kupa güvenlik kontratı ihlal edildi."); }
  else { console.log("HARNESS PASS — tenant izolasyonu + entitlement + payload sınırları KİLİTLİ."); }
}

run().catch((e) => { console.error("HARNESS ERROR", e); process.exitCode = 1; });
