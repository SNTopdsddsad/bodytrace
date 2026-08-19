# App Store Connect 填写稿

主语言：**简体中文**。版本 **1.0**（Build 用 Xcode `CURRENT_PROJECT_VERSION`，当前为 2）。

---

## 1. 创建 App

**我的 App → + → 新建 App**

| 字段 | 填 |
|------|-----|
| 平台 | iOS |
| 名称 | BodyTrack |
| 主要语言 | 简体中文 |
| Bundle ID | `yinke.bodycheck`（需已在开发者账号注册，并带上 Widget `yinke.bodycheck.widget`） |
| SKU | `bodytrack` |
| 用户访问权限 | 完全访问权限 |

名称最多 30 个字符。上架后改名要重新审。

---

## 2. App 信息

| 字段 | 填 |
|------|-----|
| 副标题 | 记体重，看今日热量差 |
| 类别（主要） | 健康与健身（Health & Fitness） |
| 类别（次要） | 生活（Lifestyle），可选 |
| 内容版权 | 2026 丹青 |
| 年龄分级 | 按 §6 问卷，预期 **4+** |

中国大陆可用性：产品先中文。可先上中国大陆；要不要同步上其他区，按你自己定（开发文档 §12 仍为待定）。只本地化了简体中文时，其他区用户也会看到中文。

---

## 3. 价格与销售范围

| 字段 | 填 |
|------|-----|
| 价格 | 免费 |
| 优惠代码 / 内购 | 无。不要创建 IAP |
| 销售范围 | 至少中国大陆；其他区自定 |

---

## 4. App 隐私（营养标签）

路径：**App 信息 → App 隐私 → 开始**

### 4.1 总问

**你或你的第三方合作伙伴是否会从此 App 中收集数据？**

选 **是**。

依据：用户打开 iCloud 时，个人资料、体重 / 饮食（含可选照片）/ 从健康导入的锻炼会进入用户的 CloudKit 私人数据库，属于离开本机、需披露的收集。无第三方统计或广告 SDK。

**是否用于追踪用户？**

全部数据类型都选 **否**。不要加 App Tracking Transparency。

### 4.2 勾选的数据类型

只勾下面五类，其他全部不勾。

| 大类 | 类型 | 勾选 |
|------|------|------|
| 联系信息 | 姓名 | 是（应用内用户名，可选） |
| 健康与健身 | 健康 | 是（体重、备注、健康样本对账标识） |
| 健康与健身 | 健身 | 是（从健康导入的锻炼） |
| 用户内容 | 照片或视频 | 是（可选饮食照片） |
| 用户内容 | 其他用户内容 | 是（饮食名称、千卡、文字备注、年龄、性别、身高、目标体重） |

不要勾：邮箱、电话、标识符、位置、财务、浏览记录、使用数据、诊断、敏感信息、购买项目。活动能量与静息能量只当场展示、不入库，不必再单独加类型；健身已因锻炼记录而勾选。性别在此按「其他用户内容」披露，不要勾「敏感信息」。

### 4.3 每个类型的细项

五个类型填法相同：

| 问 | 答 |
|----|----|
| 用途 | **仅**「App 功能」 |
| 是否关联到用户身份 | **是**（随用户 Apple ID 的 iCloud 私人库 / 本机记录保存） |
| 是否用于追踪 | **否** |

不要勾：分析、产品个性化、营销、广告、第三方广告。

照片是可选功能：用户可以不拍、不选图就记饮食。营养标签仍要披露，因为一旦使用就会随 iCloud 同步。

### 4.4 发布营养标签

填完点发布 / 保存。产品页预览应只有：

- **与你关联的数据**：联系信息（姓名）、健康与健身、用户内容
- 无「用于追踪你的数据」

---

## 5. 隐私政策 URL / 技术支持 URL

页面上线前不要提交审核。托管步骤见 [README.md](README.md)。

托管完成后（以 GitHub Pages 为例）：

| 字段 | URL |
|------|-----|
| 隐私政策 URL | `https://app.aigcwe.com/privacy/privacy-policy.html` |
| 技术支持 URL | `https://app.aigcwe.com/privacy/support.html` |
| 营销 URL | 留空 |

用无痕窗口打开，确认是完整中文政策，不是 GitHub 登录页或 404。

---

## 6. 年龄分级问卷

全部选 **无** / **否**，预期结果 **4+**。

| 项目 | 选择 |
|------|------|
| 不受限制的网页访问 | 否 |
| 赌博、彩票、竞赛 | 无 |
| 卡通或幻想暴力 | 无 |
| 写实暴力 | 无 |
| 色情或裸露 | 无 |
| 脏话或低俗幽默 | 无 |
| 恐怖或恐惧题材 | 无 |
| 酒精、烟草、毒品 | 无 |
| 模拟赌博 | 无 |
| **医疗或治疗信息** | **无**（本应用是个人记录，不给诊断或治疗方案。若选「有」常会升到 12+） |

不要在简介里写能治病、能减肥、能替代医嘱。

---

## 7. 版本 1.0 产品页

### 宣传文本（最多 170 字，可随时改、不审）

```
今日体重、饮食热量和净热量差放在同一屏。授权后可与 Apple 健康同步体重，并从健康读取锻炼与能量。桌面小组件一键打开记体重。无广告、无订阅。
```

### 描述（复制到「描述」）

