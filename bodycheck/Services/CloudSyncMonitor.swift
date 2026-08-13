//
//  CloudSyncMonitor.swift
//  bodycheck
//
//  SwiftData CloudKit setup plus account status for Settings / sidebar.
//

import CloudKit
import CoreData
import Observation
import SwiftData

enum CloudKitConfig {
    static let containerIdentifier = "iCloud.yinke.bodycheck"
    /// Fresh CloudKit-backed store. Do not reuse the pre-CloudKit "BodyTrack" file.
    static let cloudStoreName = "BodyTrackCloud"
    static let legacyStoreName = "BodyTrack"
    static let migrationVersionKey = "legacyBodyTrackMigrationVersion"
    static let currentMigrationVersion = 2
    static let didResetWedgedCloudStoreKey = "didResetWedgedCloudStoreAfterSchemaBootstrap"

    static var schema: Schema {
        Schema([WeightEntry.self, FoodEntry.self, ExerciseEntry.self])
    }

    static var cloudConfiguration: ModelConfiguration {
        ModelConfiguration(
            cloudStoreName,
            schema: schema,
            isStoredInMemoryOnly: false,
            cloudKitDatabase: .private(containerIdentifier)
        )
    }
}

@Observable
final class CloudSyncMonitor {
    enum Kind: Equatable {
        case cloudEnabled
        case localFallback
    }

    enum Account: Equatable {
        case checking
        case available
        case noAccount
        case restricted
        case temporarilyUnavailable
        case couldNotDetermine
    }

    enum Phase: Equatable {
        case idle
        case settingUp
        case importing
        case exporting
        case failed
    }

    private(set) var kind: Kind
    private(set) var account: Account
    private(set) var phase: Phase
    private(set) var lastSuccessAt: Date?
    private(set) var lastError: String?
    private(set) var cloudUserRecordName: String?
    private(set) var setupSucceeded: Bool
    @ObservationIgnored
    private var eventToken: NSObjectProtocol?

    init(kind: Kind, setupError: String? = nil) {
        self.kind = kind
        self.account = .checking
        self.phase = .idle
        self.lastSuccessAt = nil
        self.lastError = setupError
        self.cloudUserRecordName = nil
        self.setupSucceeded = false
    }

    var title: String {
        switch (kind, account) {
        case (.localFallback, _):
            return "iCloud 仅本地"
        case (_, .checking):
            return "iCloud 检查中"
        case (_, .available):
            return "iCloud 已开启"
        case (_, .noAccount):
            return "未登录 iCloud"
        case (_, .restricted):
            return "iCloud 受限制"
        case (_, .temporarilyUnavailable):
            return "iCloud 暂时不可用"
        case (_, .couldNotDetermine):
            return "iCloud 状态未知"
        }
    }

    var subtitle: String {
        switch (kind, account) {
        case (.localFallback, _):
            return "记录保存在本机"
        case (_, .checking):
            return "正在检查账号"
        case (_, .available):
            return phaseSubtitle
        default:
            return "本地仍可记录"
        }
    }

    var settingsValue: String {
        switch (kind, account) {
        case (.localFallback, _):
            return "仅本地"
        case (_, .checking):
            return "检查中"
        case (_, .available) where phase == .failed:
            return "出错"
        case (_, .available) where setupSucceeded:
            return "已连接"
        case (_, .available):
            return "已登录，等待首次同步"
        case (_, .noAccount):
            return "未登录"
        case (_, .restricted):
            return "受限制"
        case (_, .temporarilyUnavailable):
            return "暂时不可用"
        case (_, .couldNotDetermine):
            return "无法确定"
        }
    }

    var lastSyncText: String {
        switch phase {
        case .settingUp:
            return "正在连接"
        case .importing:
            return "正在下载"
        case .exporting:
            return "正在上传"
        case .failed:
            return lastError ?? "同步失败"
        case .idle:
            if let lastSuccessAt {
                return lastSuccessAt.formatted(AppLocale.clockTime)
            }
            if setupSucceeded {
                return "同步已就绪"
            }
            return "尚未完成首次同步"
        }
    }

    var settingsFooter: String {
        switch (kind, account) {
        case (.localFallback, _):
            return "当前仅使用本机存储，记录不会丢失。配置好 iCloud 后重启应用再试。数据不会出现在「文件 / iCloud 云盘」里。"
        case (_, .checking):
            return "正在检查 iCloud 状态…"
        case (_, .available):
            return "记录写入 iCloud 私人数据库（不会出现在「文件 / iCloud 云盘」）。开发阶段请到 CloudKit 控制台查看记录类型。"
        case (_, .noAccount):
            return "请在系统设置中登录 iCloud。未登录时记录只保存在本机。"
        case (_, .restricted):
            return "iCloud 受限制，记录只保存在本机。"
        case (_, .temporarilyUnavailable):
            return "iCloud 暂时不可用，记录仍保存在本机。"
        case (_, .couldNotDetermine):
            return "无法确认 iCloud 状态，记录仍保存在本机。"
        }
    }

