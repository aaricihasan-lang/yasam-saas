/**
 * BİYOENERJİ FAZ 2 — Bilgi Mimarisi (IA) doğrulama harness'i.
 *
 * Yalnız navigation/IA katmanı invariant'larını doğrular. DB / güvenlik / içerik
 * kapsam dışıdır. Kod:  npx tsx scripts/bioenergy-faz2/iaHarness.ts
 *
 * Amaç (TUR 2 kabul kriterleri):
 *  - Landing'de yalnız mevcut 6 çalışma alanı görünür (Aura/Temel Bilgiler yok).
 *  - 4 profesyonel IA grubu, onaylanan başlıklarla.
 *  - Route slug ↔ section key parity (rename güvenliği).
 *  - Gruplama, 6 bölümü eksiksiz ve tekrarsız kapsar.
 */
import {
  BIOENERJI_FOLDER_BASE,
  BIOENERJI_FOLDER_CARDS,
  BIOENERJI_GROUP_ORDER,
  BIOENERJI_SECTIONS_IN_ORDER,
  findBiyoenerjiSection,
  getBiyoenerjiGroups,
  type BiyoenerjiGroupId,
  type BiyoenerjiSectionKey,
} from "../../app/dashboard/biyoenerji/biyoenerjiFolderConfig";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// Beklenen sabitler (TUR 2 bağlayıcı kararlar)
const EXPECTED_KEYS: BiyoenerjiSectionKey[] = [
  "cakralar",
  "enerji-bedenleri",
  "bilincalti-sebepleri",
  "seanslar",
  "imajinasyonlar",
  "sembol-dili",
];

const EXPECTED_GROUP_TITLES: Record<BiyoenerjiGroupId, string> = {
  anatomi: "Enerji Anatomisi",
  nedenler: "Nedenler & Blokajlar",
  teknikler: "Teknikler & Uygulamalar",
  "zihinsel-sembolik": "Zihinsel & Sembolik Çalışmalar",
};

const EXPECTED_MEMBERSHIP: Record<BiyoenerjiGroupId, BiyoenerjiSectionKey[]> = {
  anatomi: ["cakralar", "enerji-bedenleri"],
  nedenler: ["bilincalti-sebepleri"],
  teknikler: ["seanslar"],
  "zihinsel-sembolik": ["imajinasyonlar", "sembol-dili"],
};

// Landing'de ASLA görünmemesi gereken placeholder İFADELERİ (FAZ 3'e ait alanlar
// için "yakında" kartı yasak). NOT: "aura" gibi kelimeler mevcut açıklama metninde
// meşru geçebilir (Enerji Bedenleri açıklaması) — bu yüzden yalnız placeholder
// ifadeleri aranır, betimleyici kelimeler değil.
const FORBIDDEN_PHRASES = ["yakında", "coming soon", "placeholder", "çok yakında", "hazırlanıyor"];

// FAZ 3'e ait olup bu fazda bölüm/kart OLMAMASI gereken rezerve anahtarlar.
const RESERVED_FAZ3_KEYS = ["aura", "aura-renkleri", "temel-bilgiler"];

// 1) Tam 6 kart
check("Kart sayısı = 6", BIOENERJI_FOLDER_CARDS.length === 6, `bulunan ${BIOENERJI_FOLDER_CARDS.length}`);

// 2) Anahtarlar benzersiz + beklenen küme
const keys = BIOENERJI_FOLDER_CARDS.map((c) => c.key);
check("Anahtarlar benzersiz", new Set(keys).size === keys.length);
check(
  "Anahtar kümesi beklenenle aynı",
  EXPECTED_KEYS.every((k) => keys.includes(k)) && keys.every((k) => EXPECTED_KEYS.includes(k)),
  `[${keys.join(", ")}]`,
);

// 3) Route slug ↔ key parity (rename güvenliği)
for (const card of BIOENERJI_FOLDER_CARDS) {
  check(
    `href parity: ${card.key}`,
    card.href === `${BIOENERJI_FOLDER_BASE}/${card.key}`,
    `href=${card.href}`,
  );
}

