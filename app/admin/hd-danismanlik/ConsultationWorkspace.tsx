"use client";

/**
 * HD Danışmanlık F2 · Admin-only "Danışmanlık İçeriği" workspace (master-detail).
 * ================================================================================
 * - Sol: canonical entity listesi (Tür/Otorite/Kapı/Kanal + arama + status filtre).
 * - Sağ: seçili entity için CreateForm (içerik yoksa) veya ManagePanel (varsa).
 * - Yazma yalnız /api/admin/hd/consultation* (rpc create/update/publish/archive).
 *   Canlı AI YOK, uzman entitlement YOK, Word YOK, danışan session YOK.
 * - Tüm mutasyonlar atomik create RPC (bölümler tek çağrıda) — browser'da parçalamaz.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { hdGet, hdSend } from "@/app/admin/human-design/adminHdApi";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import type {
  ConsultationListEntry,
  ConsultationDetail,
} from "@/lib/human-design/consultation/admin/consultationAdminTypes";
import type { HdSectionKind, HdUsageScope, HdConditionKind, HdConsultationStatus } from "@/lib/human-design/consultation/types";
import type { HdEvidenceRelationType } from "@/lib/human-design/knowledge-system/contracts";
import type { HdCanonicalEntityKind } from "@/lib/human-design/knowledge-system/canonicalKeys";
import {
  SECTION_KIND_ORDER, SECTION_KIND_LABEL, USAGE_SCOPE_LABEL, CONDITION_KIND_LABEL,
  CONDITION_KIND_TO_ENTITY_KIND, RELATION_TYPE_LABEL, STATUS_LABEL, ENTITY_KIND_LABEL,
} from "./labels";

const USAGE_SCOPES: HdUsageScope[] = ["expert_guide", "client_report", "both"];
const CONDITION_KINDS: HdConditionKind[] = ["type_is", "authority_is", "has_channel", "has_gate"];
const RELATION_TYPES: HdEvidenceRelationType[] = ["supports", "contradicts", "school_specific", "background"];
const fieldCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed outline-none focus:border-indigo-400";

type CanonicalRow = { id: string; entity_kind: string; canonical_key: string; name_tr: string };
type SourceRow = {
  id: string; title: string; authors?: string[]; organization?: string | null; rights_status?: string;
  internal_use_allowed?: boolean; expert_delivery_allowed?: boolean; private_report_use_allowed?: boolean;
  translation_allowed?: boolean; quotation_allowed?: boolean; quotation_word_limit?: number | null;
};
type PassageRow = {
  id: string; source_id: string; locator_label: string; locator_value: string;
  rights_status_override?: string | null; internal_use_allowed_override?: boolean | null;
  private_report_use_allowed_override?: boolean | null;
};

// ── draft models (create) ────────────────────────────────────────────────────
type QuestionDraft = { questionText: string; topicScope: string };
type ConditionDraft = { conditionKind: HdConditionKind; conditionValue: string };
type EvidenceDraft = { passageId: string; label: string; relationType: HdEvidenceRelationType; isPrimary: boolean; isSingleSource: boolean; editorialNote: string };
type SectionDraft = {
  enabled: boolean; bodyText: string; usageScope: HdUsageScope; topicScope: string;
  questions: QuestionDraft[]; conditions: ConditionDraft[]; evidence: EvidenceDraft[];
};
const emptySection = (): SectionDraft => ({ enabled: false, bodyText: "", usageScope: "both", topicScope: "", questions: [], conditions: [], evidence: [] });

// ════════════════════════════════════════════════════════════════════════════
export default function ConsultationWorkspace() {
  const [kind, setKind] = useState<HdCanonicalEntityKind | "">("");
  const [statusFilter, setStatusFilter] = useState<HdConsultationStatus | "">("");
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState<ConsultationListEntry[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<ConsultationListEntry | null>(null);
  const [listError, setListError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1); // event-driven refetch (effect dışı setState)

  // Tek fetch/setState sitesi effect içi async IIFE (setState yalnız await sonrası).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const params = new URLSearchParams();
      if (kind) params.set("kind", kind);
      if (statusFilter) params.set("status", statusFilter);
      if (q.trim()) params.set("q", q.trim());
      const r = await hdGet<{ entries: ConsultationListEntry[] }>(`consultation?${params.toString()}`);
      if (!alive) return;
      setLoadingList(false);
      if (!r.ok) { setListError(r.error); setEntries([]); return; }
      setListError(""); setEntries(r.data.entries);
    })();
    return () => { alive = false; };
  }, [kind, statusFilter, q, reloadKey]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-4 lg:flex-row">
      {/* ── Sol: liste ── */}
      <aside className="w-full shrink-0 lg:w-80">
        <h1 className="mb-1 text-lg font-bold text-slate-800">Danışmanlık İçeriği</h1>
        <p className="mb-3 text-xs text-slate-500">Merkezî canonical bilgiye pinlenen, danışmanlıkta kullanılacak içerik.</p>
        <div className="mb-2 flex flex-wrap gap-1">
          {(["", "tip", "otorite", "kapi", "kanal"] as const).map((k) => (
            <button key={k || "all"} onClick={() => setKind(k)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${kind === k ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {k === "" ? "Tümü" : ENTITY_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="mb-2 flex gap-2">
          <input className={fieldCls} placeholder="Ara (isim / anahtar)…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="rounded-lg border border-slate-300 px-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as HdConsultationStatus | "")}>
            <option value="">Durum</option>
            <option value="draft">Taslak</option>
            <option value="published">Yayınlandı</option>
          </select>
        </div>
        <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200">
          {loadingList ? (
            <div className="flex items-center gap-2 p-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…</div>
          ) : listError ? (
            <div className="p-3 text-sm text-rose-600">{listError}</div>
          ) : entries.length === 0 ? (
            <div className="p-3 text-sm text-slate-500">Kayıt yok.</div>
          ) : entries.map((e) => (
            <button key={e.entityId} onClick={() => setSelected(e)}
              className={`flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-indigo-50 ${selected?.entityId === e.entityId ? "bg-indigo-50" : ""}`}>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-slate-800">{e.nameTr}</span>
                <span className="block truncate text-[11px] text-slate-400">{ENTITY_KIND_LABEL[e.entityKind]} · {e.canonicalKey}</span>
              </span>
              <StatusPill entry={e} />
            </button>
          ))}
        </div>
      </aside>

      {/* ── Sağ: editör ── */}
      <section className="min-w-0 flex-1">
        {!selected ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm text-slate-500">
            Soldan bir Tip / Otorite / Kapı / Kanal seçin.
          </div>
        ) : selected.consultation ? (
          <ManagePanel key={selected.consultation.id} entry={selected} onChanged={reload} />
        ) : (
          <CreateForm key={selected.entityId} entry={selected} onCreated={reload} />
        )}
      </section>
    </div>
  );
}

function StatusPill({ entry }: { entry: ConsultationListEntry }) {
  if (!entry.consultation) return <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">İçerik yok</span>;
  const s = entry.consultation.status;
  const cls = s === "published" ? "bg-emerald-100 text-emerald-700" : s === "archived" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-700";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{STATUS_LABEL[s]} · {entry.consultation.sectionCount}b</span>;
}

// ════════════════════ CREATE ════════════════════════════════════════════════
function CreateForm({ entry, onCreated }: { entry: ConsultationListEntry; onCreated: () => void }) {
  const [canonicalContentId, setCanonicalContentId] = useState<string | null>(null);
  const [isAiGenerated, setIsAiGenerated] = useState(false);
  const [sections, setSections] = useState<Record<HdSectionKind, SectionDraft>>(() => {
    const o = {} as Record<HdSectionKind, SectionDraft>;
    for (const k of SECTION_KIND_ORDER) o[k] = emptySection();
    return o;
  });
  const [contentQuestions, setContentQuestions] = useState<QuestionDraft[]>([]);
  const [contentConditions, setContentConditions] = useState<ConditionDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // canonical içerik pin (opsiyonel) — sürüm/onay durumu göster
  const [canonInfo, setCanonInfo] = useState<{ id: string; status: string; version: number; humanApprovedAt: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await hdGet<{ row: { id: string; status: string; version: number; human_approved_at: string | null } | null }>(`content?entityId=${entry.entityId}`);
      if (!alive) return;
      if (r.ok && r.data.row) { setCanonInfo({ id: r.data.row.id, status: r.data.row.status, version: r.data.row.version, humanApprovedAt: r.data.row.human_approved_at }); }
      else setCanonInfo(null);
    })();
    return () => { alive = false; };
  }, [entry.entityId]);

  const setSec = (k: HdSectionKind, patch: Partial<SectionDraft>) => setSections((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));

  const enabledCount = useMemo(() => SECTION_KIND_ORDER.filter((k) => sections[k].enabled).length, [sections]);

  async function submit() {
    setMsg("");
    const enabled = SECTION_KIND_ORDER.filter((k) => sections[k].enabled);
    if (enabled.length === 0) { setMsg("En az bir bölüm etkinleştirin."); return; }
    for (const k of enabled) if (!sections[k].bodyText.trim()) { setMsg(`"${SECTION_KIND_LABEL[k]}" bölüm metni boş olamaz.`); return; }

    const payload = {
      entityId: entry.entityId,
      canonicalContentId,
      isAiGenerated,
      sections: enabled.map((k, i) => {
        const s = sections[k];
        return {
          clientRef: k, sectionKind: k, bodyText: s.bodyText.trim(), usageScope: s.usageScope,
          topicScope: s.topicScope.trim() || null, sortOrder: i, status: "draft" as const,
          questions: s.questions.filter((qd) => qd.questionText.trim()).map((qd, qi) => ({ questionText: qd.questionText.trim(), topicScope: qd.topicScope.trim() || null, sortOrder: qi })),
          conditions: s.conditions.filter((cd) => cd.conditionValue).map((cd, ci) => ({ conditionKind: cd.conditionKind, conditionValue: cd.conditionValue, sortOrder: ci })),
          evidence: s.evidence.filter((ed) => ed.passageId).map((ed, ei) => ({ passageId: ed.passageId, relationType: ed.relationType, isPrimary: ed.isPrimary, isSingleSource: ed.isSingleSource, editorialNote: ed.editorialNote.trim() || null, sortOrder: ei })),
        };
      }),
      contentQuestions: contentQuestions.filter((qd) => qd.questionText.trim()).map((qd, i) => ({ questionText: qd.questionText.trim(), topicScope: qd.topicScope.trim() || null, sortOrder: i })),
      contentConditions: contentConditions.filter((cd) => cd.conditionValue).map((cd, i) => ({ conditionKind: cd.conditionKind, conditionValue: cd.conditionValue, sortOrder: i })),
    };

    setSaving(true);
    const r = await hdSend<{ id: string }>("POST", "consultation", payload as unknown as Record<string, unknown>);
    setSaving(false);
    if (r.ok) { setMsg("Danışmanlık içeriği oluşturuldu."); onCreated(); }
    else setMsg(`Hata: ${r.error}`);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <EditorHeader entry={entry} />
      <div className="mb-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={canonicalContentId !== null} disabled={!canonInfo}
              onChange={(e) => setCanonicalContentId(e.target.checked && canonInfo ? canonInfo.id : null)} />
            Merkezî canonical içeriğe pinle
          </label>
          {canonInfo ? (
            <span className="text-[11px] text-slate-500">canonical: {canonInfo.status === "published" ? "Yayınlı" : "Taslak"} · v{canonInfo.version} · {canonInfo.humanApprovedAt ? "insan-onaylı" : "onaysız"}</span>
          ) : <span className="text-[11px] text-amber-600">Bu entity için canonical içerik yok.</span>}
          <label className="ml-auto flex items-center gap-2">
            <input type="checkbox" checked={isAiGenerated} onChange={(e) => setIsAiGenerated(e.target.checked)} /> AI adayı
          </label>
        </div>
        <p className="text-[11px] text-slate-400">Not: Yayınlama için canonical içerik yayınlı + insan-onaylı olmalıdır (DB publish gate). Uzun canonical metin otomatik kopyalanmaz; bölüm metinlerini manuel yazın.</p>
      </div>

      <p className="mb-2 text-xs font-semibold text-slate-500">Bölümler ({enabledCount} etkin)</p>
      <div className="flex flex-col gap-2">
        {SECTION_KIND_ORDER.map((k) => (
          <SectionEditor key={k} kind={k} draft={sections[k]} onChange={(p) => setSec(k, p)} />
        ))}
      </div>

      <ContentLevelChildren
        questions={contentQuestions} setQuestions={setContentQuestions}
        conditions={contentConditions} setConditions={setContentConditions}
      />

      <div className="sticky bottom-0 mt-4 flex items-center gap-3 border-t border-slate-200 bg-white/95 pt-3">
        <button onClick={submit} disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? "Kaydediliyor…" : "Danışmanlık İçeriği Oluştur"}
        </button>
        {msg && <span className={`text-sm ${msg.startsWith("Hata") ? "text-rose-600" : "text-emerald-700"}`}>{msg}</span>}
      </div>
    </div>
  );
}

