// Sound presets map to the underlying 10-band EQ (volume/toggles untouched).
// The bands aren't shown in the UI anymore — these are the one-tap "sound modes".
const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [10, 9, 7, 4, 1, 0, 0, 0, 0, 0],
  dialogue: [-3, -2, 0, 2, 4, 5, 5, 3, 1, 0],
  treble: [0, 0, 0, 0, 0, 1, 3, 6, 8, 9],
  loudness: [8, 6, 3, 0, -1, -1, 0, 3, 6, 8],
};

function defaultSettings() {
  return {
    volume: 1,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    balance: 0,
  };
}

// Available themes (accent shown on each swatch). CSS holds the full palettes.
const THEMES = [
  { key: "gxPink", label: "GX Pink", accent: "#ff1b6b" },
  { key: "royalPurple", label: "Royal Purple", accent: "#9d4bff" },
  { key: "iceBlue", label: "Ice Blue", accent: "#2e7bff" },
  { key: "slateMono", label: "Slate Mono", accent: "#8a94a6" },
  { key: "matchaLight", label: "Matcha Light", accent: "#3f9d5a" },
];
const DEFAULT_THEME = "gxPink";
const AUTO_KEY = "auto";
// When "Auto" is chosen, follow the browser: dark -> GX Pink, light -> Matcha.
const AUTO_DARK = "gxPink";
const AUTO_LIGHT = "matchaLight";
const darkMedia = window.matchMedia("(prefers-color-scheme: dark)");

const el = {
  themeRow: document.getElementById("themeRow"),
  volume: document.getElementById("volume"),
  volValue: document.getElementById("volValue"),
  balance: document.getElementById("balance"),
  balanceValue: document.getElementById("balanceValue"),
  presetName: document.getElementById("presetName"),
  savePreset: document.getElementById("savePreset"),
  presetList: document.getElementById("presetList"),
  remember: document.getElementById("remember"),
  host: document.getElementById("host"),
  reset: document.getElementById("reset"),
  status: document.getElementById("status"),
};

let currentTabId = null;
let hostname = null;
let settings = defaultSettings();

function setStatus(text, isError = false) {
  el.status.textContent = text || "";
  el.status.classList.toggle("error", !!isError);
}

// Highlight the sound preset that matches the current bands (none if custom).
function highlightSound() {
  document.querySelectorAll(".eq-presets button[data-preset]").forEach((btn) => {
    const arr = EQ_PRESETS[btn.dataset.preset];
    const match = arr && arr.every((v, i) => v === (settings.bands[i] || 0));
    btn.classList.toggle("active", !!match);
  });
}

// Repaint all controls from `settings`.
function paint() {
  const pct = Math.round(settings.volume * 100);
  el.volValue.textContent = pct;
  el.volume.value = pct;
  const ratio = (pct / 600) * 100;
  el.volume.style.background = `linear-gradient(90deg, var(--accent) 0%, var(--accent) ${ratio}%, var(--track) ${ratio}%)`;

  el.balance.value = Math.round(settings.balance * 100);
  const b = Math.round(settings.balance * 100);
  el.balanceValue.textContent = b === 0 ? "C" : b < 0 ? `L${-b}` : `R${b}`;

  highlightSound();
}

let sendTimer = null;
function push() {
  paint();
  if (el.remember.checked && hostname) saveSite();
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => {
    chrome.runtime.sendMessage(
      { type: "apply", tabId: currentTabId, settings },
      (res) => {
        if (chrome.runtime.lastError) {
          setStatus(chrome.runtime.lastError.message, true);
          return;
        }
        if (res && res.ok) {
          const pct = Math.round(settings.volume * 100);
          setStatus(pct === 0 ? "Muted" : pct > 100 ? "Boosting active" : "");
        } else {
          setStatus((res && res.error) || "Could not process this tab", true);
        }
      }
    );
  }, 60);
}

/* ---------- storage: custom presets + per-site memory ---------- */

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

/* ---------- theme switcher ---------- */

let currentThemeKey = DEFAULT_THEME;

// Resolve the actual palette to render — "auto" follows the browser theme.
function effectiveTheme(key) {
  if (key === AUTO_KEY) return darkMedia.matches ? AUTO_DARK : AUTO_LIGHT;
  return key;
}

// Point the toolbar icon at the matching themed set.
function setThemeIcon(concreteKey) {
  try {
    if (chrome.action && chrome.action.setIcon) {
      const base = `icons/themes/${concreteKey}`;
      chrome.action.setIcon({
        path: {
          16: `${base}/icon16.png`,
          32: `${base}/icon32.png`,
          48: `${base}/icon48.png`,
          128: `${base}/icon128.png`,
        },
      });
    }
  } catch (e) {
    /* icon is cosmetic — ignore failures */
  }
}

function applyTheme(key, save = true) {
  currentThemeKey = key;
  const eff = effectiveTheme(key);
  document.body.dataset.theme = eff;
  setThemeIcon(eff);
  el.themeRow.querySelectorAll(".theme-swatch").forEach((s) => {
    s.classList.toggle("active", s.dataset.theme === key);
  });
  if (save) storageSet({ theme: key });
}

// When "Auto" is active, re-render (UI + icon) if the browser flips light/dark.
darkMedia.addEventListener("change", () => {
  if (currentThemeKey === AUTO_KEY) {
    const eff = effectiveTheme(AUTO_KEY);
    document.body.dataset.theme = eff;
    setThemeIcon(eff);
  }
});

