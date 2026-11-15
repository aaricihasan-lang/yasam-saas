/**
 * ASTROLOJİ — MARKA KAPSAMI harness'i (İP-0, 14.11.2026; owner kuralı 19.10.2026: kullanıcıya görünen hiçbir ekran / başlık /
 * açıklama / raporda sağlayıcı adı yok). brand-neutral (KP Horary + eski not + owner alan sınıfları) ve brand-ui.e2e (2026-10-15,
 * 26 teknik, tarayıcı) bugünkü 44 teknik + Horary'yi kapsamıyordu. Bu dosya ağsız / tarayıcısız ve TAM kapsamlıdır:
 *
 *   A) Word/PDF: demo fixture'ındaki (gerçek motor + depodaki gerçek sağlayıcı yanıtları) HER teknik — TECHNIQUE_IDS'in tamamı —
 *      buildAstroReport → reportTexts; hiçbir metinde sağlayıcı adı yok. Teknik kataloğu ile fixture kümesi birebir aynı olmalı
 *      (yeni teknik fixture'a girmezse test düşer → kapsam sessizce daralmaz).
 *   B) Kullanıcı metni kaynakları (TypeScript AST): app/admin/astroloji/** ile lib/astrology/{view,report,model,labels,horary}/**
 *      içindeki JSX metni ve string / şablon sabitleri. Hariç (görünmeyen kod tanımlayıcıları): modül yolları, className /
 *      data-testid / key / id / style öznitelikleri, yalnız küçük harf-rakam-tire belirteçleri (özel öğe adı, CSS değişkeni).
 *   C) Teknik etiketleri, "Yakında" listesi ve eski hesap notları (çalışma zamanı değerleri).
 * Gerçek Roxy / gerçek DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/brand-coverage.harness.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import DEMO_FIXTURE_JSON from "@/lib/astrology/demo/fixture.generated";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { TECHNIQUES, TECHNIQUE_IDS } from "@/lib/astrology/engine/techniques";
import { legacyMethodNotes } from "@/lib/astrology/legacyMethod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const ROOT = join(__dirname, "..", "..");
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");
const BRAND = /roxy/i;

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`FAIL ${name}\n     ${(e as Error).message.split("\n").slice(0, 12).join("\n     ")}`);
  }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mts)$/.test(e) && !/\.d\.ts$/.test(e)) out.push(p);
  }
  return out;
}

const HIDDEN_ATTRS = new Set(["className", "data-testid", "testId", "key", "id", "htmlFor", "style", "name", "ref", "role", "type"]);
/** Görünmeyen tek belirteç: özel öğe adı (roxy-transit-wheel), CSS sınıf/değişken parçası. Boşluklu cümle değil. */
const CODE_TOKEN = /^[a-z0-9_\-:[\].]+$/;
/**
 * Kullanıcıya ULAŞMAYAN, yalnız sunucu günlüğüne giden iç hata metni (tam metinle; başka istisna yok). figurePng'nin fırlattığı
 * hata renderFigurePng'de yakalanır, report/service.ts renderChartBlock yalnız console.error'a yazar ve Word/PDF'te haritanın
 * yerine nötr not basar (14.11.2026 kod okuması).
 */
const SERVER_LOG_ONLY = new Set(["lib/astrology/report/figurePng.ts Roxy harita bileşeni yüklenemedi"]);

