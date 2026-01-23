// Sleep Judgment Service
// Rule-based computation engine that generates human-readable sleep judgments
// Modeled after annotationService.js

// =============================================================================
// THRESHOLD CONFIGURATION (Configurable, no magic numbers)
// =============================================================================

/**
 * Duration thresholds (as percentage of baseline)
 * < 75% = very low, 75-90% = low, 90-110% = sufficient, > 110% = long
 */
const DURATION_THRESHOLDS = {
    very_low: 0.75,
    low: 0.90,
    sufficient: 1.10,
    long: 1.10
};

/**
 * Continuity thresholds
 * Awakenings and awake minutes determine sleep quality
 */
const CONTINUITY_THRESHOLDS = {
    continuous: { awakenings: 2, awake_minutes: 10 },
    minor: { awakenings: 5, awake_minutes: 30 }
    // Above minor = fragmented
};

/**
 * Sleep stages thresholds
 * Restorative sleep = deep + REM as percentage of total
 */
const STAGES_THRESHOLDS = {
    restorative_percent: 0.35, // deep + rem should be >= 35% of total
    individual_deficit: 0.20   // 20% below baseline = warning
};

/**
 * Timing thresholds (deviation in minutes from baseline)
 */
const TIMING_THRESHOLDS = {
    consistent: 30,  // < 30 min = consistent
    irregular: 60    // 30-60 = irregular, > 60 = inconsistent
};

// =============================================================================
// JUDGMENT DOMAIN EVALUATORS
// =============================================================================

/**
 * Evaluate sleep duration relative to baseline
 * @param {Object} session - Sleep session data
 * @param {Object} baseline - User's baseline metrics
 * @returns {Object} - Judgment object
 */
function evaluateDuration(session, baseline) {
    const ratio = session.total_sleep_minutes / baseline.avg_total_sleep_minutes;

    if (ratio < DURATION_THRESHOLDS.very_low) {
        return {
            judgment_key: 'sleep_time_very_low',
            severity: 'poor',
            explanation: 'Sleep time was very low',
            explanation_llm: `Sleep duration was very low (${session.total_sleep_minutes} minutes, only ${Math.round(ratio * 100)}% of the usual ${Math.round(baseline.avg_total_sleep_minutes)} minutes). This significant sleep deficit may affect alertness, mood, and cognitive performance.`
        };
    }

    if (ratio < DURATION_THRESHOLDS.low) {
        return {
            judgment_key: 'sleep_time_low',
            severity: 'warning',
            explanation: 'Sleep time was slightly low',
            explanation_llm: `Sleep duration was slightly below normal (${session.total_sleep_minutes} minutes, ${Math.round(ratio * 100)}% of the usual ${Math.round(baseline.avg_total_sleep_minutes)} minutes). A bit more rest might help with focus and energy levels.`
        };
    }

    if (ratio <= DURATION_THRESHOLDS.sufficient) {
        return {
            judgment_key: 'sleep_time_sufficient',
            severity: 'ok',
            explanation: 'Sleep time was sufficient',
            explanation_llm: `Sleep duration was within the healthy range (${session.total_sleep_minutes} minutes, close to the usual ${Math.round(baseline.avg_total_sleep_minutes)} minutes). Good job maintaining consistent sleep duration.`
        };
    }

    // ratio > sufficient = long sleep
    return {
        judgment_key: 'sleep_time_long',
        severity: 'ok',
        explanation: 'Sleep duration was longer than usual',
        explanation_llm: `Sleep duration was longer than usual (${session.total_sleep_minutes} minutes, ${Math.round(ratio * 100)}% of the typical ${Math.round(baseline.avg_total_sleep_minutes)} minutes). This could indicate the body catching up on rest or deeper recovery.`
    };
}

/**
 * Evaluate sleep continuity (interruptions)
 * @param {Object} session - Sleep session data
 * @returns {Object} - Judgment object
 */
