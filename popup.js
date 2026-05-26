const statusNode = document.getElementById("status");

// 更新弹窗底部状态文案，并根据是否出错切换提示颜色。
function setStatus(text, isError = false) {
  statusNode.textContent = text;
  statusNode.style.color = isError ? "#b42318" : "#0f766e";
}

// 向当前活动标签页发送填充消息；如果内容脚本未响应，则先注入脚本后重试。
async function sendMessage(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    throw new Error("未找到当前标签页");
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    await injectContentScripts(tab.id);
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

// 将假数据生成脚本和内容脚本注入到指定标签页。
async function injectContentScripts(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["fake-data.js"],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

// 根据弹窗按钮动作组装消息，执行填充并展示结果。
async function handleAction(action) {
  const messageMap = {
    scope: { action: "AUTO_FILL_SCOPE", overwrite: false },
    "scope-overwrite": { action: "AUTO_FILL_SCOPE", overwrite: true },
    page: { action: "AUTO_FILL_PAGE", overwrite: false },
  };

  setStatus("正在填充...");
  try {
    const result = await sendMessage(messageMap[action]);
    if (!result || typeof result.filled !== "number") {
      setStatus("当前页面暂不支持填充", true);
      return;
    }
    setStatus(`已填充 ${result.filled} 个字段，跳过 ${result.skipped} 个`);
  } catch (error) {
    setStatus(error.message || "填充失败，请刷新页面后重试", true);
  }
}

// 为所有带 data-action 的按钮绑定点击事件，触发对应填充动作。
document.querySelectorAll("button[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    handleAction(button.dataset.action);
  });
});
