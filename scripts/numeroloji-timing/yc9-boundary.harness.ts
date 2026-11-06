/**
 * D5-B — Yıl Çakrası 9 kaynak sınırı harness'i.
 *
 * YEAR_CHAKRA_CATALOG[9] sonuna kitap 1. seviyede sonraki bölüme ait (basılı s.174+:
 * "EVRENSEL YIL, AY VE GÜN + KİŞİSEL YIL, AY VE GÜN ENERJİSİ", Kişisel Yıl hesaplama,
 * Kişisel Yıl Sayısı 1–9) metinler yanlışlıkla eklenmişti. Bu harness:
 *   - YC[9]'un "Dokuz Yılındaki Müfredat" bölüm sonunda bittiğini,
 *   - hiçbir YC girdisinde sonraki bölüm işaretinin kalmadığını,
 *   - YC[1–8], Kişisel Yıl ve Evrensel Yıl kataloglarının değişmediğini,
 *   - "YAPILMASI GEREKENLER" listelerinin (1–9) kaybolmadığını doğrular.
 * Çalıştır:  tsx scripts/numeroloji-timing/yc9-boundary.harness.ts
 */
import { createHash } from "node:crypto";
import { YEAR_CHAKRA_CATALOG, PERSONAL_YEAR_TODO_CATALOG } from "@/lib/numeroloji/development/catalogs";
import { yearChakra } from "@/lib/numeroloji/development";
import { PERSONAL_YEAR_CATALOG, UNIVERSAL_YEAR_CATALOG } from "@/lib/numeroloji/timing/catalogs";
import { hesaplaNumeroloji } from "@/lib/numeroloji";
import { buildNumerolojiWordChildren } from "@/app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild";

let pass = 0;
let fail = 0;
function assert(cond: boolean, label: string, detail = "") {
  if (cond) {
    pass++;
    console.log(`✓ ${label}`);
  } else {
    fail++;
    console.log(`✗ ${label}${detail ? " — " + detail : ""}`);
  }
}
const h = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// ── YC[9] kaynak bölüm sınırı ────────────────────────────────────────────────
const yc9 = YEAR_CHAKRA_CATALOG[9];
assert(yc9.startsWith("Bu yıl geçtiğimiz sekiz yılın değerlendirmesini yapma"), "YC9 bölüm başı korunur");
assert(
  yc9.endsWith("Evrensel sevgi ve insanlığın kardeşliği titreşimleriyle bütünün hayrına hizmet güdünüzü açığa çıkarın."),
  "YC9 Dokuz Yılındaki Müfredat son cümlesinde biter",
);
assert(yc9.length === 780, "YC9 uzunluğu 780", `len=${yc9.length}`);
assert(h(yc9) === "5101fc1de173a0cd", "YC9 metni kaynak bölümüyle birebir", h(yc9));

// ── Hiçbir YC girdisinde sonraki bölüm metni yok ─────────────────────────────
const FORBIDDEN = ["҉", "EVRENSEL YIL", "KİŞİSEL YIL", "YAPILMASI GEREKENLER", "Evrensel yıl sayısı"];
for (let i = 1; i <= 9; i++) {
  const t = YEAR_CHAKRA_CATALOG[i];
  const hit = FORBIDDEN.filter((f) => t.includes(f));
  assert(hit.length === 0, `YC${i} sonraki bölüm işareti içermez`, hit.join(","));
  assert(t.length > 500 && t.length < 1200, `YC${i} makul uzunluk`, `len=${t.length}`);
}

// ── YC[1–8] değişmedi (main 583b397b ile aynı) ───────────────────────────────
const YC_HASH: Record<number, string> = {
  1: "dd401085c48bd30d",
  2: "f8e054aafd883c8c",
  3: "ed3be858bcf7cbe2",
  4: "9a43ceca9c9c2ad6",
  5: "316281637b27bbd0",
  6: "1e961e05e56facfe",
  7: "23a4d0029bb15026",
  8: "a8042725dd4152b5",
};
for (let i = 1; i <= 8; i++) assert(h(YEAR_CHAKRA_CATALOG[i]) === YC_HASH[i], `YC${i} değişmedi`);

