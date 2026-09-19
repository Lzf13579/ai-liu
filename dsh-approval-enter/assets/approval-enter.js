/* ============================================================================
 * dsh-approval-enter — 审批弹窗「允许一次」支持回车确认
 * ============================================================================
 * 背景：DSH 的审批弹窗（ApprovalPanel）两个按钮只有 onClick，「允许一次」
 * 没有任何键盘通路。这个脚本给页面加一个文档级捕获阶段的 keydown 监听：
 * 弹窗在场时按回车 = 点「允许一次」。
 *
 * 为什么走 DOM 而不是改 DSH 源码：
 *   - 原来的做法要改 bundle\node_modules\@deepseek-ai\dsh-client-ui-approval\
 *     lib\client.js（往 ApprovalFlow 里插一段 hook）。DSH 一升级，node_modules
 *     被覆盖，补丁就没了，还得重新打。
 *   - 这里完全靠 DOM + 原生 click：不改 DSH 任何文件，升级不受影响。
 *
 * 目标定位（两段，先稳后宽）：
 *   ① 首选 data-approval-key —— 审批面板根节点上的稳定属性，与 CSS 哈希无关：
 *        <div class="mna1RW_root" data-approval-key="approval:7">
 *          …<div class="mna1RW_actionRow">
 *              <Button class="mna1RW_reject">拒绝</Button>   ← 第一个 = 拒绝
 *              <Button variant="primary">允许一次</Button>    ← 最后一个 = 允许一次
 *   ② 兜底：按可见文案匹配「允许一次 / Allow once」——万一将来属性被改名，
 *      只要文案还在就仍然可用。
 *
 * 安全设计（与旧补丁保持一致，并多加一条）：
 *   - 捕获阶段 + preventDefault + stopPropagation：抢在输入框回车之前，不会误发草稿
 *   - 排除 isComposing / keyCode 229：中文输入法组字中不触发
 *   - 排除 event.repeat：长按不回连发
 *   - 排除 Ctrl / Meta / Alt：保留组合键
 *   - **排除 Shift**（旧补丁没有这条）：Shift+Enter 通常是「换行」，不该被当成确认
 *   - 只认「允许一次」；**永远不会把回车变成「拒绝」** —— 找不到按钮就什么都不做
 *   - 按钮 disabled 时不点（已经答过了）
 *   - 元素不可见（getClientRects().length === 0）时不点
 * ========================================================================== */
