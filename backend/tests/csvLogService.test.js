// Tests for pure functions in csvLogService.js
// These functions have no DB or file I/O — easy to test.

import {
    parseCsv,
    extractUniqueNames,
    classifyComponent,
    computeEalt,
    aggregateCsvToDaily,
} from '../services/csvLogService.js'

// ---------------------------------------------------------------------------
// parseCsv
// ---------------------------------------------------------------------------
describe('parseCsv', () => {
    it('parses header + data rows into objects', () => {
        const csv = `Time,User full name,Component,Event name\n"1 Jan 2026, 10:00",Ahmed Al-Rashid,Quiz,Quiz attempt started`
        const rows = parseCsv(csv)
        expect(rows).toHaveLength(1)
        expect(rows[0]['User full name']).toBe('Ahmed Al-Rashid')
        expect(rows[0]['Component']).toBe('Quiz')
    })

    it('handles quoted fields with commas inside', () => {
        const csv = `Time,User full name\n"2 March 2026, 9:03:17 PM",Ahmed Al-Rashid`
        const rows = parseCsv(csv)
        expect(rows[0]['Time']).toBe('2 March 2026, 9:03:17 PM')
    })

    it('returns empty array for header-only CSV', () => {
        const rows = parseCsv(`Time,User full name,Component,Event name\n`)
        expect(rows).toHaveLength(0)
    })
})

// ---------------------------------------------------------------------------
// extractUniqueNames
// ---------------------------------------------------------------------------
describe('extractUniqueNames', () => {
    it('returns sorted unique values from User full name column', () => {
        const rows = [
            { 'User full name': 'Sara Malik' },
            { 'User full name': 'Ahmed Al-Rashid' },
            { 'User full name': 'Sara Malik' },
        ]
        expect(extractUniqueNames(rows)).toEqual(['Ahmed Al-Rashid', 'Sara Malik'])
    })

    it('excludes empty names', () => {
        const rows = [{ 'User full name': '' }, { 'User full name': 'Ahmed' }]
        expect(extractUniqueNames(rows)).toEqual(['Ahmed'])
    })
})

// ---------------------------------------------------------------------------
// classifyComponent
// ---------------------------------------------------------------------------
describe('classifyComponent', () => {
    it('maps Quiz to exercise_practice_events', () => {
        expect(classifyComponent('Quiz', 'Quiz attempt started'))
            .toEqual({ exercise_practice_events: 1 })
    })

    it('maps Assignment to assignment_work_events', () => {
        expect(classifyComponent('Assignment', 'Submission created'))
            .toEqual({ assignment_work_events: 1 })
    })

    it('maps Forum + created event to forum_posts', () => {
        expect(classifyComponent('Forum', 'Post created'))
            .toEqual({ forum_posts: 1 })
    })

    it('maps Forum + other event to forum_views', () => {
        expect(classifyComponent('Forum', 'Discussion viewed'))
            .toEqual({ forum_views: 1 })
    })

    it('returns empty object for unknown component', () => {
        expect(classifyComponent('System', 'User list viewed')).toEqual({})
    })
})

// ---------------------------------------------------------------------------
// computeEalt
// ---------------------------------------------------------------------------
describe('computeEalt', () => {
    const ts = (offsetMin) => new Date(Date.UTC(2026, 2, 1, 9, 0) + offsetMin * 60000)

    it('returns zero metrics for empty event list', () => {
        const result = computeEalt([])
        expect(result.number_of_sessions).toBe(0)
        expect(result.total_active_minutes).toBe(0)
        expect(result.longest_session_minutes).toBe(0)
        expect(result.session_durations).toEqual([])
    })

    it('counts a single event as one session with 0 minutes', () => {
        const result = computeEalt([{ timestamp: ts(0) }])
        expect(result.number_of_sessions).toBe(1)
        expect(result.total_active_minutes).toBe(0)
    })

    it('caps per-event gap at 10 minutes', () => {
        // Two events 60 min apart — gap > 30 min → two sessions; first credits 10 min (capped)
        const events = [{ timestamp: ts(0) }, { timestamp: ts(60) }]
        const result = computeEalt(events)
        expect(result.number_of_sessions).toBe(2)
        expect(result.total_active_minutes).toBe(10)
    })

    it('merges events within 30-min window into one session', () => {
        const events = [
            { timestamp: ts(0) },
            { timestamp: ts(5) },
            { timestamp: ts(10) },
        ]
        const result = computeEalt(events)
        expect(result.number_of_sessions).toBe(1)
        // gaps: 5 + 5 = 10 min
        expect(result.total_active_minutes).toBe(10)
    })

    it('splits into two sessions when gap exceeds 30 min', () => {
        const events = [
            { timestamp: ts(0) },
            { timestamp: ts(5) },
            { timestamp: ts(40) }, // > 30 min gap → new session
            { timestamp: ts(45) },
        ]
        const result = computeEalt(events)
        expect(result.number_of_sessions).toBe(2)
    })

    it('longest_session_minutes reflects the longer session', () => {
        const events = [
            { timestamp: ts(0) },
            { timestamp: ts(10) },  // session 1: 10 min gap (capped at 10)
            { timestamp: ts(50) },  // new session (>30 gap)
            { timestamp: ts(53) },  // session 2: 3 min gap
        ]
        const result = computeEalt(events)
        expect(result.number_of_sessions).toBe(2)
        expect(result.longest_session_minutes).toBe(10)
    })
})

// ---------------------------------------------------------------------------
// aggregateCsvToDaily
// ---------------------------------------------------------------------------
describe('aggregateCsvToDaily', () => {
    it('groups events by date and returns one row per day', () => {
        const rows = [
            { 'User full name': 'Ahmed', 'Time': '1 March 2026, 10:00:00 AM', 'Component': 'Quiz', 'Event name': 'Quiz attempt started' },
            { 'User full name': 'Ahmed', 'Time': '1 March 2026, 10:15:00 AM', 'Component': 'Forum', 'Event name': 'Post created' },
            { 'User full name': 'Ahmed', 'Time': '2 March 2026, 09:00:00 AM', 'Component': 'Assignment', 'Event name': 'Submission created' },
        ]
        const result = aggregateCsvToDaily('Ahmed', rows)
        expect(result).toHaveLength(2)
        const march1 = result.find(r => r.session_date === '2026-03-01')
        expect(march1.exercise_practice_events).toBe(1)
        expect(march1.forum_posts).toBe(1)
        const march2 = result.find(r => r.session_date === '2026-03-02')
        expect(march2.assignment_work_events).toBe(1)
    })
})
