"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDateAbsolute } from "@/lib/i18n/format";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { odevDurumClass, aggregateHomeworks } from "@/lib/odevStatus";
import { todayInZone } from "@/lib/time/reportTime";
import { validateHomeworkDates } from "@/lib/danisan/homeworkDates";
import {
  applyDateFieldChange,
  initDateFields,
  parseDurationDays,
  type DateAnchor,
} from "@/lib/danisan/homeworkDuration";
import { dyp } from "@/app/_premium/danisan-yolculugu/DypUi";

type HomeworkStatus = "bekliyor" | "devam" | "tamamlandi" | "gecikti" | "iptal";

type ClientHomework = {
  /** DY-03: satır sürümü (atomik CAS). */
  row_version?: number;
  id: string;
  tenant_id: string;
  client_id: string;
  title: string | null;
  homework_type: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: HomeworkStatus | null;
  expert_note: string | null;
  client_feedback: string | null;
  alert_dismissed_at: string | null;
  created_at: string;
};

type HomeworkTabProps = {
  clientId: string;
};

type HomeworkFormState = {
  title: string;
  homeworkType: string;
  description: string;
  startDate: string;
  endDate: string;
  /** WT7 "Kaç gün sonra?" — yalnız form yardımcısı (kaydedilmez; kalıcı olan endDate). */
  durationDays: string;
  /** Son tarih işlemi: "days" = bitiş gün sayısından, "end" = bitiş elle/kayıtlı. */
  dateAnchor: DateAnchor;
  status: HomeworkStatus;
  expertNote: string;
  clientFeedback: string;
};

type ModalEditorState = {
  title: string;
  value: string;
  onSave: (value: string) => void;
} | null;

type ReadModalState = {
  title: string;
  value: string;
  icon: string;
} | null;

const emptyForm: HomeworkFormState = {
  title: "",
  homeworkType: "",
  description: "",
  startDate: "",
  endDate: "",
  durationDays: "",
  dateAnchor: "end",
  status: "devam",
  expertNote: "",
  clientFeedback: "",
};

// Form varsayılanı + gecikme kontrolü: İstanbul takvim günü (UTC "dün" hatası yok).
function todayISO() {
  return todayInZone();
}

function isFormEmpty(form: HomeworkFormState) {
  return (
    !form.title.trim() &&
    !form.homeworkType.trim() &&
    !form.description.trim() &&
    !form.startDate.trim() &&
    !form.endDate.trim() &&
    !form.expertNote.trim() &&
    !form.clientFeedback.trim()
  );
}

function formToPayload(form: HomeworkFormState) {
  return {
    title: form.title.trim(),
    homework_type: form.homeworkType.trim(),
    description: form.description.trim(),
    start_date: form.startDate || null,
    end_date: form.endDate || null,
    status: form.status,
    alert_dismissed_at: null,
    expert_note: form.expertNote.trim(),
    client_feedback: form.clientFeedback.trim(),
  };
}

function homeworkToForm(item: ClientHomework): HomeworkFormState {
  return {
    title: item.title || "",
    homeworkType: item.homework_type || "",
    description: item.description || "",
    // Düzenleme: kayıtlı tarihler AYNEN; gün sayısı yalnız bilgi (anchor "end").
    ...initDateFields(item.start_date || "", item.end_date || ""),
    status: item.status || "devam",
    expertNote: item.expert_note || "",
    clientFeedback: item.client_feedback || "",
  };
}

/** Tarih alanları birbirine bağlı ("son işlem kazanır" — lib/danisan/homeworkDuration); diğerleri düz atama. */
function withFieldChange<K extends keyof HomeworkFormState>(
  prev: HomeworkFormState,
  key: K,
  value: HomeworkFormState[K],
): HomeworkFormState {
  if (key === "startDate" || key === "endDate" || key === "durationDays") {
    return { ...prev, ...applyDateFieldChange(prev, key, String(value)) };
  }
  return { ...prev, [key]: value };
}

/** Gün sayısı geçersizken (ve son işlem o iken) kayıt engellenir — bitiş belirsiz kalmasın. */
function durationBlocksSave(form: HomeworkFormState): boolean {
  return form.dateAnchor === "days" && parseDurationDays(form.durationDays).kind === "error";
}

// Renk/stil paylaşımlı helper'dan (server Word-route ile TEK kaynak); görünen
// etiket i18n'den (locale-aware). odevDurumLabel yalnız server tarafında kalır.
const statusClass  = odevDurumClass;

