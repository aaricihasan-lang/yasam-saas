/**
 * Beslenme → Mizaca Göre — EN gösterim adı (I18N geniş geliştirme B1, Owner teknik standardı).
 *
 * Kilitler:
 *   - Kanonik kimlikler (dem/safra/sovdavi/balgam) ve profil başlıkları (DB konu eşleşmesi: matchTitle) DEĞİŞMEZ.
 *   - TR görünen etiket = MIZAC_PROFILES.title BİREBİR (Türkçe ekran çıktısı aynı).
 *   - EN görünen etiket = Sanguine / Choleric / Melancholic / Phlegmatic; EN alt başlık / hub açıklamasında Türkçe
 *     mizaç adı (Dem, Safra, Sovdavi, Balgam) geçmez.
 *   - Sevda / Sovdavi birleştirilmedi (TR detail.mizac.sovdavi "Sevda (Soğuk-Kuru)" aynen).
 *
 * Çalıştır: npx tsx scripts/beslenme-mizac-i18n/harness.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MIZAC_PROFILES } from "../../lib/beslenme/contracts";
import { MIZAC_VALUES } from "../../lib/danisan/clientValidation";
import trB from "../../messages/tr/beslenme.json";
import enB from "../../messages/en/beslenme.json";

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`✗ ${name}`);
  }
}

const trShell = trB.beslenme.shell as Record<string, unknown>;
const enShell = enB.beslenme.shell as Record<string, unknown>;
const trName = trShell.mizacName as Record<string, string>;
const enName = enShell.mizacName as Record<string, string>;
const EXPECTED_EN: Record<string, string> = { dem: "Sanguine", safra: "Choleric", sovdavi: "Melancholic", balgam: "Phlegmatic" };

// 1. Kanonik kimlikler ve başlıklar
ok(JSON.stringify(MIZAC_PROFILES.map((p) => p.code)) === JSON.stringify(["dem", "safra", "sovdavi", "balgam"]), "kanonik kodlar aynı");
ok(JSON.stringify(MIZAC_PROFILES.map((p) => p.title)) === JSON.stringify(["Dem", "Safra", "Sovdavi", "Balgam"]), "profil başlıkları (matchTitle) aynı");
ok([...MIZAC_VALUES].sort().join(",") === ["balgam", "dem", "safra", "sovdavi"].join(","), "clients.mizac kanonik değerleri aynı");

// 2. TR birebir, EN eşleme
ok(MIZAC_PROFILES.every((p) => trName[p.code] === p.title), "TR görünen ad = profil başlığı (birebir)");
ok(MIZAC_PROFILES.every((p) => enName[p.code] === EXPECTED_EN[p.code]), "EN: Sanguine / Choleric / Melancholic / Phlegmatic");
ok(Object.keys(trName).length === 4 && Object.keys(enName).length === 4, "4 anahtar (TR/EN)");

// 3. EN alt başlık + hub açıklaması: Türkçe mizaç adı yok; TR aynen
const trHub = (trB.beslenme as { hub: { modules: { mizac: { description: string } } } }).hub.modules.mizac.description;
const enHub = (enB.beslenme as { hub: { modules: { mizac: { description: string } } } }).hub.modules.mizac.description;
const TR_NAMES = /\b(Dem|Safra|Sovdavi|Balgam|Sevda)\b/;
ok(!TR_NAMES.test(String(enShell.mizacSubtitle)) && !TR_NAMES.test(enHub), "EN alt başlık/hub: Türkçe mizaç adı yok");
ok(/Sanguine, Choleric, Melancholic, Phlegmatic/.test(String(enShell.mizacSubtitle)) && /Sanguine, Choleric, Melancholic, Phlegmatic/.test(enHub), "EN alt başlık/hub: dört İngilizce ad");
ok(
  trShell.mizacSubtitle === "Geleneksel dört mizaç (Dem, Safra, Sovdavi, Balgam) için beslenme profilleri. Her profil bölümler, ilişkili besinler ve kaynaklarla yapılandırılır." &&
    trHub === "Dört mizaç (Dem, Safra, Sovdavi, Balgam) için beslenme profilleri.",
  "TR alt başlık/hub birebir",
);

// 4. Sevda / Sovdavi birleştirilmedi (yalnız raporlandı)
const trDetail = (trB.beslenme as { detail: { mizac: Record<string, string> } }).detail.mizac;
ok(trDetail.sovdavi === "Sevda (Soğuk-Kuru)", "TR detail.mizac.sovdavi 'Sevda (Soğuk-Kuru)' aynen (birleştirme yok)");

// 5. Sayfa kaynağı: matchTitle kanonik, etiket katalogdan
const page = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app/beslenme/mizac/page.tsx"), "utf8");
ok(/matchTitle:\s*p\.title,/.test(page), "sayfa: matchTitle = p.title (DB eşleşmesi kanonik)");
ok(/label:\s*ts\(`mizacName\.\$\{p\.code\}`\)/.test(page), "sayfa: görünen etiket mizacName.<kod>");
ok(!/label:\s*p\.title/.test(page), "sayfa: etiket artık ham başlık değil");

console.log(`\nBeslenme mizaç i18n harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
