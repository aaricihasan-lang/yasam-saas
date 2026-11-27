#!/usr/bin/env node
/**
 * DB-03 — MERKEZİ MIGRATION NUMARASI KAPISI (DB-02 adlandırma/sıra kontrolünü TAMAMLAR; onu değiştirmez).
 *
 * GÜVENİLİR BAĞLAM: PR numarası / kaynak dal / kaynak depo YALNIZ GitHub'ın olay dosyasından (GITHUB_EVENT_PATH) okunur;
 * PR açıklaması ya da depodaki bir dosya yetki kanıtı DEĞİLDİR. Olay `pull_request` değilse PR sahipliği doğrulanamaz.
 *
 * pull_request olayı — base'e göre migration değişiklikleri (git diff --name-status -M base...HEAD):
 *   • base'deki migration DEĞİŞTİRİLEMEZ / SİLİNEMEZ / YENİDEN ADLANDIRILAMAZ.
 *   • EKLENEN her migration:
 *       – içeriği base'deki bir migration'ın birebir kopyası olamaz (aynı SQL'i başka numarayla yayımlama);
 *       – merkezi defterde ayrılmış, iptal / geçmiş değil, dosya adı birebir;
 *       – PR'a BAĞLANMIŞ: defterdeki PR numarası = GitHub olayındaki PR numarası, dal = olaydaki head.ref, depo = base depo;
 *       – defterdeki SHA-256 = bu commit'teki dosyanın GİT BLOB SHA-256'sı (çalışma kopyası satır sonlarından bağımsız);
 *       – aynı SHA-256 başka bir numaraya bağlı değil.
 *   • Fork'tan gelen PR migration ekleyemez (deftere yazamaz; sahiplik kanıtlanamaz).
 *   • Defter geçmişi: doğrusal, yalnız ekleme, geçerli durum geçişleri; depodaki çapa commit'i (varsa) içerilir.
 * push olayı (main) — main'deki, defterde "gecmis" olmayan her migration bağlanmış/uygulanmış olmalı ve SHA eşleşmeli.
 * Migration değişikliği YOKSA ağa çıkılmaz → PASS. Değişiklik VARSA ve defter / bağlam doğrulanamıyorsa SESSİZ PASS YOK.
 *
 * Kip: yapilandirma.json `zorunlu: true` ya da `--zorunlu` → bulgu = çıkış 1. Aksi halde UYARI kipi (bulgular yazılır, çıkış 0).
 * Kullanım: node scripts/ci/migration-reservation-check.mjs [--base origin/main] [--zorunlu]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aralikDogrula, ayristir, blobIcerik, durum, git, NAME_RE, okuUzak, yapilandirma } from "../migrations/numara/defter.mjs";

const root = process.env.MIGRATION_NUMARA_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const baseRef = args.includes("--base") ? args[args.indexOf("--base") + 1] : null;
const cfg = yapilandirma(root);
const zorunlu = args.includes("--zorunlu") || cfg.zorunlu === true || process.env.MIGRATION_NUMARA_ZORUNLU === "1";
const bulgular = [];
const bilgi = (m) => console.log(m);
const bitir = () => {
  bilgi(`DB-03: kip ${zorunlu ? "ZORUNLU" : "UYARI (etkinleştirme Owner onayında)"}`);
  for (const h of bulgular) console.error(`${zorunlu ? "FAIL" : "UYARI"} ${h}`);
  if (bulgular.length && zorunlu) process.exit(1);
  bilgi(bulgular.length ? "RESULT: PASS (UYARI kipi — bulgular yukarıda)" : "RESULT: PASS");
  process.exit(0);
};

// ── Güvenilir GitHub bağlamı ───────────────────────────────────────────────────────────────────────────────────────────
function olayBaglami() {
  const ad = process.env.GITHUB_EVENT_NAME ?? null;
  const p = process.env.GITHUB_EVENT_PATH;
  let olay = null;
  if (p && fs.existsSync(p)) {
    try {
      olay = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      olay = null;
    }
  }
  const pr = olay?.pull_request;
  return {
    ad,
    pr: ad === "pull_request" && Number.isInteger(pr?.number) ? pr.number : null,
    headRef: pr?.head?.ref ?? null,
    headDepo: pr?.head?.repo?.full_name ?? null,
    baseDepo: pr?.base?.repo?.full_name ?? olay?.repository?.full_name ?? process.env.GITHUB_REPOSITORY ?? null,
  };
}
const bag = olayBaglami();

// ── Defter (yalnız gerektiğinde) ───────────────────────────────────────────────────────────────────────────────────────
let defter = null;
function defteriOku() {
  if (defter) return defter;
  const { tip, text } = okuUzak(root, cfg);
  if (!tip) throw new Error("merkezi defter dalı yok (sistem etkinleştirilmemiş)");
  git(root, ["fetch", "--quiet", "--no-tags", cfg.remote, `+${cfg.ref}:refs/migration-numara/ci`]);
  try {
    aralikDogrula(root, null, "refs/migration-numara/ci", cfg);
    if (cfg.capa && !git(root, ["merge-base", "--is-ancestor", cfg.capa, "refs/migration-numara/ci"], { allowFail: true }).ok) throw new Error(`defter, depodaki çapa commit'ini (${cfg.capa.slice(0, 9)}) içermiyor: geçmiş yeniden yazılmış`);
  } finally {
    git(root, ["update-ref", "-d", "refs/migration-numara/ci"], { allowFail: true });
  }
  defter = durum(ayristir(text));
  return defter;
}
const shaBaskaNumarada = (st, sha, surum) => [...st.values()].find((x) => x.surum !== surum && x.sha256 === sha && x.durum !== "iptal");

// ── push olayı (main) ──────────────────────────────────────────────────────────────────────────────────────────────────
if (!baseRef) {
  if (!cfg.zorunlu && !args.includes("--zorunlu")) {
    bilgi("DB-03: push olayı; defter henüz zorunlu değil → main denetimi atlandı.");
    bilgi("RESULT: PASS");
    process.exit(0);
  }
  let st;
  try {
    st = defteriOku();
  } catch (e) {
    bulgular.push(`Merkezi defter doğrulanamadı: ${e.message}`);
    bitir();
  }
  const dosyalar = git(root, ["ls-tree", "--name-only", "HEAD:supabase/migrations"]).out.split("\n").map((f) => f.trim()).filter((f) => NAME_RE.test(f));
  for (const f of dosyalar) {
    const v = NAME_RE.exec(f)[1];
    const r = st.get(v);
    if (r?.gecmis) continue;
    if (!r) bulgular.push(`main: ${f} merkezi defterde yok (ayırma olmadan main'e girmiş).`);
    else if (r.dosya !== f) bulgular.push(`main: ${f}: ${v} başka dosya için ayrılmış (${r.dosya}).`);
    else if (!["pr", "uygulandi"].includes(r.durum)) bulgular.push(`main: ${f}: PR'a bağlanmamış (durum ${r.durum}).`);
    else if (blobIcerik(root, "HEAD", f)?.sha256 !== r.sha256) bulgular.push(`main: ${f}: içerik defterde bağlı SHA-256 ile aynı değil.`);
  }
  bilgi(`DB-03 (main): ${dosyalar.length} migration denetlendi.`);
  bitir();
}

// ── pull_request olayı ─────────────────────────────────────────────────────────────────────────────────────────────────
const diff = git(root, ["diff", "--name-status", "-M", `${baseRef}...HEAD`, "--", "supabase/migrations"], { allowFail: true });
if (!diff.ok) bulgular.push(`Base ile fark alınamadı (${baseRef}): ${diff.err.trim().split("\n").at(-1)}`);
const satirlar = diff.ok ? diff.out.split("\n").filter(Boolean) : [];
const eklenen = [];
const yol = (p) => p.replace(/^supabase\/migrations\//, "");
for (const s of satirlar) {
  const [kod, a, b] = s.split("\t");
  if (!a.endsWith(".sql") && !(b ?? "").endsWith(".sql")) continue;
  if (kod === "A") eklenen.push(yol(a));
  else if (kod.startsWith("R")) bulgular.push(`Mevcut migration yeniden adlandırılamaz: ${yol(a)} → ${yol(b)} (uygulanmış geçmiş korunur)`);
  else if (kod === "D") bulgular.push(`Mevcut migration silinemez: ${yol(a)}`);
  else if (kod === "M") bulgular.push(`Mevcut migration içeriği değiştirilemez: ${yol(a)} (yeni bir migration ekleyin)`);
  else bulgular.push(`Beklenmeyen migration değişikliği (${kod}): ${yol(a)}`);
}
if (!satirlar.length && !bulgular.length) {
  bilgi("DB-03: PR migration içermiyor → merkezi numara denetimi gerekmiyor.");
  bilgi("RESULT: PASS");
  process.exit(0);
}

if (eklenen.length) {
  // Aynı SQL'in başka numarayla yayımlanması: eklenen blob base'deki bir migration blob'uyla aynıysa RED.
  const baseBloblar = new Map(git(root, ["ls-tree", `${baseRef}:supabase/migrations`], { allowFail: true }).out.split("\n").filter(Boolean).map((l) => { const [meta, ad] = l.split("\t"); return [meta.split(" ")[2], ad]; }));
  if (bag.ad !== "pull_request" || !bag.pr || !bag.headRef || !bag.baseDepo) bulgular.push(`Güvenilir PR bağlamı yok (GITHUB_EVENT_NAME=${bag.ad ?? "-"}; olay dosyasında PR numarası / dal / depo okunamadı) → migration ekleyen değişikliğin sahipliği doğrulanamaz.`);
  if (bag.headDepo && bag.baseDepo && bag.headDepo !== bag.baseDepo) bulgular.push(`Fork'tan gelen PR (${bag.headDepo}) migration ekleyemez: merkezi deftere yazamaz, sahiplik kanıtlanamaz.`);
  let st = null;
  try {
    st = defteriOku();
  } catch (e) {
    bulgular.push(`Merkezi defter doğrulanamadı → migration içeren PR onaylanamaz: ${e.message}`);
  }
  for (const f of eklenen) {
    const m = NAME_RE.exec(f);
    if (!m) continue; // ad biçimi DB-02'de
    const v = m[1];
    const blob = blobIcerik(root, "HEAD", f);
    if (blob && baseBloblar.has(blob.blob)) bulgular.push(`${f}: içerik base'deki ${baseBloblar.get(blob.blob)} ile BİREBİR aynı (aynı SQL başka numarayla yayımlanamaz).`);
    if (!st) continue;
    const r = st.get(v);
    const ayir = `npm run migration:numara -- yeni --modul <modül> --ad ${m[2]}`;
    if (!r) { bulgular.push(`${f}: ${v} merkezi defterde ayrılmamış. Numara almak için: ${ayir}`); continue; }
    if (r.gecmis) { bulgular.push(`${f}: ${v} daha önce kullanılmış (main/production geçmişi: ${(r.dosyalar ?? []).join(", ") || r.prodAd || "production"}).`); continue; }
    if (r.durum === "iptal") { bulgular.push(`${f}: ${v} iptal edilmiş bir numara; yeniden kullanılamaz.`); continue; }
    if (r.dosya !== f) { bulgular.push(`${f}: ${v} başka bir migration için ayrılmış (${r.dosya}; ${r.modul} / ${r.ayiranDal}).`); continue; }
    if (r.durum === "ayrildi") { bulgular.push(`${f}: numara ayrılmış ama içerik PR'a BAĞLANMAMIŞ. SQL'i commit edip: npm run migration:numara -- bagla --surum ${v} --pr ${bag.pr ?? "<PR no>"}`); continue; }
    if (bag.pr && r.pr !== bag.pr) bulgular.push(`${f}: defterde PR #${r.pr}'ye bağlı; bu PR #${bag.pr} (sahiplik uyuşmuyor).`);
    if (bag.headRef && r.dal !== bag.headRef) bulgular.push(`${f}: defterde '${r.dal}' dalına bağlı; bu PR'ın dalı '${bag.headRef}'.`);
    if (bag.baseDepo && r.depo !== bag.baseDepo) bulgular.push(`${f}: defterde '${r.depo}' deposuna bağlı; bu depo '${bag.baseDepo}'.`);
    if (!blob || blob.sha256 !== r.sha256) bulgular.push(`${f}: içerik (SHA-256 ${blob?.sha256.slice(0, 12) ?? "-"}…) defterde bağlı içerikle (${r.sha256.slice(0, 12)}…) AYNI DEĞİL. ${r.durum === "uygulandi" ? "Production'a uygulanmış içerik DEĞİŞTİRİLEMEZ." : `SQL değiştiyse commit + yeniden bağlayın: npm run migration:numara -- bagla --surum ${v} --pr ${bag.pr ?? r.pr}`}`);
    const diger = blob && shaBaskaNumarada(st, blob.sha256, v);
    if (diger) bulgular.push(`${f}: aynı içerik (SHA-256) ${diger.surum} numarasına da bağlı (aynı SQL iki numarada).`);
    if (!bulgular.some((x) => x.startsWith(f))) bilgi(`OK ${f}: ${v} → PR #${r.pr} / ${r.dal} / ${r.depo}; SHA-256 eşleşti (durum ${r.durum})`);
  }
}
bilgi(`DB-03: ${satirlar.length} migration değişikliği, ${eklenen.length} eklenen; bağlam: olay=${bag.ad ?? "-"} PR=${bag.pr ?? "-"} dal=${bag.headRef ?? "-"} depo=${bag.baseDepo ?? "-"}`);
bitir();
