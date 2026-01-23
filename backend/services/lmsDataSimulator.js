// LMS Data Simulator
// Generates realistic simulated LMS data based on student achievement profile
// Uses the unified simulated_profile (high_achiever/average/low_achiever) system
// Each subject (subject_1 to subject_4) is simulated independently but coherently

import logger from '../utils/logger.js';
import { computeJudgments } from './lmsJudgmentService.js';

// =============================================================================
// PROFILE-BASED LMS PATTERNS
// =============================================================================

const LMS_PATTERNS = {
    high_achiever: {
        total_active_minutes: { base: 80, variance: 20 },   // High engagement
        sessions_per_week: { base: 6, variance: 1 },        // Consistent
        avg_session_length: { base: 45, variance: 15 },     // Focused sessions
        action_mix: {
            passive_ratio: { base: 0.40, variance: 0.10 },  // Balanced (40% passive)
            practice_events: { base: 5, variance: 2 },      // High practice
            discussion_posts: { base: 3, variance: 2 }      // High participation
        }
    },
    average: {
        total_active_minutes: { base: 50, variance: 20 },   // Moderate engagement
        sessions_per_week: { base: 4, variance: 1 },        // Mixed consistency
        avg_session_length: { base: 30, variance: 15 },     // Moderate length
        action_mix: {
            passive_ratio: { base: 0.70, variance: 0.15 },  // Mostly passive
            practice_events: { base: 2, variance: 2 },      // Moderate practice
            discussion_posts: { base: 1, variance: 1 }      // Low/Moderate participation
        }
    },
    low_achiever: {
        total_active_minutes: { base: 20, variance: 15 },   // Low engagement
        sessions_per_week: { base: 2, variance: 1 },        // Inconsistent
        avg_session_length: { base: 15, variance: 10 },     // Short/Fragmented
        action_mix: {
            passive_ratio: { base: 0.90, variance: 0.10 },  // Very passive
            practice_events: { base: 0, variance: 1 },      // Low/No practice
            discussion_posts: { base: 0, variance: 0 }      // No participation
        }
    }
};

const DEFAULT_PROFILE = 'average';

// =============================================================================
// DATA GENERATION UTILITIES
// =============================================================================

