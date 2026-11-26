#!/usr/bin/env node
/**
 * DB-03 — MERKEZİ MIGRATION NUMARASI KAPISI (DB-02 adlandırma/sıra kontrolünü TAMAMLAR; onu değiştirmez).
 *
 * PR'ın base'e göre migration değişiklikleri (git diff --name-status -M):
 *   • Base'de VAR olan migration DEĞİŞTİRİLEMEZ, SİLİNEMEZ, YENİDEN ADLANDIRILAMAZ (uygulanmış geçmiş).
 *   • EKLENEN her migration için merkezi defterde (uzak `migration-rezervasyon` dalı) ayırma bulunmalı:
 *       – sürüm defterde ayrılmış (ayir) ve iptal edilmemiş,
 *       – ayırmadaki dosya adı PR'daki dosya adıyla BİREBİR aynı (iki PR aynı numarayı kullanamaz),
 *       – sürüm "gecmis" (main'de / production'da önceden kullanılmış) DEĞİL,
 *       – production'a uygulanmış kaydın içeriği (SHA-256) değişmemiş.
 *   • Defter geçmişi yalnız ekleme ile büyümüş ve tutarlı olmalı.
 * Migration değişikliği YOKSA ağa çıkılmaz, PASS. Değişiklik VARSA ve defter okunamıyorsa sessiz PASS YOK.
 *
 * Kip: yapilandirma.json `zorunlu: true` ya da `--zorunlu` → hata = çıkış 1. Aksi halde UYARI kipi (bulgular yazılır, çıkış 0) —
 * merkezi sistem Owner onayıyla etkinleştirilene kadar.
 * Kullanım: node scripts/ci/migration-reservation-check.mjs --base origin/main [--zorunlu]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ayristir, blobIcerik, durum, gecmisiDogrula, git, NAME_RE, okuUzak, yapilandirma } from "../migrations/numara/defter.mjs";

const root = process.env.MIGRATION_NUMARA_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const baseRef = args[args.indexOf("--base") + 1] && args.includes("--base") ? args[args.indexOf("--base") + 1] : null;
const cfg = yapilandirma(root);
const zorunlu = args.includes("--zorunlu") || cfg.zorunlu === true || process.env.MIGRATION_NUMARA_ZORUNLU === "1";
const hatalar = [];
const bilgi = (m) => console.log(m);

if (!baseRef) {
  bilgi("DB-03: --base verilmedi (push olayı) → PR karşılaştırması yok; atlandı.");
  bilgi("RESULT: PASS");
  process.exit(0);
}

const diff = git(root, ["diff", "--name-status", "-M", `${baseRef}...HEAD`, "--", "supabase/migrations"], { allowFail: true });
if (!diff.ok) hatalar.push(`Base ile fark alınamadı (${baseRef}): ${diff.err.trim().split("\n").at(-1)}`);
const satirlar = diff.ok ? diff.out.split("\n").filter(Boolean) : [];
const eklenen = [];
for (const s of satirlar) {
  const [kod, a, b] = s.split("\t");
  const ad = (p) => p.replace(/^supabase\/migrations\//, "");
  if (!a.endsWith(".sql") && !(b ?? "").endsWith(".sql")) continue;
  if (kod === "A") eklenen.push(ad(a));
  else if (kod.startsWith("R")) hatalar.push(`Mevcut migration yeniden adlandırılamaz: ${ad(a)} → ${ad(b)} (uygulanmış geçmiş korunur; yeni numara için yeni dosya ve merkezi ayırma kullanın)`);
  else if (kod === "D") hatalar.push(`Mevcut migration silinemez: ${ad(a)}`);
  else if (kod === "M") hatalar.push(`Mevcut migration içeriği değiştirilemez: ${ad(a)} (yeni bir migration ekleyin)`);
  else hatalar.push(`Beklenmeyen migration değişikliği (${kod}): ${ad(a)}`);
}

if (!satirlar.length && !hatalar.length) {
  bilgi("DB-03: PR migration içermiyor → merkezi numara denetimi gerekmiyor.");
  bilgi("RESULT: PASS");
  process.exit(0);
}

if (eklenen.length) {
  let st = null;
  try {
    const { tip, text } = okuUzak(root, cfg);
    if (!tip) throw new Error("merkezi defter dalı yok (sistem etkinleştirilmemiş)");
    git(root, ["fetch", "--quiet", "--no-tags", cfg.remote, `+${cfg.ref}:refs/migration-numara/ci`]);
    gecmisiDogrula(root, "refs/migration-numara/ci", cfg);
    git(root, ["update-ref", "-d", "refs/migration-numara/ci"], { allowFail: true });
    st = durum(ayristir(text));
  } catch (e) {
    hatalar.push(`Merkezi defter doğrulanamadı → migration içeren PR onaylanamaz: ${e.message}`);
  }
  if (st) {
    for (const f of eklenen) {
      const m = NAME_RE.exec(f);
      if (!m) continue; // ad biçimi DB-02'de
      const v = m[1];
      const r = st.get(v);
      if (!r) hatalar.push(`${f}: ${v} merkezi defterde ayrılmamış. Numara almak için: npm run migration:numara -- yeni --modul <modül> --ad ${m[2]}`);
      else if (r.gecmis) hatalar.push(`${f}: ${v} daha önce kullanılmış (main/production geçmişi: ${(r.dosyalar ?? []).join(", ") || "production"}).`);
      else if (r.durum === "iptal") hatalar.push(`${f}: ${v} iptal edilmiş bir numara; yeniden kullanılamaz.`);
      else if (r.dosya !== f) hatalar.push(`${f}: ${v} başka bir migration için ayrılmış (${r.dosya}; ${r.modul ?? "-"} / ${r.dal ?? "-"}).`);
      else if (r.durum === "uygulandi" && r.sha256) {
        const sha = blobIcerik(root, "HEAD", f)?.sha256;
        if (sha !== r.sha256) hatalar.push(`${f}: production'a uygulanmış içerik (SHA-256 ${r.sha256.slice(0, 12)}…) değişmiş.`);
      } else bilgi(`OK ${f}: ${v} ayrılmış (${r.modul} / ${r.dal ?? "-"}${r.pr ? ` / PR #${r.pr}` : ""}; durum ${r.durum})`);
    }
  }
}

bilgi(`DB-03: ${satirlar.length} migration değişikliği, ${eklenen.length} eklenen; kip ${zorunlu ? "ZORUNLU" : "UYARI (etkinleştirme Owner onayında)"}`);
for (const h of hatalar) console.error(`${zorunlu ? "FAIL" : "UYARI"} ${h}`);
if (hatalar.length && zorunlu) process.exit(1);
bilgi(hatalar.length ? "RESULT: PASS (UYARI kipi — bulgular yukarıda)" : "RESULT: PASS");
