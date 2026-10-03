"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";
import {
  HdUnsavedChangesDialog,
  type UnsavedAction,
} from "../../rapor-olustur/components/HdUnsavedChangesDialog";
import { useHdLeaveGuard } from "../../hooks/useHdLeaveGuard";
import {
  HUMAN_DESIGN_TYPES,
  HUMAN_DESIGN_AUTHORITIES,
  HUMAN_DESIGN_PROFILES,
  HUMAN_DESIGN_DEFINITIONS,
  HUMAN_DESIGN_CENTERS,
  HUMAN_DESIGN_CHANNELS,
  HUMAN_DESIGN_GATES,
} from "@/lib/human-design/constants";
import { listHdClients, type HdClientRow } from "../../danisanlar/helpers/hdClients";
import { loadClientChart, saveClientChart } from "../helpers/hdCharts";
import { GateTechnicalInfo } from "../../components/GateTechnicalInfo";
import { GateKnowledgeNotes } from "../../components/GateKnowledgeNotes";
import { loadKnowledgeForCodes, type KnowledgeGroup } from "../../rapor-olustur/helpers/hdRapor";
import {
  checkManualChartConsistency,
  MANUAL_CHART_CONFIRM_MESSAGE,
} from "@/lib/human-design/manualChartConsistency";
import { HdProfessionalReportButton } from "../../kayitli-haritalar/components/HdProfessionalReportButton";

function buildCodes(f: typeof emptyForm): string[] {
  const codes: string[] = [];
  if (f.type_code) codes.push(`tip_${f.type_code}`);
  if (f.authority_code) codes.push(`otorite_${f.authority_code}`);
  if (f.profile_code) codes.push(`profil_${f.profile_code}`);
  if (f.definition_code) codes.push(`tanim_${f.definition_code}`);
  for (const c of f.active_centers) codes.push(`merkez_tanimli_${c}`);
  for (const c of f.open_centers) codes.push(`merkez_acik_${c}`);
  for (const ch of f.channels) codes.push(`kanal_${ch.replace(/-/g, "_")}`);
  for (const g of f.gates) codes.push(`kapi_${g}`);
  return [...new Set(codes)];
}

const fieldBase =
  "w-full rounded-xl border border-indigo-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";
const labelCls = "mb-1.5 block text-xs font-bold text-slate-700";
const sectionCls = "mb-3 text-xs font-black uppercase tracking-widest text-indigo-700";

const emptyForm = {
  type_code: "",
  authority_code: "",
  profile_code: "",
  definition_code: "",
  active_centers: [] as string[],
  open_centers: [] as string[],
  gates: [] as number[],
  channels: [] as string[],
  notes: "",
};

type HdChartForm = typeof emptyForm;

// Kaydedilmemiş-değişiklik onay istemi (rapor ekranıyla aynı promise-tabanlı model).
type UnsavedPrompt = {
  title: string;
  message: string;
  actions: UnsavedAction[];
  resolve: (key: string) => void;
};

// Dirty karşılaştırması için sıra-bağımsız kararlı seri hâli (toggle sırası false-dirty üretmez).
function serializeForm(f: HdChartForm): string {
  return JSON.stringify({
    type_code: f.type_code,
    authority_code: f.authority_code,
    profile_code: f.profile_code,
    definition_code: f.definition_code,
    active_centers: [...f.active_centers].sort(),
    open_centers: [...f.open_centers].sort(),
    gates: [...f.gates].sort((a, b) => a - b),
    channels: [...f.channels].sort(),
    notes: f.notes,
  });
}

