# Lily Kubala — résumé site

This is a static, single-page résumé with an interactive portrait. The portrait is a 64-frame ring that the extractor takes from one character video before runtime. A canvas shows one frame at a time. The cursor angle around Lily's face selects the frame.

## Run the site

```bash
python3 -m http.server 4173 -d public
```

Open `http://localhost:4173/`. To see the static fallback, open `http://localhost:4173/?portrait=static`.

## Layout

```
content/profile.json          résumé facts (the only content source)
public/index.html             layout; render:* regions come from profile.json
public/js/render.js           the one renderer: profile.json -> every render:* region (Node build and editor)
public/js/editor.js           site editor: password switch, edit panel, live render, publish
public/editor.css             editor switch, dialog, and panel
public/edit/lock.json         editor password hash, publish target, sealed GitHub token
public/styles.css             visual system, portrait edge treatment, print styles
public/js/main.js             portrait player: modes, angle smoothing, frame selection
public/js/manifest.js         loads frames/metadata.json; FrameStore preload queue
public/js/renderer.js         canvas renderer: one frame per draw, 100% opacity
public/js/controller.js       pointer, touch, and keyboard input -> target angle
public/js/stage.js            wide screens: the portrait at 2/3 of the width, docking at the right edge
public/js/companion.js        phones: the portrait travels into the corner when the hero face scrolls away
public/character.mp4          source video, 1080x1920, 24 fps, 239 frames
public/frames/                frame_000.webp ... frame_063.webp, metadata.json
public/center.webp            frontal frame with direct eye contact
scripts/extract_video_frames.py   video -> cutout frames, center.webp, metadata.json
scripts/matte/                Vision subject-lift mask tool (Swift) and cutout clean-up (matte.py)
scripts/render_content.mjs    profile.json -> index.html render regions (uses public/js/render.js)
scripts/edit_lock.mjs         set the editor password; seal or test the GitHub token
scripts/check_site.py         static checks (facts, contact, transforms, frames)
scripts/verify_browser.mjs    headless Chrome checks (input, modes, layout)
```

## Cutout frames and the living surface

The video frame cuts Lily's hair at its left, right, and bottom edges, and its red background is not even. A feather over the frame rectangle therefore always shows as a soft box. For this reason, the extractor removes the background from every frame:

1. `scripts/matte/lift_mask.swift` gets a soft mask from the macOS Vision subject-lift model.
2. `scripts/matte/matte.py` keeps the soft mask and the original edge colors (default mode). A `clean` mode exists for a background that is not red: it tightens the edge, extends interior colors into it, and limits red rim light.
3. Alpha falls to 0 over the last 7% of each side and the last 16% of the bottom, where the video frame cuts the hair.

The frames are RGBA WebP, and `metadata.json` records `"alpha": true`. Without Swift, the extractor writes opaque frames. `--no-matte` forces that path, and the page then feathers the rectangle as before.

The red behind her is a studio arch: a soft CSS arch in the exact red of the video background, just behind her head and hair, down to the chest. A dim brown falloff surrounds it, and the rest of the page is black. The cutout keeps its original soft edge colors, which came from that same red, so an imperfect mask pixel lands red-on-red. The browser blurs the arch once at full resolution, and its slow breathing animates transform only. A faint noise layer over the page dithers the dark gradients, so they show no bands.

## Layout and scroll behavior

- **Wide screens (1024 px and wider).** The portrait is a fixed layer. At the top of the page, its center is at 2/3 of the window width. As the page scrolls through 70% of a window height, the portrait moves to a dock at the right edge at 0.8 scale. The résumé text keeps clear of the dock (`--rail`). The portrait is 86% of the window height. The gaze tracks the cursor at all times, and it re-aims when the page scrolls under a still cursor.
- **Phones and tablets.** The hero portrait is full-bleed at the top and stays in the page. When the face scrolls away, the portrait travels into the lower-right corner. `companion.js` puts a small portrait exactly over the hero's head and shoulders, hides the hero canvas, then animates the small portrait into the corner. When the face comes back, it travels back and the hero canvas shows again. Both draw the same frame, so the small portrait follows the finger. An IntersectionObserver drives the move, and only transform and opacity animate, so iOS toolbar resizes do not move it. A tap on the small portrait scrolls to the top.
- **Touch.** Lily follows the finger anywhere on the page, also during a scroll. The touch listeners are passive, so they never block scrolling. After the finger lifts, she returns to eye contact.