function evaluateContinuity(session) {
    const { awakenings_count, awake_minutes } = session;

    // Check for continuous sleep
    if (awakenings_count <= CONTINUITY_THRESHOLDS.continuous.awakenings &&
        awake_minutes < CONTINUITY_THRESHOLDS.continuous.awake_minutes) {
        return {
            judgment_key: 'sleep_continuous',
            severity: 'ok',
            explanation: 'Sleep was continuous',
            explanation_llm: `Sleep was continuous with minimal interruptions (${awakenings_count} awakenings, ${awake_minutes} minutes awake). This indicates good sleep quality and efficient rest.`
        };
    }

    // Check for minor interruptions
    if (awakenings_count <= CONTINUITY_THRESHOLDS.minor.awakenings &&
        awake_minutes <= CONTINUITY_THRESHOLDS.minor.awake_minutes) {
        return {
            judgment_key: 'sleep_minor_interruptions',
            severity: 'warning',
            explanation: 'Sleep had minor interruptions',
            explanation_llm: `Sleep had some interruptions (${awakenings_count} awakenings, ${awake_minutes} minutes awake). While not severe, this may slightly reduce the restorative quality of sleep.`
        };
    }

    // Check for high awakenings specifically
    if (awakenings_count > CONTINUITY_THRESHOLDS.minor.awakenings) {
        return {
            judgment_key: 'sleep_multiple_awakenings',
            severity: 'poor',
            explanation: 'Sleep was discontinued multiple times',
            explanation_llm: `Sleep was interrupted frequently (${awakenings_count} awakenings, ${awake_minutes} minutes awake). Frequent awakenings can prevent reaching deeper, more restorative sleep stages.`
        };
    }

    // Fragmented due to total awake time
    return {
        judgment_key: 'sleep_fragmented',
        severity: 'poor',
        explanation: 'Sleep was fragmented',
        explanation_llm: `Sleep was fragmented with significant time spent awake (${awakenings_count} awakenings, ${awake_minutes} minutes awake). This level of disruption typically reduces sleep quality and next-day energy.`
    };
}

/**
 * Evaluate sleep stages (quality proxy)
 * @param {Object} session - Sleep session data
 * @param {Object} baseline - User's baseline metrics
 * @returns {Object} - Judgment object
 */
function evaluateStages(session, baseline) {
    const totalSleep = session.total_sleep_minutes;
    if (totalSleep === 0) {
        return {
            judgment_key: 'restorative_sleep_unknown',
            severity: 'warning',
            explanation: 'Sleep stages could not be evaluated',
            explanation_llm: 'Sleep duration was too short to evaluate sleep stages properly.'
        };
    }

    const deepPercent = (session.deep_sleep_minutes / totalSleep) * 100;
    const remPercent = (session.rem_sleep_minutes / totalSleep) * 100;
    const restorativePercent = (session.deep_sleep_minutes + session.rem_sleep_minutes) / totalSleep;

    // Check overall restorative percentage
    if (restorativePercent < STAGES_THRESHOLDS.restorative_percent) {
        return {
            judgment_key: 'restorative_sleep_low',
            severity: 'poor',
            explanation: 'Restorative sleep was low',
            explanation_llm: `Restorative sleep (deep + REM) was only ${Math.round(restorativePercent * 100)}% of total sleep, below the healthy threshold of 35%. Deep sleep helps physical recovery, while REM supports memory and learning.`
        };
    }

    // Check individual stage deficits against baseline
    const deepDeficit = deepPercent < (baseline.avg_deep_percent * (1 - STAGES_THRESHOLDS.individual_deficit));
    const remDeficit = remPercent < (baseline.avg_rem_percent * (1 - STAGES_THRESHOLDS.individual_deficit));

    if (deepDeficit && remDeficit) {
        return {
            judgment_key: 'both_stages_low',
            severity: 'warning',
            explanation: 'Both deep and REM sleep were below normal',
            explanation_llm: `Both deep sleep (${Math.round(deepPercent)}%) and REM sleep (${Math.round(remPercent)}%) were below your usual levels. This combination may affect both physical recovery and cognitive function.`
        };
    }

    if (deepDeficit) {
        return {
            judgment_key: 'deep_sleep_low',
            severity: 'warning',
            explanation: 'Deep sleep was low',
            explanation_llm: `Deep sleep was ${Math.round(deepPercent)}% of total sleep, below your usual ${Math.round(baseline.avg_deep_percent)}%. Deep sleep is important for physical recovery and immune function.`
        };
    }

    if (remDeficit) {
        return {
            judgment_key: 'rem_sleep_low',
            severity: 'warning',
            explanation: 'REM sleep was low',
            explanation_llm: `REM sleep was ${Math.round(remPercent)}% of total sleep, below your usual ${Math.round(baseline.avg_rem_percent)}%. REM sleep is important for memory consolidation and learning.`
        };
    }

    // Balanced stages
    return {
        judgment_key: 'stages_balanced',
        severity: 'ok',
        explanation: 'Sleep stages were balanced',
        explanation_llm: `Sleep stages were well balanced with ${Math.round(deepPercent)}% deep sleep and ${Math.round(remPercent)}% REM sleep. This indicates good quality restorative sleep.`
    };
}

