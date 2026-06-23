"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import Link from "next/link";
import {
  ArrowUpDown,
  CalendarCheck,
  ListFilter,
  Phone,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { readYasamUser, type YasamUser } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { DEMO_CLIENTS, type DemoListClient } from "@/lib/demo/demoClients";
import { DemoBlur } from "@/components/demo/DemoBlur";
import { initDemoSession, readDemoClients, type DemoClient } from "@/lib/demo/demoSession";

// ─── Types ────────────────────────────────────────────────────────────────────
type Client = {
  id: string;
  ad: string | null;
  soyad: string | null;
  telefon: string | null;
  dogum: string | null;
  gorusme: string | null;
  burc: string | null;
  kan: string | null;
  mizac: string | null;
  created_at: string;
};

type HomeworkAlert = {
  client_id: string;
  end_date: string | null;
  status: string | null;
  alert_dismissed_at?: string | null;
};

type SortKey =
  | "newest"
  | "oldest"
  | "name-az"
  | "name-za"
  | "gorusme-new"
  | "gorusme-old";

type AktifDurum = "aktif" | "takip" | "pasif" | "notr";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function todayForInput() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTR(date: string | null) {
  if (!date) return "";
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function goreleSure(date: string | null): string {
  if (!date) return "";
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (diff < 1)   return "bugün";
  if (diff < 7)   return `${diff} gün önce`;
  if (diff < 30)  return `${Math.floor(diff / 7)} hafta önce`;
  if (diff < 365) return `${Math.floor(diff / 30)} ay önce`;
  return `${Math.floor(diff / 365)} yıl önce`;
}

function calcAktifDurum(gorusme: string | null): AktifDurum {
  if (!gorusme) return "notr";
  const diff = Math.floor((Date.now() - new Date(gorusme).getTime()) / 86400000);
  if (diff <= 30)  return "aktif";
  if (diff <= 90)  return "takip";
  return "pasif";
}

const DURUM_META: Record<AktifDurum, { label: string; cls: string }> = {
  aktif: { label: "Aktif", cls: "bg-emerald-100 text-emerald-700" },
  takip: { label: "Takip", cls: "bg-amber-100 text-amber-700" },
  pasif: { label: "Pasif", cls: "bg-red-100 text-red-600" },
  notr:  { label: "",      cls: "" },
};

function clientInitials(ad: string | null, soyad: string | null): string {
  const a = (ad?.trim() ?? "").toLocaleUpperCase("tr-TR");
  const s = (soyad?.trim() ?? "").toLocaleUpperCase("tr-TR");
  return `${a[0] ?? ""}${s[0] ?? ""}` || "?";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-[13px] font-black tracking-wide text-slate-800">{label}</span>
      {children}
    </label>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DanisanListePage() {
  const router = useRouter();
  useBfcacheRefresh();
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();

  const [sessionUser, setSessionUser] = useState<YasamUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [homeworkAlerts, setHomeworkAlerts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [filterBurc, setFilterBurc] = useState("");
  const [filterKan, setFilterKan] = useState("");
  const [filterMizac, setFilterMizac] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("newest");

  // Toplu seçim ve Word export
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(() => new Set());
  const [wordBusy, setWordBusy] = useState(false);

  const tenantId = sessionUser?.tenant_id?.trim() || null;
  const tenantMissing = sessionChecked && (!sessionUser || !tenantId);
  const isDemo = sessionUser?.is_demo_account === true;

  const totalExpiredHomework = useMemo(
    () => Object.values(homeworkAlerts).reduce((sum, count) => sum + count, 0),
    [homeworkAlerts],
  );

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = clients.filter((c) => {
      const fullName = `${c.ad || ""} ${c.soyad || ""}`.toLowerCase();
      const phone = (c.telefon || "").toLowerCase();
      const searchOk = !q || fullName.includes(q) || phone.includes(q);
      const burcOk = !filterBurc || c.burc === filterBurc;
      const kanOk = !filterKan || c.kan === filterKan;
      const mizacOk = !filterMizac || c.mizac === filterMizac;
      return searchOk && burcOk && kanOk && mizacOk;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name-az":
          return `${a.ad ?? ""} ${a.soyad ?? ""}`.localeCompare(`${b.ad ?? ""} ${b.soyad ?? ""}`, "tr-TR");
        case "name-za":
          return `${b.ad ?? ""} ${b.soyad ?? ""}`.localeCompare(`${a.ad ?? ""} ${a.soyad ?? ""}`, "tr-TR");
        case "oldest":
          return a.created_at.localeCompare(b.created_at);
        case "gorusme-new":
          return (b.gorusme ?? "").localeCompare(a.gorusme ?? "");
        case "gorusme-old":
          return (a.gorusme ?? "").localeCompare(b.gorusme ?? "");
        default: // "newest"
          return b.created_at.localeCompare(a.created_at);
      }
    });
  }, [clients, search, filterBurc, filterKan, filterMizac, sortBy]);

  const hasActiveFilter = Boolean(search.trim() || filterBurc || filterKan || filterMizac);

  const toggleClientSelection = useCallback((id: string) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedClientIds(new Set(filteredClients.map((c) => c.id)));
  }, [filteredClients]);

  const clearClientSelection = useCallback(() => {
    setSelectedClientIds(new Set());
  }, []);

  useEffect(() => {
    setSessionUser(readYasamUser());
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked) return;
    // Demo hesap: gerçek DB sorgusu yerine session + fixture veri kullan
    if (isDemo) {
      initDemoSession();
      const sessionClients = readDemoClients() as DemoClient[] as Client[];
      const fixtureClients = DEMO_CLIENTS as DemoListClient[] as Client[];
      // Session clients en üstte (daha yeni created_at)
      setClients([...sessionClients, ...fixtureClients]);
      setHomeworkAlerts({});
      setLoading(false);
      return;
    }
    if (!tenantId) {
      setLoading(false);
      setClients([]);
      setHomeworkAlerts({});
      showToast({
        title: "Oturum uyarısı",
        message: !sessionUser
          ? "Oturum bulunamadı. Lütfen tekrar giriş yapın."
          : "Hesabınızda çalışma alanı (tenant) bilgisi yok.",
        type: "warning",
      });
      return;
    }
    loadClients();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, tenantId, isDemo]);

  async function loadHomeworkAlerts(activeTenantId: string) {
    const today = todayForInput();
    const { data, error } = await supabase
      .from("client_homeworks")
      .select("client_id,end_date,status,alert_dismissed_at")
      .eq("tenant_id", activeTenantId)
      .eq("status", "devam")
      .is("alert_dismissed_at", null)
      .not("end_date", "is", null)
      .lte("end_date", today);

    if (error) { console.error("Ödev uyarıları yüklenemedi:", error); setHomeworkAlerts({}); return; }

    const grouped: Record<string, number> = {};
    ((data || []) as HomeworkAlert[]).forEach((item) => {
      if (!item.client_id) return;
      grouped[item.client_id] = (grouped[item.client_id] || 0) + 1;
    });
    setHomeworkAlerts(grouped);
  }

  async function loadClients() {
    const user = readYasamUser();
    const activeTenantId = user?.tenant_id?.trim();
    if (!user || !activeTenantId) { setLoading(false); return; }

    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("tenant_id", activeTenantId)
      .order("created_at", { ascending: false });

    if (error) {
      showToast({ title: "İşlem başarısız", message: "Listeleme hatası: " + error.message, type: "error" });
      setLoading(false);
      return;
    }

    setClients(data || []);
    await loadHomeworkAlerts(activeTenantId);
    setLoading(false);
  }

  async function handleBulkDeleteClients() {
    const ids = Array.from(selectedClientIds);
    if (ids.length === 0) return;
    if (!tenantId) {
      showToast({ title: "Hata", message: "Oturum bilgisi bulunamadı.", type: "error" });
      return;
    }

    const confirmed = await deleteConfirm({
      title: "Seçili danışanları sil",
      message: `${ids.length} danışanı ve tüm ilişkili verilerini silmek istediğinizden emin misiniz?`,
      secondMessage: "Bu işlem GERİ ALINAMAZ. Danışana ait görüşmeler, ödevler ve analizler de silinecek.",
    });
    if (!confirmed) return;

    setDeleteLoading(true);

    const { data: deletedRows, error: deleteError } = await supabase
      .from("clients")
      .delete()
      .eq("tenant_id", tenantId)
      .in("id", ids)
      .select("id");

    setDeleteLoading(false);

    if (deleteError) {
      showToast({ title: "Hata", message: `Danışanlar silinemedi: ${deleteError.message}`, type: "error" });
      return;
    }

    const deletedCount = deletedRows?.length ?? 0;
    if (deletedCount === 0) {
      showToast({ title: "Hata", message: "Silme işlemi gerçekleşmedi. Lütfen tekrar deneyin.", type: "error" });
      return;
    }

    const deletedIdSet = new Set(deletedRows.map((r) => r.id as string));
    setClients((prev) => prev.filter((c) => !deletedIdSet.has(c.id)));
    setSelectedClientIds(new Set());
    showToast({ title: "Başarılı", message: `${deletedCount} danışan başarıyla silindi.`, type: "success" });
  }

  async function exportClientsWord(mode: "selected" | "all" | "filtered") {
    if (!tenantId) return;
    setWordBusy(true);
    try {
      let clientIds: string[] | undefined;
      if (mode === "selected") {
        clientIds = [...selectedClientIds];
        if (!clientIds.length) { showToast({ title: "Uyarı", message: "Önce danışan seçin.", type: "warning" }); return; }
      } else if (mode === "filtered") {
        clientIds = filteredClients.map((c) => c.id);
        if (!clientIds.length) { showToast({ title: "Uyarı", message: "Filtrelenmiş sonuç yok.", type: "warning" }); return; }
      }

      const userId = readYasamUser()?.id;
      const res = await fetch("/api/clients/word-report-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, userId, exportMode: mode, clientIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Rapor oluşturulamadı");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const modeSlug = mode === "selected" ? "secili" : mode === "filtered" ? "filtreli" : "tumu";
      a.download = `danisan-listesi-${modeSlug}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({ title: "Başarılı", message: "Danışan raporu indirildi.", type: "success" });
    } catch (err) {
      showToast({ title: "Hata", message: err instanceof Error ? err.message : "Bilinmeyen hata", type: "error" });
    } finally {
      setWordBusy(false);
    }
  }

  const inputCls =
    "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] font-semibold text-slate-900 shadow-inner outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

  return (
    <main className="relative w-full overflow-x-hidden bg-[radial-gradient(circle_at_10%_10%,rgba(99,102,241,0.12),transparent_30%),radial-gradient(circle_at_90%_15%,rgba(236,72,153,0.10),transparent_30%),linear-gradient(135deg,#eef5ff_0%,#f7f2ff_48%,#fff4fb_100%)] px-4 py-5 text-slate-900 antialiased sm:px-6 lg:px-8 xl:px-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 -top-24 h-[500px] w-[500px] rounded-full bg-blue-400/14 blur-[160px]" />
        <div className="absolute -right-20 top-0 h-[440px] w-[440px] rounded-full bg-violet-400/10 blur-[160px]" />
        <div className="absolute bottom-0 left-1/3 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-indigo-300/10 blur-[140px]" />
      </div>

      <div className="relative z-10 w-full">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/80 bg-white/85 px-6 py-5 shadow-lg sm:px-8">
            <UsersRound
              className="pointer-events-none absolute right-6 top-1/2 h-24 w-24 -translate-y-1/2 text-blue-400 opacity-10"
              strokeWidth={1.25}
              aria-hidden
            />
            <div className="relative z-10">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-700/85">Danışan Yolculuğu</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Danışan Listesi</h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-snug text-slate-600">
                Kayıtlı danışanları arayın, filtreleyin ve detaylarına erişin.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 sm:flex-nowrap sm:items-start">
            <div className="min-w-[110px] rounded-2xl border border-white/80 bg-white/85 px-5 py-4 text-center shadow-md backdrop-blur-sm">
              <strong className="block text-3xl font-black text-slate-950">{clients.length}</strong>
              <span className="mt-0.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Danışan</span>
            </div>
            <div className={`min-w-[110px] rounded-2xl border px-5 py-4 text-center shadow-md backdrop-blur-sm ${
              totalExpiredHomework > 0 ? "border-red-200/80 bg-red-50/90" : "border-blue-200/80 bg-blue-50/90"
            }`}>
              <strong className={`block text-3xl font-black ${totalExpiredHomework > 0 ? "text-red-600" : "text-blue-600"}`}>
                {totalExpiredHomework}
              </strong>
              <span className="mt-0.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Aktif Uyarı</span>
            </div>
            <Link
              href="/danisan-yolculugu/kayit"
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 text-sm font-black text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <UserPlus className="h-4 w-4" />
              {isDemo ? "Demo Kayıt" : "Yeni Kayıt"}
            </Link>
          </div>
        </header>

        {isDemo && (
          <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/95 px-5 py-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-lg leading-none">🔎</span>
              <div>
                <p className="text-sm font-black text-blue-900">Demo Modu — Örnek Veri</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-blue-800">
                  Gerçek verilere benzer hazırlanmış 20 örnek danışan profiliyle platformu keşfediyorsunuz.
                  Telefon bilgileri gizlenmiştir. Yalnızca{" "}
                  <span className="font-black">Eylül Karaca</span> profilinin tam içeriğine erişebilirsiniz.
                </p>
              </div>
            </div>
          </div>
        )}

        {tenantMissing && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/95 px-5 py-4 text-sm font-bold text-amber-950 shadow-sm">
            {!sessionUser
              ? "Oturum bulunamadı. Danışan listesi için lütfen tekrar giriş yapın."
              : "Çalışma alanı (tenant) bilgisi bulunamadı. Danışan verileri yüklenemez."}
          </div>
        )}

        {/* Filter Panel */}
        <section className="mb-5 rounded-2xl border border-white/80 bg-white/80 p-6 shadow-lg backdrop-blur-sm sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 shadow-sm">
              <ListFilter className="h-4 w-4 text-blue-700" />
            </div>
            <div>
              <p className="text-base font-black text-slate-900">Arama &amp; Filtreleme</p>
              <p className="text-xs text-slate-500">Ad, soyad, telefon, burç, kan grubu ve mizaca göre filtrele.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Ara">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ad, soyad veya telefon..."
                className={inputCls}
              />
            </Field>
            <Field label="Burç">
              <select value={filterBurc} onChange={(e) => setFilterBurc(e.target.value)} className={inputCls}>
                <option value="">Tümü</option>
                {["Koç","Boğa","İkizler","Yengeç","Aslan","Başak","Terazi","Akrep","Yay","Oğlak","Kova","Balık"].map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="Kan Grubu">
              <select value={filterKan} onChange={(e) => setFilterKan(e.target.value)} className={inputCls}>
                <option value="">Tümü</option>
                <option>A Rh+</option><option>A Rh-</option>
                <option>B Rh+</option><option>B Rh-</option>
                <option>AB Rh+</option><option>AB Rh-</option>
                <option>0 Rh+</option><option>0 Rh-</option>
              </select>
            </Field>
            <Field label="Mizaç">
              <select value={filterMizac} onChange={(e) => setFilterMizac(e.target.value)} className={inputCls}>
                <option value="">Tümü</option>
                <option value="safra">Safra</option>
                <option value="sovdavi">Sovdavi</option>
                <option value="dem">Dem</option>
                <option value="balgam">Balgam</option>
              </select>
            </Field>
          </div>
        </section>

        {/* Client List */}
        <section className="rounded-2xl border border-white/80 bg-white/80 p-6 shadow-lg backdrop-blur-sm sm:p-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-black text-slate-950">
              Kayıtlı Danışanlar
              {!loading && (
                <span className="ml-2 text-base font-bold text-slate-400">({filteredClients.length})</span>
              )}
            </h2>

            {/* Sort selector */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 shadow-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="newest">En Yeni Kayıt</option>
                <option value="oldest">En Eski Kayıt</option>
                <option value="name-az">Ad A → Z</option>
                <option value="name-za">Ad Z → A</option>
                <option value="gorusme-new">Görüşme (Yeni)</option>
                <option value="gorusme-old">Görüşme (Eski)</option>
              </select>
            </div>
          </div>

          {/* Toplu işlem / Word export çubuğu */}
          {!isDemo && !loading && filteredClients.length > 0 && (
            <div className="mb-5">
              <BulkExportBar
                selectedCount={selectedClientIds.size}
                totalCount={clients.length}
                filteredCount={filteredClients.length}
                hasActiveFilter={hasActiveFilter}
                onSelectAll={selectAllFiltered}
                onClearSelection={clearClientSelection}
                onExportSelected={() => void exportClientsWord("selected")}
                onExportAll={() => void exportClientsWord("all")}
                onExportFiltered={hasActiveFilter ? () => void exportClientsWord("filtered") : undefined}
                isExporting={wordBusy}
                onDeleteSelected={() => void handleBulkDeleteClients()}
                isDeleting={deleteLoading}
              />
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm font-bold text-slate-500">Yükleniyor...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
              <UsersRound className="mx-auto mb-3 h-10 w-10 text-slate-300" strokeWidth={1.5} />
              <p className="text-base font-bold text-slate-500">
                {clients.length === 0 ? "Henüz danışan kaydı yok." : "Kriterlere uygun danışan bulunamadı."}
              </p>
              {clients.length === 0 && (
                <Link
                  href="/danisan-yolculugu/kayit"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-black text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <UserPlus className="h-4 w-4" />
                  İlk danışanı ekle
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredClients.map((client) => {
                const expiredCount   = homeworkAlerts[client.id] || 0;
                const hasExpiredHw   = expiredCount > 0;
                const isSelected     = selectedClientIds.has(client.id);
                const durum          = DURUM_META[calcAktifDurum(client.gorusme)];
                const initText       = clientInitials(client.ad, client.soyad);
                const gorceleSureStr = goreleSure(client.gorusme);

                return (
                  <div
                    key={client.id}
                    className={`group relative cursor-pointer rounded-2xl border p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
                      isSelected ? "ring-2 ring-blue-400 ring-offset-1" : ""
                    }`}
                    style={{
                      borderColor: isSelected ? "#60a5fa" : hasExpiredHw ? "#fecaca" : "#e2e8f0",
                      background: isSelected
                        ? "linear-gradient(135deg,#eff6ff,#eef2ff)"
                        : hasExpiredHw
                          ? "linear-gradient(135deg,#fff7ed,#fff1f2)"
                          : "white",
                    }}
                    onClick={() => router.push(isDemo ? `/demo/danisan/${client.id}` : `/dashboard/clients/${client.id}`)}
                    title="Danışan detayını aç"
                  >
                    {/* Checkbox — demo'da gizli */}
                    {!isDemo && (
                      <label
                        className="absolute right-3 top-3 z-10 flex h-6 w-6 cursor-pointer items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleClientSelection(client.id)}
                          className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                        />
                      </label>
                    )}

                    {/* Avatar + İsim + Durum */}
                    <div className="mb-3 flex items-start gap-3 pr-7">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-[13px] font-black text-white shadow-sm">
                        {initText}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start gap-1.5">
                          <span className="truncate text-[15px] font-black leading-tight text-slate-900">
                            {client.ad} {client.soyad}
                          </span>
                          {hasExpiredHw && (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                              ⚠ {expiredCount} ödev
                            </span>
                          )}
                        </div>
                        {durum.label && (
                          <span className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black ${durum.cls}`}>
                            {durum.label}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Veri satırları */}
                    <div className="space-y-1.5 text-[12px] text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 flex-shrink-0 text-slate-400" />
                        <DemoBlur isProtected={isDemo} intensity={4} className="min-w-0 flex-1">
                          <span className="block truncate">{client.telefon || "Telefon yok"}</span>
                        </DemoBlur>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CalendarCheck className="h-3 w-3 flex-shrink-0 text-slate-400" />
                        <span className="truncate">
                          {client.gorusme
                            ? `${formatDateTR(client.gorusme)}${gorceleSureStr ? ` · ${gorceleSureStr}` : ""}`
                            : "Görüşme tarihi yok"}
                        </span>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-3 flex justify-end">
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-[11px] font-bold text-sky-700 transition-all group-hover:bg-sky-200">
                        Detay →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
