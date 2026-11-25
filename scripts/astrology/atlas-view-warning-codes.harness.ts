/**
 * I18N-0008 (Atl-A0) — Atlas görünüm uyarılarının DİL-BAĞIMSIZ kodlara taşınması: ÖNCE / SONRA davranış eşitliği. Ağ / DB / sağlayıcı YOK.
 *
 *   • Gerçek veri: 200 kayıtlı Roxy Natal teknik vakası (pro-natal-houses fixture) × 4 klasik ev sistemi (yerel türetme) ×
 *     saat bilinir/bilinmez × eksik parça 0/2 → buildTechniqueView ile görünüm üretilir.
 *   • Her görünümde ESKİ ekran kararları (kaynaktan birebir kopyalanan Türkçe önek/regex kontrolleri: page.tsx yüksek enlem /
 *     ev sınırı rozeti, TimingPanels "parça" uyarısı) ile YENİ kod kararları (hasViewWarning) birebir aynı olmalı.
 *   • Kodlar SUNUCU YANITINDA YOK (API A0 bayt kilidi): istemci `deriveViewWarningCodes` ile görünüm alanlarından türetir;
 *     türetilen kodlar = sunucu metin koşulları (localNatalViewWarningCodes + eksik parça), her görünümde doğrulanır.
 *   • Eski kayıt yolu (warningCodes alanı yok — arşiv snapshot'ı / demo fixture'ı): yedek okuyucu aynı kararı verir.
 *   • Çeviri simülasyonu: uyarı METİNLERİ İngilizceye çevrilmiş olsa bile kodlu görünümde karar DEĞİŞMEZ (eski yöntem kaybederdi).
 *   • Sunucu uyarı METNİ ve teknik veri değişmedi: localNatalViewWarnings çıktısı ve view.technical, kod alanı eklenmeden öncekiyle aynı.
 *   • Künye (ResultDesk): `{ text, warn: true }` öğeleri her dilde uyarı; düz metin öğeleri eski TR regex'iyle birebir sınıflanır.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-view-warning-codes.harness.ts
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTechniqueView, type ResultRowLike } from "@/lib/astrology/view/techniqueView";
import { deriveLocalNatalHouses } from "@/lib/astrology/houses/natalLocal";
import { PRO_HOUSE_SYSTEMS } from "@/lib/astrology/houses/engine";
import { localNatalViewWarningCodes, localNatalViewWarnings } from "@/lib/astrology/engine/natalHouses";
import { deriveViewWarningCodes, hasViewWarning, legacyViewWarningCodes, viewWithWarningCodes } from "@/lib/astrology/viewWarnings";
import { deskMetaSplit } from "@/app/admin/astroloji/_components/atlas/deskMeta";
import type { NatalTechnical } from "@/lib/astrology/model/western";
import { execFileSync } from "node:child_process";
import { INTERPRETATION_KIND_CODES, interpretationKindCodeOfSchema, interpretationKindOfSchema, interpretationKindTr } from "@/lib/astrology/interpretationKind";

const FIX = join(__dirname, "fixtures");
const cases = (JSON.parse(readFileSync(join(FIX, "pro-natal-houses", "roxy-natal-technical-2026-10-31.json"), "utf8")).cases as { id: string; technical: NatalTechnical }[]);

// ── ÖNCE: kaynak koddaki eski kararlar (birebir kopya; değiştirilmez) ─────────────────────────────────────────────────────
type V = { method: { houseCalculation?: string }; warnings: string[] };
const oldHighLat = (v: V) => v.method.houseCalculation === "local" && v.warnings.some((w) => w.startsWith("Yüksek enlem"));
const oldNearCusp = (v: V) => v.method.houseCalculation === "local" && v.warnings.some((w) => w.includes("ev sınırına"));
const oldParts = (technique: string, warnings: string[]) => technique === "western.natal" && warnings.filter((w) => w.includes("parça")).length > 0;
const OLD_META_WARN_RE = /bilinmiyor|Yüksek enlem|sınırına/i;

// ── SONRA ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const newHighLat = (v: V & { warningCodes?: readonly string[] }) => v.method.houseCalculation === "local" && hasViewWarning(v, "high_latitude");
const newNearCusp = (v: V & { warningCodes?: readonly string[] }) => v.method.houseCalculation === "local" && hasViewWarning(v, "near_cusp");
const newParts = (technique: string, warnings: string[], warningCodes?: readonly string[]) => technique === "western.natal" && hasViewWarning({ warnings, warningCodes }, "missing_parts");

const row = (technical: unknown): ResultRowLike =>
  ({ id: "r1", technique: "western.natal", provider: "roxy", provider_api_version: "v2", adapter_version: "a", projection_version: "p", technical: technical as Record<string, unknown>, created_at: "2026-11-25T00:00:00Z" }) as ResultRowLike;

/** Basit EN "çeviri" simülasyonu: Türkçe uyarı metni yerine İngilizce metin (rozet kararları metne BAĞLI OLMAMALI). */
const toEn = (w: string) =>
  w.startsWith("Yüksek enlem") ? "High latitude: house sizes may be very unequal." : w.includes("ev sınırına") ? "Some points are very close to a house cusp." : w.includes("parça") ? "2 period parts could not be calculated." : "Translated warning.";