function inputClass(
  tone: "emerald" | "blue" | "violet" | "amber" | "rose" | "slate" = "slate"
) {
  const focus =
    tone === "emerald"
      ? "focus:border-slate-400 focus:ring-slate-100"
      : tone === "blue"
        ? "focus:border-slate-400 focus:ring-slate-100"
        : tone === "violet"
          ? "focus:border-slate-400 focus:ring-slate-100"
          : tone === "amber"
            ? "focus:border-slate-400 focus:ring-slate-100"
            : tone === "rose"
              ? "focus:border-slate-400 focus:ring-slate-100"
              : "focus:border-slate-400 focus:ring-slate-100";

  return `w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:ring-2 ${focus}`;
}

function boxClass(
  tone: "emerald" | "blue" | "violet" | "amber" | "rose" | "slate" = "slate"
) {
  const base = "min-w-0 transition";

  if (tone === "emerald") return `${base} border-emerald-200 bg-emerald-50/60`;
  if (tone === "blue") return `${base} border-blue-200 bg-blue-50/60`;
  if (tone === "violet") return `${base} border-violet-200 bg-violet-50/60`;
  if (tone === "amber") return `${base} border-amber-200 bg-amber-50/70`;
  if (tone === "rose") return `${base} border-rose-200 bg-rose-50/70`;
  return `${base} border-slate-200 bg-white`;
}

