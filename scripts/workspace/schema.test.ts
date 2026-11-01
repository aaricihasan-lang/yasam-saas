/**
 * KİŞİSEL DİJİTAL OFİS (P1) — saf şema + durum geçişi testleri (DB / ağ YOK).
 * Çalıştır: npx tsx scripts/workspace/schema.test.ts
 */
import { randomUUID } from "node:crypto";
import { FAVORITE_KEYS, FAVORITES_MAX, HIDEABLE_KEYS, HISTORY_MAX, WORKSPACE_CENTERS } from "../../lib/workspace/catalog";
import { checkDesignContrast, contrastRatio, heroBackground } from "../../lib/workspace/contrast";
import { isWorkspaceDesignEnabled } from "../../lib/workspace/flags";
import { DEFAULT_UI_PREFS, parseDesign, parseExpectedVersion, parseUiPrefs } from "../../lib/workspace/schema";
import { EMPTY_DESIGN_STATE, nextDesignState, type RawDesign } from "../../lib/workspace/service";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}

// ── Bayrak ──
ok(isWorkspaceDesignEnabled({}) === false, "bayrak varsayılan KAPALI");
ok(isWorkspaceDesignEnabled({ EXPERT_WORKSPACE_DESIGN_ENABLED: "1" }) === false, "bayrak yalnız tam 'true' ile açılır");
ok(isWorkspaceDesignEnabled({ EXPERT_WORKSPACE_DESIGN_ENABLED: "true" }) === true, "bayrak 'true' → açık");

// ── Katalog ──
ok(WORKSPACE_CENTERS.length === 7, "7 ana merkez (canlı ana sayfa ile aynı)");
ok([...HIDEABLE_KEYS].every((k) => /^(center|module):[a-z_]+$/.test(k)), "gizleme anahtarları önekli ve küçük harf");
ok([...FAVORITE_KEYS].every((k) => k.startsWith("module:")), "favoriler yalnız modül anahtarı");
ok(FAVORITES_MAX === 8 && HISTORY_MAX === 10, "sınırlar: Favorilerim 8, geçmiş 10");

// ── Tasarım şeması ──
const min = parseDesign({ layout: "A" });
ok(min.ok && min.value.bg.mode === "default" && min.value.text.useGreeting === true && min.value.brand === null, "en küçük tasarım varsayılanlarla dolar", min);
ok(min.ok && min.value.bg.pageAttach === "fixed", "tüm sayfa fotoğrafında varsayılan Sabit (Owner kararı 8)");
const rej = (label: string, v: unknown, path?: RegExp) => {
  const r = parseDesign(v);
  ok(!r.ok && (!path || path.test(r.path)), label, r);
};
rej("düzen eksik", {}, /layout/);
rej("bilinmeyen kök alan", { layout: "A", user_id: "x" }, /user_id/);
rej("logo.src (dosya yolu) reddedilir", { layout: "A", logo: { src: "/a.png" } }, /logo\.src/);
rej("logo.url reddedilir", { layout: "A", logo: { url: "https://x/y.png" } }, /logo\.url/);
rej("bg.photo (eski yol nesnesi) reddedilir", { layout: "A", bg: { photo: { src: "blob:x" } } }, /bg\.photo/);
rej("varlık kimliği P1'de kapalı", { layout: "A", logo: { assetId: randomUUID() } }, /assetId/);
const withAsset = parseDesign({ layout: "A", logo: { assetId: randomUUID() } }, { allowAssets: true });
ok(withAsset.ok, "allowAssets açıkken uuid varlık kimliği kabul");
rej("allowAssets açık olsa da yol kabul edilmez", { layout: "A", logo: { assetId: "../../secret.png" } });
const pathWithAssets = parseDesign({ layout: "A", logo: { assetId: "tenant/123/logo.png" } }, { allowAssets: true });
ok(!pathWithAssets.ok, "allowAssets açıkken bile depolama yolu reddedilir");
rej("prototip dizisi değil nesne", [], /design/);
rej("satır kimliği tekrar", { layout: "A", text: { lines: [{ id: "a", role: "body", text: "x" }, { id: "a", role: "body", text: "y" }] } });
rej("satır rolü bilinmiyor", { layout: "A", text: { lines: [{ id: "a", role: "script", text: "x" }] } });
rej("satır boyutu aralık dışı", { layout: "A", text: { lines: [{ id: "a", role: "body", text: "x", size: 500 }] } });
rej("Infinity reddedilir", { layout: "A", bg: { zoom: Infinity } });
rej("logo konumu aralık dışı", { layout: "A", logo: { layout: { desktop: { zone: "hero", x: 2, y: 0.5, w: 0.3 } } } });
rej("bilinmeyen logo bölgesi", { layout: "A", logo: { layout: { desktop: { zone: "header", x: 1, y: 0.5, w: 0.3 } } } });
rej("marka rengi paletsiz", { layout: "A", text: { lines: [{ id: "a", role: "body", text: "x", color: "brand" }] } });
const brand = parseDesign({ layout: "C", brand: { accent: "#7C3AED", soft: "#f4effd", ink: "#17142b" }, bg: { mode: "theme", theme: "marka" } });
ok(brand.ok && brand.value.brand?.accent === "#7c3aed" && brand.value.brand.name === "Özel", "marka paleti normalize edilir (küçük harf, varsayılan ad)");
const multi = parseDesign({ layout: "A", text: { lines: [{ id: "a", role: "body", text: "satır 1\nsatır 2" }] } });
ok(multi.ok, "satır sonu (\\n) kabul edilir");
const big = parseDesign({ layout: "A", text: { lines: Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, role: "body", text: "ç".repeat(300) })) } });
ok(big.ok && JSON.stringify(big.value).length < 32_768, "en büyük geçerli tasarım DB sınırının (32 KB) altında kalır", big.ok ? JSON.stringify(big.value).length : big);

