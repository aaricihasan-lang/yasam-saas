"use client";

/**
 * Owner yönetim ekranlarının ortak kabuğu: modül içi gezinme, bildirim ("Geri al" destekli), tek sağlık bilgilendirmesi
 * ve tek tip "bulunamadı" durumu. Günlük işlemler onay penceresi açmaz; bildirimdeki "Geri al" ile geri alınır.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { premiumFontVars } from "@/app/_premium/fonts";
import { NOT_FOUND_TEXT } from "@/app/dogaltas/kutuphane/_shared/labels";
import s from "./owner.module.css";
import { useOwnerRoutes } from "./ownerRoutes";

export type OwnerSection = "list" | "stone" | "new" | "translations" | "bulk" | "experts";

export function OwnerShell({ section, children }: { section: OwnerSection; children: ReactNode }) {
  const r = useOwnerRoutes();
  const cur = (k: OwnerSection[]) => (k.includes(section) ? "page" : undefined);
  return (
    <main className={`${s.root} ${premiumFontVars}`}>
      <div className={s.page}>
        <nav className={s.views} aria-label="Doğaltaş Kütüphanesi yönetimi">
          {r.moduleCrumb ? <Link href={r.moduleCrumb.href}>{r.moduleCrumb.label}</Link> : null}
          <Link href={r.list} aria-current={cur(["list", "stone", "new"])}>
            Taş yönetimi
          </Link>
          <Link href={r.bulk} aria-current={cur(["bulk", "translations"])}>
            Kullanıma açma
          </Link>
          <Link href={r.experts} aria-current={cur(["experts"])}>
            Uzman erişimi
          </Link>
          <Link href={r.preview}>{r.previewLabel}</Link>
        </nav>
        {children}
      </div>
    </main>
  );
}

export function OwnerNotFound() {
  const r = useOwnerRoutes();
  return (
    <div className={s.gate} role="status">
      <h1>{NOT_FOUND_TEXT}</h1>
      <Link className={s.btn} href={r.back}>
        {r.backLabel}
      </Link>
    </div>
  );
}

/**
 * Taş yayını ↔ çeviri yayını ilişkisi (DB yayın yüzeyiyle aynı kural; stone_library_published üretimi):
 * taş yayında değilse uzman hiçbir şey görmez; yayındaysa alan bazında öncelik owner sürümü → yayınlanmış doğrulanmış çeviri → kaynak Türkçe.
 */
export function OwnerPublishRelation() {
  return (
    <p className={s.relation} role="note">
      <b>Uzman ne görür?</b> Taş yayında değilse hiçbir içeriği görünmez. Taş yayındaysa her alan için sırasıyla: etkin <b>Owner sürümü</b>, yoksa{" "}
      <b>yayınlanmış doğrulanmış çeviri</b>, o da yoksa <b>kaynak metin (Türkçe)</b>. Çeviriyi yayınlamak taşı yayınlamaz; taşı yayınlamak çevirileri
      yayınlamaz. Uzman yalnız Owner&apos;ın yetki verdiği hesaplarla görür.
    </p>
  );
}

/** Tek sağlık bilgilendirmesi (owner tarafı). Sahte "hukuki inceleme tamamlandı" durumu yoktur. */
export function OwnerHealthNotice() {
  return (
    <p className={s.healthNote} role="note">
      <b>Sağlık bilgilendirmesi:</b> Sağlıkla ilgili alanlar (ör. fiziksel etki ve sağlık iddiası içeren metinler) hukuki inceleme
      tamamlanana kadar uzmanlara gösterilmez. Owner metinleri de aynı kurala tabidir.
    </p>
  );
}

type Toast = { id: number; msg: string; tone: "ok" | "err"; undo?: () => Promise<void> | void };

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const show = useCallback((msg: string, opts: { undo?: Toast["undo"]; tone?: Toast["tone"] } = {}) => {
    if (timer.current) clearTimeout(timer.current);
    seq.current += 1;
    setToast({ id: seq.current, msg, tone: opts.tone ?? "ok", undo: opts.undo });
    timer.current = setTimeout(() => setToast(null), opts.undo ? 10000 : 6000);
  }, []);
  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const view = toast ? (
    <div className={`${s.toast} ${toast.tone === "err" ? s.toastErr : ""}`} role={toast.tone === "err" ? "alert" : "status"}>
      <span>{toast.msg}</span>
      {toast.undo ? (
        <button
          type="button"
          className={s.toastBtn}
          onClick={() => {
            const u = toast.undo;
            hide();
            void u?.();
          }}
        >
          Geri al
        </button>
      ) : null}
      <button type="button" className={s.toastClose} aria-label="Bildirimi kapat" onClick={hide}>
        ×
      </button>
    </div>
  ) : null;
  return { show, hide, view };
}
