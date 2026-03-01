/**
 * Integration tests for LMS admin routes
 * GET  /api/lms/admin/connection-status
 * GET  /api/lms/admin/sync-status
 * POST /api/lms/admin/sync-all
 * GET  /api/lms/admin/sync-all/status/:jobId
 * POST /api/lms/admin/sync/:userId
 */

import { jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import session from 'express-session'

// ── Mock functions ─────────────────────────────────────────────────────────────
const mockQuery               = jest.fn()
const mockVerifyConnection    = jest.fn()
const mockSyncUserFromMoodle  = jest.fn()
const mockLogInfo  = jest.fn()
const mockLogError = jest.fn()
const mockLogWarn  = jest.fn()

// ── ESM module mocks ──────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../config/database.js', () => ({
    default: { query: mockQuery }
}))
jest.unstable_mockModule('../../../utils/logger.js', () => ({
    default: { info: mockLogInfo, error: mockLogError, warn: mockLogWarn, debug: jest.fn() }
}))
jest.unstable_mockModule('../../../services/moodleService.js', () => ({
    verifyConnection:   mockVerifyConnection,
    syncUserFromMoodle: mockSyncUserFromMoodle
}))

// ── Dynamic imports after mocks ────────────────────────────────────────────────
const { default: lmsRouter } = await import('../../../routes/lms.js')

function buildApp(role = 'admin') {
    const app = express()
    app.use(express.json())
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }))
    app.use((req, _res, next) => {
        req.session.user = { id: 'admin-1', email: 'admin@test.com', role }
        next()
    })
    app.use('/api/lms', lmsRouter)
    return app
}

function buildUnauthApp() {
    const app = express()
    app.use(express.json())
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }))
    app.use('/api/lms', lmsRouter)
    return app
}

beforeEach(() => {
    mockQuery.mockReset()
    mockVerifyConnection.mockReset()
    mockSyncUserFromMoodle.mockReset()
    mockLogInfo.mockReset()
    mockLogError.mockReset()
    mockLogWarn.mockReset()
    // Ensure Moodle env vars are clean before each test
    delete process.env.MOODLE_BASE_URL
    delete process.env.MOODLE_TOKEN
})

// ── Authentication & Authorization ─────────────────────────────────────────────

describe('Authentication & Authorization', () => {
    test('returns 401 when not logged in', async () => {
        const res = await request(buildUnauthApp()).get('/api/lms/admin/sync-status')
        expect(res.status).toBe(401)
        expect(res.body.error).toBe('not_authenticated')
    })

    test('returns 403 when logged in as student', async () => {
        const res = await request(buildApp('student')).get('/api/lms/admin/sync-status')
        expect(res.status).toBe(403)
        expect(res.body.error).toBe('forbidden')
    })
})

// ── GET /admin/connection-status ───────────────────────────────────────────────

describe('GET /api/lms/admin/connection-status', () => {
    test('returns not configured when env vars are absent', async () => {
        const res = await request(buildApp()).get('/api/lms/admin/connection-status')
        expect(res.status).toBe(200)
        expect(res.body.connected).toBe(false)
        expect(res.body.moodleConfigured).toBe(false)
        expect(mockVerifyConnection).not.toHaveBeenCalled()
    })

    test('returns connected: true when verifyConnection succeeds', async () => {
        process.env.MOODLE_BASE_URL = 'http://moodle.test'
        process.env.MOODLE_TOKEN = 'test-token'
        mockVerifyConnection.mockResolvedValue({ sitename: 'Test Moodle', username: 'admin' })

        const res = await request(buildApp()).get('/api/lms/admin/connection-status')
        expect(res.status).toBe(200)
        expect(res.body.connected).toBe(true)
        expect(res.body.sitename).toBe('Test Moodle')
        expect(res.body.username).toBe('admin')
        expect(res.body.moodleConfigured).toBe(true)
    })

    test('returns connected: false when verifyConnection throws', async () => {
        process.env.MOODLE_BASE_URL = 'http://moodle.test'
        process.env.MOODLE_TOKEN = 'test-token'
        mockVerifyConnection.mockRejectedValue(new Error('Connection refused'))

        const res = await request(buildApp()).get('/api/lms/admin/connection-status')
        expect(res.status).toBe(200)  // soft failure — not a 500
        expect(res.body.connected).toBe(false)
        expect(res.body.error).toBe('Connection refused')
        expect(res.body.moodleConfigured).toBe(true)
    })
})

