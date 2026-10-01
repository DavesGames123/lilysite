"""Render content/profile.json into the marked regions of public/index.html.

The page stays static HTML, so the resume reads without JavaScript and prints
cleanly. Only the regions between `<!-- render:NAME -->` and
`<!-- /render:NAME -->` change. All other markup in index.html is layout.

Usage:
    python3 scripts/render_content.py           # rewrite public/index.html
    python3 scripts/render_content.py --check   # exit 1 if the page is stale
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content" / "profile.json"
PAGE = ROOT / "public" / "index.html"


def e(text: str) -> str:
    return escape(text, quote=True)


def indent(block: str, spaces: int) -> str:
    pad = " " * spaces
    return "\n".join(pad + line if line else line for line in block.splitlines())


def bullets(points: list[str], cls: str = "entry-points") -> str:
    if not points:
        return ""
    items = "\n".join(f"  <li>{e(p)}</li>" for p in points)
    return f'<ul class="{cls}">\n{items}\n</ul>'


def render_about(data: dict) -> str:
    parts = [p.strip() for p in data["about"].split("|")]
    spans = '\n'.join(f"  <span>{e(p)}</span>" for p in parts)
    return f'<p class="about-line">\n{spans}\n</p>'


def render_focus(data: dict) -> str:
    items = "\n".join(f"  <li>{e(f)}</li>" for f in data["focus"])
    return f'<ul class="focus-list">\n{items}\n</ul>'


def render_links(data: dict) -> str:
    items = "\n".join(
        f'  <a class="link-out" href="{e(link["url"])}" target="_blank" rel="noopener">{e(link["label"])}<span aria-hidden="true"> ↗</span><span class="visually-hidden"> (opens in a new tab)</span></a>'
        for link in data.get("links", [])
    )
    return f'<p class="hero-links">\n{items}\n</p>'


def render_footer_links(data: dict) -> str:
    return "\n".join(
        f'<a href="{e(link["url"])}" target="_blank" rel="noopener">{e(link["label"])}<span class="visually-hidden"> (opens in a new tab)</span></a>'
        for link in data.get("links", [])
    )


def render_experience(data: dict) -> str:
    rows = []
    for job in data["experience"]:
        meta = " · ".join(x for x in (job["type"], job["location"]) if x)
        skills = ""
        if job["skills"]:
            tags = "".join(f"<li>{e(s)}</li>" for s in job["skills"])
            skills = f'\n    <p class="entry-skills-label">Skills shown</p>\n    <ul class="entry-skills">{tags}</ul>'
        points = bullets(job["points"])
        rows.append(
            f'<li class="entry">\n'
            f'  <p class="entry-dates"><time>{e(job["dates"])}</time></p>\n'
            f'  <div class="entry-body">\n'
            f'    <h3 class="entry-role">{e(job["role"])}</h3>\n'
            f'    <p class="entry-org">{e(job["organization"])}</p>\n'
            + (f'    <p class="entry-meta">{e(meta)}</p>\n' if meta else "")
            + (indent(points, 4) + "\n" if points else "")
            + (skills[1:] + "\n" if skills else "")
            + "  </div>\n</li>"
        )
    return '<ol class="timeline">\n' + indent("\n".join(rows), 2) + "\n</ol>"


def render_education(data: dict) -> str:
    edu = data["education"]
    studies = "".join(f"<li>{e(s)}</li>" for s in edu["studies"])
    details = "\n".join(f"  <li>{e(d)}</li>" for d in edu["details"])
    return (
        f'<p class="entry-dates"><time>{e(edu["dates"])}</time></p>\n'
        f'<h3 class="edu-school">{e(edu["school"])}</h3>\n'
        f'<ul class="edu-studies">{studies}</ul>\n'
        f'<ul class="edu-details">\n{details}\n</ul>'
    )


def render_volunteering(data: dict) -> str:
    rows = []
    for item in data["volunteering"]:
        rows.append(
            f'<li class="vol">\n'
            f'  <p class="entry-dates"><time>{e(item["dates"])}</time></p>\n'
            f'  <h3 class="entry-role">{e(item["role"])}</h3>\n'
            f'  <p class="entry-org">{e(item["organization"])}</p>\n'
            + indent(bullets(item["points"]), 2)
            + "\n</li>"
        )
    return '<ol class="vol-list">\n' + indent("\n".join(rows), 2) + "\n</ol>"


def render_skills(data: dict) -> str:
    skills = "\n".join(f"  <li>{e(s)}</li>" for s in data["skills"])
    honors = "\n".join(f"  <li>{e(h)}</li>" for h in data["honors"])
    return (
        '<div class="skills-col">\n  <h3 class="skills-label">Skills</h3>\n'
        f'  <ul class="skill-list">\n{indent(skills, 2)}\n  </ul>\n</div>\n'
        '<div class="skills-col">\n  <h3 class="skills-label">Honors</h3>\n'
        f'  <ul class="skill-list skill-list-honors">\n{indent(honors, 2)}\n  </ul>\n</div>'
    )


def render_print(data: dict) -> str:
    """Two-page US Letter résumé. Only @media print shows this block."""
    first, _, last = data["name"].partition(" ")
    about = "".join(f"<span>{e(p.strip())}</span>" for p in data["about"].split("|"))
    jobs = []
    for job in data["experience"]:
        meta = " · ".join(x for x in (job["type"], job["location"]) if x)
        pts = "".join(f"<li>{e(p)}</li>" for p in job["points"])
        skills = ""
        if job["skills"]:
            skills = f'<p class="ps-skills-shown">Skills shown: {e(", ".join(job["skills"]))}</p>'
        jobs.append(
            '<li class="ps-job">'
            f'<p class="ps-dates">{e(job["dates"])}</p>'
            '<div>'
            f'<h3 class="ps-role">{e(job["role"])}</h3>'
            f'<p class="ps-org">{e(job["organization"])}</p>'
            + (f'<p class="ps-meta">{e(meta)}</p>' if meta else "")
            + (f'<ul class="ps-points">{pts}</ul>' if pts else "")
            + skills
            + "</div></li>"
        )
    edu = data["education"]
    vols = "".join(
        '<li class="ps-job ps-vol">'
        f'<p class="ps-dates">{e(v["dates"])}</p>'
        '<div>'
        f'<h3 class="ps-role">{e(v["role"])}</h3>'
        f'<p class="ps-org">{e(v["organization"])}</p>'
        f'<ul class="ps-points">{"".join(f"<li>{e(p)}</li>" for p in v["points"])}</ul>'
        "</div></li>"
        for v in data["volunteering"]
    )
    links = "".join(
        f'<li><span class="ps-side-k">{e(l["label"])}</span>{e(l["url"].replace("https://www.", "").rstrip("/"))}</li>'
        for l in data.get("links", [])
    )
    focus = "".join(f"<li>{e(f)}</li>" for f in data["focus"])
    skills = "".join(f"<li>{e(x)}</li>" for x in data["skills"])
    honors = "".join(f"<li>{e(x)}</li>" for x in data["honors"])
    return f"""<section class="print-sheet" aria-hidden="true">
  <article class="ps-page">
    <header class="ps-head">
      <div class="ps-head-text">
        <p class="ps-kicker">{e(data["title"])}</p>
        <h2 class="ps-name">{e(first)} <em>{e(last)}</em></h2>
        <p class="ps-about">{about}</p>
      </div>
      <div class="ps-photo"><img src="/center.webp" alt="" /></div>
    </header>
    <div class="ps-facts">
      <div><p class="ps-label">Current</p><p>{e(data["current"]["organization"])}<br /><span class="ps-soft">{e(data["current"]["parent"])}</span></p></div>
      <div><p class="ps-label">Focus</p><ul>{focus}</ul></div>
      <div><p class="ps-label">Education</p><p>{e(edu["school"])}<br /><span class="ps-soft">{e(" · ".join(edu["studies"]))}</span></p></div>
    </div>
    <h2 class="ps-section">Experience</h2>
    <ol class="ps-list">{"".join(jobs)}</ol>
    <footer class="ps-foot"><span>{e(data["name"])} — {e(data["title"])}</span><span>1 / 2</span></footer>
  </article>
  <article class="ps-page ps-page-2">
    <div class="ps-main">
      <h2 class="ps-section ps-section-first">Education</h2>
      <div class="ps-edu">
        <p class="ps-dates">{e(edu["dates"])}</p>
        <div>
          <h3 class="ps-role">{e(edu["school"])}</h3>
          <p class="ps-org">{e(" · ".join(edu["studies"]))}</p>
          <ul class="ps-points">{"".join(f"<li>{e(d)}</li>" for d in edu["details"])}</ul>
        </div>
      </div>
      <h2 class="ps-section">Volunteering</h2>
      <ol class="ps-list">{vols}</ol>
      <div class="ps-closing">
        <p class="ps-label">Focus</p>
        <p class="ps-closing-text">{"<br />".join(e(p.strip()) for p in data["about"].split("|"))}</p>
      </div>
    </div>
    <aside class="ps-side">
      <p class="ps-side-name">{e(first)}<br /><em>{e(last)}</em></p>
      <h2 class="ps-side-h">Skills</h2>
      <ul class="ps-side-list">{skills}</ul>
      <h2 class="ps-side-h">Honors</h2>
      <ul class="ps-side-list ps-side-italic">{honors}</ul>
      <h2 class="ps-side-h">Online</h2>
      <ul class="ps-side-links">{links}</ul>
      <div class="ps-side-photo"><img src="/center.webp" alt="" /></div>
    </aside>
    <footer class="ps-foot"><span>{e(data["name"])} — {e(data["title"])}</span><span>2 / 2</span></footer>
  </article>
