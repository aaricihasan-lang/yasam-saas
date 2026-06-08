"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { BirthDateInput } from "@/components/ui/BirthDateInput";
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

  const [sessionUser, setSessionUser] = useState<YasamUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  const tenantId = sessionUser?.tenant_id?.trim() || null;
  const tenantMissing = sessionChecked && (!sessionUser || !tenantId);

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
          : "Hesabınızda çalışma alanı (tenant) bilgisi yok. Liste ve kayıt yapılamaz.",
        type: "warning",
      });
      return;
    }
    loadClients();
  }, [sessionChecked, tenantId]);

  function showTenantWarning() {
    showToast({
      title: "Oturum uyarısı",
      message: !sessionUser
        ? "Oturum bulunamadı. Lütfen tekrar giriş yapın."
        : "Hesabınızda çalışma alanı (tenant) bilgisi yok. İşlem yapılamaz.",
      type: "warning",
    });
  }

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
    const user = readYasamUser();
    const activeTenantId = user?.tenant_id?.trim();
    if (!user || !activeTenantId) {
      setLoading(false);
      showTenantWarning();
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("tenant_id", activeTenantId)
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
    await loadHomeworkAlerts(activeTenantId);

    setLoading(false);
  }

  async function saveClient() {
    const user = readYasamUser();
    const activeTenantId = user?.tenant_id?.trim();
    if (!user || !activeTenantId) {
      showTenantWarning();
      return;
    }

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
      tenant_id: activeTenantId,
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
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-inner outline-none transition-all placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";

  return (
    <main className="relative w-full overflow-x-hidden bg-[radial-gradient(circle_at_10%_10%,rgba(99,102,241,0.16),transparent_28%),radial-gradient(circle_at_90%_15%,rgba(236,72,153,0.14),transparent_30%),radial-gradient(circle_at_50%_85%,rgba(45,212,191,0.12),transparent_32%),linear-gradient(135deg,#eef5ff_0%,#f7f2ff_48%,#fff4fb_100%)] px-5 py-5 text-slate-900 antialiased sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 -top-24 h-[480px] w-[480px] rounded-full bg-indigo-400/14 blur-[150px]" />
        <div className="absolute -right-20 top-0 h-[420px] w-[420px] rounded-full bg-pink-400/12 blur-[150px]" />
        <div className="absolute bottom-0 left-1/3 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-teal-300/12 blur-[140px]" />
      </div>

      <div className="relative z-10 w-full">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Danışanlar</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
            Danışan kayıtları, doğum bilgileri, görüşme tarihleri, kan grubu ve mizaç bilgileri.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="min-w-[100px] rounded-xl border border-white/80 bg-white/80 px-4 py-3 text-center shadow-sm backdrop-blur-sm">
            <strong className="block text-2xl font-black text-slate-950">{clients.length}</strong>
            <span className="mt-0.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Danışan
            </span>
          </div>

          <div
            className={`min-w-[100px] rounded-xl border px-4 py-3 text-center shadow-sm backdrop-blur-sm ${
              totalExpiredHomework > 0
                ? "border-red-200/80 bg-red-50/90"
                : "border-blue-200/80 bg-blue-50/90"
            }`}
          >
            <strong
              className={`block text-2xl font-black ${
                totalExpiredHomework > 0 ? "text-red-600" : "text-blue-600"
              }`}
            >
              {totalExpiredHomework}
            </strong>
            <span className="mt-0.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Aktif Uyarı
            </span>
          </div>
        </div>
      </header>

      <section className="mb-4 flex gap-2 rounded-xl border border-white/80 bg-white/75 p-2 shadow-md backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setActiveMainTab("new")}
            className={`rounded-lg px-5 py-2 text-sm font-black transition-all ${
              activeMainTab === "new"
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md"
                : "border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-800 hover:scale-[1.02]"
            }`}
          >
            + Yeni Danışan Kaydı
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab("list")}
            className={`rounded-lg px-5 py-2 text-sm font-black transition-all ${
              activeMainTab === "list"
                ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md"
                : "border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 hover:scale-[1.02]"
            }`}
          >
            Danışan Listesi
          </button>
      </section>

      {tenantMissing ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/95 px-5 py-4 text-sm font-bold text-amber-950 shadow-sm">
          {!sessionUser
            ? "Oturum bulunamadı. Danışan listesi ve kayıt için lütfen tekrar giriş yapın."
            : "Çalışma alanı (tenant) bilgisi bulunamadı. Danışan verileri yüklenemez ve kayıt yapılamaz."}
        </div>
      ) : null}

      {activeMainTab === "new" && (
        <section className="mb-4 overflow-visible rounded-2xl border border-emerald-200/80 bg-white/75 p-5 shadow-lg backdrop-blur-sm">
          <div className="mb-4">
            <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
              Yeni Danışan Kaydı
            </span>
            <h2 className="mt-2 text-xl font-black text-slate-950">Danışanı Kaydet</h2>
            <p className="mt-1 text-xs text-slate-600">
              Doğum tarihi girilince burç otomatik hesaplanır.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              <BirthDateInput
                value={dogum}
                onChange={setDogum}
                className={inputClassName}
              />
            </Field>

            <Field label="Görüşme Tarihi">
              <PremiumDatePicker
                value={gorusme}
                onChange={setGorusme}
                inputClassName={inputClassName}
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
            className="btn-primary mt-4 hover:-translate-y-0.5 hover:scale-[1.02]"
          >
            {saving ? "Kaydediliyor..." : "Danışanı Kaydet"}
          </button>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-green-50 p-3 shadow-sm">
              <p className="text-sm font-black text-emerald-800">Kayıt güvenliği</p>
              <p className="mt-1 text-xs font-medium text-slate-600">
                Verileriniz güvenli şekilde saklanır.
              </p>
            </div>
            <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-3 shadow-sm">
              <p className="text-sm font-black text-violet-800">Otomatik burç hesaplama</p>
              <p className="mt-1 text-xs font-medium text-slate-600">
                Doğum tarihinden burç otomatik belirlenir.
              </p>
            </div>
            <div className="rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-sky-50 p-3 shadow-sm">
              <p className="text-sm font-black text-cyan-800">Danışan süreci</p>
              <p className="mt-1 text-xs font-medium text-slate-600">
                Kayıt sonrası detay sayfasına geçebilirsiniz.
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-3 shadow-sm">
              <p className="text-sm font-black text-amber-800">Gizlilik</p>
              <p className="mt-1 text-xs font-medium text-slate-600">
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

const MONTH_NAMES_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

const WEEKDAY_NAMES_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;

function parseInputDate(value: string) {
  if (!value) return null;
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function toInputDate(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function mondayFirstOffset(year: number, month: number) {
  const day = new Date(year, month - 1, 1).getDay();
  return (day + 6) % 7;
}

function PremiumDatePicker({
  value,
  onChange,
  inputClassName,
  alignRight = false,
}: {
  value: string;
  onChange: (next: string) => void;
  inputClassName: string;
  alignRight?: boolean;
}) {
  const today = todayForInput();
  const parsedToday = parseInputDate(today);
  const parsedValue = parseInputDate(value);

  const initialYear = parsedValue?.y ?? parsedToday?.y ?? new Date().getFullYear();
  const initialMonth = parsedValue?.m ?? parsedToday?.m ?? new Date().getMonth() + 1;

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const parsed = parseInputDate(value);
    if (parsed) {
      setViewYear(parsed.y);
      setViewMonth(parsed.m);
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function goMonth(delta: number) {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  }

  const leading = mondayFirstOffset(viewYear, viewMonth);
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: Array<{ day: number; inMonth: boolean }> = [];

  for (let i = 0; i < leading; i += 1) {
    cells.push({ day: 0, inMonth: false });
  }
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push({ day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: 0, inMonth: false });
  }

  const popupPositionClass = alignRight
    ? "absolute bottom-full right-0 left-auto mb-3 origin-bottom-right"
    : "absolute bottom-full left-0 mb-3 origin-bottom-left";

  return (
    <div ref={rootRef} className="relative min-w-0 w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`${inputClassName} flex items-center justify-between text-left`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className={value ? "text-slate-900" : "text-slate-400"}>
          {value ? formatDateTR(value) : "Tarih seçin"}
        </span>
        <span className="text-lg text-indigo-500" aria-hidden>
          📅
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Tarih seçici"
          className={`${popupPositionClass} z-50 w-[360px] max-w-[calc(100vw-48px)] rounded-3xl border border-white/80 bg-white/95 p-4 shadow-[0_25px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-all hover:scale-110 hover:bg-indigo-100"
              aria-label="Önceki ay"
            >
              ‹
            </button>
            <p className="text-lg font-black text-slate-900">
              {MONTH_NAMES_TR[viewMonth - 1]} {viewYear}
            </p>
            <button
              type="button"
              onClick={() => goMonth(1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-all hover:scale-110 hover:bg-indigo-100"
              aria-label="Sonraki ay"
            >
              ›
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1">
            {WEEKDAY_NAMES_TR.map((name) => (
              <div
                key={name}
                className="flex h-8 items-center justify-center text-sm font-bold text-slate-500"
              >
                {name}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, index) => {
              if (!cell.inMonth) {
                return <div key={`empty-${index}`} className="h-10 w-10" />;
              }

              const cellValue = toInputDate(viewYear, viewMonth, cell.day);
              const isSelected = value === cellValue;
              const isToday = today === cellValue;

              return (
                <button
                  key={cellValue}
                  type="button"
                  onClick={() => {
                    onChange(cellValue);
                    setOpen(false);
                  }}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl font-semibold transition-all hover:scale-110 hover:bg-indigo-100 ${
                    isSelected
                      ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg hover:from-indigo-500 hover:to-violet-500"
                      : "text-slate-800"
                  } ${isToday && !isSelected ? "border-2 border-indigo-300" : ""}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="rounded-xl px-3 py-2 font-bold text-slate-600 transition-all hover:scale-110 hover:bg-indigo-100"
            >
              Temizle
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(today);
                if (parsedToday) {
                  setViewYear(parsedToday.y);
                  setViewMonth(parsedToday.m);
                }
                setOpen(false);
              }}
              className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-2 font-bold text-white shadow-md transition-all hover:scale-110"
            >
              Bugün
            </button>
          </div>
        </div>
      )}
    </div>
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
    <label className="flex min-w-0 flex-col gap-2">
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
  padding: 20,
  borderRadius: 16,
  marginBottom: 16,
  border: "1px solid rgba(255,255,255,0.8)",
  boxShadow: "0 8px 24px rgba(15,23,42,0.07)",
  backdropFilter: "blur(12px)",
};

const panelHeaderStyle: React.CSSProperties = {
  marginBottom: 16,
};

const bluePillStyle: React.CSSProperties = {
  display: "inline-flex",
  background: "#dbeafe",
  color: "#1d4ed8",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};

const panelTitleStyle: React.CSSProperties = {
  margin: "8px 0 4px",
  fontSize: 18,
  fontWeight: 900,
  color: "#020617",
};

const panelSubTextStyle: React.CSSProperties = {
  margin: 0,
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.5,
};

const listPanelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.75)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.8)",
  boxShadow: "0 8px 24px rgba(15,23,42,0.07)",
  backdropFilter: "blur(12px)",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  marginTop: 0,
  marginBottom: 14,
  color: "#020617",
};

const filterGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  fontSize: 14,
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
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 14,
};

const cardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 14,
  background: "white",
  border: "1px solid #e2e8f0",
  cursor: "pointer",
  transition: "all 0.2s ease",
  boxShadow: "0 4px 14px rgba(15,23,42,0.05)",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 8,
  marginBottom: 8,
};

const cardNameStyle: React.CSSProperties = {
  fontSize: 17,
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
  marginTop: 10,
  display: "flex",
  justifyContent: "flex-end",
};

const cardMetaStyle: React.CSSProperties = {
  marginTop: 5,
  color: "#475569",
  fontSize: 13,
};