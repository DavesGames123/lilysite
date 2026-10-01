# Claude build brief: Lily Kubala resume website

You are a senior product designer, frontend engineer, motion designer, and creative technologist. Build a finished, responsive resume website for Lily Kubala inside the supplied project. Do not return a concept, mockup, or code fragments: inspect the project, implement the site, run it, and verify the result.

## Core outcome

Create a memorable, elegant, professional portfolio/resume site for Lily Kubala. It should feel warm, intelligent, international, editorial, and highly polished. The character portrait is the visual anchor, but the site must also function as a clear resume for a real professional.

Use the approved stylized portrait at:

`assets/references/lily_stylized_approved.png`

Original identity references are available at:

- `assets/references/lily_original_graduation.jpg`
- `assets/references/lily_original_profile.jpg`

Treat the stylized portrait as the exact visual identity/style source. Do not replace it with a generic AI avatar, a different person, or a new visual style.

## Character interaction workflow

The intended workflow is one coherent character animation video generated from the approved stylized image, followed by offline frame extraction and a crisp canvas-based frame selector.

### Source video

The current source video is available in Downloads as `Character_head_rotation_animation_1080p_20261001123453.mp4`. It is 1080×1920, 9:16, 24 fps, and approximately 10 seconds long. Copy it to:

`public/character.mp4`

Do not generate unrelated PNG views as a substitute.

### 9:16 presentation and edge treatment

Preserve the source video’s 9:16 aspect ratio. Do not crop it into a square or stretch it. The page may use a near-black background around the portrait, but the red field behind Lily must feel contiguous with the video background. Use a two-layer treatment:

- a crisp 9:16 frame on the foreground canvas;
- an enlarged, blurred, low-opacity copy of that same frame behind it;
- a soft feather/mask at the foreground edge so vivid red falls gradually into black rather than ending at a hard rectangle;
- no drop-shadow line, no abrupt vignette, no unrelated gradient, and no visible seam around the hair silhouette.

The red-to-black transition should be wide, soft, and consistent across every frame. Keep the central red region flat and visually continuous with Lily’s background.

When the video is available, use Python/OpenCV to:

1. Read the video frame count, dimensions, and frame rate.
2. Extract exactly 64 evenly sampled WebP frames into `public/frames/`.
3. Create `public/frames/metadata.json` containing the frame filenames, dimensions, source metadata, frame order, angle offset, and center/deadzone settings.
4. Create `public/center.webp` from the neutral frontal frame.

The extraction must happen before runtime. Do not seek the MP4 in the browser for every pointer event.

### Runtime behavior

Use one `<canvas>` for the character. Draw exactly one frame at 100% opacity per animation frame. Never alpha-blend two character frames; crossfading creates ghosting.

At runtime:

- Calculate the cursor angle relative to Lily’s face center with `Math.atan2(dy, dx)`.
- Apply shortest-path circular angle interpolation.
- Use a fast but stable response factor around `0.26`.
- Map the smoothed angle to the nearest frame index from `0` to `63`.
- Preload the center frame first, then nearby frames, then the rest lazily.
- Use a center dead zone of approximately 12% of the portrait radius. Inside it, display `center.webp` so Lily makes direct eye contact.
- Support mouse, touch, keyboard reset, and `prefers-reduced-motion`.
- Keep the camera, shoulders, clothing, face proportions, lighting, hair, jewelry, and background stable. Only the head and eyes should animate.
- Do not use CSS `perspective`, `rotateX`, `rotateY`, `rotate`, 3D transforms, image warping, or whole-image parallax to fake head rotation.

If `public/character.mp4` or extracted frames are missing, build a beautiful static fallback using the approved portrait and clearly label the code path as a fallback. Keep the frame player modular so dropping in the real video-derived frame set activates the animation without redesigning the page.

## Visual direction

Use the approved image’s vivid red background as the signature field. Build a restrained editorial system around it:

- vivid red background
- deep navy typography and clothing reference
- warm cream/off-white surfaces
- restrained gold accents
- premium serif display type paired with a clean sans or mono utility face
- generous whitespace and sharp alignment
- subtle borders and small metadata labels
- no generic corporate card grid
- no excessive glassmorphism
- no fake testimonials, fake client logos, or invented case studies

The site should feel like an intelligent communications professional’s personal presentation, not a LinkedIn clone and not an AI-avatar demo.

## Verified profile content

