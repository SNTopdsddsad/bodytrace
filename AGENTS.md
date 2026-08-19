# AGENTS.md

面向编码 agent 的项目说明。产品意图以 `docs/BodyTrack_开发文档.md` 为准；**当前代码状态以本文件与源码为准**。二者冲突时先信源码，再对照文档标注的未完成项，不要把规划当成已实现。

## 身份

| 项 | 值 |
|---|---|
| 产品显示名 | BodyTrack |
| 仓库 / Xcode 工程 / Target | `bodycheck` |
| Bundle ID | `yinke.bodycheck` |
| Team | `5476A243H8` |
| 远程仓库 | `github.com:SNTopdsddsad/bodytrace.git` |
| 最低系统（工程） | iOS 18.0 |
| 语言 | Swift 5（`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`） |
| UI | SwiftUI，中文文案优先 |
| 持久化 | SwiftData，store 名 `BodyTrack`，CloudKit 容器 `iCloud.yinke.bodycheck` |
| 单 Target | `bodycheck`（`PBXFileSystemSynchronizedRootGroup`：往 `bodycheck/` 加文件即进编译） |

不要把仓库、工程、显示名、Bundle 擅自统一改名。

## 当前优先级（2026-08-14 起）

**只做 iPhone。Mac / visionOS 目标与专用代码已删除，不要加回去。**

- 工程 `SUPPORTED_PLATFORMS` 仅为 `iphoneos iphonesimulator`。不要再加 macosx / xros。
- 不要新写 `#if os(macOS)`、Mac 侧栏、检查器、Settings 窗。
- **饮食不写健康。**

## 下一会话从这里开始

用户要把长对话关掉重开。新会话先读本文件，**不要重做已有项**。

建议下一件（上架门槛，按顺序）：

1. **真机验收**：体重读写健康、后台导入、拒权仍能记、无网能用（文档 A1–A6、A9）；小组件已能添加，顺手确认 A7 数据、A8 点按记体重、A10 单位一致  
2. CloudKit Production schema 已部署（2026-08-18）。Archive 走 Release，已用 `bodycheck.Release.entitlements`  
3. 对外页已托管：隐私政策 `https://app.aigcwe.com/privacy/privacy-policy.html`，支持页 `https://app.aigcwe.com/privacy/support.html`。按 `docs/app-store/app-store-connect.md` 填商店后台与营养标签；截图需真机实拍

## 当前进度（2026-08）

已有：

- iPhone 壳：`TabView`；设置是 toolbar sheet
- 体重 CRUD（手动，`source = manual`）；同日多条用 `createdAt` 决胜；iOS 列表有筛选
- 饮食 CRUD：名称 + 千卡 + 可选备注；按本地日历日分组；点进详情；iOS 拍照/相册（先选来源）；`photoData` 可选 JPEG 外置存储
- 今日概览：热量主卡承担今天（摄入 / 健康消耗 / 当前差值 / 完整状态 / 消耗详情入口）。完整时写「按当前记录计算 · 截至 HH:mm」，缺项写未记/未计入。不单独保留「今天：多吃了 / 没有吃多」。没记饮食不算吃了 0，也不出差值。「最近」和「目标」合成体重摘要条，放在热量主卡下方。有体重后再展开趋势图。点趋势图某一天或消耗详情进入日详情
- iPhone 视觉 token：`AppTheme` / `AppFont`（4pt 间距、字号角色、卡片/行组件）；品牌色与小组件共用 `BrandColor`
- 日期/时间强制简体中文（`AppLocale` / `zh-Hans`）
- 设置：个人资料仍可打开同一编辑页（主入口在概览）；体重单位 kg/lb；iCloud 真实账号状态；健康授权入口；用户可「清除我的全部数据」（体重 / 饮食 / 运动 / 个人资料 / 小组件摘要；尝试删本应用写入健康的手动体重；清除后暂停自动从健康导入，直到用户再点同步）；完整隐私政策页（读 `PrivacyPolicy.md`）
- 上架材料草稿：`docs/app-store/`（商店文案、营养标签、审核备注）；对外页已托管在 `https://app.aigcwe.com/privacy/`
- 隐私清单：`bodycheck/PrivacyInfo.xcprivacy`、`BodyTrackWidget/PrivacyInfo.xcprivacy`
- SwiftData CloudKit：`BodyTrackCloud` + `iCloud.yinke.bodycheck`；失败回退本地；旧库可一次性迁移
- iOS 运动：导入 workout → `ExerciseEntry`（按 `healthKitUUID` upsert）；读取今日静息能量、活动能量（不入库）。无运动 Tab：锻炼只读，展示在概览热量卡运动概要和日详情。概览热量卡有锻炼时显示「今天有 N 次锻炼，共 M 分钟」，没有则不展示。日详情当天没有锻炼时只显示「没有运动记录」和「？」。点问号再弹出如何在「健康」补记（搜索 → 健身记录 → 体能训练 → 添加）。不在本应用手写运动，也不跳转到「健身」App
- iOS 体重 ↔ 健康：写回 `bodyMass` 并回填 UUID；导入按 UUID upsert；`HKObserverQuery` + 后台投递（唤醒进程，不弹到前台）；未授权时本地仍可用
- App 图标：深色进度环（`Assets.xcassets/AppIcon`）
- iPhone 小组件：`BodyTrackWidget`（Bundle `yinke.bodycheck.widget`）；小尺寸最新体重，中尺寸体重 + 今日热量差（肥肉图 + 克数 + 净热量）；点按走 Deep Link `bodytrack://log-weight` 打开记体重，不在小组件里输数字。**真机图库已能加上**（2026-08-13，用户确认）
- App Group `group.yinke.bodycheck`：主 App 写摘要，Widget 只读摘要，不跑 SwiftData / CloudKit
- 2026-08-14：删除全部 Mac / visionOS 目标与专用代码

