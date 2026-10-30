// Numeroloji ortak tarih girişi — saf biçimlendirme birim testi (ağsız, DB'siz).
import { formatTarihRakam, normalizeTarihGirdisi } from "../../../components/numeroloji/NumerolojiTarihInput";
let pass = 0, fail = 0;
const eq = (a: string, b: string, m: string) => { if (a === b) pass++; else { fail++; console.log(`✗ ${m}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); } };
const cases: [string, string][] = [
  ["14021987", "14.02.1987"], ["10041992", "10.04.1992"], ["30102026", "30.10.2026"],
  ["1", "1"], ["14", "14"], ["140", "14.0"], ["1402", "14.02"], ["14021", "14.02.1"],
  ["14.02.1987", "14.02.1987"], ["14/02/1987", "14.02.1987"], ["14-02-1987", "14.02.1987"],
  ["1987-02-14", "14.02.1987"], ["1987-2-4", "04.02.1987"],
  ["1.", "01."], ["1.2.", "01.02."], ["1.2.1990", "01.02.1990"], ["14.", "14."], ["14.2", "14.2"], ["14.2.", "14.02."],
  ["14..02", "14.02"], ["14.02..1987", "14.02.1987"], ["14.02.19876", "14.02.1987"], ["140219871234", "14.02.1987"],
  ["ab14cd02", "14.02"], ["", ""], [" 14 02 1987 ", "14.02.1987"], ["29022024", "29.02.2024"],
];
for (const [i, o] of cases) eq(normalizeTarihGirdisi(i), o, `normalize(${i})`);
eq(formatTarihRakam("290220"), "29.02.20", "format 6 rakam");
// İdempotent: biçimli değer tekrar biçimlenince değişmez (tekrar eden nokta oluşmaz).
for (const [, o] of cases) eq(normalizeTarihGirdisi(o), o.endsWith(".") ? o : o, `idempotent(${o})`);
console.log(`\nNumeroloji tarih biçimi: ${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
