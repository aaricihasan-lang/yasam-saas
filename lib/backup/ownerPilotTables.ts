/**
 * lib/backup/ownerPilotTables.ts — Yedek DIŞI, SATIŞ SONRASI owner-only pilot tabloları (YALNIZ SUNUCU).
 *
 * NEDEN registry.ts'te DEĞİL: registry.ts istemci paketine de girer (Ayarlar → BackupSections).
 * Owner-only pilot modüllerin tablo adları uzman tarayıcısına gönderilen JS'te bulunmamalıdır
 * (modülün varlığı dahi sızdırılmaz). Bu tablolar BACKUP_REGISTRY'de olmadığı için yedek/dışa
 * aktarım/restore motoru onları hiçbir zaman işlemez (= "excluded" ile aynı etki).
 *
 * Sınıflandırma kanıtı: scripts/final-hardening/backup.harness.ts bu listeyi "sınıflandırılmış"
 * sayar ve (a) BACKUP_REGISTRY ile çakışmadığını, (b) hiçbir "use client" dosyasının bu modülü
 * import etmediğini doğrular.
 *
 * Yedek kapsamı kararı modül uzmanlara açılırken (Astroloji Aşama 5/7) verilir.
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";

assertServerOnly("lib/backup/ownerPilotTables");

export const OWNER_PILOT_EXCLUDED_TABLES: readonly { table: string; reason: string }[] = [
  { table: "astro_birth_profiles", reason: "Astroloji owner-only pilot — yedek kapsamı Aşama 5 kararı." },
  { table: "astro_birth_profile_revisions", reason: "Astroloji owner-only pilot — yedek kapsamı Aşama 5 kararı." },
  { table: "astro_provider_results", reason: "Astroloji sağlayıcı sonucu/önbelleği (ham yanıt dahil) — owner-only pilot." },
  { table: "astro_provider_interpretations", reason: "Astroloji sağlayıcı otomatik yorumu — owner-only pilot; ayrı yetki katmanı." },
  // Aşama 2
  { table: "astro_kb_entries", reason: "Astroloji Bilgi Bankası (uzmanın kendi notları) — owner-only pilot; yedek kapsamı Aşama 5 kararı." },
  { table: "astro_expert_notes", reason: "Astroloji danışana özel uzman çalışma notları — owner-only pilot." },
  { table: "astro_analyses", reason: "Astroloji kayıtlı analiz snapshot'ları (değişmez) — owner-only pilot." },
  { table: "astro_analysis_notes", reason: "Astroloji kayıtlı analiz uzman yorumu kopyası (değişmez) — owner-only pilot." },
  { table: "astro_unmapped_fields", reason: "Sağlayıcı eşlenmemiş alan YOLLARI (değer yok) — sistem denetim kaydı." },
];

export function isOwnerPilotExcludedTable(table: string): boolean {
  return OWNER_PILOT_EXCLUDED_TABLES.some((e) => e.table === table);
}
