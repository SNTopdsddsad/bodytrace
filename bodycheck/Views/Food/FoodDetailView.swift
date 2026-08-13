//
//  FoodDetailView.swift
//  bodycheck
//

import SwiftData
import SwiftUI

struct FoodDetailView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    let entry: FoodEntry

    @State private var editorMode: FoodEditorMode?
    @State private var showDeleteConfirm = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let data = entry.photoData, let image = FoodPhotoCodec.image(from: data) {
                    image
                        .resizable()
                        .scaledToFill()
                        .frame(maxWidth: .infinity)
                        .frame(height: 240)
                        .clipped()
                        .clipShape(RoundedRectangle(cornerRadius: AppTheme.cardCornerRadius, style: .continuous))
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text(entry.name)
                        .font(.title2.weight(.semibold))
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text("\(Int(entry.calories.rounded()))")
                            .font(.system(size: 34, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(AppTheme.intakeAmber)
                        Text("千卡")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.secondary)
                    }
                }

                VStack(spacing: 0) {
                    detailRow("时间", entry.date.formatted(AppLocale.dateTime))
                    Divider()
                    detailRow(
                        "备注",
                        (entry.note?.isEmpty == false) ? (entry.note ?? "—") : "—"
                    )
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .appSurface()
            }
            .padding(AppTheme.contentInset)
        }
        .pageBackground()
        .navigationTitle("饮食详情")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("编辑") {
                    editorMode = .edit(entry)
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button(role: .destructive) {
                showDeleteConfirm = true
            } label: {
                Text("删除这条记录")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .padding(.horizontal, AppTheme.contentInset)
            .padding(.vertical, 12)
            .background(.bar)
        }
        .sheet(item: $editorMode) { mode in
            FoodEditorSheet(mode: mode)
        }
        .alert("删除这条饮食记录？", isPresented: $showDeleteConfirm) {
            Button("取消", role: .cancel) {}
            Button("删除", role: .destructive) { deleteEntry() }
        } message: {
            Text("删除后无法恢复。")
        }
    }

    private func detailRow(_ title: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(title)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .frame(width: 36, alignment: .leading)
            Text(value)
                .font(.system(size: 15))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 10)
    }

    private func deleteEntry() {
        modelContext.delete(entry)
        try? modelContext.save()
        dismiss()
    }
}

#Preview {
    NavigationStack {
        FoodDetailView(
            entry: FoodEntry(name: "燕麦", calories: 320, date: .now)
        )
    }
    .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self], inMemory: true)
}