// ── Tercih şeması ──
const fullPrefs = { hiddenModules: [], favorites: [], cardLevel: "center", viewMode: "auto", reading: { scale: 1.15, lineHeight: 1.7, width: 68 } };
ok(parseUiPrefs(fullPrefs).ok, "varsayılan tercihler geçerli");
ok(JSON.stringify(DEFAULT_UI_PREFS) === JSON.stringify(fullPrefs), "DEFAULT_UI_PREFS beklenen varsayılan");
ok(!parseUiPrefs({ ...fullPrefs, favorites: ["module:x"] }).ok, "bilinmeyen favori anahtarı reddedilir");
ok(!parseUiPrefs({ ...fullPrefs, hiddenModules: ["center:admin"] }).ok, "bilinmeyen merkez anahtarı reddedilir");
ok(!parseUiPrefs({ ...fullPrefs, extra: true }).ok, "bilinmeyen tercih alanı reddedilir");
ok(!parseUiPrefs({ ...fullPrefs, reading: { scale: 1.2, lineHeight: 1.7, width: 70 } }).ok, "okuma genişliği yalnız 58/68/80");
ok(parseUiPrefs({ ...fullPrefs, hiddenModules: [...HIDEABLE_KEYS] }).ok, "tüm merkez/modüller gizlenebilir (yetki değişmez)");

// ── Sürüm ──
ok(parseExpectedVersion(0).ok && parseExpectedVersion(7).ok, "sürüm 0 ve pozitif tam sayı");
ok(!parseExpectedVersion("1").ok && !parseExpectedVersion(null).ok && !parseExpectedVersion(2.5).ok, "metin / null / kesirli sürüm reddedilir");

// ── Durum geçişleri ──
const D = (n: number) => {
  const r = parseDesign({ layout: "A", text: { useGreeting: false, lines: [{ id: "a", role: "title", text: `T${n}` }] } });
  if (!r.ok) throw new Error("tasarım");
  return r.value;
};
const raw0: RawDesign = { applied: null, draft: null, history: [] };
ok(EMPTY_DESIGN_STATE.applied === null && EMPTY_DESIGN_STATE.version === 0, "boş durum: applied null, version 0 (mevcut ana sayfa)");
let s = raw0;
const now = "2026-11-01T00:00:00.000Z";
for (let i = 1; i <= 14; i++) {
  const r = nextDesignState(s, { action: "apply", draft: D(i) }, now);
  if (!r.ok) throw new Error(r.error);
  s = r.next;
}
ok(s.history.length === HISTORY_MAX, "14 uygulama → geçmiş 10'da kalır", s.history.length);
const firstId = (s.history[0] as { id: string }).id;
const restored = nextDesignState(s, { action: "restore", historyId: firstId }, now);
ok(restored.ok && restored.next.history.length === HISTORY_MAX && !restored.next.history.some((h) => (h as { id: string }).id === firstId), "geri dönüş sonrası geçmiş ≤ 10, seçilen geçmişten çıkar");
const reset = nextDesignState(s, { action: "reset" }, now);
ok(reset.ok && reset.next.applied === null && reset.next.draft === null && reset.next.history.length === HISTORY_MAX, "sıfırla: applied/draft null, eski tasarım geçmişte");
const resetEmpty = nextDesignState(raw0, { action: "reset" }, now);
ok(resetEmpty.ok && resetEmpty.next.history.length === 0, "boşken sıfırla: geçmişe boş kayıt eklenmez");
ok(!nextDesignState(raw0, { action: "apply" }, now).ok, "taslaksız uygula reddedilir");
const legacy: RawDesign = { applied: { layout: "Z", future: 1 }, draft: null, history: [{ id: "eski", savedAt: now, design: { layout: "Z" } }] };
const sd = nextDesignState(legacy, { action: "saveDraft", draft: D(1) }, now);
ok(sd.ok && JSON.stringify(sd.next.applied) === JSON.stringify(legacy.applied) && sd.next.history.length === 1, "okunamayan eski applied/geçmiş taslak kaydında aynen korunur");
const ld = nextDesignState(legacy, { action: "loadHistory", historyId: "eski" }, now);
ok(!ld.ok, "okunamayan eski geçmiş taslağa yüklenemez (hata, veri silinmez)");

