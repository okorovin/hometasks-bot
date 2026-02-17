/**
 * Date utilities for timezone-aware operations, quiet hours, and interval math.
 * All times are stored as UTC in the database.
 * User timezone (default Europe/Moscow) is used for display and quiet-hours checks.
 */

export function getNowInTz(timezone: string): Date {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    })
    const parts = formatter.formatToParts(now)
    const get = (type: string) =>
        parts.find((p) => p.type === type)?.value ?? "0"
    return new Date(
        `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`,
    )
}

export function getHoursMinutes(timeStr: string): {
    hours: number
    minutes: number
} {
    const [hours, minutes] = timeStr.split(":").map(Number)
    return { hours: hours!, minutes: minutes! }
}

export function isQuietHours(
    timezone: string,
    quietFrom: string,
    quietTo: string,
): boolean {
    const now = getNowInTz(timezone)
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    const from = getHoursMinutes(quietFrom)
    const to = getHoursMinutes(quietTo)
    const fromMinutes = from.hours * 60 + from.minutes
    const toMinutes = to.hours * 60 + to.minutes

    if (fromMinutes > toMinutes) {
        // Overnight range (e.g., 22:00–09:00)
        return currentMinutes >= fromMinutes || currentMinutes < toMinutes
    }
    return currentMinutes >= fromMinutes && currentMinutes < toMinutes
}

export function isTimeInQuietHours(
    date: Date,
    timezone: string,
    quietFrom: string,
    quietTo: string,
): boolean {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    })
    const parts = formatter.formatToParts(date)
    const get = (type: string) =>
        parts.find((p) => p.type === type)?.value ?? "0"
    const currentMinutes = Number(get("hour")) * 60 + Number(get("minute"))

    const from = getHoursMinutes(quietFrom)
    const to = getHoursMinutes(quietTo)
    const fromMinutes = from.hours * 60 + from.minutes
    const toMinutes = to.hours * 60 + to.minutes

    if (fromMinutes > toMinutes) {
        return currentMinutes >= fromMinutes || currentMinutes < toMinutes
    }
    return currentMinutes >= fromMinutes && currentMinutes < toMinutes
}

/**
 * If the given date falls in quiet hours, adjust to quietTo + 5 minutes (e.g., 09:05).
 */
export function adjustForQuietHours(
    date: Date,
    timezone: string,
    quietFrom: string,
    quietTo: string,
): Date {
    if (!isTimeInQuietHours(date, timezone, quietFrom, quietTo)) {
        return date
    }

    const to = getHoursMinutes(quietTo)
    // Create a date at quietTo + 5 min in the user's timezone
    const adjusted = new Date(date)
    const tzDate = new Date(
        date.toLocaleString("en-US", { timeZone: timezone }),
    )
    const currentHour = tzDate.getHours()

    // If current hour is >= quietFrom hour, it means we're in the evening portion —
    // move to next day's quietTo
    const from = getHoursMinutes(quietFrom)
    if (currentHour >= from.hours) {
        adjusted.setDate(adjusted.getDate() + 1)
    }

    // Set to quietTo + 5 minutes in the user's timezone
    const targetLocal = new Date(
        adjusted.toLocaleString("en-US", { timeZone: timezone }),
    )
    const diff =
        (to.hours - targetLocal.getHours()) * 60 +
        (to.minutes + 5 - targetLocal.getMinutes())
    adjusted.setMinutes(adjusted.getMinutes() + diff)
    adjusted.setSeconds(0, 0)

    return adjusted
}

export function startOfDayInTz(timezone: string, date?: Date): Date {
    const d = date ?? new Date()
    const tzStr = d.toLocaleString("en-US", { timeZone: timezone })
    const tzDate = new Date(tzStr)
    tzDate.setHours(0, 0, 0, 0)

    // Convert back to UTC
    const offset = d.getTime() - new Date(tzStr).getTime()
    return new Date(tzDate.getTime() + offset)
}

export function endOfDayInTz(timezone: string, date?: Date): Date {
    const start = startOfDayInTz(timezone, date)
    return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
}

export function addInterval(
    date: Date,
    everyN: number,
    unit: "DAY" | "WEEK" | "MONTH",
): Date {
    const result = new Date(date)
    switch (unit) {
        case "DAY":
            result.setDate(result.getDate() + everyN)
            break
        case "WEEK":
            result.setDate(result.getDate() + everyN * 7)
            break
        case "MONTH":
            result.setMonth(result.getMonth() + everyN)
            break
    }
    return result
}

export function formatDatetime(date: Date | null, timezone: string): string {
    if (!date) return "—"
    return date.toLocaleString("ru-RU", {
        timeZone: timezone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    })
}

export function formatDate(date: Date | null, timezone: string): string {
    if (!date) return "—"
    return date.toLocaleDateString("ru-RU", {
        timeZone: timezone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    })
}

/**
 * Create a Date at specific time (HH:MM) in given timezone for a given day.
 */
export function dateAtTimeInTz(
    timezone: string,
    hours: number,
    minutes: number,
    baseDate?: Date,
): Date {
    const d = baseDate ?? new Date()
    const tzStr = d.toLocaleString("en-US", { timeZone: timezone })
    const tzDate = new Date(tzStr)
    tzDate.setHours(hours, minutes, 0, 0)

    const offset = d.getTime() - new Date(tzStr).getTime()
    return new Date(tzDate.getTime() + offset)
}
