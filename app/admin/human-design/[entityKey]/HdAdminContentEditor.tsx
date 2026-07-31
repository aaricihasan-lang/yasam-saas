"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Save, Trash2, UploadCloud } from "lucide-react";
import { hdGet, hdSend } from "../adminHdApi";
import { HdAdminSourceEditor } from "../components/HdAdminSourceEditor";
import { HdAdminEvidenceEditor } from "../components/HdAdminEvidenceEditor";
import type {
  HdCanonicalContentRow,
  HdCanonicalEntityRow,
  HdEntityKind,
} from "@/lib/human-design/admin/centralContentTypes";

type Tab = "content" | "sources" | "evidence";

const TYPE_FIELDS: Record<HdEntityKind, { key: keyof HdCanonicalContentRow; label: string }[]> = {
  tip: [
    { key: "strategy_text", label: "Strateji" },
    { key: "signature_text", label: "İmza" },
    { key: "not_self_text", label: "Yanlış-Benlik" },
  ],
  otorite: [
    { key: "decision_mechanism", label: "Karar Mekanizması" },
    { key: "application_text", label: "Uygulama" },
    { key: "caution_notes", label: "Dikkat Notları" },
  ],
  kapi: [{ key: "general_theme", label: "Genel Tema" }],
  kanal: [
    { key: "full_channel_text", label: "Tam Kanal Metni" },
    { key: "hanging_gate_context", label: "Tek Uçlu (Hanging Gate) Bağlam" },
  ],
};

const fieldCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed outline-none focus:border-indigo-400";

export function HdAdminContentEditor({ entityKey }: { entityKey: string }) {
  const [entity, setEntity] = useState<HdCanonicalEntityRow | null>(null);
  const [content, setContent] = useState<HdCanonicalContentRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [published, setPublished] = useState(false);
  const [tab, setTab] = useState<Tab>("content");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    // canonical_key → entity çözümü (liste küçük: 112 kayıt).
    const kindGuess = entityKey.split("_")[0] as HdEntityKind;
    const lr = await hdGet<{ rows: HdCanonicalEntityRow[] }>(`canonical?kind=${kindGuess}`);
    const ent = lr.ok ? (lr.data.rows ?? []).find((r) => r.canonical_key === entityKey) ?? null : null;
    setEntity(ent);
    if (ent) {
      const cr = await hdGet<{ row: HdCanonicalContentRow | null }>(`content?entityId=${ent.id}`);
      const row = cr.ok ? cr.data.row : null;
      setContent(row);
      setPublished(row?.status === "published");
      const init: Record<string, string> = {
        general_description: row?.general_description ?? "",
        report_text: row?.report_text ?? "",
      };
      for (const f of TYPE_FIELDS[ent.entity_kind]) init[f.key] = (row?.[f.key] as string | null) ?? "";
      setForm(init);
    }
    setLoading(false);
  }, [entityKey]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const patch = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const payload = useMemo(() => {
    if (!entity) return {};
    const out: Record<string, unknown> = {
      general_description: form.general_description ?? "",
      report_text: form.report_text ?? "",
    };
    for (const f of TYPE_FIELDS[entity.entity_kind]) out[f.key] = form[f.key] ?? "";
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
    if (r.ok) { setMsg("Kaydedildi."); void load(); }
    else setMsg(`Hata: ${r.error}`);
  };

  const publish = async () => {
    if (!content) { setMsg("Önce kaydedin."); return; }
    setSaving(true);
    const r = await hdSend("POST", "content/publish", { id: content.id });
    setSaving(false);
    if (r.ok) { setMsg("Yayınlandı."); void load(); }
    else setMsg(`Yayınlanamadı: ${r.error}`);
  };

  const doDelete = async () => {
    if (!content) return;
    setSaving(true);
    const r = await hdSend("DELETE", `content?id=${content.id}`);
    setSaving(false);
    setConfirmDelete(false);
    if (r.ok) { setMsg("Silindi."); void load(); }
    else setMsg(`Silinemedi: ${r.error}`);
  };

  if (loading) return <div className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…</div>;
  if (!entity) return <div className="p-8 text-sm text-rose-700">Canonical kimlik bulunamadı: {entityKey}</div>;

  const TABS: { id: Tab; label: string }[] = [
    { id: "content", label: "Ana Metin" },
    { id: "sources", label: "Kaynaklar" },
    { id: "evidence", label: "Kaynak Bağlantıları" },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <Link href="/admin/human-design" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Listeye dön
      </Link>
      <h1 className="text-lg font-black text-indigo-800">{entity.name_tr}</h1>
      <p className="mb-4 font-mono text-[11px] text-slate-400">{entity.canonical_key} · {entity.entity_kind}</p>

      <div className="mb-4 flex gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-bold ${tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{msg}</p>}

      {tab === "content" && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Genel Açıklama</label>
            <textarea rows={4} value={form.general_description ?? ""} onChange={(e) => patch("general_description", e.target.value)} className={`${fieldCls} resize-y`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Kaynaklandırılmış Ana Metin</label>
            <div className="mb-1.5 rounded-md bg-emerald-50/60 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800">
              Kaynaklardaki anlamı, kesinlik derecesini ve teknik terminolojiyi koruyan ana rapor metni. Özet değildir; her önemli ifade kaynağa (Kaynak Bağlantıları) izlenebilir olmalıdır.
            </div>
            <textarea rows={8} value={form.report_text ?? ""} onChange={(e) => patch("report_text", e.target.value)} className={`${fieldCls} resize-y`} />
          </div>
          {TYPE_FIELDS[entity.entity_kind].map((f) => (
            <div key={String(f.key)}>
              <label className="mb-1 block text-xs font-bold text-slate-700">{f.label}</label>
              <textarea rows={3} value={form[f.key] ?? ""} onChange={(e) => patch(String(f.key), e.target.value)} className={`${fieldCls} resize-y`} />
            </div>
          ))}

          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${published ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
              {published ? "Yayınlandı" : "Taslak"}
            </span>
            <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
              <Save className="h-4 w-4" /> Kaydet
            </button>
            <button type="button" onClick={publish} disabled={saving || !content} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-bold text-emerald-700 disabled:opacity-50">
              <UploadCloud className="h-4 w-4" /> Yayınla
            </button>
            {content && (
              confirmDelete ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-xs font-bold text-rose-700">Emin misiniz?</span>
                  <button type="button" onClick={doDelete} disabled={saving} className="rounded-lg bg-rose-600 px-2.5 py-2 text-xs font-bold text-white">Evet, Gerçekten Sil</button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-bold text-slate-600">Vazgeç</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-2 text-sm font-bold text-rose-700">
                  <Trash2 className="h-4 w-4" /> Gerçekten Sil
                </button>
              )
            )}
          </div>
        </div>
      )}

      {tab === "sources" && <HdAdminSourceEditor />}
      {tab === "evidence" && <HdAdminEvidenceEditor contentId={content?.id ?? null} />}
    </div>
  );
}
