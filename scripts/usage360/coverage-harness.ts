/**
 * USAGE360 AŞAMA 2B — TELEMETRİ KAPSAM HARNESS'İ (statik, TypeScript AST).
 *
 * Kaynak doğruluk: scripts/usage360/route-events/<modül>.json — her modül route handler'ı için
 * AÇIK iş semantiği eşlemesi (HTTP metodundan TÜRETİLMEZ):
 *   { "route": "dogaltas/stones", "method": "POST",
 *     "events": [{ "action": "record_created", "subEntity": "stone" }], "failure": "server" }
 *   { "route": "dogaltas/stones/photos/signed-urls", "method": "POST", "exempt": "okuma: imzalı URL" }
 *
 * Doğrulananlar:
 *   1. Kapsam: modül prefix'i altındaki HER GET-dışı handler + her rapor/indirme GET'i manifestte
 *      (olay veya gerekçeli muafiyet). Admin-only modüllerde her handler muaf.
 *   2. Koddaki trackUsage çağrıları manifestle BİREBİR (module / action / subEntity).
 *   3. module = dosyanın modülü; action sunucu eylemi (module_opened değil); subEntity allowlist'te.
 *   4. Başarı olayı handler'ın ilk iş `await`'inden SONRA (guard'dan önce/ilk satırda değil).
 *   5. "failure" beyan edilen handler'da serverErrorResponse/logServerError `usage:` bağlamı
 *      veya action_failed trackUsage çağrısı var.
 *   6. Muaf handler'da trackUsage YOK. Manifest dışı hiçbir yerde trackUsage YOK.
 *   7. Eski adaptör (recordUsageEvent) route'lardan doğrudan çağrılmaz (çift sayım yok).
 *   8. İstemci: /api/usage/beacon'a yalnız usageBeaconClient gider; reportUsageExport çağrılarının
 *      modül/alt-varlık literal'leri geçerli; CREATE/UPDATE/DELETE istemciden gönderilemez.
 * Dinamik doğrulama (gerçek route + gerçek PG): scripts/usage360/route-integration.harness.ts.
 * Çalıştır: npx tsx scripts/usage360/coverage-harness.ts [--report]
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { USAGE_SUB_ENTITIES, USAGE_ACTIONS, isUsageModuleKey } from "../../lib/usage/usageTaxonomy";
import { ADMIN_ONLY_MODULE_KEYS } from "../../lib/auth/moduleAccessCore";
import { MODULE_ROUTE_PREFIXES, DEFERRED_MODULE_PREFIXES } from "../../lib/auth/moduleRouteRegistry";

const ROOT = process.cwd();
const MANIFEST_DIR = path.join(ROOT, "scripts/usage360/route-events");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const REPORT_GET_RE = /(word|pdf|report|export|download)/i;

type EventSpec = { action: string; subEntity?: string | null; subEntities?: string[] };
type HandlerSpec = {
  route: string;
  method: string;
  events?: EventSpec[];
  failure?: "server" | "conflict" | "none";
  exempt?: string;
  /** Handler mantığı paylaşılan bir fabrikada ise (ör. lib/cupping/…): olaylar o dosyada aranır. */
  implFile?: string;
  note?: string;
};
type Manifest = { module: string; handlers: HandlerSpec[] };

let pass = 0, fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  if (cond) pass++;
  else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}

// ── Route envanteri ───────────────────────────────────────────────────────────
function walk(dir: string): string[] {
  let out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(f));
    else if (e.name === "route.ts") out.push(f.split(path.sep).join("/"));
  }
  return out;
}
const prefixes: { prefix: string; key: string }[] = [
  ...MODULE_ROUTE_PREFIXES.map((p) => ({ prefix: p.prefix, key: p.key as string })),
  ...DEFERRED_MODULE_PREFIXES.map((p) => ({ prefix: p.prefix, key: p.key as string })),
];
function moduleOf(relFile: string): string | null {
  const m = prefixes.filter((p) => relFile.startsWith(p.prefix + "/")).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return m ? m.key : null;
}
function routeKey(relFile: string): string {
  return relFile.replace(/^app\/api\//, "").replace(/\/route\.ts$/, "");
}

const sourceCache = new Map<string, ts.SourceFile>();
function sf(rel: string): ts.SourceFile {
  let s = sourceCache.get(rel);
  if (!s) {
    s = ts.createSourceFile(rel, fs.readFileSync(path.join(ROOT, rel), "utf8"), ts.ScriptTarget.Latest, true);
    sourceCache.set(rel, s);
  }
  return s;
}

/** export async function M / export const M = … / export const { M, … } = … */
function exportedHandlers(rel: string): Map<string, ts.Node> {
  const out = new Map<string, ts.Node>();
  const src = sf(rel);
  for (const st of src.statements) {
    const isExport = ts.canHaveModifiers(st) && (ts.getModifiers(st) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExport) continue;
    if (ts.isFunctionDeclaration(st) && st.name && (METHODS as readonly string[]).includes(st.name.text)) out.set(st.name.text, st);
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && (METHODS as readonly string[]).includes(d.name.text)) out.set(d.name.text, d);
        if (ts.isObjectBindingPattern(d.name)) {
          for (const el of d.name.elements) {
            const nm = ts.isIdentifier(el.name) ? el.name.text : "";
            if ((METHODS as readonly string[]).includes(nm)) out.set(nm, d);
          }
        }
      }
    }
  }
  return out;
}

