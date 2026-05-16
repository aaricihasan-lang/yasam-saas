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
};

export type ClinicalNoteFormDraft = {
  title: string;
  date: string;
  content: string;
  attachments: NoteAttachment[];
};

export type ClinicalNotesTab = "kayit" | "liste";
