"use client";

// ============================================================
// YEBS A8 — Kavram İlişkisi (relation) detay
// Sekmeler: Genel / Bağlantılar / Kanıtlar / Yaşam Döngüsü / Kayıt Bilgisi
// Düzenleme yalnız relation_type (draft; kanıt bağlıysa backend reddeder).
// Mini yön önizlemesi RELATION_DIRECTION_TEXT ile (graf/görselleştirme YOK).
// Lifecycle grup = claimlike.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { YebsPageShell, Field, SelectInput, LoadingBlock, ErrorBlock } from "@/app/admin/yebs/components/primitives";
import { DetailShell, LifecycleBar, RecordInfo, type TabDef } from "@/app/admin/yebs/components/DetailShell";
import { LifecycleModal } from "@/app/admin/yebs/components/LifecycleModal";
import { ReasonPrompt } from "@/app/admin/yebs/components/ReasonPrompt";
import { EligibilityPanel } from "@/app/admin/yebs/components/EligibilityPanel";
import { EvidenceSection } from "@/app/admin/yebs/components/EvidenceSection";
import { relationsApi, type Eligibility } from "@/app/admin/yebs/adminYebsApi";
import type { ConceptRelationRow } from "@/lib/yebs/ui/types";
import { RELATION_TYPES } from "@/lib/yebs/ui/types";
import { RELATION_TYPE_LABEL, RELATION_DIRECTION_TEXT, statusMeta } from "@/lib/yebs/ui/statusDictionary";
import { lifecycleActions, type LifecycleAction } from "@/lib/yebs/ui/lifecycleMap";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";
import { useToast } from "@/components/ui/ToastProvider";

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function directionSentence(relationType: string, a: string, b: string): string {
  const fn = RELATION_DIRECTION_TEXT[relationType];
  return fn ? fn(a, b) : `${a} — ${b}`;
}

