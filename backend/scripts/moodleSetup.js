/**
 * moodleSetup.js — One-time Moodle test environment setup
 *
 * Creates 21 Moodle user accounts matching the app's test emails,
 * creates a test course, and enrols all users in it.
 *
 * Prerequisites (Moodle admin UI):
 *   Site Admin → Server → Web services → External services → LocalTesting → Functions
 *   Add: core_user_create_users, core_course_create_courses, enrol_manual_enrol_users
 *
 * Usage:
 *   MOODLE_BASE_URL=http://localhost:8888/moodle501 \
 *   MOODLE_TOKEN=<token> \
 *   node backend/scripts/moodleSetup.js
 *
 *   Or with a .env file:
 *   node --env-file=backend/.env backend/scripts/moodleSetup.js
 */

import http from 'http'
import https from 'https'

// =============================================================================
// CONFIG
// =============================================================================

const BASE_URL = "http://localhost:8888/moodle501"
const TOKEN    = "c4acddbfba05950afcae5c334c74bc8e"



if (!BASE_URL || !TOKEN) {
    console.error('Error: MOODLE_BASE_URL and MOODLE_TOKEN env vars are required.')
    process.exit(1)
}

// =============================================================================
// HTTP HELPER (POST — required for write web service functions)
// =============================================================================

/**
 * Recursively flatten a nested object/array into PHP-style query string keys.
 * Example: { users: [{ username: 'test1' }] }
 *   → { 'users[0][username]': 'test1' }
 *
 * @param {any}    obj    - Value to flatten
 * @param {string} prefix - Accumulated key prefix (e.g. 'users[0]')
 * @param {Object} out    - Accumulator object for flat key→value pairs
 * @returns {Object} out
 */
function flattenParams(obj, prefix = '', out = {}) {
    if (Array.isArray(obj)) {
        obj.forEach((item, i) => {
            flattenParams(item, prefix ? `${prefix}[${i}]` : `${i}`, out)
        })
    } else if (obj !== null && typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
            flattenParams(value, prefix ? `${prefix}[${key}]` : key, out)
        }
    } else {
        out[prefix] = String(obj)
    }
    return out
}

/**
 * POST to Moodle REST API.
 * Uses Node.js http/https module to bypass Docker Desktop's transparent proxy
 * (same rationale as moodleService.js).
 *
 * @param {string} wsfunction - Moodle web service function name
 * @param {Object} params     - Parameters (nested objects/arrays supported)
 * @returns {Promise<any>}    - Parsed JSON response
 */
function moodlePost(wsfunction, params = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(`${BASE_URL}/webservice/rest/server.php`)
        const transport = parsedUrl.protocol === 'https:' ? https : http

        // Build POST body with PHP-style flattened params
        const flat = flattenParams(params)
        const bodyParts = new URLSearchParams({
            wstoken:            TOKEN,
            moodlewsrestformat: 'json',
            wsfunction,
            ...flat,
        })
        const bodyStr = bodyParts.toString()

        const options = {
            hostname: parsedUrl.hostname,
            port:     parseInt(parsedUrl.port) || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path:     parsedUrl.pathname,
            method:   'POST',
            headers:  {
                'Content-Type':   'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(bodyStr),
            },
        }

        const req = transport.request(options, (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', chunk => { body += chunk })
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`HTTP ${res.statusCode} from Moodle`))
                }

                // enrol_manual_enrol_users returns null body on success
                if (!body || body.trim() === 'null') {
                    return resolve(null)
                }

                let json
                try { json = JSON.parse(body) } catch {
                    return reject(new Error(`Non-JSON response from Moodle: ${body.slice(0, 200)}`))
                }

                if (json && json.exception) {
                    return reject(new Error(
                        `Moodle exception in ${wsfunction}: ${json.message || json.exception}`
                    ))
                }

                resolve(json)
            })
        })

        req.on('error', err => reject(new Error(`Network error: ${err.message}`)))
        req.write(bodyStr)
        req.end()
    })
}

// =============================================================================
// USER LIST
// =============================================================================

const TEST_USERS = [
    {
        username:  'student',
        email:     'student@example.com',
        firstname: 'Student',
        lastname:  'Demo',
        password:  'Test@1234',
        auth:      'manual',
    },
    ...Array.from({ length: 20 }, (_, i) => ({
        username:  `test${i + 1}`,
        email:     `test${i + 1}@example.com`,
        firstname: 'Test',
        lastname:  `Student${i + 1}`,
        password:  'Test@1234',
        auth:      'manual',
    })),
]

// =============================================================================
// MAIN SETUP FLOW
// =============================================================================

