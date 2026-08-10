import { Suspense, type ReactNode } from "react";
import YebsShell from "./components/YebsShell";

export const metadata = {
  title: "Yaşam Enerjisi Bilgi Sistemi",
};

export default function YebsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/40 via-white to-white">
      <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">Yükleniyor…</div>}>
        <YebsShell>{children}</YebsShell>
      </Suspense>
    </div>
  );
}
