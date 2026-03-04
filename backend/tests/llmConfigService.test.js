import { jest } from '@jest/globals'

const mockQuery = jest.fn()

jest.unstable_mockModule('../config/database.js', () => ({
    default: { query: mockQuery }
}))
jest.unstable_mockModule('../utils/logger.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}))

const { getLlmConfig, _resetCacheForTesting } = await import('../services/llmConfigService.js')

describe('getLlmConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        _resetCacheForTesting()
    })

    it('returns DB row when one exists', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                provider: 'openai',
                base_url: 'https://api.openai.com/v1',
                main_model: 'gpt-4o-mini',
                judge_model: 'gpt-4o-mini',
                max_tokens: 1000,
                temperature: 0.5,
                timeout_ms: 15000,
                api_key: 'sk-test'
            }]
        })

        const cfg = await getLlmConfig()
        expect(cfg.provider).toBe('openai')
        expect(cfg.baseUrl).toBe('https://api.openai.com/v1')
        expect(cfg.mainModel).toBe('gpt-4o-mini')
        expect(cfg.apiKey).toBe('sk-test')
    })

    it('falls back to env vars when DB is empty', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] })
        process.env.LLM_PROVIDER = 'lmstudio'
        process.env.LLM_BASE_URL = 'http://localhost:1234'
        process.env.LLM_MAIN_MODEL = 'my-model'
        process.env.LLM_JUDGE_MODEL = 'judge-model'
        process.env.LLM_MAX_TOKENS = '2000'
        process.env.LLM_TEMPERATURE = '0.7'
        process.env.LLM_TIMEOUT_MS = '30000'
        process.env.LLM_API_KEY = ''

        const cfg = await getLlmConfig()
        expect(cfg.provider).toBe('lmstudio')
        expect(cfg.baseUrl).toBe('http://localhost:1234')
        expect(cfg.mainModel).toBe('my-model')
    })

    it('falls back to env vars when DB query throws', async () => {
        mockQuery.mockRejectedValueOnce(new Error('DB down'))
        process.env.LLM_PROVIDER = 'lmstudio'
        process.env.LLM_BASE_URL = 'http://localhost:1234'
        process.env.LLM_MAIN_MODEL = 'fallback-model'
        process.env.LLM_JUDGE_MODEL = 'judge'
        process.env.LLM_MAX_TOKENS = '2000'
        process.env.LLM_TEMPERATURE = '0.7'
        process.env.LLM_TIMEOUT_MS = '30000'
        process.env.LLM_API_KEY = ''

        const cfg = await getLlmConfig()
        expect(cfg.mainModel).toBe('fallback-model')
    })
})
