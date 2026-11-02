# Reelstuber

Reelstuber turns one long video into short reels (9:16 clips for Instagram Reels, TikTok and YouTube Shorts). People drop in
a video file; the app listens for the loud moments, spots pauses and scene changes, picks the best 15-90 second clips,
reframes them, adds animated word-by-word captions, and exports MP4 files. **Everything happens in the browser: the video
is never uploaded.** The server only keeps the edits (clip times, styles, captions, post text). For YouTubers, podcasters
and streamers. Built on [Anvil](https://anvil.works).

- **App repo:** github.com/arkulinskis/reelstuber (branch `master`). Anvil pulls `master`.
- **Live:** https://reelstuber.anvil.app

## What it does

**For everyone (no account needed):** the Studio, projects, the editor, export, brand kit and the templates gallery all work
signed out; a guest's projects live in their browser (localStorage + the video in OPFS). Signing up keeps them in the account
(the Studio offers to move them over).

**Studio** (`#home`)
- Drop a video (MP4, MOV, WebM; any length) or **🍿 Try the sample** (a bundled, fictional 53 s "Snack Lab with Pip" episode with captions).
- Project cards, stats (reels exported, minutes saved, day streak), 8 badges (First cut, Hat trick, Ten-reel club, Caption crew, On fire, Binge cutter, Shape shifter, Tastemaker).

**Project** (`#project/<id>`)
- Source player + timeline: thumbnails, loudness waveform, scene-cut ticks, coloured clip blocks, playhead; click/drag to seek; keys: space, I, O, ←/→.
- **Find reels:** length (15/30/45/60/90 s), how many (3/5/8/12), vibe (Hype / Mix / Story). Each clip gets a score (52-99), a label (🔥 Hype spike, 🎬 Fast cuts, 💬 Story time, 🎯 Quotable, ⚡ Strong hook), a title and a hook from the captions. Running it again replaces untouched drafts only.
- Add a clip by hand (In / Out), **Chapters → clips** (paste YouTube-style timestamps), **Captions** for the whole project (on-device speech-to-text, beta; import .srt/.vtt; clear).
- Clip list: edit, play in place, mark ready, duplicate, delete; **Export all**.
- If the video isn't on this device (other browser, cleared storage), it asks for the file again; the edits are safe.

**Clip editor** (`#clip/<projectId>/<clipId>`), autosaves
- Live 9:16 preview: drag to reframe, scroll/pinch to zoom, tap to play. Trim bar with handles and ±0.25 s nudges.
- **Look:** 9 built-in looks (Creator Clean is the default: clean captions, whip cuts), community templates, share your look; shape (9:16, 4:5, 1:1, 16:9); layout (Fill, Fit + blur, Framed, Split with two crops, **Corner card**: picture in picture with a second crop of the video or another video from the device, like a reaction or face cam, played muted and never uploaded); zoom/position; punch-in zoom on loud moments.
- **Colour:** 8 grades with live thumbnails of the current frame (None, Warm, Moody, Cool, Teal & orange, Vivid, Film, Black & white), strength, and a **before/after slider** that sweeps across in the first 2 seconds. Moody = highlights down, blacks lifted, saturation down, soft vignette.
- **Captions:** 7 styles (**Clean** = plain text with a soft shadow, the default; Pop, Karaoke, Boxed, Minimal, Neon, Comic), 12 fonts, size, height, words at a time, ALL CAPS, auto emoji, colours; edit every line, add lines; write on device / import / type. **Pop something on a word:** tap a caption word to drop an emoji, a title, a title behind you, a tool label, a repo card, a prompt bar or a word sticker exactly when it's said.
- **Text:** text boxes on the reel in 12 fonts (Anton, Bangers, Luckiest Guy, Bungee, Titan One, Lilita One, Rubik Mono One, Permanent Marker, Pacifico, Bricolage Grotesque, DM Sans, Playfair Display) and 9 styles (bold outline, double, 3D pop, hollow, glow, sticker box, marker, soft shadow, **magazine** masthead with an issue line, rule and barcode); fill + outline colours, size, turn, entrance (pop, fade, slide up, drop, zoom, spin, typewriter), idle motion (wiggle, float, pulse, shake, spin), timing (start/length or the whole reel). Plus the hook sticker (first seconds), "Part 1" label, handle in a corner, end card (call to action), progress bar.
- **Stickers:** 40 emoji with a die-cut white border, 12 word stickers (OMG, WAIT…, FACTS, LINK IN BIO… as burst / pill / speech bubble / circle, editable words and colour), 6 doodles (arrow, circle it, underline, sparkles, heart, star). Same size / turn / entrance / motion / timing controls as text.
- **Cards:** a tool label (app-icon tile + name), a GitHub-style repo card (name, description, Star / Fork) and a prompt bar that types itself out (optional small label, accent colour). Plus one-tap **Magazine cover** and **Big title behind you**.
- **Behind the person:** any text, card or sticker can sit behind the person: Google's MediaPipe selfie segmenter (loaded from a CDN the first time, then cached) cuts the person out of each frame on the device, the layer is drawn, then the person goes back on top. Works in the preview and the export.
- **Pin to a word:** any layer can be pinned to a caption word; it starts on that word and follows it when the clip is trimmed, sped up or has its silences cut (hidden if the word is trimmed away).
- **On the preview:** tap text or a sticker to select it, drag to move, drag the ↻ handle to resize and turn (or scroll / pinch); Delete removes it, Esc deselects. Up to 24 per reel.
- **Storyboard** (header button): a table of every line said in the clip (time, words, what's on screen: hook, intro, colour, layers, cut transitions). **Suggest a plan** proposes ideas per line (a hook, tool labels on names like FFmpeg or yt-dlp, emoji on feeling words, a prompt bar on instructions, big numbers, one line behind you): tap to skip any, then add them all. Each row also has **+ Add…**, chips can be removed, and **Copy as text** gives the plan to paste anywhere. Rule-based, on the device, no AI.
- **FX:** a **3×3 wall** intro (the shot shrinks into the centre of a wall of 8 other moments from the video, which pop in one by one, then pushes back in), transitions for the intro, between cuts (the jump cuts from Cut the silences, and optionally the video's own scene changes) and the outro: fade, flash, zoom, whip, glitch, shake, spin, pixel; length 0.15-1 s; preview buttons.
- **Sound:** speed 0.75-2×, cut the silences (gentle → snappy), video volume, background music from the device with ducking.
- **Post:** suggested caption + hashtags (from the clip's words and the brand kit), copy; status; export (Full HD or 720p, MP4 where the browser supports it, else WebM; optional .srt). After export: preview, download again, share (phones), copy caption, next clip. Confetti and badges.

**Brand kit** (`#brand`): handle, hashtags, starting look, caption defaults (all 11 fonts), sticker colours, end card, transitions, shape/quality, cut silences, punch-in; live preview. Lists the templates you shared.

**Templates** (`#templates`): community looks (featured first, then most used) + Reelstuber originals; "Make it my default".

**For admins** (`#admin`; arkulinskis@gmail.com becomes an admin on first sign-in):
- **Overview:** people, feedback, projects, clips, reels exported, shared templates.
- **Usage:** reels exported per day (14 days), average length, % captioned, popular looks and shapes.
- **Templates:** feature / hide / delete shared templates.
- **Feedback inbox**, **Users** (make admin, disable), **Demo data** (3 demo creators, 6 community templates, sample projects + exports).

Also: landing page, sign-up/sign-in, feedback form, Privacy & Terms (footer, `#legal`), light/dark themes.

## Setting it up in Anvil (once)

1. In the Anvil editor: **Create app → Clone from GitHub**, and paste `https://github.com/arkulinskis/reelstuber`.
2. **Users** service: email + password and "Continue with Google", sign-up allowed (already set in `anvil.yaml`; check it).
3. Open the app in the editor. If it shows a **Schema Mismatch** alert, choose **"The schema of the source code is correct"** so Anvil creates the tables.
4. **Run** it and sign up with **arkulinskis@gmail.com** straight away (that account becomes the admin).
5. **Publish** (Publish → public URL, or your own domain).

<!-- libraries:start -->
## Libraries and outside services

What this project uses besides its own code. Generated by `APP_MAKER/tools/libraries.py`; to change it, edit `APP_MAKER/libraries/catalog.py` and re-run the script.

| Name | How it gets in | Used here for |
|---|---|---|
| [MediaPipe vision tasks](https://ai.google.dev/edge/mediapipe/solutions/guide) 0.10.14 | Loaded from a CDN | Selfie Segmenter: cuts the person out so text can sit behind them |
| [Transformers.js](https://huggingface.co/docs/transformers.js) 3.0.2 | Loaded from a CDN | speech-to-text for the reel captions |
| [Whisper speech models](https://huggingface.co/onnx-community) | Loaded from a CDN | whisper-tiny, whisper-tiny.en |
| [Google Fonts](https://fonts.google.com) | Loaded from a CDN | Anton, Bangers, Bricolage Grotesque, Bungee, DM Sans, Lilita One, Luckiest Guy, Pacifico, Permanent Marker, Playfair Display, Rubik Mono One, Titan One |

**Built into the browser:** Canvas 2D, Web Audio API, MediaRecorder, Web Share, localStorage, Clipboard, File downloads (Blob), Web Workers.

**Anvil platform:** Anvil, Anvil Data Tables, Anvil JS bridge (anvil.js), Anvil Users.

**Build and test tools (not shipped):** Node.js, PyYAML, Headless Chrome (DevTools Protocol).

<!-- libraries:end -->

## Working on it

See `.claude/skills/reelstuber/SKILL.md`. In short:

```
python -I tools/check.py --ui                    # syntax, server tests, headless UI tests (incl. a real export) → ALL CHECKS PASSED
python -I tools/preview/devserver.py 8793        # the app on in-memory data: http://localhost:8793/  (?as=ana#home, ?as=admin#admin)
python -I tools/sample/make_sample.py            # re-record assets/sample.webm + sample.json (about a minute)
python tools/deploy.py                           # dry run (needs PyYAML, so no -I)
python tools/deploy.py --push "Message"          # deploy: commit + push to GitHub, Anvil pulls it
```

## Project layout

```
web/pages/_a_core.html    RS helpers, icons, default style + looks, RS.db (server / guest storage), RS.vault (OPFS), RS.media
web/pages/_b_smart.html   analysis, reel finder, captions, subtitles, chapters, on-device transcription, post copy, storyboard ideas
web/pages/_c_engine.html  the renderer (one frame: layouts incl. corner card, colour grades, 3x3 wall, person cut-out,
                          cards), live preview player, exporter (MediaRecorder), .srt
web/pages/*.html          landing, home (Studio), project, clip (editor), brand, templates, profile, admin, auth
server_code/              Studio.py (projects, clips, exports, stats, badges, import), Brand.py (brand kit, templates),
                          Styles.py (style cleaning), Admin.py, DemoData.py, Accounts.py, Feedback.py, common.py, legal_server.py
assets/                   icon.svg + PNGs, sample.webm + sample.json (the fictional sample episode)
tools/                    sync_to_anvil.py (settings + schema), deploy.py, check.py, preview/, testing/, sample/ (sample maker)
```
