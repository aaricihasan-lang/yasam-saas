"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Save, Trash2 } from "lucide-react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { bioApiUpdate } from "@/lib/biyoenerji/secureApi";
import {
  fetchChakraRecordById,
  CHAKRAS_LIST_PATH,
  type ChakraDetailItem,
} from "@/lib/bioenergy/chakrasListFetch";
import { chakraDetailHref } from "@/lib/bioenergy/chakrasRoutes";
import { fetchChakraBlocks } from "@/lib/bioenergy/chakraBlocksFetch";
import type { ChakraContentBlock } from "@/lib/bioenergy/chakraWorkspace";
import {
  CHAKRA_SECTION_KEYS,
  VISIBLE_BLOCK_TYPES,
  SOURCE_EVIDENCE_BLOCK_TYPE,
  renumberSortOrders,
} from "@/lib/bioenergy/chakraBlockCrud";
import {
  createChakraBlock,
  updateChakraBlock,
  deleteChakraBlock,
  reorderChakraBlocks,
} from "@/lib/bioenergy/chakraBlocksCrudClient";
import { BiyoenerjiConfirmModal } from "./BiyoenerjiConfirmModal";

const SECTION_LABEL: Record<string, string> = {
  "genel-bakis": "Genel Bakış",
  "enerji-anatomisi": "Enerji Anatomisi & Denge",
  "nedenler-blokajlar": "Nedenler & Blokajlar",
  "beden-sistem": "Beden & Sistem",
  "duygusal-zihinsel": "Duygusal & Zihinsel",
  "uygulamalar": "Uygulamalar",
  "taslar-destekleyiciler": "Taşlar & Destekleyiciler",
  "notlar-kaynaklar": "Notlar & Kaynaklar",
};
const BLOCK_TYPE_LABEL: Record<string, string> = {
  overview: "Genel içerik",
  state: "Durum",
  "variation-summary": "Farklılıklar",
  "claim-summary": "Kaynak İddiaları",
  application: "Uygulama",
  "supporter-note": "Destekleyici",
};

type BlockDraft = { block_title: string; block_type: string; section_key: string; editorial_explanation: string };
type NewDraft = BlockDraft & { tempId: string; section_key: string };

const draftFromBlock = (b: ChakraContentBlock): BlockDraft => ({
  block_title: b.block_title ?? "",
  block_type: b.block_type ?? "overview",
  section_key: b.section_key,
  editorial_explanation: b.editorial_explanation ?? "",
});
const sameDraft = (a: BlockDraft, b: BlockDraft) =>
  a.block_title === b.block_title && a.block_type === b.block_type &&
  a.section_key === b.section_key && a.editorial_explanation === b.editorial_explanation;

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100";
const btnGhost =
  "inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40";

