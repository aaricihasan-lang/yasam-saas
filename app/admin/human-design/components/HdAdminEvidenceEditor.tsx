"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { hdGet, hdSend } from "../adminHdApi";
import type { HdContentEvidenceRow, HdRelationType } from "@/lib/human-design/admin/centralContentTypes";

const fieldCls = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400";
const lblCls = "mb-1 block text-[11px] font-bold text-slate-600";

const RELATIONS: { value: HdRelationType; label: string }[] = [
  { value: "supports", label: "Destekler" },
  { value: "contradicts", label: "Çelişir" },
  { value: "school_specific", label: "Ekole özgü" },
  { value: "background", label: "Arka plan" },
];

/**
 * İçerik ↔ kaynak pasajı kanıt bağı editörü. relation_type + primary + single-source
 * + editorial_note (pasaj-genel Kaynağa Özgü Not ile karıştırılmaz).
 * İçerik henüz kaydedilmemişse (contentId yok) önce içerik kaydı istenir.
 *
 * PERSISTED read: mount'ta ve her yazma sonrası kanıt bağları DB'den (GET
 * /api/admin/hd/evidence?content_id=…, verifyAdminRequest → service_role) hydrate
 * edilir → refresh sonrası mevcut bağlar görünmeye devam eder (session-local DEĞİL).
 */
export function HdAdminEvidenceEditor({ contentId }: { contentId: string | null }) {
  const [rows, setRows] = useState<HdContentEvidenceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [passageId, setPassageId] = useState("");
  const [relation, setRelation] = useState<HdRelationType>("supports");
  const [isPrimary, setIsPrimary] = useState(false);
  const [isSingle, setIsSingle] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!contentId) return;
    setLoading(true);
    const r = await hdGet<{ rows: HdContentEvidenceRow[] }>(`evidence?content_id=${encodeURIComponent(contentId)}`);
    if (r.ok) setRows(r.data.rows ?? []);
    else setMsg(r.error);
    setLoading(false);
  }, [contentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!contentId) {
    return <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Kaynak bağlantısı eklemek için önce içeriği (Ana Metin) kaydedin.</p>;
  }

  const add = async () => {
    if (passageId.trim() === "") { setMsg("Pasaj id gerekli."); return; }
    const r = await hdSend<{ id: string }>("POST", "evidence", {
      content_id: contentId,
      passage_id: passageId.trim(),
      relation_type: relation,
      is_primary: isPrimary,
      is_single_source: isSingle,
      editorial_note: note.trim() || null,
    });
    if (r.ok) {
      setPassageId(""); setNote(""); setIsPrimary(false); setIsSingle(false);
      setMsg("Kanıt bağı eklendi.");
      await load(); // DB gerçeği ile yeniden hydrate (session-local değil)
    } else setMsg(r.error);
  };

  const remove = async (id: string) => {
    const r = await hdSend("DELETE", `evidence?id=${id}`);
    if (r.ok) { setMsg("Silindi."); await load(); }
    else setMsg(r.error);
  };

  return (
    <div className="space-y-3">
      {msg && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{msg}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Kaynak bağlantıları yükleniyor…</div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((e) => (
            <li key={e.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs">
              <span>
                <span className="font-semibold">{RELATIONS.find((r) => r.value === e.relation_type)?.label}</span>
                {e.is_primary && <span className="ml-1 rounded bg-indigo-100 px-1 text-[10px] text-indigo-700">birincil</span>}
                {e.is_single_source && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">tek-kaynak</span>}
                <span className="ml-2 font-mono text-slate-400">{e.passage_id.slice(0, 8)}…</span>
              </span>
              <button type="button" onClick={() => remove(e.id)} className="text-rose-500"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
          {rows.length === 0 && <li className="py-3 text-center text-xs text-slate-500">Henüz kaynak bağlantısı yok.</li>}
        </ul>
      )}

      <div className="space-y-2 rounded-lg border border-slate-200 p-3">
        <div>
          <label className={lblCls}>Pasaj ID (Kaynaklar sekmesindeki pasajdan)</label>
          <input className={fieldCls} value={passageId} onChange={(e) => setPassageId(e.target.value)} placeholder="uuid" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lblCls}>İlişki Türü</label>
            <select className={fieldCls} value={relation} onChange={(e) => setRelation(e.target.value as HdRelationType)}>
              {RELATIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-3 pb-1">
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} /> Birincil</label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={isSingle} onChange={(e) => setIsSingle(e.target.checked)} /> Tek-kaynak</label>
          </div>
        </div>
        <div>
          <label className={lblCls}>İlişkiye Özgü Not (editorial_note)</label>
          <input className={fieldCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="pasaj-genel Kaynağa Özgü Not ile karıştırılmaz" />
        </div>
        <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" /> Kanıt Bağı Ekle</button>
      </div>
    </div>
  );
}
