/**
 * Şifa Rehberi F3 — GERÇEK test altyapısı (yalnız izole test projesi; guard.ts FAIL-CLOSED).
 *  - Sentetik ZZ tenant / uzman / oturum (production'a hiçbir istek yok; süreç içi fetch çiti).
 *  - GERÇEK `next dev` (webpack) + GERÇEK API + GERÇEK Supabase (test projesi).
 *  - F2 prototipinin örnek çalışma alanı (fixtures/seed.mjs) kullanıcının kütüphanesine API ile tohumlanır.
 *  - store(): kayıtlı hâli API'den okuyup F2 ekran biçimine çevirir; tohum kimlikleri (t-akciger, n-bronsit …) geri eşlenir
 *    → F2 testlerindeki doğrulamalar aynen çalışır (tarayıcı belleği yerine sunucudaki gerçek kayıt).
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { connectTestDb, installNetworkFence, loadTestTarget } from "../../sifa-rehberi-v2/real/guard";
import { stateToChangeset, workspaceToState, type Meta, type State } from "../../../lib/sifa-rehberi-f3/model";
import { jsonToHtml, jsonToText } from "../../../lib/sifa-rehberi-f3/richText";
import type { JSONContent } from "@tiptap/core";
import type { Workspace } from "../../../lib/sifa-rehberi-v2/types";
import { seedState } from "../fixtures/seed.mjs";

export const T = loadTestTarget();
installNetworkFence(T);
export const db = await connectTestDb();
const storageAdmin = createClient(T.url, T.secretKey, { auth: { persistSession: false } });

export type U = { id: string; tenant: string; token: string; name: string; email: string };
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mkTenant(label: string): Promise<string> {
  const id = randomUUID();
  await db.query("insert into public.tenants(id, name) values ($1, $2)", [id, `ZZ_SIFA_F3_${label}`]);
  return id;
}
export async function mkUser(tenant: string, label: string, opts: { demo?: boolean } = {}): Promise<U> {
  const id = randomUUID();
  const token = `zz-sifa-f3-${randomUUID()}`;
  const email = `zz.sifa.f3.${label.toLowerCase()}.${id.slice(0, 6)}@example.test`;
  const name = `ZZ_SIFA_F3_${label}`;
  await db.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, membership_status, subscription_status)
     values ($1, $2, $3, 'expert', true, 'approved', '{"sifa_rehberi": true}', 'premium', 'premium', $4, 'active', 'active')`,
    [id, name, email, tenant],
  );
  if (opts.demo) await db.query("update public.users set is_demo_account=true where id=$1", [id]);
  await db.query("insert into public.user_sessions(user_id, session_token) values ($1, $2)", [id, token]);
  return { id, tenant, token, name, email };
}
export const userRecord = (u: U) =>
  JSON.stringify({ id: u.id, tenant_id: u.tenant, full_name: u.name, email: u.email, role: "expert", status: "active", plan: "premium", package_type: "premium", subscription_status: "active", membership_status: "active", module_permissions: { sifa_rehberi: true } });

// ── Sunucu ──────────────────────────────────────────────────────────────────────
export function childEnv(): NodeJS.ProcessEnv {
  const e = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(process.env)) if (!/SUPABASE|DATABASE_URL|POSTGRES|PGPASSWORD|SIFA_/i.test(k)) e[k] = v;
  e.NEXT_PUBLIC_SUPABASE_URL = T.url;
  e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = T.publishableKey;
  e.NEXT_PUBLIC_SUPABASE_ANON_KEY = T.publishableKey;
  e.SUPABASE_SERVICE_ROLE_KEY = T.secretKey;
  e.SIFA_REHBERI_V2_ENABLED = "1";
  e.NEXT_TELEMETRY_DISABLED = "1";
  return e;
}
export async function startServer(port: number, probe: U, log: string, extraEnv: Record<string, string> = {}): Promise<ChildProcess> {
  const out = createWriteStream(log);
  // SIFA_F3_SERVER=start → production sunucusu (önce real/build-prod.mts ile test ortamı build'i); varsayılan next dev.
  // Production sunucusu çok daha az bellek kullanır ve yayınlanacak derlenmiş kodu sınar.
  const args = process.env.SIFA_F3_SERVER === "start" ? ["next", "start", "-p", String(port)] : ["next", "dev", "--webpack", "-p", String(port)];
  const p = spawn("npx", args, { cwd: process.cwd(), env: { ...childEnv(), ...extraEnv }, shell: true, stdio: ["ignore", "pipe", "pipe"] });
  p.stdout?.pipe(out);
  p.stderr?.pipe(out);
  const until = Date.now() + 420_000;
  while (Date.now() < until) {
    try {
      const r = await fetch(`http://localhost:${port}/api/sifa-rehberi-v2/workspace`, { headers: { "x-user-id": probe.id, "x-session-token": probe.token } });
      if (r.status === 200 || r.status === 404) return p;
    } catch {
      /* henüz hazır değil */
    }
    await sleep(2000);
  }
  stopServer(p);
  throw new Error(`next ${args[1]} başlamadı`);
}
export function stopServer(p: ChildProcess) {
  try {
    execSync(`taskkill /PID ${p.pid} /T /F`, { stdio: "ignore" });
  } catch {
    /* zaten kapalı */
  }
}

