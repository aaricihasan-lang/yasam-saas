/**
 * lib/archive/types.ts — Premium Word Arşivi ortak tipleri (SAF; istemci + sunucu).
 *
 * Arşiv TARAYICIDA parça parça kurulur: sunucu önce bir plan (iş listesi) döner, sonra her iş için küçük bir
 * Word / dosya parçası üretir. Sunucu istemcinin gönderdiği işe GÜVENMEZ: her parça isteğinde tenant, uzman
 * sahipliği, danışan süzgeci ve izinler yeniden doğrulanır.
 */

import type { CodedMessage } from "@/lib/backup/types";

export const ARCHIVE_PLAN_VERSION = 1;
/** Danışan seçimi üst sınırı (PostgREST `in` filtresi + toplu Word kuralı ile aynı). */
export const ARCHIVE_CLIENT_FILTER_MAX = 100;
/** Bir planda en fazla iş (rapor + dosya + veri parçası). Aşılırsa kapsam daraltma istenir. */
export const ARCHIVE_MAX_JOBS = 20_000;

export type ArchiveInclude = {
  /** Modül kayıtlarının okunabilir Word dökümü (registry tabloları). */
  data: boolean;
  /** Danışan dosyası (Danışan Yolculuğu tam raporu) — danışan başına. */
  dossiers: boolean;
  /** Kayıtlı hazır analiz raporları (HD profesyonel, HD İlişki, Gökyüzü Atlası, Numeroloji kayıtları). */
  reports: boolean;
  /** Fotoğraf ve ek dosyalar (ayrı dosya olarak; Word'e gömülmez). */
  files: boolean;
  /** Danışan dosyasında hassas bölümler: anamnez, beslenme özeti, iç notlar, ücretlendirme. */
  sensitive: boolean;
};

export type ArchiveOptions = {
  /** Registry modül anahtarları (EXPORT_MODULE_ORDER içinden). */
  modules: string[];
  /** null → tüm danışanlar / danışandan bağımsız kayıtlar dahil. */
  clientIds: string[] | null;
  /** YYYY-MM-DD (Europe/Istanbul takvim günü, dahil). */
  dateFrom: string | null;
  dateTo: string | null;
  include: ArchiveInclude;
};

export type ArchiveFileSource = "analysis_image" | "stone_photo" | "anamnez_pdf" | "archive_file";

/**
 * I18N: `label` (Türkçe; ARŞİV-RAPORU.txt'ye ve klasör adlarına yazılır) AYNEN kalır. `display` yalnız ekran içindir:
 * dil-bağımsız kod + parametre (kullanıcı içeriği — danışan adı, rapor başlığı, dosya adı — parametrede ham).
 * Sunucu `display`'e güvenmez / okumaz (parseJob yalnız kimlik alanlarını alır).
 */
type JobDisplay = { display?: CodedMessage };

export type ArchiveJob = JobDisplay &
  (
    | { kind: "data"; module: string; label: string; folder: string; expected: number }
    | { kind: "client_dossier"; clientId: string; label: string; folder: string }
    | { kind: "numerology_record"; clientId: string | null; recordId: string; label: string; folder: string }
    | { kind: "hd_report"; reportId: string; label: string; folder: string }
    | { kind: "hd_relation_report"; reportId: string; label: string; folder: string }
    | { kind: "astro_report"; analysisId: string; label: string; folder: string }
    | { kind: "file"; source: ArchiveFileSource; rowId: string; index: number; label: string; folder: string }
    /** Kayda bağlı kullanıcı görselleri (depolama yolu veya gömülü data: URI) — satır başına, görsel görsel indirilir. */
    | { kind: "media"; table: string; rowId: string; label: string; folder: string }
  );

/**
 * Kapsam notu. `scope` / `reason` Türkçe metin AYNEN (BENİOKU.txt'ye yazılır). I18N: `scope_code` / `reason_code`
 * dil-bağımsız EK alanlar — yalnız ekran için; arşiv dosyalarına yazılmaz.
 */
export type ArchiveScopeNote = { scope: string; reason: string; scope_code?: CodedMessage; reason_code?: CodedMessage };

export type ArchivePlanResponse = {
  ok: true;
  version: number;
  archive_id: string;
  created_at: string;
  file_name: string;
  options: ArchiveOptions;
  jobs: ArchiveJob[];
  /** Modül → (tablo etiketi → kayıt sayısı) özet (yalnız veri dökümü). */
  summary: { module: string; label: string; records: number; tables: { label: string; records: number }[] }[];
  /** Kapsam dışı kalanlar (gerekçeli; arayüz ve arşivdeki BENİOKU dosyası bunları açıkça yazar). */
  excluded: ArchiveScopeNote[];
  /**
   * Kullanıcıya AİT olup cihaz / yetki nedeniyle arşive alınamayan içerik (ör. Android'de HD Word, modül yetkisi yok).
   * Boş değilse arşiv "tamamlandı" gösterilmez (EKSİK + gerekçe).
   */
  restricted?: ArchiveScopeNote[];
  /** Kullanıcının seçimleriyle kapsam dışı kalanlar (eksiklik DEĞİL; arşiv durumunu etkilemez, açıklamalı gösterilir). */
  preferences?: ArchiveScopeNote[];
  warnings: string[];
  /** I18N: `warnings` ile aynı sırada dil-bağımsız kodlar (EK alan; BENİOKU.txt Türkçe `warnings`'i yazar). */
  warning_codes?: CodedMessage[];
  /**
   * I18N (A16): arşiv DOSYA dili — planda bir kez çözülür; istemci her parça isteğinde aynen geri gönderir. Sunucu
   * yalnız etkin bir dil kabul eder (yayın kapısı kapalı / geçersiz → tr). Dil bir yetki değildir.
   */
  file_locale?: string;
};

/** Veri parçası durum belirteci (opak; sunucu doğrular) — t: tablo sırası · c: tablo içi imleç · n: bölüm no · i: bu tablodan önceki bölümlerde yazılan kayıt (numaralandırma). */
export type DataPartState = { t: number; c: string | null; n: number; i: number };

export type ArchivePartHeaders = {
  next: string | null;
  rows: number;
  incomplete: boolean;
  note: string | null;
};
