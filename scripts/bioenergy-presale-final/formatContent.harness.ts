/**
 * BIO-15 regresyon harness'ı — metin biçimlendirme (Biyoenerji + Doğaltaş ortak yardımcı).
 * Çalıştır: npx tsx scripts/bioenergy-presale-final/formatContent.harness.ts
 *
 * 1) "https://…" ve "10:30" artık etiket satırı sayılmaz (bozulma giderildi).
 * 2) DOĞALTAŞ REGRESYONU: gerçek Doğaltaş bilgi kütüphanesinin (public/data/
 *    tas_bilgi_kutuphanesi.json, 240 makale) TÜM satırlarında eski regex ile yeni
 *    eşleştirici karşılaştırılır; fark YALNIZ URL-şeması / saat-oran satırlarında olabilir.
 * 3) Uzun kelime/URL için kırma sınıfları render çıktısında bulunur; korpus render'ı çökmez.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatStoneContent, matchLabelLine } from "@/lib/dogaltas/formatStoneContent";
import { harness } from "./fakePostgrest";

const H = harness("bioenergy-presale-final/formatContent");
const OLD_RE = /^([^:\n]{2,72}):\s*(.*)$/u; // origin/main LABEL_LINE_RE (birebir)
const render = (t: string) => renderToStaticMarkup(createElement("div", null, formatStoneContent(t)));

// 1) Hedef bozulmalar
H.ok(matchLabelLine("https://ornek.example/yol") === null, "https://… etiket DEĞİL");
H.ok(matchLabelLine("http://a.b") === null, "http://… etiket DEĞİL");
H.ok(matchLabelLine("Saat 10:30 seans") === null, "Saat 10:30 etiket DEĞİL");
H.ok(matchLabelLine("Oran 1:2") === null, "1:2 oranı etiket DEĞİL");
H.ok(JSON.stringify(matchLabelLine("Mineral sınıfı: Silikat")) === JSON.stringify({ label: "Mineral sınıfı", rest: "Silikat" }), "Mineral sınıfı: Silikat → etiket (korunur)");
H.ok(matchLabelLine("Renk:Mor")?.label === "Renk", "Renk:Mor (boşluksuz) → etiket (korunur)");
H.ok(matchLabelLine("Sertlik (Mohs): 7")?.rest === "7", "Sertlik (Mohs): 7 → etiket (korunur)");
H.ok(matchLabelLine("Kaynak: https://x.y")?.rest === "https://x.y", "Kaynak: https://… → etiket + URL değer bütün");
const html = render("Bağlantı https://ornek.example/uzun-ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ\nSaat 10:30 seans");
H.ok(!/<span class="font-bold[^"]*">https:<\/span>/.test(html) && html.includes("https://ornek.example"), "render: URL bölünmeden kalır");
H.ok(html.includes("Saat 10:30 seans") && !html.includes("Saat 10:</span>"), "render: 10:30 bölünmez");
H.ok(/overflow-wrap:anywhere/.test(html) || html.includes("[overflow-wrap:anywhere]"), "render: uzun kelime kırma sınıfı var");

// 2) Doğaltaş korpusu regresyonu
const lib = JSON.parse(readFileSync("public/data/tas_bilgi_kutuphanesi.json", "utf8")) as { icerik?: string; notlar?: string }[];
let lines = 0, labelsOld = 0, diffs = 0;
const unexpected: string[] = [];
for (const item of lib) {
  for (const field of [item.icerik, item.notlar]) {
    if (typeof field !== "string") continue;
    for (const raw of field.replace(/\r\n/g, "\n").split("\n")) {
      const t = raw.trim();
      if (!t) continue;
      lines += 1;
      const o = t.match(OLD_RE);
      const n = matchLabelLine(t);
      if (o) labelsOld += 1;
      const same = (!o && !n) || (!!o && !!n && o[1] === n.label && o[2] === n.rest);
      if (!same) {
        diffs += 1;
        const after = t.slice((o?.[1] ?? "").length + 1);
        const expected = after.startsWith("//") || (/\d$/.test(o?.[1] ?? "") && /^\d/.test(after));
        if (!expected) unexpected.push(t.slice(0, 80));
      }
    }
  }
}
console.log(`  Doğaltaş korpusu: ${lib.length} makale, ${lines} satır, eski etiket satırı ${labelsOld}, değişen ${diffs}`);
H.ok(lines > 1000, `korpus anlamlı büyüklükte (${lines} satır)`);
H.ok(unexpected.length === 0, `Doğaltaş: beklenmeyen etiket farkı YOK (${unexpected.length}) ${unexpected.slice(0, 3).join(" | ")}`);
let crashed = 0;
for (const item of lib) { try { render(item.icerik ?? ""); } catch { crashed += 1; } }
H.ok(crashed === 0, "Doğaltaş korpusunun tamamı hatasız render edilir");

H.done();
