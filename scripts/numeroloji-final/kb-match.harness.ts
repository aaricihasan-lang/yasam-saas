/**
 * NUMEROLOJİ — BİLGİ BANKASI EŞLEŞMESİ (owner kararı F1-B + F2-B + F3-C, 2026-10-18).
 * Çalıştır: npx tsx scripts/numeroloji-final/kb-match.harness.ts [--out <dosya.md>]
 *
 * Ana/Yan Kulvar bilgi bankası (ve taş) adayları = resmî sonuçta GÖRÜNEN gerçek sayılar:
 * tam çekirdek + "/" ile ayrılan sayılar. Parantez (ara kontrol / birleşik okuma) aranmaz (F2-B);
 * görünmeyen kanonik anahtar aranmaz (F1-B); kalana özel sayı karışıp sadeleşen ara kontrol
 * parantezi gösterilmez (F3-C). Kanonik anahtar, çakra ve hesap matematiği DEĞİŞMEZ.
 * "ÖNCE" sütunu PR öncesi origin/main (f3a71c29) motor + eşleşme çıktısıdır (bir kez üretildi).
 */
import { writeFileSync } from "node:fs";
import JSZip from "jszip";
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";
import { anaKulvarCakraDestekleri } from "@/lib/numeroloji/cakraOmurgasi";
import {
  buildKnowledgeLookupPlan,
  kulvarValueCandidatesFromResult,
  pickNotesForType,
  valueCandidatesFromResult,
} from "@/app/numeroloji/bilgi-bankasi/helpers/knowledgeLookup";
import { buildStoneLookupPlan } from "@/app/numeroloji/bilgi-bankasi/helpers/stoneLookup";
import { buildNumerolojiWordChildren, packNumerolojiDocx } from "@/app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild";
import { NUMEROLOJI_METHODOLOGY_VERSION } from "@/lib/numeroloji/methodology";
import { buildAnalizOzeti } from "@/app/numeroloji/utils/numerolojiPlainMetin";
import type { NumerolojiResult } from "@/lib/numeroloji/ortak";
import type { KnowledgeRecordRow } from "@/app/numeroloji/bilgi-bankasi/helpers/bilgiBankaKayit";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : "";
let pass = 0;
let fail = 0;
function ok(c: boolean, label: string, d?: unknown) {
  if (c) pass++; else { fail++; console.log(`  ✗ ${label}`, d === undefined ? "" : JSON.stringify(d)); }
}
const J = JSON.stringify;

const SESLI: [string, number][] = [["I", 9], ["O", 6], ["E", 5], ["U", 3], ["A", 1]];
const SESSIZ: [string, number][] = [["R", 9], ["H", 8], ["G", 7], ["F", 6], ["N", 5], ["D", 4], ["C", 3], ["B", 2], ["S", 1]];
const harf = (t: number, a: [string, number][]) => { const o: string[] = []; let r = t; for (const [c, v] of a) while (r >= v) { o.push(c); r -= v; } return o; };
function kelime(v: number, c: number) {
  const a = harf(v, SESLI), b = harf(c, SESSIZ), o: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if (b[i]) o.push(b[i]); if (a[i]) o.push(a[i]); }
  return o.join("");
}
function kisi(ham: number[]): [string, string] {
  const p = ham.map((h) => kelime(h, h));
  return [p.slice(0, -1).join(" ") || p[0], p.length > 1 ? p[p.length - 1] : ""];
}

// [örnek, ham bileşenler, ÖNCE (origin/main): gösterim, anahtar, adaylar · SONRA beklenen: gösterim, adaylar]
const ORNEK: [string, number[], string, string, string[], string, string[]][] = [
  ["5+6=11", [5, 6], "11/5", "5", ["11/5", "11", "5"], "11", ["11"]],
  ["5+6+5=11/5", [5, 6, 5], "11/5", "5", ["11/5", "11", "5"], "11/5", ["11/5", "11", "5"]],
  ["11/22 (33)", [11, 22], "11/22 (33)", "11", ["11/22", "11", "22"], "11/22 (33)", ["11/22", "11", "22"]],
  ["11/11 (22)", [11, 11], "11/11 (22)", "11", ["11/11", "11"], "11/11 (22)", ["11/11", "11"]],
  ["11/19/19", [11, 19, 19], "11/19/19", "3", ["11/19/19", "11", "19", "3"], "11/19/19", ["11/19/19", "11", "19"]],
  ["19/5", [19, 5], "19/5", "5", ["19/5", "19", "5"], "19/5", ["19/5", "19", "5"]],
  ["22/11/8 (resmî sonuç)", [22, 11, 8], "22/11/8 (33/8)", "8", ["22/11/8", "22", "11", "8", "33"], "22/11/8 (33/8)", ["22/11/8", "22", "11", "8"]],
  ["22/19 (11/3) — owner ekranı [5,3,3,22,8]", [5, 3, 3, 22, 8], "22/19 (11/3)", "19", ["22/19", "22", "19", "11", "3"], "22/19", ["22/19", "22", "19"]],
];

