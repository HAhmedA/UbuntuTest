# Sprint 4 — Route Integration Test Coverage — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add integration tests for 4 zero-coverage route files, bringing global line coverage from 57% to ≥70%.

**Architecture:** Four new test files in `backend/tests/integration/routes/`, following the exact supertest + `jest.unstable_mockModule` pattern established in `admin.test.js`. Each file mocks `pool` (database), `logger`, and any service dependencies, then builds a minimal Express app for HTTP assertions.

**Tech Stack:** Jest (ESM via `NODE_OPTIONS='--experimental-vm-modules'`), `supertest`, `express`, `express-session`, `jest.unstable_mockModule`.

---

## Context you need to know

### Test runner commands

Run one file:
```bash
cd /Users/heshama/Desktop/Code/surveyjs-react-client-main/backend
NODE_OPTIONS='--experimental-vm-modules' npx jest tests/integration/routes/<file>.test.js --no-coverage
```

Run all new files:
```bash
cd /Users/heshama/Desktop/Code/surveyjs-react-client-main/backend
NODE_OPTIONS='--experimental-vm-modules' npx jest tests/integration/routes/ --no-coverage
```

Run full suite + coverage:
```bash
cd /Users/heshama/Desktop/Code/surveyjs-react-client-main/backend
NODE_OPTIONS='--experimental-vm-modules' npx jest --coverage 2>&1 | tail -10
```

### ESM mocking pattern
Same as Sprint 3 — `jest.unstable_mockModule` BEFORE `await import(router)`. No top-level `import` for the router.

### asyncRoute error handling
`asyncRoute` in `backend/utils/errors.js` catches errors and sends responses directly — **no Express error handler middleware needed** in `buildApp`. Auth errors from `requireAuth`/`requireAdmin` are sent directly too.

### Auth middleware behavior
- `requireAuth`: returns `{ error: 'not_authenticated' }` 401 when `req.session.user` is absent
- `requireAdmin`: returns `{ error: 'not_authenticated' }` 401 when no session, `{ error: 'forbidden' }` 403 when role ≠ `'admin'`

### buildApp pattern
```js
function buildApp(role = 'student') {
    const app = express()
    app.use(express.json())
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }))
    app.use((req, _res, next) => {
        req.session.user = { id: 'user-1', email: 'user@test.com', role }
        next()
    })
    app.use('/api/mood', moodRouter)
    return app
}

function buildUnauthApp() {
    const app = express()
    app.use(express.json())
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }))
    app.use('/api/mood', moodRouter)
    return app
}
```

---

## Task 1: mood route integration tests

**Files:**
- Create: `backend/tests/integration/routes/mood.test.js`

### Step 1: Write the test file

Create `backend/tests/integration/routes/mood.test.js`:

