"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import PasswordInput from "@/components/ui/PasswordInput";
import { useDialogA11y } from "@/components/admin/members/useDialogA11y";

/**
 * AŞAMA 4a — "Arşivden Çıkar" penceresi (yalnız ana yöneticiye gösterilir; yetki sunucuda ve DB'de ayrıca doğrulanır).
 * Hesap arşivden çıkar ve PASİF kalır: giriş açılmaz, paket/deneme/ödeme/modül bilgileri değişmez.
 * İstek sayfada yapılır (onSubmit) — bu bileşen yalnız onay + parola toplar.
 */
export function MemberUnarchiveDialog({
  open,
  fullName,
  email,
  onClose,
  onSubmit,
}: {
  open: boolean;
  fullName: string;
  email: string;
  onClose: () => void;
  /** true → başarılı (pencere kapanır); false → hata gösterildi, pencere açık kalır. */
  onSubmit: (adminPassword: string) => Promise<boolean>;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => {
    if (busy) return;
    setPassword("");
    onClose();
  };
  const ref = useDialogA11y(open, close, busy);
  if (!open) return null;

  const submit = async () => {
    if (!password.trim() || busy) return;
    setBusy(true);
    const done = await onSubmit(password.trim());
    setBusy(false);
    if (done) {
      setPassword("");
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unarchive-title"
      ref={ref}
      tabIndex={-1}
      data-unarchive-dialog
    >
      <div className="relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-[28px] border-2 border-white/90 bg-gradient-to-br from-sky-50/95 via-white to-violet-50/80 p-5 shadow-[0_24px_64px_rgba(15,23,42,0.22)] sm:p-8">
        <button
          type="button"
          onClick={close}
          disabled={busy}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-500 transition hover:bg-white/80 hover:text-slate-800 disabled:opacity-50"
          aria-label="Kapat"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 id="unarchive-title" className="pr-8 text-xl font-black text-sky-950 sm:text-2xl">
          Arşivden çıkar
        </h2>
        <div className="mt-3 rounded-xl border border-sky-200 bg-white/80 px-4 py-3">
          <p className="break-words text-base font-black text-slate-900">{fullName || "—"}</p>
          <p className="break-all text-sm font-medium text-slate-600">{email}</p>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm font-medium leading-relaxed text-slate-700">
          <li>Hesap arşivden çıkar ve <span className="font-black">pasif</span> kalır; uzman yine giriş yapamaz.</li>
          <li>Girişi açmak için ayrıca “Aktif Yap” gerekir; deneme ve Pro kuralları aynen geçerlidir.</li>
          <li>Paket, deneme hakkı, ödeme, modül izinleri ve kayıtlar değişmez; işlem yönetim geçmişine yazılır.</li>
        </ul>
        <label className="mt-5 block">
          <span className="text-xs font-black uppercase tracking-wide text-slate-600">Ana yönetici parolası</span>
          <PasswordInput
            autoComplete="current-password"
            wrapperClassName="mt-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none ring-violet-300 focus:border-violet-400 focus:ring-2 disabled:opacity-60"
            placeholder="Parolanızı girin"
          />
        </label>
        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-slate-200 bg-white px-5 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !password.trim()}
            data-unarchive-submit
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-sky-300 bg-sky-600 px-5 text-sm font-black text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                İşleniyor…
              </>
            ) : (
              "Arşivden Çıkar"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