export default function RelationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();

  const [row, setRow] = useState<ConceptRelationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [relationType, setRelationType] = useState<string>("");

  const [savePrompt, setSavePrompt] = useState(false);
  const [lifeAction, setLifeAction] = useState<LifecycleAction | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setLoadErr(null);
    const r = await relationsApi.detail(id, signal);
    if (signal?.aborted) return;
    if (r.ok) { setRow(r.data); setRelationType(r.data.relation_type); }
    else setLoadErr(codeMeta(r.code).message);
    setLoading(false);
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const ac = new AbortController(); void load(ac.signal); return () => ac.abort(); }, [load]);

  const editable = row?.status === "draft";
  const dirty = Boolean(row && relationType !== row.relation_type);

  const fetchEligibility = useCallback(async (target: string): Promise<Eligibility | null> => {
    const r = await relationsApi.eligibility(id, target);
    return r.ok ? r.data : null;
  }, [id]);

  const nextForward = useMemo(
    () => (row ? lifecycleActions("claimlike", row.status).find((a) => a.direction === "forward" && a.eligibilityRequired) : undefined),
    [row],
  );

  if (loading && !row) return <YebsPageShell><LoadingBlock /></YebsPageShell>;
  if (loadErr && !row) return <YebsPageShell><ErrorBlock message={loadErr} onRetry={() => load()} /></YebsPageShell>;
  if (!row) return <YebsPageShell><ErrorBlock message="İlişki bulunamadı." /></YebsPageShell>;

  const actions = lifecycleActions("claimlike", row.status);
  const srcShort = shortId(row.source_concept_id);
  const tgtShort = shortId(row.target_concept_id);

  const genelTab: TabDef = {
    key: "genel", label: "Genel",
    content: (
      <div className="max-w-2xl space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-5">
        {!editable && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Yalnız taslak durumundaki ilişkiler düzenlenebilir. Şu an: {statusMeta(row.status).label}.
          </p>
        )}
        <Field label="İlişki Türü" hint="Kanıt bağlıyken tür değiştirilemez.">
          <SelectInput value={relationType} disabled={!editable} onChange={(e) => setRelationType(e.target.value)}>
            {RELATION_TYPES.map((t) => <option key={t} value={t}>{RELATION_TYPE_LABEL[t] ?? t}</option>)}
          </SelectInput>
        </Field>
        <div className="rounded-xl bg-violet-50/60 px-3 py-2 text-sm text-violet-900 ring-1 ring-violet-100">
          <span className="text-[11px] font-bold uppercase tracking-wide text-violet-500">Yön önizlemesi</span>
          <p className="mt-0.5">{directionSentence(relationType, srcShort, tgtShort)}</p>
        </div>
      </div>
    ),
  };

  const baglantiTab: TabDef = {
    key: "baglanti", label: "Bağlantılar",
    content: (
      <div className="max-w-2xl space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-5 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Kaynak kavram</p>
            <Link href={`/admin/yebs/concepts/${row.source_concept_id}`} className="font-mono text-xs font-semibold text-violet-700 hover:underline">{row.source_concept_id}</Link>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Hedef kavram</p>
            <Link href={`/admin/yebs/concepts/${row.target_concept_id}`} className="font-mono text-xs font-semibold text-violet-700 hover:underline">{row.target_concept_id}</Link>
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-slate-700">
          {directionSentence(row.relation_type, srcShort, tgtShort)}
        </div>
        <p className="text-[11px] text-slate-500">İlişki yayımlanamaz; kaynak ve hedef kavramların ikisi de yayımlanmış olmalıdır.</p>
      </div>
    ),
  };

  const kanitTab: TabDef = {
    key: "kanit", label: "Kanıtlar",
    content: <EvidenceSection kind="relation" parentId={row.id} parentStatus={row.status} onChanged={() => load()} />,
  };

  const yasamTab: TabDef = {
    key: "yasam", label: "Yaşam Döngüsü",
    content: <RelationLifecycleTab hasForward={Boolean(nextForward)} target={nextForward?.target} fetchEligibility={fetchEligibility} />,
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
        backHref="/admin/yebs/relations"
        title={`${srcShort} → ${tgtShort}`}
        status={row.status}
        headerExtra={<span className="text-xs font-semibold text-slate-500">{RELATION_TYPE_LABEL[row.relation_type] ?? row.relation_type}</span>}
        tabs={[genelTab, baglantiTab, kanitTab, yasamTab, kayitTab]}
        dirty={editable && dirty}
        onSave={editable ? () => setSavePrompt(true) : undefined}
        lifecycleBar={<LifecycleBar actions={actions} onPick={setLifeAction} />}
      />

      {savePrompt && (
        <ReasonPrompt
          title="İlişki türünü güncelle"
          submitLabel="Kaydet"
          submit={(reason) => relationsApi.update(id, { relation_type: relationType, expected_updated_at: row.updated_at, reason })}
          onClose={() => setSavePrompt(false)}
          onDone={() => { showToast({ type: "success", message: "İlişki güncellendi." }); void load(); }}
        >
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Yeni tür: <span className="font-semibold">{RELATION_TYPE_LABEL[relationType] ?? relationType}</span>. Kanıt bağlıysa değişiklik reddedilir.
          </p>
        </ReasonPrompt>
      )}

      {lifeAction && (
        <LifecycleModal
          action={lifeAction}
          recordLabel={`${srcShort} → ${tgtShort}`}
          currentStatus={row.status}
          fetchEligibility={fetchEligibility}
          submit={(reason) => relationsApi.transition(id, { target_status: lifeAction.target, expected_updated_at: row.updated_at, reason })}
          onClose={() => setLifeAction(null)}
          onDone={() => { showToast({ type: "success", message: lifeAction.successMessage }); void load(); }}
        />
      )}
    </YebsPageShell>
  );
}

function RelationLifecycleTab({
  hasForward, target, fetchEligibility,
}: {
  hasForward: boolean; target?: string; fetchEligibility: (target: string) => Promise<Eligibility | null>;
}) {
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!target) { setElig(null); return; }
    setLoading(true);
    setElig(await fetchEligibility(target));
    setLoading(false);
  }, [target, fetchEligibility]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-xs text-slate-500">
        Kalite kapıları geçiş için sağlanmalıdır (kanıt yok / doğrulanmamış / kaynak hazır değil / kavramlar yayında değil / graf döngüsü).
        Geçişler alttaki çubuktan yapılır; her geçiş taze olarak yeniden değerlendirilir.
      </p>
      {hasForward ? (
        <EligibilityPanel eligibility={elig} loading={loading} onRefresh={refresh} />
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-500">
          Bu durumda kalite kapısı gerektiren ileri geçiş yok.
        </p>
      )}
    </div>
  );
}
