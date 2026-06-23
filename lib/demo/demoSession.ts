// Demo hesap için localStorage tabanlı oturum izleme.

const DEMO_SESSION_KEY = "yasam_demo_session";

export type DemoSession = {
  started_at: string;
  viewed_client_ids: string[];
};

export function initDemoSession(): void {
  if (typeof window === "undefined") return;
  if (readDemoSession()) return;
  const session: DemoSession = {
    started_at: new Date().toISOString(),
    viewed_client_ids: [],
  };
  localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
}

export function readDemoSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEMO_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DemoSession;
  } catch {
    return null;
  }
}

export function recordDemoClientView(clientId: string): void {
  if (typeof window === "undefined") return;
  const session: DemoSession = readDemoSession() ?? {
    started_at: new Date().toISOString(),
    viewed_client_ids: [],
  };
  if (!session.viewed_client_ids.includes(clientId)) {
    session.viewed_client_ids.push(clientId);
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
  }
}

export function clearDemoSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DEMO_SESSION_KEY);
}
