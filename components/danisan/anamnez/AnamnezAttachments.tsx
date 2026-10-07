"use client";

import { useRef, useState } from "react";
import { MOBILE_HIDDEN_INLINE_FLEX } from "@/components/platform/mobileHidden";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { anamnezFetch, openSignedUrl, triggerUrlDownload, uploadToSignedPath } from "@/lib/danisan/anamnez/client";
import { formatInstantDate } from "@/lib/danisan/anamnez/format";
import { ANAMNEZ_MAX_ATTACHMENTS, ANAMNEZ_PDF_MAX_BYTES, hasPdfExtension } from "@/lib/danisan/anamnez/storage";
import type { AnamnezLocale } from "@/lib/danisan/anamnez/schema";
import type { AnamnezAttachment } from "@/lib/danisan/anamnez/types";
import { errorKey } from "./AnamnezDialogs";
import { aGhostBtn, aHint } from "./styles";

/**
 * Anamnez PDF ekleri. Yükleme: prepare (sunucu yolu + imzalı URL) → doğrudan Storage'a yükleme →
 * finalize (sunucu gerçek %PDF- imzası + boyut). Görüntüle/İndir: her tıklamada 60 sn'lik yeni
 * signed URL. ANDROID/WEBVIEW'DA GİZLENMEZ (K8) — cihaz tespiti YOK.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AnamnezAttachments({
  base,
  attachments,
  locale,
  canUpload,
  onChange,
}: {
  base: string;
  attachments: AnamnezAttachment[];
  locale: AnamnezLocale;
  canUpload: boolean;
  onChange: (next: AnamnezAttachment[]) => void;
}) {
  const t = useTranslations("clients.anamnez");
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const full = attachments.length >= ANAMNEZ_MAX_ATTACHMENTS;

  const fail = (message: string) => showToast({ type: "error", title: t("attachments.title"), message });

  async function upload(file: File) {
    if (!hasPdfExtension(file.name) || (file.type && file.type !== "application/pdf")) return fail(t("attachments.notPdf"));
    if (file.size > ANAMNEZ_PDF_MAX_BYTES) return fail(t("attachments.tooLarge"));
    if (full) return fail(t("attachments.limit"));
    setBusy(true);
    try {
      const prep = await anamnezFetch<{ path: string; token: string }>(`${base}/attachments/prepare`, {
        method: "POST",
        body: { fileName: file.name, size: file.size, contentType: "application/pdf" },
      });
      if (!prep.ok) return fail(t(`errors.${errorKey(prep.code)}`));
      const uploaded = await uploadToSignedPath(prep.data.path, prep.data.token, file);
      if (!uploaded) {
        await anamnezFetch(`${base}/attachments/cleanup`, { method: "POST", body: { path: prep.data.path } });
        return fail(t("errors.generic"));
      }
      const fin = await anamnezFetch<{ attachment?: AnamnezAttachment }>(`${base}/attachments/finalize`, {
        method: "POST",
        body: { path: prep.data.path, originalName: file.name },
      });
      if (!fin.ok) {
        if (fin.code !== "INVALID_TYPE" && fin.code !== "TOO_LARGE" && fin.code !== "LIMIT_REACHED") {
          await anamnezFetch(`${base}/attachments/cleanup`, { method: "POST", body: { path: prep.data.path } });
        }
        return fail(fin.code === "INVALID_TYPE" ? t("attachments.invalidPdf") : t(`errors.${errorKey(fin.code)}`));
      }
      if (fin.data.attachment) onChange([...attachments, fin.data.attachment]);
      showToast({ type: "success", title: t("attachments.title"), message: t("attachments.uploaded") });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function signedUrl(id: string, mode: "view" | "download"): Promise<string | null> {
    const res = await anamnezFetch<{ url: string }>(`${base}/attachments/${id}?mode=${mode}`);
    if (!res.ok) {
      fail(t(`errors.${errorKey(res.code)}`));
      return null;
    }
    return res.data.url;
  }

  async function view(id: string) {
    const r = await openSignedUrl(() => signedUrl(id, "view"));
    if (r === "blocked") fail(t("attachments.popupBlocked"));
  }

  async function download(id: string) {
    const url = await signedUrl(id, "download");
    if (url) triggerUrlDownload(url);
  }

  async function remove(a: AnamnezAttachment) {
    const ok = await confirm({
      title: t("attachments.removeTitle"),
      message: t("attachments.removeMessage", { name: a.original_name }),
      tone: "danger",
      confirmText: t("attachments.removeConfirm"),
      cancelText: t("delete.cancel"),
    });
    if (!ok) return;
    const res = await anamnezFetch(`${base}/attachments/${a.id}`, { method: "DELETE" });
    if (!res.ok) return fail(t(`errors.${errorKey(res.code)}`));
    onChange(attachments.filter((x) => x.id !== a.id));
    showToast({ type: "success", title: t("attachments.title"), message: t("attachments.removed") });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-[15px] font-extrabold text-slate-800">📎 {t("attachments.title")}</h3>
          <p className={`${aHint} mt-0.5`}>{canUpload ? t("attachments.hint") : t("attachments.lockedHint")}</p>
        </div>
        {canUpload ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <button
              type="button"
              disabled={busy || full}
              onClick={() => inputRef.current?.click()}
              data-testid="anamnez-pdf-upload"
              className={`btn-secondary min-h-[42px] shrink-0 disabled:opacity-60 ${MOBILE_HIDDEN_INLINE_FLEX}`}
            >
              {busy ? t("attachments.uploading") : t("attachments.upload")}
            </button>
          </>
        ) : null}
      </div>

      {attachments.length === 0 ? (
        <p className="mt-3 text-[13px] font-medium text-slate-400">{t("attachments.empty")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {attachments.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-bold text-slate-800">📄 {a.original_name}</div>
                <div className="text-[12px] font-medium text-slate-500">
                  {formatInstantDate(a.created_at, locale)} · {formatSize(a.size_bytes)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void view(a.id)} className={aGhostBtn}>{t("attachments.view")}</button>
                <button type="button" onClick={() => void download(a.id)} className={aGhostBtn}>{t("attachments.download")}</button>
                {canUpload ? (
                  <button
                    type="button"
                    onClick={() => void remove(a)}
                    className="inline-flex min-h-[40px] items-center rounded-xl px-3 text-[13px] font-bold text-rose-700 hover:bg-rose-50"
                  >
                    {t("attachments.remove")}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {full && canUpload ? <p className={`${aHint} mt-2`}>{t("attachments.limit")}</p> : null}
    </div>
  );
}
