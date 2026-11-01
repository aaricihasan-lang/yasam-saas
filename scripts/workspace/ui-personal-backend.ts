/**
 * KİŞİSEL DİJİTAL OFİS (P4) — UI testleri için durum tutan sahte workspace arka ucu (tarayıcı route mock'u).
 *
 * Mantık GERÇEK sunucu modülleriyle aynıdır: parseDesign / parseUiPrefs (şema), nextDesignState (taslak / uygula / geçmiş /
 * sıfırla geçişi), checkDesignContrast (apply/restore 422 kapısı), checkDeclared + processImage (P2 görsel hattı: içerik
 * doğrulama, yeniden kodlama, EXIF temizliği, varyantlar). Ağ / DB / Storage YOK; her test bağlamı kendi belleğini tutar.
 * Kullanıcı / tenant ayrımı: her arka uç örneği tek kullanıcıyı temsil eder; başka örneğin varlık kimliği 404 döner.
 */
import { randomUUID } from "node:crypto";
import { ASSET_MAX_BYTES, UPLOAD_CHUNK_BYTES, type AssetKind } from "../../lib/workspace/catalog";
import { checkDesignContrast } from "../../lib/workspace/contrast";
import { checkDeclared, processImage } from "../../lib/workspace/imageProcess";
import { DEFAULT_UI_PREFS, parseDesign, parseUiPrefs, UUID_RE, type UiPrefs, type WorkspaceDesign } from "../../lib/workspace/schema";
import { nextDesignState, type RawDesign } from "../../lib/workspace/service";

type Asset = { id: string; kind: AssetKind; createdAt: string; format: string; bytes: number; w: number; h: number; desktop: Buffer; dw: number; dh: number; mobile: Buffer; mw: number; mh: number; deleted: boolean };
type Upload = { id: string; kind: AssetKind; fileName: string; mime: string; size: number; chunks: Map<number, Buffer>; status: "open" | "completed" | "aborted" };
export type Reply = { status: number; json?: unknown; body?: Buffer; contentType?: string };

export type WorkspaceMock = ReturnType<typeof createWorkspaceMock>;

