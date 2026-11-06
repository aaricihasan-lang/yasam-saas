/**
 * KİŞİSEL DİJİTAL OFİS — KDO-01 karşılama metni kontrastı (etkin görünüm modu) + KDO-06 Okuma kaldırma (saf; DOM / ağ YOK).
 * Çalıştır: npx tsx scripts/workspace/heroColors.test.ts
 *
 * Model zemin bilinen her durumda (varsayılan / tema / marka teması / yazı zemini / gece katmanları) her rolün rengi WCAG AA
 * eşiğini geçmeli (büyük yazı 3:1, diğerleri 4,5:1). Fotoğrafta (yazı zemini yok) model zemin YOK → null; burada PASS
 * sayılmaz, tarayıcı piksel kapısına bırakılır (ui-kdo.harness.ts K bölümü gerçek pikselleri ölçer).
 */
import { randomUUID } from "node:crypto";
import { BG_THEMES, SELECTABLE_VIEW_MODES } from "../../lib/workspace/catalog";
import { AA, AA_LARGE, contrastRatio, isLargeLine } from "../../lib/workspace/contrast";
import { NIGHT_BG, heroBackgroundFor, heroPalette, isDefaultSurface } from "../../lib/workspace/heroColors";
import { parseDesign, type TextLine, type WorkspaceDesign } from "../../lib/workspace/schema";
import { normalizeViewMode, resolveViewMode, type EffectiveViewMode } from "../../lib/workspace/viewMode";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const D = (v: unknown): WorkspaceDesign => { const r = parseDesign(v, { allowAssets: true }); if (!r.ok) throw new Error(`${r.error} ${r.path}`); return r.value; };

// ── KDO-06: Okuma modu kaldırıldı ──
ok(!(SELECTABLE_VIEW_MODES as readonly string[]).includes("reading") && SELECTABLE_VIEW_MODES.join(",") === "auto,day,night,focus", "seçicide yalnız Otomatik / Gündüz / Gece / Odak");
ok(normalizeViewMode("reading") === "auto" && normalizeViewMode(undefined) === "auto" && normalizeViewMode("bilinmeyen") === "auto", "eski 'reading' / bilinmeyen → Otomatik");
ok(normalizeViewMode("night") === "night" && normalizeViewMode("focus") === "focus" && normalizeViewMode("day") === "day", "diğer modlar korunur");
ok(resolveViewMode("reading", false) === "day" && resolveViewMode("reading", true) === "night", "eski 'reading' Otomatik gibi cihaz tercihine uyar");

// ── KDO-01: gece katmanları koyu, kişisel zemin gece de korunur ──
ok(Object.values(NIGHT_BG).every((c) => contrastRatio(c, "#ffffff") >= 7), "gece model zeminleri koyu (beyazla ≥ 7:1)", NIGHT_BG);
const defA = D({ layout: "A" });
ok(heroBackgroundFor(defA, "night") === NIGHT_BG.band && heroBackgroundFor(D({ layout: "C" }), "night") === NIGHT_BG.plaque && heroBackgroundFor(D({ layout: "B" }), "night") === NIGHT_BG.office, "gece: varsayılan zeminler gece katmanına geçer (A bant / B ofis camı / C plaket)");
ok(heroBackgroundFor(D({ layout: "A", bg: { mode: "theme", theme: "lavanta" } }), "night") === "#e2d6f5", "gece: uzmanın açık teması korunur (koyu yazı kalır)");
ok(heroBackgroundFor(D({ layout: "A", text: { surface: "#fffdf8" } }), "night") === "#fffdf8", "gece: uzmanın yazı zemini korunur");
ok(heroBackgroundFor(D({ layout: "A", bg: { mode: "photo", photoAssetId: randomUUID() } }), "night") === null, "fotoğraf + yazı zemini yok → model zemin yok (piksel kapısı)");
ok(isDefaultSurface(D({ layout: "A", bg: { mode: "theme", theme: "manzara" } })) && !isDefaultSurface(D({ layout: "A", bg: { mode: "theme", theme: "gece" } })), "manzara teması varsayılan sayılır; diğer temalar kişisel");

