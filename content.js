// 初始化内容脚本，负责在页面中识别表单字段并执行假数据填充。
(function initFakeDataContentScript() {
  if (window.__CN_FAKE_DATA_FILLER_READY__) {
    return;
  }
  window.__CN_FAKE_DATA_FILLER_READY__ = true;

  const fakeData = window.__CN_FAKE_DATA__;
  let lastContextTarget = null;
  let isLeftAltPressed = false;
  let lastAltClickTarget = null;
  let lastAltClickAt = 0;
  let lastShortcutFillTarget = null;
  let lastShortcutFillAt = 0;

  const fillableSelector = [
    "input",
    "textarea",
    "select",
    "[contenteditable='true']",
    "[contenteditable='plaintext-only']",
  ].join(",");

  const modalSelector = [
    "[role='dialog']",
    "[aria-modal='true']",
    ".modal",
    ".ant-modal",
    ".ant-modal-root",
    ".el-dialog",
    ".semi-modal",
    ".arco-modal",
    ".MuiDialog-root",
  ].join(",");

  const customSelectSelector = [
    ".ant-select:not(.ant-select-disabled)",
    ".el-select:not(.is-disabled)",
    ".semi-select:not(.semi-select-disabled)",
    ".arco-select:not(.arco-select-disabled)",
    ".MuiAutocomplete-root",
    ".MuiSelect-root",
    ".combo:not(.combo-disabled)",
    ".textbox.combo:not(.textbox-disabled)",
    "[role='combobox']",
  ].join(",");

  const customSelectTriggerSelector = [
    ".ant-select-selector",
    ".el-select__wrapper",
    ".semi-select-selection",
    ".arco-select-view",
    ".MuiSelect-select",
    ".combo-arrow",
    ".textbox-addon",
    ".textbox-text",
    "input",
    "[role='combobox']",
  ].join(",");

  const dropdownOptionSelector = [
    "[role='option']:not([aria-disabled='true'])",
    ".ant-select-item-option:not(.ant-select-item-option-disabled)",
    ".el-select-dropdown__item:not(.is-disabled)",
    ".semi-select-option:not(.semi-select-option-disabled)",
    ".arco-select-option:not(.arco-select-option-disabled)",
    ".MuiAutocomplete-option:not([aria-disabled='true'])",
    ".MuiMenuItem-root:not(.Mui-disabled)",
    ".ant-select-dropdown-menu-item:not(.ant-select-dropdown-menu-item-disabled)",
    ".combo-panel .combobox-item:not(.combobox-item-disabled)",
    ".combo-panel .tree-node:not(.tree-node-disabled)",
    ".combo-panel .datagrid-row",
    ".x-combo-list-item",
    ".layui-form-select dl dd:not(.layui-disabled)",
  ].join(",");

  const asyncSelectTimeout = 3000;
  const asyncSelectInterval = 120;
  const postSelectRepairDelay = 300;
  const selectRetryReasons = new Set([
    "no-ant-option",
    "ant-option-not-selected",
    "no-dropdown-option",
    "dropdown-option-not-selected",
    "no-select-option",
  ]);

  // 记录最近一次右键点击的元素，供右键菜单精确填充目标字段。
  document.addEventListener(
    "contextmenu",
    (event) => {
      lastContextTarget = event.target;
    },
    true
  );

  // 记录左 Alt 按下状态，兼容 dblclick 事件没有携带 altKey 的浏览器场景。
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.code === "AltLeft" || (event.key === "Alt" && event.location === 1)) {
        isLeftAltPressed = true;
      }
    },
    true
  );

  // 松开左 Alt 后重置快捷键状态。
  document.addEventListener(
    "keyup",
    (event) => {
      if (event.code === "AltLeft" || event.key === "Alt") {
        isLeftAltPressed = false;
      }
    },
    true
  );

  // 页面失焦时清理 Alt 状态，避免系统快捷键切走页面后状态残留。
  window.addEventListener("blur", () => {
    isLeftAltPressed = false;
    lastAltClickTarget = null;
    lastAltClickAt = 0;
  });

  // 判断当前鼠标事件是否满足 Alt 快捷填充条件。
  function isAltFillMouseEvent(event) {
    return Boolean(event.altKey || isLeftAltPressed);
  }

  // 执行快捷键单字段填充，并抑制短时间内 mousedown 与 dblclick 的重复触发。
  function fillShortcutTarget(target, event) {
    if (!target || (!isFillable(target) && !isCustomSelect(target))) {
      return false;
    }

    const now = Date.now();
    if (lastShortcutFillTarget === target && now - lastShortcutFillAt < 600) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    lastShortcutFillTarget = target;
    lastShortcutFillAt = now;
    event.preventDefault();
    event.stopPropagation();
    fillElement(target, { overwrite: true }).catch((error) => {
      console.warn("Alt double-click fake data fill failed:", error);
    });
    return true;
  }

  // 使用 mousedown 自行识别 Alt+双击，避免浏览器没有派发可靠 dblclick.altKey。
  document.addEventListener(
    "mousedown",
    (event) => {
      if (event.button !== 0 || !isAltFillMouseEvent(event)) {
        return;
      }

      const target = resolveFillTarget(event.target, false);
      if (!target || (!isFillable(target) && !isCustomSelect(target))) {
        return;
      }

      const now = Date.now();
      if (lastAltClickTarget === target && now - lastAltClickAt <= 550) {
        lastAltClickTarget = null;
        lastAltClickAt = 0;
        fillShortcutTarget(target, event);
        return;
      }

      lastAltClickTarget = target;
      lastAltClickAt = now;
    },
    true
  );

  // 按住 Alt 双击字段时，按字段语义自动填充当前字段。
  document.addEventListener(
    "dblclick",
    (event) => {
      if (!isAltFillMouseEvent(event)) {
        return;
      }

      const target = resolveFillTarget(event.target, false);
      fillShortcutTarget(target, event);
    },
    true
  );

  function safeCssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, "\\$&");
  }

  // 返回一个延迟指定毫秒数后 resolve 的 Promise。
  function delay(milliseconds) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, milliseconds);
    });
  }

  // 轮询读取异步出现的值，直到拿到值或超时。
  async function waitForValue(getValue, timeout = asyncSelectTimeout) {
    const startedAt = Date.now();
    let value = getValue();
    while (!value && Date.now() - startedAt < timeout) {
      await delay(asyncSelectInterval);
      value = getValue();
    }
    return value;
  }

  // 判断元素是否真实可见，包括 hidden、aria-hidden、样式和尺寸检查。
  function isVisible(element) {
    if (!element || !(element instanceof Element)) {
      return false;
    }
    if (element.closest("[hidden], [aria-hidden='true']")) {
      return false;
    }
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // 判断元素是否是可填充的原生输入控件，并排除隐藏、禁用和无意义类型。
  function isFillable(element) {
    if (!element || !(element instanceof Element) || !element.matches(fillableSelector)) {
      return false;
    }
    const customSelectOwner = element.closest(customSelectSelector);
    if (customSelectOwner && customSelectOwner !== element) {
      return false;
    }
    if (!isVisible(element)) {
      return false;
    }
    if (element.disabled) {
      return false;
    }
    if (element instanceof HTMLInputElement) {
      const ignoredTypes = new Set(["hidden", "button", "submit", "reset", "image", "file", "range", "color"]);
      if (ignoredTypes.has(element.type)) {
        return false;
      }
      if (isAntDatePickerInput(element)) {
        return true;
      }
      if (element.readOnly) {
        const readableText = `${element.type} ${collectText(element)}`.toLowerCase();
        return /date|time|日期|时间|生日|出生|入职|离职/.test(readableText);
      }
      return true;
    }
    return true;
  }

  // 判断元素是否是 Ant Design 旧版日期选择器的输入框。
  function isAntDatePickerInput(element) {
    return Boolean(
      element instanceof HTMLInputElement &&
        element.classList.contains("ant-calendar-picker-input") &&
        element.closest(".ant-calendar-picker")
    );
  }

  // 将 DatePicker 的外层容器、图标或子元素归一化到真正的日期输入框。
  function normalizeAntDatePickerTarget(element) {
    if (!(element instanceof Element)) {
      return null;
    }
    if (isAntDatePickerInput(element)) {
      return element;
    }
    const picker = element.closest(".ant-calendar-picker");
    const input = picker && picker.querySelector(".ant-calendar-picker-input");
    return isAntDatePickerInput(input) ? input : null;
  }

  // 将自定义选择器内部子元素归一化到外层选择器容器。
  function normalizeCustomSelect(element) {
    return (
      element.closest(
        ".ant-select, .el-select, .semi-select, .arco-select, .MuiAutocomplete-root, .MuiSelect-root, .combo, .textbox.combo"
      ) || element
    );
  }

  // 判断元素是否是支持自动选择的自定义下拉控件。
  function isCustomSelect(element) {
    if (!element || !(element instanceof Element) || element instanceof HTMLSelectElement) {
      return false;
    }
    if (!element.matches(customSelectSelector) || !isVisible(element)) {
      return false;
    }
    return element.getAttribute("aria-disabled") !== "true";
  }

  // 判断自定义下拉控件当前是否已有选中值。
  function hasCustomSelectValue(element) {
    const valueSelectors = [
      ".ant-select-selection-item",
      ".ant-select-selection-selected-value",
      ".el-select__selected-item",
      ".semi-select-selection-text",
      ".arco-select-view-value",
      ".MuiSelect-select",
      ".textbox-value",
      ".textbox-text",
      "[data-value]",
    ];
    const placeholderSelectors = [
      ".ant-select-selection-placeholder",
      ".el-select__placeholder",
      ".semi-select-selection-placeholder",
      ".arco-select-view-placeholder",
    ];
    const easyuiTextInput = element.querySelector(".textbox-text");
    if (easyuiTextInput && String(easyuiTextInput.value || "").trim()) {
      return true;
    }
    const hasVisiblePlaceholder = placeholderSelectors.some((selector) => {
      const node = element.querySelector(selector);
      return node && isVisible(node) && node.textContent.trim();
    });
    if (hasVisiblePlaceholder) {
      return false;
    }
    return valueSelectors.some((selector) => {
      const node = element.querySelector(selector);
      return node && isVisible(node) && node.textContent.trim();
    });
  }

  // 判断字段是否具有必填语义或位于必填表单项内。
  function isRequired(element) {
    return Boolean(
      element.required ||
        element.getAttribute("aria-required") === "true" ||
        element.closest(".required, .is-required, .ant-form-item-required, [data-required='true']") ||
        collectText(element).includes("*")
    );
  }

  // 判断字段当前是否为空，兼容原生输入、选择器、复选框和可编辑内容。
  function isEmpty(element) {
    if (isCustomSelect(element)) {
      return !hasCustomSelectValue(element);
    }
    if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
      return !element.checked;
    }
    if (element instanceof HTMLSelectElement) {
      return !element.value;
    }
    if (element.isContentEditable) {
      return !element.textContent.trim();
    }
    return !String(element.value || "").trim();
  }

  // 收集字段关联的 label 和表单项标签文本。
  function textFromLabels(element) {
    const values = [];
    if (element.id) {
      const explicitLabel = document.querySelector(`label[for="${safeCssEscape(element.id)}"]`);
      if (explicitLabel) {
        values.push(explicitLabel.innerText);
      }
    }
    if (element.labels) {
      values.push(...Array.from(element.labels).map((label) => label.innerText));
    }
    const wrappedLabel = element.closest("label");
    if (wrappedLabel) {
      values.push(wrappedLabel.innerText);
    }
    const formItem = element.closest(".ant-form-item, .form-item, .form-field, .form-row, .form-group");
    const visualLabel = formItem && formItem.querySelector(".ant-form-item-label, .form-label, .label, label");
    if (visualLabel) {
      values.push(visualLabel.innerText);
    }
    return values.filter(Boolean).join(" ");
  }

  // 收集字段自身身份信息文本，用于更精确判断字段语义。
  function collectFieldIdentityText(element) {
    const values = [
      element.getAttribute("data-fake-type"),
      element.getAttribute("data-faker"),
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.getAttribute("title"),
      element.getAttribute("autocomplete"),
      textFromLabels(element),
    ];

    return values.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  // 收集字段及其附近容器的文本线索，用于推断应生成的数据类型。
  function collectText(element) {
    const values = [
      element.getAttribute("data-fake-type"),
      element.getAttribute("data-faker"),
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.getAttribute("title"),
      element.getAttribute("autocomplete"),
      textFromLabels(element),
    ];

    const fieldContainer = element.closest(
      ".field, .form-field, .form-item, .form-row, .form-group, .ant-form-item, .el-form-item, .semi-form-field, .arco-form-item, td, th"
    );
    if (fieldContainer) {
      values.push(fieldContainer.innerText);
    }

    return values.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  // 根据显式标记、输入类型、标签和附近文本推断字段的数据类型。
  function inferType(element) {
    const explicitType = element.getAttribute("data-fake-type") || element.getAttribute("data-faker");
    if (explicitType && fakeData.types.includes(explicitType)) {
      return explicitType;
    }

    const text = collectText(element).toLowerCase();

    if (element instanceof HTMLInputElement) {
      if (element.type === "tel") {
        return "mobile";
      }
      if (element.type === "email") {
        return "email";
      }
      if (element.type === "date") {
        return /生日|出生|birth/.test(text) ? "birthDate" : "date";
      }
      if (element.type === "datetime-local") {
        return "datetime";
      }
      if (element.type === "month") {
        return "month";
      }
      if (element.type === "url") {
        return "url";
      }
      if (element.type === "password") {
        return "password";
      }
    }

    const patternMap = [
      ["idCard", /身份证|证件号|证件号码|公民身份|id\s*card|citizen/],
      ["mobile", /手机号|手机|联系电话|联系电话|电话|mobile|phone|tel/],
      ["email", /邮箱|邮件|电子邮件|email|e-mail/],
      ["birthDate", /生日|出生日期|出生|birth/],
      ["datetime", /日期时间|时间点|datetime|date\s*time/],
      ["date", /日期|入职|离职|开始时间|结束时间|开始日期|结束日期|date/],
      ["gender", /性别|gender|sex/],
      ["company", /公司|单位|企业|机构|组织|company|organization|corp/],
      ["address", /地址|住址|所在地区|详细地址|address/],
      ["bankCard", /银行卡|卡号|银行账号|bank/],
      ["postcode", /邮编|邮政编码|postcode|zip/],
      [
        "amount",
        /金额|价格|费用|薪资|月薪|工资|余额|注册资本|认缴资本|实缴资本|资本|万元|万|amount|price|money|salary|capital/,
      ],
      ["age", /年龄|age/],
      ["number", /数量|人数|次数|编号|序号|比例|百分比|年限|期限|number|count|qty|num|rate|ratio/],
      ["username", /用户名|账号|登录名|user\s*name|account/],
      ["name", /姓名|联系人|客户名|员工名|真实姓名|收件人|name/],
      ["sentence", /备注|说明|描述|简介|意见|comment|remark|note|description/],
    ];

    const matched = patternMap.find(([, pattern]) => pattern.test(text));
    if (matched) {
      return matched[0];
    }

    if (element instanceof HTMLInputElement && element.type === "number") {
      return "number";
    }
    if (element instanceof HTMLTextAreaElement) {
      return "sentence";
    }
    return "text";
  }

  // 将日期数字补齐为两位字符串。
  function padDatePart(value) {
    return String(value).padStart(2, "0");
  }

  // 将 Date 对象格式化为 YYYY-MM-DD。
  function formatDate(date) {
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
  }

  // 在两个日期之间随机生成一个日期。
  function randomDateBetween(start, end) {
    const startTime = start.getTime();
    const endTime = end.getTime();
    return new Date(Math.floor(Math.random() * (endTime - startTime + 1)) + startTime);
  }

  // 返回在指定日期基础上增加天数后的新 Date。
  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  // 返回在指定日期基础上增加年份后的新 Date。
  function addYears(date, years) {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() + years);
    return result;
  }

  // 判断文本是否表示证件或业务有效期的开始日期字段。
  function isStartValidityText(text) {
    return /起始有效期|证件起始|begindate|startdate/i.test(text);
  }

  // 判断文本是否表示证件或业务有效期的结束日期字段。
  function isEndValidityText(text) {
    return /证件有效期|有效期|validdate|enddate|expiredate|expirydate|expirationdate/i.test(text);
  }

  // 根据字段语义生成更合理的日期，例如开始日期早于今天、结束日期晚于今天。
  function generateContextualDate(element, inferredType) {
    if (inferredType === "birthDate") {
      return fakeData.generate("birthDate");
    }

    const text = collectText(element);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isStartValidityText(text)) {
      return formatDate(addDays(today, -1));
    }

    if (isEndValidityText(text)) {
      return formatDate(addYears(today, 1));
    }

    if (/起始有效期|起始日期|开始日期|开始时间|生效日期|发证日期/.test(text)) {
      const latest = new Date(today);
      latest.setDate(latest.getDate() - 1);
      const earliest = new Date(today);
      earliest.setFullYear(earliest.getFullYear() - 5);
      return formatDate(randomDateBetween(earliest, latest));
    }

    if (/有效期|截止日期|截止时间|到期|失效日期|结束日期|结束时间/.test(text)) {
      const earliest = new Date(today);
      earliest.setDate(earliest.getDate() + 30);
      const latest = new Date(today);
      latest.setFullYear(latest.getFullYear() + 5);
      return formatDate(randomDateBetween(earliest, latest));
    }

    return fakeData.generate("date");
  }

  // 通过原生 value setter 写入值，确保 React/Vue 等框架能感知变更。
  function setNativeValue(element, value) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  // 触发 input、change 和 blur 事件，让前端框架同步表单状态。
  function dispatchReactFriendlyEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
  }

  // 派发键盘事件，用于模拟按键确认等控件交互。
  function dispatchKeyboardEvent(element, type, key, code, keyCode) {
    element.dispatchEvent(
      new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        key,
        code,
        keyCode,
        which: keyCode,
      })
    );
  }

  // 为 Ant Design 日期输入框派发输入、变更、回车确认和失焦事件。
  function dispatchAntDatePickerEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    dispatchKeyboardEvent(element, "keydown", "Enter", "Enter", 13);
    dispatchKeyboardEvent(element, "keyup", "Enter", "Enter", 13);
    element.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
  }

  // 从原生 select 控件中挑选一个可用选项值，性别字段优先匹配男女选项。
  function pickSelectValue(select, type) {
    const options = Array.from(select.options).filter((option) => !option.disabled);
    const nonEmptyOptions = options.filter((option) => option.value || option.textContent.trim());
    if (nonEmptyOptions.length === 0) {
      return "";
    }

    if (type === "gender") {
      const genderOption = nonEmptyOptions.find((option) => /男|女|male|female/i.test(option.textContent));
      if (genderOption) {
        return genderOption.value;
      }
    }

    const usableOptions = nonEmptyOptions.filter((option) => option.value !== "");
    return (usableOptions[0] || nonEmptyOptions[0]).value;
  }

  // 等待原生 select 控件出现可选值。
  async function waitForSelectValue(select, type, timeout = asyncSelectTimeout) {
    return waitForValue(() => pickSelectValue(select, type), timeout);
  }

  // 获取下拉选项的标准化可见文本。
  function getOptionText(option) {
    return String(option.innerText || option.textContent || "").replace(/\s+/g, " ").trim();
  }

  // 判断下拉选项是否可见、非空且不是加载或无数据占位项。
  function isUsableDropdownOption(option) {
    if (!isVisible(option)) {
      return false;
    }
    const text = getOptionText(option);
    if (!text) {
      return false;
    }
    return !/暂无|无数据|没有数据|加载中|loading|no data/i.test(text);
  }

  // 获取当前页面中真正可点击的可见下拉选项。
  function getVisibleDropdownOptions() {
    const options = Array.from(document.querySelectorAll(dropdownOptionSelector)).filter(isUsableDropdownOption);
    const topmostOptions = options.filter((option) => {
      const rect = option.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + Math.min(rect.height / 2, 12);
      const topElement = document.elementFromPoint(centerX, centerY);
      return topElement && (option === topElement || option.contains(topElement) || topElement.contains(option));
    });
    return topmostOptions.length ? topmostOptions : options;
  }

  // 从通用下拉选项中挑选要点击的选项，性别字段优先匹配男女。
  function pickDropdownOption(type) {
    const options = getVisibleDropdownOptions();
    if (type === "gender") {
      const genderOption = options.find((option) => /男|女|male|female/i.test(getOptionText(option)));
      if (genderOption) {
        return genderOption;
      }
    }
    return options[0] || null;
  }

  // 获取 Ant Design Select 内部用于控制下拉列表的输入框。
  function getAntSelectInput(element) {
    return element.querySelector("input[role='combobox'], .ant-select-selection-search-input");
  }

  // 读取 Ant Design Select 当前显示的选中值。
  function getAntSelectedValue(element) {
    const selectedValue = element.querySelector(".ant-select-selection-selected-value");
    if (selectedValue && isVisible(selectedValue)) {
      return selectedValue.getAttribute("title") || selectedValue.textContent.trim();
    }

    const selectedItem = element.querySelector(".ant-select-selection-item");
    if (selectedItem && isVisible(selectedItem)) {
      return selectedItem.textContent.trim();
    }

    return "";
  }

  // 查找当前 Ant Design Select 对应的可见下拉面板。
  function getVisibleAntDropdown(element) {
    const input = getAntSelectInput(element);
    const listId = input && (input.getAttribute("aria-controls") || input.getAttribute("aria-owns"));
    if (listId) {
      const listbox = document.getElementById(listId);
      const dropdown = listbox && listbox.closest(".ant-select-dropdown");
      if (dropdown && isVisible(dropdown)) {
        return dropdown;
      }
    }

    return (
      Array.from(document.querySelectorAll(".ant-select-dropdown"))
        .filter((dropdown) => isVisible(dropdown) && !dropdown.classList.contains("ant-select-dropdown-hidden"))
        .at(-1) || null
    );
  }

  // 从 Ant Design Select 下拉面板中挑选要点击的选项。
  function pickAntOption(element, type) {
    const dropdown = getVisibleAntDropdown(element);
    if (!dropdown) {
      return null;
    }
    const options = Array.from(
      dropdown.querySelectorAll(
        ".ant-select-item-option:not(.ant-select-item-option-disabled), .ant-select-dropdown-menu-item:not(.ant-select-dropdown-menu-item-disabled)"
      )
    ).filter(isUsableDropdownOption);
    if (type === "gender") {
      const genderOption = options.find((option) => /男|女|male|female/i.test(getOptionText(option)));
      if (genderOption) {
        return genderOption;
      }
    }
    return options[0] || null;
  }

  // 派发鼠标事件，用于模拟用户点击自定义控件。
  function dispatchMouseEvent(element, type) {
    element.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        buttons: type === "mouseup" || type === "click" ? 0 : 1,
        view: window,
      })
    );
  }

  // 在元素支持原生 click 时直接触发 click 方法。
  function dispatchNativeClick(element) {
    if (typeof element.click === "function") {
      element.click();
    }
  }

  // 按 mousedown、mouseup、click 顺序模拟一次完整点击。
  function clickElement(element) {
    dispatchMouseEvent(element, "mousedown");
    dispatchMouseEvent(element, "mouseup");
    dispatchMouseEvent(element, "click");
  }

  // 将 YYYY-MM-DD 字符串解析成日期对象，供日期面板定位目标月份和日期。
  function parseIsoDate(value) {
    const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!matched) {
      return null;
    }
    const [, year, month, day] = matched;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  // 从 Ant Design 日历单元格的 title 文本中解析日期。
  function parseAntCalendarCellDate(cell) {
    const title = cell.getAttribute("title") || "";
    const matched = /(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/.exec(title);
    if (!matched) {
      return null;
    }
    const [, year, month, day] = matched;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  // 判断两个日期是否是同一个年月。
  function isSameMonth(left, right) {
    return Boolean(
      left && right && left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth()
    );
  }

  // 计算两个日期所在月份之间的距离。
  function getMonthDistance(from, to) {
    return (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
  }

  // 获取当前可见的 Ant Design 日期面板。
  function getVisibleAntCalendar() {
    return (
      Array.from(document.querySelectorAll(".ant-calendar-picker-container"))
        .filter((calendar) => isVisible(calendar) && !calendar.classList.contains("ant-calendar-picker-container-hidden"))
        .at(-1) || null
    );
  }

  // 获取日期面板中当前月份的可用日期单元格。
  function getUsableAntCalendarCells(calendar) {
    return Array.from(calendar.querySelectorAll("td.ant-calendar-cell"))
      .filter((cell) => {
        const className = cell.className || "";
        return (
          !className.includes("disabled") &&
          !className.includes("last-month") &&
          !className.includes("next-month") &&
          isVisible(cell.querySelector(".ant-calendar-date") || cell)
        );
      })
      .map((cell) => ({
        cell,
        date: parseAntCalendarCellDate(cell),
        trigger: cell.querySelector(".ant-calendar-date") || cell,
      }))
      .filter((item) => item.date && item.trigger);
  }

  // 根据面板中占比最多的日期单元格推断当前展示的年月。
  function getAntCalendarVisibleMonth(calendar) {
    const counts = new Map();
    for (const { date } of getUsableAntCalendarCells(calendar)) {
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const [bestKey] =
      Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0] || [];
    if (!bestKey) {
      return null;
    }
    const [year, month] = bestKey.split("-").map(Number);
    return new Date(year, month, 1);
  }

  // 通过点击上/下月或上/下年按钮，将日期面板移动到目标日期所在月份。
  async function moveAntCalendarToDate(calendar, targetDate) {
    if (!targetDate) {
      return false;
    }

    for (let index = 0; index < 24; index += 1) {
      const visibleMonth = getAntCalendarVisibleMonth(calendar);
      if (!visibleMonth) {
        return false;
      }
      if (isSameMonth(visibleMonth, targetDate)) {
        return true;
      }

      const distance = getMonthDistance(visibleMonth, targetDate);
      const selector =
        distance > 11
          ? ".ant-calendar-next-year-btn"
          : distance > 0
            ? ".ant-calendar-next-month-btn"
            : distance < -11
              ? ".ant-calendar-prev-year-btn"
              : ".ant-calendar-prev-month-btn";
      const button = calendar.querySelector(selector);
      if (!button) {
        return false;
      }
      clickElement(button);
      await delay(80);
    }

    return false;
  }

  // 从日期面板中选择目标日期；如果目标日期不可用，则选择一个当前可见的可用日期。
  function pickAntCalendarDateCell(calendar, value) {
    const targetDate = parseIsoDate(value);
    const usableCells = getUsableAntCalendarCells(calendar);
    const exactCell =
      targetDate &&
      usableCells.find((item) => formatDate(item.date) === formatDate(targetDate));
    return exactCell || usableCells[0] || null;
  }

  // 等待日期输入框的值连续稳定，避免组件还在异步更新时过早判断成功。
  async function waitForStableDatePickerValue(element, expectedValue, timeout = 1800) {
    const startedAt = Date.now();
    let lastValue = "";
    let stableCount = 0;

    while (Date.now() - startedAt < timeout) {
      const currentValue = String(element.value || "").trim();
      const matchesExpected = !expectedValue || currentValue === expectedValue;

      if (currentValue && matchesExpected) {
        if (currentValue === lastValue) {
          stableCount += 1;
        } else {
          lastValue = currentValue;
          stableCount = 1;
        }

        if (stableCount >= 3) {
          return true;
        }
      } else {
        lastValue = "";
        stableCount = 0;
      }

      await delay(120);
    }

    return false;
  }

  // 判断日期字段所在的 Ant Design 表单项是否仍处于校验错误状态。
  function hasAntFormError(element) {
    const formItem = element.closest(".ant-form-item, .form-item, .form-field, .form-row, .form-group");
    if (!formItem) {
      return false;
    }

    const hasErrorClass =
      formItem.classList.contains("has-error") ||
      formItem.classList.contains("ant-form-item-has-error") ||
      Boolean(formItem.querySelector(".has-error, .ant-form-item-has-error"));
    const errorNode = formItem.querySelector(".ant-form-explain, .ant-form-item-explain-error");
    const hasVisibleErrorText = Boolean(errorNode && isVisible(errorNode) && errorNode.textContent.trim());

    return hasErrorClass || hasVisibleErrorText;
  }

  // 二次确认 DatePicker 是否已经稳定写入，并且通过当前表单项校验。
  async function confirmAntDatePickerValue(element, expectedValue) {
    dispatchAntDatePickerEvents(element);

    const hasStableValue = await waitForStableDatePickerValue(element, expectedValue);
    if (!hasStableValue) {
      return false;
    }

    await delay(250);
    return !hasAntFormError(element);
  }

  // 打开 Ant Design DatePicker 并点击日历日期，模拟真实用户选择日期。
  async function selectAntDatePickerDate(element, value) {
    const picker = element.closest(".ant-calendar-picker") || element;
    const previousValue = String(element.value || "").trim();

    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      element.focus();
    }
    clickElement(picker);
    clickElement(element);

    const calendar = await waitForValue(getVisibleAntCalendar, asyncSelectTimeout);
    if (!calendar) {
      return { selected: false, value };
    }

    await moveAntCalendarToDate(calendar, parseIsoDate(value));
    const picked = pickAntCalendarDateCell(calendar, value);
    if (!picked) {
      return { selected: false, value };
    }

    const pickedValue = formatDate(picked.date);
    picked.trigger.scrollIntoView({ block: "nearest" });
    clickElement(picked.trigger);
    await delay(120);

    if (!String(element.value || "").trim() || String(element.value || "").trim() === previousValue) {
      dispatchNativeClick(picked.trigger);
      await delay(120);
    }

    const confirmed = await confirmAntDatePickerValue(element, pickedValue);
    return { selected: confirmed, value: pickedValue };
  }

  // 聚焦并点击自定义选择器的触发区域，打开下拉面板。
  function openCustomSelect(element) {
    const trigger = element.matches(".ant-select")
      ? element.querySelector(".ant-select-selection") || element.querySelector(customSelectTriggerSelector) || element
      : element.querySelector(customSelectTriggerSelector) || element;
    try {
      trigger.focus({ preventScroll: true });
    } catch (error) {
      trigger.focus();
    }
    clickElement(trigger);
  }

  // 点击 Ant Design Select 选项，并通过多种点击方式确认选中成功。
  async function selectAntOption(element, option) {
    const previousValue = getAntSelectedValue(element);
    clickElement(option);
    await delay(30);
    if (hasCustomSelectValue(element) && (!previousValue || getAntSelectedValue(element) !== previousValue)) {
      return true;
    }

    const optionContent = option.querySelector(".ant-select-item-option-content");
    if (optionContent && optionContent !== option) {
      clickElement(optionContent);
      await delay(30);
    }
    if (hasCustomSelectValue(element) && (!previousValue || getAntSelectedValue(element) !== previousValue)) {
      return true;
    }

    dispatchNativeClick(option);
    await delay(30);
    return hasCustomSelectValue(element) && (!previousValue || getAntSelectedValue(element) !== previousValue);
  }

  // 填充 Ant Design Select 控件，支持已有值跳过和强制覆盖。
  async function fillAntSelect(element, options = {}) {
    const shouldOverwrite = Boolean(options.overwrite || options.forceType);
    if (!shouldOverwrite && hasCustomSelectValue(element)) {
      return { filled: false, reason: "has-value" };
    }

    const inferredType = options.forceType || inferType(element);
    openCustomSelect(element);

    const option = await waitForValue(() => pickAntOption(element, inferredType), options.optionWaitTimeout);
    if (!option) {
      return { filled: false, reason: "no-ant-option" };
    }

    const value = getOptionText(option);
    option.scrollIntoView({ block: "nearest" });
    const selected = await selectAntOption(element, option);
    if (!selected) {
      return { filled: false, reason: "ant-option-not-selected", type: inferredType, value };
    }

    dispatchReactFriendlyEvents(element);
    highlight(element);
    return { filled: true, type: inferredType, value };
  }

  // 填充通用自定义下拉控件，打开下拉后选择可用选项。
  async function fillCustomSelect(element, options = {}) {
    if (element.matches(".ant-select")) {
      return fillAntSelect(element, options);
    }

    const shouldOverwrite = Boolean(options.overwrite || options.forceType);
    if (!shouldOverwrite && hasCustomSelectValue(element)) {
      return { filled: false, reason: "has-value" };
    }

    const inferredType = options.forceType || inferType(element);
    openCustomSelect(element);

    const option = await waitForValue(() => pickDropdownOption(inferredType), options.optionWaitTimeout);
    if (!option) {
      return { filled: false, reason: "no-dropdown-option" };
    }

    const value = getOptionText(option);
    clickElement(option);
    await delay(50);

    if (!hasCustomSelectValue(element)) {
      return { filled: false, reason: "dropdown-option-not-selected", type: inferredType, value };
    }

    dispatchReactFriendlyEvents(element);
    highlight(element);
    return { filled: true, type: inferredType, value };
  }

  // 设置复选框或单选框选中状态，并触发框架可感知的事件。
  function setChecked(element, checked) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked");
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, checked);
    } else {
      element.checked = checked;
    }
    element.dispatchEvent(new Event("click", { bubbles: true, composed: true }));
    dispatchReactFriendlyEvents(element);
  }

  // 临时高亮已填充字段，给用户一个视觉反馈。
  function highlight(element) {
    const previousOutline = element.style.outline;
    const previousOutlineOffset = element.style.outlineOffset;
    element.style.outline = "2px solid #1f7a6d";
    element.style.outlineOffset = "2px";
    window.setTimeout(() => {
      element.style.outline = previousOutline;
      element.style.outlineOffset = previousOutlineOffset;
    }, 900);
  }

  // 按控件类型填充单个字段，覆盖原生输入、日期、select、自定义下拉和可编辑元素。
  async function fillElement(element, options = {}) {
    if (isCustomSelect(element)) {
      return fillCustomSelect(element, options);
    }

    if (!isFillable(element)) {
      return { filled: false, reason: "not-fillable" };
    }

    const shouldOverwrite = Boolean(options.overwrite || options.forceType);
    if (!shouldOverwrite && !isEmpty(element)) {
      return { filled: false, reason: "has-value" };
    }

    const inferredType = options.forceType || inferType(element);

    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      element.focus();
    }

    if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
      setChecked(element, true);
      highlight(element);
      return { filled: true, type: "checked" };
    }

    if (isAntDatePickerInput(element)) {
      const value = generateContextualDate(element, inferredType);
      const selectedByCalendar = await selectAntDatePickerDate(element, value);
      if (selectedByCalendar.selected) {
        highlight(element.closest(".ant-calendar-picker") || element);
        return { filled: true, type: inferredType, value: selectedByCalendar.value };
      }
      setNativeValue(element, value);
      dispatchAntDatePickerEvents(element);
      const confirmed = await confirmAntDatePickerValue(element, value);
      if (!confirmed) {
        return { filled: false, reason: "date-not-validated", type: inferredType, value };
      }
      highlight(element.closest(".ant-calendar-picker") || element);
      return { filled: true, type: inferredType, value };
    }

    if (element instanceof HTMLSelectElement) {
      const value = await waitForSelectValue(element, inferredType, options.optionWaitTimeout);
      if (!value) {
        return { filled: false, reason: "no-select-option" };
      }
      setNativeValue(element, value);
      dispatchReactFriendlyEvents(element);
      highlight(element);
      return { filled: true, type: inferredType, value };
    }

    const value = ["date", "birthDate"].includes(inferredType)
      ? generateContextualDate(element, inferredType)
      : fakeData.generate(inferredType);

    if (element.isContentEditable) {
      element.textContent = value;
      dispatchReactFriendlyEvents(element);
      highlight(element);
      return { filled: true, type: inferredType, value };
    }

    setNativeValue(element, value);
    dispatchReactFriendlyEvents(element);
    highlight(element);
    return { filled: true, type: inferredType, value };
  }

  // 在指定范围内收集所有可填充元素，并按填充顺序排序。
  function getFillableElements(scope) {
    const nativeElements = Array.from(scope.querySelectorAll(fillableSelector)).filter(isFillable);
    const customSelectElements = Array.from(scope.querySelectorAll(customSelectSelector))
      .map(normalizeCustomSelect)
      .filter(isCustomSelect);
    return sortFillableElements(Array.from(new Set([...nativeElements, ...customSelectElements])));
  }

  // 计算字段填充主优先级，优先处理下拉和选择类控件。
  function getFillPriority(element) {
    if (isCustomSelect(element) || element instanceof HTMLSelectElement) {
      return 0;
    }
    if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
      return 1;
    }
    if (isAntDatePickerInput(element)) {
      return 2;
    }
    return 3;
  }

  // 计算日期字段的次级优先级，保证开始日期先于结束日期填充。
  function getFillSubPriority(element) {
    if (!isAntDatePickerInput(element)) {
      return 0;
    }

    const text = collectFieldIdentityText(element);
    if (isStartValidityText(text)) {
      return 0;
    }
    if (isEndValidityText(text)) {
      return 1;
    }
    return 2;
  }

  // 根据填充优先级和页面原始顺序对字段排序。
  function sortFillableElements(elements) {
    return elements
      .map((element, index) => ({
        element,
        index,
        priority: getFillPriority(element),
        subPriority: getFillSubPriority(element),
      }))
      .sort(
        (left, right) =>
          left.priority - right.priority || left.subPriority - right.subPriority || left.index - right.index
      )
      .map((item) => item.element);
  }

  // 获取字段的处理单元，避免同一个自定义控件被重复填充。
  function getProcessingUnit(element) {
    if (isCustomSelect(element)) {
      return element.closest(".ant-form-item, .form-item, .form-field, .form-row, .form-group") || element;
    }
    return element;
  }

  // 判断本次填充失败是否属于下拉选项异步加载导致的可重试场景。
  function shouldRetryFill(result) {
    return result && !result.filled && selectRetryReasons.has(result.reason);
  }

  // 判断填充下拉控件后是否需要等待联动字段渲染。
  function shouldWaitForSelectSideEffects(element, result) {
    return Boolean(result && result.filled && (isCustomSelect(element) || element instanceof HTMLSelectElement));
  }

  // 判断下拉联动完成后是否应该补填该字段。
  function shouldRepairAfterSelect(element) {
    if (isCustomSelect(element) || element instanceof HTMLSelectElement) {
      return false;
    }
    if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
      return false;
    }
    return isFillable(element);
  }

  // 查找页面中最上层的可见弹窗容器。
  // 判断字段是否应延后处理，避免 DatePicker 的异步确认阻塞其他字段填充。
  function shouldDeferDatePickerFill(element) {
    return isAntDatePickerInput(element);
  }

  function findTopVisibleModal() {
    const modals = Array.from(document.querySelectorAll(modalSelector)).filter(isVisible);
    return modals.at(-1) || null;
  }

  // 根据当前目标元素寻找最合适的填充范围，优先弹窗，其次表单，最后页面主体。
  function findNearestScope(target) {
    if (target instanceof Element) {
      const modal = target.closest(modalSelector);
      if (modal && isVisible(modal)) {
        return modal;
      }
      const form = target.closest("form");
      if (form && isVisible(form)) {
        return form;
      }
    }
    return findTopVisibleModal() || document.body;
  }

  // 批量填充指定范围内的字段，并处理下拉异步加载和联动字段补填。
  async function fillScope(scope, options = {}) {
    const processedElements = new Set();
    const deferredElements = new Set();
    const deferredDateFillers = new Map();
    const results = [];
    let filledSelect = false;
    const initialCount = getFillableElements(scope).length;
    const retryPasses = [
      { onlyDeferred: false, optionWaitTimeout: 250, beforeDelay: 0 },
      { onlyDeferred: true, optionWaitTimeout: 1000, beforeDelay: 500 },
    ];
    const queueDeferredDateFill = (element, fillOptions) => {
      const unit = getProcessingUnit(element);
      if (!deferredDateFillers.has(unit)) {
        deferredDateFillers.set(unit, { element, options: fillOptions });
      }
      deferredElements.delete(unit);
      processedElements.add(unit);
    };

    for (const pass of retryPasses) {
      if (pass.onlyDeferred && deferredElements.size === 0) {
        break;
      }
      if (pass.beforeDelay) {
        await delay(pass.beforeDelay);
      }

      const attemptedThisPass = new Set();
      let guard = 0;

      while (guard < Math.max(initialCount, 1) + 5) {
        guard += 1;
        const currentScope = document.contains(scope) ? scope : findTopVisibleModal() || document.body;
        const elements = getFillableElements(currentScope);
        const candidate = elements.find((element) => {
          const unit = getProcessingUnit(element);
          if (processedElements.has(unit) || attemptedThisPass.has(unit)) {
            return false;
          }
          if (pass.onlyDeferred && !deferredElements.has(unit)) {
            return false;
          }
          if (!options.overwrite && !isEmpty(element)) {
            return false;
          }
          if (!pass.onlyDeferred && shouldDeferDatePickerFill(element)) {
            attemptedThisPass.add(unit);
            queueDeferredDateFill(element, {
              ...options,
              optionWaitTimeout: pass.optionWaitTimeout,
            });
            return false;
          }
          return true;
        });

        if (!candidate) {
          break;
        }

        const unit = getProcessingUnit(candidate);
        attemptedThisPass.add(unit);

        const result = await fillElement(candidate, {
          ...options,
          optionWaitTimeout: pass.optionWaitTimeout,
        });
        results.push(result);

        if (shouldWaitForSelectSideEffects(candidate, result)) {
          filledSelect = true;
        }

        if (shouldRetryFill(result)) {
          deferredElements.add(unit);
          continue;
        }

        deferredElements.delete(unit);
        processedElements.add(unit);
      }
    }

    if (filledSelect) {
      await delay(postSelectRepairDelay);
      const currentScope = document.contains(scope) ? scope : findTopVisibleModal() || document.body;
      const repairCandidates = getFillableElements(currentScope).filter(
        (element) => shouldRepairAfterSelect(element) && isEmpty(element)
      );
      for (const candidate of repairCandidates) {
        if (shouldDeferDatePickerFill(candidate)) {
          queueDeferredDateFill(candidate, {
            ...options,
            optionWaitTimeout: 250,
          });
          continue;
        }
        const result = await fillElement(candidate, {
          ...options,
          optionWaitTimeout: 250,
        });
        results.push(result);
      }
    }

    for (const { element, options: fillOptions } of deferredDateFillers.values()) {
      if (!document.contains(element) || (!options.overwrite && !isEmpty(element))) {
        continue;
      }
      const result = await fillElement(element, fillOptions);
      results.push(result);
    }

    const filled = results.filter((result) => result.filled);
    return {
      scanned: initialCount,
      filled: filled.length,
      skipped: Math.max(initialCount - filled.length, 0),
      details: results,
    };
  }

  // 根据触发元素解析实际要填充的字段，兼容 DatePicker 外层、自定义下拉和当前焦点。
  function resolveFillTarget(sourceTarget, useActiveFallback = true) {
    const contextDate = normalizeAntDatePickerTarget(sourceTarget);
    const activeDate = useActiveFallback ? normalizeAntDatePickerTarget(document.activeElement) : null;
    const contextSelect = sourceTarget instanceof Element ? normalizeCustomSelect(sourceTarget) : null;
    const activeSelect = document.activeElement instanceof Element ? normalizeCustomSelect(document.activeElement) : null;
    return contextDate
      ? contextDate
      : isCustomSelect(contextSelect)
        ? contextSelect
        : isFillable(sourceTarget)
          ? sourceTarget
          : activeDate
            ? activeDate
            : useActiveFallback && isCustomSelect(activeSelect)
              ? activeSelect
              : useActiveFallback
                ? document.activeElement
                : null;
  }

  // 填充用户右键或当前聚焦的单个字段，可强制指定假数据类型。
  async function fillTarget(forceType) {
    const target = resolveFillTarget(lastContextTarget, true);
    if (!isFillable(target) && !isCustomSelect(target)) {
      return { scanned: 0, filled: 0, skipped: 0, reason: "no-active-field" };
    }
    const result = await fillElement(target, { forceType, overwrite: true });
    return { scanned: 1, filled: result.filled ? 1 : 0, skipped: result.filled ? 0 : 1, details: [result] };
  }

  // 监听 background 或 popup 发来的填充消息，并返回扫描和填充统计结果。
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.action) {
      return false;
    }
    if (!["FILL_TARGET", "AUTO_FILL_PAGE", "AUTO_FILL_SCOPE"].includes(message.action)) {
      return false;
    }

    (async () => {
      if (message.action === "FILL_TARGET") {
        sendResponse(await fillTarget(message.fakeType));
        return;
      }

      if (message.action === "AUTO_FILL_PAGE") {
        sendResponse(await fillScope(document.body, { overwrite: Boolean(message.overwrite) }));
        return;
      }

      if (message.action === "AUTO_FILL_SCOPE") {
        const scope = findNearestScope(lastContextTarget || document.activeElement);
        sendResponse(await fillScope(scope, { overwrite: Boolean(message.overwrite) }));
      }
    })().catch((error) => {
      sendResponse({ scanned: 0, filled: 0, skipped: 0, reason: error.message || "fill-failed" });
    });

    return true;
  });
})();
