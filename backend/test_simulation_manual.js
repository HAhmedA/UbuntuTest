// Verification script for SRL + Sleep Simulator Orchestration
import pool from './config/database.js';
import { generateStudentData } from './services/simulationOrchestratorService.js';
import { randomUUID } from 'crypto';

async function runTest() {
    console.log('--- STARTING SIMULATION TEST ---');

    // 1. Create a test user
    const userId = randomUUID();
    const email = `simtest_${Date.now()}@example.com`;

    try {
        await pool.query(
            'INSERT INTO public.users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)',
            [userId, email, 'Simulation Test User', 'hash']
        );
        console.log(`Created test user: ${userId} (${email})`);

        // 2. Run Orchestrator
        console.log('Running orchestrator...');
        const profile = await generateStudentData(pool, userId);
        console.log(`Orchestrator finished. Assigned profile: ${profile}`);

        // 3. Verify Sleep Data
        const sleepRes = await pool.query('SELECT COUNT(*) as count, AVG(total_sleep_minutes) as avg_sleep FROM public.sleep_sessions WHERE user_id = $1', [userId]);
        console.log(`Sleep Sessions: ${sleepRes.rows[0].count} (Avg: ${Math.round(sleepRes.rows[0].avg_sleep)} min)`);

        // 4. Verify SRL Data
        const srlRes = await pool.query('SELECT COUNT(*) as count FROM public.questionnaire_results WHERE user_id = $1', [userId]);
        console.log(`SRL Questionnaires: ${srlRes.rows[0].count}`);

        const annotRes = await pool.query('SELECT concept_key, avg_score, trend FROM public.srl_annotations WHERE user_id = $1 AND time_window = \'7d\'', [userId]);
        console.log('SRL Annotations (7d):');
        annotRes.rows.forEach(row => {
            console.log(`- ${row.concept_key}: ${Number(row.avg_score).toFixed(1)} (${row.trend})`);
        });

        // 5. profiles table
        const profRes = await pool.query('SELECT simulated_profile FROM public.student_profiles WHERE user_id = $1', [userId]);
        console.log(`Stored Profile in DB: ${profRes.rows[0]?.simulated_profile}`);

        console.log('--- TEST COMPLETE: SUCCESS ---');

    } catch (err) {
        console.error('--- TEST DIED ---', err);
    } finally {
        // Cleanup
        await pool.end();
    }
}

runTest();
