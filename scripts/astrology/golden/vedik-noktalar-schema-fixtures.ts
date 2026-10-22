/**
 * Vedik noktalar (22.10.2026) — ŞEMA-ÖRNEĞİ fixture üreticisi. SAĞLAYICIYA ÇAĞRI YAPMAZ (ücretli çağrı izni yok: 0 çağrı).
 *
 * Çıktı: scripts/astrology/fixtures/schema/vedic-upagraha.json · vedic-heliacal.json (`"_kaynak": "openapi-schema-example"`).
 *   • Yapı: güncel OpenAPI 2.0.0 yanıt şeması (UpagrahaResponse / HeliacalResponse) — alan adları, türler, enum'lar, yuvarlama (örnekler 2 hane).
 *   • Değerler: GERÇEK SAĞLAYICI YANITI DEĞİLDİR. Sentetik kişi A (1990-07-15 14:30 İstanbul +3) için:
 *       – Güneş türevli upagrahalar: Vedik D1 GERÇEK golden'ındaki Güneş boylamından klasik formülle;
 *       – zaman tabanlı upagrahalar ve heliakal değerler: scripts/astrology/vedicNoktaRef.ts bağımsız yaklaşık hesabından.
 *     Bu yüzden harness bu dosyayı sağlayıcı doğrulaması olarak SUNMAZ; gerçek yanıt doğrulaması BLOKE (çağrı izni yok).
 *   • Gövdeler ürünün KENDİ üreticileriyle kurulur (vedicBirthBody / heliacalBody) → sahte arka uç birebir gövdeyle eşleştirir.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/vedik-noktalar-schema-fixtures.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { vedicBirthBody } from "@/lib/astrology/providers/roxy/requests";
import { heliacalBody } from "@/lib/astrology/providers/roxy/vedicNoktalar";
import { NAKSHATRAS } from "@/lib/astrology/model/vedic";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { SYNTH_A } from "./phase3-golden-calls";
import { HELIACAL_BODIES, heliacalDay, sunBasedUpagrahas, timeUpagrahas, type HeliacalGraha } from "../vedicNoktaRef";

const OUT = join(__dirname, "..", "fixtures", "schema");
const D1 = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "golden", "vedic-d1.json"), "utf8"));
const r2 = (x: number) => Math.round(x * 100) / 100;
const title = (s: string) => s.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const NAK = 360 / 27;
function pointOf(name: string, lon: number) {
  const L = r2(((lon % 360) + 360) % 360);
  const ni = Math.min(26, Math.floor(L / NAK));
  return {
    name,
    longitude: L,
    rashi: title(SIGN_IDS[Math.floor(L / 30) % 12]),
    degreeInSign: r2(L % 30),
    nakshatra: title(NAKSHATRAS[ni]),
    nakshatraIndex: ni + 1,
    nakshatraPada: Math.min(4, Math.floor((L % NAK) / (360 / 108)) + 1),
  };
}

function upagraha() {
  const body = vedicBirthBody(SYNTH_A, "lahiri");
  const ay = D1.response.frame.ayanamsaDegrees as number;
  const sun = D1.response.meta.Sun.longitude as number;
  const s = sunBasedUpagrahas(sun);
  const u = timeUpagrahas(new Date(SYNTH_A.utc), SYNTH_A.utcOffsetSeconds / 3600, SYNTH_A.latitude, SYNTH_A.longitude, ay);
  return {
    _kaynak: "openapi-schema-example",
    _not: "ŞEMA-ÖRNEĞİ — gerçek sağlayıcı yanıtı DEĞİL. Yapı OpenAPI 2.0.0 UpagrahaResponse. Güneş türevliler: Vedik D1 golden Güneş'i + klasik formül. Zaman tabanlılar: bağımsız yaklaşık hesap (vedicNoktaRef; Gulika = Satürn parçası başı, Mandi = ortası — sağlayıcının kuralı bilinmiyor). Gerçek yanıt doğrulaması BLOKE (çağrı izni yok).",
    endpoint: "/vedic-astrology/upagraha",
    body,
    response: {
      frame: { ayanamsa: "lahiri", ayanamsaDegrees: Math.round(ay * 1e4) / 1e4 },
      timeBased: [
        pointOf("Gulika", u.gulika.longitude),
        pointOf("Mandi", u.mandiMid.longitude),
        pointOf("Kala", u.kala.longitude),
        pointOf("Mrityu", u.mrityu.longitude),
        pointOf("Ardhaprahara", u.ardhaprahara.longitude),
        pointOf("Yamaghantaka", u.yamaghantaka.longitude),
      ],
      sunBased: [pointOf("Dhuma", s.dhuma), pointOf("Vyatipata", s.vyatipata), pointOf("Parivesha", s.parivesha), pointOf("Indra Chapa", s.indraChapa), pointOf("Upaketu", s.upaketu)],
    },
  };
}

function heliacal() {
  const date = SYNTH_A.birthDate;
  const off = 3;
  const place = { latitude: SYNTH_A.latitude, longitude: SYNTH_A.longitude };
  const body = heliacalBody(date, place, off);
  const mid = (d: string) => Date.parse(`${d}T00:00:00Z`) - off * 3600_000;
  const day = (base: number, k: number) => base + k * 86_400_000;
  const localIso = (d: Date) => new Date(d.getTime() + off * 3600_000).toISOString().slice(0, 19);
  const base = mid(date);
  const grahas = (Object.keys(HELIACAL_BODIES) as HeliacalGraha[]).map((g) => {
    const v = (ms: number) => heliacalDay(g, ms, place.latitude, place.longitude);
    const now = v(base);
    const evOf = (ms: number, type: "udaya" | "asta") => {
      const h = v(ms);
      return h.cross ? { type, horizon: h.horizon, datetime: localIso(h.cross), timeDegrees: r2(h.timeDegrees), kalamsa: h.kalamsa } : null;
    };
    let last = null;
    for (let k = 0; k < 420; k++) {
      if (v(day(base, -k - 1)).visible !== now.visible) {
        last = evOf(day(base, -k), now.visible ? "udaya" : "asta");
        break;
      }
    }
    let next = null;
    for (let k = 1; k <= 420; k++) {
      if (v(day(base, k)).visible !== now.visible) {
        next = evOf(day(base, k), now.visible ? "asta" : "udaya");
        break;
      }
    }
    return { graha: title(g), visible: now.visible, horizon: now.horizon, timeDegrees: r2(now.timeDegrees), kalamsa: now.kalamsa, retrograde: now.retrograde, longitudeSeparation: r2(now.longitudeSeparation), lastEvent: last, nextEvent: next };
  });
  return {
    _kaynak: "openapi-schema-example",
    _not: "ŞEMA-ÖRNEĞİ — gerçek sağlayıcı yanıtı DEĞİL. Yapı OpenAPI 2.0.0 HeliacalResponse; değerler bağımsız yaklaşık hesap (vedicNoktaRef: ufuk geçişleri arası yıldız-zamanı derecesi + Surya Siddhanta kalamsa). Gerçek yanıt doğrulaması BLOKE (çağrı izni yok).",
    endpoint: "/vedic-astrology/heliacal",
    body,
    response: { date, grahas },
  };
}

mkdirSync(OUT, { recursive: true });
for (const [name, f] of [
  ["vedic-upagraha", upagraha],
  ["vedic-heliacal", heliacal],
] as const) {
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(f(), null, 2) + "\n");
  console.log(`yazıldı: fixtures/schema/${name}.json`);
}
