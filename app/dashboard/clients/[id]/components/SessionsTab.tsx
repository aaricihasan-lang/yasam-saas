"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDateAbsolute } from "@/lib/i18n/format";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

type ClientSession = {
  id: string;
  tenant_id: string;
  client_id: string;
  session_date: string | null;
  session_type: string | null;
  duration_minutes: number | null;
  fee: number | null;
  session_note: string | null;
  actions_done: string | null;
  suggestions: string | null;
  next_plan: string | null;
  created_at: string;
};

type SessionsTabProps = {
  clientId: string;
};

type SessionFormState = {
  sessionDate: string;
  sessionType: string;
  durationMinutes: string;
  fee: string;
  sessionNote: string;
  actionsDone: string;
  suggestions: string;
  nextPlan: string;
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

const emptyForm: SessionFormState = {
  sessionDate: "",
  sessionType: "",
  durationMinutes: "",
  fee: "",
  sessionNote: "",
  actionsDone: "",
  suggestions: "",
  nextPlan: "",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(value: number | null) {
  if (value === null || value === undefined) return "-";

  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

function isFormEmpty(form: SessionFormState) {
  return (
    !form.sessionDate.trim() &&
    !form.sessionType.trim() &&
    !form.durationMinutes.trim() &&
    !form.fee.trim() &&
    !form.sessionNote.trim() &&
    !form.actionsDone.trim() &&
    !form.suggestions.trim() &&
    !form.nextPlan.trim()
  );
}

function formToPayload(form: SessionFormState) {
  return {
    session_date: form.sessionDate || null,
    session_type: form.sessionType.trim(),
    duration_minutes: form.durationMinutes ? Number(form.durationMinutes) : null,
    fee: form.fee ? Number(form.fee) : null,
    session_note: form.sessionNote.trim(),
    actions_done: form.actionsDone.trim(),
    suggestions: form.suggestions.trim(),
    next_plan: form.nextPlan.trim(),
  };
}

function sessionToForm(session: ClientSession): SessionFormState {
  return {
    sessionDate: session.session_date || "",
    sessionType: session.session_type || "",
    durationMinutes:
      session.duration_minutes === null || session.duration_minutes === undefined
        ? ""
        : String(session.duration_minutes),
    fee:
      session.fee === null || session.fee === undefined
        ? ""
        : String(session.fee),
    sessionNote: session.session_note || "",
    actionsDone: session.actions_done || "",
    suggestions: session.suggestions || "",
    nextPlan: session.next_plan || "",
  };
}

function inputClass(
  tone: "blue" | "emerald" | "violet" | "amber" | "slate" = "slate"
) {
  const focus =
    tone === "blue"
      ? "focus:border-blue-400 focus:ring-blue-100"
      : tone === "emerald"
        ? "focus:border-emerald-400 focus:ring-emerald-100"
        : tone === "violet"
          ? "focus:border-violet-400 focus:ring-violet-100"
          : tone === "amber"
            ? "focus:border-amber-400 focus:ring-amber-100"
            : "focus:border-slate-400 focus:ring-slate-100";

  return `w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:ring-4 ${focus}`;
}

function boxClass(
  tone: "blue" | "emerald" | "violet" | "amber" | "rose" | "slate" = "slate"
) {
  const base = "rounded-2xl border p-3 shadow-sm transition hover:shadow-md";

  if (tone === "blue") return `${base} border-blue-200 bg-blue-50/60`;
  if (tone === "emerald") return `${base} border-emerald-200 bg-emerald-50/60`;
  if (tone === "violet") return `${base} border-violet-200 bg-violet-50/60`;
  if (tone === "amber") return `${base} border-amber-200 bg-amber-50/70`;
  if (tone === "rose") return `${base} border-rose-200 bg-rose-50/70`;
  return `${base} border-slate-200 bg-white`;
}

function SectionLabel({
  icon,
  title,
  tone = "blue",
}: {
  icon: string;
  title: string;
  tone?: "blue" | "emerald" | "violet" | "amber" | "rose" | "slate";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "violet"
        ? "border-violet-200 bg-violet-50 text-violet-700"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : tone === "rose"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : tone === "slate"
              ? "border-slate-200 bg-slate-50 text-slate-700"
              : "border-blue-200 bg-blue-50 text-blue-700";

  return (
    <label className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-lg border text-sm shadow-sm ${toneClass}`}
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
  tone: "blue" | "emerald" | "violet" | "amber";
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
  const t = useTranslations("clients.sessions");
  return (
    <div className={boxClass(tone)}>
      <div className="flex items-center justify-between gap-3">
        <SectionLabel icon={icon} title={title} tone={tone} />

        <button
          type="button"
          onClick={() => openEditor(title, value, onChange)}
          className="mb-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          {t("expand")}
        </button>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={`${inputClass(tone)} resize-none leading-5`}
      />
    </div>
  );
}

type SessionFormProps = {
  data: SessionFormState;
  onChange: <K extends keyof SessionFormState>(
    key: K,
    value: SessionFormState[K]
  ) => void;
  openEditor: (title: string, value: string, onSave: (value: string) => void) => void;
};

function SessionForm({ data, onChange, openEditor }: SessionFormProps) {
  const t = useTranslations("clients.sessions");
  return (
    <>
      <div className="grid gap-3 md:grid-cols-4">
        <div className={boxClass("blue")}>
          <SectionLabel icon="📅" title={t("form.dateLabel")} tone="blue" />
          <input
            type="date"
            value={data.sessionDate}
            onChange={(e) => onChange("sessionDate", e.target.value)}
            className={inputClass("blue")}
          />
        </div>

        <div className={boxClass("emerald")}>
          <SectionLabel icon="🧭" title={t("form.typeLabel")} tone="emerald" />
          <input
            value={data.sessionType}
            onChange={(e) => onChange("sessionType", e.target.value)}
            placeholder={t("form.typePlaceholder")}
            className={inputClass("emerald")}
          />
        </div>

        <div className={boxClass("violet")}>
          <SectionLabel icon="⏱️" title={t("form.durationLabel")} tone="violet" />
          <input
            type="number"
            min="0"
            value={data.durationMinutes}
            onChange={(e) => onChange("durationMinutes", e.target.value)}
            placeholder={t("form.durationPlaceholder")}
            className={inputClass("violet")}
          />
        </div>

        <div className={boxClass("amber")}>
          <SectionLabel icon="₺" title={t("form.feeLabel")} tone="amber" />
          <input
            type="number"
            min="0"
            value={data.fee}
            onChange={(e) => onChange("fee", e.target.value)}
            placeholder={t("form.feePlaceholder")}
            className={inputClass("amber")}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ModalTextarea
          title={t("form.noteLabel")}
          icon="📝"
          tone="blue"
          value={data.sessionNote}
          onChange={(value) => onChange("sessionNote", value)}
          placeholder={t("form.notePlaceholder")}
          openEditor={openEditor}
        />

        <ModalTextarea
          title={t("form.actionsLabel")}
          icon="✅"
          tone="emerald"
          value={data.actionsDone}
          onChange={(value) => onChange("actionsDone", value)}
          placeholder={t("form.actionsPlaceholder")}
          openEditor={openEditor}
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ModalTextarea
          title={t("form.suggestionsLabel")}
          icon="💡"
          tone="violet"
          value={data.suggestions}
          onChange={(value) => onChange("suggestions", value)}
          placeholder={t("form.suggestionsPlaceholder")}
          openEditor={openEditor}
        />

        <ModalTextarea
          title={t("form.nextPlanLabel")}
          icon="📌"
          tone="amber"
          value={data.nextPlan}
          onChange={(value) => onChange("nextPlan", value)}
          placeholder={t("form.nextPlanPlaceholder")}
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
  tone?: "blue" | "emerald" | "violet" | "amber" | "slate";
  openReader: (title: string, value: string, icon: string) => void;
}) {
  const t = useTranslations("clients.sessions");
  if (!value) return null;

  const color =
    tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-950"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
        : tone === "violet"
          ? "border-violet-200 bg-violet-50 text-violet-950"
          : tone === "amber"
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : "border-slate-200 bg-white text-slate-800";

  const shortValue = value.length > 240 ? `${value.slice(0, 240)}...` : value;

  return (
    <div className={`rounded-xl border p-3 shadow-sm ${color}`}>
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

      <div className="whitespace-pre-wrap text-sm leading-5">{shortValue}</div>
    </div>
  );
}

export default function SessionsTab({ clientId }: SessionsTabProps) {
  const t = useTranslations("clients.sessions");
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();

  // Locale-duyarlı seans tarihi görüntüsü; boş tarihte sistem etiketi döner.
  // (Kaynak `session_date` değeri değişmez — yalnız DISPLAY.)
  const fmtDate = useCallback(
    (date: string | null) =>
      date ? formatDateAbsolute(date) : t("noDate"),
    [t],
  );
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ClientSession[]>([]);
  const [form, setForm] = useState<SessionFormState>({
    ...emptyForm,
    sessionDate: todayISO(),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SessionFormState>(emptyForm);

  const [modalEditor, setModalEditor] = useState<ModalEditorState>(null);
  const [modalDraft, setModalDraft] = useState("");
  const [readModal, setReadModal] = useState<ReadModalState>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showForm, setShowForm] = useState(false);

  const totalFee = useMemo(() => {
    return sessions.reduce((sum, item) => sum + Number(item.fee || 0), 0);
  }, [sessions]);

  const totalMinutes = useMemo(() => {
    return sessions.reduce(
      (sum, item) => sum + Number(item.duration_minutes || 0),
      0
    );
  }, [sessions]);

  const lastSessionDate = useMemo(() => {
    if (sessions.length === 0) return "-";
    return fmtDate(sessions[0].session_date);
  }, [sessions, fmtDate]);

  function updateFormField<K extends keyof SessionFormState>(
    key: K,
    value: SessionFormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateEditField<K extends keyof SessionFormState>(
    key: K,
    value: SessionFormState[K]
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

  async function loadSessions() {
    if (!clientId || !tenantId) return;

    setLoading(true);
    setErrorMessage("");

    const seToken = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/sessions`, {
      headers: {
        "x-user-id": readYasamUser()?.id ?? "",
        ...(seToken ? { "x-session-token": seToken } : {}),
      },
    });

    if (!res.ok) {
      console.error("Seans kayıtları yüklenemedi");
      setErrorMessage(t("error.loadFailed"));
      setLoading(false);
      return;
    }

    const json = (await res.json()) as { sessions?: ClientSession[] };
    // Sıralama korunur: session_date desc (null'lar sonda), sonra created_at desc.
    const list = (json.sessions ?? []).slice().sort((a, b) => {
      const sd = (b.session_date ?? "").localeCompare(a.session_date ?? "");
      if (sd !== 0) return sd;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
    setSessions(list);
    setLoading(false);
  }

  useEffect(() => {
    if (!tenantId) return;

    runInEffect(() => {
      loadSessions();
    });
  }, [clientId, tenantId]);

  async function addSession() {
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

    const addToken = readSessionToken();
    const addRes = await fetch(`/api/clients/${clientId}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": readYasamUser()?.id ?? "",
        ...(addToken ? { "x-session-token": addToken } : {}),
      },
      body: JSON.stringify(formToPayload(form)),
    });

    if (!addRes.ok) {
      console.error("Seans kaydı eklenemedi");
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.addFailed"),
        type: "error",
      });
      setSaving(false);
      return;
    }

    // Z-3: Seans tarihi kaydedilince clients.gorusme güncelle (son seans takibi için)
    if (form.sessionDate && tenantId) {
      const gToken = readSessionToken();
      const cliRes = await fetch(`/api/clients/${clientId}`, {
        headers: {
          "x-user-id": readYasamUser()?.id ?? "",
          ...(gToken ? { "x-session-token": gToken } : {}),
        },
      });
      const cli = cliRes.ok
        ? ((await cliRes.json()) as { client?: { gorusme?: string | null } }).client
        : null;
      if (!cli?.gorusme || form.sessionDate > cli.gorusme) {
        await fetch(`/api/clients/${clientId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": readYasamUser()?.id ?? "",
            ...(gToken ? { "x-session-token": gToken } : {}),
          },
          body: JSON.stringify({ gorusme: form.sessionDate }),
        });
      }
    }

    setForm({ ...emptyForm, sessionDate: todayISO() });
    setShowForm(false);
    await loadSessions();
    setSaving(false);

    showToast({
      title: t("toast.successTitle"),
      message: t("toast.added"),
      type: "success",
    });
  }

  function startEdit(session: ClientSession) {
    setEditingId(session.id);
    setEditForm(sessionToForm(session));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm);
  }

  async function updateSession(id: string) {
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

    const updToken = readSessionToken();
    const updRes = await fetch(`/api/clients/${clientId}/sessions`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": readYasamUser()?.id ?? "",
        ...(updToken ? { "x-session-token": updToken } : {}),
      },
      body: JSON.stringify({ id, ...formToPayload(editForm) }),
    });

    if (!updRes.ok) {
      console.error("Seans kaydı güncellenemedi");
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.updateFailed"),
        type: "error",
      });
      setUpdating(false);
      return;
    }

    cancelEdit();
    await loadSessions();
    setUpdating(false);

    showToast({
      title: t("toast.successTitle"),
      message: t("toast.updated"),
      type: "success",
    });
  }

  async function deleteSession(id: string) {
    const ok = await deleteConfirm({
      title: t("delete.title"),
      message: t("delete.message"),
    });
    if (!ok) return;

    const delToken = readSessionToken();
    const delRes = await fetch(`/api/clients/${clientId}/sessions?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        "x-user-id": readYasamUser()?.id ?? "",
        ...(delToken ? { "x-session-token": delToken } : {}),
      },
    });

    if (!delRes.ok) {
      console.error("Seans kaydı silinemedi");
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.deleteFailed"),
        type: "error",
      });
      return;
    }

    if (editingId === id) {
      cancelEdit();
    }

    setSessions((prev) => prev.filter((item) => item.id !== id));

    showToast({
      title: t("toast.successTitle"),
      message: t("toast.deleted"),
      type: "success",
    });
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-br from-white via-blue-50/50 to-violet-50/50 px-4 py-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-blue-700 shadow-sm">
                {t("header.badge")}
              </div>

              <h2 className="text-base font-black tracking-tight text-slate-950">
                {t("header.title")}
              </h2>

              <p className="mt-2 max-w-3xl text-sm font-medium leading-5 text-slate-600">
                {t("header.subtitle")}
              </p>
            </div>

            <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:items-end">
              <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-blue-200 bg-white px-3 py-2 text-center shadow-md">
                  <div className="text-base font-black text-blue-700">
                    {sessions.length}
                  </div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("stats.sessions")}
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-center shadow-md">
                  <div className="text-base font-black text-emerald-700">
                    {formatMoney(totalFee)}
                  </div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("stats.total")}
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-white px-3 py-2 text-center shadow-md">
                  <div className="text-base font-black text-amber-700">
                    {totalMinutes} {t("unitMin")}
                  </div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("stats.duration")}
                  </div>
                </div>

                <div className="rounded-2xl border border-violet-200 bg-white px-3 py-2 text-center shadow-md">
                  <div className="text-sm font-black text-violet-700">
                    {lastSessionDate}
                  </div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("stats.lastSession")}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                className={showForm
                  ? "w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100"
                  : "w-full rounded-2xl border border-blue-300 bg-blue-600 px-3 py-1.5 text-xs font-black text-white shadow-sm transition hover:bg-blue-700"}
              >
                {showForm ? t("toggleFormClose") : t("toggleFormOpen")}
              </button>
            </div>
          </div>

          <div className="mt-4 h-1 rounded-full bg-gradient-to-r from-blue-400 via-emerald-400 via-violet-400 to-amber-400" />
        </div>

      </div>

      {showForm && (
        <div className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-blue-100 bg-gradient-to-br from-blue-50/60 to-white px-4 py-3">
            <div>
              <h3 className="text-base font-black text-slate-950">{t("newForm.title")}</h3>
              <p className="mt-0.5 text-xs font-medium text-slate-500">{t("newForm.subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              {t("cancel")}
            </button>
          </div>
          <div className="p-4">
            {errorMessage && (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                {errorMessage}
              </div>
            )}
            <SessionForm
              data={form}
              onChange={updateFormField}
              openEditor={openEditor}
            />
            <div className="mt-6 flex justify-center">
              <button
                onClick={addSession}
                disabled={saving}
                className="btn-secondary hover:-translate-y-0.5 hover:scale-[1.02]"
              >
                {saving ? t("newForm.saving") : t("newForm.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-black tracking-tight text-slate-950">
              {t("list.title")}
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {t("list.subtitle")}
            </p>
          </div>

          <button
            onClick={loadSessions}
            disabled={loading}
            className="w-fit rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? t("list.loading") : t("list.refresh")}
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-500">
            {t("list.loadingRecords")}
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div className="text-base font-black text-slate-800">
              {t("empty.title")}
            </div>
            <p className="mt-2 text-sm font-medium text-slate-500">
              {t("empty.hint")}
            </p>
          </div>
        ) : (
          <div className="relative space-y-3">
            <div className="absolute bottom-0 left-4 top-0 hidden w-1 rounded-full bg-gradient-to-b from-blue-300 via-emerald-300 to-violet-300 md:block" />

            {sessions.map((session, index) => {
              const isEditing = editingId === session.id;

              return (
                <div key={session.id} className="relative md:pl-10">
                  <div className="absolute left-3 top-6 hidden h-5 w-5 rounded-full border-4 border-white bg-blue-500 shadow-md md:block" />

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-blue-50/40 shadow-md shadow-slate-200/70 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-100/70">
                    {!isEditing ? (
                      <div className="p-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="mb-2 inline-flex rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">
                              {session.session_type || t("sessionN", { n: index + 1 })}
                            </div>

                            <h4 className="text-base font-black tracking-tight text-slate-950">
                              {fmtDate(session.session_date)}
                            </h4>

                            <div className="mt-2 flex flex-wrap gap-2 text-xs font-black">
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                                ⏱️ {session.duration_minutes || "-"} {t("unitMin")}
                              </span>
                              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                                {formatMoney(session.fee)}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2.5">
                            <button
                              onClick={() => startEdit(session)}
                              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 shadow-sm transition hover:bg-blue-100"
                            >
                              {t("item.edit")}
                            </button>

                            <button
                              onClick={() => deleteSession(session.id)}
                              className="ml-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-600 shadow-sm transition hover:bg-red-100"
                            >
                              {t("item.delete")}
                            </button>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-3 md:grid-cols-2">
                          <DetailBlock
                            title={t("detail.note")}
                            value={session.session_note}
                            icon="📝"
                            tone="blue"
                            openReader={openReader}
                          />
                          <DetailBlock
                            title={t("detail.actions")}
                            value={session.actions_done}
                            icon="✅"
                            tone="emerald"
                            openReader={openReader}
                          />
                          <DetailBlock
                            title={t("detail.suggestions")}
                            value={session.suggestions}
                            icon="💡"
                            tone="violet"
                            openReader={openReader}
                          />
                          <DetailBlock
                            title={t("detail.nextPlan")}
                            value={session.next_plan}
                            icon="📌"
                            tone="amber"
                            openReader={openReader}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="border-l-4 border-blue-500 bg-blue-50/50 p-5">
                        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <h4 className="text-base font-black text-slate-950">
                              {t("editForm.title")}
                            </h4>
                            <p className="mt-1 text-sm font-medium text-slate-600">
                              {t("editForm.subtitle")}
                            </p>
                          </div>

                          <button
                            onClick={cancelEdit}
                            className="self-start rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 sm:shrink-0"
                          >
                            {t("cancelTop")}
                          </button>
                        </div>

                        <SessionForm
                          data={editForm}
                          onChange={updateEditField}
                          openEditor={openEditor}
                        />

                        <div className="mt-6 flex justify-end gap-2">
                          <button
                            onClick={cancelEdit}
                            className="rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                          >
                            {t("cancel")}
                          </button>

                          <button
                            onClick={() => updateSession(session.id)}
                            disabled={updating}
                            className="btn-secondary px-4 py-2.5 text-sm"
                          >
                            {updating ? t("editForm.updating") : t("editForm.update")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
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
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-blue-50 via-white to-violet-50 px-5 py-4">
              <div>
                <h3 className="text-base font-black text-slate-950">
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
                className="h-[42vh] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-6 text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                placeholder={t("modal.placeholder")}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 bg-white px-4 py-2.5">
              <button
                type="button"
                onClick={() => setModalEditor(null)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                {t("cancel")}
              </button>

              <button
                type="button"
                onClick={saveModalEditor}
                className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-500 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:from-blue-700 hover:to-indigo-600"
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
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-blue-50 px-5 py-4">
              <div>
                <h3 className="text-base font-black text-slate-950">
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

            <div className="overflow-auto p-6">
              <div className="min-h-[38vh] whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-6 text-slate-900">
                {readModal.value}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
