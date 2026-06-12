"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ADMIN_LIBRARY_TENANT_ID, getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";
import { normalizeTr } from "@/lib/dogaltas/stoneSearchUtils";

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
  // Kategori state
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  const [showCatForm, setShowCatForm] = useState(false);
  const [catForm, setCatForm] = useState<NewCategoryForm>(EMPTY_CAT_FORM);
  const [savingCat, setSavingCat] = useState(false);
  const [catError, setCatError] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

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

  // localStorage'dan görüntülenenleri yükle
  useEffect(() => {
    try {
      const raw = localStorage.getItem("stone-library-viewed");
      if (raw) setViewed(new Set(JSON.parse(raw) as string[]));
    } catch {}
  }, []);

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
    // Paylaşımlı kütüphane (ADMIN_LIBRARY_TENANT_ID) + kullanıcının kendi ekleri
    const tenantIds: string[] = [ADMIN_LIBRARY_TENANT_ID];
    if (tenantId && tenantId !== ADMIN_LIBRARY_TENANT_ID) {
      tenantIds.push(tenantId);
    }

    const { data, error } = await supabase
      .from("stone_knowledge_articles")
      .select("id, tenant_id, title, content, category, sub_category, tags, related_stones, related_minerals, source, source_section, keyword, notes, is_active")
      .in("tenant_id", tenantIds)
      .eq("is_active", true)
      .order("title", { ascending: true });

    if (!error && data) {
      const sorted = [...(data as Article[])].sort((a, b) => trSort(a.title, b.title));
      setArticles(sorted);
    }
    setLoading(false);
  }

  async function loadCategories() {
    const { data } = await supabase
      .from("stone_knowledge_categories")
      .select("id, name, slug, icon, color, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (data) setCategoryList(data as Category[]);
  }

  async function saveCategory() {
    const name = catForm.name.trim();
    if (!name) { setCatError("Kategori adı zorunludur."); return; }
    setSavingCat(true);
    setCatError("");
    const slug = normalizeTr(name)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "kategori";
    const maxOrder = Math.max(0, ...categoryList.map((c) => c.sort_order));
    const { error } = await supabase.from("stone_knowledge_categories").insert({
      name,
      slug,
      icon:       catForm.icon.trim() || "📖",
      color:      catForm.color || "slate",
      sort_order: maxOrder + 1,
    });
    setSavingCat(false);
    if (error) {
      setCatError(error.message.includes("unique") ? "Bu isimde kategori zaten var." : "Hata: " + error.message);
      return;
    }
    setCatForm(EMPTY_CAT_FORM);
    setShowCatForm(false);
    await loadCategories();
  }

  // ─── Türetilmiş veriler ─────────────────────────────────────────────────────

  const searchTerms = useMemo(() => getSearchTerms(search), [search]);

  // Kategori listesi: Supabase tablosundan (sıralı), makale yoksa gizleme
  const categories = useMemo(() => {
    const fromDb = categoryList.map((c) => c.name);
    // Tabloda olmayan ama makalelerde geçen kategoriler de ekle (tutarlılık)
    const extra = [...new Set(articles.map((r) => r.category).filter(Boolean))]
      .filter((n) => !fromDb.includes(n))
      .sort(trSort);
    return ["Tümü", ...fromDb, ...extra];
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
    setViewed((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem("stone-library-viewed", JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  // ─── Yeni kayıt kaydetme ────────────────────────────────────────────────────

  async function saveArticle() {
    if (!form.title.trim()) {
      setSaveError("Başlık zorunludur.");
      return;
    }
    if (!form.content.trim()) {
      setSaveError("İçerik zorunludur.");
      return;
    }
    if (!tenantId) {
      setSaveError("Oturum bulunamadı. Lütfen sayfayı yenileyin.");
      return;
    }
    setSaving(true);
    setSaveError("");
    const { error } = await supabase.from("stone_knowledge_articles").insert({
      tenant_id:      tenantId,
      title:          form.title.trim(),
      content:        form.content.trim(),
      category:       form.category.trim(),
      sub_category:   form.sub_category.trim(),
      source:         form.source.trim(),
      is_active:      true,
    });
    setSaving(false);
    if (error) {
      setSaveError("Kayıt hatası: " + error.message);
      return;
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
    await loadArticles();
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-950">

      {/* Header */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6">
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
                : `${articles.length} makale${viewed.size > 0 ? ` · ${viewed.size} incelendi` : ""} · Mineroloji, Şifa, Araştırma, Uygulamalar`}
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

            {/* Yeni kayıt butonu */}
            <button
              type="button"
              onClick={() => { setShowForm((v) => !v); setSaveError(""); }}
              className={`rounded-xl px-4 py-2 text-sm font-black shadow-sm transition hover:brightness-105 ${
                showForm
                  ? "border border-slate-200 bg-white text-slate-700"
                  : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md"
              }`}
            >
              {showForm ? "Formu Kapat" : "+ Yeni Kayıt"}
            </button>
          </div>
        </div>

        {/* Yeni kayıt formu */}
        {showForm && (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <h3 className="mb-3 text-sm font-black text-slate-900">Yeni Makale Ekle</h3>
            {saveError && (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                {saveError}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className="mb-1 block text-xs font-black text-slate-700">Başlık *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Makale başlığı..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-black text-slate-700">Kategori</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="">Seç...</option>
                  {categoryList.map((cat) => (
                    <option key={cat.id} value={cat.name}>{cat.icon} {cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-black text-slate-700">Kaynak</label>
                <input
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                  placeholder="Kaynak adı..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
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
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 hover:bg-slate-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={saveArticle}
                disabled={saving}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-sm font-black text-white shadow-md disabled:opacity-60 hover:brightness-105"
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
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
              {searchTerms.length > 0 ? (
                <><span className="font-black text-emerald-700">{filtered.length} sonuç</span>
                  <span className="text-slate-400">—</span>
                  <span className="text-slate-500">"{search}" araması</span></>
              ) : (
                <span className="text-slate-400">{filtered.length} kayıt</span>
              )}
            </div>
          </div>

          {/* Kategori filtreleri + Yeni Kategori */}
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

              {/* + Yeni Kategori */}
              <button type="button"
                onClick={() => { setShowCatForm((v) => !v); setCatError(""); }}
                className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-400 transition hover:border-emerald-400 hover:text-emerald-600">
                {showCatForm ? "✕" : "+ Kategori"}
              </button>
            </div>

            {/* Yeni Kategori formu */}
            {showCatForm && (
              <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <p className="mb-2 text-[11px] font-black text-slate-700">Yeni Kategori</p>
                {catError && (
                  <p className="mb-2 text-[11px] font-bold text-rose-600">{catError}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={catForm.name}
                    onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Kategori adı *"
                    className="col-span-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium outline-none focus:border-emerald-400"
                  />
                  <input
                    value={catForm.icon}
                    onChange={(e) => setCatForm((f) => ({ ...f, icon: e.target.value }))}
                    placeholder="İkon (ör: 🔥)"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium outline-none focus:border-emerald-400"
                  />
                  <select
                    value={catForm.color}
                    onChange={(e) => setCatForm((f) => ({ ...f, color: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-emerald-400"
                  >
                    {COLOR_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 flex justify-end gap-1.5">
                  <button type="button"
                    onClick={() => { setShowCatForm(false); setCatForm(EMPTY_CAT_FORM); setCatError(""); }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-50">
                    Vazgeç
                  </button>
                  <button type="button" onClick={saveCategory} disabled={savingCat}
                    className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1 text-[11px] font-black text-white disabled:opacity-60">
                    {savingCat ? "..." : "Kaydet"}
                  </button>
                </div>
              </div>
            )}
          </div>

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
                  const isSelected = rec.id === selectedId;
                  const cfg = katConfig(rec.category);
                  const matchCount = matchCounts.get(rec.id) ?? 0;
                  return (
                    <button key={rec.id} type="button" onClick={() => selectArticle(rec.id)}
                      className={`mx-2 mb-0.5 flex w-[calc(100%-16px)] items-start gap-3 rounded-xl px-3 py-3 text-left transition-all
                        ${isSelected ? "shadow-md" : "hover:bg-slate-50"}`}
                      style={isSelected ? { background: cfg.color } : undefined}>
                      <span className="mt-0.5 shrink-0 text-base leading-none">{cfg.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-bold leading-snug ${isSelected ? "text-white" : "text-slate-900"}`}>
                          {rec.title}
                        </div>
                        <div className={`mt-0.5 flex items-center gap-2 text-[11px] font-semibold ${isSelected ? "text-white/70" : "text-slate-400"}`}>
                          <span>{rec.category}</span>
                          {rec.source && <><span>·</span><span>{rec.source.replace(/\.(docx|pdf)$/i, "")}</span></>}
                        </div>
                        {viewed.has(rec.id) && (
                          <div className={`mt-0.5 text-[11px] font-semibold ${isSelected ? "text-white/55" : "text-rose-400/80"}`}>
                            ✓ Bakıldı
                          </div>
                        )}
                      </div>
                      {matchCount > 0 && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${isSelected ? "bg-white/25 text-white" : "bg-yellow-100 text-yellow-800"}`}>
                          {matchCount}
                        </span>
                      )}
                    </button>
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
                    className="mt-0.5 shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 md:hidden">
                    ← Geri
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {(() => {
                        const cfg = katConfig(selectedArticle.category);
                        return (
                          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-black"
                            style={{ borderColor: cfg.border, background: cfg.bg, color: cfg.color }}>
                            {cfg.icon} {selectedArticle.category}
                          </span>
                        );
                      })()}
                      {searchTerms.length > 0 && (
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
                    <h2 className="text-xl font-black leading-snug text-slate-950 sm:text-2xl">
                      {selectedArticle.title}
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedArticle.source && (
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500">
                          📄 {selectedArticle.source.replace(/\.(docx|pdf)$/i, "")}
                        </span>
                      )}
                      {selectedArticle.source_section && selectedArticle.source_section !== selectedArticle.title && (
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500">
                          § {selectedArticle.source_section}
                        </span>
                      )}
                      {selectedArticle.tags.map((tag, i) => (
                        <span key={i} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700">#{tag}</span>
                      ))}
                      {selectedArticle.related_stones.length > 0 && (
                        <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          💎 {selectedArticle.related_stones.join(", ")}
                        </span>
                      )}
                      {selectedArticle.related_minerals.length > 0 && (
                        <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          ⚗️ {selectedArticle.related_minerals.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* İçerik */}
              <div ref={contentRef} className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:px-12">
                  <article className="rounded-2xl border border-white bg-white px-8 py-9 shadow-sm sm:px-10 lg:px-14">
                    <div className="text-base lg:text-[17px]" style={{ color: "#374151" }}>
                      {renderContent(selectedArticle.content, searchTerms)}
                    </div>
                  </article>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
