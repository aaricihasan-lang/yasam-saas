# Human Design Transit — Seçenek A Gerçek Veri Doğrulaması (19 Ekim 2026)

Kaynaklar: kayıtlı GERÇEK Roxy yanıtları (`/astrology/planets` 174 an; `/human-design/transit` 174 an) · yerel motor · **Swiss Ephemeris** (bağımsız gerçek). Çözüm: yerel motor + yalnız belirsiz anlarda bağımsız denetimli Roxy gezegen konumları.

## Özet

```json
{
 "moments": 674,
 "pass": 674,
 "resolution": {
  "local-certain": 493,
  "roxy-resolved": 179,
  "roxy-partial": 2
 },
 "completeMoments": 672,
 "incompleteMoments": 2,
 "certainShown": 8760,
 "certainWrong": 0,
 "unverifiedCertain": 0,
 "completeWithUnresolved": 0,
 "generalChannelWrong": 0,
 "generalCenterWrong": 0,
 "personalChecked": 173,
 "personalRejected": 0,
 "personalChannelCenterWrong": 0,
 "simulatedPlanetsCalls": 181
}
```

## Önceki 9 yerel motor hatası (7 an)

```json
[
 {
  "id": "B06-a",
  "utc": "2027-03-07T09:40:08Z",
  "resolution": "roxy-resolved",
  "complete": true,
  "allEqualSE": true,
  "personal": "KABUL (2 kişisel + 0 transit-yalnız kanal, 2 geçici merkez)"
 },
 {
  "id": "B13-a",
  "utc": "2027-01-22T03:49:27Z",
  "resolution": "roxy-resolved",
  "complete": true,
  "allEqualSE": true,
  "personal": "KABUL (4 kişisel + 0 transit-yalnız kanal, 1 geçici merkez)"
 },
 {
  "id": "B14-b",
  "utc": "2026-11-14T04:31:19Z",
  "resolution": "roxy-resolved",
  "complete": true,
  "allEqualSE": true,
  "personal": "KABUL (7 kişisel + 0 transit-yalnız kanal, 3 geçici merkez)"
 },
 {
  "id": "B17-b",
  "utc": "2027-03-19T09:18:55Z",
  "resolution": "roxy-resolved",
  "complete": true,
  "allEqualSE": true,
  "personal": "KABUL (5 kişisel + 1 transit-yalnız kanal, 2 geçici merkez)"
 },
 {
  "id": "B18-a",
  "utc": "2026-11-05T06:17:49Z",
  "resolution": "roxy-resolved",
  "complete": true,
  "allEqualSE": true,
  "personal": "KABUL (3 kişisel + 0 transit-yalnız kanal, 1 geçici merkez)"
 },
 {
  "id": "B21-b",
  "utc": "2026-11-24T03:03:25Z",
  "resolution": "roxy-resolved",
  "complete": true,
  "allEqualSE": true,
  "personal": "KABUL (3 kişisel + 1 transit-yalnız kanal, 2 geçici merkez)"
 },
 {
  "id": "B25-b",
  "utc": "2041-04-04T00:49:07Z",
  "resolution": "roxy-resolved",
  "complete": true,
  "allEqualSE": true,
  "personal": "KABUL (4 kişisel + 1 transit-yalnız kanal, 2 geçici merkez)"
 }
]
```

## Anlar

