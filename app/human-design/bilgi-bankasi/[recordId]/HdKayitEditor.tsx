"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useKbLabels, kbCategoryCode } from "../helpers/useKbLabels";
import { useHdTerms } from "../../_i18n/useHdTerms";
import { KB_NETWORK_ERROR } from "../helpers/kbNetworkError";
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
  getStructuredCategoryOptionsForEdit,
  type StructuredOption,
} from "@/lib/human-design/codeHelpers";
import {
  getHdKnowledgeRecord,
  updateHdKnowledgeRecord,
  deleteHdKnowledgeRecord,
  type HdKnowledgeRow,
} from "../helpers/hdBilgiKayit";
import { listHdSources, type HdSourceRow } from "../helpers/hdKaynaklar";
import { HdKaynakEditor, useRightsStatusLabel } from "../components/HdKaynakEditor";
import {
  HdGateChannelNameField,
  hdComposeTitleFor,
  hdDefaultNameFor,
  isHdGateChannelCategory,
} from "../components/HdGateChannelNameField";
import {
  buildHdNameOverrides,
  parseHdChannelKnowledgeCode,
  parseHdGateKnowledgeCode,
} from "@/lib/human-design/knowledge/hdNames";
import { useHdLeaveGuard } from "../../hooks/useHdLeaveGuard";
import { HdUnsavedChangesDialog } from "../../rapor-olustur/components/HdUnsavedChangesDialog";

// ?kaynak=uzman: admin kişisel kayıt listesine (Uzman Bilgilerim) döner; uzman ekranında etkisiz.
const LIST_HREF = "/human-design/bilgi-bankasi?kaynak=uzman";

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
  /** Kapılar/Kanallar: kişisel görünen ad (numarasız). Diğer kategorilerde kullanılmaz. */
  displayName: string;
  is_active: boolean;
};

