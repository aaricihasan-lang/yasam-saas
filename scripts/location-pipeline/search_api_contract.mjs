#!/usr/bin/env node
/**
 * scripts/location-pipeline/search_api_contract.mjs
 * FAZ 5 / P5f-2 — Global konum arama API contract harness'i.
 *
 * GET /api/location/search sözleşmesini çalışan bir Next server'a karşı doğrular.
 * Motor/UI/DB'ye DOKUNMAZ. PASS → exit 0, FAIL → exit 1.
 *
 * Çalıştır:  P5F2_BASE=http://localhost:3113 node scripts/location-pipeline/search_api_contract.mjs
 * (BASE verilmezse http://localhost:3113 varsayılır.)
 */
const BASE = process.env.P5F2_BASE || "http://localhost:3113";
const URL = (q, extra = "") => `${BASE}/api/location/search?q=${encodeURIComponent(q)}${extra}`;

let fail = 0;
const ok = (name, cond, extra = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!cond) fail++;
};
const get = async (q, extra = "") => {
  const res = await fetch(URL(q, extra));
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
};
const hasCity = (results, name, cc) =>
  results.some(r => r.name.toLowerCase() === name.toLowerCase() && r.countryCode === cc);
const anyTz = (results, tz) => results.some(r => r.tz === tz);

async function main() {
  console.log(`═══ FAZ 5 / P5f-2 — Search API Contract (${BASE}) ═══`);

  // 1) min-length: tek karakter → boş results
  {
    const { json } = await get("L");
    ok("q tek karakter → boş results", json.ok === true && Array.isArray(json.results) && json.results.length === 0, `len=${json.results?.length}`);
  }

  // 2) response shape
  {
    const { json } = await get("Berlin");
    const shapeOk = json.ok === true && Array.isArray(json.results) && typeof json.query === "string";
    ok("response shape { ok, results, query }", shapeOk);
    const r = json.results?.[0];
    const fieldsOk = r && ["id", "name", "country", "countryCode", "adminRegion", "lat", "lon", "elev", "tz", "source", "verified", "origin"]
      .every(k => k in r);
    ok("sonuç Location alanlarını içeriyor", !!fieldsOk, r ? Object.keys(r).join(",") : "sonuç yok");
  }

  // 3) London → sonuç var
  {
    const { json } = await get("London");
    ok("London → sonuç var", json.results?.length > 0, `${json.results?.length}`);
  }

  // 4) Berlin → Europe/Berlin
  {
    const { json } = await get("Berlin");
    ok("Berlin → Europe/Berlin", hasCity(json.results, "Berlin", "DE") && anyTz(json.results, "Europe/Berlin"));
  }

  // 5) Tokyo → Asia/Tokyo
  {
    const { json } = await get("Tokyo");
    ok("Tokyo → Asia/Tokyo", hasCity(json.results, "Tokyo", "JP") && anyTz(json.results, "Asia/Tokyo"));
  }

  // 6) Sydney → Australia/Sydney
  {
    const { json } = await get("Sydney");
    ok("Sydney → Australia/Sydney", hasCity(json.results, "Sydney", "AU") && anyTz(json.results, "Australia/Sydney"));
  }

  // 7) Paris → France + United States ayrışması
  {
    const { json } = await get("Paris");
    const fr = json.results.some(r => r.name === "Paris" && r.countryCode === "FR");
    const us = json.results.some(r => r.name === "Paris" && r.countryCode === "US");
    ok("Paris → FR + US ayrışması", fr && us, `FR=${fr} US=${us}`);
  }

  // 8) New York → America/New_York (GeoNames adı "New York City")
  {
    const { json } = await get("New York");
    const ny = json.results.some(r => /new york/i.test(r.name) && r.countryCode === "US" && r.tz === "America/New_York");
    ok("New York → America/New_York (US)", ny, json.results.map(r => `${r.name}/${r.countryCode}`).slice(0, 3).join(", "));
  }

  // 9) Türkiye sonucu DÖNMEMELİ (dataset TR-hariç)
  for (const q of ["Ankara", "Istanbul", "İstanbul", "Van", "Yüksekova", "Çatak"]) {
    const { json } = await get(q, "&limit=10");
    const trHit = (json.results || []).filter(r => r.countryCode === "TR");
    ok(`TR sonucu yok: "${q}"`, trHit.length === 0, `TR=${trHit.length}, toplam=${json.results?.length}`);
  }

  // 10) limit cap
  {
    const { json } = await get("san", "&limit=50");
    ok("limit cap ≤ 10 (limit=50 istendi)", json.results.length <= 10, `${json.results.length}`);
  }
  {
    const { json } = await get("san", "&limit=3");
    ok("limit=3 → ≤ 3", json.results.length <= 3, `${json.results.length}`);
  }

  // 11) hata durumunda güvenli JSON (ham stack yok) — geçersiz limit vs. yine ok döner
  {
    const { json } = await get("Berlin", "&limit=abc");
    ok("geçersiz limit → default ile ok", json.ok === true && Array.isArray(json.results));
  }

  console.log(fail === 0
    ? "\nSONUÇ: ✅ PASS — API contract doğrulandı (exit 0)"
    : `\nSONUÇ: ❌ FAIL — ${fail} kontrol başarısız (exit 1)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error("HARNESS HATASI:", e.message); process.exit(1); });