/**
 * Convert timestamp to decimal hours (e.g., 11:30 PM = 23.5)
 */
function timeToDecimalHours(timestamp) {
    const date = new Date(timestamp);
    return date.getHours() + (date.getMinutes() / 60);
}

/**
 * Calculate time deviation in minutes, handling day wraparound
 */
function calculateTimeDeviation(actualHour, baselineHour) {
    // Convert to minutes
    const actualMinutes = actualHour * 60;
    const baselineMinutes = baselineHour * 60;

    // Calculate deviation, accounting for day wraparound
    let deviation = Math.abs(actualMinutes - baselineMinutes);
    if (deviation > 12 * 60) {
        deviation = 24 * 60 - deviation; // Handle wraparound
    }

    return deviation;
}

/**
 * Evaluate sleep timing and consistency
 * @param {Object} session - Sleep session data
 * @param {Object} baseline - User's baseline metrics
 * @returns {Object} - Judgment object
 */
function evaluateTiming(session, baseline) {
    const bedtimeHour = timeToDecimalHours(session.bedtime);
    const wakeTimeHour = timeToDecimalHours(session.wake_time);

    const bedtimeDeviation = calculateTimeDeviation(bedtimeHour, baseline.avg_bedtime_hour);
    const wakeDeviation = calculateTimeDeviation(wakeTimeHour, baseline.avg_wake_time_hour);

    // Use the larger deviation
    const maxDeviation = Math.max(bedtimeDeviation, wakeDeviation);

    if (maxDeviation < TIMING_THRESHOLDS.consistent) {
        return {
            judgment_key: 'schedule_consistent',
            severity: 'ok',
            explanation: 'Sleep schedule was consistent',
            explanation_llm: `Sleep schedule was consistent with usual patterns. Bedtime and wake time were within ${Math.round(maxDeviation)} minutes of the normal schedule. Consistent timing helps maintain healthy circadian rhythms.`
        };
    }

    if (maxDeviation <= TIMING_THRESHOLDS.irregular) {
        // Determine which was off
        const issue = bedtimeDeviation > wakeDeviation ? 'bedtime' : 'wake time';
        return {
            judgment_key: 'timing_slightly_irregular',
            severity: 'warning',
            explanation: 'Sleep timing was slightly irregular',
            explanation_llm: `Sleep timing was slightly irregular, with ${issue} shifted by about ${Math.round(maxDeviation)} minutes from the usual schedule. Small variations are normal, but consistency generally improves sleep quality.`
        };
    }

    // > 60 minutes deviation
    const issue = bedtimeDeviation > wakeDeviation ? 'Bedtime' : 'Wake time';
    return {
        judgment_key: 'schedule_inconsistent',
        severity: 'poor',
        explanation: 'Sleep schedule was inconsistent',
        explanation_llm: `Sleep schedule was significantly inconsistent. ${issue} was about ${Math.round(maxDeviation)} minutes off from the usual pattern. Large timing shifts can disrupt circadian rhythm and reduce sleep quality.`
    };
}

// =============================================================================
// MAIN COMPUTATION FUNCTIONS
// =============================================================================

/**
 * Compute and store all judgments for a sleep session
 * @param {Object} pool - Database connection pool
 * @param {string} sessionId - Sleep session ID
 * @returns {Array} - Array of judgment objects
 */
