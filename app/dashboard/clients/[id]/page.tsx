"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";
import NotesTab from "./components/NotesTab";
import StonesTab from "./components/StonesTab";
import SessionsTab from "./components/SessionsTab";
import HomeworkTab from "./components/HomeworkTab";
import AnalizlerTab from "./components/AnalizlerTab";
import YolculukTab from "./components/YolculukTab";
import { BirthDateInput } from "@/components/ui/BirthDateInput";

type Client = {
  id: string;
  ad?: string;
  soyad?: string;
  telefon?: string;
  dogum?: string;
  gorusme?: string;
  burc?: string;
  kan?: string;
  mizac?: string;
};

type ClientNote = {
  id?: string;
  tenant_id?: string;
  client_id?: string;
  saglik_notu?: string | null;
  adres?: string | null;
  oneriler?: string | null;
  notlar?: string | null;
};

type AppointmentStatus = "bekliyor" | "tamamlandi" | "iptal";

type Appointment = {
  id: string;
  title: string | null;
  notes: string | null;
  appointment_date: string;
  created_at: string;
  client_id: string | null;
  status?: AppointmentStatus | string | null;
};

type PlanningMode = "auto" | "manual";

function formatDateTR(date: string | undefined) {
  if (!date) return "-";
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function formatDateTimeTR(value: string) {
  return new Date(value).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isPastDate(value: string) {
  return new Date(value).getTime() < new Date().getTime();
}

function getAppointmentStatusInfo(item: Appointment) {
  const status = item.status || "bekliyor";

  if (status === "tamamlandi") {
    return {
      label: "Tamamlandı",
      bg: "#dcfce7",
      color: "#15803d",
      border: "#bbf7d0",
      dot: "#22c55e",
    };
  }

  if (status === "iptal") {
    return {
      label: "İptal",
      bg: "#fee2e2",
      color: "#dc2626",
      border: "#fecaca",
      dot: "#ef4444",
    };
  }

  if (isPastDate(item.appointment_date)) {
    return {
      label: "Geçmiş",
      bg: "#f1f5f9",
      color: "#64748b",
      border: "#e2e8f0",
      dot: "#94a3b8",
    };
  }

  return {
    label: "Yaklaşan",
    bg: "#dcfce7",
    color: "#15803d",
    border: "#bbf7d0",
    dot: "#22c55e",
  };
}

export default function ClientDetailPage() {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  useBfcacheRefresh();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  const [client, setClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState("genel");
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);

  const [noteId, setNoteId] = useState<string | null>(null);
  const [saglikNotu, setSaglikNotu] = useState("");
  const [adres, setAdres] = useState("");
  const [oneriler, setOneriler] = useState("");
  const [editAd, setEditAd] = useState("");
  const [editSoyad, setEditSoyad] = useState("");
  const [editTelefon, setEditTelefon] = useState("");
  const [editKan, setEditKan] = useState("");
  const [editMizac, setEditMizac] = useState("");
  const [savingAll, setSavingAll] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

  const [editDogum, setEditDogum] = useState("");

  const [noteText, setNoteText] = useState("");
  const [savingClientNotes, setSavingClientNotes] = useState(false);

  useEffect(() => {
    void getSyncedTenantId().then(setTenantId);
  }, []);

  useEffect(() => {
    function onResize() { setIsNarrow(window.innerWidth < 640); }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!tenantId) return;

    async function fetchClient() {
      setLoading(true);

      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .eq("tenant_id", tenantId)
        .single();

      if (error) {
        console.error("Danışan detay hatası:", error);
        setClient(null);
        setLoading(false);
        return;
      }

      setClient(data);
      setEditAd(data.ad || "");
      setEditSoyad(data.soyad || "");
      setEditTelefon(data.telefon || "");
      setEditDogum(data.dogum || "");
      setEditKan(data.kan || "");
      setEditMizac(data.mizac || "");

      const { data: notesData, error: notesError } = await supabase
        .from("client_notes")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();

      if (notesError) {
        console.error("Genel bilgiler okuma hatası:", notesError);
      }

      if (notesData) {
        const note = notesData as ClientNote;

        setNoteId(note.id || null);
        setSaglikNotu(note.saglik_notu || "");
        setAdres(note.adres || "");
        setOneriler(note.oneriler || "");
        setNoteText(note.notlar || "");
      }

      setLoading(false);
    }

    if (clientId) {
      fetchClient();
    }
  }, [clientId, tenantId]);

  async function saveAllGeneralInfo() {
    if (!tenantId || !client) return;

    setSavingAll(true);

    const { error: clientError } = await supabase
      .from("clients")
      .update({
        ad: editAd.trim() || null,
        soyad: editSoyad.trim() || null,
        telefon: editTelefon.trim() || null,
        dogum: editDogum || null,
        kan: editKan || null,
        mizac: editMizac || null,
      })
      .eq("id", client.id)
      .eq("tenant_id", tenantId);

    if (clientError) {
      showToast({
        title: "İşlem başarısız",
        message: "Danışan bilgileri kaydedilemedi: " + clientError.message,
        type: "error",
      });
      setSavingAll(false);
      return;
    }

    setClient((prev) =>
      prev
        ? {
            ...prev,
            ad: editAd.trim() || undefined,
            soyad: editSoyad.trim() || undefined,
            telefon: editTelefon.trim() || undefined,
            dogum: editDogum || undefined,
            kan: editKan || undefined,
            mizac: editMizac || undefined,
          }
        : prev
    );

    const notesPayload = {
      id: noteId || undefined,
      tenant_id: tenantId,
      client_id: clientId,
      saglik_notu: saglikNotu,
      adres,
      oneriler,
    };

    const { data: notesData, error: notesError } = await supabase
      .from("client_notes")
      .upsert(notesPayload)
      .select()
      .single();

    if (notesError) {
      showToast({
        title: "İşlem başarısız",
        message: "Notlar kaydedilemedi: " + notesError.message,
        type: "error",
      });
      setSavingAll(false);
      return;
    }

    if (notesData?.id) {
      setNoteId(notesData.id);
    }

    showToast({
      title: "Başarılı",
      message: "Değişiklikler kaydedildi.",
      type: "success",
    });
    setSavingAll(false);
  }

  async function saveClientNotes() {
    if (!tenantId) return;

    setSavingClientNotes(true);

    const payload = {
      id: noteId || undefined,
      tenant_id: tenantId,
      client_id: clientId,
      saglik_notu: saglikNotu,
      adres,
      oneriler,
      notlar: noteText,
    };

    const { data, error } = await supabase
      .from("client_notes")
      .upsert(payload)
      .select()
      .single();

    if (error) {
      console.error("Not kayıt hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Not kayıt hatası: " + error.message,
        type: "error",
      });
      setSavingClientNotes(false);
      return;
    }

    if (data?.id) {
      setNoteId(data.id);
    }

    showToast({
      title: "Başarılı",
      message: "Notlar kaydedildi.",
      type: "success",
    });
    setSavingClientNotes(false);
  }

  async function generateWordReport() {
    if (!tenantId || !client) return;
    setGeneratingReport(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/word-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Rapor oluşturulamadı");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const rawName = `${client.ad ?? ""} ${client.soyad ?? ""}`.trim();
      const nameSlug = rawName
        .toLowerCase()
        .replace(/ı/g, "i").replace(/İ/g, "i")
        .replace(/ğ/g, "g").replace(/Ğ/g, "g")
        .replace(/ü/g, "u").replace(/Ü/g, "u")
        .replace(/ş/g, "s").replace(/Ş/g, "s")
        .replace(/ö/g, "o").replace(/Ö/g, "o")
        .replace(/ç/g, "c").replace(/Ç/g, "c")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const dateSlug = new Date().toISOString().slice(0, 10);
      link.download = `danisan-raporu-${nameSlug}-${dateSlug}.docx`;
      link.click();
      URL.revokeObjectURL(url);
      showToast({ title: "Başarılı", message: "Rapor indirme başlatıldı.", type: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bilinmeyen hata";
      showToast({ title: "Hata", message, type: "error" });
    } finally {
      setGeneratingReport(false);
    }
  }

  async function deleteClient() {
    if (!tenantId) return;

    setDeletingClient(true);

    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", clientId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("Danışan silme hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Danışan silinemedi: " + error.message,
        type: "error",
      });
      setDeletingClient(false);
      return;
    }

    setShowDeleteModal(false);
    setDeletingClient(false);
    router.push("/dashboard/clients");
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={loadingCard}>Danışan yükleniyor...</div>
      </main>
    );
  }

  if (!client) {
    return (
      <main style={pageStyle}>
        <button onClick={() => router.push("/dashboard/clients")} style={backButton}>
          ← Danışanlara Dön
        </button>

        <div style={loadingCard}>Danışan bulunamadı</div>
      </main>
    );
  }

  const fullName = `${client.ad ?? ""} ${client.soyad ?? ""}`.trim();

  return (
    <main style={pageStyle}>
      <div style={topBar}>
        <button onClick={() => router.push("/dashboard/clients")} style={backButton}>
          ← Danışanlara Dön
        </button>

        <button onClick={() => setShowDeleteModal(true)} style={deleteClientButton}>
          Danışanı Sil
        </button>
      </div>

      <section style={heroCard}>
        <div style={heroGlowOne} />
        <div style={heroGlowTwo} />

        <div style={avatarBox}>
          {fullName ? fullName.charAt(0).toUpperCase() : "D"}
        </div>

        <div style={{ flex: 1, position: "relative", zIndex: 2 }}>
          <div style={heroPill}>Danışan Detayı</div>
          <h1 style={titleStyle}>{fullName || "İsimsiz Danışan"}</h1>
          <p style={mutedText}>
            Danışan bilgileri, notlar, taşlar, seanslar, ödevler ve randevular burada yönetilir.
          </p>

          <div style={infoGrid}>
            <Info label="Telefon" value={client.telefon} color="#2563eb" />
            <Info label="Doğum Tarihi" value={formatDateTR(client.dogum)} color="#7c3aed" />
            <Info label="Görüşme Tarihi" value={formatDateTR(client.gorusme)} color="#db2777" />
            <Info label="Burç" value={client.burc} color="#ea580c" />
            <Info label="Kan Grubu" value={client.kan} color="#dc2626" />
            <Info label="Mizaç" value={client.mizac} color="#16a34a" />
          </div>
        </div>
      </section>

      <section style={tabsCard}>
        <div
          style={
            isNarrow
              ? { ...tabBar, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 6, WebkitOverflowScrolling: "touch" }
              : tabBar
          }
        >
          <Tab label="Genel Bilgiler" id="genel" activeTab={activeTab} setActiveTab={setActiveTab} color="#2563eb" />
          <Tab label="Notlar" id="notlar" activeTab={activeTab} setActiveTab={setActiveTab} color="#7c3aed" />
          <Tab label="Randevular" id="randevular" activeTab={activeTab} setActiveTab={setActiveTab} color="#db2777" />
          <Tab label="Taşlar" id="taslar" activeTab={activeTab} setActiveTab={setActiveTab} color="#0891b2" />
          <Tab label="Seanslar" id="seanslar" activeTab={activeTab} setActiveTab={setActiveTab} color="#16a34a" />
          <Tab label="Ödevler" id="odevler" activeTab={activeTab} setActiveTab={setActiveTab} color="#dc2626" />
          <Tab label="Analizler" id="analizler" activeTab={activeTab} setActiveTab={setActiveTab} color="#9333ea" />
          <Tab label="✦ Danışan Yolculuğu" id="yolculuk" activeTab={activeTab} setActiveTab={setActiveTab} color="#4f46e5" />
          <button
            onClick={generateWordReport}
            disabled={generatingReport}
            style={{
              ...tabButton,
              border: "1px solid #cbd5e133",
              background: "transparent",
              color: "#64748b",
              opacity: generatingReport ? 0.6 : 1,
              cursor: generatingReport ? "default" : "pointer",
            }}
          >
            {generatingReport ? "⏳ Oluşturuluyor..." : "📄 Word Raporu"}
          </button>
        </div>

        <div style={contentBox}>
          {activeTab === "genel" && (
            <>
              <div style={sectionHead}>
                <div style={bluePill}>Genel Bilgiler</div>
                <h2 style={sectionTitle}>Danışan Bilgilerini Düzenle</h2>
              </div>

              <div style={genelGrid}>
                <div>
                  <label style={textareaLabel}>Ad</label>
                  <input
                    value={editAd}
                    onChange={(e) => setEditAd(e.target.value)}
                    style={inputStyle}
                    placeholder="Ad"
                  />
                </div>
                <div>
                  <label style={textareaLabel}>Soyad</label>
                  <input
                    value={editSoyad}
                    onChange={(e) => setEditSoyad(e.target.value)}
                    style={inputStyle}
                    placeholder="Soyad"
                  />
                </div>
                <div>
                  <label style={textareaLabel}>Telefon</label>
                  <input
                    value={editTelefon}
                    onChange={(e) => setEditTelefon(e.target.value)}
                    style={inputStyle}
                    placeholder="05xx xxx xx xx"
                  />
                </div>
                <div>
                  <label style={textareaLabel}>Doğum Tarihi</label>
                  <BirthDateInput
                    value={editDogum}
                    onChange={setEditDogum}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={textareaLabel}>Kan Grubu</label>
                  <select
                    value={editKan}
                    onChange={(e) => setEditKan(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Seçiniz</option>
                    <option>A Rh+</option><option>A Rh-</option>
                    <option>B Rh+</option><option>B Rh-</option>
                    <option>AB Rh+</option><option>AB Rh-</option>
                    <option>0 Rh+</option><option>0 Rh-</option>
                  </select>
                </div>
                <div>
                  <label style={textareaLabel}>Mizaç</label>
                  <select
                    value={editMizac}
                    onChange={(e) => setEditMizac(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Seçiniz</option>
                    <option value="safra">Safra</option>
                    <option value="sovdavi">Sovdavi</option>
                    <option value="dem">Dem</option>
                    <option value="balgam">Balgam</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
                <div>
                  <label style={textareaLabel}>Sağlık Notu</label>
                  <textarea
                    value={saglikNotu}
                    onChange={(e) => setSaglikNotu(e.target.value)}
                    style={textareaStyle}
                    placeholder="Danışanın sağlık notları..."
                  />
                </div>
                <div>
                  <label style={textareaLabel}>Adres</label>
                  <textarea
                    value={adres}
                    onChange={(e) => setAdres(e.target.value)}
                    style={textareaStyle}
                    placeholder="Adres bilgisi..."
                  />
                </div>
                <div>
                  <label style={textareaLabel}>Öneriler</label>
                  <textarea
                    value={oneriler}
                    onChange={(e) => setOneriler(e.target.value)}
                    style={textareaStyle}
                    placeholder="Danışana verilen genel öneriler..."
                  />
                </div>

                <div style={saveBarStyle}>
                  <button
                    onClick={saveAllGeneralInfo}
                    disabled={savingAll}
                    className="btn-primary"
                    style={{ opacity: savingAll ? 0.7 : 1 }}
                  >
                    {savingAll ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === "notlar" && (
            <NotesTab
              noteText={noteText}
              setNoteText={setNoteText}
              onSave={saveClientNotes}
              saving={savingClientNotes}
            />
          )}

          {activeTab === "randevular" && (
            <AppointmentsTab
              clientId={client.id}
              clientName={fullName || "Danışan"}
              tenantId={tenantId}
              confirm={confirm}
              showToast={showToast}
            />
          )}

          {activeTab === "taslar" && <StonesTab clientId={client.id} />}

          {activeTab === "seanslar" && <SessionsTab clientId={client.id} />}

          {activeTab === "odevler" && <HomeworkTab clientId={client.id} />}

          {activeTab === "analizler" && (
            <AnalizlerTab
              clientId={client.id}
              clientName={fullName || "Danışan"}
            />
          )}

          {activeTab === "yolculuk" && (
            <YolculukTab
              clientName={fullName || "Danışan"}
              clientPhone={client.telefon}
              clientLastSession={client.gorusme ? formatDateTR(client.gorusme) : undefined}
              onNavigate={setActiveTab}
            />
          )}

        </div>
      </section>

      {showDeleteModal && (
        <div style={modalOverlay} onClick={() => !deletingClient && setShowDeleteModal(false)}>
          <div style={deleteModalCard} onClick={(event) => event.stopPropagation()}>
            <div style={deleteModalIcon}>!</div>

            <div>
              <div style={deleteModalPill}>Danışan Silme Onayı</div>
              <h2 style={deleteModalTitle}>Bu danışan silinsin mi?</h2>
              <p style={deleteModalText}>
                Bu işlem danışan kaydını sistemden kaldırır. Emin değilsen
                işlemi iptal edebilirsin.
              </p>
            </div>

            <div style={deleteModalActions}>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deletingClient}
                style={cancelDeleteButton}
              >
                Vazgeç
              </button>

              <button
                type="button"
                onClick={deleteClient}
                disabled={deletingClient}
                style={{
                  ...confirmDeleteButton,
                  opacity: deletingClient ? 0.7 : 1,
                }}
              >
                {deletingClient ? "Siliniyor..." : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function AppointmentsTab({
  clientId,
  clientName,
  tenantId,
  confirm,
  showToast,
}: {
  clientId: string;
  clientName: string;
  tenantId: string | null;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  showToast: ReturnType<typeof useToast>["showToast"];
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    function onResize() { setIsNarrow(window.innerWidth < 640); }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [title, setTitle] = useState("Seans");
  const [notes, setNotes] = useState("");
  const [sessionCount, setSessionCount] = useState(1);
  const [planningMode, setPlanningMode] = useState<PlanningMode>("auto");
  const [date, setDate] = useState("");
  const [dayInterval, setDayInterval] = useState(1);
  const [manualDates, setManualDates] = useState<string[]>([""]);

  useEffect(() => {
    if (!tenantId) return;
    loadAppointments();
  }, [clientId, tenantId]);

  async function loadAppointments() {
    if (!tenantId) return;

    setLoading(true);

    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("client_id", clientId)
      .order("appointment_date", { ascending: true });

    if (error) {
      showToast({
        title: "İşlem başarısız",
        message: "Randevular yüklenemedi: " + error.message,
        type: "error",
      });
      setLoading(false);
      return;
    }

    setAppointments(data || []);
    setLoading(false);
  }

  function handleSessionCountChange(value: number) {
    const safeCount = Math.max(1, value || 1);
    setSessionCount(safeCount);

    setManualDates((oldDates) => {
      const nextDates = [...oldDates];

      while (nextDates.length < safeCount) {
        nextDates.push("");
      }

      return nextDates.slice(0, safeCount);
    });
  }

  function updateManualDate(index: number, value: string) {
    setManualDates((oldDates) => {
      const nextDates = [...oldDates];
      nextDates[index] = value;
      return nextDates;
    });
  }

  async function createAppointments() {
    if (!tenantId) return;

    const count = Math.max(1, Number(sessionCount));

    let rows: {
      tenant_id: string;
      client_id: string;
      title: string;
      notes: string | null;
      appointment_date: string;
      status: AppointmentStatus;
    }[] = [];

    if (planningMode === "auto") {
      if (!date) {
        showToast({
          title: "Eksik bilgi",
          message: "Başlangıç tarihi seçmelisiniz",
          type: "warning",
        });
        return;
      }

      const interval = Math.max(1, Number(dayInterval));
      const startDate = new Date(date);

      rows = Array.from({ length: count }).map((_, index) => {
        const appointmentDate = new Date(startDate);
        appointmentDate.setDate(startDate.getDate() + index * interval);

        return {
          tenant_id: tenantId,
          client_id: clientId,
          title:
            count > 1
              ? `${title || "Seans"} ${index + 1}/${count}`
              : title || "Seans",
          notes: notes || null,
          appointment_date: appointmentDate.toISOString(),
          status: "bekliyor",
        };
      });
    } else {
      const filledDates = manualDates.slice(0, count);
      const emptyIndex = filledDates.findIndex((item) => !item);

      if (emptyIndex !== -1) {
        showToast({
          title: "Eksik bilgi",
          message: `${emptyIndex + 1}. randevu tarihini seçmelisiniz`,
          type: "warning",
        });
        return;
      }

      rows = filledDates.map((manualDate, index) => ({
        tenant_id: tenantId,
        client_id: clientId,
        title:
          count > 1
            ? `${title || "Seans"} ${index + 1}/${count}`
            : title || "Seans",
        notes: notes || null,
        appointment_date: new Date(manualDate).toISOString(),
        status: "bekliyor",
      }));
    }

    setSaving(true);

    const { error } = await supabase.from("appointments").insert(rows);

    if (error) {
      showToast({
        title: "İşlem başarısız",
        message: "Randevu kayıt hatası: " + error.message,
        type: "error",
      });
      setSaving(false);
      return;
    }

    setTitle("Seans");
    setNotes("");
    setSessionCount(1);
    setPlanningMode("auto");
    setDate("");
    setDayInterval(1);
    setManualDates([""]);
    setShowForm(false);

    await loadAppointments();
    setSaving(false);
  }

  async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
    const { error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .eq("client_id", clientId);

    if (error) {
      showToast({
        title: "İşlem başarısız",
        message: "Randevu durumu güncellenemedi: " + error.message,
        type: "error",
      });
      return;
    }

    setSelectedAppointment((oldItem) =>
      oldItem && oldItem.id === id ? { ...oldItem, status } : oldItem
    );

    await loadAppointments();
  }

  async function deleteAppointment(id: string) {
    const confirmDelete = await confirm({
      message: "Bu randevu silinsin mi?",
      tone: "danger",
      title: "Randevuyu sil",
      confirmText: "Sil",
      cancelText: "Vazgeç",
    });
    if (!confirmDelete) return;

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .eq("client_id", clientId);

    if (error) {
      showToast({
        title: "İşlem başarısız",
        message: "Randevu silinemedi: " + error.message,
        type: "error",
      });
      return;
    }

    setSelectedAppointment(null);
    await loadAppointments();
  }

  const upcomingCount = appointments.filter((item) => !isPastDate(item.appointment_date)).length;
  const pastCount = appointments.length - upcomingCount;

  return (
    <div>
      <div style={appointmentHeader}>
        <div>
          <div style={pinkPill}>Danışana Özel Ajanda</div>
          <h2 style={{ margin: "7px 0 2px", fontSize: 22, fontWeight: 900 }}>
            Randevular
          </h2>
          <p style={{ margin: 0, color: "#64748b" }}>
            {clientName} için oluşturulan tüm randevular burada görünür.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={appointmentStats}>
            <MiniStat label="Toplam" value={appointments.length} color="#db2777" bg="#fdf2f8" />
            <MiniStat label="Yaklaşan" value={upcomingCount} color="#16a34a" bg="#f0fdf4" />
            <MiniStat label="Geçmiş" value={pastCount} color="#64748b" bg="#f8fafc" />
          </div>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            style={{
              border: showForm ? "1px solid #e2e8f0" : "none",
              background: showForm ? "#f8fafc" : "linear-gradient(135deg, #4f46e5, #db2777)",
              color: showForm ? "#334155" : "white",
              padding: "9px 14px",
              borderRadius: 12,
              fontWeight: 850,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: showForm ? "none" : "0 6px 14px rgba(219,39,119,0.18)",
            }}
          >
            {showForm ? "Formu Kapat" : "+ Yeni Randevu Ekle"}
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{ ...appointmentFormBox, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={formTopBadge}>Yeni Randevu</div>
              <h3 style={{ ...boxTitle, marginTop: 6 }}>Yeni Randevu Ekle</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={cancelDeleteButton}
            >
              Vazgeç
            </button>
          </div>

          <div style={formColumn}>
            <div>
              <label style={textareaLabel}>Başlık</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={inputStyle}
                placeholder="Örn: Biyoenerji Seansı"
              />
            </div>

            <div>
              <label style={textareaLabel}>Not</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ ...textareaStyle, minHeight: 90 }}
                placeholder="Randevu notu..."
              />
            </div>

            <div>
              <label style={textareaLabel}>Seans Sayısı</label>
              <input
                type="number"
                min={1}
                value={sessionCount}
                onChange={(e) => handleSessionCountChange(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            <div style={planningBox}>
              <label style={textareaLabel}>Planlama Türü</label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button
                  onClick={() => setPlanningMode("auto")}
                  style={{
                    ...modeButton,
                    background: planningMode === "auto" ? "#4f46e5" : "white",
                    color: planningMode === "auto" ? "white" : "#4f46e5",
                  }}
                >
                  Otomatik Aralık
                </button>

                <button
                  onClick={() => setPlanningMode("manual")}
                  style={{
                    ...modeButton,
                    background: planningMode === "manual" ? "#db2777" : "white",
                    color: planningMode === "manual" ? "white" : "#db2777",
                  }}
                >
                  Tek Tek Tarih
                </button>
              </div>
            </div>

            {planningMode === "auto" && (
              <>
                <div>
                  <label style={textareaLabel}>Başlangıç Tarihi</label>
                  <input
                    type="datetime-local"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={textareaLabel}>Kaç Günde Bir?</label>
                  <input
                    type="number"
                    min={1}
                    value={dayInterval}
                    onChange={(e) => setDayInterval(Number(e.target.value))}
                    style={inputStyle}
                  />
                </div>
              </>
            )}

            {planningMode === "manual" && (
              <div style={manualDateBox}>
                <strong style={{ color: "#be185d" }}>Randevu Tarihleri</strong>

                {Array.from({ length: sessionCount }).map((_, index) => (
                  <div key={index} style={{ marginTop: 10 }}>
                    <label style={textareaLabel}>{index + 1}. Randevu</label>
                    <input
                      type="datetime-local"
                      value={manualDates[index] || ""}
                      onChange={(e) => updateManualDate(index, e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={createAppointments}
              disabled={saving}
              className="btn-secondary w-full justify-center"
            >
              {saving ? "Kaydediliyor..." : "Randevu Oluştur"}
            </button>
          </div>
        </div>
      )}

      <div style={appointmentListBox}>
        <h3 style={boxTitle}>Randevu Listesi</h3>

        {loading ? (
          <p>Randevular yükleniyor...</p>
        ) : appointments.length === 0 ? (
          <div style={emptyAppointmentBox}>Bu danışan için henüz randevu yok.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {appointments.map((item, index) => {
              const statusInfo = getAppointmentStatusInfo(item);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedAppointment(item)}
                  style={appointmentCardButton}
                >
                  <div style={appointmentIndex}>{index + 1}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={appointmentTopLine}>
                      <div style={appointmentTitle}>{item.title || "Görüşme"}</div>
                      <span
                        style={{
                          ...statusBadge,
                          background: statusInfo.bg,
                          color: statusInfo.color,
                          border: `1px solid ${statusInfo.border}`,
                        }}
                      >
                        {statusInfo.label}
                      </span>
                    </div>

                    <div style={appointmentDate}>{formatDateTimeTR(item.appointment_date)}</div>
                    {item.notes && <div style={appointmentNote}>{item.notes}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedAppointment && (
        <div style={modalOverlay} onClick={() => setSelectedAppointment(null)}>
          <div style={appointmentDetailModal} onClick={(event) => event.stopPropagation()}>
            <div style={appointmentDetailHeader}>
              <div>
                <div style={appointmentDetailPill}>Randevu Detayı</div>
                <h3 style={appointmentDetailTitle}>{selectedAppointment.title || "Görüşme"}</h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedAppointment(null)}
                style={modalCloseButton}
              >
                ×
              </button>
            </div>

            <div style={appointmentDetailBody}>
              <div style={detailInfoGrid}>
                <div style={detailInfoCard}>
                  <span>Danışan</span>
                  <strong>{clientName}</strong>
                </div>

                <div style={detailInfoCard}>
                  <span>Tarih / Saat</span>
                  <strong>{formatDateTimeTR(selectedAppointment.appointment_date)}</strong>
                </div>

                <div
                  style={{
                    ...detailInfoCard,
                    borderColor: getAppointmentStatusInfo(selectedAppointment).border,
                    background: getAppointmentStatusInfo(selectedAppointment).bg,
                  }}
                >
                  <span>Durum</span>
                  <strong style={{ color: getAppointmentStatusInfo(selectedAppointment).color }}>
                    {getAppointmentStatusInfo(selectedAppointment).label}
                  </strong>
                </div>
              </div>

              <div style={detailNoteCard}>
                <span>Not</span>
                <p>{selectedAppointment.notes || "Not girilmemiş."}</p>
              </div>

              <div style={appointmentDetailActions}>
                <button
                  type="button"
                  onClick={() => updateAppointmentStatus(selectedAppointment.id, "tamamlandi")}
                  className="btn-success justify-center"
                >
                  Tamamlandı
                </button>

                <button
                  type="button"
                  onClick={() => updateAppointmentStatus(selectedAppointment.id, "iptal")}
                  className="btn-danger justify-center"
                >
                  İptal Et
                </button>

                <button
                  type="button"
                  onClick={() => deleteAppointment(selectedAppointment.id)}
                  className="btn-danger justify-center"
                  style={{ background: "linear-gradient(135deg, #020617, #1e293b)" }}
                >
                  Sil
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value, color }: { label: string; value?: string; color: string }) {
  return (
    <div style={{ ...infoItem, borderColor: `${color}35` }}>
      <span style={{ ...infoLabel, color }}>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div style={{ ...miniStat, background: bg, borderColor: `${color}25` }}>
      <strong style={{ color }}>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Tab({
  label,
  id,
  activeTab,
  setActiveTab,
  color,
}: {
  label: string;
  id: string;
  activeTab: string;
  setActiveTab: (id: string) => void;
  color: string;
}) {
  const active = activeTab === id;

  return (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        ...tabButton,
        background: active ? color : "transparent",
        color: active ? "white" : color,
        border: active ? `1px solid ${color}` : `1px solid ${color}22`,
        boxShadow: active ? `0 2px 6px ${color}18` : "none",
      }}
    >
      {label}
    </button>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "linear-gradient(135deg, #f7fbff 0%, #f5f1ff 45%, #f5fff8 100%)",
  padding: 14,
  color: "#0f172a",
};

const loadingCard: React.CSSProperties = {
  background: "white",
  borderRadius: 18,
  padding: 20,
  boxShadow: "0 10px 24px rgba(15,23,42,0.06)",
  fontWeight: 850,
};

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 12,
};

const backButton: React.CSSProperties = {
  border: "none",
  background: "#e0f2fe",
  color: "#0369a1",
  padding: "9px 14px",
  borderRadius: 12,
  fontWeight: 850,
  fontSize: 13,
  cursor: "pointer",
};


const deleteClientButton: React.CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#dc2626",
  padding: "9px 14px",
  borderRadius: 12,
  fontWeight: 850,
  fontSize: 13,
  cursor: "pointer",
  boxShadow: "0 6px 14px rgba(220,38,38,0.08)",
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  background: "rgba(15, 23, 42, 0.46)",
  backdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const deleteModalCard: React.CSSProperties = {
  width: "min(360px, 100%)",
  background: "linear-gradient(135deg, #ffffff, #fff8f8)",
  border: "1px solid #fecaca",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 18px 45px rgba(15,23,42,0.22)",
  textAlign: "center",
};

const deleteModalIcon: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 14,
  background: "linear-gradient(135deg, #ef4444, #dc2626)",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: "0 auto 10px",
  fontSize: 22,
  fontWeight: 950,
  boxShadow: "0 10px 20px rgba(220,38,38,0.22)",
};

const deleteModalPill: React.CSSProperties = {
  display: "inline-flex",
  background: "#fee2e2",
  color: "#dc2626",
  padding: "4px 9px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
  marginBottom: 6,
};

const deleteModalTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 19,
  fontWeight: 930,
  color: "#0f172a",
};

const deleteModalText: React.CSSProperties = {
  margin: "8px auto 0",
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.45,
  maxWidth: 300,
};

const deleteModalActions: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: 8,
  marginTop: 16,
  flexWrap: "wrap",
};

const cancelDeleteButton: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  background: "white",
  color: "#334155",
  padding: "8px 14px",
  borderRadius: 11,
  fontWeight: 850,
  fontSize: 12,
  cursor: "pointer",
};

const confirmDeleteButton: React.CSSProperties = {
  border: "none",
  background: "linear-gradient(135deg, #ef4444, #dc2626)",
  color: "white",
  padding: "8px 14px",
  borderRadius: 11,
  fontWeight: 900,
  fontSize: 12,
  cursor: "pointer",
  boxShadow: "0 8px 16px rgba(220,38,38,0.18)",
};


const heroCard: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  background: "rgba(255,255,255,0.88)",
  borderRadius: 22,
  padding: 14,
  display: "flex",
  gap: 14,
  alignItems: "center",
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.055)",
  marginBottom: 12,
  border: "1px solid rgba(255,255,255,0.8)",
};

const heroGlowOne: React.CSSProperties = {
  position: "absolute",
  width: 120,
  height: 120,
  right: 70,
  top: -45,
  background: "#c4b5fd",
  borderRadius: 999,
  filter: "blur(36px)",
  opacity: 0.45,
};

const heroGlowTwo: React.CSSProperties = {
  position: "absolute",
  width: 105,
  height: 105,
  right: -25,
  bottom: -40,
  background: "#f9a8d4",
  borderRadius: 999,
  filter: "blur(34px)",
  opacity: 0.48,
};

const avatarBox: React.CSSProperties = {
  width: 68,
  height: 68,
  borderRadius: 20,
  background: "linear-gradient(135deg, #2563eb, #7c3aed, #db2777)",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 28,
  fontWeight: 950,
  flexShrink: 0,
  boxShadow: "0 10px 22px rgba(124,58,237,0.18)",
  position: "relative",
  zIndex: 2,
};

const heroPill: React.CSSProperties = {
  display: "inline-flex",
  background: "#eef2ff",
  color: "#4f46e5",
  padding: "5px 10px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 11,
};

const titleStyle: React.CSSProperties = {
  fontSize: 24,
  margin: "5px 0 0",
  fontWeight: 950,
};

const mutedText: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  marginTop: 4,
};

const infoGrid: React.CSSProperties = {
  marginTop: 10,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
  gap: 8,
};

const infoItem: React.CSSProperties = {
  background: "rgba(255,255,255,0.82)",
  border: "1px solid #e2e8f0",
  borderRadius: 13,
  padding: 8,
  boxShadow: "0 4px 12px rgba(15,23,42,0.025)",
};

const infoLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  marginBottom: 3,
  fontWeight: 900,
};

const tabsCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.92)",
  borderRadius: 20,
  padding: "14px 14px 18px",
  boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
  border: "1px solid rgba(255,255,255,0.78)",
};

const tabBar: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginBottom: 16,
  alignItems: "center",
  padding: "4px 0",
};

const tabButton: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 11,
  fontWeight: 800,
  fontSize: 13,
  lineHeight: 1.2,
  cursor: "pointer",
  transition: "all 0.15s ease",
  minHeight: 42,
  whiteSpace: "nowrap",
};

const contentBox: React.CSSProperties = {
  minHeight: 240,
  background: "linear-gradient(135deg, #ffffff, #f8fafc)",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: "20px 18px",
};

const genelGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 14,
  marginBottom: 4,
};

const saveBarStyle: React.CSSProperties = {
  borderTop: "1px solid #e2e8f0",
  paddingTop: 16,
  marginTop: 4,
};

const sectionHead: React.CSSProperties = {
  marginBottom: 10,
};

const bluePill: React.CSSProperties = {
  display: "inline-flex",
  background: "#dbeafe",
  color: "#1d4ed8",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
};

const sectionTitle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 20,
  fontWeight: 900,
};

const formColumn: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const textareaLabel: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontWeight: 800,
  fontSize: 12,
  color: "#334155",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #d8dee9",
  fontSize: 13,
  outline: "none",
  background: "white",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 54,
  borderRadius: 12,
  border: "1px solid #dbe2ea",
  padding: 9,
  fontSize: 12,
  resize: "vertical",
  boxSizing: "border-box",
  outline: "none",
  background: "white",
};

const saveButton: React.CSSProperties = {
  background: "linear-gradient(135deg, #16a34a, #15803d)",
  color: "white",
  border: "none",
  borderRadius: 14,
  padding: "10px 16px",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 13,
  alignSelf: "flex-start",
  boxShadow: "0 8px 18px rgba(22,163,74,0.18)",
};

const appointmentHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 14,
};

const pinkPill: React.CSSProperties = {
  display: "inline-flex",
  background: "#fce7f3",
  color: "#be185d",
  padding: "5px 9px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 11,
};

const appointmentStats: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const miniStat: React.CSSProperties = {
  minWidth: 74,
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: "7px 9px",
  textAlign: "center",
  fontSize: 12,
};

const appointmentLayout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.18fr 0.82fr",
  gap: 14,
};

const appointmentListBox: React.CSSProperties = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 14,
  boxShadow: "0 8px 18px rgba(15,23,42,0.035)",
};

const appointmentFormBox: React.CSSProperties = {
  background: "linear-gradient(135deg, #ffffff, #fdf2f8)",
  border: "1px solid #fbcfe8",
  borderRadius: 18,
  padding: 14,
  boxShadow: "0 8px 18px rgba(219,39,119,0.06)",
};

const formTopBadge: React.CSSProperties = {
  display: "inline-flex",
  background: "#fdf2f8",
  color: "#be185d",
  border: "1px solid #fbcfe8",
  padding: "5px 9px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
};

const boxTitle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 18,
  fontWeight: 900,
};

const emptyAppointmentBox: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px dashed #cbd5e1",
  borderRadius: 16,
  padding: 18,
  color: "#64748b",
  fontWeight: 750,
  fontSize: 13,
};

const appointmentCardButton: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  background: "linear-gradient(135deg, #ffffff, #f8fafc)",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 11,
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
  transition: "0.15s ease",
};