## Print

"Print résumé" (`window.print()`) prints a US Letter résumé, not the screen layout. `render.js` writes the `.print-sheet` block from `profile.json`. Only `@media print` shows it.

The sheet flows. The browser makes as many pages as the content needs, and the current content fills 2 pages. The order is the header with the headshot, the profile facts, then experience, education, and volunteering. A red card with skills, honors, and LinkedIn floats at the right of the experience.

The sheet has no fixed page height and needs no `@page` margins. For this reason, it prints the same in Chrome, Safari, and Firefox, and with any margin in the print dialog. The sheet uses no CSS mask, because WebKit prints a masked image as a black box.

`verify_browser.mjs` prints the page to PDF in Chrome. It checks that the PDF has 1 or 2 pages and that the print sheet has no masked element. To see the Safari result, run `scripts/print_webkit.swift`:

```bash
swiftc -O -o /tmp/print_webkit scripts/print_webkit.swift
/tmp/print_webkit http://localhost:4173/ /tmp/resume-webkit.pdf
```

## Links

`profile.json` → `links` holds outbound links that come from a real source. At present, that is LinkedIn, which the site owner supplied. `check_site.py` fails on any other social or contact link.

## Hosting (GitHub Pages)

The site deploys like davesgames-site. `.github/workflows/pages.yml` runs on every push to `main`. It renders `profile.json` with `scripts/render_content.mjs`, runs `scripts/check_site.py`, builds `dist/` with `scripts/build_dist.sh`, and publishes `dist/` to GitHub Pages. `public/CNAME` sets the domain to `lilykubala.com`.

One-time setup:

1. In GitHub, go to the repository Settings, then Pages. Set Source to "GitHub Actions".
2. Push to `main`, and let the workflow finish.
3. In the same Pages settings, set Custom domain to `lilykubala.com`.
4. In Squarespace, open Domains, then lilykubala.com, then DNS. Delete the Squarespace default records for `@` and `www`.
5. Add these custom records:
   - `@` A `185.199.108.153`
   - `@` A `185.199.109.153`
   - `@` A `185.199.110.153`
   - `@` A `185.199.111.153`
   - `www` CNAME `davesgames123.github.io`
6. After GitHub verifies the domain, select "Enforce HTTPS".

## Change the résumé content

There are two ways to change the content: the site editor on the live page, or an edit of `content/profile.json` in the repository. Both change only `profile.json`. The page is static HTML, so the résumé reads and prints without JavaScript.

### Edit the site on the page

1. Open `https://lilykubala.com/#edit`, or click "Edit site" in the footer.
2. Type the editor password, then click "Unlock".
3. Change the fields in the panel. To go to the field of a text, click that text on the page.
4. Click "Publish". The live site shows the change after 1–2 minutes.

The draft stays in the browser, so a reload does not delete it. "Discard changes" goes back to the published profile. When no token is sealed, "Publish" downloads `profile.json`, and the site owner must commit that file.

### Set up direct publishing

Publish needs a GitHub token. `lock.json` keeps the token encrypted with a key that comes from the editor password. The page source is public, so the token must have the smallest possible access.

1. In GitHub, open Settings, then Developer settings, then Fine-grained tokens. Click "Generate new token".
2. Set Repository access to "Only select repositories", and select `DavesGames123/lilysite`.
3. Under Repository permissions, set Contents to "Read and write". Do not add other permissions.
4. Generate the token, and copy it to the clipboard.
5. Run this command:

```bash
EDIT_TOKEN="$(pbpaste)" node scripts/edit_lock.mjs seal
```

6. Type the editor password at the prompt. To test the result, run `node scripts/edit_lock.mjs unseal-test`.
7. Commit `public/edit/lock.json`, then push.

WARNING: Do not commit or paste a plain token. A plain token in the public repository gives write access to anyone who reads it.

CAUTION: A new editor password (`edit_lock.mjs password`) clears the sealed token. After a password change, seal the token again.

The encrypted token is public, so its safety depends on the password. A long password makes an offline guess slow. When the token expires, Publish reports "GitHub rejected the token". Make a new token, and seal it again.

### Edit profile.json in the repository

1. Edit `content/profile.json`. Use only facts from a real source.
2. Run `node scripts/render_content.mjs`.
3. Run `python3 scripts/check_site.py`.

