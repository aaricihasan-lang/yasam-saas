// KAMPANYA MERKEZİ KM-2 — panel açıklama katmanı (lib/campaign/catalogUi.ts) ↔ sunucu kataloğu eşliği.
// Panel hiçbir zaman katalogda olmayan bir tekniği göstermemeli; görsel seçenekleri DB izin listesine uymalı ve dosyaları gerçekten
// bulunmalı; hazır metinler sunucu sınırlarını aşmamalı. Çalıştırma: npx tsx scripts/campaign/catalog-ui.test.ts
import fs from "node:fs";
import path from "node:path";
import { CAMPAIGN_CATALOG, NEVER_PUBLIC, getCatalogEntry } from "@/lib/campaign/catalog";
import { AFFIRMATIONS, IMAGE_OPTIONS, MODULE_UI, READINESS_UI, SLOGANS, SOURCE_UI, TECHNIQUE_UI, imageSrc, techniqueUi } from "@/lib/campaign/catalogUi";
import { IMAGE_REF_RE } from "@/lib/campaign/adminService";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const pub = (p: string) => fs.existsSync(path.join(process.cwd(), "public", p.replace(/^\//, "")));

const orphan = Object.keys(TECHNIQUE_UI).filter((k) => !getCatalogEntry(k));
check("U01 açıklama anahtarlarının tümü katalogda (sahte teknik yok)", orphan.length === 0, orphan.join(","));
check("U02 her katalog kaydının açıklaması / rapor kapsamı çözülür", CAMPAIGN_CATALOG.every((e) => techniqueUi(e.key).report.formats.length > 0 && techniqueUi(e.key).form.length > 0));
const mods = [...new Set(CAMPAIGN_CATALOG.map((e) => e.module))];
check("U03 her modülün başlığı, görseli ve gizli kaynak listesi var", mods.every((m) => MODULE_UI[m]?.title && pub(MODULE_UI[m].img) && NEVER_PUBLIC[m].length > 0));
const srcs = [...new Set(CAMPAIGN_CATALOG.flatMap((e) => e.comments))];
check("U04 her yorum kaynağının etiketi var", srcs.every((s) => SOURCE_UI[s]?.label));
check("U05 her uygunluk düzeyinin etiketi var", CAMPAIGN_CATALOG.every((e) => READINESS_UI[e.readiness]?.label));
check("U06 görsel seçenekleri DB izin listesine uyar", IMAGE_OPTIONS.every((o) => o.ref === null || IMAGE_REF_RE.test(o.ref)));
check("U07 görsel dosyaları public/ altında gerçekten var", IMAGE_OPTIONS.every((o) => o.src === null || pub(o.src)), IMAGE_OPTIONS.filter((o) => o.src && !pub(o.src)).map((o) => o.src).join(","));
check("U08 izin listesinde olmayan ref için görsel yok", imageSrc("assets/olmayan.webp") === null && imageSrc(null) === null);
check("U09 hazır sloganlar sınırda (slogan ≤ 90, açıklama ≤ 220)", SLOGANS.every((s) => s.text.length <= 90 && s.sub.length <= 220));
check("U10 hazır olumlamalar ≤ 120", AFFIRMATIONS.every((a) => a.length <= 120));
check("U11 logo dosyası var", pub("/premium/brand/yasam-sistemi-logo.webp") && pub("/premium/landing/hero-sahne.webp"));
const koz = CAMPAIGN_CATALOG.find((e) => e.module === "kozmik");
check("U12 Kozmik Takvim tek paket, 6 özellik, 0 kredi", CAMPAIGN_CATALOG.filter((e) => e.module === "kozmik").length === 1 && koz?.package?.features.length === 6 && koz.credit[1] === 0);
console.log(`\ncatalog-ui: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