明确不做：

- 饮食写回健康（不申请 `dietaryEnergyConsumed`）
- Mac / visionOS 应用或「Designed for iPhone」上架
- 自由录入运动（运动只来自 Apple 健康）
- entitlements 里加 `com.apple.developer.healthkit.access`（临床病历；个人 Team 签不了）
- **付费点**：无内购、无订阅、无付费墙。用户未改口前不要加 StoreKit / 会员开关 / 恢复购买

### 未完成（按优先级）

上架前 / 用户下一件：

- [x] Widget + App Group + Deep Link（见「当前进度」）
- [ ] 真机验收：体重读写健康、后台导入、拒权仍能记、无网能用（文档 A1–A6、A9）；小组件 A7/A8/A10
- [x] CloudKit **Development → Production** schema 部署（2026-08-18，Production 已有 `CD_WeightEntry` / `CD_FoodEntry` / `CD_ExerciseEntry` / `CD_UserProfile`）
- [x] 上架材料：隐私政策 / 支持页已托管（`https://app.aigcwe.com/privacy/`）；按 `docs/app-store/app-store-connect.md` 填 ASC；截图未拍

产品增强（非门槛，用户未点名先别做）：

- [x] 目标体重与差距（个人资料里的目标体重；概览对照最新体重）
- [ ] 本地提醒（称重 / 记饮食）
- [ ] 常用食物 / 食物库
- [ ] 步数（要再申请健康类型）
- [ ] 体重图增强
- [ ] Apple Watch 快速记体重

工程债（用户无感，可后做）：

- [ ] 独立 `WeightService` / `FoodService`（视图现在直接写 `ModelContext`）
- [ ] 测试 Target、`.gitignore`、String Catalog

不要假装未完成项已存在。改了产品口径或模型，同步改开发文档变更表。

## 目录

```
bodycheck/                     # 主 App 源码（同步进 Target）
  bodycheckApp.swift           # @main，创建 ModelContainer
  ContentView.swift            # Tab 根导航；onOpenURL + 摘要同步
  Models/                      # 仅 SwiftData @Model + 来源枚举
  Services/                    # CloudSyncMonitor；HealthKit* / WidgetSnapshotPublisher
  Views/{Today,Weight,Food,Settings}/
  Utilities/                   # 主题（AppTheme / AppFont）、日界
Shared/                        # App + Widget 共享：App Group、摘要、Deep Link、WeightUnit、BrandColor、FatMeatEquivalent
BodyTrackWidget/               # iOS Widget Extension（kind = WeightWidget）
docs/BodyTrack_开发文档.md     # 产品与架构规格；不要打进 App Target
```

新增主 App 文件放进 `bodycheck/` 对应目录；共享类型放 `Shared/`；Widget 专用放 `BodyTrackWidget/`。`docs/` 不要加入 App Target 源码组。

## 硬约束

