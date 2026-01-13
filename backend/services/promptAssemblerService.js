// Prompt Assembler Service
// Combines all data sources into a single system prompt for LLM
// Since API calls are stateless, we include all context every time

import pool from '../config/database.js'
import logger from '../utils/logger.js'
import { getAnnotationsForChatbot } from './annotationService.js'
import { getSummariesForChatbot, hasHistory } from './summarizationService.js'
import { estimateTokens } from './apiConnectorService.js'

// Maximum token budget for context (leaving room for response)
const MAX_CONTEXT_TOKENS = 6000
const MAX_SESSION_MESSAGES = 20

/**
 * Get the current system prompt from admin configuration
 * 
 * @returns {Promise<string>} - System prompt text
 */
async function getSystemPrompt() {
    const { rows } = await pool.query(
        `SELECT prompt FROM public.system_prompts 
         ORDER BY updated_at DESC LIMIT 1`
    )
    return rows.length > 0 ? rows[0].prompt : 'Be helpful and ethical.'
}

/**
 * Get user context from their profile
 * 
 * @param {string} userId - User ID
 * @returns {Promise<string>} - Formatted user context
 */
async function getUserContext(userId) {
    const { rows } = await pool.query(
        `SELECT edu_level, field_of_study, major, learning_formats, disabilities
         FROM public.student_profiles 
         WHERE user_id = $1`,
        [userId]
    )

    if (rows.length === 0) {
        return 'No profile information provided.'
    }

    const profile = rows[0]
    const parts = []

    if (profile.edu_level) {
        parts.push(`- Education level: ${profile.edu_level}`)
    }
    if (profile.field_of_study) {
        parts.push(`- Field of study: ${profile.field_of_study}`)
    }
    if (profile.major) {
        parts.push(`- Major: ${profile.major}`)
    }
    if (profile.learning_formats && profile.learning_formats.length > 0) {
        const formats = Array.isArray(profile.learning_formats)
            ? profile.learning_formats
            : JSON.parse(profile.learning_formats)
        if (formats.length > 0) {
            parts.push(`- Learning preferences: ${formats.join(', ')}`)
        }
    }
    if (profile.disabilities && profile.disabilities.length > 0) {
        const disabilities = Array.isArray(profile.disabilities)
            ? profile.disabilities
            : JSON.parse(profile.disabilities)
        if (disabilities.length > 0) {
            parts.push(`- Accessibility considerations: ${disabilities.join(', ')}`)
        }
    }

    return parts.length > 0 ? parts.join('\n') : 'No specific preferences provided.'
}

/**
 * Get current session messages
 * 
 * @param {string} sessionId - Session ID
 * @param {number} limit - Maximum messages to include
 * @returns {Promise<Array<{role: string, content: string}>>}
 */
