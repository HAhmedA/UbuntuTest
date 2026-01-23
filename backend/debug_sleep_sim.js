
import pool from './config/database.js';
import { generateSleepData } from './services/sleepDataSimulator.js';
import logger from './utils/logger.js';

const USER_ID = '4020e3cd-9cd8-49be-982f-ddd4be0d4f0b'; // The problematic user 'terer'

async function run() {
    try {
        console.log(`Starting debug simulation for user ${USER_ID}`);

        // 1. Check profile
        const { rows } = await pool.query('SELECT * FROM student_profiles WHERE user_id = $1', [USER_ID]);
        console.log('User Profile:', rows[0]);

        // 2. Run simulation
        console.log('Calling generateSleepData...');
        await generateSleepData(pool, USER_ID, 7);
        console.log('generateSleepData returned.');

        // 3. Verify results
        const sessions = await pool.query('SELECT session_date, is_simulated FROM sleep_sessions WHERE user_id = $1 ORDER BY session_date', [USER_ID]);
        console.log(`Found ${sessions.rows.length} sessions (Expected ~7)`);
        console.table(sessions.rows);

    } catch (err) {
        console.error('FATAL ERROR:', err);
    } finally {
        pool.end();
    }
}

run();
