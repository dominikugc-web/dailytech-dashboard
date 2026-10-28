// Daily-Tech Zahlen: entschlüsselt daten.json im Browser und zeichnet die Seiten.
"use strict";

const SPEICHER_KEY = "dt-passwort";
const FARBEN = { Instagram: "#B03CA8", TikTok: "#1AA3B0", YouTube: "#E56A2E", Amazon: "#E9A23B" };
const KURZ = { Instagram: "ig", TikTok: "tt", YouTube: "yt", Amazon: "amz" };
const fmt = new Intl.NumberFormat("de-DE");
const fmtKurz = new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 });
const fmtDatum = d => new Date(d + "T12:00:00").toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
const fmtTag = d => new Date(d + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
const n = v => (v === null || v === undefined ? "–" : fmt.format(Math.round(v)));

const ICON = {
  uebersicht: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
  Instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"/></svg>',
  TikTok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.4 2.6 2.3 4.4 5 4.6"/></svg>',
  YouTube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.2 9.3v5.4l4.6-2.7z" fill="currentColor"/></svg>',
  Amazon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 15.5c4.5 3 11.5 3 16 0"/><path d="M17.5 14.5l2.5 1-1 2.4"/><path d="M8 6.5a4 4 0 0 1 7.5 1.5v5.5M15.5 10.5c-4-.5-7 .4-7 2.5 0 2.4 4.2 2.5 7-.5"/></svg>',
  geld: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M14.8 9.2c-.6-1-1.6-1.5-2.8-1.5-1.6 0-2.8.9-2.8 2.1 0 2.9 5.8 1.5 5.8 4.4 0 1.2-1.3 2.1-3 2.1-1.3 0-2.4-.5-3-1.5M12 6v1.7M12 16.3V18"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M8 5v5M16 5v5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3.5 2.5 20h19z" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.5v.01"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.7L16.5 9.5"/></svg>',
};

const SEITEN = [
  { id: "uebersicht", titel: "Übersicht", icon: ICON.uebersicht },
  { id: "instagram", titel: "Instagram", icon: ICON.Instagram, plattform: "Instagram" },
  { id: "tiktok", titel: "TikTok", icon: ICON.TikTok, plattform: "TikTok" },
  { id: "youtube", titel: "YouTube", icon: ICON.YouTube, plattform: "YouTube" },
  { id: "geld", titel: "Monetarisierung", kurz: "Geld", icon: ICON.geld },
  { id: "produktion", titel: "Produktion", icon: ICON.film },
];

let D = null;
let PW = null;      // bleibt nur im Speicher dieses Tabs, damit neue Zahlen ohne erneute Eingabe lesbar sind
let DATEI_IV = null; // ändert sich bei jedem Hochladen: so merkt die Seite, dass neue Zahlen da sind
const charts = [];
const REPO = "dominikugc-web/dailytech-dashboard";
const WORKFLOW = "aktualisieren.yml";

async function ladeDatei() {
  // GitHub Pages hält Dateien bis zu 10 Minuten im Zwischenspeicher, der Zeitstempel umgeht das
  const res = await fetch(`daten.json?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Die Daten konnten nicht geladen werden.");
  return res.json();
}
/* ---------- Entschlüsseln (AES-256-GCM, Schlüssel per PBKDF2-SHA256, wie tools/verschluesseln.mjs) ---------- */
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function entschluesseln(passwort) {
  const p = await ladeDatei();
  const basis = await crypto.subtle.importKey("raw", new TextEncoder().encode(passwort), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(p.salt), iterations: p.iter, hash: "SHA-256" },
    basis, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const klar = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(p.iv) }, key, b64(p.daten));
  DATEI_IV = p.iv;
  return JSON.parse(new TextDecoder().decode(klar));
}

function speicher(op, wert) {
  try {
    if (op === "get") return localStorage.getItem(SPEICHER_KEY);
    if (op === "set") localStorage.setItem(SPEICHER_KEY, wert);
    if (op === "del") localStorage.removeItem(SPEICHER_KEY);
  } catch { /* privater Modus: dann eben ohne Merken */ }
  return null;
}

async function anmelden(passwort, merken) {
  const fehler = document.getElementById("login-fehler");
  const knopf = document.querySelector("#login-form button");
  knopf.disabled = true; knopf.textContent = "Entschlüssele …"; fehler.textContent = "";
  try {
    D = await entschluesseln(passwort);
    PW = passwort;
    if (merken) speicher("set", passwort);
    document.getElementById("login").hidden = true;
    document.getElementById("app").hidden = false;
    baueNavigation();
    zeige();
  } catch (e) {
    speicher("del");
    fehler.textContent = e instanceof DOMException ? "Das Passwort stimmt nicht." : e.message;
  } finally {
    knopf.disabled = false; knopf.textContent = "Entsperren";
  }
}

/* ---------- Navigation ---------- */
function baueNavigation() {
  document.getElementById("nav").innerHTML = SEITEN.map(s =>
    `<li><a href="#${s.id}" data-id="${s.id}">${s.icon}${s.kurz
      ? `<span class="nav-lang">${s.titel}</span><span class="nav-kurz">${s.kurz}</span>` : `<span>${s.titel}</span>`}</a></li>`).join("");
}
function aktuelleSeite() {
  const id = location.hash.slice(1);
  return SEITEN.find(s => s.id === id) ?? SEITEN[0];
}
function zeige({ oben = true } = {}) {
  const seite = aktuelleSeite();
  document.querySelectorAll("#nav a").forEach(a => { if (a.dataset.id === seite.id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  charts.splice(0).forEach(c => c.destroy());
  const inhalt = document.getElementById("inhalt");
  inhalt.innerHTML = seite.id === "uebersicht" ? seiteUebersicht()
    : seite.plattform ? seitePlattform(seite.plattform)
    : seite.id === "geld" ? seiteGeld() : seiteProduktion();
  document.title = `${seite.titel} · Daily-Tech Zahlen`;
  requestAnimationFrame(() => { zeichneDiagramme(seite); fuelleRinge(); });
  if (oben) { inhalt.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
}

/* ---------- Bausteine ---------- */
function kopf(titel, text) {
  return `<header class="kopf"><div><h1>${titel}</h1><p class="muted">${text}</p></div>
    <div class="kopf-rechts"><span class="chip">${standText()}</span>
    <button type="button" class="btn btn-holen" data-holen ${holen.laeuft ? "disabled" : ""}>${holen.laeuft ? "Holt Zahlen …" : "Zahlen holen"}</button>
    <span class="klein holen-status" role="status">${holen.text}</span></div></header>`;
}
function standText() {
  const abruf = D.abruf_zeit ? `${fmtDatum(D.abruf)}, ${D.abruf_zeit} Uhr` : D.abruf ? fmtDatum(D.abruf) : null;
  return abruf ? `Zahlen vom ${abruf}` : `Stand ${fmtDatum(D.stand)}`;
}
function delta(neu, alt, einheit = "") {
  if (neu === null || alt === null || alt === undefined) return `<span class="delta null">noch kein Vergleich</span>`;
  const d = neu - alt;
  const cls = d > 0 ? "plus" : d < 0 ? "minus" : "null";
  return `<span class="delta ${cls}">${d > 0 ? "+" : ""}${fmt.format(d)}${einheit} seit letzter Messung</span>`;
}
function kpi(bez, wert, zusatz = "") {
  return `<div class="karte glass kpi s3"><span class="bez">${bez}</span><span class="wert">${wert}</span>${zusatz}</div>`;
}
function hinweis(art, titel, text) {
  return `<div class="hinweis ${art} s12" role="${art === "krit" ? "alert" : "status"}">${art === "gut" ? ICON.ok : ICON.warn}<div><strong>${titel}</strong><span class="muted">${text}</span></div></div>`;
}
function legende(namen) {
  return `<div class="legende">${namen.map(p => `<span><i style="background:${FARBEN[p]}"></i>${p}</span>`).join("")}</div>`;
}
function vorratHinweis() {
  const v = D.produktion.vorrat_videos;
  if (v >= 3) return "";
  return hinweis(v === 0 ? "krit" : "warn", v === 0 ? "Kein Video mehr auf Vorrat" : `Nur noch ${v} Video${v === 1 ? "" : "s"} auf Vorrat`,
    `${D.produktion.skripte_offen} Skripte warten auf ihr Video. Lass im Produktions-Chat die nächsten Videos bauen.`);
}

function knopfHinweis() {
  const fehlt = Object.entries(D.knopf_ergebnis ?? {}).filter(([, e]) => e !== "aktuell").map(([p]) => p);
  if (!fehlt.length) return "";
  return hinweis("warn", `${fehlt.join(" und ")} ${fehlt.length > 1 ? "kamen" : "kam"} beim letzten Abruf nicht durch`,
    "Dort stehen noch die Zahlen vom Abruf davor. Versuch es später noch mal, sonst kommen sie am Montag.");
}

/* ---------- Knopf „Zahlen holen“: startet den Abruf bei GitHub und wartet auf die neue Datei ---------- */
const holen = { laeuft: false, text: "" };
function zeigeHolen(text, laeuft = holen.laeuft) {
  Object.assign(holen, { text, laeuft });
  document.querySelectorAll("[data-holen]").forEach(b => { b.disabled = laeuft; b.textContent = laeuft ? "Holt Zahlen …" : "Zahlen holen"; });
  document.querySelectorAll(".holen-status").forEach(s => { s.textContent = text; });
}
async function zahlenHolen() {
  const start = Date.now();
  if (D.knopf_token) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST", headers: { Authorization: `Bearer ${D.knopf_token}`, Accept: "application/vnd.github+json" }, body: JSON.stringify({ ref: "main" }) });
    if (!res.ok) { zeigeHolen(res.status === 401 ? "Der GitHub-Schlüssel für den Knopf ist abgelaufen." : "GitHub hat den Abruf abgelehnt.", false); return; }
  } else {
    // Ohne Schlüssel öffnet der Knopf die Seite bei GitHub, dort einmal auf „Run workflow“ tippen
    window.open(`https://github.com/${REPO}/actions/workflows/${WORKFLOW}`, "_blank", "noopener");
  }
  zeigeHolen("Läuft, dauert etwa 3 Minuten. Du kannst die Seite offen lassen.", true);
  const altIv = DATEI_IV;
  while (Date.now() - start < 12 * 60 * 1000) {
    await new Promise(r => setTimeout(r, 15000));
    try {
      const p = await ladeDatei();
      if (p.iv !== altIv) {
        D = await entschluesseln(PW);
        zeigeHolen(`Neue Zahlen geladen um ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr.`, false);
        zeige({ oben: false });
        return;
      }
      if (D.knopf_token && Date.now() - start > 60000 && await abrufFehlgeschlagen(start)) {
        zeigeHolen("Der Abruf ist bei GitHub fehlgeschlagen. Versuch es später noch mal.", false);
        return;
      }
    } catch { /* kurz kein Netz: beim nächsten Durchgang weiter */ }
  }
  zeigeHolen("Das dauert ungewöhnlich lange. Lade die Seite später neu.", false);
}
async function abrufFehlgeschlagen(start) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1`,
    { headers: { Authorization: `Bearer ${D.knopf_token}`, Accept: "application/vnd.github+json" } });
  const lauf = res.ok ? (await res.json()).workflow_runs?.[0] : null;
  return lauf && new Date(lauf.created_at) >= new Date(start - 60000) && lauf.status === "completed" && lauf.conclusion !== "success";
}

/* ---------- Seite: Übersicht ---------- */
function seiteUebersicht() {
  const P = D.plattformen;
  const stunde = new Date().getHours();
  const gruss = stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Hallo" : "Guten Abend";
  const summeF = ["Instagram", "TikTok", "YouTube"].reduce((s, p) => s + (P[p].kpi.follower ?? 0), 0);
  const summeV = ["Instagram", "TikTok", "YouTube"].reduce((s, p) => s + (P[p].kpi.views ?? 0), 0);
  const ig = P.Instagram.kpi;
  const status = D.monetarisierung.Instagram.status;
  return `${kopf(`${gruss}, Dominik`, "So stehen deine drei Kanäle.")}
  <section class="raster" aria-label="Wichtige Hinweise">
    ${status?.verstoss_offen ? hinweis("krit", "Instagram-Monetarisierung ist gesperrt", status.text) : ""}
    ${vorratHinweis()}
    ${knopfHinweis()}
  </section>
  <section class="raster" aria-label="Kennzahlen">
    ${kpi("Follower auf allen Kanälen", n(summeF))}
    ${kpi("Views gesamt", n(summeV), `<span class="klein">alle Videos, alle Plattformen</span>`)}
    ${kpi("Ø Watch Time Instagram", ig.watchtime_s ? `${fmt.format(ig.watchtime_s)} s` : "–", `<span class="klein">pro View, aus den Insights</span>`)}
    ${kpi("Shares Instagram", n(ig.shares), `<span class="klein">${n(ig.saves)} Mal gespeichert</span>`)}
  </section>
  <section class="raster" aria-label="Kanäle">
    ${["Instagram", "TikTok", "YouTube"].map(p => {
      const k = P[p].kpi;
      return `<a class="karte glass plattform s4" href="#${p.toLowerCase()}">
        <span class="logo ${KURZ[p]}">${ICON[p]}</span>
        <span><h2>${p}</h2><span class="klein">${k.videos} Videos</span></span>
        <span class="zahlen"><span class="kpi"><span class="wert">${n(k.follower)}</span><span class="bez">${p === "YouTube" ? "Abos" : "Follower"}</span>${delta(k.follower, k.follower_vorher)}</span>
        <span class="kpi"><span class="wert">${n(k.views)}</span><span class="bez">Views</span></span></span></a>`;
    }).join("")}
  </section>
  <section class="raster">
    <div class="karte glass s8"><div class="karte-kopf"><h2>Follower-Verlauf</h2>${legende(["Instagram", "TikTok", "YouTube"])}</div>
      <div class="diagramm hoch"><canvas id="c-follower" role="img" aria-label="Follower pro Plattform im Zeitverlauf"></canvas></div></div>
    <div class="karte glass s4"><div class="karte-kopf"><h2>Winner der letzten 14 Tage</h2></div>
      <div class="winner">${D.winner.length ? D.winner.map((w, i) => `<div class="winner-item"><span class="platz">${i + 1}</span>
        <span><strong>${w.nr ? w.nr + " · " : ""}${w.thema}</strong><span class="klein">${n(w.views)} Views · ${n(w.shares)} Shares</span></span>
        <span class="wt">${w.watchtime_s ? fmt.format(w.watchtime_s) + " s" : "–"}<span class="klein">Ø Watch Time</span></span></div>`).join("")
        : `<p class="leer">Noch keine Videos aus den letzten 14 Tagen in den Daten.</p>`}</div></div>
  </section>
  <section class="raster">
    <div class="karte glass s12"><div class="karte-kopf"><h2>Views pro Plattform, je Messung</h2>${legende(["Instagram", "TikTok", "YouTube"])}</div>
      <div class="diagramm"><canvas id="c-views" role="img" aria-label="Views pro Plattform je Messung"></canvas></div></div>
  </section>`;
}

/* ---------- Seite: eine Plattform ---------- */
function seitePlattform(p) {
  const pl = D.plattformen[p];
  const k = pl.kpi;
  const ig = p === "Instagram";
  const zeilen = pl.videos.map(v => `<tr><th scope="row">${v.nr ? v.nr + " · " : ""}${v.link ? `<a href="${v.link}" target="_blank" rel="noopener">${v.thema}</a>` : v.thema}</th>
    <td data-label="Gepostet">${v.datum ? fmtTag(v.datum) : "–"}</td><td data-label="Views">${n(v.views)}</td>
    <td data-label="Like-Rate">${v.like_rate !== null ? fmt.format(v.like_rate) + " %" : "–"}</td>
    ${ig ? `<td data-label="Watch Time">${v.watchtime_s ? fmt.format(v.watchtime_s) + " s" : "–"}</td><td data-label="Reichweite">${n(v.reichweite)}</td>` : ""}
    ${p !== "YouTube" ? `<td data-label="Shares">${n(v.shares)}</td><td data-label="Saves">${n(v.saves)}</td>` : ""}
    <td data-label="Kommentare">${n(v.kommentare)}</td></tr>`).join("");
  return `${kopf(p, `${p === "YouTube" ? "Abonnenten" : "Follower"}, Views und alle Videos im Detail.`)}
  <section class="raster" aria-label="Kennzahlen">
    ${kpi(p === "YouTube" ? "Abonnenten" : "Follower", n(k.follower), delta(k.follower, k.follower_vorher))}
    ${kpi("Views gesamt", n(k.views), `<span class="klein">${k.videos} Videos</span>`)}
    ${ig ? kpi("Ø Watch Time", k.watchtime_s ? `${fmt.format(k.watchtime_s)} s` : "–", `<span class="klein">pro View</span>`)
      : kpi("Views pro Video", n(k.videos ? k.views / k.videos : null))}
    ${p === "YouTube" ? kpi("Likes, Shares, Saves", "–", `<span class="klein">YouTube zeigt diese Zahlen nicht öffentlich</span>`)
      : kpi("Shares / Saves", `${n(k.shares)} / ${n(k.saves)}`)}
  </section>
  <section class="raster">
    <div class="karte glass s5"><div class="karte-kopf"><h2>${p === "YouTube" ? "Abonnenten" : "Follower"}-Verlauf</h2></div>
      <div class="diagramm"><canvas id="c-pf" role="img" aria-label="${p} Follower im Zeitverlauf"></canvas></div></div>
    <div class="karte glass s7"><div class="karte-kopf"><h2>Views pro Video</h2></div>
      <div class="diagramm"><canvas id="c-pv" role="img" aria-label="Views pro Video auf ${p}"></canvas></div></div>
  </section>
  <section class="raster"><div class="karte glass s12">
    <div class="tabelle-wrap" tabindex="0" role="region" aria-labelledby="tab-cap">
      <table><caption id="tab-cap">Alle Videos auf ${p}, neueste zuerst</caption>
        <thead><tr><th scope="col">Video</th><th scope="col">Gepostet</th><th scope="col">Views</th><th scope="col">Like-Rate</th>
        ${ig ? `<th scope="col">Watch Time</th><th scope="col">Reichweite</th>` : ""}${p !== "YouTube" ? `<th scope="col">Shares</th><th scope="col">Saves</th>` : ""}<th scope="col">Kommentare</th></tr></thead>
        <tbody>${zeilen || `<tr><td>Noch keine Videos in den Daten.</td></tr>`}</tbody></table></div>
  </div></section>`;
}

/* ---------- Seite: Monetarisierung (der Blickfang) ---------- */
function etaText(z) {
  if (!z.verfuegbar) return `<span class="eta">${z.hinweis}</span>`;
  if (z.erreicht) return `<span class="eta erreicht">Erreicht</span>`;
  if (!z.prognose) return `<span class="eta">Prognose ab mehr Messwerten</span>`;
  const t = z.prognose.tage;
  const wann = t <= 0 ? "heute" : t === 1 ? "morgen" : `in ${fmt.format(t)} Tagen`;
  return `<span class="eta">ca. ${fmtDatum(z.prognose.datum)} · ${wann}</span>`;
}
function ziel(z, farbe) {
  const proz = z.aktuell ? Math.min(100, (z.aktuell / z.schwelle) * 100) : 0;
  return `<article class="ziel${z.verfuegbar ? "" : " aus"}" style="--farbe:${farbe}">
    <div class="ring-wrap"><progress class="ring" max="100" value="${proz.toFixed(1)}" data-wert="${proz.toFixed(1)}" aria-label="${z.name}: ${Math.floor(proz)} Prozent"></progress>
      <span class="ring-mitte" aria-hidden="true"><b>${proz < 1 && proz > 0 ? "<1" : Math.floor(proz)}%</b><small>geschafft</small></span></div>
    <h3>${z.name}</h3>
    <span class="stand">${n(z.aktuell)} von ${z.schwelle >= 1e6 ? fmtKurz.format(z.schwelle) : n(z.schwelle)} ${z.einheit}</span>
    ${etaText(z)}
    ${z.verfuegbar && z.hinweis ? `<span class="klein">${z.hinweis}</span>` : ""}
  </article>`;
}
function seiteGeld() {
  const M = D.monetarisierung;
  const st = M.Instagram.status;
  const gruppe = (p, titel, text) => `<section class="karte glass ziel-gruppe">
    <div class="ziel-kopf"><span class="logo ${KURZ[p]}">${ICON[p]}</span><div><h2>${titel}</h2><p class="klein">${text}</p></div></div>
    <div class="ziele">${M[p].ziele.map(z => ziel(z, FARBEN[p])).join("")}</div></section>`;
  return `${kopf("Monetarisierung", "Wie weit du von den Auszahlungen der Plattformen entfernt bist. Die Daten stammen aus dem Wachstum seit der ersten Messung.")}
  <section class="raster">${st?.verstoss_offen ? hinweis("krit", "Instagram: Richtlinien-Verstoß offen", `${st.text} In Instagram unter Einstellungen → Monetarisierungsstatus prüfen.`) : ""}</section>
  ${gruppe("Instagram", "Instagram", "Follower-Schwellen laut Instagram-App (Stand 28.10.2026). Ausgegraut: in Deutschland nicht verfügbar.")}
  ${gruppe("TikTok", "TikTok Creator Rewards", "Beide Bedingungen müssen gleichzeitig erfüllt sein.")}
  ${gruppe("YouTube", "YouTube-Partnerprogramm", "Abos und Shorts-Views jeweils in 90 Tagen. Stufe 2 bringt Werbeeinnahmen.")}
  ${gruppe("Amazon", "Amazon-Partner (dein Shop)", M.Amazon.stand ? `Stand ${fmtDatum(M.Amazon.stand)}: ${n(M.Amazon.klicks)} Klicks, ${fmt.format(M.Amazon.einnahmen_eur)} € Einnahmen.` : "Startet mit dem Go-live am 7.12. Die Zahlen trägst du wöchentlich ein.")}
  <p class="klein">Prognosen rechnen das bisherige Wachstum geradlinig weiter. Mit jeder Montags-Messung werden sie genauer.</p>`;
}

/* ---------- Seite: Produktion ---------- */
function seiteProduktion() {
  const pr = D.produktion;
  const s = (ok, ja, nein) => `<span class="status ${ok ? "ja" : "nein"}">${ok ? "✓ " + ja : nein}</span>`;
  const zeilen = [...pr.liste].reverse().map(x => `<tr><th scope="row">${x.nr} · ${x.thema}</th>
    <td data-label="Skript">${s(x.skript, "fertig", "offen")}</td><td data-label="Video">${s(x.video, "fertig", "offen")}</td>
    <td data-label="Instagram">${x.gepostet ? s(true, "gepostet") : x.video ? `<span class="status offen">wartet</span>` : s(false, "", "–")}</td></tr>`).join("");
  return `${kopf("Produktion & Vorrat", "Was fertig ist, was wartet und wie lange der Vorrat reicht.")}
  <section class="raster">${vorratHinweis() || hinweis("gut", "Vorrat reicht", `${pr.vorrat_videos} fertige Videos warten aufs Posten.`)}</section>
  <section class="raster">
    ${kpi("Videos auf Vorrat", n(pr.vorrat_videos), `<span class="klein">reicht ${pr.vorrat_videos} Tag${pr.vorrat_videos === 1 ? "" : "e"} bei einem Post pro Tag</span>`)}
    ${kpi("Skripte ohne Video", n(pr.skripte_offen))}
    ${kpi("Auf Instagram gepostet", n(pr.liste.filter(x => x.gepostet).length))}
    ${kpi("Nächste Nummer", String(Math.max(0, ...pr.liste.map(x => +x.nr)) + 1).padStart(3, "0"), `<span class="klein">für neue Skripte</span>`)}
  </section>
  <section class="raster"><div class="karte glass s12"><div class="tabelle-wrap" tabindex="0" role="region" aria-labelledby="prod-cap">
    <table><caption id="prod-cap">Alle Videos, neueste Nummer zuerst</caption>
    <thead><tr><th scope="col">Video</th><th scope="col">Skript</th><th scope="col">Video</th><th scope="col">Instagram</th></tr></thead>
    <tbody>${zeilen}</tbody></table></div></div></section>`;
}

/* ---------- Diagramme (Chart.js, dunkel, dünne Linien, eine Achse) ---------- */
function basisOptionen(einheit = "") {
  return {
    responsive: true, maintainAspectRatio: false, animation: matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 500 },
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: {
      backgroundColor: "#1B1433", borderColor: "rgba(196,181,253,.3)", borderWidth: 1, padding: 10, titleColor: "#EEEAF8", bodyColor: "#B9B2D2",
      callbacks: { label: c => ` ${c.dataset.label}: ${fmt.format(c.parsed.y)}${einheit}` } } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#8A82A6" }, border: { color: "rgba(255,255,255,.08)" } },
      y: { beginAtZero: true, grid: { color: "rgba(255,255,255,.06)" }, ticks: { color: "#8A82A6", callback: v => fmtKurz.format(v) }, border: { display: false } },
    },
  };
}
function linie(id, labels, reihen, einheit) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  if (labels.length < 2) { el.parentElement.innerHTML = `<p class="leer">Der Verlauf erscheint ab der zweiten Messung. Bisher: ${reihen.map(r => `${r.name} ${n(r.daten.at(-1))}`).join(" · ")}.</p>`; return; }
  charts.push(new Chart(el, { type: "line", data: { labels: labels.map(fmtTag), datasets: reihen.map(r => ({
    label: r.name, data: r.daten, borderColor: FARBEN[r.name], backgroundColor: FARBEN[r.name], borderWidth: 2, tension: 0.3,
    pointRadius: 4, pointHoverRadius: 6, pointBorderColor: "#1A1430", pointBorderWidth: 2, spanGaps: true })) }, options: basisOptionen(einheit) }));
}
function zeichneDiagramme(seite) {
  Chart.defaults.font.family = "Manrope, system-ui, sans-serif";
  const P = D.plattformen;
  const daten = [...new Set(Object.values(P).flatMap(p => p.follower.map(f => f.datum)))].sort();
  const reihe = (p) => ({ name: p, daten: daten.map(d => P[p].follower.find(f => f.datum === d)?.wert ?? null) });
  if (seite.id === "uebersicht") {
    linie("c-follower", daten, ["Instagram", "TikTok", "YouTube"].map(reihe));
    const vd = D.verlauf_views.map(v => v.datum);
    linie("c-views", vd, ["Instagram", "TikTok", "YouTube"].map(p => ({ name: p, daten: D.verlauf_views.map(v => v[p] ?? null) })));
  }
  if (seite.plattform) {
    const p = seite.plattform;
    linie("c-pf", P[p].follower.map(f => f.datum), [{ name: p, daten: P[p].follower.map(f => f.wert) }]);
    const vids = [...P[p].videos].reverse();
    const el = document.getElementById("c-pv");
    if (el && window.Chart && vids.length) {
      charts.push(new Chart(el, { type: "bar", data: { labels: vids.map(v => v.nr ?? "?"), datasets: [{ label: "Views", data: vids.map(v => v.views ?? 0),
        backgroundColor: FARBEN[p], borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: "bottom", maxBarThickness: 34 }] },
        options: { ...basisOptionen(), plugins: { ...basisOptionen().plugins, tooltip: { ...basisOptionen().plugins.tooltip,
          callbacks: { title: c => { const v = vids[c[0].dataIndex]; return `${v.nr ?? ""} ${v.thema}`; }, label: c => ` ${fmt.format(c.parsed.y)} Views` } } } } }));
    }
  }
}
function fuelleRinge() {
  // attr() für Zahlen kann Safari noch nicht, deshalb setzen wir --wert direkt (Fallback aus dem progress-ring-Leitfaden)
  document.querySelectorAll("progress.ring").forEach(r => requestAnimationFrame(() => r.style.setProperty("--wert", r.dataset.wert)));
}

/* ---------- Start ---------- */
document.getElementById("login-form").addEventListener("submit", e => {
  e.preventDefault();
  anmelden(document.getElementById("pw").value, document.getElementById("merken").checked);
});
document.getElementById("abmelden").addEventListener("click", () => { speicher("del"); location.hash = ""; location.reload(); });
window.addEventListener("hashchange", () => D && zeige());
document.getElementById("inhalt").addEventListener("click", e => { if (e.target.closest("[data-holen]") && !holen.laeuft) zahlenHolen(); });
const gemerkt = speicher("get");
if (gemerkt) anmelden(gemerkt, true);
