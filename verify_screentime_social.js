
import pg from 'pg';
import { generateScreenTimeData } from './backend/services/screenTimeDataSimulator.js';
import { generateSocialMediaData } from './backend/services/socialMediaDataSimulator.js';
import logger from './backend/utils/logger.js';

const { Pool } = pg;

// Use the same config as the app
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'surveyjs',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
});

async function runVerification() {
    console.log('Starting verification...');

    try {
        // 1. Get a test user (or create one if needed, but we'll use existing)
        const userRes = await pool.query('SELECT id FROM public.users LIMIT 1');
        if (userRes.rows.length === 0) {
            console.error('No users found to test with');
            return;
        }
        const userId = userRes.rows[0].id;
        console.log(`Testing with user ID: ${userId}`);

        // 2. Assign a specific profile for predictable testing
        const profile = 'average';
        await pool.query(
            `INSERT INTO public.student_profiles (user_id, simulated_profile) 
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET simulated_profile = $2`,
            [userId, profile]
        );
        console.log(`Assigned profile: ${profile}`);

        // 3. Generate Screen Time Data
        console.log('Generating Screen Time Data...');
        const screenSessionIds = await generateScreenTimeData(pool, userId, 7, profile);
        console.log(`Generated ${screenSessionIds.length} screen time sessions`);

        // 4. Generate Social Media Data
        console.log('Generating Social Media Data...');
        const socialSessionIds = await generateSocialMediaData(pool, userId, 7, profile);
        console.log(`Generated ${socialSessionIds.length} social media sessions`);

        // 5. Verify Screen Time Judgments
        console.log('Verifying Screen Time Judgments...');
        const screenJudgments = await pool.query(
            `SELECT domain, judgment_key, severity, explanation_llm 
       FROM public.screen_time_judgments 
       WHERE session_id = $1`,
            [screenSessionIds[0]]
        );
        console.log('Sample Screen Time Judgments (Newest Session):');
        screenJudgments.rows.forEach(j => {
            console.log(`- [${j.domain}] ${j.judgment_key} (${j.severity}): ${j.explanation_llm.substring(0, 100)}...`);
        });

        // 6. Verify Social Media Judgments
        console.log('Verifying Social Media Judgments...');
        const socialJudgments = await pool.query(
            `SELECT domain, judgment_key, severity, explanation_llm 
       FROM public.social_media_judgments 
       WHERE session_id = $1`,
            [socialSessionIds[0]]
        );
        console.log('Sample Social Media Judgments (Newest Session):');
        socialJudgments.rows.forEach(j => {
            console.log(`- [${j.domain}] ${j.judgment_key} (${j.severity}): ${j.explanation_llm.substring(0, 100)}...`);
        });

        console.log('Verification Complete!');
    } catch (err) {
        console.error('Verification Failed:', err);
    } finally {
        await pool.end();
    }
}

runVerification();
