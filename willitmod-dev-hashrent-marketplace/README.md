# HASHRENT – Umbrel Community App

HASHRENT 0.3.0 ist ein SHA-256-ASICBoost-Marktplatz-Prototyp mit Live-Marktdaten von MiningRigRentals (MRR) API v2.

## Umfang in 0.3.0

- Ausschließlich der MRR-Algorithmus `sha256ab` (SHA-256 ASICBoost).
- Serverseitiger Abruf und 60-Sekunden-Cache für Rig-Angebote.
- HMAC-SHA1-Authentifizierung der MRR-API v2; API-Key und Secret bleiben serverseitig.
- Angebotsübersicht mit Hashrate, BTC-Preis, Region und Mietfenster.
- Preisrechner für 1–100 PH/s und mindestens 3 Stunden.
- Automatische, preisorientierte Kombination verfügbarer Rigs.
- Fester HASHRENT-Aufschlag von 5 %.
- Eigene API-Einstellungsseite mit Verbindungstest für MRR.
- API-Key und Secret werden mit AES-256-GCM verschlüsselt im persistenten App-Datenverzeichnis gespeichert; der Schlüssel liegt separat mit Dateirechten 0600.
- Zugangsdaten werden nie an den Browser zurückgegeben oder in Logs geschrieben.
- Keine echten Mietaufträge, Poolprofile, Wallet-Operationen oder Zahlungen.

## MRR API einrichten

Die MRR API v2 dokumentiert HMAC-signierte Requests und den Endpunkt `GET /rig`. HASHRENT fragt `/rig?type=sha256ab&currency=BTC&count=100&offset=0&orderby=price&orderdir=asc` ab. MRR-Zugangsdaten sind erforderlich.

Setze auf dem Umbrel-Host die folgenden Variablen für den App-Container:

- `MRR_API_KEY`: persönlicher MiningRigRentals API-Key
- `MRR_API_SECRET`: persönliches API-Secret

Die Werte dürfen niemals in Git committed oder im Browser ausgegeben werden. Alternativ können die Zugangsdaten nach dem Start unter `/settings` eingegeben werden. Die App prüft die MRR-Verbindung vor dem Speichern und verschlüsselt die Zugangsdaten lokal im persistenten App-Datenverzeichnis. Der Schlüssel zur Verschlüsselung wird separat mit Dateirechten 0600 abgelegt. Sichere das gesamte App-Datenverzeichnis inklusive `config.key`; ohne diesen Schlüssel können gespeicherte Zugangsdaten nach einer Wiederherstellung nicht entschlüsselt werden. Die Einstellungsseite zeigt nur den Verbindungsstatus und gibt die gespeicherten Schlüssel nicht wieder aus. Ohne Zugangsdaten zeigt die App einen klaren Konfigurationshinweis statt erfundener Demo-Livepreise.

## Kalkulation

- Der API-Preis wird auf BTC/PH/Tag normalisiert.
- Der 5-%-Aufschlag wird auf den kalkulierten Basispreis angewendet.
- Kosten = zugeteilte PH/s × BTC/PH/Tag × Mietstunden / 24.
- Die Rig-Auswahl berücksichtigt den verfügbaren Status sowie minhours/maxhours.
- Falls die gewünschte Hashrate nicht vollständig verfügbar ist, wird das fehlende Volumen ausgewiesen.

Die Kalkulation ist unverbindlich. MRR-Rig-Reservierung und echte Miete sind in 0.3.0 absichtlich nicht implementiert.

## Lokaler Test

```sh
npm start
curl http://localhost:3000/health
curl http://localhost:3000/api/market
```

## Veröffentlichung

Der Workflow `.github/workflows/hashrent-release.yml` baut das HASHRENT-Container-Image und veröffentlicht es in der GitHub Container Registry (GHCR).

- Manuell: GitHub → Actions → **HASHRENT container release** → **Run workflow**; als Version zum Beispiel `0.3.0` eintragen.
- Automatisch: Einen Git-Tag im Format `hashrent-vX.Y.Z` pushen, zum Beispiel `hashrent-v0.3.0`.
- Veröffentlicht werden `ghcr.io/gonzo19844/hashrent:VERSION` und `ghcr.io/gonzo19844/hashrent:latest`.

**Wichtig:** Nach dem ersten erfolgreichen Push muss das Paket `hashrent` unter GitHub → Packages auf **Public** gestellt werden, damit Umbrel das Image ohne GHCR-Anmeldung laden kann. Vor dem produktiven Mietbetrieb müssen MRR-API-Zugriff, tatsächliche API-Antworten und Preisnormalisierung mit einem berechtigten MRR-Konto getestet werden.

## Quellen

- MRR API v2: https://www.miningrigrentals.com/apidocv2
- SHA256 Asicboost Markt: https://www.miningrigrentals.com/rigs/sha256ab
