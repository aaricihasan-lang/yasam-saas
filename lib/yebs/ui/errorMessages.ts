// ============================================================
// YEBS A8 — Stable error / blocker kodu → Türkçe kullanıcı sözlüğü
//
// A7 + API-TX sözleşmesindeki bütün YEBS_* kodları. Ham DB error/detail/stack
// ASLA gösterilmez. Bilinmeyen kod → güvenli generic fallback.
// ============================================================

export type ErrorSeverity = "info" | "warning" | "error";
export type ErrorCategory =
  | "validation" | "not_found" | "stale" | "noop" | "invalid_transition"
  | "dependency" | "parent_readiness" | "evidence" | "source_readiness"
  | "metadata" | "concept_label" | "graph_cycle" | "authorization" | "internal";

export type YebsCodeMeta = {
  title: string;
  message: string;
  suggestedAction?: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
};

export const GENERIC_FALLBACK: YebsCodeMeta = {
  title: "İşlem tamamlanamadı",
  message: "İşlem kalite veya yayın koşulları nedeniyle tamamlanamadı.",
  severity: "error",
  category: "internal",
};

export const YEBS_CODE_DICTIONARY: Record<string, YebsCodeMeta> = {
  // ---- authorization ----
  YEBS_ADMIN_FORBIDDEN: { title: "Yetki gerekli", message: "Bu işlem için admin yetkisi gereklidir. Oturumunuz doğrulanamadı.", suggestedAction: "Yeniden giriş yapıp tekrar deneyin.", severity: "error", category: "authorization" },

  // ---- validation ----
  YEBS_INVALID_ID: { title: "Geçersiz kayıt", message: "Kayıt tanımlayıcısı geçersiz.", severity: "error", category: "validation" },
  YEBS_INVALID_REQUEST_BODY: { title: "Geçersiz veri", message: "Gönderilen form verisi geçersiz veya beklenmeyen alan içeriyor.", suggestedAction: "Alanları kontrol edip tekrar deneyin.", severity: "error", category: "validation" },
  YEBS_INVALID_TARGET_STATUS: { title: "Geçersiz hedef durum", message: "Seçilen hedef durum bu kayıt için geçerli değil.", severity: "error", category: "validation" },
  YEBS_REASON_INVALID: { title: "Gerekçe gerekli", message: "İşlem için boş olmayan bir gerekçe girmelisiniz (en fazla 2000 karakter).", suggestedAction: "Gerekçe alanını doldurun.", severity: "warning", category: "validation" },

  // ---- stale / noop ----
  YEBS_TRADITION_STALE_UPDATE: { title: "Kayıt değişmiş", message: "Bu kayıt siz görüntülerken güncellenmiş. İşleminiz uygulanmadı.", suggestedAction: "Sayfayı yenileyip tekrar deneyin.", severity: "warning", category: "stale" },
  YEBS_SCHOOL_STALE_UPDATE: { title: "Kayıt değişmiş", message: "Bu kayıt siz görüntülerken güncellenmiş.", suggestedAction: "Sayfayı yenileyip tekrar deneyin.", severity: "warning", category: "stale" },
  YEBS_CONCEPT_STALE_UPDATE: { title: "Kayıt değişmiş", message: "Bu kayıt siz görüntülerken güncellenmiş.", suggestedAction: "Sayfayı yenileyip tekrar deneyin.", severity: "warning", category: "stale" },
  YEBS_SOURCE_STALE_UPDATE: { title: "Kayıt değişmiş", message: "Bu kayıt siz görüntülerken güncellenmiş.", suggestedAction: "Sayfayı yenileyip tekrar deneyin.", severity: "warning", category: "stale" },
  YEBS_CLAIM_STALE_UPDATE: { title: "Kayıt değişmiş", message: "Bu kayıt siz görüntülerken güncellenmiş.", suggestedAction: "Sayfayı yenileyip tekrar deneyin.", severity: "warning", category: "stale" },
  YEBS_RELATION_STALE_UPDATE: { title: "Kayıt değişmiş", message: "Bu kayıt siz görüntülerken güncellenmiş.", suggestedAction: "Sayfayı yenileyip tekrar deneyin.", severity: "warning", category: "stale" },
  YEBS_CLAIM_SOURCE_STALE_UPDATE: { title: "Kanıt değişmiş", message: "Bu kanıt kaydı siz görüntülerken güncellenmiş.", suggestedAction: "Yenileyip tekrar deneyin.", severity: "warning", category: "stale" },
  YEBS_RELATION_SOURCE_STALE_UPDATE: { title: "Kanıt değişmiş", message: "Bu kanıt kaydı siz görüntülerken güncellenmiş.", suggestedAction: "Yenileyip tekrar deneyin.", severity: "warning", category: "stale" },

  // ---- invalid transition / status lock ----
  YEBS_TRADITION_STATUS_LOCKED: { title: "Düzenleme kilitli", message: "Bu kayıt yalnız taslak durumundayken alanları düzenlenebilir.", severity: "warning", category: "invalid_transition" },
  YEBS_SCHOOL_STATUS_LOCKED: { title: "Düzenleme kilitli", message: "Bu kayıt yalnız taslak durumundayken düzenlenebilir.", severity: "warning", category: "invalid_transition" },
  YEBS_CONCEPT_STATUS_LOCKED: { title: "Düzenleme kilitli", message: "Bu kavram yalnız taslak durumundayken alanları/etiketleri düzenlenebilir.", severity: "warning", category: "invalid_transition" },
  YEBS_SOURCE_STATUS_LOCKED: { title: "Düzenleme kilitli", message: "Bu kaynak yalnız taslak durumundayken düzenlenebilir.", severity: "warning", category: "invalid_transition" },
  YEBS_CLAIM_STATUS_LOCKED: { title: "Düzenleme kilitli", message: "Bu iddia yalnız taslak durumundayken düzenlenebilir.", severity: "warning", category: "invalid_transition" },
  YEBS_CONCEPT_RELATION_STATUS_LOCKED: { title: "Düzenleme kilitli", message: "Bu ilişki yalnız taslak durumundayken düzenlenebilir.", severity: "warning", category: "invalid_transition" },
  YEBS_CLAIM_SOURCE_PARENT_STATUS_LOCKED: { title: "İşlem kilitli", message: "Bağlı iddia yayın sürecinde olduğundan bu kanıt işlemi yapılamaz.", severity: "warning", category: "invalid_transition" },
  YEBS_RELATION_SOURCE_PARENT_STATUS_LOCKED: { title: "İşlem kilitli", message: "Bağlı ilişki yayın sürecinde olduğundan bu kanıt işlemi yapılamaz.", severity: "warning", category: "invalid_transition" },

  // ---- evidence edit-lock ----
  YEBS_CLAIM_SOURCE_VERIFICATION_LOCKED: { title: "Kanıt kilitli", message: "Doğrulanmış/reddedilmiş kanıtın içeriği değiştirilemez.", suggestedAction: "Düzenlemek için önce kanıtı 'Doğrulanmadı' durumuna alın.", severity: "warning", category: "evidence" },
  YEBS_RELATION_SOURCE_VERIFICATION_LOCKED: { title: "Kanıt kilitli", message: "Doğrulanmış/reddedilmiş kanıtın içeriği değiştirilemez.", suggestedAction: "Düzenlemek için önce kanıtı 'Doğrulanmadı' durumuna alın.", severity: "warning", category: "evidence" },

  // ---- dependency ----
  YEBS_PUBLISH_DEPENDENCY_BLOCKED: { title: "Bağımlılık engeli", message: "Bağlı yayımlanmış kayıtlar nedeniyle bu işlem yapılamıyor.", suggestedAction: "Önce bağlı yayımlanmış kayıtları geri çekin.", severity: "warning", category: "dependency" },

  // ---- parent readiness / structural ----
  YEBS_TRADITION_NOT_PUBLISH_READY: { title: "Yayına hazır değil", message: "Geleneğin yayımlanabilmesi için ad, kısa ad ve tür alanları eksiksiz olmalıdır.", severity: "warning", category: "metadata" },
  YEBS_SCHOOL_NOT_PUBLISH_READY: { title: "Yayına hazır değil", message: "Ekolün yayımlanabilmesi için ad ve kısa ad alanları eksiksiz olmalıdır.", severity: "warning", category: "metadata" },
  YEBS_CONCEPT_NOT_PUBLISH_READY: { title: "Yayına hazır değil", message: "Kavramın yayımlanabilmesi için kısa ad ve tür alanları eksiksiz olmalıdır.", severity: "warning", category: "metadata" },
  YEBS_SCHOOL_PARENT_TRADITION_NOT_PUBLISHED: { title: "Üst gelenek yayında değil", message: "Bu ekol yayımlanamaz; bağlı olduğu gelenek henüz yayımlanmamış.", suggestedAction: "Önce üst geleneği yayımlayın.", severity: "warning", category: "parent_readiness" },
  YEBS_CONCEPT_PARENT_NOT_PUBLISHED: { title: "Üst kayıt yayında değil", message: "Bu kavram yayımlanamaz; bağlı gelenek (ve varsa ekol) henüz yayımlanmamış.", suggestedAction: "Önce üst gelenek/ekolü yayımlayın.", severity: "warning", category: "parent_readiness" },
  YEBS_CLAIM_PARENT_CONCEPT_NOT_PUBLISHED: { title: "Üst kavram yayında değil", message: "Bu iddia yayımlanamaz; bağlı kavram henüz yayımlanmamış.", suggestedAction: "Önce üst kavramı yayımlayın.", severity: "warning", category: "parent_readiness" },
  YEBS_RELATION_PARENT_CONCEPT_NOT_PUBLISHED: { title: "Kavramlar yayında değil", message: "Bu ilişki yayımlanamaz; kaynak ve hedef kavramların ikisi de yayımlanmış olmalıdır.", suggestedAction: "Önce her iki kavramı yayımlayın.", severity: "warning", category: "parent_readiness" },

  // ---- concept label ----
  YEBS_CONCEPT_REQUIRED_LABEL_MISSING: { title: "Ana etiket gerekli", message: "Kavramın yayımlanabilmesi için en az bir ana (birincil) etiket gerekir.", suggestedAction: "Etiketler sekmesinden bir birincil etiket ekleyin.", severity: "warning", category: "concept_label" },
  YEBS_LABEL_DUPLICATE: { title: "Yinelenen etiket", message: "Aynı dil/yazı/tür ile bu etiket zaten mevcut.", severity: "warning", category: "concept_label" },
  YEBS_LABEL_PRIMARY_CONFLICT: { title: "Birincil etiket çakışması", message: "Bu dil için zaten bir birincil etiket var. Bir dilde yalnız bir birincil etiket olabilir.", severity: "warning", category: "concept_label" },
  YEBS_INVALID_LABEL_INPUT: { title: "Geçersiz etiket", message: "Etiket alanları geçersiz.", severity: "error", category: "validation" },

  // ---- source metadata ----
  YEBS_SOURCE_METADATA_INCOMPLETE: { title: "Üstveri eksik", message: "Kaynağın yayımlanabilmesi için türüne özgü zorunlu künye alanları eksiksiz olmalıdır.", suggestedAction: "Kaynak türüne göre işaretli zorunlu alanları doldurun.", severity: "warning", category: "metadata" },
  YEBS_SOURCE_DOI_DUPLICATE: { title: "Yinelenen DOI", message: "Bu DOI ile başka bir kaynak zaten kayıtlı.", severity: "warning", category: "validation" },
  YEBS_SOURCE_PMID_DUPLICATE: { title: "Yinelenen PMID", message: "Bu PMID ile başka bir kaynak zaten kayıtlı.", severity: "warning", category: "validation" },

  // ---- evidence / source readiness (claim) ----
  YEBS_CLAIM_NO_VERIFIED_EVIDENCE: { title: "Doğrulanmış kanıt yok", message: "İddia doğrulanamaz; destekleyici rolde doğrulanmış hiçbir kanıt yok.", suggestedAction: "Kanıt ekleyip doğrulayın.", severity: "warning", category: "evidence" },
  YEBS_CLAIM_SUPPORT_SOURCE_NOT_READY: { title: "Kaynak hazır değil", message: "Doğrulanmış destek var ama bağlı kaynak henüz onaylanmamış/yayımlanmamış.", suggestedAction: "İlgili kaynağı onaylayın veya yayımlayın.", severity: "warning", category: "source_readiness" },
  YEBS_CLAIM_NOT_APPROVAL_READY: { title: "Onaya hazır değil", message: "İddia onaylanamaz; onaylı/yayımlı kaynağa bağlı doğrulanmış nitelikli kanıt bulunmuyor.", severity: "warning", category: "evidence" },
  YEBS_CLAIM_PROVENANCE_INCOMPLETE: { title: "Köken eksik", message: "İddia yayımlanamaz; yayımlanmış kaynağa dayanan nitelikli doğrulanmış kanıt bulunmuyor.", suggestedAction: "Bağlı kaynağı yayımlayın.", severity: "warning", category: "source_readiness" },

  // ---- evidence / source readiness (relation) ----
  YEBS_RELATION_NO_VERIFIED_EVIDENCE: { title: "Doğrulanmış kanıt yok", message: "İlişki doğrulanamaz; destekleyici rolde doğrulanmış hiçbir kanıt yok.", suggestedAction: "Kanıt ekleyip doğrulayın.", severity: "warning", category: "evidence" },
  YEBS_RELATION_SUPPORT_SOURCE_NOT_READY: { title: "Kaynak hazır değil", message: "Doğrulanmış destek var ama bağlı kaynak henüz onaylanmamış/yayımlanmamış.", suggestedAction: "İlgili kaynağı onaylayın veya yayımlayın.", severity: "warning", category: "source_readiness" },
  YEBS_RELATION_NOT_APPROVAL_READY: { title: "Onaya hazır değil", message: "İlişki onaylanamaz; onaylı/yayımlı kaynağa bağlı doğrulanmış nitelikli kanıt bulunmuyor.", severity: "warning", category: "evidence" },
  YEBS_RELATION_PROVENANCE_INCOMPLETE: { title: "Köken eksik", message: "İlişki yayımlanamaz; yayımlanmış kaynağa dayanan nitelikli doğrulanmış kanıt bulunmuyor.", suggestedAction: "Bağlı kaynağı yayımlayın.", severity: "warning", category: "source_readiness" },

  // ---- graph cycle ----
  YEBS_RELATION_GRAPH_CYCLE: { title: "Döngü engeli", message: "Bu ilişki mevcut hiyerarşide döngü oluşturacağı için yayımlanamaz.", suggestedAction: "Çelişen üst/alt ilişkileri gözden geçirin.", severity: "warning", category: "graph_cycle" },

  // ---- relation create/update conflicts ----
  YEBS_CONCEPT_RELATION_HAS_SOURCES: { title: "Kanıt bağlı", message: "Bu ilişkiye kanıt bağlıyken ilişki türü değiştirilemez.", suggestedAction: "Önce bağlı kanıtları kaldırın.", severity: "warning", category: "invalid_transition" },
  YEBS_CONCEPT_RELATION_MIRROR_DUPLICATE: { title: "Ayna yineleme", message: "Bu iki kavram arasında ters yönlü eşdeğer ilişki zaten var.", severity: "warning", category: "validation" },
  YEBS_CONCEPT_RELATION_HIERARCHY_DUPLICATE: { title: "Hiyerarşi yinelemesi", message: "Bu hiyerarşik ilişki zaten mevcut.", severity: "warning", category: "validation" },
  YEBS_CONCEPT_RELATION_HIERARCHY_CONFLICT: { title: "Hiyerarşi çelişkisi", message: "Bu ilişki mevcut hiyerarşiyle çelişiyor.", severity: "warning", category: "validation" },
  YEBS_CONCEPT_RELATION_CROSS_TRADITION: { title: "Gelenekler arası", message: "Bu ilişki türü farklı gelenekteki kavramlar arasında kurulamaz.", severity: "warning", category: "validation" },
};

/** Kod → Türkçe meta (bilinmiyorsa güvenli fallback). */
export function codeMeta(code: string | null | undefined): YebsCodeMeta {
  if (!code) return GENERIC_FALLBACK;
  return YEBS_CODE_DICTIONARY[code] ?? GENERIC_FALLBACK;
}

/** Blocker kodu → kısa kullanıcı cümlesi (eligibility paneli listesi için). */
export function blockerText(code: string): string {
  return (YEBS_CODE_DICTIONARY[code] ?? GENERIC_FALLBACK).message;
}
