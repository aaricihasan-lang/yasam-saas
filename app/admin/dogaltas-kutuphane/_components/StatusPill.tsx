import { STATUS_TR } from "./ownerApi";
import s from "./owner.module.css";

/** Yönetim durumu hapı (içerik temelli renk değil; yalnız yayın durumu). */
export function statusPill(st: string, deleted = false) {
  const key = deleted ? "deleted" : st;
  const cls = key === "published" ? s.pillTeal : key === "hidden" ? s.pillRose : key === "ready" ? s.pillGold : "";
  return <span className={`${s.pill} ${cls}`}>{STATUS_TR[key] ?? key}</span>;
}
