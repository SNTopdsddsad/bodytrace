# BodyTrack 上架材料

按当前代码（2026-08-17）写好的 App Store 材料。商店后台把本文和同目录的填写稿**原样粘贴**即可。

产品口径仍以 `docs/BodyTrack_开发文档.md` 为准。本文只覆盖**对外材料**，不代替真机验收和 CloudKit Production 部署。

## 你还要亲手做的 4 件事

| # | 事项 | 说明 |
|---|------|------|
| 1 | **托管隐私政策 / 支持页** | 仓库已有可上网的页面：`docs/privacy-policy.html`、`docs/support.html`。按下面「GitHub Pages」上线后，把 https 地址填进 App Store Connect。没上线就不要提审。 |
| 2 | **截图** | 文案和构图在 `app-store-connect.md` §7。必须用真机或 iPhone 模拟器实拍，仓库里没有成品图。 |
| 3 | **CloudKit Development → Production** | 没部署不要 Archive / TestFlight。步骤见 `AGENTS.md`「发布前必须」。 |
| 4 | **确认对外署名** | 隐私政策和版权默认写开发者 **丹青**、邮箱 **xuwudi404@gmail.com**。若 Apple Developer 账号法定名称不同，改政策页、本目录文案和 App Store Connect 版权三项一起改。 |

真机验收（开发文档 A1–A6、A9 与小组件 A7/A8/A10）仍建议在提审前做完。

## 文件

| 文件 | 用途 |
|------|------|
| [app-store-connect.md](app-store-connect.md) | 商店名称、副标题、简介、关键词、年龄分级、营养标签、审核备注、截图清单、导出合规 |
| [../privacy-policy.html](../privacy-policy.html) | 对外隐私政策（填「隐私政策 URL」） |
| [../support.html](../support.html) | 对外支持页（填「技术支持 URL」） |
| `bodycheck/PrivacyPolicy.md` | 与网页版一致的正文；App 内「设置 → 隐私政策」读取这份 |

## GitHub Pages（推荐，免费 https）

仓库是 `SNTopdsddsad/bodytrace`。把含 `docs/*.html` 的提交推到 GitHub 后：

1. 打开仓库 **Settings → Pages**
2. Build and deployment：**Deploy from a branch**
3. Branch：`main`，文件夹：`/docs`
4. Save，等 1–2 分钟

上线后地址（大小写按 GitHub 用户名实际显示）：

- 隐私政策：`https://sntopdsddsad.github.io/bodytrace/privacy-policy.html`
- 支持页：`https://sntopdsddsad.github.io/bodytrace/support.html`

用浏览器无痕窗口打开，确认**不用登录 GitHub**就能看到全文。然后把这两个 URL 填进 App Store Connect。

不要用需要登录的语雀 / Notion 文档当隐私政策，审核常判无效。

## 不要在本阶段做的事

- 没问过 Production schema 是否已部署，不要 Archive
- 不要为了上架加内购、统计 SDK、账号系统
- 不要把 `docs/` 加进 App Target
