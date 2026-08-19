# 人体体征追踪 App 开发文档

**版本**：v1.32  
**日期**：2026-08-19  
**项目代号**：BodyTrack  
**工程名（当前）**：bodycheck（Xcode 工程可后续重命名）

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.32 | 2026-08-19 | 日详情当天没有锻炼时，提示去 Apple 健康补记（搜索 → 健身记录 → 体能训练），再回到 BodyTrack 同步。不在本应用手写运动，也不跳转「健身」App |
| v1.31 | 2026-08-19 | 概览热量卡展示今日运动概要（例如「今天有 2 次锻炼，共 77 分钟」）；当天没有锻炼则不展示 |
| v1.30 | 2026-08-19 | 去掉运动 Tab。锻炼只从 Apple 健康导入，不可在本应用增删改；展示在概览最近记录和日详情。底部 Tab：概览 / 饮食 / 体重 |
| v1.29 | 2026-08-19 | 底部 Tab 从左到右改为概览 / 饮食 / 体重 / 运动 |
| v1.28 | 2026-08-17 | 设置「清除我的全部数据」：用户可删除本应用保存的全部体重、饮食、运动和个人资料，并清小组件摘要。打开 iCloud 时删除会同步到其他设备。本应用写入健康的手动体重会尝试一并删除。清除后不再自动从健康导入，直到用户再点「从健康同步」 |
| v1.27 | 2026-08-17 | 设置增加一键清除：删除本机全部体重、饮食、运动和个人资料；尝试删除本应用写入健康的手动体重；刷新小组件摘要。健康导入的记录下次同步仍可能回来。体重单位等偏好保留 |
| v1.26 | 2026-08-17 | 概览用记录给出三块结论（今天热量有没有多、最近体重轻了还是重了、按最近速度还要多久到目标）。标题是陈述不是问句。没记饮食不算吃了 0。达标时间按窗口首末日体重线性粗算 |
| v1.25 | 2026-08-17 | 个人资料填写入口放到概览体重卡内（「填写个人资料 / 编辑资料」）；设置里仍可打开同一编辑页 |
| v1.24 | 2026-08-17 | 个人资料：用户名、年龄、性别、身高、目标体重；概览显示姓名与距目标差距。新表 `CD_UserProfile`，上架前须随 schema 部署 Production |
| v1.23 | 2026-08-17 | 概览热量卡「今日 / 总计」切换；总计为近 30 天净值相加，小组件仍只显示今日 |
| v1.22 | 2026-08-17 | 中尺寸小组件热量差配肥肉图（一块 + 克数；超过 100 克用 ×N） |
| v1.21 | 2026-08-17 | 热量差用肥肉块示意：100 克 = 800 千卡；概览/日详情最多 5 块；小组件只出克数 |
| v1.20 | 2026-08-17 | 上架材料：隐私政策正文、App Store Connect 填写稿、App 内政策页；URL 仍待托管 |
| v1.19 | 2026-08-14 | 删除全部 Mac / visionOS 目标与专用代码；工程只编 iOS；产品仅 iPhone |
| v1.18 | 2026-08-14 | 工程 `IPHONEOS_DEPLOYMENT_TARGET` 从 Xcode 默认 26.4 改为 18.0，与产品口径对齐 |
| v1.16 | 2026-08-13 | iPhone 统一视觉 token：字号角色 `AppFont`、4pt 间距、品牌色抽到 `BrandColor` 与小组件共用 |
| v1.0 | 2026-08-11 | 初稿 |
| v1.1 | 2026-08-11 | 修正 CloudKit/HealthKit 模型与权限；补冲突策略、Deep Link、验收标准；文档迁至 `docs/` |
| v1.2 | 2026-08-13 | 启用 SwiftData CloudKit：容器 `iCloud.yinke.bodycheck`；模型补默认值；无账号/失败时回退本地 |
| v1.3 | 2026-08-13 | iOS 手动体重写回 Apple 健康（`bodyMass` + `healthKitUUID`） |
| v1.4 | 2026-08-13 | iOS 从健康导入体重：按 `healthKitUUID` upsert；回到前台静默拉取 |
| v1.5 | 2026-08-13 | iOS 读取今日静息能量（`basalEnergyBurned` 合计）；不入库 |
| v1.6 | 2026-08-13 | 概览展示净热量：摄入 − 运动消耗 − 静息能量 |
| v1.7 | 2026-08-13 | Mac 功能全部搁置；先做完 iPhone |
| v1.8 | 2026-08-13 | 饮食不写健康：健康无餐食日记，只留在 SwiftData |
| v1.9 | 2026-08-13 | 饮食支持拍照/相册；`FoodEntry.photoData` 可选外置存储 |
| v1.10 | 2026-08-13 | 健康体重变化自动导入（Observer + 后台投递） |
| v1.11 | 2026-08-13 | iPhone 小组件 + App Group `group.yinke.bodycheck` + Deep Link `bodytrack://log-weight` |
| v1.12 | 2026-08-13 | 中尺寸小组件改展示今日热量差（净热量），不再只显示摄入 |
| v1.13 | 2026-08-13 | iOS 读取今日活动能量（`activeEnergyBurned`）；有值时净热量用活动能量，不再另减运动消耗 |
| v1.14 | 2026-08-13 | 去掉「运动消耗」合计；净热量只减活动能量与静息能量 |
| v1.15 | 2026-08-13 | 概览趋势图点选进入日详情：当天体重、饮食、运动、热量差 |
| v1.16 | 2026-08-13 | iPhone 统一视觉 token：字号角色 `AppFont`、4pt 间距、品牌色抽到 `BrandColor` 与小组件共用 |
| v1.17 | 2026-08-13 | 明确：本项目无付费点，不做内购 / 订阅 / 付费墙 |

