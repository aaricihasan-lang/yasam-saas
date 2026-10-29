"use client";

/**
 * E · Danışan izin kaydı — bağımsız sayfa (FAZ 7). ?chart=<kayıtlı harita> ile açılır; danışan sunucudan (kendi tenant'ı) çözülür.
 * Kayıt sonrası ekleme akışının 2. adımına döner (izin seçili gelir). Form içeriği ConsentForm'dadır (D ile aynı bileşen).
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import kat from "@/app/_premium/hd-education/egitimKatalog.module.css";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import { PRIV_UUID_RE } from "@/lib/human-design/education/private/privateContract";
import { LoadingView, NotFoundView, Shell, useAccess } from "../../_ui/Shell";
import { ConsentForm } from "../../_ui/ConsentForm";
import { privCall } from "../../_ui/privApi";

function ConsentPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const chart = sp.get("chart") ?? "";
  const access = useAccess("trainer", "/api/hd/education/private/access");
  const valid = PRIV_UUID_RE.test(chart);
  const [client, setClient] = useState<string | null | false>(null);
  useEffect(() => {
    if (access !== "ok" || !valid) return;
    let live = true;
    void privCall<{ status: { hdClientId: string | null } }>("trainer", `/api/hd/education/private/charts/${chart}/status`).then((r) => {
      if (live) setClient(r.ok && r.body.status.hdClientId ? r.body.status.hdClientId : false);
    });
    return () => { live = false; };
  }, [access, chart, valid]);
  if (!valid) return <NotFoundView />;
  if (access === "loading" || (access === "ok" && client === null)) return <LoadingView />;
  if (access !== "ok" || !client) return <NotFoundView />;
  const back = `/human-design/egitim-merkezi/ozel/ekle?chart=${chart}`;
  return (
    <Shell>
      <Link className={kat.back} href={back}>← Eğitim arşivine ekleme</Link>
      <header className={kat.dHead}>
        <div>
          <p className={base.eyebrow}>DANIŞAN İZNİ</p>
          <h1 className={kat.dTitle}>Eğitim örneği izni</h1>
          <p className={kat.sub2}>İzin, seçili kayıtlı haritanın danışanına bağlanır</p>
        </div>
      </header>
      <ConsentForm hdClientId={client} clientLabel="Seçili kayıtlı haritanın danışanı" onCancel={() => router.push(back)} onSaved={() => router.push(`${back}&step=2`)} />
    </Shell>
  );
}

export default function Page() {
  return <Suspense fallback={<LoadingView />}><ConsentPage /></Suspense>;
}