```js
/**
 * Integration tests for mood routes
 * GET /api/mood        — mood statistics
 * GET /api/mood/history — line graph data
 */

import { jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import session from 'express-session'

// ── Mock functions ─────────────────────────────────────────────────────────────
const mockQuery    = jest.fn()
const mockLogWarn  = jest.fn()

// ── ESM module mocks ──────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../config/database.js', () => ({
    default: { query: mockQuery }
}))
jest.unstable_mockModule('../../../utils/logger.js', () => ({
    default: { info: jest.fn(), error: jest.fn(), warn: mockLogWarn, debug: jest.fn() }
}))

// ── Dynamic imports after mocks ────────────────────────────────────────────────
const { default: moodRouter } = await import('../../../routes/mood.js')

// ── Survey fixture with one rating construct ───────────────────────────────────
const SURVEY_JSON = {
    pages: [{
        elements: [{ name: 'mood', type: 'rating', title: 'How are you feeling?' }]
    }]
}

function buildApp() {
    const app = express()
    app.use(express.json())
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }))
    app.use((req, _res, next) => {
        req.session.user = { id: 'user-1', email: 'user@test.com', role: 'student' }
        next()
    })
    app.use('/api/mood', moodRouter)
    return app
}

function buildUnauthApp() {
    const app = express()
    app.use(express.json())
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }))
    app.use('/api/mood', moodRouter)
    return app
}

beforeEach(() => {
    mockQuery.mockReset()
})

// ── Authentication ─────────────────────────────────────────────────────────────

describe('Authentication', () => {
    test('GET / returns 401 when not logged in', async () => {
        const res = await request(buildUnauthApp()).get('/api/mood?surveyId=s1')
        expect(res.status).toBe(401)
        expect(res.body.error).toBe('not_authenticated')
    })
})

// ── GET / ──────────────────────────────────────────────────────────────────────

describe('GET /api/mood', () => {
    test('returns 400 when surveyId is missing', async () => {
        const res = await request(buildApp()).get('/api/mood')
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('surveyId required')
    })

    test('returns 400 for invalid period', async () => {
        const res = await request(buildApp()).get('/api/mood?surveyId=s1&period=badperiod')
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('invalid period')
    })

    test('returns 404 when survey not found', async () => {
        mockQuery.mockResolvedValue({ rows: [] })
        const res = await request(buildApp()).get('/api/mood?surveyId=s1')
        expect(res.status).toBe(404)
        expect(res.body.error).toBe('survey_not_found')
    })

    test('returns hasData: false when no questionnaire results exist', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ json: SURVEY_JSON }] }) // survey lookup
            .mockResolvedValueOnce({ rows: [] })                       // no results
        const res = await request(buildApp()).get('/api/mood?surveyId=s1')
        expect(res.status).toBe(200)
        expect(res.body.hasData).toBe(false)
        expect(res.body.totalResponses).toBe(0)
        expect(res.body.constructs[0].name).toBe('mood')
        expect(res.body.constructs[0].average).toBeNull()
    })

    test('returns computed stats when results exist', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ json: SURVEY_JSON }] })
            .mockResolvedValueOnce({ rows: [
                { id: 'r1', answers: JSON.stringify({ mood: 4 }), created_at: '2026-03-01T10:00:00Z' },
                { id: 'r2', answers: JSON.stringify({ mood: 2 }), created_at: '2026-03-01T11:00:00Z' },
            ]})
        const res = await request(buildApp()).get('/api/mood?surveyId=s1')
        expect(res.status).toBe(200)
        expect(res.body.hasData).toBe(true)
        expect(res.body.totalResponses).toBe(2)
        const moodStat = res.body.constructs.find(c => c.name === 'mood')
        expect(moodStat.average).toBe(3)  // (4+2)/2
        expect(moodStat.min).toBe(2)
        expect(moodStat.max).toBe(4)
    })
})

// ── GET /history ───────────────────────────────────────────────────────────────

describe('GET /api/mood/history', () => {
    test('returns 400 when surveyId is missing', async () => {
        const res = await request(buildApp()).get('/api/mood/history')
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('surveyId required')
    })

    test('returns 404 when survey not found', async () => {
        mockQuery.mockResolvedValue({ rows: [] })
        const res = await request(buildApp()).get('/api/mood/history?surveyId=s1')
        expect(res.status).toBe(404)
        expect(res.body.error).toBe('survey_not_found')
    })

    test('returns time-bucketed chart points for period=today', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ json: SURVEY_JSON }] })
            .mockResolvedValueOnce({ rows: [
                { id: 'r1', answers: JSON.stringify({ mood: 3 }), created_at: '2026-03-01T09:30:00Z' }
            ]})
        const res = await request(buildApp()).get('/api/mood/history?surveyId=s1&period=today')
        expect(res.status).toBe(200)
        expect(res.body.period).toBe('today')
        expect(Array.isArray(res.body.data)).toBe(true)
        expect(res.body.data[0]).toHaveProperty('time')
        expect(res.body.data[0].mood).toBe(3)
    })

    test('returns datetime-labelled points for period=7days', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ json: SURVEY_JSON }] })
            .mockResolvedValueOnce({ rows: [
                { id: 'r1', answers: JSON.stringify({ mood: 4 }), created_at: '2026-02-28T14:00:00Z' }
            ]})
        const res = await request(buildApp()).get('/api/mood/history?surveyId=s1&period=7days')
        expect(res.status).toBe(200)
        expect(res.body.period).toBe('7days')
        expect(res.body.data[0]).toHaveProperty('datetime')
        expect(res.body.data[0].mood).toBe(4)
    })

    test('returns daily averages when no period specified', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ json: SURVEY_JSON }] })
            .mockResolvedValueOnce({ rows: [
                { id: 'r1', answers: JSON.stringify({ mood: 4 }), created_at: '2026-03-01T09:00:00Z' },
                { id: 'r2', answers: JSON.stringify({ mood: 2 }), created_at: '2026-03-01T15:00:00Z' },
            ]})
        const res = await request(buildApp()).get('/api/mood/history?surveyId=s1')
        expect(res.status).toBe(200)
        expect(res.body.period).toBe('all')
        // Two results on same day → averaged
        expect(res.body.data).toHaveLength(1)
        expect(res.body.data[0].mood).toBe(3)  // (4+2)/2
    })
})
```

