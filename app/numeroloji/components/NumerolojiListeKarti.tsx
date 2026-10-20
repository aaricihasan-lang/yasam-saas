"use client";

import Link from "next/link";
import { User } from "lucide-react";
import styles from "@/app/_premium/numeroloji/numerolojiListe.module.css";
import { useMemo } from "react";
import { resolveRecordMotor } from "../utils/analysisJson";
import { nrDisplay } from "../utils/numerolojiPlainMetin";

export type NumerolojiListeSatir = {
  id: string;
  name: string;
  surname: string;
  birth_date: string;
  created_at: string;
  analysis_data?: unknown;
  /** Hafif liste özeti (?fields=summary): KAYITLI snapshot çekirdek değerleri (Model C). */
  snap_ana?: string | null;
  snap_yan?: string | null;
  snap_ifade?: string | null;
  snap_hy?: string | null;
  snap_pin?: Record<string, unknown> | null;
  snap_method?: string | null;
};

type KartDegerleri = { ana: string; yan: string; ifade: string; hy: string; pin: string | null };

function pinKisa(pin: Record<string, unknown> | null | undefined): string | null {
  if (!pin || typeof pin !== "object") return null;
  const v = ["k1", "k2", "k3", "k4", "k5"].map((k) => pin[k]);
  return v.every((x) => x !== undefined && x !== null && x !== "") ? v.join(" · ") : null;
}

const goster = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "—");

/** MODEL C: kart, kaydın KAYDEDİLDİĞİ GÜNKÜ değerlerini gösterir; ad/tarihten yeniden hesaplamaz. */
function kartDegerleri(row: NumerolojiListeSatir): KartDegerleri | null {
  const hasSnap = [row.snap_ana, row.snap_yan, row.snap_ifade, row.snap_hy].some((v) => typeof v === "string" && v.trim());
  if (hasSnap) {
    return { ana: goster(row.snap_ana), yan: goster(row.snap_yan), ifade: goster(row.snap_ifade), hy: goster(row.snap_hy), pin: pinKisa(row.snap_pin) };
  }
  const motor = row.analysis_data !== undefined ? resolveRecordMotor(row).motor : null;
  if (!motor) return null;
  return {
    ana: nrDisplay(motor.anaKulvar),
    yan: nrDisplay(motor.yanKulvar),
    ifade: nrDisplay(motor.ifadeSayisi),
    hy: nrDisplay(motor.hayatYolu),
    pin: pinKisa(motor.pinKodu as unknown as Record<string, unknown>),
  };
}

function NrChip({ label, value }: { label: string; value: string }) {
  return (
    <span className={styles.nr}>
      <span className={styles.nrL}>{label}</span>
      <span className={styles.nrV}>{value}</span>
    </span>
  );
}

/**
 * 2026-10-20 premium görünüm (owner GÖRSEL PASS — ilk referans). Değerler (kartDegerleri) ve detay bağlantısı
 * DEĞİŞMEDİ; özel sayı gösterimi (11/3, 19/11 (22/8) …) motorun verdiği gibi. Tüm kartlarda aynı sade profil
 * simgesi (kişiye göre avatar/renk YOK).
 */
export function NumerolojiListeKarti({
  row,
  isSelected,
  onToggleSelect,
}: {
  row: NumerolojiListeSatir;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const adSoyad = `${row.name} ${row.surname}`.replace(/\s+/g, " ").trim();
  const vals = useMemo(() => kartDegerleri(row), [row]);
  const pinStr = vals?.pin ?? null;

  return (
    <li className={styles.rowItem}>
      {onToggleSelect !== undefined && (
        <label className={styles.checkAbs} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`${adSoyad} seç`}
            checked={Boolean(isSelected)}
            onChange={(e) => { e.stopPropagation(); onToggleSelect(); }}
          />
        </label>
      )}
      <Link
        href={`/numeroloji/liste/${row.id}`}
        className={`${styles.rowLink} ${isSelected ? styles.rowLinkSel : ""}`}
      >
        <span className={styles.avatar} aria-hidden>
          <User className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <div className={styles.body}>
          <h2 className={styles.name}>{adSoyad}</h2>
          <p className={styles.meta}>
            <span>Doğum: {row.birth_date}</span>
            <span>
              {new Date(row.created_at).toLocaleString("tr-TR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          </p>
          {vals ? (
            <div className={styles.nums}>
              <NrChip label="Ana" value={vals.ana} />
              <NrChip label="Yan" value={vals.yan} />
              <NrChip label="İfade" value={vals.ifade} />
              <NrChip label="Hayat Yolu" value={vals.hy} />
            </div>
          ) : null}
        </div>
        <div className={onToggleSelect !== undefined ? styles.sideSpacer : styles.side}>
          <span className={styles.detay}>DETAY</span>
          {pinStr ? (
            <p className={styles.pin}>
              PIN <b>{pinStr}</b>
            </p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
