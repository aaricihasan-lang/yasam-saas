/**
 * WT8 — saf yardımcı birim testleri (DB/ağ YOK).
 * Çalıştır: npx tsx scripts/wt8/unit.harness.ts
 */
import { findMatchRanges } from "../../lib/search/useSearchHighlight";
import { searchContextKey, markChecked, readCheckedIds, SEARCH_CHECKED_STORAGE_KEY } from "../../lib/search/searchChecked";
import * as legacy from "../../lib/dogaltas/searchChecked";
import {
  bioDetailHrefWithQuery,
  isBioSearchGuardState,
  readBioSearchCache,
  urlWithQuery,
  writeBioSearchCache,
  BIO_SEARCH_GUARD_MARK,
} from "../../lib/biyoenerji/searchSession";
import { computeBellPanelBox } from "../../components/notifications/NotificationBell";

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string, detail = "") {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"} ${name}${!cond && detail ? " → " + detail : ""}`);
}
function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}
const slices = (text: string, rs: [number, number][]) => rs.map(([a, b]) => text.slice(a, b));

// ── findMatchRanges (vurgu çekirdeği) ──
{
  const t = "Mide bölgesi. MİDE ekşimesi; mide yanması.";
  const r = findMatchRanges(t, ["mide"]);
  ok(r.length === 3, "3 geçiş → 3 aralık", JSON.stringify(slices(t, r)));
  ok(JSON.stringify(slices(t, r)) === JSON.stringify(["Mide", "MİDE", "mide"]), "büyük/küçük + Türkçe İ, orijinal metin korunur", JSON.stringify(slices(t, r)));
  ok(findMatchRanges("tek mide", ["MİDE"]).length === 1, "1 geçiş → 1 aralık (sorgu büyük harf)");
  ok(findMatchRanges("Çakra ve cakra", ["çakra"]).length === 2, "ç/c katlama (mevcut arama ile aynı)");
  ok(findMatchRanges("ışık ve ISIK", ["isik"]).length === 2, "ı/I/ş katlama");
  ok(findMatchRanges("mide", ["m"]).length === 0, "tek harf terim vurgulanmaz (min 2)");
  ok(findMatchRanges("", ["mide"]).length === 0 && findMatchRanges("mide", []).length === 0, "boş girdi güvenli");
  const ov = findMatchRanges("kalp çakrası", ["kalp", "kalp ç"]);
  ok(ov.length === 1 && ov[0][0] === 0, "çakışan terimler tek vurguda birleşir", JSON.stringify(ov));
  ok(findMatchRanges("Kalp, kalp; KALP", ["Kalp", "Kalp"]).length === 3, "tekrarlı terim çift saymaz");
}

// ── searchChecked: WT5 uyumu + scope ──
{
  const wt5 = searchContextKey({ query: "Ametist" });
  ok(wt5 === JSON.stringify({ q: "ametist", z: "", c: "", m: "", w: "" }), "scope yoksa anahtar WT5 ile BİREBİR aynı (mevcut işaretler korunur)", wt5);
  const st = mem();
  const a = searchContextKey({ scope: "minerals", query: "Demir" });
  const b = searchContextKey({ scope: "bio", query: "Demir" });
  ok(a !== b && a !== searchContextKey({ query: "Demir" }), "aynı terim farklı yüzeylerde ayrı bağlam");
  markChecked(st, a, "m1");
  ok(readCheckedIds(st, a).has("m1") && readCheckedIds(st, b).size === 0, "yüzeyler birbirinin işaretini görmez");
  ok(searchContextKey({ scope: "bio", query: "MİDE" }) === searchContextKey({ scope: "bio", query: "mide" }), "MİDE = mide bağlamı (tr küçük harf)");
  ok(searchContextKey({ scope: "bio", query: "" }) === "", "arama yoksa bağlam yok (etiket gösterilmez)");
  ok(legacy.SEARCH_CHECKED_STORAGE_KEY === SEARCH_CHECKED_STORAGE_KEY && legacy.markChecked === markChecked, "eski içe aktarma yolu (lib/dogaltas/searchChecked) aynı modül");
}