async function getSessionMessages(sessionId, limit = MAX_SESSION_MESSAGES) {
    const { rows } = await pool.query(
        `SELECT role, content FROM public.chat_messages 
         WHERE session_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [sessionId, limit]
    )
    // Reverse to get chronological order
    return rows.reverse()
}

/**
 * Assemble the complete prompt for the LLM
 * This is the main function that combines all data sources
 * 
 * @param {string} userId - User ID
 * @param {string} sessionId - Current session ID
 * @param {string} userMessage - Current user message (optional, for new messages)
 * @returns {Promise<Array<{role: string, content: string}>>} - Messages array for LLM
 */
async function assemblePrompt(userId, sessionId, userMessage = null) {
    logger.info(`Assembling prompt for user ${userId}, session ${sessionId}`)

    // Gather all data sources in parallel
    const [systemPrompt, userContext, annotations, summaries] = await Promise.all([
        getSystemPrompt(),
        getUserContext(userId),
        getAnnotationsForChatbot(pool, userId),
        getSummariesForChatbot(userId)
    ])

    // Get current session messages
    const sessionMessages = await getSessionMessages(sessionId)

    // Check if this is a first-time or returning user
    const userHasHistory = await hasHistory(userId)
    const userType = userHasHistory
        ? 'This is a returning student. Build on previous conversations.'
        : 'This is a new student. Start fresh and be welcoming.'

    // Build the assembled system content
    const assembledSystem = `YOU ARE:
A helpful learning support chatbot that assists students with their self-regulated learning journey.

SYSTEM PROMPT (ADMIN INSTRUCTIONS):
${systemPrompt}

ABOUT THE INPUTS:
You will receive information from multiple sources. Each section below serves a specific purpose and must be respected.

USER CONTEXT & PREFERENCES:
${userContext}

ANNOTATED QUESTIONNAIRE INSIGHTS:
${annotations}

PREVIOUS CHATS (SUMMARIZED):
${summaries}

CURRENT SESSION CONTEXT:
${userType}
The following messages represent the current conversation. Answer the student's latest inquiry directly.

RULES:
- Do not mention internal system components, modules, or policies.
- Do not expose internal annotations or metadata unless explicitly requested.
- If information is missing or uncertain, say so explicitly.
- Be supportive, encouraging, and focused on helping the student improve their learning habits.`

    // Check token budget
    let contextTokens = estimateTokens(assembledSystem)

    // Build messages array
    const messages = [
        { role: 'system', content: assembledSystem }
    ]

    // Add session messages, potentially truncating older ones if needed
    let messagesToAdd = [...sessionMessages]

    while (messagesToAdd.length > 0 && contextTokens < MAX_CONTEXT_TOKENS) {
        const msg = messagesToAdd.shift()
        const msgTokens = estimateTokens(msg.content)

        if (contextTokens + msgTokens > MAX_CONTEXT_TOKENS) {
            // Truncate - keep the most recent messages
            logger.warn(`Truncating session messages, token budget exceeded`)
            break
        }

        messages.push(msg)
        contextTokens += msgTokens
    }

    // Add the current user message if provided
    if (userMessage) {
        messages.push({ role: 'user', content: userMessage })
    }

    logger.info(`Assembled prompt: ${messages.length} messages, ~${contextTokens} tokens`)
    return messages
}

/**
 * Assemble initial greeting prompt
 * Used when starting a new session to generate the opening message
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Array<{role: string, content: string}>>}
 */
async function assembleInitialGreetingPrompt(userId) {
    const [systemPrompt, userContext, annotations, summaries] = await Promise.all([
        getSystemPrompt(),
        getUserContext(userId),
        getAnnotationsForChatbot(pool, userId),
        getSummariesForChatbot(userId)
    ])

    const userHasHistory = await hasHistory(userId)

    // Log what data we have for debugging
    logger.info(`Initial greeting data - userContext: ${userContext.substring(0, 100)}...`)
    logger.info(`Initial greeting data - annotations length: ${annotations.length} chars`)

    const greetingInstruction = userHasHistory
        ? `The student is returning. Based on the USER CONTEXT and ANNOTATED QUESTIONNAIRE data above, create a personalized greeting that:
1. Acknowledges them by mentioning their field of study
2. Summarizes 2-3 key patterns from their SRL data (mention specific concepts like "focus", "motivation", etc.)
3. Offers 2-3 specific, actionable recommendations based on areas needing improvement`
        : `This is a new student. Based on the USER CONTEXT and ANNOTATED QUESTIONNAIRE data above, create a personalized greeting that:
1. Welcomes them and acknowledges their field of study/major
2. Summarizes 2-3 key observations from their SRL questionnaire (mention specific concepts and trends)
3. Offers 2-3 specific, actionable recommendations based on their data`

    const assembledSystem = `YOU ARE:
A helpful learning support chatbot for students.

${systemPrompt}

=== STUDENT INFORMATION (USE THIS DATA IN YOUR RESPONSE) ===

USER CONTEXT & PREFERENCES:
${userContext}

ANNOTATED QUESTIONNAIRE INSIGHTS:
${annotations}

PREVIOUS CHATS (SUMMARIZED):
${summaries}

=== END OF STUDENT INFORMATION ===

YOUR TASK:
${greetingInstruction}

IMPORTANT: You MUST reference specific data from the student information above. Do NOT give a generic greeting.
Keep your response concise (2-3 short paragraphs). Be warm and encouraging.`

    return [
        { role: 'system', content: assembledSystem },
        { role: 'user', content: 'Hello, I just opened the chat. Please greet me based on my learning data.' }
    ]
}

/**
 * Extract just the system instructions part for alignment checking
 * 
 * @returns {Promise<string>}
 */
async function getSystemInstructionsForAlignment() {
    return await getSystemPrompt()
}

export {
    assemblePrompt,
    assembleInitialGreetingPrompt,
    getSystemPrompt,
    getUserContext,
    getSessionMessages,
    getSystemInstructionsForAlignment
}
