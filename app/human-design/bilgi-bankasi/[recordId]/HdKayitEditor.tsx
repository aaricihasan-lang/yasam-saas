"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { HumanDesignShell } from "../../components/HumanDesignShell";
import {
  HD_KNOWLEDGE_CATEGORIES,
  HUMAN_DESIGN_CENTERS,
  HUMAN_DESIGN_CHANNELS,
  HUMAN_DESIGN_GATES,
  type HdKnowledgeCategory,
} from "@/lib/human-design/constants";
import {
  buildKnowledgeCode,
  buildKnowledgeCodeFromValue,
  deriveStructuredValue,
  getStructuredCategoryOptions,
  type StructuredOption,
} from "@/lib/human-design/codeHelpers";
import {
  getHdKnowledgeRecord,
  updateHdKnowledgeRecord,
  deleteHdKnowledgeRecord,
  type HdKnowledgeRow,
} from "../helpers/hdBilgiKayit";
import { listHdSources, type HdSourceRow } from "../helpers/hdKaynaklar";
import { HdKaynakEditor, rightsStatusLabel } from "../components/HdKaynakEditor";
import { useUnsavedGuard } from "../../rapor-olustur/hooks/useUnsavedGuard";
import { HdUnsavedChangesDialog } from "../../rapor-olustur/components/HdUnsavedChangesDialog";

const LIST_HREF = "/human-design/bilgi-bankasi";

// İstemci-tarafı kaynak taslağı için sentinel kimlik. Bu kimlikli kaynak DB'ye
// yazılmamıştır; yalnız "Kaynağı Kaydet" ile POST edilince kalıcı olur.
const DRAFT_SOURCE_ID = "__draft__";

// Yeni kaynak taslağı — hiçbir API çağrısı YAPMADAN yerelde oluşturulur.
function makeDraftSource(recordId: string, sortOrder: number): HdSourceRow {
  return {
    id: DRAFT_SOURCE_ID,
    tenant_id: null,
    user_id: null,
    record_id: recordId,
    source_name: "Yeni Kaynak",
    source_type: "other",
    author_or_organization: null,
    title: null,
    page_or_section: null,
    source_url: null,
    accessed_on: null,
    original_language_tag: null,
    original_text: null,
    faithful_translation_tr: null,
    source_specific_note: null,
    rights_status: "unknown",
    permission_reference: null,
    private_use_allowed: false,
    client_report_allowed: false,
    expert_distribution_allowed: false,
    commercial_use_allowed: false,
    sort_order: sortOrder,
    created_at: "",
    updated_at: "",
  };
}

const fieldBase =
  "w-full rounded-xl border border-indigo-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";
const labelCls = "mb-1.5 block text-xs font-bold text-slate-700";
const sectionCls = "mb-3 text-xs font-black uppercase tracking-widest text-indigo-700";
const cardCls =
  "rounded-2xl border border-indigo-200/80 bg-white/95 p-5 shadow-sm ring-1 ring-indigo-100/60";

type SectionId = "content" | "sources" | "relations";

type FormState = {
  category: string;
  title: string;
  structuredValue: string;
  content: string;
  expertNotes: string;
  keywordsText: string;
  tagsText: string;
  related_centers: string[];
  related_channels: string[];
  related_gates: number[];
  sort_order: number;
  is_active: boolean;
};

function computeCode(category: string, title: string, structuredValue: string): string {
  if (!category) return "";
  const opts = getStructuredCategoryOptions(category);
  if (opts !== null) {
    return structuredValue ? buildKnowledgeCodeFromValue(category, structuredValue) : "";
  }
  return title.trim() ? buildKnowledgeCode(category as HdKnowledgeCategory, title.trim()) : "";
}

function rowToForm(row: HdKnowledgeRow): FormState {
  return {
    category: row.category,
    title: row.title,
    structuredValue: deriveStructuredValue(row.category, row.code),
    content: row.content,
    expertNotes: row.expert_notes ?? "",
    keywordsText: (row.keywords ?? []).join(", "),
    tagsText: (row.tags ?? []).join(", "),
    related_centers: row.related_centers ?? [],
    related_channels: row.related_channels ?? [],
    related_gates: row.related_gates ?? [],
    sort_order: row.sort_order,
    is_active: row.is_active,
  };
}

