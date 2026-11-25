// R5 ROXY — #858 ev atfı düzenli ifadeleri (TR / EN) gerçek TR/EN Natal-ailesi yanıtlarında: aynı alan yolunda isabet karşılaştırması (0 çağrı; #858 ağacında koşar).
import fs from "node:fs";
import * as natalLocal from "@/lib/astrology/houses/natalLocal";
// #858 dışa aktarımları (F1 dalında RE_EN yok → gevşek erişim).
const HOUSE_REFERENCE_RE = natalLocal.HOUSE_REFERENCE_RE;
const HOUSE_REFERENCE_RE_EN = (natalLocal as unknown as { HOUSE_REFERENCE_RE_EN: RegExp }).HOUSE_REFERENCE_RE_EN;
const H = "C:/YasamSistemi-Kanit/I18N-F1-R5-2026-11-25/roxy/ham/atlas/";
const all: string[] = [];
const coll = (v: unknown, p: string, acc: [string, string][]) => { if (typeof v === "string") acc.push([p, v]); else if (Array.isArray(v)) v.forEach((x, i) => coll(x, `${p}[${i}]`, acc)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) coll(x, `${p}.${k}`, acc); return acc; };
let tot = { tr: 0, en: 0, both: 0, onlyTr: 0, onlyEn: 0 };
const samples: string[] = [];
for (const f of fs.readdirSync(H).filter((f) => /^(00|05|06|07|08|09|11)-.*-tr\.json$/.test(f))) {
  const tr = coll(JSON.parse(fs.readFileSync(H + f, "utf8")).response, "", []);
  const en = new Map(coll(JSON.parse(fs.readFileSync(H + f.replace(/-tr\.json$/, "-en.json"), "utf8")).response, "", []));
  for (const [p, s] of tr) {
    const e = en.get(p);
    if (typeof e !== "string" || s.length < 25) continue;
    const a = HOUSE_REFERENCE_RE.test(s.toLocaleLowerCase("tr-TR")), b = HOUSE_REFERENCE_RE_EN.test(e.toLowerCase());
    if (a) tot.tr++; if (b) tot.en++; if (a && b) tot.both++;
    if (a && !b) { tot.onlyTr++; if (samples.length < 6) samples.push(`YALNIZ-TR ${f.slice(0, 20)} ${p}: ${s.slice(0, 90)} || ${e.slice(0, 90)}`); }
    if (!a && b) { tot.onlyEn++; if (samples.length < 12) samples.push(`YALNIZ-EN ${f.slice(0, 20)} ${p}: ${s.slice(0, 90)} || ${e.slice(0, 90)}`); }
  }
}
console.log(JSON.stringify(tot)); samples.forEach((s) => console.log(s)); void all;
