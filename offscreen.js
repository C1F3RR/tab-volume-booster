// Offscreen document: owns the AudioContext(s) that boost + shape the audio,
// and is the source of truth for which tabs are currently captured.
//
// Per-tab graph:
//   source
//     -> eq[0..9]          (10-band graphic EQ, peaking filters, dB each)
//     -> panner            (StereoPanner for L/R balance)
//     -> gain              (volume, >1.0 to amplify past 100%)
//     -> destination

const FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const DEFAULT_SETTINGS = {
  volume: 1,
  bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  balance: 0, // -1 (full left) .. +1 (full right)
};

// tabId -> { context, source, eq[], panner, gain, stream, settings }
const graphs = {};

function ramp(param, value, ctx) {
  param.setTargetAtTime(value, ctx.currentTime, 0.02);
}

function applyToGraph(g, settings) {
  const ctx = g.context;
  ramp(g.gain.gain, settings.volume, ctx);
  for (let i = 0; i < g.eq.length; i++) {
    ramp(g.eq[i].gain, settings.bands[i] || 0, ctx);
  }
  ramp(g.panner.pan, Math.max(-1, Math.min(1, settings.balance)), ctx);
  g.settings = JSON.parse(JSON.stringify(settings));
}

async function startGraph(tabId, streamId, settings) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);

  // 10-band graphic EQ
  const eq = FREQS.map((hz, i) => {
    const f = context.createBiquadFilter();
    f.type = "peaking";
    f.frequency.value = hz;
    f.Q.value = 1.4;
    f.gain.value = settings.bands[i] || 0;
    return f;
  });

  const panner = context.createStereoPanner();
  const gain = context.createGain();
  gain.gain.value = settings.volume;

  // Wire the chain: source -> eq[0..9] -> panner -> gain -> out
  let node = source;
  for (const f of eq) {
    node.connect(f);
    node = f;
  }
  node.connect(panner);
  panner.connect(gain);
  gain.connect(context.destination);

  const g = {
    context, source, eq, panner, gain, stream,
    settings: JSON.parse(JSON.stringify(settings)),
  };

  // Apply balance up front.
  applyToGraph(g, settings);

  // Offscreen documents have no user gesture, so the context can start
  // "suspended" — force it running or no audio flows.
  if (context.state !== "running") await context.resume();

  // If the captured stream ends (tab closed/navigated), tear the graph down.
  stream.getAudioTracks().forEach((t) => {
    t.addEventListener("ended", () => stopGraph(tabId));
  });

  graphs[tabId] = g;
}

function stopGraph(tabId) {
  const g = graphs[tabId];
  if (!g) return;
  try {
    g.stream.getTracks().forEach((t) => t.stop());
  } catch (e) {}
  try {
    g.source.disconnect();
    g.eq.forEach((f) => f.disconnect());
    g.panner.disconnect();
    g.gain.disconnect();
  } catch (e) {}
  try {
    g.context.close();
  } catch (e) {}
  delete graphs[tabId];
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== "offscreen") return; // not for us

  (async () => {
    try {
      if (msg.type === "apply") {
        const { tabId, streamId } = msg;
        const settings = { ...DEFAULT_SETTINGS, ...msg.settings };

        if (graphs[tabId]) {
          if (graphs[tabId].context.state !== "running") {
            await graphs[tabId].context.resume();
          }
          applyToGraph(graphs[tabId], settings);
          sendResponse({ ok: true, captured: true });
        } else if (streamId) {
          await startGraph(tabId, streamId, settings);
          sendResponse({ ok: true, captured: true });
        } else {
          sendResponse({ ok: false, needStream: true });
        }
      } else if (msg.type === "getTab") {
        const g = graphs[msg.tabId];
        sendResponse({ settings: g ? g.settings : null });
      } else if (msg.type === "stopTab") {
        stopGraph(msg.tabId);
        sendResponse({ ok: true });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();

  return true; // async response
});
