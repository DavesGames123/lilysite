// Manage public/edit/lock.json: the editor password hash and the sealed GitHub token.
//
// The page shows the edit switch to everyone. The switch opens the editor only
// after the password matches the PBKDF2 hash in lock.json. The hash is only a
// gate: anyone can read the page source. The write protection is the sealed
// token. It is a GitHub token, encrypted with AES-GCM under a key that comes
// from the same password (with its own salt). Without the password, the
// token cannot be decrypted, and nobody can publish.
//
// Usage:
//   node scripts/edit_lock.mjs password        set or change the password
//   node scripts/edit_lock.mjs seal            encrypt a GitHub token into lock.json
//   node scripts/edit_lock.mjs unseal-test     check that the password opens the token
//   node scripts/edit_lock.mjs status          print what lock.json holds (no secrets)
//
// The password and the token come from a hidden prompt, or from the
// EDIT_PASSWORD and EDIT_TOKEN environment variables. Neither is written to
// disk in plain text. A new password clears the sealed token, because the old
// token key came from the old password.
//
// grep -n targets: KDF, deriveBits, aesKey, cmdPassword, cmdSeal
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto as crypto } from "node:crypto";
import readline from "node:readline";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = join(ROOT, "public/edit/lock.json");
const KDF = { name: "PBKDF2", hash: "SHA-256", iterations: 600000 };
const DEFAULT_PUBLISH = { repo: "DavesGames123/lilysite", branch: "main", path: "content/profile.json" };

const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const unb64 = (text) => new Uint8Array(Buffer.from(text, "base64"));
const enc = new TextEncoder();

async function deriveBits(password, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits", "deriveKey"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ ...KDF, salt }, base, 256));
}

async function aesKey(password, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ ...KDF, salt }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function readLock() {
  return existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, "utf8")) : null;
}

function writeLock(lock) {
  mkdirSync(dirname(LOCK), { recursive: true });
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + "\n");
}

function ask(question, envName) {
  if (process.env[envName]) return Promise.resolve(process.env[envName]);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

async function verify(lock, password) {
  const bits = await deriveBits(password, unb64(lock.verifier.salt));
  return b64(bits) === lock.verifier.hash;
}

async function cmdPassword() {
  const password = await ask("New editor password: ", "EDIT_PASSWORD");
  if (password.length < 12) throw new Error("use 12 characters or more");
  if (!process.env.EDIT_PASSWORD) {
    const again = await ask("Repeat the password: ", "EDIT_PASSWORD");
    if (again !== password) throw new Error("the two passwords are different");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const old = readLock();
  const lock = {
    version: 1,
    kdf: KDF,
    verifier: { salt: b64(salt), hash: b64(await deriveBits(password, salt)) },
    publish: { ...DEFAULT_PUBLISH, ...(old?.publish || {}), sealed: null },
  };
  writeLock(lock);
  console.log("lock.json: password hash written; sealed token cleared");
}

async function cmdSeal() {
  const lock = readLock();
  if (!lock) throw new Error("no lock.json: run `password` first");
  const password = await ask("Editor password: ", "EDIT_PASSWORD");
  if (!(await verify(lock, password))) throw new Error("the password does not match lock.json");
  const token = (await ask("GitHub token (fine-grained, Contents: read and write): ", "EDIT_TOKEN")).trim();
  if (!/^(github_pat_|ghp_)/.test(token)) throw new Error("that does not look like a GitHub token");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(password, salt);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(token)));
  lock.publish = { ...DEFAULT_PUBLISH, ...lock.publish, sealed: { salt: b64(salt), iv: b64(iv), data: b64(data) } };
  writeLock(lock);
  console.log(`lock.json: token sealed for ${lock.publish.repo} (${lock.publish.branch}:${lock.publish.path})`);
}

async function cmdUnsealTest() {
  const lock = readLock();
  const password = await ask("Editor password: ", "EDIT_PASSWORD");
  if (!(await verify(lock, password))) throw new Error("the password does not match lock.json");
  if (!lock.publish?.sealed) return console.log("password OK; no token sealed");
  const { salt, iv, data } = lock.publish.sealed;
  const key = await aesKey(password, unb64(salt));
  const token = new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(data)));
  console.log(`password OK; token opens (${token.slice(0, 11)}…, ${token.length} characters)`);
}

function cmdStatus() {
  const lock = readLock();
  if (!lock) return console.log("no lock.json");
  console.log(JSON.stringify({ kdf: lock.kdf, password: Boolean(lock.verifier?.hash), publish: { ...lock.publish, sealed: Boolean(lock.publish?.sealed) } }, null, 2));
}

const commands = { password: cmdPassword, seal: cmdSeal, "unseal-test": cmdUnsealTest, status: cmdStatus };
const cmd = commands[process.argv[2]];
if (!cmd) {
  console.log("usage: node scripts/edit_lock.mjs password|seal|unseal-test|status");
  process.exit(2);
}
Promise.resolve().then(cmd).catch((error) => { console.error(`edit_lock: ${error.message}`); process.exit(1); });
