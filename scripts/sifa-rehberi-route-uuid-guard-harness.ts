/**
 * Şifa Rehberi — ROUTE UUID GUARD regresyon harness'i.
 * (Ağ/DB YOK: `isSifaUuid` birim mantığı + route kaynak-kontrat kontrolleri.)
 * Çalıştır: npx tsx scripts/sifa-rehberi-route-uuid-guard-harness.ts
 *
 * BAĞLAM (P3 fix): Dinamik route parametreleri (`[id]`) ve body `guideId` değerleri
 * doğrudan `uuid` kolonlarına gidiyor, geçersiz (non-UUID) girdi Postgres 22P02 →
 * sanitize 500 üretiyordu. İstemci-kaynaklı bu durum 500 DEĞİL, temiz 404/400 olmalı.
 * Bu harness, biçim guard'ının doğru sınıflandırdığını VE etkilenen route'ların guard'ı
 * (auth'tan SONRA) uyguladığını statik olarak kilitler → regresyon koruması.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isSifaUuid, UUID_RE } from "../lib/sifa-rehberi/ids";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    failures.push(label);
  }
}
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

// ── 1) isSifaUuid birim mantığı ────────────────────────────────────────────────
const VALID = [
  "11111111-1111-4111-8111-111111111111",
  "7cab707a-19b0-42ac-b12e-1cfbde76e3b8",
  "00000000-0000-0000-0000-000000000000",
  "7CAB707A-19B0-42AC-B12E-1CFBDE76E3B8", // büyük harf kabul
  "  11111111-1111-4111-8111-111111111111  ", // trim
];
const INVALID = [
  "not-a-uuid",
  "123",
  "aaaaaaaa",
  "00000000-0000-0000-0000-00000000000Z", // geçersiz karakter Z
  "11111111-1111-4111-8111-11111111111", // kısa
  "11111111-1111-4111-8111-1111111111111", // uzun
  "11111111111141118111111111111111", // tiresiz
  "",
  null,
  undefined,
  42,
  {},
];
for (const v of VALID) ok(isSifaUuid(v), `isSifaUuid kabul: ${JSON.stringify(v)}`);
for (const v of INVALID) ok(!isSifaUuid(v as unknown), `isSifaUuid red: ${JSON.stringify(v)}`);
ok(UUID_RE instanceof RegExp, "UUID_RE bir RegExp");
ok(!UUID_RE.test("zzzz"), "UUID_RE saçma girdiyi reddeder");

// ── 2) Tek kaynak: guides/route.ts yerel UUID_RE tanımlamaz, ids'ten içe aktarır ─
const guidesRoute = read("app/api/sifa-rehberi/guides/route.ts");
ok(/from ["']@\/lib\/sifa-rehberi\/ids["']/.test(guidesRoute), "guides/route: ids helper import edilir");
ok(!/const\s+UUID_RE\s*=\s*\//.test(guidesRoute), "guides/route: yerel UUID_RE kopya tanımı YOK (tek kaynak)");
// bulk DELETE guard'ı: geçersiz id → 400 (500 değil)
ok(/ids\.every\(isSifaUuid\)/.test(guidesRoute), "guides/route DELETE: ids UUID guard'ı (.in öncesi)");
ok(/Geçersiz kayıt kimliği\./.test(guidesRoute), "guides/route DELETE: geçersiz id → 400 mesajı");

// ── 3) Etkilenen route'lar: import + guard + auth-first sırası ──────────────────
type RouteCheck = { file: string; guardPredicate: RegExp; label: string };
const GUARDED: RouteCheck[] = [
  { file: "app/api/sifa-rehberi/guides/[id]/route.ts", guardPredicate: /if \(!isSifaUuid\(id\)\)/, label: "guides/[id]" },
  { file: "app/api/sifa-rehberi/guides/[id]/sections/route.ts", guardPredicate: /if \(!isSifaUuid\(id\)\)/, label: "guides/[id]/sections" },
  { file: "app/api/sifa-rehberi/photos/signed-urls/route.ts", guardPredicate: /if \(!isSifaUuid\(guideId\)\)/, label: "photos/signed-urls" },
  { file: "app/api/sifa-rehberi/photos/route.ts", guardPredicate: /if \(!isSifaUuid\(guideId\)\)/, label: "photos DELETE" },
];
for (const rc of GUARDED) {
  const src = read(rc.file);
  ok(/from ["']@\/lib\/sifa-rehberi\/ids["']/.test(src), `${rc.label}: ids helper import edilir`);
  ok(rc.guardPredicate.test(src), `${rc.label}: UUID guard mevcut`);
  // auth-first: requireModuleAccess çağrısı, ilk isSifaUuid guard'ından ÖNCE gelmeli.
  const authIdx = src.indexOf("requireModuleAccess");
  const guardIdx = src.search(rc.guardPredicate);
  ok(authIdx >= 0 && guardIdx >= 0 && authIdx < guardIdx, `${rc.label}: auth guard, UUID guard'ından ÖNCE (auth-first korunur)`);
}

// ── 4) prepare/finalize DEĞİŞMEDİ (zaten 403; 500 sınıfı değil) — kapsam dışı teyidi ─
for (const f of ["app/api/sifa-rehberi/photos/prepare/route.ts", "app/api/sifa-rehberi/photos/finalize/route.ts"]) {
  const src = read(f);
  ok(!/isSifaUuid/.test(src), `${f}: minimal kapsam — dokunulmadı (zaten 403, 500 değil)`);
}

console.log("");
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  ✗ " + f);
}
console.log(`\nŞİFA REHBERİ · ROUTE UUID GUARD HARNESS: ${pass} passed, ${fail} failed`);
console.log(fail === 0 ? "OVERALL: PASS" : "OVERALL: FAIL");
process.exit(fail === 0 ? 0 : 1);
