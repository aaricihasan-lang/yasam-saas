"use client";

import type { PickerItem } from "@/app/aromaterapi/_components/write/EntitySearchPicker";
import {
  ChildGroupShell,
  EnumSelect,
  NumberField,
  RowShell,
  TextField,
  enumOptions,
} from "@/app/aromaterapi/_components/write/KnowledgeRecordFields";
import {
  PassagePicker,
  RelatedRecordPicker,
  SourcePicker,
} from "@/app/aromaterapi/_components/write/KnowledgeRecordPickers";
import type {
  PassageRow,
  PopRow,
  RelationRow,
  RouteRow,
  SourceRow,
} from "@/app/aromaterapi/_components/write/useKnowledgeRecordForm";
import type { PassageListItem } from "@/lib/aromaterapi/readTypes";
import {
  ROUTE_CODES,
  POPULATION_CODES,
  SOURCE_ROLES,
  VERIFICATION_STATUSES,
  EVIDENCE_RELATIONS,
  RELATION_TYPES,
} from "@/lib/aromaterapi/claimFormConfig";
import {
  ROUTE_CODE_TR,
  POPULATION_CODE_TR,
  SOURCE_ROLE_TR,
  VERIFICATION_STATUS_TR,
  EVIDENCE_RELATION_TR,
  RELATION_TYPE_TR,
} from "@/lib/aromaterapi/readLabels";

/**
 * Aromaterapi V2 — C3D-D Bilgi Kaydı child editörleri.
 * Her düzenleme markTouched ile grubu "değişti" işaretler → update'te preserve/clear/
 * replace doğru uygulanır. Salt sunum + mevcut C3C read (picker'lar).
 */

type Form = {
  routes: RouteRow[]; setRoutes: (u: (r: RouteRow[]) => RouteRow[]) => void;
  populations: PopRow[]; setPopulations: (u: (r: PopRow[]) => PopRow[]) => void;
  sources: SourceRow[]; setSources: (u: (r: SourceRow[]) => SourceRow[]) => void;
  passages: PassageRow[]; setPassages: (u: (r: PassageRow[]) => PassageRow[]) => void;
  relations: RelationRow[]; setRelations: (u: (r: RelationRow[]) => RelationRow[]) => void;
  markTouched: (g: "routes" | "populations" | "sources" | "passages" | "relations") => void;
  nextKey: () => string;
  fieldErrors: Record<string, string>;
  triedSubmit: boolean;
};

