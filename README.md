# Tab Volume Booster (Opera GX)

A Manifest V3 browser extension that boosts the volume of any tab up to **600%**
and shapes its tone, using the Web Audio API. Built for Opera GX, but works in
any Chromium browser (Chrome, Edge, Brave, Opera).

## Features

- **Volume boost** 0–600% with quick presets (100/200/400/Max).
- **Sound modes** — one-tap Normal / Bass / Voice / Treble / Loud. These are
  driven by a 10-band EQ under the hood, but the UI stays simple (no sliders to
  fiddle with).
- **L/R balance** control.
- **Custom presets** — save the whole setup under a name; apply or delete later.
- **Per-site memory** — "Remember for this site" auto-saves and re-applies your
  settings per hostname.
- **Keyboard shortcuts** — nudge volume without opening the popup:
  - `Ctrl+Shift+Up` — volume +10%
  - `Ctrl+Shift+Down` — volume −10%
  - Reset to 100% (no default key — assign one at `opera://extensions/shortcuts`)

  The toolbar badge gives instant feedback, and a shortcut counts as an
  extension invocation, so it can start boosting a tab that isn't captured yet.
- **Per-tab badge** on the toolbar icon showing the current boost %.
- **Themes** — a swatch row in the header switches the popup's look: **Auto**
  (matches the browser's light/dark), GX Pink (default), Royal Purple, Ice Blue,
  Slate Mono, Matcha Light. Saved per browser; each theme is just seven CSS
  custom properties defined in `popup.css`. The **toolbar icon also recolors** to
  match the chosen theme (`chrome.action.setIcon`, restored on startup by the
  background worker). Themed icon sets live in `icons/themes/<theme>/`; Auto uses
  the pink set.

## How it works

MV3 service workers can't run audio, so the extension splits the work:

1. **`popup.js`** — the UI. Holds the settings object
   `{volume, bands[10], balance}`, persists custom presets and per-site memory in
   `chrome.storage.local`, and sends settings to the background.
2. **`background.js`** — captures the active tab's audio stream
   (`chrome.tabCapture.getMediaStreamId`) and manages an **offscreen document**.
   It always asks the offscreen doc whether a tab is already captured, so state
   survives the service worker being killed while idle.
3. **`offscreen.js`** — builds the audio graph:

   ```
   source → eq[0..9] → balance(panner) → gain → out
   ```

   The gain node goes above `1.0` to amplify past 100%; each `BiquadFilterNode`
   boosts/cuts its band in dB (driven by the sound modes); a `StereoPannerNode`
   handles balance. All changes ramp smoothly to avoid clicks/pops.

State is tracked per-tab, so multiple tabs can be processed independently and the
popup reflects the current settings when reopened.

## Install in Opera GX

1. Open Opera GX and go to `opera://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Select this folder: `opera-gx-volume-booster`.
5. Pin the extension, open a tab playing audio, click the icon, and drag the slider.

> First time you boost a tab, the browser grants tab-audio capture. If the popup
> says a page can't be boosted, it's a restricted page (`opera://`, `chrome://`,
> extension pages) — those can't be captured by design.

## Notes & limitations

- Works on standard HTML5 audio/video and most streaming sites.
- Some DRM-protected streams may not be capturable.
- 100% = original volume. Above ~300% can introduce clipping/distortion depending
  on the source — that's the audio itself maxing out, not a bug.

## Project structure

```
opera-gx-volume-booster/
├── manifest.json, *.js, *.html, *.css   # extension source
├── icons/                               # default + per-theme icon sets
├── store/                               # publishing assets
│   ├── STORE_LISTING.md                 # listing copy + permission justifications
│   ├── PRIVACY.md                       # privacy policy
│   ├── promo-*.png                      # promo tiles
│   ├── screenshot-framer.html           # builds 1280×800 store screenshots
│   └── screenshots/                     # exported store screenshots
└── dist/                                # build output (gitignored)
    └── tab-volume-booster-v<version>.zip
```

## Building & publishing

Rebuild the upload zip (manifest must be at the archive root):

```powershell
Compress-Archive -Path manifest.json,background.js,offscreen.html,offscreen.js,`
  popup.html,popup.css,popup.js,icons `
  -DestinationPath dist/tab-volume-booster-v1.0.0.zip -Force
```

Then upload to the **Chrome Web Store** (works for Opera GX via "Install Chrome
Extensions") or **Opera Add-ons**. See `store/STORE_LISTING.md` for the listing
fields and `store/screenshot-framer.html` for generating screenshots.