function EditorHeader({ entry }: { entry: ConsultationListEntry }) {
  return (
    <div className="mb-3 border-b border-slate-100 pb-2">
      <h2 className="text-base font-bold text-slate-800">{entry.nameTr}</h2>
      <p className="text-[11px] text-slate-400">{ENTITY_KIND_LABEL[entry.entityKind]} · {entry.canonicalKey}</p>
    </div>
  );
}

function SectionEditor({ kind, draft, onChange }: { kind: HdSectionKind; draft: SectionDraft; onChange: (p: Partial<SectionDraft>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border ${draft.enabled ? "border-indigo-200 bg-indigo-50/30" : "border-slate-200"}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <input type="checkbox" checked={draft.enabled} onChange={(e) => { onChange({ enabled: e.target.checked }); if (e.target.checked) setOpen(true); }} />
        <button className="flex-1 text-left text-sm font-semibold text-slate-700" onClick={() => setOpen((o) => !o)}>{SECTION_KIND_LABEL[kind]}</button>
        {draft.enabled && <span className="text-[10px] text-slate-400">{USAGE_SCOPE_LABEL[draft.usageScope]}</span>}
        <button className="text-xs text-slate-400" onClick={() => setOpen((o) => !o)}>{open ? "▲" : "▼"}</button>
      </div>
      {open && draft.enabled && (
        <div className="flex flex-col gap-3 border-t border-slate-200 px-3 py-3">
          <textarea className={`${fieldCls} min-h-[110px]`} placeholder="Bölüm metni…" value={draft.bodyText} onChange={(e) => onChange({ bodyText: e.target.value })} />
          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-slate-500">Kullanım
              <select className={`${fieldCls} mt-1`} value={draft.usageScope} onChange={(e) => onChange({ usageScope: e.target.value as HdUsageScope })}>
                {USAGE_SCOPES.map((u) => <option key={u} value={u}>{USAGE_SCOPE_LABEL[u]}</option>)}
              </select>
            </label>
            <label className="flex-1 text-xs text-slate-500">Konu kapsamı (opsiyonel)
              <input className={`${fieldCls} mt-1`} value={draft.topicScope} onChange={(e) => onChange({ topicScope: e.target.value })} />
            </label>
          </div>
          <QuestionsEditor items={draft.questions} onChange={(qs) => onChange({ questions: qs })} />
          <ConditionsEditor items={draft.conditions} onChange={(cs) => onChange({ conditions: cs })} />
          <EvidenceEditor items={draft.evidence} onChange={(es) => onChange({ evidence: es })} />
        </div>
      )}
    </div>
  );
}

function QuestionsEditor({ items, onChange }: { items: QuestionDraft[]; onChange: (v: QuestionDraft[]) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Sorular</span>
        <button className="text-xs text-indigo-600" onClick={() => onChange([...items, { questionText: "", topicScope: "" }])}>+ Soru</button></div>
      {items.map((qd, i) => (
        <div key={i} className="mb-1 flex gap-2">
          <input className={fieldCls} placeholder="Soru metni" value={qd.questionText} onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, questionText: e.target.value } : x))} />
          <button className="text-xs text-rose-500" onClick={() => onChange(items.filter((_, j) => j !== i))}>Sil</button>
        </div>
      ))}
    </div>
  );
}

