/**
 * BF-12B — Restore planı: topolojik sıra (parent → child), deferred FK, cycle tespiti.
 *
 * Bu faz YALNIZ plan + dry-run üretir; GERÇEK restore executor YAZILMAZ.
 */
import type { ForeignKey, RestorePlan, TablePolicyDecision, TableSchema } from "./types";
import { KNOWN_STORAGE_BUCKETS } from "./constants";

export function buildRestorePlan(
  schemas: Map<string, TableSchema>,
  decisions: Map<string, TablePolicyDecision>,
): RestorePlan {
  const restoreTables: string[] = [];
  const archiveOnly: string[] = [];
  const doNotRestore: string[] = [];
  const systemOnly: string[] = [];

  for (const [table, d] of decisions) {
    if (d.restorePolicy === "RESTORE") restoreTables.push(table);
    else if (d.restorePolicy === "ARCHIVE_ONLY") archiveOnly.push(table);
    else if (d.restorePolicy === "DO_NOT_RESTORE") doNotRestore.push(table);
    else systemOnly.push(table);
  }

  const restoreSet = new Set(restoreTables);
  const deferredForeignKeys: ForeignKey[] = [];
  const missingParents: string[] = [];

  // Bağımlılık grafiği: child → parent (parent önce restore edilmeli).
  const deps = new Map<string, Set<string>>();
  for (const table of restoreTables) deps.set(table, new Set());
  for (const table of restoreTables) {
    const schema = schemas.get(table);
    if (!schema) continue;
    for (const fk of schema.foreignKeys) {
      if (fk.refTable === table) {
        // self-referans → deferred (aynı tablo içi sıralama).
        deferredForeignKeys.push(fk);
        continue;
      }
      if (!restoreSet.has(fk.refTable)) {
        // Parent restore kapsamında değil.
        if (fk.onDelete === "SET NULL") {
          deferredForeignKeys.push(fk); // nullable → sonra uygulanır
        } else {
          // non-nullable FK ama parent restore edilmiyor/yok → eksik parent (fail).
          missingParents.push(`${fk.table}(${fk.columns.join(",")}) -> ${fk.refTable}`);
        }
        continue;
      }
      if (fk.onDelete === "SET NULL") {
        // nullable FK → sıralamayı zorlamaz; deferred.
        deferredForeignKeys.push(fk);
        continue;
      }
      deps.get(table)?.add(fk.refTable);
    }
  }

  // Kahn topolojik sıralama.
  const order: string[] = [];
  const indeg = new Map<string, number>();
  for (const t of restoreTables) indeg.set(t, deps.get(t)?.size ?? 0);
  const queue = restoreTables.filter((t) => (indeg.get(t) ?? 0) === 0).sort();
  const children = new Map<string, string[]>();
  for (const [child, parents] of deps) {
    for (const p of parents) {
      const arr = children.get(p) ?? [];
      arr.push(child);
      children.set(p, arr);
    }
  }
  while (queue.length > 0) {
    const node = queue.shift() as string;
    order.push(node);
    for (const child of (children.get(node) ?? []).sort()) {
      const d = (indeg.get(child) ?? 0) - 1;
      indeg.set(child, d);
      if (d === 0) queue.push(child);
    }
  }

  // Kalanlar → cycle.
  const cycles: string[][] = [];
  const remaining = restoreTables.filter((t) => !order.includes(t));
  if (remaining.length > 0) {
    cycles.push(remaining.sort());
    for (const t of remaining.sort()) order.push(t); // deferred FK ile sona ekle
  }

  const notes: string[] = [];
  if (deferredForeignKeys.length > 0) {
    notes.push(
      `${deferredForeignKeys.length} FK deferred (SET NULL / kapsam-dışı parent / self-ref) — restore sonrası uygulanır.`,
    );
  }
  if (cycles.length > 0) {
    notes.push(`${cycles.length} FK döngüsü tespit edildi — deferred constraint ile restore gerekir.`);
  }
  notes.push("Gerçek restore executor bu araçta YOKTUR; yalnız plan + dry-run.");

  if (missingParents.length > 0) {
    notes.push(`${missingParents.length} eksik parent (non-nullable FK, restore kapsamı dışı) — restore engelli.`);
  }

  return {
    restoreOrder: order,
    archiveOnly: archiveOnly.sort(),
    doNotRestore: doNotRestore.sort(),
    systemOnly: systemOnly.sort(),
    deferredForeignKeys,
    missingParents: missingParents.sort(),
    storageRestoreOrder: [...KNOWN_STORAGE_BUCKETS],
    cycles,
    notes,
  };
}
