/**
 * DEMO VİTRİN — SENTETİK örnek veri (TEK KAYNAK).
 *
 * `uzman@test.com` resmi vitrin/demo uzman hesabıdır (users.is_demo_account=true). Hesap artık
 * gerçek uzman ekranlarını (ör. /dashboard/clients/[id]) kullanır; bu ekranların boş kalmaması
 * için demo tenant'ına AÇIKÇA SENTETİK örnek danışan verisi yüklenir.
 *
 * Bu dosya:
 *   - migration SQL'inin kaynağıdır (scripts/demo-vitrin/buildSeedSql.ts → supabase/migrations/
 *     20271005300000_demo_vitrin_fixture_seed.sql; harness dosyanın bu kaynakla birebir aynı
 *     olduğunu doğrular),
 *   - Yaşam Hafızası demo yanıtının (lib/demo/demoYasamHafizasi.ts) kayıt kimliklerini verir,
 *   - testlerin beklentilerini besler.
 *
 * KURALLAR: gerçek kişi verisi YOK (adlar kurgusal, telefonlar atanmamış 0500 000 xx xx aralığında,
 * e-postalar example.test). Tüm id'ler SABİT → migration idempotent (ON CONFLICT DO NOTHING),
 * tekrar uygulama duplicate üretmez. Tarihler uygulama anına GÖRE (gün ofseti) yazılır.
 */

export const DEMO_TENANT_ID = "40f842a0-e3e8-448c-8971-9a938e1faccb";
export const DEMO_ACCOUNT_EMAIL = "uzman@test.com";

