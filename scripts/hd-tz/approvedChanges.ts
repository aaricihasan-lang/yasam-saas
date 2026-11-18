// HD-TZ (18.11.2026) — Owner onaylı Human Design IANA 2026f + Roxy UTC değişikliğinin İÇERİK manifestosu (test-only).
//
// Eski PR'ların kapsam koruma testleri (hd-relations G6, hd-central-client L5, hd-gates-scroll 5a, Atlas static izolasyon)
// "bu dosyalar origin/main'e göre değişmedi" der. HD-TZ bu dosyaları Owner kararıyla değiştirdi. Koruma GEVŞETİLMEZ: bir dosya
// yalnız içeriği burada kayıtlı onaylı içerikle (satır sonu LF'ye normalize edilmiş SHA-256) BİREBİR aynıysa istisnadır; tek
// karakterlik başka her değişiklik testi yine düşürür. Merge sonrası origin/main ile fark kalmayacağından kayıtlar etkisizleşir.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const HD_TZ_APPROVED_SHA256: Readonly<Record<string, string>> = Object.freeze({
  // @generated-hashes (aşağıdaki kayıtlar onaylı içerikten üretildi; elle değiştirmek onay yerine geçmez)
  "app/human-design/iliski-grup/components/HdRelationsContent.tsx": "5cebbca82d229271d126072cca61175c1795df9c2148b98daa7ba1115306b9c6",
  "app/human-design/transit/components/PersonalTransitView.tsx": "ef3953874d13d799a82d87e9a42985f94ff12c28bcc429b52c1ced8139574541",
  "lib/campaign/visitor/runners/hdRelation.ts": "c34ac89555821272b8bf4725f8ef7ead2a2fdf2f75f2d588e5e76b9444f4a6b9",
  "lib/human-design/api/birthTimeResolution.ts": "a1703c32dad1d2d75b1ffaf084e0f4ac71d2dc004a9fbc4bdaf1490abd22cf47",
  "lib/human-design/api/handleCompute.ts": "75652ee4706e48acd7e4e79af818fc4d4e1c55adb1e213809c2effe3b40b670a",
  "lib/human-design/api/hdBirthUtc.ts": "ce0bbcdfb9f9fcc5b75c60511805f15589dfea4b0a4919a18aeeb38d28082448",
  "lib/human-design/api/roxyChartService.ts": "3dec658a11202806f03337c8ad3903f901a47648dee0534a798d9bc736de48b6",
  "lib/human-design/education/private/fictionalCompute.ts": "1bf2971e2bb26096518d320301a4c4e946c2a45ca8dcddec61ee738a5cd171ac",
  "lib/human-design/engine/time.ts": "375870c6d441f5b20645f88e856a641c517456227de1a481d88c9439a223c439",
  "lib/human-design/relations/relationService.ts": "e69252e47bbdda771483bf76da0519e56c12c6a107970300a7bff8d01c5a3418",
  "lib/human-design/transit/personalTransitService.ts": "0df5f888a67a440d586ec7e3d10714a7f02f3712db2e1177bd648a8e6129aec9",
  "lib/human-design/transit/transitMoment.ts": "8d93e753a6d6c2de9e25b40254cb239a954df4ac9dc4a827017e921663ba56ff",
  "lib/human-design/variables/variablesService.ts": "d90c72731f23a6883a5aacf7aa31a6843e0607ce1380a2304ce1eac971720db0",
  "scripts/astrology/static.harness.ts": "af1eeb608ed5bcbf4d109a021caba266daca87254148e3b23f65a50bd7de05e3",
  "scripts/astrology/tzdb-ortak.harness.ts": "a5928465a2241ffc525cd5848acacbae120d11649d9830584e4cff2021258f54",
  "scripts/hd-central-client/harness.ts": "d91b78f8f1a50db9ffb8177338f8a7a6547f9ee3edff8522a9108bfaae01388b",
  "scripts/hd-gates-scroll/harness.ts": "30cb1962b9ab6f35e45759709a28fc1f31e22229aa0f137e1f56813c947d0cd5",
  "scripts/hd-relations/harness.ts": "aff5372fe733c58a6a88402af12d983e1e7e6c9f0924d071143249e49e0cd20e",
  "scripts/hd-roxy/harness.ts": "ae2a43e07060ab8345b7e6e8cb81276155a16a788df3f7fb371e1b50651d8633",
  "scripts/hd-roxy/ux-harness.ts": "fe43b0b477fe86451451c466dc64dbfce045b4ea28be77ef4d52cf812094f0b9",
  "scripts/hd-stage2/harness.ts": "4b0e78a3e6c001913220e5d335051531d9244a06eaf29d61c8ab45118109ffc4",
  "scripts/hd-transit/fixtures/timezone-reference-2026f-backzone.json": "784dbb6522865dfb71283e35a3132c2674091e5e41af128e3db68779347839da",
  "scripts/hd-transit/personal-harness.ts": "dc37309886884677ee311fa6ce6fab90fc047b138b8a98bab6731796ae5b53cf",
  "scripts/hd-transit/timezone-harness.ts": "13266b5e0cec20e92da834b02198cdaa08c541f80e09d8d61dedcebef3fe08b0",
  "scripts/hd-tz/harness.ts": "cdf15c2f0f61eb3a16b6d2dcc34117e6a4941e59ce22115555420aacb23d6e70",
  "scripts/hd-variables/accuracy-harness.ts": "22a7c332a73d1f85792cf7c2b35278851eea27ca3ad84eab9913350dee392e96",
  "scripts/hd-variables/persist-harness.ts": "7391b376dfdb699e3ebb4c2e3bfeb3a8d9365e12f2c5b44cf7fd0a4d0bcd23f9",
  "scripts/hd-variables/service-harness.ts": "e64b5d92eab4a757a863507af9860b02702ae49bec729d0c222b28761e3215e8",
  "scripts/hd-variables/timezone-harness.ts": "8d3631cb3e88fdc313a2f853443b4216bcc139a760479929a1a82406143f8629",
});

/** Dosya (repo köküne göre yol) Owner onaylı HD-TZ içeriğiyle birebir aynı mı? Kayıtta yoksa / farklıysa false. */
export function isHdTzApprovedContent(root: string, file: string): boolean {
  const want = Object.hasOwn(HD_TZ_APPROVED_SHA256, file) ? HD_TZ_APPROVED_SHA256[file] : undefined;
  const p = join(root, file);
  if (!want || !existsSync(p)) return false;
  return createHash("sha256").update(readFileSync(p, "utf8").replace(/\r\n/g, "\n"), "utf8").digest("hex") === want;
}
