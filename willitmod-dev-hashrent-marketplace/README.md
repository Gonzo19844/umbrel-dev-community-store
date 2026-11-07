# HASHRENT – Umbrel Community App

HASHRENT 0.2.0 ist ein SHA-256-ASICBoost-Marktplatz-Prototyp mit Live-Marktdaten von MiningRigRentals (MRR) API v2.

## Umfang in 0.2.0

- Ausschließlich der MRR-Algorithmus `sha256ab` (SHA-256 ASICBoost).
- Serverseitiger Abruf und 60-Sekunden-Cache für Rig-Angebote.
- HMAC-SHA1-Authentifizierung der MRR-API v2; API-Key und Secret bleiben serverseitig.
- Angebotsübersicht mit Hashrate, BTC-Preis, Region und Mietfenster.
- Preisrechner für 1–100 PH/s und 3–720 Stunden.
- Automatische, preisorientierte Kombination verfügbarer Rigs.
- Fester HASHRENT-Aufschlag von 5 %.
- Keine echten Mietaufträge, Poolprofile, Wallet-Operationen oder Zahlungen.

## MRR API einrichten

Die MRR API v2 dokumentiert HMAC-signierte Requests und den Endpunkt `GET /rig`. HASHRENT fragt `/rig?type=sha256ab&currency=BTC&start=0&limit=100` ab. MRR-Zugangsdaten sind erforderlich.

Setze auf dem Umbrel-Host die folgenden Variablen für den App-Container:

- `MRR_API_KEY`: persönlicher MiningRigRentals API-Key
- `MRR_API_SECRET`: persönliches API-Secret

Die Werte dürfen niemals in Git committed oder im Browser ausgegeben werden. In dieser Entwicklungsfassung sind die Variablen als Compose-Umgebungsvariablen vorbereitet. Ohne Zugangsdaten zeigt die App einen klaren Konfigurationshinweis statt erfundener Demo-Livepreise.

## Kalkulation

- Der API-Preis wird auf BTC/PH/Tag normalisiert.
- Der 5-%-Aufschlag wird auf den kalkulierten Basispreis angewendet.
- Kosten = zugeteilte PH/s × BTC/PH/Tag × Mietstunden / 24.
- Die Rig-Auswahl berücksichtigt den verfügbaren Status sowie minhours/maxhours.
- Falls die gewünschte Hashrate nicht vollständig verfügbar ist, wird das fehlende Volumen ausgewiesen.

Die Kalkulation ist unverbindlich. MRR-Rig-Reservierung und echte Miete sind in 0.2.0 absichtlich nicht implementiert.

## Lokaler Test

```sh
npm start
curl http://localhost:3000/health
curl http://localhost:3000/api/market
```

## Veröffentlichung

Der Build-Workflow erzeugt das Container-Image `ghcr.io/gonzo19844/hashrent:0.2.0`. Vor dem Release müssen API-Zugriff, tatsächliche MRR-Antworten, SHA256AB-Filterung und die Preisnormalisierung mit einem berechtigten MRR-Konto getestet werden.

## Quellen

- MRR API v2: https://www.miningrigrentals.com/apidocv2
- SHA256 Asicboost Markt: https://www.miningrigrentals.com/rigs/sha256ab