### Step 2: Run the test file
```bash
cd /Users/heshama/Desktop/Code/surveyjs-react-client-main/backend
NODE_OPTIONS='--experimental-vm-modules' npx jest tests/integration/routes/mood.test.js --no-coverage
```

Expected: 11 tests, all pass.

**If tests fail:** Read `backend/routes/mood.js` to verify the exact response shape, error messages, and field names — adjust assertions to match. Do NOT change the route file.

### Step 3: Commit
```bash
cd /Users/heshama/Desktop/Code/surveyjs-react-client-main
git add backend/tests/integration/routes/mood.test.js
git commit -m "test: add integration tests for mood routes

Covers GET / (stats) and GET /history (chart data) including
auth, validation, 404, empty-results, and period-bucketing paths.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: lms route integration tests

**Files:**
- Create: `backend/tests/integration/routes/lms.test.js`

### Important: in-memory job store

`lms.js` has a module-level `syncJobs = new Map()`. Since the router module is imported once and reused across all tests, the Map persists between tests. The `POST /admin/sync-all` and `GET /admin/sync-all/status/:jobId` tests should be structured so the jobId from POST is immediately used in the same test (not shared across tests).

Also `POST /admin/sync-all` fires a `setImmediate` background job. Tests only assert the 202 response — they do NOT wait for the job to complete.

### Important: env vars for connection-status

`GET /admin/connection-status` reads `process.env.MOODLE_BASE_URL` and `process.env.MOODLE_TOKEN`. Set and unset these per test or use an `afterEach` cleanup.

### Step 1: Write the test file

Create `backend/tests/integration/routes/lms.test.js`:

```js
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
    mockLogError.mockReset()
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
```

### Step 2: Run the test file
```bash
cd /Users/heshama/Desktop/Code/surveyjs-react-client-main/backend
NODE_OPTIONS='--experimental-vm-modules' npx jest tests/integration/routes/lms.test.js --no-coverage
```

Expected: 11 tests, all pass.

**If tests fail:** Read `backend/routes/lms.js` and `backend/utils/errors.js` to verify the exact error codes and response shapes. Do NOT change the route file.

### Step 3: Commit
```bash
cd /Users/heshama/Desktop/Code/surveyjs-react-client-main
git add backend/tests/integration/routes/lms.test.js
git commit -m "test: add integration tests for lms admin routes

Covers connection-status, sync-status, sync-all background job,
job status polling, and single-user sync including auth guards.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: results route integration tests

**Files:**
- Create: `backend/tests/integration/routes/results.test.js`

### Note on auth
`results.js` has NO `requireAuth` middleware. The route does `req.session.user?.id || null`. With no session user, `userId` is `null` and the SRL/scoring code is skipped. The "anonymous" test verifies this skip behavior — express-session is still needed so `req.session` exists.

### Step 1: Write the test file

Create `backend/tests/integration/routes/results.test.js`:

```js
/**
 * Integration tests for results routes
 * POST /api/results/post
 */

import { jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import session from 'express-session'

// ── Mock functions ─────────────────────────────────────────────────────────────
const mockQuery               = jest.fn()
const mockSaveResponses       = jest.fn().mockResolvedValue(undefined)
const mockComputeAnnotations  = jest.fn().mockResolvedValue(undefined)
const mockComputeAllScores    = jest.fn().mockResolvedValue(undefined)
const mockLogInfo  = jest.fn()
const mockLogError = jest.fn()

// ── ESM module mocks ──────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../config/database.js', () => ({
    default: { query: mockQuery }
}))
jest.unstable_mockModule('../../../utils/logger.js', () => ({
    default: { info: mockLogInfo, error: mockLogError, warn: jest.fn(), debug: jest.fn() }
}))
jest.unstable_mockModule('../../../services/annotators/srlAnnotationService.js', () => ({
    saveResponses:      mockSaveResponses,
    computeAnnotations: mockComputeAnnotations
}))
jest.unstable_mockModule('../../../services/scoring/scoreComputationService.js', () => ({
    computeAllScores: mockComputeAllScores
}))

// ── Dynamic imports after mocks ────────────────────────────────────────────────
const { default: resultsRouter } = await import('../../../routes/results.js')

// App with authenticated session
function buildApp(userId = 'user-1') {
    const app = express()
    app.use(express.json())
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }))
    app.use((req, _res, next) => {
        req.session.user = { id: userId }
        next()
    })
    app.use('/api/results', resultsRouter)
    return app
}

// App with no session user (anonymous submission)
function buildAnonApp() {
    const app = express()
    app.use(express.json())
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }))
    app.use('/api/results', resultsRouter)
    return app
}

beforeEach(() => {
    mockQuery.mockReset()
    mockSaveResponses.mockReset()
    mockComputeAnnotations.mockReset()
    mockComputeAllScores.mockReset()
    mockLogError.mockReset()
    // Restore default resolved values
    mockSaveResponses.mockResolvedValue(undefined)
    mockComputeAnnotations.mockResolvedValue(undefined)
    mockComputeAllScores.mockResolvedValue(undefined)
})

// ── POST /api/results/post ─────────────────────────────────────────────────────

describe('POST /api/results/post', () => {
    test('returns 400 when body is missing entirely', async () => {
        const res = await request(buildApp()).post('/api/results/post').send({})
        expect(res.status).toBe(400)
        expect(res.body.error).toContain('postId')
    })

    test('returns 400 when postId is missing', async () => {
        const res = await request(buildApp())
            .post('/api/results/post')
            .send({ surveyResult: { q: 1 } })
        expect(res.status).toBe(400)
    })

    test('returns 400 when surveyResult is missing', async () => {
        const res = await request(buildApp())
            .post('/api/results/post')
            .send({ postId: 'survey-1' })
        expect(res.status).toBe(400)
    })

    test('submits anonymously (no session user) — skips SRL and scoring', async () => {
        mockQuery.mockResolvedValue({ rows: [] })  // INSERT

        const res = await request(buildAnonApp())
            .post('/api/results/post')
            .send({ postId: 'survey-1', surveyResult: { mood: 4 } })

        expect(res.status).toBe(200)
        expect(res.body.postId).toBe('survey-1')
        expect(typeof res.body.id).toBe('string')
        expect(mockSaveResponses).not.toHaveBeenCalled()
        expect(mockComputeAllScores).not.toHaveBeenCalled()
    })

    test('submits with auth — calls saveResponses and computeAnnotations', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })                              // INSERT
            .mockResolvedValueOnce({ rows: [{ json: { pages: [] } }] })      // SELECT survey

        const res = await request(buildApp())
            .post('/api/results/post')
            .send({ postId: 'survey-1', surveyResult: { mood: 3 } })

        expect(res.status).toBe(200)
        expect(res.body.postId).toBe('survey-1')
        expect(mockSaveResponses).toHaveBeenCalledTimes(1)
        expect(mockComputeAnnotations).toHaveBeenCalledTimes(1)
        // computeAllScores is fire-and-forget — just check it was called
        expect(mockComputeAllScores).toHaveBeenCalledWith('user-1')
    })
})
```

### Step 2: Run the test file
```bash
cd /Users/heshama/Desktop/Code/surveyjs-react-client-main/backend
NODE_OPTIONS='--experimental-vm-modules' npx jest tests/integration/routes/results.test.js --no-coverage
```

Expected: 5 tests, all pass.

**If the 400-body test fails:** Read `backend/routes/results.js` line 15-17 and check the exact error message string. The assertion uses `toContain` which is flexible, but the error field key might differ.

### Step 3: Commit
```bash
cd /Users/heshama/Desktop/Code/surveyjs-react-client-main
git add backend/tests/integration/routes/results.test.js
git commit -m "test: add integration tests for results routes

Covers POST /post validation, anonymous submission (skips SRL),
and authenticated submission (triggers saveResponses + computeAnnotations).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: annotations route integration tests + full coverage check

**Files:**
- Create: `backend/tests/integration/routes/annotations.test.js`

### Step 1: Write the test file

Create `backend/tests/integration/routes/annotations.test.js`:

```js
/**
 * Integration tests for annotation routes
 * GET /api/annotations         — annotations for UI display
 * GET /api/annotations/chatbot — annotations formatted for LLM
 */

import { jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import session from 'express-session'

// ── Mock functions ─────────────────────────────────────────────────────────────
const mockGetAnnotations          = jest.fn()
const mockGetAnnotationsForChatbot = jest.fn()

// ── ESM module mocks ──────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../config/database.js', () => ({
    default: { query: jest.fn() }
}))
jest.unstable_mockModule('../../../utils/logger.js', () => ({
    default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
}))
jest.unstable_mockModule('../../../services/annotators/srlAnnotationService.js', () => ({
    getAnnotations:           mockGetAnnotations,
    getAnnotationsForChatbot: mockGetAnnotationsForChatbot
}))

// ── Dynamic imports after mocks ────────────────────────────────────────────────
const { default: annotationsRouter } = await import('../../../routes/annotations.js')

function buildApp() {
    const app = express()
    app.use(express.json())
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }))
    app.use((req, _res, next) => {
        req.session.user = { id: 'user-1', email: 'user@test.com', role: 'student' }
        next()
    })
    app.use('/api/annotations', annotationsRouter)
    return app
}

function buildUnauthApp() {
    const app = express()
    app.use(express.json())
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }))
    app.use('/api/annotations', annotationsRouter)
    return app
}

beforeEach(() => {
    mockGetAnnotations.mockReset()
    mockGetAnnotationsForChatbot.mockReset()
})

// ── Authentication ─────────────────────────────────────────────────────────────

describe('Authentication', () => {
    test('GET / returns 401 when not logged in', async () => {
        const res = await request(buildUnauthApp()).get('/api/annotations')
        expect(res.status).toBe(401)
        expect(res.body.error).toBe('not_authenticated')
    })
})

// ── GET / ──────────────────────────────────────────────────────────────────────

describe('GET /api/annotations', () => {
    test('returns annotations for the current user', async () => {
        const fakeAnnotations = [{ id: 'a1', text: 'Good sleep pattern', domain: 'sleep' }]
        mockGetAnnotations.mockResolvedValue(fakeAnnotations)

        const res = await request(buildApp()).get('/api/annotations')

        expect(res.status).toBe(200)
        expect(res.body.annotations).toEqual(fakeAnnotations)
        expect(mockGetAnnotations).toHaveBeenCalledWith(
            expect.anything(),  // pool
            'user-1',
            undefined,          // timeWindow (not passed)
            false
        )
    })
})

// ── GET /chatbot ───────────────────────────────────────────────────────────────

describe('GET /api/annotations/chatbot', () => {
    test('returns annotationsText for the current user', async () => {
        mockGetAnnotationsForChatbot.mockResolvedValue('Sleep is good. Screen time is moderate.')

        const res = await request(buildApp()).get('/api/annotations/chatbot')

        expect(res.status).toBe(200)
        expect(res.body.annotationsText).toBe('Sleep is good. Screen time is moderate.')
        expect(mockGetAnnotationsForChatbot).toHaveBeenCalledWith(
            expect.anything(),  // pool
            'user-1'
        )
    })
})
```

### Step 2: Run the test file
```bash
cd /Users/heshama/Desktop/Code/surveyjs-react-client-main/backend
NODE_OPTIONS='--experimental-vm-modules' npx jest tests/integration/routes/annotations.test.js --no-coverage
```

Expected: 4 tests, all pass.

### Step 3: Run the full regression suite with coverage
```bash
cd /Users/heshama/Desktop/Code/surveyjs-react-client-main/backend
NODE_OPTIONS='--experimental-vm-modules' npx jest --coverage 2>&1 | tail -12
```

Expected output:
```
Tests:       173 passed, 173 total   (142 existing + 31 new)
Lines        : ≥70% (threshold met)
```

If coverage is still below 70%, check `jest --coverage --coverageReporters=text` to identify which files are still uncovered and compare against the projection.

### Step 4: Commit
```bash
cd /Users/heshama/Desktop/Code/surveyjs-react-client-main
git add backend/tests/integration/routes/annotations.test.js
git commit -m "test: add integration tests for annotations routes

Covers GET / and GET /chatbot including auth guard and
correct argument passing to srlAnnotationService.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Final Verification

After all 4 tasks are committed:

```bash
cd /Users/heshama/Desktop/Code/surveyjs-react-client-main/backend
NODE_OPTIONS='--experimental-vm-modules' npx jest --coverage 2>&1 | grep -E "Lines|Tests:"
```

Expected:
- `Tests: 173 passed`
- `Lines : ≥70%`

Verify git log:
```bash
git log --oneline -5
```

Expected: 4 new test commits above the Sprint 3 work.