</section>"""


RENDERERS = {
    "about": render_about,
    "focus": render_focus,
    "links": render_links,
    "footer-links": render_footer_links,
    "experience": render_experience,
    "education": render_education,
    "volunteering": render_volunteering,
    "skills": render_skills,
    "print": render_print,
}


def render(page: str, data: dict) -> str:
    for name, fn in RENDERERS.items():
        pattern = re.compile(rf"([ \t]*)<!-- render:{name} -->\n.*?\n?[ \t]*<!-- /render:{name} -->", re.S)
        match = pattern.search(page)
        if not match:
            raise SystemExit(f"index.html has no render:{name} region")
        pad = match.group(1)
        body = indent(fn(data), len(pad))
        replacement = f"{pad}<!-- render:{name} -->\n{body}\n{pad}<!-- /render:{name} -->"
        page = page[: match.start()] + replacement + page[match.end():]
    return page


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="report whether index.html is current; do not write")
    args = parser.parse_args()
    data = json.loads(CONTENT.read_text(encoding="utf-8"))
    current = PAGE.read_text(encoding="utf-8")
    rendered = render(current, data)
    if args.check:
        if rendered != current:
            print("index.html is stale: run python3 scripts/render_content.py")
            return 1
        print("index.html matches content/profile.json")
        return 0
    PAGE.write_text(rendered, encoding="utf-8")
    print(f"rendered {len(RENDERERS)} regions into {PAGE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
