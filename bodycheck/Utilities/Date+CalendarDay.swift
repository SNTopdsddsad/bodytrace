//
//  Date+CalendarDay.swift
//  bodycheck
//

import Foundation
import SwiftUI

enum AppLocale {
    static let chinese = Locale(identifier: "zh-Hans")

    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = chinese
        calendar.timeZone = .current
        return calendar
    }

    static var day: Date.FormatStyle {
        .dateTime.year().month().day().locale(chinese)
    }

    static var dayWeekday: Date.FormatStyle {
        .dateTime.year().month().day().weekday(.wide).locale(chinese)
    }

    static var monthDay: Date.FormatStyle {
        .dateTime.month().day().locale(chinese)
    }

    static var monthDayWeekday: Date.FormatStyle {
        .dateTime.month().day().weekday(.abbreviated).locale(chinese)
    }

    static var time: Date.FormatStyle {
        .dateTime.hour().minute().locale(chinese)
    }

    static var dateTime: Date.FormatStyle {
        .dateTime.year().month().day().hour().minute().locale(chinese)
    }

    static var monthDayTime: Date.FormatStyle {
        .dateTime.month().day().hour().minute().locale(chinese)
    }

    static var clockTime: Date.FormatStyle {
        Date.FormatStyle(date: .omitted, time: .shortened).locale(chinese)
    }
}

extension View {
    /// Dates, calendars, and DatePicker stay Chinese even if the system language is English.
    func appChineseLocale() -> some View {
        environment(\.locale, AppLocale.chinese)
            .environment(\.calendar, AppLocale.calendar)
    }
}

extension Date {
    /// Start of the calendar day in the current time zone.
    var startOfDay: Date {
        Calendar.current.startOfDay(for: self)
    }

    /// Whether this date falls on the same local calendar day as `other`.
    func isSameDay(as other: Date) -> Bool {
        Calendar.current.isDate(self, inSameDayAs: other)
    }
}

extension Calendar {
    /// Inclusive start and exclusive end of the local calendar day for `date`.
    func dayInterval(for date: Date) -> (start: Date, end: Date) {
        let start = startOfDay(for: date)
        let end = self.date(byAdding: .day, value: 1, to: start) ?? start.addingTimeInterval(86_400)
        return (start, end)
    }
}
