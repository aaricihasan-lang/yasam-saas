"use client";

// ============================================================
// YEBS A8 — İddia (claim) detay
// Sekmeler: Genel / Bağlantılar / Kanıtlar / Yaşam Döngüsü / Kayıt Bilgisi
// Düzenleme yalnız draft; kaydetme ReasonPrompt ile gerekçe alır.
// Lifecycle grup = claimlike; eligibilityRequired geçişlerde taze kontrol.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { YebsPageShell, Field, SelectInput, TextInput, LoadingBlock, ErrorBlock } from "@/app/admin/yebs/components/primitives";
import { DetailShell, LifecycleBar, RecordInfo, type TabDef } from "@/app/admin/yebs/components/DetailShell";
import { LifecycleModal } from "@/app/admin/yebs/components/LifecycleModal";
import { ReasonPrompt } from "@/app/admin/yebs/components/ReasonPrompt";
import { EligibilityPanel } from "@/app/admin/yebs/components/EligibilityPanel";
import { EvidenceSection } from "@/app/admin/yebs/components/EvidenceSection";
import { claimsApi, type Eligibility } from "@/app/admin/yebs/adminYebsApi";
import type { ClaimRow } from "@/lib/yebs/ui/types";
import { CLAIM_TYPES, CLAIM_PROVENANCE_KINDS, EVIDENCE_LAYERS } from "@/lib/yebs/ui/types";
import { CLAIM_TYPE_LABEL, EVIDENCE_LAYER_LABEL, statusMeta } from "@/lib/yebs/ui/statusDictionary";
import { lifecycleActions, type LifecycleAction } from "@/lib/yebs/ui/lifecycleMap";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";
import { useToast } from "@/components/ui/ToastProvider";

const PROVENANCE_LABEL: Record<string, string> = {
  source_original: "Kaynak özgün",
  faithful_translation: "Sadık çeviri",
  editorial_explanation: "Editöryal açıklama",
  editorial_interpretation: "Editöryal yorum",
};

const SAFETY_OUTCOME_TYPES = [
  "harm_shown", "risk_suspected", "contraindicated", "source_does_not_recommend",
  "not_classified_as_risk", "insufficient_data", "conflicting", "unknown",
];
const RESEARCH_OUTCOME_TYPES = [
  "positive_finding", "no_effect_found", "mixed_findings", "insufficient_data",
  "no_study_done", "conflicting", "unknown",
];
const OUTCOME_LABEL: Record<string, string> = {
  harm_shown: "Zarar gösterildi", risk_suspected: "Risk şüphesi", contraindicated: "Kontrendike",
  source_does_not_recommend: "Kaynak önermiyor", not_classified_as_risk: "Risk olarak sınıflanmamış",
  insufficient_data: "Yetersiz veri", conflicting: "Çelişkili", unknown: "Bilinmiyor",
  positive_finding: "Olumlu bulgu", no_effect_found: "Etki bulunamadı", mixed_findings: "Karışık bulgular",
  no_study_done: "Çalışma yapılmamış",
};

const SAFETY_TOPIC_RE = /^[a-z][a-z0-9_]*$/;

type FormState = {
  claim_type: string; claim_text: string; provenance_kind: string;
  evidence_layer: string; outcome_type: string; safety_topic: string;
};

function toForm(r: ClaimRow): FormState {
  return {
    claim_type: r.claim_type, claim_text: r.claim_text, provenance_kind: r.provenance_kind,
    evidence_layer: r.evidence_layer, outcome_type: r.outcome_type ?? "", safety_topic: r.safety_topic ?? "",
  };
}

