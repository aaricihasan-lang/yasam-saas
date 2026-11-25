/**
 * I18N-F1-R5 (HD) — Sistem Yorumu DTO'su: TR dışı sağlayıcı dilinde SİSTEM etiketleri İngilizce (Roxy ajanı bulgusu B2).
 * Ağ / DB / ücretli çağrı YOK — ROXY ajanının kaydettiği gerçek ham yanıtlar (TR + EN) yeniden kullanılır.
 *
 *   E1  Her EN yanıtın DTO'sunda (başlıklar, ayrıntı etiketleri, merkez/kanal adları, genel değerler, sağlayıcı metni)
 *       Türkçe harf YOK ("Jeneratör (Generator)", "İç Otorite", "(bilinçli)" gibi ürün TR etiketleri sızmaz).
 *   E2  EN başlıklar hd.terms.title ile aynı (Type / Strategy / Inner Authority / …).
 *   E3  EN'de "İngilizce kaldı" notu yok.
 *   T1  TR yanıtın DTO'su varsayılan (providerLang verilmeden) ve providerLang:"tr" ile BİREBİR aynı (TR yolu değişmedi).
 *   T2  TR DTO başlıkları uygulamanın mevcut iki dilli TR başlıkları ("Tip (Type)" …).
 *   K1  TR ve EN yanıtın DTO'sunda kanonik yapı aynı: genel anahtarlar, merkez kimlik/durumları, kanal kimlikleri, aktivasyon
 *       kimlikleri (taraf:kapı.çizgi) birebir.
 * Ham yanıt klasörü: HD_ROXY_HAM_DIR (varsayılan C:/YasamSistemi-Kanit/I18N-F1-R5-2026-11-25/roxy/ham/hd).
 * Çalıştırma: npx tsx scripts/hd-i18n/system-reading-en.harness.ts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { extractSystemReading, type SystemReadingDto } from "../../lib/human-design/providers/roxy/systemReading";
import enTerms from "../../messages/en/hd.terms.json";

const DIR = process.env.HD_ROXY_HAM_DIR ?? "C:/YasamSistemi-Kanit/I18N-F1-R5-2026-11-25/roxy/ham/hd";
let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
};
const shape = (d: SystemReadingDto) =>
  JSON.stringify({
    g: d.general.map((x) => x.key),
    c: d.centers.map((x) => `${x.id}:${x.state ?? ""}:${x.defined}`),
    ch: d.channels.map((x) => x.id),
    a: d.activations.map((x) => `${x.side}:${x.gate}.${x.line}`),
  });
const EN_TITLES = (enTerms as { hd: { terms: { title: Record<string, string> } } }).hd.terms.title;

if (!existsSync(DIR)) {
  console.log(`ham yanıt klasörü yok: ${DIR}`);
  console.log(`\nHD SİSTEM YORUMU EN: 0 PASS / 1 FAIL`);
  process.exit(1);
}
const names = readdirSync(DIR).filter((f) => /^bodygraph-.+-en\.json$/.test(f)).sort();
console.log(`HD Sistem Yorumu EN etiketleri — ${names.length} gerçek EN yanıt (${DIR})`);
ok("E0 en az 1 gerçek EN yanıtı bulundu", names.length > 0);
for (const f of names) {
  const id = f.replace(/^bodygraph-|-en\.json$/g, "");
  const unwrap = (j: unknown): unknown => (j && typeof j === "object" && "response" in (j as Record<string, unknown>) ? (j as Record<string, unknown>).response : j); // ROXY ajanı kaydı {endpoint, lang, body, response}
  const en = unwrap(JSON.parse(readFileSync(join(DIR, f), "utf8")));
  const trPath = join(DIR, f.replace(/-en\.json$/, "-tr.json"));
  const dEn = extractSystemReading(en, { providerLang: "en" });
  if (!dEn) {
    ok(`[${id}] EN DTO üretildi`, false);
    continue;
  }
  const leak = strings(dEn).filter((s) => TR_CHARS.test(s));
  ok(`[${id}] E1 EN DTO'da Türkçe harf yok`, leak.length === 0, leak.slice(0, 4).join(" ¦ "));
  ok(`[${id}] E2 EN başlıklar hd.terms.title`, dEn.general.every((g) => g.title === EN_TITLES[g.key]), dEn.general.map((g) => g.title).join(", "));
  ok(`[${id}] E3 EN'de dil notu yok`, (dEn.languageNote ?? null) === null);
  if (existsSync(trPath)) {
    const tr = unwrap(JSON.parse(readFileSync(trPath, "utf8")));
    const d0 = extractSystemReading(tr);
    const d1 = extractSystemReading(tr, { providerLang: "tr" });
    ok(`[${id}] T1 TR DTO varsayılan = providerLang:"tr"`, !!d0 && JSON.stringify(d0) === JSON.stringify(d1));
    ok(`[${id}] T2 TR başlıklar iki dilli TR ("Tip (Type)")`, !!d0 && d0.general.some((g) => g.key === "type" && g.title === "Tip (Type)"));
    ok(`[${id}] K1 TR/EN DTO kanonik yapı aynı`, !!d0 && shape(d0) === shape(dEn), d0 ? `${shape(d0).length}/${shape(dEn).length}` : "");
  }
}
console.log(`\nHD SİSTEM YORUMU EN: ${pass} PASS / ${fail} FAIL`);
if (fail) {
  for (const x of fails) console.log(` - ${x}`);
  process.exit(1);
}
