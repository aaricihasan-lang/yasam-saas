"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Loader2, Pencil, Save, Trash2, UploadCloud, X } from "lucide-react";
import { hdGet, hdSend } from "../adminHdApi";
import { HdAdminSourceEditor } from "../components/HdAdminSourceEditor";
import { HdAdminEvidenceEditor } from "../components/HdAdminEvidenceEditor";
import { HdConfirmModal } from "../components/HdConfirmModal";
import { HdAutoTextarea } from "../components/HdAutoTextarea";
import { ReaderModal } from "@/components/common/reader/ReaderModal";
import { formatReaderText } from "@/components/common/reader/formatReaderText";
import {
  HD_KIND_BADGE,
  hdFieldsFor,
  hdTypedFieldKeys,
  isReaderEligible,
  type HdFieldMeta,
} from "@/lib/human-design/admin/hdFieldMeta";
import type {
  HdCanonicalContentRow,
  HdCanonicalEntityRow,
  HdEntityKind,
} from "@/lib/human-design/admin/centralContentTypes";

type Tab = "content" | "sources" | "evidence";

const fieldCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

export function HdAdminContentEditor({ entityKey }: { entityKey: string }) {
  const [entity, setEntity] = useState<HdCanonicalEntityRow | null>(null);
  const [content, setContent] = useState<HdCanonicalContentRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [published, setPublished] = useState(false);
  const [tab, setTab] = useState<Tab>("content");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [reader, setReader] = useState<{ title: string; badge: string; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [discardCb, setDiscardCb] = useState<(() => void) | null>(null);

  const fields = useMemo<HdFieldMeta[]>(() => (entity ? hdFieldsFor(entity.entity_kind) : []), [entity]);

  const buildForm = useCallback((kind: HdEntityKind, row: HdCanonicalContentRow | null) => {
    const init: Record<string, string> = {
      general_description: row?.general_description ?? "",
      report_text: row?.report_text ?? "",
    };
    for (const k of hdTypedFieldKeys(kind)) init[k] = (row?.[k] as string | null) ?? "";
    return init;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    const kindGuess = entityKey.split("_")[0] as HdEntityKind;
    const lr = await hdGet<{ rows: HdCanonicalEntityRow[] }>(`canonical?kind=${kindGuess}`);
    const ent = lr.ok ? (lr.data.rows ?? []).find((r) => r.canonical_key === entityKey) ?? null : null;
    setEntity(ent);
    if (ent) {
      const cr = await hdGet<{ row: HdCanonicalContentRow | null }>(`content?entityId=${ent.id}`);
      const row = cr.ok ? cr.data.row : null;
      setContent(row);
      setPublished(row?.status === "published");
      const f = buildForm(ent.entity_kind, row);
      setForm(f);
      setBaseline(f);
    }
    setLoading(false);
  }, [entityKey, buildForm]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline]);

  // beforeunload — yalnız edit + kaydedilmemiş değişiklik varken (refresh/tab close).
  useEffect(() => {
    if (!(editing && dirty)) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editing, dirty]);

  const patch = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const payload = useMemo(() => {
    if (!entity) return {};
    const out: Record<string, unknown> = {
      general_description: form.general_description ?? "",
      report_text: form.report_text ?? "",
    };
    for (const k of hdTypedFieldKeys(entity.entity_kind)) out[k] = form[k] ?? "";
    return out;
  }, [entity, form]);

  const save = async () => {
    if (!entity) return;
    setSaving(true);
    setMsg(null);
    const r = content
      ? await hdSend("PATCH", "content", { id: content.id, ...payload })
      : await hdSend("POST", "content", { entity_id: entity.id, ...payload });
    setSaving(false);
    if (r.ok) { setMsg("Kaydedildi."); setEditing(false); await load(); }
    else setMsg(`Hata: ${r.error}`); // edit mode açık kalır, değerler korunur
  };

  /** Edit'ten güvenli çıkış: kirliyse onay, değilse doğrudan. */
  const requestLeaveEdit = (after: () => void) => {
    if (editing && dirty) { setDiscardCb(() => after); return; }
    after();
  };

  const cancelEdit = () => requestLeaveEdit(() => { setForm(baseline); setEditing(false); setMsg(null); });

  const switchTab = (t: Tab) => {
    if (t === tab) return;
    if (tab === "content" && editing) requestLeaveEdit(() => { setForm(baseline); setEditing(false); setTab(t); });
    else setTab(t);
  };

  const publish = async () => {
    if (!content) { setMsg("Önce kaydedin."); return; }
    setSaving(true);
    const r = await hdSend("POST", "content/publish", { id: content.id });
    setSaving(false);
    setConfirmPublish(false);
    if (r.ok) { setMsg("Yayınlandı."); await load(); }
    else setMsg(`Yayınlanamadı: ${r.error}`);
  };

  const doDelete = async () => {
    if (!content) return;
    setSaving(true);
    const r = await hdSend("DELETE", `content?id=${content.id}`);
    setSaving(false);
    setConfirmDelete(false);
    if (r.ok) { setMsg("İçerik silindi."); setEditing(false); await load(); }
    else setMsg(`Silinemedi: ${r.error}`);
  };

  if (loading) {
    return <div className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…</div>;
  }
  if (!entity) {
    return <div className="p-8 text-sm text-rose-700">Canonical kimlik bulunamadı: {entityKey}</div>;
  }

  const badge = HD_KIND_BADGE[entity.entity_kind];
  const hasContent = content !== null;
  const TABS: { id: Tab; label: string }[] = [
    { id: "content", label: "Ana Metin" },
    { id: "sources", label: "Kaynaklar" },
    { id: "evidence", label: "Kaynak Bağlantıları" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <span className="mb-1.5 inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
            {badge}
          </span>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{entity.name_tr}</h1>
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">{entity.canonical_key}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${published ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {published ? "Yayınlandı" : "Taslak"}
          </span>
          {!editing ? (
            <>
              <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700">
                <Pencil className="h-4 w-4" /> Düzenle
              </button>
              {hasContent && (
                <>
                  <button type="button" onClick={() => setConfirmPublish(true)} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50" title="Yayınla">
                    <UploadCloud className="h-3.5 w-3.5" /> Yayınla
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50" title="İçeriği sil">
                    <Trash2 className="h-3.5 w-3.5" /> Sil
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Kaydet
              </button>
              <button type="button" onClick={cancelEdit} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
                <X className="h-4 w-4" /> İptal
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => switchTab(t.id)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-bold transition ${tab === t.id ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && <p className="mb-4 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-700 ring-1 ring-slate-100">{msg}</p>}

      {tab === "content" && (
        <>
          {!hasContent && !editing ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center">
              <BookOpen className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">Bu canonical kayıt için henüz içerik bulunmuyor.</p>
              <p className="mt-1 text-xs text-slate-400">Canonical kimlik korunur; yalnız içerik oluşturulur.</p>
              <button type="button" onClick={() => setEditing(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700">
                <Pencil className="h-4 w-4" /> İçerik Oluştur
              </button>
            </div>
          ) : editing ? (
            <div className="space-y-5">
              {fields.map((f) => (
                <div key={String(f.key)}>
                  <label htmlFor={`fld-${String(f.key)}`} className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600">
                    {f.label}
                    {f.helper ? <span className="ml-1.5 font-medium normal-case tracking-normal text-slate-400">{f.helper}</span> : null}
                  </label>
                  <HdAutoTextarea
                    id={`fld-${String(f.key)}`}
                    minRows={f.long ? 6 : 3}
                    value={form[f.key] ?? ""}
                    onChange={(e) => patch(String(f.key), e.target.value)}
                    className={fieldCls}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {fields.map((f) => {
                const value = (form[f.key] ?? "").trim();
                if (!value) {
                  return (
                    <section key={String(f.key)}>
                      <h2 className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">{f.label}</h2>
                      <p className="rounded-xl bg-slate-50/70 px-4 py-3 text-sm italic text-slate-400 ring-1 ring-slate-100">Henüz girilmedi.</p>
                    </section>
                  );
                }
                const eligible = isReaderEligible(f, value);
                return (
                  <section key={String(f.key)}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <h2 className="text-xs font-black uppercase tracking-wide text-slate-500">{f.label}</h2>
                      {eligible && (
                        <button type="button" onClick={() => setReader({ title: f.label, badge: `${badge} · ${entity.name_tr}`, text: value })} className="shrink-0 text-xs font-bold text-violet-600 hover:text-violet-800">
                          Tam metni oku →
                        </button>
                      )}
                    </div>
                    {eligible ? (
                      <button type="button" onClick={() => setReader({ title: f.label, badge: `${badge} · ${entity.name_tr}`, text: value })} className="block w-full rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 text-left transition hover:border-violet-200 hover:bg-violet-50/20">
                        <p className="line-clamp-4 whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{value}</p>
                        <span className="mt-2 inline-block text-xs font-semibold text-violet-500">Tam metni oku →</span>
                      </button>
                    ) : (
                      <div className="text-[15px] leading-relaxed text-slate-700">{formatReaderText(value)}</div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "sources" && <HdAdminSourceEditor editing={editing} />}
      {tab === "evidence" && <HdAdminEvidenceEditor contentId={content?.id ?? null} editing={editing} />}

      {/* Büyük okuyucu */}
      <ReaderModal
        open={reader !== null}
        title={reader?.title ?? ""}
        badge={reader?.badge ?? ""}
        contentSurface
        renderBody={() => formatReaderText(reader?.text ?? "")}
        onClose={() => setReader(null)}
      />

      {/* İçerik silme (LEVEL 2) */}
      <HdConfirmModal
        open={confirmDelete}
        title="İçeriği sil"
        severity="danger"
        description={
          <>
            <span className="font-semibold text-slate-800">{entity.name_tr}</span> canonical içeriğini silmek üzeresiniz.
            Bu işlem içerik kaydını ve ona bağlı kanıt bağlantılarını kaldırır. Canonical kimlik ve kaynak kayıtları silinmez.
            <span className="mt-1 block font-bold text-rose-600">Bu işlem geri alınamaz.</span>
          </>
        }
        confirmLabel="İçeriği Sil"
        loading={saving}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* Yayınla onayı */}
      <HdConfirmModal
        open={confirmPublish}
        title="İçeriği yayınla"
        severity="info"
        description="Bu içeriği yayınlamak (published) istiyor musunuz? Yayınlama için zorunlu alanlar dolu olmalıdır."
        confirmLabel="Yayınla"
        loading={saving}
        onConfirm={publish}
        onCancel={() => setConfirmPublish(false)}
      />

      {/* Kaydedilmemiş değişiklik koruması */}
      <HdConfirmModal
        open={discardCb !== null}
        title="Kaydedilmemiş değişiklikler"
        severity="danger"
        description="Kaydedilmemiş değişiklikleriniz var. Düzenlemeden çıkarsanız bu değişiklikler kaybolur."
        confirmLabel="Değişiklikleri sil"
        cancelLabel="Düzenlemeye dön"
        onConfirm={() => { const cb = discardCb; setDiscardCb(null); cb?.(); }}
        onCancel={() => setDiscardCb(null)}
      />
    </div>
  );
}