// ── GET /admin/sync-status ─────────────────────────────────────────────────────

describe('GET /api/lms/admin/sync-status', () => {
    test('returns mapped student sync list', async () => {
        mockQuery.mockResolvedValue({ rows: [
            { user_id: 'u1', name: 'Alice', email: 'alice@test.com', last_sync: '2026-03-01', real_count: '5' },
            { user_id: 'u2', name: 'Bob',   email: 'bob@test.com',   last_sync: null,          real_count: '0' },
        ]})
        const res = await request(buildApp()).get('/api/lms/admin/sync-status')
        expect(res.status).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body).toHaveLength(2)
        expect(res.body[0].userId).toBe('u1')
        expect(res.body[0].hasMoodleData).toBe(true)
        expect(res.body[1].hasMoodleData).toBe(false)
        expect(res.body[1].lastSync).toBeNull()
    })
})

// ── POST /admin/sync-all ───────────────────────────────────────────────────────

describe('POST /api/lms/admin/sync-all', () => {
    test('returns 202 with jobId and total immediately', async () => {
        mockQuery.mockResolvedValue({ rows: [
            { id: 'u1', name: 'Alice', email: 'alice@test.com' },
            { id: 'u2', name: 'Bob',   email: 'bob@test.com'   },
        ]})
        const res = await request(buildApp()).post('/api/lms/admin/sync-all')
        expect(res.status).toBe(202)
        expect(typeof res.body.jobId).toBe('string')
        expect(res.body.jobId).toBeTruthy()
        expect(res.body.total).toBe(2)
        expect(res.body.status).toBe('pending')
    })
})

// ── GET /admin/sync-all/status/:jobId ─────────────────────────────────────────

describe('GET /api/lms/admin/sync-all/status/:jobId', () => {
    test('returns 404 for unknown jobId', async () => {
        const res = await request(buildApp())
            .get('/api/lms/admin/sync-all/status/does-not-exist')
        expect(res.status).toBe(404)
        expect(res.body.error).toBe('NOT_FOUND')
    })

    test('returns job state for a known jobId', async () => {
        // Create a job first, then poll its status
        mockQuery.mockResolvedValue({ rows: [
            { id: 'u1', name: 'Alice', email: 'alice@test.com' }
        ]})
        const app = buildApp()
        const postRes = await request(app).post('/api/lms/admin/sync-all')
        expect(postRes.status).toBe(202)
        const { jobId } = postRes.body

        const getRes = await request(app).get(`/api/lms/admin/sync-all/status/${jobId}`)
        expect(getRes.status).toBe(200)
        expect(getRes.body.jobId).toBe(jobId)
        expect(['pending', 'running', 'complete']).toContain(getRes.body.status)
        expect(typeof getRes.body.total).toBe('number')
    })
})

// ── POST /admin/sync/:userId ───────────────────────────────────────────────────

describe('POST /api/lms/admin/sync/:userId', () => {
    test('returns 404 when user is not found', async () => {
        mockQuery.mockResolvedValue({ rows: [] })
        const res = await request(buildApp()).post('/api/lms/admin/sync/unknown-id')
        expect(res.status).toBe(404)
        expect(res.body.error).toBe('NOT_FOUND')
    })

    test('returns sync result for known user', async () => {
        mockQuery.mockResolvedValue({ rows: [{ id: 'u1', email: 'alice@test.com' }] })
        mockSyncUserFromMoodle.mockResolvedValue({ synced: 7, skipped: false })

        const res = await request(buildApp()).post('/api/lms/admin/sync/u1')
        expect(res.status).toBe(200)
        expect(res.body.synced).toBe(7)
        expect(mockSyncUserFromMoodle).toHaveBeenCalledWith(
            expect.anything(), 'u1', 'alice@test.com'
        )
    })
})
