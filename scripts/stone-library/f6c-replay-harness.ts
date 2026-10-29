/**
 * Doğaltaş Kütüphanesi F6-C — yeniden oynatma ön denetimi + kaynak adresi sabitleme (SAF, DB YOK, AĞ YOK).
 * Sentetik geçici klasörle: SHA eşleşmesi / bozulmuş JSON / bozulmuş görsel / eksik dosya / taş sayısı; replayFetch eşlemesi.
 * İsteğe bağlı gerçek veri (salt-okunur): REAL_F2_DIR=… REAL_MANIFEST=… npx tsx scripts/stone-library/f6c-replay-harness.ts
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { replayFetch, replayPreflight } from "./replaySource";
import { buildCrystalsUrl, CRYSTALS_DEFAULT_BASE_URL, isOfficialCrystalsBaseUrl } from "../../lib/stone-library/import/roxyCrystalsClient";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""}`); }
}
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

function synth(n: number): { dir: string; manifest: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "sl-replay-"));
  mkdirSync(path.join(dir, "ham/roxy"), { recursive: true });
  mkdirSync(path.join(dir, "ham/gorseller/orig"), { recursive: true });
  const birimler: Record<string, unknown> = {};
  const imgs: unknown[] = [];
  for (let i = 1; i <= n; i++) {
    const id = `zz-tas-${i}`;
    const en = Buffer.from(JSON.stringify({ id, description: `ZZ EN ${i}` }));
    const tr = Buffer.from(JSON.stringify({ id, description: `ZZ TR ${i}` }));
    writeFileSync(path.join(dir, `ham/roxy/${id}.en.json`), en);
    writeFileSync(path.join(dir, `ham/roxy/${id}.tr.json`), tr);
    const jpg = Buffer.from(`ZZJPEG-${i}`);
    writeFileSync(path.join(dir, `ham/gorseller/orig/${id}.jpg`), jpg);
    imgs.push({ external_id: id, variant: "original", sha256: sha(jpg) }, { external_id: id, variant: "optimized", sha256: "0".repeat(64) });
    birimler[`${id}|description`] = { tas_id: id, kaynak_sha256: { en: sha(en), tr: sha(tr) } };
  }
  writeFileSync(path.join(dir, "ham/gorseller/manifest.json"), JSON.stringify(imgs));
  const manifest = path.join(dir, "paket.json");
  writeFileSync(manifest, JSON.stringify({ birimler }));
  return { dir, manifest };
}

async function main() {
  console.log("[1. Ön denetim — sentetik]");
  const s = synth(3);
  try {
    const p0 = replayPreflight(s.dir, s.manifest, 3);
    ok(p0.ok && p0.jsonShaOk === 6 && p0.imageShaOk === 3, "temiz paket: 6/6 JSON + 3/3 görsel SHA eşleşti", p0);
    ok(!replayPreflight(s.dir, s.manifest, 91).ok, "beklenen taş sayısı tutmazsa durur");
    writeFileSync(path.join(s.dir, "ham/roxy/zz-tas-2.tr.json"), JSON.stringify({ id: "zz-tas-2", description: "ZZ DEĞİŞTİRİLMİŞ" }));
    const p1 = replayPreflight(s.dir, s.manifest, 3);
    ok(!p1.ok && p1.problems.some((x) => x.includes("zz-tas-2.tr.json")), "tek JSON değişirse durur (değiştirilmiş açıklama aktarılamaz)", p1.problems);
    const s2 = synth(3);
    writeFileSync(path.join(s2.dir, "ham/gorseller/orig/zz-tas-3.jpg"), Buffer.from("ZZ-BASKA-GORSEL"));
    ok(!replayPreflight(s2.dir, s2.manifest, 3).ok, "tek görsel değişirse durur");
    rmSync(path.join(s2.dir, "ham/gorseller/orig/zz-tas-3.jpg"));
    ok(replayPreflight(s2.dir, s2.manifest, 3).problems.some((x) => x.startsWith("eksik görsel")), "eksik görsel durdurur");
    rmSync(s2.dir, { recursive: true, force: true });

    console.log("[2. replayFetch — yalnız dosya, ağ yok]");
    const s3 = synth(2);
    const c = { n: 0 };
    const rf = replayFetch(s3.dir, c);
    const det = await rf(buildCrystalsUrl({ baseUrl: CRYSTALS_DEFAULT_BASE_URL, apiKey: "k" }, "/crystals/zz-tas-1", { lang: "tr" })!, {});
    ok(det.status === 200 && (await det.json() as { description: string }).description === "ZZ TR 1", "ayrıntı yanıtı kayıttan birebir döner");
    const im = await rf("https://roxyapi.com/img/crystals/zz-tas-2.jpg", {});
    ok(im.status === 200 && Buffer.from(await im.arrayBuffer()).toString() === "ZZJPEG-2", "görsel baytları kayıttan birebir döner");
    ok((await rf(buildCrystalsUrl({ baseUrl: CRYSTALS_DEFAULT_BASE_URL, apiKey: "k" }, "/crystals/yok", { lang: "en" })!, {})).status === 404, "kayıtta olmayan istek 404 (uydurma yanıt yok)");
    ok(c.n === 3, "her istek sayıldı", c.n);
    rmSync(s3.dir, { recursive: true, force: true });
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }

  console.log("[3. Resmî taban adresi]");
  ok(isOfficialCrystalsBaseUrl(CRYSTALS_DEFAULT_BASE_URL) && isOfficialCrystalsBaseUrl(` ${CRYSTALS_DEFAULT_BASE_URL}/ `), "resmî adres kabul (boşluk / sondaki / yok sayılır)");
  ok(["http://roxyapi.com/api/v2", "https://roxyapi.com.evil.test/api/v2", "https://evil.test/api/v2", "https://roxyapi.com/api/v2/../x", ""].every((u) => !isOfficialCrystalsBaseUrl(u)),
    "yabancı / http / alt alan taklidi / yol eklenmiş / boş adres reddedilir");

  if (process.env.REAL_F2_DIR && process.env.REAL_MANIFEST) {
    console.log("[4. Gerçek veri ön denetimi (salt-okunur)]");
    const r = replayPreflight(process.env.REAL_F2_DIR, process.env.REAL_MANIFEST, 91);
    ok(r.ok && r.stones === 91 && r.jsonShaOk === 182 && r.imageShaOk === 91, "gerçek paket: 91 taş, 182/182 JSON + 91/91 görsel SHA eşleşti", { ...r, problems: r.problems.slice(0, 3) });
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