export function HdHaritaKaydiContent() {
  const { showToast } = useToast();
  const params = useSearchParams();
  const urlClientId = params.get("clientId") ?? "";

  const [clients, setClients] = useState<HdClientRow[]>([]);
  const [clientId, setClientId] = useState(urlClientId);
  const [form, setForm] = useState(emptyForm);
  // Son yüklenen/kaydedilen hâlin referansı — dirty hesabı buna dayanır (HD-P2-C).
  const [baseline, setBaseline] = useState<HdChartForm>(emptyForm);
  const [loadingChart, setLoadingChart] = useState(false);
  // P1-1: formdaki verinin AİT OLDUĞU danışan. Yalnız bu, seçili danışana eşit ve yükleme
  // başarılıysa form düzenlenebilir/kaydedilebilir. Danışan değişince anında "" olur →
  // eski danışanın değerleri yeni danışana asla kaydedilemez.
  const [loadedClientId, setLoadedClientId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  // P2-9: yüklenen haritanın sürümü (harita yoksa null) — kayıtta sunucuya gönderilir.
  const chartVersionRef = useRef<string | null>(null);
  // Bayat yanıt koruması: yalnız EN SON başlatılan yükleme sonucu uygulanır (A→B→C).
  const loadSeqRef = useRef(0);
  const [saving, setSaving] = useState(false);
  // Portal yalnız istemcide (hydration uyumu): mount sonrası açılır.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPortalReady(true);
  }, []);
  const [knowledgeGroups, setKnowledgeGroups] = useState<KnowledgeGroup[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [prompt, setPrompt] = useState<UnsavedPrompt | null>(null);
  // Başarılı kayıttan sonra "Profesyonel Word oluştur" CTA'sı için kaydedilen harita id'si.
  const [savedChartId, setSavedChartId] = useState<string | null>(null);

  // Manuel harita tutarlılık uyarıları (SAF; yalnız uyarı — kaydı ASLA engellemez).
  const consistencyWarnings = useMemo(() => checkManualChartConsistency(form), [form]);

  // Gerçek dirty: yüklenmiş baseline'dan sapma (sıra-bağımsız karşılaştırma).
  const dirty = useMemo(() => serializeForm(form) !== serializeForm(baseline), [form, baseline]);

  const formReady = !!clientId && loadedClientId === clientId && !loadingChart && !loadError;

  // Promise-tabanlı çoklu-seçenek onay (rapor ekranıyla aynı erişilebilir dialog).
  const askUnsaved = useCallback(
    (cfg: Omit<UnsavedPrompt, "resolve">): Promise<string> =>
      new Promise((resolve) => {
        setPrompt({ ...cfg, resolve });
      }),
    [],
  );

  // P2-7: kaydedilmemiş değişiklikte yenileme + uygulama içi link + geri tuşu korunur.
  const confirmLeave = useCallback(
    () =>
      askUnsaved({
        title: "Kaydedilmemiş harita değişiklikleri",
        message: "Sayfadan ayrılırsanız haritadaki kaydedilmemiş değişiklikler kaybolacaktır.",
        actions: [
          { key: "cancel", label: "Sayfada Kal", tone: "safe" },
          { key: "discard", label: "Değişiklikleri At ve Çık", tone: "danger" },
        ],
      }).then((k) => k === "discard"),
    [askUnsaved],
  );
  useHdLeaveGuard(dirty, confirmLeave);

  // Danışan listesini yükle
  useEffect(() => {
    listHdClients().then(({ rows }) => setClients(rows));
  }, []);

  // Form değişince bilgi bankasını debounce ile yükle
  useEffect(() => {
    const codes = buildCodes(form);
    if (codes.length === 0) {
      setKnowledgeGroups([]);
      setLoadingNotes(false);
      return;
    }
    setLoadingNotes(true);
    const timer = setTimeout(async () => {
      const { groups } = await loadKnowledgeForCodes(codes);
      setKnowledgeGroups(groups);
      setLoadingNotes(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [form]);

  // Seçili danışanın mevcut haritasını yükle (form + baseline birlikte kurulur → dirty=false).
  // P1-1: yükleme BAŞLARKEN form temizlenir; hata olursa eski danışanın değerleri ekranda
  // aktif form olarak KALMAZ ve kaydedilemez. Sıra numarası bayat yanıtları yok sayar.
  const loadChart = useCallback(async (id: string) => {
    const seq = ++loadSeqRef.current;
    setSavedChartId(null);
    setLoadError(null);
    setForm(emptyForm);
    setBaseline(emptyForm);
    setLoadedClientId("");
    chartVersionRef.current = null;
    if (!id) { setLoadingChart(false); return; }
    setLoadingChart(true);
    const { row, error } = await loadClientChart(id);
    if (seq !== loadSeqRef.current) return; // daha yeni bir danışan seçildi → bu yanıt bayat
    setLoadingChart(false);
    if (error) {
      setLoadError(error);
      showToast({ message: `Harita yüklenemedi: ${error}`, type: "error" });
      return;
    }
    chartVersionRef.current = (row?.updated_at as string | null | undefined) ?? null;
    setLoadedClientId(id);
    if (!row) return;
    const loaded: HdChartForm = {
      type_code: row.type_code ?? "",
      authority_code: row.authority_code ?? "",
      profile_code: row.profile_code ?? "",
      definition_code: row.definition_code ?? "",
      active_centers: row.active_centers ?? [],
      open_centers: row.open_centers ?? [],
      gates: row.gates ?? [],
      channels: row.channels ?? [],
      notes: row.notes ?? "",
    };
    setForm(loaded);
    setBaseline(loaded);
  }, [showToast]);

  useEffect(() => { loadChart(clientId); }, [clientId, loadChart]);

  // Danışan değişimi — dirty ise onay iste; kullanıcı vazgeçerse form/danışan KORUNUR.
  async function handleClientChange(newId: string) {
    if (newId === clientId || saving) return;
    if (dirty) {
      const choice = await askUnsaved({
        title: "Kaydedilmemiş harita değişiklikleri",
        message:
          "Başka bir danışana geçerseniz mevcut haritadaki kaydedilmemiş değişiklikler kaybolacaktır.",
        actions: [
          { key: "cancel", label: "Vazgeç", tone: "safe" },
          { key: "discard", label: "Değişiklikleri At ve Danışanı Değiştir", tone: "danger" },
        ],
      });
      // Vazgeç → select kontrollü olduğundan eski danışanda kalır; form korunur.
      if (choice !== "discard") return;
    }
    setClientId(newId); // loadChart useEffect'i formu + baseline'ı yeniler (dirty=false).
  }

  // "Yenile" — dirty ise onay iste; değilse doğrudan yeniden yükle.
  async function handleReload() {
    if (!clientId || loadingChart) return;
    if (dirty && formReady) {
      const choice = await askUnsaved({
        title: "Kaydedilmemiş harita değişiklikleri",
        message:
          "Yeniden yüklerseniz kaydedilmemiş değişiklikleriniz kaybolacak ve son kayıtlı hâl gelecektir.",
        actions: [
          { key: "cancel", label: "Vazgeç", tone: "safe" },
          { key: "discard", label: "Değişiklikleri At ve Yenile", tone: "danger" },
        ],
      });
      if (choice !== "discard") return;
    }
    await loadChart(clientId);
  }

  // Merkez toggle — iki listeden biri seçilebilir, diğerinden çıkarır
  function toggleCenter(code: string, as: "active" | "open") {
    setForm((p) => {
      if (as === "active") {
        const inActive = p.active_centers.includes(code);
        return {
          ...p,
          open_centers: p.open_centers.filter((c) => c !== code),
          active_centers: inActive
            ? p.active_centers.filter((c) => c !== code)
            : [...p.active_centers, code],
        };
      }
      const inOpen = p.open_centers.includes(code);
      return {
        ...p,
        active_centers: p.active_centers.filter((c) => c !== code),
        open_centers: inOpen
          ? p.open_centers.filter((c) => c !== code)
          : [...p.open_centers, code],
      };
    });
  }

  function toggleGate(gate: number) {
    setForm((p) => ({
      ...p,
      gates: p.gates.includes(gate)
        ? p.gates.filter((g) => g !== gate)
        : [...p.gates, gate].sort((a, b) => a - b),
    }));
  }

  function toggleChannel(code: string) {
    setForm((p) => ({
      ...p,
      channels: p.channels.includes(code)
        ? p.channels.filter((c) => c !== code)
        : [...p.channels, code],
    }));
  }

  async function handleSave() {
    if (readYasamUser()?.is_demo_account === true) {
      showToast({ message: "Demo hesabında harita kaydı yapılamaz.", type: "info" });
      return;
    }
    if (!clientId) {
      showToast({ message: "Danışan seçin.", type: "warning" });
      return;
    }
    if (saving) return;
    // P1-1: form bu danışan için başarıyla yüklenmeden kayıt YOK (yanlış danışana yazma engeli).
    if (!formReady) {
      showToast({ message: "Harita henüz yüklenmedi. Lütfen yüklemenin bitmesini bekleyin veya Tekrar Dene'ye basın.", type: "warning" });
      return;
    }
    const targetClientId = loadedClientId;
    // Tutarsızlık varsa ENGELLEMEYEN onay: kullanıcı "Yine de Kaydet" ile devam edebilir.
    if (consistencyWarnings.length > 0) {
      const choice = await askUnsaved({
        title: "Tutarsızlık uyarıları",
        message: MANUAL_CHART_CONFIRM_MESSAGE,
        actions: [
          { key: "cancel", label: "Vazgeç ve Kontrol Et", tone: "safe" },
          { key: "save", label: "Yine de Kaydet", tone: "primary" },
        ],
      });
      if (choice !== "save") return;
    }
    setSaving(true);
    const submitted = form;
    const { error, id: savedId, updatedAt, conflict } = await saveClientChart(targetClientId, {
      type_code: form.type_code || null,
      authority_code: form.authority_code || null,
      profile_code: form.profile_code || null,
      definition_code: form.definition_code || null,
      active_centers: form.active_centers,
      open_centers: form.open_centers,
      gates: form.gates,
      channels: form.channels,
      notes: form.notes.trim() || null,
    }, chartVersionRef.current);
    setSaving(false);
    if (error) {
      showToast({
        message: conflict ? error : `Hata: ${error}`,
        type: "error",
      });
    } else {
      // Başarılı kayıt → baseline kaydedilen hâle sabitlenir; dirty temizlenir.
      chartVersionRef.current = updatedAt ?? chartVersionRef.current;
      setBaseline(submitted);
      setSavedChartId(savedId ?? null);
      showToast({ message: "Harita kaydedildi.", type: "success" });
    }
  }

  const selectedClient = clients.find((c) => c.id === clientId);

  // P2-5: Kaydet/Yenile — masaüstünde form sonunda; mobilde (~7.500px form) body'ye portal edilmiş
  // SABİT alt çubukta her an erişilebilir (üst kapsayıcıdaki overflow/backdrop-filter sticky ve
  // fixed konumu bozduğu için portal; safe-area ile çakışmaz).
  const actionButtons = (
    <>
      <button
        type="button"
        onClick={handleReload}
        disabled={!clientId || loadingChart}
        className="h-10 rounded-xl border border-indigo-200/90 bg-white px-5 text-sm font-black uppercase tracking-wide text-indigo-900 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/80 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9"
      >
        Yenile
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !formReady}
        className="h-10 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-7 text-sm font-black uppercase tracking-wide text-white shadow-[0_4px_16px_-4px_rgba(79,70,229,0.4)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 sm:h-9"
      >
        {saving ? "Kaydediliyor..." : "Kaydet"}
      </button>
    </>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-indigo-200/80 bg-white/95 shadow-[0_8px_28px_-10px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-md">
      {/* Danışan Seçimi */}
      <div className="border-b border-indigo-100/80 bg-white/75 p-4">
        <label htmlFor="hd-client-select" className={labelCls}>Danışan Seç *</label>
        <select
          id="hd-client-select"
          value={clientId}
          onChange={(e) => handleClientChange(e.target.value)}
          className={`h-10 ${fieldBase}`}
        >
          <option value="">— Danışan seçin —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.birth_date ? ` · ${c.birth_date}` : ""}
              {c.birth_place ? ` · ${c.birth_place}` : ""}
            </option>
          ))}
        </select>
        {selectedClient && !loadError && (
          <p className="mt-1.5 text-xs text-slate-500" aria-live="polite">
            {loadingChart || loadedClientId !== clientId
              ? "Mevcut harita yükleniyor..."
              : "Mevcut harita kaydı varsa otomatik yüklendi."}
          </p>
        )}
      </div>

      {/* Form Alanları */}
      <div className="bg-gradient-to-b from-white/95 to-indigo-50/25 p-4">
        <div className="space-y-7">
          {/* P1-1: yükleme hatası — eski danışanın verisi gösterilmez/kaydedilmez; yeniden dene */}
          {loadError && clientId && (
            <div role="alert" className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 ring-1 ring-rose-100 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold text-rose-800">
                Bu danışanın haritası yüklenemedi ({loadError}). Veri kaybını önlemek için form kilitlendi.
              </p>
              <button
                type="button"
                onClick={() => void loadChart(clientId)}
                className="h-9 shrink-0 rounded-xl border border-rose-300 bg-white px-4 text-xs font-black uppercase tracking-wide text-rose-700 shadow-sm transition hover:bg-rose-50"
              >
                Tekrar Dene
              </button>
            </div>
          )}
          <fieldset disabled={!formReady} aria-busy={loadingChart} className="m-0 min-w-0 space-y-7 border-0 p-0 disabled:opacity-60">

          {/* Tip, Otorite, Profil, Tanım */}
          <section>
            <p className={sectionCls}>Temel Değerler</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="hd-type-select" className={labelCls}>Tip</label>
                <select
                  id="hd-type-select"
                  value={form.type_code}
                  onChange={(e) => setForm((p) => ({ ...p, type_code: e.target.value }))}
                  className={`h-9 ${fieldBase}`}
                >
                  <option value="">— Seçin —</option>
                  {HUMAN_DESIGN_TYPES.map((t) => (
                    <option key={t.code} value={t.code}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="hd-authority-select" className={labelCls}>Otorite</label>
                <select
                  id="hd-authority-select"
                  value={form.authority_code}
                  onChange={(e) => setForm((p) => ({ ...p, authority_code: e.target.value }))}
                  className={`h-9 ${fieldBase}`}
                >
                  <option value="">— Seçin —</option>
                  {HUMAN_DESIGN_AUTHORITIES.map((a) => (
                    <option key={a.code} value={a.code}>{a.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="hd-profile-select" className={labelCls}>Profil</label>
                <select
                  id="hd-profile-select"
                  value={form.profile_code}
                  onChange={(e) => setForm((p) => ({ ...p, profile_code: e.target.value }))}
                  className={`h-9 ${fieldBase}`}
                >
                  <option value="">— Seçin —</option>
                  {HUMAN_DESIGN_PROFILES.map((pr) => (
                    <option key={pr.code} value={pr.code}>{pr.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="hd-definition-select" className={labelCls}>Tanım</label>
                <select
                  id="hd-definition-select"
                  value={form.definition_code}
                  onChange={(e) => setForm((p) => ({ ...p, definition_code: e.target.value }))}
                  className={`h-9 ${fieldBase}`}
                >
                  <option value="">— Seçin —</option>
                  {HUMAN_DESIGN_DEFINITIONS.map((d) => (
                    <option key={d.code} value={d.code}>{d.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Merkezler */}
          <section>
            <p className={sectionCls}>Merkezler</p>
            <p className="mb-2 text-xs text-slate-500">
              Her merkez için Tanımlı veya Açık seçin. Aynı anda ikisi birden seçilemez.
            </p>
            <div className="overflow-x-auto rounded-xl border border-indigo-100/80">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-indigo-50/80">
                    <th className="px-4 py-2 text-left text-xs font-black uppercase tracking-wide text-slate-600">
                      Merkez
                    </th>
                    <th className="px-4 py-2 text-center text-xs font-black uppercase tracking-wide text-indigo-700">
                      Tanımlı
                    </th>
                    <th className="px-4 py-2 text-center text-xs font-black uppercase tracking-wide text-slate-500">
                      Açık
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-50/80">
                  {HUMAN_DESIGN_CENTERS.map((center) => {
                    const isActive = form.active_centers.includes(center.code);
                    const isOpen = form.open_centers.includes(center.code);
                    return (
                      <tr key={center.code} className="bg-white hover:bg-indigo-50/30 transition-colors">
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-800">
                          {center.label}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggleCenter(center.code, "active")}
                            aria-pressed={isActive}
                            aria-label={`${center.label} · Tanımlı`}
                            className={`h-7 w-20 rounded-lg border text-xs font-bold transition-all ${
                              isActive
                                ? "border-transparent bg-indigo-600 text-white shadow-sm"
                                : "border-indigo-200 bg-white text-slate-600 hover:border-indigo-400 hover:text-indigo-700"
                            }`}
                          >
                            {isActive ? "✓ Tanımlı" : "Tanımlı"}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggleCenter(center.code, "open")}
                            aria-pressed={isOpen}
                            aria-label={`${center.label} · Açık`}
                            className={`h-7 w-16 rounded-lg border text-xs font-bold transition-all ${
                              isOpen
                                ? "border-transparent bg-slate-500 text-white shadow-sm"
                                : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-700"
                            }`}
                          >
                            {isOpen ? "✓ Açık" : "Açık"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(form.active_centers.length > 0 || form.open_centers.length > 0) && (
              <p className="mt-2 text-xs text-slate-500">
                {form.active_centers.length > 0 && `Tanımlı: ${form.active_centers.length}`}
                {form.active_centers.length > 0 && form.open_centers.length > 0 && " · "}
                {form.open_centers.length > 0 && `Açık: ${form.open_centers.length}`}
              </p>
            )}
          </section>

          {/* Kanallar */}
          <section>
            <p className={sectionCls}>Kanallar</p>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-indigo-200/80 bg-white/70 p-3">
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {HUMAN_DESIGN_CHANNELS.map((ch) => {
                  const sel = form.channels.includes(ch.code);
                  return (
                    <label
                      key={ch.code}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                        sel ? "bg-indigo-50 text-indigo-800" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() => toggleChannel(ch.code)}
                        className="h-3.5 w-3.5 rounded border-indigo-300 accent-indigo-600"
                      />
                      {ch.label}
                    </label>
                  );
                })}
              </div>
            </div>
            {form.channels.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {form.channels.length} kanal seçildi
              </p>
            )}
          </section>

          {/* Kapılar */}
          <section>
            <p className={sectionCls}>Kapılar</p>
            <div className="rounded-xl border border-indigo-200/80 bg-white/70 p-3">
              <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                {HUMAN_DESIGN_GATES.map((gate) => {
                  const sel = form.gates.includes(gate.code);
                  return (
                    <button
                      key={gate.code}
                      type="button"
                      title={gate.label}
                      aria-label={gate.label}
                      aria-pressed={sel}
                      onClick={() => toggleGate(gate.code)}
                      className={`flex h-9 w-full items-center justify-center rounded-lg text-xs font-bold transition-all sm:h-8 ${
                        sel
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-800"
                      }`}
                    >
                      {gate.code}
                    </button>
                  );
                })}
              </div>
              {form.gates.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  Seçili kapılar: {form.gates.join(", ")}
                </p>
              )}
            </div>
          </section>

          {/* Kapı Teknik Bilgileri + Bilgi Bankası Yorumları */}
          {clientId && (
            <section>
              <p className={sectionCls}>Kapı Teknik Bilgileri</p>
              {form.gates.length > 0 || form.channels.length > 0 ? (
                <GateTechnicalInfo gates={form.gates} channels={form.channels} />
              ) : (
                <p className="text-xs text-slate-400">Henüz kapı ya da kanal seçilmedi.</p>
              )}
              <GateKnowledgeNotes groups={knowledgeGroups} loading={loadingNotes} />
            </section>
          )}

          {/* Notlar */}
          <section>
            <p className={sectionCls}>Notlar</p>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Harita ile ilgili uzman notları..."
              aria-label="Harita notları"
              rows={4}
              className={`${fieldBase} resize-y leading-relaxed`}
            />
          </section>

          {/* Tutarsızlık uyarıları (amber; engellemez) */}
          {consistencyWarnings.length > 0 && (
            <section
              role="status"
              aria-live="polite"
              className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 ring-1 ring-amber-100"
            >
              <p className="text-xs font-black uppercase tracking-widest text-amber-800">Tutarsızlık uyarıları</p>
              <p className="mt-1 text-xs text-amber-800/90">
                Girdiğiniz alanlar birbiriyle uyumsuz olabilir. Kaydetme engellenmez; lütfen dış kaynaktaki değerlerle karşılaştırın.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-medium text-amber-900">
                {consistencyWarnings.map((w) => (
                  <li key={`${w.code}:${w.message}`}>{w.message}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Kayıt sonrası: profesyonel Word CTA'sı (Android'de buton render edilmez; .no-android
              ile metin dahil tüm bölüm SSR'da gizlenir → yanıltıcı "Word oluşturabilirsiniz" kalmaz) */}
          {savedChartId && !dirty && (
            <section className="no-android flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 ring-1 ring-emerald-100 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold text-emerald-800">
                Harita kaydedildi. Bu haritadan profesyonel Word raporu oluşturabilirsiniz.
              </p>
              <HdProfessionalReportButton chartId={savedChartId} label="Profesyonel Word oluştur" />
            </section>
          )}

          </fieldset>

          {/* Aksiyon — masaüstünde form sonunda. P2-5: mobilde aşağıdaki sabit alt çubuk kullanılır. */}
          <div className="hidden items-center justify-end gap-3 border-t border-indigo-100/80 pt-4 sm:flex">
            {dirty && (
              <span className="mr-auto text-[11px] font-bold text-amber-700">Kaydedilmemiş değişiklikler</span>
            )}
            {actionButtons}
          </div>
          {/* Mobil sabit çubuğun içeriği örtmemesi için boşluk */}
          <div aria-hidden className="h-16 sm:hidden" />
        </div>
      </div>

      {portalReady &&
        createPortal(
          <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-end gap-2 border-t border-indigo-100/80 bg-white/95 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_-12px_rgba(79,70,229,0.35)] backdrop-blur-md sm:hidden">
            {dirty && <span className="mr-auto text-[11px] font-bold text-amber-700">Kaydedilmemiş</span>}
            {actionButtons}
          </div>,
          document.body,
        )}

      {/* Kaydedilmemiş-değişiklik onay dialog'u (erişilebilir; rapor ekranıyla aynı) */}
      {prompt && (
        <HdUnsavedChangesDialog
          title={prompt.title}
          message={prompt.message}
          actions={prompt.actions}
          onAction={(key) => {
            const r = prompt.resolve;
            setPrompt(null);
            r(key);
          }}
        />
      )}
    </div>
  );
}
