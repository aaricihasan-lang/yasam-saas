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

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <div style={topBarStyle}>
            <Link href="/" style={backButtonStyle}>
              ← Ana Panele Dön
            </Link>

            <button onClick={loadClients} style={refreshButtonStyle}>
              Yenile
            </button>
          </div>

          <h1 style={titleStyle}>Danışanlar</h1>

          <p style={subtitleStyle}>
            Danışan kayıtları, doğum bilgileri, görüşme tarihleri, kan grubu ve mizaç bilgileri.
          </p>
        </div>

        <div style={headerStatsStyle}>
          <div style={statCardStyle}>
            <strong style={statNumberStyle}>{clients.length}</strong>
            <span style={statLabelStyle}>Danışan</span>
          </div>

          <div
            style={{
              ...statCardStyle,
              borderColor: totalExpiredHomework > 0 ? "#fecaca" : "#dbeafe",
              background: totalExpiredHomework > 0 ? "#fff1f2" : "#eff6ff",
            }}
          >
            <strong
              style={{
                ...statNumberStyle,
                color: totalExpiredHomework > 0 ? "#dc2626" : "#2563eb",
              }}
            >
              {totalExpiredHomework}
            </strong>
            <span style={statLabelStyle}>Aktif Uyarı</span>
          </div>
        </div>
      </header>

      <section style={mainTabsShellStyle}>
        <div style={mainTabsBarStyle}>
          <button
            type="button"
            onClick={() => setActiveMainTab("new")}
            style={{
              ...mainTabButtonStyle,
              background:
                activeMainTab === "new"
                  ? "linear-gradient(135deg, #16a34a, #22c55e)"
                  : "white",
              color: activeMainTab === "new" ? "white" : "#15803d",
              borderColor: activeMainTab === "new" ? "#16a34a" : "#bbf7d0",
              boxShadow:
                activeMainTab === "new"
                  ? "0 10px 22px rgba(22,163,74,0.18)"
                  : "none",
            }}
          >
            + Yeni Danışan Kaydı
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab("list")}
            style={{
              ...mainTabButtonStyle,
              background:
                activeMainTab === "list"
                  ? "linear-gradient(135deg, #2563eb, #7c3aed)"
                  : "white",
              color: activeMainTab === "list" ? "white" : "#2563eb",
              borderColor: activeMainTab === "list" ? "#2563eb" : "#dbeafe",
              boxShadow:
                activeMainTab === "list"
                  ? "0 10px 22px rgba(37,99,235,0.18)"
                  : "none",
            }}
          >
            Danışan Listesi
          </button>
        </div>
      </section>

      {activeMainTab === "new" && (
        <section style={newClientPanelStyle}>
          <div style={newClientHeaderStyle}>
            <div>
              <div style={greenPillStyle}>Yeni Danışan Kaydı</div>
              <h2 style={panelTitleStyle}>Danışanı Kaydet</h2>
              <p style={panelSubTextStyle}>
                Doğum tarihi girilince burç otomatik hesaplanır.
              </p>
            </div>
          </div>

          <div style={{ ...gridStyle, marginTop: 12 }}>
            <Field label="Ad">
              <input value={ad} onChange={(e) => setAd(e.target.value)} style={inputStyle} />
            </Field>

            <Field label="Soyad">
              <input value={soyad} onChange={(e) => setSoyad(e.target.value)} style={inputStyle} />
            </Field>

            <Field label="Telefon">
              <input value={telefon} onChange={(e) => setTelefon(e.target.value)} style={inputStyle} />
            </Field>

            <Field label="Doğum Tarihi">
              <input
                type="date"
                value={dogum}
                onChange={(e) => setDogum(e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="Görüşme Tarihi">
              <input
                type="date"
                value={gorusme}
                onChange={(e) => setGorusme(e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="Burç (Otomatik)">
              <input value={burc} disabled style={disabledInputStyle} />
            </Field>

            <Field label="Kan Grubu">
              <select value={kan} onChange={(e) => setKan(e.target.value)} style={inputStyle}>
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
              <select value={mizac} onChange={(e) => setMizac(e.target.value)} style={inputStyle}>
                <option value="">Seçiniz</option>
                <option value="safra">Safra</option>
                <option value="sovdavi">Sovdavi</option>
                <option value="dem">Dem</option>
                <option value="balgam">Balgam</option>
              </select>
            </Field>
          </div>

          <button onClick={saveClient} disabled={saving} style={buttonStyle}>
            {saving ? "Kaydediliyor..." : "Danışanı Kaydet"}
          </button>
        </section>
      )}

      {activeMainTab === "list" && (
        <>
          <section style={panelStyle}>
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

          <section style={listPanelStyle}>
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
    <label style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

const pageStyle: React.CSSProperties = {
  padding: 14,
  background: "linear-gradient(135deg,#f7fbff 0%,#f5f1ff 45%,#f5fff8 100%)",
  minHeight: "100vh",
  color: "#0f172a",
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  marginBottom: 10,
  flexWrap: "wrap",
};

const backButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  background: "white",
  color: "#0f172a",
  border: "1px solid #e2e8f0",
  borderRadius: 999,
  padding: "7px 11px",
  fontSize: 11,
  fontWeight: 900,
  boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
};

const headerStyle: React.CSSProperties = {
  marginBottom: 10,
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const headerStatsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const statCardStyle: React.CSSProperties = {
  minWidth: 78,
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 15,
  padding: "8px 10px",
  boxShadow: "0 8px 18px rgba(15,23,42,0.05)",
};

const statNumberStyle: React.CSSProperties = {
  display: "block",
  fontSize: 15,
  fontWeight: 950,
  color: "#0f172a",
  lineHeight: 1,
};

const statLabelStyle: React.CSSProperties = {
  display: "block",
  marginTop: 4,
  color: "#64748b",
  fontSize: 10,
  fontWeight: 850,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const refreshButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#0f172a",
  color: "white",
  padding: "7px 11px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 11,
  cursor: "pointer",
};

const titleStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 950,
  margin: 0,
  letterSpacing: "-0.6px",
};

const subtitleStyle: React.CSSProperties = {
  marginTop: 5,
  color: "#64748b",
  fontSize: 12,
};

const mainTabsShellStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.86)",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 8,
  marginBottom: 10,
  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
};

const mainTabsBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const mainTabButtonStyle: React.CSSProperties = {
  border: "1px solid",
  padding: "8px 11px",
  borderRadius: 13,
  fontSize: 11,
  fontWeight: 950,
  cursor: "pointer",
  transition: "0.18s ease",
};

const panelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.88)",
  padding: 13,
  borderRadius: 16,
  marginBottom: 10,
  border: "1px solid #e2e8f0",
  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
};

const newClientPanelStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(240,253,244,0.95))",
  padding: 13,
  borderRadius: 16,
  marginBottom: 18,
  border: "1px solid #bbf7d0",
  boxShadow: "0 10px 24px rgba(22,163,74,0.08)",
};

