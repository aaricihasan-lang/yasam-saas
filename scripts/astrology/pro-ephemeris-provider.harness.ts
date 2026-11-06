/**
 * GÖKYÜZÜ ATLASI — WT-03 PROFESYONEL EFEMERİS: GERÇEK sağlayıcı yanıtları (2026-10-31, merkezi defterle alınmış 160 çağrı) ürün kod
 * yolundan (projectProviderPlanets → buildEphemeris sağlayıcı satırı) geçirilir ve DE440 referansıyla karşılaştırılır. Ücretli çağrı
 * YAPMAZ: yanıtlar QA kanıt klasöründen okunur (depoya toplu sağlayıcı verisi konmaz). Klasör yoksa test "SKIP" yazar (PASS sayılmaz).
 * @pro-run-all yerel-kanit  (CI'da kanıt yok → pro-run-all bu dosyayı "YEREL-KANIT" olarak ayrı listeler; yerelde normal çalışır)
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-ephemeris-provider.harness.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eraOf, PROVIDER_LIMITS, type EraBand } from "@/lib/astrology/pro/ephemeris/accuracy";
import { wrap180 } from "@/lib/astrology/pro/ephemeris/local";
import { buildEphemeris, parseEphemerisRequest } from "@/lib/astrology/pro/ephemeris/table";
import { PLANET_BODIES, type PlanetBody } from "@/lib/astrology/pro/ephemeris/types";

const QA = "C:/YasamSistemi-QA/ASTRO-GECE-4-MOTOR-2026-10-31/kanit/wt03";
const FX = join(process.cwd(), "scripts/astrology/fixtures/pro-ephemeris");
let pass = 0;
let fail = 0;
let skip = 0;
const as = (d: number) => Math.abs(d) * 3600;

async function main() {
  if (!existsSync(join(QA, "roxy-faz2.json"))) {
    skip++;
    console.log("SKIP gerçek sağlayıcı yanıtları bulunamadı (QA kanıt klasörü yok)");
    return;
  }
  type Call = { body: { date: string; nodeType: "true" | "mean" }; ok: boolean; raw: unknown };
  const calls = [...(JSON.parse(readFileSync(join(QA, "roxy-faz1.json"), "utf8")) as Call[]).slice(2), ...(JSON.parse(readFileSync(join(QA, "roxy-faz2.json"), "utf8")) as Call[])];
  const REF = JSON.parse(readFileSync(join(FX, "de440-ref.json"), "utf8")) as { rows: { date: string; at: string; b: Record<string, unknown> }[] };
  const ref = new Map(REF.rows.filter((r) => r.at === "00:00").map((r) => [r.date, r.b]));
  const worst: Record<string, { lon: number; lat: number; radec: number; n: number }> = {};
  const viol: string[] = [];
  let used = 0;
  for (const c of calls) {
    const b = ref.get(c.body.date);
    if (!c.ok || !b) continue;
    const req = parseEphemerisRequest({ view: "day", date: c.body.date, source: "provider", nodeType: c.body.nodeType, bodies: [...PLANET_BODIES, c.body.nodeType === "true" ? "true_node" : "mean_node"] });
    assert.ok(req.ok);
    const r = await buildEphemeris(req.value, { fetchDay: async () => c.raw });
    if (!r.ok) {
      viol.push(`${c.body.date} ${c.body.nodeType} izdüşüm hatası: ${r.error.error}`);
      continue;
    }
    used++;
    const era: EraBand = eraOf(+c.body.date.slice(0, 4));
    for (const p of r.result.rows[0].positions) {
      const lim = PROVIDER_LIMITS[era][p.body]!;
      const k = `${era} ${p.body}`;
      const w = (worst[k] ??= { lon: 0, lat: 0, radec: 0, n: 0 });
      w.n++;
      if (p.body === "true_node" || p.body === "mean_node") {
        const target = p.body === "true_node" ? (b.true_node_de440 as number) : (b.mean_node_se as number);
        const d = as(wrap180(p.lon - target));
        w.lon = Math.max(w.lon, d);
        if (d > lim.lon) viol.push(`${c.body.date} ${p.body} ${d.toFixed(2)}″`);
        continue;
      }
      if (!(PLANET_BODIES as readonly string[]).includes(p.body)) continue;
      const [lon, lat, ra, dec] = b[p.body as PlanetBody] as number[];
      const dl = as(wrap180(p.lon - lon));
      const db = as(p.lat! - lat);
      const dr = Math.max(as(wrap180(p.ra! - ra) * Math.cos((dec * Math.PI) / 180)), as(p.dec! - dec));
      w.lon = Math.max(w.lon, dl);
      w.lat = Math.max(w.lat, db);
      w.radec = Math.max(w.radec, dr);
      if (dl > lim.lon || db > lim.lat || dr > Math.max(lim.lon, lim.lat) + 0.1) viol.push(`${c.body.date} ${p.body} ${dl.toFixed(2)}/${db.toFixed(2)}/${dr.toFixed(2)}`);
    }
  }
  for (const [k, w] of Object.entries(worst).sort()) console.log(`  ÖLÇÜ sağlayıcı ${k} n=${w.n} boylam ${w.lon.toFixed(3)}″ enlem ${w.lat.toFixed(3)}″ RA/dek(türetilmiş) ${w.radec.toFixed(3)}″`);
  console.log(`  ÖLÇÜ kullanılan gerçek yanıt ${used}`);
  try {
    assert.deepEqual(viol, []);
    assert.ok(used >= 140);
    pass++;
    console.log("PASS gerçek sağlayıcı yanıtları (ürün kod yolu) ↔ DE440: boylam/enlem/türetilmiş RA-dek PROVIDER_LIMITS içinde");
  } catch (e) {
    fail++;
    process.stderr.write(`FAIL gerçek sağlayıcı ↔ DE440\n  ${(e as Error).message}\n`);
  }
}

main().then(() => {
  console.log(`\nSONUÇ pro-ephemeris-provider: ${pass} PASS / ${fail} FAIL / ${skip} SKIP`);
  if (fail) process.exit(1);
});
