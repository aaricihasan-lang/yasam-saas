"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { hdGet, hdSend } from "../adminHdApi";
import type {
  HdOriginalTextRow,
  HdSourcePassageRow,
  HdSourceRow,
} from "@/lib/human-design/admin/centralContentTypes";

const fieldCls = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400";
const lblCls = "mb-1 block text-[11px] font-bold text-slate-600";

/**
 * Merkezî kaynak editörü: kaynak künyesi + haklar + pasaj (Kaynağa Özgü Not) +
 * özgün metin + Sadık Türkçe Çeviri. "+ Ekle" önce LOCAL DRAFT; POST yalnız Kaydet'te.
 * Kaydedilmemiş taslak iptalinde DELETE yok. Uzman Notu YOK.
 */
export function HdAdminSourceEditor() {
  const [sources, setSources] = useState<HdSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; source_type: string; rights_status: string } | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);

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
      title: draft.title.trim(),
      source_type: draft.source_type,
      rights_status: draft.rights_status, // default-deny korunur (izin bayrakları false başlar)
    });
    if (r.ok) { setDraft(null); setMsg("Kaynak kaydedildi."); void load(); }
    else setMsg(`Hata: ${r.error}`);
  };

  const deleteSource = async (id: string) => {
    const r = await hdSend("DELETE", `sources?id=${id}`);
    if (r.ok) { setMsg("Kaynak silindi."); if (activeSourceId === id) setActiveSourceId(null); void load(); }
    else setMsg(r.error);
  };

  if (loading) return <div className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…</div>;

  return (
    <div className="space-y-3">
      {msg && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{msg}</p>}

      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wide text-indigo-700">Kaynaklar ({sources.length})</p>
        <button type="button" onClick={() => setDraft({ title: "", source_type: "book", rights_status: "unknown" })}
          disabled={draft !== null}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-indigo-300 px-2.5 py-1 text-xs font-bold text-indigo-600 disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" /> Ekle
        </button>
      </div>

      {draft && (
        <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
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
            <button type="button" onClick={saveDraft} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white"><Save className="h-3.5 w-3.5" /> Kaydet</button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600">İptal</button>
          </div>
        </div>
      )}

      <ul className="space-y-1.5">
        {sources.map((s) => (
          <li key={s.id} className="rounded-lg border border-slate-200">
            <div className="flex items-center justify-between px-3 py-2">
              <button type="button" onClick={() => setActiveSourceId(activeSourceId === s.id ? null : s.id)} className="text-left text-sm font-semibold text-slate-800">
                {s.title} <span className="ml-1 text-[11px] text-slate-400">({s.rights_status})</span>
              </button>
              <button type="button" onClick={() => deleteSource(s.id)} className="text-rose-500 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
            </div>
            {activeSourceId === s.id && <SourcePassages sourceId={s.id} onMsg={setMsg} />}
          </li>
        ))}
        {sources.length === 0 && !draft && <li className="py-4 text-center text-xs text-slate-500">Henüz kaynak yok.</li>}
      </ul>
    </div>
  );
}

function SourcePassages({ sourceId, onMsg }: { sourceId: string; onMsg: (m: string) => void }) {
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
      passage_kind: "excerpt", source_specific_note: note.trim() || null, // rights_note DEĞİL
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
          <PassageTexts passageId={p.id} onMsg={onMsg} />
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <input className={fieldCls} placeholder="Sayfa/konum" value={locator} onChange={(e) => setLocator(e.target.value)} />
        <input className={fieldCls} placeholder="Kaynağa Özgü Not (opsiyonel)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded border border-dashed border-indigo-300 px-2 py-1 text-[11px] font-bold text-indigo-600"><Plus className="h-3 w-3" /> Pasaj Ekle</button>
    </div>
  );
}

function PassageTexts({ passageId, onMsg }: { passageId: string; onMsg: (m: string) => void }) {
  const [originals, setOriginals] = useState<HdOriginalTextRow[]>([]);
  const [orig, setOrig] = useState("");
  const [tr, setTr] = useState("");
  const [targetOriginalId, setTargetOriginalId] = useState<string>("");
  // Dil/yazı sistemi DÜZENLENEBİLİR; en/Latn yalnız başlangıç değeridir.
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
    // content_hash server-side hesaplanır; dil/yazı kullanıcıdan gelir (sabit değil).
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
            <input type="radio" name={`ot-${passageId}`} checked={targetOriginalId === o.id} onChange={() => setTargetOriginalId(o.id)} />
            <span className="font-mono text-slate-500">{o.language_tag}/{o.script_code} · {o.content_hash.slice(0, 10)}…</span>
          </label>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-1.5">
        <input className={`${fieldCls} text-xs`} placeholder="Dil (ör. en, tr, de)" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Özgün metin dili (language_tag)" />
        <input className={`${fieldCls} text-xs`} placeholder="Yazı sistemi (ör. Latn, Arab)" value={script} onChange={(e) => setScript(e.target.value)} aria-label="Yazı sistemi (script_code)" />
      </div>
      <textarea rows={2} className={`${fieldCls} text-xs`} placeholder="Özgün metin (kaynağın dilinde)" value={orig} onChange={(e) => setOrig(e.target.value)} />
      <button type="button" onClick={addOriginal} className="rounded border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-bold text-slate-600">+ Özgün Metin</button>
      <textarea rows={2} className={`${fieldCls} text-xs`} placeholder="Sadık Türkçe Çeviri (seçili özgün metne pinlenir)" value={tr} onChange={(e) => setTr(e.target.value)} />
      <button type="button" onClick={addTranslation} className="rounded border border-dashed border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-700">+ Sadık Çeviri</button>
    </div>
  );
}
