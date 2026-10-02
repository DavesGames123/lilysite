// Page renderer: content/profile.json -> the marked regions of index.html.
//
// One module, two hosts. scripts/render_content.mjs runs it in Node at build
// time, so the page is static HTML that reads and prints without JavaScript.
// editor.js runs it in the browser, so an edit shows on the page at once.
//
// A region is the markup between <!-- render:NAME --> and <!-- /render:NAME -->.
// All other markup in index.html is layout.
//
// Each text element carries data-edit="path.in.profile", so a click on it in
// edit mode opens the matching editor field.
//
// grep -n targets:
//   REGIONS        region name -> render function
//   renderPage     string replacement of every region (Node build)
//   visibleSections  which sections have content (nav, numbering, hiding)
//   pageTitle      the <title> text; editor.js sets document.title from it
//   renderPrint    the flowing US Letter résumé

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const e = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const ed = (path) => ` data-edit="${e(path)}"`;
const nameParts = (name) => {
  const i = String(name).indexOf(" ");
  return i < 0 ? [name, ""] : [name.slice(0, i), name.slice(i + 1)];
};
const list = (value) => (Array.isArray(value) ? value : []);
const nonEmpty = (value) => list(value).filter((s) => String(s ?? "").trim());

// Brand marks for outbound links, drawn inline (24x24 viewBox, single color).
const LOGOS = {
  LinkedIn: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
};

// Image logos: the file is a white-on-transparent mask; CSS colors it with currentColor.
// key -> [path, width, height]; the ratio sets the link width.
export const IMAGE_LOGOS = {
  ifc: ["/icons/ifc-logo-mask.png", 1119, 197],
};

// A link with hero_only: true shows only as a logo in the hero. The footer,
// the print sheet, and the search metadata leave it out.
const outbound = (d) => list(d.links).filter((l) => !l.hero_only);

const SECTION_ORDER = ["profile", "experience", "education", "volunteering", "skills"];

export function visibleSections(d) {
  const has = {
    profile: true,
    experience: list(d.experience).length > 0,
    education: list(d.education).length > 0,
    volunteering: list(d.volunteering).length > 0,
    skills: nonEmpty(d.skills).length + nonEmpty(d.honors).length > 0,
  };
  return SECTION_ORDER.filter((k) => has[k]);
}

const sectionText = (d, key, field) => d.sections?.[key]?.[field] ?? key;
// The nav can use a shorter name than the section title ("Skills" for "Skills & honors").
const navText = (d, key) => d.sections?.[key]?.nav || sectionText(d, key, "title");
// A fact has a value and an optional second line, or a list of items (Focus).
const factItems = (f) => nonEmpty(f.items);
const sectionNumber = (d, key) => String(visibleSections(d).indexOf(key) + 1).padStart(2, "0");

function bullets(points, path, cls = "entry-points") {
  const items = list(points)
    .map((p, i) => (String(p).trim() ? `  <li${ed(`${path}.${i}`)}>${e(p)}</li>` : ""))
    .filter(Boolean);
  return items.length ? `<ul class="${cls}">\n${items.join("\n")}\n</ul>` : "";
}

const indent = (block, n) => block.split("\n").map((l) => (l ? " ".repeat(n) + l : l)).join("\n");

function sectionHead(d, key, { titled = true } = {}) {
  const label = `<p class="label"${titled ? ' aria-hidden="true"' : ""}><span class="label-num">${sectionNumber(d, key)}</span><span${ed(`sections.${key}.label`)}>${e(sectionText(d, key, "label"))}</span></p>`;
  const title = titled ? `\n  <h2 id="${key}-title" class="section-title"${ed(`sections.${key}.title`)}>${e(sectionText(d, key, "title"))}</h2>` : "";
  return `<div class="section-head">\n  ${label}${title}\n</div>`;
}

function navLinks(d) {
  return visibleSections(d).map((k) => `<a href="#${k}">${e(navText(d, k))}</a>`).join("\n");
}

// ---------- head ----------
export const pageTitle = (d) => [d.name, d.title].filter((x) => String(x ?? "").trim()).join(" — ");