---

## 1. 项目概述

### 1.1 产品定位

一款 iPhone 人体体征记录工具，核心能力包括：

- 从 Apple 健康读取体重数据
- 手动记录体重、简单食物热量、运动
- iPhone 桌面小组件支持快速记录体重
- 数据通过 iCloud 在多台 iPhone 之间同步

### 1.2 目标用户

需要持续关注体重变化、简单记录饮食与运动，并希望在桌面快速操作的用户。

### 1.3 MVP 范围（第一版必须完成）

| 功能 | iPhone | Mac | 优先级 |
|------|--------|-----|--------|
| 体重记录（增删改查） | ✅ | ✅ | P0 |
| 快速记录体重（小组件入口） | ✅ | - | P0 |
| 从 HealthKit 读取最新体重 | ✅ | - | P0 |
| 手动体重写回 HealthKit | ✅ | - | P0 |
| 简单食物热量记录 | ✅ | ✅ | P0 |
| 运动记录 | ✅ | ✅ | P1 |
| 今日热量汇总展示 | ✅ | ✅ | P1 |
| 数据 iCloud 同步 | ✅ | ✅ | P0 |

### 1.4 产品口径（已定默认，可改）

| 事项 | 默认规则 |
|------|----------|
| 体重单位存储 | 始终 **kg**；界面可切换显示为 lb |
| 体重条数 | **允许多条/日**（列表全保留；「最新体重」取 `date` 最新一条，同一天用 `createdAt` 决胜） |
| 今日热量公式 | **今日摄入** = 当日 `FoodEntry.calories` 之和；**净热量** = 摄入 − 活动能量 − 静息能量 |
| 肥肉示意 | **100 克肥肉 = 800 千卡**热量差。文案用「约等于 / 少了 / 多了」，不是当天体脂变化。概览最多 3 大块；日详情最多 5 块；中尺寸小组件一块图 + 克数 |
| 热量范围 | 概览「今天热量」只看当天。没记饮食不把摄入当 0。小组件只显示今日 |
| 达标时间 | 按所选体重窗口内**首日与末日**的体重差做线性粗算。文案用「大约 / 粗算」，不是预测。间隔不足 7 天或几乎没变则不报天数 |
| 锻炼无消耗 | 列表行 `caloriesBurned == nil` 只展示时长，不另做合计 |
| 「今日」边界 | 使用设备 **当前时区** 的 `Calendar.current` 日界（00:00–24:00） |
| 食物写回 HealthKit | **否**。饮食只存在 BodyTrack；健康没有餐食列表，不写 `dietaryEnergyConsumed` |
| 小组件输入 | **否**直接输数字；跳转主 App 快速记录页 |
| 界面语言 | 先中文；日期/时间/星期强制简体中文，不跟系统语言走 |
| 最低系统 | iOS 18+ |
| 平台节奏 | **仅 iPhone**。Mac / visionOS 代码已删除 |
| 付费 | **无**。不做内购、订阅、付费墙；功能不按会员开关 |

---

