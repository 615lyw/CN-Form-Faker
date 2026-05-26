// 将中国地区测试数据生成器挂载到全局对象，供内容脚本按字段类型调用。
(function attachChineseFakeData(global) {
  const surnames = [
    "王",
    "李",
    "张",
    "刘",
    "陈",
    "杨",
    "黄",
    "赵",
    "周",
    "吴",
    "徐",
    "孙",
    "胡",
    "朱",
    "高",
    "林",
    "何",
    "郭",
    "马",
    "罗",
  ];

  const givenNames = [
    "明轩",
    "若溪",
    "梓涵",
    "一诺",
    "嘉宁",
    "思远",
    "雨桐",
    "子墨",
    "诗涵",
    "宇航",
    "晨曦",
    "浩然",
    "欣怡",
    "景行",
    "安琪",
    "佳成",
  ];

  const provinces = [
    ["110101", "北京市", "朝阳区"],
    ["310101", "上海市", "浦东新区"],
    ["440106", "广东省广州市", "天河区"],
    ["440305", "广东省深圳市", "南山区"],
    ["330106", "浙江省杭州市", "西湖区"],
    ["320106", "江苏省南京市", "鼓楼区"],
    ["510104", "四川省成都市", "锦江区"],
    ["420106", "湖北省武汉市", "武昌区"],
    ["610102", "陕西省西安市", "新城区"],
    ["500103", "重庆市", "渝中区"],
  ];

  const roads = ["人民路", "中山路", "解放路", "建设路", "科技大道", "长江路", "复兴路", "创新街"];
  const companyPrefixes = ["华信", "云启", "中科", "星河", "远景", "鼎盛", "明德", "瑞丰"];
  const companySuffixes = ["科技有限公司", "信息技术有限公司", "数据服务有限公司", "智能科技有限公司", "网络科技有限公司"];
  const emailDomains = ["example.cn", "163.com", "qq.com", "aliyun.com", "foxmail.com"];
  const mobilePrefixes = [
    "130",
    "131",
    "132",
    "133",
    "135",
    "136",
    "137",
    "138",
    "139",
    "150",
    "151",
    "152",
    "155",
    "156",
    "157",
    "158",
    "159",
    "166",
    "173",
    "176",
    "177",
    "178",
    "180",
    "181",
    "182",
    "185",
    "186",
    "187",
    "188",
    "191",
    "195",
    "198",
    "199",
  ];

  // 生成指定闭区间内的随机整数。
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // 从数组中随机取出一个元素。
  function pick(list) {
    return list[randomInt(0, list.length - 1)];
  }

  // 将数字或字符串左侧补零到指定长度。
  function pad(value, length = 2) {
    return String(value).padStart(length, "0");
  }

  // 生成指定长度的随机数字字符串。
  function randomDigits(length) {
    let result = "";
    for (let index = 0; index < length; index += 1) {
      result += randomInt(0, 9);
    }
    return result;
  }

  // 将 Date 对象格式化为 YYYY-MM-DD 字符串。
  function dateToIso(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  // 生成指定年份范围内的随机日期。
  function randomDate(startYear = 1980, endYear = 2004) {
    const start = new Date(startYear, 0, 1).getTime();
    const end = new Date(endYear, 11, 28).getTime();
    return new Date(randomInt(start, end));
  }

  // 生成中文姓名。
  function name() {
    return `${pick(surnames)}${pick(givenNames)}`;
  }

  // 生成中国大陆手机号。
  function mobile() {
    return `${pick(mobilePrefixes)}${randomDigits(8)}`;
  }

  // 生成带校验位的中国大陆身份证号。
  function idCard() {
    const [areaCode] = pick(provinces);
    const birth = dateToIso(randomDate(1975, 2005)).replaceAll("-", "");
    const sequence = pad(randomInt(1, 999), 3);
    const body = `${areaCode}${birth}${sequence}`;
    const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    const checkCodes = "10X98765432";
    const sum = body.split("").reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    return `${body}${checkCodes[sum % 11]}`;
  }

  // 生成测试邮箱地址。
  function email() {
    return `user${randomInt(10000, 99999)}@${pick(emailDomains)}`;
  }

  // 生成中文详细地址。
  function address() {
    const [, city, district] = pick(provinces);
    return `${city}${district}${pick(roads)}${randomInt(1, 388)}号${randomInt(1, 18)}幢${randomInt(101, 2602)}室`;
  }

  // 生成中文公司名称。
  function company() {
    const [, city] = pick(provinces);
    return `${city.replace("省", "").replace("市", "")}${pick(companyPrefixes)}${pick(companySuffixes)}`;
  }

  // 生成通用日期字符串。
  function date() {
    return dateToIso(randomDate(2021, 2027));
  }

  // 生成出生日期字符串。
  function birthDate() {
    return dateToIso(randomDate(1975, 2005));
  }

  // 生成 datetime-local 控件可用的日期时间字符串。
  function datetime() {
    return `${date()}T${pad(randomInt(8, 19))}:${pick(["00", "15", "30", "45"])}`;
  }

  // 生成年月字符串。
  function month() {
    const random = randomDate(2021, 2027);
    return `${random.getFullYear()}-${pad(random.getMonth() + 1)}`;
  }

  // 生成性别文本。
  function gender() {
    return pick(["男", "女"]);
  }

  // 生成金额数值字符串。
  function amount() {
    return String(randomInt(3000, 50000));
  }

  // 生成普通整数数值字符串。
  function number() {
    return String(randomInt(1, 999));
  }

  // 生成年龄数值字符串。
  function age() {
    return String(randomInt(18, 65));
  }

  // 生成银行卡号样式的数字字符串。
  function bankCard() {
    return `${pick(["622202", "622848", "621700", "622700", "621661"])}${randomDigits(13)}`;
  }

  // 生成邮政编码。
  function postcode() {
    return String(randomInt(100000, 859999));
  }

  // 生成测试网址。
  function url() {
    return `https://www.example.cn/${randomInt(1000, 9999)}`;
  }

  // 生成一段中文备注文本。
  function sentence() {
    return pick([
      "这是一条用于表单测试的中文备注。",
      "自动生成的演示数据，可按需修改。",
      "用于验证新增、修改和必填校验流程。",
      "当前记录由 CN Form Faker 生成。",
    ]);
  }

  // 生成通用中文测试文本。
  function text() {
    return `中文测试数据${randomInt(100, 999)}`;
  }

  const generators = {
    name,
    mobile,
    phone: mobile,
    idCard,
    email,
    address,
    company,
    date,
    birthDate,
    datetime,
    month,
    gender,
    amount,
    money: amount,
    number,
    age,
    bankCard,
    postcode,
    zip: postcode,
    url,
    sentence,
    remark: sentence,
    text,
    // 生成测试用户名。
    username: () => `test_user_${randomInt(1000, 9999)}`,
    // 生成满足常见复杂度要求的测试密码。
    password: () => `Aa${randomDigits(6)}!`,
  };

  // 根据字段类型查找对应生成器，未知类型默认生成通用文本。
  function generate(type) {
    const generator = generators[type] || generators.text;
    return generator();
  }

  global.__CN_FAKE_DATA__ = {
    generate,
    types: Object.keys(generators),
  };
})(window);
