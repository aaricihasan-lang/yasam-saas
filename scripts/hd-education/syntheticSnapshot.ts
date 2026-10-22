/**
 * Testler için SENTETİK eğitim snapshot'ı: repo fixture'ı (scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json) mevcut
 * GERÇEK doğrulama + normalizasyon zincirinden geçirilir (validateRoxyBodygraph → normalizeRoxyBodygraph) ve yalnız Design
 * anı verilen UTC'ye uyarlanır (consistentRoxyResponse). Sonuç bir ZZ test kişisine aittir; gerçek bir kişinin haritası
 * DEĞİLDİR ve gerçek sağlayıcı doğrulaması yerine geçmez. Ağ çağrısı YOK.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { consistentRoxyResponse } from "../hd-roxy/consistentFixture";
import { validateRoxyBodygraph } from "../../lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph } from "../../lib/human-design/providers/roxy/normalize";

export function syntheticEducationSnapshot(utcIso: string, latitude: number, longitude: number, revision: number) {
  const fixture = readFileSync(path.join(process.cwd(), "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8");
  const d = new Date(utcIso);
  const p = (n: number) => String(n).padStart(2, "0");
  const body = {
    date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`,
    timezone: "UTC", latitude, longitude, nodeType: "true",
  };
  const raw = JSON.parse(consistentRoxyResponse(fixture, JSON.stringify(body))) as Record<string, unknown>;
  const v = validateRoxyBodygraph(raw);
  if (!v.ok) throw new Error(`sentetik fixture doğrulanamadı: ${v.errors.join(", ")}`);
  const n = normalizeRoxyBodygraph(v.value, { ...body, lang: "tr", birthUtcIso: utcIso });
  if (!n.ok) throw new Error(`sentetik fixture normalize edilemedi: ${n.errors.join(", ")}`);
  return {
    request_body: { ...body, lang: "tr" },
    request_hash: createHash("sha256").update(`zz-synthetic|${revision}|${JSON.stringify(body)}`).digest("hex"),
    provider: "roxyapi", endpoint: "/human-design/bodygraph", adapter_version: "roxy-bodygraph-1",
    engine_version: "roxyapi:roxy-bodygraph-1", contract_version: "roxy-1",
    computed_result: n.chart, provider_raw: raw,
    provider_raw_sha256: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
    design_instant_utc: v.value.designInstantUtc,
    time_check: { durum: "consistent", farkDakika: 0, yontem: "SENTETİK TEST" },
    boundary_flags: { saniyeGonderildi: d.getUTCSeconds() !== 0, saniyeIslemeDogrulandi: false, sentetik: true },
    calc_status: "OK",
  };
}
