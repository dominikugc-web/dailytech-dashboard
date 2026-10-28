"""Holt die Zahlen der eigenen Videos, ohne Apify und ohne Kosten.

- Instagram über die offizielle Instagram-API: Views, Likes, Kommentare, Reichweite, Saves, Shares, Watch Time, Follower
- TikTok und YouTube über die Buffer-API: Buffer liest die Zahlen einmal am Tag bei den Plattformen ab,
  auch für Videos, die nicht über Buffer gepostet wurden
- TikTok-Follower und YouTube-Abos von den öffentlichen Profilseiten

Genutzt von tools/eigene_zahlen.py (Montag) und werkzeuge/aktualisieren.py (Knopf auf der Seite).
Jede Zeile hat das Format von auswertung.csv (ohne plattform, abgerufen, like_rate_%).
"""
import json
import re
import urllib.error
import urllib.parse
import urllib.request

IG_METRICS = ["views", "reach", "saved", "shares", "total_interactions", "ig_reels_avg_watch_time"]
BUFFER_API = "https://api.buffer.com"
BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"


def json_holen(url, headers=None, body=None, timeout=60):
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def instagram(token):
    def get(path, **params):
        params["access_token"] = token
        return json_holen(f"https://graph.instagram.com/{path}?{urllib.parse.urlencode(params)}")

    follower = get("me", fields="followers_count")["followers_count"]
    zeilen = []
    for m in get("me/media", fields="id,permalink,timestamp,caption,like_count,comments_count,media_product_type", limit=100).get("data", []):
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


def _buffer(key, query, variables=None):
    antwort = json_holen(BUFFER_API, {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                         {"query": query, "variables": variables or {}})
    if antwort.get("errors"):
        raise RuntimeError("; ".join(x.get("message", "") for x in antwort["errors"]))
    return antwort["data"]


def buffer(key):
    """{"TikTok": [zeilen], "YouTube": [zeilen]} aus den gesendeten Posts der Buffer-Kanäle."""
    org = _buffer(key, "query { account { organizations { id } } }")["account"]["organizations"][0]["id"]
    kanaele = _buffer(key, "query($o: OrganizationId!) { channels(input: {organizationId: $o}) { id service } }", {"o": org})["channels"]
    ergebnis = {}
    for name, service in (("TikTok", "tiktok"), ("YouTube", "youtube")):
        kanal = next((k["id"] for k in kanaele if k["service"].lower() == service), None)
        if not kanal:
            continue
        zeilen, nach = [], None
        while True:
            d = _buffer(key, """query($o: OrganizationId!, $c: [ChannelId!], $nach: String) {
                posts(first: 50, after: $nach, input: {organizationId: $o, filter: {status: [sent], channelIds: $c}}) {
                  edges { node { text sentAt dueAt externalLink metrics { type value } metadata { ... on YoutubePostMetadata { title } } } }
                  pageInfo { endCursor hasNextPage } } }""", {"o": org, "c": [kanal], "nach": nach})["posts"]
            for e in d["edges"]:
                n = e["node"]
                m = {x["type"]: x["value"] for x in n["metrics"] or []}
                titel = (n.get("metadata") or {}).get("title") or n["text"] or ""
                zeilen.append({"datum": (n["sentAt"] or n["dueAt"] or "")[:10], "titel": titel[:60].replace("\n", " "),
                               "views": m.get("views"), "likes": m.get("reactions"), "kommentare": m.get("comments"),
                               "shares": m.get("shares"), "saves": m.get("saves"), "reichweite": m.get("reach") or None,
                               "watchtime_s": round(m["averageTimeWatched"], 1) if m.get("averageTimeWatched") else None,
                               "dauer_s": None, "link": (n["externalLink"] or "").split("?")[0]})
            if not d["pageInfo"]["hasNextPage"]:
                break
            nach = d["pageInfo"]["endCursor"]
        ergebnis[name] = zeilen
    return ergebnis


def _seite(url, **headers):
    headers["User-Agent"] = BROWSER
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30).read().decode("utf-8", "ignore")


def tiktok_follower(user="daily_tech.de"):
    m = re.search(r'"followerCount":(\d+)', _seite(f"https://www.tiktok.com/@{user}", **{"Accept-Language": "de-DE"}))
    return int(m.group(1)) if m else None


def youtube_abos(handle="@Daily_Tech.de0"):
    html = _seite(f"https://www.youtube.com/{handle}?hl=en", Cookie="SOCS=CAI; CONSENT=YES+")  # ohne deutsche Sprache, sonst „Abonnenten“
    m = re.search(r'"content":"([\d.,]+)([KM]?) subscribers?"', html)
    return int(float(m.group(1).replace(",", "")) * {"": 1, "K": 1e3, "M": 1e6}[m.group(2)]) if m else None