```
BodyTrack 用来在 iPhone 上记下体重和饮食热量，并把当天的摄入、活动能量、静息能量放在一起看。

今日概览
• 最新体重，以及和上一条的差值
• 净热量 = 当日饮食摄入 − 活动能量 − 静息能量
• 点趋势图某一天，查看当天的体重、饮食、运动和热量

体重
• 同一天可以记多条，日期记到天
• 界面可切换公斤或磅，存储始终是公斤
• 授权「健康」后，手动记录会写入 Apple 健康；健康里新增的体重也会同步进来

饮食
• 名称 + 千卡，可选备注和照片
• 只保存在 BodyTrack（本机，并在你开启 iCloud 时同步到你的私人 iCloud）
• 不会把饮食写入「健康」

运动
• 锻炼来自 Apple 健康，不在本应用里手写、编辑或删除
• 展示在概览热量卡和日详情；热量合计以健康里的活动能量、静息能量为准

小组件
• 小尺寸：最新体重
• 中尺寸：体重 + 今日热量差
• 点按打开应用记体重，不在小组件里输入数字

关于数据
• 没有账号，也不做广告、不做跨 App 追踪
• 未授权健康时，仍可手动记体重和饮食
• 无网络或未登录 iCloud 时，本机可以照常使用

BodyTrack 是个人记录工具，不是医疗器械，不提供诊断或治疗建议。

需要 iPhone，iOS 18 或更高版本。
```

### 关键词（总共最多 100 个字符，用英文逗号分隔，不要空格，不要写应用名）

```
体重,减肥,热量,饮食记录,卡路里,健康,健身,小组件,净热量,食物日记
```

（36 个字符，未超限。）

### 此版本的新增内容（1.0）

```
首次发布。支持记录体重与饮食、查看净热量、同步 Apple 健康中的体重与锻炼，以及桌面小组件。
```

### 截图

至少上传 **6.7 英寸或 6.9 英寸 iPhone** 一组（竖图）。用真机或对应模拟器实拍，不要用 Android 图或带刘海的网页 mock。

建议 5 张，按这个顺序：

| # | 拍什么 | 建议配字（做在图上或纯界面均可） |
|---|--------|----------------------------------|
| 1 | 概览：有一条体重、有饮食、能看见净热量和趋势 | 今日体重与热量差 |
| 2 | 体重列表或编辑页 | 记下每一天的体重 |
| 3 | 饮食列表（最好带一张餐食图） | 饮食只记在这里 |
| 4 | 日详情或概览热量卡（含来自健康的锻炼） | 锻炼来自 Apple 健康 |
| 5 | 主屏幕上的中尺寸小组件 | 一眼看到体重和热量差 |

不要在截图里放别人的真实健康数据；用你自己的测试数。不要声称「医生推荐」或疗效。

可选：iPad 截图不必传（产品只做 iPhone；工程 `TARGETED_DEVICE_FAMILY` 含 iPad 时若 ASC 要求再补，用 iPhone 界面在 iPad 上跑即可，不要写 Designed for iPad）。

预览视频：第一版可不传。

---

## 8. App 审核信息

**登录信息**：选「无需登录」或等价选项。没有账号，不要编测试号。

**备注**（建议中英都贴，方便审核员）：

```
BodyTrack is a personal weight and food log for iPhone. There is no account and no in-app purchase.

How to review Health:
1. Open Settings (gear) → tap “允许健康数据” and grant:
   - Read: Body Mass, Workouts, Active Energy, Resting Energy
   - Write: Body Mass only
2. Save a weight on the 体重 tab. It is written to Apple Health when write access is allowed.
3. Food entries stay in the app. We do NOT write dietary energy to Health.
4. Workouts are imported from Apple Health only. There is no exercise tab and no manual exercise editor; imported workouts appear on Today and day detail.
5. Denying Health still allows local weight and food logging.

Delete my data:
Settings (gear) → 数据 → 「清除我的全部数据」. This deletes all BodyTrack records (weight, food, workouts imported into the app, profile) and the widget snapshot. Samples this app wrote to Health are removed when possible. Other Health sources are left intact. After deletion the app does not auto-import from Health until the user taps 「从健康同步」.

Widget:
Add the BodyTrack / 体重 widget on the Home Screen. Tap it to open bodytrack://log-weight and the weight editor. The widget does not accept numeric input.

iCloud:
Records sync with the user’s private CloudKit database when iCloud is available. The app works offline and without an iCloud account.

Contact: xuwudi404@outlook.com
```

**联系信息**：名字填开发者账号持有人；电话填你能接到审核电话的号码；邮箱 `xuwudi404@outlook.com`。

**附件**：一般不用。若审核要演示授权，按备注逐步点即可。

---

## 9. 出口合规（每次上传包都会问）

本应用只用系统 HTTPS / iCloud / HealthKit，属于豁免加密。

- 问是否使用非豁免加密：**否**
- 工程已加 `ITSAppUsesNonExemptEncryption = NO`，上传时通常不再反复询问

不要选「使用了自研或非标准加密」。

---

## 10. 广告标识符

问 App 是否使用 IDFA：**否**。

---

## 11. 内容版权

选你拥有或已获授权使用该 App 中的内容。图标和界面为你制作。

---

## 12. 构建版本上传前核对

在 Xcode Archive **之前**：

1. CloudKit 控制台已把 Development schema **Deploy 到 Production**（`CD_WeightEntry`、`CD_FoodEntry` 含 `CD_photoData`、`CD_ExerciseEntry`）。没有就停。
2. 真机打开过主 App，小组件能加上。
3. Debug / Release 都连 CloudKit `Production`（`bodycheck.entitlements` 与 `bodycheck.Release.entitlements`，`aps-environment` = `production`）。打包后可在 Organizer 里看签名 entitlements，确认 `icloud-container-environment` 是 `Production`。
4. 隐私政策 URL、支持 URL 已用无痕窗口打开确认。
5. 目的地选 **Any iOS Device (arm64)**，Scheme 用 `bodycheck`，Product → Archive → Distribute App → App Store Connect。

Widget 扩展会随主 App 一起签进去，不要单独传 Widget。
