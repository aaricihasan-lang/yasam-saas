/** Admin kullanıcı yönetimi — geçici sahte veri (Supabase sonra bağlanacak) */

export type ManagedUserRole = "admin" | "expert";

export type ManagedUser = {
  id: string;
  fullName: string;
  email: string;
  role: ManagedUserRole;
  active: boolean;
};

export const INITIAL_MOCK_USERS: ManagedUser[] = [
  {
    id: "usr_001",
    fullName: "Hasan ARICI",
    email: "hasan@yasam.com",
    role: "admin",
    active: true,
  },
  {
    id: "usr_002",
    fullName: "Zeynep Kaya",
    email: "zeynep.kaya@yasam.com",
    role: "expert",
    active: true,
  },
  {
    id: "usr_003",
    fullName: "Mehmet Demir",
    email: "mehmet.demir@yasam.com",
    role: "expert",
    active: true,
  },
  {
    id: "usr_004",
    fullName: "Elif Şahin",
    email: "elif.sahin@yasam.com",
    role: "expert",
    active: false,
  },
];

export function newMockUserId(): string {
  return `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
