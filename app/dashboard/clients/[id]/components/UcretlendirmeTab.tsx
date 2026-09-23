"use client";

/**
 * Danışan detay — Ücretlendirme sekmesi (merkezi ücret yönetimi).
 *
 * Ücret artık seansa gömülü DEĞİL: danışana ait bütün ücret kayıtlarının TEK
 * KAYNAĞI burasıdır. Uzman istediği kadar bağımsız kayıt ekler (Seans/Ödev/
 * Analiz/Diğer). Toplam ücret üstte; ekle/düzenle/sil anında toplamı günceller.
 *
 * Güvenlik: tüm çağrılar x-user-id + x-session-token ile /api/clients/[id]/charges'a
 * gider; tenant/client kapsamı server-side doğrulanır (bkz. route).
 */

import { runInEffect } from "@/lib/runInEffect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDateAbsolute } from "@/lib/i18n/format";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

type ChargeCategory = "session" | "homework" | "analysis" | "other";
const CATEGORIES: ChargeCategory[] = ["session", "homework", "analysis", "other"];

type ClientCharge = {
  id: string;
  tenant_id: string;
  client_id: string;
  charge_date: string | null;
  category: ChargeCategory;
  detail: string | null;
  note: string | null;
  amount: number;
  source_session_id: string | null;
  created_at: string;
  updated_at: string;
};

type ChargeForm = {
  chargeDate: string;
  category: ChargeCategory;
  detail: string;
  note: string;
  amount: string;
};

