"use client";

import { AromaterapiFormSection } from "@/app/aromaterapi/_components/write/AromaterapiFormShell";
import { EnumSelect, TextField, enumOptions } from "@/app/aromaterapi/_components/write/KnowledgeRecordFields";
import { MATERIAL_STATE_TR } from "@/lib/aromaterapi/readLabels";
import {
  MethodStepsEditor,
  type MethodContentState,
  type StepDraft,
} from "@/app/aromaterapi/katalog/_components/MethodStepsEditor";

/**
 * C3D-B2B — Üretim/Elde Ediliş yöntemi İÇERİK bölümleri (seri oluşturma + yeni revizyon ortak).
 * Progressive disclosure: kritik alan (Ana Yöntem Metni) her zaman görünür; ayrıntılar
 * mantıklı bölümlerde gruplanır. Masaüstünde 2 kolon, mobilde tek kolon.
 */

const MATERIAL_STATE_OPTIONS = enumOptions(["fresh", "dried", "other"], MATERIAL_STATE_TR);

export function MethodContentSections({
  content,
  setField,
  steps,
  setSteps,
  disabled = false,
  methodTextError,
}: {
  content: MethodContentState;
  setField: (k: keyof MethodContentState, v: string) => void;
  steps: StepDraft[];
  setSteps: (next: StepDraft[]) => void;
  disabled?: boolean;
  methodTextError?: string | null;
}) {
  return (
    <>
      <AromaterapiFormSection title="Yöntem Özeti" hint="Ne, hangi durumdaki materyalden, nasıl elde ediliyor.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label="Kullanılan Bitki Kısmı" value={content.plant_part_used} onChange={(v) => setField("plant_part_used", v)} disabled={disabled} maxLength={160} placeholder="ör. taze çiçekli dal uçları" />
          <EnumSelect label="Malzemenin Durumu" value={content.material_state} onChange={(v) => setField("material_state", v)} options={MATERIAL_STATE_OPTIONS} disabled={disabled} allLabel="Belirtilmedi" />
        </div>
        <TextField label="Ana Yöntem Metni" value={content.method_text} onChange={(v) => setField("method_text", v)} required error={methodTextError} disabled={disabled} multiline rows={5} maxLength={8000} hint="Yöntemin serbest metin anlatımı (zorunlu)." />
      </AromaterapiFormSection>

      <AromaterapiFormSection title="Uygulama Ayrıntıları" hint="Varsa teknik parametreler (opsiyonel).">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label="Ekipman" value={content.equipment} onChange={(v) => setField("equipment", v)} disabled={disabled} maxLength={500} placeholder="ör. cam imbik, su banyosu" />
          <TextField label="Miktar / Oran" value={content.amount_ratio} onChange={(v) => setField("amount_ratio", v)} disabled={disabled} maxLength={500} placeholder="ör. 1:5 (bitki:çözücü)" />
          <TextField label="Çözücü / Taşıyıcı" value={content.solvent_carrier} onChange={(v) => setField("solvent_carrier", v)} disabled={disabled} maxLength={500} placeholder="ör. %40 etanol / jojoba yağı" />
          <TextField label="Süre" value={content.duration_text} onChange={(v) => setField("duration_text", v)} disabled={disabled} maxLength={500} placeholder="ör. 3 hafta" />
          <TextField label="Sıcaklık" value={content.temperature_text} onChange={(v) => setField("temperature_text", v)} disabled={disabled} maxLength={500} placeholder="ör. oda sıcaklığı / 60–65°C" />
        </div>
      </AromaterapiFormSection>

      <AromaterapiFormSection title="Sıralı Adımlar" hint="İşlem sırası önemliyse adım adım yazın (opsiyonel).">
        <MethodStepsEditor steps={steps} onChange={setSteps} disabled={disabled} />
      </AromaterapiFormSection>

      <AromaterapiFormSection title="Saklama ve Kalite" hint="Süzme, dinlendirme, saklama ve kalite kontrol notları (opsiyonel).">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label="Filtrasyon (Süzme)" value={content.filtration} onChange={(v) => setField("filtration", v)} disabled={disabled} maxLength={500} />
          <TextField label="Dinlendirme" value={content.resting} onChange={(v) => setField("resting", v)} disabled={disabled} maxLength={500} />
          <TextField label="Saklama" value={content.storage} onChange={(v) => setField("storage", v)} disabled={disabled} maxLength={500} placeholder="ör. koyu cam, serin ve karanlık" />
        </div>
        <TextField label="Kalite Kontrol Notları" value={content.quality_notes} onChange={(v) => setField("quality_notes", v)} disabled={disabled} multiline rows={3} maxLength={4000} />
      </AromaterapiFormSection>

      <AromaterapiFormSection title="Güvenlik" hint="Güvenlik uyarıları ve kısıtlar (opsiyonel).">
        <TextField label="Güvenlik Notları" value={content.safety_notes} onChange={(v) => setField("safety_notes", v)} disabled={disabled} multiline rows={3} maxLength={4000} />
      </AromaterapiFormSection>
    </>
  );
}
