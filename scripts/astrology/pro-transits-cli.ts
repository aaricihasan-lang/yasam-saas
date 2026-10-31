/**
 * GÖKYÜZÜ ATLASI — WT-04 İleri Transit motoru: YEREL inceleme aracı (ürün ekranı DEĞİL; ağ / sağlayıcı çağrısı YOK).
 * Sabah manuel kontrolü için olay listesini Türkçe tablo olarak yazar. Yalnız sentetik / elle girilen boylamlar kullanın.
 *
 * Örnek:
 *   npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-transits-cli.ts \
 *     --bas 2026-01-01 --bit 2026-12-31 --govde saturn,jupiter,mars --natal gunes=54.376,ay=210.5 \
 *     --aci conjunction,square,opposition --orb 1 --tz Europe/Istanbul [--dunyasal] [--istasyon] [--giris] [--json]
 */
import { scanTransits } from "@/lib/astrology/pro/transits/scan";
import { withLocalTimes } from "@/lib/astrology/pro/transits/display";
import { TRANSIT_BODIES, type AspectId, type ScanResult, type TransitBody } from "@/lib/astrology/pro/transits/model";
import { BODY_LABELS, SIGN_LABELS, ASPECT_LABELS } from "@/lib/astrology/labels/tr";
import type { AspectType, SignId } from "@/lib/astrology/model/western";

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (k: string) => args.includes(`--${k}`);
const bas = arg("bas") ?? "2026-01-01";
const bit = arg("bit") ?? "2026-12-31";
const govde = (arg("govde") ?? "saturn,jupiter,mars").split(",").filter(Boolean) as TransitBody[];
const natal = (arg("natal") ?? "")
  .split(",")
  .filter(Boolean)
  .map((s) => {
    const [id, lon] = s.split("=");
    return { id, lon: Number(lon) };
  });
const aci = (arg("aci") ?? "conjunction,sextile,square,trine,opposition").split(",").filter(Boolean) as AspectId[];
const orb = Number(arg("orb") ?? "1");
const tz = arg("tz") ?? "Europe/Istanbul";

const r = scanTransits({
  startUtcMs: Date.parse(`${bas}T00:00:00Z`),
  endUtcMs: Date.parse(`${bit}T23:59:59Z`),
  bodies: govde,
  natalPoints: natal,
  aspects: aci,
  defaultOrb: orb,
  include: { natal: natal.length > 0, mundane: flag("dunyasal"), stations: flag("istasyon"), ingresses: flag("giris") },
});
if ("error" in r) {
  console.error(`Geçersiz istek: ${r.error.code} — ${r.error.detail}`);
  process.exit(2);
}
const res = r as ScanResult;
if (flag("json")) {
  console.log(JSON.stringify(res, null, 1));
  process.exit(0);
}
const aspLabel = (a?: AspectId) => (a ? (ASPECT_LABELS[a as AspectType] ?? a) : "");
const body = (b: string) => ((TRANSIT_BODIES as readonly string[]).includes(b) ? BODY_LABELS[b as TransitBody] : `natal ${b}`);
const TYPE: Record<string, string> = { orb_enter: "Orb'a giriş", exact: "Kesin", orb_exit: "Orb'dan çıkış", closest_approach: "En yakın (kesinleşmeden)", station: "İstasyon", ingress: "Burç girişi" };
const unc = (s: number) => (!Number.isFinite(s) ? "belirsiz" : s < 120 ? `±${Math.round(s)} sn` : s < 7200 ? `±${Math.round(s / 60)} dk` : `±${(s / 3600).toFixed(1)} sa`);
console.log(`Tarama ${res.range.startUtc} – ${res.range.endUtc} · gösterim saat dilimi ${tz} · orb ${JSON.stringify(res.orbsUsed)} · yerel hesap (${res.source.ephemeris}), sağlayıcı çağrısı ${res.source.providerCalls}`);
console.log(`${res.events.length} olay · ${res.windows.length} orb penceresi · ${res.nearMisses.length} sınırda olası pencere · ${res.stats.ms} ms\n`);
for (const e of withLocalTimes(res.events, tz)) {
  let what = "";
  if (e.type === "station") what = `${body(e.body)} ${e.station === "retrograde" ? "geri" : "ileri"} istasyon`;
  else if (e.type === "ingress") what = `${body(e.body)} → ${SIGN_LABELS[e.toSign as SignId]}${e.retrograde ? " (geri)" : ""}`;
  else what = `${body(e.body)} ${aspLabel(e.aspect)} ${body(e.other!)}${e.type === "exact" ? ` · geçiş ${e.pass}/${e.of}${e.retrograde ? " (geri)" : ""}` : ""}${e.separationDeg !== undefined ? ` · ${e.separationDeg.toFixed(3)}°` : ""}`;
  console.log(`${e.local?.local} (${e.local?.offset})  ${TYPE[e.type].padEnd(24)} ${what}  [${unc(e.uncertaintySec)}]`);
}
for (const m of res.nearMisses) console.log(`UYARI sınırda: ${m.pair} ${aspLabel(m.aspect)} ${m.atUtc} — orb sınırına efemeris hatasından yakın (${m.separationDeg.toFixed(4)}°)`);
