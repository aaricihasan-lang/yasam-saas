"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
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

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

function todayForInput() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTR(date: string | null) {
  if (!date) return "";
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function burcHesapla(date: string) {
  if (!date) return "";

  const parts = date.split("-");
  if (parts.length !== 3) return "";

  const ay = Number(parts[1]);
  const gun = Number(parts[2]);

  if ((ay === 3 && gun >= 21) || (ay === 4 && gun <= 19)) return "Koç";
  if ((ay === 4 && gun >= 20) || (ay === 5 && gun <= 20)) return "Boğa";
  if ((ay === 5 && gun >= 21) || (ay === 6 && gun <= 20)) return "İkizler";
  if ((ay === 6 && gun >= 21) || (ay === 7 && gun <= 22)) return "Yengeç";
  if ((ay === 7 && gun >= 23) || (ay === 8 && gun <= 22)) return "Aslan";
  if ((ay === 8 && gun >= 23) || (ay === 9 && gun <= 22)) return "Başak";
  if ((ay === 9 && gun >= 23) || (ay === 10 && gun <= 22)) return "Terazi";
  if ((ay === 10 && gun >= 23) || (ay === 11 && gun <= 21)) return "Akrep";
  if ((ay === 11 && gun >= 22) || (ay === 12 && gun <= 21)) return "Yay";
  if ((ay === 12 && gun >= 22) || (ay === 1 && gun <= 19)) return "Oğlak";
  if ((ay === 1 && gun >= 20) || (ay === 2 && gun <= 18)) return "Kova";
  return "Balık";
}

export default function ClientsPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [clients, setClients] = useState<Client[]>([]);
  const [homeworkAlerts, setHomeworkAlerts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState<"new" | "list">("new");

  const [search, setSearch] = useState("");
  const [filterBurc, setFilterBurc] = useState("");
  const [filterKan, setFilterKan] = useState("");
  const [filterMizac, setFilterMizac] = useState("");

  const [ad, setAd] = useState("");
  const [soyad, setSoyad] = useState("");
  const [telefon, setTelefon] = useState("");
  const [dogum, setDogum] = useState("");
  const [gorusme, setGorusme] = useState(todayForInput());
  const [kan, setKan] = useState("");
  const [mizac, setMizac] = useState("");

  const burc = burcHesapla(dogum);

  const totalExpiredHomework = useMemo(() => {
    return Object.values(homeworkAlerts).reduce((sum, count) => sum + count, 0);
  }, [homeworkAlerts]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();

    return clients.filter((client) => {
      const fullName = `${client.ad || ""} ${client.soyad || ""}`.toLowerCase();
      const phone = (client.telefon || "").toLowerCase();

      const searchOk = !q || fullName.includes(q) || phone.includes(q);
      const burcOk = !filterBurc || client.burc === filterBurc;
      const kanOk = !filterKan || client.kan === filterKan;
      const mizacOk = !filterMizac || client.mizac === filterMizac;

      return searchOk && burcOk && kanOk && mizacOk;
    });
  }, [clients, search, filterBurc, filterKan, filterMizac]);

  useEffect(() => {
    loadClients();
  }, []);

  async function loadHomeworkAlerts() {
    const today = todayForInput();

    const { data, error } = await supabase
      .from("client_homeworks")
      .select("client_id,end_date,status,alert_dismissed_at")
      .eq("tenant_id", TENANT_ID)
      .eq("status", "devam")
      .is("alert_dismissed_at", null)
      .not("end_date", "is", null)
      .lte("end_date", today);

    if (error) {
      console.error("Ödev uyarıları yüklenemedi:", error);
      setHomeworkAlerts({});
      return;
    }

    const grouped: Record<string, number> = {};

    ((data || []) as HomeworkAlert[]).forEach((item) => {
      if (!item.client_id) return;
      grouped[item.client_id] = (grouped[item.client_id] || 0) + 1;
    });

    setHomeworkAlerts(grouped);
  }

  async function loadClients() {
    setLoading(true);

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("SUPABASE LİSTE HATASI:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Listeleme hatası: " + error.message,
        type: "error",
      });
      setLoading(false);
      return;
    }

    setClients(data || []);
    await loadHomeworkAlerts();

    setLoading(false);
  }

  async function saveClient() {
    if (!ad.trim() || !soyad.trim()) {
      showToast({
        title: "İşlem başarısız",
        message: "Ad ve soyad gerekli",
        type: "error",
      });
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("clients").insert({
      tenant_id: TENANT_ID,
      ad: ad.trim(),
      soyad: soyad.trim(),
      telefon: telefon.trim(),
      dogum,
      gorusme,
      burc,
      kan,
      mizac,
    });

    if (error) {
      console.error("SUPABASE KAYIT HATASI:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Kayıt hatası: " + error.message,
        type: "error",
      });
      setSaving(false);
      return;
    }

    setAd("");
    setSoyad("");
    setTelefon("");
    setDogum("");
    setGorusme(todayForInput());
    setKan("");
    setMizac("");

    await loadClients();
    setActiveMainTab("list");
    setSaving(false);

    showToast({
      title: "Başarılı",
      message: "Danışan kaydedildi.",
      type: "success",
    });
  }

  function openClientDetail(clientId: string) {
    router.push(`/dashboard/clients/${clientId}`);
  }

  const inputClassName =
    "h-16 w-full rounded-2xl border-2 border-slate-200 bg-white px-5 text-base font-semibold text-slate-900 shadow-inner outline-none transition-all placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100";

  return (
    <main className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-[radial-gradient(circle_at_10%_10%,rgba(99,102,241,0.16),transparent_28%),radial-gradient(circle_at_90%_15%,rgba(236,72,153,0.14),transparent_30%),radial-gradient(circle_at_50%_85%,rgba(45,212,191,0.12),transparent_32%),linear-gradient(135deg,#eef5ff_0%,#f7f2ff_48%,#fff4fb_100%)] px-6 py-8 pb-12 text-slate-900 antialiased lg:px-10 xl:px-14">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 -top-24 h-[480px] w-[480px] rounded-full bg-indigo-400/14 blur-[150px]" />
        <div className="absolute -right-20 top-0 h-[420px] w-[420px] rounded-full bg-pink-400/12 blur-[150px]" />
        <div className="absolute bottom-0 left-1/3 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-teal-300/12 blur-[140px]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1760px] flex-1 flex-col">
      <header className="mb-10 flex flex-wrap items-start justify-between gap-8">
        <div className="min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap items-center gap-4">
            <Link
              href="/"
              className="rounded-2xl border border-blue-200 bg-gradient-to-r from-slate-50 to-blue-50 px-6 py-4 font-black text-slate-800 shadow-md transition-all hover:-translate-y-1 hover:scale-[1.03]"
            >
              ← Ana Panele Dön
            </Link>

            <button
              type="button"
              onClick={loadClients}
              className="rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-4 font-black text-white shadow-lg transition-all hover:-translate-y-1 hover:scale-[1.03]"
            >
              Yenile
            </button>
          </div>

          <h1 className="text-5xl font-black tracking-tight text-slate-950">Danışanlar</h1>

          <p className="mt-3 max-w-3xl text-base text-slate-600">
            Danışan kayıtları, doğum bilgileri, görüşme tarihleri, kan grubu ve mizaç bilgileri.
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="min-w-[130px] rounded-2xl border border-white/80 bg-white/80 px-6 py-4 text-center shadow-md backdrop-blur-sm">
            <strong className="block text-3xl font-black text-slate-950">{clients.length}</strong>
            <span className="mt-1 block text-sm font-bold uppercase tracking-wide text-slate-500">
              Danışan
            </span>
          </div>

          <div
            className={`min-w-[130px] rounded-2xl border px-6 py-4 text-center shadow-md backdrop-blur-sm ${
              totalExpiredHomework > 0
                ? "border-red-200/80 bg-red-50/90"
                : "border-blue-200/80 bg-blue-50/90"
            }`}
          >
            <strong
              className={`block text-3xl font-black ${
                totalExpiredHomework > 0 ? "text-red-600" : "text-blue-600"
              }`}
            >
              {totalExpiredHomework}
            </strong>
            <span className="mt-1 block text-sm font-bold uppercase tracking-wide text-slate-500">
              Aktif Uyarı
            </span>
          </div>
        </div>
      </header>

      <section className="mb-8 flex gap-3 rounded-[28px] border border-white/80 bg-white/75 p-3 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setActiveMainTab("new")}
            className={`rounded-2xl px-7 py-4 font-black transition-all ${
              activeMainTab === "new"
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg"
                : "border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-800 hover:scale-[1.03] hover:bg-emerald-100"
            }`}
          >
            + Yeni Danışan Kaydı
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab("list")}
            className={`rounded-2xl px-7 py-4 font-black transition-all ${
              activeMainTab === "list"
                ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg"
                : "border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 hover:scale-[1.03] hover:bg-blue-100"
            }`}
          >
            Danışan Listesi
          </button>
      </section>

      {activeMainTab === "new" && (
        <section className="mb-8 flex min-h-[520px] flex-col rounded-[36px] border border-emerald-200/80 bg-white/75 p-10 shadow-[0_30px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
          <div className="mb-8">
            <span className="inline-flex rounded-full bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-800">
              Yeni Danışan Kaydı
            </span>
            <h2 className="mt-4 text-3xl font-black text-slate-950">Danışanı Kaydet</h2>
            <p className="mt-2 text-base text-slate-600">
              Doğum tarihi girilince burç otomatik hesaplanır.
            </p>
          </div>

          <div className="grid flex-1 grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Ad">
              <input value={ad} onChange={(e) => setAd(e.target.value)} className={inputClassName} />
            </Field>

            <Field label="Soyad">
              <input value={soyad} onChange={(e) => setSoyad(e.target.value)} className={inputClassName} />
            </Field>

            <Field label="Telefon">
              <input value={telefon} onChange={(e) => setTelefon(e.target.value)} className={inputClassName} />
            </Field>

            <Field label="Doğum Tarihi">
              <input
                type="date"
                value={dogum}
                onChange={(e) => setDogum(e.target.value)}
                className={inputClassName}
              />
            </Field>

            <Field label="Görüşme Tarihi">
              <input
                type="date"
                value={gorusme}
                onChange={(e) => setGorusme(e.target.value)}
                className={inputClassName}
              />
            </Field>

            <Field label="Burç (Otomatik)">
              <input
                value={burc}
                disabled
                className={`${inputClassName} bg-slate-100 text-slate-700`}
              />
            </Field>

            <Field label="Kan Grubu">
              <select value={kan} onChange={(e) => setKan(e.target.value)} className={inputClassName}>
                <option value="">Seçiniz</option>
                <option>A Rh+</option>
                <option>A Rh-</option>
                <option>B Rh+</option>
                <option>B Rh-</option>
                <option>AB Rh+</option>
                <option>AB Rh-</option>
                <option>0 Rh+</option>
                <option>0 Rh-</option>
              </select>
            </Field>

            <Field label="Mizaç">
              <select
                value={mizac}
                onChange={(e) => setMizac(e.target.value)}
                className={inputClassName}
              >
                <option value="">Seçiniz</option>
                <option value="safra">Safra</option>
                <option value="sovdavi">Sovdavi</option>
                <option value="dem">Dem</option>
                <option value="balgam">Balgam</option>
              </select>
            </Field>
          </div>

          <button
            type="button"
            onClick={saveClient}
            disabled={saving}
            className="mt-8 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-8 py-4 font-black text-white shadow-lg transition-all hover:-translate-y-1 hover:scale-[1.04] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Kaydediliyor..." : "Danışanı Kaydet"}
          </button>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-green-50 p-5 shadow-md transition-all hover:-translate-y-1 hover:scale-[1.03]">
              <p className="text-base font-black text-emerald-800">Kayıt güvenliği</p>
              <p className="mt-2 text-sm font-medium text-slate-600">
                Verileriniz güvenli şekilde saklanır.
              </p>
            </div>
            <div className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-5 shadow-md transition-all hover:-translate-y-1 hover:scale-[1.03]">
              <p className="text-base font-black text-violet-800">Otomatik burç hesaplama</p>
              <p className="mt-2 text-sm font-medium text-slate-600">
                Doğum tarihinden burç otomatik belirlenir.
              </p>
            </div>
            <div className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-sky-50 p-5 shadow-md transition-all hover:-translate-y-1 hover:scale-[1.03]">
              <p className="text-base font-black text-cyan-800">Danışan süreci</p>
              <p className="mt-2 text-sm font-medium text-slate-600">
                Kayıt sonrası detay sayfasına geçebilirsiniz.
              </p>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 shadow-md transition-all hover:-translate-y-1 hover:scale-[1.03]">
              <p className="text-base font-black text-amber-800">Gizlilik</p>
              <p className="mt-2 text-sm font-medium text-slate-600">
                Kişisel veriler yalnızca yetkili kullanımdadır.
              </p>
            </div>
          </div>
        </section>
      )}

      {activeMainTab === "list" && (
        <>
          <section
            style={panelStyle}
            className="transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
          >
            <div style={panelHeaderStyle}>
              <div>
                <div style={bluePillStyle}>Arama & Filtreleme</div>
                <h2 style={panelTitleStyle}>Danışanları Bul</h2>
                <p style={panelSubTextStyle}>
                  Ad, soyad, telefon, burç, kan grubu ve mizaca göre filtrele.
                </p>
              </div>
            </div>

            <div style={filterGridStyle}>
              <Field label="Ara">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ad, soyad veya telefon ara..."
                  style={inputStyle}
                />
              </Field>

              <Field label="Burç">
                <select value={filterBurc} onChange={(e) => setFilterBurc(e.target.value)} style={inputStyle}>
                  <option value="">Seçiniz</option>
                  {[
                    "Koç",
                    "Boğa",
                    "İkizler",
                    "Yengeç",
                    "Aslan",
                    "Başak",
                    "Terazi",
                    "Akrep",
                    "Yay",
                    "Oğlak",
                    "Kova",
                    "Balık",
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>

              <Field label="Kan Grubu">
                <select value={filterKan} onChange={(e) => setFilterKan(e.target.value)} style={inputStyle}>
                  <option value="">Seçiniz</option>
                  <option>A Rh+</option>
                  <option>A Rh-</option>
                  <option>B Rh+</option>
                  <option>B Rh-</option>
                  <option>AB Rh+</option>
                  <option>AB Rh-</option>
                  <option>0 Rh+</option>
                  <option>0 Rh-</option>
                </select>
              </Field>

              <Field label="Mizaç">
                <select value={filterMizac} onChange={(e) => setFilterMizac(e.target.value)} style={inputStyle}>
                  <option value="">Seçiniz</option>
                  <option value="safra">Safra</option>
                  <option value="sovdavi">Sovdavi</option>
                  <option value="dem">Dem</option>
                  <option value="balgam">Balgam</option>
                </select>
              </Field>
            </div>
          </section>

          <section
            style={listPanelStyle}
            className="transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
          >
            <h2 style={sectionTitleStyle}>Danışan Listesi</h2>

            {loading ? (
              <p style={loadingStyle}>Yükleniyor...</p>
            ) : filteredClients.length === 0 ? (
              <div style={emptyStyle}>Kriterlere uygun danışan bulunamadı.</div>
            ) : (
              <div style={cardsStyle}>
                {filteredClients.map((client) => {
                  const expiredCount = homeworkAlerts[client.id] || 0;
                  const hasExpiredHomework = expiredCount > 0;

                  return (
                    <div
                      key={client.id}
                      style={{
                        ...cardStyle,
                        borderColor: hasExpiredHomework ? "#fecaca" : "#e2e8f0",
                        background: hasExpiredHomework
                          ? "linear-gradient(135deg, #fff7ed, #fff1f2)"
                          : "white",
                        boxShadow: hasExpiredHomework
                          ? "0 14px 28px rgba(220, 38, 38, 0.10)"
                          : "0 10px 22px rgba(15,23,42,0.05)",
                      }}
                      onClick={() => openClientDetail(client.id)}
                      title="Danışan detayını aç"
                    >
                      <div style={cardHeaderStyle}>
                        <div style={cardNameStyle}>
                          {client.ad} {client.soyad}
                        </div>

                        {hasExpiredHomework && (
                          <span style={expiredPillStyle}>
                            ⚠️ {expiredCount} ödev
                          </span>
                        )}
                      </div>

                      <div style={cardMetaStyle}>📞 {client.telefon || "Telefon yok"}</div>
                      <div style={cardMetaStyle}>🎂 {formatDateTR(client.dogum) || "Doğum tarihi yok"}</div>
                      <div style={cardMetaStyle}>🗓️ {formatDateTR(client.gorusme) || "Görüşme tarihi yok"}</div>
                      <div style={cardMetaStyle}>♈ {client.burc || "Burç yok"}</div>
                      <div style={cardMetaStyle}>🩸 {client.kan || "Kan grubu yok"}</div>
                      <div style={cardMetaStyle}>🌿 {client.mizac || "Mizaç yok"}</div>

                      <div style={cardFooterStyle}>
                        <span style={detailBadgeStyle}>Detay →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-black text-slate-700">{label}</span>
      {children}
    </label>
  );
}

const headerStyle: React.CSSProperties = {
  marginBottom: 32,
  display: "flex",
  justifyContent: "space-between",
  gap: 24,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  marginBottom: 16,
  flexWrap: "wrap",
};

const backButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  background: "rgba(255,255,255,0.85)",
  color: "#0f172a",
  border: "1px solid rgba(255,255,255,0.8)",
  borderRadius: 16,
  padding: "12px 20px",
  fontSize: 16,
  fontWeight: 700,
  boxShadow: "0 4px 14px rgba(15,23,42,0.08)",
};

const refreshButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#0f172a",
  color: "white",
  padding: "12px 20px",
  borderRadius: 16,
  fontWeight: 700,
  fontSize: 16,
  cursor: "pointer",
  boxShadow: "0 4px 14px rgba(15,23,42,0.12)",
};

const titleStyle: React.CSSProperties = {
  fontSize: 48,
  fontWeight: 900,
  margin: 0,
  letterSpacing: "-0.02em",
  color: "#020617",
};

const subtitleStyle: React.CSSProperties = {
  marginTop: 12,
  color: "#475569",
  fontSize: 18,
  lineHeight: 1.5,
};

const headerStatsStyle: React.CSSProperties = {
  display: "flex",
  gap: 16,
  alignItems: "center",
  flexWrap: "wrap",
};

const statCardStyle: React.CSSProperties = {
  minWidth: 120,
  background: "rgba(255,255,255,0.85)",
  border: "1px solid rgba(255,255,255,0.8)",
  borderRadius: 16,
  padding: "16px 20px",
  boxShadow: "0 4px 14px rgba(15,23,42,0.08)",
  textAlign: "center",
};

const statNumberStyle: React.CSSProperties = {
  display: "block",
  fontSize: 28,
  fontWeight: 900,
  color: "#0f172a",
  lineHeight: 1,
};

const statLabelStyle: React.CSSProperties = {
  display: "block",
  marginTop: 6,
  color: "#64748b",
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const mainTabsShellStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.75)",
  border: "1px solid rgba(255,255,255,0.8)",
  borderRadius: 28,
  padding: 12,
  marginBottom: 32,
  boxShadow: "0 20px 60px rgba(15,23,42,0.08)",
  backdropFilter: "blur(12px)",
};

const mainTabsBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const mainTabButtonStyle: React.CSSProperties = {
  border: "1px solid",
  padding: "12px 24px",
  borderRadius: 16,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  transition: "all 0.3s ease",
  boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
};

const panelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.75)",
  padding: 32,
  borderRadius: 32,
  marginBottom: 32,
  border: "1px solid rgba(255,255,255,0.8)",
  boxShadow: "0 25px 70px rgba(15,23,42,0.08)",
  backdropFilter: "blur(12px)",
};

const panelHeaderStyle: React.CSSProperties = {
  marginBottom: 24,
};

const bluePillStyle: React.CSSProperties = {
  display: "inline-flex",
  background: "#dbeafe",
  color: "#1d4ed8",
  padding: "6px 14px",
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 800,
};

const panelTitleStyle: React.CSSProperties = {
  margin: "12px 0 8px",
  fontSize: 30,
  fontWeight: 900,
  color: "#020617",
};

const panelSubTextStyle: React.CSSProperties = {
  margin: 0,
  color: "#475569",
  fontSize: 16,
  lineHeight: 1.5,
};

const listPanelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.75)",
  padding: 32,
  borderRadius: 32,
  border: "1px solid rgba(255,255,255,0.8)",
  boxShadow: "0 25px 70px rgba(15,23,42,0.08)",
  backdropFilter: "blur(12px)",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  marginTop: 0,
  marginBottom: 20,
  color: "#020617",
};

const filterGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 20,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 56,
  padding: "0 16px",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  fontSize: 16,
  outline: "none",
  background: "white",
  boxSizing: "border-box",
};

const emptyStyle: React.CSSProperties = {
  padding: 24,
  borderRadius: 20,
  background: "#f8fafc",
  color: "#475569",
  fontSize: 16,
};

const loadingStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 16,
  fontWeight: 700,
};

const cardsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 20,
};

const cardStyle: React.CSSProperties = {
  padding: 24,
  borderRadius: 24,
  background: "white",
  border: "1px solid #e2e8f0",
  cursor: "pointer",
  transition: "all 0.3s ease",
  boxShadow: "0 12px 34px rgba(15,23,42,0.06)",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 8,
  marginBottom: 12,
};

const cardNameStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
};

const expiredPillStyle: React.CSSProperties = {
  background: "#fee2e2",
  color: "#dc2626",
  padding: "8px 12px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const detailBadgeStyle: React.CSSProperties = {
  background: "#e0f2fe",
  color: "#0369a1",
  padding: "10px 16px",
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const cardFooterStyle: React.CSSProperties = {
  marginTop: 16,
  display: "flex",
  justifyContent: "flex-end",
};

const cardMetaStyle: React.CSSProperties = {
  marginTop: 8,
  color: "#475569",
  fontSize: 15,
};