// ── Biyoenerji arama oturumu ──
{
  const st = mem();
  ok(readBioSearchCache(st) === null, "önbellek yok → null");
  writeBioSearchCache(st, { query: "mide", total: 2, scrollY: 640, sections: [{ key: "sembol-dili", label: "Sembol Dili", total: 2, hits: [] }] });
  const c = readBioSearchCache(st);
  ok(c?.query === "mide" && c.total === 2 && c.scrollY === 640 && c.sections.length === 1, "yaz/oku: terim + sonuçlar + kaydırma", JSON.stringify(c));
  writeBioSearchCache(st, null);
  ok(readBioSearchCache(st) === null, "temizle → geri yükleme yok");
  st.setItem("yasam-bio-global-search-v1", "{bozuk");
  ok(readBioSearchCache(st) === null, "bozuk önbellek güvenli");
  st.setItem("yasam-bio-global-search-v1", JSON.stringify({ v: 1, query: "x", sections: [{ bad: 1 }, { key: "k", label: "L", total: 1, hits: [] }], scrollY: -5 }));
  const s2 = readBioSearchCache(st);
  ok(s2?.sections.length === 1 && s2.scrollY === 0, "geçersiz bölüm/kaydırma ayıklanır", JSON.stringify(s2));
  ok(urlWithQuery("http://x/dashboard/biyoenerji", "mide") === "/dashboard/biyoenerji?q=mide", "URL'e q eklenir");
  ok(urlWithQuery("http://x/dashboard/biyoenerji?q=mide&a=1", "") === "/dashboard/biyoenerji?a=1", "q kaldırılır, diğer parametre korunur");
  ok(bioDetailHrefWithQuery("/dashboard/biyoenerji/sembol-dili/abc", "mide kasılması") === "/dashboard/biyoenerji/sembol-dili/abc?q=mide%20kas%C4%B1lmas%C4%B1", "detaya q taşınır (kodlanmış)");
  ok(bioDetailHrefWithQuery("/dashboard/biyoenerji/seanslar?q=ZZ", "mide") === "/dashboard/biyoenerji/seanslar?q=ZZ", "liste-arama bağlantısı (detay rotası yok) DEĞİŞMEZ");
  ok(isBioSearchGuardState({ [BIO_SEARCH_GUARD_MARK]: true, __NA: true }) && !isBioSearchGuardState({ __NA: true }) && !isBioSearchGuardState(null), "geçmiş işareti tanınır");
}

// ── Bildirim paneli konumu ──
{
  const vp = { width: 390, height: 844 };
  const p = computeBellPanelBox({ top: 4, bottom: 40, right: 380 }, vp);
  ok(p.left >= 12 && p.left + p.width <= vp.width - 12 + 0.01, "mobil: yatayda ekran içinde (12px kenar)", JSON.stringify(p));
  ok(p.top === 48 && p.maxHeight === Math.min(600, vp.height - 48 - 12), "mobil: zilin altında, yükseklik = kalan alan", JSON.stringify(p));
  const w = computeBellPanelBox({ top: 4, bottom: 40, right: 1250 }, { width: 1280, height: 900 });
  ok(w.width === 380 && Math.abs(w.left + w.width - 1250) < 0.01, "web: zile sağdan hizalı", JSON.stringify(w));
  const tiny = computeBellPanelBox({ top: 4, bottom: 40, right: 300 }, { width: 320, height: 400 });
  ok(tiny.width === 296 && tiny.left === 12 && tiny.top + tiny.maxHeight <= 400, "çok küçük ekran: taşma yok", JSON.stringify(tiny));
  const left = computeBellPanelBox({ top: 4, bottom: 40, right: 40 }, { width: 1280, height: 900 });
  ok(left.left === 12, "zil solda → panel sol kenara sıkıştırılır", JSON.stringify(left));
}

console.log(`\nWT8 unit: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
