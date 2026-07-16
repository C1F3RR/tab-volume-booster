# Store listing — Tab Volume Booster

Copy-paste fields for the Chrome Web Store / Opera Add-ons submission.

---

## Name
**Volume Booster + EQ — for any tab**
*(manifest name is "Tab Volume Booster"; the store name can be longer/marketing-y)*

## Summary / short description (max 132 chars)
> Boost any tab up to 600%, shape the sound with an EQ, and save per-site settings. Fast, private, and fully on-device.

## Category
Tools *(Chrome Web Store)* — alternatively "Accessibility". Opera: "Tools/Utilities".

## Language
English (United States)

---

## Detailed description

**Turn any tab up to 11.**

Tab Volume Booster amplifies the audio of the current tab up to **600%** — perfect
for quiet videos, soft podcasts, or lectures recorded too low. It runs entirely in
your browser using the Web Audio API, so there are no servers, no accounts, and
nothing to sign up for.

**Features**
- 🔊 **Volume boost 0–600%** with one-tap presets (100 / 200 / 400 / Max)
- 🎚️ **Sound modes** — Normal, Bass, Voice, Treble, Loud (one tap, no fiddly sliders)
- ↔️ **Left / right balance**
- ⭐ **Custom presets** — save your favorite setup and reuse it anywhere
- 🌐 **Per-site memory** — remember settings for a site and re-apply them automatically
- ⌨️ **Keyboard shortcuts** — nudge volume up/down without opening the popup
- 🎨 **Themes** — six looks (incl. a "match browser light/dark" option); the toolbar icon recolors to match
- 🏷️ **Live badge** on the icon showing the current boost level

**Private by design**
Everything happens locally on your device. The extension never sends your audio,
browsing, or settings anywhere. Your presets and preferences are stored only in
your browser.

**Note:** Some DRM-protected streams may not be boostable, and browser/system pages
(e.g. `opera://`, `chrome://`) can't be processed.

---

## Single purpose (required)
> Boost and equalize the audio volume of the current browser tab.

## Permission justifications (required)

| Permission | Why it's needed |
|------------|-----------------|
| `tabCapture` | To capture the current tab's audio stream so it can be amplified and equalized. |
| `offscreen` | Manifest V3 service workers can't run audio; an offscreen document hosts the Web Audio graph that does the boosting. |
| `activeTab` | To identify and process the tab you're actively on when you open the popup or press a shortcut. |
| `storage` | To save your volume/EQ presets, per-site settings, and chosen theme locally in the browser. |

**Remote code:** None. All code is bundled in the package.
**Data collected:** None.

---

## Assets
- `../dist/tab-volume-booster-v1.0.0.zip` — the upload package (manifest at root)
- `promo-small-440x280.png` — small promo tile
- `promo-marquee-1400x560.png` — marquee promo tile
- `screenshot-framer.html` — open in a browser, load a real popup capture, and
  export four **1280×800** store screenshots (branded background + headline).
- `screenshots/` — put the exported PNGs here. The store requires at least one
  1280×800 (or 640×400) screenshot.
