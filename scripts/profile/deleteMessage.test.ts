/**
 * UZMAN PROFİLİ (F2) — Kişisel Dijital Ofis görsel silme 409 uyarısı (istemci metni) + sunucu metni tutarlılığı. DB / ağ YOK.
 * Owner kuralı: görsel rapor logosunda KULLANILMIYORSA (where'de rapor logosu girdisi yok) uyarı F2 öncesi (main) metinle BİREBİR;
 * rapor logosunda kullanılıyorsa bunu anlatan yeni metin. Çalıştır: npx tsx scripts/profile/deleteMessage.test.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { inUseMessage, studioDict } from "../../app/_premium/home/personal/studio/i18n";
import { REPORT_LOGO_REF } from "../../lib/workspace/catalog";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

const tr = studioDict("tr");
const en = studioDict("en");

section("Eski senaryolar: metin main (c8195718 / b25648c1) ile BİREBİR");
// main: app/_premium/home/personal/studio/i18n.ts → inUse
const MAIN_TR = (w: string) => `Bu görsel kullanılıyor: ${w}. Önce tasarımlardan kaldırın.`;
const MAIN_EN = (w: string) => `This image is in use: ${w}. Remove it from those designs first.`;
for (const where of [["uygulanan tasarım"], ["taslak"], ["geçmiş tasarım 2"], ["uygulanan tasarım", "taslak", "geçmiş tasarım 1"], ["geçmiş"]]) {
  const j = where.join(", ");
  ok(inUseMessage(tr, where) === MAIN_TR(j), `TR ${JSON.stringify(where)} → main metni`, inUseMessage(tr, where));
  ok(inUseMessage(en, where) === MAIN_EN(j), `EN ${JSON.stringify(where)} → main metni`, inUseMessage(en, where));
}
ok(tr.inUse("x") === MAIN_TR("x") && en.inUse("x") === MAIN_EN("x"), "inUse sözlük girdileri main ile aynı");

section("Rapor logosu senaryoları: yeni açıklama");
const R = REPORT_LOGO_REF;
ok(R === "rapor logosu (Ayarlar › Profilim)", "rapor logosu girdisi sabit", R);
ok(inUseMessage(tr, [R]) === "Bu görsel kullanılıyor: rapor logosu (Ayarlar › Profilim). Önce rapor logosundan kaldırın.", "TR yalnız rapor logosu", inUseMessage(tr, [R]));
ok(inUseMessage(en, [R]) === "This image is in use: rapor logosu (Ayarlar › Profilim). Remove it from the report logo first.", "EN yalnız rapor logosu", inUseMessage(en, [R]));
ok(inUseMessage(tr, ["geçmiş tasarım 1", R]) === "Bu görsel kullanılıyor: geçmiş tasarım 1, rapor logosu (Ayarlar › Profilim). Önce tasarımlardan ve rapor logosundan kaldırın.", "TR tasarım + rapor logosu", inUseMessage(tr, ["geçmiş tasarım 1", R]));
ok(inUseMessage(en, ["uygulanan tasarım", R]) === "This image is in use: uygulanan tasarım, rapor logosu (Ayarlar › Profilim). Remove it from those designs and the report logo first.", "EN tasarım + rapor logosu", inUseMessage(en, ["uygulanan tasarım", R]));
ok(!/rapor|report/i.test(inUseMessage(tr, ["taslak"])) && !/rapor|report/i.test(inUseMessage(en, ["taslak"])), "rapor logosu yoksa metinde rapor geçmez");

section("Sunucu metni (lib/workspace/assets.ts) istemciyle tutarlı");
const src = readFileSync(path.join(process.cwd(), "lib/workspace/assets.ts"), "utf8");
ok(src.includes('`Bu görsel kullanılıyor (${refs.where.join(", ")}); ${hint}`'), "sunucu kalıbı main ile aynı");
ok(src.includes('!report ? "önce tasarımdan kaldırın."'), "rapor girdisi yoksa sunucu ipucu main ile BİREBİR");
ok(src.includes('"önce rapor logosundan kaldırın."') && src.includes('"önce tasarımdan ve rapor logosundan kaldırın."'), "rapor / tasarım + rapor ipuçları istemciyle aynı anlamda");
ok(/export \{ REPORT_LOGO_REF \}/.test(src) && /REPORT_LOGO_REF[^\n]*from "\.\/catalog"/.test(src), "sunucu girdisi tek kaynaktan (catalog)");

console.log(`\nprofile delete message test: ${pass} PASS / ${fail} FAIL`);
if (fail) {
  console.error("FAIL:\n - " + failures.join("\n - "));
  process.exit(1);
}
