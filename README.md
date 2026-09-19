# ai-liu

自用的 **DSH（DeepSeek Harness）插件**集合。**一个插件一个子目录。**

| 插件 | 版本 | 说明 |
|---|---|---|
| [`dsh-whale-widget`](dsh-whale-widget/) | `0.3.8-rice` | 余额小鲸鱼挂件。已把「偷吃白饭」与「Token 用量」合并进本体，**只需装这一个** |
| [`dsh-approval-enter`](dsh-approval-enter/) | `0.1.0` | 审批弹窗键盘增强：**按回车 = 点「允许一次」**。纯注入式，不改 DSH 任何文件，升级不失效 |

## 安装

```powershell
dsh plugin --profile web add link:<本仓库中该插件子目录的绝对路径>
```

然后**完整重启 DSH 桌面端**，浏览器 `Ctrl+F5`。每个插件子目录里的 `安装说明.md` 有详细步骤与常见问题。

## 说明

- 每个插件子目录里都有自己的 `README.md`、`安装说明.md`，
  鲸鱼挂件另有 `PROVENANCE.md`（素材来源与授权边界）。
- **第三方素材不入库**：各插件的 `.gitignore` 会排除属于第三方游戏素材 / 群友素材的文件。
  因此从本仓库 clone 下来后，相关插件会**退回内置兜底素材** ——
  例如鲸鱼挂件的碗与米粒会用内联 SVG 绘制、吃饭无音效。这是**预期行为，不是缺陷**；
  想补齐见该插件的 `PROVENANCE.md`（可在面板里选用你自己的图片/音频）。
- 许可：以各插件目录内的 `LICENSE` 为准。本仓库内的插件均为 MIT，并**保留原作者署名**。

## 新增一个插件（子集约定）

每个插件目录里都有一份 **`publish.include.txt`** —— 它定义了这个插件"哪些文件可以公开"。
不在这里列出的东西（第三方素材、本地备份、密钥、打包产物）**既不会进仓库，也不会进压缩包**。

```
# publish.include.txt 示例
lib/**
assets/**
package.json
cordis.patch.yml
LICENSE
README.md
安装说明.md
publish.include.txt
```

加新插件时用 `publish-plugin.ps1` 一条命令走完全流程：

```powershell
# 校验（逐文件 SHA256 对比仓库副本 + 多余文件 + 本机路径泄漏扫描）
publish-plugin.ps1 -Source <插件目录> -Mode Check

# 同步子集进仓库 + 打包含 SHA256SUMS.txt 的 zip + 解包回验
publish-plugin.ps1 -Source <插件目录> -Mode All
```

它会自动做三件容易忘的事：**内置排除表**（`.git`、`node_modules`、`*.bak*`、`*.key` 等一律不发）、
**本机路径泄漏扫描**（子集里的文本不允许出现本机绝对路径）、
**打包后端到端回验**（解回来逐文件比 SHA256，含中文文件名）。