// 4) Grup sayısı + başlıkları
check("Grup sayısı = 4", BIOENERJI_GROUP_ORDER.length === 4, `bulunan ${BIOENERJI_GROUP_ORDER.length}`);
for (const g of BIOENERJI_GROUP_ORDER) {
  check(`Grup başlığı: ${g.id}`, g.title === EXPECTED_GROUP_TITLES[g.id], `"${g.title}"`);
}

// 5) getBiyoenerjiGroups() 6 bölümü eksiksiz + tekrarsız kapsar
const grouped = getBiyoenerjiGroups();
const groupedKeys = grouped.flatMap((g) => g.cards.map((c) => c.key));
check("Gruplu kapsam = 6", groupedKeys.length === 6, `bulunan ${groupedKeys.length}`);
check("Gruplu kapsam tekrarsız", new Set(groupedKeys).size === groupedKeys.length);
check(
  "Gruplu kapsam tüm bölümleri içerir",
  EXPECTED_KEYS.every((k) => groupedKeys.includes(k)),
);

// 6) Grup üyelikleri beklenen
for (const g of grouped) {
  const gk = g.cards.map((c) => c.key);
  const expected = EXPECTED_MEMBERSHIP[g.id];
  check(
    `Üyelik: ${g.id}`,
    gk.length === expected.length && expected.every((k) => gk.includes(k)),
    `[${gk.join(", ")}] beklenen [${expected.join(", ")}]`,
  );
}

// 7) IA sıralı düz liste = 6, sıra grup sırasını izler
check("Sıralı bölüm listesi = 6", BIOENERJI_SECTIONS_IN_ORDER.length === 6);
const expectedOrder = BIOENERJI_GROUP_ORDER.flatMap((g) => EXPECTED_MEMBERSHIP[g.id]);
check(
  "IA sıralaması grup sırasını izler",
  BIOENERJI_SECTIONS_IN_ORDER.map((c) => c.key).join(",") === expectedOrder.join(","),
  BIOENERJI_SECTIONS_IN_ORDER.map((c) => c.key).join(","),
);

// 8) findBiyoenerjiSection tüm anahtarlar için doğru grup döndürür
for (const k of EXPECTED_KEYS) {
  const found = findBiyoenerjiSection(k);
  check(`findSection: ${k}`, !!found && found.card.key === k);
  if (found) {
    check(
      `findSection grup eşleşmesi: ${k}`,
      EXPECTED_MEMBERSHIP[found.group.id].includes(k),
    );
  }
}

// 9a) Placeholder İFADESİ YOK (kart başlık/desc/badge içinde "yakında" vb.)
for (const card of BIOENERJI_FOLDER_CARDS) {
  const hay = `${card.title} ${card.desc} ${card.badge}`.toLocaleLowerCase("tr");
  for (const phrase of FORBIDDEN_PHRASES) {
    check(
      `Placeholder ifadesi yok (${card.key} / "${phrase}")`,
      !hay.includes(phrase),
      `kart="${card.title}"`,
    );
  }
}

// 9b) FAZ 3 rezerve anahtarları bu fazda bölüm olarak GÖRÜNMEZ
for (const reserved of RESERVED_FAZ3_KEYS) {
  check(
    `FAZ 3 rezerve bölüm yok: ${reserved}`,
    !keys.includes(reserved as BiyoenerjiSectionKey),
  );
}

// 10) Isim koruması — mevcut kart adları rename EDİLMEMİŞ
check(
  "Kart adı korundu: Biyoenerji Seansları",
  BIOENERJI_FOLDER_CARDS.some((c) => c.key === "seanslar" && c.title === "Biyoenerji Seansları"),
);
check(
  "Kart adı korundu: Bilinçaltı Sebepleri",
  BIOENERJI_FOLDER_CARDS.some(
    (c) => c.key === "bilincalti-sebepleri" && c.title === "Bilinçaltı Sebepleri",
  ),
);

// Rapor
console.log(`\nBİYOENERJİ FAZ 2 — IA HARNESS`);
console.log(`PASS: ${pass}  FAIL: ${fail}  TOTAL: ${pass + fail}`);
if (fail > 0) {
  console.log(`\nBAŞARISIZ KONTROLLER:`);
  for (const f of failures) console.log(`  ${f}`);
  console.log(`\nOVERALL = FAIL`);
  process.exit(1);
} else {
  console.log(`OVERALL = PASS`);
}
