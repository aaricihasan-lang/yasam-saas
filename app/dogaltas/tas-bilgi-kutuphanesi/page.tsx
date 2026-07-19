"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken, isAdminUser } from "@/lib/auth/yasamUser";
import { normalizeTr } from "@/lib/dogaltas/stoneSearchUtils";
import { checkDuplicate } from "@/lib/dogaltas/dogaltasApi";
import { DuplicateWarningModal } from "@/app/dogaltas/components/DuplicateWarningModal";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { useIsMobileOrPwa } from "@/hooks/useIsMobileOrPwa";
import { useToast } from "@/components/ui/ToastProvider";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoBlur } from "@/components/demo/DemoBlur";
import { DemoGate } from "@/components/demo/DemoGate";
import { DogaltasBreadcrumb } from "@/app/dogaltas/components/DogaltasBreadcrumb";

// ─── Tipler ────────────────────────────────────────────────────────────────────

type Article = {
  id: string;
  tenant_id: string | null;
  title: string;
  content: string;
  category: string;
  sub_category: string;
  tags: string[];
  related_stones: string[];
  related_minerals: string[];
  source: string;
  source_section: string;
  keyword: string;
  notes: string;
  is_active: boolean;
};

type NewArticleForm = {
  title: string;
  content: string;
  category: string;
  sub_category: string;
  source: string;
};

const EMPTY_FORM: NewArticleForm = {
  title: "",
  content: "",
  category: "",
  sub_category: "",
  source: "",
};

// ─── Dinamik kategori tipi ─────────────────────────────────────────────────────

type Category = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  sort_order: number;
};

type NewCategoryForm = {
  name: string;
  icon: string;
  color: string;
};

const EMPTY_CAT_FORM: NewCategoryForm = { name: "", icon: "📖", color: "slate" };

// Renk adı → CSS değerleri (statik lookup, bileşen dışı)
const COLOR_MAP: Record<string, { hex: string; bg: string; border: string }> = {
  emerald: { hex: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
  blue:    { hex: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  violet:  { hex: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  amber:   { hex: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  slate:   { hex: "#475569", bg: "#f8fafc", border: "#e2e8f0" },
  rose:    { hex: "#e11d48", bg: "#fff1f2", border: "#fecdd3" },
  cyan:    { hex: "#0891b2", bg: "#ecfeff", border: "#a5f3fc" },
  orange:  { hex: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
  green:   { hex: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  indigo:  { hex: "#4f46e5", bg: "#eef2ff", border: "#c7d2fe" },
  pink:    { hex: "#db2777", bg: "#fdf2f8", border: "#fbcfe8" },
  teal:    { hex: "#0d9488", bg: "#f0fdfa", border: "#99f6e4" },
};

const COLOR_OPTIONS = [
  { value: "emerald", label: "Yeşil" },
  { value: "blue",    label: "Mavi" },
  { value: "violet",  label: "Mor" },
  { value: "amber",   label: "Amber" },
  { value: "slate",   label: "Gri" },
  { value: "rose",    label: "Pembe" },
  { value: "cyan",    label: "Açık Mavi" },
  { value: "orange",  label: "Turuncu" },
  { value: "green",   label: "Açık Yeşil" },
  { value: "indigo",  label: "İndigo" },
  { value: "teal",    label: "Teal" },
];

// ─── Arama motoru ──────────────────────────────────────────────────────────────

function getSearchTerms(query: string): string[] {
  return query.trim().split(/\s+/).map((t) => normalizeTr(t)).filter(Boolean);
}

function buildNormMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const charNorm = normalizeTr(text[i] ?? "");
    for (let j = 0; j < charNorm.length; j++) {
      norm += charNorm[j];
      map.push(i);
    }
  }
  return { norm, map };
}

function countInText(text: string, terms: string[]): number {
  if (!text || !terms.length) return 0;
  const { norm } = buildNormMap(text);
  let total = 0;
  for (const term of terms) {
    let pos = 0;
    while (pos <= norm.length - term.length) {
      const idx = norm.indexOf(term, pos);
      if (idx < 0) break;
      total++;
      pos = idx + term.length;
    }
  }
  return total;
}

function countRecordMatches(rec: Article, terms: string[]): number {
  if (!terms.length) return 0;
  const allFields = [
    rec.title, rec.content, rec.category, rec.sub_category,
    rec.source, rec.source_section, rec.keyword, rec.notes,
    ...rec.tags, ...rec.related_stones, ...rec.related_minerals,
  ];
  return allFields.reduce((sum, f) => sum + countInText(f, terms), 0);
}

function recordMatchesAll(rec: Article, terms: string[]): boolean {
  if (!terms.length) return true;
  const allText = normalizeTr([
    rec.title, rec.content, rec.category, rec.sub_category,
    rec.source, rec.source_section, rec.keyword, rec.notes,
    ...rec.tags, ...rec.related_stones, ...rec.related_minerals,
  ].join(" "));
  return terms.every((t) => allText.includes(t));
}

// ─── Highlight renderer ───────────────────────────────────────────────────────

function highlightSegment(text: string, terms: string[]): ReactNode {
  if (!terms.length || !text) return text;
  const { norm, map } = buildNormMap(text);
  type Range = { s: number; e: number };
  const ranges: Range[] = [];
  for (const term of terms) {
    let pos = 0;
    while (pos <= norm.length - term.length) {
      const idx = norm.indexOf(term, pos);
      if (idx < 0) break;
      const s = map[idx] ?? 0;
      const eNormIdx = idx + term.length - 1;
      const e = eNormIdx < map.length ? (map[eNormIdx] ?? s) + 1 : s + 1;
      ranges.push({ s, e });
      pos = idx + term.length;
    }
  }
  if (!ranges.length) return text;
  ranges.sort((a, b) => a.s - b.s);
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.s <= last.e) { last.e = Math.max(last.e, r.e); }
    else merged.push({ ...r });
  }
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < merged.length; i++) {
    const { s, e } = merged[i]!;
    if (s > cursor) nodes.push(<Fragment key={`t${i}`}>{text.slice(cursor, s)}</Fragment>);
    nodes.push(<mark key={`m${i}`} className="rounded bg-yellow-200 px-0.5 font-bold text-slate-900">{text.slice(s, e)}</mark>);
    cursor = e;
  }
  if (cursor < text.length) nodes.push(<Fragment key="tend">{text.slice(cursor)}</Fragment>);
  return <>{nodes}</>;
}

function renderInline(text: string, terms: string[]): ReactNode {
  const parts = text.split("^^");
  return parts.map((part, i) => {
    const content = terms.length ? highlightSegment(part, terms) : part;
    if (i % 2 === 1) return <strong key={i} className="font-black text-slate-950">{content}</strong>;
    return <Fragment key={i}>{content}</Fragment>;
  });
}

function renderContent(content: string, terms: string[]): ReactNode {
  if (!content) return null;
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let buffer: string[] = [];
  let key = 0;
  function flushBuffer() {
    if (!buffer.length) return;
    const text = buffer.join(" ").trim();
    if (!text) { buffer = []; return; }
    nodes.push(<p key={key++} className="leading-8 text-slate-700">{renderInline(text, terms)}</p>);
    buffer = [];
  }
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("## ")) {
      flushBuffer();
      nodes.push(<h3 key={key++} className="mb-3 mt-8 border-b border-slate-100 pb-2 text-lg font-black tracking-tight text-slate-900 first:mt-0">{renderInline(line.slice(3), terms)}</h3>);
      continue;
    }
    if (line.startsWith("### ")) {
      flushBuffer();
      nodes.push(<h4 key={key++} className="mb-2 mt-6 text-base font-black text-slate-800 first:mt-0">{renderInline(line.slice(4), terms)}</h4>);
      continue;
    }
    if (line.trim() === "") { flushBuffer(); continue; }
    buffer.push(line);
  }
  flushBuffer();
  return <div className="space-y-5">{nodes}</div>;
}

