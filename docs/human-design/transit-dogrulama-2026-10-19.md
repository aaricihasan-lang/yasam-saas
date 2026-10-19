# Human Design Transit — Gerçek Roxy Doğrulaması (19 Ekim 2026)

Kaynaklar: **Roxy** `POST /human-design/transit` gerçek yanıtları (lang=tr, true node) · **yerel motor** `computeGeneralTransit` · **Swiss Ephemeris** (pyswisseph, JPL tabanlı `.se1`, görünen konum, SE_TRUE_NODE; bağımsız Python mandala). Test kişileri sentetik.

## Özet

```json
{
 "moments": 120,
 "passMoments": 120,
 "activationsCompared": 1560,
 "roxyEqLocal": 1551,
 "roxyEqSwissEph": 1560,
 "localEqSwissEph": 1551,
 "channelCenterChecks": 120,
 "educationalChecks": 120,
 "channelDefinitionChecks": 459,
 "channelCenterIssues": 0,
 "shownGeneral": {
  "certainActivations": 1481,
  "certainWrong": 0,
  "uncertainActivations": 79,
  "uncertainTruthNotInCandidates": 0,
  "momentsFullyCertain": 56,
  "channelClaimsWrong": 0,
  "centerClaimsWrong": 0
 },
 "natalActivationsCompared": 78,
 "natalIssues": 0,
 "maxLocalMinusSwissEphArcsec": {
  "Sun": 4.706,
  "Earth": 4.706,
  "Moon": 57.202,
  "NorthNode": 13.158,
  "SouthNode": 13.158,
  "Mercury": 7.634,
  "Venus": 20.304,
  "Mars": 8.778,
  "Jupiter": 9.756,
  "Saturn": 10.474,
  "Uranus": 11.101,
  "Neptune": 18.072,
  "Pluto": 7.828
 }
}
```

## Anlar

