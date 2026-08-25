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

type HomeworkStatus = "bekliyor" | "devam" | "tamamlandi" | "gecikti" | "iptal";

type ClientHomework = {
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
  status: "devam",
  expertNote: "",
  clientFeedback: "",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
    startDate: item.start_date || "",
    endDate: item.end_date || "",
    status: item.status || "devam",
    expertNote: item.expert_note || "",
    clientFeedback: item.client_feedback || "",
  };
}

// Renk/stil paylaşımlı helper'dan (server Word-route ile TEK kaynak); görünen
// etiket i18n'den (locale-aware). odevDurumLabel yalnız server tarafında kalır.
const statusClass  = odevDurumClass;

function inputClass(
  tone: "emerald" | "blue" | "violet" | "amber" | "rose" | "slate" = "slate"
) {
  const focus =
    tone === "emerald"
      ? "focus:border-emerald-400 focus:ring-emerald-100"
      : tone === "blue"
        ? "focus:border-blue-400 focus:ring-blue-100"
        : tone === "violet"
          ? "focus:border-violet-400 focus:ring-violet-100"
          : tone === "amber"
            ? "focus:border-amber-400 focus:ring-amber-100"
            : tone === "rose"
              ? "focus:border-rose-400 focus:ring-rose-100"
              : "focus:border-slate-400 focus:ring-slate-100";

  return `w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:ring-2 ${focus}`;
}