const md: string[] = [];
md.push("# Bilgi Bankası Eşleşmesi — Önce / Sonra (F1-B · F2-B · F3-C)", "");
md.push("ÖNCE = PR öncesi origin/main (f3a71c29). SONRA = PR #433. Ana ve Yan Kulvar aynı kuralı izler (her satır her iki kulvar için doğrulandı). Kanonik anahtar ve çakra hesabı değişmedi.", "");
md.push("| Örnek | Önce: gösterim | Önce: anahtar | Önce: aranan | Sonra: gösterim | Sonra: anahtar | Sonra: aranan | Kaldırılan yapay aday | Çakra (Ana) |");
md.push("|---|---|---|---|---|---|---|---|---|");
for (const [ad, ham, oG, oK, oA, sG, sA] of ORNEK) {
  const [f, l] = kisi(ham);
  for (const [kulvar, r] of [["Ana", calcAnaKulvar(f, l)], ["Yan", calcYanKulvar(f, l)]] as [string, NumerolojiResult][]) {
    const aday = kulvarValueCandidatesFromResult(r);
    ok(r.display === sG, `${ad} ${kulvar} gösterim ${sG}`, r.display);
    ok(J(aday) === J(sA), `${ad} ${kulvar} aranan ${J(sA)}`, aday);
    const gorunen = new Set(r.display.replace(/\s*\([^)]*\)/g, "").split(/[/-]/).concat(r.display.replace(/\s*\([^)]*\)/g, "")));
    ok(aday.every((v) => gorunen.has(v)), `${ad} ${kulvar} tüm adaylar görünen sonuçta`);
  }
  const [f2, l2] = kisi(ham);
  const a = calcAnaKulvar(f2, l2);
  md.push(`| ${ad} | \`${oG}\` | ${oK} | ${oA.join(" · ")} | \`${a.display}\` | ${a.key} | ${sA.join(" · ")} | ${oA.filter((v) => !sA.includes(v)).join(", ") || "—"} | ${J(anaKulvarCakraDestekleri(f2, l2))} |`);
}

