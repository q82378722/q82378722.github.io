/* Presentation controller. All model/scenario work is delegated to AutoShieldApp. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const steps = [
    {id: 'problem', title: '传统定价问题与研究切入点', hint: '同一车辆基准，观察接管、脱手与急驾驶行为的差异'},
    {id: 'calculator', title: '输入车辆与驾驶参数', hint: '四组均为虚构样例；智驾使用比例只描述暴露，不直接决定价格'},
    {id: 'calculator', title: '计算 UBI 模拟保费', hint: '从输入计算评分 s，再按 L1 × L2 × L3 得到模拟保费'},
    {id: 'explain', title: '解释保费差异', hint: 'L1基准、L2行为调节、L3数据质量，逐层解释金额变化'},
    {id: 'innovation', title: '展示项目创新点与落地边界', hint: '透明规则、授权中性、先验证数据，再由持牌险企校准'}
  ];
  let step = 0, active = false, returnY = 0;
  const sections = [...document.querySelectorAll('main > section')];
  function notice(message) { $('systemNotice').textContent = message; $('systemNotice').hidden = !message; }
  function showStep(index, focus = true) {
    notice('');
    step = Math.max(0, Math.min(steps.length - 1, index)); const item = steps[step];
    document.body.dataset.step = String(step);
    if (active) sections.forEach(section => section.hidden = section.id !== item.id);
    $('presentationStepTitle').textContent = item.title; $('presentationStepHint').textContent = item.hint;
    $('presentationProgress').textContent = String(step + 1).padStart(2, '0') + ' / 05';
    $('previousStep').disabled = step === 0; $('nextStep').textContent = step === 4 ? '完成演示 ✓' : '下一步 →';
    $('inputPanel').hidden = active && step === 2; $('resultPanel').hidden = active && step === 1;
    window.scrollTo({top: 0, behavior: 'instant'});
    if (focus && active) { const heading = $(item.id).querySelector('h2'); heading.tabIndex = -1; heading.focus({preventScroll: true}); }
  }
  function start() {
    if (active) return;
    returnY = window.scrollY; active = true; document.body.classList.add('presentation-mode');
    $('presentationBar').hidden = false; showStep(0);
  }
  function exit() {
    active = false; document.body.classList.remove('presentation-mode'); $('presentationBar').hidden = true;
    delete document.body.dataset.step;
    sections.forEach(section => section.hidden = false); $('inputPanel').hidden = false; $('resultPanel').hidden = false;
    notice(''); window.scrollTo({top: returnY, behavior: 'instant'}); $('presentationToggle').focus({preventScroll: true});
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else notice('此浏览器不支持页面全屏，请使用浏览器菜单或 F11 进入全屏。');
    } catch (_) { notice('未能进入全屏，请使用浏览器菜单或 F11；其余演示功能可继续使用。'); }
  }
  document.querySelectorAll('[data-fullscreen]').forEach(button => button.addEventListener('click', fullscreen));
  document.addEventListener('fullscreenchange', () => {
    document.querySelectorAll('[data-fullscreen]').forEach(button => button.textContent = document.fullscreenElement ? '退出全屏' : '全屏展示');
  });
  $('presentationToggle').addEventListener('click', start); $('exitPresentation').addEventListener('click', exit);
  $('nextStep').addEventListener('click', () => step === 4 ? exit() : showStep(step + 1));
  $('previousStep').addEventListener('click', () => showStep(step - 1));
  $('resetPresentation').addEventListener('click', () => { window.AutoShieldApp.reset(); showStep(0); notice('已恢复普通场景：行为得分50，L2=1.00、L3=1.00，基准与模拟保费均为3,000元。'); });
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') { exit(); return; }
    if (event.target.matches('input,select,textarea,button,summary')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); if (step < 4) showStep(step + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); showStep(step - 1); }
  });
  window.AutoShieldPresentation = Object.freeze({start, exit, showStep, getState: () => ({active, step})});
})();
