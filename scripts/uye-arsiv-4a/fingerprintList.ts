/** AŞAMA 4a — gövdesi migration'da değişen ya da korumaların dayandığı fonksiyonlar (canlı ↔ depo parmak izi). */
export const FINGERPRINT_FUNCTIONS = [
  "admin_archive_user",
  "admin_set_user_active",
  "admin_list_members_v2",
  "admin_member_stage_of",
  "admin_purge_archived_expert",
  "admin_purge_in_progress",
];

/** Migration SONRASI: yukarıdakiler + 4a'nın yeni fonksiyonları (tetikleyici fonksiyonları dahil). */
export const FINGERPRINT_FUNCTIONS_AFTER = [
  ...FINGERPRINT_FUNCTIONS,
  "admin_unarchive_user",
  "admin_purge_require_archived_trg",
  "admin_archived_user_guard_trg",
  "admin_archived_child_guard_trg",
];
