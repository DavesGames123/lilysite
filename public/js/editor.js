// Site editor: a password-gated switch that makes every text on the page editable.
//
// Flow:
//   1. The footer switch (or the URL hash #edit) opens the password dialog.
//   2. The password is checked against the PBKDF2 hash in /edit/lock.json.
//      The check runs in the browser, so it is a gate, not a lock.
//   3. Edit mode opens a panel with one field for each text in the profile.
//      Each change re-renders the page regions at once with render.js, the
//      same renderer as the build. A click on page text opens its field.
//   4. Publish decrypts the sealed GitHub token with the password and commits
//      content/profile.json through the GitHub contents API. The Pages
//      workflow then renders and deploys the site (about 1-2 minutes).
//      Without a sealed token, Publish downloads profile.json instead.
//
// The draft is kept in localStorage, so a reload does not lose an edit. The
// password and the token stay in memory only, and only while edit mode is on.
//
// grep -n targets:
//   unlock           password check (PBKDF2)
//   buildForm        profile -> form fields; TEMPLATES for new list items
//   rerender         region replacement between the render comments
//   publish          sealed token -> GitHub contents API PUT
//   LABELS           field names shown in the panel
import { REGIONS, pageTitle } from "./render.js";

const LOCK_URL = "/edit/lock.json";
const DRAFT_KEY = "lilysite-draft";
const PAGE_REGIONS = Object.keys(REGIONS).filter((name) => name !== "head" && name !== "data");

const LABELS = {
  name: "Name", title: "Title", statement: "Statement", about: "About line", headline: "Profile headline",
  text: "Text", emphasis: "Gold text", facts: "Profile facts", label: "Label", value: "Value", sub: "Second line",
  links: "Links", url: "Address (https://…)", sections: "Section names", profile: "Profile", experience: "Experience",
  education: "Education", volunteering: "Volunteering", skills: "Skills", honors: "Honors", site: "Site",
  logo: "Logo (ifc, or empty)", hero_only: "Logo in the hero only", aria: "Screen-reader name",
  domain: "Domain", description: "Search description", role: "Role", organization: "Organization", type: "Type",
  location: "Location", dates: "Dates", points: "Points", school: "School", studies: "Studies", details: "Details",
  items: "Items", nav: "Name in the nav", source: "Source", share: "Link-preview description",
  employer: "Employer", employer_parent: "Employer parent", image_version: "Preview image version",
};
const TEMPLATES = {
  experience: { role: "", organization: "", type: "", location: "", dates: "", points: [], skills: [] },
  education: { school: "", dates: "", studies: [], details: [] },
  volunteering: { role: "", organization: "", dates: "", points: [] },
  facts: { label: "", value: "", sub: "" },
  links: { label: "", url: "https://" },
};
const LONG = new Set(["statement", "description"]);

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
  drop(key) { try { localStorage.removeItem(key); } catch {} },
};

const published = JSON.parse(document.getElementById("profile-data").textContent);
const state = { lock: null, password: null, draft: null, panel: null, timer: 0 };
const toggle = document.getElementById("edit-switch");

// ---------- crypto ----------
const enc = new TextEncoder();
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

async function pbkdf2Base(password) {
  return crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits", "deriveKey"]);
}

async function unlock(password) {
  if (!state.lock) {
    const res = await fetch(LOCK_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("The editor lock file is missing.");
    state.lock = await res.json();
  }
  const { kdf, verifier } = state.lock;
  const bits = await crypto.subtle.deriveBits({ ...kdf, salt: unb64(verifier.salt) }, await pbkdf2Base(password), 256);
  return b64(bits) === verifier.hash;
}

async function openToken() {
  const sealed = state.lock.publish?.sealed;
  if (!sealed) return null;
  const key = await crypto.subtle.deriveKey(
    { ...state.lock.kdf, salt: unb64(sealed.salt) }, await pbkdf2Base(state.password),
    { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv) }, key, unb64(sealed.data));
  return new TextDecoder().decode(plain);
}

// ---------- path helpers ----------
const keysOf = (path) => path.split(".").map((k) => (/^\d+$/.test(k) ? Number(k) : k));
function getAt(obj, path) { return keysOf(path).reduce((o, k) => (o == null ? o : o[k]), obj); }
function setAt(obj, path, value) {
  const keys = keysOf(path);
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}
const labelFor = (key) => (typeof key === "number" ? `#${key + 1}` : LABELS[key] || key);

