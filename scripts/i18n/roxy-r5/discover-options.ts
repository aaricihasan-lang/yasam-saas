// R5 ROXY — ağsız keşif: plan seçenekleri ürün parseOptions fonksiyonundan geçiyor mu + birim/uç sayısı (ÇAĞRI YOK).
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { ATLAS_CASES, PARTNER, PERSONAS, PLACE_LONDON } from "./atlas-plan";

const now = new Date("2026-11-25T12:00:00Z");
let total = 0;
for (const c of ATLAS_CASES) {
  const def = getTechnique(c.technique)!;
  for (const p of c.core ? PERSONAS : PERSONAS.slice(0, 1)) {
    const o = def.parseOptions(c.raw, now);
    if (!o) {
      console.log(c.technique, p.id, "NULL OPTIONS");
      continue;
    }
    const opt = { ...o, ...(c.extra ?? {}) };
    let u: { endpoint: string }[] = [];
    try {
      u = def.units({ birth: p.birth, birthUtc: p.birthUtc, partner: c.partner ? PARTNER : null, places: c.places ? { target: PLACE_LONDON, reference: PLACE_LONDON } : {} }, opt);
    } catch (e) {
      console.log(c.technique, p.id, "UNITS THROW", String(e).slice(0, 100));
      continue;
    }
    if (c.maxUnits) u = u.slice(0, c.maxUnits);
    total += u.length;
    console.log(c.technique, p.id, u.length, u.map((x) => x.endpoint).join(","));
  }
}
console.log("toplam birim", total);
