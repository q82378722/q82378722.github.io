/*
 * AutoShield — 修订版商业计划书 L1 × L2 × L3 比赛演示模型。
 * 依据：第2.7/2.8节的数据与评分规则、第3.2节的行为系数映射。
 * 所有权重、阈值、区间均为演示假设，未经真实理赔数据校准。
 * 纯函数：不访问DOM、不联网、不采集或持久化数据、不修改传入对象。
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  root.AutoShieldModel = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function freezeTree(value) {
    Object.values(value).forEach(child => {
      if (child && typeof child === 'object') freezeTree(child);
    });
    return Object.freeze(value);
  }

  const MODEL_VERSION = 'L1L2L3-1.0.0';
  const RULES = freezeTree({
    disclaimer: '比赛模拟演示，非实际保险报价。权重、阈值、映射及数据质量优惠均为待实证验证的演示假设。',
    weights: { takeover: 0.40, monitoring: 0.35, harsh: 0.25 },
    scoreScales: { takeoverMin: 1, takeoverMax: 10, handsOffPercent: 30, harshMonthly: 8 },
    behavior: { min: 0.90, max: 1.10, intercept: 1.10, slope: 0.002 },
    quality: { min: 0.95, max: 1.00 },
    // 沿用原稿近30次及单字段缺失率>20%的演示口径，不是统计验证结果。
    sufficiency: { takeoverCount: 30, maxMissingPercent: 20 },
    // 其余上限仅防止误输入极端规模，不构成新增风险因子或验证阈值。
    inputLimits: {
      base: { min: 1, max: 100000, decimals: 2 },
      annualMileage: { min: 0, max: 200000 },
      assistPercent: { min: 0, max: 100 },
      tMed: { min: 1, max: 10, truncateAbove: true },
      handsOffPercent: { min: 0, max: 100 },
      harshMonthly: { min: 0, max: 1000000 },
      takeoverCount: { min: 0, max: 1000000, integer: true },
      assistSeconds: { min: 0, max: 31622400 },
      missingPercent: { min: 0, max: 100 },
      qualityFactor: { min: 0.95, max: 1.00 }
    }
  });

  const DEFAULTS = freezeTree({
    base: 3000,
    vehicle: '标准家用轿车（虚构）',
    annualMileage: 12000,
    assistPercent: 60,
    auth: 'authorized',
    dataQuality: 'complete',
    tMed: 5.5,
    handsOffPercent: 15,
    harshMonthly: 4,
    takeoverCount: 30,
    assistSeconds: 10000,
    missingPercent: 0,
    fieldsValid: true,
    qualityFactor: 1.00
  });

  // 这里只保存虚构的原始输入；得分、系数和金额一律由calculate推导。
  // 前三组的智驾占比相同，用来展示行为差异，而非多用智驾固定降价。
  const SCENARIOS = freezeTree({
    low: { ...DEFAULTS, tMed: 1, handsOffPercent: 0, harshMonthly: 0, qualityFactor: 0.95 },
    ordinary: { ...DEFAULTS },
    high: { ...DEFAULTS, tMed: 10, handsOffPercent: 30, harshMonthly: 8 },
    unauthorized: { ...DEFAULTS, auth: 'unauthorized' }
  });

  const FIELD_NAMES = {
    base: 'L1模拟基准保费', annualMileage: '年度预计里程', assistPercent: '智驾使用比例',
    tMed: '接管反应中位数', handsOffPercent: '脱手占比', harshMonthly: '急驾驶行为月频次',
    takeoverCount: '可核验接管样本数', assistSeconds: '智驾运行有效时长',
    missingPercent: '必要字段最大缺失率', qualityFactor: 'L3数据质量演示参数'
  };
  const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
  const money = number => Math.round((number + Number.EPSILON) * 100) / 100;
  const isMissing = value => value == null || (typeof value === 'string' && value.trim() === '');

  function scoreToCoefficient(score) {
    if (typeof score !== 'number' || !Number.isFinite(score)) return null;
    return clamp(RULES.behavior.intercept - RULES.behavior.slope * clamp(score, 0, 100), RULES.behavior.min, RULES.behavior.max);
  }

  function calculate(input) {
    const result = {
      version: MODEL_VERSION, valid: false, eligible: false, status: 'invalid', errors: {}, reasons: [], cleaning: [],
      base: null, premium: null, unroundedPremium: null, delta: null, score: null, risk: null,
      k: 1, l3: 1, effectiveK: null, q: null, dataQuality: null,
      metrics: { R1: null, R2: null, R3: null }, normalized: null,
      bridge: { rawPremium: null, behaviorDelta: 0, qualityDelta: 0 }
    };
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      result.errors.input = '请输入完整的演示参数。';
      return result;
    }

    const missing = [];
    function readNumber(field, allowMissing = false) {
      const raw = input[field], label = FIELD_NAMES[field], limit = RULES.inputLimits[field];
      if (isMissing(raw)) {
        if (allowMissing) missing.push(`${label}缺少有效统计量`);
        else result.errors[field] = `请填写${label}。`;
        return null;
      }
      if (typeof raw !== 'number' && typeof raw !== 'string') {
        result.errors[field] = `${label}必须为有限数值。`;
        return null;
      }
      let value = Number(raw);
      if (!Number.isFinite(value)) {
        result.errors[field] = `${label}必须为有限数值。`;
        return null;
      }
      if (limit.truncateAbove && value > limit.max) {
        result.cleaning.push('接管中位数超过10秒，按计划书清洗规则截断为10秒；不是新增定价阈值。');
        value = limit.max;
      }
      if (value < limit.min || value > limit.max) {
        result.errors[field] = `${label}须在${limit.min}至${limit.max}之间。`;
        return null;
      }
      if (limit.integer && !Number.isInteger(value)) {
        result.errors[field] = `${label}须为整数。`;
        return null;
      }
      if (limit.decimals === 2 && money(value) !== value) {
        result.errors[field] = `${label}以元为单位，最多保留两位小数（精确到分）。`;
        return null;
      }
      return value;
    }

    const base = readNumber('base');
    readNumber('annualMileage'); // 仅为同条件比较背景，不再次乘入L1。
    const assistPercent = readNumber('assistPercent'); // 使用程度描述，不进入R或k公式。
    const auth = input.auth;
    if (!['authorized', 'unauthorized', 'withdrawn'].includes(auth)) result.errors.auth = '请选择有效的数据授权状态。';
    if (Object.keys(result.errors).length) return result;
    result.base = base;
    result.q = assistPercent / 100;

    function neutral(status, reasons) {
      result.valid = true;
      result.eligible = false;
      result.status = status;
      result.reasons = reasons;
      result.score = null;
      result.risk = null;
      result.metrics = { R1: null, R2: null, R3: null };
      result.normalized = null;
      result.k = 1;
      result.l3 = 1;
      result.effectiveK = 1;
      result.premium = money(base);
      result.unroundedPremium = base;
      result.delta = 0;
      result.bridge = { rawPremium: money(base), behaviorDelta: 0, qualityDelta: 0 };
      return result;
    }

    // 未授权、撤回时提前返回，不读取行为、数据完整率或L3演示参数。
    if (auth === 'unauthorized') return neutral('unauthorized', ['未授权，不生成个人行为评分；L2=L3=1，返回L1。']);
    if (auth === 'withdrawn') return neutral('withdrawn', ['已撤回授权，停止后续行为评分；L2=L3=1，返回L1。本演示不追溯修改实际合同。']);

    const dataQuality = input.dataQuality;
    if (!['complete', 'partial', 'insufficient'].includes(dataQuality)) {
      result.errors.dataQuality = '请选择完整、部分缺失或严重不足的数据状态。';
      return result;
    }
    result.dataQuality = dataQuality;
    if (dataQuality === 'insufficient') return neutral('insufficient', ['数据严重不足，不读取行为统计量、不生成个人评分；L2=L3=1。']);
    if (input.fieldsValid !== true) return neutral('insufficient', ['所需记录缺失或不可核验，不能形成可靠评分；L2=L3=1。']);

    const tMed = readNumber('tMed', true);
    const handsOffPercent = readNumber('handsOffPercent', true);
    const harshMonthly = readNumber('harshMonthly', true);
    const takeoverCount = readNumber('takeoverCount', true);
    const assistSeconds = readNumber('assistSeconds', true);
    const missingPercent = readNumber('missingPercent', true);
    if (Object.keys(result.errors).length) return result;

    const reasons = [...missing];
    if (takeoverCount !== null && takeoverCount < RULES.sufficiency.takeoverCount) reasons.push('可核验接管样本不足原近30次演示观察口径');
    if (assistSeconds !== null && assistSeconds === 0) reasons.push('智驾运行有效时长为零，脱手占比分母无效');
    if (missingPercent !== null && missingPercent > RULES.sufficiency.maxMissingPercent) reasons.push('必要单字段缺失率超过原稿20%演示界限');
    if (reasons.length) return neutral('insufficient', reasons.map(reason => reason + '，不生成个人评分。'));

    // 声称完整但存在缺失时安全按可评分的部分缺失处理，不给予质量优惠。
    let effectiveQuality = dataQuality;
    if (dataQuality === 'complete' && missingPercent > 0) {
      effectiveQuality = 'partial';
      result.cleaning.push('数据声明完整但存在必要字段缺失，按“部分缺失且可评分”处理，L3强制取1。');
    }
    result.dataQuality = effectiveQuality;
    let l3 = 1;
    if (effectiveQuality === 'complete') {
      l3 = readNumber('qualityFactor');
      if (Object.keys(result.errors).length) return result;
    }

    // 第2.8节明确公式优先；智驾激活率、车型及年里程不充当第四评分因子。
    const R1 = (tMed - RULES.scoreScales.takeoverMin) / (RULES.scoreScales.takeoverMax - RULES.scoreScales.takeoverMin) * 100;
    const R2 = Math.min(handsOffPercent / RULES.scoreScales.handsOffPercent * 100, 100);
    const R3 = Math.min(harshMonthly / RULES.scoreScales.harshMonthly * 100, 100);
    const risk = clamp(RULES.weights.takeover * R1 + RULES.weights.monitoring * R2 + RULES.weights.harsh * R3, 0, 100);
    const score = clamp(100 - risk, 0, 100);
    const k = scoreToCoefficient(score);
    const unroundedPremium = base * k * l3;
    const premium = money(unroundedPremium);
    const rawPremium = money(base * k);
    Object.assign(result, {
      valid: true, eligible: true, status: 'scored', score, risk, k, l3, effectiveK: k * l3,
      unroundedPremium, premium, delta: money(premium - base),
      reasons: [effectiveQuality === 'partial'
        ? '部分缺失但有效统计量足以按演示规则评分，L2据行为计算，L3=1，不因缺失额外加价。'
        : '完整且可核验的演示数据：L2据行为计算，L3为手动选择的假设参数，无自动完整率映射。'],
      metrics: { R1, R2, R3 }, normalized: { tMed, handsOffPercent, harshMonthly, takeoverCount, assistSeconds, missingPercent },
      bridge: { rawPremium, behaviorDelta: money(rawPremium - base), qualityDelta: money(premium - rawPremium) }
    });
    return result;
  }

  return Object.freeze({ MODEL_VERSION, RULES, DEFAULTS, SCENARIOS, scoreToCoefficient, calculate });
});