## 2. 技术架构

### 2.1 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 语言 | Swift 6 | 注意严格并发（`Sendable` 等） |
| UI | SwiftUI | iPhone |
| 数据持久化 | SwiftData | 本地业务数据 |
| 跨设备同步 | CloudKit（SwiftData） | iPhone ↔ Mac |
| 健康数据 | HealthKit | **仅 iOS Target** |
| 小组件 | WidgetKit + App Intents | **仅 iOS** |
| 本机共享 | App Groups | App ↔ Widget 摘要 |
| 最低系统 | iOS 18+ | 可按用户群下调 |

### 2.2 架构原则

1. **iOS 上，HealthKit 与 SwiftData 双写对账**：体重以 sample UUID 关联，避免重复导入。
2. **SwiftData 为全平台业务数据源**（详细记录、笔记、列表、Mac 端）。
3. **App Group 只存 Widget 所需摘要**（最新体重、今日摄入等），不承担完整同步。
4. **CloudKit 负责跨设备业务数据同步**；Widget Extension **不**直接跑完整 CloudKit 同步。
5. **Mac 不依赖 HealthKit**，只使用同步后的 SwiftData；Mac 上的改删 **不直接** 写 HealthKit（由 iOS 侧按策略处理或仅保留业务库）。

### 2.3 数据流向

```
┌─────────────────────────────────────────────────────────────┐
│ 写入路径                                                     │
│  App / Widget Intent → 主 App UI → SwiftData 写入            │
│       ├─(iOS)→ 写回 HealthKit（仅体重，按策略）               │
│       ├─────→ CloudKit 同步到其他设备                         │
│       └─────→ 更新 App Group + reload Widget timelines       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 读入路径（仅 iOS）                                            │
│  HealthKit（Observer / 主动拉取）                             │
│       → 按 healthKitUUID upsert 到 SwiftData                 │
│       → 更新 App Group + 刷新 Widget                          │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 冲突与对账策略

| 场景 | 规则 |
|------|------|
| iOS 手动新增体重 | 写 SwiftData（`source = manual`）+ 写 HealthKit；保存返回的 sample UUID 到 `healthKitUUID` |
| Health 侧新增/变更体重 | 用 sample UUID **upsert**：已存在则更新 `weight`/`date`，不存在则插入（`source = healthkit`） |
| iOS 编辑体重 | 更新 SwiftData；若有 `healthKitUUID` 则删除旧 HK 样本并写入新样本（或按实现选择 update），再更新 UUID |
| iOS 删除体重 | 删 SwiftData；若有 `healthKitUUID` 且 `source == manual`（或本 App 写入的样本）则尝试删 HK 样本 |
| Mac 新增/编辑/删除体重 | **仅**改 SwiftData + CloudKit；**不**写 HealthKit |
| 食物新增/编辑/删除 | **仅**改 SwiftData + CloudKit；**不**写 HealthKit |
| 无 iCloud / 离线 | 本地 SwiftData 照常读写；恢复网络后由系统同步；UI 不阻塞 |
| HealthKit 未授权 | 全部业务功能仍可用；隐藏/禁用「从健康同步」相关提示，引导去设置 |

**原则**：业务列表以 SwiftData 为准；HealthKit 是 iOS 上的健康生态出口与体重外部来源，不能阻塞 Mac 与未授权用户。

---

## 3. 数据模型（SwiftData）

> **重要**：SwiftData + CloudKit **不支持** `@Attribute(.unique)`。业务唯一性用 `id` / `healthKitUUID` 在应用层保证。

```swift
import SwiftData
import Foundation

/// 体重来源（存 rawValue 字符串，便于 CloudKit）
enum WeightSource: String, Codable {
    case healthkit
    case manual
}

@Model
final class WeightEntry {
    var id: UUID
    var date: Date
    var weight: Double                 // 单位：kg
    var source: String                 // WeightSource.rawValue
    /// 关联的 HealthKit 样本 UUID；用于去重与删除/更新对账。Mac 端通常为 nil。
    var healthKitUUID: UUID?
    var note: String?
    var createdAt: Date
    var updatedAt: Date