function renderHead(d) {
  const site = d.site || {};
  const url = `https://${site.domain}/`;
  const title = pageTitle(d);
  const blurb = site.share || nonEmpty(d.about).join(" | ") || d.title;
  const version = (site.image_version ?? 1);
  const [first, last] = nameParts(d.name);
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: d.name,
    jobTitle: d.title,
    url,
    image: `${url}icons/icon-512.png`,
    ...(site.employer
      ? { worksFor: { "@type": "Organization", name: site.employer, ...(site.employer_parent ? { parentOrganization: { "@type": "Organization", name: site.employer_parent } } : {}) } }
      : {}),
    alumniOf: list(d.education).map((x) => ({ "@type": "CollegeOrUniversity", name: x.school })),
    knowsAbout: list(d.facts).flatMap(factItems),
    sameAs: outbound(d).map((l) => l.url),
  };
  return [
    `<title>${e(title)}</title>`,
    `<meta name="description" content="${e(site.description)}" />`,
    `<link rel="canonical" href="${e(url)}" />`,
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:site_name" content="${e(d.name)}" />`,
    `<meta property="og:title" content="${e(title)}" />`,
    `<meta property="og:description" content="${e(blurb)}" />`,
    `<meta property="og:url" content="${e(url)}" />`,
    `<meta property="og:image" content="${e(url)}icons/og-image.jpg?v=${e(version)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Stylized portrait of ${e(d.name)} in a red studio arch beside her name and title, ${e(d.title)}." />`,
    `<meta property="profile:first_name" content="${e(first)}" />`,
    `<meta property="profile:last_name" content="${e(last)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${e(title)}" />`,
    `<meta name="twitter:description" content="${e(blurb)}" />`,
    `<meta name="twitter:image" content="${e(url)}icons/og-image.jpg?v=${e(version)}" />`,
    `<script type="application/ld+json">${JSON.stringify(person).replace(/</g, "\\u003c")}</script>`,
  ].join("\n");
}

// ---------- masthead ----------
function renderMasthead(d) {
  const [first, last] = nameParts(d.name);
  const mark = (first[0] || "") + (last[0] || "");
  return (
    `<a class="wordmark" href="#top" aria-label="${e(d.name)}, back to top">\n` +
    `  <span class="wordmark-mark" aria-hidden="true">${e(mark)}</span>\n` +
    `  <span class="wordmark-name"${ed("name")}>${e(d.name)}</span>\n` +
    `</a>\n` +
    `<nav class="site-nav" aria-label="Sections">\n${indent(navLinks(d), 2)}\n</nav>`
  );
}

// ---------- hero ----------
function renderLinks(d) {
  const items = list(d.links).map((link, i) => {
    const aria = `${link.aria || `${d.name} on ${link.label}`} (opens in a new tab)`;
    if (IMAGE_LOGOS[link.logo]) {
      const [src, w, h] = IMAGE_LOGOS[link.logo];
      return (
        `  <a class="link-logo link-logo-wide link-logo-${e(link.logo)}" href="${e(link.url)}" target="_blank" rel="noopener" ` +
        `aria-label="${e(aria)}" style="--logo: url(${src}); --logo-ratio: ${w} / ${h}"${ed(`links.${i}.url`)}></a>`
      );
    }
    if (LOGOS[link.label]) {
      return (
        `  <a class="link-logo link-logo-${e(link.label.toLowerCase())}" href="${e(link.url)}" target="_blank" rel="noopener" aria-label="${e(aria)}"${ed(`links.${i}.url`)}>` +
        `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${LOGOS[link.label]}" /></svg></a>`
      );
    }
    return `  <a class="link-out" href="${e(link.url)}" target="_blank" rel="noopener"${ed(`links.${i}.label`)}>${e(link.label)}<span aria-hidden="true"> ↗</span><span class="visually-hidden"> (opens in a new tab)</span></a>`;
  });
  return `<p class="hero-links">\n${items.join('\n  <span class="link-sep" aria-hidden="true"></span>\n')}\n</p>`;
}

function renderHero(d) {
  const [first, last] = nameParts(d.name);
  const about = nonEmpty(d.about).map((p, i) => `  <span${ed(`about.${i}`)}>${e(p)}</span>`).join("\n");
  return [
    `<p class="label label-gold"${ed("title")}>${e(d.title)}</p>`,
    `<h1 id="hero-title"${ed("name")}>${e(first)} <em>${e(last)}</em></h1>`,
    `<p class="hero-statement"${ed("statement")}>${e(d.statement)}</p>`,
    about ? `<p class="about-line">\n${about}\n</p>` : "",
    list(d.links).length ? renderLinks(d) : "",
  ].filter(Boolean).join("\n");
}

