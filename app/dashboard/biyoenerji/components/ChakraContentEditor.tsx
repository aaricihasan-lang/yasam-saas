"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useHistoryBackGuard } from "@/lib/biyoenerji/historyBackGuard";

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
  "claim-summary": "Kaynak Özeti",
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
  "w-full max-sm:min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100";
const btnGhost =
  "inline-flex min-h-[44px] sm:min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40";

export default function ChakraContentEditor({ id }: { id: string }) {
  const { isDemo } = useDemoGuard();
  const router = useRouter();
  const [record, setRecord] = useState<ChakraDetailItem | null>(null);
  const [blocks, setBlocks] = useState<ChakraContentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Temel bilgiler formu
  // BIO-05 — "Ek Bilgiler": oluşturma formunda girilen eski alanlar (organlar, bezler,
  // taşlar, nedenler, fiziksel, zihinsel, notlar) burada da DÜZENLENEBİLİR. Kayıt
  // yalnız DEĞİŞEN alanları gönderir (kısmi PATCH; dokunulmayan alan ezilmez).
  const [basic, setBasic] = useState({
    name: "", sanskrit_name: "", element: "", bija_mantra: "", location: "", color: "",
    organs: "", glands: "", stones: "", causes: "", physical: "", mental: "", notes: "",
  });
  const [savedBasic, setSavedBasic] = useState(basic);
  const [basicSaving, setBasicSaving] = useState(false);

  // Block draft state
  const [drafts, setDrafts] = useState<Record<string, BlockDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newDrafts, setNewDrafts] = useState<NewDraft[]>([]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ "genel-bakis": true });
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  // P1 — kaydedilmemiş değişiklik varken iç navigasyon (Detaya dön) çıkış onayı
  const [pendingHref, setPendingHref] = useState<string | null>(null);

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
    const r = rec.data;
    const b = {
      name: r.name ?? "", sanskrit_name: r.sanskrit_name ?? "", element: r.element ?? "", bija_mantra: r.bija_mantra ?? "", location: r.location ?? "", color: r.color ?? "",
      organs: r.organs ?? "", glands: r.glands ?? "", stones: r.stones ?? "", causes: r.causes ?? "", physical: r.physical ?? "", mental: r.mental ?? "", notes: r.notes ?? "",
    };
    setBasic(b); setSavedBasic(b);
    setBlocks(blk?.blocks ?? []);
    setDrafts(Object.fromEntries((blk?.blocks ?? []).filter((x) => x.block_type !== SOURCE_EVIDENCE_BLOCK_TYPE).map((x) => [x.id, draftFromBlock(x)])));
  }, [id]);

  // BIO-04 — yalnız blokları yeniden oku; kullanıcının KİRLİ taslakları (temel bilgiler,
  // diğer blok düzenlemeleri, yeni blok taslakları) KORUNUR. loadAll() yalnız ilk yüklemede.
  const blocksRef = useRef<ChakraContentBlock[]>([]);
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);
  const reloadBlocks = useCallback(async (): Promise<boolean> => {
    const rid = id.trim();
    if (!rid) return false;
    const blk = await fetchChakraBlocks(rid);
    if (blk.error) return false;
    const prevById = new Map(blocksRef.current.map((x) => [x.id, x]));
    setBlocks(blk.blocks);
    setDrafts((prevDrafts) => {
      const next: Record<string, BlockDraft> = {};
      for (const x of blk.blocks) {
        if (x.block_type === SOURCE_EVIDENCE_BLOCK_TYPE) continue;
        const old = prevById.get(x.id);
        const d = prevDrafts[x.id];
        // Kullanıcı bu bloğu düzenlemişse (eski sunucu değerinden farklı) taslağı koru.
        next[x.id] = d && old && !sameDraft(d, draftFromBlock(old)) ? d : draftFromBlock(x);
      }
      return next;
    });
    return true;
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

  // BIO-07 — tarayıcı / Android geri tuşu: kirli editörde onay gösterilir; temizse normal geri.
  const [backPrompt, setBackPrompt] = useState(false);
  const { leave: leaveViaHistory } = useHistoryBackGuard(
    isDirty,
    ({ stay }) => {
      stay();
      setBackPrompt(true);
    },
    { autoContinueWhenDisarmed: true },
  );

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
    if (!record || !guardWrite() || basicSaving) return;
    // BIO-05 — yalnız değişen alanlar gönderilir (kısmi PATCH semantiği korunur).
    const keys = Object.keys(basic) as (keyof typeof basic)[];
    const patch: Record<string, string | null> = {};
    for (const k of keys) {
      if (basic[k] === savedBasic[k]) continue;
      const v = basic[k].trim();
      patch[k] = k === "name" ? v : v || null;
    }
    if (Object.keys(patch).length === 0) return;
    const sent = { ...basic };
    setBasicSaving(true);
    const { error } = await bioApiUpdate("chakras", record.id, patch);
    setBasicSaving(false);
    if (error) { showToast("err", `Bilgiler kaydedilemedi: ${error}`); return; }
    setSavedBasic(sent);
    showToast("ok", "Çakra bilgileri güncellendi.");
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

  // BIO-09 — sıralama istekleri SERİLEŞTİRİLİR: bir istek sürerken yeni taşıma yapılmaz
  // (UI ile DB sırasının ayrışması engellenir). Senkron ref kilidi + görünür disabled.
  const reorderLockRef = useRef(false);
  const [reorderBusy, setReorderBusy] = useState(false);

  async function move(section: string, blockId: string, dir: -1 | 1) {
    if (!record || !guardWrite() || reorderLockRef.current) return;
    const list = [...visibleBySection[section]];
    const i = list.findIndex((x) => x.id === blockId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const items = renumberSortOrders(list);
    // optimistic local sort_order
    const byId = new Map(items.map((it) => [it.id, it.sort_order]));
    setBlocks((prev) => prev.map((x) => byId.has(x.id) ? { ...x, sort_order: byId.get(x.id)! } : x));
    reorderLockRef.current = true;
    setReorderBusy(true);
    try {
      const { error } = await reorderChakraBlocks(record.id, items);
      if (error) {
        showToast("err", `Sıralama kaydedilemedi: ${error}`);
        // BIO-04 — gerçek sırayı sunucudan al; kirli taslaklar korunur (loadAll DEĞİL).
        await reloadBlocks();
      }
    } finally {
      reorderLockRef.current = false;
      setReorderBusy(false);
    }
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
    // BIO-04 — yalnız blok listesi yenilenir; temel bilgi/diğer taslaklar ezilmez.
    await reloadBlocks();
  }

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white/70 p-8 text-center text-slate-600">Yükleniyor…</div>;
  if (error && !record) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center font-semibold text-rose-800">{error}</div>;
  if (!record) return null;

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={chakraDetailHref(record.id) || CHAKRAS_LIST_PATH}
          onClick={(e) => {
            // Form CLEAN ise Link normal SPA geçişi yapar; DIRTY ise çıkış onayı açılır.
            if (isDirty) {
              e.preventDefault();
              setPendingHref(chakraDetailHref(record.id) || CHAKRAS_LIST_PATH);
            }
          }}
          className={btnGhost}
        >
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
        {/* BIO-05 — Ek Bilgiler (oluşturma formundaki alanlar; "Taşlar" Doğaltaş eşleşmesini besler) */}
        <h3 className="mb-2 mt-5 text-[12px] font-black uppercase tracking-[0.12em] text-slate-500">Ek Bilgiler</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {([["organs", "Organlar"], ["glands", "Bezler"], ["stones", "Taşlar"], ["causes", "Nedenler"], ["physical", "Fiziksel"], ["mental", "Zihinsel"], ["notes", "Notlar"]] as const).map(([k, label]) => (
            <label key={k} className={`block ${k === "notes" ? "sm:col-span-2" : ""}`}>
              <span className="mb-1 block text-[12px] font-semibold text-slate-600">{label}</span>
              <textarea
                rows={k === "notes" ? 4 : 3}
                className={`${inputCls} resize-y leading-relaxed`}
                value={basic[k]}
                onChange={(e) => setBasic((b) => ({ ...b, [k]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" disabled={basicSaving || !basicDirty || !basic.name.trim()} onClick={() => void saveBasic()}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-[13px] font-bold text-violet-800 transition hover:bg-violet-100 disabled:opacity-40">
            <Save className="h-4 w-4" aria-hidden /> {basicSaving ? "Kaydediliyor…" : "Bilgileri Kaydet"}
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
                            <button type="button" className={btnGhost} disabled={idx === 0 || reorderBusy} onClick={() => void move(section, b.id, -1)} aria-label="Yukarı taşı"><ChevronUp className="h-4 w-4" /></button>
                            <button type="button" className={btnGhost} disabled={idx === items.length - 1 || reorderBusy} onClick={() => void move(section, b.id, 1)} aria-label="Aşağı taşı"><ChevronDown className="h-4 w-4" /></button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" className="inline-flex min-h-[44px] sm:min-h-[38px] items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                              disabled={savingId === b.id} onClick={() => setConfirmDelete({ id: b.id, title: d.block_title.trim() || SECTION_LABEL[section] })}><Trash2 className="h-4 w-4" /> Sil</button>
                            <button type="button" className="inline-flex min-h-[44px] sm:min-h-[38px] items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-[12.5px] font-bold text-violet-800 transition hover:bg-violet-100 disabled:opacity-40"
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
                        <button type="button" className="inline-flex min-h-[44px] sm:min-h-[38px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12.5px] font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-40"
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
        message={confirmDelete ? `"${confirmDelete.title}" bloğu kalıcı olarak silinecek. Kaynak bilgisi kayıtlarına dokunulmaz.` : ""}
        busy={savingId === confirmDelete?.id}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void removeBlock(confirmDelete.id)}
      />

      {/* P1 — kaydedilmemiş değişiklik çıkış onayı (iç navigasyon). BIO-004 modal
          diyaloğuyla aynı kopya/stil; yalnız bu editöre özel, router monkey-patch YOK. */}
      {(pendingHref !== null || backPrompt) && (
        <div
          className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="chakra-nav-discard-title"
          onClick={() => { setPendingHref(null); setBackPrompt(false); }}
        >
          <div
            className="w-full max-w-[420px] rounded-2xl border border-white/90 bg-white/95 p-6 shadow-[0_20px_50px_-18px_rgba(15,23,42,0.18)] ring-1 ring-amber-100/60"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="chakra-nav-discard-title" className="text-[15px] font-black leading-snug text-slate-950">
              Kaydedilmemiş değişiklikler
            </h3>
            <p className="mt-2 text-[12px] font-medium leading-relaxed text-slate-500">
              Kaydedilmemiş değişiklikleriniz var. Çıkarsanız yaptığınız değişiklikler kaybolacak.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setPendingHref(null); setBackPrompt(false); }}
                className="rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Düzenlemeye Devam Et
              </button>
              <button
                type="button"
                onClick={() => {
                  const href = pendingHref;
                  const viaBack = backPrompt;
                  setPendingHref(null);
                  setBackPrompt(false);
                  if (viaBack) {
                    // Kullanıcının asıl isteği "geri": koruma girdisini + bu sayfayı geride bırak.
                    leaveViaHistory(1);
                  } else if (href) {
                    router.push(href);
                  }
                }}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-[12px] font-black text-white shadow-[0_10px_24px_rgba(225,29,72,0.22)] transition hover:bg-rose-700"
              >
                Değişiklikleri Sil ve Çık
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
