// ============================================================
// Aromaterapi C3D-B2A — canonical note_hash birim testi
//
// Gerçek server serializer'ını (lib/.../methodCanonical) test eder: determinizm,
// key-sırası bağımsızlığı, steps order-deterministikliği, injektiflik, null≠"",
// içerik değişimi → hash değişimi, 64-hex format. FAIL → process.exit(1).
// tsx ile: npx tsx scripts/aromaterapi-c3d-b2a-canonical-hash.test.ts
// ============================================================

import {
  computeMethodNoteHash,
  type MethodRevisionContent,
} from "../lib/aromaterapi/service/methodCanonical";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const base: MethodRevisionContent = {
  plant_part_used: "çiçek",
  material_state: "dried",
  method_text: "Su buharı damıtması ile elde edilir.",
  equipment: "cam imbik",
  amount_ratio: "1:10",
  solvent_carrier: null,
  duration_text: "3 saat",
  temperature_text: "100°C",
  steps: [
    { order: 1, text: "Bitkiyi hazırla" },
    { order: 2, text: "İmbiğe yerleştir" },
    { order: 3, text: "Damıt" },
  ],
  filtration: "kaba süzgeç",
  resting: "24 saat",
  storage: "amber şişe",
  quality_notes: "berraklık kontrolü",
  safety_notes: "cilt testi",
};

const HEX64 = /^[0-9a-f]{64}$/;

// 1) 64-hex format.
const h0 = computeMethodNoteHash(base);
check("T01 64-hex lowercase format", HEX64.test(h0), h0);

// 2) Determinizm: aynı içerik → aynı hash.
check("T02 determinizm", computeMethodNoteHash(base) === h0);

// 3) Key-sırası bağımsızlığı: farklı JS key sırası → aynı hash.
const reordered: MethodRevisionContent = {
  safety_notes: base.safety_notes,
  method_text: base.method_text,
  steps: base.steps,
  plant_part_used: base.plant_part_used,
  material_state: base.material_state,
  equipment: base.equipment,
  amount_ratio: base.amount_ratio,
  solvent_carrier: base.solvent_carrier,
  duration_text: base.duration_text,
  temperature_text: base.temperature_text,
  filtration: base.filtration,
  resting: base.resting,
  storage: base.storage,
  quality_notes: base.quality_notes,
};
check("T03 JS key-sırası bağımsız", computeMethodNoteHash(reordered) === h0);

// 4) Steps dizi-sırası bağımsız (order değerine göre canonical).
const stepsShuffled: MethodRevisionContent = {
  ...base,
  steps: [
    { order: 3, text: "Damıt" },
    { order: 1, text: "Bitkiyi hazırla" },
    { order: 2, text: "İmbiğe yerleştir" },
  ],
};
check("T04 steps order-deterministik (dizi sırası önemsiz)", computeMethodNoteHash(stepsShuffled) === h0);

// 5) İçerik değişimi → farklı hash.
check("T05 method_text değişimi → farklı hash",
  computeMethodNoteHash({ ...base, method_text: base.method_text + " " }) !== h0);
check("T06 step text değişimi → farklı hash",
  computeMethodNoteHash({ ...base, steps: [{ order: 1, text: "X" }, { order: 2, text: "İmbiğe yerleştir" }, { order: 3, text: "Damıt" }] }) !== h0);
check("T07 step order değişimi → farklı hash",
  computeMethodNoteHash({ ...base, steps: [{ order: 5, text: "Bitkiyi hazırla" }, { order: 6, text: "İmbiğe yerleştir" }, { order: 7, text: "Damıt" }] }) !== h0);

// 6) null ≠ "" (enc null="∅", enc("")="0:").
check("T08 null ≠ boş string",
  computeMethodNoteHash({ ...base, equipment: null }) !== computeMethodNoteHash({ ...base, equipment: "" }));

// 7) Injektiflik: alan sınırı kayması farklı hash üretmeli (uzunluk-öneki).
const a: MethodRevisionContent = { ...base, plant_part_used: "12", material_state: null };
const b: MethodRevisionContent = { ...base, plant_part_used: "1", material_state: "2" };
check("T09 alan sınırı injektif (uzunluk-öneki)", computeMethodNoteHash(a) !== computeMethodNoteHash(b));

// 8) steps null vs [] aynı canonical (ikisi de 0 adım).
check("T10 steps null == [] (0 adım)",
  computeMethodNoteHash({ ...base, steps: null }) === computeMethodNoteHash({ ...base, steps: [] }));

console.log(`\n──────────── C3D-B2A CANONICAL HASH: ${pass} PASS / ${fail} FAIL ────────────`);
if (fail > 0) {
  console.log("Başarısızlar:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
console.log("Tüm canonical hash kontrolleri geçti.\n");
