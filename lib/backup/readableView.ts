/**
 * lib/backup/readableView.ts — OKUNABİLİR çıktılar (Word / okunabilir arşiv) için sunucu tarafı görünüm kuralı
 * (Owner kararı A3 / QA-N-01, I18N-F1-R5).
 *
 * İki amaç AYRIDIR:
 *   1. TEKNİK YEDEK (JSON Sistem Yedeği, `/api/settings/backup/table`): eksiksiz geri yükleme içindir; satırlar
 *      HAM taşınır, hiçbir alan silinmez / eksiltilmez. Bu dosya o yolu ETKİLEMEZ.
 *   2. KULLANICININ OKUYACAĞI SUNUM ÇIKTILARI (Ayarlar › Dışa Aktarım "Okunabilir Arşiv" Word'ü ve Premium Word
 *      Arşivi "Kayıt Dökümü" parçaları): ekran ve modül raporlarıyla AYNI yetki kuralına uyar:
 *        - Numeroloji "Gelecek Yılları Göster" (numerology modülü + numerology_future_years; admin her zaman):
 *          yetki yoksa `numerology_records.analysis_data` görüntüleme KOPYASI, analyses API'sinin kullandığı
 *          `redactAnalysisDataForFutureYears` ile süzülür (başlamamış Değişim / Zirve / Mücadele / Harf dönemleri
 *          çıkarılır). Yer tutucu sayılar (999 / 9999 / -1) okunabilir belgede "gizli" etiketiyle yazılır.
 *        - Human Design "Sistem Yorumu" (hd_system_reading): yetki yoksa `human_design_reports.snapshot`
 *          görüntüleme kopyasından Sistem Yorumu çıkarılır (HD rapor indirmesiyle aynı `applyDownloadPermissions`).
 *
 * Kurallar: veritabanındaki kayıt DEĞİŞMEZ (kopya); yetkili görünümde satırlar AYNI dizi/nesne olarak döner
 * (çıktı bayt-bayt aynı); yetki kararı YALNIZ sunucuda doğrulanmış profilden (istemci değeri yetki sayılmaz);
 * profil yoksa / okunamazsa KISITLI görünüm (fail-closed).
 *
 * Yapısal doğum yılı çözücüsü: bu dosya çözücüyü KOPYALAMAZ; `redactAnalysisDataForFutureYears` imzası üzerinden
 * çağırır. #857 (Numeroloji) birleştiğinde aynı fonksiyon `chronoBirth.resolveChronoBirth` ile güçlenir; bu
 * dosyada değişiklik gerekmez.
 */
import { canSeeNumerologyFutureYears } from "@/app/numeroloji/utils/futureYearsAccess";
import {
  REDACTED_FUTURE_AGE,
  REDACTED_FUTURE_YEAR,
  REDACTED_TOPIC,
  redactAnalysisDataForFutureYears,
} from "@/app/numeroloji/utils/futureYearsRedaction";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { applyDownloadPermissions, isHdReportSnapshotV2 } from "@/lib/human-design/reporting/reportSnapshotV2";
import { currentIstanbulYear } from "@/lib/numeroloji/currentYear";

type Row = Record<string, unknown>;

export type ReadableView = {
  /** Sunucuda doğrulanmış Numeroloji "Gelecek Yılları Göster" yetkisi. */
  numerologyFutureYears: boolean;
  /** Sunucuda doğrulanmış HD Sistem Yorumu yetkisi. */
  hdSystemReading: boolean;
  /** Europe/Istanbul içinde bulunulan yıl (gelecek dönem sınırı). */
  currentYear: number;
};

export type ReadableViewCounts = { numerologyRedacted: number; hdSystemReadingRedacted: number };

/** Doğrulanmış profilden okunabilir çıktı görünümü. Profil yok → kısıtlı (fail-closed). */
export function readableViewFor(profile: Record<string, unknown> | null | undefined, now: Date = new Date()): ReadableView {
  return {
    numerologyFutureYears: canSeeNumerologyFutureYears(profile ?? null),
    hdSystemReading: profile ? hasModulePermissionForProfile(profile, "hd_system_reading") : false,
    currentYear: currentIstanbulYear(now),
  };
}

/** Kısıtlı görünüm (çağıran görünüm vermezse kullanılır). */
export function restrictedReadableView(now: Date = new Date()): ReadableView {
  return { numerologyFutureYears: false, hdSystemReading: false, currentYear: currentIstanbulYear(now) };
}

