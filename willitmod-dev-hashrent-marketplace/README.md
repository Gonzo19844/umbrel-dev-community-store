# HASHRENT – Umbrel Community App

HASHRENT 0.5.5 entfernt RPI vollständig aus der Auswahl und Bewertung von MiningRigRentals-Angeboten. Die App stellt einen eigenen HASHRENT-Shop mit administrierbaren Angeboten und NOWPayments-Checkout bereit. MiningRigRentals wird ausschließlich serverseitig als Beschaffungsanbieter verwendet.

## Öffentlicher Shop

- Kunden sehen ausschließlich HASHRENT-Angebotsnamen, Beschreibungen und Hashrate-/Laufzeitgrenzen.
- MRR-Rig-Namen, IDs, URLs, Eigentümer, Einkaufs- und Mietpreise werden nicht über öffentliche Endpunkte ausgegeben.
- Öffentliche alte MRR-Markt-, Konto- und Miet-Endpunkte sind deaktiviert.
- Ausschließlich SHA-256 ASICBoost (sha256ab), Hashrate gemäß den administrierten Angeboten, mindestens 3 Mietstunden.
- Die Angebote werden unter /admin verwaltet.

## Preis und interner Verdienst

Der Kundenpreis wird serverseitig aus den live verfügbaren MRR-Einkaufskosten ermittelt. HASHRENT addiert intern 5 % auf die MRR-Kosten. Kunden sehen weder den MRR-Einkaufspreis noch den Aufschlag oder die Marge. Die Admin-Bestellübersicht enthält die internen Einkaufskosten und den internen 5-%-Aufschlag.

## Zahlungsablauf

- NOWPayments-Rechnung in EUR; Kunden wählen BTC, LTC, DOGE oder BCH.
- IPN-Callbacks werden anhand des NOWPayments-Signatur-Headers und HMAC-SHA512 geprüft.
- Nur eine gültig signierte Meldung mit Status finished löst die Beschaffung aus.
- Wiederholte Callbacks lösen keine doppelte Provisionierung aus.
- Bei einer teilweise fehlgeschlagenen MRR-Beschaffung wird die Bestellung als provisioning_attention markiert und muss administrativ geprüft werden.

Wichtig: Für echte Zahlungen muss die Umbrel-App über eine öffentlich erreichbare HTTPS-Adresse verfügen. Diese Adresse wird im Adminbereich als Callback-Basisadresse eingetragen und muss auf die HASHRENT-App zeigen. NOWPayments muss diese URL aus dem Internet erreichen können.

## Admin-Ersteinrichtung

1. HASHRENT öffnen und /admin aufrufen.
2. Beim ersten Start ein starkes Admin-Passwort mit mindestens 14 Zeichen festlegen.
3. MRR API-Key und API-Secret hinterlegen.
4. Das SHA-256-ASICBoost-Poolprofil für die Bereitstellung auswählen.
5. NOWPayments API-Key und IPN Secret hinterlegen.
6. Öffentliche HTTPS-Basisadresse eintragen.
7. Eigene HASHRENT-Angebote anlegen und veröffentlichen.

Zugangsdaten werden gemeinsam mit dem bestehenden MRR-Schlüsselmaterial AES-256-GCM-verschlüsselt im persistenten App-Datenverzeichnis gespeichert. Das Verzeichnis inklusive config.key muss gesichert werden.

## Technische Hinweise

- Bestellungen und Angebotskonfigurationen liegen als Dateien im persistenten App-Datenverzeichnis.
- Das Admin-Login verwendet einen scrypt-Passworthash und ein HttpOnly-/SameSite-Session-Cookie. Nach einem App-Neustart ist eine erneute Anmeldung erforderlich.
- MRR-Beschaffung erfolgt nach Zahlung anhand der zum Zeitpunkt der Preisermittlung ausgewählten Rigs. Wenn eines davon vor der Bereitstellung nicht mehr verfügbar ist, wird die Bestellung zur manuellen Prüfung markiert.
- MRR erstellt pro Rig einen separaten Mietauftrag. Bei einem Teilerfolg werden bereits erstellte MRR-Miet-IDs intern protokolliert; eine automatische Rückabwicklung kann MRR-seitig nicht garantiert werden.

## Live-Mining-Dashboard\n\n- Geschützter Admin-Bereich zeigt HASHRENT-Aufträge und die dazugehörigen gemieteten MRR-Rentals.\n- Durchschnittliche und zuletzt gemessene Hashrate sowie Leistung gegenüber der beworbenen Hashrate werden aus MRR-Rental- und Graph-Daten gelesen.\n- 24-Stunden-Verlauf wird serverseitig geladen; das Dashboard aktualisiert sich alle 60 Sekunden.\n- Es werden keine Mining-Werte simuliert. MRR-Datenfehler werden sichtbar markiert.\n- Aus API-Limit- und Lastschutz werden maximal 20 Rental-Datensätze pro Aktualisierung abgefragt.\n\n## Veröffentlichung

Der Workflow .github/workflows/hashrent-release.yml baut ghcr.io/gonzo19844/hashrent:VERSION und :latest.

- Manuell: GitHub → Actions → HASHRENT container release → Run workflow, Version 0.5.5.
- Automatisch: Änderungen an HASHRENT auf main bauen das Image anhand der package.json-Version (0.5.5).
- Das GHCR-Paket muss öffentlich sein, damit Umbrel es ohne GHCR-Anmeldung laden kann.

## Quellen

- MRR API v2: https://www.miningrigrentals.com/apidocv2
- NOWPayments API: https://nowpayments.io
- NOWPayments IPN-Signatur: https://nowpayments.zendesk.com/hc/en-us/articles/21395546303389-IPN-and-how-to-setup
