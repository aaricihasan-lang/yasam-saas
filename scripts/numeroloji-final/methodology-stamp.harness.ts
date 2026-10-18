/**
 * NUMEROLOJİ — METODOLOJİ DAMGASI YÜKSELTMESİ (E, owner onayı 2026-10-18).
 * Çalıştır: npx tsx scripts/numeroloji-final/methodology-stamp.harness.ts
 *
 * Kanıtlar: önceki damgalı / damgasız kayıt KAYDEDİLDİĞİ GİBİ açılır + önceki metodoloji notu;
 * yeni damga notu göstermez; "Güncel yöntemle yeniden hesapla" yeni kurallarla YENİ kayıt gövdesi
 * üretir (damgayı sunucu basar); eski motorlu istemci yeni damgayla kayıt yapamaz (409);
 * Word aynı kuralı izler; kayıtlı çakra sonuçları yeniden hesap olmadan değişmez.
 */
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";
import { NUMEROLOJI_METHODOLOGY_VERSION, verifyMotorMatchesInputs } from "@/lib/numeroloji/methodology";
import { LEGACY_METHOD_NOTE, buildRecalculatedRecordBody, resolveRecordMotor } from "@/app/numeroloji/utils/analysisJson";
import { buildAnalizOzeti } from "@/app/numeroloji/utils/numerolojiPlainMetin";
import { buildNumerolojiWordChildren, packNumerolojiDocx } from "@/app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild";
import { alternativeChakraColumns } from "@/lib/numeroloji/alternativeChakra";