const appointmentIndex: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 12,
  background: "linear-gradient(135deg, #7c3aed, #db2777)",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  fontSize: 13,
  flexShrink: 0,
  boxShadow: "0 6px 14px rgba(219,39,119,0.14)",
};

const appointmentTopLine: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const appointmentTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: "#0f172a",
};

const statusBadge: React.CSSProperties = {
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 900,
};

const appointmentDate: React.CSSProperties = {
  marginTop: 3,
  color: "#4f46e5",
  fontWeight: 850,
  fontSize: 13,
};

const appointmentNote: React.CSSProperties = {
  marginTop: 7,
  background: "#f8fafc",
  borderRadius: 12,
  padding: 9,
  color: "#475569",
  fontSize: 13,
};

const planningBox: React.CSSProperties = {
  background: "#eef2ff",
  border: "1px solid #c7d2fe",
  borderRadius: 15,
  padding: 10,
};

const modeButton: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "8px 8px",
  fontWeight: 850,
  fontSize: 12,
  cursor: "pointer",
};

const manualDateBox: React.CSSProperties = {
  background: "#fdf2f8",
  border: "1px solid #fbcfe8",
  borderRadius: 15,
  padding: 10,
};

const appointmentSaveButton: React.CSSProperties = {
  background: "linear-gradient(135deg, #4f46e5, #db2777)",
  color: "white",
  border: "none",
  borderRadius: 14,
  padding: "11px 16px",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 13,
  boxShadow: "0 8px 18px rgba(219,39,119,0.18)",
};


