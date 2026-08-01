/**
 * BF-12B — Backup output güvenliği.
 *
 * Gerçek output repo/worktree/git-tracked path İÇİNE yazılamaz; mevcut dolu klasör
 * üzerine yazılamaz (fail-closed, overwrite yok); symlink/escape kontrol edilir;
 * atomik temp→final rename kullanılır.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";

/** En yakın .git'i (dosya veya klasör) yukarı doğru arar → git worktree kökü. */
export function findGitRoot(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(resolve(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isInside(child: string, parent: string): boolean {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(p + sep);
}

/**
 * Output klasörünün güvenli olduğunu doğrular. Değilse FAIL-CLOSED (throw).
 * @param dir kullanıcının verdiği output path
 * @param opts.repoRoots yasak kökler (repo/worktree kökleri)
 */
export function assertSafeOutputDir(
  dir: string,
  opts: { repoRoots: string[] },
): string {
  if (!dir || dir.trim() === "") {
    throw new Error("Output path zorunludur (tool default output üretmez).");
  }
  const resolved = resolve(dir);

  for (const root of opts.repoRoots) {
    if (root && isInside(resolved, root)) {
      throw new Error(`Output repo/worktree İÇİNDE olamaz: ${resolved}`);
    }
  }
  if (resolved.split(sep).includes(".git")) {
    throw new Error("Output .git path'i içeremez.");
  }

  if (existsSync(resolved)) {
    const st = lstatSync(resolved);
    if (st.isSymbolicLink()) {
      throw new Error("Output path bir symlink olamaz (escape riski).");
    }
    if (!st.isDirectory()) {
      throw new Error("Output path mevcut ve klasör değil.");
    }
    if (readdirSync(resolved).length > 0) {
      throw new Error("Output klasörü dolu — overwrite yok (fail-closed).");
    }
  }

  // Ebeveyn var olmalı (yeni klasör oluşturulabilir).
  const parent = dirname(resolved);
  if (!existsSync(parent)) {
    throw new Error(`Output ebeveyn klasörü yok: ${parent}`);
  }
  // Ebeveyn gerçek yolu repo içine düşmemeli (symlink escape).
  const realParent = realpathSync(parent);
  for (const root of opts.repoRoots) {
    if (root && isInside(realParent, root)) {
      throw new Error("Output ebeveyni (gerçek yol) repo içinde — reddedildi.");
    }
  }
  return resolved;
}

/** Atomik: temp klasörüne yaz, başarıda final'e rename. temp final ile aynı ebeveynde. */
export function makeTempSibling(finalDir: string): string {
  const parent = dirname(resolve(finalDir));
  const tmp = resolve(parent, `.bf12b-tmp-${process.pid}`);
  if (existsSync(tmp)) {
    throw new Error(`Temp klasör zaten var: ${tmp}`);
  }
  mkdirSync(tmp, { recursive: false });
  return tmp;
}

export function promoteTempToFinal(tempDir: string, finalDir: string): void {
  renameSync(tempDir, resolve(finalDir));
}