// ── API ─────────────────────────────────────────────────────────────────────────
export type Res = { status: number; json: Record<string, unknown> | null; buf: Buffer; headers: Headers };
export async function api(base: string, u: U | null, method: string, p: string, body?: unknown, extra: Record<string, string> = {}): Promise<Res> {
  const headers: Record<string, string> = { ...extra };
  if (u) Object.assign(headers, { "x-user-id": u.id, "x-session-token": u.token });
  let payload: string | undefined;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = typeof body === "string" ? body : JSON.stringify(body);
  }
  const r = await fetch(`${base}/api/sifa-rehberi-v2/${p}`, { method, headers, body: payload });
  const buf = Buffer.from(await r.arrayBuffer());
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch {
    json = null;
  }
  return { status: r.status, json, buf, headers: r.headers };
}

/** Görsel yükleme (ürün hattıyla aynı: prepare → imzalı PUT → finalize). Dönen: varlık kimliği. */
export async function uploadPng(base: string, u: U, png: Buffer): Promise<string> {
  const pr = await api(base, u, "POST", "assets/prepare", { mimeType: "image/png", size: png.length });
  if (pr.status !== 200) throw new Error(`prepare ${pr.status} ${JSON.stringify(pr.json)}`);
  const put = await fetch(String(pr.json?.signedUrl), { method: "PUT", headers: { "content-type": "image/png" }, body: new Uint8Array(png) });
  if (!put.ok) throw new Error(`upload ${put.status}`);
  const fz = await api(base, u, "POST", "assets/finalize", { assetId: pr.json?.assetId, path: pr.json?.path });
  if (fz.status !== 200) throw new Error(`finalize ${fz.status}`);
  return String(pr.json?.assetId);
}
export const pngOf = (r: number, g: number, b: number) => sharp({ create: { width: 640, height: 420, channels: 3, background: { r, g, b } } }).png().toBuffer();

// ── Kimlik eşlemesi (tohum kimliği ↔ kullanıcıya özgü UUID) ────────────────────────
const maps = new Map<string, { fwd: Map<string, string>; rev: Map<string, string> }>();
export function uuidFor(u: U, protoId: string): string {
  let m = maps.get(u.id);
  if (!m) maps.set(u.id, (m = { fwd: new Map(), rev: new Map() }));
  const hit = m.fwd.get(protoId);
  if (hit) return hit;
  const h = createHash("sha1").update(`f3-seed:${u.id}:${protoId}`).digest("hex");
  const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
  m.fwd.set(protoId, id);
  m.rev.set(id, protoId);
  return id;
}
const back = (u: U, id: string) => maps.get(u.id)?.rev.get(id) ?? id;
/** Kullanıcıya özgü UUID → tohum kimliği (bilinmeyen kimlik aynen döner). */
export const protoIdOf = (u: U, id: string) => back(u, id);

/** Testte yalnız <p>…</p> (tohum ve test notları) — saf ayrıştırıcı (tarayıcı dışı). */
const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
export const nodeCodec = {
  toJson: (html: string): JSONContent => {
    const paras = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
    const list = paras.length ? paras : html ? [html.replace(/<[^>]+>/g, "")] : [];
    return { type: "doc", content: list.map((t) => ({ type: "paragraph", content: t ? [{ type: "text", text: decode(t.replace(/<[^>]+>/g, "")) }] : [] })) };
  },
  toText: jsonToText,
};

function remapState(u: U, s: State): State {
  const id = (x: string) => uuidFor(u, x);
  return {
    topics: s.topics.map((t) => ({ ...t, id: id(t.id) })),
    nodes: s.nodes.map((n) => ({ ...n, id: id(n.id), rootId: id(n.rootId), parentId: n.parentId ? id(n.parentId) : null, ...(n.deleteBatch ? { deleteBatch: id(n.deleteBatch) } : {}) })),
    notes: Object.fromEntries(
      Object.entries(s.notes).map(([hid, arr]) => [
        id(hid),
        arr.map((n) => ({ ...n, id: id(n.id), sources: n.sources.map((x) => ({ ...x, id: id(`${n.id}:${x.id}`) })), boxes: (n.boxes ?? []).map((b) => ({ ...b, id: id(b.id) })) })),
      ]),
    ),
    links: s.links.map((l) => ({ a: id(l.a), b: id(l.b) })),
  };
}
const EMPTY = (): State => ({ topics: [], nodes: [], notes: {}, links: [] });
const EMPTY_META = (): Meta => ({ rows: {}, links: {} });