export default function ClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();

  const [row, setRow] = useState<ClaimRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  const [savePrompt, setSavePrompt] = useState(false);
  const [lifeAction, setLifeAction] = useState<LifecycleAction | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setLoadErr(null);
    const r = await claimsApi.detail(id, signal);
    if (signal?.aborted) return;
    if (r.ok) { setRow(r.data); setForm(toForm(r.data)); }
    else setLoadErr(codeMeta(r.code).message);
    setLoading(false);
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const ac = new AbortController(); void load(ac.signal); return () => ac.abort(); }, [load]);

  const editable = row?.status === "draft";
  const isSafety = form?.claim_type === "safety";
  const isResearch = form?.claim_type === "research_finding";

  const dirty = useMemo(() => {
    if (!row || !form) return false;
    const o = toForm(row);
    return (Object.keys(o) as (keyof FormState)[]).some((k) => o[k] !== form[k]);
  }, [row, form]);

  const saveHint = useMemo<string | null>(() => {
    if (!form) return null;
    if (form.claim_text.trim() === "") return "İddia metni gereklidir.";
    if (form.claim_text.length > 20000) return "İddia metni 20000 karakteri aşamaz.";
    if (form.claim_type === "safety") {
      if (!form.outcome_type) return "Güvenlik iddiası için sonuç türü zorunludur.";
      if (form.safety_topic.trim() === "" || !SAFETY_TOPIC_RE.test(form.safety_topic.trim())) return "Geçerli bir güvenlik konusu gereklidir (küçük harf + alt çizgi).";
    }
    return null;
  }, [form]);

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  const buildPatch = useCallback((reason: string): Record<string, unknown> => {
    if (!row || !form) return {};
    const patch: Record<string, unknown> = {
      expected_updated_at: row.updated_at,
      reason,
      claim_type: form.claim_type,
      claim_text: form.claim_text.trim(),
      provenance_kind: form.provenance_kind,
      evidence_layer: form.evidence_layer,
    };
    if (form.claim_type === "safety") {
      patch.outcome_type = form.outcome_type || null;
      patch.safety_topic = form.safety_topic.trim() || null;
    } else if (form.claim_type === "research_finding") {
      patch.outcome_type = form.outcome_type || null;
      patch.safety_topic = null;
    } else {
      patch.outcome_type = null;
      patch.safety_topic = null;
    }
    return patch;
  }, [row, form]);

  const fetchEligibility = useCallback(async (target: string): Promise<Eligibility | null> => {
    const r = await claimsApi.eligibility(id, target);
    return r.ok ? r.data : null;
  }, [id]);

  if (loading && !row) return <YebsPageShell><LoadingBlock /></YebsPageShell>;
  if (loadErr && !row) return <YebsPageShell><ErrorBlock message={loadErr} onRetry={() => load()} /></YebsPageShell>;
  if (!row || !form) return <YebsPageShell><ErrorBlock message="İddia bulunamadı." /></YebsPageShell>;

  const actions = lifecycleActions("claimlike", row.status);

  const genelTab: TabDef = {
    key: "genel", label: "Genel",
    content: (
      <div className="max-w-2xl space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-5">
        {!editable && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Yalnız taslak durumundaki iddialar düzenlenebilir. Şu an: {statusMeta(row.status).label}.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="İddia Türü">
            <SelectInput value={form.claim_type} disabled={!editable}
              onChange={(e) => { setField("claim_type", e.target.value); setField("outcome_type", ""); setField("safety_topic", ""); }}>
              {CLAIM_TYPES.map((t) => <option key={t} value={t}>{CLAIM_TYPE_LABEL[t] ?? t}</option>)}
            </SelectInput>
          </Field>
          <Field label="Kanıt Katmanı">
            <SelectInput value={form.evidence_layer} disabled={!editable} onChange={(e) => setField("evidence_layer", e.target.value)}>
              {EVIDENCE_LAYERS.map((l) => <option key={l} value={l}>{EVIDENCE_LAYER_LABEL[l] ?? l}</option>)}
            </SelectInput>
          </Field>
        </div>
        <Field label="Köken (provenance)">
          <SelectInput value={form.provenance_kind} disabled={!editable} onChange={(e) => setField("provenance_kind", e.target.value)}>
            {CLAIM_PROVENANCE_KINDS.map((p) => <option key={p} value={p}>{PROVENANCE_LABEL[p] ?? p}</option>)}
          </SelectInput>
        </Field>
        <Field label="İddia metni" hint={`${form.claim_text.length}/20000`}>
          <textarea value={form.claim_text} disabled={!editable} onChange={(e) => setField("claim_text", e.target.value)} rows={4} maxLength={20000}
            className="w-full resize-y rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-60" />
        </Field>
        {isSafety && (
          <div className="grid gap-3 rounded-xl bg-rose-50/50 p-3 ring-1 ring-rose-100 sm:grid-cols-2">
            <Field label="Sonuç türü (güvenlik)">
              <SelectInput value={form.outcome_type} disabled={!editable} onChange={(e) => setField("outcome_type", e.target.value)}>
                <option value="">Seç…</option>
                {SAFETY_OUTCOME_TYPES.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o] ?? o}</option>)}
              </SelectInput>
            </Field>
            <Field label="Güvenlik konusu" hint="Küçük harf + alt çizgi.">
              <TextInput value={form.safety_topic} disabled={!editable} onChange={(e) => setField("safety_topic", e.target.value)} placeholder="gebelik_riski" />
            </Field>
          </div>
        )}
        {isResearch && (
          <Field label="Sonuç türü (opsiyonel · araştırma)">
            <SelectInput value={form.outcome_type} disabled={!editable} onChange={(e) => setField("outcome_type", e.target.value)}>
              <option value="">Belirtilmemiş</option>
              {RESEARCH_OUTCOME_TYPES.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o] ?? o}</option>)}
            </SelectInput>
          </Field>
        )}
        {saveHint && dirty && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">{saveHint}</p>}
      </div>
    ),
  };

  const baglantiTab: TabDef = {
    key: "baglanti", label: "Bağlantılar",
    content: (
      <div className="max-w-2xl space-y-2 rounded-2xl border border-slate-200 bg-white/70 p-5 text-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Bağlı kavram</p>
        <Link href={`/admin/yebs/concepts/${row.concept_id}`} className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-violet-700 hover:underline">
          {row.concept_id}
        </Link>
        <p className="text-[11px] text-slate-500">İddia bu kavrama bağlıdır; kavram yayımlanmadan iddia yayımlanamaz.</p>
      </div>
    ),
  };

  const kanitTab: TabDef = {
    key: "kanit", label: "Kanıtlar",
    content: <EvidenceSection kind="claim" parentId={row.id} parentStatus={row.status} onChanged={() => load()} />,
  };

  const yasamTab: TabDef = {
    key: "yasam", label: "Yaşam Döngüsü",
    content: <ClaimLifecycleTab status={row.status} fetchEligibility={fetchEligibility} />,
  };

  const kayitTab: TabDef = {
    key: "kayit", label: "Kayıt Bilgisi",
    content: (
      <RecordInfo rows={[
        { label: "Kimlik", value: <span className="font-mono text-xs">{row.id}</span> },
        { label: "Durum", value: statusMeta(row.status).label },
        { label: "Oluşturma", value: new Date(row.created_at).toLocaleString("tr-TR") },
        { label: "Güncelleme", value: new Date(row.updated_at).toLocaleString("tr-TR") },
      ]} />
    ),
  };

  return (
    <YebsPageShell>
      <DetailShell
        backHref="/admin/yebs/claims"
        title={row.claim_text.length > 60 ? `${row.claim_text.slice(0, 60)}…` : row.claim_text}
        status={row.status}
        tabs={[genelTab, baglantiTab, kanitTab, yasamTab, kayitTab]}
        dirty={editable && dirty && saveHint === null}
        onSave={editable ? () => setSavePrompt(true) : undefined}
        lifecycleBar={<LifecycleBar actions={actions} onPick={setLifeAction} />}
      />

      {savePrompt && (
        <ReasonPrompt
          title="İddiayı güncelle"
          submitLabel="Kaydet"
          submit={(reason) => claimsApi.update(id, buildPatch(reason))}
          onClose={() => setSavePrompt(false)}
          onDone={() => { showToast({ type: "success", message: "İddia güncellendi." }); void load(); }}
        />
      )}

      {lifeAction && (
        <LifecycleModal
          action={lifeAction}
          recordLabel={row.claim_text.length > 60 ? `${row.claim_text.slice(0, 60)}…` : row.claim_text}
          currentStatus={row.status}
          fetchEligibility={fetchEligibility}
          submit={(reason) => claimsApi.transition(id, { target_status: lifeAction.target, expected_updated_at: row.updated_at, reason })}
          onClose={() => setLifeAction(null)}
          onDone={() => { showToast({ type: "success", message: lifeAction.successMessage }); void load(); }}
        />
      )}
    </YebsPageShell>
  );
}

// Yaşam döngüsü sekmesi: yayına hazır olma (publish) eligibility özeti.
function ClaimLifecycleTab({
  status, fetchEligibility,
}: {
  status: string; fetchEligibility: (target: string) => Promise<Eligibility | null>;
}) {
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const nextForward = lifecycleActions("claimlike", status).find((a) => a.direction === "forward" && a.eligibilityRequired);

  const refresh = useCallback(async () => {
    if (!nextForward) { setElig(null); return; }
    setLoading(true);
    setElig(await fetchEligibility(nextForward.target));
    setLoading(false);
  }, [nextForward, fetchEligibility]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-xs text-slate-500">
        Aşağıdaki kalite kapıları geçiş için sağlanmalıdır (kanıt yok / doğrulanmamış / kaynak hazır değil / üst kavram yayında değil).
        Geçişler alttaki çubuktan yapılır; her geçiş taze olarak yeniden değerlendirilir.
      </p>
      {nextForward ? (
        <EligibilityPanel eligibility={elig} loading={loading} onRefresh={refresh} />
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-500">
          Bu durumda kalite kapısı gerektiren ileri geçiş yok.
        </p>
      )}
    </div>
  );
}