| # | UTC | Türkiye | Senaryo | Çözüm | 13 aktivasyon = SE | Genel kanal/merkez | Kişisel (gerçek Roxy HD) | Sonuç | Not |
|---|---|---|---|---|---|---|---|---|---|
| R001 | 1995-06-12T23:58:13Z | 1995-06-13 02:58 | geçmiş (1901–2000) | local-certain | 13/13 | OK (0 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| R002 | 1992-07-18T06:35:46Z | 1992-07-18 09:35 | geçmiş (1901–2000) | local-certain | 13/13 | OK (2 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R003 | 1901-09-24T22:36:59Z | 1901-09-25 00:33 | geçmiş (1901–2000) | local-certain | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| R004 | 1955-06-30T06:07:13Z | 1955-06-30 08:07 | geçmiş (1901–2000) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R005 | 1998-08-01T19:01:56Z | 1998-08-01 22:01 | geçmiş (1901–2000) | local-certain | 13/13 | OK (0 kanal) | KABUL (0 kişisel + 0 transit-yalnız kanal, 0 geçici merkez) | PASS |  |
| R006 | 1921-10-12T16:48:16Z | 1921-10-12 18:48 | geçmiş (1901–2000) | local-certain | 13/13 | OK (2 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R007 | 1909-02-07T06:53:15Z | 1909-02-07 08:50 | geçmiş (1901–2000) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R008 | 1924-01-04T05:44:16Z | 1924-01-04 07:44 | geçmiş (1901–2000) | local-certain | 13/13 | OK (2 kanal) | KABUL (0 kişisel + 2 transit-yalnız kanal, 4 geçici merkez) | PASS |  |
| R009 | 1981-06-23T19:56:40Z | 1981-06-23 22:56 | geçmiş (1901–2000) | local-certain | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 0 geçici merkez) | PASS |  |
| R010 | 1949-04-27T05:11:45Z | 1949-04-27 08:11 | geçmiş (1901–2000) | local-certain | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R011 | 1917-12-25T13:02:03Z | 1917-12-25 15:02 | geçmiş (1901–2000) | local-certain | 13/13 | OK (2 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R012 | 1942-11-25T12:09:58Z | 1942-11-25 15:09 | geçmiş (1901–2000) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (2 kişisel + 2 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R013 | 1985-07-23T00:04:46Z | 1985-07-23 03:04 | geçmiş (1901–2000) | local-certain | 13/13 | OK (0 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| R014 | 1918-04-12T17:05:58Z | 1918-04-12 19:05 | geçmiş (1901–2000) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| R015 | 1990-04-19T23:14:44Z | 1990-04-20 02:14 | geçmiş (1901–2000) | local-certain | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| R016 | 1984-04-28T03:19:36Z | 1984-04-28 06:19 | geçmiş (1901–2000) | local-certain | 13/13 | OK (0 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R017 | 1999-04-15T23:15:28Z | 1999-04-16 02:15 | geçmiş (1901–2000) | local-certain | 13/13 | OK (0 kanal) | KABUL (7 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R018 | 1975-05-19T02:47:57Z | 1975-05-19 05:47 | geçmiş (1901–2000) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (3 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R019 | 2025-12-30T23:32:52Z | 2025-12-31 02:32 | yakın geçmiş (2001–2025) | local-certain | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R020 | 2023-02-14T06:09:16Z | 2023-02-14 09:09 | yakın geçmiş (2001–2025) | local-certain | 13/13 | OK (2 kanal) | KABUL (3 kişisel + 1 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R021 | 2009-03-26T08:11:26Z | 2009-03-26 10:11 | yakın geçmiş (2001–2025) | local-certain | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R022 | 2023-03-17T17:02:01Z | 2023-03-17 20:02 | yakın geçmiş (2001–2025) | local-certain | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| R023 | 2025-09-12T16:16:48Z | 2025-09-12 19:16 | yakın geçmiş (2001–2025) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R024 | 2014-10-26T13:45:47Z | 2014-10-26 15:45 | yakın geçmiş (2001–2025) | local-certain | 13/13 | OK (4 kanal) | KABUL (1 kişisel + 4 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R025 | 2004-08-31T05:40:56Z | 2004-08-31 08:40 | yakın geçmiş (2001–2025) | local-certain | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R026 | 2003-08-12T08:39:36Z | 2003-08-12 11:39 | yakın geçmiş (2001–2025) | local-certain | 13/13 | OK (1 kanal) | KABUL (1 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R027 | 2013-02-26T09:28:09Z | 2013-02-26 11:28 | yakın geçmiş (2001–2025) | local-certain | 13/13 | OK (2 kanal) | KABUL (0 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R028 | 2023-03-04T00:13:26Z | 2023-03-04 03:13 | yakın geçmiş (2001–2025) | local-certain | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 1 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R029 | 2026-02-14T09:35:36Z | 2026-02-14 12:35 | 2026 | local-certain | 13/13 | OK (2 kanal) | KABUL (1 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R030 | 2026-03-25T03:57:57Z | 2026-03-25 06:57 | 2026 | local-certain | 13/13 | OK (3 kanal) | KABUL (2 kişisel + 3 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R031 | 2026-09-06T13:21:09Z | 2026-09-06 16:21 | 2026 | local-certain | 13/13 | OK (1 kanal) | KABUL (5 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R032 | 2026-01-01T07:37:31Z | 2026-01-01 10:37 | 2026 | local-certain | 13/13 | OK (2 kanal) | KABUL (1 kişisel + 2 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R033 | 2026-10-04T12:37:51Z | 2026-10-04 15:37 | 2026 | local-certain | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R034 | 2026-08-29T00:15:28Z | 2026-08-29 03:15 | 2026 | local-certain | 13/13 | OK (3 kanal) | KABUL (5 kişisel + 2 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R035 | 2026-06-21T01:15:36Z | 2026-06-21 04:15 | 2026 | local-certain | 13/13 | OK (2 kanal) | KABUL (7 kişisel + 0 transit-yalnız kanal, 4 geçici merkez) | PASS |  |
| R036 | 2026-05-22T09:08:56Z | 2026-05-22 12:08 | 2026 | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R037 | 2026-04-21T22:35:32Z | 2026-04-22 01:35 | 2026 | local-certain | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R038 | 2026-12-11T14:47:28Z | 2026-12-11 17:47 | 2026 | local-certain | 13/13 | OK (0 kanal) | KABUL (6 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R039 | 2026-05-07T21:16:50Z | 2026-05-08 00:16 | 2026 | roxy-resolved | 13/13 | OK (3 kanal) | KABUL (2 kişisel + 2 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R040 | 2026-01-10T13:47:10Z | 2026-01-10 16:47 | 2026 | local-certain | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 1 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R041 | 2042-05-26T07:36:11Z | 2042-05-26 10:36 | gelecek (2027–2100) | local-certain | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R042 | 2043-09-06T07:51:02Z | 2043-09-06 10:51 | gelecek (2027–2100) | local-certain | 13/13 | OK (2 kanal) | KABUL (5 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| R043 | 2099-02-13T21:24:12Z | 2099-02-14 00:24 | gelecek (2027–2100) | local-certain | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R044 | 2046-02-10T23:02:55Z | 2046-02-11 02:02 | gelecek (2027–2100) | local-certain | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R045 | 2055-08-14T14:21:46Z | 2055-08-14 17:21 | gelecek (2027–2100) | local-certain | 13/13 | OK (3 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| R046 | 2060-12-10T16:35:13Z | 2060-12-10 19:35 | gelecek (2027–2100) | local-certain | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R047 | 2069-06-10T01:04:23Z | 2069-06-10 04:04 | gelecek (2027–2100) | local-certain | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R048 | 2032-07-01T07:04:41Z | 2032-07-01 10:04 | gelecek (2027–2100) | local-certain | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| R049 | 2068-08-31T15:30:11Z | 2068-08-31 18:30 | gelecek (2027–2100) | local-certain | 13/13 | OK (2 kanal) | KABUL (3 kişisel + 2 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R050 | 2077-11-28T11:37:23Z | 2077-11-28 14:37 | gelecek (2027–2100) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 1 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R051 | 2062-04-01T04:17:59Z | 2062-04-01 07:17 | gelecek (2027–2100) | local-certain | 13/13 | OK (2 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R052 | 2043-08-04T16:36:06Z | 2043-08-04 19:36 | gelecek (2027–2100) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R053 | 2059-03-20T14:52:51Z | 2059-03-20 17:52 | gelecek (2027–2100) | local-certain | 13/13 | OK (2 kanal) | KABUL (2 kişisel + 2 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R054 | 2027-12-06T01:46:40Z | 2027-12-06 04:46 | gelecek (2027–2100) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (0 kişisel + 0 transit-yalnız kanal, 0 geçici merkez) | PASS |  |
| R055 | 2093-11-28T09:09:49Z | 2093-11-28 12:09 | gelecek (2027–2100) | local-certain | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| R056 | 2092-11-11T16:38:13Z | 2092-11-11 19:38 | gelecek (2027–2100) | local-certain | 13/13 | OK (2 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R057 | 2070-05-15T16:27:38Z | 2070-05-15 19:27 | gelecek (2027–2100) | local-certain | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R058 | 2075-01-29T15:02:54Z | 2075-01-29 18:02 | gelecek (2027–2100) | local-certain | 13/13 | OK (2 kanal) | KABUL (5 kişisel + 1 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R059 | 2026-10-18T21:00:00Z | 2026-10-19 00:00 | Türkiye 2026-10-19 00:00 (gece yarısı / gün değişimi) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (6 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R060 | 2026-10-19T21:00:00Z | 2026-10-20 00:00 | Türkiye 2026-10-20 00:00 (gece yarısı / gün değişimi) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R061 | 2026-10-19T20:59:00Z | 2026-10-19 23:59 | Türkiye 2026-10-19 23:59 (gece yarısı / gün değişimi) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| R062 | 2026-12-31T20:59:00Z | 2026-12-31 23:59 | Türkiye 2026-12-31 23:59 (gece yarısı / gün değişimi) | local-certain | 13/13 | OK (0 kanal) | KABUL (6 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| R063 | 2026-12-31T21:00:00Z | 2027-01-01 00:00 | Türkiye 2027-01-01 00:00 (gece yarısı / gün değişimi) | local-certain | 13/13 | OK (0 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| R064 | 2026-02-28T23:59:00Z | 2026-03-01 02:59 | Türkiye 2026-03-01 02:59 (gece yarısı / gün değişimi) | local-certain | 13/13 | OK (2 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R065 | 2026-03-01T00:00:00Z | 2026-03-01 03:00 | Türkiye 2026-03-01 03:00 (gece yarısı / gün değişimi) | local-certain | 13/13 | OK (2 kanal) | KABUL (1 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R066 | 2028-02-28T21:30:00Z | 2028-02-29 00:30 | Türkiye 2028-02-29 00:30 (gece yarısı / gün değişimi) | local-certain | 13/13 | OK (1 kanal) | KABUL (0 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R067 | 1999-12-31T21:59:00Z | 1999-12-31 23:59 | Türkiye 1999-12-31 23:59 (gece yarısı / gün değişimi) | local-certain | 13/13 | OK (3 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| R068 | 1999-12-31T22:00:00Z | 2000-01-01 00:00 | Türkiye 2000-01-01 00:00 (gece yarısı / gün değişimi) | local-certain | 13/13 | OK (3 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B01-a | 2026-11-05T15:58:29Z | 2026-11-05 18:58 | Sun kapı sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (5 kişisel + 1 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| B01-b | 2026-11-05T16:02:28Z | 2026-11-05 19:02 | Sun kapı sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (7 kişisel + 1 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| B02-a | 2026-11-01T22:07:13Z | 2026-11-02 01:07 | Sun çizgi sınırı öncesi (~5″) | local-certain | 13/13 | OK (1 kanal) | KABUL (5 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| B02-b | 2026-11-01T22:11:13Z | 2026-11-02 01:11 | Sun çizgi sınırı sonrası (~5″) | local-certain | 13/13 | OK (1 kanal) | KABUL (5 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| B03-a | 2026-10-19T05:40:24Z | 2026-10-19 08:40 | Moon kapı sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B03-b | 2026-10-19T05:40:44Z | 2026-10-19 08:40 | Moon kapı sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B04-a | 2026-10-19T00:01:44Z | 2026-10-19 03:01 | Moon çizgi sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (5 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B04-b | 2026-10-19T00:02:05Z | 2026-10-19 03:02 | Moon çizgi sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (5 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B05-a | 2027-03-12T08:06:47Z | 2027-03-12 11:06 | Mercury kapı sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (6 kişisel + 0 transit-yalnız kanal, 4 geçici merkez) | PASS |  |
| B05-b | 2027-03-12T08:12:11Z | 2027-03-12 11:12 | Mercury kapı sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (6 kişisel + 0 transit-yalnız kanal, 4 geçici merkez) | PASS |  |
| B06-a | 2027-03-07T09:40:08Z | 2027-03-07 12:40 | Mercury çizgi sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B06-b | 2027-03-07T09:50:41Z | 2027-03-07 12:50 | Mercury çizgi sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B07-a | 2026-12-07T08:07:15Z | 2026-12-07 11:07 | Venus kapı sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 0 geçici merkez) | PASS |  |
| B07-b | 2026-12-07T08:12:59Z | 2026-12-07 11:12 | Venus kapı sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 0 geçici merkez) | PASS |  |
| B08-a | 2026-12-01T10:38:20Z | 2026-12-01 13:38 | Venus çizgi sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (5 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| B08-b | 2026-12-01T10:45:21Z | 2026-12-01 13:45 | Venus çizgi sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (5 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| B09-a | 2026-11-13T04:35:34Z | 2026-11-13 07:35 | Mars kapı sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| B09-b | 2026-11-13T04:44:17Z | 2026-11-13 07:44 | Mars kapı sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| B10-a | 2026-11-11T03:58:34Z | 2026-11-11 06:58 | Mars çizgi sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (6 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B10-b | 2026-11-11T04:07:08Z | 2026-11-11 07:07 | Mars çizgi sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (6 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B11-a | 2026-11-02T11:14:33Z | 2026-11-02 14:14 | Jupiter kapı sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (5 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| B11-b | 2026-11-02T11:48:25Z | 2026-11-02 14:48 | Jupiter kapı sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (5 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| B12-a | 2026-11-11T04:52:26Z | 2026-11-11 07:52 | Jupiter çizgi sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| B12-b | 2026-11-11T05:34:02Z | 2026-11-11 08:34 | Jupiter çizgi sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| B13-a | 2027-01-22T03:49:27Z | 2027-01-22 06:49 | Saturn kapı sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| B13-b | 2027-01-22T04:45:17Z | 2027-01-22 07:45 | Saturn kapı sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| B14-a | 2026-11-14T03:03:50Z | 2026-11-14 06:03 | Saturn çizgi sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (3 kanal) | KABUL (7 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| B14-b | 2026-11-14T04:31:19Z | 2026-11-14 07:31 | Saturn çizgi sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (3 kanal) | KABUL (7 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| B15-a | 2027-05-27T01:00:02Z | 2027-05-27 04:00 | Uranus kapı sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| B15-b | 2027-05-27T02:08:17Z | 2027-05-27 05:08 | Uranus kapı sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B16-a | 2026-11-21T03:32:03Z | 2026-11-21 06:32 | Uranus çizgi sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (5 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| B16-b | 2026-11-21T05:07:43Z | 2026-11-21 08:07 | Uranus çizgi sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (5 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| B17-a | 2027-03-19T07:32:59Z | 2027-03-19 10:32 | Neptune kapı sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (5 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B17-b | 2027-03-19T09:18:55Z | 2027-03-19 12:18 | Neptune kapı sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (5 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B18-a | 2026-11-05T06:17:49Z | 2026-11-05 09:17 | Neptune çizgi sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| B18-b | 2026-11-05T09:44:47Z | 2026-11-05 12:44 | Neptune çizgi sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| B19-a | 2028-02-24T02:47:14Z | 2028-02-24 05:47 | Pluto kapı sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (1 kişisel + 1 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| B19-b | 2028-02-24T05:06:47Z | 2028-02-24 08:06 | Pluto kapı sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (1 kişisel + 1 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| B20-a | 2026-12-14T16:30:26Z | 2026-12-14 19:30 | Pluto çizgi sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (7 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| B20-b | 2026-12-14T19:08:25Z | 2026-12-14 22:08 | Pluto çizgi sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (6 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| B21-a | 2026-11-24T02:43:22Z | 2026-11-24 05:43 | NorthNode kapı sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (3 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B21-b | 2026-11-24T03:03:25Z | 2026-11-24 06:03 | NorthNode kapı sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (3 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B22-a | 2026-11-08T12:28:23Z | 2026-11-08 15:28 | NorthNode çizgi sınırı öncesi (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (6 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B22-b | 2026-11-08T12:46:28Z | 2026-11-08 15:46 | NorthNode çizgi sınırı sonrası (~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (6 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B23-a | 1955-05-05T00:28:26Z | 1955-05-05 02:28 | Moon çizgi sınırı öncesi (~2″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| B23-b | 1955-05-05T00:28:34Z | 1955-05-05 02:28 | Moon çizgi sınırı sonrası (~2″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| B24-a | 1988-08-08T01:09:32Z | 1988-08-08 04:09 | Moon çizgi sınırı öncesi (~2″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| B24-b | 1988-08-08T01:09:40Z | 1988-08-08 04:09 | Moon çizgi sınırı sonrası (~2″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| B25-a | 2041-04-04T00:49:00Z | 2041-04-04 03:49 | Moon çizgi sınırı öncesi (~2″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B25-b | 2041-04-04T00:49:07Z | 2041-04-04 03:49 | Moon çizgi sınırı sonrası (~2″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| B26-a | 2077-07-07T00:27:23Z | 2077-07-07 03:27 | Moon çizgi sınırı öncesi (~2″) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| B26-b | 2077-07-07T00:27:30Z | 2077-07-07 03:27 | Moon çizgi sınırı sonrası (~2″) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| S01-1a | 2061-02-03T01:30:07Z | 2061-02-03 04:30 | Moon çizgi sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S01-1b | 2061-02-03T01:30:11Z | 2061-02-03 04:30 | Moon çizgi sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (5 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| S01-5a | 2061-02-03T01:30:00Z | 2061-02-03 04:30 | Moon çizgi sınırı öncesi (SE ~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S01-5b | 2061-02-03T01:30:18Z | 2061-02-03 04:30 | Moon çizgi sınırı sonrası (SE ~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S02-1a | 2066-06-06T00:09:40Z | 2066-06-06 03:09 | Moon çizgi sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 0 geçici merkez) | PASS |  |
| S02-1b | 2066-06-06T00:09:44Z | 2066-06-06 03:09 | Moon çizgi sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| S02-5a | 2066-06-06T00:09:34Z | 2066-06-06 03:09 | Moon çizgi sınırı öncesi (SE ~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (1 kişisel + 1 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| S02-5b | 2066-06-06T00:09:50Z | 2066-06-06 03:09 | Moon çizgi sınırı sonrası (SE ~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 0 geçici merkez) | PASS |  |
| S03-1a | 2071-09-09T00:03:02Z | 2071-09-09 03:03 | Moon çizgi sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S03-1b | 2071-09-09T00:03:06Z | 2071-09-09 03:03 | Moon çizgi sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (1 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S03-5a | 2071-09-09T00:02:54Z | 2071-09-09 03:02 | Moon çizgi sınırı öncesi (SE ~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S03-5b | 2071-09-09T00:03:14Z | 2071-09-09 03:03 | Moon çizgi sınırı sonrası (SE ~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S04-1a | 2077-12-12T01:26:30Z | 2077-12-12 04:26 | Moon çizgi sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S04-1b | 2077-12-12T01:26:34Z | 2077-12-12 04:26 | Moon çizgi sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (3 kişisel + 1 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| S04-5a | 2077-12-12T01:26:22Z | 2077-12-12 04:26 | Moon çizgi sınırı öncesi (SE ~5″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| S04-5b | 2077-12-12T01:26:42Z | 2077-12-12 04:26 | Moon çizgi sınırı sonrası (SE ~5″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S05-1a | 2083-03-03T01:34:31Z | 2083-03-03 04:34 | Moon çizgi sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (1 kişisel + 1 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| S05-1b | 2083-03-03T01:34:35Z | 2083-03-03 04:34 | Moon çizgi sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| S05-5a | 2083-03-03T01:34:24Z | 2083-03-03 04:34 | Moon çizgi sınırı öncesi (SE ~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| S05-5b | 2083-03-03T01:34:42Z | 2083-03-03 04:34 | Moon çizgi sınırı sonrası (SE ~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (1 kişisel + 1 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| S06-1a | 2089-08-08T01:20:08Z | 2089-08-08 04:20 | Moon çizgi sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| S06-1b | 2089-08-08T01:20:12Z | 2089-08-08 04:20 | Moon çizgi sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (4 kişisel + 2 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| S06-5a | 2089-08-08T01:20:02Z | 2089-08-08 04:20 | Moon çizgi sınırı öncesi (SE ~5″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (2 kişisel + 2 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| S06-5b | 2089-08-08T01:20:18Z | 2089-08-08 04:20 | Moon çizgi sınırı sonrası (SE ~5″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| S07-1a | 2095-05-05T00:37:01Z | 2095-05-05 03:37 | Moon çizgi sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S07-1b | 2095-05-05T00:37:05Z | 2095-05-05 03:37 | Moon çizgi sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 0 geçici merkez) | PASS |  |
| S07-5a | 2095-05-05T00:36:55Z | 2095-05-05 03:36 | Moon çizgi sınırı öncesi (SE ~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| S07-5b | 2095-05-05T00:37:11Z | 2095-05-05 03:37 | Moon çizgi sınırı sonrası (SE ~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S08-1a | 2100-11-11T01:00:18Z | 2100-11-11 04:00 | Moon çizgi sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 1 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| S08-1b | 2100-11-11T01:00:22Z | 2100-11-11 04:00 | Moon çizgi sınırı sonrası (SE ~1″) | roxy-partial | 12/13 | OK (1 kanal) | referans eksik → 503 (doğrulanamayan gösterilmez) | PASS | kesinleştirilemedi Moon (SE marj 0.56″) |
| S08-5a | 2100-11-11T01:00:10Z | 2100-11-11 04:00 | Moon çizgi sınırı öncesi (SE ~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 0 geçici merkez) | PASS |  |
| S08-5b | 2100-11-11T01:00:30Z | 2100-11-11 04:00 | Moon çizgi sınırı sonrası (SE ~5″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (4 kişisel + 1 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| S09-1a | 1912-04-05T06:50:49Z | 1912-04-05 08:50 | Sun kapı sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (3 kanal) | KABUL (5 kişisel + 2 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S09-1b | 1912-04-05T06:51:37Z | 1912-04-05 08:51 | Sun kapı sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (3 kanal) | KABUL (2 kişisel + 3 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S10-1a | 1933-07-07T03:17:16Z | 1933-07-07 05:17 | Moon kapı sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (3 kişisel + 2 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S10-1b | 1933-07-07T03:17:20Z | 1933-07-07 05:17 | Moon kapı sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (2 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S11-1a | 1958-10-10T18:13:31Z | 1958-10-10 20:13 | Mercury kapı sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (5 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S11-1b | 1958-10-10T18:13:59Z | 1958-10-10 20:13 | Mercury kapı sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (5 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S12-1a | 1979-01-18T22:11:50Z | 1979-01-19 01:11 | Venus kapı sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (5 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S12-1b | 1979-01-18T22:12:38Z | 1979-01-19 01:12 | Venus kapı sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| S13-1a | 2004-05-13T11:30:52Z | 2004-05-13 14:30 | Mars kapı sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (4 kanal) | KABUL (2 kişisel + 1 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S13-1b | 2004-05-13T11:32:08Z | 2004-05-13 14:32 | Mars kapı sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (4 kanal) | KABUL (1 kişisel + 2 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S14-1a | 2033-02-21T22:44:34Z | 2033-02-22 01:44 | Jupiter kapı sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| S14-1b | 2033-02-21T22:47:58Z | 2033-02-22 01:47 | Jupiter kapı sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S15-1a | 2045-07-11T21:20:56Z | 2045-07-12 00:20 | Saturn kapı sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (1 kişisel + 1 transit-yalnız kanal, 4 geçici merkez) | PASS |  |
| S15-1b | 2045-07-11T21:39:54Z | 2045-07-12 00:39 | Saturn kapı sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (1 kanal) | KABUL (1 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| S16-1a | 2052-11-17T00:50:39Z | 2052-11-17 03:50 | Uranus kapı sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (5 kişisel + 0 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| S16-1b | 2052-11-17T01:08:27Z | 2052-11-17 04:08 | Uranus kapı sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S17-1a | 2068-04-07T04:31:00Z | 2068-04-07 07:31 | Neptune kapı sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (5 kanal) | KABUL (1 kişisel + 5 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S17-1b | 2068-04-07T05:30:08Z | 2068-04-07 08:30 | Neptune kapı sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (4 kanal) | KABUL (5 kişisel + 2 transit-yalnız kanal, 3 geçici merkez) | PASS |  |
| S18-1a | 2081-04-20T08:34:49Z | 2081-04-20 11:34 | Pluto kapı sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 2 geçici merkez) | PASS |  |
| S18-1b | 2081-04-20T09:09:05Z | 2081-04-20 12:09 | Pluto kapı sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (2 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| S19-1a | 2093-10-19T13:22:51Z | 2093-10-19 16:22 | NorthNode kapı sınırı öncesi (SE ~1″) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (3 kişisel + 0 transit-yalnız kanal, 1 geçici merkez) | PASS |  |
| S19-1b | 2093-10-19T13:26:29Z | 2093-10-19 16:26 | NorthNode kapı sınırı sonrası (SE ~1″) | roxy-resolved | 13/13 | OK (0 kanal) | KABUL (4 kişisel + 0 transit-yalnız kanal, 0 geçici merkez) | PASS |  |
| P001 | 2063-04-24T06:22:41Z | 2063-04-24 09:22 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P002 | 2098-03-30T09:43:05Z | 2098-03-30 12:43 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P003 | 1950-06-30T09:34:39Z | 1950-06-30 12:34 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P004 | 2044-04-30T09:29:31Z | 2044-04-30 12:29 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P005 | 2040-10-12T19:17:52Z | 2040-10-12 22:17 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P006 | 1902-05-07T14:12:38Z | 1902-05-07 16:09 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P007 | 1958-02-04T13:23:56Z | 1958-02-04 15:23 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P008 | 1941-10-30T12:42:13Z | 1941-10-30 14:42 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P009 | 2040-11-04T13:27:08Z | 2040-11-04 16:27 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P010 | 2100-05-06T05:08:14Z | 2100-05-06 08:08 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P011 | 2019-10-24T06:56:36Z | 2019-10-24 09:56 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P012 | 2070-01-18T14:07:28Z | 2070-01-18 17:07 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (3 kanal) | — | PASS |  |
| P013 | 1989-11-20T23:20:44Z | 1989-11-21 01:20 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P014 | 2088-01-01T17:31:44Z | 2088-01-01 20:31 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P015 | 2034-11-20T02:45:58Z | 2034-11-20 05:45 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P016 | 2012-07-05T08:27:22Z | 2012-07-05 11:27 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P017 | 1900-04-26T06:38:07Z | 1900-04-26 08:35 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P018 | 2093-07-17T22:47:18Z | 2093-07-18 01:47 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P019 | 2007-12-14T08:30:36Z | 2007-12-14 10:30 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P020 | 2039-09-22T12:10:13Z | 2039-09-22 15:10 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P021 | 1961-07-07T16:39:33Z | 1961-07-07 18:39 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P022 | 2021-05-24T23:59:29Z | 2021-05-25 02:59 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P023 | 2053-12-12T23:09:55Z | 2053-12-13 02:09 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P024 | 2054-01-23T04:52:11Z | 2054-01-23 07:52 | rastgele an (1900–2100) | local-certain | 13/13 | OK (4 kanal) | — | PASS |  |
| P025 | 2084-09-20T10:33:00Z | 2084-09-20 13:33 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P026 | 2050-05-08T14:38:50Z | 2050-05-08 17:38 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P027 | 1989-09-20T06:34:10Z | 1989-09-20 09:34 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P028 | 2019-04-08T03:42:46Z | 2019-04-08 06:42 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P029 | 2059-07-10T12:35:19Z | 2059-07-10 15:35 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P030 | 1938-12-30T21:52:36Z | 1938-12-30 23:52 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P031 | 1939-02-13T19:00:35Z | 1939-02-13 21:00 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P032 | 2046-10-02T10:13:30Z | 2046-10-02 13:13 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P033 | 1967-09-26T02:38:14Z | 1967-09-26 04:38 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P034 | 2063-08-07T08:01:36Z | 2063-08-07 11:01 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P035 | 2026-07-28T11:23:09Z | 2026-07-28 14:23 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P036 | 1984-12-02T21:35:34Z | 1984-12-02 23:35 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P037 | 1978-09-16T18:38:41Z | 1978-09-16 21:38 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P038 | 1918-01-29T05:31:34Z | 1918-01-29 07:31 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P039 | 1910-12-15T09:46:58Z | 1910-12-15 11:46 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P040 | 2031-06-15T09:17:40Z | 2031-06-15 12:17 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P041 | 2060-01-16T12:07:06Z | 2060-01-16 15:07 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P042 | 2043-01-17T19:09:23Z | 2043-01-17 22:09 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P043 | 2035-09-10T04:30:05Z | 2035-09-10 07:30 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P044 | 1915-02-23T10:23:50Z | 1915-02-23 12:23 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P045 | 2075-06-20T07:36:22Z | 2075-06-20 10:36 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P046 | 2063-06-21T18:49:43Z | 2063-06-21 21:49 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P047 | 1914-04-30T16:17:29Z | 1914-04-30 18:17 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P048 | 2000-04-04T19:04:04Z | 2000-04-04 22:04 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P049 | 1962-08-10T11:18:09Z | 1962-08-10 14:18 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P050 | 2013-10-27T09:59:55Z | 2013-10-27 11:59 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P051 | 2091-04-29T05:33:22Z | 2091-04-29 08:33 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (3 kanal) | — | PASS |  |
| P052 | 1944-09-25T07:32:51Z | 1944-09-25 10:32 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P053 | 2004-05-13T16:12:20Z | 2004-05-13 19:12 | rastgele an (1900–2100) | local-certain | 13/13 | OK (4 kanal) | — | PASS |  |
| P054 | 2014-11-26T12:38:08Z | 2014-11-26 14:38 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P055 | 2054-12-01T18:50:15Z | 2054-12-01 21:50 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P056 | 1927-07-31T14:14:10Z | 1927-07-31 16:14 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P057 | 1976-11-29T07:52:17Z | 1976-11-29 09:52 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P058 | 2082-03-14T05:49:49Z | 2082-03-14 08:49 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P059 | 2052-09-28T23:14:15Z | 2052-09-29 02:14 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P060 | 2050-10-13T12:35:36Z | 2050-10-13 15:35 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P061 | 1989-05-24T01:50:11Z | 1989-05-24 04:50 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P062 | 2012-03-16T02:51:32Z | 2012-03-16 04:51 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P063 | 2060-12-06T02:02:59Z | 2060-12-06 05:02 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (2 kanal) | — | PASS |  |
| P064 | 2096-05-02T03:28:47Z | 2096-05-02 06:28 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P065 | 2089-05-08T01:54:39Z | 2089-05-08 04:54 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P066 | 1982-07-24T11:04:32Z | 1982-07-24 14:04 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (2 kanal) | — | PASS |  |
| P067 | 1938-06-14T19:54:22Z | 1938-06-14 21:54 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P068 | 1988-01-04T15:42:31Z | 1988-01-04 17:42 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P069 | 1919-11-21T13:58:26Z | 1919-11-21 15:58 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P070 | 2043-10-30T00:35:40Z | 2043-10-30 03:35 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P071 | 2054-04-21T03:45:47Z | 2054-04-21 06:45 | rastgele an (1900–2100) | local-certain | 13/13 | OK (5 kanal) | — | PASS |  |
| P072 | 1913-04-14T05:44:07Z | 1913-04-14 07:44 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P073 | 2028-01-23T02:13:46Z | 2028-01-23 05:13 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P074 | 2033-05-17T22:17:28Z | 2033-05-18 01:17 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P075 | 1917-11-11T10:07:25Z | 1917-11-11 12:07 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P076 | 2079-06-19T19:08:51Z | 2079-06-19 22:08 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P077 | 1953-09-23T00:41:50Z | 1953-09-23 02:41 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P078 | 1943-09-24T15:19:40Z | 1943-09-24 18:19 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P079 | 1954-12-06T07:02:03Z | 1954-12-06 09:02 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P080 | 2097-07-05T20:11:29Z | 2097-07-05 23:11 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P081 | 1994-05-15T04:15:46Z | 1994-05-15 07:15 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P082 | 1929-12-01T19:56:47Z | 1929-12-01 21:56 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P083 | 2084-08-11T18:17:06Z | 2084-08-11 21:17 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P084 | 1950-10-07T16:28:17Z | 1950-10-07 19:28 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P085 | 1933-09-13T07:40:29Z | 1933-09-13 09:40 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P086 | 2035-12-02T15:41:50Z | 2035-12-02 18:41 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P087 | 1967-05-08T00:23:11Z | 1967-05-08 02:23 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P088 | 2002-05-18T23:17:15Z | 2002-05-19 02:17 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P089 | 1950-11-07T13:16:46Z | 1950-11-07 15:16 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P090 | 1987-11-16T01:59:40Z | 1987-11-16 03:59 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (2 kanal) | — | PASS |  |
| P091 | 1931-04-12T12:30:28Z | 1931-04-12 14:30 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P092 | 1919-02-24T00:39:59Z | 1919-02-24 02:39 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P093 | 2095-03-31T12:02:11Z | 2095-03-31 15:02 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P094 | 2022-08-10T01:54:30Z | 2022-08-10 04:54 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P095 | 2002-02-16T17:25:10Z | 2002-02-16 19:25 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P096 | 2016-10-13T08:43:02Z | 2016-10-13 11:43 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P097 | 2081-02-26T16:54:30Z | 2081-02-26 19:54 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P098 | 1995-01-19T00:05:44Z | 1995-01-19 02:05 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P099 | 2090-05-06T06:57:19Z | 2090-05-06 09:57 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (2 kanal) | — | PASS |  |
| P100 | 1929-06-07T16:45:16Z | 1929-06-07 18:45 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P101 | 2046-01-29T21:06:16Z | 2046-01-30 00:06 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P102 | 2026-01-21T13:12:55Z | 2026-01-21 16:12 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P103 | 2097-07-24T03:10:23Z | 2097-07-24 06:10 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P104 | 1988-07-07T13:46:59Z | 1988-07-07 16:46 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P105 | 1950-09-09T01:26:00Z | 1950-09-09 04:26 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P106 | 2002-09-05T10:02:13Z | 2002-09-05 13:02 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P107 | 1981-01-13T05:53:01Z | 1981-01-13 08:53 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P108 | 1955-03-06T08:17:04Z | 1955-03-06 10:17 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P109 | 1913-06-06T04:53:32Z | 1913-06-06 06:53 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P110 | 2062-08-29T21:40:04Z | 2062-08-30 00:40 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P111 | 2049-08-19T15:07:32Z | 2049-08-19 18:07 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P112 | 1919-09-03T05:45:32Z | 1919-09-03 07:45 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P113 | 1909-10-06T03:54:23Z | 1909-10-06 05:51 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P114 | 2078-12-21T01:15:42Z | 2078-12-21 04:15 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P115 | 1923-02-17T16:53:58Z | 1923-02-17 18:53 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P116 | 1975-01-01T09:02:24Z | 1975-01-01 11:02 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (0 kanal) | — | PASS |  |
| P117 | 1941-03-23T21:24:25Z | 1941-03-24 00:24 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P118 | 1919-04-17T14:47:30Z | 1919-04-17 16:47 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P119 | 2005-07-09T20:07:33Z | 2005-07-09 23:07 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P120 | 1913-05-04T16:23:13Z | 1913-05-04 18:23 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P121 | 2046-05-01T10:57:14Z | 2046-05-01 13:57 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P122 | 1934-06-09T06:35:51Z | 1934-06-09 08:35 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P123 | 2059-02-10T22:01:19Z | 2059-02-11 01:01 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P124 | 1968-01-24T23:16:40Z | 1968-01-25 01:16 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (0 kanal) | — | PASS |  |
| P125 | 1942-03-22T00:58:51Z | 1942-03-22 02:58 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P126 | 2098-05-04T22:31:46Z | 2098-05-05 01:31 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P127 | 1933-10-15T03:10:01Z | 1933-10-15 05:10 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P128 | 1953-08-12T02:14:32Z | 1953-08-12 04:14 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (0 kanal) | — | PASS |  |
| P129 | 1902-03-09T21:03:29Z | 1902-03-09 23:00 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P130 | 1949-10-05T19:15:24Z | 1949-10-05 21:15 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P131 | 2003-08-26T01:01:58Z | 2003-08-26 04:01 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P132 | 1961-08-15T12:10:58Z | 1961-08-15 14:10 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P133 | 2022-06-10T15:10:05Z | 2022-06-10 18:10 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P134 | 2043-01-05T09:31:51Z | 2043-01-05 12:31 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P135 | 1972-09-21T13:23:51Z | 1972-09-21 15:23 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P136 | 1901-07-05T13:21:07Z | 1901-07-05 15:18 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P137 | 2085-08-21T05:38:36Z | 2085-08-21 08:38 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P138 | 2057-12-05T11:05:44Z | 2057-12-05 14:05 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P139 | 2081-10-08T05:31:05Z | 2081-10-08 08:31 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P140 | 1967-07-29T21:40:01Z | 1967-07-29 23:40 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P141 | 2026-08-20T20:49:14Z | 2026-08-20 23:49 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P142 | 2023-12-26T03:10:05Z | 2023-12-26 06:10 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P143 | 1900-08-08T01:54:35Z | 1900-08-08 03:51 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P144 | 2067-10-31T13:09:31Z | 2067-10-31 16:09 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P145 | 1901-05-21T06:36:34Z | 1901-05-21 08:33 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P146 | 1901-10-27T15:53:18Z | 1901-10-27 17:50 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P147 | 1912-03-31T05:09:49Z | 1912-03-31 07:09 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P148 | 2019-08-30T09:09:28Z | 2019-08-30 12:09 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P149 | 2047-12-30T12:00:02Z | 2047-12-30 15:00 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (0 kanal) | — | PASS |  |
| P150 | 1970-08-24T01:34:16Z | 1970-08-24 03:34 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P151 | 2071-01-18T09:48:57Z | 2071-01-18 12:48 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P152 | 1949-11-25T22:53:22Z | 1949-11-26 00:53 | rastgele an (1900–2100) | local-certain | 13/13 | OK (4 kanal) | — | PASS |  |
| P153 | 1942-10-14T13:54:16Z | 1942-10-14 16:54 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P154 | 2044-10-03T15:09:47Z | 2044-10-03 18:09 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (3 kanal) | — | PASS |  |
| P155 | 1925-06-11T10:55:38Z | 1925-06-11 13:55 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P156 | 2000-11-30T02:22:41Z | 2000-11-30 04:22 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P157 | 2001-08-20T06:24:45Z | 2001-08-20 09:24 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P158 | 2034-02-18T03:20:11Z | 2034-02-18 06:20 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P159 | 2010-02-03T12:32:53Z | 2010-02-03 14:32 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P160 | 1901-03-16T21:24:26Z | 1901-03-16 23:21 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P161 | 1985-06-12T05:56:04Z | 1985-06-12 08:56 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P162 | 1974-09-04T13:29:47Z | 1974-09-04 16:29 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P163 | 1990-07-17T19:44:01Z | 1990-07-17 22:44 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P164 | 2014-01-29T03:56:17Z | 2014-01-29 05:56 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P165 | 2043-08-19T21:58:26Z | 2043-08-20 00:58 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P166 | 1915-01-21T06:20:56Z | 1915-01-21 08:20 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P167 | 1929-04-27T18:39:50Z | 1929-04-27 20:39 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P168 | 1947-04-12T16:45:32Z | 1947-04-12 18:45 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P169 | 2070-06-03T20:22:52Z | 2070-06-03 23:22 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P170 | 2034-05-02T14:36:54Z | 2034-05-02 17:36 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P171 | 2031-10-14T14:39:05Z | 2031-10-14 17:39 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P172 | 1997-11-19T16:45:27Z | 1997-11-19 18:45 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P173 | 1902-08-20T13:12:36Z | 1902-08-20 15:09 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (0 kanal) | — | PASS |  |
| P174 | 2033-07-27T12:55:58Z | 2033-07-27 15:55 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P175 | 1972-11-06T07:54:08Z | 1972-11-06 09:54 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P176 | 2036-11-21T10:37:53Z | 2036-11-21 13:37 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P177 | 2058-03-28T13:13:17Z | 2058-03-28 16:13 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P178 | 2010-07-30T19:43:52Z | 2010-07-30 22:43 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P179 | 2027-05-24T12:59:52Z | 2027-05-24 15:59 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P180 | 1937-07-28T13:59:58Z | 1937-07-28 15:59 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P181 | 1989-03-29T15:17:28Z | 1989-03-29 18:17 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (2 kanal) | — | PASS |  |
| P182 | 2066-12-03T06:33:21Z | 2066-12-03 09:33 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P183 | 2029-07-26T01:27:23Z | 2029-07-26 04:27 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P184 | 2080-08-31T01:38:42Z | 2080-08-31 04:38 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P185 | 1938-04-11T15:03:33Z | 1938-04-11 17:03 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P186 | 1901-01-12T14:02:11Z | 1901-01-12 15:59 | rastgele an (1900–2100) | local-certain | 13/13 | OK (6 kanal) | — | PASS |  |
| P187 | 2081-12-01T10:10:44Z | 2081-12-01 13:10 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P188 | 1913-12-30T07:15:30Z | 1913-12-30 09:15 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P189 | 2039-11-12T19:28:20Z | 2039-11-12 22:28 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P190 | 1900-11-28T07:52:18Z | 1900-11-28 09:49 | rastgele an (1900–2100) | local-certain | 13/13 | OK (4 kanal) | — | PASS |  |
| P191 | 2050-12-16T07:36:53Z | 2050-12-16 10:36 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P192 | 2068-06-27T12:48:18Z | 2068-06-27 15:48 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P193 | 2051-07-01T11:19:50Z | 2051-07-01 14:19 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (0 kanal) | — | PASS |  |
| P194 | 2096-11-22T13:21:50Z | 2096-11-22 16:21 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P195 | 1940-11-07T18:14:53Z | 1940-11-07 20:14 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P196 | 1945-07-16T07:14:05Z | 1945-07-16 10:14 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P197 | 1986-04-28T09:00:54Z | 1986-04-28 12:00 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P198 | 1911-07-07T07:57:26Z | 1911-07-07 09:57 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P199 | 1908-09-28T05:49:25Z | 1908-09-28 07:46 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P200 | 1948-07-15T10:00:35Z | 1948-07-15 13:00 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P201 | 1928-03-25T21:39:16Z | 1928-03-25 23:39 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P202 | 2070-05-10T00:26:52Z | 2070-05-10 03:26 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P203 | 2001-11-02T21:12:22Z | 2001-11-02 23:12 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P204 | 2046-08-11T14:53:54Z | 2046-08-11 17:53 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P205 | 1989-01-08T16:06:39Z | 1989-01-08 18:06 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (2 kanal) | — | PASS |  |
| P206 | 1955-11-24T18:52:58Z | 1955-11-24 20:52 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P207 | 1928-10-08T04:34:11Z | 1928-10-08 06:34 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P208 | 2000-07-29T13:40:32Z | 2000-07-29 16:40 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P209 | 2017-02-12T07:11:34Z | 2017-02-12 10:11 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P210 | 2072-05-03T21:40:28Z | 2072-05-04 00:40 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P211 | 1916-05-14T12:18:08Z | 1916-05-14 15:18 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P212 | 2026-10-16T11:24:22Z | 2026-10-16 14:24 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P213 | 1934-07-24T08:05:21Z | 1934-07-24 10:05 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P214 | 2095-11-09T19:07:57Z | 2095-11-09 22:07 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P215 | 1961-04-21T19:15:19Z | 1961-04-21 21:15 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P216 | 2047-02-25T16:55:27Z | 2047-02-25 19:55 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P217 | 2017-03-13T04:57:07Z | 2017-03-13 07:57 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P218 | 1918-04-04T09:53:52Z | 1918-04-04 11:53 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P219 | 1901-01-23T02:30:13Z | 1901-01-23 04:27 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P220 | 1925-04-03T16:32:17Z | 1925-04-03 18:32 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P221 | 1903-01-04T17:37:34Z | 1903-01-04 19:34 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P222 | 1967-01-10T21:06:39Z | 1967-01-10 23:06 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P223 | 1943-06-02T08:38:12Z | 1943-06-02 11:38 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P224 | 2086-04-27T08:50:02Z | 2086-04-27 11:50 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P225 | 2084-10-02T04:12:45Z | 2084-10-02 07:12 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (2 kanal) | — | PASS |  |
| P226 | 1963-09-12T04:06:40Z | 1963-09-12 07:06 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P227 | 2094-09-07T08:11:38Z | 2094-09-07 11:11 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P228 | 2078-02-25T10:49:53Z | 2078-02-25 13:49 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P229 | 2071-06-21T23:19:02Z | 2071-06-22 02:19 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P230 | 2076-03-31T10:50:19Z | 2076-03-31 13:50 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P231 | 2028-05-08T21:17:04Z | 2028-05-09 00:17 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P232 | 2000-02-13T20:10:03Z | 2000-02-13 22:10 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (2 kanal) | — | PASS |  |
| P233 | 2017-05-01T08:19:18Z | 2017-05-01 11:19 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P234 | 1946-10-09T13:54:22Z | 1946-10-09 15:54 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P235 | 2090-09-15T03:40:03Z | 2090-09-15 06:40 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P236 | 2072-11-24T11:45:34Z | 2072-11-24 14:45 | rastgele an (1900–2100) | local-certain | 13/13 | OK (4 kanal) | — | PASS |  |
| P237 | 1965-12-04T22:32:42Z | 1965-12-05 00:32 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P238 | 1961-02-14T01:29:49Z | 1961-02-14 03:29 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P239 | 1902-04-29T04:34:23Z | 1902-04-29 06:31 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P240 | 2099-04-09T07:50:26Z | 2099-04-09 10:50 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P241 | 2037-07-23T01:04:15Z | 2037-07-23 04:04 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P242 | 2035-02-10T07:52:26Z | 2035-02-10 10:52 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P243 | 1977-09-28T04:38:36Z | 1977-09-28 07:38 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P244 | 2010-06-10T12:12:57Z | 2010-06-10 15:12 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P245 | 2078-11-19T00:24:49Z | 2078-11-19 03:24 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (3 kanal) | — | PASS |  |
| P246 | 1903-08-31T13:57:42Z | 1903-08-31 15:54 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P247 | 1915-10-02T19:35:36Z | 1915-10-02 21:35 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P248 | 2089-04-30T00:42:04Z | 2089-04-30 03:42 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P249 | 2006-01-11T11:47:28Z | 2006-01-11 13:47 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P250 | 1994-08-20T15:15:31Z | 1994-08-20 18:15 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P251 | 2061-01-26T07:37:08Z | 2061-01-26 10:37 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P252 | 1979-02-26T09:10:19Z | 1979-02-26 12:10 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P253 | 1999-09-23T11:05:46Z | 1999-09-23 14:05 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P254 | 2084-12-10T04:22:16Z | 2084-12-10 07:22 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P255 | 1959-11-21T12:15:43Z | 1959-11-21 14:15 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P256 | 2016-02-05T07:06:52Z | 2016-02-05 09:06 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P257 | 1998-07-30T09:13:03Z | 1998-07-30 12:13 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P258 | 1907-10-05T14:28:20Z | 1907-10-05 16:25 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P259 | 1922-05-09T06:40:48Z | 1922-05-09 09:40 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P260 | 1907-10-05T06:48:21Z | 1907-10-05 08:45 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P261 | 2013-02-21T17:25:06Z | 2013-02-21 19:25 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P262 | 2034-12-05T16:25:33Z | 2034-12-05 19:25 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (0 kanal) | — | PASS |  |
| P263 | 2042-05-05T13:03:21Z | 2042-05-05 16:03 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P264 | 2087-03-25T12:49:01Z | 2087-03-25 15:49 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P265 | 2003-01-16T09:34:54Z | 2003-01-16 11:34 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P266 | 2007-09-23T23:21:22Z | 2007-09-24 02:21 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (2 kanal) | — | PASS |  |
| P267 | 1909-10-10T12:02:00Z | 1909-10-10 13:58 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P268 | 1988-06-24T11:24:25Z | 1988-06-24 14:24 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P269 | 2077-10-31T21:44:25Z | 2077-11-01 00:44 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P270 | 1949-07-03T05:19:04Z | 1949-07-03 08:19 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P271 | 2060-01-02T17:05:48Z | 2060-01-02 20:05 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P272 | 1913-01-05T02:49:56Z | 1913-01-05 04:49 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (2 kanal) | — | PASS |  |
| P273 | 2025-05-06T22:27:25Z | 2025-05-07 01:27 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P274 | 2065-08-28T06:47:59Z | 2065-08-28 09:47 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (0 kanal) | — | PASS |  |
| P275 | 1963-09-12T04:31:52Z | 1963-09-12 07:31 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P276 | 1913-06-29T07:36:20Z | 1913-06-29 09:36 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P277 | 1985-10-30T12:39:30Z | 1985-10-30 14:39 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P278 | 2041-09-18T18:00:09Z | 2041-09-18 21:00 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P279 | 1982-02-19T00:21:38Z | 1982-02-19 03:21 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P280 | 1917-05-29T13:40:19Z | 1917-05-29 15:40 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P281 | 2042-04-29T02:43:46Z | 2042-04-29 05:43 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P282 | 1921-06-03T00:56:09Z | 1921-06-03 03:56 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P283 | 1949-04-04T08:53:54Z | 1949-04-04 10:53 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P284 | 1969-05-11T01:37:45Z | 1969-05-11 03:37 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P285 | 2089-06-26T18:05:35Z | 2089-06-26 21:05 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P286 | 1911-08-28T21:08:14Z | 1911-08-28 23:08 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P287 | 2025-09-13T15:14:13Z | 2025-09-13 18:14 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P288 | 2097-03-31T14:36:03Z | 2097-03-31 17:36 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P289 | 2043-08-16T23:24:03Z | 2043-08-17 02:24 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P290 | 2004-08-31T09:12:13Z | 2004-08-31 12:12 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P291 | 1962-10-29T08:32:23Z | 1962-10-29 11:32 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P292 | 1957-11-14T12:26:45Z | 1957-11-14 14:26 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P293 | 2018-08-07T15:09:49Z | 2018-08-07 18:09 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P294 | 2071-04-11T15:17:17Z | 2071-04-11 18:17 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P295 | 2058-11-15T08:56:53Z | 2058-11-15 11:56 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P296 | 1924-02-04T02:23:27Z | 1924-02-04 04:23 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P297 | 2019-11-26T03:54:10Z | 2019-11-26 06:54 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P298 | 2057-11-06T00:56:38Z | 2057-11-06 03:56 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P299 | 1953-01-30T10:39:14Z | 1953-01-30 12:39 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P300 | 1992-12-13T15:10:42Z | 1992-12-13 17:10 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P301 | 1913-03-05T18:40:08Z | 1913-03-05 20:40 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P302 | 2098-03-13T08:49:27Z | 2098-03-13 11:49 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P303 | 2043-04-26T18:16:44Z | 2043-04-26 21:16 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P304 | 2061-02-24T13:34:11Z | 2061-02-24 16:34 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P305 | 1909-10-14T09:55:15Z | 1909-10-14 11:52 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P306 | 2093-08-04T23:53:41Z | 2093-08-05 02:53 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P307 | 2045-10-27T22:16:54Z | 2045-10-28 01:16 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P308 | 1969-02-17T15:41:26Z | 1969-02-17 17:41 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P309 | 1996-12-27T04:40:22Z | 1996-12-27 06:40 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P310 | 1958-10-06T07:09:10Z | 1958-10-06 09:09 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P311 | 1921-02-03T07:10:49Z | 1921-02-03 09:10 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P312 | 1931-03-20T02:17:08Z | 1931-03-20 04:17 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P313 | 2018-10-28T08:11:38Z | 2018-10-28 11:11 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P314 | 2019-11-03T04:17:15Z | 2019-11-03 07:17 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P315 | 2004-05-16T17:40:00Z | 2004-05-16 20:40 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P316 | 2086-07-31T17:47:17Z | 2086-07-31 20:47 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P317 | 2092-08-28T02:02:00Z | 2092-08-28 05:02 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P318 | 1904-05-12T08:37:16Z | 1904-05-12 10:34 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P319 | 1976-03-06T22:32:21Z | 1976-03-07 00:32 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P320 | 2100-11-03T02:26:10Z | 2100-11-03 05:26 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P321 | 1985-03-16T22:07:04Z | 1985-03-17 00:07 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P322 | 2100-01-26T01:39:34Z | 2100-01-26 04:39 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P323 | 1963-12-15T13:48:12Z | 1963-12-15 15:48 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (0 kanal) | — | PASS |  |
| P324 | 2086-03-19T02:32:45Z | 2086-03-19 05:32 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P325 | 1902-10-23T16:10:01Z | 1902-10-23 18:06 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P326 | 1930-12-03T17:15:12Z | 1930-12-03 19:15 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P327 | 1924-10-11T15:48:41Z | 1924-10-11 17:48 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P328 | 1930-02-11T04:39:29Z | 1930-02-11 06:39 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P329 | 2008-07-19T07:13:11Z | 2008-07-19 10:13 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (2 kanal) | — | PASS |  |
| P330 | 2080-11-15T05:24:20Z | 2080-11-15 08:24 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P331 | 2085-09-01T22:50:23Z | 2085-09-02 01:50 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (3 kanal) | — | PASS |  |
| P332 | 1996-05-30T05:40:46Z | 1996-05-30 08:40 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P333 | 1935-11-11T19:05:43Z | 1935-11-11 21:05 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P334 | 2025-11-08T19:16:05Z | 2025-11-08 22:16 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P335 | 1937-04-29T22:21:31Z | 1937-04-30 00:21 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P336 | 2048-07-05T05:10:58Z | 2048-07-05 08:10 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P337 | 1999-09-07T14:55:31Z | 1999-09-07 17:55 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P338 | 2049-08-14T08:53:31Z | 2049-08-14 11:53 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P339 | 2098-07-02T14:34:45Z | 2098-07-02 17:34 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P340 | 2015-10-03T10:41:46Z | 2015-10-03 13:41 | rastgele an (1900–2100) | local-certain | 13/13 | OK (4 kanal) | — | PASS |  |
| P341 | 2026-03-20T06:25:25Z | 2026-03-20 09:25 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P342 | 1981-12-17T06:51:20Z | 1981-12-17 09:51 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P343 | 1963-03-10T20:06:44Z | 1963-03-10 23:06 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P344 | 1922-08-06T22:41:18Z | 1922-08-07 01:41 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P345 | 2091-12-11T04:23:56Z | 2091-12-11 07:23 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P346 | 1924-03-23T07:29:47Z | 1924-03-23 09:29 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P347 | 2003-09-15T15:05:51Z | 2003-09-15 18:05 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P348 | 1914-09-10T04:04:26Z | 1914-09-10 06:04 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P349 | 2075-05-22T05:00:57Z | 2075-05-22 08:00 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P350 | 2090-04-15T13:22:21Z | 2090-04-15 16:22 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P351 | 2086-11-11T17:44:19Z | 2086-11-11 20:44 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P352 | 1959-11-16T19:28:15Z | 1959-11-16 21:28 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P353 | 2024-09-18T21:06:20Z | 2024-09-19 00:06 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P354 | 1964-03-10T00:50:08Z | 1964-03-10 02:50 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P355 | 2006-12-08T09:34:52Z | 2006-12-08 11:34 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P356 | 2072-04-01T02:52:04Z | 2072-04-01 05:52 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P357 | 2004-12-12T10:24:52Z | 2004-12-12 12:24 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P358 | 2090-06-17T00:12:42Z | 2090-06-17 03:12 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P359 | 2002-04-03T06:15:11Z | 2002-04-03 09:15 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P360 | 1985-04-15T13:56:26Z | 1985-04-15 15:56 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P361 | 1993-08-21T12:34:49Z | 1993-08-21 15:34 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P362 | 1998-09-12T08:14:39Z | 1998-09-12 11:14 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (0 kanal) | — | PASS |  |
| P363 | 1902-09-26T00:39:12Z | 1902-09-26 02:36 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P364 | 1903-01-12T10:39:50Z | 1903-01-12 12:36 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P365 | 1925-09-22T09:25:15Z | 1925-09-22 12:25 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P366 | 1943-11-25T06:50:36Z | 1943-11-25 09:50 | rastgele an (1900–2100) | local-certain | 13/13 | OK (4 kanal) | — | PASS |  |
| P367 | 1964-03-31T22:36:58Z | 1964-04-01 00:36 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P368 | 1947-11-07T05:02:47Z | 1947-11-07 07:02 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P369 | 2089-03-14T18:40:14Z | 2089-03-14 21:40 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P370 | 1917-08-30T00:31:32Z | 1917-08-30 02:31 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P371 | 1935-12-31T14:41:26Z | 1935-12-31 16:41 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P372 | 2090-09-30T12:32:55Z | 2090-09-30 15:32 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P373 | 1952-10-25T11:12:36Z | 1952-10-25 13:12 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P374 | 1903-12-17T11:19:27Z | 1903-12-17 13:16 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P375 | 1992-03-18T16:34:01Z | 1992-03-18 18:34 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P376 | 2032-07-03T17:03:29Z | 2032-07-03 20:03 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (0 kanal) | — | PASS |  |
| P377 | 1928-07-06T03:54:33Z | 1928-07-06 05:54 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P378 | 1932-05-17T06:40:21Z | 1932-05-17 08:40 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P379 | 1915-12-28T04:06:31Z | 1915-12-28 06:06 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P380 | 2014-10-18T06:08:15Z | 2014-10-18 09:08 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P381 | 1963-07-28T07:05:09Z | 1963-07-28 10:05 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P382 | 2041-06-19T14:26:42Z | 2041-06-19 17:26 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P383 | 2056-07-01T16:33:43Z | 2056-07-01 19:33 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P384 | 2005-05-29T02:20:39Z | 2005-05-29 05:20 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P385 | 2067-01-04T03:43:42Z | 2067-01-04 06:43 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P386 | 2026-06-25T09:38:53Z | 2026-06-25 12:38 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P387 | 2048-03-16T05:24:50Z | 2048-03-16 08:24 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P388 | 2058-03-25T14:13:41Z | 2058-03-25 17:13 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P389 | 2080-05-19T23:10:26Z | 2080-05-20 02:10 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P390 | 1952-03-23T01:09:08Z | 1952-03-23 03:09 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P391 | 1932-08-15T14:51:15Z | 1932-08-15 16:51 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P392 | 1958-03-15T03:02:52Z | 1958-03-15 05:02 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (2 kanal) | — | PASS |  |
| P393 | 2089-11-19T04:31:24Z | 2089-11-19 07:31 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P394 | 2060-09-25T03:56:53Z | 2060-09-25 06:56 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (0 kanal) | — | PASS |  |
| P395 | 1917-12-18T21:18:05Z | 1917-12-18 23:18 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P396 | 1962-06-17T07:37:58Z | 1962-06-17 09:37 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P397 | 2016-10-08T18:26:48Z | 2016-10-08 21:26 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P398 | 2007-08-13T03:22:09Z | 2007-08-13 06:22 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P399 | 2009-09-18T02:21:32Z | 2009-09-18 05:21 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P400 | 1945-11-18T18:56:01Z | 1945-11-18 20:56 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P401 | 2000-09-30T02:24:19Z | 2000-09-30 05:24 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P402 | 1921-02-18T17:03:33Z | 1921-02-18 19:03 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P403 | 1983-10-17T12:10:51Z | 1983-10-17 15:10 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P404 | 2031-08-28T22:18:10Z | 2031-08-29 01:18 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P405 | 2038-08-06T02:04:33Z | 2038-08-06 05:04 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P406 | 1906-11-27T09:19:33Z | 1906-11-27 11:16 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P407 | 2093-06-01T14:38:13Z | 2093-06-01 17:38 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P408 | 2052-05-20T02:47:16Z | 2052-05-20 05:47 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P409 | 1995-01-26T05:10:04Z | 1995-01-26 07:10 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P410 | 2009-05-15T04:31:33Z | 2009-05-15 07:31 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P411 | 2081-10-06T03:44:20Z | 2081-10-06 06:44 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P412 | 1932-01-29T19:23:42Z | 1932-01-29 21:23 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P413 | 2012-07-31T14:37:34Z | 2012-07-31 17:37 | rastgele an (1900–2100) | local-certain | 13/13 | OK (4 kanal) | — | PASS |  |
| P414 | 2039-06-28T23:52:40Z | 2039-06-29 02:52 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P415 | 1981-05-17T11:23:21Z | 1981-05-17 14:23 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P416 | 1927-12-06T07:58:03Z | 1927-12-06 09:58 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P417 | 2001-03-30T09:34:33Z | 2001-03-30 12:34 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P418 | 2050-06-19T18:11:45Z | 2050-06-19 21:11 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P419 | 2045-04-14T05:39:07Z | 2045-04-14 08:39 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P420 | 2008-01-10T04:04:12Z | 2008-01-10 06:04 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P421 | 2031-05-03T22:42:34Z | 2031-05-04 01:42 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (3 kanal) | — | PASS |  |
| P422 | 2024-06-23T22:47:12Z | 2024-06-24 01:47 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P423 | 1987-10-09T19:13:40Z | 1987-10-09 21:13 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P424 | 1954-09-30T17:50:39Z | 1954-09-30 19:50 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P425 | 1992-03-12T13:29:37Z | 1992-03-12 15:29 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P426 | 1979-05-23T11:32:13Z | 1979-05-23 14:32 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P427 | 1939-11-12T20:39:14Z | 1939-11-12 22:39 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P428 | 2000-01-16T19:53:05Z | 2000-01-16 21:53 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P429 | 1952-11-13T01:57:48Z | 1952-11-13 03:57 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P430 | 1963-01-06T09:32:19Z | 1963-01-06 12:32 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P431 | 1993-09-03T19:25:11Z | 1993-09-03 22:25 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P432 | 1956-05-12T17:37:58Z | 1956-05-12 19:37 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P433 | 1977-06-27T03:17:50Z | 1977-06-27 06:17 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P434 | 1935-12-19T20:33:20Z | 1935-12-19 22:33 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P435 | 1979-04-01T11:44:49Z | 1979-04-01 14:44 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P436 | 2077-05-04T04:25:55Z | 2077-05-04 07:25 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P437 | 2071-10-06T08:45:47Z | 2071-10-06 11:45 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P438 | 1966-10-22T10:07:22Z | 1966-10-22 12:07 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P439 | 1925-10-08T17:58:15Z | 1925-10-08 19:58 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P440 | 2016-05-28T23:59:44Z | 2016-05-29 02:59 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P441 | 1994-12-10T14:42:34Z | 1994-12-10 16:42 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P442 | 2038-09-15T11:11:47Z | 2038-09-15 14:11 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P443 | 1972-01-28T19:50:20Z | 1972-01-28 21:50 | rastgele an (1900–2100) | local-certain | 13/13 | OK (4 kanal) | — | PASS |  |
| P444 | 1959-12-12T03:44:39Z | 1959-12-12 05:44 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P445 | 1960-08-20T09:04:20Z | 1960-08-20 11:04 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
| P446 | 1943-05-29T01:55:39Z | 1943-05-29 04:55 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P447 | 1967-04-14T08:42:11Z | 1967-04-14 10:42 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P448 | 2045-07-30T14:24:44Z | 2045-07-30 17:24 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (2 kanal) | — | PASS |  |
| P449 | 2093-04-22T18:41:47Z | 2093-04-22 21:41 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P450 | 1930-04-01T09:51:57Z | 1930-04-01 11:51 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P451 | 2048-05-03T20:39:14Z | 2048-05-03 23:39 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P452 | 2092-09-21T23:10:28Z | 2092-09-22 02:10 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P453 | 2018-12-03T12:10:51Z | 2018-12-03 15:10 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P454 | 2090-06-29T12:34:04Z | 2090-06-29 15:34 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P455 | 2093-06-16T17:31:55Z | 2093-06-16 20:31 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P456 | 1901-04-26T10:31:06Z | 1901-04-26 12:28 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P457 | 1937-04-10T10:51:27Z | 1937-04-10 12:51 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (3 kanal) | — | PASS |  |
| P458 | 2069-08-14T07:30:40Z | 2069-08-14 10:30 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P459 | 2009-08-18T06:36:04Z | 2009-08-18 09:36 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P460 | 2041-09-20T23:08:33Z | 2041-09-21 02:08 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P461 | 1975-01-29T21:55:31Z | 1975-01-29 23:55 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P462 | 1996-11-12T10:06:45Z | 1996-11-12 12:06 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P463 | 1947-04-26T00:20:00Z | 1947-04-26 03:20 | rastgele an (1900–2100) | roxy-partial | 12/13 | OK (3 kanal) | — | PASS | kesinleştirilemedi Venus (SE marj 0.01″) |
| P464 | 1912-01-01T04:44:25Z | 1912-01-01 06:44 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P465 | 1997-10-08T14:21:51Z | 1997-10-08 17:21 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P466 | 1951-10-14T12:30:33Z | 1951-10-14 14:30 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P467 | 2042-03-03T11:24:32Z | 2042-03-03 14:24 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P468 | 1925-12-07T20:56:23Z | 1925-12-07 22:56 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P469 | 1910-08-13T18:46:12Z | 1910-08-13 20:43 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P470 | 2038-07-03T13:18:39Z | 2038-07-03 16:18 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P471 | 1902-07-15T08:41:54Z | 1902-07-15 10:38 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P472 | 1988-05-29T05:29:35Z | 1988-05-29 08:29 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P473 | 2004-02-13T23:40:19Z | 2004-02-14 01:40 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P474 | 2057-03-17T15:49:49Z | 2057-03-17 18:49 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P475 | 2085-11-04T08:21:48Z | 2085-11-04 11:21 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P476 | 1976-04-26T10:25:08Z | 1976-04-26 13:25 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P477 | 2000-10-02T13:22:25Z | 2000-10-02 16:22 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P478 | 2013-01-03T18:30:43Z | 2013-01-03 20:30 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P479 | 2091-03-23T18:06:46Z | 2091-03-23 21:06 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P480 | 2075-04-10T09:48:59Z | 2075-04-10 12:48 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P481 | 2051-06-28T14:38:51Z | 2051-06-28 17:38 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (0 kanal) | — | PASS |  |
| P482 | 1974-02-18T13:34:15Z | 1974-02-18 15:34 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P483 | 2061-05-25T03:57:01Z | 2061-05-25 06:57 | rastgele an (1900–2100) | local-certain | 13/13 | OK (4 kanal) | — | PASS |  |
| P484 | 1992-02-05T21:47:39Z | 1992-02-05 23:47 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P485 | 2035-10-22T10:09:01Z | 2035-10-22 13:09 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (1 kanal) | — | PASS |  |
| P486 | 2069-09-27T06:32:15Z | 2069-09-27 09:32 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P487 | 2004-08-08T16:46:56Z | 2004-08-08 19:46 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P488 | 2022-05-27T03:07:59Z | 2022-05-27 06:07 | rastgele an (1900–2100) | roxy-resolved | 13/13 | OK (2 kanal) | — | PASS |  |
| P489 | 2015-05-04T17:02:15Z | 2015-05-04 20:02 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P490 | 1983-01-07T19:26:39Z | 1983-01-07 22:26 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P491 | 1960-06-30T10:00:51Z | 1960-06-30 12:00 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P492 | 2066-01-28T11:06:53Z | 2066-01-28 14:06 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P493 | 1932-05-18T14:57:58Z | 1932-05-18 16:57 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P494 | 2056-09-08T18:52:25Z | 2056-09-08 21:52 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P495 | 2077-12-23T19:25:36Z | 2077-12-23 22:25 | rastgele an (1900–2100) | local-certain | 13/13 | OK (4 kanal) | — | PASS |  |
| P496 | 2015-04-14T02:48:56Z | 2015-04-14 05:48 | rastgele an (1900–2100) | local-certain | 13/13 | OK (2 kanal) | — | PASS |  |
| P497 | 2097-11-23T15:43:16Z | 2097-11-23 18:43 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P498 | 1939-09-11T22:50:14Z | 1939-09-12 00:50 | rastgele an (1900–2100) | local-certain | 13/13 | OK (0 kanal) | — | PASS |  |
| P499 | 2095-08-20T13:07:45Z | 2095-08-20 16:07 | rastgele an (1900–2100) | local-certain | 13/13 | OK (1 kanal) | — | PASS |  |
| P500 | 2080-05-24T14:42:17Z | 2080-05-24 17:42 | rastgele an (1900–2100) | local-certain | 13/13 | OK (3 kanal) | — | PASS |  |