1. **体重只存 kg**。界面用 `WeightUnit` 换算。偏好键：`AppStorage("weightUnit")`，值为 `"kg"` | `"lb"`。
2. **允许多条体重/日**。最新体重 = 按 `date` 最新的一条；同一天用 `createdAt` 决胜，不是「每日一条」。
3. **今日摄入** = 当日 `FoodEntry.calories` 之和。**净热量** = 摄入 − 活动能量 − 静息能量。不要再减「运动消耗」合计（活动能量已含锻炼）。缺项按 0，并在文案标明未计入。**概览回答「今天有没有多吃」时：当天没有饮食记录就不下结论**，不要把摄入当成 0。
4. **锻炼行的 `caloriesBurned == nil` 只展示时长**，不另做热量合计。热量合计以健康活动能量 / 静息能量为准。
5. **「今日」** 用设备当前时区 `Calendar.current`（见 `Date+CalendarDay` / `dayInterval`）。
6. **体重日期只到天**：`WeightEditorView` 保存 `date.startOfDay`。饮食保留时分。
7. **SwiftData + CloudKit 禁止 `@Attribute(.unique)`**。去重用应用层 `id` / `healthKitUUID`。新属性必须可选或带默认值。
8. **只做 iPhone**。不要加回 Mac / visionOS 目标或 `#if os(macOS)`。
9. **运动以 Apple 健康为源**。同步 workout。不要加自由录入运动，除非产品明确改口。
10. **HealthKit 未授权或不可用时，本地体重/饮食必须仍可用**。不要在启动第一帧弹授权。
11. **业务列表以 SwiftData 为准**。HealthKit 是健康生态出口与体重外部来源，不能阻塞未授权用户。
12. 无网 / 无 iCloud：本地照常读写，UI 不阻塞。
13. **Widget 只读 App Group 摘要**，不跑 SwiftData / CloudKit。suite 为 nil 时跳过摘要更新并打日志，禁止强制解包。
14. **小组件不输入数字**。点按打开 `bodytrack://log-weight`，由主 App 弹出 `WeightEditorView`。
15. **肥肉换算只做约数**：100 克 = 800 千卡（`FatMeatEquivalent`）。文案用「约等于 / 少了 / 多了」，不得写成当天体脂变化。常数留在本地，不要进 SwiftData / CloudKit。概览热量主卡不再用肥肉大图；日详情最多 5 块；中尺寸小组件配一块肥肉图，超过 100 克用 ×N。贴图放 `Shared/Assets.xcassets`，主 App 与小组件共用。
16. **概览热量主卡用数字和完整状态，不用「多吃了 / 没有吃多」做单独一行。** 到达目标按窗口首末日体重线性粗算（`WeightPace`），文案必须带「大约 / 粗算」，不得写成医学预测。间隔不足 7 天或变化小于 0.05 kg 不报天数。体重摘要条标题用陈述不用问句。
17. **用户可清除自己的全部数据**。设置里「清除我的全部数据」必须始终可点。清的是本应用保存的体重 / 饮食 / 运动 / 个人资料和小组件摘要，以及本应用写入健康的手动体重。不要删健康 App 里其他来源的样本。清除后禁止静默从健康再导入，直到用户再点「从健康同步」。体重单位等显示偏好可保留。

## 数据模型

四个 `@Model`：`WeightEntry`、`FoodEntry`、`ExerciseEntry`、`UserProfile`。记录类公共字段：`id`、`date`、`note?`、`createdAt`、`updatedAt`。

- `WeightEntry.weight`：kg。`source` 存 `WeightSource.rawValue`（`manual` / `healthkit`）。`healthKitUUID` 用于体重对账。
- `FoodEntry.calories`：kcal。`healthKitUUID` 仍保留（CloudKit 不能删字段），**不要**用来写健康。`photoData` 可选 JPEG，`@Attribute(.externalStorage)`。
- `ExerciseEntry`：比文档初稿多了 `source`（默认 `healthkit`）和 `healthKitUUID`。导入用 UUID upsert，禁止按名称+日期盲目插入。
- `UserProfile`：无账号。用户名、可选年龄、性别（`sexRaw`）、身高厘米、目标体重公斤。可能因同步出现多条，界面取 `updatedAt` 最新一条。热量仍不靠资料估算。

改模型时：给新属性默认值或设为可选；同步更新 Preview 的 `modelContainer(for:)` 列表；更新开发文档 §3。

容器由 `PersistenceController.load()` 创建：

```swift
ModelConfiguration(
    "BodyTrackCloud",
    cloudKitDatabase: .private("iCloud.yinke.bodycheck")
)
```

不要再用旧 store 名 `"BodyTrack"` 开 CloudKit：那是未接入 CloudKit 时留下的本地库，ModelContainer 可能打开成功但永远不 initialize schema。旧数据由 `migrateLegacyIfNeeded` 一次性拷进新库。创建失败时回退同一新 store 的 `.none`。