let views = 0;
let highLat = 0;
let nearCusp = 0;
let parts = 0;
let derivedFail = 0;
for (const c of cases) {
  for (const sys of PRO_HOUSE_SYSTEMS) {
    const d = deriveLocalNatalHouses(c.technical, sys);
    if (!d.ok) {
      derivedFail++;
      continue;
    }
    for (const primary of [true, false]) {
      for (const missingParts of [0, 2]) {
        const before: string = JSON.stringify(d.technical);
        const v = buildTechniqueView({
          technique: "western.natal",
          rows: [row(c.technical)],
          combined: d.technical,
          options: { houseSystem: sys },
          timeKnowledge: { primary, partner: null },
          visibility: { visible: false, reason: "not_entitled" },
          interpretations: null,
          missingParts,
        });
        views++;
        // API sözleşmesi: görünümde kod alanı YOK (yanıt / kayıt bayt-aynı); kodlar istemcide türetilir.
        assert.equal(Object.prototype.hasOwnProperty.call(v, "warningCodes"), false, `${c.id}/${sys}: sunucu görünümünde warningCodes olmamalı`);
        const codes = deriveViewWarningCodes(v);
        const vc = { ...v, warningCodes: codes };
        // Teknik veri ve sunucu uyarı METİNLERİ dokunulmadı.
        assert.equal(JSON.stringify(d.technical), before, `${c.id}/${sys}: teknik veri değişti`);
        const masked = v.timeUnknownMasked;
        const legacyText = localNatalViewWarnings(v.technical, masked);
        for (const w of legacyText) assert.ok(v.warnings.includes(w), `${c.id}/${sys}: uyarı metni eksik`);
        assert.deepEqual(
          codes.filter((x) => x !== "missing_parts"),
          localNatalViewWarningCodes(v.technical, masked),
          `${c.id}/${sys}: kod ↔ koşul`,
        );

        // ÖNCE = SONRA (kodlu görünüm)
        assert.deepEqual(codes.includes("missing_parts"), missingParts > 0, `${c.id}/${sys}: eksik parça kodu`);
        assert.equal(newHighLat(vc), oldHighLat(v), `${c.id}/${sys}/${primary}/${missingParts}: yüksek enlem rozeti`);
        assert.equal(newNearCusp(vc), oldNearCusp(v), `${c.id}/${sys}/${primary}/${missingParts}: ev sınırı rozeti`);
        assert.equal(newParts(v.technique, v.warnings, codes), oldParts(v.technique, v.warnings), `${c.id}/${sys}: parça uyarısı`);

        // ÖNCE = SONRA (eski kayıt: kod alanı yok → TR metin okuyucusu)
        const legacy = { method: v.method, warnings: v.warnings };
        assert.equal(newHighLat(legacy), oldHighLat(legacy));
        assert.equal(newNearCusp(legacy), oldNearCusp(legacy));
        assert.equal(newParts(v.technique, v.warnings, undefined), oldParts(v.technique, v.warnings));
        assert.deepEqual(legacyViewWarningCodes(v.warnings), codes, `${c.id}/${sys}: eski okuyucu = yeni kodlar`);

        // Çeviri simülasyonu: metin İngilizce → kodlu görünümde karar AYNI.
        const en = { ...vc, warnings: v.warnings.map(toEn) };
        assert.equal(newHighLat(en), oldHighLat(v), `${c.id}/${sys}: EN metinde yüksek enlem rozeti kayboldu`);
        assert.equal(newNearCusp(en), oldNearCusp(v), `${c.id}/${sys}: EN metinde ev sınırı rozeti kayboldu`);
        assert.equal(newParts(v.technique, en.warnings, en.warningCodes), oldParts(v.technique, v.warnings));

        if (oldHighLat(v)) highLat++;
        if (oldNearCusp(v)) nearCusp++;
        if (oldParts(v.technique, v.warnings)) parts++;
      }
    }
  }
}
assert.ok(views >= 1000, `görünüm sayısı az: ${views}`);
assert.ok(nearCusp > 0, "ev sınırı vakası yok (kapsam)");
assert.ok(parts > 0, "eksik parça vakası yok (kapsam)");