function addVariance(base, variance) {
    const offset = (Math.random() - 0.5) * 2 * variance;
    return Math.max(0, Math.round(base + offset));
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// =============================================================================
// MAIN SIMULATION FUNCTIONS
// =============================================================================

/**
 * Generate simulated LMS data for a user across all 4 subjects
 */
async function generateLMSData(pool, userId, days = 7, profileOverride = null) {
    logger.info(`Generating ${days} days of LMS data for user ${userId}`);

    // Determine profile
    let profile = profileOverride;
    if (!profile) {
        profile = await getProfile(pool, userId);
    }
    if (!profile) {
        profile = DEFAULT_PROFILE;
    }

    const pattern = LMS_PATTERNS[profile] || LMS_PATTERNS[DEFAULT_PROFILE];
    logger.info(`Using LMS pattern: ${profile}`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Loop through subjects 1-4
    for (let subjectId = 1; subjectId <= 4; subjectId++) {
        // Add slight variance per subject so they aren't identical
        // e.g., Subject 2 might be harder (less active?) or favorite (more active)
        const subjectModifier = 1.0 + (Math.random() * 0.4 - 0.2); // +/- 20%

        let activeDaysCount = 0;

        // Determine which days are active based on frequency
        // We simulate "sessions_per_week" by randomly picking active dates
        const daysIndices = Array.from({ length: days }, (_, i) => i);
        // Shuffle indices
        for (let i = daysIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [daysIndices[i], daysIndices[j]] = [daysIndices[j], daysIndices[i]];
        }

        const targetActiveDays = clamp(addVariance(pattern.sessions_per_week.base, pattern.sessions_per_week.variance), 0, days);
        const activeDatesSet = new Set(daysIndices.slice(0, targetActiveDays));

        // Generate daily data
        for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
            // Is this day active?
            if (!activeDatesSet.has(dayOffset)) {
                // Insert empty record for comprehensive tracking if needed, 
                // but usually we strictly track *activity*. 
                // Let's assume we skip DB insert if 0 activity to save space, 
                // OR insert 0-values if the judgment service expects contiguous dates.
                // The judgment query sums over the period, so missing rows = 0 activity.
                continue;
            }

            const sessionDate = new Date(today);
            sessionDate.setDate(sessionDate.getDate() - dayOffset);

            // Generate daily metrics
            const dailyModifier = Math.random() * 0.5 + 0.75; // Daily fluctuation

            const totalMin = Math.round(addVariance(pattern.total_active_minutes.base, pattern.total_active_minutes.variance) * subjectModifier * dailyModifier);
            const numSessions = Math.max(1, Math.round(totalMin / (pattern.avg_session_length.base || 20))); // approx sessions

            // Distribute minutes into actions
            const passiveRatio = clamp(pattern.action_mix.passive_ratio.base + (Math.random() * 0.1 - 0.05), 0, 1);
            const passiveMin = Math.round(totalMin * passiveRatio);
            const activeMin = totalMin - passiveMin;

            // Split passive into reading/watching
            const readingMin = Math.round(passiveMin * (0.4 + Math.random() * 0.4)); // 40-80% reading
            const watchingMin = passiveMin - readingMin;

            // Events
            const practiceEvents = addVariance(pattern.action_mix.practice_events.base, pattern.action_mix.practice_events.variance);
            const assignmentEvents = Math.round(practiceEvents * 0.5); // Assume some assignment work

            // Discussion (rarely daily, so low chance)
            let forumPosts = 0;
            if (Math.random() < 0.3) { // 30% chance of posting on an active day
                forumPosts = addVariance(pattern.action_mix.discussion_posts.base, pattern.action_mix.discussion_posts.variance);
            }
            const forumViews = forumPosts * 3 + Math.round(Math.random() * 5);

            // Insert into DB
            await pool.query(
                `INSERT INTO public.lms_sessions 
                 (user_id, subject_id, session_date, total_active_minutes, total_events, 
                  number_of_sessions, longest_session_minutes, days_active_in_period,
                  reading_minutes, watching_minutes, exercise_practice_events, 
                  assignment_work_events, forum_views, forum_posts, is_simulated)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                 ON CONFLICT (user_id, subject_id, session_date) DO NOTHING`,
                [userId, subjectId, sessionDate, totalMin,
                    practiceEvents + assignmentEvents + forumViews + forumPosts + 5, // total_events approx
                    numSessions, Math.round(totalMin / numSessions * 1.2), // longest slightly > avg
                    1, // days_active_in_period (always 1 for a daily record)
                    readingMin, watchingMin, practiceEvents, assignmentEvents, forumViews, forumPosts, true]
            );
        }

        // Compute Baseline (simple initial set)
        await pool.query(
            `INSERT INTO public.lms_baselines (user_id, subject_id, baseline_active_minutes, baseline_sessions, baseline_days_active)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, subject_id) DO NOTHING`,
            [userId, subjectId, pattern.total_active_minutes.base * 7, pattern.sessions_per_week.base, 7]
            // NOTE: baseline_active_minutes in judgment service compares to TOTAL allowed? 
            // Wait, evaluateActivityVolume compares metrics.total vs baseline. 
            // If metrics is SUM(7 days), then baseline should be Weekly Baseline.
            // pattern.total_active_minutes is DAILY avg? Yes.
            // So baseline for 7 days = daily * 7? 
            // Actually let's look at getOrCreateBaseline logic in other services...
            // They usually store "average daily" and the judgment scales it?
            // Re-reading lmsJudgmentService: 
            // evaluateActivityVolume: ratio = metrics.total_active_minutes / baseline.baseline_active_minutes
            // If metrics is 7-day SUM, then baseline must be 7-day SUM capacity.
            // Let's set it to pattern daily * 7 ~ weekly expected volume.
        );

        // Compute Judgments for this subject
        await computeJudgments(pool, userId, subjectId, 7);
    }
}

async function getProfile(pool, userId) {
    const { rows } = await pool.query(
        `SELECT simulated_profile FROM public.student_profiles WHERE user_id = $1`,
        [userId]
    );
    return rows.length > 0 ? rows[0].simulated_profile : null;
}

export {
    generateLMSData
};