function parseCSV(text: string): string[] {
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

function trMatch(haystack: string, q: string): boolean {
  if (!q) return true;
  return haystack.toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR"));
}

export function HdKayitEditor({ recordId }: { recordId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [snapshot, setSnapshot] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<SectionId>("content");

  const [sources, setSources] = useState<HdSourceRow[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  // Kaydedilmemiş kaynak taslağı (aynı anda en fazla bir tane).
  const [draftSource, setDraftSource] = useState<HdSourceRow | null>(null);

  const [relSearch, setRelSearch] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [openCenters, setOpenCenters] = useState(true);
  const [openChannels, setOpenChannels] = useState(true);
  const [openGates, setOpenGates] = useState(true);

  const [leaveOpen, setLeaveOpen] = useState(false);

  // Route'a özel FIXED işlem çubuğu: global logo çubuğunun (fixed, --logo-h) altına
  // sabitlenir. Fixed olduğu için akıştan çıkar; içeriğin altında başlaması için
  // çubuğun GERÇEK yüksekliği kadar bir spacer üretiriz. Yükseklik masaüstü/mobil
  // ve toolbar satır kırıldığında değiştiği için ResizeObserver ile ölçülür
  // (kör sabit yükseklik yok).
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const measure = () => setToolbarHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, notFound]);

  // Kaydı ve kaynaklarını yükle
  useEffect(() => {
    let alive = true;
    getHdKnowledgeRecord(recordId).then(({ row, error }) => {
      if (!alive) return;
      if (error || !row) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const f = rowToForm(row);
      setForm(f);
      setSnapshot(JSON.stringify(f));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [recordId]);

  useEffect(() => {
    let alive = true;
    listHdSources(recordId).then(({ rows, error }) => {
      if (!alive) return;
      if (error) {
        showToast({ message: `Kaynaklar yüklenemedi: ${error}`, type: "error" });
        return;
      }
      setSources(rows);
      setActiveSourceId((prev) => prev ?? rows[0]?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, [recordId, showToast]);

  const dirty = form !== null && JSON.stringify(form) !== snapshot;
  // Kayıt formu kirli VEYA açık bir kaynak taslağı varsa kaydedilmemiş iş vardır;
  // sayfadan çıkışta uyarı ver (taslak metni sessizce kaybolmasın).
  const hasUnsavedWork = dirty || draftSource !== null;
  useUnsavedGuard(hasUnsavedWork);

  const patch = useCallback((upd: Partial<FormState>) => {
    setForm((p) => (p ? { ...p, ...upd } : p));
  }, []);

  function toggleCenter(code: string) {
    setForm((p) =>
      p
        ? {
            ...p,
            related_centers: p.related_centers.includes(code)
              ? p.related_centers.filter((c) => c !== code)
              : [...p.related_centers, code],
          }
        : p,
    );
  }
  function toggleChannel(code: string) {
    setForm((p) =>
      p
        ? {
            ...p,
            related_channels: p.related_channels.includes(code)
              ? p.related_channels.filter((c) => c !== code)
              : [...p.related_channels, code],
          }
        : p,
    );
  }
  function toggleGate(gate: number) {
    setForm((p) =>
      p
        ? {
            ...p,
            related_gates: p.related_gates.includes(gate)
              ? p.related_gates.filter((g) => g !== gate)
              : [...p.related_gates, gate].sort((a, b) => a - b),
          }
        : p,
    );
  }

  async function handleSave() {
    if (!form) return;
    if (!form.category) {
      showToast({ message: "Kategori seçin.", type: "warning" });
      setSection("content");
      return;
    }
    if (!form.title.trim()) {
      showToast({ message: "Başlık girin.", type: "warning" });
      setSection("content");
      return;
    }
    // Taslak güvenliği: aktif kayıt boş Editöryal Özet ile kaydedilemez.
    // Pasif (taslak) kayıt boş içerikle kaydedilebilir.
    if (form.is_active && !form.content.trim()) {
      showToast({
        message: "Kaydı aktif etmek için Editöryal Özet alanını doldurun.",
        type: "warning",
      });
      setSection("content");
      return;
    }
    setSaving(true);
    const code = computeCode(form.category, form.title, form.structuredValue);
    const { error } = await updateHdKnowledgeRecord(recordId, {
      category: form.category,
      title: form.title.trim(),
      code,
      content: form.content.trim(),
      expert_notes: form.expertNotes.trim() || null,
      keywords: parseCSV(form.keywordsText),
      tags: parseCSV(form.tagsText),
      related_centers: form.related_centers,
      related_channels: form.related_channels,
      related_gates: form.related_gates,
      sort_order: form.sort_order,
      is_active: form.is_active,
    });
    setSaving(false);
    if (error) {
      showToast({ message: `Hata: ${error}`, type: "error" });
      return;
    }
    setSnapshot(JSON.stringify(form)); // kayıttan sonra dirty=false
    showToast({ message: "Kayıt güncellendi.", type: "success" });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Kaydı sil",
      message: "Bu kayıt (ve bağlı kaynakları) kalıcı olarak silinecek. Emin misiniz?",
      tone: "danger",
      confirmText: "Sil",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    const { error } = await deleteHdKnowledgeRecord(recordId);
    if (error) {
      showToast({ message: `Silinemedi: ${error}`, type: "error" });
      return;
    }
    showToast({ message: "Kayıt silindi.", type: "success" });
    router.push(LIST_HREF);
  }

  function requestLeave() {
    if (hasUnsavedWork) {
      setLeaveOpen(true);
      return;
    }
    router.push(LIST_HREF);
  }

  // "+ Ekle": yalnız yerel taslak açar — API POST YOK. Kalıcı kayıt "Kaynağı Kaydet"te.
  function handleAddSource() {
    if (draftSource) {
      // Zaten açık bir taslak var → onu odakla (birden fazla taslak oluşturma).
      setActiveSourceId(DRAFT_SOURCE_ID);
      return;
    }
    setDraftSource(makeDraftSource(recordId, sources.length));
    setActiveSourceId(DRAFT_SOURCE_ID);
  }

  // Taslak "Kaynağı Kaydet" ile POST edilip kalıcı satır döndüğünde çağrılır.
  function handleDraftCreated(created: HdSourceRow) {
    setSources((prev) => [...prev, created]);
    setDraftSource(null);
    setActiveSourceId(created.id);
  }

  // "Taslağı İptal Et" — API DELETE YOK; yalnız yerel taslağı kapat.
  function handleDraftDiscard() {
    setDraftSource(null);
    setActiveSourceId((cur) =>
      cur === DRAFT_SOURCE_ID ? sources[0]?.id ?? null : cur,
    );
  }

  function handleSourceSaved(updated: HdSourceRow) {
    setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }
  function handleSourceDeleted(id: string) {
    setSources((prev) => {
      const next = prev.filter((s) => s.id !== id);
      setActiveSourceId((cur) => (cur === id ? next[0]?.id ?? null : cur));
      return next;
    });
  }

  // ---- filtrelenmiş ilişki listeleri (istemci-tarafı; yeni API yok) ----
  const centersView = useMemo(
    () =>
      HUMAN_DESIGN_CENTERS.filter((c) => {
        if (!form) return false;
        if (onlySelected && !form.related_centers.includes(c.code)) return false;
        return trMatch(c.label, relSearch) || trMatch(c.code, relSearch);
      }),
    [form, onlySelected, relSearch],
  );
  const channelsView = useMemo(
    () =>
      HUMAN_DESIGN_CHANNELS.filter((c) => {
        if (!form) return false;
        if (onlySelected && !form.related_channels.includes(c.code)) return false;
        return trMatch(c.label, relSearch) || trMatch(c.code, relSearch);
      }),
    [form, onlySelected, relSearch],
  );
  const gatesView = useMemo(
    () =>
      HUMAN_DESIGN_GATES.filter((g) => {
        if (!form) return false;
        if (onlySelected && !form.related_gates.includes(g.code)) return false;
        return trMatch(g.label, relSearch) || String(g.code).includes(relSearch.trim());
      }),
    [form, onlySelected, relSearch],
  );

  // -------- yükleniyor / bulunamadı --------
  if (loading) {
    return (
      <HumanDesignShell>
        <div className="flex items-center justify-center py-24 text-sm text-slate-500">
          Yükleniyor...
        </div>
      </HumanDesignShell>
    );
  }
  if (notFound || !form) {
    return (
      <HumanDesignShell>
        <div className={`${cardCls} mx-auto max-w-lg text-center`}>
          <p className="text-lg font-black text-slate-900">Kayıt bulunamadı</p>
          <p className="mt-1 text-sm text-slate-600">
            Bu kayıt silinmiş olabilir veya bu hesaba ait değildir.
          </p>
          <button
            type="button"
            onClick={() => router.push(LIST_HREF)}
            className="mt-4 h-9 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-sm font-black uppercase tracking-wide text-white shadow-sm transition hover:brightness-105"
          >
            Listeye Dön
          </button>
        </div>
      </HumanDesignShell>
    );
  }

  const isStructured = getStructuredCategoryOptions(form.category) !== null;
  const activeIsDraft = activeSourceId === DRAFT_SOURCE_ID && draftSource !== null;
  const activeSource = activeIsDraft
    ? draftSource
    : sources.find((s) => s.id === activeSourceId) ?? null;

  const SECTIONS: { id: SectionId; label: string; desc: string }[] = [
    { id: "content", label: "İçerik", desc: "Temel bilgiler, editöryal özet ve kişisel notlar." },
    { id: "sources", label: "Kaynaklar", desc: "Bu bilgiyi dayandıran kaynaklar; her biri ayrı tutulur." },
    { id: "relations", label: "İlişkiler", desc: "Bu bilgiyle bağlantılı merkez, kanal ve kapıları işaretleyin." },
  ];

  return (
    <HumanDesignShell maxWidthClass="max-w-[1600px]">
      {/* Route'a özel FIXED işlem çubuğu — viewport'a göre sabit; global logo
          çubuğunun (fixed, --logo-h=44px, z-50) hemen altında (top:var(--logo-h)).
          z-40 < z-50 → logoyu örtmez; içerikten yüksek. İç container sayfa
          hizasını (max-w-[1600px] + aynı yatay padding) korur. */}
      <div
        ref={toolbarRef}
        className="fixed inset-x-0 top-[var(--logo-h)] z-40 border-b border-indigo-200/70 bg-white/90 backdrop-blur-xl"
      >
        <div className="mx-auto w-full max-w-[1600px] px-4 py-3 lg:px-8 xl:px-10">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={requestLeave}
            className="h-9 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            ← Listeye Dön
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[11px] font-black uppercase tracking-widest text-indigo-500">
                {form.category || "Kategori seçilmedi"}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
                  form.is_active
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${form.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                {form.is_active ? "Aktif" : "Pasif"}
              </span>
              {dirty && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">
                  Kaydedilmemiş
                </span>
              )}
            </div>
            <h1 className="truncate text-base font-black text-slate-900 sm:text-lg">
              {form.title || "Başlıksız kayıt"}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="h-9 rounded-xl border border-rose-200 bg-white px-3 text-sm font-black uppercase tracking-wide text-rose-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-50"
            >
              Sil
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-9 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-sm font-black uppercase tracking-wide text-white shadow-[0_4px_16px_-4px_rgba(79,70,229,0.4)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>

        {/* Bölüm navigasyonu */}
        <div className="mt-3 flex flex-nowrap items-center gap-1.5 overflow-x-auto">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${
                section === s.id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-800"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {SECTIONS.find((s) => s.id === section)?.desc}
        </p>
        </div>
      </div>

      {/* Dinamik spacer — fixed işlem çubuğunun ölçülen yüksekliği kadar yer ayırır,
          böylece içerik çubuğun altında başlar (masaüstü/mobil + wrap'te otomatik). */}
      <div aria-hidden style={{ height: toolbarHeight }} />

      {/* ================= İÇERİK ================= */}
      {section === "content" && (
        <div className="space-y-4">
          <section className={cardCls}>
            <p className={sectionCls}>Temel Bilgiler</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Kategori *</label>
                <select
                  value={form.category}
                  onChange={(e) =>
                    patch({ category: e.target.value, title: "", structuredValue: "" })
                  }
                  className={`h-9 ${fieldBase}`}
                >
                  <option value="">Seçin...</option>
                  {HD_KNOWLEDGE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Başlık *</label>
                {(() => {
                  const opts: StructuredOption[] | null = getStructuredCategoryOptions(form.category);
                  if (opts) {
                    return (
                      <select
                        value={form.structuredValue}
                        onChange={(e) => {
                          const opt = opts.find((o) => o.code === e.target.value);
                          patch({ structuredValue: e.target.value, title: opt?.label ?? "" });
                        }}
                        className={`h-9 ${fieldBase}`}
                      >
                        <option value="">— Seçin —</option>
                        {opts.map((opt) => (
                          <option key={opt.code} value={opt.code}>{opt.label}</option>
                        ))}
                      </select>
                    );
                  }
                  return (
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => patch({ title: e.target.value })}
                      placeholder="Başlık girin..."
                      className={`h-9 ${fieldBase}`}
                    />
                  );
                })()}
              </div>
              <div>
                <label className={labelCls}>Kod (otomatik)</label>
                <input
                  type="text"
                  value={computeCode(form.category, form.title, form.structuredValue)}
                  readOnly
                  className={`h-9 ${fieldBase} cursor-not-allowed bg-slate-50/80 text-slate-400`}
                />
              </div>
              <div>
                <label className={labelCls}>Sıralama</label>
                <input
                  type="number"
                  min={0}
                  value={form.sort_order}
                  onChange={(e) => patch({ sort_order: Number(e.target.value) })}
                  className={`h-9 ${fieldBase}`}
                />
              </div>
              <div className="flex items-center gap-2.5 sm:col-span-2">
                <input
                  id="hd-editor-active"
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => patch({ is_active: e.target.checked })}
                  className="h-4 w-4 rounded border-indigo-300 accent-indigo-600"
                />
                <label htmlFor="hd-editor-active" className="text-sm font-semibold text-slate-700">
                  Aktif kayıt
                </label>
              </div>
              <div className="sm:col-span-2 rounded-xl border border-sky-200/80 bg-sky-50/60 px-3 py-2.5 text-xs leading-relaxed text-sky-800">
                {isStructured ? (
                  <><span className="font-bold">Yapısal kategori: </span>Kod dropdown seçiminden otomatik üretilir ve rapor kod eşleşmesinde kullanılır. Başlığı elle yazmayın.</>
                ) : form.category ? (
                  <><span className="font-bold">Serbest kategori: </span>Başlık serbest; kod başlıktan türetilir. Rapor kod eşleşmesine girmez, raporda ek bölüm olur.</>
                ) : (
                  <>Önce kategori seçin.</>
                )}
              </div>
            </div>
          </section>

          <section className={cardCls}>
            <p className={sectionCls}>Editöryal Özet</p>
            <div className="mb-2 rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-emerald-800">
              Birden fazla güvenilir kaynaktan doğrulanmış ortak bilgi + açıkça ayrılmış editöryal anlatım. Varsayılan danışan raporu metnini bu alan besler.
            </div>
            <textarea
              value={form.content}
              onChange={(e) => patch({ content: e.target.value })}
              rows={9}
              className={`${fieldBase} resize-y leading-relaxed`}
            />
          </section>

          <section className={cardCls}>
            <p className={sectionCls}>Uzman Notu</p>
            <div className="mb-2 rounded-lg border border-slate-200/80 bg-slate-50/70 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-slate-600">
              Uzmanın özel çalışma notudur. Varsayılan danışan raporuna girmez.
            </div>
            <textarea
              value={form.expertNotes}
              onChange={(e) => patch({ expertNotes: e.target.value })}
              rows={6}
              placeholder="Kendi notların..."
              className={`${fieldBase} resize-y leading-relaxed`}
            />
          </section>

          <section className={cardCls}>
            <p className={sectionCls}>Anahtar Kelimeler & Etiketler</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Anahtar Kelimeler</label>
                <input
                  type="text"
                  value={form.keywordsText}
                  onChange={(e) => patch({ keywordsText: e.target.value })}
                  placeholder="virgülle ayırın"
                  className={`h-9 ${fieldBase}`}
                />
              </div>
              <div>
                <label className={labelCls}>Etiketler</label>
                <input
                  type="text"
                  value={form.tagsText}
                  onChange={(e) => patch({ tagsText: e.target.value })}
                  placeholder="virgülle ayırın"
                  className={`h-9 ${fieldBase}`}
                />
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ================= KAYNAKLAR ================= */}
      {section === "sources" && (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          {/* Kaynak listesi */}
          <div className={`${cardCls} lg:sticky lg:top-40 lg:self-start`}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-indigo-700">
                Kaynaklar ({sources.length})
              </p>
              <button
                type="button"
                onClick={handleAddSource}
                disabled={draftSource !== null}
                title={draftSource ? "Önce açık taslağı kaydedin veya iptal edin" : undefined}
                className="rounded-lg border border-dashed border-indigo-300 px-2.5 py-1 text-xs font-bold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-60"
              >
                + Ekle
              </button>
            </div>
            {sources.length === 0 && !draftSource ? (
              <p className="py-6 text-center text-xs text-slate-500">Henüz kaynak yok.</p>
            ) : (
              <ul className="space-y-1.5">
                {sources.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setActiveSourceId(s.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        s.id === activeSourceId
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"
                      }`}
                    >
                      <p className="truncate text-sm font-bold text-slate-800">
                        {s.source_name?.trim() || "Adsız kaynak"}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {rightsStatusLabel(s.rights_status)}
                      </p>
                    </button>
                  </li>
                ))}
                {draftSource && (
                  <li key={DRAFT_SOURCE_ID}>
                    <button
                      type="button"
                      onClick={() => setActiveSourceId(DRAFT_SOURCE_ID)}
                      className={`w-full rounded-xl border border-dashed px-3 py-2 text-left transition ${
                        activeSourceId === DRAFT_SOURCE_ID
                          ? "border-amber-400 bg-amber-50"
                          : "border-amber-300 bg-white hover:bg-amber-50/50"
                      }`}
                    >
                      <p className="flex items-center gap-1.5 truncate text-sm font-bold text-slate-800">
                        {draftSource.source_name?.trim() || "Yeni Kaynak"}
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700">
                          Taslak
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        Henüz kaydedilmedi
                      </p>
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* Seçili kaynağın editörü */}
          <div className={cardCls}>
            {activeSource ? (
              <HdKaynakEditor
                key={activeSource.id}
                source={activeSource}
                isDraft={activeIsDraft}
                recordId={recordId}
                onSaved={handleSourceSaved}
                onDeleted={handleSourceDeleted}
                onCreated={handleDraftCreated}
                onDiscard={handleDraftDiscard}
              />
            ) : (
              <p className="py-16 text-center text-sm text-slate-500">
                Soldan bir kaynak seçin veya “+ Ekle” ile yeni kaynak oluşturun.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ================= İLİŞKİLER ================= */}
      {section === "relations" && (
        <div className="space-y-4">
          <div className={cardCls}>
            <div className="mb-2 rounded-lg border border-slate-200/80 bg-slate-50/70 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-slate-600">
              Bu bilgiyle bağlantılı merkezleri, kanalları ve kapıları burada işaretleyin. Bu seçimler kaydı düzenlemek ve ilgili Human Design öğeleriyle ilişkilendirmek için kullanılır; danışan raporuna otomatik içerik eklemez.
            </div>

            {/* Seçili özet */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
                {form.related_centers.length} merkez
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">
                {form.related_channels.length} kanal
              </span>
              <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-black text-orange-800">
                {form.related_gates.length} kapı
              </span>
            </div>
            {(form.related_centers.length + form.related_channels.length + form.related_gates.length) > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.related_centers.map((c) => {
                  const label = HUMAN_DESIGN_CENTERS.find((x) => x.code === c)?.label ?? c;
                  return (
                    <button key={`c-${c}`} type="button" onClick={() => toggleCenter(c)}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
                      {label} ✕
                    </button>
                  );
                })}
                {form.related_channels.map((c) => {
                  const label = HUMAN_DESIGN_CHANNELS.find((x) => x.code === c)?.label ?? c;
                  return (
                    <button key={`ch-${c}`} type="button" onClick={() => toggleChannel(c)}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100">
                      {label} ✕
                    </button>
                  );
                })}
                {form.related_gates.map((g) => (
                  <button key={`g-${g}`} type="button" onClick={() => toggleGate(g)}
                    className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-orange-800 ring-1 ring-orange-200 hover:bg-orange-100">
                    Kapı {g} ✕
                  </button>
                ))}
              </div>
            )}

            {/* Arama + yalnız seçili */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={relSearch}
                onChange={(e) => setRelSearch(e.target.value)}
                placeholder="Merkez, kanal veya kapı ara..."
                className={`h-9 min-w-[200px] flex-1 ${fieldBase}`}
              />
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={onlySelected}
                  onChange={(e) => setOnlySelected(e.target.checked)}
                  className="h-4 w-4 rounded border-indigo-300 accent-indigo-600"
                />
                Yalnız seçilenleri göster
              </label>
            </div>
          </div>

          {/* Merkezler */}
          <section className={cardCls}>
            <button type="button" onClick={() => setOpenCenters((v) => !v)}
              className="flex w-full items-center justify-between">
              <span className={sectionCls + " mb-0"}>Merkezler ({form.related_centers.length})</span>
              <span className="text-slate-400">{openCenters ? "▾" : "▸"}</span>
            </button>
            {openCenters && (
              <div className="mt-3 flex flex-wrap gap-2">
                {centersView.length === 0 ? (
                  <p className="text-xs text-slate-400">Eşleşen merkez yok.</p>
                ) : centersView.map((center) => {
                  const sel = form.related_centers.includes(center.code);
                  return (
                    <button key={center.code} type="button" onClick={() => toggleCenter(center.code)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                        sel
                          ? "border-transparent bg-indigo-600 text-white shadow-[0_3px_10px_rgba(79,70,229,0.3)]"
                          : "border-indigo-200 bg-white text-slate-700 hover:border-indigo-400 hover:bg-indigo-50"
                      }`}>
                      {center.label}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Kanallar */}
          <section className={cardCls}>
            <button type="button" onClick={() => setOpenChannels((v) => !v)}
              className="flex w-full items-center justify-between">
              <span className={sectionCls + " mb-0"}>Kanallar ({form.related_channels.length})</span>
              <span className="text-slate-400">{openChannels ? "▾" : "▸"}</span>
            </button>
            {openChannels && (
              <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {channelsView.length === 0 ? (
                  <p className="text-xs text-slate-400">Eşleşen kanal yok.</p>
                ) : channelsView.map((ch) => {
                  const sel = form.related_channels.includes(ch.code);
                  return (
                    <label key={ch.code}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                        sel ? "bg-indigo-50 text-indigo-800" : "text-slate-700 hover:bg-slate-50"
                      }`}>
                      <input type="checkbox" checked={sel} onChange={() => toggleChannel(ch.code)}
                        className="h-3.5 w-3.5 rounded border-indigo-300 accent-indigo-600" />
                      {ch.label}
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {/* Kapılar */}
          <section className={cardCls}>
            <button type="button" onClick={() => setOpenGates((v) => !v)}
              className="flex w-full items-center justify-between">
              <span className={sectionCls + " mb-0"}>Kapılar ({form.related_gates.length})</span>
              <span className="text-slate-400">{openGates ? "▾" : "▸"}</span>
            </button>
            {openGates && (
              <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
                {gatesView.length === 0 ? (
                  <p className="col-span-full text-xs text-slate-400">Eşleşen kapı yok.</p>
                ) : gatesView.map((gate) => {
                  const sel = form.related_gates.includes(gate.code);
                  return (
                    <button key={gate.code} type="button" title={gate.label}
                      onClick={() => toggleGate(gate.code)}
                      className={`flex h-9 w-full items-center justify-center rounded-lg text-xs font-bold transition-all ${
                        sel
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-800"
                      }`}>
                      {gate.code}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Kaydedilmemiş değişiklik — çıkış onayı */}
      {leaveOpen && (
        <HdUnsavedChangesDialog
          title="Kaydedilmemiş değişiklikler"
          message="Bu kayıtta kaydedilmemiş değişiklikler var. Ne yapmak istersiniz?"
          actions={[
            { key: "cancel", label: "Sayfada kal", tone: "safe" },
            { key: "discard", label: "Değişiklikleri at ve çık", tone: "danger" },
          ]}
          onAction={(key) => {
            setLeaveOpen(false);
            if (key === "discard") router.push(LIST_HREF);
          }}
        />
      )}
    </HumanDesignShell>
  );
}
