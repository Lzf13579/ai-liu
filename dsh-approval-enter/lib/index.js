import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Package root: lib/index.js -> package root. Keeps the bundle relocatable when
// installed as a normal DSH npm plugin (node_modules) or as a local link.
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const CLIENT_SCRIPT = path.join(PACKAGE_ROOT, 'assets', 'approval-enter.js')
const CLIENT_ROUTE = '/dsh-approval-enter/enter.js'
const SCRIPT_TAG = `<script defer src="${CLIENT_ROUTE}"></script>`

/**
 * dsh-approval-enter —— 让审批弹窗的「允许一次」可以用回车确认。
 *
 * 宿主这半边只做两件事：
 *   ① 用一条 exact 路由把客户端脚本发出去；
 *   ② 用 tapIndex 往 index.html 的 </body> 前插一个 <script defer>。
 *
 * 真正的键盘逻辑全在 assets/approval-enter.js 里，走 DOM，不碰 DSH 自身文件，
 * 所以 DSH 升级不会把这个功能冲掉（对比原来的 bundle 内补丁 3）。
 */
export default {
  name: 'dsh-approval-enter',
  inject: ['webServer'],
  apply(ctx) {
    const disposers = []
    let cached = null

    const loadClientScript = () => {
      if (cached === null) cached = fs.readFileSync(CLIENT_SCRIPT, 'utf8')
      return cached
    }

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: CLIENT_ROUTE,
      handler: (req, res) => {
        let body
        try {
          body = loadClientScript()
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('approval-enter client script unavailable: ' + (err && err.message ? err.message : err))
          return
        }
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          // 脚本随插件版本走；不缓存，避免升级后浏览器还拿旧逻辑
          'Cache-Control': 'no-store',
        })
        res.end(body)
      },
    }))

    disposers.push(ctx.webServer.tapIndex((html) => {
      if (typeof html !== 'string') return html
      if (html.indexOf(CLIENT_ROUTE) !== -1) return html
      if (html.indexOf('</body>') !== -1) return html.replace('</body>', SCRIPT_TAG + '</body>')
      return html + SCRIPT_TAG
    }))

    ctx.effect(() => () => {
      for (const d of disposers) {
        try { if (typeof d === 'function') d() } catch (err) {}
      }
    })
  },
}
