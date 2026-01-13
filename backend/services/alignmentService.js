// Alignment Service
// Validates LLM responses using LLM-as-a-Judge pattern
// Uses deepseek-r1-distill-qwen-7b for evaluation

import logger from '../utils/logger.js'
import { judgeResponse } from './apiConnectorService.js'

// Configuration
const MAX_ALIGNMENT_RETRIES = 2
const FALLBACK_MESSAGE = "I'm having trouble responding right now. Please try rephrasing your question."

/**
 * Check if a response aligns with the system instructions
 * 
 * @param {string} userQuery - The user's original question
 * @param {string} response - The LLM's response to evaluate
 * @param {string} systemInstructions - The admin's system prompt
 * @returns {Promise<{passed: boolean, reason: string}>}
 */
async function checkAlignment(userQuery, response, systemInstructions) {
    logger.info('Checking alignment for response')

    try {
        const result = await judgeResponse(userQuery, response, systemInstructions)
        logger.info(`Alignment check: ${result.passed ? 'PASSED' : 'FAILED'} - ${result.reason}`)
        return result
    } catch (error) {
        logger.error('Alignment check failed:', error.message)
        // On error, we're cautious and mark as failed
        return { passed: false, reason: `Alignment check error: ${error.message}` }
    }
}

/**
 * Get a response with alignment checking and retry logic
 * This wraps the LLM chat and ensures responses pass alignment
 * 
 * @param {Function} generateResponse - Function that generates a response (returns Promise<string>)
 * @param {string} userQuery - The user's original question
 * @param {string} systemInstructions - The admin's system prompt
 * @returns {Promise<{content: string, passed: boolean, retries: number}>}
 */
async function getAlignedResponse(generateResponse, userQuery, systemInstructions) {
    let retries = 0
    let lastResponse = ''
    let lastReason = ''

    while (retries <= MAX_ALIGNMENT_RETRIES) {
        try {
            // Generate response
            const response = await generateResponse()
            lastResponse = response

            // Check alignment
            const alignmentResult = await checkAlignment(userQuery, response, systemInstructions)

            if (alignmentResult.passed) {
                return {
                    content: response,
                    passed: true,
                    retries
                }
            }

            lastReason = alignmentResult.reason
            logger.warn(`Alignment failed (attempt ${retries + 1}/${MAX_ALIGNMENT_RETRIES + 1}): ${lastReason}`)
            retries++

        } catch (error) {
            logger.error(`Response generation failed (attempt ${retries + 1}):`, error.message)
            retries++
        }
    }

    // All retries exhausted - return fallback message
    logger.error(`All alignment retries exhausted. Last reason: ${lastReason}`)
    return {
        content: FALLBACK_MESSAGE,
        passed: false,
        retries: retries
    }
}

/**
 * Quick validation for obviously problematic content
 * This is a fast pre-check before full LLM alignment
 * 
 * @param {string} response - Response to check
 * @returns {{passed: boolean, reason: string}}
 */
function quickValidation(response) {
    if (!response || response.trim().length === 0) {
        return { passed: false, reason: 'Empty response' }
    }

    // Check for accidentally exposed internal markers
    const internalMarkers = [
        'SYSTEM PROMPT',
        'ADMIN INSTRUCTIONS',
        'ANNOTATED QUESTIONNAIRE',
        'ALIGNMENT CHECK',
        '```json',  // Raw JSON output
        'user_id:',
        'session_id:'
    ]

    for (const marker of internalMarkers) {
        if (response.includes(marker)) {
            return { passed: false, reason: `Response contains internal marker: ${marker}` }
        }
    }

    return { passed: true, reason: 'Quick validation passed' }
}

export {
    checkAlignment,
    getAlignedResponse,
    quickValidation,
    MAX_ALIGNMENT_RETRIES,
    FALLBACK_MESSAGE
}
