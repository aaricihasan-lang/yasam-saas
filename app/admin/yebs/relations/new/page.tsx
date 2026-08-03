"use client";

// ============================================================
// YEBS A8 — Yeni Kavram İlişkisi (relation) oluştur
// Zorunlu: source_concept_id, target_concept_id (FARKLI olmalı), relation_type.
// Kayıt-yönlü ilişki; otomatik ters kayıt yok. Backend nihai otoritedir.
// ============================================================

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { YebsPageShell, Field, SelectInput } from "@/app/admin/yebs/components/primitives";
import { ConceptPicker } from "@/app/admin/yebs/components/pickers";
import { relationsApi } from "@/app/admin/yebs/adminYebsApi";
import { RELATION_TYPES } from "@/lib/yebs/ui/types";
import { RELATION_TYPE_LABEL, RELATION_DIRECTION_TEXT } from "@/lib/yebs/ui/statusDictionary";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";
import { useToast } from "@/components/ui/ToastProvider";

export default function NewRelationPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [sourceId, setSourceId] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetLabel, setTargetLabel] = useState<string | null>(null);
  const [relationType, setRelationType] = useState<string>(RELATION_TYPES[0]);
  const [reason, setReason] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sameConcept = Boolean(sourceId && targetId && sourceId === targetId);

  const hint = useMemo<string | null>(() => {
    if (!sourceId) return "Kaynak kavram seçilmelidir.";
    if (!targetId) return "Hedef kavram seçilmelidir.";
    if (sameConcept) return "Kaynak ve hedef kavram aynı olamaz.";
    return null;
  }, [sourceId, targetId, sameConcept]);

  const canSubmit = !busy && hint === null;

  const preview = useMemo(() => {
    if (!sourceId || !targetId || sameConcept) return null;
    const fn = RELATION_DIRECTION_TEXT[relationType];
    return fn ? fn(sourceLabel ?? "Kaynak", targetLabel ?? "Hedef") : null;
  }, [sourceId, targetId, sameConcept, relationType, sourceLabel, targetLabel]);

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true); setErr(null);
    const body: Record<string, unknown> = {
      source_concept_id: sourceId,
      target_concept_id: targetId,
      relation_type: relationType,
    };
    if (reason.trim() !== "") body.reason = reason.trim();

    const r = await relationsApi.create(body);
    setBusy(false);
    if (r.ok) {
      showToast({ type: "success", message: "İlişki oluşturuldu." });
      router.push(`/admin/yebs/relations/${r.data.id}`);
      return;
    }
    setErr(codeMeta(r.code).message);
  }

  return (
    <YebsPageShell>
      <div className="mb-3">
        <Link href="/admin/yebs/relations" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-violet-700">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Listeye dön
        </Link>
      </div>
      <h1 className="mb-4 text-lg font-black text-slate-900">Yeni İlişki</h1>

      <div className="max-w-2xl space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-5">
        <ConceptPicker label="Kaynak kavram *" value={sourceId} valueLabel={sourceLabel}
          onPick={(id, d) => { setSourceId(id); setSourceLabel(d); }} />
        <ConceptPicker label="Hedef kavram *" value={targetId} valueLabel={targetLabel}
          onPick={(id, d) => { setTargetId(id); setTargetLabel(d); }} />
        {sameConcept && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">Kaynak ve hedef kavram aynı olamaz.</p>}

        <Field label="İlişki Türü *">
          <SelectInput value={relationType} onChange={(e) => setRelationType(e.target.value)}>
            {RELATION_TYPES.map((t) => <option key={t} value={t}>{RELATION_TYPE_LABEL[t] ?? t}</option>)}
          </SelectInput>
        </Field>

        {preview && (
          <div className="rounded-xl bg-violet-50/60 px-3 py-2 text-sm text-violet-900 ring-1 ring-violet-100">
            <span className="text-[11px] font-bold uppercase tracking-wide text-violet-500">Yön önizlemesi</span>
            <p className="mt-0.5">{preview}</p>
          </div>
        )}

        <Field label="İşlem gerekçesi (opsiyonel)">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={2000}
            className="w-full resize-y rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
        </Field>

        {hint && !sameConcept && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">{hint}</p>}
        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{err}</p>}

        <div className="flex justify-end">
          <button type="button" onClick={handleSubmit} disabled={!canSubmit}
            className="btn-success inline-flex items-center gap-1.5 px-5 disabled:opacity-40">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Oluştur
          </button>
        </div>
      </div>
    </YebsPageShell>
  );
}
