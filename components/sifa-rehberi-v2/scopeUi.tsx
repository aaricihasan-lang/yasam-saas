"use client";

/**
 * Kayıt kapsamı arayüz parçaları (7. aşama Owner kararı):
 *  - KURUM ORTAK kaydı (V1'den aktarılan): tenant'taki yetkili uzmanlar okur; SALT-OKUNUR.
 *    Kişiselleştirmek = özgün kayda dokunmadan AYRI KOPYA ("Kişisel kopya oluştur").
 *  - KİŞİSEL kayıt: yalnız sahibi.
 * Ayrıca: eşzamanlı düzenleme çakışmasında anlaşılır ÇÖZÜM penceresi.
 */
import { Modal, btnGhost, btnPrimary } from "@/components/sifa-rehberi-v2/Modal";
import { buildChangeset, type Conflict } from "@/lib/sifa-rehberi-v2/changeset";
import type { Workspace } from "@/lib/sifa-rehberi-v2/types";

/** V1'den gelen, hazır başlıkla TAM eşleşmeyen notların sistem bölümü. */
export const UNMATCHED_KEY = "bolum:v1_eslesmeyen";

export function SharedBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-[0.1em] text-indigo-800" data-testid="shared-badge">
      🏛 {compact ? "Kurum" : "Kurum ortak kaydı · salt-okunur"}
    </span>
  );
}

export function SharedBanner({ onCopy }: { onCopy?: () => void }) {
  return (
    <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3" role="note" data-testid="shared-banner">
      <p className="text-[13px] font-semibold leading-5 text-indigo-950">
        🏛 Bu kayıt <b>kurumunuzun ortak kaydıdır</b> (eski Şifa Rehberi&apos;nden aktarıldı). Kurumunuzdaki yetkili uzmanlar okuyabilir; değiştirilemez.
        Üzerinde çalışmak isterseniz özgün kayda dokunmadan size ait bir kopya oluşturabilirsiniz.
      </p>
      {onCopy ? (
        <button type="button" onClick={onCopy} className={`${btnPrimary} mt-2 min-h-[40px]`} data-testid="copy-to-personal">
          📄 Kişisel kopya oluştur
        </button>
      ) : null}
    </div>
  );
}

export function ConflictDialog({
  items,
  onApplyMine,
  onTakeTheirs,
  onClose,
}: {
  items: Conflict[];
  onApplyMine: () => void;
  onTakeTheirs: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Kaydedilemedi: kayıt başka yerde değişmiş"
      subtitle="Aşağıdaki kayıtlar siz düzenlerken başka bir pencerede/oturumda kaydedildi. Hiçbir şey yazılmadı; değişiklikleriniz bu ekranda duruyor."
      onClose={onClose}
      testId="conflict-dialog"
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose} data-testid="conflict-close">
            Kapat (ekranda kalsın)
          </button>
          <button type="button" className={btnGhost} onClick={onTakeTheirs} data-testid="conflict-theirs">
            Benimkileri bırak, son kaydı göster
          </button>
          <button type="button" className={btnPrimary} onClick={onApplyMine} data-testid="conflict-mine">
            Son kaydı yükle, benimkileri üstüne uygula
          </button>
        </div>
      }
    >
      <ul className="space-y-1.5" data-testid="conflict-list">
        {items.map((c) => (
          <li key={c.id} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-950">
            {c.kind === "block" ? "🗒 İçerik kutusu" : "📂 Başlık"}: {c.title || "(adsız)"}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12.5px] font-medium leading-5 text-slate-600">
        &quot;Üstüne uygula&quot; seçerseniz bu kayıtlarda diğer penceredeki değişikliklerin yerine sizin metniniz geçer; kalıcı olması için yeniden Kaydet&apos;e basmanız gerekir.
      </p>
    </Modal>
  );
}

/**
 * Kendi kaydedilmemiş değişikliklerini (base → mine) sunucudaki son hâlin (server) ÜSTÜNE uygular.
 * Değişen satırlar sunucunun GÜNCEL sürüm numarasıyla taşınır → sonraki Kaydet, kullanıcı onayıyla yazar.
 */
export function rebaseOnto(base: Workspace, mine: Workspace, server: Workspace): Workspace {
  const cs = buildChangeset(base, mine);
  const changedT = new Set(cs.topics.map((t) => t.id));
  const changedB = new Set(cs.blocks.map((b) => b.id));
  const myT = new Map(mine.nodes.map((n) => [n.id, n]));
  const myB = new Map(mine.blocks.map((b) => [b.id, b]));
  const srvT = new Set(server.nodes.map((n) => n.id));
  const srvB = new Set(server.blocks.map((b) => b.id));
  const nodes = server.nodes.map((n) => (changedT.has(n.id) ? { ...myT.get(n.id)!, version: n.version } : n));
  for (const id of changedT) if (!srvT.has(id)) nodes.push({ ...myT.get(id)!, version: undefined });
  const blocks = server.blocks.map((b) => (changedB.has(b.id) ? { ...myB.get(b.id)!, version: b.version } : b));
  for (const id of changedB) if (!srvB.has(id)) blocks.push({ ...myB.get(id)!, version: undefined });
  const removed = new Set(cs.links_remove);
  const linkKey = (f: string, t: string) => `${f}>${t}`;
  const have = new Set(server.links.map((l) => linkKey(l.fromNodeId, l.toNodeId)));
  const links = server.links.filter((l) => !removed.has(l.id));
  for (const a of cs.links_add) {
    const l = mine.links.find((x) => x.id === a.id);
    if (l && !have.has(linkKey(l.fromNodeId, l.toNodeId))) links.push(l);
  }
  return { ...server, nodes, blocks, links };
}
