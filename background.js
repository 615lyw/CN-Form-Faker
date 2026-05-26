const MENU_IDS = {
  autoScope: "auto-scope",
  autoScopeOverwrite: "auto-scope-overwrite",
  autoPage: "auto-page",
};

const FIELD_TYPES = [
  ["name", "姓名"],
  ["mobile", "手机号"],
  ["idCard", "身份证号"],
  ["email", "邮箱"],
  ["address", "地址"],
  ["company", "公司"],
  ["date", "日期"],
  ["birthDate", "出生日期"],
  ["gender", "性别"],
  ["amount", "金额"],
  ["number", "数字"],
  ["sentence", "备注文本"],
];

// 创建右键菜单项，提供自动填充范围、整页填充和指定字段类型填充入口。
function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_IDS.autoScope,
      title: "智能填充当前弹窗/表单",
      contexts: ["page", "editable"],
    });
    chrome.contextMenus.create({
      id: MENU_IDS.autoScopeOverwrite,
      title: "覆盖填充当前弹窗/表单",
      contexts: ["page", "editable"],
    });
    chrome.contextMenus.create({
      id: MENU_IDS.autoPage,
      title: "智能填充整个页面",
      contexts: ["page", "editable"],
    });
    chrome.contextMenus.create({
      id: "separator-auto-fill",
      type: "separator",
      contexts: ["page", "editable"],
    });
    for (const [type, label] of FIELD_TYPES) {
      chrome.contextMenus.create({
        id: `field:${type}`,
        title: `填充${label}`,
        contexts: ["page", "editable"],
      });
    }
  });
}

// 插件安装或更新后初始化右键菜单。
chrome.runtime.onInstalled.addListener(createMenus);
// 浏览器启动时重新注册右键菜单，避免菜单丢失。
chrome.runtime.onStartup.addListener(createMenus);

// 向指定标签页和 frame 发送消息；如果内容脚本尚未注入，则先注入后重试。
function sendToTab(tabId, frameId, message) {
  const options = Number.isInteger(frameId) && frameId >= 0 ? { frameId } : undefined;
  chrome.tabs.sendMessage(tabId, message, options, () => {
    const error = chrome.runtime.lastError;
    if (error) {
      injectContentScripts(tabId, frameId, () => {
        chrome.tabs.sendMessage(tabId, message, options, () => {
          const retryError = chrome.runtime.lastError;
          if (retryError) {
            console.warn("Fake data fill message failed:", retryError.message);
          }
        });
      });
    }
  });
}

// 按顺序注入假数据生成脚本和页面填充脚本，完成后执行回调。
function injectContentScripts(tabId, frameId, callback) {
  const target = Number.isInteger(frameId) && frameId >= 0 ? { tabId, frameIds: [frameId] } : { tabId };
  chrome.scripting.executeScript({ target, files: ["fake-data.js"] }, () => {
    const firstError = chrome.runtime.lastError;
    if (firstError) {
      console.warn("Fake data script injection failed:", firstError.message);
      return;
    }
    chrome.scripting.executeScript({ target, files: ["content.js"] }, () => {
      const secondError = chrome.runtime.lastError;
      if (secondError) {
        console.warn("Content script injection failed:", secondError.message);
        return;
      }
      callback();
    });
  });
}

// 响应右键菜单点击，将用户选择转换为对应的内容脚本填充指令。
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) {
    return;
  }

  if (info.menuItemId === MENU_IDS.autoScope) {
    sendToTab(tab.id, info.frameId, { action: "AUTO_FILL_SCOPE", overwrite: false });
    return;
  }

  if (info.menuItemId === MENU_IDS.autoScopeOverwrite) {
    sendToTab(tab.id, info.frameId, { action: "AUTO_FILL_SCOPE", overwrite: true });
    return;
  }

  if (info.menuItemId === MENU_IDS.autoPage) {
    sendToTab(tab.id, info.frameId, { action: "AUTO_FILL_PAGE", overwrite: false });
    return;
  }

  if (String(info.menuItemId).startsWith("field:")) {
    sendToTab(tab.id, info.frameId, {
      action: "FILL_TARGET",
      fakeType: String(info.menuItemId).replace("field:", ""),
    });
  }
});
