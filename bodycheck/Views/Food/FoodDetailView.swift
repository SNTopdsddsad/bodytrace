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
            VStack(alignment: .leading, spacing: AppTheme.space20) {
                if let data = entry.photoData, let image = FoodPhotoCodec.image(from: data) {
                    image
                        .resizable()
                        .scaledToFill()
                        .frame(maxWidth: .infinity)
                        .frame(height: 240)
                        .clipped()
                        .clipShape(RoundedRectangle(cornerRadius: AppTheme.cardCornerRadius, style: .continuous))
                }

                VStack(alignment: .leading, spacing: AppTheme.stackDefault) {
                    Text(entry.name)
                        .font(AppFont.detailTitle)
                    MeasurementValue(
                        value: "\(Int(entry.calories.rounded()))",
                        unit: "千卡",
                        tint: AppTheme.intakeAmber,
                        size: .metric
                    )
                }

                VStack(spacing: 0) {
                    detailRow("时间", entry.date.formatted(AppLocale.dateTime))
                    Divider()
                    detailRow(
                        "备注",
                        (entry.note?.isEmpty == false) ? (entry.note ?? "—") : "—"
                    )
                }
                .padding(AppTheme.cardPadding)
                .frame(maxWidth: .infinity, alignment: .leading)
                .appSurface()
            }
            .padding(AppTheme.contentInset)
        }
        .pageBackground()
        .navigationTitle("饮食详情")
        .navigationBarTitleDisplayMode(.inline)
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
            .padding(.vertical, AppTheme.statusBarPadding)
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
        HStack(alignment: .top, spacing: AppTheme.space12) {
            Text(title)
                .font(AppFont.detailLabel)
                .foregroundStyle(.secondary)
                .frame(width: 36, alignment: .leading)
            Text(value)
                .font(AppFont.detailValue)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, AppTheme.space8)
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
