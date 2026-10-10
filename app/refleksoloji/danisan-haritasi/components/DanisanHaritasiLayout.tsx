"use client";

/**
 * Refleksoloji — DANIŞAN HARİTASI.
 *
 * Akış (URL durumu → tarayıcı GERİ tuşu adımlar arasında doğal çalışır):
 *   /refleksoloji/danisan-haritasi                     → danışan seç
 *   ?client=<id>                                       → seans listesi + yeni seans
 *   ?client=<id>&session=<id>                          → işaret düzenleyici
 *
 * Danışan sahipliği sunucuda doğrulanır (yabancı/yanlış id → 404 → "Danışan bulunamadı").
 * Tenant atlası (Bölge Haritası / Kayıtlı Atlas) BU EKRANDAN ETKİLENMEZ.
 */
import Link from "next/link";
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ClientPicker, { type PickerClient } from "@/components/danisan/ClientPicker";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { isUuid } from "@/lib/refleksoloji/uuid";
import { ReflexologyDisclaimer } from "../../components/ReflexologyDisclaimer";
import { SessionList } from "./SessionList";
import { SessionEditor } from "./SessionEditor";

export function DanisanHaritasiLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const rawClient = params.get("client");
  const rawSession = params.get("session");
  const clientId = isUuid(rawClient) ? rawClient : null;
  const sessionId = clientId && isUuid(rawSession) ? rawSession : null;
  const isDemo = readYasamUser()?.is_demo_account === true;

  const go = useCallback(
    (next: { client?: string | null; session?: string | null }, replace = false) => {
      const sp = new URLSearchParams();
      if (next.client) sp.set("client", next.client);
      if (next.client && next.session) sp.set("session", next.session);
      const url = sp.size > 0 ? `${pathname}?${sp.toString()}` : pathname;
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: true });
    },
    [pathname, router],
  );

  const crumbs: Array<{ label: string; onClick?: () => void }> = [{ label: "Danışan Haritası", onClick: clientId ? () => go({}) : undefined }];
  if (clientId) crumbs.push({ label: "Seanslar", onClick: sessionId ? () => go({ client: clientId }) : undefined });
  if (sessionId) crumbs.push({ label: "İşaretleme" });

  return (
    <main className="relative flex min-h-screen w-full max-w-none flex-col overflow-x-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] pb-[env(safe-area-inset-bottom)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-none px-3 py-3 sm:px-4 sm:py-4 xl:px-7">
        {isDemo ? (
          <DemoModuleBanner message="Demo hesabında danışan işaretleri kaydedilmez; ekranı inceleyebilirsiniz." />
        ) : null}

        <header className="min-w-0">
          <nav className="text-sm font-bold text-violet-700/90" aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/refleksoloji" className="inline-flex min-h-[32px] items-center hover:text-violet-900">
                  Ana Menü
                </Link>
              </li>
              {crumbs.map((c) => (
                <li key={c.label} className="flex items-center gap-1.5">
                  <span aria-hidden className="text-violet-400">
                    &gt;
                  </span>
                  {c.onClick ? (
                    <button type="button" onClick={c.onClick} className="inline-flex min-h-[32px] items-center hover:text-violet-900">
                      {c.label}
                    </button>
                  ) : (
                    <span className="text-slate-700" aria-current="page">
                      {c.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <h1 className={`mt-1 font-black tracking-tight text-slate-900 sm:text-2xl ${sessionId ? "text-lg" : "text-xl"}`}>Danışan Haritası</h1>
          {/* Mobilde düzenleyicide gizli → harita ekranın üst yarısına çıkar. */}
          <p className={`mt-0.5 text-sm font-medium text-slate-600 ${sessionId ? "hidden sm:block" : ""}`}>
            Danışana özel ayak, el ve yüz haritalarında nokta işaretleyin. Her seans ayrı kaydedilir.
          </p>
        </header>

        <div className="mt-3">
          {!clientId ? (
            <section
              className="mx-auto w-full max-w-xl rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm ring-1 ring-violet-100"
              aria-labelledby="dh-client-title"
            >
              <h2 id="dh-client-title" className="text-base font-black text-slate-900">
                Danışan seçin
              </h2>
              <p className="mb-3 mt-0.5 text-sm text-slate-600">İşaretler yalnız seçtiğiniz danışana kaydedilir.</p>
              <ClientPicker onSelect={(c: PickerClient) => go({ client: c.id })} autoFocus />
            </section>
          ) : sessionId ? (
            <SessionEditor
              key={sessionId}
              clientId={clientId}
              sessionId={sessionId}
              readOnly={isDemo}
              onSessionGone={() => go({ client: clientId }, true)}
            />
          ) : (
            <SessionList
              key={clientId}
              clientId={clientId}
              readOnly={isDemo}
              onOpen={(id) => go({ client: clientId, session: id })}
              onChangeClient={() => go({})}
            />
          )}
        </div>

        <ReflexologyDisclaimer variant="compact" className="mt-4 px-1 text-center" />
      </div>
    </main>
  );
}
