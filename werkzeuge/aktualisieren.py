"""Knopf „Zahlen holen“: läuft bei GitHub (.github/workflows/aktualisieren.yml), nicht auf dem eigenen Rechner.

Entschlüsselt daten.json, holt frische Zahlen und schreibt daten.json verschlüsselt zurück.
- Instagram über die offizielle API (kostenlos): Views, Likes, Kommentare, Reichweite, Saves, Shares, Watch Time, Follower
- TikTok über Apify (etwa 5 Cent pro Lauf, Grenze 0,15 $)
- YouTube über yt-dlp und die Kanalseite (kostenlos; GitHub-Server werden von YouTube manchmal blockiert)
Klappt eine Plattform nicht, bleiben ihre alten Zahlen stehen.
Produktion, Zuordnung der Videonummern und manuelle Werte kommen unverändert aus der letzten Montags-Auswertung.

Braucht die Umgebungsvariablen DASHBOARD_PASSWORT, IG_ACCESS_TOKEN, APIFY_TOKEN.
Gibt bewusst keine Zahlen aus, weil die Protokolle des öffentlichen Repos lesbar sind.
"""
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # python -I nimmt den Skriptordner nicht mit auf
from logik import aufbereiten, video_eintrag  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
KRYPTO = str(REPO / "werkzeuge" / "krypto.mjs")
TT_USER, YT_HANDLE = "daily_tech.de", "@Daily_Tech.de0"
IG_METRICS = ["views", "reach", "saved", "shares", "total_interactions", "ig_reels_avg_watch_time"]
JETZT = dt.datetime.now()
HEUTE = JETZT.date()


def json_holen(url, headers=None, body=None, methode=None, timeout=60):
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers=headers or {}, method=methode)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def instagram(token):
    def get(path, **params):
        params["access_token"] = token
        return json_holen(f"https://graph.instagram.com/{path}?{urllib.parse.urlencode(params)}")

    follower = get("me", fields="followers_count")["followers_count"]
    zeilen = []
    for m in get("me/media", fields="id,permalink,timestamp,caption,like_count,comments_count,media_product_type", limit=50).get("data", []):
        if m.get("media_product_type") != "REELS":
            continue
        ins = {}
        for metric in IG_METRICS:  # einzeln abfragen, damit eine unbekannte Metrik nicht alles blockiert
            try:
                data = get(f"{m['id']}/insights", metric=metric).get("data", [])
                ins[metric] = data[0]["values"][0]["value"] if data else None
            except Exception:
                ins[metric] = None
        watch = ins.get("ig_reels_avg_watch_time")
        zeilen.append({"datum": m["timestamp"][:10], "titel": (m.get("caption") or "")[:60].replace("\n", " "),
                       "views": ins.get("views"), "likes": m.get("like_count"), "kommentare": m.get("comments_count"),
                       "shares": ins.get("shares"), "saves": ins.get("saved"), "reichweite": ins.get("reach"),
                       "watchtime_s": round(watch / 1000, 1) if watch else None, "dauer_s": None,
                       "link": m["permalink"].split("?")[0].replace("/reel/", "/p/")})
    return zeilen, follower


def tiktok(token):
    kopf = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    eingabe = {"profiles": [TT_USER], "resultsPerPage": 30, "profileScrapeSections": ["videos"], "profileSorting": "latest"}
    run = json_holen("https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/runs?maxTotalChargeUsd=0.15", kopf, eingabe, "POST")["data"]
    for _ in range(60):  # höchstens 10 Minuten warten
        run = json_holen(f"https://api.apify.com/v2/actor-runs/{run['id']}", kopf)["data"]
        if run["status"] not in ("READY", "RUNNING"):
            break
        time.sleep(10)
    items = json_holen(f"https://api.apify.com/v2/datasets/{run['defaultDatasetId']}/items?clean=true&format=json", kopf)
    zeilen = [{"datum": (x.get("createTimeISO") or "")[:10], "titel": (x.get("text") or "")[:60].replace("\n", " "),
               "views": x.get("playCount"), "likes": x.get("diggCount"), "kommentare": x.get("commentCount"),
               "shares": x.get("shareCount"), "saves": x.get("collectCount"), "reichweite": None, "watchtime_s": None,
               "dauer_s": (x.get("videoMeta") or {}).get("duration"), "link": x.get("webVideoUrl")} for x in items]
    fans = (items[0].get("authorMeta") or {}).get("fans") if items else None
    return zeilen, fans


def youtube():
    yt = subprocess.run(["yt-dlp", "--flat-playlist", "-J", f"https://www.youtube.com/{YT_HANDLE}/shorts"], capture_output=True, text=True, timeout=180)
    eintraege = json.loads(yt.stdout).get("entries", []) if yt.returncode == 0 and yt.stdout else []
    zeilen = [{"datum": "unbekannt", "titel": e.get("title"), "views": e.get("view_count"), "likes": None, "kommentare": None,
               "shares": None, "saves": None, "reichweite": None, "watchtime_s": None, "dauer_s": None,
               "link": f"https://www.youtube.com/shorts/{e.get('id')}"} for e in eintraege]
    abos = None
    req = urllib.request.Request(f"https://www.youtube.com/{YT_HANDLE}?hl=en", headers={"User-Agent": "Mozilla/5.0", "Cookie": "SOCS=CAI; CONSENT=YES+"})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
    m = re.search(r'"content":"([\d.,]+)([KM]?) subscribers?"', html)
    if m:
        abos = int(float(m.group(1).replace(",", "")) * {"": 1, "K": 1e3, "M": 1e6}[m.group(2)])
    return zeilen, abos


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

    quellen = {"Instagram": lambda: instagram(env["IG_ACCESS_TOKEN"]), "TikTok": lambda: tiktok(env["APIFY_TOKEN"]), "YouTube": youtube}
    for p, holen in quellen.items():
        try:
            zeilen, anzahl = holen()
        except Exception as e:  # z. B. Token abgelaufen oder YouTube blockt den Server
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
            videos[p] = neu
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
