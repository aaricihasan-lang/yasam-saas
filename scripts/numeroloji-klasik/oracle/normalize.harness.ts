/**
 * Normalize harness'i:
 *   (1) ağsız sentetik güvenlik testleri (HTML/script temizliği, bilinmeyen alan atma, tip reddi, uzunluk sınırı);
 *   (2) QA klasöründeki TÜM 200 ham yanıtları normalize eder — hepsi ok olmalı (klasör yoksa bu kısım SKIP).
 *
 * Kullanım: npx tsx scripts/numeroloji-klasik/oracle/normalize.harness.ts
 */
import { cleanText, normalizeEndpointResponse, verifyWithOracle } from "../../../lib/numeroloji-klasik/normalize";
import type { ClassicEndpointId } from "../../../lib/numeroloji-klasik/endpoints";
import { liveDataPresent, loadRaw } from "./common";

let pass = 0;
let fail = 0;
function t(label: string, ok: boolean, detail?: string): void {
  if (ok) pass++;
  else fail++;
  if (!ok || process.argv.includes("--verbose")) console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

// ── (1) Sentetik
const meaning = { title: "Başlık", keywords: ["a"], description: "d", strengths: [], challenges: [], career: "c", relationships: "r", spirituality: "s" };
const core = { number: 5, calculation: "<script>alert(1)</script>C=3, E=5 → 8", type: "single", hasKarmicDebt: false, meaning, evil: "<img src=x onerror=1>" };
const n1 = normalizeEndpointResponse("expression", core);
t("sentetik çekirdek normalize ok", n1.ok);
if (n1.ok) {
  const s = JSON.stringify(n1.data);
  t("script etiketi + içeriği silindi", !/<script|alert\(/i.test(s), s.slice(0, 120));
  t("bilinmeyen alan (evil) atıldı", !s.includes("evil") && !s.includes("onerror"));
  t("hiçbir çıktı metninde < veya > yok", !/[<>]/.test(s));
}
t("tip hatası reddedilir (number metin)", !normalizeEndpointResponse("expression", { ...core, number: "5" }).ok);
t("geçersiz çekirdek sayı reddedilir (10)", !normalizeEndpointResponse("life_path", { ...core, number: 10 }).ok);
t("borç var ama sayı yok reddedilir", !normalizeEndpointResponse("life_path", { ...core, hasKarmicDebt: true }).ok);
t("sağlayıcı hata gövdesi ok:false", (() => {
  const r = normalizeEndpointResponse("chart", { error: "x", code: "validation_error", doc_url: "u" });
  return !r.ok && r.reason.includes("validation_error");
})());
t("dizi değil → ok:false (null)", !normalizeEndpointResponse("chart", null).ok);
t("bilinmeyen uç → ok:false", !normalizeEndpointResponse("nope" as ClassicEndpointId, {}).ok);
t("uzunluk sınırı uygulanır", cleanText("x".repeat(10_000), 100).length === 100);
t("javascript: şeması silinir", !cleanText("javascript:alert(1)", 100).includes("javascript"));
t("kontrol/yön karakterleri silinir", cleanText("a‮b\u0007c", 10) === "abc");
const cmp = normalizeEndpointResponse("compound_number", { number: 23, name: "Ad", nature: "fortunate", meaning: "m", root: 5, extra: 1 });
t("compound normalize + fazla alan atma", cmp.ok && !JSON.stringify(cmp.data).includes("extra"));
t("compound doğa enum dışı reddedilir", !normalizeEndpointResponse("compound_number", { number: 23, name: "Ad", nature: "lucky", meaning: "m", root: 5 }).ok);
t("compound 53 reddedilir", !normalizeEndpointResponse("compound_number", { number: 53, name: null, nature: "mixed", meaning: "m", root: 8 }).ok);
const biz = normalizeEndpointResponse("business_name", { name: "X", total: 4, compound: null, root: 4, planet: "p", rating: "great", favorableCompound: false, industries: [], guidance: "", calculation: "", summary: "" });
t("işletme puanı enum dışı reddedilir", !biz.ok);
const ver = verifyWithOracle("birth_day", { day: 29 }, n1.ok ? { ...(n1.data as object), number: { ...(n1.data as any).number, value: 11, type: "master" } } : {});
t("verifyWithOracle doğum günü 29 → 11 match", (ver as any)?.number?.verification?.status === "match", JSON.stringify((ver as any)?.number?.verification));
const ver2 = verifyWithOracle("birth_day", { day: 29 }, n1.ok ? n1.data : {});
t("verifyWithOracle yanlış değer → mismatch", (ver2 as any)?.number?.verification?.status === "mismatch");
t("verifyWithOracle girdiyi değiştirmez", n1.ok && (n1.data as any).number.verification.status === "unverified");

// ── (2) Canlı ham yanıtlar
if (!liveDataPresent()) {
  console.log("SKIP (canlı kısım) — LIVE DATA ABSENT");
} else {
  const recs = loadRaw().filter((r) => r.endpoint !== null && r.http === 200);
  const byEp = new Map<string, number>();
  for (const r of recs) {
    const n = normalizeEndpointResponse(r.endpoint!, r.response);
    t(`canlı ${r.id} normalize`, n.ok, n.ok ? undefined : n.reason);
    if (n.ok) {
      byEp.set(r.endpoint!, (byEp.get(r.endpoint!) ?? 0) + 1);
      const s = JSON.stringify(n.data);
      t(`canlı ${r.id} çıktıda < > yok`, !/[<>]/.test(s));
    }
  }
  const missing = (
    ["chart", "life_path", "expression", "soul_urge", "personality", "birth_day", "maturity", "bridge", "karmic_lessons", "karmic_debt", "personal_day", "personal_month", "personal_year", "compatibility", "meanings", "daily", "chaldean", "compound_number", "dual", "business_name"] as ClassicEndpointId[]
  ).filter((e) => !byEp.has(e));
  t("20 ucun tamamı canlı örnekle normalize edildi", missing.length === 0, missing.length ? `eksik: ${missing.join(",")}` : `uç=${byEp.size}, yanıt=${recs.length}`);
  console.log(`canlı: ${recs.length} yanıt, ${byEp.size} uç`);
}

console.log(`\nNORMALIZE: ✓ ${pass}  ✗ ${fail}`);
process.exit(fail ? 1 : 0);