    init(
        weight: Double,
        date: Date = Date(),
        source: WeightSource = .manual,
        healthKitUUID: UUID? = nil,
        note: String? = nil
    ) {
        self.id = UUID()
        self.date = date
        self.weight = weight
        self.source = source.rawValue
        self.healthKitUUID = healthKitUUID
        self.note = note
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

@Model
final class FoodEntry {
    var id: UUID
    var date: Date
    var name: String
    var calories: Double
    /// 不写健康；字段保留兼容旧 schema
    var healthKitUUID: UUID?
    var note: String?
    /// 可选饮食照片（JPEG），externalStorage
    var photoData: Data?
    var createdAt: Date
    var updatedAt: Date

    init(
        name: String,
        calories: Double,
        date: Date = Date(),
        healthKitUUID: UUID? = nil,
        note: String? = nil,
        photoData: Data? = nil
    ) {
        self.id = UUID()
        self.date = date
        self.name = name
        self.calories = calories
        self.healthKitUUID = healthKitUUID
        self.note = note
        self.photoData = photoData
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

@Model
final class ExerciseEntry {
    var id: UUID
    var date: Date
    var name: String
    var durationMinutes: Int
    var caloriesBurned: Double?        // nil 不计入热量合计
    var note: String?
    var createdAt: Date
    var updatedAt: Date

    init(
        name: String,
        durationMinutes: Int,
        caloriesBurned: Double? = nil,
        date: Date = Date(),
        note: String? = nil
    ) {
        self.id = UUID()
        self.date = date
        self.name = name
        self.durationMinutes = durationMinutes
        self.caloriesBurned = caloriesBurned
        self.note = note
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

@Model
final class UserProfile {
    var id: UUID
    var name: String
    var age: Int?
    var sexRaw: String                 // UserSex: unspecified / female / male
    var heightCm: Double?              // 厘米
    var targetWeightKg: Double?        // 公斤
    var createdAt: Date
    var updatedAt: Date
}
```

**说明**：

- 使用 `createdAt` / `updatedAt` 便于排查同步与展示「最近修改」
- 体重统一 **kg** 存储；界面按用户偏好转换
- `UserProfile` 无账号，取 `updatedAt` 最新一条；身高存厘米，目标体重存公斤
- 单位偏好、授权引导状态等 **非业务实体** 使用 `AppStorage` / `UserDefaults`（主 App）；需给 Widget 用的摘要字段进 App Group（见 §5.4）

**设置相关键（建议）**：

```swift
// 主 App UserDefaults / AppStorage
// weightUnit: "kg" | "lb"
// hasRequestedHealthKit: Bool
```

---

## 4. 项目结构建议

```
bodycheck/                              # 仓库根（工程名可改为 BodyTrack）
├── docs/
│   └── BodyTrack_开发文档.md
├── BodyTrack/                          # 主 App（Multiplatform）
│   ├── App/
│   │   └── BodyTrackApp.swift
│   ├── Models/                         # 仅主 App：SwiftData @Model
│   │   ├── WeightEntry.swift
│   │   ├── FoodEntry.swift
│   │   └── ExerciseEntry.swift
│   ├── Services/
│   │   ├── HealthKitManager.swift      # #if os(iOS)
│   │   ├── WeightService.swift
│   │   ├── FoodService.swift
│   │   └── ExerciseService.swift
│   ├── Views/
│   │   ├── ContentView.swift
│   │   ├── Weight/
│   │   ├── Food/
│   │   ├── Exercise/
│   │   └── Components/
│   ├── ViewModels/
│   └── Utilities/
│       ├── DeepLink.swift
│       └── Date+Extensions.swift
├── BodyTrackWidget/                    # Widget Extension（iOS）
│   ├── BodyTrackWidget.swift
│   ├── WeightWidgetView.swift
│   ├── QuickLogWeightIntent.swift
│   └── TimelineProvider.swift
├── Shared/                             # 共享：轻量类型，不要放 @Model
│   ├── AppGroup.swift
│   ├── WidgetSnapshot.swift            # Codable 摘要 DTO
│   ├── Constants.swift
│   └── DeepLink+Routes.swift
└── BodyTrack.xcodeproj
```

**边界约定**：

| 位置 | 放什么 | 不放什么 |
|------|--------|----------|
| 主 App `Models/` | SwiftData `@Model` | Widget 专用视图 |
| `Shared/` | App Group 键、Codable 摘要、Deep Link、常量 | `@Model`、CloudKit 容器逻辑 |
| Widget | Timeline、UI、App Intent | 完整 SwiftData + CloudKit 栈 |

**Capabilities 必须开启**：

- iCloud（CloudKit）— 主 App
- App Groups — 主 App + Widget **同一 Group ID**
- HealthKit — **仅 iOS 主 App Target**

---

## 5. 核心功能实现要点

### 5.1 HealthKit 集成（仅 iOS）

#### MVP 申请的权限类型（收敛）

**读取**：

- `HKQuantityTypeIdentifier.bodyMass`
- `HKObjectType.workoutType()`
- `HKQuantityTypeIdentifier.basalEnergyBurned`（今日静息能量合计）
- `HKQuantityTypeIdentifier.activeEnergyBurned`（今日活动能量合计）

**写入**：

- `HKQuantityTypeIdentifier.bodyMass`

不要申请 `dietaryEnergyConsumed`。

> 后续扩展再申请：`stepCount` 等。  
> 与审核原则一致：**只申请真正用到的类型**。

#### Info.plist

```xml
<key>NSHealthShareUsageDescription</key>
<string>需要读取 Apple 健康中的锻炼记录、体重、静息能量和活动能量，以便展示运动、体重与今日消耗。</string>
<key>NSHealthUpdateUsageDescription</key>
<string>需要将你在 BodyTrack 中记录或修改的体重写入 Apple 健康。</string>
```

#### 关键逻辑

- **不要**在冷启动第一帧强制弹授权；在用户保存体重或点击「允许写入健康」时请求
- 手动记录/编辑体重（仅 iOS）：SwiftData + HealthKit 双写，保存 sample UUID；编辑时删除旧样本再写入
- 已授权时打开体重页 / 概览 / 回到前台：从健康拉取近 90 天 `bodyMass`，按 `healthKitUUID` upsert；并补写没有 UUID 的手动记录
- 用户点「从健康同步」或保存体重时才弹授权
- `HKObserverQuery` + `enableBackgroundDelivery(.immediate)`：健康里体重变化后自动导入（需已授权读取；不在启动第一帧弹权限）
- 权限拒绝：本地功能全开，设置页展示写回状态与跳转系统设置入口

#### 饮食与健康

- **不写回**。健康「营养 → 膳食能量」只有千卡合计，没有餐食名称/列表
- 今日摄入、净热量一律以 SwiftData 里的 `FoodEntry` 为准

### 5.2 小组件（快速记录体重）

**交互流程**：

1. 用户点击小组件「记录体重」
2. 触发 `AppIntent`
3. Intent 打开主 App，并带上 Deep Link（见 §5.5）
4. 主 App 打开「快速记录体重」→ 用户输入 → SwiftData + HealthKit → 更新 App Group → `WidgetCenter` 刷新

**展示内容**：

- 最新体重（按用户单位）
- 与上一条的差值（↑ / ↓）
- 今日热量差（净热量 = 摄入 − 活动能量 − 静息能量；缺项标明未计入）
- 约合克肥肉（肥肉图 + 克数；100 克 = 800 千卡；超过一块用 ×N）
- 「记录体重」按钮

### 5.3 跨设备同步

```swift
let modelConfiguration = ModelConfiguration(
    "BodyTrack",
    cloudKitDatabase: .private("iCloud.yinke.bodycheck")
)
```

实现见 `PersistenceController.load()`：先开 CloudKit，失败则同一 store 名回退 `cloudKitDatabase: .none`。设置页与 Mac 侧栏展示 `CKContainer.accountStatus()`。

**注意**：

- CloudKit 容器 ID：`iCloud.yinke.bodycheck`（与 Bundle `yinke.bodycheck` 对齐）
- 首次用自动签名编译时，Xcode 会向开发者账号注册 iCloud / Push / CloudKit
- 模型属性必须可选或带默认值；**不要**使用 `@Attribute(.unique)`
- 开发环境 schema 随第一次写入自动生成；上架前须在 CloudKit 控制台部署到 Production
- 无 iCloud 账号或容器创建失败时 App 仍可单机使用
- Widget **不**直接操作完整 CloudKit 同步

### 5.4 App Group 共享

```swift
enum AppGroup {
    static let suiteName = "group.yinke.bodycheck"

    static var userDefaults: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    static let latestWeightKey = "latestWeight"           // Double, kg
    static let latestWeightDateKey = "latestWeightDate"   // TimeInterval
    static let previousWeightKey = "previousWeight"       // Double?, kg，用于差值
    static let todayCaloriesKey = "todayCalories"         // Double，今日摄入
    static let weightUnitKey = "weightUnit"               // "kg" | "lb"，与主 App 一致
}

// 使用时禁止强制解包：suite 为 nil 时跳过 Widget 摘要更新并打日志
```

主 App 在数据变更后更新摘要，并调用：

```swift
WidgetCenter.shared.reloadTimelines(ofKind: "WeightWidget")
```

`WidgetSnapshot`（Shared，Codable）建议字段与上述 key 对齐，便于编码读写。

### 5.5 Deep Link

| 路由 | 用途 |
|------|------|
| `bodytrack://log-weight` | 小组件 / Intent 打开快速记录体重 |
| `bodytrack://today` | 可选：打开今日概览 |

实现要点：

- 主 App 注册 URL Scheme：`bodytrack`
- `BodyTrackApp` / 根视图处理 `onOpenURL`
- Widget Intent 使用 `OpenURLIntent` 或等价方式打开上述 URL
- 发布前可改为 Universal Links（可选，非 MVP）

---

## 6. 界面与功能规划

### 6.1 iPhone 主要页面

底部 Tab 从左到右：**概览 / 饮食 / 体重**（`AppSection.allCases`）。没有运动 Tab：锻炼只从 Apple 健康导入，不可在本应用增删改，展示在概览最近记录和日详情。

1. **今日概览**（三块结论，来自记录，不用问句当标题）
   - 顶部对照表一眼给出三句结论（今天 / 最近 / 目标）；点行进入对应记录。没数据不占大空状态
   - 有饮食后再展开今天热量细节（肥肉块 + 三列）；当天有锻炼时补一句运动概要（次数 + 总分钟），没有就不展示；有体重后再展开趋势图
   - 点趋势图某一天进入日详情（当天体重、饮食、运动、热量）。当天没有锻炼时只显示「没有运动记录」和「？」；点问号再说明如何在「健康」补记。不在本应用手写运动，也不跳转「健身」App

2. **饮食**
   - 按**本地日历日**分组的食物列表；点进详情看照片、热量与时间，再编辑或删除
   - 快速添加（名称 + 热量）；iPhone 可拍照或从相册选图

3. **体重**
   - 列表 + 简单趋势图（趋势可放打磨阶段）
   - 新增 / 编辑 / 删除

4. **设置**
   - 个人资料：仍可打开同一编辑页（主入口在概览顶部）
   - HealthKit 授权状态与引导（仅 iOS）
   - 单位切换（kg / lb）
   - 清除我的全部数据（体重 / 饮食 / 运动 / 个人资料 / 小组件摘要）；健康 App 源数据不动；清除后不再自动从健康导入，直到用户再点同步
   - 数据与隐私说明入口

### 6.2 Mac 主要页面

- 与 iPhone 功能基本对齐
- 更强调列表管理与批量编辑
- **不**显示 HealthKit 权限入口

### 6.3 小组件尺寸

- `systemSmall`：最新体重 + 记录按钮
- `systemMedium`：体重 + 今日热量差（肥肉图 + 克数）+ 记录按钮

---

## 7. 开发阶段建议

### 第一阶段（基础骨架）

1. 创建 / 调整为 Multiplatform 项目
2. 配置 SwiftData + CloudKit（无 unique 约束）
3. 实现 `WeightEntry` 增删改查（iOS + Mac）
4. 验证双端同步
5. 注册 Deep Link 与快速记录页骨架

### 第二阶段（HealthKit + 小组件）

1. 接入 HealthKit 体重读/写 + UUID 对账
2. App Group 摘要 + 单位共享
3. Weight Widget + Intent 跳转快速记录

### 第三阶段（饮食与运动）

1. `FoodEntry`（仅本地/iCloud，不写健康）
2. `ExerciseEntry`（P1）
3. 今日摄入汇总与概览展示

### 第四阶段（打磨）

1. 单位切换、空状态、错误处理
2. 简单趋势图
3. 权限引导与隐私说明
4. 同步冲突、离线、拒绝 HealthKit 等场景测试

---

## 8. 隐私与审核注意事项

填写稿与对外页面见 `docs/app-store/`（不要打进 App Target）。

1. 只申请真正用到的 HealthKit 类型（见 §5.1）
2. 上架需提供 **隐私政策 URL**，说明健康数据用途、存储（本机 + 用户 iCloud）、不用于广告、不卖给第三方。正文：`docs/privacy-policy.html`（与 `bodycheck/PrivacyPolicy.md`、设置里的「隐私政策」一致）。公开地址：`https://app.aigcwe.com/privacy/privacy-policy.html`
3. 填写 App Privacy 营养标签：披露健康、健身、照片、其他用户内容；仅 App 功能；关联用户；不追踪。逐步选项见 `docs/app-store/app-store-connect.md` §4
4. 小组件避免展示过于敏感的信息（MVP 仅体重与当日热量差可接受）
5. App Store 分类建议：**Health & Fitness**
6. 审核备注、商店文案、年龄分级、截图清单见同一填写稿。无账号，不要编测试号
7. 支持页：`https://app.aigcwe.com/privacy/support.html`

---

## 9. 后续可扩展方向（非 MVP）

- Apple Watch 快速记录
- 体重趋势图表增强
- 自定义食物库
- 目标体重与提醒
- Live Activity（记录运动时）
- 更丰富的营养素记录
- 读取活动能量 / 步数（届时再申请对应 HealthKit 类型）
---

## 10. 配置清单与命名

### Xcode Capabilities

- [x] iCloud → CloudKit（主 App，容器 `iCloud.yinke.bodycheck`）
- [x] App Groups（主 App + Widget，**相同** Group ID `group.yinke.bodycheck`）
- [x] HealthKit（**仅** iOS 主 App Target；当前只读 workout）

### 命名（发布前替换 `yourcompany`）

```
显示名:                 BodyTrack
主 App Bundle ID:       yinke.bodycheck
Widget Bundle ID:       yinke.bodycheck.widget
App Group:              group.yinke.bodycheck
CloudKit Container:     iCloud.yinke.bodycheck
URL Scheme:             bodytrack
Widget kind:            WeightWidget
```

> Xcode 工程名仍为 `bodycheck`，显示名与代号为 BodyTrack。不要擅自改 Bundle，以免证书与 Capability 失效。

### 开发环境

- macOS 15+（推荐最新）
- **Xcode 16 或更新版本**（以本机 App Store / 开发者账号支持的版本为准）
- 已登录的 Apple Developer 账号（真机调试 HealthKit、CloudKit、真机 Widget 需要）

---

## 11. 验收标准（MVP）

| 编号 | 场景 | 期望 |
|------|------|------|
| A1 | iPhone 手动增删改体重 | 列表正确；有网络时同步到 Mac |
| A2 | Mac 增删改体重 | 仅业务库变更；同步到 iPhone；不要求写入 Health |
| A3 | iOS 授权后写体重 | 「健康」App 可见对应体重样本 |
| A4 | 在「健康」中新增体重 | App 内出现对应记录且不因重复导入产生多条（同 UUID） |
| A5 | 拒绝 HealthKit 权限 | 仍可手动记体重/食物；有引导文案 |
| A6 | 无 iCloud / 飞行模式 | 本地可读写；恢复后最终一致 |
| A7 | 小组件展示 | 显示最新体重与今日热量差（主 App 写过数据后） |
| A8 | 小组件点「记录体重」 | 打开主 App 快速记录页并可保存 |
| A9 | 今日摄入 | 仅统计当日 `FoodEntry` 热量之和（本地时区） |
| A10 | 单位切换 kg/lb | 主 App 与 Widget 展示一致；存储仍为 kg |

---

## 12. 待确认事项（发布前必须敲定）

| 事项 | 建议默认值 | 状态 |
|------|------------|------|
| 体重单位默认 | kg | 已定 |
| 食物是否写回 HealthKit | **否** | 已定 |
| 小组件是否直接输入数字 | 否（跳转 App） | 已定 |
| 最低系统版本 | iOS 18.0；仅 iPhone（iPad 随 iOS 运行，不上 Mac / visionOS） | 已定 |
| 今日热量是否含运动 | 否（摄入与消耗分开展示） | 已定 |
| Bundle ID / 显示名 / CloudKit 容器 | `yinke.bodycheck` / BodyTrack / `iCloud.yinke.bodycheck` | 已定 |
| App Group | `group.yinke.bodycheck` | 已定 |
| 是否上架多区 / 仅中文 | 先中文 | 待定 |
| 隐私政策 URL | `https://app.aigcwe.com/privacy/privacy-policy.html` | 已上线 |

---

**文档结束**

路径：`docs/BodyTrack_开发文档.md`（勿放入 App Target 源码目录，避免打进安装包）。  
迭代时请更新文首版本号与变更表。