function boxClass(
  tone: "emerald" | "blue" | "violet" | "amber" | "rose" | "slate" = "slate"
) {
  const base = "rounded-2xl border p-4 shadow-sm transition hover:shadow-md";

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
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : tone === "violet"
        ? "border-violet-200 bg-violet-50 text-violet-700"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : tone === "rose"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : tone === "slate"
              ? "border-slate-200 bg-slate-50 text-slate-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <label className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-xl border text-sm shadow-sm ${toneClass}`}
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
    <div className={boxClass(tone)}>
      <div className="flex items-center justify-between gap-3">
        <SectionLabel icon={icon} title={title} tone={tone} />

        <button
          type="button"
          onClick={() => openEditor(title, value, onChange)}
          className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          {t("expand")}
        </button>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={`${inputClass(tone)} resize-none leading-6`}
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

function HomeworkForm({ data, onChange, openEditor }: HomeworkFormProps) {
  const t = useTranslations("clients.homework");
  return (
    <>
      <div className="grid gap-3 md:grid-cols-4">
        <div className={boxClass("emerald")}>
          <SectionLabel icon="🎯" title={t("form.titleLabel")} tone="emerald" />
          <input
            value={data.title}
            onChange={(e) => onChange("title", e.target.value)}
            placeholder={t("form.titlePlaceholder")}
            className={inputClass("emerald")}
          />
        </div>

        <div className={boxClass("blue")}>
          <SectionLabel icon="🧭" title={t("form.typeLabel")} tone="blue" />
          <input
            value={data.homeworkType}
            onChange={(e) => onChange("homeworkType", e.target.value)}
            placeholder={t("form.typePlaceholder")}
            className={inputClass("blue")}
          />
        </div>

        <div className={boxClass("violet")}>
          <SectionLabel icon="📅" title={t("form.startLabel")} tone="violet" />
          <input
            type="date"
            value={data.startDate}
            onChange={(e) => onChange("startDate", e.target.value)}
            className={inputClass("violet")}
          />
        </div>

        <div className={boxClass("amber")}>
          <SectionLabel icon="🏁" title={t("form.endLabel")} tone="amber" />
          <input
            type="date"
            value={data.endDate}
            onChange={(e) => onChange("endDate", e.target.value)}
            className={inputClass("amber")}
          />
        </div>
      </div>

      <div className={`mt-4 ${boxClass("rose")}`}>
        <SectionLabel icon="📌" title={t("form.statusLabel")} tone="rose" />
        {/* value=canonical statü kodu (DEĞİŞMEZ); görünen etiket i18n (locale-aware). */}
        <select
          value={data.status}
          onChange={(e) => onChange("status", e.target.value as HomeworkStatus)}
          className={inputClass("rose")}
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

      <div className={`mt-4 ${boxClass("violet")}`}>
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
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : tone === "blue"
        ? "border-blue-200 bg-blue-50 text-blue-950"
        : tone === "violet"
          ? "border-violet-200 bg-violet-50 text-violet-950"
          : tone === "amber"
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : "border-slate-200 bg-white text-slate-800";

  const shortValue = value.length > 240 ? `${value.slice(0, 240)}...` : value;

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${color}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-black text-slate-950">
          <span>{icon}</span>
          {title}
        </div>

        <button
          type="button"
          onClick={() => openReader(title, value, icon)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          {t("open")}
        </button>
      </div>

      <div className="whitespace-pre-wrap text-sm leading-6">{shortValue}</div>
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
  // active=devam, completed=tamamlandi, late=gecikti (açık statü) — davranış birebir aynı.
  const hwAgg = useMemo(() => aggregateHomeworks(homeworks, todayISO()), [homeworks]);
  const activeCount = hwAgg.active;
  const completedCount = hwAgg.completed;
  const lateCount = hwAgg.late;

  const nearestEndDate = useMemo(() => {
    const dates = homeworks
      .filter((item) => item.status === "devam" && item.end_date)
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
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateEditField<K extends keyof HomeworkFormState>(
    key: K,
    value: HomeworkFormState[K]
  ) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
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
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

    if (!res.ok || !json.ok) {
      console.error("Ödev kaydı eklenemedi:", json.error);
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.addFailed") + ": " + (json.error ?? ""),
        type: "error",
      });
      setSaving(false);
      return;
    }

    setForm({ ...emptyForm, startDate: todayISO() });
    setShowForm(false);
    await loadHomeworks();
    setSaving(false);

    showToast({
      title: t("toast.successTitle"),
      message: t("toast.added"),
      type: "success",
    });
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
      body: JSON.stringify({ homeworkId: id, patch: formToPayload(editForm) }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

    if (!res.ok || !json.ok) {
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
    await loadHomeworks();
    setUpdating(false);

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
      body: JSON.stringify({ homeworkId: id, patch: { status } }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

    if (!res.ok || !json.ok) {
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.statusFailed") + ": " + (json.error ?? ""),
        type: "error",
      });
      return;
    }

    setHomeworks((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
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
      body: JSON.stringify({ homeworkId: id, patch: { alert_dismissed_at: nowIso } }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

    if (!res.ok || !json.ok) {
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
          ? { ...item, alert_dismissed_at: nowIso }
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
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

    if (!res.ok || !json.ok) {
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.deleteFailed") + ": " + (json.error ?? ""),
        type: "error",
      });
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
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/60">
        <div className="border-b border-slate-100 bg-gradient-to-br from-white via-emerald-50/50 to-amber-50/50 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-700 shadow-sm">
                {t("header.badge")}
              </div>

              <h2 className="text-xl font-black tracking-tight text-slate-950">
                {t("header.title")}
              </h2>

              <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600">
                {t("header.subtitle")}
              </p>
            </div>

            <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:items-end">
              <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div className="rounded-2xl border border-amber-200 bg-white px-3 py-2 text-center shadow-md">
                  <div className="text-lg font-black text-amber-700">
                    {activeCount}
                  </div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("stats.active")}
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-center shadow-md">
                  <div className="text-lg font-black text-emerald-700">
                    {completedCount}
                  </div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("stats.completed")}
                  </div>
                </div>

                <div className="rounded-2xl border border-red-200 bg-white px-3 py-2 text-center shadow-md">
                  <div className="text-lg font-black text-red-600">
                    {lateCount}
                  </div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("stats.late")}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center shadow-md">
                  <div className="text-lg font-black text-slate-700">
                    {dismissedExpiredCount}
                  </div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("stats.dismissed")}
                  </div>
                </div>

                <div className="rounded-2xl border border-violet-200 bg-white px-3 py-2 text-center shadow-md">
                  <div className="text-sm font-black text-violet-700">
                    {nearestEndDate}
                  </div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("stats.nearest")}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                className={showForm
                  ? "w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100"
                  : "w-full rounded-2xl border border-emerald-300 bg-emerald-600 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700"}
              >
                {showForm ? t("toggleFormClose") : t("toggleFormOpen")}
              </button>
            </div>
          </div>

          <div className="mt-4 h-1.5 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 via-violet-400 to-red-400" />
        </div>

      </div>

      {showForm && (
        <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-lg shadow-slate-200/60">
          <div className="flex items-center justify-between border-b border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white px-4 py-3">
            <div>
              <h3 className="text-xl font-black text-slate-950">{t("newForm.title")}</h3>
              <p className="mt-1 text-sm font-medium text-slate-500">{t("newForm.subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              {t("cancel")}
            </button>
          </div>
          <div className="p-4">
            {errorMessage && (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
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
                className="btn-primary hover:-translate-y-0.5 hover:scale-[1.02]"
              >
                {saving ? t("newForm.saving") : t("newForm.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/60">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-black tracking-tight text-slate-950">
              {t("list.title")}
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {t("list.subtitle")}
            </p>
          </div>

          <button
            onClick={loadHomeworks}
            disabled={loading}
            className="w-fit rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? t("list.loading") : t("list.refresh")}
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-500">
            {t("list.loadingRecords")}
          </div>
        ) : homeworks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div className="text-lg font-black text-slate-800">
              {t("empty.title")}
            </div>
            <p className="mt-2 text-sm font-medium text-slate-500">
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
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50/40 shadow-md shadow-slate-200/70 transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-100/70"
                >
                  {!isEditing ? (
                    <div className="p-5">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="mb-2 flex flex-wrap gap-2">
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(
                                item.status
                              )}`}
                            >
                              {statusLabelI18n(item.status)}
                            </span>

                            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                              {item.homework_type || t("typeFallback")}
                            </span>

                            {isExpired && !isAlertDismissed && (
                              <span className="rounded-full border border-red-200 bg-red-100 px-3 py-1 text-xs font-black text-red-700">
                                {t("badge.expired")}
                              </span>
                            )}

                            {isExpired && isAlertDismissed && (
                              <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                                {t("badge.dismissed")}
                              </span>
                            )}
                          </div>

                          <h4 className="text-lg font-black tracking-tight text-slate-950">
                            {item.title || t("untitled")}
                          </h4>

                          <div className="mt-2 flex flex-wrap gap-2 text-xs font-black text-slate-500">
                            <span>{t("card.start", { date: fmtDate(item.start_date) })}</span>
                            <span>•</span>
                            <span>{t("card.end", { date: fmtDate(item.end_date) })}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2.5">
                          {isExpired && !isAlertDismissed && (
                            <button
                              onClick={() => dismissHomeworkAlert(item.id)}
                              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100"
                            >
                              {t("action.dismissAlert")}
                            </button>
                          )}

                          <button
                            onClick={() => updateHomeworkStatus(item.id, "tamamlandi")}
                            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700 shadow-sm transition hover:bg-emerald-100"
                          >
                            {t("status.tamamlandi")}
                          </button>

                          <button
                            onClick={() => updateHomeworkStatus(item.id, "gecikti")}
                            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-600 shadow-sm transition hover:bg-red-100"
                          >
                            {t("status.gecikti")}
                          </button>

                          <button
                            onClick={() => startEdit(item)}
                            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black text-blue-700 shadow-sm transition hover:bg-blue-100"
                          >
                            {t("item.edit")}
                          </button>

                          <button
                            onClick={() => deleteHomework(item.id)}
                            className="ml-1 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-600 shadow-sm transition hover:bg-red-100"
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
                    <div className="border-l-4 border-emerald-500 bg-emerald-50/50 p-5">
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h4 className="text-xl font-black text-slate-950">
                            {t("editForm.title")}
                          </h4>
                          <p className="mt-1 text-sm font-medium text-slate-600">
                            {t("editForm.subtitle")}
                          </p>
                        </div>

                        <button
                          onClick={cancelEdit}
                          className="self-start rounded-xl bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 sm:shrink-0"
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
                          className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                          {t("cancel")}
                        </button>

                        <button
                          onClick={() => updateHomework(item.id)}
                          disabled={updating}
                          className="btn-primary px-5 py-3"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setModalEditor(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-50 via-white to-violet-50 px-4 py-3">
              <div>
                <h3 className="text-xl font-black text-slate-950">
                  {modalEditor.title}
                </h3>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {t("modal.editorSubtitle")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalEditor(null)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {t("close")}
              </button>
            </div>

            <div className="p-4">
              <textarea
                value={modalDraft}
                onChange={(e) => setModalDraft(e.target.value)}
                className="h-[38vh] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-medium leading-6 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                placeholder={t("modal.placeholder")}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => setModalEditor(null)}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                {t("cancel")}
              </button>

              <button
                type="button"
                onClick={saveModalEditor}
                className="rounded-2xl bg-gradient-to-r from-emerald-600 to-green-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200 transition hover:from-emerald-700 hover:to-green-600"
              >
                {t("modal.apply")}
              </button>
            </div>
          </div>
        </div>
      )}

      {readModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setReadModal(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-emerald-50 px-4 py-3">
              <div>
                <h3 className="text-xl font-black text-slate-950">
                  {readModal.icon} {readModal.title}
                </h3>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {t("modal.readerSubtitle")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setReadModal(null)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {t("close")}
              </button>
            </div>

            <div className="overflow-auto p-4">
              <div className="min-h-[32vh] whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-6 text-slate-900">
                {readModal.value}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