The Pages workflow also runs `render_content.mjs` before the checks, because the editor commits only `profile.json`.

## Replace the character video and extract frames

1. Copy the new video to `public/character.mp4`. The video must be 9:16.
2. Install the requirements: `python3 -m pip install -r requirements.txt`.
3. Make a contact sheet and find the frames where the head points up, left, down, and right.
4. Edit `KEYFRAMES` and `CENTER_SOURCE_FRAME` at the top of `scripts/extract_video_frames.py`.
5. Run `python3 scripts/extract_video_frames.py`.
6. Run `python3 scripts/check_site.py` and `node scripts/verify_browser.mjs`.

The extractor reads the frame count, the dimensions, and the frame rate from the video. It writes 64 WebP frames, `public/center.webp`, and `public/frames/metadata.json`. Options: `--width` (default 864), `--quality` (default 86), and `--center-frame`.

### Why the extractor uses angle annotations

The current video does not start with a clean circle. Its segments are as follows:

| Source frames | Content | Use |
|---|---|---|
| 0–5 | close-up at a larger scale | not used, because the scale jumps |
| 6–17 | transition out of the frontal pose | not used |
| 18–180 | one full look-around, counter-clockwise on screen | ring frames |
| 184–238 | upward hold, a blink near 212, then a frontal pose | frame 232 is `center.webp` |

The extractor takes the 64 ring frames from frames 18–180. It spaces them evenly in head angle, not in time, because the turn speed is not constant. Ring index `i` has the screen angle `-90° - i × 5.625°`. Index 0 looks up, 16 looks left, 32 looks down, and 48 looks right. The keyframe angles are hand annotations, with an accuracy of approximately ±15°.

## Runtime behavior

- **Angle.** The angle is `Math.atan2(dy, dx)` from the face center at (0.50, 0.36) of the frame. Mouse and pen input work anywhere in the window. Touch input works when you drag on the portrait.
- **Smoothing.** The player uses shortest-path circular interpolation, with a response of 0.26 for each 60 Hz frame. The response is corrected for the frame time.
- **Frame selection.** The player selects the nearest ring index from 0 to 63. If that frame is not loaded, the player draws the nearest loaded frame. The player never blends two frames.
- **Dead zone.** Within 12% of the portrait radius (half the long side of the field), the player draws `center.webp`, which gives direct eye contact.
- **Preload.** The player loads `center.webp` first. Frames near the requested index load next. The other frames load at idle time or at the first input, nearest first, four at a time. A failed frame is not requested again.
- **Keyboard.** The arrow keys point the gaze, and two keys together give a diagonal. Escape, Home, or 0 returns to eye contact. "Reset gaze" does the same.
- **Reduced motion.** With `prefers-reduced-motion: reduce`, the player shows `center.webp` only. It loads no ring frames and does not listen for pointer input.
- **Fallback.** When `frames/metadata.json` or `center.webp` is absent, the page draws the approved still portrait (`public/assets/lily/lily_stylized_approved.png`). The page then says "Still portrait — animation frames not installed". The code path has the label FALLBACK PATH in `public/js/main.js`.
- **Missing ring frames.** If `metadata.json` and `center.webp` load but the ring frames fail, the player holds eye contact. The page then says "Still portrait — animation frames not installed", in mode `still`.
- **Edge treatment.** The front canvas has a soft mask on each edge. A small copy of the same frame sits behind it at 1.14 × 1.07 scale, with a 52 px blur. The red field continues past the frame edge and fades into the near-black page. The site uses no CSS rotation, perspective, or 3D transforms.

## Validation

```bash
python3 scripts/check_site.py
node scripts/verify_browser.mjs --shots /tmp/lily-shots   # needs the server on :4173 and Google Chrome
EDIT_PASSWORD=... node scripts/verify_browser.mjs           # also runs the editor checks
```

The editor checks run only when `EDIT_PASSWORD` is set, so the password is never in the repository.

`verify_browser.mjs` uses the Chrome DevTools Protocol directly. It needs no npm packages.

## Earlier work in this repository

The `generator/` package and `scripts/build_eye_rig.py` come from earlier approaches: a 9 × 5 phi/theta image grid and a 2D eye rig. The page does not use them. Their outputs stay in `assets/`, `output/`, and `public/assets/lily/` for reference.
# lilysite
