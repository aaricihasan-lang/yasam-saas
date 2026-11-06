/**
 * GÖKYÜZÜ ATLASI — #643 NATAL 8 EV SİSTEMİ AŞAMA 3: arayüz seçim katmanı + istemci/sunucu sabit eşitliği (ağ YOK, tarayıcı YOK).
 * Ekran ölçümleri ayrı: scripts/astrology/natal-houses-ui.e2e.cjs (yerel next + sahte arka uç).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-natal-houses-ui.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOUSE_SYSTEMS } from "@/lib/astrology/model/western";
import {
  CLASSIC_NATAL_HOUSE_SYSTEMS,
  LOCAL_NATAL_INTERP_NOTE,
  NATAL_HIGH_LATITUDE,
  NATAL_HOUSE_SYSTEM_OPTIONS,
  NATAL_POLAR_LATITUDE,
  natalHouseSystemUndefinedAtLatitude,
} from "@/lib/astrology/model/natalHouseSystems";
import { NATAL_HOUSE_SYSTEMS, LOCAL_NATAL_INTERP_NOTE as SERVER_NOTE } from "@/lib/astrology/engine/natalHouses";
import { NATAL_HIGH_LATITUDE_WARN, NATAL_POLAR_HOUSE_LATITUDE, checkNatalHouseLatitude } from "@/lib/astrology/houses/natalLocal";
import { PRO_HOUSE_SYSTEMS } from "@/lib/astrology/houses/engine";
import { NATAL_HOUSE_SYSTEM_LABELS } from "@/lib/astrology/labels/tr";
import { DEFAULT_WESTERN_METHOD, buildSelections, defaultParams, houseSystemLabel } from "@/app/admin/astroloji/_lib/techniques";
import { HOUSE_SYSTEM_LABELS } from "@/lib/astrology/labels/tr";

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    process.stderr.write(`FAIL ${name}\n  ${(e as Error).message}\n`);
  }
}
const ROOT = join(__dirname, "..", "..");

t("U1 istemci modeli = sunucu: 8 sistem sırası, klasik 4, kutup/yüksek enlem eşikleri, yorum notu metni", () => {
  assert.deepEqual([...NATAL_HOUSE_SYSTEM_OPTIONS], [...NATAL_HOUSE_SYSTEMS]);
  assert.deepEqual([...NATAL_HOUSE_SYSTEM_OPTIONS].slice(0, 4), [...HOUSE_SYSTEMS], "mevcut 4'ün sırası");
  assert.deepEqual([...CLASSIC_NATAL_HOUSE_SYSTEMS], [...PRO_HOUSE_SYSTEMS]);
  assert.equal(NATAL_POLAR_LATITUDE, NATAL_POLAR_HOUSE_LATITUDE);
  assert.equal(NATAL_HIGH_LATITUDE, NATAL_HIGH_LATITUDE_WARN);
  assert.equal(LOCAL_NATAL_INTERP_NOTE, SERVER_NOTE);
  for (const lat of [0, 59.9, 60.01, 66.5, 66.51, -69.65, 89.9])
    for (const h of NATAL_HOUSE_SYSTEM_OPTIONS) assert.equal(natalHouseSystemUndefinedAtLatitude(h, lat), !!checkNatalHouseLatitude(h, lat).blocked, `${h} ${lat}`);
});

t("U2 seçim kurulumu: Natal YALNIZ natalHouseSystem'i, diğer Batı teknikleri YALNIZ ortak houseSystem'i kullanır (bağımsızlık)", () => {
  const p = { ...defaultParams(new Date("2026-10-31T12:00:00Z")), partnerProfileId: "00000000-0000-4000-8000-000000000008" };
  const checked = { "western.natal": true, "western.synastry": true, "western.solar_return": true, "western.composite": true, "western.extra_points": true } as const;
  for (const natal of NATAL_HOUSE_SYSTEM_OPTIONS)
    for (const shared of HOUSE_SYSTEMS) {
      const sel = buildSelections(checked, p, { houseSystem: shared, nodeType: "mean", natalHouseSystem: natal });
      const by = new Map(sel.map((s) => [s.technique, s.options as { houseSystem?: string; nodeType?: string }]));
      assert.equal(by.get("western.natal")?.houseSystem, natal, `natal ${natal}/${shared}`);
      assert.equal(by.get("western.natal")?.nodeType, "mean", "düğüm ortak");
      for (const k of ["western.synastry", "western.solar_return", "western.composite", "western.extra_points"] as const) {
        if (!by.has(k)) continue;
        assert.equal(by.get(k)?.houseSystem, shared, `${k} ${natal}/${shared}`);
      }
    }
});

t("U3 geriye dönük: natalHouseSystem verilmeyen eski çağıranlarda Natal ortak seçimi kullanır (önceki davranış birebir); varsayılanlar Placidus/true", () => {
  const p = defaultParams(new Date("2026-10-31T12:00:00Z"));
  for (const hs of HOUSE_SYSTEMS) {
    const sel = buildSelections({ "western.natal": true }, p, { houseSystem: hs, nodeType: "true" });
    assert.deepEqual(sel, [{ technique: "western.natal", options: { houseSystem: hs, nodeType: "true" } }]);
  }
  assert.deepEqual({ ...DEFAULT_WESTERN_METHOD }, { houseSystem: "placidus", nodeType: "true", natalHouseSystem: "placidus" });
});

t("U4 etiketler: arşiv/sonuç yöntem satırı klasik sistemlerde ham kimlik göstermez; mevcut 4 etiketi değişmez", () => {
  for (const h of HOUSE_SYSTEMS) assert.equal(houseSystemLabel(h, HOUSE_SYSTEM_LABELS), HOUSE_SYSTEM_LABELS[h]);
  for (const h of CLASSIC_NATAL_HOUSE_SYSTEMS) assert.equal(houseSystemLabel(h, HOUSE_SYSTEM_LABELS), NATAL_HOUSE_SYSTEM_LABELS[h]);
  assert.equal(houseSystemLabel("whole_sign", HOUSE_SYSTEM_LABELS), "Bütün-burç (rashi chakra)");
});

t("U5 istemci paketi izolasyonu: arayüz dosyaları hesap motorunu (pro/**, engine/natalHouses) import ETMEZ; prototip demo öğeleri ürüne taşınmadı", () => {
  const files = [
    "app/admin/astroloji/_components/TechniqueSelector.tsx",
    "app/admin/astroloji/_components/atlas/PrepCenter.tsx",
    "app/admin/astroloji/_components/atlas/AddTechniqueDialog.tsx",
    "app/admin/astroloji/_components/ProviderInterpretationPanel.tsx",
    "app/admin/astroloji/_lib/techniques.ts",
    "app/admin/astroloji/page.tsx",
    "lib/astrology/model/natalHouseSystems.ts",
  ];
  for (const f of files) {
    const s = readFileSync(join(ROOT, f), "utf8");
    assert.ok(!/(from|import)\s*\(?\s*["'][^"']*(astrology\/pro\/|engine\/natalHouses)/.test(s), `${f}: motor importu`);
    assert.ok(!/PROTOTİP · ÖRNEK VERİ|demo-bar|Örnek Danışan [A-E]|senaryo=/.test(s), `${f}: prototip demo öğesi`);
  }
});

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
