"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ListFilter, UserPlus, UsersRound } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser, type YasamUser } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

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
};

type HomeworkAlert = {
  client_id: string;
  end_date: string | null;
  status: string | null;
  alert_dismissed_at?: string | null;
};

function todayForInput() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTR(date: string | null) {
  if (!date) return "";
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-[13px] font-black tracking-wide text-slate-800">{label}</span>
      {children}
    </label>
  );
}

export default function DanisanListePage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [sessionUser, setSessionUser] = useState<YasamUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [homeworkAlerts, setHomeworkAlerts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterBurc, setFilterBurc] = useState("");
  const [filterKan, setFilterKan] = useState("");
  const [filterMizac, setFilterMizac] = useState("");

  const tenantId = sessionUser?.tenant_id?.trim() || null;
  const tenantMissing = sessionChecked && (!sessionUser || !tenantId);

  const totalExpiredHomework = useMemo(
    () => Object.values(homeworkAlerts).reduce((sum, count) => sum + count, 0),
    [homeworkAlerts],
  );

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      const fullName = `${c.ad || ""} ${c.soyad || ""}`.toLowerCase();
      const phone = (c.telefon || "").toLowerCase();
      const searchOk = !q || fullName.includes(q) || phone.includes(q);
      const burcOk = !filterBurc || c.burc === filterBurc;
      const kanOk = !filterKan || c.kan === filterKan;
      const mizacOk = !filterMizac || c.mizac === filterMizac;
      return searchOk && burcOk && kanOk && mizacOk;
    });
  }, [clients, search, filterBurc, filterKan, filterMizac]);

  useEffect(() => {
    setSessionUser(readYasamUser());
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked) return;
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
  }, [sessionChecked, tenantId]);

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
        {/* Back nav */}
        <nav className="mb-5 flex items-center gap-2">
          <Link
            href="/danisan-yolculugu"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/80 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Danışan Yolculuğu
          </Link>
          <span className="text-xs text-slate-400">/</span>
          <span className="text-xs font-bold text-slate-600">Danışan Listesi</span>
        </nav>

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
              Yeni Kayıt
            </Link>
          </div>
        </header>

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
          <h2 className="mb-5 text-xl font-black text-slate-950">
            Kayıtlı Danışanlar
            {!loading && (
              <span className="ml-2 text-base font-bold text-slate-400">({filteredClients.length})</span>
            )}
          </h2>

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
                const expiredCount = homeworkAlerts[client.id] || 0;
                const hasExpiredHomework = expiredCount > 0;

                return (
                  <div
                    key={client.id}
                    onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                    title="Danışan detayını aç"
                    className="group cursor-pointer rounded-2xl border p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                    style={{
                      borderColor: hasExpiredHomework ? "#fecaca" : "#e2e8f0",
                      background: hasExpiredHomework
                        ? "linear-gradient(135deg,#fff7ed,#fff1f2)"
                        : "white",
                    }}
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <span className="text-lg font-black leading-tight text-slate-900">
                        {client.ad} {client.soyad}
                      </span>
                      {hasExpiredHomework && (
                        <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                          ⚠️ {expiredCount} ödev
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 text-[13px] text-slate-500">
                      <p>📞 {client.telefon || "Telefon yok"}</p>
                      <p>🎂 {formatDateTR(client.dogum) || "Doğum tarihi yok"}</p>
                      <p>🗓️ {formatDateTR(client.gorusme) || "Görüşme tarihi yok"}</p>
                      <p>♈ {client.burc || "Burç yok"}</p>
                      <p>🩸 {client.kan || "Kan grubu yok"}</p>
                      <p>🌿 {client.mizac || "Mizaç yok"}</p>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <span className="rounded-full bg-sky-100 px-3.5 py-1.5 text-xs font-bold text-sky-700 transition-all group-hover:bg-sky-200">
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
