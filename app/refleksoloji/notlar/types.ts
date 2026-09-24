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
};

export type ClinicalNoteFormDraft = {
  title: string;
  date: string;
  content: string;
  attachments: NoteAttachment[];
};

export type ClinicalNotesTab = "kayit" | "liste";
