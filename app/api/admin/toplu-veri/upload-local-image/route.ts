import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const STONE_BUCKET = "stone-photos";
const PATH_SEP = process.platform === "win32" ? "\\" : "/";

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "tif",
  "tiff",
]);

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
};

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function normalizePathSlashes(value: string) {
  return process.platform === "win32"
    ? value.replace(/\//g, "\\")
    : value.replace(/\\/g, "/");
}

function fileBaseName(filePath: string) {
  const normalized = normalizePathSlashes(filePath);
  const parts = normalized.split(PATH_SEP).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function fileExtension(filePath: string) {
  const base = fileBaseName(filePath);
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1) : "";
}

function isAbsoluteLocalPath(localPath: string) {
  const trimmed = localPath.trim();
  return /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\");
}

function resolveImportRoot(basePath?: string): string {
  const fromArg = typeof basePath === "string" ? basePath.trim() : "";
  const fromEnv =
    typeof process.env.IMPORT_IMAGE_BASE_PATH === "string"
      ? process.env.IMPORT_IMAGE_BASE_PATH.trim()
      : "";
  const cwd =
    typeof process.cwd === "function" ? String(process.cwd() ?? "").trim() : "";
  const root = fromArg || fromEnv || cwd || ".";
  return normalizePathSlashes(root);
}

function joinPaths(root: string, relative: string) {
  const cleanRoot = normalizePathSlashes(root).replace(/[\\/]+$/, "");
  const cleanRelative = normalizePathSlashes(relative).replace(/^[\\/]+/, "");
  return `${cleanRoot}${PATH_SEP}${cleanRelative}`;
}

function resolveImportImagePath(localPath: string, basePath?: string) {
  const trimmed = localPath.trim();
  if (!trimmed) {
    throw new Error("Geçersiz görsel yolu");
  }

  const normalizedInput = normalizePathSlashes(trimmed);

  if (isAbsoluteLocalPath(trimmed)) {
    return normalizedInput;
  }

  const resolvedRoot = resolveImportRoot(basePath);
  const resolved = joinPaths(resolvedRoot, normalizedInput);

  if (!resolved.startsWith(resolvedRoot)) {
    throw new Error("Geçersiz görsel yolu");
  }

  return resolved;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      localPath?: string;
      tenantId?: string;
      basePath?: string;
    };

    const localPath = String(body.localPath ?? "").trim();
    const tenantId = String(body.tenantId ?? "").trim();
    const basePath = body.basePath ? String(body.basePath).trim() : undefined;

    if (!localPath || !tenantId) {
      return NextResponse.json(
        { ok: false, error: "localPath ve tenantId gerekli" },
        { status: 400 },
      );
    }

    const ext = fileExtension(localPath).toLowerCase();
    if (!ext || !ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { ok: false, error: "Desteklenmeyen dosya uzantısı" },
        { status: 400 },
      );
    }

    let absolutePath: string;
    try {
      absolutePath = resolveImportImagePath(localPath, basePath);
    } catch {
      return NextResponse.json({ ok: false, error: "Geçersiz görsel yolu" }, { status: 400 });
    }

    const fs = await import("node:fs/promises");

    try {
      await fs.access(absolutePath);
    } catch {
      return NextResponse.json({
        ok: false,
        exists: false,
        error: "Dosya bulunamadı",
      });
    }

    const fileBuffer = await fs.readFile(absolutePath);
    const originalName = fileBaseName(absolutePath);
    const storagePath = `catalog/${tenantId}/${Date.now()}-${safeFileName(originalName)}`;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase yapılandırması eksik" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: uploadError } = await supabase.storage
      .from(STONE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: MIME_BY_EXT[ext] ?? "application/octet-stream",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ ok: false, error: uploadError.message });
    }

    const { data } = supabase.storage.from(STONE_BUCKET).getPublicUrl(storagePath);

    return NextResponse.json({
      ok: true,
      exists: true,
      name: originalName,
      url: data.publicUrl,
      path: storagePath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
