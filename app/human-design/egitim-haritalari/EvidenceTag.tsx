/**
 * FAZ 19 — doğum saati kaynak etiketi (katalog kartı + kişi ayrıntısı). Sabit "Belgeli doğum saati" YERİNE kayıtlı kaynak
 * düzeyinden türetilir (lib/human-design/education/birthEvidence.ts); yalnız verinin desteklediğini söyler.
 */
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import { EDU_BIRTH_EVIDENCE_HINT, EDU_BIRTH_EVIDENCE_LABEL, type EduBirthTimeEvidence } from "@/lib/human-design/education/birthEvidence";

const TONE: Readonly<Record<EduBirthTimeEvidence, string>> = {
  birincil_goruldu: base.tOk, ayna_goruldu: base.tInfo, birincil_kaynak: base.tInfo, aktarim: base.tWarn, kaynakli: base.tLine,
};

export function EvidenceTag({ value }: { value: EduBirthTimeEvidence | null | undefined }) {
  const v: EduBirthTimeEvidence = value && value in EDU_BIRTH_EVIDENCE_LABEL ? value : "kaynakli";
  return (
    <span className={`${base.tag} ${TONE[v]}`} title={EDU_BIRTH_EVIDENCE_HINT[v]} data-edu-birth-evidence={v}>{EDU_BIRTH_EVIDENCE_LABEL[v]}</span>
  );
}
