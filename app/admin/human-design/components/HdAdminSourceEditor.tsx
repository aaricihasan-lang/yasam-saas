"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { hdGet, hdSend } from "../adminHdApi";
import { HdConfirmModal } from "./HdConfirmModal";
import type {
  HdOriginalTextRow,
  HdSourcePassageRow,
  HdSourceRow,
} from "@/lib/human-design/admin/centralContentTypes";

const fieldCls = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-violet-400";
const lblCls = "mb-1 block text-[11px] font-bold text-slate-600";

/**
 * Merkezî kaynak editörü: kaynak künyesi + haklar + pasaj (Kaynağa Özgü Not) +
 * özgün metin + Sadık Türkçe Çeviri.
 *
 * READ MODE (editing=false): salt-okunur premium liste (ekleme/silme kontrolleri gizli).
 * EDIT MODE (editing=true): mevcut mutation kontrolleri + korumalı (onaylı) kaynak silme.
 * "+ Ekle" önce LOCAL DRAFT; POST yalnız Kaydet'te. Uzman Notu YOK.
 */
export function HdAdminSourceEditor({ editing = false }: { editing?: boolean }) {
  const [sources, setSources] = useState<HdSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; source_type: string; rights_status: string } | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [confirmDeleteSource, setConfirmDeleteSource] = useState<HdSourceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await hdGet<{ rows: HdSourceRow[] }>("sources");
    if (r.ok) setSources(r.data.rows ?? []);
    else setMsg(r.error);
    setLoading(false);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const saveDraft = async () => {
    if (!draft) return;
    if (draft.title.trim() === "") { setMsg("Kaynak adı gerekli."); return; }
    const r = await hdSend<{ id: string }>("POST", "sources", {
      title: draft.title.trim(), source_type: draft.source_type, rights_status: draft.rights_status,
    });
    if (r.ok) { setDraft(null); setMsg("Kaynak kaydedildi."); void load(); }
    else setMsg(`Hata: ${r.error}`);
  };

  const doDeleteSource = async () => {
    if (!confirmDeleteSource) return;
    setDeleting(true);
    const r = await hdSend("DELETE", `sources?id=${confirmDeleteSource.id}`);
    setDeleting(false);
    const id = confirmDeleteSource.id;
    setConfirmDeleteSource(null);
    if (r.ok) { setMsg("Kaynak silindi."); if (activeSourceId === id) setActiveSourceId(null); void load(); }
    else setMsg(r.error); // bağımlı pasaj/evidence varsa DB RESTRICT → 409 açık mesaj
  };

  if (loading) return <div className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…</div>;

  return (
    <div className="space-y-3">
      {msg && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{msg}</p>}

      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wide text-violet-700">Kaynaklar ({sources.length})</p>
        {editing && (
          <button type="button" onClick={() => setDraft({ title: "", source_type: "book", rights_status: "unknown" })}
            disabled={draft !== null}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-violet-300 px-2.5 py-1 text-xs font-bold text-violet-600 disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" /> Ekle
          </button>
        )}
      </div>

      {editing && draft && (
        <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
          <div>
            <label className={lblCls}>Kaynak Adı *</label>
            <input className={fieldCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lblCls}>Kaynak Türü</label>
              <select className={fieldCls} value={draft.source_type} onChange={(e) => setDraft({ ...draft, source_type: e.target.value })}>
                <option value="book">Kitap</option>
                <option value="article">Makale</option>
                <option value="video">Video</option>
                <option value="teaching_note">Öğretim notu</option>
                <option value="other">Diğer</option>
              </select>
            </div>
            <div>
              <label className={lblCls}>Telif Durumu</label>
              <select className={fieldCls} value={draft.rights_status} onChange={(e) => setDraft({ ...draft, rights_status: e.target.value })}>
                <option value="unknown">Belirsiz (default-deny)</option>
                <option value="public_domain">Kamu malı</option>
                <option value="licensed">Lisanslı</option>
                <option value="permission_granted">İzin verildi</option>
                <option value="restricted">Kısıtlı</option>
                <option value="pending_review">İnceleme bekliyor</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={saveDraft} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white"><Save className="h-3.5 w-3.5" /> Kaydet</button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600">İptal</button>
          </div>
        </div>
      )}

      <ul className="space-y-1.5">
        {sources.map((s) => (
          <li key={s.id} className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-3 py-2">
              <button type="button" onClick={() => setActiveSourceId(activeSourceId === s.id ? null : s.id)} className="text-left text-sm font-semibold text-slate-800">
                {s.title} <span className="ml-1 text-[11px] text-slate-400">({s.rights_status})</span>
              </button>
              {editing && (
                <button type="button" onClick={() => setConfirmDeleteSource(s)} className="text-rose-500 hover:text-rose-700" aria-label="Kaynağı sil"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
            {activeSourceId === s.id && <SourcePassages sourceId={s.id} editing={editing} onMsg={setMsg} />}
          </li>
        ))}
        {sources.length === 0 && !draft && <li className="py-4 text-center text-xs text-slate-500">Henüz kaynak yok.</li>}
      </ul>

      <HdConfirmModal
        open={confirmDeleteSource !== null}
        title="Kaynağı sil"
        severity="danger"
        description={
          <>
            <span className="font-semibold text-slate-800">{confirmDeleteSource?.title}</span> kaynağını silmek üzeresiniz.
            Bir içeriğe bağlı pasaj/kanıt varsa kaynak silinemez (kullanımda). Bu işlem geri alınamaz.
          </>
        }
        confirmLabel="Kaynağı Sil"
        loading={deleting}
        onConfirm={doDeleteSource}
        onCancel={() => setConfirmDeleteSource(null)}
      />
    </div>
  );
}

function SourcePassages({ sourceId, editing, onMsg }: { sourceId: string; editing: boolean; onMsg: (m: string) => void }) {
  const [passages, setPassages] = useState<HdSourcePassageRow[]>([]);
  const [note, setNote] = useState("");
  const [locator, setLocator] = useState("");

  const load = useCallback(async () => {
    const r = await hdGet<{ rows: HdSourcePassageRow[] }>(`passages?sourceId=${sourceId}`);
    if (r.ok) setPassages(r.data.rows ?? []);
  }, [sourceId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (locator.trim() === "") { onMsg("Pasaj konumu gerekli."); return; }
    const r = await hdSend("POST", "passages", {
      source_id: sourceId, locator_kind: "page", locator_label: "Sayfa", locator_value: locator.trim(),
      passage_kind: "excerpt", source_specific_note: note.trim() || null,
    });
    if (r.ok) { setLocator(""); setNote(""); void load(); }
    else onMsg(r.error);
  };

  return (
    <div className="space-y-2 border-t border-slate-100 bg-slate-50/40 px-3 py-2">
      <p className="text-[11px] font-bold text-slate-500">Pasajlar ({passages.length})</p>
      {passages.map((p) => (
        <div key={p.id} className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs">
          <div className="font-semibold">{p.locator_label} {p.locator_value}</div>
          {p.source_specific_note && <div className="mt-0.5 text-slate-500">Kaynağa Özgü Not: {p.source_specific_note}</div>}
          <PassageTexts passageId={p.id} editing={editing} onMsg={onMsg} />
        </div>
      ))}
      {editing && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <input className={fieldCls} placeholder="Sayfa/konum" value={locator} onChange={(e) => setLocator(e.target.value)} />
            <input className={fieldCls} placeholder="Kaynağa Özgü Not (opsiyonel)" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded border border-dashed border-violet-300 px-2 py-1 text-[11px] font-bold text-violet-600"><Plus className="h-3 w-3" /> Pasaj Ekle</button>
        </>
      )}
    </div>
  );
}

function PassageTexts({ passageId, editing, onMsg }: { passageId: string; editing: boolean; onMsg: (m: string) => void }) {
  const [originals, setOriginals] = useState<HdOriginalTextRow[]>([]);
  const [orig, setOrig] = useState("");
  const [tr, setTr] = useState("");
  const [targetOriginalId, setTargetOriginalId] = useState<string>("");
  const [lang, setLang] = useState("en");
  const [script, setScript] = useState("Latn");

  const load = useCallback(async () => {
    const r = await hdGet<{ rows: HdOriginalTextRow[] }>(`original-texts?passageId=${passageId}`);
    if (r.ok) setOriginals(r.data.rows ?? []);
  }, [passageId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const addOriginal = async () => {
    if (orig.trim() === "") { onMsg("Özgün metin gerekli."); return; }
    if (lang.trim() === "" || script.trim() === "") { onMsg("Dil ve yazı sistemi gerekli."); return; }
    const r = await hdSend("POST", "original-texts", {
      passage_id: passageId, language_tag: lang.trim(), script_code: script.trim(), original_text: orig,
    });
    if (r.ok) { setOrig(""); void load(); }
    else onMsg(r.error);
  };
  const addTranslation = async () => {
    if (!targetOriginalId) { onMsg("Önce özgün metin seçin."); return; }
    const r = await hdSend("POST", "translations", { original_text_id: targetOriginalId, target_language_tag: "tr", translation_text: tr, status: "draft" });
    if (r.ok) { setTr(""); onMsg("Sadık çeviri eklendi."); }
    else onMsg(r.error);
  };

  return (
    <div className="mt-1 space-y-1.5 border-t border-slate-100 pt-1.5">
      <p className="text-[10px] font-bold uppercase text-slate-400">Özgün Metin & Sadık Türkçe Çeviri</p>
      {originals.map((o) => (
        <div key={o.id} className="text-[11px]">
          <label className="flex items-center gap-1">
            <input type="radio" name={`ot-${passageId}`} checked={targetOriginalId === o.id} onChange={() => setTargetOriginalId(o.id)} disabled={!editing} />
            <span className="font-mono text-slate-500">{o.language_tag}/{o.script_code} · {o.content_hash.slice(0, 10)}…</span>
          </label>
        </div>
      ))}
      {editing && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <input className={`${fieldCls} text-xs`} placeholder="Dil (ör. en, tr, de)" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Özgün metin dili (language_tag)" />
            <input className={`${fieldCls} text-xs`} placeholder="Yazı sistemi (ör. Latn, Arab)" value={script} onChange={(e) => setScript(e.target.value)} aria-label="Yazı sistemi (script_code)" />
          </div>
          <textarea rows={2} className={`${fieldCls} text-xs`} placeholder="Özgün metin (kaynağın dilinde)" value={orig} onChange={(e) => setOrig(e.target.value)} />
          <button type="button" onClick={addOriginal} className="rounded border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-bold text-slate-600">+ Özgün Metin</button>
          <textarea rows={2} className={`${fieldCls} text-xs`} placeholder="Sadık Türkçe Çeviri (seçili özgün metne pinlenir)" value={tr} onChange={(e) => setTr(e.target.value)} />
          <button type="button" onClick={addTranslation} className="rounded border border-dashed border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-700">+ Sadık Çeviri</button>
        </>
      )}
    </div>
  );
}
