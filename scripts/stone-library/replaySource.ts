/**
 * Doğaltaş Kütüphanesi — kayıtlı sağlayıcı yanıtlarından YENİDEN OYNATMA (yalnız dosya okur; ağ YOK, kredi YOK).
 * f6-offline-import.ts (--confirm-replay) kullanır. Eşleme f3-real-data.ts / f6-real-data.ts ile aynıdır.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { CrystalsFetch } from "../../lib/stone-library/import/roxyCrystalsClient";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Kayıtlı yanıtlardan sağlayıcı taklidi. Yalnız resmî taban yolları eşlenir; kayıtta olmayan istek 404 döner. */
export function replayFetch(dir: string, counter: { n: number }): CrystalsFetch {
  return async (input: string) => {
    counter.n++;
    const u = new URL(input);
    const lang = u.searchParams.get("lang") ?? "x";
    const send = (file: string, type: string) => existsSync(file)
      ? new Response(readFileSync(file), { status: 200, headers: { "content-type": type } })
      : new Response(JSON.stringify({ error: "not in replay" }), { status: 404, headers: { "content-type": "application/json" } });
    const img = /^\/img\/crystals\/([a-z0-9-]+)\.jpg$/.exec(u.pathname);
    if (img) return send(path.join(dir, `ham/gorseller/orig/${img[1]}.jpg`), "image/jpeg");
    const p = u.pathname.replace(/^\/api\/v2/, "");
    const det = /^\/crystals\/([a-z0-9-]+)$/.exec(p);
    if (det && !["colors", "planets"].includes(det[1])) return send(path.join(dir, `ham/roxy/${det[1]}.${lang}.json`), "application/json");
    let ep = p;
    if (u.searchParams.get("limit")) ep += `_limit_${u.searchParams.get("limit")}${u.searchParams.get("offset") ? `_offset_${u.searchParams.get("offset")}` : ""}`;
    return send(path.join(dir, `ham/roxy/_${ep.replace(/[/]/g, "_")}.${lang}.200.json`), "application/json");
  };
}

export type ReplayPreflight = {
  ok: boolean; stones: number; jsonFiles: number; jsonShaOk: number; images: number; imageShaOk: number; problems: string[];
};

type Unit = { tas_id: string; kaynak_sha256: { en: string; tr: string } };
type ImageEntry = { external_id: string; variant: string; sha256: string };

/**
 * Aktarımdan ÖNCE: her taşın EN/TR ham yanıt dosyası paket (F4-T3) kaynak SHA-256'sı ile, her orijinal görsel
 * ham/gorseller/manifest.json SHA-256'sı ile aynı olmalı. Tek uyuşmazlık / eksik dosya → ok=false.
 */
export function replayPreflight(dir: string, manifestFile: string, expectedStones = 91): ReplayPreflight {
  const problems: string[] = [];
  const pkg = JSON.parse(readFileSync(manifestFile, "utf8")) as { birimler: Record<string, Unit> };
  const units = Object.values(pkg.birimler ?? {});
  const ids = [...new Set(units.map((u) => u.tas_id))].sort();
  let jsonShaOk = 0;
  for (const id of ids) for (const l of ["en", "tr"] as const) {
    const f = path.join(dir, `ham/roxy/${id}.${l}.json`);
    if (!existsSync(f)) { problems.push(`eksik: ${id}.${l}.json`); continue; }
    const s = sha(readFileSync(f));
    if (units.filter((u) => u.tas_id === id).every((u) => u.kaynak_sha256?.[l] === s)) jsonShaOk++;
    else problems.push(`SHA uyuşmazlığı: ${id}.${l}.json`);
  }
  const imgManifest = path.join(dir, "ham/gorseller/manifest.json");
  const originals = existsSync(imgManifest)
    ? (JSON.parse(readFileSync(imgManifest, "utf8")) as ImageEntry[]).filter((x) => x.variant === "original")
    : [];
  if (!originals.length) problems.push("görsel manifesti yok / boş");
  let imageShaOk = 0;
  for (const x of originals) {
    const f = path.join(dir, `ham/gorseller/orig/${x.external_id}.jpg`);
    if (!existsSync(f)) { problems.push(`eksik görsel: ${x.external_id}.jpg`); continue; }
    if (sha(readFileSync(f)) === x.sha256) imageShaOk++;
    else problems.push(`görsel SHA uyuşmazlığı: ${x.external_id}.jpg`);
  }
  const missingImg = ids.filter((id) => !originals.some((x) => x.external_id === id));
  if (missingImg.length) problems.push(`görsel manifestinde olmayan taş: ${missingImg.length}`);
  if (ids.length !== expectedStones) problems.push(`taş sayısı ${ids.length} (beklenen ${expectedStones})`);
  return {
    ok: problems.length === 0 && jsonShaOk === ids.length * 2 && imageShaOk === originals.length,
    stones: ids.length, jsonFiles: ids.length * 2, jsonShaOk, images: originals.length, imageShaOk, problems: problems.slice(0, 20),
  };
}
