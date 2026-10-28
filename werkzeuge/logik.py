"""Gemeinsame Rechenlogik für das Dashboard.

Genutzt von tools/dashboard_bauen.py (Montag, aus den Drive-Dateien) und
werkzeuge/aktualisieren.py (Knopf auf der Seite, läuft bei GitHub).
"""
import datetime as dt

YPP_NEU_AB = dt.date(2027, 2, 1)


def zahl(v):
    try:
        return float(v) if v not in (None, "", "None") else None
    except (TypeError, ValueError):
        return None


def prognose(punkte, ziel):
    """Lineare Prognose aus [(datum, wert)]. Gibt (tage, datum, rate_pro_tag) oder None."""
    punkte = sorted(punkte)
    if len(punkte) < 2:
        return None
    (d0, v0), (d1, v1) = punkte[0], punkte[-1]
    tage = (d1 - d0).days
    if tage < 2 or v1 <= v0:
        return None
    rate = (v1 - v0) / tage
    rest = max(ziel - v1, 0)
    t = round(rest / rate)
    return {"tage": t, "datum": (d1 + dt.timedelta(days=t)).isoformat(), "rate": round(rate, 1)}


def video_eintrag(r, p, themen, datum_zu_nr):
    """Eine Zeile im Format von auswertung.csv wird zu einem Video fürs Dashboard (mit Nummer und Thema)."""
    nr = datum_zu_nr.get(r["datum"])
    if not nr and p == "YouTube":  # YouTube liefert kein Datum: über das Thema im Titel zuordnen
        titel = (r["titel"] or "").lower()
        nr = next((n for n, t in themen.items() if t.split()[0].lower()[:6] in titel), None)
    return {
        "nr": nr, "thema": themen.get(nr, r["titel"] or "ohne Titel"), "datum": r["datum"] if r["datum"] != "unbekannt" else None,
        "views": zahl(r["views"]), "likes": zahl(r["likes"]), "like_rate": zahl(r["like_rate_%"]), "kommentare": zahl(r["kommentare"]),
        "shares": zahl(r["shares"]), "saves": zahl(r["saves"]), "reichweite": zahl(r["reichweite"]),
        "watchtime_s": zahl(r["watchtime_s"]), "dauer_s": zahl(r["dauer_s"]), "link": r["link"]}


