import * as chrono from 'chrono-node';
/**
 * Parse a natural language time string relative to a user's timezone.
 * Returns a Date object or null if parsing fails.
 *
 * Examples:
 *   "tomorrow 9am"
 *   "next Friday at 3pm"
 *   "in 2 hours"
 *   "25 December at noon"
 */
export function parseTime(input, timezone = 'Africa/Lagos') {
    // chrono-node parses relative to a reference date
    // We create a reference date in the user's timezone by using the current time
    const referenceDate = new Date();
    const results = chrono.parse(input, referenceDate, { forwardDate: true });
    if (!results || results.length === 0)
        return null;
    const parsed = results[0].start.date();
    // Reject dates in the past (with a 60-second grace window)
    if (parsed.getTime() < Date.now() - 60_000)
        return null;
    return parsed;
}
/**
 * Check if a parsed date is at least `minMinutes` in the future.
 */
export function isFarEnoughAhead(date, minMinutes = 1) {
    return date.getTime() > Date.now() + minMinutes * 60_000;
}
//# sourceMappingURL=timeParser.js.map