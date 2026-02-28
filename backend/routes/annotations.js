// Annotation routes
import { Router } from 'express'
import pool from '../config/database.js'
import { getAnnotations, getAnnotationsForChatbot } from '../services/annotators/srlAnnotationService.js'
import { requireAuth } from '../middleware/auth.js'
import { asyncRoute } from '../utils/errors.js'

const router = Router()
router.use(requireAuth)

// Get annotations for current user (for UI display)
router.get('/', asyncRoute(async (req, res) => {
    const userId = req.session.user.id
    const { timeWindow } = req.query
    const annotations = await getAnnotations(pool, userId, timeWindow, false)
    res.json({ annotations })
}))

// Get annotations formatted for chatbot/LLM
router.get('/chatbot', asyncRoute(async (req, res) => {
    const userId = req.session.user.id
    const annotationsText = await getAnnotationsForChatbot(pool, userId)
    res.json({ annotationsText })
}))

export default router
