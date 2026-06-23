// Demo hesap için localStorage tabanlı oturum izleme ve geçici danışan kaydı.

const DEMO_SESSION_KEY = "yasam_demo_session";

export type DemoClient = {
  id: string;           // "session-xxxxxxxx"
  ad: string;
  soyad: string;
  telefon: string;
  dogum: string;
  gorusme: string;
  burc: string;
  kan: string;
  mizac: string;
  created_at: string;
};

export type DemoSession = {
  started_at: string;
  viewed_client_ids: string[];
  clients: DemoClient[];
};

function generateSessionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "session-";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function readRaw(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEMO_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DemoSession;
  } catch {
    return null;
  }
}

function writeRaw(session: DemoSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
}

function emptySession(): DemoSession {
  return { started_at: new Date().toISOString(), viewed_client_ids: [], clients: [] };
}

export function initDemoSession(): void {
  if (typeof window === "undefined") return;
  if (readRaw()) return;
  writeRaw(emptySession());
}

export function readDemoSession(): DemoSession | null {
  return readRaw();
}

export function readDemoClients(): DemoClient[] {
  return readRaw()?.clients ?? [];
}

export function getDemoClient(id: string): DemoClient | null {
  return readRaw()?.clients.find((c) => c.id === id) ?? null;
}

export function addDemoClient(
  data: Omit<DemoClient, "id" | "created_at">,
): DemoClient {
  const session = readRaw() ?? emptySession();
  const client: DemoClient = {
    ...data,
    id: generateSessionId(),
    created_at: new Date().toISOString(),
  };
  session.clients = [client, ...session.clients];
  writeRaw(session);
  return client;
}

export function recordDemoClientView(clientId: string): void {
  const session = readRaw() ?? emptySession();
  if (!session.viewed_client_ids.includes(clientId)) {
    session.viewed_client_ids.push(clientId);
    writeRaw(session);
  }
}

export function clearDemoSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DEMO_SESSION_KEY);
}
