"use client";
/**
 * Şifa Rehberi — ürün ekranı (F3). Onaylı F2 Revizyon 7 ekranını (sifaApp.js) kişisel kütüphane API'sine bağlar.
 * Kimlik: oturumdaki kullanıcı (x-user-id + oturum belirteci; çerez oturumu varsa tarayıcı ekler). Sahiplik ve tenant
 * sunucuda YALNIZ oturumdan belirlenir; bu bileşen başka kullanıcının kaydını isteyemez.
 */
import { useEffect, useRef } from "react";
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";
import { configureAssetClient, uploadSifaImage } from "@/lib/sifa-rehberi-v2/assetClient";
import { isEmptyChangeset } from "@/lib/sifa-rehberi-v2/changeset";
import type { Workspace } from "@/lib/sifa-rehberi-v2/types";
import { htmlToJson, jsonToHtml, jsonToText } from "@/lib/sifa-rehberi-f3/richText";
import { stateToChangeset, workspaceToState, type Meta, type State } from "@/lib/sifa-rehberi-f3/model";
import { mountSifaRehberi } from "./sifaApp";
import "./sifaF3.css";

const API = "/api/sifa-rehberi-v2";

function authHeaders(json = false): Record<string, string> {
  const u = readYasamUser();
  return { ...(json ? { "content-type": "application/json" } : {}), ...(u?.id ? { "x-user-id": u.id } : {}), ...sessionTokenHeader() };
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}
/**
 * Kullanıcıya ham teknik metin gösterilmez (WT4 kuralı, V1 guideSaveFlow ile aynı): 401 = oturum kapanmış
 * ("Yetki gerekli." kayıt yetkisi sorunu gibi okunuyordu); ağ hatası = tarayıcının İngilizce iletisi yerine Türkçe.
 * Ekran bunları "Kaydedilemedi: … Değişiklikleriniz ekranda duruyor; tekrar deneyin." kalıbıyla gösterir (taslak korunur).
 */
const SIFA_SESSION_ENDED = "Oturumunuz sona ermiş görünüyor; yeniden giriş yapın";
const SIFA_NETWORK_ERROR = "Sunucuya ulaşılamadı; internet bağlantınızı kontrol edin";
const errorOf = (res: Response, j: Record<string, unknown> | null) =>
  new Error(res.status === 401 ? SIFA_SESSION_ENDED : typeof j?.error === "string" ? j.error : `Sunucu yanıtı ${res.status}`);
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(SIFA_NETWORK_ERROR);
  }
}

async function load(): Promise<{ state: State; meta: Meta }> {
  const res = await send(`${API}/workspace`, { headers: authHeaders(), cache: "no-store", credentials: "same-origin" });
  const j = await readJson(res);
  if (!res.ok || !j?.ok || !j.workspace) throw errorOf(res, j);
  return workspaceToState(j.workspace as Workspace, { toHtml: jsonToHtml });
}

async function save(saved: State, draft: State, meta: Meta): Promise<void> {
  const parser = new DOMParser();
  const cs = stateToChangeset(saved, draft, meta, { toJson: (html) => htmlToJson(html, parser), toText: jsonToText }, () => crypto.randomUUID());
  if (isEmptyChangeset(cs)) return;
  const res = await send(`${API}/workspace`, { method: "POST", headers: authHeaders(true), body: JSON.stringify(cs), cache: "no-store", credentials: "same-origin" });
  const j = await readJson(res);
  if (!res.ok || !j?.ok) throw errorOf(res, j);
}

async function signedUrls(ids: string[]): Promise<Record<string, string>> {
  const res = await send(`${API}/assets/signed-urls`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({ ids }), cache: "no-store", credentials: "same-origin" });
  const j = await readJson(res);
  if (!res.ok || !j?.ok) throw errorOf(res, j);
  return (j.urls ?? {}) as Record<string, string>;
}

async function downloadWord(rootId: string, title: string): Promise<void> {
  const res = await send(`${API}/word`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({ rootId }), cache: "no-store", credentials: "same-origin" });
  if (!res.ok) throw errorOf(res, await readJson(res));
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "Sifa-Rehberi"}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

async function uploadImage(file: File): Promise<string> {
  const r = await uploadSifaImage(file, "");
  return r.assetId;
}

export default function SifaRehberi() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    configureAssetClient({ base: API, headers: () => authHeaders() });
    const userId = readYasamUser()?.id ?? "anon";
    const off = mountSifaRehberi(el, { load, save, uploadImage, signedUrls, downloadWord, lastKeyPrefix: `sifa-rehberi:son-baslik:${userId}:` });
    return () => {
      off();
      configureAssetClient(null);
    };
  }, []);
  return <div ref={ref} className="sifa-f3" data-testid="sifa-f3" />;
}