// Canlı hata: gece + varsayılan zemin → "Hoş geldiniz", tarih, açıklama okunur
{
  const pal = heroPalette(defA, heroBackgroundFor(defA, "night")!);
  const rows: [string, string, number][] = [["başlık", pal.title, AA_LARGE], ["tarih", pal.date, AA], ["açıklama", pal.sub, AA], ["etiket", pal.eyebrow, AA], ["ad 1", pal.name[0], AA_LARGE], ["ad 2", pal.name[1], AA_LARGE]];
  const bad = rows.filter(([, c, need]) => contrastRatio(c, pal.bg) < need);
  ok(bad.length === 0 && pal.dark, "canlı hata kapalı: gece varsayılan karşılamada tüm satırlar AA", { bg: pal.bg, rows: rows.map(([n, c]) => [n, c, contrastRatio(c, pal.bg).toFixed(2)]) });
}
// Markalı başlık gece: koyu marka mürekkebi koyu bantta kalmaz
{
  const d = D({ layout: "A", brand: { accent: "#6d28d9", soft: "#f3eefe", ink: "#1e1638", accent2: "#a78bfa" }, text: { useGreeting: false, lines: [{ id: "a", role: "title", text: "Frekans", size: 44 }, { id: "b", role: "quote", text: "x", color: "brand" }] } });
  const pal = heroPalette(d, heroBackgroundFor(d, "night")!);
  ok(contrastRatio(pal.line(d.text.lines[0]), pal.bg) >= AA_LARGE && contrastRatio(pal.line(d.text.lines[1]), pal.bg) >= AA, "gece: marka mürekkebi / marka vurgusu koyu bantta açılır", [pal.line(d.text.lines[0]), pal.line(d.text.lines[1])]);
  const day = heroPalette(d, heroBackgroundFor(d, "day")!);
  ok(day.line(d.text.lines[0]) === "#1e1638", "gündüz: geçen marka rengi AYNEN korunur (yalnız gerektiğinde ayarlanır)");
}

// ── Kapsamlı tarama: düzen × zemin × marka × mod × satır rengi ──
{
  const brands = [null, { accent: "#6d28d9", soft: "#f3eefe", ink: "#1e1638", accent2: "#a78bfa" }, { accent: "#2f6b4f", soft: "#eef5ee", ink: "#14251c", accent2: "#c99a3a" }, { accent: "#b4235a", soft: "#fdf1f4", ink: "#2a0f1a", accent2: "#f59e0b" }];
  const colors = ["auto", "brand", "#17142b", "#7c3aed", "#a8761f", "#2f6b4f", "#b4235a", "#ffffff", "#5b3fa0", "#c99a3a", "#888888"];
  const roles: TextLine["role"][] = ["label", "title", "subtitle", "body", "quote"];
  const surfaces = [null, "#fffdf8", "#f4effd", "#1f1a33", "#2f2a26", "#e8f3ec"];
  const modes: EffectiveViewMode[] = ["day", "night", "focus"];
  let combos = 0;
  let unknownBg = 0;
  const failures: unknown[] = [];
  for (const layout of ["A", "B", "C"] as const) for (const bgSpec of [{ mode: "default" }, ...BG_THEMES.map((t) => ({ mode: "theme", theme: t })), { mode: "photo", photoAssetId: randomUUID(), tone: "light" }, { mode: "photo", photoAssetId: randomUUID(), tone: "dark" }]) {
    for (const brand of brands) for (const surface of surfaces) {
      if ((bgSpec as { theme?: string }).theme === "marka" && !brand) continue;
      const lines = roles.flatMap((role, i) => colors.filter((c) => c !== "brand" || brand).map((color, j) => ({ id: `l${i}_${j}`, role, text: "Örnek", size: role === "title" ? 44 : role === "subtitle" ? 24 : 16, color })));
      const d = D({ layout, bg: bgSpec, brand, text: { useGreeting: false, surface, lines: lines.slice(0, 10) } });
      const all = lines;
      for (const mode of modes) {
        const bg = heroBackgroundFor(d, mode);
        if (!bg) { unknownBg++; continue; }
        const pal = heroPalette(d, bg);
        const check = (name: string, c: string, need: number) => { combos++; if (contrastRatio(c, bg) < need - 1e-9) failures.push({ layout, bg: bgSpec, brand: brand?.accent ?? null, surface, mode, name, c, model: bg, ratio: contrastRatio(c, bg).toFixed(2) }); };
        check("eyebrow", pal.eyebrow, AA); check("title", pal.title, AA_LARGE); check("date", pal.date, AA); check("sub", pal.sub, AA);
        check("name0", pal.name[0], AA_LARGE); check("name1", pal.name[1], AA_LARGE);
        for (const l of all) check(`${l.role}/${l.color}`, pal.line(l as TextLine), isLargeLine(l as TextLine) ? AA_LARGE : AA);
      }
    }
  }
  ok(failures.length === 0 && combos > 20000, `kapsamlı tarama: ${combos} renk × zemin × mod kombinasyonunda AA (bilinmeyen zemin ${unknownBg} → tarayıcı ölçümüne)`, failures.slice(0, 5));
  ok(unknownBg > 0, "fotoğraf + yazı zemini yok durumları PASS sayılmadı (ayrı ölçüm)");
}

console.log(`\nworkspace heroColors test: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