// Kanonik anahtar değişmedi (F1-B yalnız arama); 11/19/19 anahtarı hâlâ 3
{
  const [f, l] = kisi([11, 19, 19]);
  ok(calcAnaKulvar(f, l).key === "3" && calcYanKulvar(f, l).key === "3", "kanonik anahtar değişmedi (11/19/19 → 3, yalnız aranmıyor)");
}
// Eski kayıt gösterimleri (Model C — kaydedildiği gibi) için de parantez/sahte 0 aranmaz
{
  const mk = (display: string, key: string): NumerolojiResult => ({ display, key, steps: [] });
  ok(J(kulvarValueCandidatesFromResult(mk("11/8 (19/0)", "8"))) === J(["11/8", "11", "8"]), "eski kayıt 11/8 (19/0): 19 ve 0 aranmaz");
  ok(J(kulvarValueCandidatesFromResult(mk("22/19 (11/3)", "19"))) === J(["22/19", "22", "19"]), "eski kayıt 22/19 (11/3): 11 ve 3 aranmaz");
  ok(J(kulvarValueCandidatesFromResult(mk("11/5", "5"))) === J(["11/5", "11", "5"]), "eski kayıt 11/5 kaydedildiği gibi (görünen 5 aranır)");
  ok(J(kulvarValueCandidatesFromResult(mk("7", "7"))) === J(["7"]), "özel olmayan tek sayı");
}
// İfade Sayısı ve Hayat Yolu bu karardan etkilenmez
{
  const m = hesaplaNumeroloji({ firstName: "Hasan", lastName: "ARICI", birthDate: "14.02.1987" });
  const plan = buildKnowledgeLookupPlan(m);
  ok(J(plan.find((p) => p.analysisType === "ifade-sayisi")!.values) === J(valueCandidatesFromResult(m.ifadeSayisi)), "İfade Sayısı adayları değişmedi");
  ok(J(plan.find((p) => p.analysisType === "ana-kulvar")!.values) === J(["19/2", "19", "2"]), "HASAN Ana 19/2 → 19/2 · 19 · 2");
  const sp = buildStoneLookupPlan(m);
  ok(J(sp.find((p) => p.analysisType.includes("ana"))!.values) === J(["19/2", "19", "2"]), "taş önerileri de aynı görünen-sayı kuralı");
}
// Tam tarama: her Ana/Yan adayı görünen sonuçta; görünmeyen anahtar / parantez adayı yok; kalan+özel karışık parantez yok
{
  let tohum = 20261018;
  const rnd = () => ((tohum = (tohum * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const HAVUZ = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 18, 20, 28, 11, 11, 19, 19, 22, 22, 33, 29, 38];
  let n = 0;
  for (let i = 0; i < 13548; i++) {
    const g = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => HAVUZ[Math.floor(rnd() * HAVUZ.length)]);
    const [f, l] = kisi(g);
    for (const r of [calcAnaKulvar(f, l), calcYanKulvar(f, l)]) {
      n++;
      const cekirdek = r.display.replace(/\s*\([^)]*\)/g, "").trim();
      const tokens = new Set([cekirdek, ...cekirdek.split(/[/-]/)]);
      const aday = kulvarValueCandidatesFromResult(r);
      if (!aday.every((v) => tokens.has(v))) ok(false, "tarama: görünmeyen aday", { g, d: r.display, aday });
      const par = r.display.match(/\((\d+)\/(\d+)\)$/);
      if (par && Number(par[2]) >= 1 && Number(par[2]) <= 9) {
        // kalanı tek haneli parantez: yalnız gerçek (özel olmayan) parçalardan veya tek parçadan gelmeli
        const vals = (r.componentValues ?? []).filter((v) => v > 0);
        ok(vals.length > 0, "tarama: parantez bileşenli");
      }
    }
  }
  ok(n === 27096, "tarama: 13.548 girdi × Ana/Yan", n);
}
// Uzmanın bilgi bankası kayıtları değişmez + Word / ekran aynı plan
const rowsKB: KnowledgeRecordRow[] = [
  { id: "kb-11", tenant_id: "t", analysis_type: "ana-kulvar", value: "11", source: null, description: "YORUM_ON_BIR", updated_at: "2026-10-01" },
  { id: "kb-19", tenant_id: "t", analysis_type: "ana-kulvar", value: "19", source: null, description: "YORUM_ON_DOKUZ", updated_at: "2026-10-01" },
  { id: "kb-3", tenant_id: "t", analysis_type: "ana-kulvar", value: "3", source: null, description: "YORUM_YAPAY_UC", updated_at: "2026-10-01" },
  { id: "kb-y3", tenant_id: "t", analysis_type: "yan-kulvar", value: "3", source: null, description: "YORUM_YAN_YAPAY_UC", updated_at: "2026-10-01" },
  { id: "kb-y11", tenant_id: "t", analysis_type: "yan-kulvar", value: "11", source: null, description: "YORUM_YAN_PARANTEZ_ON_BIR", updated_at: "2026-10-01" },
];
const rowsOnce = J(rowsKB);
(async () => {
  const [f, l] = kisi([11, 19, 19]);
  const m = hesaplaNumeroloji({ firstName: f, lastName: l, birthDate: "14.02.1987" });
  const seen = new Set<string>();
  const notlar = buildKnowledgeLookupPlan(m).flatMap((p) => pickNotesForType(rowsKB, p.analysisType, p.values, seen, p));
  const ids = notlar.map((x) => x.id);
  ok(ids.includes("kb-11") && ids.includes("kb-19") && !ids.includes("kb-3"), "11/19/19: 11 ve 19 yorumu gelir, yapay 3 gelmez", ids);
  ok(J(rowsKB) === rowsOnce, "uzmanın bilgi bankası kayıtları değişmedi (salt okuma)");
  const row = { id: "r1", name: f, surname: l, birth_date: "14.02.1987", created_at: "2026-10-18T10:00:00Z",
    analysis_data: { version: 1, motor: m, summary: buildAnalizOzeti(m), calc: { methodology: NUMEROLOJI_METHODOLOGY_VERSION } } };
  const shared = { knowledgeRows: rowsKB, entries: [], sourceLabelById: new Map(), stoneRows: [] };
  const sections = { summary: true, plain: true, detailed: true, tas: false } as never;
  const { children } = buildNumerolojiWordChildren([row] as never, sections, shared as never, new Map());
  const zip = await JSZip.loadAsync(await packNumerolojiDocx(children, "Test"));
  const x = (await zip.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
  ok(x.includes("YORUM_ON_BIR") && x.includes("YORUM_ON_DOKUZ"), "Word: görünen 11 ve 19 yorumları var");
  ok(!x.includes("YORUM_YAPAY_UC") && !x.includes("YORUM_YAN_YAPAY_UC"), "Word: yapay 3 yorumu yok");
  // [5,3,3,22,8] Yan: parantezdeki 11/3 yorumları gelmez
  const [f5, l5] = kisi([5, 3, 3, 22, 8]);
  const m5 = hesaplaNumeroloji({ firstName: f5, lastName: l5, birthDate: "14.02.1987" });
  const s5 = new Set<string>();
  const n5 = buildKnowledgeLookupPlan(m5).flatMap((p) => pickNotesForType(rowsKB, p.analysisType, p.values, s5, p)).map((x2) => x2.id);
  ok(!n5.includes("kb-y11") && !n5.includes("kb-y3"), "22/19: parantezden 11 ve 3 yorumu gelmez", n5);

  const text = md.join("\n");
  if (OUT) writeFileSync(OUT, text, "utf8");
  console.log(text);
  console.log(`\nkb-match harness: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