| # | UTC | Türkiye | Senaryo | 13 aktivasyon (Roxy = yerel = SE) | Kanal / merkez | Sonuç | Ayrıntı |
|---|---|---|---|---|---|---|---|
| R001 | 1995-06-12T23:58:13Z | 1995-06-13 02:58 | geçmiş (1901–2000) | 13/13 | OK (3 kanal, 1 geçici merkez) | PASS |  |
| R002 | 1992-07-18T06:35:46Z | 1992-07-18 09:35 | geçmiş (1901–2000) | 13/13 | OK (3 kanal, 2 geçici merkez) | PASS |  |
| R003 | 1901-09-24T22:36:59Z | 1901-09-25 00:33 | geçmiş (1901–2000) | 13/13 | OK (3 kanal, 1 geçici merkez) | PASS |  |
| R004 | 1955-06-30T06:07:13Z | 1955-06-30 08:07 | geçmiş (1901–2000) | 13/13 | OK (4 kanal, 2 geçici merkez) | PASS | kesinleştirilemedi: NorthNode 11.5/11.4, SouthNode 12.5/12.4 |
| R005 | 1998-08-01T19:01:56Z | 1998-08-01 22:01 | geçmiş (1901–2000) | 13/13 | OK (0 kanal, 0 geçici merkez) | PASS |  |
| R006 | 1921-10-12T16:48:16Z | 1921-10-12 18:48 | geçmiş (1901–2000) | 13/13 | OK (3 kanal, 2 geçici merkez) | PASS |  |
| R007 | 1909-02-07T06:53:15Z | 1909-02-07 08:50 | geçmiş (1901–2000) | 13/13 | OK (3 kanal, 2 geçici merkez) | PASS | kesinleştirilemedi: NorthNode 12.3/12.2, SouthNode 11.3/11.2 |
| R008 | 1924-01-04T05:44:16Z | 1924-01-04 07:44 | geçmiş (1901–2000) | 13/13 | OK (2 kanal, 4 geçici merkez) | PASS |  |
| R009 | 1981-06-23T19:56:40Z | 1981-06-23 22:56 | geçmiş (1901–2000) | 13/13 | OK (3 kanal, 0 geçici merkez) | PASS |  |
| R010 | 1949-04-27T05:11:45Z | 1949-04-27 08:11 | geçmiş (1901–2000) | 13/13 | OK (2 kanal, 2 geçici merkez) | PASS |  |
| R011 | 1917-12-25T13:02:03Z | 1917-12-25 15:02 | geçmiş (1901–2000) | 13/13 | OK (4 kanal, 2 geçici merkez) | PASS |  |
| R012 | 1942-11-25T12:09:58Z | 1942-11-25 15:09 | geçmiş (1901–2000) | 13/13 | OK (4 kanal, 2 geçici merkez) | PASS | kesinleştirilemedi: Venus 34.6/34.5 |
| R013 | 1985-07-23T00:04:46Z | 1985-07-23 03:04 | geçmiş (1901–2000) | 13/13 | OK (4 kanal, 1 geçici merkez) | PASS |  |
| R014 | 1918-04-12T17:05:58Z | 1918-04-12 19:05 | geçmiş (1901–2000) | 13/13 | OK (2 kanal, 1 geçici merkez) | PASS | kesinleştirilemedi: Saturn 31.6/33.1 |
| R015 | 1990-04-19T23:14:44Z | 1990-04-20 02:14 | geçmiş (1901–2000) | 13/13 | OK (2 kanal, 1 geçici merkez) | PASS |  |
| R016 | 1984-04-28T03:19:36Z | 1984-04-28 06:19 | geçmiş (1901–2000) | 13/13 | OK (3 kanal, 3 geçici merkez) | PASS |  |
| R017 | 1999-04-15T23:15:28Z | 1999-04-16 02:15 | geçmiş (1901–2000) | 13/13 | OK (7 kanal, 2 geçici merkez) | PASS |  |
| R018 | 1975-05-19T02:47:57Z | 1975-05-19 05:47 | geçmiş (1901–2000) | 13/13 | OK (4 kanal, 2 geçici merkez) | PASS | kesinleştirilemedi: Jupiter 21.6/21.5 |
| R019 | 2025-12-30T23:32:52Z | 2025-12-31 02:32 | yakın geçmiş (2001–2025) | 13/13 | OK (3 kanal, 3 geçici merkez) | PASS |  |
| R020 | 2023-02-14T06:09:16Z | 2023-02-14 09:09 | yakın geçmiş (2001–2025) | 13/13 | OK (4 kanal, 3 geçici merkez) | PASS |  |
| R021 | 2009-03-26T08:11:26Z | 2009-03-26 10:11 | yakın geçmiş (2001–2025) | 13/13 | OK (4 kanal, 2 geçici merkez) | PASS |  |
| R022 | 2023-03-17T17:02:01Z | 2023-03-17 20:02 | yakın geçmiş (2001–2025) | 13/13 | OK (2 kanal, 1 geçici merkez) | PASS |  |
| R023 | 2025-09-12T16:16:48Z | 2025-09-12 19:16 | yakın geçmiş (2001–2025) | 13/13 | OK (4 kanal, 3 geçici merkez) | PASS | kesinleştirilemedi: Mars 32.4/32.3, Neptune 25.3/25.4 |
| R024 | 2014-10-26T13:45:47Z | 2014-10-26 15:45 | yakın geçmiş (2001–2025) | 13/13 | OK (5 kanal, 2 geçici merkez) | PASS |  |
| R025 | 2004-08-31T05:40:56Z | 2004-08-31 08:40 | yakın geçmiş (2001–2025) | 13/13 | OK (3 kanal, 2 geçici merkez) | PASS |  |
| R026 | 2003-08-12T08:39:36Z | 2003-08-12 11:39 | yakın geçmiş (2001–2025) | 13/13 | OK (1 kanal, 2 geçici merkez) | PASS |  |
| R027 | 2013-02-26T09:28:09Z | 2013-02-26 11:28 | yakın geçmiş (2001–2025) | 13/13 | OK (1 kanal, 2 geçici merkez) | PASS |  |
| R028 | 2023-03-04T00:13:26Z | 2023-03-04 03:13 | yakın geçmiş (2001–2025) | 13/13 | OK (5 kanal, 3 geçici merkez) | PASS |  |
| R029 | 2026-02-14T09:35:36Z | 2026-02-14 12:35 | 2026 | 13/13 | OK (2 kanal, 2 geçici merkez) | PASS |  |
| R030 | 2026-03-25T03:57:57Z | 2026-03-25 06:57 | 2026 | 13/13 | OK (5 kanal, 3 geçici merkez) | PASS |  |
| R031 | 2026-09-06T13:21:09Z | 2026-09-06 16:21 | 2026 | 13/13 | OK (5 kanal, 2 geçici merkez) | PASS |  |
| R032 | 2026-01-01T07:37:31Z | 2026-01-01 10:37 | 2026 | 13/13 | OK (3 kanal, 2 geçici merkez) | PASS |  |
| R033 | 2026-10-04T12:37:51Z | 2026-10-04 15:37 | 2026 | 13/13 | OK (3 kanal, 2 geçici merkez) | PASS |  |
| R034 | 2026-08-29T00:15:28Z | 2026-08-29 03:15 | 2026 | 13/13 | OK (7 kanal, 2 geçici merkez) | PASS |  |
| R035 | 2026-06-21T01:15:36Z | 2026-06-21 04:15 | 2026 | 13/13 | OK (7 kanal, 4 geçici merkez) | PASS |  |
| R036 | 2026-05-22T09:08:56Z | 2026-05-22 12:08 | 2026 | 13/13 | OK (4 kanal, 2 geçici merkez) | PASS | kesinleştirilemedi: Saturn 21.3/21.2 |
| R037 | 2026-04-21T22:35:32Z | 2026-04-22 01:35 | 2026 | 13/13 | OK (3 kanal, 2 geçici merkez) | PASS |  |
| R038 | 2026-12-11T14:47:28Z | 2026-12-11 17:47 | 2026 | 13/13 | OK (6 kanal, 3 geçici merkez) | PASS |  |
| R039 | 2026-05-07T21:16:50Z | 2026-05-08 00:16 | 2026 | 13/13 | OK (4 kanal, 2 geçici merkez) | PASS | kesinleştirilemedi: Mercury 24.3/24.2 |
| R040 | 2026-01-10T13:47:10Z | 2026-01-10 16:47 | 2026 | 13/13 | OK (5 kanal, 3 geçici merkez) | PASS |  |
| R041 | 2042-05-26T07:36:11Z | 2042-05-26 10:36 | gelecek (2027–2100) | 13/13 | OK (4 kanal, 2 geçici merkez) | PASS |  |
| R042 | 2043-09-06T07:51:02Z | 2043-09-06 10:51 | gelecek (2027–2100) | 13/13 | OK (5 kanal, 1 geçici merkez) | PASS |  |
| R043 | 2099-02-13T21:24:12Z | 2099-02-14 00:24 | gelecek (2027–2100) | 13/13 | OK (2 kanal, 2 geçici merkez) | PASS |  |
| R044 | 2046-02-10T23:02:55Z | 2046-02-11 02:02 | gelecek (2027–2100) | 13/13 | OK (2 kanal, 2 geçici merkez) | PASS |  |
| R045 | 2055-08-14T14:21:46Z | 2055-08-14 17:21 | gelecek (2027–2100) | 13/13 | OK (3 kanal, 1 geçici merkez) | PASS |  |
| R046 | 2060-12-10T16:35:13Z | 2060-12-10 19:35 | gelecek (2027–2100) | 13/13 | OK (3 kanal, 2 geçici merkez) | PASS |  |
| R047 | 2069-06-10T01:04:23Z | 2069-06-10 04:04 | gelecek (2027–2100) | 13/13 | OK (3 kanal, 3 geçici merkez) | PASS |  |
| R048 | 2032-07-01T07:04:41Z | 2032-07-01 10:04 | gelecek (2027–2100) | 13/13 | OK (3 kanal, 1 geçici merkez) | PASS |  |
| R049 | 2068-08-31T15:30:11Z | 2068-08-31 18:30 | gelecek (2027–2100) | 13/13 | OK (5 kanal, 3 geçici merkez) | PASS |  |
| R050 | 2077-11-28T11:37:23Z | 2077-11-28 14:37 | gelecek (2027–2100) | 13/13 | OK (5 kanal, 3 geçici merkez) | PASS | kesinleştirilemedi: Saturn 58.6/38.1 |
| R051 | 2062-04-01T04:17:59Z | 2062-04-01 07:17 | gelecek (2027–2100) | 13/13 | OK (3 kanal, 3 geçici merkez) | PASS |  |
| R052 | 2043-08-04T16:36:06Z | 2043-08-04 19:36 | gelecek (2027–2100) | 13/13 | OK (3 kanal, 3 geçici merkez) | PASS | kesinleştirilemedi: Mercury 40.5/40.4 |
| R053 | 2059-03-20T14:52:51Z | 2059-03-20 17:52 | gelecek (2027–2100) | 13/13 | OK (4 kanal, 2 geçici merkez) | PASS |  |
| R054 | 2027-12-06T01:46:40Z | 2027-12-06 04:46 | gelecek (2027–2100) | 13/13 | OK (0 kanal, 0 geçici merkez) | PASS | kesinleştirilemedi: Neptune 17.1/25.6 |
| R055 | 2093-11-28T09:09:49Z | 2093-11-28 12:09 | gelecek (2027–2100) | 13/13 | OK (2 kanal, 1 geçici merkez) | PASS |  |
| R056 | 2092-11-11T16:38:13Z | 2092-11-11 19:38 | gelecek (2027–2100) | 13/13 | OK (4 kanal, 3 geçici merkez) | PASS |  |
| R057 | 2070-05-15T16:27:38Z | 2070-05-15 19:27 | gelecek (2027–2100) | 13/13 | OK (4 kanal, 2 geçici merkez) | PASS |  |
| R058 | 2075-01-29T15:02:54Z | 2075-01-29 18:02 | gelecek (2027–2100) | 13/13 | OK (6 kanal, 3 geçici merkez) | PASS |  |
| R059 | 2026-10-18T21:00:00Z | 2026-10-19 00:00 | Türkiye 2026-10-19 00:00 (gece yarısı / gün değişimi) | 13/13 | OK (6 kanal, 2 geçici merkez) | PASS | kesinleştirilemedi: Venus 28.2/28.3 |
| R060 | 2026-10-19T21:00:00Z | 2026-10-20 00:00 | Türkiye 2026-10-20 00:00 (gece yarısı / gün değişimi) | 13/13 | OK (2 kanal, 2 geçici merkez) | PASS | kesinleştirilemedi: Mercury 43.2/43.1 |
| R061 | 2026-10-19T20:59:00Z | 2026-10-19 23:59 | Türkiye 2026-10-19 23:59 (gece yarısı / gün değişimi) | 13/13 | OK (4 kanal, 1 geçici merkez) | PASS | kesinleştirilemedi: Mercury 43.2/43.1 |
| R062 | 2026-12-31T20:59:00Z | 2026-12-31 23:59 | Türkiye 2026-12-31 23:59 (gece yarısı / gün değişimi) | 13/13 | OK (6 kanal, 3 geçici merkez) | PASS |  |
| R063 | 2026-12-31T21:00:00Z | 2027-01-01 00:00 | Türkiye 2027-01-01 00:00 (gece yarısı / gün değişimi) | 13/13 | OK (2 kanal, 1 geçici merkez) | PASS |  |
| R064 | 2026-02-28T23:59:00Z | 2026-03-01 02:59 | Türkiye 2026-03-01 02:59 (gece yarısı / gün değişimi) | 13/13 | OK (3 kanal, 2 geçici merkez) | PASS |  |
| R065 | 2026-03-01T00:00:00Z | 2026-03-01 03:00 | Türkiye 2026-03-01 03:00 (gece yarısı / gün değişimi) | 13/13 | OK (2 kanal, 2 geçici merkez) | PASS |  |
| R066 | 2028-02-28T21:30:00Z | 2028-02-29 00:30 | Türkiye 2028-02-29 00:30 (gece yarısı / gün değişimi) | 13/13 | OK (1 kanal, 2 geçici merkez) | PASS |  |
| R067 | 1999-12-31T21:59:00Z | 1999-12-31 23:59 | Türkiye 1999-12-31 23:59 (gece yarısı / gün değişimi) | 13/13 | OK (2 kanal, 2 geçici merkez) | PASS |  |
| R068 | 1999-12-31T22:00:00Z | 2000-01-01 00:00 | Türkiye 2000-01-01 00:00 (gece yarısı / gün değişimi) | 13/13 | OK (4 kanal, 2 geçici merkez) | PASS |  |
| B01-a | 2026-11-05T15:58:29Z | 2026-11-05 18:58 | Sun kapı sınırı öncesi (~5″) | 13/13 | OK (6 kanal, 3 geçici merkez) | PASS | sınır: Sun gate before, yerel marj 4.99″, SE marj 4.03″ · kesinleştirilemedi: Sun 44.6/1.1, Earth 24.6/2.1, Neptune 25.4/25.5 |
| B01-b | 2026-11-05T16:02:28Z | 2026-11-05 19:02 | Sun kapı sınırı sonrası (~5″) | 13/13 | OK (8 kanal, 3 geçici merkez) | PASS | sınır: Sun gate after, yerel marj 4.99″, SE marj 5.96″ · kesinleştirilemedi: Sun 1.1/44.6, Earth 2.1/24.6, Neptune 25.4/25.5 |
| B02-a | 2026-11-01T22:07:13Z | 2026-11-02 01:07 | Sun çizgi sınırı öncesi (~5″) | 13/13 | OK (5 kanal, 3 geçici merkez) | PASS | sınır: Sun line before, yerel marj 5.00″, SE marj 4.24″ |
| B02-b | 2026-11-01T22:11:13Z | 2026-11-02 01:11 | Sun çizgi sınırı sonrası (~5″) | 13/13 | OK (5 kanal, 3 geçici merkez) | PASS | sınır: Sun line after, yerel marj 5.00″, SE marj 5.76″ |
| B03-a | 2026-10-19T05:40:24Z | 2026-10-19 08:40 | Moon kapı sınırı öncesi (~5″) | 13/13 | OK (3 kanal, 2 geçici merkez) | PASS | sınır: Moon gate before, yerel marj 4.78″, SE marj 7.37″ · kesinleştirilemedi: Moon 60.6/41.1 |
| B03-b | 2026-10-19T05:40:44Z | 2026-10-19 08:40 | Moon kapı sınırı sonrası (~5″) | 13/13 | OK (3 kanal, 2 geçici merkez) | PASS | sınır: Moon gate after, yerel marj 5.20″, SE marj 2.61″ · kesinleştirilemedi: Moon 41.1/60.6 |
| B04-a | 2026-10-19T00:01:44Z | 2026-10-19 03:01 | Moon çizgi sınırı öncesi (~5″) | 13/13 | OK (5 kanal, 2 geçici merkez) | PASS | sınır: Moon line before, yerel marj 5.21″, SE marj 7.63″ · kesinleştirilemedi: Moon 60.3/60.4 |
| B04-b | 2026-10-19T00:02:05Z | 2026-10-19 03:02 | Moon çizgi sınırı sonrası (~5″) | 13/13 | OK (5 kanal, 2 geçici merkez) | PASS | sınır: Moon line after, yerel marj 5.24″, SE marj 2.82″ · kesinleştirilemedi: Moon 60.4/60.3 |
| B05-a | 2027-03-12T08:06:47Z | 2027-03-12 11:06 | Mercury kapı sınırı öncesi (~5″) | 13/13 | OK (6 kanal, 4 geçici merkez) | PASS | sınır: Mercury gate before, yerel marj 4.99″, SE marj 6.44″ · kesinleştirilemedi: Mercury 49.6/30.1 |
| B05-b | 2027-03-12T08:12:11Z | 2027-03-12 11:12 | Mercury kapı sınırı sonrası (~5″) | 13/13 | OK (6 kanal, 4 geçici merkez) | PASS | sınır: Mercury gate after, yerel marj 5.01″, SE marj 3.56″ · kesinleştirilemedi: Mercury 30.1/49.6 |
| B06-a | 2027-03-07T09:40:08Z | 2027-03-07 12:40 | Mercury çizgi sınırı öncesi (~5″) | 12/13 | OK (2 kanal, 2 geçici merkez) | PASS | sınır: Mercury line before, yerel marj 5.00″, SE marj 5.50″ · Uranus: Roxy 20.3 · yerel 20.2 · SE 20.3 (yerel sınır 0.23″, yerel−SE 0.46″, yerel kesinleştirilemedi) · kesinleştirilemedi: Mercury 49.3/49.4, Uranus 20.2/20.3 |
| B06-b | 2027-03-07T09:50:41Z | 2027-03-07 12:50 | Mercury çizgi sınırı sonrası (~5″) | 13/13 | OK (2 kanal, 2 geçici merkez) | PASS | sınır: Mercury line after, yerel marj 5.00″, SE marj 4.49″ · kesinleştirilemedi: Mercury 49.4/49.3, Uranus 20.3/20.2 |
| B07-a | 2026-12-07T08:07:15Z | 2026-12-07 11:07 | Venus kapı sınırı öncesi (~5″) | 13/13 | OK (2 kanal, 0 geçici merkez) | PASS | sınır: Venus gate before, yerel marj 5.00″, SE marj 2.33″ · kesinleştirilemedi: Venus 50.6/28.1 |
| B07-b | 2026-12-07T08:12:59Z | 2026-12-07 11:12 | Venus kapı sınırı sonrası (~5″) | 13/13 | OK (2 kanal, 0 geçici merkez) | PASS | sınır: Venus gate after, yerel marj 5.00″, SE marj 7.66″ · kesinleştirilemedi: Venus 28.1/50.6 |
| B08-a | 2026-12-01T10:38:20Z | 2026-12-01 13:38 | Venus çizgi sınırı öncesi (~5″) | 13/13 | OK (5 kanal, 3 geçici merkez) | PASS | sınır: Venus line before, yerel marj 5.00″, SE marj 1.68″ · kesinleştirilemedi: Venus 50.2/50.3 |
| B08-b | 2026-12-01T10:45:21Z | 2026-12-01 13:45 | Venus çizgi sınırı sonrası (~5″) | 13/13 | OK (5 kanal, 3 geçici merkez) | PASS | sınır: Venus line after, yerel marj 5.00″, SE marj 8.32″ · kesinleştirilemedi: Venus 50.3/50.2 |
| B09-a | 2026-11-13T04:35:34Z | 2026-11-13 07:35 | Mars kapı sınırı öncesi (~5″) | 13/13 | OK (2 kanal, 1 geçici merkez) | PASS | sınır: Mars gate before, yerel marj 4.99″, SE marj 4.64″ · kesinleştirilemedi: Mars 4.6/29.1 |
| B09-b | 2026-11-13T04:44:17Z | 2026-11-13 07:44 | Mars kapı sınırı sonrası (~5″) | 13/13 | OK (2 kanal, 1 geçici merkez) | PASS | sınır: Mars gate after, yerel marj 5.00″, SE marj 5.35″ · kesinleştirilemedi: Mars 29.1/4.6 |
| B10-a | 2026-11-11T03:58:34Z | 2026-11-11 06:58 | Mars çizgi sınırı öncesi (~5″) | 13/13 | OK (6 kanal, 2 geçici merkez) | PASS | sınır: Mars line before, yerel marj 5.00″, SE marj 4.63″ · kesinleştirilemedi: Mars 4.5/4.6 |
| B10-b | 2026-11-11T04:07:08Z | 2026-11-11 07:07 | Mars çizgi sınırı sonrası (~5″) | 13/13 | OK (6 kanal, 2 geçici merkez) | PASS | sınır: Mars line after, yerel marj 5.00″, SE marj 5.37″ · kesinleştirilemedi: Mars 4.6/4.5, Jupiter 29.1/29.2 |
| B11-a | 2026-11-02T11:14:33Z | 2026-11-02 14:14 | Jupiter kapı sınırı öncesi (~5″) | 13/13 | OK (5 kanal, 3 geçici merkez) | PASS | sınır: Jupiter gate before, yerel marj 5.00″, SE marj 2.94″ · kesinleştirilemedi: Moon 7.6/7.5, Jupiter 4.6/29.1 |
| B11-b | 2026-11-02T11:48:25Z | 2026-11-02 14:48 | Jupiter kapı sınırı sonrası (~5″) | 13/13 | OK (5 kanal, 3 geçici merkez) | PASS | sınır: Jupiter gate after, yerel marj 5.00″, SE marj 7.06″ · kesinleştirilemedi: Jupiter 29.1/4.6 |
| B12-a | 2026-11-11T04:52:26Z | 2026-11-11 07:52 | Jupiter çizgi sınırı öncesi (~5″) | 13/13 | OK (2 kanal, 1 geçici merkez) | PASS | sınır: Jupiter line before, yerel marj 5.00″, SE marj 3.07″ · kesinleştirilemedi: Jupiter 29.1/29.2 |
| B12-b | 2026-11-11T05:34:02Z | 2026-11-11 08:34 | Jupiter çizgi sınırı sonrası (~5″) | 13/13 | OK (2 kanal, 1 geçici merkez) | PASS | sınır: Jupiter line after, yerel marj 5.00″, SE marj 6.93″ · kesinleştirilemedi: Jupiter 29.2/29.1 |
| B13-a | 2027-01-22T03:49:27Z | 2027-01-22 06:49 | Saturn kapı sınırı öncesi (~5″) | 12/13 | OK (4 kanal, 1 geçici merkez) | PASS | sınır: Saturn gate before, yerel marj 5.00″, SE marj 4.47″ · Saturn: Roxy 21.1 · yerel 17.6 · SE 21.1 (yerel sınır 5.00″, yerel−SE 9.47″, yerel kesinleştirilemedi) · kesinleştirilemedi: Saturn 17.6/21.1 |
| B13-b | 2027-01-22T04:45:17Z | 2027-01-22 07:45 | Saturn kapı sınırı sonrası (~5″) | 13/13 | OK (4 kanal, 1 geçici merkez) | PASS | sınır: Saturn gate after, yerel marj 5.00″, SE marj 14.47″ · kesinleştirilemedi: Saturn 21.1/17.6 |
| B14-a | 2026-11-14T03:03:50Z | 2026-11-14 06:03 | Saturn çizgi sınırı öncesi (~5″) | 13/13 | OK (7 kanal, 3 geçici merkez) | PASS | sınır: Saturn line before, yerel marj 5.00″, SE marj 15.23″ · kesinleştirilemedi: Saturn 17.6/17.5 |
| B14-b | 2026-11-14T04:31:19Z | 2026-11-14 07:31 | Saturn çizgi sınırı sonrası (~5″) | 12/13 | OK (7 kanal, 3 geçici merkez) | PASS | sınır: Saturn line after, yerel marj 5.00″, SE marj 5.23″ · Saturn: Roxy 17.6 · yerel 17.5 · SE 17.6 (yerel sınır 5.00″, yerel−SE 10.22″, yerel kesinleştirilemedi) · kesinleştirilemedi: Saturn 17.5/17.6 |
| B15-a | 2027-05-27T01:00:02Z | 2027-05-27 04:00 | Uranus kapı sınırı öncesi (~5″) | 13/13 | OK (3 kanal, 1 geçici merkez) | PASS | sınır: Uranus gate before, yerel marj 5.00″, SE marj 3.07″ · kesinleştirilemedi: Uranus 20.6/16.1 |
| B15-b | 2027-05-27T02:08:17Z | 2027-05-27 05:08 | Uranus kapı sınırı sonrası (~5″) | 13/13 | OK (4 kanal, 2 geçici merkez) | PASS | sınır: Uranus gate after, yerel marj 5.00″, SE marj 7.11″ · kesinleştirilemedi: Uranus 16.1/20.6 |
| B16-a | 2026-11-21T03:32:03Z | 2026-11-21 06:32 | Uranus çizgi sınırı öncesi (~5″) | 13/13 | OK (5 kanal, 3 geçici merkez) | PASS | sınır: Uranus line before, yerel marj 5.00″, SE marj 5.55″ · kesinleştirilemedi: Uranus 20.5/20.4 |
| B16-b | 2026-11-21T05:07:43Z | 2026-11-21 08:07 | Uranus çizgi sınırı sonrası (~5″) | 13/13 | OK (5 kanal, 3 geçici merkez) | PASS | sınır: Uranus line after, yerel marj 5.00″, SE marj 4.45″ · kesinleştirilemedi: Uranus 20.4/20.5 |
| B17-a | 2027-03-19T07:32:59Z | 2027-03-19 10:32 | Neptune kapı sınırı öncesi (~5″) | 13/13 | OK (6 kanal, 2 geçici merkez) | PASS | sınır: Neptune gate before, yerel marj 5.00″, SE marj 16.09″ · kesinleştirilemedi: Neptune 25.6/17.1 |
| B17-b | 2027-03-19T09:18:55Z | 2027-03-19 12:18 | Neptune kapı sınırı sonrası (~5″) | 12/13 | OK (6 kanal, 2 geçici merkez) | PASS | sınır: Neptune gate after, yerel marj 5.00″, SE marj 6.09″ · Neptune: Roxy 25.6 · yerel 17.1 · SE 25.6 (yerel sınır 5.00″, yerel−SE 11.09″, yerel kesinleştirilemedi) · kesinleştirilemedi: Neptune 17.1/25.6 |
| B18-a | 2026-11-05T06:17:49Z | 2026-11-05 09:17 | Neptune çizgi sınırı öncesi (~5″) | 12/13 | OK (3 kanal, 1 geçici merkez) | PASS | sınır: Neptune line before, yerel marj 5.00″, SE marj 7.09″ · Neptune: Roxy 25.4 · yerel 25.5 · SE 25.4 (yerel sınır 5.00″, yerel−SE 12.10″, yerel kesinleştirilemedi) · kesinleştirilemedi: Neptune 25.5/25.4 |
| B18-b | 2026-11-05T09:44:47Z | 2026-11-05 12:44 | Neptune çizgi sınırı sonrası (~5″) | 13/13 | OK (3 kanal, 1 geçici merkez) | PASS | sınır: Neptune line after, yerel marj 5.00″, SE marj 17.09″ · kesinleştirilemedi: Neptune 25.4/25.5 |
| B19-a | 2028-02-24T02:47:14Z | 2028-02-24 05:47 | Pluto kapı sınırı öncesi (~5″) | 13/13 | OK (2 kanal, 1 geçici merkez) | PASS | sınır: Pluto gate before, yerel marj 5.00″, SE marj 3.29″ · kesinleştirilemedi: Pluto 41.6/19.1 |
| B19-b | 2028-02-24T05:06:47Z | 2028-02-24 08:06 | Pluto kapı sınırı sonrası (~5″) | 13/13 | OK (2 kanal, 1 geçici merkez) | PASS | sınır: Pluto gate after, yerel marj 5.00″, SE marj 6.70″ · kesinleştirilemedi: Pluto 19.1/41.6 |
| B20-a | 2026-12-14T16:30:26Z | 2026-12-14 19:30 | Pluto çizgi sınırı öncesi (~5″) | 13/13 | OK (7 kanal, 3 geçici merkez) | PASS | sınır: Pluto line before, yerel marj 5.00″, SE marj 3.69″ · kesinleştirilemedi: Pluto 41.2/41.3 |
| B20-b | 2026-12-14T19:08:25Z | 2026-12-14 22:08 | Pluto çizgi sınırı sonrası (~5″) | 13/13 | OK (6 kanal, 3 geçici merkez) | PASS | sınır: Pluto line after, yerel marj 5.00″, SE marj 6.31″ · kesinleştirilemedi: Pluto 41.3/41.2 |
| B21-a | 2026-11-24T02:43:22Z | 2026-11-24 05:43 | NorthNode kapı sınırı öncesi (~5″) | 13/13 | OK (4 kanal, 2 geçici merkez) | PASS | sınır: NorthNode gate before, yerel marj 5.00″, SE marj 14.87″ · kesinleştirilemedi: NorthNode 30.1/49.6, SouthNode 29.1/4.6 |
| B21-b | 2026-11-24T03:03:25Z | 2026-11-24 06:03 | NorthNode kapı sınırı sonrası (~5″) | 11/13 | OK (4 kanal, 2 geçici merkez) | PASS | sınır: NorthNode gate after, yerel marj 5.00″, SE marj 4.91″ · NorthNode: Roxy 30.1 · yerel 49.6 · SE 30.1 (yerel sınır 5.00″, yerel−SE 9.91″, yerel kesinleştirilemedi) · SouthNode: Roxy 29.1 · yerel 4.6 · SE 29.1 (yerel sınır 5.00″, yerel−SE 9.91″, yerel kesinleştirilemedi) · kesinleştirilemedi: NorthNode 49.6/30.1, SouthNode 4.6/29.1 |
| B22-a | 2026-11-08T12:28:23Z | 2026-11-08 15:28 | NorthNode çizgi sınırı öncesi (~5″) | 13/13 | OK (6 kanal, 2 geçici merkez) | PASS | sınır: NorthNode line before, yerel marj 5.00″, SE marj 8.67″ · kesinleştirilemedi: NorthNode 30.3/30.2, SouthNode 29.3/29.2 |
| B22-b | 2026-11-08T12:46:28Z | 2026-11-08 15:46 | NorthNode çizgi sınırı sonrası (~5″) | 13/13 | OK (6 kanal, 2 geçici merkez) | PASS | sınır: NorthNode line after, yerel marj 5.00″, SE marj 1.31″ · kesinleştirilemedi: NorthNode 30.2/30.3, SouthNode 29.2/29.3 |
| B23-a | 1955-05-05T00:28:26Z | 1955-05-05 02:28 | Moon çizgi sınırı öncesi (~2″) | 13/13 | OK (3 kanal, 1 geçici merkez) | PASS | sınır: Moon line before, yerel marj 2.01″, SE marj 2.13″ · kesinleştirilemedi: Moon 32.2/32.3 |
| B23-b | 1955-05-05T00:28:34Z | 1955-05-05 02:28 | Moon çizgi sınırı sonrası (~2″) | 13/13 | OK (3 kanal, 1 geçici merkez) | PASS | sınır: Moon line after, yerel marj 2.05″, SE marj 1.93″ · kesinleştirilemedi: Moon 32.3/32.2 |
| B24-a | 1988-08-08T01:09:32Z | 1988-08-08 04:09 | Moon çizgi sınırı öncesi (~2″) | 13/13 | OK (3 kanal, 1 geçici merkez) | PASS | sınır: Moon line before, yerel marj 2.07″, SE marj 1.89″ · kesinleştirilemedi: Moon 12.3/12.4 |
| B24-b | 1988-08-08T01:09:40Z | 1988-08-08 04:09 | Moon çizgi sınırı sonrası (~2″) | 13/13 | OK (3 kanal, 1 geçici merkez) | PASS | sınır: Moon line after, yerel marj 2.13″, SE marj 2.31″ · kesinleştirilemedi: Moon 12.4/12.3 |
| B25-a | 2041-04-04T00:49:00Z | 2041-04-04 03:49 | Moon çizgi sınırı öncesi (~2″) | 13/13 | OK (5 kanal, 2 geçici merkez) | PASS | sınır: Moon line before, yerel marj 2.09″, SE marj 9.40″ · kesinleştirilemedi: Moon 23.5/23.6 |
| B25-b | 2041-04-04T00:49:07Z | 2041-04-04 03:49 | Moon çizgi sınırı sonrası (~2″) | 12/13 | OK (5 kanal, 2 geçici merkez) | PASS | sınır: Moon line after, yerel marj 1.84″, SE marj 5.47″ · Moon: Roxy 23.5 · yerel 23.6 · SE 23.5 (yerel sınır 1.84″, yerel−SE 7.32″, yerel kesinleştirilemedi) · kesinleştirilemedi: Moon 23.6/23.5 |
| B26-a | 2077-07-07T00:27:23Z | 2077-07-07 03:27 | Moon çizgi sınırı öncesi (~2″) | 13/13 | OK (4 kanal, 3 geçici merkez) | PASS | sınır: Moon line before, yerel marj 2.19″, SE marj 41.27″ · kesinleştirilemedi: Moon 60.2/60.3 |
| B26-b | 2077-07-07T00:27:30Z | 2077-07-07 03:27 | Moon çizgi sınırı sonrası (~2″) | 12/13 | OK (4 kanal, 3 geçici merkez) | PASS | sınır: Moon line after, yerel marj 1.96″, SE marj 37.12″ · Moon: Roxy 60.2 · yerel 60.3 · SE 60.2 (yerel sınır 1.96″, yerel−SE 39.08″, yerel kesinleştirilemedi) · kesinleştirilemedi: Moon 60.3/60.2 |