// ── Sunucu kontrast kuralları (P0 modeliyle aynı formül) ──
{
  const near = (x: number, y: number) => Math.abs(x - y) < 0.02;
  ok(near(contrastRatio("#765614", "#f6f2ef"), 6.06) && near(contrastRatio("#c99a3a", "#f6f2ef"), 2.31) && near(contrastRatio("#765614", "#e2d6f5"), 4.88),
    "WCAG oranı bilinen değerlerle aynı (6,06 / 2,31 / 4,88)");
  const dz = (o: Record<string, unknown>, allowAssets = false) => {
    const r = parseDesign(o, { allowAssets });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  const lav = (lines: unknown[], extra: Record<string, unknown> = {}) => dz({ layout: "A", text: { useGreeting: false, lines }, bg: { mode: "theme", theme: "lavanta" }, ...extra });
  ok(checkDesignContrast(dz({ layout: "A" })).length === 0, "varsayılan tasarım (Hoş geldiniz) güvenli");
  ok(checkDesignContrast(lav([{ id: "a", role: "label", text: "Hoş geldiniz", size: 13 }, { id: "b", role: "body", text: "x" }])).length === 0, "otomatik renkler en zor açık temada (lavanta) geçer");
  const white = checkDesignContrast(lav([{ id: "a", role: "body", text: "Beyaz metin", color: "#ffffff" }]));
  ok(white.length === 1 && white[0].need === 4.5 && white[0].path === "design.text.lines[0]", "lavanta üzerinde beyaz gövde metni yakalanır", white);
  ok(checkDesignContrast(lav([{ id: "a", role: "title", text: "Başlık", size: 44, color: "#8a6417" }])).length === 0, "büyük başlık için 3:1 eşiği uygulanır");
  ok(checkDesignContrast(lav([{ id: "a", role: "body", text: "Altın", color: "#c99a3a" }])).length === 1, "eski açık altın (#c99a3a) metin olarak reddedilir");
  ok(checkDesignContrast(lav([{ id: "a", role: "body", text: "   ", color: "#ffffff" }])).length === 0, "boş satır denetlenmez");
  const night = dz({ layout: "A", text: { useGreeting: false, lines: [{ id: "a", role: "title", text: "x", size: 44 }, { id: "b", role: "label", text: "y" }] }, bg: { mode: "theme", theme: "gece" } });
  ok(checkDesignContrast(night).length === 0, "koyu temada otomatik açık renkler geçer");
  ok(checkDesignContrast(dz({ layout: "A", brand: { accent: "#7c3aed", soft: "#f4effd", ink: "#d8d0f0" } })).some((x) => x.path === "design.brand.ink"), "marka paleti: soluk koyu yazı yakalanır");
  const photo = (layout: string) => dz({ layout, text: { useGreeting: false, lines: [{ id: "a", role: "body", text: "x", color: "#ffffff" }] }, bg: { mode: "photo", photoAssetId: randomUUID(), tone: "light" } }, true);
  ok(heroBackground(photo("A")) === null && checkDesignContrast(photo("A")).length === 0, "fotoğraf (A/B) sunucuda ölçülemez → istemci piksel kapısına bırakılır (P4/P5)");
  ok(heroBackground(photo("C")) === "#f1ede8" && checkDesignContrast(photo("C")).length === 1, "C plaketi fotoğrafta tona göre bilinen zemin → sunucu denetler");
}

console.log(`\nworkspace schema test: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