export function KnowledgeRecordChildEditors({ form, disabled }: { form: Form; disabled: boolean }) {
  const err = (k: string) => (form.triedSubmit ? form.fieldErrors[k] : undefined);

  return (
    <div className="space-y-3">
      {/* Rotalar */}
      <ChildGroupShell
        title="Uygulama Yolları"
        hint="Ağızdan, haricen, solunum vb."
        error={err("routes")}
        disabled={disabled}
        count={form.routes.length}
        addLabel="Yol ekle"
        onAdd={() => {
          form.setRoutes((r) => [...r, { _key: form.nextKey(), route_code: "" }]);
          form.markTouched("routes");
        }}
      >
        {form.routes.map((row) => (
          <RowShell
            key={row._key}
            disabled={disabled}
            onRemove={() => {
              form.setRoutes((r) => r.filter((x) => x._key !== row._key));
              form.markTouched("routes");
            }}
          >
            <EnumSelect
              label="Uygulama Yolu"
              value={row.route_code}
              disabled={disabled}
              options={enumOptions(ROUTE_CODES, ROUTE_CODE_TR)}
              onChange={(v) => {
                form.setRoutes((r) => r.map((x) => (x._key === row._key ? { ...x, route_code: v } : x)));
                form.markTouched("routes");
              }}
            />
          </RowShell>
        ))}
      </ChildGroupShell>

      {/* Popülasyonlar */}
      <ChildGroupShell
        title="Popülasyonlar"
        hint="Hedef yaş grubu / durum; opsiyonel yaş aralığı."
        error={err("populations")}
        disabled={disabled}
        count={form.populations.length}
        addLabel="Popülasyon ekle"
        onAdd={() => {
          form.setPopulations((r) => [...r, { _key: form.nextKey(), population_code: "", age_min: "", age_max: "" }]);
          form.markTouched("populations");
        }}
      >
        {form.populations.map((row) => (
          <RowShell
            key={row._key}
            disabled={disabled}
            onRemove={() => {
              form.setPopulations((r) => r.filter((x) => x._key !== row._key));
              form.markTouched("populations");
            }}
          >
            <EnumSelect
              label="Popülasyon"
              value={row.population_code}
              disabled={disabled}
              options={enumOptions(POPULATION_CODES, POPULATION_CODE_TR)}
              onChange={(v) => {
                form.setPopulations((r) => r.map((x) => (x._key === row._key ? { ...x, population_code: v } : x)));
                form.markTouched("populations");
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Yaş (min)"
                value={row.age_min}
                min={0}
                max={120}
                disabled={disabled}
                onChange={(v) => {
                  form.setPopulations((r) => r.map((x) => (x._key === row._key ? { ...x, age_min: v } : x)));
                  form.markTouched("populations");
                }}
              />
              <NumberField
                label="Yaş (max)"
                value={row.age_max}
                min={1}
                max={120}
                disabled={disabled}
                onChange={(v) => {
                  form.setPopulations((r) => r.map((x) => (x._key === row._key ? { ...x, age_max: v } : x)));
                  form.markTouched("populations");
                }}
              />
            </div>
          </RowShell>
        ))}
      </ChildGroupShell>

      {/* Kaynaklar */}
      <ChildGroupShell
        title="Kaynaklar"
        hint="Kaynak, rol ve isteğe bağlı alıntı/çeviri."
        error={err("sources")}
        disabled={disabled}
        count={form.sources.length}
        addLabel="Kaynak ekle"
        onAdd={() => {
          form.setSources((r) => [
            ...r,
            { _key: form.nextKey(), source_id: "", source_label: "", source_role: "", verification_status: "", locator_text: "", url_fragment: "", source_original_excerpt: "", faithful_translation: "" },
          ]);
          form.markTouched("sources");
        }}
      >
        {form.sources.map((row) => (
          <RowShell
            key={row._key}
            disabled={disabled}
            onRemove={() => {
              form.setSources((r) => r.filter((x) => x._key !== row._key));
              form.markTouched("sources");
            }}
          >
            <SourcePicker
              disabled={disabled}
              selected={row.source_id ? { id: row.source_id, label: row.source_label || "Seçilen kaynak" } : null}
              onSelect={(it: PickerItem) => {
                form.setSources((r) => r.map((x) => (x._key === row._key ? { ...x, source_id: it.id, source_label: it.label } : x)));
                form.markTouched("sources");
              }}
              onClear={() => {
                form.setSources((r) => r.map((x) => (x._key === row._key ? { ...x, source_id: "", source_label: "" } : x)));
                form.markTouched("sources");
              }}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <EnumSelect
                label="Kaynak Rolü"
                value={row.source_role}
                disabled={disabled}
                options={enumOptions(SOURCE_ROLES, SOURCE_ROLE_TR)}
                onChange={(v) => {
                  form.setSources((r) => r.map((x) => (x._key === row._key ? { ...x, source_role: v } : x)));
                  form.markTouched("sources");
                }}
              />
              <EnumSelect
                label="Doğrulama"
                value={row.verification_status}
                disabled={disabled}
                allLabel="Belirtilmedi"
                options={enumOptions(VERIFICATION_STATUSES, VERIFICATION_STATUS_TR)}
                onChange={(v) => {
                  form.setSources((r) => r.map((x) => (x._key === row._key ? { ...x, verification_status: v } : x)));
                  form.markTouched("sources");
                }}
              />
            </div>
            <TextField
              label="Konum / Locator"
              value={row.locator_text}
              disabled={disabled}
              placeholder="ör. s. 42"
              onChange={(v) => {
                form.setSources((r) => r.map((x) => (x._key === row._key ? { ...x, locator_text: v } : x)));
                form.markTouched("sources");
              }}
            />
            <TextField
              label="Özgün Alıntı"
              value={row.source_original_excerpt}
              disabled={disabled}
              multiline
              onChange={(v) => {
                form.setSources((r) => r.map((x) => (x._key === row._key ? { ...x, source_original_excerpt: v } : x)));
                form.markTouched("sources");
              }}
            />
            <TextField
              label="Sadık Çeviri"
              value={row.faithful_translation}
              disabled={disabled}
              multiline
              hint="Yalnız özgün alıntı girildiyse doldurulabilir; ifade güçlendirilmez/zayıflatılmaz."
              onChange={(v) => {
                form.setSources((r) => r.map((x) => (x._key === row._key ? { ...x, faithful_translation: v } : x)));
                form.markTouched("sources");
              }}
            />
          </RowShell>
        ))}
      </ChildGroupShell>

      {/* Pasajlar */}
      <ChildGroupShell
        title="Pasajlar"
        hint="Önce kaynak seçin, ardından pasajı seçin."
        error={err("passages")}
        disabled={disabled}
        count={form.passages.length}
        addLabel="Pasaj ekle"
        onAdd={() => {
          form.setPassages((r) => [
            ...r,
            { _key: form.nextKey(), source_id: "", source_label: "", passage_id: "", passage_label: "", passage_kind: "", evidence_relation: "", verification_status: "" },
          ]);
          form.markTouched("passages");
        }}
      >
        {form.passages.map((row) => (
          <RowShell
            key={row._key}
            disabled={disabled}
            onRemove={() => {
              form.setPassages((r) => r.filter((x) => x._key !== row._key));
              form.markTouched("passages");
            }}
          >
            <SourcePicker
              disabled={disabled}
              selected={row.source_id ? { id: row.source_id, label: row.source_label || "Seçilen kaynak" } : null}
              onSelect={(it) => {
                form.setPassages((r) => r.map((x) => (x._key === row._key ? { ...x, source_id: it.id, source_label: it.label, passage_id: "", passage_label: "", passage_kind: "" } : x)));
                form.markTouched("passages");
              }}
              onClear={() => {
                form.setPassages((r) => r.map((x) => (x._key === row._key ? { ...x, source_id: "", source_label: "", passage_id: "", passage_label: "", passage_kind: "" } : x)));
                form.markTouched("passages");
              }}
            />
            {row.source_id ? (
              <PassagePicker
                sourceId={row.source_id}
                disabled={disabled}
                selected={row.passage_id ? { id: row.passage_id, label: row.passage_label || "Seçilen pasaj" } : null}
                onSelect={(it) => {
                  const kind = (it.data as PassageListItem | undefined)?.passage_kind ?? "";
                  form.setPassages((r) => r.map((x) => (x._key === row._key ? { ...x, passage_id: it.id, passage_label: it.label, passage_kind: kind } : x)));
                  form.markTouched("passages");
                }}
                onClear={() => {
                  form.setPassages((r) => r.map((x) => (x._key === row._key ? { ...x, passage_id: "", passage_label: "", passage_kind: "" } : x)));
                  form.markTouched("passages");
                }}
              />
            ) : null}
            <EnumSelect
              label="Kanıt İlişkisi"
              value={row.evidence_relation}
              disabled={disabled}
              options={enumOptions(EVIDENCE_RELATIONS, EVIDENCE_RELATION_TR)}
              onChange={(v) => {
                form.setPassages((r) => r.map((x) => (x._key === row._key ? { ...x, evidence_relation: v } : x)));
                form.markTouched("passages");
              }}
            />
            <EnumSelect
              label="Doğrulama"
              value={row.verification_status}
              disabled={disabled}
              allLabel="Belirtilmedi"
              options={enumOptions(VERIFICATION_STATUSES, VERIFICATION_STATUS_TR)}
              onChange={(v) => {
                form.setPassages((r) => r.map((x) => (x._key === row._key ? { ...x, verification_status: v } : x)));
                form.markTouched("passages");
              }}
            />
          </RowShell>
        ))}
      </ChildGroupShell>

      {/* İlişkiler */}
      <ChildGroupShell
        title="İlişkiler"
        hint="Başka bir Bilgi Kaydıyla ilişki (tür + açıklama)."
        error={err("relations")}
        disabled={disabled}
        count={form.relations.length}
        addLabel="İlişki ekle"
        onAdd={() => {
          form.setRelations((r) => [...r, { _key: form.nextKey(), other_claim_id: "", other_label: "", relation_type: "", explanation_tr: "" }]);
          form.markTouched("relations");
        }}
      >
        {form.relations.map((row) => (
          <RowShell
            key={row._key}
            disabled={disabled}
            onRemove={() => {
              form.setRelations((r) => r.filter((x) => x._key !== row._key));
              form.markTouched("relations");
            }}
          >
            <RelatedRecordPicker
              disabled={disabled}
              selected={row.other_claim_id ? { id: row.other_claim_id, label: row.other_label || "Seçilen kayıt" } : null}
              onSelect={(it) => {
                form.setRelations((r) => r.map((x) => (x._key === row._key ? { ...x, other_claim_id: it.id, other_label: it.label } : x)));
                form.markTouched("relations");
              }}
              onClear={() => {
                form.setRelations((r) => r.map((x) => (x._key === row._key ? { ...x, other_claim_id: "", other_label: "" } : x)));
                form.markTouched("relations");
              }}
            />
            <EnumSelect
              label="İlişki Türü"
              value={row.relation_type}
              disabled={disabled}
              options={enumOptions(RELATION_TYPES, RELATION_TYPE_TR)}
              onChange={(v) => {
                form.setRelations((r) => r.map((x) => (x._key === row._key ? { ...x, relation_type: v } : x)));
                form.markTouched("relations");
              }}
            />
            <TextField
              label="Açıklama"
              value={row.explanation_tr}
              disabled={disabled}
              multiline
              rows={2}
              onChange={(v) => {
                form.setRelations((r) => r.map((x) => (x._key === row._key ? { ...x, explanation_tr: v } : x)));
                form.markTouched("relations");
              }}
            />
          </RowShell>
        ))}
      </ChildGroupShell>
    </div>
  );
}