// ---------- rendering ----------
function regionBounds(name) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
  let start = null;
  while (walker.nextNode()) {
    const text = walker.currentNode.nodeValue.trim();
    if (text === `render:${name}`) start = walker.currentNode;
    else if (text === `/render:${name}` && start) return [start, walker.currentNode];
  }
  return null;
}

function rerender() {
  for (const name of PAGE_REGIONS) {
    const bounds = regionBounds(name);
    if (!bounds) continue;
    const [start, end] = bounds;
    while (start.nextSibling && start.nextSibling !== end) start.nextSibling.remove();
    const range = document.createRange();
    range.setStartAfter(start);
    end.before(range.createContextualFragment(REGIONS[name](state.draft)));
  }
  document.title = pageTitle(state.draft);
}

function changed() {
  store.set(DRAFT_KEY, JSON.stringify(state.draft));
  clearTimeout(state.timer);
  state.timer = setTimeout(rerender, 120);
  const dirty = JSON.stringify(state.draft) !== JSON.stringify(published);
  state.panel.querySelector("[data-dirty]").textContent = dirty ? "Unpublished changes" : "No changes";
}

// ---------- form ----------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

function checkField(path, key) {
  const id = `edit-${path.replace(/\./g, "-")}`;
  const input = el("input", { id, type: "checkbox", "data-path": path, onchange: (ev) => { setAt(state.draft, path, ev.target.checked); changed(); } });
  input.checked = Boolean(getAt(state.draft, path));
  return el("div", { class: "ed-field ed-check" }, input, el("label", { for: id }, labelFor(key)));
}

function textField(path, key) {
  const id = `edit-${path.replace(/\./g, "-")}`;
  const value = getAt(state.draft, path) ?? "";
  const long = LONG.has(key) || String(value).length > 70;
  const input = el(long ? "textarea" : "input", { id, "data-path": path, rows: "3", oninput: (ev) => { setAt(state.draft, path, ev.target.value); changed(); } });
  if (!long) input.type = key === "url" ? "url" : "text";
  input.value = value;
  return el("div", { class: "ed-field" }, el("label", { for: id }, labelFor(key)), input);
}

function itemControls(path, index, length, rebuild) {
  const arr = () => getAt(state.draft, path);
  const move = (to) => () => { const a = arr(); a.splice(to, 0, a.splice(index, 1)[0]); rebuild(); };
  return el("div", { class: "ed-item-tools" },
    el("button", { type: "button", "aria-label": "Move up", disabled: index === 0 ? "" : null, onclick: move(index - 1) }, "↑"),
    el("button", { type: "button", "aria-label": "Move down", disabled: index === length - 1 ? "" : null, onclick: move(index + 1) }, "↓"),
    el("button", { type: "button", class: "ed-remove", "aria-label": "Remove", onclick: () => { arr().splice(index, 1); rebuild(); } }, "Remove"));
}

function listField(path, key) {
  const box = el("fieldset", { class: "ed-list" });
  const rebuild = () => { box.replaceWith(listField(path, key)); changed(); };
  const items = getAt(state.draft, path);
  box.append(el("legend", {}, labelFor(key)));
  items.forEach((item, i) => {
    const itemPath = `${path}.${i}`;
    const controls = itemControls(path, i, items.length, rebuild);
    if (typeof item === "string") {
      const field = textField(itemPath, i);
      field.querySelector("label").classList.add("visually-hidden");
      box.append(el("div", { class: "ed-row" }, field, controls));
    } else {
      const title = item.role || item.school || item.label || item.value || `${labelFor(key)} ${i + 1}`;
      box.append(el("details", { class: "ed-card", open: "" }, el("summary", {}, title), objectFields(itemPath), controls));
    }
  });
  const template = TEMPLATES[key];
  box.append(el("button", { type: "button", class: "ed-add", onclick: () => { getAt(state.draft, path).push(structuredClone(template ?? "")); rebuild(); } }, `Add ${template ? labelFor(key).toLowerCase().replace(/s$/, "") : "line"}`));
  return box;
}