    var systemImage: String {
        switch (kind, account, phase) {
        case (_, .available, .exporting):
            return "icloud.and.arrow.up"
        case (_, .available, .importing):
            return "icloud.and.arrow.down"
        case (_, .available, .failed):
            return "exclamationmark.icloud"
        case (_, .available, _), (_, .checking, _):
            return "icloud"
        default:
            return "icloud.slash"
        }
    }

    private var phaseSubtitle: String {
        switch phase {
        case .settingUp:
            return "正在连接 iCloud"
        case .importing:
            return "正在下载"
        case .exporting:
            return "正在上传"
        case .failed:
            return "同步出错"
        case .idle:
            if lastSuccessAt != nil { return "自动同步已打开" }
            if setupSucceeded { return "等待首次上传" }
            return "等待首次同步"
        }
    }

    func beginObservingEvents() {
        guard eventToken == nil else { return }
        eventToken = NotificationCenter.default.addObserver(
            forName: NSPersistentCloudKitContainer.eventChangedNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            self?.handleCloudKitEvent(notification)
        }
    }

    func markLocalFallback(_ error: Error) {
        kind = .localFallback
        recordError(error)
    }

    func recordError(_ error: Error) {
        lastError = Self.describe(error)
        phase = .failed
    }

    func recordErrorMessage(_ message: String) {
        lastError = message
        phase = .failed
    }

    func start() async {
        beginObservingEvents()
        await refresh()
        for await _ in NotificationCenter.default.notifications(named: .CKAccountChanged) {
            await refresh()
        }
    }

    func refresh() async {
        do {
            let container = CKContainer(identifier: CloudKitConfig.containerIdentifier)
            let status = try await container.accountStatus()
            account = Account(status)
            guard status == .available else {
                cloudUserRecordName = nil
                return
            }
            do {
                let userID = try await container.userRecordID()
                cloudUserRecordName = userID.recordName
            } catch {
                cloudUserRecordName = nil
                lastError = "云端容器连不上：\(Self.describe(error))"
            }
        } catch {
            account = .couldNotDetermine
            cloudUserRecordName = nil
            if lastError == nil {
                lastError = Self.describe(error)
            }
        }
    }

    private func handleCloudKitEvent(_ notification: Notification) {
        guard let event = notification.userInfo?[
            NSPersistentCloudKitContainer.eventNotificationUserInfoKey
        ] as? NSPersistentCloudKitContainer.Event else {
            return
        }

        let inProgress = event.endDate == nil
        if inProgress {
            switch event.type {
            case .setup:
                phase = .settingUp
            case .import:
                phase = .importing
            case .export:
                phase = .exporting
            @unknown default:
                break
            }
            return
        }

        if event.succeeded {
            if event.type == .setup {
                setupSucceeded = true
            }
            lastSuccessAt = event.endDate ?? Date()
            lastError = nil
            phase = .idle
        } else {
            phase = .failed
            let prefix = "\(Self.eventName(event.type))失败"
            if let error = event.error {
                lastError = "\(prefix)：\(Self.describe(error))"
            } else {
                lastError = prefix
            }
        }
    }

    static func describe(_ error: Error) -> String {
        let ns = error as NSError
        var text = "\(ns.domain)(\(ns.code)): \(ns.localizedDescription)"
        if !ns.userInfo.isEmpty {
            text += " | \(ns.userInfo)"
        }
        return text
    }

    private static func eventName(_ type: NSPersistentCloudKitContainer.EventType) -> String {
        switch type {
        case .setup: return "初始化"
        case .import: return "下载"
        case .export: return "上传"
        @unknown default: return "同步"
        }
    }
}

extension CloudSyncMonitor.Account {
    init(_ status: CKAccountStatus) {
        switch status {
        case .available:
            self = .available
        case .noAccount:
            self = .noAccount
        case .restricted:
            self = .restricted
        case .temporarilyUnavailable:
            self = .temporarilyUnavailable
        case .couldNotDetermine:
            self = .couldNotDetermine
        @unknown default:
            self = .couldNotDetermine
        }
    }
}

