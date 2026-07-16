// Background service worker: orchestrates tab capture + the offscreen audio graph.
//
// MV3 service workers can't run an AudioContext, so we capture the tab's audio
// stream here (via getMediaStreamId) and hand the stream id to an offscreen
// document, which does the actual capture + EQ + gain + playback.
//
// IMPORTANT: this service worker is ephemeral — Chromium kills it after ~30s
// idle, which wipes any in-memory state. The offscreen document, however,
// persists along with its live audio streams. So the OFFSCREEN document is the
// source of truth for which tabs are captured; the background always asks.

const OFFSCREEN_PATH = "offscreen.html";
const DEFAULT_SETTINGS = {
  volume: 1,
  bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  balance: 0,
};

function sendToOffscreen(msg) {
  return chrome.runtime.sendMessage({ target: "offscreen", ...msg });
}

async function hasOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });
    return contexts.length > 0;
  }
  return false;
}

let creating; // avoid race: only create one offscreen doc at a time
async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (creating) {
    await creating;
    return;
  }
  creating = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["USER_MEDIA"],
    justification: "Playing captured tab audio through an equalizer to boost volume and shape tone.",
  });
  await creating;
  creating = null;
}

// Serialize operations per tab so rapid slider drags can never launch two
// captures for the same tab (which triggers "active stream" errors).
const queues = {};
function enqueue(tabId, fn) {
  const prev = queues[tabId] || Promise.resolve();
  const next = prev.then(fn, fn);
  queues[tabId] = next.catch(() => {});
  return next;
}

function badgeFor(volume) {
  const pct = Math.round(volume * 100);
  return pct === 100 ? "" : String(pct);
}

async function updateBadge(tabId, volume) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#ff1b6b", tabId });
    if (chrome.action.setBadgeTextColor) {
      await chrome.action.setBadgeTextColor({ color: "#ffffff", tabId });
    }
    await chrome.action.setBadgeText({ tabId, text: badgeFor(volume) });
  } catch (e) {
    // tab may have closed; ignore
  }
}

// Apply full settings to a tab. Asks the offscreen doc first: if it already has
// this tab captured it just updates the graph; only if it reports needing a
// stream do we capture a fresh one.
async function applySettings(tabId, settings) {
  await ensureOffscreenDocument();

  let res = await sendToOffscreen({ type: "apply", tabId, settings });
  if (res && res.needStream) {
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId,
    });
    res = await sendToOffscreen({ type: "apply", tabId, settings, streamId });
  }
  if (res && res.ok) await updateBadge(tabId, settings.volume);
  return res;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "getState": {
        let settings = { ...DEFAULT_SETTINGS };
        if (await hasOffscreenDocument()) {
          try {
            const res = await sendToOffscreen({ type: "getTab", tabId: msg.tabId });
            if (res && res.settings) settings = { ...settings, ...res.settings };
          } catch (e) {}
        }
        sendResponse({ settings });
        break;
      }

      case "apply": {
        try {
          const settings = { ...DEFAULT_SETTINGS, ...msg.settings };
          const res = await enqueue(msg.tabId, () => applySettings(msg.tabId, settings));
          if (res && res.ok) {
            sendResponse({ ok: true, settings });
          } else {
            sendResponse({ ok: false, error: (res && res.error) || "Capture failed" });
          }
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
        }
        break;
      }

      case "stopTab": {
        try {
          if (await hasOffscreenDocument()) {
            await sendToOffscreen({ type: "stopTab", tabId: msg.tabId });
          }
        } catch (e) {}
        await updateBadge(msg.tabId, 1);
        sendResponse({ ok: true });
        break;
      }

      default:
        break;
    }
  })();

  return true; // keep the channel open for the async response
});

// Clean up when a boosted tab closes.
chrome.tabs.onRemoved.addListener((tabId) => {
  sendToOffscreen({ type: "stopTab", tabId }).catch(() => {});
});

/* ---------- themed toolbar icon ---------- */
// Concrete themes have their own icon set; "auto"/unknown falls back to gxPink.
const THEME_KEYS = ["gxPink", "royalPurple", "iceBlue", "slateMono", "matchaLight"];

function iconPaths(key) {
  const base = `icons/themes/${key}`;
  return {
    16: `${base}/icon16.png`,
    32: `${base}/icon32.png`,
    48: `${base}/icon48.png`,
    128: `${base}/icon128.png`,
  };
}

// Restore the user's themed icon when the browser starts / the extension loads,
// since setIcon() doesn't persist across restarts.
async function applyStoredThemeIcon() {
  try {
    const { theme } = await chrome.storage.local.get("theme");
    const key = THEME_KEYS.includes(theme) ? theme : "gxPink";
    await chrome.action.setIcon({ path: iconPaths(key) });
  } catch (e) {
    /* cosmetic — ignore */
  }
}

chrome.runtime.onInstalled.addListener(applyStoredThemeIcon);
chrome.runtime.onStartup.addListener(applyStoredThemeIcon);

/* ---------- keyboard shortcuts ---------- */

const VOLUME_STEP = 0.1; // 10% per keypress, matching the popup slider step
const MAX_VOLUME = 6; // 600%

// Current settings for a tab: live graph if captured, otherwise defaults.
async function getTabSettings(tabId) {
  if (await hasOffscreenDocument()) {
    try {
      const res = await sendToOffscreen({ type: "getTab", tabId });
      if (res && res.settings) return { ...DEFAULT_SETTINGS, ...res.settings };
    } catch (e) {}
  }
  return { ...DEFAULT_SETTINGS };
}

// Mirror the popup's "remember for this site" behaviour after a shortcut change.
async function saveSiteIfEnabled(url, settings) {
  try {
    const host = new URL(url).hostname;
    const { siteEnabled = {}, siteSettings = {} } = await chrome.storage.local.get([
      "siteEnabled",
      "siteSettings",
    ]);
    if (siteEnabled[host]) {
      siteSettings[host] = settings;
      await chrome.storage.local.set({ siteSettings });
    }
  } catch (e) {}
}

chrome.commands.onCommand.addListener((command) => {
  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null) return;
    if (/^(chrome|opera|edge|about|chrome-extension):/i.test(tab.url || "")) return;

    await enqueue(tab.id, async () => {
      const current = await getTabSettings(tab.id);
      let volume = current.volume;
      if (command === "increase-volume") {
        volume = Math.min(MAX_VOLUME, Math.round((volume + VOLUME_STEP) * 10) / 10);
      } else if (command === "decrease-volume") {
        volume = Math.max(0, Math.round((volume - VOLUME_STEP) * 10) / 10);
      } else if (command === "reset-volume") {
        volume = 1;
      } else {
        return;
      }

      const next = { ...current, volume };
      const res = await applySettings(tab.id, next);
      if (res && res.ok) await saveSiteIfEnabled(tab.url, next);
    });
  })();
});