// Yüksek enlem: fixture'da enlem > 60° vaka yoksa sentetik olarak (yalnız enlem çerçevesi + uyarı bayrağı) zorlanır.
{
  const base = cases.map((c) => deriveLocalNatalHouses(c.technical, "regiomontanus")).find((d) => d.ok);
  assert.ok(base && base.ok);
  const t = base.technical;
  const synth = { ...t, houseSource: { ...t.houseSource, warnings: ["high_latitude"], frame: { ...t.houseSource.frame, latitudeDeg: 69.6 } } };
  const v = buildTechniqueView({ technique: "western.natal", rows: [row(cases[0].technical)], combined: synth, options: { houseSystem: "regiomontanus" }, timeKnowledge: { primary: true, partner: null }, visibility: { visible: false, reason: "not_entitled" }, interpretations: null });
  assert.ok(v.warnings.some((w) => w.startsWith("Yüksek enlem (69.6° > 60°)")), "sunucu yüksek enlem metni aynen");
  assert.ok(deriveViewWarningCodes(v).includes("high_latitude"));
  const vc = { ...v, ...viewWithWarningCodes(v), warnings: v.warnings };
  assert.equal(newHighLat(vc), true);
  assert.equal(oldHighLat(v), true);
  assert.equal(newHighLat({ ...vc, warnings: v.warnings.map(toEn) }), true, "EN metinde rozet korunur");
  assert.equal(oldHighLat({ ...v, warnings: v.warnings.map(toEn) }), false, "eski yöntem EN metinde rozeti kaybederdi (kanıt)");
  highLat++;
}

// Natal dışı teknik: kod yok, natal parça uyarısı kuralı etkilenmez.
{
  assert.equal(newParts("western.transit", ["2 dönem parçası hesaplanamadı; takvim eksik olabilir."], ["missing_parts"]), false);
  assert.equal(oldParts("western.transit", ["2 dönem parçası hesaplanamadı; takvim eksik olabilir."]), false);
}