const appointmentDetailModal: React.CSSProperties = {
  width: "min(560px, 100%)",
  background: "white",
  borderRadius: 22,
  overflow: "hidden",
  boxShadow: "0 24px 70px rgba(15,23,42,0.28)",
  border: "1px solid rgba(255,255,255,0.85)",
};

const appointmentDetailHeader: React.CSSProperties = {
  background: "linear-gradient(135deg, #0f172a, #4c1d95, #be185d)",
  color: "white",
  padding: 18,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const appointmentDetailPill: React.CSSProperties = {
  display: "inline-flex",
  background: "rgba(255,255,255,0.14)",
  color: "white",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
};

const appointmentDetailTitle: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: 24,
  fontWeight: 950,
};

const modalCloseButton: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.22)",
  background: "rgba(255,255,255,0.14)",
  color: "white",
  fontSize: 24,
  fontWeight: 900,
  cursor: "pointer",
  lineHeight: 1,
};

const appointmentDetailBody: React.CSSProperties = {
  padding: 18,
  display: "grid",
  gap: 12,
};

const detailInfoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const detailInfoCard: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  borderRadius: 16,
  padding: 12,
  display: "grid",
  gap: 4,
};

const detailNoteCard: React.CSSProperties = {
  border: "1px solid #fde68a",
  background: "#fffbeb",
  borderRadius: 16,
  padding: 12,
};

const appointmentDetailActions: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
};

const completeButton: React.CSSProperties = {
  border: "none",
  background: "#16a34a",
  color: "white",
  borderRadius: 13,
  padding: "10px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const cancelAppointmentButton: React.CSSProperties = {
  border: "none",
  background: "#e11d48",
  color: "white",
  borderRadius: 13,
  padding: "10px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const deleteAppointmentButton: React.CSSProperties = {
  border: "none",
  background: "#020617",
  color: "white",
  borderRadius: 13,
  padding: "10px 12px",
  fontWeight: 900,
  cursor: "pointer",
};