type Found = { module: string | null; action: string | null; subEntity: string | null | "*dynamic*"; pos: number; kind: "track" | "apiErrorUsage" };
function propLiteral(obj: ts.ObjectLiteralExpression, name: string): string | null | "*dynamic*" | undefined {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name) {
      if (ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer)) return p.initializer.text;
      if (p.initializer.kind === ts.SyntaxKind.NullKeyword) return null;
      return "*dynamic*";
    }
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === name) return "*dynamic*";
  }
  return undefined;
}
function collectCalls(node: ts.Node): { found: Found[]; firstWorkAwait: number; recordUsageEvent: boolean } {
  const found: Found[] = [];
  let firstWorkAwait = Number.POSITIVE_INFINITY;
  let recordUsageEvent = false;
  const visit = (n: ts.Node) => {
    if (ts.isAwaitExpression(n)) {
      const txt = n.expression.getText();
      if (!/^(requireModuleAccess|verifyUserRequest|require[A-Z]\w*|req\.json|request\.json|req\.formData|request\.formData|params|ctx\.params|context\.params|props\.params|trackUsage)\b/.test(txt)
          && !/\bparams$/.test(txt)) {
        firstWorkAwait = Math.min(firstWorkAwait, n.getStart());
      }
    }
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText();
      if (callee === "recordUsageEvent") recordUsageEvent = true;
      if (callee === "trackUsage" || callee === "trackUsageLater") {
        const spec = n.arguments[2];
        if (spec && ts.isObjectLiteralExpression(spec)) {
          const mod = propLiteral(spec, "module");
          const act = propLiteral(spec, "action");
          const sub = propLiteral(spec, "subEntity");
          found.push({
            module: mod === "*dynamic*" || mod === undefined ? null : mod,
            action: act === "*dynamic*" || act === undefined ? null : act,
            subEntity: sub === undefined ? null : sub,
            pos: n.getStart(),
            kind: "track",
          });
        } else {
          found.push({ module: null, action: null, subEntity: "*dynamic*", pos: n.getStart(), kind: "track" });
        }
      }
      if ((callee === "serverErrorResponse" || callee === "logServerError" || /jsonServerError$/.test(callee)) && n.arguments.some((a) => ts.isObjectLiteralExpression(a) && a.properties.some((p) => p.name && p.name.getText() === "usage"))) {
        found.push({ module: null, action: "action_failed", subEntity: null, pos: n.getStart(), kind: "apiErrorUsage" });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return { found, firstWorkAwait, recordUsageEvent };
}

/** Fabrika dosyasında `function POST(...)` gibi metod adlı (iç) fonksiyon bildirimi. */
function findInnerFunction(src: ts.SourceFile, method: string): ts.Node | null {
  let hit: ts.Node | null = null;
  const visit = (n: ts.Node) => {
    if (hit) return;
    if (ts.isFunctionDeclaration(n) && n.name?.text === method) { hit = n; return; }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return hit;
}

// ── Manifestler ───────────────────────────────────────────────────────────────
const manifests: Manifest[] = fs.existsSync(MANIFEST_DIR)
  ? fs.readdirSync(MANIFEST_DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(MANIFEST_DIR, f), "utf8")) as Manifest)
  : [];
const manifestByKey = new Map<string, { m: Manifest; h: HandlerSpec }>();
for (const m of manifests) {
  ok(isUsageModuleKey(m.module), `manifest modülü geçerli: ${m.module}`);
  for (const h of m.handlers) {
    const k = `${h.route}#${h.method}`;
    ok(!manifestByKey.has(k), `manifest tekil: ${k}`);
    manifestByKey.set(k, { m, h });
  }
}

const SERVER_ACTIONS = new Set<string>(USAGE_ACTIONS.filter((a) => a !== "module_opened"));
const report: string[] = [];
const counts = { handlers: 0, instrumented: 0, exempt: 0, events: 0, failureCovered: 0 };
const perModule: Record<string, { handlers: number; instrumented: number; exempt: number; actions: Record<string, number> }> = {};

console.log("\n[kapsam] modül route handler'ları ↔ manifest");
const routeFiles = walk(path.join(ROOT, "app/api")).map((f) => path.relative(ROOT, f).split(path.sep).join("/"));
const covered = new Set<string>();
for (const rel of routeFiles) {
  const mod = moduleOf(rel);
  if (!mod) continue;
  const handlers = exportedHandlers(rel);
  for (const [method, node] of handlers) {
    const rk = routeKey(rel);
    const isReportGet = method === "GET" && REPORT_GET_RE.test(rk);
    if (method === "GET" && !isReportGet) continue;
    const key = `${rk}#${method}`;
    counts.handlers++;
    perModule[mod] ??= { handlers: 0, instrumented: 0, exempt: 0, actions: {} };
    perModule[mod].handlers++;
    const entry = manifestByKey.get(key);
    ok(!!entry, `manifestte tanımlı: ${key}`);
    if (!entry) continue;
    covered.add(key);
    const { m, h } = entry;
    ok(m.module === mod, `${key}: manifest modülü (${m.module}) = route modülü (${mod})`);

    // Fabrika: olaylar, fabrika dosyasında METODLA AYNI ADLI iç fonksiyonda aranır (bulunamazsa dosya).
    const implNode = h.implFile ? (findInnerFunction(sf(h.implFile), method) ?? sf(h.implFile)) : node;
    const { found, firstWorkAwait, recordUsageEvent } = collectCalls(implNode);
    ok(!recordUsageEvent, `${key}: eski recordUsageEvent doğrudan çağrılmıyor (çift sayım yok)`);
    const tracks = found.filter((f) => f.kind === "track");

    if (ADMIN_ONLY_MODULE_KEYS.has(mod)) {
      ok(!!h.exempt && tracks.length === 0, `${key}: admin-only modül → muaf, olay yok`);
      counts.exempt++; perModule[mod].exempt++;
      continue;
    }
    if (h.exempt) {
      ok(h.exempt.trim().length >= 8, `${key}: muafiyet gerekçeli`);
      ok(tracks.length === 0, `${key}: muaf handler'da trackUsage YOK`);
      counts.exempt++; perModule[mod].exempt++;
      report.push(`${mod}\t${method}\t${rk}\tMUAF: ${h.exempt}`);
      continue;
    }
    const expected = h.events ?? [];
    ok(expected.length > 0, `${key}: olay beyanı var`);
    counts.instrumented++; perModule[mod].instrumented++;
    const success = tracks.filter((t) => t.action !== "action_failed");
    ok(success.length > 0, `${key}: kodda en az bir başarı trackUsage çağrısı`);
    for (const t of success) {
      ok(t.module === mod, `${key}: trackUsage module literal = ${mod} (bulunan: ${t.module})`);
      ok(!!t.action && SERVER_ACTIONS.has(t.action), `${key}: sunucu eylemi geçerli (${t.action})`);
      const spec = expected.find((e) => e.action === t.action);
      ok(!!spec, `${key}: '${t.action}' manifestte beyan edilmiş`);
      if (t.subEntity === "*dynamic*") {
        ok(!!spec?.subEntities?.length, `${key}: dinamik subEntity için manifest subEntities listesi var`);
        for (const s of spec?.subEntities ?? []) ok(USAGE_SUB_ENTITIES[mod as keyof typeof USAGE_SUB_ENTITIES].includes(s), `${key}: dinamik subEntity '${s}' allowlist'te`);
      } else if (t.subEntity != null) {
        ok(USAGE_SUB_ENTITIES[mod as keyof typeof USAGE_SUB_ENTITIES].includes(t.subEntity), `${key}: subEntity '${t.subEntity}' ${mod} allowlist'inde`);
        ok(spec?.subEntity === t.subEntity || (spec?.subEntities ?? []).includes(t.subEntity), `${key}: subEntity '${t.subEntity}' manifestle eşleşir`);
      }
      ok(t.pos > firstWorkAwait, `${key}: '${t.action}' olayı iş işleminden SONRA`);
      perModule[mod].actions[t.action ?? "?"] = (perModule[mod].actions[t.action ?? "?"] ?? 0) + 1;
      counts.events++;
    }
    for (const e of expected) {
      ok(success.some((t) => t.action === e.action), `${key}: manifestteki '${e.action}' kodda var`);
      ok(SERVER_ACTIONS.has(e.action) && e.action !== "action_failed", `${key}: manifest eylemi sunucu başarı eylemi (${e.action})`);
    }
    if (h.failure && h.failure !== "none") {
      const hasFailure = found.some((f) => f.kind === "apiErrorUsage") || tracks.some((t) => t.action === "action_failed");
      ok(hasFailure, `${key}: beyan edilen hata telemetrisi (${h.failure}) kodda var`);
      if (hasFailure) counts.failureCovered++;
    }
    report.push(`${mod}\t${method}\t${rk}\t${expected.map((e) => `${e.action}:${e.subEntity ?? (e.subEntities ?? []).join("|") ?? "-"}`).join(", ")}${h.failure && h.failure !== "none" ? `\t+fail:${h.failure}` : ""}`);
  }
}
for (const k of manifestByKey.keys()) ok(covered.has(k), `manifest girdisi gerçek bir handler'a karşılık gelir: ${k}`);

console.log("\n[global] manifest dışı trackUsage / beacon / eski adaptör");
function walkTs(dir: string): string[] {
  let out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walkTs(f));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(path.relative(ROOT, f).split(path.sep).join("/"));
  }
  return out;
}
const codeFiles = [...walkTs(path.join(ROOT, "app")), ...walkTs(path.join(ROOT, "lib")), ...walkTs(path.join(ROOT, "components"))];
const implFiles = new Set(manifests.flatMap((m) => m.handlers.map((h) => h.implFile).filter(Boolean) as string[]));
for (const rel of codeFiles) {
  const txt = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (/\btrackUsage(Later)?\(/.test(txt) && !rel.startsWith("lib/usage/") && rel !== "lib/http/apiError.ts") {
    const isRoute = rel.startsWith("app/api/") && rel.endsWith("/route.ts");
    ok(isRoute || implFiles.has(rel), `trackUsage yalnız manifestli route/fabrika dosyalarında: ${rel}`);
  }
  if (/recordUsageEvent\(/.test(txt)) ok(rel === "lib/usage/usageEvents.ts" || rel === "lib/usage/trackUsage.ts", `eski adaptör yalnız çekirdekte: ${rel}`);
  if (/\/api\/usage\/beacon/.test(txt)) ok(rel === "lib/usage/usageBeaconClient.ts" || rel === "app/api/usage/beacon/route.ts" || rel.startsWith("lib/usage/"), `beacon URL'i yalnız usageBeaconClient'ta: ${rel}`);
  for (const m of txt.matchAll(/reportUsageExport\(\s*"([a-z_]+)"(?:\s*,\s*"([a-z_]+)")?\s*\)/g)) {
    const [, mod, sub] = m;
    ok(isUsageModuleKey(mod), `${rel}: reportUsageExport modülü geçerli (${mod})`);
    if (sub && isUsageModuleKey(mod)) ok(USAGE_SUB_ENTITIES[mod].includes(sub), `${rel}: reportUsageExport subEntity '${sub}' allowlist'te`);
    report.push(`${mod}\tCLIENT\t${rel}\treport_exported:${sub ?? "-"}`);
  }
  if (/reportUsageExport\(/.test(txt) && rel !== "lib/usage/usageBeaconClient.ts") {
    ok(/reportUsageExport\(\s*"[a-z_]+"(\s*,\s*"[a-z_]+")?\s*\)/.test(txt), `${rel}: reportUsageExport literal argümanlarla çağrılır`);
  }
}

console.log("\n[özet] modül başına");
for (const [mod, s] of Object.entries(perModule).sort()) {
  console.log(`  ${mod.padEnd(18)} handler=${String(s.handlers).padStart(3)} enstrümante=${String(s.instrumented).padStart(3)} muaf=${String(s.exempt).padStart(3)}  ${Object.entries(s.actions).map(([a, n]) => `${a}:${n}`).join(" ")}`);
}
console.log(`  TOPLAM handler=${counts.handlers} enstrümante=${counts.instrumented} muaf=${counts.exempt} başarı-çağrısı=${counts.events} hata-kapsamı=${counts.failureCovered}`);
if (process.argv.includes("--report")) {
  fs.writeFileSync(path.join(ROOT, "scripts/usage360/coverage-report.tsv"), report.sort().join("\n") + "\n");
  console.log("  rapor: scripts/usage360/coverage-report.tsv");
}
console.log(`\n──────────\nUSAGE360 COVERAGE: PASS ${pass} · FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
