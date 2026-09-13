// byUS小序
"use strict";
const toggle = document.getElementById("toggle");
const state = document.getElementById("state");
const hint = document.getElementById("hint");
const pageState = document.getElementById("page-state");
const pageStatus = document.getElementById("page-status");
document.getElementById("version").textContent = "v" + chrome.runtime.getManifest().version;
let enabled = false;
let busy = false;
let initialized = false;

async function update(message) {
  if (busy) return;
  busy = true;
  toggle.disabled = true;
  try {
    const reply = await chrome.runtime.sendMessage(message);
    if (!reply || !reply.ok) throw new Error("Unavailable");
    enabled = reply.enabled;
    initialized = true;
    toggle.setAttribute("aria-checked", String(enabled));
    state.textContent = enabled ? "全网站开启" : "全网站关闭";
    hint.classList.remove("error");
    pageState.textContent = reply.page.text;
    pageStatus.dataset.tone = reply.page.tone;
    pageStatus.dataset.code = reply.page.code;
    hint.textContent = reply.page.hint;
  } catch {
    state.textContent = "未能确认设置";
    pageState.textContent = "检测暂不可用";
    pageStatus.dataset.tone = "warn";
    pageStatus.dataset.code = "error";
    hint.classList.add("error");
    hint.textContent = "请关闭后重新打开此面板。若仍失败，请在扩展管理页重新加载插件。";
  } finally {
    busy = false;
    toggle.disabled = !initialized;
  }
}

toggle.addEventListener("click", () => update({ type: "set", enabled: !enabled }));
update({ type: "status" });
// Poll only while the popup is open. No background browsing monitoring or persisted logs.
const timer = setInterval(() => update({ type: "status" }), 2000);
window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
