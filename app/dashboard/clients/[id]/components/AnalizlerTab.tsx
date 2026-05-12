"use client";

import { useEffect, useMemo, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

type AnalizlerTabProps = {
  clientId: string;
  clientName: string;
};

type AnalysisType = "chakra" | "planet";

type ChakraRow = {
  key: string;
  label: string;
  color: string;
};

type ChakraRowValue = {
  mark: string;
  male: string;
  female: string;
};

type SavedAnalysis = {
  id: string;
  tenant_id: string;
  client_id: string;
  analysis_type: AnalysisType | string | null;
  analysis_data: any;
  note: string | null;
  created_at: string;
};

const energyBodies: ChakraRow[] = [
  { key: "ruhsal", label: "RUHSAL ENERJİ BEDENİ", color: "#6d5bd0" },
  { key: "zihinsel", label: "ZİHİNSEL ENERJİ BEDENİ", color: "#43a047" },
  { key: "duygusal", label: "DUYGUSAL ENERJİ BEDENİ", color: "#f2b824" },
  { key: "eterik", label: "ETERİK ENERJİ BEDENİ", color: "#2196c9" },
  { key: "fiziksel", label: "FİZİKSEL ENERJİ BEDENİ", color: "#4b5563" },
];

const chakras: ChakraRow[] = [
  { key: "tac", label: "TEPE / TAÇ ÇAKRASI", color: "#a78bfa" },
  { key: "goz", label: "3. GÖZ ÇAKRASI", color: "#6366f1" },
  { key: "bogaz", label: "BOĞAZ ÇAKRASI", color: "#38bdf8" },
  { key: "kalp", label: "KALP ÇAKRASI", color: "#22c55e" },
  { key: "mide", label: "MİDE ÇAKRASI", color: "#facc15" },
  { key: "sakral", label: "SAKRAL (KARIN) ÇAKRASI", color: "#f97316" },
  { key: "kok", label: "KÖK ÇAKRASI", color: "#ef4444" },
];

const planetLabels = ["GÜNEŞ", "AY", "MERKÜR", "MARS", "VENÜS"];
const planetColors = ["#facc15", "#93c5fd", "#86efac", "#fca5a5", "#f9a8d4"];

const planetRows: ChakraRow[] = [
  { key: "tac", label: "TEPE / TAÇ", color: "#a78bfa" },
  { key: "goz", label: "3. GÖZ", color: "#6366f1" },
  { key: "bogaz", label: "BOĞAZ", color: "#38bdf8" },
  { key: "kalp", label: "KALP", color: "#22c55e" },
  { key: "mide", label: "MİDE", color: "#facc15" },
  { key: "sakral", label: "SAKRAL (KARIN)", color: "#f97316" },
  { key: "kok", label: "KÖK", color: "#ef4444" },
];

function makeChakraInitialValues() {
  const values: Record<string, ChakraRowValue> = {};

  ["before_energy", "after_energy"].forEach((scope) => {
    energyBodies.forEach((row) => {
      values[`${scope}_${row.key}`] = { mark: "", male: "", female: "" };
    });
  });

  ["before_chakra", "after_chakra"].forEach((scope) => {
    chakras.forEach((row) => {
      values[`${scope}_${row.key}`] = { mark: "", male: "", female: "" };
    });
  });

  return values;
}

function makePlanetInitialValues() {
  const values: Record<string, string> = {};

  ["before", "after"].forEach((scope) => {
    planetRows.forEach((row) => {
      planetLabels.forEach((planet) => {
        values[`${scope}_${row.key}_${planet}`] = "";
      });
    });
  });

  return values;
}

function safeFileName(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function valueStyle(value: string): React.CSSProperties {
  const trimmed = value.trim();

  if (trimmed.startsWith("+")) {
    return {
      borderColor: "#22c55e",
      background: "#f0fdf4",
      color: "#166534",
      boxShadow: "0 0 0 2px rgba(34,197,94,0.10)",
    };
  }

  if (trimmed.startsWith("-")) {
    return {
      borderColor: "#ef4444",
      background: "#fef2f2",
      color: "#991b1b",
      boxShadow: "0 0 0 2px rgba(239,68,68,0.10)",
    };
  }

  return {};
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

function getAnalysisLabel(type: string | null | undefined) {
  if (type === "planet") return "Ç.Gezegen Analizi";
  return "Çakra Analizi";
}

export default function AnalizlerTab({ clientId, clientName }: AnalizlerTabProps) {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisType | null>(null);
  const [chakraValues, setChakraValues] = useState<Record<string, ChakraRowValue>>(
    () => makeChakraInitialValues()
  );
  const [planetValues, setPlanetValues] = useState<Record<string, string>>(
    () => makePlanetInitialValues()
  );
  const [note, setNote] = useState("");
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [savingAnalysis, setSavingAnalysis] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);

  const activeTitle = activeAnalysis === "planet" ? "Ç.Gezegen Analizi" : "Çakra Analizi";

  const todayText = useMemo(() => {
    return new Date().toLocaleDateString("tr-TR");
  }, []);

  useEffect(() => {
    loadSavedAnalyses();
  }, [clientId]);

  async function loadSavedAnalyses() {
    if (!clientId) return;

    setLoadingSaved(true);

    const { data, error } = await supabase
      .from("client_analyses")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Analizler yüklenemedi:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Analizler yüklenemedi: " + error.message,
        type: "error",
      });
      setLoadingSaved(false);
      return;
    }

    setSavedAnalyses((data || []) as SavedAnalysis[]);
    setLoadingSaved(false);
  }

  function openNewAnalysis(type: AnalysisType) {
    setActiveAnalysis(type);

    if (type === "planet") {
      setPlanetValues(makePlanetInitialValues());
    } else {
      setChakraValues(makeChakraInitialValues());
    }

    setNote("");
  }

  function openSavedAnalysis(item: SavedAnalysis) {
    const type = item.analysis_type === "planet" ? "planet" : "chakra";

    setActiveAnalysis(type);
    setNote(item.note || "");

    if (type === "planet") {
      setPlanetValues(item.analysis_data?.values || makePlanetInitialValues());
    } else {
      setChakraValues(item.analysis_data?.values || makeChakraInitialValues());
    }
  }

  async function deleteSavedAnalysis(id: string) {
    const ok = await confirm({
      message: "Bu analiz kaydı silinsin mi?",
      tone: "danger",
      title: "Analizi sil",
      confirmText: "Sil",
      cancelText: "Vazgeç",
    });
    if (!ok) return;

    const { error } = await supabase
      .from("client_analyses")
      .delete()
      .eq("id", id)
      .eq("tenant_id", TENANT_ID)
      .eq("client_id", clientId);

    if (error) {
      showToast({
        title: "İşlem başarısız",
        message: "Analiz silinemedi: " + error.message,
        type: "error",
      });
      return;
    }

    setSavedAnalyses((oldItems) => oldItems.filter((item) => item.id !== id));
    showToast({
      title: "Başarılı",
      message: "Analiz silindi.",
      type: "success",
    });
  }

  function updateChakraValue(key: string, field: keyof ChakraRowValue, value: string) {
    setChakraValues((oldValues) => ({
      ...oldValues,
      [key]: {
        ...(oldValues[key] || { mark: "", male: "", female: "" }),
        [field]: value,
      },
    }));
  }

  function updatePlanetValue(key: string, value: string) {
    setPlanetValues((oldValues) => ({
      ...oldValues,
      [key]: value,
    }));
  }

  async function clearAll() {
    const ok = await confirm({
      message: "Bu analizdeki tüm alanlar temizlensin mi?",
      tone: "warning",
      title: "Alanları temizle",
      confirmText: "Temizle",
      cancelText: "Vazgeç",
    });
    if (!ok) return;

    if (activeAnalysis === "planet") {
      setPlanetValues(makePlanetInitialValues());
    } else {
      setChakraValues(makeChakraInitialValues());
    }

    setNote("");
  }

  async function printPdf() {
    const element = document.getElementById("analysis-print-area");

    if (!element) {
      showToast({
        title: "İşlem başarısız",
        message: "PDF alanı bulunamadı.",
        type: "error",
      });
      return;
    }

    try {
      setCreatingPdf(true);

      await new Promise((resolve) => setTimeout(resolve, 300));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        ignoreElements: (node) => {
          return node instanceof HTMLElement && node.classList.contains("no-pdf");
        },
      });

      const imageData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const margin = 6;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      const imageWidth = usableWidth;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;

      let heightLeft = imageHeight;
      let position = margin;

      pdf.addImage(imageData, "PNG", margin, position, imageWidth, imageHeight);
      heightLeft -= usableHeight;

      while (heightLeft > 0) {
        position = margin + heightLeft - imageHeight;
        pdf.addPage();
        pdf.addImage(imageData, "PNG", margin, position, imageWidth, imageHeight);
        heightLeft -= usableHeight;
      }

      const fileName = `${safeFileName(clientName || "danisan")}-${safeFileName(activeTitle)}.pdf`;
      pdf.save(fileName);

      showToast({
        title: "Başarılı",
        message: "PDF dosyası indirildi.",
        type: "success",
      });
    } catch (error) {
      console.error("PDF oluşturma hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: "PDF oluşturulamadı. Konsolu kontrol edelim.",
        type: "error",
      });
    } finally {
      setCreatingPdf(false);
    }
  }

  async function saveAnalysis() {
    if (!activeAnalysis) {
      showToast({
        title: "İşlem başarısız",
        message: "Önce analiz seçmelisiniz.",
        type: "error",
      });
      return;
    }

    setSavingAnalysis(true);

    const analysisData = {
      title: activeTitle,
      values: activeAnalysis === "planet" ? planetValues : chakraValues,
      saved_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("client_analyses").insert({
      tenant_id: TENANT_ID,
      client_id: clientId,
      analysis_type: activeAnalysis,
      analysis_data: analysisData,
      note,
    });

    if (error) {
      console.error("Analiz kaydedilemedi:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Analiz kaydedilemedi: " + error.message,
        type: "error",
      });
      setSavingAnalysis(false);
      return;
    }

    await loadSavedAnalyses();
    showToast({
      title: "Başarılı",
      message: "Analiz kaydedildi.",
      type: "success",
    });
    setSavingAnalysis(false);
  }

  function exportWord() {
    showToast({
      title: "Bilgi",
      message:
        "Word çıktısını bir sonraki aşamada ekleyeceğiz. Önce PDF ve kayıt düzenini kilitliyoruz.",
      type: "info",
    });
  }

  return (
    <div style={pageWrap}>
      <div style={sectionHead}>
        <div>
          <div style={purplePill}>Enerji & Analiz Merkezi</div>
          <h2 style={sectionTitle}>Danışan Analizleri</h2>
          <p style={mutedText}>
            {clientName} için çakra, Ç.Gezegen, numeroloji ve Human Design analizleri burada toplanacak.
          </p>
        </div>
      </div>

      <div style={analysisGrid}>
        <AnalysisCard
          badge="Enerji Analizi"
          title="Çakra Analizi"
          text="Seans öncesi ve sonrası enerji değişimlerini çakra düzeni üzerinden takip edin."
          gradient="linear-gradient(135deg,#8b5cf6,#6d28d9)"
          buttonColor="#6d28d9"
          onOpen={() => openNewAnalysis("chakra")}
        />

        <AnalysisCard
          badge="Gezegen Analizi"
          title="Ç.Gezegen Analizi"
          text="Çakraların gezegensel enerji dengesini seans bazlı değerlendirin."
          gradient="linear-gradient(135deg,#0ea5e9,#2563eb)"
          buttonColor="#2563eb"
          onOpen={() => openNewAnalysis("planet")}
        />
      </div>

      <section style={savedPanel}>
        <div style={savedHeader}>
          <div>
            <div style={savedPill}>Kayıtlı Analizler</div>
            <h3 style={savedTitle}>Analiz Geçmişi</h3>
            <p style={savedDesc}>Kaydedilen analizleri buradan tekrar açabilir veya silebilirsin.</p>
          </div>

          <button type="button" onClick={loadSavedAnalyses} style={refreshButton}>
            {loadingSaved ? "Yükleniyor..." : "Yenile"}
          </button>
        </div>

        {savedAnalyses.length === 0 ? (
          <div style={emptySavedBox}>Henüz kayıtlı analiz yok.</div>
        ) : (
          <div style={savedList}>
            {savedAnalyses.map((item) => (
              <div key={item.id} style={savedItem}>
                <div>
                  <div style={savedItemTitle}>{getAnalysisLabel(item.analysis_type)}</div>
                  <div style={savedItemDate}>{formatDateTimeTR(item.created_at)}</div>
                  {item.note && <div style={savedItemNote}>{item.note.slice(0, 90)}{item.note.length > 90 ? "..." : ""}</div>}
                </div>

                <div style={savedActions}>
                  <button type="button" onClick={() => openSavedAnalysis(item)} style={openButton}>
                    Aç
                  </button>

                  <button type="button" onClick={() => deleteSavedAnalysis(item.id)} style={deleteButton}>
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {activeAnalysis && (
        <div style={modalOverlay}>
          <div style={modalCard}>
            <div id="analysis-print-area" style={pdfArea}>
              <div style={modalHeader}>
                <div>
                  <div style={modalPill}>Analiz Formu</div>
                  <h3 style={modalTitle}>{activeTitle}</h3>
                  <p style={modalSubtitle}>
                    Danışan: <strong>{clientName}</strong> · Tarih: <strong>{todayText}</strong>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveAnalysis(null)}
                  style={closeButton}
                  className="no-pdf"
                >
                  ×
                </button>
              </div>

              <div style={modalBody}>
                {activeAnalysis === "chakra" ? (
                  <ChakraAnalysis
                    values={chakraValues}
                    updateValue={updateChakraValue}
                  />
                ) : (
                  <PlanetAnalysis
                    values={planetValues}
                    updateValue={updatePlanetValue}
                  />
                )}

                <div style={noteCard}>
                  <label style={noteLabel}>Analiz Notu</label>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Analiz yorumu, seans gözlemi veya danışana özel not..."
                    style={noteArea}
                  />
                </div>
              </div>
            </div>

            <div style={stickyActions} className="no-pdf">
              <button type="button" onClick={clearAll} style={lightButton}>
                Tümünü Temizle
              </button>

              <button type="button" onClick={printPdf} disabled={creatingPdf} style={pdfButton}>
                {creatingPdf ? "PDF Hazırlanıyor..." : "PDF Al"}
              </button>

              <button type="button" onClick={exportWord} style={wordButton}>
                Word Al
              </button>

              <button type="button" onClick={saveAnalysis} disabled={savingAnalysis} style={saveButton}>
                {savingAnalysis ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChakraAnalysis({
  values,
  updateValue,
}: {
  values: Record<string, ChakraRowValue>;
  updateValue: (key: string, field: keyof ChakraRowValue, value: string) => void;
}) {
  return (
    <div style={chakraLayout}>
      <ChakraSection
        title="Seans Öncesi — Enerji Bedenleri"
        scope="before_energy"
        rows={energyBodies}
        values={values}
        updateValue={updateValue}
      />

      <ChakraSection
        title="Seans Sonrası — Enerji Bedenleri"
        scope="after_energy"
        rows={energyBodies}
        values={values}
        updateValue={updateValue}
      />

      <ChakraSection
        title="Çakralar — Seans Öncesi"
        scope="before_chakra"
        rows={chakras}
        values={values}
        updateValue={updateValue}
      />

      <ChakraSection
        title="Çakralar — Seans Sonrası"
        scope="after_chakra"
        rows={chakras}
        values={values}
        updateValue={updateValue}
      />
    </div>
  );
}

function ChakraSection({
  title,
  scope,
  rows,
  values,
  updateValue,
}: {
  title: string;
  scope: string;
  rows: ChakraRow[];
  values: Record<string, ChakraRowValue>;
  updateValue: (key: string, field: keyof ChakraRowValue, value: string) => void;
}) {
  return (
    <section style={schemaCard}>
      <div style={schemaTitle}>{title}</div>

      <div style={chakraHeader}>
        <div />
        <strong>İŞARET +/- · SAYI %</strong>
        <strong>ERİL ENERJİ</strong>
        <strong>DİŞİL ENERJİ</strong>
      </div>

      {rows.map((row) => {
        const key = `${scope}_${row.key}`;
        const rowValue = values[key] || { mark: "", male: "", female: "" };

        return (
          <div key={key} style={chakraRow}>
            <div
              style={{
                ...colorLabel,
                background: row.color,
              }}
            >
              {row.label}
            </div>

            <input
              value={rowValue.mark}
              onChange={(event) => updateValue(key, "mark", event.target.value)}
              placeholder="+10 / -20"
              style={{ ...schemaInput, ...valueStyle(rowValue.mark) }}
            />

            <input
              value={rowValue.male}
              onChange={(event) => updateValue(key, "male", event.target.value)}
              placeholder="Eril"
              style={{ ...schemaInput, ...valueStyle(rowValue.male) }}
            />

            <input
              value={rowValue.female}
              onChange={(event) => updateValue(key, "female", event.target.value)}
              placeholder="Dişil"
              style={{ ...schemaInput, ...valueStyle(rowValue.female) }}
            />
          </div>
        );
      })}
    </section>
  );
}

function PlanetAnalysis({
  values,
  updateValue,
}: {
  values: Record<string, string>;
  updateValue: (key: string, value: string) => void;
}) {
  return (
    <div style={planetLayout}>
      <PlanetPanel title="Seans Öncesi" scope="before" values={values} updateValue={updateValue} />
      <PlanetPanel title="Seans Sonrası" scope="after" values={values} updateValue={updateValue} />
    </div>
  );
}

function PlanetPanel({
  title,
  scope,
  values,
  updateValue,
}: {
  title: string;
  scope: string;
  values: Record<string, string>;
  updateValue: (key: string, value: string) => void;
}) {
  return (
    <section style={planetPanel}>
      <div style={schemaTitle}>{title}</div>

      <div
        style={{
          ...planetGrid,
          gridTemplateColumns: `132px repeat(${planetLabels.length}, minmax(86px, 1fr))`,
        }}
      >
        <div style={planetEmpty} />

        {planetLabels.map((planet, index) => (
          <div
            key={planet}
            style={{
              ...planetHeaderCell,
              background: planetColors[index],
            }}
          >
            {planet}
          </div>
        ))}

        {planetRows.map((row) => (
          <div key={row.key} style={{ display: "contents" }}>
            <div
              style={{
                ...planetRowLabel,
                background: row.color,
              }}
            >
              {row.label}
            </div>

            {planetLabels.map((planet) => {
              const key = `${scope}_${row.key}_${planet}`;
              const value = values[key] || "";

              return (
                <input
                  key={key}
                  value={value}
                  onChange={(event) => updateValue(key, event.target.value)}
                  placeholder="+30 / -20"
                  style={{ ...planetInput, ...valueStyle(value) }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function AnalysisCard({
  badge,
  title,
  text,
  gradient,
  buttonColor,
  onOpen,
}: {
  badge: string;
  title: string;
  text: string;
  gradient: string;
  buttonColor: string;
  onOpen: () => void;
}) {
  return (
    <div style={{ ...analysisCard, background: gradient }}>
      <div style={cardBadge}>{badge}</div>
      <h3 style={cardTitle}>{title}</h3>
      <p style={cardText}>{text}</p>

      <button
        type="button"
        onClick={onOpen}
        style={{
          ...cardButton,
          color: buttonColor,
        }}
      >
        Analizi Aç
      </button>
    </div>
  );
}

const pageWrap: React.CSSProperties = {
  width: "100%",
  position: "relative",
};

const sectionHead: React.CSSProperties = {
  marginBottom: 10,
};

const purplePill: React.CSSProperties = {
  display: "inline-flex",
  background: "#f3e8ff",
  color: "#7e22ce",
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

const mutedText: React.CSSProperties = {
  marginTop: 6,
  color: "#64748b",
  fontSize: 13,
};

const analysisGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
  gap: 12,
  marginTop: 14,
};

const analysisCard: React.CSSProperties = {
  borderRadius: 18,
  padding: 16,
  color: "white",
  boxShadow: "0 14px 30px rgba(15,23,42,0.14)",
};

const cardBadge: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.85,
};

const cardTitle: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: 22,
  fontWeight: 900,
};

const cardText: React.CSSProperties = {
  marginTop: 8,
  lineHeight: 1.45,
  opacity: 0.9,
  fontSize: 13,
};

const cardButton: React.CSSProperties = {
  marginTop: 12,
  border: "none",
  background: "white",
  padding: "8px 12px",
  borderRadius: 11,
  fontWeight: 900,
  cursor: "pointer",
};

const savedPanel: React.CSSProperties = {
  marginTop: 14,
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 14,
  boxShadow: "0 10px 26px rgba(15,23,42,0.05)",
};

const savedHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const savedPill: React.CSSProperties = {
  display: "inline-flex",
  background: "#e0f2fe",
  color: "#0369a1",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
};

const savedTitle: React.CSSProperties = {
  margin: "7px 0 0",
  fontSize: 18,
  fontWeight: 950,
};

const savedDesc: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
  fontSize: 12,
};

const refreshButton: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  color: "#334155",
  borderRadius: 12,
  padding: "8px 12px",
  fontWeight: 900,
  fontSize: 12,
  cursor: "pointer",
};

const emptySavedBox: React.CSSProperties = {
  marginTop: 12,
  border: "1px dashed #cbd5e1",
  background: "#f8fafc",
  borderRadius: 14,
  padding: 14,
  color: "#64748b",
  fontSize: 13,
  fontWeight: 750,
};

const savedList: React.CSSProperties = {
  marginTop: 12,
  display: "grid",
  gap: 9,
};

const savedItem: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  background: "linear-gradient(135deg,#ffffff,#f8fafc)",
  borderRadius: 14,
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const savedItemTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#0f172a",
};

const savedItemDate: React.CSSProperties = {
  marginTop: 3,
  fontSize: 11,
  fontWeight: 750,
  color: "#64748b",
};

const savedItemNote: React.CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  color: "#475569",
  background: "#f1f5f9",
  borderRadius: 10,
  padding: "6px 8px",
};

const savedActions: React.CSSProperties = {
  display: "flex",
  gap: 7,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const openButton: React.CSSProperties = {
  border: "none",
  background: "#2563eb",
  color: "white",
  borderRadius: 11,
  padding: "7px 11px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const deleteButton: React.CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#dc2626",
  borderRadius: 11,
  padding: "7px 11px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  background: "rgba(15,23,42,0.58)",
  backdropFilter: "blur(7px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 10,
};

const modalCard: React.CSSProperties = {
  width: "min(98vw, 1780px)",
  height: "94vh",
  overflowY: "auto",
  background: "linear-gradient(135deg,#ffffff,#f8fafc)",
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.85)",
  boxShadow: "0 24px 70px rgba(15,23,42,0.34)",
  position: "relative",
};

const pdfArea: React.CSSProperties = {
  background: "#ffffff",
};

const modalHeader: React.CSSProperties = {
  background: "linear-gradient(135deg,#111827,#4c1d95,#be185d)",
  color: "white",
  padding: 14,
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
};

const modalPill: React.CSSProperties = {
  display: "inline-flex",
  background: "rgba(255,255,255,0.16)",
  color: "white",
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
};

const modalTitle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 22,
  fontWeight: 950,
};

const modalSubtitle: React.CSSProperties = {
  margin: "5px 0 0",
  fontSize: 12,
  opacity: 0.92,
};

const closeButton: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.22)",
  background: "rgba(255,255,255,0.14)",
  color: "white",
  fontSize: 22,
  fontWeight: 900,
  cursor: "pointer",
  lineHeight: 1,
};

const modalBody: React.CSSProperties = {
  padding: 12,
  display: "grid",
  gap: 9,
  paddingBottom: 18,
};

const chakraLayout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 9,
};

const schemaCard: React.CSSProperties = {
  background: "white",
  border: "1px solid #bfdbfe",
  borderRadius: 15,
  padding: 10,
  boxShadow: "0 6px 14px rgba(15,23,42,0.04)",
};

const schemaTitle: React.CSSProperties = {
  display: "inline-flex",
  background: "#eff6ff",
  color: "#2563eb",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 950,
  marginBottom: 6,
};

const chakraHeader: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 132px 132px 132px",
  gap: 7,
  marginBottom: 7,
  color: "#2563eb",
  fontSize: 10,
};

const chakraRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 132px 132px 132px",
  gap: 7,
  marginBottom: 7,
  alignItems: "center",
};

const colorLabel: React.CSSProperties = {
  minHeight: 31,
  borderRadius: 0,
  color: "white",
  display: "flex",
  alignItems: "center",
  padding: "0 11px",
  fontSize: 11,
  fontWeight: 950,
};

const schemaInput: React.CSSProperties = {
  width: "100%",
  minHeight: 31,
  borderRadius: 9,
  border: "1px solid #bfdbfe",
  background: "white",
  padding: "5px 8px",
  fontSize: 12,
  fontWeight: 850,
  outline: "none",
  boxSizing: "border-box",
};

const planetLayout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const planetPanel: React.CSSProperties = {
  background: "white",
  border: "1px solid #bfdbfe",
  borderRadius: 13,
  padding: 8,
  boxShadow: "0 6px 14px rgba(15,23,42,0.04)",
  overflowX: "auto",
};

const planetGrid: React.CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 620,
};

const planetEmpty: React.CSSProperties = {
  background: "#f8fafc",
  borderRadius: 10,
  minHeight: 98,
};

const planetHeaderCell: React.CSSProperties = {
  minHeight: 98,
  borderRadius: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#075985",
  fontSize: 11,
  fontWeight: 950,
};

const planetRowLabel: React.CSSProperties = {
  minHeight: 30,
  borderRadius: 999,
  display: "flex",
  alignItems: "center",
  padding: "0 8px",
  color: "white",
  fontSize: 10,
  fontWeight: 950,
};

const planetInput: React.CSSProperties = {
  minHeight: 30,
  borderRadius: 9,
  border: "1px solid #bfdbfe",
  background: "white",
  padding: "5px 7px",
  fontSize: 11,
  fontWeight: 850,
  outline: "none",
  boxSizing: "border-box",
  width: "100%",
};

const noteCard: React.CSSProperties = {
  background: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: 12,
  padding: 7,
};

const noteLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  color: "#92400e",
};

const noteArea: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  marginTop: 4,
  borderRadius: 9,
  border: "1px solid #fcd34d",
  padding: 6,
  fontSize: 10,
  outline: "none",
  resize: "vertical",
  boxSizing: "border-box",
  background: "white",
};

const stickyActions: React.CSSProperties = {
  position: "sticky",
  bottom: 0,
  zIndex: 3,
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
  background: "rgba(248,250,252,0.95)",
  borderTop: "1px solid #e2e8f0",
  padding: "9px 12px",
  backdropFilter: "blur(10px)",
};

const baseToolbarButton: React.CSSProperties = {
  border: "none",
  borderRadius: 11,
  padding: "8px 13px",
  fontWeight: 950,
  fontSize: 12,
  cursor: "pointer",
};

const lightButton: React.CSSProperties = {
  ...baseToolbarButton,
  background: "#f1f5f9",
  color: "#334155",
  border: "1px solid #cbd5e1",
};

const pdfButton: React.CSSProperties = {
  ...baseToolbarButton,
  background: "#ef4444",
  color: "white",
  opacity: 1,
};

const wordButton: React.CSSProperties = {
  ...baseToolbarButton,
  background: "#2563eb",
  color: "white",
};

const saveButton: React.CSSProperties = {
  ...baseToolbarButton,
  background: "#16a34a",
  color: "white",
};
