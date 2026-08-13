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
| 最低系统（工程） | iOS 26.4 / macOS 26.4 / visionOS 26.4 |
| 语言 | Swift 5（`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`） |
| UI | SwiftUI，中文文案优先 |
| 持久化 | SwiftData，store 名 `BodyTrack`，CloudKit 容器 `iCloud.yinke.bodycheck` |
| 单 Target | `bodycheck`（`PBXFileSystemSynchronizedRootGroup`：往 `bodycheck/` 加文件即进编译） |

不要把仓库、工程、显示名、Bundle 擅自统一改名。

## 当前进度（2026-08）

已有：

- 多平台壳：iOS `TabView`，macOS `NavigationSplitView` + `Settings` 窗
- 体重 CRUD（手动，`source = manual`）；体重页 Mac 侧有筛选、检查器、宽度自适应
- 饮食 CRUD（名称 + kcal）；按本地日历日分组
- 今日概览：最新体重、今日摄入、今日运动、体重趋势图、最近记录
- 设置：体重单位 kg/lb；iCloud 真实账号状态；隐私与关于文案
- SwiftData CloudKit：容器 `iCloud.yinke.bodycheck`；失败则回退本地 store
- iOS：从 Apple 健康导入 **workout** → `ExerciseEntry`（按 `healthKitUUID` upsert）
- iOS：手动新增/编辑/删除体重写回 Apple 健康（`bodyMass`，回填 `healthKitUUID`）；从健康导入体重按 UUID upsert；未授权时本地仍可用
- Mac：运动列表只读，不提供新增/编辑/删除；Mac 改体重不写 HealthKit

未做（文档 MVP 里仍是规划）：

- 食物写回 `dietaryEnergyConsumed`
- Widget / App Group / Deep Link（`bodytrack://log-weight`）
- 独立 `WeightService` / `FoodService`；视图目前直接写 `ModelContext`
- 测试 Target、`.gitignore`、本地化 String Catalog

不要假装这些已存在。接入前先改 entitlements / Info.plist / 容器配置，并更新文档变更表。

## 目录

```
bodycheck/                     # 主 App 源码（同步进 Target）
  bodycheckApp.swift           # @main，创建 ModelContainer
  ContentView.swift            # 平台根导航
  Models/                      # 仅 SwiftData @Model + 来源枚举
  Services/                    # CloudSyncMonitor（全平台）；HealthKit*（#if os(iOS)）
  Views/{Today,Weight,Food,Exercise,Settings}/
  Utilities/                   # 主题、单位、日界
docs/BodyTrack_开发文档.md     # 产品与架构规格；不要打进 App Target
```

新增文件放进对应目录。`docs/` 不要加入 App Target 源码组。

## 硬约束

1. **体重只存 kg**。界面用 `WeightUnit` 换算。偏好键：`AppStorage("weightUnit")`，值为 `"kg"` | `"lb"`。
2. **允许多条体重/日**。最新体重 = 按 `date` 最新的一条；同一天用 `createdAt` 决胜，不是「每日一条」。
3. **今日摄入** = 当日 `FoodEntry.calories` 之和。运动消耗单独展示，**不要做净热量**。
4. **`caloriesBurned == nil` 不计入任何热量合计**，只展示时长。
5. **「今日」** 用设备当前时区 `Calendar.current`（见 `Date+CalendarDay` / `dayInterval`）。
6. **体重日期只到天**：`WeightEditorView` 保存 `date.startOfDay`。饮食保留时分。
7. **SwiftData + CloudKit 禁止 `@Attribute(.unique)`**。去重用应用层 `id` / `healthKitUUID`。新属性必须可选或带默认值。
8. **Mac 不依赖 HealthKit**。Health 相关 API、授权入口、写回逻辑一律 `#if os(iOS)`。
9. **运动以 Apple 健康为源**。iOS 同步 workout；Mac 只读。不要加自由录入运动，除非产品明确改口。
10. **HealthKit 未授权或不可用时，本地体重/饮食必须仍可用**。不要在启动第一帧弹授权。
11. **业务列表以 SwiftData 为准**。HealthKit 是 iOS 出口/来源，不能阻塞 Mac 或未授权用户。
12. 无网 / 无 iCloud：本地照常读写，UI 不阻塞。

