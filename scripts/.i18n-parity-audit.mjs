import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TR = "messages/tr";
const EN = "messages/en";

function leaves(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...leaves(v, p));
    else if (Array.isArray(v)) v.forEach((_, i) => out.push(`${p}[${i}]`));
    else out.push(p);
  }
  return out;
}

let totalMissing = 0, totalOrphan = 0, filesChecked = 0;
const trFiles = readdirSync(TR).filter((f) => f.endsWith(".json")).sort();

for (const f of trFiles) {
  filesChecked++;
  const tr = JSON.parse(readFileSync(join(TR, f), "utf8"));
  let en;
  try { en = JSON.parse(readFileSync(join(EN, f), "utf8")); }
  catch { console.log(`❌ ${f}: EN file missing/unparseable`); totalMissing++; continue; }
  const trSet = new Set(leaves(tr));
  const enSet = new Set(leaves(en));
  const missing = [...trSet].filter((k) => !enSet.has(k)); // in TR, not EN
  const orphan = [...enSet].filter((k) => !trSet.has(k));  // in EN, not TR
  totalMissing += missing.length;
  totalOrphan += orphan.length;
  if (missing.length || orphan.length) {
    console.log(`\n⚠️  ${f}  (TR ${trSet.size} / EN ${enSet.size})`);
    if (missing.length) console.log(`   MISSING in EN (${missing.length}): ${missing.slice(0, 30).join(", ")}${missing.length > 30 ? " …" : ""}`);
    if (orphan.length) console.log(`   ORPHAN in EN (${orphan.length}): ${orphan.slice(0, 30).join(", ")}${orphan.length > 30 ? " …" : ""}`);
  } else {
    console.log(`✅ ${f}  (${trSet.size} keys)`);
  }
}
console.log(`\n=== SUMMARY ===`);
console.log(`Files: ${filesChecked}  |  Missing-in-EN: ${totalMissing}  |  Orphan-in-EN: ${totalOrphan}`);
process.exit(totalMissing + totalOrphan === 0 ? 0 : 1);
