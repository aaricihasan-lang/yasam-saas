/**
 * Upagraha ekol notu (2026-10-23): hesaplama servisinin zaman-temelli Upagraha kuralı 10 gerçek yanıtla ÖLÇÜLDÜ (47/47; kanıt QA
 * ATLAS-HATA-KAPATMA-2026-10-23/03-upagraha). Not, ölçülen kuralın her unsurunu açıkça söylemeli; hesap DEĞİŞMEZ (değerler servisin).
 */
import assert from "node:assert/strict";
import { UPAGRAHA_SCHOOL_NOTE } from "@/lib/astrology/model/vedicNoktalar";
let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
t("not: Gulika = Satürn parçası başı (BPHS ile aynı); Kalavela'lar yöneticisiz parçayı Satürn'ün ardına koyan sıra; BPHS'de sonda", () => {
  for (const want of ["Gulika, Satürn parçasının başlangıcında", "BPHS ile aynı", "yöneticisiz 8. parçayı Satürn parçasının hemen ardına", "BPHS'de yöneticisiz parça sondadır", "Satürn'den sonra gelen", "Satürn'den önce gelenler BPHS ile aynıdır"])
    assert.ok(UPAGRAHA_SCHOOL_NOTE.includes(want), want);
});
t("not: Mandi = Uttara Kalamrita ghati tablosunun bir parça öncesi; gündüz ve gece tablosu tam", () => {
  for (const want of ["Uttara Kalamrita", "Pazar 26", "Cumartesi 2", "Pazar 10", "Cumartesi 14", "tam bir parça öncesinde"]) assert.ok(UPAGRAHA_SCHOOL_NOTE.includes(want), want);
});
t("not: marka-nötr", () => assert.ok(!/roxy/i.test(UPAGRAHA_SCHOOL_NOTE)));
console.log(`\nupagraha-yontem-notu harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