/** Kullanıcının bütün Şifa kayıtlarını (yalnız test projesinde, yalnız bu ZZ kullanıcısının) siler. */
export async function resetUser(u: U) {
  const paths = (await db.query("select storage_path from public.sifa_block_assets where owner_key=$1 and origin='upload'", [u.id])).rows.map((r) => String(r.storage_path));
  await db.query("delete from public.sifa_block_assets where owner_key=$1", [u.id]);
  await db.query("delete from public.sifa_topic_links where owner_key=$1", [u.id]);
  await db.query("delete from public.sifa_topic_blocks where owner_key=$1 and parent_block_id is not null", [u.id]);
  await db.query("delete from public.sifa_topic_blocks where owner_key=$1", [u.id]);
  for (let i = 0; i < 30; i++) {
    const r = await db.query("delete from public.sifa_topics t where owner_key=$1 and not exists (select 1 from public.sifa_topics c where c.parent_id=t.id)", [u.id]);
    if (!r.rowCount) break;
  }
  if (paths.length) await storageAdmin.storage.from("sifa-arastirma").remove(paths);
}

/** F2 örnek çalışma alanını kullanıcının kütüphanesine yazar (gerçek API; görsel gerçek yükleme). */
export async function seedUser(base: string, u: U, png: Buffer) {
  await resetUser(u);
  const s = remapState(u, seedState() as State);
  for (const arr of Object.values(s.notes)) for (const n of arr) for (const g of n.images) if (g.src.startsWith("png:")) {
    const aid = await uploadPng(base, u, png);
    g.id = aid;
    g.src = `asset:${aid}`;
  }
  const cs = stateToChangeset(EMPTY(), s, EMPTY_META(), nodeCodec, randomUUID);
  const r = await api(base, u, "POST", "workspace", cs);
  if (r.status !== 200) throw new Error(`tohum kaydı ${r.status} ${JSON.stringify(r.json)}`);
}

/** Önceden kaydedilmiş not(lar) ekler (F2 testlerinin "önceden kaydedilmiş not" senaryoları; gerçek API). */
export async function addSavedNotesApi(base: string, u: U, hid: string, notes: { title: string; html: string; cls?: string; sources?: State["notes"][string][number]["sources"]; images?: { png: Buffer; caption: string }[] }[]) {
  const ws = (await api(base, u, "GET", "workspace")).json?.workspace as Workspace;
  const { state, meta } = workspaceToState(ws, { toHtml: jsonToHtml });
  const draft: State = JSON.parse(JSON.stringify(state));
  const realHid = maps.get(u.id)?.fwd.get(hid) ?? hid;
  const list = (draft.notes[realHid] ??= []);
  for (const n of notes) {
    const images = [];
    for (const g of n.images ?? []) {
      const aid = await uploadPng(base, u, g.png);
      images.push({ id: aid, src: `asset:${aid}`, caption: g.caption });
    }
    list.push({ id: randomUUID(), title: n.title, html: n.html, cls: n.cls ?? "", sources: (n.sources ?? []).map((x) => ({ ...x, id: randomUUID() })), images, boxes: [], createdAt: null, updatedAt: null, deletedAt: null });
  }
  const r = await api(base, u, "POST", "workspace", stateToChangeset(state, draft, meta, nodeCodec, randomUUID));
  if (r.status !== 200) throw new Error(`not ekleme ${r.status} ${JSON.stringify(r.json)}`);
}

/** Kayıtlı hâl (sunucu) → F2 ekran biçimi; tohum kimlikleri geri eşlenir. */
export async function storeOf(base: string, u: U): Promise<State> {
  const ws = (await api(base, u, "GET", "workspace")).json?.workspace as Workspace;
  const { state } = workspaceToState(ws, { toHtml: jsonToHtml });
  const b = (x: string) => back(u, x);
  return {
    topics: state.topics.map((t) => ({ ...t, id: b(t.id) })),
    nodes: state.nodes.map((n) => ({ ...n, id: b(n.id), rootId: b(n.rootId), parentId: n.parentId ? b(n.parentId) : null })),
    notes: Object.fromEntries(
      Object.entries(state.notes).map(([hid, arr]) => [
        b(hid),
        arr.map((n) => ({ ...n, id: b(n.id), sources: n.sources.map((x) => ({ ...x, id: b(x.id).split(":").pop() as string })) })),
      ]),
    ),
    links: state.links.map((l) => ({ a: b(l.a), b: b(l.b) })),
  };
}

/** Kayıt biçimi güvenli JSON'dur; HTML yazımı normalleşir (satır sonu → paragraf). Metin + satır yapısı karşılaştırılır. */
export const htmlText = (h: unknown) =>
  String(h ?? "")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/(p|div|li)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/** Adres çubuğundaki kullanıcıya özgü UUID'leri tohum kimliklerine çevirir. */
export async function protoHash(page: { evaluate<R>(fn: () => R): Promise<R> }, u: U): Promise<string> {
  const h = await page.evaluate(() => location.hash);
  return h.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (m) => protoIdOf(u, m));
}