const panelHeaderStyle: React.CSSProperties = {
  marginBottom: 12,
};

const newClientHeaderStyle: React.CSSProperties = {
  marginBottom: 10,
};

const bluePillStyle: React.CSSProperties = {
  display: "inline-flex",
  background: "#dbeafe",
  color: "#1d4ed8",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 950,
};

const greenPillStyle: React.CSSProperties = {
  display: "inline-flex",
  background: "#dcfce7",
  color: "#15803d",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 950,
};

const panelTitleStyle: React.CSSProperties = {
  margin: "6px 0 2px",
  fontSize: 15,
  fontWeight: 950,
};

const panelSubTextStyle: React.CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: 11,
};

const listPanelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.9)",
  padding: 13,
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  marginTop: 0,
  marginBottom: 12,
};

const filterGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 8,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 8,
};

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 850,
  color: "#334155",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 11,
  border: "1px solid #d8dee9",
  fontSize: 11,
  outline: "none",
  background: "white",
  boxSizing: "border-box",
};

const disabledInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: "#f1f5f9",
  color: "#334155",
};

const buttonStyle: React.CSSProperties = {
  marginTop: 14,
  background: "#16a34a",
  color: "white",
  border: "none",
  padding: "9px 13px",
  borderRadius: 13,
  fontWeight: 900,
  fontSize: 11,
  cursor: "pointer",
  boxShadow: "0 8px 18px rgba(22,163,74,0.18)",
};

const emptyStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "#f8fafc",
  color: "#475569",
  fontSize: 12,
};

const loadingStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 12,
  fontWeight: 800,
};

const cardsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 8,
};

const cardStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 14,
  background: "white",
  border: "1px solid #e2e8f0",
  cursor: "pointer",
  transition: "0.2s",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 8,
  marginBottom: 12,
};

const cardNameStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
};

const expiredPillStyle: React.CSSProperties = {
  background: "#fee2e2",
  color: "#dc2626",
  padding: "7px 9px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const detailBadgeStyle: React.CSSProperties = {
  background: "#e0f2fe",
  color: "#0369a1",
  padding: "7px 11px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const cardFooterStyle: React.CSSProperties = {
  marginTop: 14,
  display: "flex",
  justifyContent: "flex-end",
};

const cardMetaStyle: React.CSSProperties = {
  marginTop: 4,
  color: "#475569",
  fontSize: 11,
};