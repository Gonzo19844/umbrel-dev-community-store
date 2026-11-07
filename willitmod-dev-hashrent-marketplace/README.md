# HASHRENT – Umbrel Community App

HASHRENT zeigt Marktangebote für **SHA256 Asicboost** von MiningRigRentals (MRR), kombiniert passende Rigs für eine gewünschte Hashrate und berechnet den Kundenpreis mit 5 % Aufschlag.

## Aktueller Funktionsumfang

- Ausschließlich SHA256 Asicboost (MRR-Algorithmuskennung: \`sha256ab\`)
- Serverseitiger Abruf der MRR-Rigangebote in BTC
- Zwischenspeicherung der Marktdaten für 60 Sekunden
- Auswahl von 1 bis 100 PH/s
- Mietdauer ab 3 Stunden; die maximal mögliche Dauer wird aus den ausgewählten Rigs abgeleitet
- Automatische Kombination der günstigsten passenden Rigs
- Preisberechnung anhand der gesamten Hashrate der tatsächlich ausgewählten Rigs
- Fester HASHRENT-Aufschlag von 5 %
- Keine API-Schlüssel im Frontend

## MRR-API

Die App fragt die API v2 unter \`https://www.miningrigrentals.com/api/v2\` mit dem Algorithmus \`sha256ab\` ab. MRR dokumentiert öffentliche Marktdaten und private, authentifizierte Kontofunktionen. Falls der Rig-Endpunkt für das verwendete Konto eine Anmeldung verlangt, können die folgenden Variablen ausschließlich serverseitig gesetzt werden:

- \`MRR_API_KEY\`
- \`MRR_API_SECRET\`
- optional \`MRR_API_BASE\`

Die App signiert authentifizierte GET-Anfragen serverseitig. Zugangsdaten niemals in \`public/\`, in GitHub-Dateien oder im Browser hinterlegen. API-Daten werden 60 Sekunden gecacht; bei kurzzeitigen Fehlern kann ein höchstens 10 Minuten alter Cache als veraltet markiert zurückgegeben werden.

## Wichtige Grenzen dieser Version

Diese Version ist ein **Markt- und Preisprototyp**. Sie zeigt echte, zum Zeitpunkt des Abrufs verfügbare MRR-Angebote, löst aber noch keine MRR-Mietaufträge aus und verarbeitet keine Kundenzahlungen. Der Preis ist unverbindlich und kann sich ändern, bevor ein Auftrag tatsächlich ausgeführt wird.

Vor dem Livebetrieb mit echten Kunden müssen insbesondere MRR-Berechtigungen und Nutzungsbedingungen für den geplanten Weiterverkauf geprüft, eine sichere Kunden-/Bestellverwaltung, Zahlungsabwicklung, erneute Verfügbarkeitsprüfung unmittelbar vor der Bestellung, Fehler-/Stornierungsbehandlung und ein getesteter Mietprozess ergänzt werden.

## Lokale Entwicklung

\`\`\`bash
npm start
\`\`\`

Die App lauscht standardmäßig auf Port 3000. Status: \`/health\`; Marktdaten: \`/api/market\`; Preisangebot: \`/api/quote?hashratePH=1&hours=3\`.

## Umbrel-Veröffentlichung

Das Container-Image wird über den GitHub Actions Workflow im Repository gebaut. Für ein Release müssen Image-Tag, \`umbrel-app.yml\` und der Community-Store-Eintrag gemeinsam aktualisiert werden.