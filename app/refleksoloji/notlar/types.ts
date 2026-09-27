export type NoteAttachment = {
  id: string;
  displayName: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

export type SavedClinicalNote = {
  id: string;
  title: string;
  date: string;
  content: string;
  attachments: NoteAttachment[];
  createdAt: string;
  updatedAt: string;
  /**
   * REF-003: istemcinin en son GÖZLEMLEDİĞİ server `updated_at` kolonu (CAS beklenen
   * sürümü). Sunucudan hydrate'te set edilir; yeni/hiç senkronlanmamış notta
   * tanımsızdır. Yerel düzenleme bunu DEĞİŞTİRMEZ (yalnız `updatedAt` artar) —
   * böylece bir sonraki PUT eş-zamanlı düzenlemede doğru sürümle CAS yapar.
   */
  baseUpdatedAt?: string;
  /**
   * FA-03: yerelde değişmiş, sunucu onayı henüz alınmamış not. Yalnız kirli notlar
   * sunucuya gönderilir (tüm liste değil). Yalnız yerel depoda yaşar; sunucuya gitmez.
   */
  dirty?: boolean;
  /** FA-03: sunucu bu notu reddetti (ör. geçersiz ek) — kullanıcı düzenleyene dek yeniden gönderilmez. */
  syncRejected?: string;
};

export type ClinicalNoteFormDraft = {
  title: string;
  date: string;
  content: string;
  attachments: NoteAttachment[];
};

export type ClinicalNotesTab = "kayit" | "liste";