const isObj = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);

const AGE_KEYS = new Set(["age", "yasMetot1", "yasMetot2", "ageStart", "ageEnd", "anaMucadeleBaslangicYasi", "cutoffAge", "startAge"]);
const YEAR_KEYS = new Set(["yearStart", "yearEnd"]);

/**
 * Yer tutucu sayıları ("bu dönem gizli": yaş 999, yıl 9999, ana mücadele -1) okunabilir belgede gerçek sonuç gibi
 * görünmesin diye `hiddenLabel` metniyle değiştirir. Yalnız redaksiyonun yazdığı anahtarlar; diğer sayılar aynen.
 */
function labelPlaceholders(v: unknown, hiddenLabel: string): unknown {
  if (Array.isArray(v)) return v.map((x) => labelPlaceholders(x, hiddenLabel));
  if (!isObj(v)) return v;
  const out: Row = {};
  for (const [k, x] of Object.entries(v)) {
    if (AGE_KEYS.has(k) && x === REDACTED_FUTURE_AGE) out[k] = hiddenLabel;
    else if (YEAR_KEYS.has(k) && x === REDACTED_FUTURE_YEAR) out[k] = hiddenLabel;
    else if (k === "anaMucadele" && x === REDACTED_TOPIC) out[k] = hiddenLabel;
    else out[k] = labelPlaceholders(x, hiddenLabel);
  }
  return out;
}

function numerologyReadable(analysisData: unknown, birthDate: unknown, view: ReadableView, hiddenLabel: string): unknown {
  const red = redactAnalysisDataForFutureYears(analysisData, {
    futureYears: false,
    currentYear: view.currentYear,
    birthDate: typeof birthDate === "string" ? birthDate : null,
  });
  if (red === analysisData || !isObj(red)) return red;
  // Görüntüleme işareti (`futureYearsView`) istemci bileşenleri içindir; okunabilir belgede ayrı not yazılır.
  const { futureYearsView: _marker, ...rest } = red;
  void _marker;
  return { ...rest, motor: labelPlaceholders(rest.motor, hiddenLabel) };
}

/**
 * Okunabilir çıktı için satır görünümü. Yetkili görünümde (ya da tablo kurala tabi değilse) AYNI `rows` dizisi
 * döner. `hiddenLabel`: yer tutucuların belgedeki karşılığı (çıktı dilinde; TR "gizli").
 */
export function applyReadableView(
  table: string,
  rows: Row[],
  view: ReadableView,
  hiddenLabel = "gizli",
): { rows: Row[]; counts: ReadableViewCounts } {
  const counts: ReadableViewCounts = { numerologyRedacted: 0, hdSystemReadingRedacted: 0 };
  if (table === "numerology_records" && !view.numerologyFutureYears) {
    const out = rows.map((r) => {
      if (!isObj(r) || !isObj(r.analysis_data) || !isObj(r.analysis_data.motor)) return r;
      counts.numerologyRedacted++;
      return { ...r, analysis_data: numerologyReadable(r.analysis_data, r.birth_date, view, hiddenLabel) };
    });
    return { rows: out, counts };
  }
  if (table === "human_design_reports" && !view.hdSystemReading) {
    const out = rows.map((r) => {
      if (!isObj(r) || !isHdReportSnapshotV2(r.snapshot)) return r;
      const v = applyDownloadPermissions(r.snapshot, false);
      if (!v.systemReadingRedacted) return r;
      counts.hdSystemReadingRedacted++;
      return { ...r, snapshot: v.snapshot };
    });
    return { rows: out, counts };
  }
  return { rows, counts };
}

/** Görünüm kuralı bir kaydı daralttıysa belgeye yazılan açıklama (yetkili görünümde not yok → çıktı aynı). */
export function readableViewNotes(
  c: ReadableViewCounts,
  text: { noteNumerologyHidden: string; noteHdSystemReadingHidden: string },
): string[] {
  const out: string[] = [];
  if (c.numerologyRedacted > 0) out.push(text.noteNumerologyHidden);
  if (c.hdSystemReadingRedacted > 0) out.push(text.noteHdSystemReadingHidden);
  return out;
}

export function addReadableCounts(a: ReadableViewCounts, b: ReadableViewCounts): ReadableViewCounts {
  return {
    numerologyRedacted: a.numerologyRedacted + b.numerologyRedacted,
    hdSystemReadingRedacted: a.hdSystemReadingRedacted + b.hdSystemReadingRedacted,
  };
}
