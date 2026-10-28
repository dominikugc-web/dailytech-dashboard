# Daily-Tech Zahlen

Privates Dashboard. Die Zahlen in `daten.json` sind verschlüsselt (AES-256-GCM, Schlüssel per PBKDF2) und nur mit Passwort lesbar.

- Montags baut `tools/dashboard_bauen.py` im Drive-Ordner `Reichweite-mit-System` die Daten neu.
- Der Knopf „Zahlen holen“ startet `.github/workflows/aktualisieren.yml`, das `werkzeuge/aktualisieren.py` ausführt.
- Gemeinsame Rechnung: `werkzeuge/logik.py`, Verschlüsselung: `werkzeuge/krypto.mjs`.
- Secrets für den Knopf: `DASHBOARD_PASSWORT`, `IG_ACCESS_TOKEN`, `APIFY_TOKEN`.
