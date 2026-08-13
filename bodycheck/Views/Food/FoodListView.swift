//
//  FoodListView.swift
//  bodycheck
//

import SwiftData
import SwiftUI

#if os(iOS)
import PhotosUI
import UIKit
#endif

enum FoodEditorMode: Identifiable {
    case create
    case edit(FoodEntry)

    var id: String {
        switch self {
        case .create: "create"
        case .edit(let entry): entry.id.uuidString
        }
    }

    var title: String {
        switch self {
        case .create: "添加食物"
        case .edit: "编辑食物"
        }
    }
}

struct FoodListView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \FoodEntry.date, order: .reverse) private var foods: [FoodEntry]

    @State private var editorMode: FoodEditorMode?
    @State private var searchText = ""

    private var todayFoods: [FoodEntry] {
        let day = Calendar.current.dayInterval(for: Date())
        return foods.filter { $0.date >= day.start && $0.date < day.end }
    }

    private var todayCalories: Double {
        todayFoods.reduce(0) { $0 + $1.calories }
    }

    private var filteredFoods: [FoodEntry] {
        guard !searchText.isEmpty else { return foods }
        let q = searchText.lowercased()
        return foods.filter {
            $0.name.lowercased().contains(q) || ($0.note ?? "").lowercased().contains(q)
        }
    }

    private var groupedByDay: [(day: Date, items: [FoodEntry], total: Double)] {
        let cal = Calendar.current
        let groups = Dictionary(grouping: filteredFoods) { cal.startOfDay(for: $0.date) }
        return groups.keys.sorted(by: >).map { day in
            let items = (groups[day] ?? []).sorted { $0.date > $1.date }
            let total = items.reduce(0) { $0 + $1.calories }
            return (day, items, total)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if foods.isEmpty {
                    ContentUnavailableView {
                        Label("还没有饮食记录", systemImage: "fork.knife")
                    } description: {
                        Text("快速添加名称和热量即可。")
                    } actions: {
                        Button("添加食物") { editorMode = .create }
                            .buttonStyle(.borderedProminent)
                            .tint(AppTheme.brandTeal)
                            .controlSize(.large)
                    }
                } else {
                    List {
                        Section {
                            HStack(spacing: AppTheme.space16) {
                                IconWell(systemName: "flame.fill", tint: AppTheme.intakeAmber)
                                VStack(alignment: .leading, spacing: AppTheme.stackTight) {
                                    Text("今日摄入")
                                        .font(AppFont.sectionSubtitle)
                                        .foregroundStyle(.secondary)
                                    MeasurementValue(
                                        value: todayFoods.isEmpty ? "—" : "\(Int(todayCalories.rounded()))",
                                        unit: todayFoods.isEmpty ? nil : "千卡",
                                        size: .metric,
                                        dimmed: todayFoods.isEmpty
                                    )
                                    Text(todayFoods.isEmpty ? "还没有饮食记录" : "\(todayFoods.count) 条记录")
                                        .font(AppFont.rowMeta)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(.vertical, AppTheme.rowVertical)
                        }

                        ForEach(groupedByDay, id: \.day) { group in
                            Section {
                                ForEach(group.items) { entry in
                                    NavigationLink {
                                        FoodDetailView(entry: entry)
                                    } label: {
                                        HStack(alignment: .center, spacing: AppTheme.space12) {
                                            FoodPhotoThumb(data: entry.photoData)
                                            VStack(alignment: .leading, spacing: AppTheme.stackTight) {
                                                Text(entry.name)
                                                    .font(AppFont.rowTitle)
                                                Text(entry.date, format: AppLocale.time)
                                                    .font(AppFont.rowMeta)
                                                    .foregroundStyle(.secondary)
                                            }
                                            Spacer(minLength: AppTheme.space8)
                                            Text("\(Int(entry.calories.rounded())) 千卡")
                                                .font(AppFont.rowValue)
                                                .foregroundStyle(AppTheme.intakeAmber)
                                        }
                                    }
                                    .padding(.vertical, AppTheme.rowVertical)
                                }
                                .onDelete { offsets in
                                    delete(items: group.items, at: offsets)
                                }
                            } header: {
                                Text(sectionTitle(day: group.day, total: group.total))
                                    .font(AppFont.listSectionHeader)
                                    .textCase(nil)
                            }
                        }
                    }
                    #if os(iOS)
                    .listStyle(.insetGrouped)
                    #endif
                }
            }
            .navigationTitle("饮食")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.large)
            #endif
            #if os(macOS)
            .navigationSubtitle(
                todayFoods.isEmpty
                    ? "今日尚未记录"
                    : "今日 \(Int(todayCalories.rounded())) 千卡 · \(todayFoods.count) 条"
            )
            #endif
            .searchable(text: $searchText, prompt: "搜索食物名称")
            .toolbar {
                #if os(iOS)
                ToolbarItem(placement: .topBarTrailing) {
                    IOSCircleAddButton(accessibilityLabel: "添加食物") {
                        editorMode = .create
                    }
                }
                IOSSettingsToolbar()
                #else
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        editorMode = .create
                    } label: {
                        Label("添加", systemImage: "plus")
                    }
                    .keyboardShortcut("n", modifiers: [.command])
                }
                #endif
            }
            .sheet(item: $editorMode) { mode in
                FoodEditorSheet(mode: mode)
            }
        }
    }

    private func sectionTitle(day: Date, total: Double) -> String {
        let datePart = day.formatted(AppLocale.monthDayWeekday)
        return "\(datePart) · \(Int(total.rounded())) 千卡"
    }

    private func delete(items: [FoodEntry], at offsets: IndexSet) {
        for index in offsets {
            modelContext.delete(items[index])
        }
        try? modelContext.save()
    }
}

