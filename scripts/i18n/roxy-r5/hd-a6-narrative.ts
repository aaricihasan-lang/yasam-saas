/**
 * R5 ROXY — HD A6 (lib/human-design/narrative, #854) planındaki ağsız adım 2: tüm kayıtlı gerçek TR/EN bodygraph çiftleri için
 * validateRoxyBodygraph → normalizeRoxyBodygraph(lang) → hdCanonicalSha(tr) === hdCanonicalSha(en). 0 ücretli çağrı.
 * #854 dalının dışa aktarılmış ağacında koşar (F1'de narrative modülü yok → dinamik içe aktarım).
 */
import fs from "node:fs";
import path from "node:path";
import { validateRoxyBodygraph } from "@/lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph } from "@/lib/human-design/providers/roxy/normalize";
import { localDateTimeToUtc } from "@/lib/human-design/engine/time";

const HAM = path.join(process.env.R5_KANIT_DIR ?? "C:/YasamSistemi-Kanit/I18N-F1-R5-2026-11-25", "roxy", "ham", "hd");
const P: Record<string, [string, string, string, number, number]> = {
  p1: ["1990-04-01", "14:30", "Europe/Istanbul", 41.0082, 28.9784],
  p2: ["1985-12-21", "03:15", "Europe/Oslo", 69.6492, 18.9553],
  p3: ["2000-02-29", "23:50", "Australia/Sydney", -33.8688, 151.2093],
  hm: ["1962-10-05", "00:00", "Europe/Istanbul", 38.4192, 27.1287],
  hp: ["1960-08-19", "21:15", "Europe/Istanbul", 38.4192, 27.1287],
  hr: ["1964-03-20", "20:00", "Europe/Istanbul", 38.4192, 27.1287],
  fix: ["2018-07-20", "16:00", "UTC", 37.871399, 32.484699],
};

async function main() {
  const modPath = "@/lib/human-design/narrative/narrativeConsistency";
  const m = (await import(modPath)) as { hdCanonicalSha: (c: unknown) => string; compareCanonical: (a: unknown, b: unknown) => { ok: boolean; fields?: string[] } };
  let pass = 0, fail = 0;
  const out: Record<string, unknown> = {};
  for (const [id, [date, time, tz, lat, lon]] of Object.entries(P)) {
    const utc = localDateTimeToUtc({ date, time, timezone: tz, location: { latitude: lat, longitude: lon } } as never).toISOString();
    const norm = (lang: string) => {
      const raw = JSON.parse(fs.readFileSync(path.join(HAM, `bodygraph-${id}-${lang}.json`), "utf8")).response;
      const v = validateRoxyBodygraph(raw);
      if (!v.ok) return null;
      const n = normalizeRoxyBodygraph(v.value, { date, time: `${time}:00`, timezone: tz, latitude: lat, longitude: lon, nodeType: "true", lang, birthUtcIso: utc });
      return n.ok ? n.chart : null;
    };
    const a = norm("tr"), b = norm("en");
    const ok = !!a && !!b && m.hdCanonicalSha(a) === m.hdCanonicalSha(b) && m.compareCanonical(a, b).ok;
    ok ? pass++ : fail++;
    out[id] = { ok, sha: a ? m.hdCanonicalSha(a).slice(0, 12) : null };
    console.log(`${ok ? "PASS" : "FAIL"} ${id} hdCanonicalSha TR = EN ${a ? m.hdCanonicalSha(a).slice(0, 12) : "-"}`);
  }
  fs.writeFileSync(path.join(path.dirname(HAM), "..", "hd-a6-narrative-sonuc.json"), JSON.stringify({ zaman: new Date().toISOString(), pass, fail, out }, null, 1));
  console.log(`=== HD A6 kanonik SHA (gerçek TR/EN): ${pass} PASS / ${fail} FAIL ===`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