function visibleStrings(file: string, src = readFileSync(file, "utf8")): { line: number; text: string }[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { line: number; text: string }[] = [];
  const push = (n: ts.Node, text: string) => {
    if (!BRAND.test(text)) return;
    if (CODE_TOKEN.test(text.trim())) return;
    out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, text: text.trim().slice(0, 140) });
  };
  const hiddenContext = (n: ts.Node): boolean => {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
      if (ts.isCallExpression(p) && p.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
      if (ts.isJsxAttribute(p)) return HIDDEN_ATTRS.has(p.name.getText(sf));
      if (ts.isPropertyAssignment(p) && ["className", "testId", "key", "id"].includes(p.name.getText(sf))) return true;
      if (ts.isCallExpression(p) && /^(console\.(log|warn|error|info)|logAstroDbError|logger\.\w+)$/.test(p.expression.getText(sf))) return true;
      if (ts.isStatement(p) || ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p)) return false;
    }
    return false;
  };
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n)) push(n, n.getText(sf));
    else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !hiddenContext(n)) push(n, n.text);
    else if (ts.isTemplateExpression(n) && !hiddenContext(n)) push(n, [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join("…"));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

async function main() {
  const demo = JSON.parse(DEMO_FIXTURE_JSON as string) as J;
  const analyses = Object.values(demo.analyses as Record<string, J>).map((x) => x.analysis ?? x);

  await t("A) Word/PDF: demo fixture TECHNIQUE_IDS'in TAMAMINI kapsar (44 teknik) — kapsam sessizce daralamaz", () => {
    const have = new Set(analyses.map((a) => a.technique));
    const missing = TECHNIQUE_IDS.filter((id) => !have.has(id));
    assert.deepEqual(missing, [], `fixture'da raporu sınanmayan teknik: ${missing.join(", ")}`);
    assert.ok(TECHNIQUE_IDS.length >= 44, `teknik sayısı ${TECHNIQUE_IDS.length}`);
  });

  await t("A) Word/PDF: her tekniğin rapor metinleri (başlık, kapak, başlıklar, paragraflar, tablolar, şekil açıklamaları) sağlayıcı adı içermez", () => {
    const bad: string[] = [];
    let n = 0;
    for (const a of analyses) {
      const r = buildAstroReport({ ...a, notes: a.notes ?? [], knowledgeBank: a.knowledgeBank ?? [] });
      const texts = reportTexts(r);
      n += texts.length;
      for (const x of texts) if (typeof x === "string" && BRAND.test(x)) bad.push(`${a.technique}: ${x.slice(0, 120)}`);
    }
    assert.deepEqual(bad, []);
    assert.ok(n > 2000, `taranan metin ${n}`);
  });

  await t("B) Kullanıcı metni kaynakları (ekran + Word/PDF + Horary): JSX metni ve string sabitlerinde sağlayıcı adı yok", () => {
    const dirs = ["app/admin/astroloji", "lib/astrology/view", "lib/astrology/report", "lib/astrology/model", "lib/astrology/labels", "lib/astrology/horary"];
    const files = dirs.flatMap((d) => walk(join(ROOT, d)));
    assert.ok(files.length > 150, `taranan dosya ${files.length}`);
    const bad = files.flatMap((f) => visibleStrings(f).map((x) => `${rel(f)} ${x.text}`)).filter((x) => !SERVER_LOG_ONLY.has(x));
    assert.deepEqual(bad, []);
    // İzin listesi gerçekten var olan satırlarla sınırlı (bayat istisna birikmez).
    const all = new Set(files.flatMap((f) => visibleStrings(f).map((x) => `${rel(f)} ${x.text}`)));
    for (const x of SERVER_LOG_ONLY) assert.ok(all.has(x), `bayat istisna: ${x}`);
  });

  await t("B) dedektör pozitif kontrolü: görünür JSX metni / başlık / şablon yakalanır; className, data-testid, modül yolu, özel öğe adı yakalanmaz", () => {
    const src = [
      'import { X } from "@roxyapi/ui/components/x";',
      'const a = () => import("@roxyapi/ui/locales/tr");',
      'const tag = "roxy-transit-wheel";',
      'export const T = "Hesap Roxy altyapısıyla";',
      'export function P({ n }: { n: number }) {',
      '  return <div className="roxy-host flex" data-testid="roxy-x" title={`Kaynak: Roxy ${n}`}>RoxyAPI sonucu</div>;',
      '}',
    ].join("\n");
    const hits = visibleStrings("sentetik.tsx", src).map((x) => x.text);
    assert.deepEqual(hits, ["Hesap Roxy altyapısıyla", "Kaynak: Roxy …", "RoxyAPI sonucu"]);
  });

  await t("C) Teknik etiketleri + Yakında listesi + eski hesap notları (çalışma zamanı) sağlayıcı adı içermez", async () => {
    for (const d of Object.values(TECHNIQUES)) assert.ok(!BRAND.test(d.label), `${d.id}: ${d.label}`);
    const ui = (await import("@/app/admin/astroloji/_lib/techniques")) as J;
    const uiText = JSON.stringify(ui.UI_TECHNIQUES ?? ui);
    assert.ok(!BRAND.test(uiText), "UI_TECHNIQUES");
    const cs = (await import("@/app/admin/astroloji/_lib/comingSoon")) as J;
    assert.ok(!BRAND.test(JSON.stringify(cs)), "comingSoon");
    const avs = ["astro-roxy-composite-1", "astro-roxy-natal-1", "astro-roxy-vedic-upagraha-1", "astro-roxy-vedic-dashakoot-1", "astro-roxy-kp-horary-1"];
    for (const technique of TECHNIQUE_IDS)
      for (const adapterVersion of avs)
        for (const houseSystem of ["placidus", "whole-sign"])
          for (const n of legacyMethodNotes({ technique, adapterVersion, houseSystem, revisions: [] })) assert.ok(!BRAND.test(n.text), `${technique} ${n.code}`);
  });

  console.log(`\nastrology brand-coverage harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