type UcretlendirmeTabProps = {
  clientId: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(): ChargeForm {
  return { chargeDate: todayISO(), category: "session", detail: "", note: "", amount: "" };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Tutar geçerli (sonlu, > 0) mu? */
function amountValid(raw: string): boolean {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0;
}

const CATEGORY_TONE: Record<ChargeCategory, string> = {
  session: "border-emerald-200 bg-emerald-100 text-emerald-800",
  homework: "border-rose-200 bg-rose-100 text-rose-800",
  analysis: "border-violet-200 bg-violet-100 text-violet-800",
  other: "border-amber-200 bg-amber-100 text-amber-800",
};

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100";
const labelCls = "mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-600";

export default function UcretlendirmeTab({ clientId }: UcretlendirmeTabProps) {
  const t = useTranslations("clients.charges");
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();

  const fmtDate = useCallback(
    (date: string | null) => (date ? formatDateAbsolute(date) : "—"),
    [],
  );

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [charges, setCharges] = useState<ClientCharge[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ChargeForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ChargeForm>(emptyForm());

  const total = useMemo(
    () => charges.reduce((sum, c) => sum + Number(c.amount || 0), 0),
    [charges],
  );

  useEffect(() => {
    void getSyncedTenantId().then(setTenantId);
  }, []);

  const loadCharges = useCallback(async () => {
    if (!clientId || !tenantId) return;
    setLoading(true);
    const token = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/charges`, {
      headers: {
        "x-user-id": readYasamUser()?.id ?? "",
        ...(token ? { "x-session-token": token } : {}),
      },
    });
    if (!res.ok) {
      console.error("Ücret kayıtları yüklenemedi");
      showToast({ title: t("toast.failTitle"), message: t("toast.loadFailed"), type: "error" });
      setLoading(false);
      return;
    }
    const json = (await res.json()) as { charges?: ClientCharge[] };
    // Sıralama: tarih desc (null sonda), sonra created_at desc.
    const list = (json.charges ?? []).slice().sort((a, b) => {
      const d = (b.charge_date ?? "").localeCompare(a.charge_date ?? "");
      if (d !== 0) return d;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
    setCharges(list);
    setLoading(false);
  }, [clientId, tenantId, showToast, t]);

  useEffect(() => {
    if (!tenantId) return;
    runInEffect(() => {
      loadCharges();
    });
  }, [tenantId, loadCharges]);

  /** Form doğrulama (server ile ayna). Geçerliyse null, değilse hata mesajı döner. */
  function validate(f: ChargeForm): string | null {
    if (!CATEGORIES.includes(f.category)) return t("validation.category");
    if (!amountValid(f.amount)) return t("validation.amount");
    if (f.category === "other" && !f.detail.trim()) return t("validation.detailRequired");
    return null;
  }

  function toPayload(f: ChargeForm) {
    return {
      charge_date: f.chargeDate || null,
      category: f.category,
      detail: f.detail.trim() || null,
      note: f.note.trim() || null,
      amount: Number(f.amount),
    };
  }

  async function addCharge() {
    if (!clientId || !tenantId) {
      showToast({ title: t("toast.failTitle"), message: t("toast.noClient"), type: "error" });
      return;
    }
    const err = validate(form);
    if (err) {
      showToast({ title: t("toast.failTitle"), message: err, type: "error" });
      return;
    }
    setSaving(true);
    const token = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/charges`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": readYasamUser()?.id ?? "",
        ...(token ? { "x-session-token": token } : {}),
      },
      body: JSON.stringify(toPayload(form)),
    });
    if (!res.ok) {
      console.error("Ücret kaydı eklenemedi");
      showToast({ title: t("toast.failTitle"), message: t("toast.addFailed"), type: "error" });
      setSaving(false);
      return;
    }
    setForm(emptyForm());
    setShowForm(false);
    await loadCharges();
    setSaving(false);
    showToast({ title: t("toast.successTitle"), message: t("toast.added"), type: "success" });
  }

  function startEdit(charge: ClientCharge) {
    setEditingId(charge.id);
    setEditForm({
      chargeDate: charge.charge_date || todayISO(),
      category: charge.category,
      detail: charge.detail || "",
      note: charge.note || "",
      amount: charge.amount === null || charge.amount === undefined ? "" : String(charge.amount),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm());
  }

  async function updateCharge(id: string) {
    const err = validate(editForm);
    if (err) {
      showToast({ title: t("toast.failTitle"), message: err, type: "error" });
      return;
    }
    setSaving(true);
    const token = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/charges`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": readYasamUser()?.id ?? "",
        ...(token ? { "x-session-token": token } : {}),
      },
      body: JSON.stringify({ id, ...toPayload(editForm) }),
    });
    if (!res.ok) {
      console.error("Ücret kaydı güncellenemedi");
      showToast({ title: t("toast.failTitle"), message: t("toast.updateFailed"), type: "error" });
      setSaving(false);
      return;
    }
    cancelEdit();
    await loadCharges();
    setSaving(false);
    showToast({ title: t("toast.successTitle"), message: t("toast.updated"), type: "success" });
  }

  async function removeCharge(id: string) {
    const ok = await deleteConfirm({ title: t("delete.title"), message: t("delete.message") });
    if (!ok) return;
    const token = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/charges?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        "x-user-id": readYasamUser()?.id ?? "",
        ...(token ? { "x-session-token": token } : {}),
      },
    });
    if (!res.ok) {
      console.error("Ücret kaydı silinemedi");
      showToast({ title: t("toast.failTitle"), message: t("toast.deleteFailed"), type: "error" });
      return;
    }
    if (editingId === id) cancelEdit();
    setCharges((prev) => prev.filter((c) => c.id !== id));
    showToast({ title: t("toast.successTitle"), message: t("toast.deleted"), type: "success" });
  }

  function renderForm(
    data: ChargeForm,
    onChange: <K extends keyof ChargeForm>(key: K, value: ChargeForm[K]) => void,
  ) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className={labelCls}>{t("form.dateLabel")}</label>
          <input
            type="date"
            value={data.chargeDate}
            onChange={(e) => onChange("chargeDate", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>{t("form.categoryLabel")}</label>
          <select
            value={data.category}
            onChange={(e) => onChange("category", e.target.value as ChargeCategory)}
            className={inputCls}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`category.${c}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t(`form.detailLabel.${data.category}`)}</label>
          <input
            value={data.detail}
            onChange={(e) => onChange("detail", e.target.value)}
            placeholder={t(`form.detailPlaceholder.${data.category}`)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>{t("form.amountLabel")}</label>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={data.amount}
            onChange={(e) => onChange("amount", e.target.value)}
            placeholder={t("form.amountPlaceholder")}
            className={inputCls}
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>{t("form.noteLabel")}</label>
          <textarea
            value={data.note}
            onChange={(e) => onChange("note", e.target.value)}
            placeholder={t("form.notePlaceholder")}
            rows={2}
            className={`${inputCls} resize-none leading-5`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Üst: Toplam Ücret + Yeni ekle ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-br from-white via-emerald-50/50 to-amber-50/40 px-4 py-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-emerald-700 shadow-sm">
                {t("header.badge")}
              </div>
              <h2 className="text-base font-black tracking-tight text-slate-950">{t("header.title")}</h2>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-5 text-slate-600">
                {t("header.subtitle")}
              </p>
            </div>

            <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:items-end">
              <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-5 py-3 text-center shadow-md">
                <div className="text-2xl font-black text-emerald-700">{formatMoney(total)}</div>
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                  {t("totalLabel")} · {charges.length} {t("countLabel")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                className={
                  showForm
                    ? "w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100"
                    : "w-full rounded-2xl border border-emerald-300 bg-emerald-600 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700"
                }
              >
                {showForm ? t("form.cancel") : t("addButton")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Yeni kayıt formu ── */}
      {showForm && (
        <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white px-4 py-3">
            <h3 className="text-base font-black text-slate-950">{t("form.newTitle")}</h3>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setForm(emptyForm());
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              {t("form.cancel")}
            </button>
          </div>
          <div className="p-4">
            {renderForm(form, (key, value) => setForm((p) => ({ ...p, [key]: value })))}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm());
                }}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                {t("form.cancel")}
              </button>
              <button
                type="button"
                onClick={addCharge}
                disabled={saving}
                className="btn-secondary px-4 py-2.5 text-sm disabled:opacity-60"
              >
                {saving ? t("form.saving") : t("form.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Kayıt listesi ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-black tracking-tight text-slate-950">{t("header.title")}</h3>
          <button
            onClick={loadCharges}
            disabled={loading}
            className="w-fit rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-60"
          >
            {loading ? t("loading") : t("refresh")}
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-500">
            {t("loadingRecords")}
          </div>
        ) : charges.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div className="text-base font-black text-slate-800">{t("empty.title")}</div>
            <p className="mt-2 text-sm font-medium text-slate-500">{t("empty.hint")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {charges.map((charge) => {
              const isEditing = editingId === charge.id;
              if (isEditing) {
                return (
                  <div key={charge.id} className="rounded-2xl border border-emerald-300 bg-emerald-50/40 p-4">
                    <h4 className="mb-3 text-sm font-black text-slate-950">{t("form.editTitle")}</h4>
                    {renderForm(editForm, (key, value) => setEditForm((p) => ({ ...p, [key]: value })))}
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        onClick={cancelEdit}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
                      >
                        {t("form.cancel")}
                      </button>
                      <button
                        onClick={() => updateCharge(charge.id)}
                        disabled={saving}
                        className="btn-secondary px-4 py-2.5 text-sm disabled:opacity-60"
                      >
                        {saving ? t("form.updating") : t("form.update")}
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={charge.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/60 p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-slate-950">{fmtDate(charge.charge_date)}</span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-black ${CATEGORY_TONE[charge.category]}`}
                      >
                        {t(`category.${charge.category}`)}
                      </span>
                      {charge.detail ? (
                        <span className="truncate text-sm font-bold text-slate-700">{charge.detail}</span>
                      ) : null}
                    </div>
                    {charge.note ? (
                      <p className="mt-1.5 whitespace-pre-wrap text-xs font-medium leading-5 text-slate-500">
                        {charge.note}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="rounded-xl bg-emerald-100 px-3 py-1.5 text-sm font-black text-emerald-800">
                      {formatMoney(Number(charge.amount || 0))}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(charge)}
                        className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 shadow-sm transition hover:bg-blue-100"
                      >
                        {t("item.edit")}
                      </button>
                      <button
                        onClick={() => removeCharge(charge.id)}
                        className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-black text-red-600 shadow-sm transition hover:bg-red-100"
                      >
                        {t("item.delete")}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