function SectionLabel({
  icon,
  title,
  tone = "emerald",
}: {
  icon: string;
  title: string;
  tone?: "emerald" | "blue" | "violet" | "amber" | "rose" | "slate";
}) {
  const toneClass =
    tone === "blue"
      ? "border-[#e3e7ee] bg-[#f6f8fb] text-slate-600"
      : tone === "violet"
        ? "border-[#e3e7ee] bg-[#f6f8fb] text-slate-600"
        : tone === "amber"
          ? "border-[#e3e7ee] bg-[#f6f8fb] text-slate-600"
          : tone === "rose"
            ? "border-[#e3e7ee] bg-[#f6f8fb] text-slate-600"
            : tone === "slate"
              ? "border-[#e3e7ee] bg-[#f6f8fb] text-slate-600"
              : "border-[#e3e7ee] bg-[#f6f8fb] text-slate-600";

  return (
    <label className={`${dyp.kLabel} mb-2 flex items-center gap-2`}>
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-md border text-sm ${toneClass}`}
      >
        {icon}
      </span>
      {title}
    </label>
  );
}

type ModalTextareaProps = {
  title: string;
  icon: string;
  tone: "emerald" | "blue" | "violet" | "amber";
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  openEditor: (title: string, value: string, onSave: (value: string) => void) => void;
};

function ModalTextarea({
  title,
  icon,
  tone,
  value,
  onChange,
  placeholder,
  openEditor,
}: ModalTextareaProps) {
  const t = useTranslations("clients.homework");
  return (
    <div className={`${boxClass(tone)} ${dyp.kField}`}>
      <div className="flex items-center justify-between gap-3">
        <SectionLabel icon={icon} title={title} tone={tone} />

        <button
          type="button"
          onClick={() => openEditor(title, value, onChange)}
          className={`${dyp.kBtnSecondary} ${dyp.kBtnSm} mb-2`}
        >
          {t("expand")}
        </button>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={`${inputClass(tone)} ${dyp.kInput} resize-none leading-6`}
      />
    </div>
  );
}

type HomeworkFormProps = {
  data: HomeworkFormState;
  onChange: <K extends keyof HomeworkFormState>(
    key: K,
    value: HomeworkFormState[K]
  ) => void;
  openEditor: (title: string, value: string, onSave: (value: string) => void) => void;
};

/** WT7 "Kaç gün sonra?" — bitişi başlangıç + N takvim günü olarak doldurur; elle tarih seçimi de açık. */
function DurationDaysField({ data, onChange }: Pick<HomeworkFormProps, "data" | "onChange">) {
  const t = useTranslations("clients.homework");
  const parsed = parseDurationDays(data.durationDays);
  const error =
    parsed.kind === "error"
      ? t(`form.durationErrors.${parsed.reason}`)
      : parsed.kind === "ok" && !data.startDate && data.dateAnchor === "days"
        ? t("form.durationErrors.noStart")
        : null;
  return (
    <div className="mt-2">
      <label className={`${dyp.kLabel} mb-1 block`}>
        {t("form.durationLabel")}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          value={data.durationDays}
          onChange={(e) => onChange("durationDays", e.target.value)}
          placeholder={t("form.durationPlaceholder")}
          className={`${inputClass("amber")} ${dyp.kInput} mt-1 normal-case tracking-normal`}
        />
      </label>
      {error ? (
        <p role="alert" className="mt-1 text-xs font-bold text-[#b42318]">{error}</p>
      ) : (
        <p className={`${dyp.kMeta} mt-1 leading-4`}>{t("form.durationHint")}</p>
      )}
    </div>
  );
}

function HomeworkForm({ data, onChange, openEditor }: HomeworkFormProps) {
  const t = useTranslations("clients.homework");
  return (
    <>
      <div className="grid gap-3 md:grid-cols-4">
        <div className={`${boxClass("emerald")} ${dyp.kField}`}>
          <SectionLabel icon="🎯" title={t("form.titleLabel")} tone="emerald" />
          <input
            value={data.title}
            onChange={(e) => onChange("title", e.target.value)}
            placeholder={t("form.titlePlaceholder")}
            className={`${inputClass("emerald")} ${dyp.kInput}`}
          />
        </div>

        <div className={`${boxClass("blue")} ${dyp.kField}`}>
          <SectionLabel icon="🧭" title={t("form.typeLabel")} tone="blue" />
          <input
            value={data.homeworkType}
            onChange={(e) => onChange("homeworkType", e.target.value)}
            placeholder={t("form.typePlaceholder")}
            className={`${inputClass("blue")} ${dyp.kInput}`}
          />
        </div>

        <div className={`${boxClass("violet")} ${dyp.kField}`}>
          <SectionLabel icon="📅" title={t("form.startLabel")} tone="violet" />
          <input
            type="date"
            value={data.startDate}
            onChange={(e) => onChange("startDate", e.target.value)}
            className={`${inputClass("violet")} ${dyp.kInput}`}
          />
        </div>

        <div className={`${boxClass("amber")} ${dyp.kField}`}>
          <SectionLabel icon="🏁" title={t("form.endLabel")} tone="amber" />
          <input
            type="date"
            aria-label={t("form.endLabel")}
            value={data.endDate}
            min={data.startDate || undefined}
            onChange={(e) => onChange("endDate", e.target.value)}
            className={`${inputClass("amber")} ${dyp.kInput}`}
          />
          <DurationDaysField data={data} onChange={onChange} />
        </div>
      </div>

      <div className={`mt-4 ${boxClass("rose")} ${dyp.kField}`}>
        <SectionLabel icon="📌" title={t("form.statusLabel")} tone="rose" />
        {/* value=canonical statü kodu (DEĞİŞMEZ); görünen etiket i18n (locale-aware). */}
        <select
          value={data.status}
          onChange={(e) => onChange("status", e.target.value as HomeworkStatus)}
          className={`${inputClass("rose")} ${dyp.kInput}`}
        >
          <option value="devam">{t("status.devam")}</option>
          <option value="tamamlandi">{t("status.tamamlandi")}</option>
          <option value="gecikti">{t("status.gecikti")}</option>
          <option value="iptal">{t("status.iptal")}</option>
        </select>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ModalTextarea
          title={t("form.descLabel")}
          icon="📝"
          tone="emerald"
          value={data.description}
          onChange={(value) => onChange("description", value)}
          placeholder={t("form.descPlaceholder")}
          openEditor={openEditor}
        />

        <ModalTextarea
          title={t("form.expertNoteLabel")}
          icon="🧠"
          tone="blue"
          value={data.expertNote}
          onChange={(value) => onChange("expertNote", value)}
          placeholder={t("form.expertNotePlaceholder")}
          openEditor={openEditor}
        />
      </div>

      <div className="mt-4">
        <ModalTextarea
          title={t("form.feedbackLabel")}
          icon="💬"
          tone="violet"
          value={data.clientFeedback}
          onChange={(value) => onChange("clientFeedback", value)}
          placeholder={t("form.feedbackPlaceholder")}
          openEditor={openEditor}
        />
      </div>
    </>
  );
}

function DetailBlock({
  title,
  value,
  icon,
  tone = "slate",
  openReader,
}: {
  title: string;
  value: string | null;
  icon: string;
  tone?: "emerald" | "blue" | "violet" | "amber" | "slate";
  openReader: (title: string, value: string, icon: string) => void;
}) {
  const t = useTranslations("clients.homework");
  if (!value) return null;

  const color =
    tone === "emerald"
      ? "min-w-0"
      : tone === "blue"
        ? "min-w-0"
        : tone === "violet"
          ? "min-w-0"
          : tone === "amber"
            ? "min-w-0"
            : "min-w-0";

  const shortValue = value.length > 240 ? `${value.slice(0, 240)}...` : value;

  return (
    <div className={`${dyp.kField} ${color}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className={`${dyp.kFieldTitle} flex items-center gap-2`}>
          <span>{icon}</span>
          {title}
        </div>

        <button
          type="button"
          onClick={() => openReader(title, value, icon)}
          className={`${dyp.kBtnSecondary} ${dyp.kBtnSm}`}
        >
          {t("open")}
        </button>
      </div>

      <div className={`${dyp.kFieldText} whitespace-pre-wrap`}>{shortValue}</div>
    </div>
  );
}

