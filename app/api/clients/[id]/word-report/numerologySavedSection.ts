/**
 * AŞAMA 2 / DY-005 · DY-006 — Kayıtlı Numeroloji analizinin danışan Word raporundaki bölümü (SAF).
 *
 * KURALLAR:
 *  - Numeroloji motoru ÇAĞRILMAZ; kayıt "Model C" ile, kaydedildiği günkü snapshot'tan okunur
 *    (`resolveRecordMotor` — Numeroloji ekranı / Word ile aynı tek kaynak).
 *  - Kayıt danışana İSİM / DOĞUM TARİHİNE GÖRE EŞLEŞTİRİLMEZ. Hangi kaydın ekleneceğini uzman açıkça
 *    seçer (route `numerologyRecordId`); kaydın kendi ad / doğum tarihi belgede açıkça yazılır.
 *  - Snapshot okunamazsa yeniden hesap YOK → yalnız "okunamadı" notu.
 */
import type { ReportChild } from "@/lib/docx/reportHelpers";
import { formatDateOnly, formatInstantDateTime } from "@/lib/time/reportTime";
import { LEGACY_METHOD_NOTE, resolveRecordMotor } from "@/app/numeroloji/utils/analysisJson";
import { nrDisplay, pinOneLine } from "@/app/numeroloji/utils/numerolojiPlainMetin";
import { dyGap, dyKvTable, dyNote } from "./clientReportLayout";

/** numerology_records satırının bu bölüm için okunan alanları (tenant-kapsamlı okuma route'ta). */
export type SavedNumerologyRow = {
  id: string;
  name?: string | null;
  surname?: string | null;
  birth_date?: string | null;
  created_at?: string | null;
  analysis_data?: unknown;
};

export const SAVED_NUMEROLOGY_COLUMNS = "id, name, surname, birth_date, created_at, analysis_data";

const SNAPSHOT_UNREADABLE = "Bu kayıtlı numeroloji analizinin içeriği okunamadı; değerler yeniden hesaplanmadı.";

/** Kayıtlı doğum tarihi metnini (ISO veya serbest) değiştirmeden okunur gösterir. */
function birthLabel(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? formatDateOnly(s, { style: "long", fallback: s }) : s;
}

export function buildSavedNumerologySection(row: SavedNumerologyRow, color: string): ReportChild[] {
  const fullName = [row.name, row.surname].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  const savedAt = row.created_at ? formatInstantDateTime(row.created_at) : "";
  const { motor, legacy } = resolveRecordMotor(row);

  const out: ReportChild[] = [];
  out.push(dyNote(
    `Numeroloji modülündeki kayıtlı analizden, kaydedildiği haliyle aktarılmıştır${savedAt ? ` (kayıt: ${savedAt})` : ""}. ` +
    "Analiz bu rapor için uzman tarafından seçilmiştir.",
  ));
  const meta = dyKvTable(
    ([
      ["Analizdeki Ad Soyad", fullName],
      ["Analizdeki Doğum Tarihi", birthLabel(row.birth_date)],
    ] as [string, string][]).filter(([, v]) => !!v),
    { cols: 2, labelColor: color },
  );
  if (meta) out.push(meta, dyGap());

  if (!motor) {
    out.push(dyNote(SNAPSHOT_UNREADABLE));
    return out;
  }

  let pin = "";
  try { pin = motor.pinKodu ? pinOneLine(motor.pinKodu) : ""; } catch { pin = ""; }
  const core = ([
    ["Ana Kulvar", nrDisplay(motor.anaKulvar)],
    ["Yan Kulvar", nrDisplay(motor.yanKulvar)],
    ["İfade Sayısı", nrDisplay(motor.ifadeSayisi)],
    ["Hayat Yolu", nrDisplay(motor.hayatYolu)],
  ] as [string, string][]).filter(([, v]) => v && v !== "—");
  const coreTable = dyKvTable(core, { cols: 4, labelColor: color });
  if (coreTable) out.push(coreTable, dyGap());
  const pinTable = pin ? dyKvTable([["PIN Kodu", pin]], { cols: 2, labelColor: color }) : null;
  if (pinTable) out.push(pinTable, dyGap());
  if (legacy) out.push(dyNote(LEGACY_METHOD_NOTE));
  return out;
}
