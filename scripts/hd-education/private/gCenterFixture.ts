/**
 * Testler için G MERKEZİ TANIMLI sentetik eğitim snapshot'ı (ZZ test kişisi; gerçek kişi haritası DEĞİL).
 * `syntheticEducationSnapshot` ile aynı repo fixture'ı ve aynı GERÇEK doğrulama + normalizasyon zinciri; tek fark:
 * Tasarım Ay'ı 45 → 8 yapılır (Kişilik Jüpiter zaten 1) → 1-8 "Inspiration" kanalı (G–Boğaz) tanımlanır ve G merkezi
 * tanımlı olur. 45'in kanal eşi (21) haritada yok → başka kanal etkilenmez; tip / tanım / otorite değişmez.
 * Amaç: tek harfli "G" merkez adının kişisel alansız görünümde düşmesi gibi hataları yakalamak (FAZ 12 bulgusu).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { consistentRoxyResponse } from "../../hd-roxy/consistentFixture";
import { validateRoxyBodygraph } from "../../../lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph } from "../../../lib/human-design/providers/roxy/normalize";

type J = Record<string, unknown>;

export function gDefinedFixtureText(): string {
  const f = JSON.parse(readFileSync(path.join(process.cwd(), "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8")) as J;
  const gates = f.gates as J[];
  const moon = gates.find((g) => g.side === "design" && g.planet === "Moon");
  if (!moon || moon.gate !== 45) throw new Error("fixture beklenen yapıda değil (Tasarım Ay 45)");
  moon.gate = 8;
  moon.gateName = "Contribution";
  (f.channels as J[]).push({ gateA: 1, gateB: 8, name: "Inspiration", circuit: "Individual", centers: ["g", "throat"], description: "ZZ sentetik", circuitDescription: "ZZ sentetik" });
  const g = (f.centers as J[]).find((c) => c.id === "g");
  if (!g) throw new Error("fixture: G merkezi yok");
  g.defined = true;
  // 45 ve 8 ikisi de Boğaz kapısı: Boğaz merkezinin aktif kapı listesi de güncellenir (normalizer tutarlılık denetimi).
  const throat = (f.centers as J[]).find((c) => c.id === "throat");
  if (throat && Array.isArray(throat.gates)) throat.gates = (throat.gates as number[]).map((x) => (x === 45 ? 8 : x)).sort((a, b) => a - b);
  return JSON.stringify(f);
}

export function syntheticEducationSnapshotGDefined(utcIso: string, latitude: number, longitude: number, revision: number) {
  const d = new Date(utcIso);
  const p = (n: number) => String(n).padStart(2, "0");
  const body = {
    date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`,
    timezone: "UTC", latitude, longitude, nodeType: "true",
  };
  const raw = JSON.parse(consistentRoxyResponse(gDefinedFixtureText(), JSON.stringify(body))) as J;
  const v = validateRoxyBodygraph(raw);
  if (!v.ok) throw new Error(`G-tanımlı sentetik fixture doğrulanamadı: ${v.errors.join(", ")}`);
  const n = normalizeRoxyBodygraph(v.value, { ...body, lang: "tr", birthUtcIso: utcIso });
  if (!n.ok) throw new Error(`G-tanımlı sentetik fixture normalize edilemedi: ${n.errors.join(", ")}`);
  return {
    request_body: { ...body, lang: "tr" },
    request_hash: createHash("sha256").update(`zz-synthetic-g|${revision}|${JSON.stringify(body)}`).digest("hex"),
    provider: "roxyapi", endpoint: "/human-design/bodygraph", adapter_version: "roxy-bodygraph-1",
    engine_version: "roxyapi:roxy-bodygraph-1", contract_version: "roxy-1",
    computed_result: n.chart, provider_raw: raw,
    provider_raw_sha256: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
    design_instant_utc: v.value.designInstantUtc,
    time_check: { durum: "consistent", farkDakika: 0, yontem: "SENTETİK TEST (G tanımlı)" },
    boundary_flags: { saniyeGonderildi: d.getUTCSeconds() !== 0, saniyeIslemeDogrulandi: false, sentetik: true },
    calc_status: "OK",
  };
}