struct FoodEditorSheet: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    let mode: FoodEditorMode

    @State private var nameText = ""
    @State private var caloriesText = ""
    @State private var date = Date()
    @State private var noteText = ""
    @State private var photoData: Data?
    @State private var validationMessage: String?
    #if os(iOS)
    @State private var pickerItem: PhotosPickerItem?
    @State private var cameraImage: UIImage?
    @State private var showCamera = false
    @State private var showPhotoSource = false
    @State private var showLibraryPicker = false
    #endif

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("名称", text: $nameText)
                    TextField("热量（千卡）", text: $caloriesText)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                    DatePicker("时间", selection: $date, displayedComponents: [.date, .hourAndMinute])
                        .environment(\.locale, AppLocale.chinese)
                        .environment(\.calendar, AppLocale.calendar)
                }

                Section("备注（可选）") {
                    TextField("例如：早餐、外卖、少油", text: $noteText, axis: .vertical)
                        .lineLimit(2...4)
                }

                #if os(iOS)
                photoSection
                #endif

                if let validationMessage {
                    Section {
                        FormErrorText(message: validationMessage)
                    }
                }
            }
            .appFormStyle()
            .navigationTitle(mode.title)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                        .keyboardShortcut(.cancelAction)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") { saveFood() }
                        .fontWeight(.semibold)
                        .keyboardShortcut(.defaultAction)
                }
            }
            .onAppear { hydrate() }
            #if os(iOS)
            .confirmationDialog("选择照片来源", isPresented: $showPhotoSource, titleVisibility: .visible) {
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button("拍照") { showCamera = true }
                }
                Button("从相册选择") { showLibraryPicker = true }
                if photoData != nil {
                    Button("移除照片", role: .destructive) {
                        photoData = nil
                        pickerItem = nil
                        cameraImage = nil
                    }
                }
                Button("取消", role: .cancel) {}
            }
            .photosPicker(isPresented: $showLibraryPicker, selection: $pickerItem, matching: .images)
            .sheet(isPresented: $showCamera) {
                CameraPicker(image: $cameraImage)
                    .ignoresSafeArea()
            }
            .onChange(of: cameraImage) { _, image in
                guard let image, let data = FoodPhotoCodec.compressedJPEG(from: image) else { return }
                photoData = data
            }
            .onChange(of: pickerItem) { _, item in
                Task { await loadPickerItem(item) }
            }
            #endif
        }
        .appChineseLocale()
        #if os(macOS)
        .frame(minWidth: 420, idealWidth: 460, minHeight: 280, idealHeight: 320)
        #endif
    }

    #if os(iOS)
    private var photoSection: some View {
        Section {
            Button {
                showPhotoSource = true
            } label: {
                if let photoData, let image = FoodPhotoCodec.image(from: photoData) {
                    image
                        .resizable()
                        .scaledToFill()
                        .frame(maxWidth: .infinity)
                        .frame(height: 180)
                        .clipped()
                        .clipShape(RoundedRectangle(cornerRadius: AppTheme.iconWellRadius, style: .continuous))
                        .overlay(alignment: .bottomTrailing) {
                            Text("更换")
                                .font(AppFont.inlineAction)
                                .padding(.horizontal, AppTheme.chipHorizontal)
                                .padding(.vertical, AppTheme.chipVertical)
                                .background(.ultraThinMaterial, in: Capsule())
                                .padding(AppTheme.space8)
                        }
                } else {
                    HStack(spacing: AppTheme.space8) {
                        Image(systemName: "camera.fill")
                        Text("添加照片")
                        Spacer()
                        Text("拍照或相册")
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .buttonStyle(.plain)
            .foregroundStyle(.primary)
        } header: {
            Text("照片（可选）")
        } footer: {
            Text("点照片后选择拍照或从相册选取。照片只保存在 BodyTrack，不写入健康。")
        }
    }

    private func loadPickerItem(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        do {
            guard let raw = try await item.loadTransferable(type: Data.self),
                  let compressed = FoodPhotoCodec.compressedJPEG(from: raw) else {
                return
            }
            photoData = compressed
        } catch {
            validationMessage = "无法读取这张照片，请换一张再试"
        }
    }
    #endif

    private func hydrate() {
        switch mode {
        case .create:
            nameText = ""
            caloriesText = ""
            date = Date()
            noteText = ""
            photoData = nil
        case .edit(let entry):
            nameText = entry.name
            caloriesText = entry.calories == 0 ? "" : String(format: "%.0f", entry.calories)
            date = entry.date
            noteText = entry.note ?? ""
            photoData = entry.photoData
        }
    }

    private func saveFood() {
        let name = nameText.trimmingCharacters(in: .whitespacesAndNewlines)
        let calText = caloriesText
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ",", with: ".")

        guard !name.isEmpty else {
            validationMessage = "请输入食物名称"
            return
        }
        guard let calories = Double(calText), calories >= 0 else {
            validationMessage = "请输入有效的热量"
            return
        }

        let trimmedNote = noteText.trimmingCharacters(in: .whitespacesAndNewlines)
        let noteValue = trimmedNote.isEmpty ? nil : trimmedNote

        switch mode {
        case .create:
            modelContext.insert(
                FoodEntry(name: name, calories: calories, date: date, note: noteValue, photoData: photoData)
            )
        case .edit(let entry):
            entry.name = name
            entry.calories = calories
            entry.date = date
            entry.note = noteValue
            entry.photoData = photoData
            entry.updatedAt = Date()
        }

        do {
            try modelContext.save()
            dismiss()
        } catch {
            validationMessage = "保存失败，请重试"
        }
    }
}

#Preview {
    FoodListView()
        .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self], inMemory: true)
}
