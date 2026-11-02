// Gökyüzü Atlası — Derece Geçişleri: HAZIR KRİTİK DERECE LİSTELERİ (owner kararı 01.11.2026). Saf veri; istemci de içe aktarabilir.
//
// Değerler ekliptik boylamın derece BAŞLANGICIDIR (ör. 13 → 13°00′; geçiş anı cismin 13°00′'yi geçtiği an). Listeler gelenek
// bağımlıdır; kaynak notu her listeyle birlikte ekranda gösterilir. Hesap motoru (crossings.ts) bu dosyaya bağlı DEĞİLDİR.

export type CriticalDegreePresetId = "anaretic" | "world_points" | "cardinal_classic" | "fixed_classic" | "mutable_classic";

export type CriticalDegreePreset = { id: CriticalDegreePresetId; label: string; degrees: number[]; note: string };

/** Burç sırası: 0 Koç … 11 Balık. */
const CARDINAL = [0, 3, 6, 9];
const FIXED = [1, 4, 7, 10];
const MUTABLE = [2, 5, 8, 11];
const inSigns = (signs: number[], degs: number[]) => signs.flatMap((s) => degs.map((d) => s * 30 + d)).sort((a, b) => a - b);

export const CRITICAL_DEGREE_PRESETS: readonly CriticalDegreePreset[] = [
  { id: "anaretic", label: "Anaretik 29° (her burç)", degrees: Array.from({ length: 12 }, (_, i) => i * 30 + 29), note: "Anaretik derece: burcun son derecesi (29°)." },
  { id: "world_points", label: "Dünya noktaları (0° kardinal)", degrees: [0, 90, 180, 270], note: "0° Koç, 0° Yengeç, 0° Terazi, 0° Oğlak." },
  { id: "cardinal_classic", label: "Klasik kritik: kardinal 0/13/26", degrees: inSigns(CARDINAL, [0, 13, 26]), note: "Klasik kritik dereceler (Ay menzilleri kökenli geleneksel liste): kardinal burçlarda 0°, 13°, 26°." },
  { id: "fixed_classic", label: "Klasik kritik: sabit 8-9/21-22", degrees: inSigns(FIXED, [8, 9, 21, 22]), note: "Klasik kritik dereceler (Ay menzilleri kökenli geleneksel liste): sabit burçlarda 8°–9° ve 21°–22°." },
  { id: "mutable_classic", label: "Klasik kritik: değişken 4/17", degrees: inSigns(MUTABLE, [4, 17]), note: "Klasik kritik dereceler (Ay menzilleri kökenli geleneksel liste): değişken burçlarda 4° ve 17°." },
];
