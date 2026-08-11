# 人体体征追踪 App 开发文档

**版本**：v1.1  
**日期**：2026-08-11  
**项目代号**：BodyTrack  
**工程名（当前）**：bodycheck（Xcode 工程可后续重命名）

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-08-11 | 初稿 |
| v1.1 | 2026-08-11 | 修正 CloudKit/HealthKit 模型与权限；补冲突策略、Deep Link、验收标准；文档迁至 `docs/` |

---

## 1. 项目概述

### 1.1 产品定位

一款跨 iPhone 与 Mac 的人体体征记录工具，核心能力包括：

- 从 Apple 健康读取体重数据（仅 iOS）
- 手动记录体重、简单食物热量、运动
- iPhone 桌面小组件支持快速记录体重
- 数据通过 iCloud 在 iPhone 与 Mac 之间同步

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
| 体重条数 | **允许多条/日**（列表全保留；「最新体重」取时间最新一条） |
| 今日热量公式 | **今日摄入合计**（`FoodEntry.calories` 之和）；运动消耗单独展示，MVP 不做净热量 |
| 运动消耗为空 | `caloriesBurned == nil` 时不计入任何热量合计，仅展示时长 |
| 「今日」边界 | 使用设备 **当前时区** 的 `Calendar.current` 日界（00:00–24:00） |
| 食物写回 HealthKit | **是**（仅能量值 `dietaryEnergyConsumed`；见 §5.1 已知限制） |
| 小组件输入 | **否**直接输数字；跳转主 App 快速记录页 |
| 界面语言 | 先中文；文案预留本地化键名 |
| 最低系统 | iOS 18+ / macOS 15+ |

---

## 2. 技术架构

