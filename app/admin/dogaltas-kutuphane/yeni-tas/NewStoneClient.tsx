"use client";

/** Yeni taş (owner kökenli). Yalnız Türkçe ad zorunlu. Lisans / SHA / doğrulanmış çeviri bilgisi atanmaz ve gösterilmez. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OwnerHealthNotice, OwnerNotFound, OwnerShell, useToast } from "../_components/OwnerShell";
import { StoneForm, emptyForm, formToData, type FormErrors, type FormState, type StoneRef } from "../_components/StoneForm";
import { ownerErrorText, ownerGet, ownerPost } from "../_components/ownerApi";
import s from "../_components/owner.module.css";

export default function NewStoneClient() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [stones, setStones] = useState<StoneRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const { show: showToast, view: toastView } = useToast();

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await ownerGet<{ ok: true; stones: (StoneRef & { deleted: boolean })[] }>("/katalog");
      if (!live) return;
      if (r.ok) setStones((r.data.stones ?? []).filter((x) => !x.deleted));
      else if (r.status === 404) setNotFound(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  if (notFound) {
    return (
      <OwnerShell section="new">
        <OwnerNotFound />
      </OwnerShell>
    );
  }

  const save = async (publish: boolean) => {
    const { data, errors: errs } = formToData(form, null);
    setErrors(errs);
    if (Object.keys(errs).length) {
      showToast("Formdaki hataları düzeltin.", { tone: "err" });
      return;
    }
    setBusy(true);
    const r = await ownerPost<{ ok: true; result: { id: string; slug: string; published: boolean } }>("/yeni-tas", { data, publish });
    setBusy(false);
    if (!r.ok) {
      if (r.code === "SL100") setErrors({ name_tr: "Bu adla bir taş zaten var." });
      showToast(ownerErrorText(r), { tone: "err" });
      return;
    }
    router.push(`/admin/dogaltas-kutuphane/tas/${r.data.result.id}`);
  };

  return (
    <OwnerShell section="new">
      <Link className={s.crumb} href="/admin/dogaltas-kutuphane">
        ‹ Taş yönetimine dön
      </Link>
      <header className={s.osHead}>
        <div>
          <h1>Yeni taş ekle</h1>
          <div className={s.osMeta}>
            <span className={`${s.pill} ${s.pillViolet}`}>Owner tarafından oluşturuldu</span>
            <span className={s.muted}>Zorunlu alan yalnız Türkçe ad</span>
          </div>
        </div>
      </header>
      <p className={s.lockNote}>Bu taş &quot;Owner tarafından oluşturuldu&quot; kaynak türüyle kaydedilir. Görseller ve ek bilgiler, taş kaydedildikten sonra taş sayfasındaki sekmelerden eklenir.</p>
      <OwnerHealthNotice />
      <StoneForm form={form} onChange={setForm} base={null} errors={errors} stones={stones} selfSlug={null} />
      <div className={s.savebar}>
        <span className={s.sbL}>Yeni taş</span>
        <div className={s.rowActions}>
          <Link className={`btn-outline ${s.btn}`} href="/admin/dogaltas-kutuphane">
            Vazgeç
          </Link>
          <button type="button" className={`btn-secondary ${s.btn}`} disabled={busy} onClick={() => void save(false)}>
            Taslak Kaydet
          </button>
          <button type="button" className={`btn-success ${s.btn}`} disabled={busy} onClick={() => void save(true)}>
            Kaydet ve Yayınla
          </button>
        </div>
      </div>
      {toastView}
    </OwnerShell>
  );
}
