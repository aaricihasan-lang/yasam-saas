"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDateAbsolute } from "@/lib/i18n/format";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { todayInZone } from "@/lib/time/reportTime";
import { nextGorusme } from "@/lib/danisan/appointmentRules";
import { isValidSessionDuration, SESSION_DURATION_MAX, SESSION_DURATION_MIN } from "@/lib/danisan/subRecordValidation";
import { dyp } from "@/app/_premium/danisan-yolculugu/DypUi";

type ClientSession = {
  id: string;
  /** DY-03: satır sürümü (atomik CAS; sunucu her güncellemede artırır). */
  row_version?: number;
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
  /**
   * Başarılı seans kaydı danışanın son görüşme tarihini (clients.gorusme) ilerlettiyse
   * parent'a bildirir → hero üst özeti full reload olmadan tazelenir (Z-3 / spec §6).
   */
  onGorusmeChange?: (date: string) => void;
};

type SessionFormState = {
  sessionDate: string;
  sessionType: string;
  durationMinutes: string;
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
  sessionNote: "",
  actionsDone: "",
  suggestions: "",
  nextPlan: "",
};

// Form varsayılanı: İstanbul takvim günü (UTC 00:00–03:00 "dün" hatası yok).
function todayISO() {
  return todayInZone();
}

function isFormEmpty(form: SessionFormState) {
  return (
    !form.sessionDate.trim() &&
    !form.sessionType.trim() &&
    !form.durationMinutes.trim() &&
    !form.sessionNote.trim() &&
    !form.actionsDone.trim() &&
    !form.suggestions.trim() &&
    !form.nextPlan.trim()
  );
}

/**
 * D1 (BUG-001): süre alanı istemcide de sunucuyla AYNI kuralla (0–1440 tam dakika) doğrulanır;
 * boş → geçerli (alan temizlenir). Geçersiz değer API'ye gönderilmez (sunucu da 400 döner).
 */
function durationInputValid(raw: string): boolean {
  const v = raw.trim();
  if (!v) return true;
  return /^\d+$/.test(v) && isValidSessionDuration(Number(v));
}