function objectFields(path) {
  const obj = path ? getAt(state.draft, path) : state.draft;
  const box = el("div", { class: "ed-object" });
  for (const [key, value] of Object.entries(obj)) {
    const child = path ? `${path}.${key}` : key;
    if (Array.isArray(value)) box.append(listField(child, key));
    else if (value && typeof value === "object") box.append(el("fieldset", { class: "ed-group" }, el("legend", {}, labelFor(key)), objectFields(child)));
    else if (typeof value === "boolean") box.append(checkField(child, key));
    else box.append(textField(child, key));
  }
  return box;
}

const GROUPS = [
  ["Hero", ["name", "title", "statement", "about"]],
  ["Profile", ["headline", "facts"]],
  ["Links", ["links"]],
  ["Experience", ["experience"]],
  ["Education", ["education"]],
  ["Volunteering", ["volunteering"]],
  ["Skills and honors", ["skills", "honors"]],
  ["Section names", ["sections"]],
  ["Site", ["site"]],
];

function buildForm() {
  const form = el("div", { class: "ed-form" });
  for (const [title, keys] of GROUPS) {
    const group = el("details", { class: "ed-section" }, el("summary", {}, title));
    for (const key of keys) {
      const value = state.draft[key];
      if (value === undefined) continue;
      if (Array.isArray(value)) group.append(listField(key, key));
      else if (value && typeof value === "object") group.append(el("fieldset", { class: "ed-group" }, el("legend", {}, labelFor(key)), objectFields(key)));
      else group.append(textField(key, key));
    }
    form.append(group);
  }
  return form;
}

// ---------- panel ----------
function status(message, tone = "") {
  const node = state.panel.querySelector("[data-status]");
  node.textContent = message;
  node.dataset.tone = tone;
}

function buildPanel() {
  const sealed = Boolean(state.lock.publish?.sealed);
  const panel = el("aside", { class: "editor-panel", "aria-label": "Site editor" },
    el("div", { class: "ed-head" },
      el("p", { class: "ed-title" }, "Edit site"),
      el("p", { class: "ed-dirty", "data-dirty": "" }, "No changes"),
      el("button", { type: "button", class: "ed-close", onclick: () => setEditing(false) }, "Close")),
    el("p", { class: "ed-hint" }, "Click any text on the page to jump to its field. Changes show at once; visitors see them after you publish."),
    el("div", { class: "ed-actions" },
      el("button", { type: "button", class: "ed-primary", onclick: publish }, sealed ? "Publish" : "Download profile.json"),
      el("button", { type: "button", onclick: download }, "Download"),
      el("button", { type: "button", onclick: discard }, "Discard changes")),
    el("p", { class: "ed-status", role: "status", "data-status": "" }, sealed ? "" : "Publishing is not set up yet: changes download as profile.json."),
    buildForm());
  return panel;
}

function refreshForm() {
  state.panel.querySelector(".ed-form").replaceWith(buildForm());
}

function onPageClick(event) {
  if (!document.body.classList.contains("is-editing") || state.panel.contains(event.target)) return;
  const target = event.target.closest("[data-edit]");
  if (!target) return;
  event.preventDefault();
  const field = state.panel.querySelector(`[data-path="${CSS.escape(target.dataset.edit)}"]`);
  if (!field) return;
  for (let node = field.parentElement; node && node !== state.panel; node = node.parentElement) {
    if (node.tagName === "DETAILS") node.open = true;
  }
  field.scrollIntoView({ block: "center", behavior: "smooth" });
  field.focus({ preventScroll: true });
}

function setEditing(on) {
  document.body.classList.toggle("is-editing", on);
  toggle.setAttribute("aria-checked", String(on));
  toggle.textContent = on ? "Editing" : "Edit site";
  if (on) {
    const saved = store.get(DRAFT_KEY);
    state.draft = saved ? JSON.parse(saved) : structuredClone(published);
    state.panel = buildPanel();
    document.body.append(state.panel);
    document.addEventListener("click", onPageClick, true);
    rerender();
    changed();
    if (saved && saved !== JSON.stringify(published)) status("Your unpublished draft was restored.");
    state.panel.querySelector("summary")?.focus();
  } else {
    document.removeEventListener("click", onPageClick, true);
    state.panel?.remove();
    state.panel = null;
    state.password = null;
    state.draft = structuredClone(published);
    rerender();
    toggle.focus();
  }
}