function buildThemeRow() {
  // "Auto" comes first — a split swatch that follows the browser.
  const auto = document.createElement("button");
  auto.type = "button";
  auto.className = "theme-swatch theme-auto";
  auto.dataset.theme = AUTO_KEY;
  auto.title = "Match browser (light/dark)";
  auto.setAttribute("aria-label", "Theme: match browser light or dark");
  auto.addEventListener("click", () => applyTheme(AUTO_KEY));
  el.themeRow.appendChild(auto);

  THEMES.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-swatch";
    btn.dataset.theme = t.key;
    btn.style.background = t.accent;
    btn.title = t.label;
    btn.setAttribute("aria-label", `Theme: ${t.label}`);
    btn.addEventListener("click", () => applyTheme(t.key));
    el.themeRow.appendChild(btn);
  });
}

async function loadTheme() {
  const { theme } = await storageGet("theme");
  const valid = theme === AUTO_KEY || THEMES.some((t) => t.key === theme);
  applyTheme(valid ? theme : DEFAULT_THEME, false);
}

async function renderCustomPresets() {
  const { customPresets = {} } = await storageGet("customPresets");
  el.presetList.innerHTML = "";
  const names = Object.keys(customPresets);
  if (!names.length) {
    el.presetList.innerHTML = '<span class="db">No saved presets yet</span>';
    return;
  }
  names.forEach((name) => {
    const chip = document.createElement("span");
    chip.className = "chip";

    const label = document.createElement("span");
    label.textContent = name;
    label.addEventListener("click", () => {
      settings = { ...defaultSettings(), ...customPresets[name] };
      push();
      setStatus(`Applied "${name}"`);
    });

    const x = document.createElement("span");
    x.className = "x";
    x.textContent = "×";
    x.title = "Delete preset";
    x.addEventListener("click", async (e) => {
      e.stopPropagation();
      const data = (await storageGet("customPresets")).customPresets || {};
      delete data[name];
      await storageSet({ customPresets: data });
      renderCustomPresets();
    });

    chip.append(label, x);
    el.presetList.appendChild(chip);
  });
}

async function savePreset() {
  const name = el.presetName.value.trim();
  if (!name) {
    setStatus("Enter a preset name first", true);
    return;
  }
  const { customPresets = {} } = await storageGet("customPresets");
  customPresets[name] = JSON.parse(JSON.stringify(settings));
  await storageSet({ customPresets });
  el.presetName.value = "";
  renderCustomPresets();
  setStatus(`Saved "${name}"`);
}

async function saveSite() {
  if (!hostname) return;
  const { siteSettings = {} } = await storageGet("siteSettings");
  siteSettings[hostname] = JSON.parse(JSON.stringify(settings));
  await storageSet({ siteSettings });
}

async function setRemember(on) {
  const { siteEnabled = {} } = await storageGet("siteEnabled");
  if (on) {
    siteEnabled[hostname] = true;
    await storageSet({ siteEnabled });
    await saveSite();
  } else {
    delete siteEnabled[hostname];
    const { siteSettings = {} } = await storageGet("siteSettings");
    delete siteSettings[hostname];
    await storageSet({ siteEnabled, siteSettings });
  }
}

/* ---------- init ---------- */

async function init() {
  buildThemeRow();
  loadTheme();
  renderCustomPresets();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    setStatus("No active tab", true);
    return;
  }
  currentTabId = tab.id;

  const url = tab.url || "";
  if (/^(chrome|opera|edge|about|chrome-extension):/i.test(url)) {
    setStatus("Can't process browser/system pages", true);
    // Leave the theme swatches usable; disable only the audio controls.
    document
      .querySelectorAll("input, button:not(.theme-swatch)")
      .forEach((c) => (c.disabled = true));
    return;
  }

  try {
    hostname = new URL(url).hostname;
    el.host.textContent = hostname;
  } catch (e) {
    el.host.textContent = "this site";
  }

  // Decide starting settings: a live graph (tab already processing) wins;
  // otherwise fall back to remembered per-site settings.
  const { siteEnabled = {}, siteSettings = {} } = await storageGet([
    "siteEnabled",
    "siteSettings",
  ]);
  const remembered = hostname && siteEnabled[hostname];
  el.remember.checked = !!remembered;

  chrome.runtime.sendMessage({ type: "getState", tabId: currentTabId }, (res) => {
    const live = res && res.settings;
    const isLive =
      live &&
      (live.volume !== 1 ||
        live.balance !== 0 ||
        (live.bands || []).some((b) => b !== 0));

    if (isLive) {
      settings = { ...defaultSettings(), ...live };
    } else if (remembered && siteSettings[hostname]) {
      settings = { ...defaultSettings(), ...siteSettings[hostname] };
      push(); // apply the remembered settings to the tab now
      return;
    }
    paint();
  });
}

/* ---------- control wiring ---------- */

el.volume.addEventListener("input", () => {
  settings.volume = Number(el.volume.value) / 100;
  push();
});

el.balance.addEventListener("input", () => {
  settings.balance = Number(el.balance.value) / 100;
  push();
});

document.querySelectorAll(".presets button[data-vol]").forEach((btn) => {
  btn.addEventListener("click", () => {
    settings.volume = Number(btn.dataset.vol) / 100;
    push();
  });
});

document.querySelectorAll(".presets button[data-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    settings.bands = [...EQ_PRESETS[btn.dataset.preset]];
    push();
  });
});

el.savePreset.addEventListener("click", savePreset);
el.presetName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") savePreset();
});

el.remember.addEventListener("change", () => setRemember(el.remember.checked));

el.reset.addEventListener("click", () => {
  settings = defaultSettings();
  push();
});

init();