function formToPayload(form: SessionFormState) {
  return {
    session_date: form.sessionDate || null,
    session_type: form.sessionType.trim(),
    duration_minutes: form.durationMinutes ? Number(form.durationMinutes) : null,
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
      ? "focus:ring-0 focus:outline-none"
      : tone === "emerald"
        ? "focus:ring-0 focus:outline-none"
        : tone === "violet"
          ? "focus:ring-0 focus:outline-none"
          : tone === "amber"
            ? "focus:ring-0 focus:outline-none"
            : "focus:ring-0 focus:outline-none";

  return `w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:ring-4 ${focus}`;
}

function boxClass(
  tone: "blue" | "emerald" | "violet" | "amber" | "rose" | "slate" = "slate"
) {
  const base = "transition";

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
      ? "border-[#e3e7ee] bg-white text-slate-600"
      : tone === "violet"
        ? "border-[#e3e7ee] bg-white text-slate-600"
        : tone === "amber"
          ? "border-[#e3e7ee] bg-white text-slate-600"
          : tone === "rose"
            ? "border-[#e3e7ee] bg-white text-slate-600"
            : tone === "slate"
              ? "border-[#e3e7ee] bg-white text-slate-600"
              : "border-[#e3e7ee] bg-white text-slate-600";

  return (
    <label className={`${dyp.kFieldTitle} mb-2 flex items-center gap-2`}>
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs ${toneClass}`}
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
    <div className={`${dyp.kField} ${boxClass(tone)}`}>
      <div className="flex items-center justify-between gap-3">
        <SectionLabel icon={icon} title={title} tone={tone} />

        <button
          type="button"
          onClick={() => openEditor(title, value, onChange)}
          className={`${dyp.kBtnGhost} ${dyp.kBtnSm} mb-2`}
        >
          {t("expand")}
        </button>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={`${dyp.kInput} ${inputClass(tone)} resize-none leading-5`}
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
      <div className="grid gap-3 md:grid-cols-3">
        <div className={`${dyp.kField} ${boxClass("blue")}`}>
          <SectionLabel icon="📅" title={t("form.dateLabel")} tone="blue" />
          <input
            type="date"
            value={data.sessionDate}
            onChange={(e) => onChange("sessionDate", e.target.value)}
            className={`${dyp.kInput} ${inputClass("blue")}`}
          />
        </div>

        <div className={`${dyp.kField} ${boxClass("emerald")}`}>
          <SectionLabel icon="🧭" title={t("form.typeLabel")} tone="emerald" />
          <input
            value={data.sessionType}
            onChange={(e) => onChange("sessionType", e.target.value)}
            placeholder={t("form.typePlaceholder")}
            className={`${dyp.kInput} ${inputClass("emerald")}`}
          />
        </div>

        <div className={`${dyp.kField} ${boxClass("violet")}`}>
          <SectionLabel icon="⏱️" title={t("form.durationLabel")} tone="violet" />
          <input
            type="number"
            min={SESSION_DURATION_MIN}
            max={SESSION_DURATION_MAX}
            step={1}
            inputMode="numeric"
            aria-invalid={!durationInputValid(data.durationMinutes)}
            value={data.durationMinutes}
            onChange={(e) => onChange("durationMinutes", e.target.value)}
            placeholder={t("form.durationPlaceholder")}
            className={`${dyp.kInput} ${inputClass("violet")}`}
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
      ? "text-slate-800"
      : tone === "emerald"
        ? "text-slate-800"
        : tone === "violet"
          ? "text-slate-800"
          : tone === "amber"
            ? "text-slate-800"
            : "text-slate-800";

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

export default function SessionsTab({ clientId, onGorusmeChange }: SessionsTabProps) {
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
  // DY-03: düzenlenen kaydın açıldığı andaki sürümü (eski sürümle kayıt 409 alır).
  const [editingVersion, setEditingVersion] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<SessionFormState>(emptyForm);

  const [modalEditor, setModalEditor] = useState<ModalEditorState>(null);
  const [modalDraft, setModalDraft] = useState("");
  const [readModal, setReadModal] = useState<ReadModalState>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showForm, setShowForm] = useState(false);

  const totalMinutes = useMemo(() => {
    // D1 (BUG-001): eski geçersiz (negatif / >1440) kayıtlar toplamı bozmaz; kayıtlar DEĞİŞTİRİLMEZ.
    return sessions.reduce(
      (sum, item) => sum + (isValidSessionDuration(item.duration_minutes) ? (item.duration_minutes as number) : 0),
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

    if (!durationInputValid(form.durationMinutes)) {
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.invalidDuration", { max: SESSION_DURATION_MAX }),
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
    // Ağ hatası (offline/timeout/WebView askıya alma) fetch'i fırlatır → saving takılı kalmasın.
    const addRes = await fetch(`/api/clients/${clientId}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": readYasamUser()?.id ?? "",
        ...(addToken ? { "x-session-token": addToken } : {}),
      },
      body: JSON.stringify(formToPayload(form)),
    }).catch(() => null);

    if (!addRes || !addRes.ok) {
      console.error("Seans kaydı eklenemedi");
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.addFailed"),
        type: "error",
      });
      setSaving(false);
      return;
    }

    // Kayıt oluştu: sonraki yan adımlar (görüşme tarihi, liste tazeleme) ağ hatası verse bile
    // "eklenemedi" denmez (tekrar deneme → mükerrer kayıt) ve saving her durumda serbest kalır.
    // Form, yan adımlardan ÖNCE kapatılır: hata olsa da aynı veri yeniden gönderilemez.
    const savedSessionDate = form.sessionDate;
    setForm({ ...emptyForm, sessionDate: todayISO() });
    setShowForm(false);
    try {
      // Z-3: Seans tarihi kaydedilince clients.gorusme güncelle (son seans takibi için).
      // DY-A: yalnız sessionDate ≤ bugün (İstanbul) — ileri tarihli seans son görüşmeyi ilerletmez.
      if (savedSessionDate && tenantId && savedSessionDate <= todayISO()) {
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
        if (cli && nextGorusme(cli.gorusme ?? null, savedSessionDate, todayISO())) {
          const patchRes = await fetch(`/api/clients/${clientId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": readYasamUser()?.id ?? "",
              ...(gToken ? { "x-session-token": gToken } : {}),
            },
            body: JSON.stringify({ gorusme: savedSessionDate }),
          });
          // Hero üst özeti full reload olmadan tazelensin (spec §6).
          if (patchRes.ok) onGorusmeChange?.(savedSessionDate);
        }
      }

      await loadSessions();
    } catch {
      console.error("Seans eklendi; liste/görüşme tazelenemedi");
    } finally {
      setSaving(false);
    }

    showToast({
      title: t("toast.successTitle"),
      message: t("toast.added"),
      type: "success",
    });
  }

  function startEdit(session: ClientSession) {
    setEditingId(session.id);
    setEditingVersion(session.row_version ?? null);
    setEditForm(sessionToForm(session));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm);
  }

  async function updateSession(id: string) {
    if (!durationInputValid(editForm.durationMinutes)) {
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.invalidDuration", { max: SESSION_DURATION_MAX }),
        type: "error",
      });
      return;
    }
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
      body: JSON.stringify({ id, row_version: editingVersion, ...formToPayload(editForm) }),
    }).catch(() => null);

    if (updRes && (updRes.status === 409 || updRes.status === 428)) {
      // DY-03: başka sekme/cihaz kaydı değiştirdi → hiçbir şey yazılmadı; güncel liste yüklenir.
      showToast({ title: t("toast.failTitle"), message: t("toast.recordConflict"), type: "warning" });
      cancelEdit();
      await loadSessions().catch(() => undefined);
      setUpdating(false);
      return;
    }

    if (!updRes || !updRes.ok) {
      // H-08: sunucunun anlaşılır Türkçe nedeni (ör. geçersiz süre, sistem güncellemesi) kullanıcıya gösterilir.
      const errText = updRes ? ((await updRes.json().catch(() => ({}))) as { error?: string }).error : undefined;
      console.error("Seans kaydı güncellenemedi");
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.updateFailed") + (errText ? ": " + errText : ""),
        type: "error",
      });
      setUpdating(false);
      return;
    }

    cancelEdit();
    try {
      await loadSessions();
    } catch {
      console.error("Seans güncellendi; liste tazelenemedi");
    } finally {
      setUpdating(false);
    }

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
    }).catch(() => null);

    if (!delRes || !delRes.ok) {
      console.error("Seans kaydı silinemedi");
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.deleteFailed"),
        type: "error",
      });
      // D1 (DY-04): 404 = kayıt artık yok (başka sekme/cihazda silinmiş) → bayat satır listeden kalkar.
      if (delRes?.status === 404) setSessions((prev) => prev.filter((item) => item.id !== id));
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
      <div className="overflow-hidden">
        <div className={dyp.kHeader}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className={`${dyp.kEyebrow} mb-2 inline-flex`}>
                {t("header.badge")}
              </div>

              <h2 className={dyp.kTitle}>
                {t("header.title")}
              </h2>

              <p className={`${dyp.kDesc} mt-1.5 max-w-3xl`}>
                {t("header.subtitle")}
              </p>
            </div>

            <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:items-end">
              <div className="grid w-full grid-cols-2 gap-2 md:grid-cols-3">
                <div className={dyp.kStat}>
                  <div className={dyp.kStatValue}>
                    {sessions.length}
                  </div>
                  <div className={dyp.kStatLabel}>
                    {t("stats.sessions")}
                  </div>
                </div>

                <div className={dyp.kStat}>
                  <div className={dyp.kStatValue}>
                    {totalMinutes} {t("unitMin")}
                  </div>
                  <div className={dyp.kStatLabel}>
                    {t("stats.duration")}
                  </div>
                </div>

                <div className={dyp.kStat}>
                  <div className={dyp.kStatValue}>
                    {lastSessionDate}
                  </div>
                  <div className={dyp.kStatLabel}>
                    {t("stats.lastSession")}
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
              <p className={`${dyp.kMeta} mt-0.5`}>{t("newForm.subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className={`${dyp.kBtnGhost} ${dyp.kBtnSm} shrink-0`}
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
            <SessionForm
              data={form}
              onChange={updateFormField}
              openEditor={openEditor}
            />
            <div className="mt-6 flex justify-center">
              <button
                onClick={addSession}
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
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className={dyp.kSubtitle}>
              {t("list.title")}
            </h3>
            <p className={`${dyp.kDesc} mt-1`}>
              {t("list.subtitle")}
            </p>
          </div>

          <button
            onClick={loadSessions}
            disabled={loading}
            className={`${dyp.kBtnSecondary} ${dyp.kBtnSm} w-fit disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {loading ? t("list.loading") : t("list.refresh")}
          </button>
        </div>

        {loading ? (
          <div className={dyp.kEmpty}>
            {t("list.loadingRecords")}
          </div>
        ) : sessions.length === 0 ? (
          <div className={dyp.kEmpty}>
            <div className={dyp.kSubtitle}>
              {t("empty.title")}
            </div>
            <p className={`${dyp.kDesc} mt-2`}>
              {t("empty.hint")}
            </p>
          </div>
        ) : (
          <div className="relative space-y-3">
            <div className={`${dyp.kTimelineLine} absolute bottom-0 left-[21px] top-0 hidden w-px md:block`} />

            {sessions.map((session, index) => {
              const isEditing = editingId === session.id;

              return (
                <div key={session.id} className="relative md:pl-10">
                  <div className={`${dyp.kTimelineDot} absolute left-4 top-6 hidden h-3 w-3 rounded-full md:block`} />

                  <div className={`${dyp.kCard} overflow-hidden !p-0`}>
                    {!isEditing ? (
                      <div className="p-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className={`${dyp.kChipBlue} mb-2 inline-flex`}>
                              {session.session_type || t("sessionN", { n: index + 1 })}
                            </div>

                            <h4 className={dyp.kSubtitle}>
                              {fmtDate(session.session_date)}
                            </h4>

                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className={dyp.kChip}>
                                ⏱️ {session.duration_minutes || "-"} {t("unitMin")}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2.5">
                            <button
                              onClick={() => startEdit(session)}
                              className={`${dyp.kBtnSecondary} ${dyp.kBtnSm}`}
                            >
                              {t("item.edit")}
                            </button>

                            <button
                              onClick={() => deleteSession(session.id)}
                              className={`${dyp.kBtnDanger} ${dyp.kBtnSm} ml-1`}
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
                      <div className="border-l-2 border-[#0f6e6e] bg-[#f8f9fb] p-4 sm:p-5">
                        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <h4 className={dyp.kSubtitle}>
                              {t("editForm.title")}
                            </h4>
                            <p className={`${dyp.kDesc} mt-1`}>
                              {t("editForm.subtitle")}
                            </p>
                          </div>

                          <button
                            onClick={cancelEdit}
                            className={`${dyp.kBtnGhost} ${dyp.kBtnSm} self-start sm:shrink-0`}
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
                            className={dyp.kBtnSecondary}
                          >
                            {t("cancel")}
                          </button>

                          <button
                            onClick={() => updateSession(session.id)}
                            disabled={updating}
                            className={dyp.kBtnSave}
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
                className={`${dyp.kBtnGhost} shrink-0`}
              >
                {t("close")}
              </button>
            </div>

            <div className="p-4">
              <textarea
                value={modalDraft}
                onChange={(e) => setModalDraft(e.target.value)}
                className={`${dyp.kInput} h-[42vh] w-full resize-none leading-6`}
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
                className={`${dyp.kBtnGhost} shrink-0`}
              >
                {t("close")}
              </button>
            </div>

            <div className="overflow-auto p-4 sm:p-6">
              <div className={`${dyp.kField} ${dyp.kFieldText} min-h-[38vh] whitespace-pre-wrap`}>
                {readModal.value}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