enum PersistenceController {
    static func load() -> (container: ModelContainer, cloudSync: CloudSyncMonitor) {
        #if DEBUG
        UserDefaults.standard.set(1, forKey: "com.apple.CoreData.CloudKitDebug")
        UserDefaults.standard.set(1, forKey: "com.apple.CoreData.Logging.stderr")
        #endif

        resetWedgedCloudStoreIfNeeded()

        let monitor = CloudSyncMonitor(kind: .cloudEnabled)
        monitor.beginObservingEvents()

        let schema = CloudKitConfig.schema
        do {
            let container = try ModelContainer(for: schema, configurations: [CloudKitConfig.cloudConfiguration])
            if let migrateError = migrateLegacyIfNeeded(into: container) {
                monitor.recordError(migrateError)
            }
            return (container, monitor)
        } catch {
            do {
                let local = ModelConfiguration(
                    CloudKitConfig.cloudStoreName,
                    schema: schema,
                    isStoredInMemoryOnly: false,
                    cloudKitDatabase: .none
                )
                let container = try ModelContainer(for: schema, configurations: [local])
                monitor.markLocalFallback(error)
                if let migrateError = migrateLegacyIfNeeded(into: container) {
                    monitor.recordError(migrateError)
                }
                return (container, monitor)
            } catch {
                fatalError("Failed to create ModelContainer: \(error)")
            }
        }
    }

    /// The previous DEBUG schema bootstrap left CloudKit holding BodyTrackCloud open.
    private static func resetWedgedCloudStoreIfNeeded() {
        let defaults = UserDefaults.standard
        guard defaults.bool(forKey: CloudKitConfig.didResetWedgedCloudStoreKey) == false else { return }

        let url = CloudKitConfig.cloudConfiguration.url
        let directory = url.deletingLastPathComponent()
        let prefix = url.deletingPathExtension().lastPathComponent
        let fm = FileManager.default
        if let items = try? fm.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) {
            for item in items where item.lastPathComponent.hasPrefix(prefix) {
                try? fm.removeItem(at: item)
            }
        }
        defaults.set(true, forKey: CloudKitConfig.didResetWedgedCloudStoreKey)
    }

    /// Copy missing rows from the pre-CloudKit "BodyTrack" store. Idempotent by `id`.
    private static func migrateLegacyIfNeeded(into cloudContainer: ModelContainer) -> Error? {
        let defaults = UserDefaults.standard
        let finishedVersion = defaults.integer(forKey: CloudKitConfig.migrationVersionKey)
        if finishedVersion >= CloudKitConfig.currentMigrationVersion {
            return nil
        }

        do {
            let cloudContext = ModelContext(cloudContainer)
            let legacy = ModelConfiguration(
                CloudKitConfig.legacyStoreName,
                schema: CloudKitConfig.schema,
                isStoredInMemoryOnly: false,
                cloudKitDatabase: .none
            )
            let legacyContainer = try ModelContainer(for: CloudKitConfig.schema, configurations: [legacy])
            let legacyContext = ModelContext(legacyContainer)

            let weights = try legacyContext.fetch(FetchDescriptor<WeightEntry>())
            let foods = try legacyContext.fetch(FetchDescriptor<FoodEntry>())
            let exercises = try legacyContext.fetch(FetchDescriptor<ExerciseEntry>())

            let existingWeightIDs = Set((try cloudContext.fetch(FetchDescriptor<WeightEntry>())).map(\.id))
            let existingFoodIDs = Set((try cloudContext.fetch(FetchDescriptor<FoodEntry>())).map(\.id))
            let existingExerciseIDs = Set((try cloudContext.fetch(FetchDescriptor<ExerciseEntry>())).map(\.id))

            for entry in weights where !existingWeightIDs.contains(entry.id) {
                let copy = WeightEntry(
                    weight: entry.weight,
                    date: entry.date,
                    source: entry.weightSource,
                    healthKitUUID: entry.healthKitUUID,
                    note: entry.note
                )
                copy.id = entry.id
                copy.createdAt = entry.createdAt
                copy.updatedAt = entry.updatedAt
                cloudContext.insert(copy)
            }
            for entry in foods where !existingFoodIDs.contains(entry.id) {
                let copy = FoodEntry(
                    name: entry.name,
                    calories: entry.calories,
                    date: entry.date,
                    healthKitUUID: entry.healthKitUUID,
                    note: entry.note
                )
                copy.id = entry.id
                copy.createdAt = entry.createdAt
                copy.updatedAt = entry.updatedAt
                cloudContext.insert(copy)
            }
            for entry in exercises where !existingExerciseIDs.contains(entry.id) {
                let copy = ExerciseEntry(
                    name: entry.name,
                    durationMinutes: entry.durationMinutes,
                    caloriesBurned: entry.caloriesBurned,
                    date: entry.date,
                    note: entry.note,
                    source: entry.exerciseSource,
                    healthKitUUID: entry.healthKitUUID
                )
                copy.id = entry.id
                copy.createdAt = entry.createdAt
                copy.updatedAt = entry.updatedAt
                cloudContext.insert(copy)
            }

            try cloudContext.save()
            defaults.set(CloudKitConfig.currentMigrationVersion, forKey: CloudKitConfig.migrationVersionKey)
            defaults.removeObject(forKey: "didMigrateLegacyBodyTrackStore")
            return nil
        } catch {
            return error
        }
    }
}
