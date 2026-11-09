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
 * Yedek kapsamı kararı modül uzmanlara açılırken verilir (Gökyüzü Atlası: 2026-11-09 → registry'ye taşındı).
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";

assertServerOnly("lib/backup/ownerPilotTables");

export const OWNER_PILOT_EXCLUDED_TABLES: readonly { table: string; reason: string }[] = [
  // Gökyüzü Atlası (astro_*) 2026-11-09 Owner kararıyla (Premium Word Arşivi / PR-1) BACKUP_REGISTRY'ye taşındı: uzman kayıtları
  // (doğum profilleri, revizyonlar, Bilgi Bankası, çalışma notları, kayıtlı analizler + yorumları, Horary soruları) uzman bazlı
  // izolasyonla (ownerScope) yedeğe / dışa aktarıma girer; sağlayıcı önbelleği ve eşlenmemiş alan kaydı registry'de yedek DIŞI.
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
  { table: "hd_education_catalog_control", reason: "HD eğitim kataloğu owner açılış anahtarı (platform) — yedekten geri yüklenmez (açılış owner kararıdır)." },
  { table: "hd_education_subject_scope", reason: "HD eğitim kataloğu kapsam dışı (arşiv) kişiler (platform; owner-only) — kullanıcı yedeğine girmez." },
  { table: "hd_education_control_events", reason: "HD eğitim kataloğu owner yönetim geçmişi (append-only) — yedekten geri yüklenmez." },
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
  { table: "expert_workspace_access_grants", reason: "Kişisel Ofis kullanıcı bazlı açılış izinleri (Owner) — yedekten GERİ YÜKLENMEZ (geri alınan izin dirilmez)." },
  { table: "stone_library_published", reason: "Kütüphane türetilmiş yayın yüzeyi (yeniden üretilebilir) — kullanıcı yedeğine girmez." },
  { table: "stone_library_license_grants", reason: "Kütüphane sağlayıcı yazılı izin kayıtları (owner-only; lisans kanıtı) — kullanıcı yedeğine girmez." },
  { table: "stone_library_images", reason: "Kütüphane lisanslı görsel kayıtları (owner-only; dosyalar private bucket'ta) — kullanıcı yedeğine girmez." },
  // Doğaltaş Kütüphanesi F6 (migration 20271201000300 / 20271201000400): ham çağrı rezervasyonu, çeviri / owner katmanları ve
  // toplu işlem belirteçleri — platforma ait, tenant'sız, owner-only. Kullanıcı yedeğine / dışa aktarımına girmez.
  { table: "stone_library_call_reservations", reason: "Kütüphane sağlayıcı çağrı rezervasyonları (owner-only; ham veri koruması) — kullanıcı yedeğine girmez." },
  { table: "stone_library_translations", reason: "Kütüphane çeviri katmanı (platform; owner-only) — kullanıcı yedeğine girmez." },
  { table: "stone_library_owner_versions", reason: "Kütüphane owner sürüm katmanı (platform; owner-only) — kullanıcı yedeğine girmez." },
  { table: "stone_library_owner_notes", reason: "Kütüphane owner notları (platform; owner-only) — kullanıcı yedeğine girmez." },
  { table: "stone_library_owner_images", reason: "Kütüphane owner görsel kayıtları (platform; owner-only) — kullanıcı yedeğine girmez." },
  { table: "stone_library_bulk_tokens", reason: "Kütüphane toplu işlem doğrulama belirteçleri (geçici; owner-only) — kullanıcı yedeğine girmez." },
  // Eğitmene Özel Eğitim Haritaları (HD, FAZ 6) — kapalı pilot. Yedekten GERİ YÜKLENMEZ: geri çekilmiş danışan izni, silinmiş
  // eğitim kaydı kullanıcı yedeğinden diriltilemez (TEK eğitim yetkisi merkezî hd_education_access_grants'tedir, FAZ 8).
  // Platform felaket yedeğinden (tam pg_dump) dönüşte diriltme riski owner kararıyla kabul edildi ve belgelendi. Yedek kapsamı canlıya açılış kararıdır.
  { table: "hd_edu_private_control", reason: "HD özel eğitim arşivi owner anahtarı (platform) — yedekten geri yüklenmez." },
  { table: "hd_edu_private_consent_texts", reason: "HD özel eğitim izin metni sürümleri (platform; owner onaylı) — kullanıcı yedeğine girmez." },
  { table: "hd_edu_private_consents", reason: "Danışan eğitim izni kayıtları — yedekten geri yüklenmez (geri çekilmiş izin dirilmez); kapalı pilot." },
  { table: "hd_edu_private_consent_evidence", reason: "Danışan izin kanıtı dosyaları (DB) — yedekten geri yüklenmez; kapalı pilot." },
  { table: "hd_edu_private_items", reason: "Eğitmene özel eğitim kayıtları (kaynak haritaya bağlı, kopya yok) — yedekten geri yüklenmez; kapalı pilot." },
  { table: "hd_edu_private_audit", reason: "HD özel eğitim arşivi asgari denetim izi (append-only) — yedekten geri yüklenmez." },
  // Eğitim çalışma alanı çizim / not katmanları (HD, FAZ 8) — kapalı pilot; eğitmene özel, kaynak kayda bağlı (kopya yok).
  { table: "hd_edu_annotation_layers", reason: "HD eğitim haritası eğitmen çizim / not katmanları — yedekten geri yüklenmez; kapalı pilot." },
  { table: "hd_edu_annotation_audit", reason: "HD eğitim çizim katmanı asgari denetim izi (append-only) — yedekten geri yüklenmez." },
  // Hazır Eğitim Haritaları "Hayat Hikâyesi" (HD, FAZ 10) — merkezî ünlü kaydına ait biyografi; platforma ait, tenant'sız.
  { table: "hd_education_biographies", reason: "HD eğitim kataloğu Hayat Hikâyesi biyografileri (platform; owner-only içerik) — kullanıcı yedeğine girmez." },
  { table: "hd_education_biography_revisions", reason: "HD eğitim Hayat Hikâyesi sürüm geçmişi (append-only) — kullanıcı yedeğine girmez." },
];

export function isOwnerPilotExcludedTable(table: string): boolean {
  return OWNER_PILOT_EXCLUDED_TABLES.some((e) => e.table === table);
}
