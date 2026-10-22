/**
 * real-compute / snapshot-io SAĞLAMLIK TESTİ — tamamen SENTETİK (repo fixture'ı, --mock-provider), gerçek çağrı YOK.
 * Her senaryo çalıştırıcıyı AYRI süreçte, YENİ geçici paket klasöründe (repo dışı) koşturur; sonucu özet JSON + dosyalardan doğrular.
 * Ölçüt: hiçbir hata/çökme/bozulma senaryosunda aynı kişi için İKİNCİ "ücretli" (mock sayaçlı) çağrı oluşmaz.
 * Gereken: kişi içe aktarım SQL'i + yerel anahtar SQL'i (repo DIŞI).  Kullanım:
 *   npx tsx scripts/hd-education/real/real-tools-harness.ts --import <sql> --local-key <sql> --owner <uuid> --keys k1,k2 --tmp <repo-dışı boş klasör>
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : ""; };
const IMPORT = arg("--import"), LOCALKEY = arg("--local-key"), OWNER = arg("--owner"), TMP = path.resolve(arg("--tmp"));
const [K1, K2] = arg("--keys").split(",");
if (!IMPORT || !LOCALKEY || !OWNER || !K1 || !K2 || !arg("--tmp")) throw new Error("--import --local-key --owner --keys k1,k2 --tmp zorunlu");
if (existsSync(TMP) && readdirSync(TMP).length) throw new Error("--tmp boş olmalı");
mkdirSync(TMP, { recursive: true });
let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: boolean, l: string, x?: unknown) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; fails.push(l); console.error(`  ✗ ${l}${x !== undefined ? ` → ${JSON.stringify(x).slice(0, 400)}` : ""}`); } };
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
let port = Number(process.env.HD_EDU_TOOLS_BASE_PORT ?? 54581);   // dolu port aralığından kaçınmak için ayarlanabilir
type Sum = { providerCalls: number; locked: Array<[string, string]>; integrityErrors: string[]; items: Array<Record<string, unknown>> };
function run(pkg: string, keys: string[], extra: string[] = [], fault = ""): { code: number | null; out: string; sum: Sum | null } {
  const before = new Set(existsSync(pkg) ? readdirSync(pkg) : []);
  const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "scripts/hd-education/real/real-compute.ts", "--import", IMPORT, "--local-key", LOCALKEY, "--owner", OWNER, "--pkg", pkg, "--keys", keys.join(","), "--mock-provider", ...extra],
    { cwd: process.cwd(), shell: process.platform === "win32", encoding: "utf8", env: { ...process.env, HD_EDU_REAL_FAULT: fault, HD_EDU_REAL_PG_PORT: String(port++), ROXY_API_KEY: "" }, timeout: 300_000 });
  const added = existsSync(pkg) ? readdirSync(pkg).filter((f) => !before.has(f) && /^run-.*\.summary\.json$/.test(f)) : [];
  const sum = added.length ? (JSON.parse(readFileSync(path.join(pkg, added[0]), "utf8")) as Sum) : null;
  if (!sum && fault === "") console.log(`    (özet yok · çıkış ${r.status} ${r.signal ?? ""} · ${`${r.stdout}\n${r.stderr}`.trim().split("\n").slice(-4).join(" | ").slice(0, 600)})`);
  return { code: r.status, out: `${r.stdout}\n${r.stderr}`, sum };
}
const items = (s: Sum | null, key: string) => (s?.items ?? []).filter((i) => i.key === key);
const manifest = (pkg: string) => (existsSync(path.join(pkg, "manifest.jsonl")) ? readFileSync(path.join(pkg, "manifest.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { file: string; sha256: string; natural_key: string }) : []);

section("S0 · temel: hesap → paket (v2) → ikinci çalıştırmada geri yükleme + yeniden kullanım");
const base = path.join(TMP, "base");
{
  const a = run(base, [K1, K2]);
  ok(a.code === 0 && a.sum?.providerCalls === 2 && manifest(base).length === 2, "iki kişi hesaplandı, 2 (mock) çağrı, manifest 2", { code: a.code, calls: a.sum?.providerCalls });
  const m = manifest(base)[0];
  const pkg = JSON.parse(readFileSync(path.join(base, "snapshots", m.file), "utf8")) as Record<string, unknown>;
  ok(pkg.format === "hd-edu-snapshot-2" && pkg.product_raw_sha256_verified === true && pkg.jsonb_roundtrip_canonical_equal === true && typeof pkg.provider_body_text === "string", "v2 paket: gövde + ürün SHA doğrulandı + jsonb kanonik gidiş-dönüş eşit");
  ok(readdirSync(path.join(base, "raw")).length === 2 && readdirSync(path.join(base, "raw")).every((f) => /\.http200\.body$/.test(f)), "gövde bayt olarak raw/ altında (parse öncesi)");
  const b = run(base, [K1, K2]);
  ok(b.sum?.providerCalls === 0 && items(b.sum, K1)[0]?.reused === true && items(b.sum, K2)[0]?.reused === true, "S5/S6 aynı kişiler tekrar: geri yükleme → yeniden kullanım, çağrı 0", b.sum?.items);
}

section("S1 · yanıt geldi, kayıt tamamlanmadan kesildi (crash-after-raw) → kurtarma ücretsiz");
{
  const p = path.join(TMP, "s1");
  const a = run(p, [K1], [], "crash-after-raw");
  ok(a.code === 9 && readdirSync(path.join(p, "raw")).length === 1 && manifest(p).length === 0, "kesinti: gövde diskte, manifest yok", { code: a.code });
  ok(!existsSync(path.join(p, ".runner.lock")), "kesintide süreç kilidi bırakıldı");
  const b = run(p, [K1]);
  ok(b.sum?.providerCalls === 0 && String(items(b.sum, K1)[0]?.result ?? "").startsWith("LOCKED:"), "normal çalıştırma: kişi KİLİTLİ (yetim gövde/açık deneme) → çağrı 0", b.sum?.items);
  const c = run(p, [K1], ["--recover-from-raw"]);
  ok(c.sum?.providerCalls === 0 && items(c.sum, K1)[0]?.result === "RECOVERED" && manifest(p).length === 1, "--recover-from-raw: ağ yok, ücret yok, snapshot + manifest oluştu", c.sum?.items);
  const d = run(p, [K1]);
  ok(d.sum?.providerCalls === 0 && items(d.sum, K1)[0]?.reused === true, "kurtarma sonrası: yeniden kullanım, çağrı 0");
}

section("S2/S4 · snapshot dosyası yazıldı, manifest yazılamadı");
{
  const p = path.join(TMP, "s2");
  const a = run(p, [K1], [], "crash-after-snapshot-file");
  ok(a.code === 9 && readdirSync(path.join(p, "snapshots")).length === 1 && manifest(p).length === 0, "kesinti: dosya var, manifest yok");
  const b = run(p, [K1]);
  ok(b.sum?.providerCalls === 0 && (b.sum?.integrityErrors ?? []).some((e) => /manifest YOK/.test(e)) && String(items(b.sum, K1)[0]?.result).startsWith("LOCKED:"), "bütünlük hatası raporlandı, kişi KİLİTLİ, çağrı 0", b.sum);
}

section("S3 · manifest var, dosya eksik");
{
  const p = path.join(TMP, "s3"); cpSync(base, p, { recursive: true });
  unlinkSync(path.join(p, "snapshots", manifest(p)[0].file));
  const k = manifest(p)[0].natural_key;
  const b = run(p, [k]);
  ok(b.sum?.providerCalls === 0 && String(items(b.sum, k)[0]?.result).includes("MANIFEST_FILE_MISSING"), "kişi KİLİTLİ (MANIFEST_FILE_MISSING), çağrı 0", b.sum?.items);
}

section("S7 · ikinci kopyadan geri yükleme");
{
  const p = path.join(TMP, "s7-kopya"); cpSync(base, p, { recursive: true });
  const b = run(p, [K1, K2]);
  ok(b.sum?.providerCalls === 0 && (b.sum?.items ?? []).filter((i) => i.result === "RESTORED").length === 2 && items(b.sum, K1)[0]?.reused === true, "kopyadan 2/2 RESTORED, yeniden kullanım, çağrı 0");
}

section("S8 · bozuk / değiştirilmiş hash");
{
  const p = path.join(TMP, "s8"); cpSync(base, p, { recursive: true });
  const m = manifest(p)[0]; const f = path.join(p, "snapshots", m.file);
  writeFileSync(f, readFileSync(f, "utf8").replace('"calc_status": "OK"', '"calc_status": "OK" '));
  const b = run(p, [m.natural_key]);
  ok(b.sum?.providerCalls === 0 && String(items(b.sum, m.natural_key)[0]?.result).includes("FILE_SHA"), "SHA uyuşmazlığı → KİLİTLİ, çağrı 0");
}

const tamper = (dir: string, fn: (pkg: Record<string, unknown>) => void) => {
  const p = path.join(TMP, dir); cpSync(base, p, { recursive: true });
  const m = manifest(p)[0]; const f = path.join(p, "snapshots", m.file);
  const pkg = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>; fn(pkg);
  const txt = JSON.stringify(pkg, null, 2); writeFileSync(f, txt);
  // manifesti de yeni SHA ile yeniden yaz (dosya SHA geçsin; içerik denetimi yakalamalı)
  const rows = manifest(p).map((r) => (r.file === m.file ? { ...r, sha256: sha(txt) } : r));
  writeFileSync(path.join(p, "manifest.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return { p, key: m.natural_key };
};
section("S9 · yanlış kişi kimliği (paket başka kişiye ait)");
{
  const t = tamper("s9", (pkg) => { (pkg.chart as Record<string, unknown>).subject_id = "00000000-0000-4000-8000-000000000000"; });
  const b = run(t.p, [t.key]);
  ok(b.sum?.providerCalls === 0 && String(items(b.sum, t.key)[0]?.result).includes("REJECTED"), "geri yükleme REDDEDİLDİ, kişi kilitli, çağrı 0", b.sum?.items);
}
section("S10 · kaynak revizyonu / kanıt farklı");
{
  const t = tamper("s10", (pkg) => { (pkg.subject as Record<string, unknown>).evidence_fingerprint = "f".repeat(64); });
  const b = run(t.p, [t.key]);
  ok(b.sum?.providerCalls === 0 && String(items(b.sum, t.key)[0]?.result).includes("EVIDENCE_CHANGED"), "EVIDENCE_CHANGED → kilitli, çağrı 0", b.sum?.items);
  const t2 = tamper("s10b", (pkg) => { (pkg.chart as Record<string, unknown>).subject_revision = 2; });
  const c = run(t2.p, [t2.key]);
  ok(c.sum?.providerCalls === 0 && String(items(c.sum, t2.key)[0]?.result).includes("REJECTED"), "farklı revizyon → reddedildi, çağrı 0", c.sum?.items);
}
section("S8b · gövde / ürün SHA tutarsız");
{
  const t = tamper("s8b", (pkg) => { pkg.provider_body_text = String(pkg.provider_body_text).replace('"type"', '"type" '); });
  const b = run(t.p, [t.key]);
  ok(b.sum?.providerCalls === 0 && String(items(b.sum, t.key)[0]?.result).includes("BODY_SHA"), "gövde değiştirilmiş → BODY_SHA reddi, çağrı 0", b.sum?.items);
}

section("S11 · günlük / toplam tavan ve açık deneme");
{
  const p = path.join(TMP, "s11"); mkdirSync(p, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 10; i++) { appendFileSync(path.join(p, "ledger.mock.jsonl"), JSON.stringify({ at: new Date().toISOString(), day, key: `zz-onceki-${i}-2000-01-01`, event: "attempt" }) + "\n"); appendFileSync(path.join(p, "ledger.mock.jsonl"), JSON.stringify({ at: new Date().toISOString(), day, key: `zz-onceki-${i}-2000-01-01`, event: "result", ok: true }) + "\n"); }
  const b = run(p, [K1]);
  ok(b.sum?.providerCalls === 0 && items(b.sum, K1)[0]?.result === "DAY_LIMIT", "gün 10/10 → DAY_LIMIT, çağrı 0", b.sum?.items);
  const p2 = path.join(TMP, "s11b"); mkdirSync(p2, { recursive: true });
  appendFileSync(path.join(p2, "ledger.mock.jsonl"), JSON.stringify({ at: new Date().toISOString(), day, key: K1, event: "attempt" }) + "\n");
  const c = run(p2, [K1]);
  ok(c.sum?.providerCalls === 0 && String(items(c.sum, K1)[0]?.result).includes("OPEN_ATTEMPT"), "sonucu yazılmamış deneme → kişi kilitli, çağrı 0 (olası ücretli çağrı tekrarlanmaz)", c.sum?.items);
  const d = run(path.join(TMP, "s11c"), [K1], ["--max-total", "0"]);
  ok(d.sum?.providerCalls === 0 && items(d.sum, K1)[0]?.result === "TOTAL_LIMIT", "toplam tavan 0 → TOTAL_LIMIT, çağrı 0");
}

section("S12 · DB kilidi erişilemez (bellek-içi yedek mod)");
{
  const p = path.join(TMP, "s12");
  const b = run(p, [K1], [], "no-db-lock");
  ok(b.sum?.providerCalls === 0 && items(b.sum, K1)[0]?.code === "LOCK_UNAVAILABLE" && readdirSync(path.join(p, "raw")).length === 0, "fail-closed: 503 LOCK_UNAVAILABLE, çağrı 0, gövde yok", b.sum?.items);
}

section("S13 · paralel çalıştırıcı + yol aşımı + PENDING");
{
  const p = path.join(TMP, "s13"); mkdirSync(p, { recursive: true }); writeFileSync(path.join(p, ".runner.lock"), "{}");
  const b = run(p, [K1]);
  ok(b.code === 2 && /başka bir çalıştırıcı/.test(b.out) && b.sum === null, "kilit varken ikinci çalıştırıcı DURDU (hiçbir işlem yok)");
  const c = run(path.join(TMP, "s13b"), ["../../x-2000-01-01"]);
  ok(c.code === 2 && /natural_key biçimi geçersiz/.test(c.out), "yol aşımı içeren anahtar reddedildi");
  const d = run(path.join(TMP, "s13c"), ["albert-einstein-1879-03-14"]);
  ok(d.sum?.providerCalls === 0 && items(d.sum, "albert-einstein-1879-03-14")[0]?.result === "UTC_NOT_VERIFIED", "UTC PENDING kişi sağlayıcıya gönderilmedi");
}

console.log(`\nreal-tools harness: ${pass} PASS / ${fail} FAIL (tamamı SENTETİK mock; gerçek çağrı 0)`);
if (fail) { console.error(" - " + fails.join("\n - ")); process.exit(1); }

function section(s: string) { console.log(`\n[${s}]`); }
