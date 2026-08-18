import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

/** Yüklenme durumu (canonical Bilgi Bankası paylaşılan sunumu). */
export function KnowledgeLoading({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

/** Hata durumu. */
export function KnowledgeError({ message }: { message: string }) {
  return (
    <div className="mx-auto my-6 max-w-xl rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700">
      {message}
    </div>
  );
}

/** Boş durum — "Henüz yayınlanmış içerik yok" gibi (gerçekten boşsa). */
export function KnowledgeEmpty({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="mx-auto my-8 max-w-xl rounded-2xl border border-indigo-100 bg-white/70 px-6 py-10 text-center">
      <p className="text-sm font-bold text-slate-700">{title}</p>
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

/** Modül kilidi (human_design uzmana kapalı / oturum yok). */
export function KnowledgeLocked({ message }: { message: string }) {
  return (
    <div className="mx-auto my-8 max-w-xl rounded-2xl border border-amber-200 bg-amber-50/80 px-6 py-10 text-center">
      <p className="text-sm font-bold text-amber-800">Bilgi Bankası şu an erişilebilir değil</p>
      <p className="mt-1.5 text-xs leading-relaxed text-amber-700">{message}</p>
    </div>
  );
}