function ConditionsEditor({ items, onChange }: { items: ConditionDraft[]; onChange: (v: ConditionDraft[]) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500">Koşullar (AND — hepsi sağlanmalı)</span>
        <button className="text-xs text-indigo-600" onClick={() => onChange([...items, { conditionKind: "type_is", conditionValue: "" }])}>+ Koşul</button>
      </div>
      <p className="mb-1 text-[10px] text-slate-400">Bu bölümün gösterilmesi için seçilen tüm koşullar sağlanmalıdır (VE mantığı; serbest kod yok).</p>
      {items.map((cd, i) => (
        <div key={i} className="mb-1 flex flex-wrap items-center gap-2">
          <select className="rounded-lg border border-slate-300 px-2 py-1 text-sm" value={cd.conditionKind}
            onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, conditionKind: e.target.value as HdConditionKind, conditionValue: "" } : x))}>
            {CONDITION_KINDS.map((ck) => <option key={ck} value={ck}>{CONDITION_KIND_LABEL[ck]}</option>)}
          </select>
          <CanonicalValueSelect kind={cd.conditionKind} value={cd.conditionValue} onChange={(v) => onChange(items.map((x, j) => j === i ? { ...x, conditionValue: v } : x))} />
          <button className="text-xs text-rose-500" onClick={() => onChange(items.filter((_, j) => j !== i))}>Sil</button>
        </div>
      ))}
    </div>
  );
}

