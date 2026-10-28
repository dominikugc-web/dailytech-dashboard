// Ver- und Entschlüsselt daten.json (AES-256-GCM, Schlüssel per PBKDF2-SHA256), passend zu app.js.
// node krypto.mjs verschluesseln < klar.json > daten.json
// node krypto.mjs entschluesseln < daten.json > klar.json
// Das Passwort kommt aus der Umgebungsvariable DASHBOARD_PASSWORT.
import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from "node:crypto";

const ITER = 600000;
const passwort = process.env.DASHBOARD_PASSWORT;
if (!passwort) { console.error("DASHBOARD_PASSWORT fehlt."); process.exit(1); }
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const eingabe = Buffer.concat(chunks);

if (process.argv[2] === "entschluesseln") {
  const p = JSON.parse(eingabe);
  const key = pbkdf2Sync(passwort, Buffer.from(p.salt, "base64"), p.iter, 32, "sha256");
  const daten = Buffer.from(p.daten, "base64");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(p.iv, "base64"));
  d.setAuthTag(daten.subarray(-16));
  try {
    process.stdout.write(Buffer.concat([d.update(daten.subarray(0, -16)), d.final()]));
  } catch { console.error("Entschlüsseln fehlgeschlagen: falsches Passwort?"); process.exit(1); }
} else {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(passwort, salt, ITER, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const daten = Buffer.concat([cipher.update(eingabe), cipher.final(), cipher.getAuthTag()]);
  process.stdout.write(JSON.stringify({ v: 1, iter: ITER, salt: salt.toString("base64"), iv: iv.toString("base64"), daten: daten.toString("base64") }));
}
