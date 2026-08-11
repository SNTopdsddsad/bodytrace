//
//  Date+CalendarDay.swift
//  bodycheck
//

import Foundation

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
