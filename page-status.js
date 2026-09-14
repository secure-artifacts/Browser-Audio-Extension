// byUS小序
"use strict";
const microphoneErrors = {
  NotAllowedError: "麦克风未获允许。请检查网站麦克风权限，也可能是页面限制。",
  NotFoundError: "未找到所选输入设备。请检查 VoiceMeeter 是否运行、网站设备是否选对。",
  NotReadableError: "输入设备无法读取。请检查设备连接或是否被其他程序占用。",
  OverconstrainedError: "浏览器可能不支持远端回声抑制，或所选设备不符合要求。请更新浏览器并检查设备；不会自动退回无回声抑制。可关闭插件并刷新恢复网页默认。",
  AbortError: "音频采集中断。请检查设备后重新通话。",
  SecurityError: "此页面不允许使用麦克风，请检查网站和浏览器权限。",
  InvalidStateError: "页面暂时无法采集，请返回通话页刷新后重试。",
  TypeError: "网页的音频请求无效。可关闭插件并刷新后比较是否恢复。",
  UnknownError: "音频请求失败。可关闭插件、刷新网页后重试。"
};

function summarizeFrames(results, enabled, version) {
  const frames = results.map(item => item.result).filter(item => item && item.version);
  if (!enabled) return frames.length
    ? { code: "reload-off", tone: "warn", text: "关闭待刷新", hint: "请刷新此网页，移除本次页面中的拉线处理。" }
    : { code: "off", tone: "neutral", text: "已关闭", hint: "需要时再开启；开启后请刷新通话网页。" };
  if (!frames.length || frames.some(item => item.version !== version))
    return { code: "reload", tone: "warn", text: "需要刷新网页", hint: "此页面尚未加载当前插件。保存内容后刷新，再重新通话。" };
  const count = key => frames.reduce((total, item) => total + (Number.isFinite(item[key]) ? Math.max(0, Math.min(item[key], 10000)) : 0), 0);
  const error = frames.find(item => Object.hasOwn(microphoneErrors, item.error));
  if (error) return { code: "capture-error", tone: "warn", text: "检测到音频请求失败", hint: microphoneErrors[error.error] };
  if (count("processing")) return { code: "processing", tone: "warn", text: "音频设置未符合要求", hint: "需要远端回声抑制，且关闭自动增益与降噪。请刷新网页、重新通话后再检测。" };
  if (count("live")) {
    if (frames.some(item => item.available && !item.hooked))
      return { code: "conflict", tone: "warn", text: "网页采集接口发生变化", hint: "当前检测不能保证后续采集。请刷新网页后重试。" };
    if (count("unknown")) return { code: "unknown", tone: "warn", text: "采集中 · 无法完整确认", hint: "浏览器未完整回报音频设置，不能据此判断已生效。" };
    if (count("muted")) return { code: "muted", tone: "warn", text: "远端回声抑制已设置 · 有音轨暂停", hint: "检测到音轨静音或暂时无数据，请检查网站静音按钮和设备。" };
    return { code: "verified", tone: "good", text: "远端回声抑制已启用", hint: "浏览器已回报 remote-only；是否消除回音、两组能否互听仍以实际通话为准。" };
  }
  if (count("pending")) return { code: "pending", tone: "neutral", text: "等待麦克风请求完成", hint: "请在网站提示中确认麦克风权限。" };
  if (frames.some(item => item.available && item.hooked))
    return { code: "ready", tone: "neutral", text: "已就绪 · 等待使用麦克风", hint: "请在网站选择 VoiceMeeter／立体声混音并开始通话。" };
  return { code: "unavailable", tone: "warn", text: "暂时无法检测麦克风", hint: "页面可能不支持采集，或采集接口受限。不能确认已生效。" };
}

async function inspectTab(tabId, enabled) {
  if (!Number.isInteger(tabId)) return { code: "no-page", tone: "neutral", text: "请打开通话网页", hint: "在通话网页打开此面板，可查看当前页面状态。" };
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true }, world: "MAIN",
      func: () => {
        const inspect = globalThis[Symbol.for("byUSXiaoxu.audioCompat.diagnostic")];
        return typeof inspect === "function" ? inspect() : null;
      }
    });
    return summarizeFrames(results, enabled, chrome.runtime.getManifest().version);
  } catch {
    return { code: "restricted", tone: "neutral", text: "此页面无法检测", hint: "浏览器设置页、商店等页面不支持；普通网页请检查插件的网站访问权限。" };
  }
}
