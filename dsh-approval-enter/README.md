# dsh-approval-enter

DSH Web 的审批弹窗键盘增强：**按回车 = 点「允许一次」**。

弹窗长这样：

```
┌────────────────────────────────────────────┐
│ ● 等待审批                                  │
│ 工具 shell 请求越权执行                      │
│                       [ 拒绝 ] [ 允许一次 ] │
└────────────────────────────────────────────┘
```

原来只有鼠标点「允许一次」，键盘没有任何通路。装上这个插件后，弹窗在场时按回车等同于点「允许一次」——手不用离开键盘。

## 特点

| 项 | 说明 |
| --- | --- |
| **不改 DSH 源码** | 纯注入式插件，一行 DSH 文件都不动。 |
| **DSH 升级不失效** | 不是 bundle 内补丁，`node_modules` 被覆盖也不受影响。 |
| **不会误发草稿** | 捕获阶段 + `preventDefault` + `stopPropagation`，抢在输入框回车之前。 |
| **中文输入法安全** | 排除 `isComposing` / `keyCode 229`，组字中途不触发。 |
| **不会把回车变成拒绝** | 只认「允许一次」；找不到按钮就什么都不做。 |
| **shadow DOM 兼容** | 面板即使被移进 shadow root（当前出货前端并不用 shadow DOM）也能命中；用 `MutationObserver` + `takeRecords()` 维护 shadow root 列表，DOM 无变动时开销 O(1)。 |
| **保留组合键** | `Ctrl` / `Meta` / `Alt` / `Shift` + 回车一律放行。 |
| **无副作用** | 不写文件、不改配置、不发网络请求；卸载即彻底干净。 |

## 安装

```powershell
dsh plugin --profile web add link:<解压出来的插件目录绝对路径>
```

装完**重启 DSH Web**（前端 rev 在启动时才分配），然后 `Ctrl+F5` 强刷一次页面。

也可以直接把整个目录拷进 profile 的 `node_modules`，或在自己的 profile `package.json` 里加一条依赖。详见 [`安装说明.md`](安装说明.md)。

## 验证

装好后打开控制台：

```js
window.__dshApprovalEnter.installed   // true
window.__dshApprovalEnter.version     // "0.1.0"
window.__dshApprovalEnter.triggers    // 回车生效过的次数，按一次加一
window.__dshApprovalEnter.shadowRoots() // 扫到的 shadow root 数（当前 DSH 出货前端应为 0）
```

触发一次审批（让 Agent 执行一条需要授权的命令），按回车 —— 弹窗应当立刻变成「允许一次」的结果，`triggers` 变成 1。

## 工作原理

宿主半边（`lib/index.js`）只做两件事：用一条 `exact` 路由发出客户端脚本，再用 `tapIndex` 往 `index.html` 的 `</body>` 前插一个 `<script defer>`。

键盘逻辑全在 `assets/approval-enter.js`，靠两段定位找到按钮：

1. **首选 `[data-approval-key]`** —— 审批面板根节点上的稳定属性（`data-approval-key="approval:7"`），与 CSS 类哈希无关。动作行里最后一个可用按钮就是「允许一次」，第一个是「拒绝」。
2. **兜底按文案匹配** —— `允许一次` / `Allow once`。万一将来属性被改名，只要文案还在就仍然可用。

匹配到之后调 `btn.click()`（原生 click → React 的 `onClick` → 与鼠标点击完全同一条代码路径）。

> 为什么不改 `dsh-client-ui-approval/lib/client.js`？因为那是 bundle 内补丁：DSH 一升级就被覆盖，而且它 hook 的是 React 内部状态。DOM 方案不需要知道 React 的任何内部结构。

## 与旧「补丁 3」的关系

这个插件是 DSH 内部补丁 3 的替代品。**两者不要同时启用** —— 补丁 3 的监听器也会在文档捕获阶段响应回车，两个都在时会重复调用 `answer()`（第二次会因「已经答过」而抛错）。

装了本插件之后，建议把补丁 3 撤掉，把 `dsh-client-ui-approval\lib\client.js` 从 `client.js.bak-enter` 还原。这样 DSH 内部补丁就只剩「补丁 1」（回环认证，无配置出路）。

## 许可

MIT。见 [`LICENSE`](LICENSE)。
