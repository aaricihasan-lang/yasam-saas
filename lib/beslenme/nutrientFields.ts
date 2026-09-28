/**
 * Beslenme — besin detayında düzenlenebilen TÜM besin öğeleri (Class A `nutrition_nutrients`
 * sözlüğüyle birebir; kod + kanonik birim). Saf sabit (client+server import edebilir).
 *
 * Önceden detay ekranı yalnız 8 "MVP" alanı gösteriyordu; Hızlı Ekle ile girilen vitamin/mineral
 * vb. değerler sonradan görünmüyor ve düzenlenemiyordu. Artık sözlükteki 20 öğenin tamamı
 * gruplu olarak görüntülenir/düzenlenir. Sözlükte olup burada olmayan (gelecekte eklenen) bir
 * öğe kayıtta varsa kaydederken KORUNUR (sessiz silme yok).
 */
export type NutrientField = { code: string; label: string; unit: string };
export type NutrientGroup = { key: string; label: string; fields: NutrientField[] };

export const NUTRIENT_GROUPS: NutrientGroup[] = [
  {
    key: "main",
    label: "Temel Değerler",
    fields: [
      { code: "energy", label: "Enerji", unit: "kcal" },
      { code: "protein", label: "Protein", unit: "g" },
      { code: "carbohydrate", label: "Karbonhidrat", unit: "g" },
      { code: "total_fat", label: "Toplam Yağ", unit: "g" },
      { code: "saturated_fat", label: "Doymuş Yağ", unit: "g" },
      { code: "fiber", label: "Lif", unit: "g" },
      { code: "sugar", label: "Şeker", unit: "g" },
    ],
  },
  {
    key: "minerals",
    label: "Mineraller",
    fields: [
      { code: "sodium", label: "Sodyum", unit: "mg" },
      { code: "potassium", label: "Potasyum", unit: "mg" },
      { code: "calcium", label: "Kalsiyum", unit: "mg" },
      { code: "iron", label: "Demir", unit: "mg" },
      { code: "magnesium", label: "Magnezyum", unit: "mg" },
      { code: "zinc", label: "Çinko", unit: "mg" },
    ],
  },
  {
    key: "vitamins",
    label: "Vitaminler",
    fields: [
      { code: "vitamin_a", label: "A Vitamini", unit: "mcg" },
      { code: "vitamin_c", label: "C Vitamini", unit: "mg" },
      { code: "vitamin_d", label: "D Vitamini", unit: "mcg" },
      { code: "vitamin_b12", label: "B12 Vitamini", unit: "mcg" },
      { code: "folate", label: "Folat", unit: "mcg" },
    ],
  },
  {
    key: "fatty_acids",
    label: "Yağ Asitleri",
    fields: [
      { code: "epa", label: "EPA", unit: "mg" },
      { code: "dha", label: "DHA", unit: "mg" },
    ],
  },
];

export const NUTRIENT_FIELDS: NutrientField[] = NUTRIENT_GROUPS.flatMap((g) => g.fields);
export const NUTRIENT_FIELD_CODES = new Set(NUTRIENT_FIELDS.map((f) => f.code));