## Yerel motor hassasiyeti — 100 000 an (Swiss Ephemeris, ücretsiz)

Belirsizlik payı = ölçülen en büyük fark × 1,5 (`transitUncertaintyArcsec`). Örnek dışı 50 000 anlık ikinci taramada (farklı anlar):

```
GÖSTERİLEN SONUÇ: kesin aktivasyon 641517, kesin ama YANLIŞ 0; kesinleştirilemedi 8483 (gerçek adaylarda değil: 0); belirsizlik içeren an 6830/50000 (%13.7); kanal iddiası yanlış 0; merkez iddiası yanlış 0
```

100000 an (1900–2100). |yerel − Swiss Ephemeris| yay-saniye

| cisim | dönem | p50 | p99 | max |
|---|---|---|---|---|
| Sun | 1900–1949 | 0.40 | 1.56 | 2.08 |
| Sun | 1950–1999 | 0.41 | 1.59 | 2.24 |
| Sun | 2000–2030 | 0.40 | 1.66 | 2.33 |
| Sun | 2031–2060 | 0.54 | 2.27 | 2.72 |
| Sun | 2061–2100 | 2.69 | 5.51 | 6.76 |
| Moon | 1900–1949 | 1.19 | 3.27 | 5.37 |
| Moon | 1950–1999 | 0.62 | 2.40 | 4.84 |
| Moon | 2000–2030 | 0.89 | 4.97 | 6.38 |
| Moon | 2031–2060 | 8.30 | 22.25 | 25.31 |
| Moon | 2061–2100 | 40.52 | 66.75 | 74.22 |
| Mercury | 1900–1949 | 1.66 | 7.58 | 11.92 |
| Mercury | 1950–1999 | 1.53 | 7.87 | 12.76 |
| Mercury | 2000–2030 | 1.59 | 7.33 | 11.10 |
| Mercury | 2031–2060 | 1.72 | 7.47 | 11.36 |
| Mercury | 2061–2100 | 3.88 | 11.56 | 17.60 |
| Venus | 1900–1949 | 1.11 | 12.06 | 19.11 |
| Venus | 1950–1999 | 0.96 | 11.67 | 19.25 |
| Venus | 2000–2030 | 1.02 | 13.39 | 20.63 |
| Venus | 2031–2060 | 1.13 | 11.33 | 15.22 |
| Venus | 2061–2100 | 3.40 | 11.36 | 15.43 |
| Mars | 1900–1949 | 0.97 | 5.98 | 9.81 |
| Mars | 1950–1999 | 0.84 | 8.54 | 12.89 |
| Mars | 2000–2030 | 0.82 | 7.51 | 11.73 |
| Mars | 2031–2060 | 1.10 | 10.11 | 12.55 |
| Mars | 2061–2100 | 2.08 | 8.94 | 12.29 |
| Jupiter | 1900–1949 | 1.99 | 7.77 | 9.97 |
| Jupiter | 1950–1999 | 2.68 | 7.51 | 8.22 |
| Jupiter | 2000–2030 | 2.99 | 9.68 | 10.25 |
| Jupiter | 2031–2060 | 1.90 | 7.75 | 8.62 |
| Jupiter | 2061–2100 | 2.50 | 8.17 | 9.90 |
| Saturn | 1900–1949 | 3.58 | 9.93 | 10.76 |
| Saturn | 1950–1999 | 1.78 | 10.14 | 12.30 |
| Saturn | 2000–2030 | 2.31 | 12.11 | 12.97 |
| Saturn | 2031–2060 | 3.05 | 8.09 | 8.59 |
| Saturn | 2061–2100 | 3.84 | 8.95 | 9.35 |
| Uranus | 1900–1949 | 2.82 | 6.76 | 7.61 |
| Uranus | 1950–1999 | 3.87 | 11.30 | 12.15 |
| Uranus | 2000–2030 | 2.16 | 11.28 | 11.57 |
| Uranus | 2031–2060 | 3.27 | 7.43 | 7.77 |
| Uranus | 2061–2100 | 1.27 | 3.91 | 6.43 |
| Neptune | 1900–1949 | 8.07 | 14.37 | 15.15 |
| Neptune | 1950–1999 | 10.74 | 17.67 | 18.06 |
| Neptune | 2000–2030 | 14.49 | 18.24 | 18.50 |
| Neptune | 2031–2060 | 2.04 | 6.83 | 7.02 |
| Neptune | 2061–2100 | 12.64 | 18.63 | 19.02 |
| Pluto | 1900–1949 | 1.58 | 3.32 | 3.50 |
| Pluto | 1950–1999 | 2.13 | 3.21 | 3.40 |
| Pluto | 2000–2030 | 0.49 | 2.08 | 2.35 |
| Pluto | 2031–2060 | 4.25 | 6.09 | 6.24 |
| Pluto | 2061–2100 | 6.28 | 8.34 | 8.70 |
| NorthNode | 1900–1949 | 2.37 | 9.50 | 15.66 |
| NorthNode | 1950–1999 | 3.67 | 12.43 | 19.96 |
| NorthNode | 2000–2030 | 5.21 | 13.25 | 20.82 |
| NorthNode | 2031–2060 | 7.21 | 15.12 | 21.83 |
| NorthNode | 2061–2100 | 9.28 | 17.82 | 23.97 |

Kapı.çizgi uyuşmazlığı (yerel ≠ SE), cisim başına: {"Saturn":78,"Neptune":278,"Venus":52,"Jupiter":92,"Moon":300,"Pluto":102,"Mercury":68,"NorthNode":163,"Mars":46,"Uranus":90,"Sun":29}
Cisim başına genel max: {"Sun":6.76,"Moon":74.22,"Mercury":17.6,"Venus":20.63,"Mars":12.89,"Jupiter":10.25,"Saturn":12.97,"Uranus":12.15,"Neptune":19.02,"Pluto":8.7,"NorthNode":23.97}

GÖSTERİLEN SONUÇ: kesin aktivasyon 1283011, kesin ama YANLIŞ 0; kesinleştirilemedi 16989 (gerçek adaylarda değil: 0); belirsizlik içeren an 13713/100000 (%13.7); kanal iddiası yanlış 0; merkez iddiası yanlış 0

## Gerçek ücretli Roxy çağrıları

Defter: `scripts/hd-transit/fixtures/roxy-live-ledger.jsonl` — 125 çağrı (sözleşme 2 + natal bodygraph 3 + transit 120).