let pass = 0;
let fail = 0;
function ok(c: boolean, label: string, d?: unknown) {
  if (c) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}`, d === undefined ? "" : JSON.stringify(d)); }
}
const J = JSON.stringify;
const ONCEKI: string = "num-v1-final-2026-10";

// "Ahmet DEMİR" — owner kararıyla değişen kayıt: eski metodolojide Ana "11/5" (anahtar 5), çakra Ana [10,5]
const fresh = hesaplaNumeroloji({ firstName: "Ahmet", lastName: "DEMİR", birthDate: "14.02.1987" });
const eskiMotor = JSON.parse(J(fresh));
eskiMotor.anaKulvar.display = "11/5";
eskiMotor.anaKulvar.key = "5";
// eski omurga: Ana katkısı [10,5] (yenide [10]) → 5. çakra bir fazla
eskiMotor.cakraOmurgasi.sayilar = { ...eskiMotor.cakraOmurgasi.sayilar, 5: (eskiMotor.cakraOmurgasi.sayilar[5] ?? 0) + 1 };
const satir = (id: string, stamp: string | null, motor: unknown) => ({
  id, name: "Ahmet", surname: "DEMİR", birth_date: "14.02.1987", created_at: "2026-10-10T10:00:00Z",
  analysis_data: { version: 1, motor, summary: "KAYITLI_OZET", ...(stamp ? { calc: { methodology: stamp } } : {}) },
});
const onceki = satir("00000000-0000-4000-8000-0000000000e1", ONCEKI, eskiMotor);
const damgasiz = satir("00000000-0000-4000-8000-0000000000e2", null, eskiMotor);
const yeni = satir("00000000-0000-4000-8000-0000000000e3", NUMEROLOJI_METHODOLOGY_VERSION, fresh);
const oncekiOnce = J(onceki);

console.log("E1 sürüm");
ok(NUMEROLOJI_METHODOLOGY_VERSION === "num-v1.1-ozel-sayi-2026-10" && (NUMEROLOJI_METHODOLOGY_VERSION as string) !== ONCEKI, "E1 damga yükseltildi", NUMEROLOJI_METHODOLOGY_VERSION);

console.log("E2 eski kayıtlar kaydedildiği gibi + not");
{
  const r = resolveRecordMotor(onceki);
  ok(r.legacy, "E2a önceki sürüm damgalı kayıt → önceki metodoloji (not + yeniden hesapla)");
  ok(r.motor?.anaKulvar.display === "11/5" && r.motor?.anaKulvar.key === "5", "E2b kayıtlı Ana Kulvar aynen (11/5, anahtar 5) — sessiz yeniden hesap yok", r.motor?.anaKulvar);
  ok(J(r.motor?.cakraOmurgasi.sayilar) === J(eskiMotor.cakraOmurgasi.sayilar), "E2c kayıtlı çakra omurgası aynen (yeniden hesap olmadan değişmez)");
  ok(resolveRecordMotor(damgasiz).legacy, "E2d damgasız eski kayıt → önceki metodoloji");
  ok(!resolveRecordMotor(yeni).legacy, "E2e yeni damgalı kayıt → not YOK");
  ok(J(onceki) === oncekiOnce, "E2f okuma kayıt nesnesini değiştirmez");
  const alt = alternativeChakraColumns(r.motor, "ana");
  ok(J(onceki) === oncekiOnce && Array.isArray(alt), "E2g alternatif paneli eski kaydı değiştirmez");
}

console.log("E3 güncel yöntemle yeniden hesapla");
{
  const body = buildRecalculatedRecordBody(onceki, buildAnalizOzeti)!;
  ok(body.analysis_data.recalculatedFrom === onceki.id, "E3a yeni kayıt kaynak kayda bağlı (recalculatedFrom)");
  const m = body.analysis_data.motor as typeof fresh;
  ok(m.anaKulvar.display === "11" && m.anaKulvar.key === "11", "E3b yeni kayıt yeni kuralla: 6+5 → 11 (yapay /5 yok)", m.anaKulvar);
  ok(J(m.cakraOmurgasi.sayilar) === J(fresh.cakraOmurgasi.sayilar), "E3c yeni kayıt çakra omurgası yeni kuralla");
  ok(!("calc" in (body.analysis_data as Record<string, unknown>)), "E3d istemci damga göndermez (damgayı sunucu basar)");
  ok(J(onceki) === oncekiOnce, "E3e orijinal kayıt hiçbir alanıyla değişmedi");
  ok(verifyMotorMatchesInputs(body.name, body.surname, body.birth_date, body.analysis_data.motor).ok, "E3f sunucu doğrulaması yeni gövdeyi kabul eder");
  ok(!verifyMotorMatchesInputs("Ahmet", "DEMİR", "14.02.1987", eskiMotor).ok, "E3g eski motorlu (önbellekli) istemci yeni damgayla kayıt YAPAMAZ (409 uyuşmazlık)");
}

console.log("E4 sunucu damgalama (kaynak kodu)");
{
  const src = readFileSync("app/api/numeroloji/analyses/route.ts", "utf8");
  ok(/methodology:\s*NUMEROLOJI_METHODOLOGY_VERSION/.test(src), "E4a POST yeni/yeniden hesaplanan kaydı NUMEROLOJI_METHODOLOGY_VERSION ile damgalar");
  ok(/calc:\s*_clientCalc/.test(src), "E4b istemcinin gönderdiği calc yok sayılır");
  const pat = readFileSync("app/api/numeroloji/analyses/route.ts", "utf8").split("export async function PATCH")[1] ?? "";
  ok(!/NUMEROLOJI_METHODOLOGY_VERSION/.test(pat), "E4c PATCH (görsel ayarı) damgaya dokunmaz → eski kayıt güncellenmez");
}

console.log("E5 Word");
async function wordXml(rows: unknown[]): Promise<string> {
  const shared = { knowledgeRows: [], entries: [], sourceLabelById: new Map(), stoneRows: [] };
  const sections = { summary: true, plain: true, detailed: false, tas: false } as never;
  const { children } = buildNumerolojiWordChildren(rows as never, sections, shared as never, new Map());
  const buf = await packNumerolojiDocx(children, "Test");
  const zip = await JSZip.loadAsync(buf);
  return (await zip.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
}
(async () => {
  const xOld = await wordXml([onceki]);
  ok(xOld.includes(LEGACY_METHOD_NOTE), "E5a Word: önceki sürüm damgalı kayıtta metodoloji notu");
  ok(xOld.includes("11/5"), "E5b Word: eski kayıt kaydedildiği değerle (11/5)");
  const xNew = await wordXml([yeni]);
  ok(!xNew.includes(LEGACY_METHOD_NOTE), "E5c Word: yeni damgalı kayıtta not yok");
  ok(!xNew.includes("11/5"), "E5d Word: yeni kayıtta yapay 11/5 yok");
  const xMix = await wordXml([onceki, yeni]);
  ok(xMix.split(LEGACY_METHOD_NOTE).length - 1 === 1, "E5e toplu Word: not yalnız eski kayıtta (1 kez)");
  console.log(`\nmethodology-stamp harness: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