async function main() {
    console.log(`\nMoodle Setup Script`)
    console.log(`Base URL : ${BASE_URL}`)
    console.log(`Users    : ${TEST_USERS.length}`)
    console.log(`─────────────────────────────────────────────────\n`)

    // -------------------------------------------------------------------------
    // Step 1: Create users
    // -------------------------------------------------------------------------
    console.log('Step 1: Creating Moodle user accounts...')

    let createdUsers = []

    try {
        const result = await moodlePost('core_user_create_users', { users: TEST_USERS })
        createdUsers = Array.isArray(result) ? result : []
        console.log(`  ✓ Created ${createdUsers.length} users`)
        for (const u of createdUsers) {
            console.log(`    [id=${u.id}] ${u.username}`)
        }
    } catch (err) {
        // Moodle throws a single exception if ANY user already exists.
        // Fall back to looking up all users by email individually.
        console.warn(`  ! core_user_create_users failed: ${err.message}`)
        console.log('  → Falling back to core_user_get_users_by_field for each email...')

        for (const user of TEST_USERS) {
            try {
                const result = await moodlePost('core_user_get_users_by_field', {
                    field:  'email',
                    values: [user.email],
                })
                const found = Array.isArray(result) ? result : []
                if (found.length > 0) {
                    createdUsers.push({ id: found[0].id, username: found[0].username })
                    console.log(`    [id=${found[0].id}] ${user.username} (already exists)`)
                } else {
                    // Try creating just this one user
                    try {
                        const single = await moodlePost('core_user_create_users', { users: [user] })
                        if (Array.isArray(single) && single.length > 0) {
                            createdUsers.push(single[0])
                            console.log(`    [id=${single[0].id}] ${user.username} (created)`)
                        }
                    } catch (createErr) {
                        console.warn(`    ✗ Could not create ${user.username}: ${createErr.message}`)
                    }
                }
            } catch (lookupErr) {
                console.warn(`    ✗ Lookup failed for ${user.email}: ${lookupErr.message}`)
            }
        }
    }

    if (createdUsers.length === 0) {
        console.error('\nError: No users available — cannot proceed with course creation or enrolment.')
        process.exit(1)
    }

    // -------------------------------------------------------------------------
    // Step 2: Create course
    // -------------------------------------------------------------------------
    console.log('\nStep 2: Creating test course...')

    let courseId
    try {
        const result = await moodlePost('core_course_create_courses', {
            courses: [{
                fullname:   'LMS Integration Test',
                shortname:  'LMSTEST',
                categoryid: 1,
                summary:    'Auto-created by moodleSetup.js for LMS sync testing',
                format:     'topics',
            }],
        })
        const courses = Array.isArray(result) ? result : []
        if (courses.length === 0) {
            throw new Error('core_course_create_courses returned empty array')
        }
        courseId = courses[0].id
        console.log(`  ✓ Course created: id=${courseId}, shortname=${courses[0].shortname}`)
    } catch (err) {
        console.warn(`  ! core_course_create_courses failed: ${err.message}`)
        console.log('  → LMSTEST may already exist. Skipping course creation.')
        console.log('  → Attempting to look up existing course via core_course_get_courses_by_field...')
        try {
            const found = await moodlePost('core_course_get_courses_by_field', {
                field: 'shortname',
                value: 'LMSTEST',
            })
            const courses = found?.courses ?? []
            if (courses.length > 0) {
                courseId = courses[0].id
                console.log(`  ✓ Found existing course: id=${courseId}`)
            } else {
                console.error('  ✗ Could not find or create LMSTEST course. Aborting.')
                process.exit(1)
            }
        } catch (lookupErr) {
            console.error(`  ✗ Course lookup failed: ${lookupErr.message}`)
            process.exit(1)
        }
    }

    // -------------------------------------------------------------------------
    // Step 3: Enrol all users in the course
    // -------------------------------------------------------------------------
    console.log(`\nStep 3: Enrolling ${createdUsers.length} users in course ${courseId}...`)

    const enrolments = createdUsers.map(u => ({
        roleid:   5,        // Student role (Moodle default)
        userid:   u.id,
        courseid: courseId,
    }))

    try {
        await moodlePost('enrol_manual_enrol_users', { enrolments })
        console.log(`  ✓ Enrolled ${enrolments.length} users as students`)
    } catch (err) {
        console.error(`  ✗ Enrolment failed: ${err.message}`)
        console.log('  → Users were created but not enrolled. You can enrol them manually.')
    }

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log('\n─────────────────────────────────────────────────')
    console.log('Setup complete!')
    console.log(`  Users   : ${createdUsers.length} / ${TEST_USERS.length}`)
    console.log(`  Course  : LMSTEST (id=${courseId})`)
    console.log(`  Enrolled: ${enrolments.length} students`)
    console.log('\nNext steps:')
    console.log('  1. In Moodle, add Quiz / Assignment / Forum activities to LMSTEST')
    console.log('  2. Log in as a test student and complete at least one activity')
    console.log('  3. In the app admin panel → Sync All from Moodle')
    console.log('  4. Verify synced:21 in the response\n')
}

main().catch(err => {
    console.error('\nFatal error:', err.message)
    process.exit(1)
})