async function computeJudgments(pool, sessionId) {
    // Get the session
    const sessionResult = await pool.query(
        `SELECT * FROM public.sleep_sessions WHERE id = $1`,
        [sessionId]
    );

    if (sessionResult.rows.length === 0) {
        throw new Error(`Sleep session ${sessionId} not found`);
    }

    const session = sessionResult.rows[0];
    const userId = session.user_id;

    // Get or create baseline
    let baseline = await getOrCreateBaseline(pool, userId);

    // Compute all judgments
    const judgments = [
        { domain: 'duration', ...evaluateDuration(session, baseline) },
        { domain: 'continuity', ...evaluateContinuity(session) },
        { domain: 'stages', ...evaluateStages(session, baseline) },
        { domain: 'timing', ...evaluateTiming(session, baseline) }
    ];

    // Store judgments
    for (const judgment of judgments) {
        await pool.query(
            `INSERT INTO public.sleep_judgments 
             (user_id, session_id, domain, judgment_key, severity, explanation, explanation_llm, computed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (session_id, domain)
             DO UPDATE SET
               judgment_key = EXCLUDED.judgment_key,
               severity = EXCLUDED.severity,
               explanation = EXCLUDED.explanation,
               explanation_llm = EXCLUDED.explanation_llm,
               computed_at = NOW()`,
            [userId, sessionId, judgment.domain, judgment.judgment_key, judgment.severity, judgment.explanation, judgment.explanation_llm]
        );
    }

    return judgments;
}

/**
 * Get or create baseline for a user
 * @param {Object} pool - Database connection pool
 * @param {string} userId - User ID
 * @returns {Object} - Baseline object
 */