// Künye (ResultDesk): düz metin öğeleri eski regex'le BİREBİR; işaretli öğeler her dilde uyarı.
{
  const plainSamples = ["Tropikal", "Placidus", "Gerçek düğüm (true)", "Saat bilinmiyor · evler gizli", "Yüksek enlem · evler eşitsiz olabilir", "Ev sınırına yakın nokta var", "Evler: Yaşam Sistemi klasik ev hesabı · Gezegen konumları: hesaplama servisi", "Ev hesabı: Yaşam Sistemi klasik ev hesabı", "Sidereal"];
  const s = deskMetaSplit(plainSamples);
  assert.deepEqual(s.warn, plainSamples.filter((m) => OLD_META_WARN_RE.test(m)));
  assert.deepEqual(s.plain, plainSamples.filter((m) => !OLD_META_WARN_RE.test(m)));
  const marked = deskMetaSplit(["Tropical", { text: "Birth time unknown · houses hidden", warn: true }, null, { text: "High latitude · houses may be unequal", warn: true }, undefined, false]);
  assert.deepEqual(marked.warn, ["Birth time unknown · houses hidden", "High latitude · houses may be unequal"]);
  assert.deepEqual(marked.plain, ["Tropical"]);
  // TR: işaretli öğe metni aynı → eski regex de uyarı sayıyordu (sıra ve metin aynı).
  const trMarked = deskMetaSplit(["Tropikal", { text: "Saat bilinmiyor · evler gizli", warn: true }, { text: "Ev sınırına yakın nokta var", warn: true }]);
  const trOld = ["Tropikal", "Saat bilinmiyor · evler gizli", "Ev sınırına yakın nokta var"];
  assert.deepEqual(trMarked.warn, trOld.filter((m) => OLD_META_WARN_RE.test(m)));
  assert.deepEqual(trMarked.plain, trOld.filter((m) => !OLD_META_WARN_RE.test(m)));
}

// Yorum türü (InterpretationKind): kodlu karar = eski Türkçe tür adı (kaynaktaki eski fonksiyonun birebir kopyası).
let kindSchemas = 0;
{
  const TECH = new Set(["astro.kp.chart.interp.v1", "astro.kp.extra.interp.v1", "astro.vedic.shadbala.interp.v1", "astro.vedic.panchanga.interp.v1", "astro.vedic.varga.interp.v1", "astro.vedic.bhav_chalit.interp.v1", "astro.vedic.chara_karaka.interp.v1", "astro.vedic.arudha.interp.v1", "astro.vedic.bhava_bala.interp.v1"]);
  const oldKind = (schema: string) => {
    if (schema === "astro.western.forecast.interp.v1") return "Olay Açıklamaları";
    if (schema === "astro.western.profections.interp.v1") return "Sistem Yorumu";
    if (schema === "astro.western.extra_points.interp.v1") return "Sistem Yorumu";
    return TECH.has(schema) ? "Teknik Açıklama" : "Otomatik Yorum";
  };
  const found = execFileSync("git", ["grep", "-hoE", "astro[.][a-z_.]+[.]interp[.]v[0-9]+", "--", "lib", "app", "scripts"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  const schemas = [...new Set([...found, ...TECH, "", "bilinmeyen", "astro.western.natal.interp.v1"])];
  for (const sc of schemas) {
    assert.equal(interpretationKindOfSchema(sc), oldKind(sc), `tür: ${sc}`);
    assert.equal(interpretationKindTr(interpretationKindCodeOfSchema(sc)), oldKind(sc));
  }
  assert.equal(new Set(INTERPRETATION_KIND_CODES.map(interpretationKindTr)).size, 4);
  kindSchemas = schemas.length;
}

console.log(`✅ atlas-view-warning-codes: yorum türü ${kindSchemas} şema ÖNCE=SONRA · ${views} gerçek görünüm (200 vaka × 4 klasik sistem × saat × parça; türetilemeyen ${derivedFail}) · yüksek enlem ${highLat} · ev sınırı ${nearCusp} · eksik parça ${parts} · ÖNCE=SONRA (kodlu + eski kayıt) · EN metin simülasyonunda rozet korunuyor`);