## 数据模型

三个 `@Model`：`WeightEntry`、`FoodEntry`、`ExerciseEntry`。公共字段：`id`、`date`、`note?`、`createdAt`、`updatedAt`。

- `WeightEntry.weight`：kg。`source` 存 `WeightSource.rawValue`（`manual` / `healthkit`）。`healthKitUUID` 预留给体重对账，Mac 上通常为 nil。
- `FoodEntry.calories`：kcal。`healthKitUUID` 预留给饮食写回。
- `ExerciseEntry`：比文档初稿多了 `source`（默认 `healthkit`）和 `healthKitUUID`。导入用 UUID upsert，禁止按名称+日期盲目插入。

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
- iOS entitlements：`bodycheck/bodycheck.entitlements`（HealthKit + iCloud + `aps-environment`）
- macOS entitlements：`bodycheck/bodycheck.macos.entitlements`（iCloud + sandbox + `network.client`，**无** HealthKit）
- iOS Background Modes：`remote-notification` 必须是数组，写在仓库根目录 `Info.plist`。不要放进 `bodycheck/`（文件系统同步组会再拷一份，编译报 Multiple commands produce Info.plist）。不要用 `INFOPLIST_KEY_UIBackgroundModes = "remote-notification"`（会生成字符串，CloudKit 会报 client bug）
- 无 iCloud 账号时本地照常读写；UI 必须反映 `CKAccountStatus` 和 `NSPersistentCloudKitContainer` 的 import/export 事件
- **CloudKit ≠ iCloud 云盘**：记录不会出现在「文件 / iCloud Drive」。开发阶段到 [CloudKit 控制台](https://icloud.developer.apple.com/) 选 `iCloud.yinke.bodycheck` → **Development** → **Private Database** 查看 `CD_WeightEntry` 等
- 侧栏「已开启」只表示账号可用；「等待首次同步 / 正在上传 / 同步出错」才反映真正的 CloudKit 事件
- 不要在 App 启动主线程调用 `initializeCloudKitSchema()`：会卡住 CloudKit exporter，真机白屏，并打出 `PFCloudKitStoreMonitor ... didn't tear down after 5 seconds`
- 旧的非 CloudKit store 可能无法就地升级：设置会显示「仅本地」。开发阶段可删 App 重装；不要静默清空用户数据

### 发布前必须：Development schema → Production

Xcode Debug / 真机开发走 **Development**。TestFlight、App Store、Release 包走 **Production**。  
**Production 不会自动带上 Development 里的表。** 忘了部署，上架用户会同步失败，控制台 Production 里只有空的 `Users`。

当前 Development 已有、必须一并部署的类型：

- `CD_WeightEntry`
- `CD_FoodEntry`
- `CD_ExerciseEntry`

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

- 分区：`AppSection` = 概览 / 体重 / 饮食 / 运动。上次分区：`AppStorage("lastAppSection")`。
- iOS：`TabView`；设置是 toolbar sheet。
- macOS：侧栏 + detail；设置走系统 Settings 场景（⌘,）。窗口最小约 880×580，默认 1100×720。窄宽度时收起体重检查器。
- 品牌色：`AppTheme.brandTeal` / `intakeAmber` / `activityGreen`。卡片用 `appSurface`，页面用 `pageBackground`。
- 空状态用 `ContentUnavailableView`。数字用 `monospacedDigit`。
- 体重 Mac 列表：**不要**给行加 `onTapGesture`（会抢走 `List` 选择，尤其第一列）。单元格文本 `.allowsHitTesting(false)`。
- 快捷键：新增常用 `⌘N`；取消/保存用 `cancelAction` / `defaultAction`。
- 新文案先写中文。日期、时间、星期强制简体中文（`AppLocale` / `.appChineseLocale()`），工程 `developmentRegion` 为 `zh-Hans`，不要跟系统语言走。Mac 菜单、日期选择器、图表坐标同样用中文。`SWIFT_EMIT_LOC_STRINGS` 已开，需要时再抽 String Catalog，不要先铺一层无调用的本地化包装。

## HealthKit（仅 iOS，当前实现）

- Entitlements：`com.apple.developer.healthkit`。
- 运动：只读 `HKObjectType.workoutType()`；`HealthKitExerciseService.syncWorkouts` 默认近 90 天。
- 体重：读+写 `HKQuantityType(.bodyMass)`。iOS 保存/编辑手动体重时双写并回填 `healthKitUUID`；删除手动记录时尝试删本 App 写入的样本。从健康导入按 `healthKitUUID` upsert（近 90 天）；打开体重/概览或回到前台时静默拉取，不弹授权。点「从健康同步」才请求权限。
- 权限文案已覆盖锻炼读取与体重读写。若再增加饮食写回，必须同步改 `NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription`，且**只申请真正用到的类型**。
- 不要在启动第一帧弹授权。首次点保存体重、设置里「允许写入健康」或「从健康同步」再请求。
- Mac 改删体重不写 HK。健康来源的体重不要靠删除本地行「保持一致」——再同步会回来。
- 运动：不要删除健康来源行来「保持一致」——再同步会回来。`ExerciseListView` 有意不做删除。

## 构建设置注意

- Xcode 26.4 工程；`SUPPORTED_PLATFORMS` 含 iOS / macOS / visionOS。改 UI 时至少保证 iOS + macOS 都能编过。visionOS 未单独打磨，不要主动加 xrOS 专用 UI。
- App Sandbox 已开。`REGISTER_APP_GROUPS = YES` 但还没有 Group ID / Widget。
- Mac 必须用 `bodycheck.macos.entitlements`；不要把 HealthKit 写进 Mac entitlements。
- 无独立 Info.plist（`GENERATE_INFOPLIST_FILE = YES`）。键在 `project.pbxproj` 的 `INFOPLIST_KEY_*`。

## 构建与验证

本机有 Xcode 时：

```bash
# macOS
xcodebuild -project bodycheck.xcodeproj -scheme bodycheck -destination 'platform=macOS' build

# iOS 模拟器（设备名以本机 `xcrun simctl list devices available` 为准）
xcodebuild -project bodycheck.xcodeproj -scheme bodycheck \
  -destination 'platform=iOS Simulator,name=iPhone 16' build
```

没有测试 Target。改完至少保证上述一端能编过；碰 `#if os(...)` 时两端都编。Preview 用内存 `modelContainer`。

## 改代码时

- 先读将改的 Swift 文件和开发文档对应章节，再写。
- 视图里直接 `modelContext.insert` / `save` 是现有模式；抽 Service 可以，但不要只抽一半、另一半仍散落。
- 共享样式放 `AppTheme.swift`，日界放 `Date+CalendarDay.swift`，单位放 `WeightUnit.swift`。
- 不要提交 `.DS_Store`、`xcuserdata`、个人签名之外的本地状态。
- 用户未要求不要顺手重构、不要扩 scope 到 Widget/改名工程。
- 改了产品口径或模型，同步改 `docs/BodyTrack_开发文档.md` 文首版本与变更表；改了 `@Model` 后还要在控制台重新 Deploy 到 Production（见上文「发布前必须」）。
- 准备 Archive / TestFlight / 上架前，先完成 Development → Production schema 部署，否则线上同步是空的。
- 提交说明用 conventional commits；现有风格：`feat:` / `docs:`。

## 文档关系

- 产品范围、冲突策略、验收 A1–A10、发布前 Bundle/隐私 URL：`docs/BodyTrack_开发文档.md`。
- Agent 日常规则、实现与文档的偏差：本文件。
- 实现了对账、Widget 后，更新本文件「当前进度」和硬约束，避免下一次会话再踩过时信息。