/** Sabit, okunabilir sentetik UUID: de5a<tablo>-c11e-4000-8000-<sıra>. */
function fid(table: number, n: number): string {
  return `de5a${table.toString(16).padStart(4, "0")}-c11e-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

export const DEMO_FIXTURE_MARKER = "Yaşam Sistemi vitrin hesabı için hazırlanmış SENTETİK örnek kayıttır; gerçek bir kişiye ait değildir.";

// ─── Danışanlar ──────────────────────────────────────────────────────────────

export type DemoClientSeed = {
  id: string;
  ad: string;
  soyad: string;
  telefon: string;
  email: string;
  dogum: string; // YYYY-MM-DD
  gorusmeOffsetDays: number;
  burc: string;
  kan: string;
  mizac: string;
  createdOffsetDays: number;
};

export const DEMO_CLIENTS_SEED: readonly DemoClientSeed[] = [
  { id: fid(1, 1), ad: "Eylül", soyad: "Karaca", telefon: "0500 000 00 01", email: "eylul.karaca@example.test", dogum: "1990-03-21", gorusmeOffsetDays: -6, burc: "Koç", kan: "A Rh+", mizac: "safra", createdOffsetDays: -60 },
  { id: fid(1, 2), ad: "Kaan", soyad: "Ersoy", telefon: "0500 000 00 02", email: "kaan.ersoy@example.test", dogum: "1985-07-14", gorusmeOffsetDays: -12, burc: "Yengeç", kan: "B Rh+", mizac: "dem", createdOffsetDays: -45 },
  { id: fid(1, 3), ad: "Merve", soyad: "Duman", telefon: "0500 000 00 03", email: "merve.duman@example.test", dogum: "1993-11-08", gorusmeOffsetDays: -20, burc: "Akrep", kan: "0 Rh+", mizac: "balgam", createdOffsetDays: -38 },
  { id: fid(1, 4), ad: "Deniz", soyad: "Akbulut", telefon: "0500 000 00 04", email: "deniz.akbulut@example.test", dogum: "1988-09-25", gorusmeOffsetDays: -28, burc: "Terazi", kan: "AB Rh+", mizac: "sovdavi", createdOffsetDays: -30 },
  { id: fid(1, 5), ad: "Gökçe", soyad: "Tunalı", telefon: "0500 000 00 05", email: "gokce.tunali@example.test", dogum: "1991-05-17", gorusmeOffsetDays: -35, burc: "Boğa", kan: "B Rh-", mizac: "dem", createdOffsetDays: -25 },
  { id: fid(1, 6), ad: "Baran", soyad: "Yıldırım", telefon: "0500 000 00 06", email: "baran.yildirim@example.test", dogum: "1987-12-03", gorusmeOffsetDays: -41, burc: "Yay", kan: "0 Rh-", mizac: "balgam", createdOffsetDays: -15 },
];

export const DEMO_CLIENT_IDS = {
  eylul: DEMO_CLIENTS_SEED[0].id,
  kaan: DEMO_CLIENTS_SEED[1].id,
  merve: DEMO_CLIENTS_SEED[2].id,
} as const;

/** Eski fixture id'si (/demo/danisan/demo-0) → yeni gerçek kayıt (geriye uyumlu yönlendirme). */
export const LEGACY_DEMO_CLIENT_REDIRECT: Readonly<Record<string, string>> = {
  "demo-0": DEMO_CLIENT_IDS.eylul,
  "demo-1": DEMO_CLIENT_IDS.kaan,
  "demo-2": DEMO_CLIENT_IDS.merve,
};

// ─── Danışan notları (client_notes: danışan başına tek satır) ────────────────

export type DemoNoteSeed = { id: string; clientId: string; saglik: string; adres: string; oneriler: string; notlar: string };

export const DEMO_NOTES_SEED: readonly DemoNoteSeed[] = [
  {
    id: fid(2, 1), clientId: DEMO_CLIENT_IDS.eylul,
    saglik: "Stres kaynaklı gerilim tipi baş ağrısı tarif ediyor. Uyku düzeni düzensiz; hekim kontrolü mevcut, ek tanı bildirmedi.",
    adres: "Örnek Mahallesi, Vitrin Sokak No: 1, İstanbul",
    oneriler: "Sabah 15 dk nefes çalışması · Saat 21:00 sonrası ekran molası · Haftada 3 gün 30 dk tempolu yürüyüş.",
    notlar: `Hedef: enerji dengesi ve stres yönetimi. ${DEMO_FIXTURE_MARKER}`,
  },
  {
    id: fid(2, 2), clientId: DEMO_CLIENT_IDS.kaan,
    saglik: "Masa başı çalışma kaynaklı omuz ve boyun gerginliği.",
    adres: "Örnek Mahallesi, Vitrin Sokak No: 2, Ankara",
    oneriler: "Saatlik esneme molası · Akşam ılık duş sonrası kısa gevşeme.",
    notlar: `Odak: beden farkındalığı ve uyku kalitesi. ${DEMO_FIXTURE_MARKER}`,
  },
  {
    id: fid(2, 3), clientId: DEMO_CLIENT_IDS.merve,
    saglik: "Öğün atlama ve öğleden sonra enerji düşüşü tarif ediyor.",
    adres: "Örnek Mahallesi, Vitrin Sokak No: 3, İzmir",
    oneriler: "Düzenli öğün saatleri · Gün içine yayılmış su tüketimi.",
    notlar: `Odak: beslenme düzeni ve günlük enerji. ${DEMO_FIXTURE_MARKER}`,
  },
];

// ─── Randevular ──────────────────────────────────────────────────────────────

export type DemoAppointmentSeed = { id: string; clientId: string; title: string; offsetDays: number; hour: number; status: "bekliyor" | "tamamlandi"; notes: string };

export const DEMO_APPOINTMENTS_SEED: readonly DemoAppointmentSeed[] = [
  { id: fid(3, 1), clientId: DEMO_CLIENT_IDS.eylul, title: "Takip görüşmesi", offsetDays: -6, hour: 11, status: "tamamlandi", notes: "Uyku günlüğü birlikte değerlendirildi." },
  { id: fid(3, 2), clientId: DEMO_CLIENT_IDS.eylul, title: "Kontrol seansı", offsetDays: 7, hour: 14, status: "bekliyor", notes: "Nefes çalışması ilerlemesi gözden geçirilecek." },
  { id: fid(3, 3), clientId: DEMO_CLIENT_IDS.kaan, title: "İlk değerlendirme", offsetDays: -12, hour: 10, status: "tamamlandi", notes: "Genel durum ve hedefler konuşuldu." },
  { id: fid(3, 4), clientId: DEMO_CLIENT_IDS.merve, title: "Beslenme takibi", offsetDays: 3, hour: 16, status: "bekliyor", notes: "Ölçüm ve öğün planı değerlendirmesi." },
];

// ─── Danışan taşları ─────────────────────────────────────────────────────────

export type DemoStoneSeed = { id: string; clientId: string; name: string; type: string; usageArea: string; note: string; offsetDays: number };

export const DEMO_STONES_SEED: readonly DemoStoneSeed[] = [
  { id: fid(4, 1), clientId: DEMO_CLIENT_IDS.eylul, name: "Ametist", type: "Kuvars", usageArea: "Uyku öncesi rahatlama rutini", note: "Yatak odasında, gece rutininin parçası olarak.", offsetDays: -20 },
  { id: fid(4, 2), clientId: DEMO_CLIENT_IDS.eylul, name: "Akuamarin", type: "Beril", usageArea: "İfade ve iletişim çalışması", note: "Gün içinde taşınması önerildi.", offsetDays: -6 },
  { id: fid(4, 3), clientId: DEMO_CLIENT_IDS.kaan, name: "Siyah Turmalin", type: "Turmalin", usageArea: "Çalışma masası düzeni", note: "Odaklanma rutininin yanında.", offsetDays: -12 },
];

// ─── Seanslar ────────────────────────────────────────────────────────────────

export type DemoSessionSeed = {
  id: string; clientId: string; offsetDays: number; type: string; minutes: number; fee: number;
  note: string; actions: string; suggestions: string; nextPlan: string;
};

export const DEMO_SESSIONS_SEED: readonly DemoSessionSeed[] = [
  {
    id: fid(5, 1), clientId: DEMO_CLIENT_IDS.eylul, offsetDays: -20, type: "Biyoenerji", minutes: 60, fee: 1500,
    note: "İlk biyoenerji seansı; boğaz ve kalp bölgesinde gerginlik ifade edildi.",
    actions: "Nefes çalışması, gevşeme yönlendirmesi.", suggestions: "Akşam rutini ve uyku günlüğü.", nextPlan: "İki hafta sonra takip.",
  },
  {
    id: fid(5, 2), clientId: DEMO_CLIENT_IDS.eylul, offsetDays: -6, type: "Takip", minutes: 45, fee: 1200,
    note: "Uyku süresinde iyileşme bildirildi; baş ağrısı sıklığı azaldı.",
    actions: "Rutin gözden geçirildi, nefes egzersizi güncellendi.", suggestions: "Haftada 3 yürüyüş korunacak.", nextPlan: "Bir hafta sonra kontrol.",
  },
  {
    id: fid(5, 3), clientId: DEMO_CLIENT_IDS.kaan, offsetDays: -12, type: "İlk görüşme", minutes: 50, fee: 1300,
    note: "Masa başı çalışma ve uyku kalitesi konuşuldu.",
    actions: "Beden farkındalığı egzersizi gösterildi.", suggestions: "Saatlik esneme molası.", nextPlan: "Üç hafta sonra takip.",
  },
];

// ─── Ödevler ─────────────────────────────────────────────────────────────────

export type DemoHomeworkSeed = {
  id: string; clientId: string; title: string; type: string; description: string;
  startOffsetDays: number; endOffsetDays: number; status: "devam" | "tamamlandi" | "bekliyor"; expertNote: string;
};

export const DEMO_HOMEWORKS_SEED: readonly DemoHomeworkSeed[] = [
  { id: fid(6, 1), clientId: DEMO_CLIENT_IDS.eylul, title: "Uyku günlüğü", type: "Günlük", description: "Her sabah uyku saati, uyanma sayısı ve dinlenmişlik puanını not et.", startOffsetDays: -6, endOffsetDays: 8, status: "devam", expertNote: "Bir sonraki seansta birlikte değerlendirilecek." },
  { id: fid(6, 2), clientId: DEMO_CLIENT_IDS.eylul, title: "Sabah nefes çalışması", type: "Egzersiz", description: "Uyanınca 15 dakika 4-6 nefes ritmi.", startOffsetDays: -20, endOffsetDays: -6, status: "tamamlandi", expertNote: "Düzenli uygulandı." },
  { id: fid(6, 3), clientId: DEMO_CLIENT_IDS.merve, title: "Öğün saatleri kaydı", type: "Günlük", description: "Bir hafta boyunca öğün saatlerini ve öğleden sonra enerji durumunu yaz.", startOffsetDays: -5, endOffsetDays: 2, status: "devam", expertNote: "Beslenme planıyla birlikte incelenecek." },
];

// ─── Analizler (Çakra Analizi) ───────────────────────────────────────────────

export type DemoAnalysisSeed = { id: string; clientId: string; offsetDays: number; note: string; marks: Record<string, string> };

/** AnalizlerTab ile AYNI anahtar şeması: {before|after}_{energy|chakra}_<satır>. */
export const DEMO_ANALYSES_SEED: readonly DemoAnalysisSeed[] = [
  {
    id: fid(7, 1), clientId: DEMO_CLIENT_IDS.eylul, offsetDays: -20,
    note: "Seans öncesi boğaz ve kalp bölgesinde düşük, seans sonrası dengelenmiş olarak işaretlendi.",
    marks: {
      before_chakra_bogaz: "-", before_chakra_kalp: "-", before_chakra_tac: "+", before_chakra_kok: "+",
      after_chakra_bogaz: "+", after_chakra_kalp: "+", after_chakra_tac: "+", after_chakra_kok: "+",
      before_energy_duygusal: "-", after_energy_duygusal: "+", before_energy_zihinsel: "-", after_energy_zihinsel: "+",
    },
  },
];

const ENERGY_ROWS = ["ruhsal", "zihinsel", "duygusal", "eterik", "fiziksel"] as const;
const CHAKRA_ROWS = ["tac", "goz", "bogaz", "kalp", "mide", "sakral", "kok"] as const;

/** AnalizlerTab makeChakraInitialValues ile birebir anahtar seti + işaretler. */
export function buildChakraAnalysisData(marks: Record<string, string>): Record<string, unknown> {
  const values: Record<string, { mark: string; male: string; female: string }> = {};
  for (const scope of ["before_energy", "after_energy"]) {
    for (const row of ENERGY_ROWS) values[`${scope}_${row}`] = { mark: marks[`${scope}_${row}`] ?? "", male: "", female: "" };
  }
  for (const scope of ["before_chakra", "after_chakra"]) {
    for (const row of CHAKRA_ROWS) values[`${scope}_${row}`] = { mark: marks[`${scope}_${row}`] ?? "", male: "", female: "" };
  }
  return { title: "Çakra Analizi", values, demo_fixture: true };
}

// ─── Ücretlendirme ───────────────────────────────────────────────────────────

export type DemoChargeSeed = {
  id: string; clientId: string; offsetDays: number; category: "session" | "homework" | "analysis" | "other";
  amount: number; detail: string | null; note: string | null;
};

export const DEMO_CHARGES_SEED: readonly DemoChargeSeed[] = [
  { id: fid(8, 1), clientId: DEMO_CLIENT_IDS.eylul, offsetDays: -20, category: "session", amount: 1500, detail: null, note: "İlk biyoenerji seansı" },
  { id: fid(8, 2), clientId: DEMO_CLIENT_IDS.eylul, offsetDays: -20, category: "analysis", amount: 600, detail: null, note: "Çakra analizi" },
  { id: fid(8, 3), clientId: DEMO_CLIENT_IDS.eylul, offsetDays: -6, category: "session", amount: 1200, detail: null, note: "Takip seansı" },
  { id: fid(8, 4), clientId: DEMO_CLIENT_IDS.eylul, offsetDays: -6, category: "other", amount: 450, detail: "Ametist ve akuamarin taşı", note: "Örnek ürün satışı" },
  { id: fid(8, 5), clientId: DEMO_CLIENT_IDS.kaan, offsetDays: -12, category: "session", amount: 1300, detail: null, note: "İlk görüşme" },
];

// ─── Anamnez (std-v1, tamamlanmış) ───────────────────────────────────────────

export type DemoAnamnesisSeed = {
  id: string; clientId: string; title: string; offsetDays: number; answers: Record<string, unknown>;
};

export const DEMO_ANAMNESES_SEED: readonly DemoAnamnesisSeed[] = [
  {
    id: fid(9, 1), clientId: DEMO_CLIENT_IDS.eylul, title: "İlk görüşme anamnezi", offsetDays: -20,
    answers: {
      "A.reason": "Uzun süredir devam eden gerilim tipi baş ağrısı ve düzensiz uyku.",
      "A.expectation": "Gün içinde daha dengeli enerji ve daha düzenli uyku.",
      "A.priorities": "1) Uyku düzeni 2) Stres yönetimi 3) Düzenli hareket",
      "A.aggravating": "Uzun ekran süresi, geç saatte yemek.",
      "A.relieving": "Kısa yürüyüşler, nefes çalışması.",
      "B.height_cm": 168,
      "B.weight_kg": 61,
      "B.past_illnesses": "Bildirilen önemli bir hastalık yok (sentetik örnek).",
      "F.duration": 6,
      "F.bedtime": "00:30",
      "F.waketime": "07:00",
      "F.quality": 5,
      "G.meal_count": 3,
      "G.water": "Günde yaklaşık 1,5 litre",
      "G.caffeine": "Günde 2 fincan kahve",
      "G.diet_style": "Karma beslenme",
      "H.satisfaction": 6,
    },
  },
];

// ─── KVKK onam kayıtları ─────────────────────────────────────────────────────

export type DemoConsentSeed = {
  id: string; clientId: string; type: "aydinlatma_bildirildi" | "acik_riza_ozel_nitelikli" | "iletisim_izni";
  status: "granted"; method: "uygulama_onay" | "islak_imza"; offsetDays: number;
};

export const DEMO_CONSENTS_SEED: readonly DemoConsentSeed[] = [
  { id: fid(10, 1), clientId: DEMO_CLIENT_IDS.eylul, type: "aydinlatma_bildirildi", status: "granted", method: "uygulama_onay", offsetDays: -60 },
  { id: fid(10, 2), clientId: DEMO_CLIENT_IDS.eylul, type: "acik_riza_ozel_nitelikli", status: "granted", method: "islak_imza", offsetDays: -60 },
  { id: fid(10, 3), clientId: DEMO_CLIENT_IDS.kaan, type: "aydinlatma_bildirildi", status: "granted", method: "uygulama_onay", offsetDays: -45 },
];

// ─── Beslenme ────────────────────────────────────────────────────────────────

export const DEMO_NUTRITION_PROFILES_SEED = [
  {
    id: fid(11, 1), clientId: DEMO_CLIENT_IDS.eylul, goalType: "healthy_lifestyle", goalNote: "Gün içinde daha dengeli enerji.",
    activityLevel: "light", dietaryPattern: "Karma beslenme", dailyMealCount: 3, targetWeightKg: null as number | null,
    waterNote: "Günde 2 litre hedef", lifestyleNote: "Masa başı çalışma, akşam yürüyüşü.", generalNote: "Sentetik örnek profil.",
  },
  {
    id: fid(11, 2), clientId: DEMO_CLIENT_IDS.merve, goalType: "healthy_lifestyle", goalNote: "Öğün düzeni ve öğleden sonra enerji.",
    activityLevel: "moderate", dietaryPattern: "Akdeniz tipi", dailyMealCount: 4, targetWeightKg: null as number | null,
    waterNote: "Günde 2 litre", lifestyleNote: "Haftada 2 gün pilates.", generalNote: "Sentetik örnek profil.",
  },
] as const;

export const DEMO_NUTRITION_MEASUREMENTS_SEED = [
  { id: fid(12, 1), clientId: DEMO_CLIENT_IDS.eylul, offsetDays: -20, weightKg: 61.8, heightCm: 168, waistCm: 74, hipCm: 96, note: "İlk ölçüm" },
  { id: fid(12, 2), clientId: DEMO_CLIENT_IDS.eylul, offsetDays: -6, weightKg: 61.0, heightCm: 168, waistCm: 73, hipCm: 95, note: "Takip ölçümü" },
  { id: fid(12, 3), clientId: DEMO_CLIENT_IDS.merve, offsetDays: -5, weightKg: 58.4, heightCm: 163, waistCm: 70, hipCm: 92, note: "İlk ölçüm" },
] as const;

export const DEMO_NUTRITION_PREFERENCES_SEED = [
  { id: fid(13, 1), clientId: DEMO_CLIENT_IDS.eylul, stance: "preferred", foodLabel: "Yulaf", note: "Kahvaltıda tercih ediyor." },
  { id: fid(13, 2), clientId: DEMO_CLIENT_IDS.eylul, stance: "avoided", foodLabel: "Acı biber", note: null as string | null },
] as const;

export type DemoPlanItemSeed = {
  id: string; label: string; grams: number; portion: string | null;
  /** 100 g başına besin değerleri (plan snapshot sözleşmesi: itemNutrientContribution = amount × gram / 100). */
  per100: { energy: number; protein: number; carbohydrate: number; total_fat: number; fiber: number };
};
export type DemoPlanMealSeed = { id: string; mealType: "breakfast" | "lunch" | "snack" | "dinner"; label: string; sort: number; items: DemoPlanItemSeed[] };

export const DEMO_NUTRITION_PLAN = {
  id: fid(14, 1),
  familyId: fid(15, 1),
  clientId: DEMO_CLIENT_IDS.eylul,
  title: "Dengeli enerji — örnek haftalık plan",
  note: "Sentetik örnek plan. Gerçek bir danışana ait değildir.",
  startOffsetDays: -6,
  lengthDays: 7,
  energyTarget: 1800,
  /** Planın ilk günü (gün 0) için öğünler; diğer günler boş gün olarak oluşturulur. */
  dayId: fid(16, 1),
  meals: [
    {
      id: fid(17, 1), mealType: "breakfast", label: "Kahvaltı", sort: 0,
      items: [
        { id: fid(18, 1), label: "Yulaf ezmesi", grams: 50, portion: "1 kase", per100: { energy: 379, protein: 13.2, carbohydrate: 67.7, total_fat: 6.5, fiber: 10.1 } },
        { id: fid(18, 2), label: "Yoğurt (tam yağlı)", grams: 150, portion: "1 kase", per100: { energy: 61, protein: 3.5, carbohydrate: 4.7, total_fat: 3.3, fiber: 0 } },
      ],
    },
    {
      id: fid(17, 2), mealType: "lunch", label: "Öğle", sort: 1,
      items: [
        { id: fid(18, 3), label: "Mercimek çorbası", grams: 250, portion: "1 kase", per100: { energy: 56, protein: 3.6, carbohydrate: 8.9, total_fat: 0.8, fiber: 2.6 } },
        { id: fid(18, 4), label: "Mevsim salata", grams: 150, portion: "1 tabak", per100: { energy: 25, protein: 1.2, carbohydrate: 4.5, total_fat: 0.3, fiber: 1.8 } },
      ],
    },
    {
      id: fid(17, 3), mealType: "dinner", label: "Akşam", sort: 2,
      items: [
        { id: fid(18, 5), label: "Izgara tavuk göğsü", grams: 150, portion: "1 porsiyon", per100: { energy: 165, protein: 31, carbohydrate: 0, total_fat: 3.6, fiber: 0 } },
        { id: fid(18, 6), label: "Bulgur pilavı", grams: 150, portion: "1 porsiyon", per100: { energy: 83, protein: 3.1, carbohydrate: 18.6, total_fat: 0.2, fiber: 4.5 } },
      ],
    },
  ] as DemoPlanMealSeed[],
} as const;

/** Plan günü id'si (gün indeksi 0..lengthDays-1; gün 0 = DEMO_NUTRITION_PLAN.dayId). */
export function planDayId(dayIndex: number): string {
  return fid(16, dayIndex + 1);
}

/** Plan item besin satırı id'si (item başına 5 kod; deterministik). */
export function planItemNutrientId(itemIndex: number, codeIndex: number): string {
  return fid(19, itemIndex * 10 + codeIndex + 1);
}

export const PLAN_NUTRIENT_CODES = [
  { code: "energy", unit: "kcal" },
  { code: "protein", unit: "g" },
  { code: "carbohydrate", unit: "g" },
  { code: "total_fat", unit: "g" },
  { code: "fiber", unit: "g" },
] as const;

/** Tüm sabit fixture id'leri (testler + temizlik doğrulaması). */
export function allDemoFixtureClientIds(): string[] {
  return DEMO_CLIENTS_SEED.map((c) => c.id);
}