def aufbereiten(videos, follower, verlauf_views, einst, produktion, heute, abruf, abruf_zeit=None):
    """Baut aus Videos, Follower-Punkten und Views-Verlauf die komplette daten.json (ohne Verschlüsselung).

    videos: {plattform: [video_eintrag]}, follower: {plattform: [{datum, wert}]}, verlauf_views: {datum: {plattform: summe}}
    """
    plattformen = {}
    for p in ("Instagram", "TikTok", "YouTube"):
        vs = sorted(videos.get(p, []), key=lambda v: (v["datum"] or "", v["nr"] or ""), reverse=True)
        f = sorted(follower.get(p, []), key=lambda x: x["datum"])
        wt = [v["watchtime_s"] for v in vs if v["watchtime_s"]]
        plattformen[p] = {"videos": vs, "follower": f, "kpi": {
            "follower": f[-1]["wert"] if f else None,
            "follower_vorher": f[-2]["wert"] if len(f) > 1 else None,
            "views": sum(v["views"] or 0 for v in vs),
            "videos": len(vs),
            "watchtime_s": round(sum(wt) / len(wt), 1) if wt else None,
            "shares": sum(v["shares"] or 0 for v in vs) if any(v["shares"] is not None for v in vs) else None,
            "saves": sum(v["saves"] or 0 for v in vs) if any(v["saves"] is not None for v in vs) else None,
        }}

    # --- Winner: die 2 Instagram-Videos der letzten 14 Tage mit der höchsten Watch Time ---
    grenze = (heute - dt.timedelta(days=14)).isoformat()
    kandidaten = [v for v in plattformen["Instagram"]["videos"] if (v["datum"] or "") >= grenze]
    winner = sorted(kandidaten, key=lambda v: (v["watchtime_s"] or 0, v["views"] or 0), reverse=True)[:2]

    # --- Monetarisierung ---
    def fpunkte(p):
        return [(dt.date.fromisoformat(x["datum"]), x["wert"]) for x in follower.get(p, [])]

    def ziel(name, aktuell, schwelle, einheit, punkte=None, verfuegbar=True, hinweis=None):
        return {"name": name, "aktuell": aktuell, "schwelle": schwelle, "einheit": einheit, "verfuegbar": verfuegbar,
                "erreicht": aktuell is not None and aktuell >= schwelle, "hinweis": hinweis,
                "prognose": prognose(punkte, schwelle) if punkte and verfuegbar else None}

    ig_f = plattformen["Instagram"]["kpi"]["follower"]
    tt_f = plattformen["TikTok"]["kpi"]["follower"]
    yt_f = plattformen["YouTube"]["kpi"]["follower"]
    tt30 = sum(v["views"] or 0 for v in plattformen["TikTok"]["videos"]
               if v["datum"] and v["datum"] >= (heute - dt.timedelta(days=30)).isoformat())
    tt_lang = sum(1 for v in plattformen["TikTok"]["videos"] if (v["dauer_s"] or 0) > 60)
    yt_views = sum(v["views"] or 0 for v in plattformen["YouTube"]["videos"])
    yt_view_punkte = [(dt.date.fromisoformat(d), s.get("YouTube", 0)) for d, s in verlauf_views.items() if "YouTube" in s]
    tt_view_punkte = [(dt.date.fromisoformat(d), s.get("TikTok", 0)) for d, s in verlauf_views.items() if "TikTok" in s]
    amazon = einst.get("amazon", {})
    shorts_ziel = 20_000_000 if heute >= YPP_NEU_AB else 10_000_000
    monetarisierung = {
        "Instagram": {
            "status": einst.get("instagram_status", {}),
            "ziele": [
                ziel("Geschenke auf Reels", ig_f, 500, "Follower", fpunkte("Instagram")),
                ziel("Affiliate und Creator Marketplace", ig_f, 1000, "Follower", fpunkte("Instagram")),
                ziel("Creator-Abos", ig_f, 10000, "Follower", fpunkte("Instagram")),
                ziel("Prämien für Foto-Beiträge", ig_f, 1000, "Follower", verfuegbar=False, hinweis="In Deutschland nicht verfügbar"),
                ziel("Abzeichen in Live-Videos", ig_f, 10000, "Follower", verfuegbar=False, hinweis="Nur in den USA"),
            ]},
        "TikTok": {"ziele": [
            ziel("Creator Rewards: Follower", tt_f, 10000, "Follower", fpunkte("TikTok")),
            ziel("Creator Rewards: Views in 30 Tagen", tt30, 100000, "Views", tt_view_punkte,
                 hinweis=f"Nur Videos über 1 Minute zählen. Aktuell {tt_lang} solche Videos."),
        ]},
        "YouTube": {"ziele": [
            ziel("Partnerprogramm Stufe 1: Abos", yt_f, 500, "Abos", fpunkte("YouTube"),
                 hinweis="Plus 3 Uploads in 90 Tagen und 3 Mio. Shorts-Views. Bringt Spenden und Shopping."),
            ziel("Partnerprogramm Stufe 1: Shorts-Views", yt_views, 3_000_000, "Views", yt_view_punkte,
                 hinweis="Gezählt sind die öffentlichen Views aller Shorts (90-Tage-Fenster angenähert)."),
            ziel("Partnerprogramm Stufe 2: Abos", yt_f, 1000, "Abos", fpunkte("YouTube"), hinweis="Ab hier gibt es Werbeeinnahmen."),
            ziel("Partnerprogramm Stufe 2: Shorts-Views", yt_views, shorts_ziel, "Views", yt_view_punkte,
                 hinweis="Wer sich ab 1.2.2027 neu bewirbt, braucht 20 Mio. statt 10 Mio. Views in 90 Tagen."),
        ]},
        "Amazon": {"ziele": [
            ziel("Erste 3 Verkäufe", amazon.get("verkaeufe", 0), 3, "Verkäufe",
                 hinweis="Danach prüft Amazon das Partnerkonto. Go-live ab 7.12."),
        ], "einnahmen_eur": amazon.get("einnahmen_eur", 0), "klicks": amazon.get("klicks", 0), "stand": amazon.get("stand")},
    }

    return {"stand": heute.isoformat(), "abruf": abruf, "abruf_zeit": abruf_zeit, "plattformen": plattformen,
            "verlauf_views": [{"datum": d, **s} for d, s in sorted(verlauf_views.items())],
            "winner": winner, "monetarisierung": monetarisierung, "produktion": produktion}
