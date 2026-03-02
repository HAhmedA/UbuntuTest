# LMS Session Seeder — Design

**Date:** 2026-03-02
**Status:** Approved

## Problem

Real Moodle activity data for test1–test20 spans only Feb 22–27 (when the setup scripts ran).
Moodle timestamps are immutable — you cannot backdate real activity via REST.
`syncUserFromMoodle` has a hardcoded 7-day lookback, so older Moodle data is permanently unreachable.

## Goal

Seed 40 days of realistic, profile-matched `lms_sessions` data for all 20 test students,
replacing the stale 5-day Moodle window with a full 40-day history.

## Design

### Script: `backend/scripts/seedLmsSessions.js`

**Inputs:** DB pool (via environment), `student_profiles.simulated_profile`
**Outputs:** Populated `lms_sessions`, updated `lms_baselines`, scores, and LMS judgments

**Per-student steps:**
1. Query `student_profiles` for `simulated_profile` (already set by migration 008)
2. `DELETE FROM lms_sessions WHERE user_id = $1` — clean slate
3. Call `generateMockRestData(profile, 40)` → `aggregateToDaily()` (same pipeline as real sync)
4. Upsert all resulting rows into `lms_sessions` with `is_simulated = true`
5. Recompute `lms_baselines` using profile-driven formula (matches `simulateUserData`)
6. Call `computeAllScores(userId)` — triggers scoring pipeline
7. Call `computeJudgments(pool, userId, 40)` — refreshes chatbot annotations

**Target users:** Only `test[0-9]+@example.com` pattern — never touches real users.

### Profile Distribution (from migration 008)

| Profile | Users |
|---------|-------|
| `high_achiever` | test1, test4, test7, test10, test13, test16, test19 |
| `average` | test2, test5, test8, test11, test14, test17, test20 |
| `low_achiever` | test3, test6, test9, test12, test15, test18 |

### Data Handling

- Existing Feb 22–27 real Moodle data is **deleted** (clean slate, no mixing of real/sim)
- `is_simulated = true` on all inserted rows
- `ON CONFLICT (user_id, session_date) DO UPDATE` handles any re-runs

### Usage

```bash
node backend/scripts/seedLmsSessions.js
```

No flags needed. Uses the same `.env` as the backend.