(function () {
  'use strict'

  var FLAG = '__dshApprovalEnter'
  if (window[FLAG] && window[FLAG].installed) return

  var REJECT_LABELS = /^(拒绝|reject|deny|no)$/i
  var ALLOW_LABELS = /^(允许一次|allow\s*once|allow|yes|ok)$/i

  var api = {
    installed: true,
    version: '0.1.0',
    triggers: 0,   // 触发次数，便于自检
    find: findAllowOnce,
    shadowRoots: function () { return shadowRoots.length },   // 诊断用：当前扫到的 shadow root 数
  }
  window[FLAG] = api

  function visible(el) {
    return !!(el && el.getClientRects && el.getClientRects().length > 0)
  }

  // 已核实（对 dsh-web-frontend 出货代码的实测）：UI 基元的 Button 渲染成原生
  //   <button type="button" class="..." ...spread>
  // disabled / onClick 经由剩余属性展开落到该 button 上，所以 el.disabled 是可靠的。
  // aria-disabled 在当前版本不出现，留着是为了将来万一改成 role="button"。
  function isDisabled(el) {
    return el.disabled === true || el.getAttribute('aria-disabled') === 'true'
  }

  function labelOf(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim()
  }

  /* ---- shadow DOM 兜底 ----------------------------------------------------
   * 已核实：当前出货前端里 attachShadow 出现 0 次（vendor 里那几处 shadowRoot
   * 是 React 自己的重定向代码，不是应用建的），审批面板走的是应用自己的轻 DOM。
   * 但万一将来把面板挪进 shadow root，document.querySelectorAll 就查不到，
   * 插件会**静默失效**（按回车毫无反应，还不报错）—— 所以这里补一条通路：
   *   · 维护一份 shadow root 列表，只有「脏了」才重扫
   *   · MutationObserver 只负责把标记置脏（O(1)，不随 DOM 体积增长）
   *   · 真正重扫只发生在回车且快速路径落空时 —— 即每个回车最多扫一次
   * 常见情况下 shadowRoots 为空，额外开销约等于零。
   * ---------------------------------------------------------------------- */
  var shadowRoots = []
  var shadowDirty = true
  var shadowObserver = null

  function collectShadowRoots() {
    shadowRoots = []
    var walk = function (root) {
      var all
      try { all = root.querySelectorAll('*') } catch (e) { return }
      for (var i = 0; i < all.length; i++) {
        var sr = all[i].shadowRoot
        if (sr) { shadowRoots.push(sr); walk(sr) }
      }
    }
    walk(document)
    shadowDirty = false
  }

  function ensureShadowRoots() {
    // MutationObserver 的回调是**微任务**：同一轮任务里刚插进来的 shadow host
    // 还没触发回调，脏标记不会置上。所以这里用 takeRecords() 主动把待处理记录
    // 取出来 —— 「刚挂上弹窗立刻按回车」也能命中；没有任何变动时它是 O(1)。
    var pending = false
    if (shadowObserver) {
      try { pending = shadowObserver.takeRecords().length > 0 } catch (e) {}
    }
    if (shadowDirty || pending) collectShadowRoots()
  }

  function deepQuery(selector) {
    ensureShadowRoots()
    var out = []
    var push = function (root) {
      try {
        var list = root.querySelectorAll(selector)
        for (var i = 0; i < list.length; i++) out.push(list[i])
      } catch (e) {}
    }
    push(document)
    for (var r = 0; r < shadowRoots.length; r++) push(shadowRoots[r])
    return out
  }

  function watchShadowRoots() {
    try {
      var Obs = window.MutationObserver
      if (!Obs) return
      shadowObserver = new Obs(function (records) {
        for (var i = 0; i < records.length; i++) {
          var added = records[i].addedNodes
          if (added && added.length) { shadowDirty = true; return }
        }
      })
      shadowObserver.observe(document.documentElement || document, { childList: true, subtree: true })
    } catch (e) {}
  }

  function pickFrom(root) {
    var btns = root.querySelectorAll('button, [role="button"]')
    // 允许一次是主操作，渲染在动作行最后 → 从后往前找第一个可点且不是「拒绝」的
    for (var i = btns.length - 1; i >= 0; i--) {
      var b = btns[i]
      if (isDisabled(b)) continue
      if (!visible(b)) continue
      if (REJECT_LABELS.test(labelOf(b))) continue
      return b
    }
    return null
  }

  function findAllowOnce() {
    // ① 稳定属性锚点（可能有多个弹窗，取最后一个 = 最新的那个）
    var roots = deepQuery('[data-approval-key]')
    for (var i = roots.length - 1; i >= 0; i--) {
      var hit = pickFrom(roots[i])
      if (hit) return hit
    }
    // ② 文案兜底
    var all = deepQuery('button, [role="button"]')
    for (var j = all.length - 1; j >= 0; j--) {
      var b = all[j]
      if (isDisabled(b) || !visible(b)) continue
      var t = labelOf(b)
      if (REJECT_LABELS.test(t)) continue
      if (ALLOW_LABELS.test(t)) return b
    }
    return null
  }

  function onKeyDown(event) {
    try {
      if (event.key !== 'Enter' && event.code !== 'Enter') return
      if (event.repeat) return
      if (event.isComposing || event.keyCode === 229) return
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return

      var btn = findAllowOnce()
      if (!btn) return   // 没有审批弹窗 → 完全放行，绝不干扰输入框

      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      api.triggers += 1
      btn.click()
    } catch (err) {
      // 任何意外都不该打断页面：吞掉，只在控制台留一条
      try { console.warn('[dsh-approval-enter] 回车处理失败', err) } catch (e) {}
    }
  }

  function install() {
    document.addEventListener('keydown', onKeyDown, true)
    watchShadowRoots()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true })
  } else {
    install()
  }
})()
