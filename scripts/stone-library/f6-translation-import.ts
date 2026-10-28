/**
 * Doğaltaş Kütüphanesi F6-B — DOĞRULANMIŞ ÇEVİRİ PAKETİ İÇE AKTARIMI (Git DIŞI dosyadan, owner bilgisayarından, elle).
 *
 * • Paket (F4-T3 `nihai-yayin-adayi.json`) lisanslı kaynaktan türetilmiştir: depoya EKLENMEZ, yalnız yerel yoldan okunur.
 * • Veritabanı her satırı kaynak EN ve TR metnine BİREBİR doğrular (SHA-256); tek uyuşmazlıkta tüm aktarım geri alınır.
 * • Varsayılan DENEME çalıştırmasıdır (yazmaz). Yazmak için --write. Hiçbir çeviri YAYIMLANMAZ (yayın owner ekranından).
 * • Çıktı: yalnız sayılar (metin yazdırılmaz).
 *
 * Çalıştır: STONE_LIBRARY_OWNER_ID=<owner uuid> F4T3_FILE=<Git dışı yol>/nihai-yayin-adayi.json npx tsx scripts/stone-library/f6-translation-import.ts [--write]
 */
import "../hd-analysis-word-flow/env";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type Unit = { tas_id: string; alan: string; en: string; roxy_tr: string; gosterim_tr: string; gosterim_kaynagi: string; dogrulama_durumu: string; kaynak_sha256: { en: string; tr: string } };

async function main() {
  const file = process.env.F4T3_FILE ?? "";
  const owner = process.env.STONE_LIBRARY_OWNER_ID ?? "";
  if (!file || !existsSync(file)) return console.log("F4T3_FILE yok. DURDU.");
  if (/yasam-saas|yasam-dogaltas/i.test(path.resolve(file))) return console.log("Paket Git deposu içinde olmamalı. DURDU.");
  if (!/^[0-9a-f-]{36}$/i.test(owner)) return console.log("STONE_LIBRARY_OWNER_ID gerekli. DURDU.");
  const pkg = JSON.parse(readFileSync(file, "utf8")) as { surum?: string; birimler: Record<string, Unit> };
  const rows = Object.values(pkg.birimler).map((u) => ({
    external_id: u.tas_id, field: u.alan, display: u.gosterim_kaynagi, status: u.dogrulama_durumu, en: u.en, source_tr: u.roxy_tr,
    content_tr: u.gosterim_kaynagi === "DOGRULANMIS_TR_CEVIRI" ? u.gosterim_tr : null, file_sha_en: u.kaynak_sha256.en, file_sha_tr: u.kaynak_sha256.tr,
  }));
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });
  const write = process.argv.includes("--write");
  const { data, error } = await db.rpc("stone_library_translation_import", {
    p_actor: owner, p_rows: rows, p_package_ref: `F4-T3 ${pkg.surum ?? ""}`.trim().slice(0, 200), p_dry_run: !write,
  });
  if (error) { console.log(`Aktarım reddedildi: ${error.code} ${error.message.slice(0, 200)}`); process.exitCode = 1; return; }
  console.log(JSON.stringify({ write, rows: rows.length, result: data }, null, 1));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