function trSort(a: string, b: string) {
  return normalizeTr(a).localeCompare(normalizeTr(b), "tr");
}

// ─── Güvenli API auth header'ları ───────────────────────────────────────────────
function userHeaders(json = false): Record<string, string> {
  const token = readSessionToken();
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    "x-user-id": readYasamUser()?.id ?? "",
    ...(token ? { "x-session-token": token } : {}),
  };
}

// Admin-yetkili yazma için (kategori oluşturma) — x-admin-id başlığı.
function adminHeaders(json = false): Record<string, string> {
  const token = readSessionToken();
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    "x-admin-id": readYasamUser()?.id ?? "",
    ...(token ? { "x-session-token": token } : {}),
  };
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

export default function TasBilgiKutuphanesiPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const [activeKat, setActiveKat] = useState("Tümü");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  // Makale formu
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewArticleForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // Modül-bazlı çift kayıt uyarısı (DT-P1-1)
  const [dupModal, setDupModal] = useState<{ label: string; id: string } | null>(null);
  const [dupChecking, setDupChecking] = useState(false);
  // Kategori state
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  const [showCatForm, setShowCatForm] = useState(false);
  const [catForm, setCatForm] = useState<NewCategoryForm>(EMPTY_CAT_FORM);
  const [savingCat, setSavingCat] = useState(false);
  const [catError, setCatError] = useState("");
  // Global kategori oluşturma yalnız admin'e açık (POST route verifyAdminRequest ile
  // ayrıca korunur; bu bayrak yalnız UI görünürlüğü içindir, tek güvenlik katmanı değil).
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { setIsAdmin(isAdminUser(readYasamUser())); }, []);
  const contentRef = useRef<HTMLDivElement>(null);
  // Word raporu modal
  const [showWordModal, setShowWordModal] = useState(false);
  const [wordExportMode, setWordExportMode] = useState<"all" | "category" | "filtered" | "viewed">("all");
  const [wordExportCategory, setWordExportCategory] = useState("");
  const [wordReportLoading, setWordReportLoading] = useState(false);
  const [wordReportError, setWordReportError] = useState("");
  const [wordReportSuccess, setWordReportSuccess] = useState("");
  // Makale düzenleme
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", category: "", sub_category: "", content: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  // Toplu işlem
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [showBulkUpdateModal, setShowBulkUpdateModal] = useState(false);
  const [bulkUpdateForm, setBulkUpdateForm] = useState({ category: "", sub_category: "", title: "", content: "" });
  const [bulkUpdateTextEdit, setBulkUpdateTextEdit] = useState(false);
  const [bulkUpdateOriginal, setBulkUpdateOriginal] = useState({ title: "", content: "" });
  const [bulkUpdateBusy, setBulkUpdateBusy] = useState(false);
  const [bulkUpdateError, setBulkUpdateError] = useState("");

  const deleteConfirm = useDeleteConfirm();
  const { showToast } = useToast();
  const isMobile = useIsMobileOrPwa();
  const { isDemo } = useDemoGuard();

  // ─── Dinamik katConfig (categoryList'e göre) ──────────────────────────────
  const katMap = useMemo(() => {
    const m = new Map<string, { color: string; bg: string; border: string; icon: string }>();
    for (const cat of categoryList) {
      const c = COLOR_MAP[cat.color] ?? COLOR_MAP.slate!;
      m.set(cat.name, { color: c.hex, bg: c.bg, border: c.border, icon: cat.icon });
    }
    return m;
  }, [categoryList]);

  function katConfig(kat: string) {
    return katMap.get(kat) ?? { color: "#475569", bg: "#f8fafc", border: "#e2e8f0", icon: "📄" };
  }

  // Debounce 120ms
  useEffect(() => {
    const t = setTimeout(() => setSearch(rawSearch), 120);
    return () => clearTimeout(t);
  }, [rawSearch]);

  // Arama temizlenince viewed sıfırla — her arama oturumu temiz başlar
  useEffect(() => {
    if (rawSearch.trim().length === 0) setViewed(new Set());
  }, [rawSearch]);

  // tenantId yükle
  useEffect(() => {
    void getSyncedTenantId().then(setTenantId);
  }, []);

  // Kategorileri yükle (bir kez)
  useEffect(() => {
    void loadCategories();
  }, []);

  // Makaleleri yükle
  useEffect(() => {
    if (tenantId === undefined) return;
    void loadArticles();
  }, [tenantId]);

  async function loadArticles() {
    setLoading(true);
    // Veri kaynağı: güvenli sunucu API (paylaşımlı kütüphane + kendi ekleri sunucuda birleştirilir)
    try {
      const res = await fetch("/api/dogaltas/knowledge", {
        headers: userHeaders(),
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; articles?: Article[] };
      if (res.ok && json.ok && json.articles) {
        const sorted = [...json.articles].sort((a, b) => trSort(a.title, b.title));
        setArticles(sorted);
      }
    } catch {
      /* sessiz — liste boş kalır */
    }
    setLoading(false);
  }

  async function loadCategories() {
    // Güvenli sunucu API (service_role). Başarısızsa sessiz — makale tabanlı
    // fallback (dropdownCategories/categories useMemo) devreye girer, ekran çökmez.
    try {
      const res = await fetch("/api/dogaltas/knowledge/categories", {
        headers: userHeaders(),
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; categories?: Category[] };
      if (res.ok && json.ok && json.categories) setCategoryList(json.categories);
    } catch {
      /* sessiz — fallback devreye girer */
    }
  }

  async function saveCategory() {
    const name = catForm.name.trim();
    if (!name) { setCatError("Kategori adı zorunludur."); return; }
    setSavingCat(true);
    setCatError("");
    // slug/sort_order/is_active SUNUCUDA belirlenir; yazma yetkisi verifyAdminRequest ile.
    try {
      const res = await fetch("/api/dogaltas/knowledge/categories", {
        method: "POST",
        headers: adminHeaders(true),
        body: JSON.stringify({
          name,
          icon:  catForm.icon.trim() || "📖",
          color: catForm.color || "slate",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setSavingCat(false);
      if (!res.ok || !json.ok) {
        if (res.status === 409) { setCatError("Bu isimde kategori zaten var."); return; }
        if (res.status === 401 || res.status === 403) { setCatError("Bu işlem için admin yetkisi gerekli."); return; }
        setCatError(json.error ? "Hata: " + json.error : "Kategori kaydedilemedi.");
        return;
      }
    } catch {
      setSavingCat(false);
      setCatError("Sunucuya ulaşılamadı.");
      return;
    }
    setCatForm(EMPTY_CAT_FORM);
    setShowCatForm(false);
    await loadCategories();
    // Yeni kategoriyi makale formunda otomatik seç
    setForm((f) => ({ ...f, category: name }));
  }

  // ─── Türetilmiş veriler ─────────────────────────────────────────────────────

  const searchTerms = useMemo(() => getSearchTerms(search), [search]);

  // Arama aktif mi? rawSearch bazlı — input temizlenince anında normal moda döner
  const isSearchActive = rawSearch.trim().length > 0;

  // Filtre pilleri için kategori isimleri (DB + fallback)
  const categories = useMemo(() => {
    const fromDb = categoryList.map((c) => c.name);
    const extra = [...new Set(articles.map((r) => r.category).filter(Boolean))]
      .filter((n) => !fromDb.includes(n))
      .sort(trSort);
    return ["Tümü", ...fromDb, ...extra];
  }, [categoryList, articles]);

  // Form dropdown için: DB kategorileri (ikonlu) + makale tabanlı fallback (ikonsuz)
  // stone_knowledge_categories tablosuna grant uygulanmamışsa bile seçenekler görünür
  const dropdownCategories = useMemo<Category[]>(() => {
    if (categoryList.length > 0) return categoryList;
    // Fallback: makalelerdeki unique kategorilerden sentetik liste üret
    const names = [...new Set(articles.map((r) => r.category).filter(Boolean))].sort(trSort);
    return names.map((name, i) => ({
      id: name,
      name,
      slug: normalizeTr(name).replace(/[^a-z0-9]+/g, "-"),
      icon: "📄",
      color: "slate",
      sort_order: i,
    }));
  }, [categoryList, articles]);

  const filtered = useMemo(() => {
    return articles.filter((r) => {
      if (activeKat !== "Tümü" && r.category !== activeKat) return false;
      if (!recordMatchesAll(r, searchTerms)) return false;
      return true;
    });
  }, [articles, activeKat, searchTerms]);

  const matchCounts = useMemo(() => {
    if (!searchTerms.length) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const rec of filtered) m.set(rec.id, countRecordMatches(rec, searchTerms));
    return m;
  }, [filtered, searchTerms]);

  const selectedArticle = useMemo(
    () => articles.find((r) => r.id === selectedId) ?? null,
    [articles, selectedId]
  );

  const selectedContentMatchCount = useMemo(() => {
    if (!selectedArticle || !searchTerms.length) return 0;
    return countInText(selectedArticle.content, searchTerms);
  }, [selectedArticle, searchTerms]);

  const canEdit = !!(selectedArticle && tenantId && selectedArticle.tenant_id === tenantId) && !isDemo;

  // Makale değişince düzenleme modundan çık
  useEffect(() => {
    setIsEditing(false);
    setEditError("");
  }, [selectedId]);

  // Arama aktifken seçili kayıt filtrede yoksa ilkini seç
  useEffect(() => {
    if (!searchTerms.length) return;
    if (filtered.length > 0 && !filtered.some((r) => r.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
      contentRef.current?.scrollTo({ top: 0 });
    }
  }, [filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectArticle(id: string) {
    setSelectedId(id);
    setMobileView("detail");
    contentRef.current?.scrollTo({ top: 0 });
    if (isSearchActive) {
      setViewed((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
  }

  // ─── Word raporu indirme ────────────────────────────────────────────────────

  async function downloadKnowledgeReport() {
    if (wordExportMode === "category" && !wordExportCategory) {
      setWordReportError("Lütfen bir kategori seçin.");
      return;
    }
    const tid = await getSyncedTenantId();
    if (!tid) { setWordReportError("Oturum bulunamadı. Lütfen sayfayı yenileyin."); return; }
    const uid = readYasamUser()?.id;
    if (!uid) { setWordReportError("Kullanıcı kimliği bulunamadı. Lütfen tekrar giriş yapın."); return; }

    let articleIds: string[] | undefined;
    if (wordExportMode === "filtered") {
      articleIds = filtered.map((a) => a.id);
      if (!articleIds.length) { setWordReportError("Filtrelenmiş sonuç bulunamadı."); return; }
    } else if (wordExportMode === "viewed") {
      articleIds = [...viewed];
      if (!articleIds.length) { setWordReportError("Bu arama oturumunda henüz görüntülenen makale yok."); return; }
    }

    setWordReportLoading(true);
    setWordReportError("");
    setWordReportSuccess("");

    try {
      const res = await fetch("/api/dogaltas/knowledge-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tid,
          userId: uid,
          exportMode: wordExportMode,
          categoryName: wordExportMode === "category" ? wordExportCategory : undefined,
          articleIds,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        // FAZ-4C: ham backend hatası kullanıcıya gösterilmez; yalnız geliştirici logunda.
        console.error("[tas-bilgi-kutuphanesi] Word raporu hatası:", data.error ?? `HTTP ${res.status}`);
        setWordReportError("Word raporu oluşturulamadı. Lütfen tekrar deneyin.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tas-bilgi-kutuphanesi-raporu-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      // FAZ-4C: "İndirildi" demiyoruz — tarayıcının gerçek konumunu/tamamlanmayı doğrulayamayız.
      setWordReportSuccess("Word raporu için indirme başlatıldı. Dosyayı tarayıcınızın İndirilenler bölümünde bulabilirsiniz.");
    } catch (err) {
      console.error("[tas-bilgi-kutuphanesi] Word raporu hatası:", err);
      setWordReportError("Word raporu oluşturulamadı. Lütfen tekrar deneyin.");
    } finally {
      setWordReportLoading(false);
    }
  }

  // ─── Yeni kayıt kaydetme ────────────────────────────────────────────────────

  async function saveArticle(forceCreate = false) {
    if (!form.title.trim()) {
      setSaveError("Başlık zorunludur.");
      return;
    }
    if (!form.category) {
      setSaveError("Kategori seçimi zorunludur.");
      return;
    }
    if (!form.content.trim()) {
      setSaveError("İçerik zorunludur.");
      return;
    }
    // Modül-bazlı çift kayıt kontrolü (yalnız ilk denemede; çift-tık koruması).
    if (!forceCreate) {
      if (dupChecking || dupModal || saving) return;
      setDupChecking(true);
      const dup = await checkDuplicate("knowledge", form.title);
      setDupChecking(false);
      if (dup.ok && dup.exists && dup.match) {
        setDupModal({ label: dup.match.label, id: dup.match.id });
        return;
      }
    }
    if (!tenantId) {
      setSaveError("Oturum bulunamadı. Lütfen sayfayı yenileyin.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/dogaltas/knowledge", {
        method: "POST",
        headers: userHeaders(true),
        body: JSON.stringify({
          title:        form.title.trim(),
          content:      form.content.trim(),
          category:     form.category.trim(),
          sub_category: form.sub_category.trim(),
          source:       form.source.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setSaveError("Kayıt hatası: " + (json.error ?? "Bilinmeyen hata"));
        return;
      }
    } finally {
      setSaving(false);
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
    await loadArticles();
  }

  // ─── Makale güncelleme ──────────────────────────────────────────────────────

  async function updateArticle() {
    if (!selectedArticle) return;
    if (!editForm.title.trim()) { setEditError("Başlık zorunludur."); return; }
    if (!editForm.category) { setEditError("Kategori seçimi zorunludur."); return; }
    if (!editForm.content.trim()) { setEditError("İçerik zorunludur."); return; }

    setEditSaving(true);
    setEditError("");

    try {
      const res = await fetch("/api/dogaltas/knowledge", {
        method: "PATCH",
        headers: userHeaders(true),
        body: JSON.stringify({
          id:           selectedArticle.id,
          title:        editForm.title.trim(),
          category:     editForm.category.trim(),
          sub_category: editForm.sub_category.trim(),
          content:      editForm.content.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setEditError("Güncelleme hatası: " + (json.error ?? "Bilinmeyen hata"));
        return;
      }
    } finally {
      setEditSaving(false);
    }

    setArticles((prev) =>
      [...prev.map((a) =>
        a.id === selectedArticle.id
          ? { ...a, title: editForm.title.trim(), category: editForm.category, sub_category: editForm.sub_category.trim(), content: editForm.content.trim() }
          : a
      )].sort((a, b) => trSort(a.title, b.title))
    );
    setIsEditing(false);
  }

  // ─── Toplu seçim ────────────────────────────────────────────────────────────

  function toggleSelection(id: string) {
    // FAZ-1: Mobil/PWA'da aynı anda en fazla 2 kayıt seçilebilir.
    if (isMobile && !selectedIds.has(id) && selectedIds.size >= 2) {
      showToast({ type: "info", message: "Mobilde aynı anda en fazla 2 kayıt seçebilirsiniz." });
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (isMobile && next.size >= 2) return prev; // state seviyesinde sınır
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (isMobile) {
      showToast({ type: "info", message: "Mobilde aynı anda en fazla 2 kayıt seçebilirsiniz." });
      return;
    }
    setSelectedIds(new Set(filtered.map((r) => r.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (!ids.length || bulkDeleteBusy || !tenantId) return;

    const ok = await deleteConfirm({
      title: "Kayıtları Kalıcı Olarak Sil",
      message: `${ids.length} kayıt kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
    });
    if (!ok) return;

    setBulkDeleteBusy(true);
    try {
      const res = await fetch("/api/dogaltas/knowledge", {
        method: "DELETE",
        headers: userHeaders(true),
        body: JSON.stringify({ ids }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; rows?: { id: string }[] };

      if (!res.ok || !json.ok) {
        // FAZ-4D: ham backend hatası kullanıcıya gösterilmez; yalnız geliştirici logunda.
        console.error("[tas-bilgi-kutuphanesi] Toplu silme hatası:", json.error ?? `HTTP ${res.status}`);
        showToast({ type: "error", message: "Silme işlemi gerçekleştirilemedi. Lütfen tekrar deneyin." });
        return;
      }

      const deletedSet = new Set((json.rows ?? []).map((r) => r.id));
      setArticles((prev) => prev.filter((a) => !deletedSet.has(a.id)));
      clearSelection();

      const count = deletedSet.size;
      const skipped = ids.length - count;
      showToast({
        type: "success",
        message: skipped > 0
          ? `${count} kayıt silindi. ${skipped} kütüphane kaydı atlandı.`
          : `${count} kayıt başarıyla silindi.`,
      });
    } catch (err) {
      // FAZ-4D: fetch/ağ/abort gibi beklenmeyen istisnalar; teknik ayrıntı yalnız logda.
      console.error("[tas-bilgi-kutuphanesi] Toplu silme hatası:", err);
      showToast({ type: "error", message: "Silme işlemi gerçekleştirilemedi. Lütfen tekrar deneyin." });
    } finally {
      setBulkDeleteBusy(false);
    }
  }

  async function handleBulkUpdate() {
    const ids = [...selectedIds];
    if (!ids.length || bulkUpdateBusy || !tenantId) return;

    const isSingle = ids.length === 1;

    const updates: Partial<{ category: string; sub_category: string; title: string; content: string }> = {};
    if (bulkUpdateForm.category.trim()) updates.category = bulkUpdateForm.category.trim();
    if (bulkUpdateForm.sub_category.trim()) updates.sub_category = bulkUpdateForm.sub_category.trim();

    if (isSingle && bulkUpdateTextEdit) {
      const newTitle = bulkUpdateForm.title.trim();
      const newContent = bulkUpdateForm.content.trim();
      if (newTitle && newTitle !== bulkUpdateOriginal.title) updates.title = newTitle;
      if (newContent && newContent !== bulkUpdateOriginal.content) updates.content = newContent;
    }

    if (!Object.keys(updates).length) {
      setBulkUpdateError("En az bir alanı değiştirin.");
      return;
    }

    if (updates.title !== undefined || updates.content !== undefined) {
      const ok = await deleteConfirm({
        title: "Makale Metni Güncellenecek",
        message: "Makale başlığı veya içeriği kalıcı olarak değiştirilecek. Emin misiniz?",
      });
      if (!ok) return;
    }

    setBulkUpdateBusy(true);
    setBulkUpdateError("");
    try {
      const res = await fetch("/api/dogaltas/knowledge", {
        method: "PATCH",
        headers: userHeaders(true),
        body: JSON.stringify({ ids, ...updates }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        rows?: { id: string; title: string; content: string; category: string; sub_category: string }[];
      };

      if (!res.ok || !json.ok) {
        // FAZ-4E: ham backend hatası kullanıcıya gösterilmez; yalnız geliştirici logunda.
        console.error("[tas-bilgi-kutuphanesi] Toplu güncelleme hatası:", json.error ?? `HTTP ${res.status}`);
        setBulkUpdateError("Güncelleme işlemi gerçekleştirilemedi. Lütfen tekrar deneyin.");
        return;
      }

      const updated = json.rows;
      if (updated?.length) {
        const uMap = new Map(
          (updated as { id: string; title: string; content: string; category: string; sub_category: string }[]).map((r) => [r.id, r])
        );
        setArticles((prev) =>
          [...prev.map((a) => {
            const u = uMap.get(a.id);
            if (!u) return a;
            return {
              ...a,
              ...(u.category    !== undefined ? { category: u.category }       : {}),
              ...(u.sub_category !== undefined ? { sub_category: u.sub_category } : {}),
              ...(u.title       !== undefined ? { title: u.title }             : {}),
              ...(u.content     !== undefined ? { content: u.content }         : {}),
            };
          })].sort((a, b) => trSort(a.title, b.title))
        );
      }

      clearSelection();
      setShowBulkUpdateModal(false);
      setBulkUpdateForm({ category: "", sub_category: "", title: "", content: "" });
      setBulkUpdateTextEdit(false);
      showToast({ type: "success", message: `${updated?.length ?? 0} kayıt güncellendi.` });
    } catch (err) {
      // FAZ-4E: fetch/ağ/abort gibi beklenmeyen istisnalar; teknik ayrıntı yalnız logda.
      console.error("[tas-bilgi-kutuphanesi] Toplu güncelleme hatası:", err);
      setBulkUpdateError("Güncelleme işlemi gerçekleştirilemedi. Lütfen tekrar deneyin.");
    } finally {
      setBulkUpdateBusy(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,#fef3c7_0%,#ecfccb_38%,#f8fafc_100%)] text-slate-950">
      <BfcacheRefreshHandler />

      {/* Header */}
      <header className="shrink-0 border-b border-emerald-200/60 bg-white/85 px-4 py-3 shadow-sm backdrop-blur sm:px-6">
        <DogaltasBreadcrumb className="mb-2" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-0.5 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-emerald-700">
              Doğaltaş
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
              Taş Bilgi Kütüphanesi
            </h1>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {loading
                ? "Yükleniyor..."
                : `${articles.length} makale · Mineroloji, Şifa, Araştırma, Uygulamalar`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Kategori stats (xl+) */}
            <div className="hidden flex-wrap gap-1.5 xl:flex">
              {categoryList.map((cat) => {
                const count = articles.filter((r) => r.category === cat.name).length;
                if (!count) return null;
                const cfg = katConfig(cat.name);
                return (
                  <span key={cat.id} className="rounded-full border px-3 py-1 text-xs font-bold"
                    style={{ borderColor: cfg.border, background: cfg.bg, color: cfg.color }}>
                    {cat.icon} {cat.name} ({count})
                  </span>
                );
              })}
            </div>

            {/* Word raporu butonu */}
            {!isDemo && (
              <button
                type="button"
                onClick={() => { setShowWordModal(true); setWordReportError(""); setWordReportSuccess(""); }}
                className="btn-soft"
              >
                📄 Word Raporu
              </button>
            )}

            {/* Yeni kayıt butonu */}
            {!isDemo && (
              <button
                type="button"
                onClick={() => { setShowForm((v) => !v); setSaveError(""); }}
                className={showForm ? "btn-soft" : "btn-primary"}
              >
                {showForm ? "Formu Kapat" : "+ Yeni Kayıt"}
              </button>
            )}
          </div>
        </div>

        {/* Yeni kayıt formu */}
        {!isDemo && showForm && (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <h3 className="mb-3 text-sm font-black text-slate-900">Yeni Makale Ekle</h3>
            {saveError && (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                {saveError}
              </div>
            )}
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-black text-slate-700">Başlık *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Makale başlığı..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="mb-1 block text-xs font-black text-slate-700">
                  Kategori <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  >
                    <option value="">— Kategori seç —</option>
                    {dropdownCategories.map((cat) => (
                      <option key={cat.id} value={cat.name}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => { setShowCatForm((v) => !v); setCatError(""); }}
                      className="btn-soft !px-3 !py-2 !text-xs shrink-0"
                    >
                      {showCatForm ? "Vazgeç" : "+ Yeni Kategori"}
                    </button>
                  )}
                </div>

                {/* Inline kategori formu */}
                {showCatForm && (
                  <div className="mt-2 rounded-xl border border-emerald-200 bg-white p-3 shadow-sm">
                    <p className="mb-2 text-xs font-black text-slate-800">Yeni Kategori Ekle</p>
                    {catError && (
                      <p className="mb-2 text-[11px] font-bold text-rose-600">{catError}</p>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        value={catForm.name}
                        onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Kategori adı *"
                        className="col-span-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      />
                      <div className="col-span-1">
                        <input
                          value={catForm.icon}
                          onChange={(e) => setCatForm((f) => ({ ...f, icon: e.target.value }))}
                          placeholder="İkon 📖"
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium outline-none focus:border-emerald-400"
                        />
                      </div>
                      <div className="col-span-2">
                        <select
                          value={catForm.color}
                          onChange={(e) => setCatForm((f) => ({ ...f, color: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium outline-none focus:border-emerald-400"
                        >
                          {COLOR_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setShowCatForm(false); setCatForm(EMPTY_CAT_FORM); setCatError(""); }}
                        className="btn-soft !px-3 !py-1.5 !text-xs !rounded-lg"
                      >
                        Vazgeç
                      </button>
                      <button
                        type="button"
                        onClick={saveCategory}
                        disabled={savingCat}
                        className="btn-primary !px-3 !py-1.5 !text-xs !rounded-lg"
                      >
                        {savingCat ? "Kaydediliyor..." : "Kategoriyi Kaydet"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="lg:col-span-2">
                <label className="mb-1 block text-xs font-black text-slate-700">Kaynak</label>
                <input
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                  placeholder="Kaynak adı..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="mb-1 block text-xs font-black text-slate-700">İçerik *</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="Makale içeriği... (## Başlık ile bölümler oluşturabilirsin)"
                  rows={6}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setSaveError(""); }}
                className="btn-soft"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void saveArticle()}
                disabled={saving || dupChecking}
                className="btn-primary"
              >
                {dupChecking ? "Kontrol ediliyor..." : saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* İki panel */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* Sol panel */}
        <aside className={`flex w-full shrink-0 flex-col bg-white border-r border-slate-200
          md:w-80 lg:w-[340px] xl:w-96
          ${mobileView === "detail" ? "hidden md:flex" : "flex"}`}>

          {/* Arama */}
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={rawSearch}
                onChange={(e) => setRawSearch(e.target.value)}
                placeholder="Tam metin ara — şifa, mineral, çakra..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-8 text-sm font-medium outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
              {rawSearch && (
                <button type="button"
                  onClick={() => { setRawSearch(""); setSearch(""); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-200">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              {isSearchActive ? (
                <><span className="font-black text-emerald-700">{filtered.length} sonuç</span>
                  <span className="text-slate-400">—</span>
                  <span className="text-slate-500">"{search}" araması</span></>
              ) : (
                <span className="text-slate-400">{filtered.length} kayıt</span>
              )}
            </div>
          </div>

          {/* Kategori filtreleri */}
          <div className="shrink-0 border-b border-slate-100 px-3 py-2">
            <div className="flex flex-wrap gap-1">
              {categories.map((kat) => {
                const isActive = activeKat === kat;
                const cfg = kat === "Tümü" ? null : katConfig(kat);
                return (
                  <button key={kat} type="button" onClick={() => setActiveKat(kat)}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all"
                    style={isActive
                      ? { background: cfg?.color ?? "#334155", borderColor: cfg?.color ?? "#334155", color: "white" }
                      : { background: cfg?.bg ?? "white", borderColor: cfg?.border ?? "#e2e8f0", color: cfg?.color ?? "#475569" }}>
                    {cfg?.icon} {kat}
                    {kat !== "Tümü" && (
                      <span className="ml-1 opacity-60">({articles.filter((r) => r.category === kat).length})</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toplu işlem çubuğu — Doğaltaş'a özel V3 mini toolbar ("Seçili Güncelle" korunur) */}
          {!isDemo && !loading && (
            <div className="shrink-0 border-b border-slate-100 px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/80 px-2.5 py-1.5 shadow-sm">
                <span className="shrink-0 text-[11px] font-black text-slate-600">📋 Toplu İşlemler</span>
                <span className="shrink-0 rounded-full border border-blue-300 bg-white px-2 py-0.5 text-[11px] font-black text-blue-800">
                  {selectedIds.size > 0 ? `✓ ${selectedIds.size} seçili` : "Seçim yok"}
                </span>

                {/* FAZ-1: Mobil/PWA'da "Tümünü Seç" gizlenir (max 2 kayıt kuralı);
                    seçimi temizleme ayrı "Seçimi Kaldır" butonuyla korunur. */}
                {!isMobile && (
                  <button
                    type="button"
                    onClick={selectedIds.size >= filtered.length ? clearSelection : selectAll}
                    disabled={bulkDeleteBusy || bulkUpdateBusy || filtered.length === 0}
                    className="btn-soft !px-2 !py-1 !text-[11px] !rounded-lg"
                  >
                    {selectedIds.size > 0 && selectedIds.size >= filtered.length
                      ? "Tümünün Seçimini Kaldır"
                      : `Tümünü Seç (${filtered.length})`}
                  </button>
                )}

                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={bulkDeleteBusy || bulkUpdateBusy}
                    className="btn-soft !px-2 !py-1 !text-[11px] !rounded-lg"
                  >
                    Seçimi Kaldır
                  </button>
                )}

                <span className="mx-0.5 hidden h-3 w-px bg-blue-200 sm:block" aria-hidden />

                <button
                  type="button"
                  onClick={() => {
                    const singleId = selectedIds.size === 1 ? [...selectedIds][0] : undefined;
                    const singleArt = singleId ? articles.find((a) => a.id === singleId) : undefined;
                    setBulkUpdateOriginal({ title: singleArt?.title ?? "", content: singleArt?.content ?? "" });
                    setBulkUpdateForm({ category: "", sub_category: "", title: singleArt?.title ?? "", content: singleArt?.content ?? "" });
                    setBulkUpdateTextEdit(false);
                    setBulkUpdateError("");
                    setShowBulkUpdateModal(true);
                  }}
                  disabled={selectedIds.size === 0 || bulkDeleteBusy || bulkUpdateBusy}
                  className="btn-primary !px-3 !py-1 !text-[11px] !rounded-lg"
                >
                  Seçili Güncelle
                </button>

                <button
                  type="button"
                  onClick={() => void handleBulkDelete()}
                  disabled={selectedIds.size === 0 || bulkDeleteBusy || bulkUpdateBusy}
                  className="btn-danger !px-2 !py-1 !text-[11px] !rounded-lg"
                >
                  {bulkDeleteBusy ? "Siliniyor…" : "Seçili Sil"}
                </button>
              </div>
              <p className="mt-1 px-0.5 text-[10px] font-semibold text-slate-400">
                “Tümünü Seç” yalnızca şu an filtrelenmiş {filtered.length} kaydı seçer.
              </p>
            </div>
          )}

          {/* Liste */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex h-32 items-center justify-center text-sm text-slate-400">Yükleniyor...</div>
            ) : filtered.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-1 text-sm text-slate-400">
                <span className="text-xl">🔍</span>
                {articles.length === 0
                  ? "Henüz makale yok. Yeni Kayıt butonu ile ekleyebilirsin."
                  : "Kayıt bulunamadı"}
              </div>
            ) : (
              <div className="py-1">
                {filtered.map((rec) => {
                  const isActive = rec.id === selectedId;
                  const isBulkSelected = selectedIds.has(rec.id);
                  const cfg = katConfig(rec.category);
                  const matchCount = matchCounts.get(rec.id) ?? 0;
                  return (
                    <div key={rec.id} className="mx-2 mb-0.5 flex items-center gap-1.5">
                      {!isDemo && (
                        <input
                          type="checkbox"
                          checked={isBulkSelected}
                          onChange={(e) => { e.stopPropagation(); toggleSelection(rec.id); }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-emerald-600"
                        />
                      )}
                      <button type="button" onClick={(e) => { if ((e.target as HTMLElement).tagName === "INPUT") return; selectArticle(rec.id); }}
                        className={`flex flex-1 items-start gap-3 rounded-xl px-3 py-3 text-left transition-all
                          ${isActive ? "shadow-md" : "hover:bg-slate-50"}
                          ${isBulkSelected && !isActive ? "ring-2 ring-blue-200 ring-offset-1" : ""}`}
                        style={isActive ? { background: cfg.color } : undefined}>
                        <span className="mt-0.5 shrink-0 text-base leading-none">{cfg.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className={`text-sm font-bold leading-snug ${isActive ? "text-white" : "text-slate-900"}`}>
                            {rec.title}
                          </div>
                          <div className={`mt-0.5 flex items-center gap-2 text-[11px] font-semibold ${isActive ? "text-white/70" : "text-slate-400"}`}>
                            <span>{rec.category}</span>
                            {rec.source && <><span>·</span><span>{rec.source.replace(/\.(docx|pdf)$/i, "")}</span></>}
                          </div>
                          {isSearchActive && viewed.has(rec.id) && (
                            <div className={`mt-0.5 text-[11px] font-semibold ${isActive ? "text-white/55" : "text-rose-400/80"}`}>
                              ✓ Bakıldı
                            </div>
                          )}
                        </div>
                        {isSearchActive && matchCount > 0 && (
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${isActive ? "bg-white/25 text-white" : "bg-yellow-100 text-yellow-800"}`}>
                            {matchCount}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Sağ panel */}
        <div className={`flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-100
          ${mobileView === "list" ? "hidden md:flex" : "flex"}`}>
          {!selectedArticle ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-md rounded-3xl border border-white bg-white px-10 py-12 text-center shadow-md">
                <div className="mb-4 text-5xl">📚</div>
                <h2 className="text-2xl font-black text-slate-900">Taş Bilgi Kütüphanesi</h2>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Sol panelden bir makale seçerek okuyabilirsin.
                  Arama motoruyla tam metin içinde arama yapabilirsin.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {categoryList.map((cat) => {
                    const cfg = katConfig(cat.name);
                    return (
                      <span key={cat.id} className="rounded-full border px-3 py-1 text-xs font-bold"
                        style={{ borderColor: cfg.border, background: cfg.bg, color: cfg.color }}>
                        {cat.icon} {cat.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Detay başlık */}
              <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <button type="button" onClick={() => setMobileView("list")}
                    className="btn-soft !px-2.5 !py-1.5 !text-xs !rounded-lg mt-0.5 shrink-0 md:hidden">
                    ← Geri
                  </button>
                  <div className="min-w-0 flex-1">
                    {/* Üst satır: kategori / arama badge + sağda edit butonları */}
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {!isEditing && (() => {
                          const cfg = katConfig(selectedArticle.category);
                          return (
                            <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-black"
                              style={{ borderColor: cfg.border, background: cfg.bg, color: cfg.color }}>
                              {cfg.icon} {selectedArticle.category}
                            </span>
                          );
                        })()}
                        {!isEditing && isSearchActive && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-300 bg-yellow-50 px-2.5 py-0.5 text-xs font-bold text-yellow-800">
                            🔍 Arama: {search}
                            {selectedContentMatchCount > 0 && (
                              <span className="rounded-full bg-yellow-200 px-1.5 py-0.5 text-[10px] font-black">
                                {selectedContentMatchCount} eşleşme
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      {canEdit && (
                        isEditing ? (
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => { setIsEditing(false); setEditError(""); }}
                              disabled={editSaving}
                              className="btn-soft !px-3 !py-1.5 !text-xs !rounded-xl"
                            >
                              Vazgeç
                            </button>
                            <button
                              type="button"
                              onClick={() => void updateArticle()}
                              disabled={editSaving}
                              className="btn-primary !px-4 !py-1.5 !text-xs !rounded-xl"
                            >
                              {editSaving ? "Kaydediliyor..." : "Kaydet"}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditForm({
                                title:        selectedArticle.title,
                                category:     selectedArticle.category,
                                sub_category: selectedArticle.sub_category,
                                content:      selectedArticle.content,
                              });
                              setEditError("");
                              setIsEditing(true);
                            }}
                            className="btn-soft !px-3 !py-1.5 !text-xs !rounded-xl shrink-0"
                          >
                            ✏️ Düzenle
                          </button>
                        )
                      )}
                    </div>

                    {/* Başlık */}
                    {isEditing ? (
                      <input
                        value={editForm.title}
                        onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="Makale başlığı..."
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xl font-black text-slate-950 outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 sm:text-2xl"
                      />
                    ) : (
                      <h2 className="text-xl font-black leading-snug text-slate-950 sm:text-2xl">
                        {selectedArticle.title}
                      </h2>
                    )}

                    {/* Edit formu: kategori + alt kategori */}
                    {isEditing && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-black text-slate-500 uppercase tracking-wider">Ana Kategori</label>
                          <select
                            value={editForm.category}
                            onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                          >
                            <option value="">— Kategori seç —</option>
                            {dropdownCategories.map((cat) => (
                              <option key={cat.id} value={cat.name}>{cat.icon} {cat.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-black text-slate-500 uppercase tracking-wider">Alt Kategori / Etiket</label>
                          <input
                            value={editForm.sub_category}
                            onChange={(e) => setEditForm((f) => ({ ...f, sub_category: e.target.value }))}
                            placeholder="Alt kategori veya etiket..."
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                          />
                        </div>
                      </div>
                    )}

                    {/* Hata mesajı */}
                    {isEditing && editError && (
                      <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                        {editError}
                      </div>
                    )}

                    {/* Salt okunur meta etiketler */}
                    {!isEditing && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedArticle.source && (
                          <DemoBlur isProtected={isDemo}>
                            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500">
                              📄 {selectedArticle.source.replace(/\.(docx|pdf)$/i, "")}
                            </span>
                          </DemoBlur>
                        )}
                        {selectedArticle.source_section && selectedArticle.source_section !== selectedArticle.title && (
                          <DemoBlur isProtected={isDemo}>
                            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500">
                              § {selectedArticle.source_section}
                            </span>
                          </DemoBlur>
                        )}
                        {selectedArticle.tags.map((tag, i) => (
                          <span key={i} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700">#{tag}</span>
                        ))}
                        {selectedArticle.related_stones.length > 0 && (
                          <DemoBlur isProtected={isDemo}>
                            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                              💎 {selectedArticle.related_stones.join(", ")}
                            </span>
                          </DemoBlur>
                        )}
                        {selectedArticle.related_minerals.length > 0 && (
                          <DemoBlur isProtected={isDemo}>
                            <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              ⚗️ {selectedArticle.related_minerals.join(", ")}
                            </span>
                          </DemoBlur>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* İçerik */}
              <div ref={contentRef} className="flex-1 overflow-y-auto">
                {isEditing ? (
                  <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:px-12">
                    <div className="rounded-2xl border border-white bg-white px-8 py-6 shadow-sm sm:px-10 lg:px-14">
                      <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-500">İçerik</label>
                      <textarea
                        value={editForm.content}
                        onChange={(e) => setEditForm((f) => ({ ...f, content: e.target.value }))}
                        placeholder="Makale içeriği... (## Başlık ile bölümler oluşturabilirsin)"
                        rows={20}
                        className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium leading-relaxed outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                      />
                      <div className="mt-4 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setIsEditing(false); setEditError(""); }}
                          disabled={editSaving}
                          className="btn-soft"
                        >
                          Vazgeç
                        </button>
                        <button
                          type="button"
                          onClick={() => void updateArticle()}
                          disabled={editSaving}
                          className="btn-primary"
                        >
                          {editSaving ? "Kaydediliyor..." : "Kaydet"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:px-12">
                    <article className="rounded-2xl border border-white bg-white px-8 py-9 shadow-sm sm:px-10 lg:px-14">
                      <DemoGate
                        isProtected={isDemo}
                        message="Bu içerik demo sürümünde gizlenmiştir. Tam içeriğe erişmek için uzman hesabı gereklidir."
                        className="min-h-[200px]"
                      >
                        <div className="text-base lg:text-[17px]" style={{ color: "#374151" }}>
                          {renderContent(selectedArticle.content, isSearchActive ? searchTerms : [])}
                        </div>
                      </DemoGate>
                    </article>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Word raporu modal */}
      {showWordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/50">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-950">Bilgi Kütüphanesi Raporu</h2>
              <button
                type="button"
                onClick={() => setShowWordModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="mb-4 text-sm text-slate-500">Rapora dahil edilecek makaleleri seçin.</p>

            {/* Export mode radio options */}
            <div className="space-y-2">
              {([
                ["all",      "Tüm Makaleler",                `${articles.length} makale`],
                ["category", "Sadece Seçili Kategori",       null],
                ["filtered", "Sadece Filtrelenmiş Sonuçlar", `${filtered.length} makale`],
                ["viewed",   "Sadece Görüntülenen Kayıtlar", `${viewed.size} makale`],
              ] as const).map(([mode, label, count]) => (
                <label
                  key={mode}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                    wordExportMode === mode
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  } ${mode === "viewed" && viewed.size === 0 ? "opacity-50" : ""}`}
                >
                  <input
                    type="radio"
                    name="exportMode"
                    value={mode}
                    checked={wordExportMode === mode}
                    onChange={() => setWordExportMode(mode)}
                    disabled={mode === "viewed" && viewed.size === 0}
                    className="mt-0.5 h-4 w-4 accent-emerald-600"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-slate-800">{label}</span>
                    {count !== null && (
                      <span className="ml-2 text-xs font-medium text-slate-400">{count}</span>
                    )}
                    {mode === "viewed" && viewed.size === 0 && (
                      <p className="mt-0.5 text-xs text-slate-400">Arama oturumunda görüntülenen makale yok</p>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {/* Kategori dropdown */}
            {wordExportMode === "category" && (
              <div className="mt-3">
                <select
                  value={wordExportCategory}
                  onChange={(e) => setWordExportCategory(e.target.value)}
                  className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">— Kategori seç —</option>
                  {categories.filter((c) => c !== "Tümü").map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}

            {wordReportError && (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {wordReportError}
              </p>
            )}
            {wordReportSuccess && (
              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                ✓ {wordReportSuccess}
              </p>
            )}
            {wordReportLoading && (
              <p className="mt-4 text-center text-sm font-semibold text-indigo-700">
                Profesyonel Word raporu hazırlanıyor...
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowWordModal(false)}
                disabled={wordReportLoading}
                className="btn-soft flex-1"
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={() => void downloadKnowledgeReport()}
                disabled={wordReportLoading}
                className="btn-primary flex-1"
              >
                {wordReportLoading ? "Hazırlanıyor..." : "Rapor Oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toplu güncelleme modal */}
      {showBulkUpdateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm">
          <div className={`flex max-h-[90dvh] w-full flex-col rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200/50 ${selectedIds.size === 1 ? "max-w-xl" : "max-w-md"}`}>
            {/* Modal başlık */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {selectedIds.size === 1 ? "Kayıt Güncelle" : `Toplu Güncelleme (${selectedIds.size} kayıt)`}
                </h2>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  {selectedIds.size === 1
                    ? "Boş bırakılan kategori alanları değişmez."
                    : "Çoklu seçimde yalnızca kategori alanları güncellenir."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowBulkUpdateModal(false); setBulkUpdateError(""); setBulkUpdateTextEdit(false); }}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable içerik */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-3">
                {/* Kategori alanları — her zaman */}
                <div>
                  <label className="mb-1 block text-xs font-black text-slate-700">Kategori</label>
                  <select
                    value={bulkUpdateForm.category}
                    onChange={(e) => setBulkUpdateForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  >
                    <option value="">— Değiştirme —</option>
                    {dropdownCategories.map((cat) => (
                      <option key={cat.id} value={cat.name}>{cat.icon} {cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-black text-slate-700">Alt Kategori</label>
                  <input
                    value={bulkUpdateForm.sub_category}
                    onChange={(e) => setBulkUpdateForm((f) => ({ ...f, sub_category: e.target.value }))}
                    placeholder="Boş bırakılırsa değişmez"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>

                {/* Metin alanları — sadece tek kayıt */}
                {selectedIds.size === 1 && (
                  <>
                    <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                      <span className="flex-1 text-xs font-black text-slate-500 uppercase tracking-wider">Makale Metni</span>
                      <button
                        type="button"
                        onClick={() => setBulkUpdateTextEdit((v) => !v)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-black transition ${
                          bulkUpdateTextEdit
                            ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {bulkUpdateTextEdit ? "✏️ Metin Düzenleniyor" : "✏️ Metni Düzenle"}
                      </button>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-black text-slate-700">Başlık</label>
                      <input
                        value={bulkUpdateForm.title}
                        onChange={(e) => setBulkUpdateForm((f) => ({ ...f, title: e.target.value }))}
                        disabled={!bulkUpdateTextEdit}
                        placeholder="Boş bırakılırsa değişmez"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-black text-slate-700">İçerik</label>
                      <textarea
                        value={bulkUpdateForm.content}
                        onChange={(e) => setBulkUpdateForm((f) => ({ ...f, content: e.target.value }))}
                        disabled={!bulkUpdateTextEdit}
                        placeholder="Boş bırakılırsa değişmez"
                        rows={10}
                        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-relaxed outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                      />
                    </div>
                  </>
                )}

                {/* Çoklu seçim uyarısı */}
                {selectedIds.size > 1 && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                    Çoklu seçimde başlık ve içerik alanları güncellenmez. Yalnızca kategori alanları uygulanır.
                  </p>
                )}
              </div>

              {bulkUpdateError && (
                <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  {bulkUpdateError}
                </p>
              )}
            </div>

            {/* Footer butonları */}
            <div className="shrink-0 border-t border-slate-100 px-6 py-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowBulkUpdateModal(false); setBulkUpdateError(""); setBulkUpdateTextEdit(false); }}
                  disabled={bulkUpdateBusy}
                  className="btn-soft flex-1"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => void handleBulkUpdate()}
                  disabled={bulkUpdateBusy}
                  className="btn-primary flex-1"
                >
                  {bulkUpdateBusy ? "Güncelleniyor…" : "Güncelle"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DuplicateWarningModal
        open={!!dupModal}
        label={dupModal?.label ?? ""}
        busy={saving}
        onOpenExisting={() => {
          if (dupModal) {
            setShowForm(false);
            setDupModal(null);
            selectArticle(dupModal.id);
          }
        }}
        onCreateAnyway={() => {
          setDupModal(null);
          void saveArticle(true);
        }}
        onCancel={() => setDupModal(null)}
      />
    </main>
  );
}
