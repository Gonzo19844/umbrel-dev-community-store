# HASHRENT – Umbrel Demo-App

Diese App ist eine Demo-Oberfläche mit Beispielangeboten und einem Festaufschlag-Rechner.
Sie erzeugt keine echten MiningRigRentals-Aufträge und verarbeitet keine Zahlungen.

## Veröffentlichung
Das Container-Image wird über den GitHub Actions Workflow im Repository gebaut.
Dafür den Tag `hashrent-v0.1.0` pushen. Anschließend das GHCR-Paket
`ghcr.io/gonzo19844/hashrent` in GitHub Packages auf **Public** stellen.

In umbrelOS den Community Store `Gonzo19844/umbrel-dev-community-store`
hinzufügen und HASHRENT installieren.

Vor Livebetrieb sind schriftliche MRR-Freigabe für die externe Weitervermietung,
Authentifizierung, sichere API-Anbindung und echte Zahlungs-/Auftragsprozesse nötig.