/** Kaydın başlığındaki kişisel ad; yoksa (hazır/eski hazır ad) güncel hazır ad. */
function displayNameFromRow(row: HdKnowledgeRow): string {
  const sv = deriveStructuredValue(row.category, row.code);
  if (!isHdGateChannelCategory(row.category) || !sv) return "";
  const ov = buildHdNameOverrides([row]);
  const g = parseHdGateKnowledgeCode(row.code);
  if (g !== null) return ov.gates[g] ?? hdDefaultNameFor(row.category, sv);
  const c = parseHdChannelKnowledgeCode(row.code);
  if (c !== null) return ov.channels[c] ?? hdDefaultNameFor(row.category, sv);
  return "";
}

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
    displayName: displayNameFromRow(row),
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
  const t = useTranslations("hd.knowledge");
  const isTr = useLocale() === "tr";
  const labels = useKbLabels();
  const terms = useHdTerms();
  // Ortak ağ hatası ekran diline eşlenir (kararlı bağımlılıklar; sunucu metni aynen).
  const kbErr = useCallback(
    (e: string | null | undefined) => (!isTr && e === KB_NETWORK_ERROR ? t("networkError") : String(e ?? "")),
    [t, isTr],
  );
  const rightsStatusLabel = useRightsStatusLabel();
  // İlişki öğelerinin GÖRÜNEN adı (kayıtlı kod değişmez; TR'de sözlük etiketi aynen).
  const centerLabel = (c: { code: string; label: string }) => (isTr ? c.label : terms.label("center", c.code));
  const channelLabel = (c: { code: string; label: string }) => (isTr ? c.label : terms.label("channel", c.code));
  const gateLabel = (g: { code: number; label: string }) => (isTr ? g.label : t("gateOption", { n: g.code }));

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [identityLocked, setIdentityLocked] = useState(false);
  // Yüklenen kaydın özgün yapısal değeri — eski genel merkez kaydı (acik_*) seçenek listesinde korunur.
  const [originalStructured, setOriginalStructured] = useState("");
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
  // P2-9: kaydın yüklendiği sürüm (koşullu güncelleme).
  const recordVersionRef = useRef<string | null>(null);
  // P2-13: açık kaynak editöründe kaydedilmemiş değişiklik var mı?
  const [sourceDirty, setSourceDirty] = useState(false);

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

  // Fixed çubuk viewport'un sol kenarından başlarsa sabit sol menü (z-50) solunu örter ("Kaynaklar"
  // tıklaması menü logosuna düşer). Çubuk, sayfa kabuğunun (içerik sütunu) ölçülen sol kenarı ve
  // genişliğine hizalanır; ≤900px'te kabuk tam genişlik olduğundan konum değişmez.
  const [toolbarBox, setToolbarBox] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const host = toolbarRef.current?.parentElement?.parentElement;
    if (!host) return;
    const measure = () => {
      const r = host.getBoundingClientRect();
      setToolbarBox({ left: r.left, width: r.width });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
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
      // Mevcut kapı/kanal kaydında kimlik (kategori + numara) kilitlidir; yalnız ad/açıklama düzenlenir.
      setIdentityLocked(isHdGateChannelCategory(f.category) && !!f.structuredValue);
      setOriginalStructured(f.structuredValue);
      setForm(f);
      setSnapshot(JSON.stringify(f));
      recordVersionRef.current = row.updated_at ?? null;
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
        showToast({ message: t("editor.sourcesLoadError", { error: kbErr(error) }), type: "error" });
        return;
      }
      setSources(rows);
      setActiveSourceId((prev) => prev ?? rows[0]?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, [recordId, showToast, t, kbErr]);

  const dirty = form !== null && JSON.stringify(form) !== snapshot;
  // Kayıt formu kirli VEYA açık bir kaynak taslağı varsa kaydedilmemiş iş vardır;
  // sayfadan çıkışta uyarı ver (taslak metni sessizce kaybolmasın).
  const hasUnsavedWork = dirty || draftSource !== null || sourceDirty;
  // P2-7: menü/logo linki + geri tuşu + yenileme korunur ("Listeye Dön" kendi dialog'unu kullanır).
  const confirmLeave = useCallback(
    () =>
      confirm({
        title: t("editor.unsavedTitle"),
        message: t("editor.leaveMessage"),
        confirmText: t("editor.leaveConfirm"),
        cancelText: t("editor.stayOnPage"),
        tone: "danger",
      }),
    [confirm, t],
  );
  useHdLeaveGuard(hasUnsavedWork, confirmLeave);

  // P2-13: kaynak editörü kirliyken kaynak/sekme değişimi (editör unmount olur) sorulur.
  const confirmSourceSwitch = useCallback(async (): Promise<boolean> => {
    if (!sourceDirty) return true;
    const ok = await confirm({
      title: t("editor.sourceUnsavedTitle"),
      message: t("editor.sourceUnsavedMessage"),
      confirmText: t("editor.discard"),
      cancelText: t("list.cancel"),
      tone: "danger",
    });
    if (ok) setSourceDirty(false);
    return ok;
  }, [sourceDirty, confirm, t]);
  const switchSource = useCallback(
    async (id: string | null) => {
      if (id === activeSourceId) return;
      if (await confirmSourceSwitch()) setActiveSourceId(id);
    },
    [activeSourceId, confirmSourceSwitch],
  );
  const switchSection = useCallback(
    async (id: SectionId) => {
      if (id === section) return;
      if (section === "sources" && !(await confirmSourceSwitch())) return;
      setSection(id);
    },
    [section, confirmSourceSwitch],
  );

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
      showToast({ message: t("form.pickCategory"), type: "warning" });
      setSection("content");
      return;
    }
    const gateChannel = isHdGateChannelCategory(form.category);
    if (gateChannel ? !form.structuredValue : !form.title.trim()) {
      showToast({ message: gateChannel ? t("editor.pickGateChannel") : t("form.enterTitle"), type: "warning" });
      setSection("content");
      return;
    }
    // Taslak güvenliği: aktif kayıt boş "Bilgi ve Açıklamalar" (content) ile kaydedilemez.
    // Pasif (taslak) kayıt boş içerikle kaydedilebilir.
    if (form.is_active && !form.content.trim()) {
      showToast({
        message: t("editor.activateNeedsContent", { field: t("fields.contentLabel") }),
        type: "warning",
      });
      setSection("content");
      return;
    }
    setSaving(true);
    // Kapı/kanal: başlık = sabit numara + görünen ad (boş ad → hazır ad). Kod numaradan.
    const title = gateChannel
      ? hdComposeTitleFor(form.category, form.structuredValue, form.displayName)
      : form.title.trim();
    const code = computeCode(form.category, title, form.structuredValue);
    const { error, conflict, updatedAt } = await updateHdKnowledgeRecord(recordId, {
      category: form.category,
      title,
      code,
      content: form.content.trim(),
      expert_notes: form.expertNotes.trim() || null,
      keywords: parseCSV(form.keywordsText),
      tags: parseCSV(form.tagsText),
      related_centers: form.related_centers,
      related_channels: form.related_channels,
      related_gates: form.related_gates,
      // sort_order GÖNDERİLMEZ: sıralama otomatik; eski değer DB'de dokunulmadan kalır.
      is_active: form.is_active,
    }, recordVersionRef.current);
    setSaving(false);
    if (error) {
      showToast({ message: conflict ? error : t("form.error", { error: kbErr(error) }), type: "error" });
      return;
    }
    recordVersionRef.current = updatedAt ?? recordVersionRef.current;
    setSnapshot(JSON.stringify(form)); // kayıttan sonra dirty=false
    showToast({ message: t("editor.updated"), type: "success" });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: t("list.deleteOneTitle"),
      message: t("editor.deleteMessage"),
      tone: "danger",
      confirmText: t("list.delete"),
      cancelText: t("list.cancel"),
    });
    if (!ok) return;
    const { error } = await deleteHdKnowledgeRecord(recordId);
    if (error) {
      showToast({ message: t("list.deleteError", { error: kbErr(error) }), type: "error" });
      return;
    }
    showToast({ message: t("list.deleted"), type: "success" });
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
  async function handleAddSource() {
    if (draftSource) {
      // Zaten açık bir taslak var → onu odakla (birden fazla taslak oluşturma).
      await switchSource(DRAFT_SOURCE_ID);
      return;
    }
    if (!(await confirmSourceSwitch())) return;
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
        return trMatch(centerLabel(c), relSearch) || trMatch(c.code, relSearch);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- centerLabel yalnız dil/sözlükten türer
    [form, onlySelected, relSearch, isTr],
  );
  const channelsView = useMemo(
    () =>
      HUMAN_DESIGN_CHANNELS.filter((c) => {
        if (!form) return false;
        if (onlySelected && !form.related_channels.includes(c.code)) return false;
        return trMatch(channelLabel(c), relSearch) || trMatch(c.code, relSearch);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- channelLabel yalnız dil/sözlükten türer
    [form, onlySelected, relSearch, isTr],
  );
  const gatesView = useMemo(
    () =>
      HUMAN_DESIGN_GATES.filter((g) => {
        if (!form) return false;
        if (onlySelected && !form.related_gates.includes(g.code)) return false;
        return trMatch(gateLabel(g), relSearch) || String(g.code).includes(relSearch.trim());
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gateLabel yalnız dil/sözlükten türer
    [form, onlySelected, relSearch, isTr],
  );

  // -------- yükleniyor / bulunamadı --------
  if (loading) {
    return (
      <HumanDesignShell>
        <div className="flex items-center justify-center py-24 text-sm text-slate-500">
          {t("list.loading")}
        </div>
      </HumanDesignShell>
    );
  }
  if (notFound || !form) {
    return (
      <HumanDesignShell>
        <div className={`${cardCls} mx-auto max-w-lg text-center`}>
          <p className="text-lg font-black text-slate-900">{t("editor.notFound")}</p>
          <p className="mt-1 text-sm text-slate-600">
            {t("editor.notFoundHelp")}
          </p>
          <button
            type="button"
            onClick={() => router.push(LIST_HREF)}
            className="mt-4 h-9 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-sm font-black uppercase tracking-wide text-white shadow-sm transition hover:brightness-105"
          >
            {t("editor.backToList")}
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
    { id: "content", label: t("editor.secContent"), desc: t("editor.secContentDesc") },
    { id: "sources", label: t("editor.secSources"), desc: t("editor.secSourcesDesc") },
    { id: "relations", label: t("editor.secRelations"), desc: t("editor.secRelationsDesc") },
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
        style={toolbarBox ? { left: toolbarBox.left, right: "auto", width: toolbarBox.width } : undefined}
      >
        {/* P2-5: mobilde tek satır + kısa geri butonu + açıklama gizli → çubuk ekranın ~%28'i
            yerine ~%14'ü kadar yer kaplar; tüm işlevler (geri/sil/kaydet/bölümler) korunur. */}
        <div className="mx-auto w-full max-w-[1600px] px-3 py-2 sm:px-4 sm:py-3 lg:px-8 xl:px-10">
        <div className="flex items-center gap-2 sm:flex-wrap sm:gap-x-4 sm:gap-y-2">
          <button
            type="button"
            onClick={requestLeave}
            aria-label={t("editor.backToList")}
            className="h-10 min-w-10 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:h-9"
          >
            <span aria-hidden className="sm:hidden">←</span>
            <span className="hidden sm:inline">← {t("editor.backToList")}</span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="hidden truncate text-[11px] font-black uppercase tracking-widest text-indigo-500 sm:inline">
                {form.category ? labels.category(form.category) : t("editor.noCategory")}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
                  form.is_active
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${form.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                {form.is_active ? t("list.active") : t("list.passive")}
              </span>
              {dirty && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">
                  {t("editor.unsavedBadge")}
                </span>
              )}
            </div>
            <h1 className="truncate text-sm font-black text-slate-900 sm:text-lg">
              {form.title || t("editor.untitled")}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="h-10 rounded-xl border border-rose-200 bg-white px-3 text-sm font-black uppercase tracking-wide text-rose-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 sm:h-9"
            >
              {t("list.delete")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-10 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-sm font-black uppercase tracking-wide text-white shadow-[0_4px_16px_-4px_rgba(79,70,229,0.4)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 sm:h-9 sm:px-6"
            >
              {saving ? t("editor.saving") : t("editor.save")}
            </button>
          </div>
        </div>

        {/* Bölüm navigasyonu */}
        <div className="mt-2 flex flex-nowrap items-center gap-1.5 overflow-x-auto sm:mt-3">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void switchSection(s.id)}
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
        <p className="mt-1.5 hidden text-xs text-slate-500 sm:block">
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
            <p className={sectionCls}>{t("form.basics")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{t("form.categoryLabel")}</label>
                <select
                  value={form.category}
                  disabled={identityLocked}
                  onChange={(e) =>
                    patch({ category: e.target.value, title: "", structuredValue: "", displayName: "" })
                  }
                  className={`h-9 ${fieldBase} ${identityLocked ? "cursor-not-allowed bg-slate-50/80 text-slate-500" : ""}`}
                >
                  <option value="">{t("form.choose")}</option>
                  {HD_KNOWLEDGE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{labels.category(cat)}</option>
                  ))}
                </select>
              </div>
              {isHdGateChannelCategory(form.category) ? (
                <HdGateChannelNameField
                  category={form.category}
                  structuredValue={form.structuredValue}
                  name={form.displayName}
                  onPick={(v) => patch({ structuredValue: v, displayName: hdDefaultNameFor(form.category, v) })}
                  onName={(n) => patch({ displayName: n })}
                  fieldBase={fieldBase}
                  labelCls={labelCls}
                  lockIdentity={identityLocked}
                />
              ) : (
              <div>
                <label className={labelCls}>{t("form.titleLabel")}</label>
                {(() => {
                  const opts: StructuredOption[] | null = getStructuredCategoryOptionsForEdit(form.category, originalStructured);
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
                        <option value="">{t("form.chooseDash")}</option>
                        {opts.map((opt) => (
                          <option key={opt.code} value={opt.code}>{labels.option(form.category, opt)}</option>
                        ))}
                      </select>
                    );
                  }
                  return (
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => patch({ title: e.target.value })}
                      placeholder={t("form.titlePlaceholder")}
                      className={`h-9 ${fieldBase}`}
                    />
                  );
                })()}
              </div>
              )}
              <div>
                <label className={labelCls}>{t("form.codeAuto")}</label>
                <input
                  type="text"
                  value={computeCode(form.category, form.title, form.structuredValue)}
                  readOnly
                  className={`h-9 ${fieldBase} cursor-not-allowed bg-slate-50/80 text-slate-400`}
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
                  {t("editor.activeRecord")}
                </label>
              </div>
              <div className="sm:col-span-2 rounded-xl border border-sky-200/80 bg-sky-50/60 px-3 py-2.5 text-xs leading-relaxed text-sky-800">
                {isHdGateChannelCategory(form.category) ? (
                  <>{t("editor.noteGateChannel")}</>
                ) : isStructured ? (
                  <>{t.rich("editor.noteStructured", { b: (c) => <span className="font-bold">{c}</span> })}</>
                ) : form.category ? (
                  <>{t.rich("editor.noteFree", { b: (c) => <span className="font-bold">{c}</span> })}</>
                ) : (
                  <>{t("editor.notePickCategory")}</>
                )}
              </div>
            </div>
          </section>

          <section className={cardCls}>
            <p className={sectionCls}>{t("fields.contentLabel")}</p>
            <div className="mb-2 rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-emerald-800" data-hd-kb-content-help>
              {t("fields.contentHelp", { subject: t(`subject.${kbCategoryCode(form.category) ?? "none"}`) })}
            </div>
            <textarea
              value={form.content}
              onChange={(e) => patch({ content: e.target.value })}
              rows={9}
              className={`${fieldBase} resize-y leading-relaxed`}
            />
          </section>

          <section className={cardCls}>
            <p className={sectionCls}>{t("fields.notesLabel")}</p>
            <div className="mb-2 rounded-lg border border-slate-200/80 bg-slate-50/70 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-slate-600" data-hd-kb-notes-help>
              {t("fields.notesHelp")}
            </div>
            <textarea
              value={form.expertNotes}
              onChange={(e) => patch({ expertNotes: e.target.value })}
              rows={6}
              placeholder={t("editor.notesPlaceholder")}
              className={`${fieldBase} resize-y leading-relaxed`}
            />
          </section>

          <section className={cardCls}>
            <p className={sectionCls}>{t("editor.keywordsTags")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{t("editor.keywords")}</label>
                <input
                  type="text"
                  value={form.keywordsText}
                  onChange={(e) => patch({ keywordsText: e.target.value })}
                  placeholder={t("editor.commaSeparated")}
                  className={`h-9 ${fieldBase}`}
                />
              </div>
              <div>
                <label className={labelCls}>{t("editor.tags")}</label>
                <input
                  type="text"
                  value={form.tagsText}
                  onChange={(e) => patch({ tagsText: e.target.value })}
                  placeholder={t("editor.commaSeparated")}
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
                {t("editor.sourcesCount", { count: sources.length })}
              </p>
              <button
                type="button"
                onClick={handleAddSource}
                disabled={draftSource !== null}
                title={draftSource ? t("editor.draftOpenHint") : undefined}
                className="rounded-lg border border-dashed border-indigo-300 px-2.5 py-1 text-xs font-bold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-60"
              >
                {t("editor.addSource")}
              </button>
            </div>
            {sources.length === 0 && !draftSource ? (
              <p className="py-6 text-center text-xs text-slate-500">{t("editor.noSources")}</p>
            ) : (
              <ul className="space-y-1.5">
                {sources.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => void switchSource(s.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        s.id === activeSourceId
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"
                      }`}
                    >
                      <p className="truncate text-sm font-bold text-slate-800">
                        {s.source_name?.trim() || t("editor.unnamedSource")}
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
                      onClick={() => void switchSource(DRAFT_SOURCE_ID)}
                      className={`w-full rounded-xl border border-dashed px-3 py-2 text-left transition ${
                        activeSourceId === DRAFT_SOURCE_ID
                          ? "border-amber-400 bg-amber-50"
                          : "border-amber-300 bg-white hover:bg-amber-50/50"
                      }`}
                    >
                      <p className="flex items-center gap-1.5 truncate text-sm font-bold text-slate-800">
                        {draftSource.source_name?.trim() || t("editor.newSource")}
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700">
                          {t("editor.draft")}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {t("editor.notSavedYet")}
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
                onDirtyChange={setSourceDirty}
              />
            ) : (
              <p className="py-16 text-center text-sm text-slate-500">
                {t("editor.pickSource")}
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
              {t("editor.relationsHelp")}
            </div>

            {/* Seçili özet */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
                {t("editor.centersCount", { count: form.related_centers.length })}
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">
                {t("editor.channelsCount", { count: form.related_channels.length })}
              </span>
              <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-black text-orange-800">
                {t("editor.gatesCount", { count: form.related_gates.length })}
              </span>
            </div>
            {(form.related_centers.length + form.related_channels.length + form.related_gates.length) > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.related_centers.map((c) => {
                  const hit = HUMAN_DESIGN_CENTERS.find((x) => x.code === c);
                  const label = hit ? centerLabel(hit) : c;
                  return (
                    <button key={`c-${c}`} type="button" onClick={() => toggleCenter(c)}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
                      {label} ✕
                    </button>
                  );
                })}
                {form.related_channels.map((c) => {
                  const hit = HUMAN_DESIGN_CHANNELS.find((x) => x.code === c);
                  const label = hit ? channelLabel(hit) : c;
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
                    {t("gateOption", { n: g })} ✕
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
                placeholder={t("editor.relSearch")}
                className={`h-9 min-w-[200px] flex-1 ${fieldBase}`}
              />
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={onlySelected}
                  onChange={(e) => setOnlySelected(e.target.checked)}
                  className="h-4 w-4 rounded border-indigo-300 accent-indigo-600"
                />
                {t("editor.onlySelected")}
              </label>
            </div>
          </div>

          {/* Merkezler */}
          <section className={cardCls}>
            <button type="button" onClick={() => setOpenCenters((v) => !v)}
              className="flex w-full items-center justify-between">
              <span className={sectionCls + " mb-0"}>{t("editor.centersHeading", { count: form.related_centers.length })}</span>
              <span className="text-slate-400">{openCenters ? "▾" : "▸"}</span>
            </button>
            {openCenters && (
              <div className="mt-3 flex flex-wrap gap-2">
                {centersView.length === 0 ? (
                  <p className="text-xs text-slate-400">{t("editor.noCenterMatch")}</p>
                ) : centersView.map((center) => {
                  const sel = form.related_centers.includes(center.code);
                  return (
                    <button key={center.code} type="button" onClick={() => toggleCenter(center.code)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                        sel
                          ? "border-transparent bg-indigo-600 text-white shadow-[0_3px_10px_rgba(79,70,229,0.3)]"
                          : "border-indigo-200 bg-white text-slate-700 hover:border-indigo-400 hover:bg-indigo-50"
                      }`}>
                      {centerLabel(center)}
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
              <span className={sectionCls + " mb-0"}>{t("editor.channelsHeading", { count: form.related_channels.length })}</span>
              <span className="text-slate-400">{openChannels ? "▾" : "▸"}</span>
            </button>
            {openChannels && (
              <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {channelsView.length === 0 ? (
                  <p className="text-xs text-slate-400">{t("editor.noChannelMatch")}</p>
                ) : channelsView.map((ch) => {
                  const sel = form.related_channels.includes(ch.code);
                  return (
                    <label key={ch.code}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                        sel ? "bg-indigo-50 text-indigo-800" : "text-slate-700 hover:bg-slate-50"
                      }`}>
                      <input type="checkbox" checked={sel} onChange={() => toggleChannel(ch.code)}
                        className="h-3.5 w-3.5 rounded border-indigo-300 accent-indigo-600" />
                      {channelLabel(ch)}
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
              <span className={sectionCls + " mb-0"}>{t("editor.gatesHeading", { count: form.related_gates.length })}</span>
              <span className="text-slate-400">{openGates ? "▾" : "▸"}</span>
            </button>
            {openGates && (
              <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
                {gatesView.length === 0 ? (
                  <p className="col-span-full text-xs text-slate-400">{t("editor.noGateMatch")}</p>
                ) : gatesView.map((gate) => {
                  const sel = form.related_gates.includes(gate.code);
                  return (
                    <button key={gate.code} type="button" title={gateLabel(gate)}
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
          title={t("editor.unsavedTitle")}
          message={t("editor.leaveDialogMessage")}
          actions={[
            { key: "cancel", label: t("editor.stayLower"), tone: "safe" },
            { key: "discard", label: t("editor.discardAndLeave"), tone: "danger" },
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
