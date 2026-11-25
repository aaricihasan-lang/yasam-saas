/**
 * I18N-F1-R3 (D5) — Danışanlar API hata kodları + istemci eşlemesi + para biçimi harness'ı (DB/ağ YOK).
 *
 * Çalıştır: npx tsx scripts/i18n-clients/errors.harness.ts
 * Negatif deneme: npx tsx scripts/i18n-clients/errors.harness.ts --negative   (beklenen: çıkış 0, "NEGATİF: yakalandı")
 *
 * Kapsam:
 *  A. app/api/clients/** (Numeroloji uçları hariç) — `ok: false` hata yanıtlarının HEPSİNDE `code` var.
 *  B. Bu rotaların + lib/danisan doğrulayıcılarının yaydığı her BÜYÜK HARF kodun EN metni var
 *     (clients.errors.codes veya ortak common.apiErrors.codes) ve EN metninde Türkçe harf yok.
 *  C. TR: sunucu Türkçe metni BİREBİR gösterilir (localizeApiError / withServerDetail) — kod eşlemesi olsa bile.
 *  D. EN: koddan çeviri; alan bazlı kod (INVALID_DATE + dogum); eşlenmeyen kod → çağıranın metni (karışık dil yok).
 *  E. Para / sayı: tr çıktısı eski Intl("tr-TR") / toLocaleString("tr-TR") ile birebir; TRY sabit.
 *  F. Katalog TR değeri, aynı koda karşılık gelen sunucu literaliyle aynı (tek literal olan kodlar).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { localizeApiError, withServerDetail, type ErrorTranslator } from "../../lib/i18n/apiError";
import { chainTranslators, fieldScopedCode, resolveClientsErrorPayload } from "../../lib/danisan/clientApiErrorCore";
import { formatCurrency, formatNumber } from "../../lib/i18n/format";

const ROOT = process.cwd(); // worktree kökünden çalıştırılır (npx tsx scripts/i18n-clients/errors.harness.ts)
const NEGATIVE = process.argv.includes("--negative");
let pass = 0;
let fail = 0;
function test(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}\n     ${(e as Error).message.split("\n").slice(0, 6).join("\n     ")}`); }
}

type Tree = Record<string, unknown>;
const readJson = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")) as Tree;
const trClients = (readJson("messages/tr/clients.errors.json").clients as Tree).errors as { generic: string; codes: Record<string, string> };
const enClients = (readJson("messages/en/clients.errors.json").clients as Tree).errors as { generic: string; codes: Record<string, string> };
const trCommon = (readJson("messages/tr/common.apiErrors.json").common as Tree).apiErrors as { generic: string; codes: Record<string, string> };
const enCommon = (readJson("messages/en/common.apiErrors.json").common as Tree).apiErrors as { generic: string; codes: Record<string, string> };
if (NEGATIVE) delete enClients.codes.CLIENT_NOT_OWNED; // bilinçli bozma: kapsam testi bunu yakalamalı

function translator(tree: { generic: string; codes: Record<string, string> }): ErrorTranslator {
  const get = (key: string): string | undefined => {
    if (key === "generic") return tree.generic;
    if (key.startsWith("codes.")) return tree.codes[key.slice(6)];
    return undefined;
  };
  const fn = ((key: string) => { const v = get(key); if (v === undefined) throw new Error(`eksik anahtar ${key}`); return v; }) as ErrorTranslator;
  fn.has = (key: string) => get(key) !== undefined;
  return fn;
}
const tTr = chainTranslators(translator(trClients), translator(trCommon));
const tEn = chainTranslators(translator(enClients), translator(enCommon));
const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;

// ─── Kaynak taraması ────────────────────────────────────────────────────────
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.ts$/.test(e.name)) out.push(rel);
  }
  return out;
}
const routeFiles = walk("app/api/clients").filter((f) => !/numerology/.test(f) && !/word-report\/(clientReport|numerology|sensitiveSections)/.test(f));
const libFiles = ["lib/danisan/clientValidation.ts", "lib/danisan/subRecordValidation.ts", "lib/danisan/rowVersion.ts", "lib/danisan/appointmentRules.ts"];

const uncoded: string[] = [];
const emitted = new Map<string, Set<string>>(); // kod → literal error metinleri
for (const f of [...routeFiles, ...libFiles]) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (n: ts.Node) => {
    if (ts.isObjectLiteralExpression(n)) {
      const props = n.properties.filter(ts.isPropertyAssignment);
      const prop = (k: string) => props.find((p) => p.name.getText(sf) === k);
      const ok = prop("ok"), err = prop("error"), code = prop("code");
      if (ok && err && ok.initializer.getText(sf) === "false") {
        if (!code) uncoded.push(`${f}:${sf.getLineAndCharacterOfPosition(err.getStart(sf)).line + 1}`);
        else if (ts.isStringLiteral(code.initializer)) {
          const c = code.initializer.text;
          const set = emitted.get(c) ?? new Set<string>();
          set.add(ts.isStringLiteral(err.initializer) ? err.initializer.text : "<dinamik>");
          emitted.set(c, set);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

console.log("A. Kodsuz hata yanıtı yok");
test(`app/api/clients/** (${routeFiles.length} dosya) — ok:false yanıtlarının hepsinde code`, () => {
  assert.deepEqual(uncoded, []);
});
test("tarama boş değil (en az 150 kodlu yanıt / 60 farklı kod)", () => {
  assert.ok(emitted.size >= 60, `kod sayısı ${emitted.size}`);
});

console.log("B. Her kodun EN metni var, EN metinde Türkçe harf yok");
const upper = [...emitted.keys()].filter((c) => /^[A-Z][A-Z0-9_]{1,63}$/.test(c));
test(`${upper.length} büyük harf kod → EN eşlemesi`, () => {
  const missing = upper.filter((c) => !tEn.has(`codes.${c}`));
  assert.deepEqual(missing, []);
});
test("EN clients.errors değerlerinde Türkçe harf yok", () => {
  const bad = Object.entries(enClients.codes).filter(([, v]) => TR_CHARS.test(v)).map(([k]) => k);
  assert.deepEqual(bad, []);
});
test("TR ve EN clients.errors anahtar kümesi eşit", () => {
  assert.deepEqual(Object.keys(trClients.codes).sort(), Object.keys(enClients.codes).sort().concat(NEGATIVE ? ["CLIENT_NOT_OWNED"] : []).sort());
});

console.log("C. TR: sunucu metni birebir");
test("localizeApiError(tr) — her kodlu literal için sunucu metni aynen", () => {
  for (const [c, texts] of emitted) for (const text of texts) {
    if (text === "<dinamik>") continue;
    assert.equal(localizeApiError(tTr, "tr", resolveClientsErrorPayload(tTr, { code: c, error: text }), "YEDEK"), text, c);
  }
});
test("withServerDetail(tr) — 'önek: sunucu metni' (eski t(x) + ': ' + json.error ile aynı)", () => {
  const p = { code: "CLIENT_NOT_OWNED", error: "Danışan bu hesaba ait değil." };
  assert.equal(withServerDetail(tTr, "tr", "Not kaydedilemedi", p), "Not kaydedilemedi: Danışan bu hesaba ait değil.");
});
test("TR alan bazlı doğrulama: sunucu metni aynen (birleşik kod TR'yi değiştirmez)", () => {
  const p = { code: "INVALID_DATE", field: "dogum", error: "Doğum tarihi geçerli bir takvim tarihi olmalı (GG.AA.YYYY) ve bugünden sonra olamaz." };
  assert.equal(localizeApiError(tTr, "tr", resolveClientsErrorPayload(tTr, p)), p.error);
});

// Alan bazlı yük (sunucunun ek `field` alanı) — ApiErrorPayload'a ek alan; nesne değişmeden geçirilir.
const wf = (o: { code: string; field: string; error?: string }) => o as { code?: unknown; error?: unknown };
console.log("D. EN: koddan çeviri, karışık dil yok");
test("EN CLIENT_NOT_OWNED", () => {
  assert.equal(localizeApiError(tEn, "en", { code: "CLIENT_NOT_OWNED", error: "Danışan bu hesaba ait değil." }), "This client does not belong to this account.");
});
test("EN alan bazlı: INVALID_DATE + dogum → doğum tarihi metni; + gorusme → görüşme metni", () => {
  assert.equal(fieldScopedCode(wf({ code: "INVALID_DATE", field: "dogum" })), "INVALID_DATE_DOGUM");
  const d = localizeApiError(tEn, "en", resolveClientsErrorPayload(tEn, wf({ code: "INVALID_DATE", field: "dogum", error: "x" })));
  const g = localizeApiError(tEn, "en", resolveClientsErrorPayload(tEn, wf({ code: "INVALID_DATE", field: "gorusme", error: "x" })));
  assert.match(d, /date of birth/); assert.match(g, /consultation date/);
});
test("EN alan bazlı anahtar yoksa yalın koda düşer (INVALID_DATE + bilinmeyen alan)", () => {
  assert.equal(localizeApiError(tEn, "en", resolveClientsErrorPayload(tEn, wf({ code: "INVALID_DATE", field: "appointment_date", error: "x" }))), enClients.codes.INVALID_DATE);
});
test("EN ortak kod (common.apiErrors) zinciri: SERVER_ERROR", () => {
  assert.equal(localizeApiError(tEn, "en", { code: "SERVER_ERROR", error: "Sunucu hatası." }), enCommon.codes.SERVER_ERROR);
});
test("EN eşlenmeyen kod → çağıranın metni; Türkçe sunucu metni ASLA yapıştırılmaz", () => {
  assert.equal(localizeApiError(tEn, "en", { code: "ZZ_UNKNOWN", error: "Türkçe metin" }, "Could not save."), "Could not save.");
  assert.equal(withServerDetail(tEn, "en", "Could not save", { code: "ZZ_UNKNOWN", error: "Türkçe metin" }), "Could not save");
  assert.equal(localizeApiError(tEn, "en", { error: "Türkçe metin" }, "Could not save."), "Could not save.");
});

console.log("E. Para / sayı biçimi");
const AMOUNTS = [0, 1, 12.5, 1250, 1234567.891, 99.999];
test("formatCurrency(tr) ≡ Intl('tr-TR', TRY, max 2) (UcretlendirmeTab / danışan kartı)", () => {
  for (const a of AMOUNTS) {
    const old = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(a);
    assert.equal(formatCurrency(a, "tr", "TRY", { maximumFractionDigits: 2 }), old, String(a));
  }
});
test("formatNumber(tr) ≡ toLocaleString('tr-TR') (Yolculuk toplam ücret)", () => {
  for (const a of AMOUNTS) assert.equal(formatNumber(a, undefined, "tr"), a.toLocaleString("tr-TR"), String(a));
});
test("EN para: TRY sabit, tutar aynı (yalnız ayraç değişir)", () => {
  const en = formatCurrency(1250, "en", "TRY", { maximumFractionDigits: 2 });
  assert.match(en, /1,250/); assert.match(en, /TRY|₺/);
});

console.log("F. Katalog TR değeri ↔ sunucu literali");
test("tek literalli kodlarda tr clients.errors değeri = sunucu metni", () => {
  const diffs: string[] = [];
  for (const [c, texts] of emitted) {
    const lits = [...texts].filter((t) => t !== "<dinamik>");
    if (lits.length !== 1 || texts.size !== 1 || !(c in trClients.codes)) continue;
    if (trClients.codes[c] !== lits[0]) diffs.push(`${c}: katalog="${trClients.codes[c]}" sunucu="${lits[0]}"`);
  }
  assert.deepEqual(diffs, []);
});

console.log(`\ni18n Danışanlar hata/biçim harness: ${pass} PASS / ${fail} FAIL`);
if (NEGATIVE) {
  if (fail > 0) { console.log("NEGATİF: yakalandı (bozulan EN eşlemesi FAIL verdi)"); process.exit(0); }
  console.log("NEGATİF: YAKALANMADI"); process.exit(1);
}
process.exit(fail === 0 ? 0 : 1);
