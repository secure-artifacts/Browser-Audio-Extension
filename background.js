// byUS小序
// Keep permission use local: no audio, browsing history or account data is collected.
"use strict";
importScripts("page-status.js");
const SCRIPT_ID = "audio-compatibility-main";
const script = {
  id: SCRIPT_ID,
  matches: ["http://*/*", "https://*/*"],
  js: ["audio-hook.js"],
  allFrames: true,
  matchOriginAsFallback: true,
  runAt: "document_start",
  world: "MAIN",
  persistAcrossSessions: true
};

async function registered() {
  return (await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] })).length > 0;
}

async function register(enabled) {
  const current = await registered();
  if (enabled && !current) await chrome.scripting.registerContentScripts([script]);
  if (!enabled && current) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
}

async function badge(enabled) {
  await chrome.action.setBadgeText({ text: enabled ? "ON" : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#176B52" });
  await chrome.action.setTitle({ title: "浏览器拉线助手 · " + (enabled ? "已开启（刷新网页后应用）" : "已关闭（刷新网页后恢复）") });
}

// Installed defaults to ON. Explicit OFF survives browser / worker restarts and updates.
async function initialize() {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const saved = await chrome.storage.local.get("enabled");
  const enabled = saved.enabled !== false;
  await register(enabled);
  if (typeof saved.enabled !== "boolean") await chrome.storage.local.set({ enabled });
  await badge(enabled);
}

let pending = initialize();
// Do not leak rejected promises while idle. Each popup operation reconciles actual state.
pending.catch(() => {});

async function handle(message) {
  if (message.type === "status") {
    await initialize();
    const enabled = await registered();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const page = await inspectTab(tab && tab.id, enabled);
    return { enabled, page };
  }
  const before = await registered();
  const enabled = message.enabled;
  await register(enabled);
  try {
    await chrome.storage.local.set({ enabled });
  } catch (error) {
    await register(before);
    throw error;
  }
  await badge(enabled);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return { enabled: await registered(), page: await inspectTab(tab && tab.id, enabled) };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only our own popup can change settings. No web page message bridge exists.
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("popup.html")) return;
  if (!message || (message.type !== "status" && message.type !== "set")) return;
  if (message.type === "set" && typeof message.enabled !== "boolean") return;
  const operation = pending.catch(() => {}).then(() => handle(message));
  pending = operation.catch(() => {});
  operation.then(result => respond({ ok: true, ...result }), () => respond({ ok: false }));
  return true;
});
