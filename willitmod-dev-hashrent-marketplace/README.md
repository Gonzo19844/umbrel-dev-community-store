# HASHRENT – Umbrel Community App

HASHRENT 0.4.0 verbindet den SHA-256-ASICBoost-Marktplatz mit der MiningRigRentals API v2 und bietet eine ausdrücklich bestätigungspflichtige Einzel-Rig-Miete.

## Funktionen

- Ausschließlich MRR-Algorithmus `sha256ab` (SHA-256 ASICBoost).
- Live-Angebote mit 60-Sekunden-Cache und serverseitiger HMAC-SHA1-Authentifizierung.
- Preisrechner für 1–100 PH/s, mindestens 3 Stunden und 5 % angezeigtem HASHRENT-Aufschlag.
- MRR-Kontoprüfung über `GET /whoami`, einschließlich Mietberechtigung.
- Abruf vorhandener SHA-256-ASICBoost-Poolprofile; Pool-Zugangsdaten werden nicht an den Browser gegeben.
- Aktive Mieten werden über `GET /rental` angezeigt.
- Einzel-Rig-Buchung über `PUT /rental` nach expliziter Bestätigung. HASHRENT prüft vor dem Kauf MRR-Berechtigung, Poolprofil, Algorithmus, aktuelle Rig-Verfügbarkeit, Preis und Mietdauer erneut.
- API-Key und Secret werden mit AES-256-GCM im persistenten App-Datenverzeichnis gespeichert.

## Wichtige Hinweise zur Buchung

MRR erstellt eine Miete pro Rig. HASHRENT führt in 0.4.0 absichtlich keine automatische Mehrfachbuchung über mehrere Rigs durch, weil mehrere externe Buchungen nicht atomar sind und eine teilweise erfolgreiche Bestellung entstehen könnte. Wähle deshalb ein einzelnes Rig, dessen komplette Hashrate zu deinem Bedarf passt.

Die MRR-Miete wird direkt über das verbundene MiningRigRentals-Konto bezahlt. MRR belastet das dortige Guthaben gemäß dem aktuellen Rig-Preis. Der 5-%-HASHRENT-Aufschlag wird in dieser Version nur angezeigt und **nicht separat eingezogen**. Es gibt noch keine Kundenkonten, externe Zahlungsabwicklung oder automatische Auszahlung der Marge. Die ausgewiesene Kalkulation ist daher kein Zahlungsbeleg und HASHRENT nimmt keine Kundenzahlung entgegen.

Ein API-Timeout während der Erstellung kann bedeuten, dass MRR die Miete bereits angelegt hat, die Antwort HASHRENT aber nicht erreicht hat. In diesem Fall zuerst die MRR-Mietübersicht prüfen und nicht sofort erneut buchen.

## MiningRigRentals verbinden

Unter `/settings` API-Key und API-Secret hinterlegen. HASHRENT prüft die Verbindung und speichert die Zugangsdaten verschlüsselt. Die Werte niemals in Git committen oder im Browser ausgeben. Das persistente Datenverzeichnis inklusive `config.key` sichern; ohne diesen Schlüssel kann HASHRENT die verschlüsselten Zugangsdaten nach einer Wiederherstellung nicht entschlüsseln.

Für echte Buchungen benötigt der API-Key die MRR-Berechtigung `rent=yes` sowie mindestens ein Poolprofil mit Algorithmus `sha256ab`. Das Poolprofil muss in deinem MRR-Konto bereits eingerichtet sein.

## Veröffentlichung

Der Workflow `.github/workflows/hashrent-release.yml` baut `ghcr.io/gonzo19844/hashrent:VERSION` und `:latest`.

- Manuell: GitHub → Actions → **HASHRENT container release** → **Run workflow**, Version `0.4.0`.
- Automatisch: Tag `hashrent-v0.4.0` pushen.
- Das GHCR-Paket muss öffentlich sein, damit Umbrel es ohne GHCR-Anmeldung laden kann.

## Quellen

- MRR API v2: https://www.miningrigrentals.com/apidocv2
- SHA256 ASICBoost-Markt: https://www.miningrigrentals.com/rigs/sha256ab