function renderPortraitAlt(d) {
  return `<span class="visually-hidden" id="portrait-alt">Stylized portrait of ${e(d.name)} in a navy turtleneck with a gold pendant, against a vivid red background.</span>`;
}

// ---------- main ----------
function renderProfile(d) {
  const facts = list(d.facts).map((f, i) => {
    const items = factItems(f);
    const dd = items.length
      ? `      <dd>\n        <ul class="focus-list">\n` +
        list(f.items).map((x, j) => (String(x ?? "").trim() ? `          <li${ed(`facts.${i}.items.${j}`)}>${e(x)}</li>\n` : "")).join("") +
        `        </ul>\n      </dd>\n`
      : `      <dd><span${ed(`facts.${i}.value`)}>${e(f.value)}</span>${f.sub ? `<span class="facts-sub"${ed(`facts.${i}.sub`)}>${e(f.sub)}</span>` : ""}</dd>\n`;
    return `    <div>\n      <dt${ed(`facts.${i}.label`)}>${e(f.label)}</dt>\n${dd}    </div>`;
  }).join("\n");
  const h = d.headline || {};
  return (
    `<section class="section section-profile" id="profile" aria-labelledby="profile-title">\n` +
    indent(sectionHead(d, "profile", { titled: false }), 2) + "\n" +
    `  <div class="profile-grid">\n` +
    `    <h2 id="profile-title"><span${ed("headline.text")}>${e(h.text)}</span> <em${ed("headline.emphasis")}>${e(h.emphasis)}</em></h2>\n` +
    (facts ? `    <dl class="facts">\n${indent(facts, 2)}\n    </dl>\n` : "") +
    `  </div>\n</section>`
  );
}

function renderExperience(d) {
  const rows = list(d.experience).map((job, i) => {
    const p = `experience.${i}`;
    const meta = [job.type, job.location].filter(Boolean).map((x) => e(x)).join(" · ");
    const skills = nonEmpty(job.skills);
    return (
      `<li class="entry">\n` +
      `  <p class="entry-dates"><time${ed(`${p}.dates`)}>${e(job.dates)}</time></p>\n` +
      `  <div class="entry-body">\n` +
      `    <h3 class="entry-role"${ed(`${p}.role`)}>${e(job.role)}</h3>\n` +
      `    <p class="entry-org"${ed(`${p}.organization`)}>${e(job.organization)}</p>\n` +
      (meta ? `    <p class="entry-meta"${ed(`${p}.type`)}>${meta}</p>\n` : "") +
      (bullets(job.points, `${p}.points`) ? indent(bullets(job.points, `${p}.points`), 4) + "\n" : "") +
      (skills.length
        ? `    <p class="entry-skills-label">Skills shown</p>\n    <ul class="entry-skills">${skills.map((s, j) => `<li${ed(`${p}.skills.${j}`)}>${e(s)}</li>`).join("")}</ul>\n`
        : "") +
      `  </div>\n</li>`
    );
  });
  return (
    `<section class="section section-experience" id="experience" aria-labelledby="experience-title">\n` +
    indent(sectionHead(d, "experience"), 2) + "\n" +
    `  <ol class="timeline">\n${indent(rows.join("\n"), 4)}\n  </ol>\n</section>`
  );
}

function renderEducation(d) {
  const rows = list(d.education).map((edu, i) => {
    const p = `education.${i}`;
    const studies = nonEmpty(edu.studies);
    const details = bullets(edu.details, `${p}.details`, "edu-details");
    return (
      `<li class="edu">\n` +
      `  <p class="entry-dates"><time${ed(`${p}.dates`)}>${e(edu.dates)}</time></p>\n` +
      `  <h3 class="edu-school"${ed(`${p}.school`)}>${e(edu.school)}</h3>\n` +
      (studies.length ? `  <ul class="edu-studies">${studies.map((s, j) => `<li${ed(`${p}.studies.${j}`)}>${e(s)}</li>`).join("")}</ul>\n` : "") +
      (details ? indent(details, 2) + "\n" : "") +
      `</li>`
    );
  });
  return (
    `<div class="split-col" id="education" aria-labelledby="education-title">\n` +
    indent(sectionHead(d, "education"), 2) + "\n" +
    `  <ol class="edu-list">\n${indent(rows.join("\n"), 4)}\n  </ol>\n</div>`
  );
}

