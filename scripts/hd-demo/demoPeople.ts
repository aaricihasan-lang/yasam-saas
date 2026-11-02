/**
 * D3 (owner kararı 2026-11-02) — Human Design demo görünümü SENTETİK örnek kişileri.
 *
 * Gerçek kişi DEĞİLDİR: doğum anları deterministik sözde-rastgele üreteçle seçildi (tohum 20261102; 1978–2004, Türkiye
 * ilçe dizininde "dogrulandi" koordinatlı 7 ilçe). Seçim ölçütleri: yerel HD motorunda sınır uyarısı yok, Dört Ok bantlarının
 * her biri tek anlamlı (localVariableBands), doğum saati yaz saati geçişine denk gelmiyor; her HD tipinden bir kişi.
 * Konumlar lib/human-design/location/trDistricts.generated.json kayıtlarıdır (koordinat birebir oradan okunur).
 */
export type DemoPerson = {
  key: "A" | "B" | "C" | "D" | "E";
  name: string;
  date: string; // YYYY-MM-DD (yerel)
  time: string; // HH:mm (yerel)
  districtId: string;
  /** Yerel motorun seçim anındaki tipi (yalnız bilgi; doğrulama build betiğinde yeniden yapılır). */
  expectedType: string;
};

export const DEMO_PEOPLE: readonly DemoPerson[] = Object.freeze([
  { key: "A", name: "Örnek Kişi A", date: "1995-11-07", time: "12:26", districtId: "trd-06-cankaya", expectedType: "Generator" },
  { key: "B", name: "Örnek Kişi B", date: "2001-06-03", time: "23:08", districtId: "trd-55-atakum", expectedType: "Manifesting Generator" },
  { key: "C", name: "Örnek Kişi C", date: "1984-06-10", time: "23:25", districtId: "trd-35-konak", expectedType: "Projector" },
  { key: "D", name: "Örnek Kişi D", date: "1987-07-25", time: "19:57", districtId: "trd-34-kadikoy", expectedType: "Manifestor" },
  { key: "E", name: "Örnek Kişi E", date: "2002-07-24", time: "03:46", districtId: "trd-55-atakum", expectedType: "Reflector" },
]);

/** İkili ilişki (Connection) ve grup (Penta) örneklerinin katılımcıları. */
export const DEMO_CONNECTION: readonly DemoPerson["key"][] = Object.freeze(["A", "B"]);
export const DEMO_PENTA: readonly DemoPerson["key"][] = Object.freeze(["A", "B", "C", "D"]);