/** Canonical selector: condition_kind → entity_kind entity listesi (serbest text YOK). */
function CanonicalValueSelect({ kind, value, onChange }: { kind: HdConditionKind; value: string; onChange: (v: string) => void }) {
  const entityKind = CONDITION_KIND_TO_ENTITY_KIND[kind];
  const [rows, setRows] = useState<CanonicalRow[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await hdGet<{ rows: CanonicalRow[] }>(`canonical?kind=${entityKind}`);
      if (alive && r.ok) setRows(r.data.rows);
    })();
    return () => { alive = false; };
  }, [entityKind]);
  return (
    <select className="min-w-[220px] rounded-lg border border-slate-300 px-2 py-1 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Seçin…</option>
      {rows.map((row) => <option key={row.id} value={row.canonical_key}>{row.name_tr} ({row.canonical_key})</option>)}
    </select>
  );
}

function EvidenceEditor({ items, onChange }: { items: EvidenceDraft[]; onChange: (v: EvidenceDraft[]) => void }) {
  const [picking, setPicking] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Kanıt (Kaynak/Passage)</span>
        <button className="text-xs text-indigo-600" onClick={() => setPicking((p) => !p)}>{picking ? "Kapat" : "+ Passage ekle"}</button></div>
      {picking && <PassagePicker onPick={(p) => { onChange([...items, p]); setPicking(false); }} />}
      {items.map((ed, i) => (
        <div key={i} className="mb-1 rounded border border-slate-200 p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-medium text-slate-700">{ed.label}</span>
            <button className="text-rose-500" onClick={() => onChange(items.filter((_, j) => j !== i))}>Sil</button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <select className="rounded border border-slate-300 px-1 py-0.5" value={ed.relationType} onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, relationType: e.target.value as HdEvidenceRelationType } : x))}>
              {RELATION_TYPES.map((rt) => <option key={rt} value={rt}>{RELATION_TYPE_LABEL[rt]}</option>)}
            </select>
            <label className="flex items-center gap-1"><input type="checkbox" checked={ed.isPrimary} onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, isPrimary: e.target.checked } : x))} /> Birincil</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={ed.isSingleSource} onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, isSingleSource: e.target.checked } : x))} /> Tek kaynak</label>
            <input className="flex-1 rounded border border-slate-300 px-1 py-0.5" placeholder="Editöryal not" value={ed.editorialNote} onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, editorialNote: e.target.value } : x))} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PassagePicker({ onPick }: { onPick: (e: EvidenceDraft) => void }) {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [passages, setPassages] = useState<PassageRow[]>([]);
  useEffect(() => { void (async () => { const r = await hdGet<{ rows: SourceRow[] }>("sources"); if (r.ok) setSources(r.data.rows); })(); }, []);
  useEffect(() => {
    if (!sourceId) return;            // senkron setState yok; boş kaynakta passage render edilmez
    let alive = true;
    void (async () => { const r = await hdGet<{ rows: PassageRow[] }>(`passages?sourceId=${sourceId}`); if (alive && r.ok) setPassages(r.data.rows); })();
    return () => { alive = false; };
  }, [sourceId]);
  const src = sources.find((s) => s.id === sourceId);
  return (
    <div className="mb-2 rounded border border-indigo-200 bg-indigo-50/40 p-2 text-xs">
      <select className={`${fieldCls} mb-1`} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
        <option value="">Kaynak seçin…</option>
        {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
      {src && (
        <div className="mb-1 text-[10px] text-slate-500">
          Hak: {src.rights_status ?? "—"} · iç:{src.internal_use_allowed ? "✓" : "✗"} uzman:{src.expert_delivery_allowed ? "✓" : "✗"} rapor:{src.private_report_use_allowed ? "✓" : "✗"} çeviri:{src.translation_allowed ? "✓" : "✗"} alıntı:{src.quotation_allowed ? "✓" : "✗"}{src.quotation_word_limit != null ? `(${src.quotation_word_limit})` : ""}
        </div>
      )}
      {sourceId && passages.map((p) => (
        <button key={p.id} className="mb-1 block w-full rounded border border-slate-200 bg-white px-2 py-1 text-left hover:border-indigo-300"
          onClick={() => onPick({ passageId: p.id, label: `${src?.title ?? ""} — ${p.locator_label}: ${p.locator_value}`, relationType: "supports", isPrimary: false, isSingleSource: false, editorialNote: "" })}>
          {p.locator_label}: {p.locator_value}{(p.rights_status_override != null || p.internal_use_allowed_override != null || p.private_report_use_allowed_override != null) ? " · (passage override)" : ""}
        </button>
      ))}
    </div>
  );
}

function ContentLevelChildren({ questions, setQuestions, conditions, setConditions }: {
  questions: QuestionDraft[]; setQuestions: (v: QuestionDraft[]) => void;
  conditions: ConditionDraft[]; setConditions: (v: ConditionDraft[]) => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3">
      <p className="mb-2 text-xs font-semibold text-slate-500">İçerik düzeyi (bölümsüz) sorular / koşullar</p>
      <QuestionsEditor items={questions} onChange={setQuestions} />
      <ConditionsEditor items={conditions} onChange={setConditions} />
    </div>
  );
}

// ════════════════════ MANAGE (existing) ═════════════════════════════════════
function ManagePanel({ entry, onChanged }: { entry: ConsultationListEntry; onChanged: () => void }) {
  const contentId = entry.consultation!.id;
  const [detail, setDetail] = useState<ConsultationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);
  const deleteConfirm = useDeleteConfirm();

  // Tek fetch/setState sitesi effect içi async IIFE (setState yalnız await sonrası).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await hdGet<{ detail: ConsultationDetail }>(`consultation?id=${contentId}`);
      if (!alive) return;
      setLoading(false);
      if (r.ok) setDetail(r.data.detail); else setMsg(`Hata: ${r.error}`);
    })();
    return () => { alive = false; };
  }, [contentId, reloadKey]);

  async function doUpdate(patch: { isAiGenerated?: boolean; repin?: boolean }) {
    if (!detail) return;
    setBusy(true); setMsg("");
    const r = await hdSend<{ version: number }>("PATCH", `consultation/${contentId}`, { expectedVersion: detail.version, ...patch });
    setBusy(false);
    if (r.ok) { setMsg("Güncellendi."); reload(); onChanged(); } else setMsg(`Hata: ${r.error}`);
  }
  async function doPublish() {
    setBusy(true); setMsg("");
    const r = await hdSend<{ id: string }>("POST", `consultation/${contentId}/publish`);
    setBusy(false);
    if (r.ok) { setMsg("Yayınlandı."); reload(); onChanged(); } else setMsg(`Hata: ${r.error}`);
  }
  async function doArchive() {
    if (!(await deleteConfirm({ message: "Bu danışmanlık içeriğini arşivlemek istiyor musunuz? (kalıcı silme değildir)" }))) return;
    setBusy(true); setMsg("");
    const r = await hdSend<{ id: string }>("POST", `consultation/${contentId}/archive`);
    setBusy(false);
    if (r.ok) { setMsg("Arşivlendi."); reload(); onChanged(); } else setMsg(`Hata: ${r.error}`);
  }

  if (loading) return <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…</div>;
  if (!detail) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-rose-600">{msg || "İçerik yüklenemedi."}</div>;

  const pinStale = detail.canonicalLive && detail.canonicalContentVersion != null && detail.canonicalLive.version !== detail.canonicalContentVersion;
  const canonicalReady = detail.canonicalLive?.status === "published" && !!detail.canonicalLive?.humanApprovedAt;
  const everySectionHasEvidence = detail.sections.filter((s) => s.status !== "archived").every((s) => s.evidence.length > 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <EditorHeader entry={entry} />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <StatusBadge status={detail.status} />
        <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">sürüm v{detail.version}</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">{detail.isAiGenerated ? "AI adayı" : "manuel"}</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">{detail.humanApprovedAt ? "insan-onaylı" : "onay yok"}</span>
        {detail.canonicalContentId
          ? <span className={`rounded px-2 py-0.5 ${pinStale ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>canonical pin {pinStale ? "BAYAT (repin gerek)" : `v${detail.canonicalContentVersion ?? "—"}`}</span>
          : <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-500">canonical pin yok</span>}
      </div>

      {/* Yayın preflight (read-only; DB publish RPC nihai karardır) */}
      <div className="mb-3 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">
        <p className="mb-1 font-semibold text-slate-500">Yayın ön-kontrolü (bilgi amaçlı; nihai karar DB)</p>
        <Preflight ok={canonicalReady} label="Canonical içerik yayınlı + insan-onaylı" />
        <Preflight ok={detail.sections.some((s) => s.status !== "archived")} label="En az bir aktif bölüm" />
        <Preflight ok={everySectionHasEvidence} label="Her aktif bölümde en az bir kanıt" />
        <Preflight ok={!pinStale} label="Canonical pin güncel (bayat değil)" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button disabled={busy} className="btn-outline-primary" onClick={() => doUpdate({ isAiGenerated: !detail.isAiGenerated })}>{detail.isAiGenerated ? "AI adayı işaretini kaldır" : "AI adayı işaretle"}</button>
        <button disabled={busy || !detail.canonicalContentId} className="btn-outline" onClick={() => doUpdate({ repin: true })} title="Canonical sürüm/hash'i DB'den yeniden pinle">Canonical yeniden pinle (repin)</button>
        {detail.status === "draft" && <button disabled={busy} className="btn-primary" onClick={doPublish}>Yayınla</button>}
        {detail.status !== "archived" && <button disabled={busy} className="btn-danger" onClick={doArchive}>Arşivle</button>}
        {msg && <span className={`self-center text-sm ${msg.startsWith("Hata") ? "text-rose-600" : "text-emerald-700"}`}>{msg}</span>}
      </div>

      <p className="mb-2 text-[11px] text-amber-600">Not: F1 sözleşmesinde bölüm metinleri oluşturulduktan sonra değiştirilemez (bölüm-düzeyi mutation RPC yok). Düzenleme gerekiyorsa arşivleyip yeniden oluşturun.</p>

      {/* Read-only detay */}
      <div className="flex flex-col gap-2">
        {detail.sections.map((s) => (
          <div key={s.id} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">{SECTION_KIND_LABEL[s.sectionKind]}</span>
              <span className="text-[10px] text-slate-400">{USAGE_SCOPE_LABEL[s.usageScope]}{s.topicScope ? ` · ${s.topicScope}` : ""}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{s.bodyText}</p>
            {s.conditions.length > 0 && <p className="mt-1 text-[11px] text-slate-500">Koşullar (AND): {s.conditions.map((c) => `${CONDITION_KIND_LABEL[c.conditionKind]}=${c.conditionValue}`).join(" & ")}</p>}
            {s.questions.length > 0 && <ul className="mt-1 list-disc pl-4 text-[11px] text-slate-500">{s.questions.map((qd) => <li key={qd.id}>{qd.questionText}</li>)}</ul>}
            {s.evidence.map((ev) => (
              <div key={ev.id} className="mt-1 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                {RELATION_TYPE_LABEL[ev.relationType]}{ev.isPrimary ? " · birincil" : ""} — {ev.passage ? `${ev.passage.sourceTitle} (${ev.passage.locatorLabel}: ${ev.passage.locatorValue})` : ev.passageId}
                {ev.passage && <span className="ml-1 text-slate-400">[hak: {ev.passage.rightsStatus} · uzman:{ev.passage.expertGuide.allowed ? "✓" : "✗"} rapor:{ev.passage.clientReport.allowed ? "✓" : "✗"}{ev.passage.hasOverride ? " · override" : ""}]</span>}
              </div>
            ))}
          </div>
        ))}
        {(detail.contentQuestions.length > 0 || detail.contentConditions.length > 0) && (
          <div className="rounded-lg border border-slate-200 p-3 text-[11px] text-slate-500">
            <p className="mb-1 font-semibold">İçerik düzeyi</p>
            {detail.contentConditions.length > 0 && <p>Koşullar: {detail.contentConditions.map((c) => `${CONDITION_KIND_LABEL[c.conditionKind]}=${c.conditionValue}`).join(" & ")}</p>}
            {detail.contentQuestions.map((qd) => <div key={qd.id}>• {qd.questionText}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: HdConsultationStatus }) {
  const cls = status === "published" ? "bg-emerald-100 text-emerald-700" : status === "archived" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{STATUS_LABEL[status]}</span>;
}
function Preflight({ ok, label }: { ok: boolean | null | undefined; label: string }) {
  return <div className={`flex items-center gap-1 ${ok ? "text-emerald-700" : "text-slate-400"}`}><span>{ok ? "✓" : "○"}</span> {label}</div>;
}
