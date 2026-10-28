"""Knopf „Zahlen holen“: läuft bei GitHub (.github/workflows/aktualisieren.yml), nicht auf dem eigenen Rechner.

Entschlüsselt daten.json, holt frische Zahlen über werkzeuge/quellen.py und schreibt daten.json verschlüsselt zurück.
Alles kostenlos: Instagram über die offizielle API (live), TikTok und YouTube über die Buffer-API
(Buffer aktualisiert die Zahlen einmal am Tag), Follower von den Profilseiten.
Klappt eine Plattform nicht, bleiben ihre alten Zahlen stehen.
Produktion, Zuordnung der Videonummern und manuelle Werte kommen unverändert aus der letzten Montags-Auswertung.

Braucht die Umgebungsvariablen DASHBOARD_PASSWORT, IG_ACCESS_TOKEN, BUFFER_API_KEY.
Gibt bewusst keine Zahlen aus, weil die Protokolle des öffentlichen Repos lesbar sind.
"""
import datetime as dt
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # python -I nimmt den Skriptordner nicht mit auf
import quellen  # noqa: E402
from logik import aufbereiten, doppelte_aufloesen, video_eintrag  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
KRYPTO = str(REPO / "werkzeuge" / "krypto.mjs")
JETZT = dt.datetime.now()
HEUTE = JETZT.date()


def main():
    env = dict(os.environ)
    r = subprocess.run(["node", KRYPTO, "entschluesseln"], stdin=open(REPO / "daten.json", "rb"), capture_output=True, env=env)
    if r.returncode != 0:
        sys.exit("daten.json ließ sich nicht entschlüsseln. Stimmt das Secret DASHBOARD_PASSWORT?")
    alt = json.loads(r.stdout)
    zu = alt.get("zuordnung", {"themen": {}, "datum_zu_nr": {}})

    videos = {p: alt["plattformen"][p]["videos"] for p in ("Instagram", "TikTok", "YouTube")}
    follower = {p: [f for f in alt["plattformen"][p]["follower"] if f["datum"] != HEUTE.isoformat()] for p in videos}
    verlauf = {v["datum"]: {k: w for k, w in v.items() if k != "datum"} for v in alt["verlauf_views"]}
    heute_views = {}
    ergebnis = {}

    try:
        bf = quellen.buffer(env["BUFFER_API_KEY"])
    except Exception as e:  # Schlüssel fehlt oder Buffer nicht erreichbar
        bf = e

    def holen(p):
        if p == "Instagram":
            return quellen.instagram(env["IG_ACCESS_TOKEN"])
        if isinstance(bf, Exception):
            raise bf
        anzahl = None
        try:  # Profilseiten blocken Server manchmal, dann bleibt die letzte Followerzahl stehen
            anzahl = quellen.tiktok_follower() if p == "TikTok" else quellen.youtube_abos()
        except Exception:
            pass
        return bf.get(p, []), anzahl

    for p in ("Instagram", "TikTok", "YouTube"):
        try:
            zeilen, anzahl = holen(p)
        except Exception as e:  # z. B. Token abgelaufen
            ergebnis[p] = f"nicht geholt ({type(e).__name__})"
            continue
        dauer = {v["link"]: v["dauer_s"] for v in videos[p]}  # die Instagram-API kennt die Videolänge nicht
        neu = []
        for z in zeilen:
            z["plattform"] = p
            z["like_rate_%"] = round(100 * z["likes"] / z["views"], 1) if z.get("likes") is not None and z.get("views") else None
            z["dauer_s"] = z["dauer_s"] or dauer.get(z["link"])
            neu.append(video_eintrag(z, p, zu["themen"], zu["datum_zu_nr"]))
        if neu:
            videos[p] = doppelte_aufloesen(neu, zu["themen"])
            heute_views[p] = int(sum(v["views"] or 0 for v in neu))
        if anzahl is not None:
            follower[p].append({"datum": HEUTE.isoformat(), "wert": int(anzahl)})
        ergebnis[p] = "aktuell" if neu else "keine Videos gefunden"
    if heute_views:
        verlauf[HEUTE.isoformat()] = {**verlauf.get(HEUTE.isoformat(), {}), **heute_views}

    daten = aufbereiten(videos, follower, verlauf, alt.get("einstellungen", {}), alt["produktion"], HEUTE,
                        HEUTE.isoformat() if heute_views else alt.get("abruf"), JETZT.strftime("%H:%M") if heute_views else alt.get("abruf_zeit"))
    for k in ("zuordnung", "einstellungen", "knopf_token"):
        daten[k] = alt.get(k)
    daten["knopf_ergebnis"] = ergebnis

    enc = subprocess.run(["node", KRYPTO, "verschluesseln"], input=json.dumps(daten, ensure_ascii=False).encode(), capture_output=True, env=env)
    if enc.returncode != 0:
        sys.exit("Verschlüsseln fehlgeschlagen.")
    (REPO / "daten.json").write_bytes(enc.stdout)
    for p, e in ergebnis.items():
        print(f"{p}: {e}")


if __name__ == "__main__":
    main()