async function getOrCreateBaseline(pool, userId) {
    const { rows } = await pool.query(
        `SELECT * FROM public.sleep_baselines WHERE user_id = $1`,
        [userId]
    );

    if (rows.length > 0) {
        return rows[0];
    }

    // Create default baseline
    await pool.query(
        `INSERT INTO public.sleep_baselines (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
    );

    const result = await pool.query(
        `SELECT * FROM public.sleep_baselines WHERE user_id = $1`,
        [userId]
    );

    return result.rows[0];
}

/**
 * Recompute baseline from recent sessions
 * @param {Object} pool - Database connection pool
 * @param {string} userId - User ID
 * @param {number} days - Number of days to include (default 7)
 */
async function recomputeBaseline(pool, userId, days = 7) {
    const { rows } = await pool.query(
        `SELECT 
           AVG(total_sleep_minutes) as avg_total,
           AVG(EXTRACT(HOUR FROM bedtime) + EXTRACT(MINUTE FROM bedtime)/60.0) as avg_bedtime,
           AVG(EXTRACT(HOUR FROM wake_time) + EXTRACT(MINUTE FROM wake_time)/60.0) as avg_wake,
           AVG(CASE WHEN total_sleep_minutes > 0 THEN deep_sleep_minutes * 100.0 / total_sleep_minutes ELSE 0 END) as avg_deep,
           AVG(CASE WHEN total_sleep_minutes > 0 THEN rem_sleep_minutes * 100.0 / total_sleep_minutes ELSE 0 END) as avg_rem,
           COUNT(*) as sessions_count
         FROM public.sleep_sessions
         WHERE user_id = $1 AND session_date >= CURRENT_DATE - INTERVAL '${days} days'`,
        [userId]
    );

    if (rows.length === 0 || rows[0].sessions_count === 0) {
        return; // Keep default baseline
    }

    const stats = rows[0];

    await pool.query(
        `INSERT INTO public.sleep_baselines 
         (user_id, avg_total_sleep_minutes, avg_bedtime_hour, avg_wake_time_hour, avg_deep_percent, avg_rem_percent, sessions_count, computed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           avg_total_sleep_minutes = EXCLUDED.avg_total_sleep_minutes,
           avg_bedtime_hour = EXCLUDED.avg_bedtime_hour,
           avg_wake_time_hour = EXCLUDED.avg_wake_time_hour,
           avg_deep_percent = EXCLUDED.avg_deep_percent,
           avg_rem_percent = EXCLUDED.avg_rem_percent,
           sessions_count = EXCLUDED.sessions_count,
           computed_at = NOW()`,
        [userId, stats.avg_total, stats.avg_bedtime, stats.avg_wake, stats.avg_deep, stats.avg_rem, stats.sessions_count]
    );
}

// =============================================================================
// CHATBOT INTEGRATION FUNCTIONS
// =============================================================================

/**
 * Get formatted sleep judgments for chatbot prompt
 * Similar to getAnnotationsForChatbot in annotationService.js
 * 
 * @param {Object} pool - Database connection pool
 * @param {string} userId - User ID
 * @returns {string} - Formatted markdown for prompt assembly
 */
async function getJudgmentsForChatbot(pool, userId) {
    // Get recent judgments (last 7 days)
    const { rows: judgments } = await pool.query(
        `SELECT sj.*, ss.session_date
         FROM public.sleep_judgments sj
         JOIN public.sleep_sessions ss ON sj.session_id = ss.id
         WHERE sj.user_id = $1 AND ss.session_date >= CURRENT_DATE - INTERVAL '7 days'
         ORDER BY ss.session_date DESC, sj.domain`,
        [userId]
    );

    if (judgments.length === 0) {
        return 'No sleep data available for this student.';
    }

    // Group by recency
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const last24h = judgments.filter(j => {
        const sessionDate = new Date(j.session_date);
        const diffDays = Math.floor((today - sessionDate) / (1000 * 60 * 60 * 24));
        return diffDays <= 1;
    });

    const last7d = judgments;

    let result = '## Sleep Analysis\n\n';

    // Most recent night
    if (last24h.length > 0) {
        result += '### Last Night:\n';
        // Group by unique session
        const recentSession = last24h.filter(j => j.session_date === last24h[0].session_date);
        recentSession.forEach(j => {
            result += `- ${j.explanation_llm}\n`;
        });
        result += '\n';
    }

    // Weekly summary (aggregate severity counts)
    const severityCounts = { ok: 0, warning: 0, poor: 0 };
    last7d.forEach(j => severityCounts[j.severity]++);

    const totalJudgments = last7d.length;
    const uniqueDays = new Set(last7d.map(j => j.session_date)).size;

    if (uniqueDays > 1) {
        result += `### Past 7 Days (${uniqueDays} nights tracked):\n`;

        if (severityCounts.poor > 0) {
            const poorJudgments = last7d.filter(j => j.severity === 'poor');
            const poorDomains = [...new Set(poorJudgments.map(j => j.domain))];
            result += `- Areas needing attention: ${poorDomains.join(', ')}\n`;
        }

        if (severityCounts.warning > 0) {
            const warningJudgments = last7d.filter(j => j.severity === 'warning');
            const warningDomains = [...new Set(warningJudgments.map(j => j.domain))];
            result += `- Minor concerns in: ${warningDomains.join(', ')}\n`;
        }

        if (severityCounts.ok > totalJudgments * 0.7) {
            result += `- Overall sleep quality has been good\n`;
        } else if (severityCounts.poor > totalJudgments * 0.3) {
            result += `- Sleep quality could use improvement\n`;
        }
    }

    return result;
}

/**
 * Check if a user has any sleep data
 * @param {Object} pool - Database connection pool
 * @param {string} userId - User ID
 * @returns {Promise<boolean>}
 */
async function hasSleepData(pool, userId) {
    const { rows } = await pool.query(
        `SELECT COUNT(*) as count FROM public.sleep_sessions WHERE user_id = $1`,
        [userId]
    );
    return parseInt(rows[0].count) > 0;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
    // Main computation
    computeJudgments,
    recomputeBaseline,
    getOrCreateBaseline,

    // Chatbot integration
    getJudgmentsForChatbot,
    hasSleepData,

    // Individual evaluators (for testing)
    evaluateDuration,
    evaluateContinuity,
    evaluateStages,
    evaluateTiming,

    // Thresholds (for testing/configuration)
    DURATION_THRESHOLDS,
    CONTINUITY_THRESHOLDS,
    STAGES_THRESHOLDS,
    TIMING_THRESHOLDS
};
