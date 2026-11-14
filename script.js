/* 页面适配层：主测算与情景分析共用 model.js，不在此重复定价公式。 */
(() => {
  'use strict';
  const M = window.AutoShieldModel;
  const $ = id => document.getElementById(id);
  Object.entries(M.RULES.inputLimits).forEach(([id, limit]) => {
    const node = $(id);
    if (node) {
      node.min = limit.min;
      // 接管>10秒可输入，再按计划书清洗；其他字段遵循演示输入边界。
      if (!limit.truncateAbove) node.max = limit.max;
      if (limit.integer) node.step = '1';
    }
  });
  const money = value => '¥' + value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = value => (value > 0 ? '+' : value < 0 ? '−' : '') + money(Math.abs(value));
  const number = (value, digits = 2) => value == null ? '不生成' : value.toFixed(digits);
  const baseFields = ['base', 'vehicle', 'annualMileage', 'assistPercent', 'auth', 'dataQuality'];
  const behaviorFields = ['tMed', 'handsOffPercent', 'harshMonthly', 'qualityFactor', 'takeoverCount', 'assistSeconds', 'missingPercent'];
  const labels = { low: '规范使用智驾，低行为风险', ordinary: '普通驾驶，中性风险', high: '接管不及时，高行为风险', unauthorized: '未授权数据，恢复基准' };
  const scenarioFields = { scenarioAuth: 'auth', scenarioQuality: 'dataQuality', scenarioAssist: 'assistPercent', scenarioTMed: 'tMed', scenarioHands: 'handsOffPercent', scenarioHarsh: 'harshMonthly', scenarioL3: 'qualityFactor' };
  let currentInput, currentResult, selectedScene = 'ordinary', snapshot, snapshotResult;
  function text(id, value) { $(id).textContent = value; }
  function readMain() {
    const input = Object.fromEntries(baseFields.map(id => [id, $(id).value]));
    if (input.auth === 'authorized' && input.dataQuality !== 'insufficient') {
      behaviorFields.forEach(id => input[id] = $(id).value);
      input.fieldsValid = $('fieldsValid').checked;
    }
    return input;
  }
  function setValues(input) {
    [...baseFields, ...behaviorFields].forEach(id => { if (input[id] !== undefined) $(id).value = input[id]; });
    $('fieldsValid').checked = input.fieldsValid === true;
  }
  function showErrors(target, errors) {
    const messages = Object.values(errors || {});
    target.textContent = messages.join('；'); target.hidden = !messages.length;
  }
  function sceneSelection() {
    document.querySelectorAll('[data-scene]').forEach(button => {
      const selected = button.dataset.scene === selectedScene;
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
    });
    text('resultContext', (labels[selectedScene] || '自定义参数') + ' · 虚构样例');
  }
  function renderRisk(result) {
    ['R1', 'R2', 'R3'].forEach(key => {
      const value = result.valid && result.eligible ? result.metrics[key] : null;
      text('risk' + key + 'Value', value == null ? '不生成' : number(value));
      $('risk' + key + 'Bar').style.width = (value == null ? 0 : value) + '%';
    });
    text('riskSummary', !result.valid ? '输入无效，暂停评分' : result.eligible
      ? 'R = ' + number(result.risk) + ' → s = ' + number(result.score) + ' → L2 = ' + number(result.k, 4)
      : '不生成个人行为评分 · L2 = 1.00 · L3 = 1.00');
  }
  function render(result) {
    showErrors($('inputErrors'), result.errors);
    [...baseFields, ...behaviorFields].forEach(id => $(id).setAttribute('aria-invalid', String(Boolean(result.errors && result.errors[id]))));
    const blocked = currentInput.auth !== 'authorized' || currentInput.dataQuality === 'insufficient';
    $('behaviorFields').disabled = blocked;
    $('dataQuality').disabled = currentInput.auth !== 'authorized';
    $('qualityFactor').disabled = blocked || currentInput.dataQuality !== 'complete';
    sceneSelection(); renderRisk(result);
    if (!result.valid) {
      text('ubiPrice', '请检查输入');
      ['scoreValue', 'kValue', 'l3Value', 'traditionalPrice', 'ubiCompare', 'delta', 'bridgeBase', 'bridgeRaw', 'bridgeFinal'].forEach(id => text(id, '—'));
      text('dataStatus', '输入无效，暂停计算。请修正提示的字段；不会将旧结果显示为当前结果。');
      text('deltaText', '较同条件基准：待有效输入');
      text('behaviorDelta', '行为变化：待有效输入'); text('qualityDelta', '数据质量变化：待有效输入');
      $('traditionalBar').style.width = '0%'; $('ubiBar').style.width = '0%';
      $('scoreDetails').replaceChildren(); updateEconomics(); return;
    }
    text('ubiPrice', money(result.premium)); text('traditionalPrice', money(result.base)); text('ubiCompare', money(result.premium));
    text('scoreValue', result.score == null ? '不生成' : number(result.score, 2));
    text('kValue', number(result.k, 4)); text('l3Value', number(result.l3, 4));
    const reasons = [...(result.reasons || []), ...(result.cleaning || [])].join('；');
    text('dataStatus', result.eligible
      ? '已按演示规则评分。' + (result.l3 < 1 ? 'L3优惠为待验证的演示假设。' : 'L3取1.00。') + reasons
      : '不生成个人评分 · ' + reasons + '。L2=L3=1，模拟保费回到L1基准。');
    $('dataStatus').classList.toggle('neutral', !result.eligible);
    const max = Math.max(result.base, result.premium) * 1.05;
    $('traditionalBar').style.width = result.base / max * 100 + '%'; $('ubiBar').style.width = result.premium / max * 100 + '%';
    text('delta', signed(result.delta)); $('delta').classList.toggle('increase', result.delta > 0);
    text('deltaText', '较同条件基准 ' + (result.delta / result.base * 100).toFixed(2) + '%');
    text('bridgeBase', money(result.base)); text('bridgeRaw', money(result.bridge.rawPremium)); text('bridgeFinal', money(result.premium));
    text('behaviorDelta', result.eligible ? '行为调整阶段变化：' + signed(result.bridge.behaviorDelta) : '不生成评分，L2=1.00');
    text('qualityDelta', '数据质量阶段变化：' + signed(result.bridge.qualityDelta));
    renderScoreDetails(result); updateEconomics();
  }
  function renderScoreDetails(result) {
    const metric = result.metrics;
    const entries = result.eligible ? [
      ['R1 = (' + Math.min(Number(currentInput.tMed), 10) + '−1)÷9×100', number(metric.R1)],
      ['R2 = min((' + currentInput.handsOffPercent + '÷100)÷0.30×100,100)', number(metric.R2)],
      ['R3 = min(' + currentInput.harshMonthly + '÷8×100,100)', number(metric.R3)],
      ['R = 0.40×R1 + 0.35×R2 + 0.25×R3', number(result.risk)],
      ['s = 截断(100−R, 0, 100)', number(result.score)],
      ['L2 = 截断(1.10−0.002×s, 0.90, 1.10)', number(result.k, 4)],
      ['L3：按数据状态，完整时选演示值', number(result.l3, 4)],
      ['P = ' + result.base + ' × ' + number(result.k, 4) + ' × ' + number(result.l3, 4), money(result.premium)]
    ] : [['个人行为评分与R1/R2/R3', '不生成'], ['L2 / L3', '1.00 / 1.00'], ['P = L1 × 1 × 1', money(result.base)]];
    $('scoreDetails').replaceChildren();
    entries.forEach(([label, value]) => {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = label; dd.textContent = value; $('scoreDetails').append(dt, dd);
    });
  }
  function updateMain() {
    currentInput = readMain(); currentResult = M.calculate(currentInput); render(currentResult);
    document.dispatchEvent(new CustomEvent('autoshield:updated'));
  }
  function loadScene(name) {
    if (!M.SCENARIOS[name]) return;
    setValues(M.SCENARIOS[name]); selectedScene = name; updateMain(); copyScenario();
  }
  function copyScenario() {
    if (!currentResult.valid) { showErrors($('scenarioErrors'), { copy: '请先修正主测算参数，再复制当前场景。' }); return; }
    snapshot = { ...M.DEFAULTS, ...currentInput }; snapshotResult = M.calculate(snapshot);
    Object.entries(scenarioFields).forEach(([id, key]) => $(id).value = snapshot[key]);
    text('scenarioSnapshot', snapshot.auth !== 'authorized'
      ? '独立快照：未授权或已撤回，不生成个人行为参数。切换有效授权后使用普通场景的虚构输入；主测算不变。'
      : '独立快照：L1=' + money(snapshotResult.base) + '，核验事件数=' + snapshot.takeoverCount + '，时长分母=' + snapshot.assistSeconds + '秒，关键字段缺失率=' + snapshot.missingPercent + '%。统计支持条件沿用快照；需要改变时请在主测算调整后重新复制。');
    updateScenario();
  }
  function updateScenario() {
    if (!snapshot) return;
    const input = { ...snapshot };
    Object.entries(scenarioFields).forEach(([id, key]) => input[key] = $(id).value);
    const blocked = input.auth !== 'authorized' || input.dataQuality === 'insufficient';
    ['scenarioTMed', 'scenarioHands', 'scenarioHarsh'].forEach(id => $(id).disabled = blocked);
    $('scenarioQuality').disabled = input.auth !== 'authorized';
    $('scenarioL3').disabled = blocked || input.dataQuality !== 'complete';
    const result = M.calculate(input); showErrors($('scenarioErrors'), result.errors);
    text('scenarioStatus', result.valid ? (result.eligible ? '按同一三层模型计算。' + [...result.reasons, ...(result.cleaning || [])].join('；') : '不生成个人评分：' + result.reasons.join('；')) : '请修正无效输入。');
    text('scenarioCurrent', money(snapshotResult.premium)); text('scenarioPrice', result.valid ? money(result.premium) : '请检查输入');
    text('scenarioMetrics', result.valid ? number(result.score) + ' / ' + number(result.k, 4) + ' / ' + number(result.l3, 4) : '—');
    text('scenarioDelta', result.valid ? signed(result.premium - snapshotResult.premium) : '—');
  }
  function updateEconomics() {
    const lossRaw = $('expectedLoss').value, expenseRaw = $('expensePercent').value;
    const loss = Number(lossRaw), expense = Number(expenseRaw);
    const valid = lossRaw.trim() !== '' && expenseRaw.trim() !== '' && Number.isFinite(loss) && Number.isFinite(expense) && loss >= 0 && loss <= 1000000 && expense >= 0 && expense <= 100;
    $('economicsError').hidden = valid;
    text('economicsError', valid ? '' : '预期赔款须为0–1,000,000元，费用率须为0–100%；仅为独立经营假设。');
    const priceValid = currentResult && currentResult.valid;
    text('baselineLR', valid && priceValid ? (loss / currentResult.base * 100).toFixed(2) + '%' : '—');
    text('currentLR', valid && priceValid ? (loss / currentResult.premium * 100).toFixed(2) + '%' : '—');
    text('currentCR', valid && priceValid ? (loss / currentResult.premium * 100 + expense).toFixed(2) + '%' : '—');
  }
  function reset() { $('expectedLoss').value = '2250'; $('expensePercent').value = '25'; loadScene('ordinary'); }
  $('parameterForm').addEventListener('submit', event => event.preventDefault());
  $('parameterForm').addEventListener('input', () => { selectedScene = null; updateMain(); });
  $('scenarioForm').addEventListener('submit', event => event.preventDefault());
  $('scenarioForm').addEventListener('input', updateScenario);
  $('copyScenario').addEventListener('click', copyScenario); $('resetParameters').addEventListener('click', reset);
  ['expectedLoss', 'expensePercent'].forEach(id => $(id).addEventListener('input', updateEconomics));
  document.querySelectorAll('[data-scene]').forEach(button => button.addEventListener('click', () => loadScene(button.dataset.scene)));
  window.AutoShieldApp = Object.freeze({ reset, loadScene, copyScenario, getState: () => ({ input: { ...currentInput }, result: currentResult, selectedScene }) });
  reset();
})();