function renderVolunteering(d) {
  const rows = list(d.volunteering).map((v, i) => {
    const p = `volunteering.${i}`;
    const pts = bullets(v.points, `${p}.points`);
    return (
      `<li class="vol">\n` +
      `  <p class="entry-dates"><time${ed(`${p}.dates`)}>${e(v.dates)}</time></p>\n` +
      `  <h3 class="entry-role"${ed(`${p}.role`)}>${e(v.role)}</h3>\n` +
      `  <p class="entry-org"${ed(`${p}.organization`)}>${e(v.organization)}</p>\n` +
      (pts ? indent(pts, 2) + "\n" : "") +
      `</li>`
    );
  });
  return (
    `<div class="split-col" id="volunteering" aria-labelledby="volunteering-title">\n` +
    indent(sectionHead(d, "volunteering"), 2) + "\n" +
    `  <ol class="vol-list">\n${indent(rows.join("\n"), 4)}\n  </ol>\n</div>`
  );
}

function renderSkills(d) {
  const col = (label, items, key, cls) =>
    items.length
      ? `  <div class="skills-col">\n    <h3 class="skills-label">${label}</h3>\n    <ul class="${cls}">\n` +
        items.map((s, i) => `      <li${ed(`${key}.${i}`)}>${e(s)}</li>`).join("\n") +
        `\n    </ul>\n  </div>`
      : "";
  const cols = [col("Skills", nonEmpty(d.skills), "skills", "skill-list"), col("Honors", nonEmpty(d.honors), "honors", "skill-list skill-list-honors")].filter(Boolean);
  return (
    `<section class="section section-skills" id="skills" aria-labelledby="skills-title">\n` +
    indent(sectionHead(d, "skills"), 2) + "\n" +
    `  <div class="skills-grid${cols.length === 1 ? " skills-grid-one" : ""}">\n${cols.join("\n")}\n  </div>\n</section>`
  );
}

function renderMain(d) {
  const shown = visibleSections(d);
  const parts = [`<nav class="section-bar" aria-label="Sections">\n${indent(navLinks(d), 2)}\n</nav>`, renderProfile(d)];
  if (shown.includes("experience")) parts.push(renderExperience(d));
  const split = [shown.includes("education") && renderEducation(d), shown.includes("volunteering") && renderVolunteering(d)].filter(Boolean);
  if (split.length) {
    parts.push(
      `<section class="section section-split${split.length === 1 ? " section-split-one" : ""}" aria-label="${split.length === 2 ? "Education and volunteering" : shown.includes("education") ? "Education" : "Volunteering"}">\n` +
      indent(split.join("\n"), 2) + `\n</section>`
    );
  }
  if (shown.includes("skills")) parts.push(renderSkills(d));
  return parts.join("\n");
}

// ---------- footer ----------
function renderFooterName(d) {
  return `<p class="footer-name"${ed("name")}>${e(d.name)}<span${ed("title")}>${e(d.title)}</span></p>`;
}

function renderFooterLinks(d) {
  return outbound(d)
    .map((l) => `<a href="${e(l.url)}" target="_blank" rel="noopener">${e(l.label)}<span class="visually-hidden"> (opens in a new tab)</span></a>`)
    .join("\n");
}

