// Demo fixture data — yalnızca frontend'de kullanılır, veritabanına yazılmaz.

export type DemoListClient = {
  id: string;
  ad: string | null;
  soyad: string | null;
  telefon: string | null;
  dogum: string | null;
  gorusme: string | null;
  burc: string | null;
  kan: string | null;
  mizac: string | null;
  created_at: string;
};

// created_at ve gorusme azalan sıradadır (demo-0 en güncel → en üstte görünür).
export const DEMO_CLIENTS: DemoListClient[] = [
  { id: "demo-0",  ad: "Eylül",  soyad: "Karaca",   telefon: "0532 111 2233", dogum: "1990-03-21", gorusme: "2026-06-22", burc: "Koç",      kan: "A Rh+",  mizac: "safra",   created_at: "2026-06-21T09:00:00Z" },
  { id: "demo-1",  ad: "Kaan",   soyad: "Ersoy",    telefon: "0542 234 5566", dogum: "1985-07-14", gorusme: "2026-06-18", burc: "Yengeç",   kan: "B Rh+",  mizac: "dem",     created_at: "2026-06-17T10:30:00Z" },
  { id: "demo-2",  ad: "Merve",  soyad: "Duman",    telefon: "0555 345 6677", dogum: "1993-11-08", gorusme: "2026-06-14", burc: "Akrep",    kan: "0 Rh+",  mizac: "balgam",  created_at: "2026-06-13T11:00:00Z" },
  { id: "demo-3",  ad: "Deniz",  soyad: "Akbulut",  telefon: "0505 456 7788", dogum: "1988-09-25", gorusme: "2026-06-10", burc: "Terazi",   kan: "AB Rh+", mizac: "sovdavi", created_at: "2026-06-09T14:00:00Z" },
  { id: "demo-4",  ad: "Cem",    soyad: "Aydıner",  telefon: "0533 567 8899", dogum: "1995-01-30", gorusme: "2026-06-07", burc: "Kova",     kan: "A Rh-",  mizac: "safra",   created_at: "2026-06-06T09:30:00Z" },
  { id: "demo-5",  ad: "Gökçe",  soyad: "Tunalı",   telefon: "0545 678 9900", dogum: "1991-05-17", gorusme: "2026-06-03", burc: "İkizler",  kan: "B Rh-",  mizac: "dem",     created_at: "2026-06-02T10:00:00Z" },
  { id: "demo-6",  ad: "Baran",  soyad: "Yıldırım", telefon: "0537 789 0011", dogum: "1987-12-03", gorusme: "2026-05-30", burc: "Yay",      kan: "0 Rh-",  mizac: "balgam",  created_at: "2026-05-29T13:00:00Z" },
  { id: "demo-7",  ad: "Aslı",   soyad: "Köksal",   telefon: "0551 890 1122", dogum: "1994-08-19", gorusme: "2026-05-26", burc: "Aslan",    kan: "A Rh+",  mizac: "sovdavi", created_at: "2026-05-25T11:30:00Z" },
  { id: "demo-8",  ad: "Selim",  soyad: "Durmaz",   telefon: "0506 901 2233", dogum: "1982-04-07", gorusme: "2026-05-22", burc: "Boğa",     kan: "AB Rh-", mizac: "safra",   created_at: "2026-05-21T09:00:00Z" },
  { id: "demo-9",  ad: "Derya",  soyad: "Sarıtaş",  telefon: "0534 012 3344", dogum: "1996-10-22", gorusme: "2026-05-18", burc: "Akrep",    kan: "B Rh+",  mizac: "dem",     created_at: "2026-05-17T14:30:00Z" },
  { id: "demo-10", ad: "Yusuf",  soyad: "Çelik",    telefon: "0543 123 4455", dogum: "1989-02-11", gorusme: "2026-05-14", burc: "Kova",     kan: "0 Rh+",  mizac: "balgam",  created_at: "2026-05-13T10:00:00Z" },
  { id: "demo-11", ad: "Selin",  soyad: "Öztürk",   telefon: "0553 234 5566", dogum: "1992-06-28", gorusme: "2026-05-10", burc: "Yengeç",   kan: "A Rh-",  mizac: "sovdavi", created_at: "2026-05-09T11:00:00Z" },
  { id: "demo-12", ad: "Mert",   soyad: "Güneş",    telefon: "0507 345 6677", dogum: "1986-09-13", gorusme: "2026-05-06", burc: "Başak",    kan: "AB Rh+", mizac: "safra",   created_at: "2026-05-05T13:30:00Z" },
  { id: "demo-13", ad: "Cansu",  soyad: "Yaman",    telefon: "0531 456 7788", dogum: "1998-01-05", gorusme: "2026-05-02", burc: "Oğlak",    kan: "B Rh-",  mizac: "dem",     created_at: "2026-05-01T09:00:00Z" },
  { id: "demo-14", ad: "Emre",   soyad: "Koçak",    telefon: "0546 567 8899", dogum: "1990-07-30", gorusme: "2026-04-28", burc: "Aslan",    kan: "0 Rh+",  mizac: "balgam",  created_at: "2026-04-27T10:30:00Z" },
  { id: "demo-15", ad: "Zeynep", soyad: "Arslan",   telefon: "0556 678 9900", dogum: "1993-03-16", gorusme: "2026-04-24", burc: "Balık",    kan: "A Rh+",  mizac: "sovdavi", created_at: "2026-04-23T11:00:00Z" },
  { id: "demo-16", ad: "Ozan",   soyad: "Kılıç",    telefon: "0502 789 0011", dogum: "1984-11-24", gorusme: "2026-04-20", burc: "Koç",      kan: "AB Rh-", mizac: "safra",   created_at: "2026-04-19T14:00:00Z" },
  { id: "demo-17", ad: "Tuğba",  soyad: "Şahin",    telefon: "0544 890 1122", dogum: "1997-05-09", gorusme: "2026-04-16", burc: "İkizler",  kan: "B Rh+",  mizac: "dem",     created_at: "2026-04-15T09:30:00Z" },
  { id: "demo-18", ad: "Kerem",  soyad: "Bulut",    telefon: "0554 901 2233", dogum: "1991-08-31", gorusme: "2026-04-12", burc: "Başak",    kan: "0 Rh-",  mizac: "balgam",  created_at: "2026-04-11T10:00:00Z" },
  { id: "demo-19", ad: "Naz",    soyad: "Demir",    telefon: "0508 012 3344", dogum: "1995-12-18", gorusme: "2026-04-08", burc: "Terazi",   kan: "A Rh-",  mizac: "sovdavi", created_at: "2026-04-07T11:30:00Z" },
];