export function createWorkspaceMock(opts: { enabled: boolean; demo?: boolean }) {
  let raw: RawDesign = { applied: null, draft: null, history: [] };
  let version = 0;
  let prefs: UiPrefs = JSON.parse(JSON.stringify(DEFAULT_UI_PREFS));
  let prefsVersion = 0;
  const assets = new Map<string, Asset>();
  const uploads = new Map<string, Upload>();
  const log: { method: string; path: string; status: number }[] = [];

  const safe = (v: unknown): WorkspaceDesign | null => {
    if (v === null || v === undefined) return null;
    const r = parseDesign(v, { allowAssets: true });
    return r.ok ? r.value : null;
  };
  const designState = () => ({
    applied: safe(raw.applied), draft: safe(raw.draft),
    history: raw.history.map((h) => h as { id: string; savedAt: string; design: unknown }).map((h) => ({ id: h.id, savedAt: h.savedAt, design: safe(h.design) })).filter((h) => h.design),
    schemaVersion: 1, version, updatedAt: version ? new Date().toISOString() : null,
  });
  const prefsState = () => ({ ...prefs, schemaVersion: 1, version: prefsVersion, updatedAt: prefsVersion ? new Date().toISOString() : null });
  const view = (a: Asset) => ({
    id: a.id, kind: a.kind, createdAt: a.createdAt,
    original: { format: a.format, bytes: a.bytes, width: a.w, height: a.h },
    desktop: { width: a.dw, height: a.dh, bytes: a.desktop.length, url: `/api/settings/workspace/assets/${a.id}?v=desktop` },
    mobile: { width: a.mw, height: a.mh, bytes: a.mobile.length, url: `/api/settings/workspace/assets/${a.id}?v=mobile` },
  });
  const ownsAssets = (d: WorkspaceDesign): boolean =>
    [d.logo.assetId, d.bg.photoAssetId].every((id) => id === null || (assets.has(id) && !assets.get(id)!.deleted));
  const references = (id: string): string[] => {
    const where: string[] = [];
    const uses = (d: unknown) => { const s = safe(d); return !!s && (s.logo.assetId === id || s.bg.photoAssetId === id); };
    if (uses(raw.applied)) where.push("applied");
    if (uses(raw.draft)) where.push("draft");
    if (raw.history.some((h) => uses((h as { design: unknown }).design))) where.push("history");
    return where;
  };

  async function handle(method: string, path: string, query: URLSearchParams, body: Buffer | null): Promise<Reply> {
    const r = await route(method, path, query, body);
    log.push({ method, path, status: r.status });
    return r;
  }

  async function route(method: string, path: string, query: URLSearchParams, body: Buffer | null): Promise<Reply> {
    if (!opts.enabled) return { status: 404, json: { ok: false, error: "Bulunamadı." } };
    const jsonBody = (): Record<string, unknown> => { try { return JSON.parse(body?.toString("utf8") ?? "{}"); } catch { return {}; } };
    const write = method !== "GET";
    if (write && opts.demo) return { status: 403, json: { ok: false, error: "Demo hesapta bu işlem yapılamaz." } };

    if (path === "/api/settings/workspace/design") {
      if (method === "GET") return { status: 200, json: { ok: true, design: designState() } };
      const b = jsonBody();
      if (b.expectedVersion !== version) return { status: 409, json: { ok: false, code: "VERSION_CONFLICT", error: "Tasarım başka bir sekmede değişti.", design: designState() } };
      const action = String(b.action);
      let a: Parameters<typeof nextDesignState>[1];
      if (action === "saveDraft" || (action === "apply" && b.draft !== undefined)) {
        const d = parseDesign(b.draft, { allowAssets: true });
        if (!d.ok) return { status: 400, json: { ok: false, error: d.error, path: d.path } };
        if (!ownsAssets(d.value)) return { status: 400, json: { ok: false, code: "asset_not_found", error: "Görsel bulunamadı." } };
        a = action === "saveDraft" ? { action: "saveDraft", draft: d.value } : { action: "apply", draft: d.value };
      } else if (action === "restore" || action === "loadHistory") {
        if (typeof b.historyId !== "string" || !UUID_RE.test(b.historyId)) return { status: 400, json: { ok: false, error: "Geçersiz geçmiş kimliği." } };
        a = { action, historyId: b.historyId };
      } else if (action === "discardDraft" || action === "apply" || action === "reset") {
        a = { action };
      } else return { status: 400, json: { ok: false, error: "Geçersiz işlem." } };
      const n = nextDesignState(raw, a, new Date().toISOString());
      if (!n.ok) return { status: 400, json: { ok: false, error: n.error } };
      if (action === "apply" || action === "restore") {
        const ap = safe(n.next.applied);
        const issues = ap ? checkDesignContrast(ap) : [];
        if (issues.length) return { status: 422, json: { ok: false, code: "CONTRAST_INSUFFICIENT", error: "Okunabilirlik yetersiz.", issues } };
      }
      raw = n.next;
      version++;
      return { status: 200, json: { ok: true, design: designState() } };
    }

    if (path === "/api/settings/workspace/prefs") {
      if (method === "GET") return { status: 200, json: { ok: true, prefs: prefsState() } };
      const b = jsonBody();
      if (b.expectedVersion !== prefsVersion) return { status: 409, json: { ok: false, code: "VERSION_CONFLICT", error: "Tercihler başka bir sekmede değişti.", prefs: prefsState() } };
      const p = parseUiPrefs(b.prefs);
      if (!p.ok) return { status: 400, json: { ok: false, error: p.error, path: p.path } };
      prefs = p.value;
      prefsVersion++;
      return { status: 200, json: { ok: true, prefs: prefsState() } };
    }

    if (path === "/api/settings/workspace/assets" && method === "GET") {
      return { status: 200, json: { ok: true, assets: [...assets.values()].filter((a) => !a.deleted).map(view) } };
    }
    if (path === "/api/settings/workspace/assets/uploads" && method === "POST") {
      const b = jsonBody();
      const kind = b.kind === "logo" || b.kind === "photo" ? b.kind : null;
      if (!kind) return { status: 400, json: { ok: false, code: "kind", error: "Geçersiz tür." } };
      const dec = checkDeclared({ fileName: String(b.fileName ?? ""), mime: String(b.mimeType ?? "") });
      if (!dec.ok) return { status: 400, json: { ok: false, code: dec.code, error: dec.error } };
      const size = Number(b.size);
      if (!Number.isInteger(size) || size <= 0 || size > ASSET_MAX_BYTES[kind]) return { status: 413, json: { ok: false, code: "too_large", error: "Görsel çok büyük." } };
      const id = randomUUID();
      uploads.set(id, { id, kind, fileName: String(b.fileName), mime: String(b.mimeType), size, chunks: new Map(), status: "open" });
      return { status: 200, json: { ok: true, uploadId: id, chunkSize: UPLOAD_CHUNK_BYTES, chunkCount: Math.ceil(size / UPLOAD_CHUNK_BYTES), expiresAt: new Date(Date.now() + 900_000).toISOString() } };
    }
    let m = path.match(/^\/api\/settings\/workspace\/assets\/uploads\/([0-9a-f-]{36})\/chunks\/(\d+)$/);
    if (m && method === "PUT") {
      const up = uploads.get(m[1]);
      if (!up || up.status !== "open") return { status: 404, json: { ok: false, code: "not_found", error: "Yükleme bulunamadı." } };
      const i = Number(m[2]);
      if (up.chunks.has(i)) return { status: 409, json: { ok: false, code: "chunk_exists", error: "Bu parça zaten yüklendi." } };
      up.chunks.set(i, body ?? Buffer.alloc(0));
      return { status: 200, json: { ok: true, index: i } };
    }
    m = path.match(/^\/api\/settings\/workspace\/assets\/uploads\/([0-9a-f-]{36})\/complete$/);
    if (m && method === "POST") {
      const up = uploads.get(m[1]);
      if (!up) return { status: 404, json: { ok: false, code: "not_found", error: "Yükleme bulunamadı." } };
      if (up.status === "completed") return { status: 200, json: { ok: true, asset: view(assets.get(up.id)!), reused: true } };
      const count = Math.ceil(up.size / UPLOAD_CHUNK_BYTES);
      const missing = Array.from({ length: count }, (_, i) => i).filter((i) => !up.chunks.has(i));
      if (missing.length) return { status: 409, json: { ok: false, code: "incomplete", error: "Eksik parça.", missing } };
      const bytes = Buffer.concat(Array.from({ length: count }, (_, i) => up.chunks.get(i)!));
      if (bytes.length !== up.size) { up.status = "aborted"; return { status: 400, json: { ok: false, code: "size_mismatch", error: "Boyut uyuşmuyor." } }; }
      const dec = checkDeclared({ fileName: up.fileName, mime: up.mime });
      if (!dec.ok) { up.status = "aborted"; return { status: 400, json: { ok: false, code: dec.code, error: dec.error } }; }
      const p = await processImage(new Uint8Array(bytes), up.kind, dec.format);
      if (!p.ok) { up.status = "aborted"; return { status: 400, json: { ok: false, code: p.code, error: p.error } }; }
      const a: Asset = {
        id: up.id, kind: up.kind, createdAt: new Date().toISOString(), format: p.format, bytes: bytes.length, w: p.originalWidth, h: p.originalHeight,
        desktop: p.desktop.data, dw: p.desktop.width, dh: p.desktop.height, mobile: p.mobile.data, mw: p.mobile.width, mh: p.mobile.height, deleted: false,
      };
      assets.set(a.id, a);
      up.status = "completed";
      return { status: 200, json: { ok: true, asset: view(a) } };
    }
    m = path.match(/^\/api\/settings\/workspace\/assets\/uploads\/([0-9a-f-]{36})$/);
    if (m && method === "DELETE") { const up = uploads.get(m[1]); if (up && up.status === "open") up.status = "aborted"; return { status: 200, json: { ok: true } }; }
    m = path.match(/^\/api\/settings\/workspace\/assets\/([0-9a-f-]{36})$/);
    if (m) {
      const a = assets.get(m[1]);
      if (!a || a.deleted) return { status: 404, json: { ok: false, code: "not_found", error: "Görsel bulunamadı." } };
      if (method === "GET") {
        const v = query.get("v") === "mobile" ? a.mobile : a.desktop;
        return { status: 200, body: v, contentType: "image/webp" };
      }
      if (method === "DELETE") {
        if (jsonBody().confirm !== true) return { status: 400, json: { ok: false, code: "confirm", error: "Onay gerekli." } };
        const where = references(a.id);
        if (where.length) return { status: 409, json: { ok: false, code: "asset_in_use", error: "Bu görsel bir tasarımda kullanılıyor.", where } };
        a.deleted = true;
        return { status: 200, json: { ok: true } };
      }
    }
    return { status: 404, json: { ok: false, error: "Bulunamadı." } };
  }

  return {
    handle, log,
    get raw() { return raw; },
    get prefs() { return prefs; },
    get assetCount() { return [...assets.values()].filter((a) => !a.deleted).length; },
    /** Test kurulumu: hazır tasarım / tercih yükler (doğrudan "sunucu durumu"). */
    seed(s: { applied?: WorkspaceDesign | null; prefs?: Partial<UiPrefs> }) {
      if (s.applied !== undefined) { raw = { ...raw, applied: s.applied }; version++; }
      if (s.prefs) { prefs = { ...prefs, ...s.prefs }; prefsVersion++; }
    },
    async seedAsset(kind: AssetKind, bytes: Buffer, fileName: string, mime: string): Promise<string> {
      const st = await handle("POST", "/api/settings/workspace/assets/uploads", new URLSearchParams(), Buffer.from(JSON.stringify({ kind, fileName, mimeType: mime, size: bytes.length })));
      const id = (st.json as { uploadId: string }).uploadId;
      for (let i = 0; i * UPLOAD_CHUNK_BYTES < bytes.length; i++) await handle("PUT", `/api/settings/workspace/assets/uploads/${id}/chunks/${i}`, new URLSearchParams(), bytes.subarray(i * UPLOAD_CHUNK_BYTES, (i + 1) * UPLOAD_CHUNK_BYTES));
      const c = await handle("POST", `/api/settings/workspace/assets/uploads/${id}/complete`, new URLSearchParams(), null);
      if (c.status !== 200) throw new Error(`seedAsset: ${JSON.stringify(c.json)}`);
      return id;
    },
  };
}
