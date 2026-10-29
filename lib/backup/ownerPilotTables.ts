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
  // 2026-10-29: William Lilly Horary soru kayıtları — diğer astro_* tablolarıyla AYNI owner-only pilot kuralı (yedek kapsamı
  // Aşama 5 kararı). Hesap/tenant kalıcı silmede tenant_id ile temizlenir (admin_purge_archived_expert keşfi).
  { table: "astro_horary_questions", reason: "Astroloji Horary soru kayıtları (değişmez anlık görüntü) — owner-only pilot; yedek kapsamı Aşama 5 kararı." },
  // Hazır Eğitim Haritaları (HD, FAZ 2-B1) — platforma ait, tenant'sız, owner-only katalog. Hiçbir kullanıcı/tenant
  // yedeğine girmez ve yedekten GERİ YÜKLENMEZ: iptal edilmiş eğitmen yetkisi eski yedekten diriltilemez.
  // Tablo adları istemci paketine girmesin diye registry.ts'te değil, burada (özelliğin varlığı sızdırılmaz).
  { table: "hd_education_subjects", reason: "HD eğitim kataloğu kişileri (platform; owner-only) — kullanıcı yedeğine girmez." },
  { table: "hd_education_sources", reason: "HD eğitim kataloğu kaynakları (platform; append-only) — kullanıcı yedeğine girmez." },
  { table: "hd_education_charts", reason: "HD eğitim kataloğu hesap snapshot'ları (platform; append-only) — kullanıcı yedeğine girmez." },
  { table: "hd_education_publications", reason: "HD eğitim kataloğu yayın durumu (platform; DB yayın kilidi) — kullanıcı yedeğine girmez." },
  { table: "hd_education_takedown_requests", reason: "HD eğitim kataloğu kaldırma talepleri (platform) — kullanıcı yedeğine girmez." },
  { table: "hd_education_access_grants", reason: "Owner'ın kişi bazlı eğitmen yetkileri — yedekten GERİ YÜKLENMEZ (iptal edilen yetki dirilmez)." },
  { table: "hd_education_audit_events", reason: "HD eğitim kataloğu denetim günlüğü (append-only) — yedekten geri yüklenmez." },
  // Doğaltaş Kütüphanesi (F1) — platforma ait, tenant'sız global referans kütüphanesi. Hiçbir kullanıcı/tenant
  // yedeğine girmez; lisanslı kaynak içeriği ve ham veri uzman yedeğine/dışa aktarımına ASLA çıkmaz.
  { table: "stone_library_settings", reason: "Doğaltaş Kütüphanesi ayarları (platform; owner-only) — kullanıcı yedeğine girmez." },
  { table: "stone_library_sources", reason: "Kütüphane kaynak + lisans kayıtları (owner-only; gerçek kaynak kimliği) — kullanıcı yedeğine girmez." },
  { table: "stone_library_source_documents", reason: "Kütüphane lisans belgeleri (owner-only) — kullanıcı yedeğine girmez." },
  { table: "stone_library_vocab", reason: "Kütüphane çakra/burç/element sözlüğü (platform) — kullanıcı yedeğine girmez." },
  { table: "stone_library_stones", reason: "Kütüphane kanonik taş kartları (platform) — kullanıcı yedeğine girmez." },
  { table: "stone_library_names", reason: "Kütüphane alternatif adları (platform) — kullanıcı yedeğine girmez." },
  { table: "stone_library_external_ids", reason: "Kütüphane kaynak kimlik eşlemeleri (owner-only) — kullanıcı yedeğine girmez." },
  { table: "stone_library_import_batches", reason: "Kütüphane aktarım paketleri (owner-only) — kullanıcı yedeğine girmez." },
  { table: "stone_library_import_events", reason: "Kütüphane aktarım işlem kayıtları (append-only) — kullanıcı yedeğine girmez." },
  { table: "stone_library_raw", reason: "Kütüphane değiştirilemez ham sağlayıcı yanıtları (lisanslı; owner-only) — kullanıcı yedeğine ASLA girmez." },
  { table: "stone_library_records", reason: "Kütüphane kaynak bazında sürümlü metinler (lisanslı) — kullanıcı yedeğine girmez." },
  { table: "stone_library_facets", reason: "Kütüphane yapısal değerleri (platform) — kullanıcı yedeğine girmez." },
  { table: "stone_library_reviews", reason: "Kütüphane owner inceleme geçmişi (append-only) — kullanıcı yedeğine girmez." },
  { table: "stone_library_history", reason: "Kütüphane satır sürüm geçmişi (append-only) — kullanıcı yedeğine girmez." },
  { table: "stone_library_delete_ops", reason: "Kütüphane geri alınabilir silme işlemleri (owner-only) — kullanıcı yedeğine girmez." },
  { table: "stone_library_access_grants", reason: "Owner'ın kişi bazlı kütüphane yetkileri — yedekten GERİ YÜKLENMEZ (iptal edilen yetki dirilmez)." },
  { table: "stone_library_published", reason: "Kütüphane türetilmiş yayın yüzeyi (yeniden üretilebilir) — kullanıcı yedeğine girmez." },
  { table: "stone_library_license_grants", reason: "Kütüphane sağlayıcı yazılı izin kayıtları (owner-only; lisans kanıtı) — kullanıcı yedeğine girmez." },
  { table: "stone_library_images", reason: "Kütüphane lisanslı görsel kayıtları (owner-only; dosyalar private bucket'ta) — kullanıcı yedeğine girmez." },
];

export function isOwnerPilotExcludedTable(table: string): boolean {
  return OWNER_PILOT_EXCLUDED_TABLES.some((e) => e.table === table);
}