// ── Başka kataloglar korunur ─────────────────────────────────────────────────
assert(h(JSON.stringify(PERSONAL_YEAR_CATALOG)) === "b9901fca01a3da16", "PERSONAL_YEAR_CATALOG değişmedi");
assert(h(JSON.stringify(UNIVERSAL_YEAR_CATALOG)) === "284ce6b9d02bfdee", "UNIVERSAL_YEAR_CATALOG değişmedi");

// ── Yapılması Gerekenler listeleri 1–9 korunur ───────────────────────────────
const TODO_HEAD: Record<number, string> = {
  1: "1 YILINDA YAPILMASI GEREKENLER",
  2: "KİŞİSEL YIL SAYISI 2 DE YAPILMASI GEREKENLER",
  3: "3 YILINDA YAPILMASI GEREKENLER",
  4: "4 YILINDA YAPILMASI GEREKENLER",
  5: "5 SENESİNDE YAPILMASI GEREKENLER",
  6: "6 YILINDA YAPILMASI GEREKENLER",
  7: "7 YILINDA YAPILMASI GEREKENLER",
  8: "8 YILINDA YAPILMASI GEREKENLER",
  9: "9 YILINDA YAPILMASI GEREKENLER",
};
for (let i = 1; i <= 9; i++) {
  const t = PERSONAL_YEAR_TODO_CATALOG[i] ?? "";
  assert(t.startsWith(TODO_HEAD[i]), `TODO${i} başlıkla başlar`);
  assert((t.match(/•/g) ?? []).length >= 5, `TODO${i} madde listesi tam`, `madde=${(t.match(/•/g) ?? []).length}`);
  assert(!t.includes("҉") && !t.includes("KİŞİSEL YIL SAYISI " + (i + 1)), `TODO${i} sonraki bölüme taşmaz`);
}
assert(Object.keys(PERSONAL_YEAR_TODO_CATALOG).length === 9, "TODO katalog 9/9");

// ── Motor çıktısı (ekran + Word aynı yolu kullanır) ──────────────────────────
let found9 = false;
for (let y = 2020; y <= 2034 && !found9; y++) {
  const r = yearChakra("18/02/1987", { year: y, month: 6, day: 1 });
  if (r.value === 9) {
    found9 = true;
    assert(r.interpretation === yc9, `yearChakra(18/02/1987, ${y}) = 9 → düzeltilmiş YC9 yorumu`);
  }
}
assert(found9, "YC=9 veren referans yıl bulundu");

// ── Word raporu (gerçek builder, Zamanlama & Gelişim bölümü) ─────────────────
{
  const FN = "Deneme", LN = "KİŞİ", BD = "18.02.1987";
  const row = {
    id: "r1", name: FN, surname: LN, birth_date: BD, created_at: "2026-01-01T10:00:00Z",
    analysis_data: { version: 1, motor: hesaplaNumeroloji({ firstName: FN, lastName: LN, birthDate: BD }), summary: "X" },
  };
  const shared = { knowledgeRows: [], entries: [], sourceLabelById: new Map(), stoneRows: [] };
  const sections = { summary: false, plain: false, detailed: false, tas: false, zamanlama: true } as never;
  const res = buildNumerolojiWordChildren([row] as never, sections, shared as never, new Map(), { year: 2023, month: 6, day: 1 }, new Date("2026-06-01T09:00:00+03:00"));
  const w = JSON.stringify(res.children);
  assert(w.includes("Güncel Yıl Çakrası"), "Word: Güncel Yıl Çakrası kartı var");
  assert(w.includes("hizmet güdünüzü açığa çıkarın."), "Word: YC9 yorumu var");
  assert(!w.includes("EVRENSEL YIL, AY VE GÜN") && !w.includes("҉"), "Word: YC9 kartında sonraki bölüm metni yok");
  assert(!w.includes("9 YILINDA YAPILMASI GEREKENLER"), "Word: taşmış Yapılması Gerekenler listesi YC9 kartında görünmez");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