export default function HomeworkTab({ clientId }: HomeworkTabProps) {
  const t = useTranslations("clients.homework");
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();

  // Canonical statü kodu → yerelleştirilmiş etiket; bilinmeyen→ham kod, null→"Bilinmiyor".
  const statusLabelI18n = (s: string | null | undefined): string =>
    s && t.has(`status.${s}`) ? t(`status.${s}`) : (s || t("status.unknown"));

  // Mutlak tarih (global sözleşme: tüm locale'lerde DD.MM.YYYY); boş tarihte sistem etiketi (DISPLAY-only).
  const fmtDate = useCallback(
    (date: string | null) =>
      date ? formatDateAbsolute(date) : t("noDate"),
    [t],
  );
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [homeworks, setHomeworks] = useState<ClientHomework[]>([]);
  const [form, setForm] = useState<HomeworkFormState>({
    ...emptyForm,
    startDate: todayISO(),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<HomeworkFormState>(emptyForm);

  const [modalEditor, setModalEditor] = useState<ModalEditorState>(null);
  const [modalDraft, setModalDraft] = useState("");
  const [readModal, setReadModal] = useState<ReadModalState>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showForm, setShowForm] = useState(false);

  // FAZ 2 F3: sayımlar canonical helper'dan (overview/liste-uyarıları ile TEK model).
  // active=devam, completed=tamamlandi.
  // D1 (BUG-003): "Geciken" eskiden yalnız açık `gecikti` statüsünü sayıyordu (hwAgg.late) →
  // süresi dolmuş `devam` ödevi Yolculuk'ta gecikmiş, burada değil görünüyordu. Artık Yolculuk ve
  // liste uyarıları ile AYNI canonical kural: hwAgg.overdue (gecikti VEYA devam + end_date ≤ bugün).
  const hwAgg = useMemo(() => aggregateHomeworks(homeworks, todayISO()), [homeworks]);
  const activeCount = hwAgg.active;
  const completedCount = hwAgg.completed;
  const lateCount = hwAgg.overdue;

  // D1 (BUG-003): "En yakın bitiş" geçmiş (gecikmiş) bitiş tarihlerini göstermez — gecikmişler
  // "Geciken" sayacındadır; burada yalnız henüz gelmemiş bitişler (end_date > bugün).
  const nearestEndDate = useMemo(() => {
    const today = todayISO();
    const dates = homeworks
      .filter((item) => item.status === "devam" && item.end_date && item.end_date > today)
      .map((item) => item.end_date as string)
      .sort();

    return dates.length > 0 ? fmtDate(dates[0]) : "-";
  }, [homeworks, fmtDate]);

  const dismissedExpiredCount = useMemo(() => {
    const today = todayISO();

    return homeworks.filter(
      (item) =>
        item.status === "devam" &&
        item.end_date &&
        item.end_date <= today &&
        item.alert_dismissed_at
    ).length;
  }, [homeworks]);

  function updateFormField<K extends keyof HomeworkFormState>(
    key: K,
    value: HomeworkFormState[K]
  ) {
    setForm((prev) => withFieldChange(prev, key, value));
  }

  function updateEditField<K extends keyof HomeworkFormState>(
    key: K,
    value: HomeworkFormState[K]
  ) {
    setEditForm((prev) => withFieldChange(prev, key, value));
  }

  function openEditor(
    title: string,
    value: string,
    onSave: (value: string) => void
  ) {
    setModalDraft(value);
    setModalEditor({ title, value, onSave });
  }

  function saveModalEditor() {
    if (!modalEditor) return;

    modalEditor.onSave(modalDraft);
    setModalEditor(null);
    setModalDraft("");
  }

  function openReader(title: string, value: string, icon: string) {
    setReadModal({ title, value, icon });
  }

  useEffect(() => {
    void getSyncedTenantId().then(setTenantId);
  }, []);

  async function loadHomeworks() {
    if (!clientId || !tenantId) return;

    setLoading(true);
    setErrorMessage("");

    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/homeworks`, {
      headers: {
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; homeworks?: ClientHomework[] };

    if (!res.ok || !json.ok) {
      console.error("Ödev kayıtları yüklenemedi:", json.error);
      setErrorMessage(t("error.loadFailed") + ": " + (json.error ?? ""));
      setLoading(false);
      return;
    }

    setHomeworks(json.homeworks || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!tenantId) return;

    runInEffect(() => {
      loadHomeworks();
    });
  }, [clientId, tenantId]);

  async function addHomework() {
    if (!clientId || !tenantId) {
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.noClient"),
        type: "error",
      });
      return;
    }

    if (isFormEmpty(form)) {
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.emptyForm"),
        type: "error",
      });
      return;
    }

    if (durationBlocksSave(form)) {
      showToast({ title: t("toast.failTitle"), message: t("toast.invalidDuration"), type: "error" });
      return;
    }

    // DY-A: bitiş < başlangıç → kayıt yok (sunucu da 400 döner).
    if (validateHomeworkDates({ start_date: form.startDate, end_date: form.endDate })) {
      showToast({ title: t("toast.failTitle"), message: t("toast.endBeforeStart"), type: "error" });
      return;
    }

    setSaving(true);
    setErrorMessage("");

    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/homeworks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
      body: JSON.stringify(formToPayload(form)),
    }).catch(() => null); // ağ hatası (offline/timeout) → hata toast'u; durum takılı kalmaz
    const json = (res ? await res.json().catch(() => ({})) : {}) as { ok?: boolean; error?: string };

    if (!res || !res.ok || !json.ok) {
      console.error("Ödev kaydı eklenemedi:", json.error);
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.addFailed") + ": " + (json.error ?? ""),
        type: "error",
      });
      setSaving(false);
      return;
    }

    // Kayıt oluştu: form önce kapanır; liste tazeleme hatası "eklenemedi" sayılmaz.
    setForm({ ...emptyForm, startDate: todayISO() });
    setShowForm(false);
    try {
      await loadHomeworks();
    } catch {
      console.error("Ödev eklendi; liste tazelenemedi");
    } finally {
      setSaving(false);
    }

    showToast({
      title: t("toast.successTitle"),
      message: t("toast.added"),
      type: "success",
    });
  }

  // DY-03: kaydın listede bilinen sürümü (atomik CAS için PATCH'e eklenir).
  const versionOf = (id: string) => homeworks.find((h) => h.id === id)?.row_version ?? null;
  /** 409/428 → anlaşılır uyarı + güncel liste; true ise çağıran durur (hiçbir şey yazılmadı). */
  async function handleConflict(res: Response | null): Promise<boolean> {
    if (!res || (res.status !== 409 && res.status !== 428)) return false;
    showToast({ title: t("toast.failTitle"), message: t("toast.recordConflict"), type: "warning" });
    await loadHomeworks().catch(() => undefined);
    return true;
  }

  function startEdit(item: ClientHomework) {
    setEditingId(item.id);
    setEditForm(homeworkToForm(item));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm);
  }

  async function updateHomework(id: string) {
    if (isFormEmpty(editForm)) {
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.emptyUpdate"),
        type: "error",
      });
      return;
    }

    if (durationBlocksSave(editForm)) {
      showToast({ title: t("toast.failTitle"), message: t("toast.invalidDuration"), type: "error" });
      return;
    }

    if (validateHomeworkDates({ start_date: editForm.startDate, end_date: editForm.endDate })) {
      showToast({ title: t("toast.failTitle"), message: t("toast.endBeforeStart"), type: "error" });
      return;
    }

    setUpdating(true);
    setErrorMessage("");

    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/homeworks`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
      body: JSON.stringify({ homeworkId: id, row_version: versionOf(id), patch: formToPayload(editForm) }),
    }).catch(() => null); // ağ hatası (offline/timeout) → hata toast'u; durum takılı kalmaz
    const json = (res ? await res.json().catch(() => ({})) : {}) as { ok?: boolean; error?: string };

    if (await handleConflict(res)) {
      cancelEdit();
      setUpdating(false);
      return;
    }

    if (!res || !res.ok || !json.ok) {
      console.error("Ödev kaydı güncellenemedi:", json.error);
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.updateFailed") + ": " + (json.error ?? ""),
        type: "error",
      });
      setUpdating(false);
      return;
    }

    cancelEdit();
    try {
      await loadHomeworks();
    } catch {
      console.error("Ödev güncellendi; liste tazelenemedi");
    } finally {
      setUpdating(false);
    }

    showToast({
      title: t("toast.successTitle"),
      message: t("toast.updated"),
      type: "success",
    });
  }

  async function updateHomeworkStatus(id: string, status: HomeworkStatus) {
    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/homeworks`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
      body: JSON.stringify({ homeworkId: id, row_version: versionOf(id), patch: { status } }),
    }).catch(() => null); // ağ hatası (offline/timeout) → hata toast'u; durum takılı kalmaz
    const json = (res ? await res.json().catch(() => ({})) : {}) as { ok?: boolean; error?: string; row_version?: number | null };

    if (await handleConflict(res)) return;

    if (!res || !res.ok || !json.ok) {
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.statusFailed") + ": " + (json.error ?? ""),
        type: "error",
      });
      return;
    }

    setHomeworks((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status, row_version: json.row_version ?? item.row_version } : item))
    );

    showToast({
      title: t("toast.successTitle"),
      message: t("toast.statusUpdated"),
      type: "success",
    });
  }

  async function dismissHomeworkAlert(id: string) {
    const nowIso = new Date().toISOString();
    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/homeworks`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
      body: JSON.stringify({ homeworkId: id, row_version: versionOf(id), patch: { alert_dismissed_at: nowIso } }),
    }).catch(() => null); // ağ hatası (offline/timeout) → hata toast'u; durum takılı kalmaz
    const json = (res ? await res.json().catch(() => ({})) : {}) as { ok?: boolean; error?: string; row_version?: number | null };

    if (await handleConflict(res)) return;

    if (!res || !res.ok || !json.ok) {
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.dismissFailed") + ": " + (json.error ?? ""),
        type: "error",
      });
      return;
    }

    setHomeworks((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, alert_dismissed_at: nowIso, row_version: json.row_version ?? item.row_version }
          : item
      )
    );

    showToast({
      title: t("toast.successTitle"),
      message: t("toast.dismissed"),
      type: "success",
    });
  }

  async function deleteHomework(id: string) {
    const ok = await deleteConfirm({
      title: t("delete.title"),
      message: t("delete.message"),
    });
    if (!ok) return;

    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/homeworks`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
      body: JSON.stringify({ homeworkId: id }),
    }).catch(() => null); // ağ hatası (offline/timeout) → hata toast'u; durum takılı kalmaz
    const json = (res ? await res.json().catch(() => ({})) : {}) as { ok?: boolean; error?: string };

    if (!res || !res.ok || !json.ok) {
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.deleteFailed") + ": " + (json.error ?? ""),
        type: "error",
      });
      // D1 (DY-04): 404 = ödev artık yok → bayat satır listeden kalkar.
      if (res?.status === 404) setHomeworks((prev) => prev.filter((item) => item.id !== id));
      return;
    }

    if (editingId === id) {
      cancelEdit();
    }

    setHomeworks((prev) => prev.filter((item) => item.id !== id));

    showToast({
      title: t("toast.successTitle"),
      message: t("toast.deleted"),
      type: "success",
    });
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden">
        <div className={dyp.kHeader}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className={`${dyp.kEyebrow} mb-2 inline-flex`}>
                {t("header.badge")}
              </div>

              <h2 className={dyp.kTitle}>
                {t("header.title")}
              </h2>

              <p className={`${dyp.kDesc} mt-2 max-w-3xl`}>
                {t("header.subtitle")}
              </p>
            </div>

            <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:items-end">
              <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div className={`${dyp.kStat} ${dyp.kStatAccent}`}>
                  <div className={dyp.kStatValue}>
                    {activeCount}
                  </div>
                  <div className={dyp.kStatLabel}>
                    {t("stats.active")}
                  </div>
                </div>

                <div className={`${dyp.kStat} ${dyp.kStatOk}`}>
                  <div className={dyp.kStatValue}>
                    {completedCount}
                  </div>
                  <div className={dyp.kStatLabel}>
                    {t("stats.completed")}
                  </div>
                </div>

                <div className={`${dyp.kStat} ${dyp.kStatWarn}`}>
                  <div className={dyp.kStatValue}>
                    {lateCount}
                  </div>
                  <div className={dyp.kStatLabel}>
                    {t("stats.late")}
                  </div>
                </div>

                <div className={dyp.kStat}>
                  <div className={dyp.kStatValue}>
                    {dismissedExpiredCount}
                  </div>
                  <div className={dyp.kStatLabel}>
                    {t("stats.dismissed")}
                  </div>
                </div>

                <div className={dyp.kStat}>
                  <div className={dyp.kStatValue}>
                    {nearestEndDate}
                  </div>
                  <div className={dyp.kStatLabel}>
                    {t("stats.nearest")}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                className={showForm
                  ? `${dyp.kBtnSecondary} w-full`
                  : `${dyp.kBtnPrimary} w-full`}
              >
                {showForm ? t("toggleFormClose") : t("toggleFormOpen")}
              </button>
            </div>
          </div>

          <div className="mt-4 h-px bg-[#e3e7ee]" />
        </div>

      </div>

      {showForm && (
        <div className={`${dyp.kForm} overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 border-b border-[#e3e7ee] pb-3">
            <div>
              <h3 className={dyp.kSubtitle}>{t("newForm.title")}</h3>
              <p className={`${dyp.kMeta} mt-1`}>{t("newForm.subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className={`${dyp.kBtnSecondary} ${dyp.kBtnSm} shrink-0`}
            >
              {t("cancel")}
            </button>
          </div>
          <div className="pt-4">
            {errorMessage && (
              <div className={`${dyp.kAlertDanger} mb-5`}>
                {errorMessage}
              </div>
            )}
            <HomeworkForm
              data={form}
              onChange={updateFormField}
              openEditor={openEditor}
            />
            <div className="mt-4 flex justify-center">
              <button
                onClick={addHomework}
                disabled={saving}
                className={dyp.kBtnSave}
              >
                {saving ? t("newForm.saving") : t("newForm.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={dyp.kCard}>
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className={dyp.kSubtitle}>
              {t("list.title")}
            </h3>
            <p className={`${dyp.kDesc} mt-1`}>
              {t("list.subtitle")}
            </p>
          </div>

          <button
            onClick={loadHomeworks}
            disabled={loading}
            className={`${dyp.kBtnSecondary} ${dyp.kBtnSm} w-fit`}
          >
            {loading ? t("list.loading") : t("list.refresh")}
          </button>
        </div>

        {loading ? (
          <div className={dyp.kEmpty}>
            {t("list.loadingRecords")}
          </div>
        ) : homeworks.length === 0 ? (
          <div className={dyp.kEmpty}>
            <div className={dyp.kSubtitle}>
              {t("empty.title")}
            </div>
            <p className={`${dyp.kMeta} mt-2`}>
              {t("empty.hint")}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {homeworks.map((item) => {
              const isEditing = editingId === item.id;
              const isExpired =
                item.status === "devam" &&
                !!item.end_date &&
                item.end_date <= todayISO();

              const isAlertDismissed = !!item.alert_dismissed_at;

              return (
                <div
                  key={item.id}
                  className={`${dyp.kCard} overflow-hidden`}
                >
                  {!isEditing ? (
                    <div className="min-w-0">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="mb-2 flex flex-wrap gap-2">
                            <span
                              className={`${statusClass(
                                item.status
                              )} ${item.status === "tamamlandi" ? dyp.kChipOk : item.status === "gecikti" ? dyp.kChipDanger : item.status === "bekliyor" ? dyp.kChipWarn : item.status === "devam" ? dyp.kChipTeal : dyp.kChip}`}
                            >
                              {statusLabelI18n(item.status)}
                            </span>

                            <span className={dyp.kChipBlue}>
                              {item.homework_type || t("typeFallback")}
                            </span>

                            {isExpired && !isAlertDismissed && (
                              <span className={dyp.kChipDanger}>
                                {t("badge.expired")}
                              </span>
                            )}

                            {isExpired && isAlertDismissed && (
                              <span className={dyp.kChip}>
                                {t("badge.dismissed")}
                              </span>
                            )}
                          </div>

                          <h4 className={dyp.kSubtitle}>
                            {item.title || t("untitled")}
                          </h4>

                          <div className={`${dyp.kMeta} mt-2 flex flex-wrap gap-2`}>
                            <span>{t("card.start", { date: fmtDate(item.start_date) })}</span>
                            <span>•</span>
                            <span>{t("card.end", { date: fmtDate(item.end_date) })}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {isExpired && !isAlertDismissed && (
                            <button
                              onClick={() => dismissHomeworkAlert(item.id)}
                              className={`${dyp.kBtnGhost} ${dyp.kBtnSm}`}
                            >
                              {t("action.dismissAlert")}
                            </button>
                          )}

                          <button
                            onClick={() => updateHomeworkStatus(item.id, "tamamlandi")}
                            className={`${dyp.kBtnSecondary} ${dyp.kBtnSm}`}
                          >
                            {t("status.tamamlandi")}
                          </button>

                          <button
                            onClick={() => updateHomeworkStatus(item.id, "gecikti")}
                            className={`${dyp.kBtnSecondary} ${dyp.kBtnSm}`}
                          >
                            {t("status.gecikti")}
                          </button>

                          <button
                            onClick={() => startEdit(item)}
                            className={`${dyp.kBtnSecondary} ${dyp.kBtnSm}`}
                          >
                            {t("item.edit")}
                          </button>

                          <button
                            onClick={() => deleteHomework(item.id)}
                            className={`${dyp.kBtnDanger} ${dyp.kBtnSm} ml-1`}
                          >
                            {t("item.delete")}
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 md:grid-cols-2">
                        <DetailBlock
                          title={t("form.descLabel")}
                          value={item.description}
                          icon="📝"
                          tone="emerald"
                          openReader={openReader}
                        />
                        <DetailBlock
                          title={t("form.expertNoteLabel")}
                          value={item.expert_note}
                          icon="🧠"
                          tone="blue"
                          openReader={openReader}
                        />
                        <DetailBlock
                          title={t("form.feedbackLabel")}
                          value={item.client_feedback}
                          icon="💬"
                          tone="violet"
                          openReader={openReader}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h4 className={dyp.kSubtitle}>
                            {t("editForm.title")}
                          </h4>
                          <p className={`${dyp.kMeta} mt-1`}>
                            {t("editForm.subtitle")}
                          </p>
                        </div>

                        <button
                          onClick={cancelEdit}
                          className={`${dyp.kBtnSecondary} ${dyp.kBtnSm} self-start sm:shrink-0`}
                        >
                          {t("cancelTop")}
                        </button>
                      </div>

                      <HomeworkForm
                        data={editForm}
                        onChange={updateEditField}
                        openEditor={openEditor}
                      />

                      <div className="mt-4 flex justify-end gap-2">
                        <button
                          onClick={cancelEdit}
                          className={dyp.kBtnSecondary}
                        >
                          {t("cancel")}
                        </button>

                        <button
                          onClick={() => updateHomework(item.id)}
                          disabled={updating}
                          className={dyp.kBtnSave}
                        >
                          {updating ? t("editForm.updating") : t("editForm.update")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalEditor && (
        <div
          className={`${dyp.kOverlay} fixed inset-0 z-50 flex items-center justify-center p-4`}
          onClick={() => setModalEditor(null)}
        >
          <div
            className={`${dyp.kModal} flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`${dyp.kModalHead} flex items-center justify-between gap-3`}>
              <div>
                <h3 className={dyp.kSubtitle}>
                  {modalEditor.title}
                </h3>
                <p className={`${dyp.kMeta} mt-1`}>
                  {t("modal.editorSubtitle")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalEditor(null)}
                className={`${dyp.kBtnSecondary} shrink-0`}
              >
                {t("close")}
              </button>
            </div>

            <div className="p-4">
              <textarea
                value={modalDraft}
                onChange={(e) => setModalDraft(e.target.value)}
                className={`${dyp.kInput} h-[38vh] w-full resize-none leading-6`}
                placeholder={t("modal.placeholder")}
                autoFocus
              />
            </div>

            <div className={`${dyp.kModalFoot} flex justify-end gap-3`}>
              <button
                type="button"
                onClick={() => setModalEditor(null)}
                className={dyp.kBtnSecondary}
              >
                {t("cancel")}
              </button>

              <button
                type="button"
                onClick={saveModalEditor}
                className={dyp.kBtnSave}
              >
                {t("modal.apply")}
              </button>
            </div>
          </div>
        </div>
      )}

      {readModal && (
        <div
          className={`${dyp.kOverlay} fixed inset-0 z-50 flex items-center justify-center p-4`}
          onClick={() => setReadModal(null)}
        >
          <div
            className={`${dyp.kModal} flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`${dyp.kModalHead} flex items-center justify-between gap-3`}>
              <div>
                <h3 className={dyp.kSubtitle}>
                  {readModal.icon} {readModal.title}
                </h3>
                <p className={`${dyp.kMeta} mt-1`}>
                  {t("modal.readerSubtitle")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setReadModal(null)}
                className={`${dyp.kBtnSecondary} shrink-0`}
              >
                {t("close")}
              </button>
            </div>

            <div className="overflow-auto p-4">
              <div className={`${dyp.kField} ${dyp.kFieldText} min-h-[32vh] whitespace-pre-wrap`}>
                {readModal.value}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