export default function ChakraContentEditor({ id }: { id: string }) {
  const { isDemo } = useDemoGuard();
  const [record, setRecord] = useState<ChakraDetailItem | null>(null);
  const [blocks, setBlocks] = useState<ChakraContentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Temel bilgiler formu
  const [basic, setBasic] = useState({ name: "", sanskrit_name: "", element: "", bija_mantra: "", location: "", color: "" });
  const [savedBasic, setSavedBasic] = useState(basic);
  const [basicSaving, setBasicSaving] = useState(false);

  // Block draft state
  const [drafts, setDrafts] = useState<Record<string, BlockDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newDrafts, setNewDrafts] = useState<NewDraft[]>([]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ "genel-bakis": true });
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);

  const showToast = useCallback((kind: "ok" | "err", text: string) => setToast({ kind, text }), []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const loadAll = useCallback(async () => {
    // Tüm setState çağrıları ilk await'ten SONRA (senkron effect-setState yok).
    const rid = id.trim();
    const tenantId = rid ? await getSyncedTenantId() : null;
    const [rec, blk] = rid && tenantId
      ? await Promise.all([fetchChakraRecordById(tenantId, rid), fetchChakraBlocks(rid)])
      : [null, null];
    setLoading(false);
    if (!rid) { setError("Geçersiz kayıt bağlantısı."); return; }
    if (!tenantId) { setError("Oturum bulunamadı."); return; }
    if (!rec || rec.error || !rec.data) { setError(rec?.error ? `Kayıt okunamadı: ${rec.error}` : "Kayıt bulunamadı."); return; }
    setError("");
    setRecord(rec.data);
    const b = { name: rec.data.name ?? "", sanskrit_name: rec.data.sanskrit_name ?? "", element: rec.data.element ?? "", bija_mantra: rec.data.bija_mantra ?? "", location: rec.data.location ?? "", color: rec.data.color ?? "" };
    setBasic(b); setSavedBasic(b);
    setBlocks(blk?.blocks ?? []);
    setDrafts(Object.fromEntries((blk?.blocks ?? []).filter((x) => x.block_type !== SOURCE_EVIDENCE_BLOCK_TYPE).map((x) => [x.id, draftFromBlock(x)])));
  }, [id]);

  // Mount-time veri yüklemesi (tüm setState await SONRASI; proje konvansiyonu ile disable).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadAll(); }, [loadAll]);

  // Görünür blokları section'a göre grupla (deterministik)
  const visibleBySection = useMemo(() => {
    const map: Record<string, ChakraContentBlock[]> = {};
    for (const s of CHAKRA_SECTION_KEYS) map[s] = [];
    for (const b of blocks) {
      if (b.block_type === SOURCE_EVIDENCE_BLOCK_TYPE) continue;
      (map[b.section_key] ??= []).push(b);
    }
    for (const s of Object.keys(map)) {
      map[s].sort((a, b) =>
        a.sort_order !== b.sort_order ? a.sort_order - b.sort_order
          : (a.created_at ?? "") < (b.created_at ?? "") ? -1 : a.id < b.id ? -1 : 1);
    }
    return map;
  }, [blocks]);

  // Dirty state: değişmiş block draft'ı, yeni draft, veya temel bilgi değişikliği
  const basicDirty = useMemo(() => JSON.stringify(basic) !== JSON.stringify(savedBasic), [basic, savedBasic]);
  const anyBlockDirty = useMemo(
    () => blocks.some((b) => drafts[b.id] && !sameDraft(drafts[b.id], draftFromBlock(b))),
    [blocks, drafts],
  );
  const isDirty = basicDirty || anyBlockDirty || newDrafts.length > 0;

  // Kaydedilmemiş değişiklik uyarısı (Next.js 16 desteklenen beforeunload)
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const guardWrite = () => {
    if (isDemo) { showToast("err", "Demo hesabında kayıt yapılamaz."); return false; }
    return true;
  };

  async function saveBasic() {
    if (!record || !guardWrite()) return;
    setBasicSaving(true);
    const { error } = await bioApiUpdate("chakras", record.id, {
      name: basic.name.trim(), sanskrit_name: basic.sanskrit_name.trim() || null, element: basic.element.trim() || null,
      bija_mantra: basic.bija_mantra.trim() || null, location: basic.location.trim() || null, color: basic.color.trim() || null,
    });
    setBasicSaving(false);
    if (error) { showToast("err", `Temel bilgiler kaydedilemedi: ${error}`); return; }
    setSavedBasic({ ...basic });
    showToast("ok", "Temel bilgiler güncellendi.");
  }

  async function saveBlock(b: ChakraContentBlock) {
    const d = drafts[b.id];
    if (!d || !guardWrite()) return;
    if (!d.editorial_explanation.trim()) { showToast("err", "İçerik boş olamaz."); return; }
    setSavingId(b.id);
    const { error } = await updateChakraBlock(b.id, {
      block_title: d.block_title.trim() || null, block_type: d.block_type, section_key: d.section_key, editorial_explanation: d.editorial_explanation,
    });
    setSavingId(null);
    if (error) { showToast("err", `Blok kaydedilemedi: ${error}`); return; }
    setBlocks((prev) => prev.map((x) => x.id === b.id ? { ...x, block_title: d.block_title.trim() || null, block_type: d.block_type, section_key: d.section_key, editorial_explanation: d.editorial_explanation } : x));
    showToast("ok", "Blok güncellendi.");
  }

  async function removeBlock(blockId: string) {
    if (!guardWrite()) return;
    setSavingId(blockId);
    const { error } = await deleteChakraBlock(blockId);
    setSavingId(null); setConfirmDelete(null);
    if (error) { showToast("err", `Blok silinemedi: ${error}`); return; }
    setBlocks((prev) => prev.filter((x) => x.id !== blockId));
    setDrafts((prev) => { const n = { ...prev }; delete n[blockId]; return n; });
    showToast("ok", "Blok silindi.");
  }

  async function move(section: string, blockId: string, dir: -1 | 1) {
    if (!record || !guardWrite()) return;
    const list = [...visibleBySection[section]];
    const i = list.findIndex((x) => x.id === blockId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const items = renumberSortOrders(list);
    // optimistic local sort_order
    const byId = new Map(items.map((it) => [it.id, it.sort_order]));
    setBlocks((prev) => prev.map((x) => byId.has(x.id) ? { ...x, sort_order: byId.get(x.id)! } : x));
    const { error } = await reorderChakraBlocks(record.id, items);
    if (error) { showToast("err", `Sıralama kaydedilemedi: ${error}`); void loadAll(); return; }
  }

  function addNew(section: string) {
    setNewDrafts((prev) => [...prev, { tempId: `new-${Date.now()}-${prev.length}`, section_key: section, block_title: "", block_type: "overview", editorial_explanation: "" }]);
    setOpenSections((s) => ({ ...s, [section]: true }));
  }

  async function saveNew(nd: NewDraft) {
    if (!record || !guardWrite()) return;
    if (!nd.editorial_explanation.trim()) { showToast("err", "İçerik boş olamaz."); return; }
    setSavingId(nd.tempId);
    const { id: newId, error } = await createChakraBlock({
      chakraId: record.id, section_key: nd.section_key, block_type: nd.block_type,
      block_title: nd.block_title.trim() || null, editorial_explanation: nd.editorial_explanation,
    });
    setSavingId(null);
    if (error || !newId) { showToast("err", `Blok eklenemedi: ${error ?? ""}`); return; }
    setNewDrafts((prev) => prev.filter((x) => x.tempId !== nd.tempId));
    showToast("ok", "Yeni blok eklendi.");
    void loadAll();
  }

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white/70 p-8 text-center text-slate-600">Yükleniyor…</div>;
  if (error && !record) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center font-semibold text-rose-800">{error}</div>;
  if (!record) return null;

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={chakraDetailHref(record.id) || CHAKRAS_LIST_PATH} className={btnGhost}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Detaya dön
        </Link>
        {isDirty && <span className="text-[12px] font-semibold text-amber-600">Kaydedilmemiş değişiklikler var</span>}
      </div>

      {toast && (
        <div className={`mb-3 rounded-lg border px-3 py-2 text-[12.5px] font-medium ${toast.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{toast.text}</div>
      )}

      {/* TEMEL BİLGİLER */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white/80 p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-black uppercase tracking-[0.12em] text-slate-500">Temel Bilgiler</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {([["name", "Çakra Adı *"], ["sanskrit_name", "Sanskritçe Ad"], ["element", "Element"], ["bija_mantra", "Bija Mantra"], ["location", "Konum"], ["color", "Renk"]] as const).map(([k, label]) => (
            <label key={k} className="block">
              <span className="mb-1 block text-[12px] font-semibold text-slate-600">{label}</span>
              <input className={inputCls} value={basic[k]} onChange={(e) => setBasic((b) => ({ ...b, [k]: e.target.value }))} />
            </label>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" disabled={basicSaving || !basicDirty || !basic.name.trim()} onClick={() => void saveBasic()}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-[13px] font-bold text-violet-800 transition hover:bg-violet-100 disabled:opacity-40">
            <Save className="h-4 w-4" aria-hidden /> {basicSaving ? "Kaydediliyor…" : "Temel Bilgileri Kaydet"}
          </button>
        </div>
      </section>

      {/* İÇERİK — 8 section */}
      <h2 className="mb-3 text-sm font-black uppercase tracking-[0.12em] text-slate-500">İçerik</h2>
      <div className="flex flex-col gap-3">
        {CHAKRA_SECTION_KEYS.map((section) => {
          const items = visibleBySection[section];
          const news = newDrafts.filter((n) => n.section_key === section);
          const open = openSections[section] ?? false;
          return (
            <section key={section} className="rounded-2xl border border-slate-200 bg-white/80">
              <button type="button" onClick={() => setOpenSections((s) => ({ ...s, [section]: !open }))}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
                <span className="flex items-center gap-2 text-[14px] font-black text-slate-800">
                  {SECTION_LABEL[section]}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{items.length}</span>
                </span>
                {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
              </button>

              {open && (
                <div className="flex flex-col gap-3 border-t border-slate-100 p-4">
                  {items.map((b, idx) => {
                    const d = drafts[b.id] ?? draftFromBlock(b);
                    const dirty = !sameDraft(d, draftFromBlock(b));
                    return (
                      <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <input className={`${inputCls} flex-1`} placeholder="Blok başlığı (opsiyonel)" value={d.block_title}
                            onChange={(e) => setDrafts((p) => ({ ...p, [b.id]: { ...d, block_title: e.target.value } }))} />
                          <select className={inputCls + " w-auto"} value={d.block_type}
                            onChange={(e) => setDrafts((p) => ({ ...p, [b.id]: { ...d, block_type: e.target.value } }))}>
                            {VISIBLE_BLOCK_TYPES.map((t) => <option key={t} value={t}>{BLOCK_TYPE_LABEL[t]}</option>)}
                          </select>
                          <select className={inputCls + " w-auto"} value={d.section_key}
                            onChange={(e) => setDrafts((p) => ({ ...p, [b.id]: { ...d, section_key: e.target.value } }))}>
                            {CHAKRA_SECTION_KEYS.map((s) => <option key={s} value={s}>{SECTION_LABEL[s]}</option>)}
                          </select>
                        </div>
                        <textarea rows={5} className={`${inputCls} resize-y leading-relaxed`} value={d.editorial_explanation}
                          onChange={(e) => setDrafts((p) => ({ ...p, [b.id]: { ...d, editorial_explanation: e.target.value } }))} />
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <button type="button" className={btnGhost} disabled={idx === 0} onClick={() => void move(section, b.id, -1)} aria-label="Yukarı taşı"><ChevronUp className="h-4 w-4" /></button>
                            <button type="button" className={btnGhost} disabled={idx === items.length - 1} onClick={() => void move(section, b.id, 1)} aria-label="Aşağı taşı"><ChevronDown className="h-4 w-4" /></button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                              disabled={savingId === b.id} onClick={() => setConfirmDelete({ id: b.id, title: d.block_title.trim() || SECTION_LABEL[section] })}><Trash2 className="h-4 w-4" /> Sil</button>
                            <button type="button" className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-[12.5px] font-bold text-violet-800 transition hover:bg-violet-100 disabled:opacity-40"
                              disabled={savingId === b.id || !dirty} onClick={() => void saveBlock(b)}><Save className="h-4 w-4" /> {savingId === b.id ? "…" : "Kaydet"}</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Yeni block draft'ları */}
                  {news.map((nd) => (
                    <div key={nd.tempId} className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <input className={`${inputCls} flex-1`} placeholder="Blok başlığı (opsiyonel)" value={nd.block_title}
                          onChange={(e) => setNewDrafts((p) => p.map((x) => x.tempId === nd.tempId ? { ...x, block_title: e.target.value } : x))} />
                        <select className={inputCls + " w-auto"} value={nd.block_type}
                          onChange={(e) => setNewDrafts((p) => p.map((x) => x.tempId === nd.tempId ? { ...x, block_type: e.target.value } : x))}>
                          {VISIBLE_BLOCK_TYPES.map((t) => <option key={t} value={t}>{BLOCK_TYPE_LABEL[t]}</option>)}
                        </select>
                      </div>
                      <textarea rows={4} className={`${inputCls} resize-y leading-relaxed`} placeholder="Blok içeriği…" value={nd.editorial_explanation}
                        onChange={(e) => setNewDrafts((p) => p.map((x) => x.tempId === nd.tempId ? { ...x, editorial_explanation: e.target.value } : x))} />
                      <div className="mt-2 flex justify-end gap-2">
                        <button type="button" className={btnGhost} onClick={() => setNewDrafts((p) => p.filter((x) => x.tempId !== nd.tempId))}>Vazgeç</button>
                        <button type="button" className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12.5px] font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-40"
                          disabled={savingId === nd.tempId} onClick={() => void saveNew(nd)}><Save className="h-4 w-4" /> {savingId === nd.tempId ? "…" : "Bloğu Ekle"}</button>
                      </div>
                    </div>
                  ))}

                  <button type="button" className={btnGhost + " self-start"} onClick={() => addNew(section)}>
                    <Plus className="h-4 w-4" /> Yeni Bilgi Bloğu
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <BiyoenerjiConfirmModal
        open={confirmDelete !== null}
        title="Bu içerik bloğunu silmek istediğinizden emin misiniz?"
        message={confirmDelete ? `"${confirmDelete.title}" bloğu kalıcı olarak silinecek. Kaynak-kanıt (provenance) satırlarına dokunulmaz.` : ""}
        busy={savingId === confirmDelete?.id}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void removeBlock(confirmDelete.id)}
      />
    </div>
  );
}