// ---------- actions ----------
function problems(data) {
  const out = [];
  if (!String(data.name || "").trim()) out.push("The name is empty.");
  for (const link of data.links || []) if (!/^https:\/\/\S+$/.test(link.url || "")) out.push(`The ${link.label || "link"} address must start with https://.`);
  return out;
}

function download() {
  const blob = new Blob([JSON.stringify(state.draft, null, 2) + "\n"], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "profile.json" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function discard() {
  if (!confirm("Discard every unpublished change?")) return;
  store.drop(DRAFT_KEY);
  state.draft = structuredClone(published);
  refreshForm();
  rerender();
  changed();
  status("Changes discarded.");
}

const utf8b64 = (text) => b64(enc.encode(text));

async function publish() {
  const issues = problems(state.draft);
  if (issues.length) return status(issues.join(" "), "error");
  const target = state.lock.publish;
  if (!target?.sealed) {
    download();
    return status("Downloaded profile.json. Publishing is not set up, so send this file to the site owner.");
  }
  const button = state.panel.querySelector(".ed-primary");
  button.disabled = true;
  status("Publishing…");
  try {
    const token = await openToken();
    const api = `https://api.github.com/repos/${target.repo}/contents/${target.path}`;
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    const current = await fetch(`${api}?ref=${encodeURIComponent(target.branch)}`, { headers, cache: "no-store" });
    if (current.status === 401) throw new Error("GitHub rejected the token. It may have expired.");
    if (!current.ok) throw new Error(`GitHub answered ${current.status} when reading the profile.`);
    const { sha } = await current.json();
    const put = await fetch(api, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: "content: edit the profile from the site editor",
        content: utf8b64(JSON.stringify(state.draft, null, 2) + "\n"),
        sha,
        branch: target.branch,
      }),
    });
    if (!put.ok) throw new Error(`GitHub answered ${put.status} when saving the profile.`);
    store.drop(DRAFT_KEY);
    Object.assign(published, structuredClone(state.draft));
    changed();
    status("Published. The live site updates in about 1–2 minutes.", "ok");
  } catch (error) {
    status(`Not published: ${error.message} Your draft is still saved in this browser.`, "error");
  } finally {
    button.disabled = false;
  }
}

// ---------- password dialog ----------
function passwordDialog() {
  const dialog = el("dialog", { class: "ed-dialog", "aria-labelledby": "ed-dialog-title" });
  const input = el("input", { type: "password", id: "ed-password", autocomplete: "current-password", required: "" });
  const message = el("p", { class: "ed-dialog-msg", role: "alert" });
  const submit = el("button", { type: "submit", class: "ed-primary" }, "Unlock");
  let failures = 0;
  const form = el("form", { method: "dialog", onsubmit: async (ev) => {
    ev.preventDefault();
    submit.disabled = true;
    message.textContent = "Checking…";
    try {
      if (await unlock(input.value)) {
        state.password = input.value;
        dialog.close();
        dialog.remove();
        setEditing(true);
        return;
      }
      failures += 1;
      message.textContent = "That password is not correct.";
      if (failures >= 5) await new Promise((r) => setTimeout(r, 5000 * (failures - 4)));
    } catch (error) {
      message.textContent = error.message;
    }
    submit.disabled = false;
    input.select();
  } },
    el("h2", { id: "ed-dialog-title" }, "Edit site"),
    el("label", { for: "ed-password" }, "Password"),
    input, message,
    el("div", { class: "ed-dialog-actions" },
      el("button", { type: "button", onclick: () => { dialog.close(); dialog.remove(); toggle.focus(); } }, "Cancel"), submit));
  dialog.append(form);
  document.body.append(dialog);
  dialog.showModal();
  input.focus();
}

toggle?.addEventListener("click", () => {
  if (document.body.classList.contains("is-editing")) setEditing(false);
  else if (!window.isSecureContext || !crypto.subtle) alert("The editor needs a secure (https) page.");
  else passwordDialog();
});
if (location.hash === "#edit") toggle?.click();
window.addEventListener("hashchange", () => { if (location.hash === "#edit" && !document.body.classList.contains("is-editing")) toggle?.click(); });