Use only these supplied details. Do not invent responsibilities, metrics, clients, awards, contact information, social links, or personal interests.

Name: Lily Kubala

Title: Communications Consultant

Professional focus: International development, communications, cooperative development

Current organization: International Finance Corporation (IFC), part of the World Bank Group

About line: Communications Consultant | International Development | Cooperative Development | World Bank Group

### Experience

- Consultant — IFC (International Finance Corporation), Contract — Sep 2024–Present
- Intern — U.S. Overseas Cooperative Development Council (OCDC), Internship — Sep 2023–Present, Washington, DC / Remote
  - Researched, compiled, and organized a database of videos about Cooperative Development
  - Skills shown: Attention to Detail, Research
- Legal Policy Intern — International Cooperative Alliance — Jun 2023–Jul 2023, Brussels / On-site
  - Worked on website design, including creation of graphics and organization of content
  - Researched news and legal documentation to create a database for cooperatives worldwide
  - Wrote op-eds on cooperative education and sustainable development
  - Took initiative on related social media strategy, office organization, and event planning work
- Assistant File Clerk — Pahl & McCay — Jun 2021–Aug 2021, Santa Monica, California
  - Organized packets of documents and filed them

### Education

University of Southern California — 2020–2024

- International Relations
- Middle East Studies
- GPA: 3.7
- Alpha Lambda Delta Honor Society
- Trustee Scholarship recipient; awarded to 100 students
- Dean’s List

### Volunteering

- Senior Coalition Coordinator, Charlotte Chapter — RepresentUs — Mar 2019–Feb 2020
  - Wrote, submitted, and presented a resolution to Charlotte City Council to end gerrymandering in North Carolina
  - Scheduled meetings, organized events, and ran the chapter Instagram page
  - Reached out to, met with, and influenced City Council members
- Researcher — Near Crisis Project — Jan 2022–May 2022
  - Researched instances of near crises throughout history
  - Wrote reports evaluating those instances

### Skills and honors

- Basic Arabic
- Research
- Written Communication
- Oral Communication
- Teamwork
- Attention to Detail
- Girl Scout Silver Award

Do not add a phone number, email address, address, social-media profile, client list, publications, or extra accomplishments unless a real source is supplied.

## Suggested information architecture

Build a single-page experience with a strong first viewport:

1. Hero: Lily’s name, title, concise positioning statement, interactive portrait, and a quiet “move your cursor” cue.
2. Selected profile: IFC / World Bank Group context, international development, communications, cooperative development.
3. Experience timeline: the verified roles above, with clear dates and locations.
4. Education and volunteering: concise editorial sections.
5. Skills / honors: restrained tags or a typographic list.
6. Footer: Lily Kubala, Communications Consultant, and only real navigation/actions.

Do not create empty pages or sections. Keep the resume readable without requiring interaction with the portrait.

## Engineering requirements

- Inspect the existing repository before changing it.
- Prefer the existing framework; if none exists, use modern HTML/CSS/JavaScript with minimal dependencies.
- Separate the frame extractor, frame manifest, canvas renderer, pointer controller, layout, and content data.
- Use semantic HTML, keyboard navigation, visible focus states, alt text, accessible labels, and touch-friendly controls.
- Preserve image aspect ratio and avoid layout shift.
- Match the exact red background to the portrait so the canvas feels integrated.
- Use a loading state that does not show broken-image icons.
- Avoid large downloads before the page becomes useful.
- Respect reduced-motion preferences by locking to the center frame/static portrait.

## Verification checklist

Before handing off:

- Run the site locally and inspect desktop and mobile layouts.
- Confirm the approved portrait loads.
- Confirm the site does not claim to have video frames when they are absent.
- Confirm the canvas renderer draws only one frame at a time.
- Confirm pointer movement changes the selected frame once frames exist.
- Confirm the center dead zone returns direct eye contact.
- Confirm reset, keyboard, touch, and reduced-motion behavior.
- Confirm all resume facts match the supplied data.
- Confirm no fabricated biography or contact details were introduced.
- Confirm no CSS 3D transforms are being used to fake head rotation.
- Add a README explaining how to place `public/character.mp4` and run frame extraction.

## Final response

Report:

- files created or modified
- how to run the site
- whether `character.mp4` was available
- whether frames were extracted
- the actual rendering approach
- validation performed
- known limitations and the exact next step for activating the video-driven portrait

Build the real site in the project. Do not stop at a proposal.