### 2.1 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 语言 | Swift 6 | 注意严格并发（`Sendable` 等） |
| UI | SwiftUI | iOS + macOS 共享 |
| 数据持久化 | SwiftData | 本地业务数据 |
| 跨设备同步 | CloudKit（SwiftData） | iPhone ↔ Mac |
| 健康数据 | HealthKit | **仅 iOS Target** |
| 小组件 | WidgetKit + App Intents | **仅 iOS** |
| 本机共享 | App Groups | App ↔ Widget 摘要 |
| 最低系统 | iOS 18+ / macOS 15+ | 可按用户群下调 |

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
│       ├─(iOS)→ 写回 HealthKit（体重 / 饮食能量，按策略）      │
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
| 食物删除（iOS） | 删 SwiftData；若有关联 `healthKitUUID` 则尝试删对应 `dietaryEnergyConsumed` 样本 |
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
    /// 写回 HealthKit 后的样本 UUID（可选）
    var healthKitUUID: UUID?
    var note: String?
    var createdAt: Date
    var updatedAt: Date

    init(
        name: String,
        calories: Double,
        date: Date = Date(),
        healthKitUUID: UUID? = nil,
        note: String? = nil
    ) {
        self.id = UUID()
        self.date = date
        self.name = name
        self.calories = calories
        self.healthKitUUID = healthKitUUID
        self.note = note
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
```

**说明**：

- 使用 `createdAt` / `updatedAt` 便于排查同步与展示「最近修改」
- 体重统一 **kg** 存储；界面按用户偏好转换
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

**写入**：

- `HKQuantityTypeIdentifier.bodyMass`
- `HKQuantityTypeIdentifier.dietaryEnergyConsumed`（食物写回）

> 后续扩展再申请：`activeEnergyBurned`、`stepCount` 等。  
> 与审核原则一致：**只申请真正用到的类型**。

#### Info.plist

```xml
<key>NSHealthShareUsageDescription</key>
<string>需要读取您的体重数据，以便展示体征变化趋势并与 App 记录保持一致。</string>
<key>NSHealthUpdateUsageDescription</key>
<string>需要将您手动记录的体重和食物热量写入「健康」App，保持数据一致。</string>
```

#### 关键逻辑

- **不要**在冷启动第一帧强制弹授权；在首次进入体重页 / 用户点击「同步健康」时请求
- 使用 `HKObserverQuery` + `enableBackgroundDelivery` 监听体重变化，再拉取并 **按 `healthKitUUID` upsert**
- 手动记录体重：SwiftData + HealthKit 双写，保存 sample UUID
- 后台投递：按需开启 HealthKit Background Delivery；失败时降级为前台/下次启动同步
- 权限拒绝：本地功能全开，设置页展示状态与跳转系统设置入口

#### 食物写回 HealthKit 的已知限制（MVP 接受）

- 仅写入能量数值（`dietaryEnergyConsumed`），健康 App 中可能缺少完整「餐食」上下文
- 可用 `HKMetadata` 附带食物名称（若 API 允许）便于排查
- 删除本 App 创建的食物记录时，尽量删除对应 HK 样本；非本 App 写入的样本不删

### 5.2 小组件（快速记录体重）

**交互流程**：

1. 用户点击小组件「记录体重」
2. 触发 `AppIntent`
3. Intent 打开主 App，并带上 Deep Link（见 §5.5）
4. 主 App 打开「快速记录体重」→ 用户输入 → SwiftData + HealthKit → 更新 App Group → `WidgetCenter` 刷新

**展示内容**：

- 最新体重（按用户单位）
- 与上一条的差值（↑ / ↓）
- 今日已摄入热量（简单版）
- 「记录体重」按钮

### 5.3 跨设备同步

```swift
let modelConfiguration = ModelConfiguration(
    "BodyTrack",
    cloudKitDatabase: .automatic
)

let container = try ModelContainer(
    for: WeightEntry.self, FoodEntry.self, ExerciseEntry.self,
    configurations: modelConfiguration
)
```

**注意**：

- CloudKit 容器在开发者后台创建，并与 Xcode Capability 一致
- 模型属性尽量可选或带默认值，避免同步失败
- **不要**使用 `@Attribute(.unique)`
- 开发/生产 Schema 需在 CloudKit 控制台部署
- 无 iCloud 账号时 App 仍可单机使用
- Widget **不**直接操作完整 CloudKit 同步

### 5.4 App Group 共享

```swift
enum AppGroup {
    static let suiteName = "group.com.yourcompany.bodytrack" // 发布前替换

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

1. **今日概览**
   - 最新体重 + 与上条差值
   - 今日摄入热量
   - 今日运动（时长；有消耗则展示消耗，P1）
   - 快捷入口：记录体重 / 记录食物

2. **体重**
   - 列表 + 简单趋势图（趋势可放打磨阶段）
   - 新增 / 编辑 / 删除

3. **饮食**
   - 按**本地日历日**分组的食物列表
   - 快速添加（名称 + 热量）

4. **运动**（P1）
   - 简单记录列表

5. **设置**
   - HealthKit 授权状态与引导（仅 iOS）
   - 单位切换（kg / lb）
   - 数据与隐私说明入口

### 6.2 Mac 主要页面

- 与 iPhone 功能基本对齐
- 更强调列表管理与批量编辑
- **不**显示 HealthKit 权限入口

### 6.3 小组件尺寸

- `systemSmall`：最新体重 + 记录按钮
- `systemMedium`：体重 + 今日摄入 + 记录按钮

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

1. `FoodEntry` + 可选写回 `dietaryEnergyConsumed`
2. `ExerciseEntry`（P1）
3. 今日摄入汇总与概览展示

### 第四阶段（打磨）

1. 单位切换、空状态、错误处理
2. 简单趋势图
3. 权限引导与隐私说明
4. 同步冲突、离线、拒绝 HealthKit 等场景测试

---

## 8. 隐私与审核注意事项

1. 只申请真正用到的 HealthKit 类型（见 §5.1）
2. 上架需提供 **隐私政策 URL**，说明健康数据用途、存储（本机 + 用户 iCloud）、不用于广告、不卖给第三方
3. 填写 App Privacy 营养标签（Health & Fitness 相关数据）
4. 小组件避免展示过于敏感的信息（MVP 仅体重与当日摄入合计可接受）
5. App Store 分类建议：**Health & Fitness**
6. 审核备注建议写明：如何授权健康、如何从小组件记体重、测试账号（若有）

---

## 9. 后续可扩展方向（非 MVP）

- Apple Watch 快速记录
- 体重趋势图表增强
- 自定义食物库
- 目标体重与提醒
- Live Activity（记录运动时）
- 更丰富的营养素记录
- 读取活动能量 / 步数（届时再申请对应 HealthKit 类型）
- 净热量（摄入 − 消耗）展示

---

## 10. 配置清单与命名

### Xcode Capabilities

- [ ] iCloud → CloudKit（主 App）
- [ ] App Groups（主 App + Widget，**相同** Group ID）
- [ ] HealthKit（**仅** iOS 主 App Target）

### 命名（发布前替换 `yourcompany`）

```
显示名:                 待定（如「体征追踪」/ BodyTrack）
主 App Bundle ID:       com.yourcompany.bodytrack
Widget Bundle ID:       com.yourcompany.bodytrack.widget
App Group:              group.com.yourcompany.bodytrack
CloudKit Container:     iCloud.com.yourcompany.bodytrack
URL Scheme:             bodytrack
Widget kind:            WeightWidget
```

> 当前 Xcode 工程名为 `bodycheck`，与代号 BodyTrack 不一致。确定 Bundle 后，在 Xcode 中统一改名，避免证书与 Capability 反复配置。

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
| A7 | 小组件展示 | 显示最新体重与今日摄入（主 App 写过数据后） |
| A8 | 小组件点「记录体重」 | 打开主 App 快速记录页并可保存 |
| A9 | 今日摄入 | 仅统计当日 `FoodEntry` 热量之和（本地时区） |
| A10 | 单位切换 kg/lb | 主 App 与 Widget 展示一致；存储仍为 kg |

---

## 12. 待确认事项（发布前必须敲定）

| 事项 | 建议默认值 | 状态 |
|------|------------|------|
| 体重单位默认 | kg | 已定 |
| 食物是否写回 HealthKit | 是 | 已定 |
| 小组件是否直接输入数字 | 否（跳转 App） | 已定 |
| 最低系统版本 | iOS 18 / macOS 15 | 已定 |
| 今日热量是否含运动 | 否（摄入与消耗分开展示） | 已定 |
| Bundle ID / App Group / 显示名 | 需自行确定 | **待定** |
| 是否上架多区 / 仅中文 | 先中文 | 待定 |
| 隐私政策 URL | 上架前准备 | **待定** |

---

**文档结束**

路径：`docs/BodyTrack_开发文档.md`（勿放入 App Target 源码目录，避免打进安装包）。  
迭代时请更新文首版本号与变更表。