// ---------- print ----------
// The printed résumé. Only @media print shows this block. The layout flows:
// the browser makes as many US Letter pages as the content needs, so a short
// profile prints on one page and no page prints empty. The red card
// (skills, honors, links) floats at the right of the main column.
// No element depends on a fixed page height or on @page margins, so the
// sheet prints the same in Chrome, Safari, and Firefox.
function renderPrint(d) {
  const [first, last] = nameParts(d.name);
  const about = nonEmpty(d.about);
  const li = (items) => nonEmpty(items).map((x) => `<li>${e(x)}</li>`).join("");
  const entry = (j) => {
    const meta = [j.type, j.location].filter(Boolean).join(" · ");
    const skills = nonEmpty(j.skills);
    return (
      `<li class="ps-entry"><p class="ps-dates">${e(j.dates)}</p><div>` +
      `<h3 class="ps-role">${e(j.role)}</h3><p class="ps-org">${e(j.organization)}</p>` +
      (meta ? `<p class="ps-meta">${e(meta)}</p>` : "") +
      (li(j.points) ? `<ul class="ps-points">${li(j.points)}</ul>` : "") +
      (skills.length ? `<p class="ps-skills-shown">Skills shown: ${e(skills.join(", "))}</p>` : "") +
      `</div></li>`
    );
  };
  const school = (x) =>
    `<li class="ps-entry"><p class="ps-dates">${e(x.dates)}</p><div>` +
    `<h3 class="ps-role">${e(x.school)}</h3>` +
    (nonEmpty(x.studies).length ? `<p class="ps-org">${e(nonEmpty(x.studies).join(" · "))}</p>` : "") +
    (li(x.details) ? `<ul class="ps-points">${li(x.details)}</ul>` : "") +
    `</div></li>`;
  const block = (key, items, fn) =>
    list(items).length ? `<h2 class="ps-section">${e(sectionText(d, key, "title"))}</h2><ol class="ps-list">${list(items).map(fn).join("")}</ol>` : "";
  const facts = list(d.facts)
    .map((f) => `<div><p class="ps-label">${e(f.label)}</p>` +
      (factItems(f).length ? `<ul>${li(f.items)}</ul>` : `<p>${e(f.value)}${f.sub ? `<br /><span class="ps-soft">${e(f.sub)}</span>` : ""}</p>`) + `</div>`)
    .join("");
  const links = outbound(d)
    .map((l) => `<li><span class="ps-side-k">${e(l.label)}</span>${e(l.url.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, ""))}</li>`)
    .join("");
  const side = (title, items, cls = "ps-side-list") => (li(items) ? `<h2 class="ps-side-h">${title}</h2><ul class="${cls}">${li(items)}</ul>` : "");
  const domain = d.site?.domain ? ` · ${e(d.site.domain)}` : "";
  return `<section class="print-sheet" aria-hidden="true">
  <header class="ps-head">
    <div class="ps-head-text">
      <p class="ps-kicker">${e(d.title)}</p>
      <h2 class="ps-name">${e(first)} <em>${e(last)}</em></h2>
      <p class="ps-about">${about.map((x) => `<span>${e(x)}</span>`).join("")}</p>
    </div>
    <div class="ps-photo"><img src="/center.webp" alt="" /></div>
  </header>
  ${facts ? `<div class="ps-facts">${facts}</div>` : ""}
  <div class="ps-body">
    <aside class="ps-side">
      ${side("Skills", d.skills)}
      ${side("Honors", d.honors, "ps-side-list ps-side-italic")}
      ${links ? `<h2 class="ps-side-h">Online</h2><ul class="ps-side-links">${links}</ul>` : ""}
    </aside>
    ${block("experience", d.experience, entry)}
    ${block("education", d.education, school)}
    ${block("volunteering", d.volunteering, (v) => entry({ ...v, type: "", location: "" }))}
  </div>
  <footer class="ps-foot">${e(d.name)} — ${e(d.title)}${domain}</footer>
</section>`;
}

// The profile itself, for the editor. "</" is escaped so the JSON cannot close the script element.
function renderData(d) {
  return `<script type="application/json" id="profile-data">${JSON.stringify(d).replace(/<\//g, "<\\/")}</script>`;
}

export const REGIONS = {
  head: renderHead,
  masthead: renderMasthead,
  hero: renderHero,
  "portrait-alt": renderPortraitAlt,
  main: renderMain,
  "footer-name": renderFooterName,
  "footer-links": renderFooterLinks,
  print: renderPrint,
  data: renderData,
};

// Node build: replace each region in the page text. The region keeps the indent of its opening marker.
export function renderPage(page, data) {
  for (const [name, fn] of Object.entries(REGIONS)) {
    const re = new RegExp(`([ \\t]*)<!-- render:${name} -->\\n[\\s\\S]*?\\n?[ \\t]*<!-- /render:${name} -->`);
    const match = page.match(re);
    if (!match) throw new Error(`index.html has no render:${name} region`);
    const pad = match[1];
    const body = indent(fn(data), pad.length);
    const replacement = `${pad}<!-- render:${name} -->\n${body}\n${pad}<!-- /render:${name} -->`;
    page = page.slice(0, match.index) + replacement + page.slice(match.index + match[0].length);
  }
  return page;
}
