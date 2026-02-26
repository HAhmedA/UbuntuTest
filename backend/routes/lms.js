// LMS Admin Routes
// Admin-only endpoints for Moodle connection status and bulk/per-student sync.
// All routes require admin privileges.

import { Router } from 'express'
import pool from '../config/database.js'
import logger from '../utils/logger.js'
import { requireAdmin } from '../middleware/auth.js'
import { asyncRoute, Errors } from '../utils/errors.js'
import { verifyConnection, syncUserFromMoodle } from '../services/moodleService.js'

const router = Router()

// All LMS admin routes require admin privileges
router.use(requireAdmin)

// =============================================================================
// CONNECTION STATUS
// =============================================================================

/**
 * GET /api/lms/admin/connection-status
 * Returns whether Moodle is configured and reachable.
 */
router.get('/admin/connection-status', asyncRoute(async (req, res) => {
    const moodleConfigured = !!(process.env.MOODLE_BASE_URL && process.env.MOODLE_TOKEN)

    if (!moodleConfigured) {
        return res.json({ connected: false, sitename: null, moodleConfigured: false })
    }

    try {
        const { sitename, username } = await verifyConnection()
        res.json({ connected: true, sitename, username, moodleConfigured: true })
    } catch (err) {
        logger.warn(`Moodle connection check failed: ${err.message}`)
        res.json({ connected: false, sitename: null, moodleConfigured: true, error: err.message })
    }
}))

// =============================================================================
// SYNC STATUS
// =============================================================================

/**
 * GET /api/lms/admin/sync-status
 * Returns per-student LMS sync status: whether they have real Moodle data and when last synced.
 */
router.get('/admin/sync-status', asyncRoute(async (req, res) => {
    const { rows } = await pool.query(`
        SELECT
            u.id          AS user_id,
            u.name,
            u.email,
            MAX(ls.created_at) FILTER (WHERE ls.is_simulated = false)  AS last_sync,
            COUNT(ls.session_date) FILTER (WHERE ls.is_simulated = false) AS real_count
        FROM public.users u
        LEFT JOIN public.lms_sessions ls ON ls.user_id = u.id
        WHERE u.role = 'student'
        GROUP BY u.id, u.name, u.email
        ORDER BY u.name
    `)

    const statuses = rows.map(r => ({
        userId:       r.user_id,
        name:         r.name,
        email:        r.email,
        hasMoodleData: parseInt(r.real_count || 0) > 0,
        lastSync:     r.last_sync ?? null,
    }))

    res.json(statuses)
}))

// =============================================================================
// BULK SYNC
// =============================================================================

/**
 * POST /api/lms/admin/sync-all
 * Syncs all student users from Moodle sequentially.
 * Per-user errors are caught and recorded; the operation never aborts early.
 * Returns { total, synced, skipped: [{ email, reason }] }
 */
router.post('/admin/sync-all', asyncRoute(async (req, res) => {
    const { rows: users } = await pool.query(
        `SELECT id, name, email FROM public.users WHERE role = 'student' ORDER BY name`
    )

    let synced = 0
    const skipped = []

    for (const user of users) {
        try {
            const result = await syncUserFromMoodle(pool, user.id, user.email)
            if (result.skipped) {
                skipped.push({ email: user.email, reason: result.reason })
                logger.info(`sync-all: skipped ${user.email} (${result.reason})`)
            } else {
                synced++
                logger.info(`sync-all: synced ${user.email} — ${result.synced} days`)
            }
        } catch (err) {
            logger.error(`sync-all: error for ${user.email}: ${err.message}`)
            skipped.push({ email: user.email, reason: err.message })
        }
    }

    res.json({ total: users.length, synced, skipped })
}))

// =============================================================================
// SINGLE USER SYNC
// =============================================================================

/**
 * POST /api/lms/admin/sync/:userId
 * Syncs a single student from Moodle.
 * Returns { synced: N, days: [...] } | { skipped: true, reason: string }
 */
router.post('/admin/sync/:userId', asyncRoute(async (req, res) => {
    const { userId } = req.params

    const { rows } = await pool.query(
        `SELECT id, email FROM public.users WHERE id = $1`,
        [userId]
    )

    if (rows.length === 0) {
        throw Errors.NOT_FOUND('User')
    }

    const user = rows[0]
    const result = await syncUserFromMoodle(pool, user.id, user.email)

    res.json(result)
}))

export default router
