/**
 * R5 ROXY — HD #854 (d0e69840e + sonrası) GERÇEK TR/EN yanıtlarla ağsız denetim (0 ücretli çağrı). #854 dalının
 * dışa aktarılmış ağacında koşturulur; yalnız roxy/ham/hd altındaki kayıtlı gerçek yanıtları okur.
 *  - extractSystemReading(en, { providerLang: "en" }): EN sistem yorumunda Türkçe harf / sözcük sayısı (beklenen 0).
 *  - extractSystemReading(tr) varsayılan: TR yorumunda kalan İngilizce (sağlayıcı TR eksikliği) sayısı.
 *  - Varsa (A6 itildiyse) lib/human-design/narrative: kanonik SHA TR = EN.
 */
import fs from "node:fs";
import path from "node:path";
import { extractSystemReading } from "@/lib/human-design/providers/roxy/systemReading";
import { textLang, TR_CHARS } from "./textcheck";

const HAM = path.join(process.env.R5_KANIT_DIR ?? "C:/YasamSistemi-Kanit/I18N-F1-R5-2026-11-25", "roxy", "ham", "hd");
let pass = 0, fail = 0;
const res: Record<string, unknown> = {};
const check = (name: string, ok: boolean, detail?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail).slice(0, 400)}`);
  res[name] = { ok, detail };
};
const sr = extractSystemReading as unknown as (raw: unknown, o?: { providerLang?: string }) => unknown;

for (const p of ["p1", "p2", "p3", "hm", "hp", "hr", "fix"]) {
  const en = JSON.parse(fs.readFileSync(path.join(HAM, `bodygraph-${p}-en.json`), "utf8")).response;
  const tr = JSON.parse(fs.readFileSync(path.join(HAM, `bodygraph-${p}-tr.json`), "utf8")).response;
  const se = textLang(sr(en, { providerLang: "en" }));
  const seAll = JSON.stringify(sr(en, { providerLang: "en" }));
  const trCharCount = [...seAll].filter((ch) => TR_CHARS.test(ch)).length;
  check(`EN sistem yorumu Türkçe içermiyor (${p})`, se.tr === 0 && trCharCount === 0, { anlatı: se.n, tr: se.tr, en: se.en, trHarf: trCharCount, ornek: se.trS.slice(0, 3) });
  const st = textLang(sr(tr));
  res[`TR sistem yorumu dil dağılımı (${p})`] = st;
  console.log(`  bilgi TR sistem yorumu (${p}): anlatı ${st.n}, Türkçe ${st.tr}, İngilizce ${st.en}`, st.enS.slice(0, 2));
}

// A6 anlatı katmanı itildiyse kanonik SHA eşitliği
const narr = path.join(process.cwd(), "lib", "human-design", "narrative", "narrativeConsistency.ts");
if (fs.existsSync(narr)) {
  console.log("A6 anlatı katmanı mevcut — ayrı betik (hd-a6-narrative) ile koşulacak");
} else {
  console.log("A6 anlatı katmanı bu dal başında YOK (lib/human-design/narrative) — DOĞRULANAMADI");
  res.a6 = "dal başında yok";
}
fs.writeFileSync(path.join(path.dirname(HAM), "..", "hd-854-sonuc.json"), JSON.stringify({ zaman: new Date().toISOString(), pass, fail, res }, null, 1));
console.log(`=== HD #854 gerçek-EN ağsız denetim: ${pass} PASS / ${fail} FAIL ===`);