## CloudKit

- 容器：`iCloud.yinke.bodycheck`
- iOS entitlements：Debug 用 `bodycheck/bodycheck.entitlements`（CloudKit `Development`）；Release / Archive / TestFlight 用 `bodycheck/bodycheck.Release.entitlements`（CloudKit `Production`，`aps-environment` = `production`）。Widget 没有 CloudKit，不用改。
- iOS Background Modes：`remote-notification` 必须是数组，写在仓库根目录 `Info.plist`。不要放进 `bodycheck/`（文件系统同步组会再拷一份，编译报 Multiple commands produce Info.plist）。不要用 `INFOPLIST_KEY_UIBackgroundModes = "remote-notification"`（会生成字符串，CloudKit 会报 client bug）
- 无 iCloud 账号时本地照常读写；UI 必须反映 `CKAccountStatus` 和 `NSPersistentCloudKitContainer` 的 import/export 事件
- **CloudKit ≠ iCloud 云盘**：记录不会出现在「文件 / iCloud Drive」。开发阶段到 [CloudKit 控制台](https://icloud.developer.apple.com/) 选 `iCloud.yinke.bodycheck` → **Development** → **Private Database** 查看 `CD_WeightEntry` 等
- 设置里「已开启」只表示账号可用；「等待首次同步 / 正在上传 / 同步出错」才反映真正的 CloudKit 事件
- 不要在 App 启动主线程调用 `initializeCloudKitSchema()`：会卡住 CloudKit exporter，真机白屏，并打出 `PFCloudKitStoreMonitor ... didn't tear down after 5 seconds`
- 旧的非 CloudKit store 可能无法就地升级：设置会显示「仅本地」。开发阶段可删 App 重装；不要静默清空用户数据

### 发布前必须：Development schema → Production

Xcode Debug / 真机开发走 **Development**（`bodycheck.entitlements`）。TestFlight、App Store、Archive 走 **Release**，用 `bodycheck.Release.entitlements` 连 **Production**。  
不要把 Debug 那份改成 Production，日常真机会污染线上库。  
**Production 不会自动带上 Development 里的表。** 忘了部署，上架用户会同步失败，控制台 Production 里只有空的 `Users`。

当前 Development 已有、必须一并部署的类型：

- `CD_WeightEntry`
- `CD_FoodEntry`（含可选 `CD_photoData`）
- `CD_ExerciseEntry`
- `CD_UserProfile`

步骤（每次改了模型字段后都要再做一遍）：

1. 打开 [CloudKit 控制台](https://icloud.developer.apple.com/) → 容器 `iCloud.yinke.bodycheck`
2. 确认环境是 **Development**，**Schema → Record Types** 里上述三张表都在
3. 左下角 **Deploy Schema Changes...**
4. 核对将部署到 **Production** 的变更，确认 Deploy
5. 切到 **Production**，再打开 Record Types，确认三张表已出现

约束：

- CloudKit Production schema **只能加字段，不能删、不能改类型**。发布后不要随便改/删 `@Model` 属性
- 没部署就不要提审、不要打对外 TestFlight
- 代理做「准备上架 / TestFlight / Release / Archive」时，必须先问用户：Production schema 部署了没有？没有就停，不要继续打包

## 平台与 UI

- 分区：`AppSection` = 概览 / 饮食 / 体重（底部 Tab 从左到右；`allCases` 即 Tab 顺序）。无运动 Tab。上次分区：`AppStorage("lastAppSection")`；无法识别的旧值（如已删的 `exercise`）回退概览。
- iPhone：`TabView`；设置是 toolbar sheet。
- 品牌色：`AppTheme.brandTeal` / `intakeAmber` / `activityGreen`（源在 `Shared/BrandColor.swift`，小组件共用）。卡片用 `appSurface`，页面用 `pageBackground`。
- iPhone 字号 / 间距走 `AppFont` + `AppTheme.space*` / `stack*`，不要在视图里再写 `.system(size: 11)` 一类魔法数。数字用 `MeasurementValue` 或 `monospacedDigit`。
- 空状态用 `ContentUnavailableView`。
- 新文案先写中文。日期、时间、星期强制简体中文（`AppLocale` / `.appChineseLocale()`），工程 `developmentRegion` 为 `zh-Hans`，不要跟系统语言走。`SWIFT_EMIT_LOC_STRINGS` 已开，需要时再抽 String Catalog，不要先铺一层无调用的本地化包装。

## HealthKit（仅 iOS，当前实现）

- Entitlements：`com.apple.developer.healthkit`。
- 运动：只读 `HKObjectType.workoutType()`；`HealthKitExerciseService.syncWorkouts` 默认近 90 天。
- 体重：读+写 `HKQuantityType(.bodyMass)`。iOS 保存/编辑手动体重时双写并回填 `healthKitUUID`；删除手动记录时尝试删本 App 写入的样本。从健康导入按 `healthKitUUID` upsert（近 90 天）。`HKObserverQuery` + `enableBackgroundDelivery(.immediate)` 在已授权时自动拉取，不弹授权。点「从健康同步」或保存体重才请求权限。
- 静息能量：只读 `HKQuantityType(.basalEnergyBurned)`，按本地日历日做累计求和，展示在概览。不写入 SwiftData。
- 活动能量：只读 `HKQuantityType(.activeEnergyBurned)`，按本地日历日累计求和，不入库。净热量减去该值。不要再展示或另减「运动消耗」合计。
- 权限申请走 `HealthKitAccess`（读：体重 + workout + 静息能量 + 活动能量；写：体重）。**不要申请** `dietaryEnergyConsumed`。权限文案必须覆盖实际申请的类型。
- 不要在启动第一帧弹授权。首次点保存体重、设置里「允许健康数据」或「从健康同步」再请求。
- 健康来源的体重不要靠删除本地行「保持一致」——再同步会回来。
- 运动：不要删除健康来源行来「保持一致」——再同步会回来。界面只读展示，不提供编辑/删除。概览打开时静默 `syncWorkouts`（受 `HealthAutoImport` 暂停约束）；体重页「从健康同步」会一并拉取锻炼。

## 构建设置注意

- Xcode 26.4 工程；iOS 最低 **18.0**（主 App + Widget）。`SUPPORTED_PLATFORMS` 仅为 iOS。`SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = NO`。
- `REGISTER_APP_GROUPS = YES`；Group ID `group.yinke.bodycheck` 写在 iOS entitlements 与 Widget entitlements。
- Widget Target 仅 iOS。
- `BodyTrackWidget/Info.plist` 必须从同步组资源拷贝里排除（工程里已有 exception），否则会 Multiple commands produce Info.plist。
- Widget 必须 `ENABLE_DEBUG_DYLIB = NO`，嵌入阶段要带 `CodeSignOnCopy`。Debug dylib 会让 SpringBoard 拉不起扩展，图库里就没有。
- 图库要先用 **iPhone 目的地**安装并**打开一次**主 App，再搜索 **BodyTrack** 或 **体重**（主屏幕，不是锁定屏幕）。
- 无独立 Info.plist（`GENERATE_INFOPLIST_FILE = YES`）。键在 `project.pbxproj` 的 `INFOPLIST_KEY_*`。

## 构建与验证

本机有 Xcode 时，**优先编 iOS**：

```bash
# iOS 模拟器（设备名以本机 `xcrun simctl list devices available` 为准）
xcodebuild -project bodycheck.xcodeproj -scheme bodycheck \
  -destination 'platform=iOS Simulator,name=iPhone 17' build
```

没有测试 Target。改完保证上述能编过。Preview 用内存 `modelContainer`。

## 改代码时

- 先读将改的 Swift 文件和开发文档对应章节，再写。
- 视图里直接 `modelContext.insert` / `save` 是现有模式；抽 Service 可以，但不要只抽一半、另一半仍散落。
- 共享样式放 `AppTheme.swift` / `AppFont`，品牌色放 `Shared/BrandColor.swift`，日界放 `Date+CalendarDay.swift`，单位放 `WeightUnit.swift`。
- 不要提交 `.DS_Store`、`xcuserdata`、个人签名之外的本地状态。
- 用户未要求不要顺手重构、不要扩 scope、不要改名工程。
- 改了产品口径或模型，同步改 `docs/BodyTrack_开发文档.md` 文首版本与变更表；改了 `@Model` 后还要在控制台重新 Deploy 到 Production（见上文「发布前必须」）。
- 准备 Archive / TestFlight / 上架前，先完成 Development → Production schema 部署，否则线上同步是空的。
- 提交说明用 conventional commits；类型保留 `feat:` / `docs:`，**标题和正文一律中文**。

## 文档关系

- 产品范围、冲突策略、验收 A1–A10、发布前 Bundle/隐私 URL：`docs/BodyTrack_开发文档.md`。
- Agent 日常规则、实现与文档的偏差：本文件。
- 实现了对账或改了 Widget / App Group / Deep Link 后，更新本文件「当前进度」和硬约束，避免下一次会话再踩过时信息。
