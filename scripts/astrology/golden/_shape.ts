import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const dir = join(__dirname, "..", "fixtures", "golden");
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const { response } = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const m = new Map<string, Set<string>>();
  const walk = (v: unknown, p: string) => {
    if (Array.isArray(v)) { (m.get(p) ?? m.set(p, new Set()).get(p)!).add(`array(${v.length})`); v.forEach((x) => walk(x, p + "[]")); return; }
    if (v && typeof v === "object") { for (const [k, x] of Object.entries(v)) walk(x, p ? `${p}.${k}` : k); return; }
    const s = m.get(p) ?? m.set(p, new Set()).get(p)!;
    if (typeof v === "string") { s.add(v.length > 24 || /\s/.test(v) && v.length > 12 ? `str:${v.length}` : `"${v}"`); } else s.add(String(typeof v === "number" ? "num" : v));
  };
  walk(response, "");
  console.log(`\n### ${f}`);
  for (const [p, s] of m) { const vals = [...s]; console.log(`${p}  ${vals.length > 8 ? vals.slice(0, 8).join("|") + `|…(${vals.length})` : vals.join("|")}`); }
}
