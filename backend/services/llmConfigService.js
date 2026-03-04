import pool from '../config/database.js'
import logger from '../utils/logger.js'

function envFallback() {
    return {
        provider:    process.env.LLM_PROVIDER    || 'lmstudio',
        baseUrl:     process.env.LLM_BASE_URL     || 'http://host.docker.internal:1234',
        mainModel:   process.env.LLM_MAIN_MODEL   || 'hermes-3-llama-3.2-3b',
        judgeModel:  process.env.LLM_JUDGE_MODEL  || 'qwen2.5-3b-instruct',
        maxTokens:   parseInt(process.env.LLM_MAX_TOKENS  || '2000', 10),
        temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
        timeoutMs:   parseInt(process.env.LLM_TIMEOUT_MS  || '30000', 10),
        apiKey:      process.env.LLM_API_KEY       || ''
    }
}

export async function getLlmConfig() {
    try {
        const { rows } = await pool.query(
            `SELECT provider, base_url, main_model, judge_model,
                    max_tokens, temperature, timeout_ms, api_key
             FROM public.llm_config
             ORDER BY updated_at DESC LIMIT 1`
        )

        if (rows.length === 0) return envFallback()

        const row = rows[0]
        return {
            provider:    row.provider,
            baseUrl:     row.base_url,
            mainModel:   row.main_model,
            judgeModel:  row.judge_model,
            maxTokens:   row.max_tokens,
            temperature: parseFloat(row.temperature),
            timeoutMs:   row.timeout_ms,
            apiKey:      row.api_key ?? ''
        }
    } catch (err) {
        logger.warn('getLlmConfig: DB error, falling back to env vars:', err.message)
        return envFallback()
    }
}
