# Review Scope

## Target

All changes on the `feature/chatbot` branch vs `main`. This is a student wellbeing dashboard with:
- React + TypeScript frontend
- Node.js ESM (Express) backend
- PostgreSQL database
- PGMoE clustering scoring pipeline
- Moodle LMS integration
- AI chatbot feature

## Key Subsystems Under Review

1. **Moodle LMS integration** — `moodleService.js`, `moodleEventSimulator.js`, LMS routes
2. **Scoring pipeline** — `clusterPeerService.js`, `clusterStorageService.js`, `conceptScoreService.js`, `scoreQueryService.js`, `pgmoeAlgorithm.js`
3. **Annotation services** — `lmsAnnotationService.js`, `sleepAnnotationService.js`, `screenTimeAnnotationService.js`, `srlAnnotationService.js`
4. **Backend routes** — `admin.js`, `scores.js`, `lms.js`, `chat.js`, `auth.js`
5. **Frontend components** — `ScoreBoard.tsx`, `Home.tsx`, `AdminStudentViewer.tsx`, `AdminClusterDiagnosticsPanel.tsx`
6. **Auth & middleware** — `authController.js`, `auth.js` middleware, `rateLimit.js`, `validation.js`
7. **Database schema** — init SQL scripts, cluster diagnostics
8. **New untracked files** — `backend/utils/stats.js`, `AdminClusterDiagnosticsPanel.tsx`, `013_cluster_diagnostics.sql`

## Files

### Backend
- backend/config/concepts.js
- backend/config/database.js
- backend/config/envValidation.js
- backend/constants.js
- backend/controllers/authController.js
- backend/middleware/auth.js
- backend/middleware/rateLimit.js
- backend/middleware/validation.js
- backend/routes/admin.js
- backend/routes/auth.js
- backend/routes/chat.js
- backend/routes/lms.js
- backend/routes/scores.js
- backend/routes/index.js
- backend/server.js
- backend/services/moodleService.js
- backend/services/moodleEventSimulator.js
- backend/services/scoring/clusterPeerService.js
- backend/services/scoring/clusterStorageService.js
- backend/services/scoring/conceptScoreService.js
- backend/services/scoring/pgmoeAlgorithm.js
- backend/services/annotators/lmsAnnotationService.js
- backend/services/annotators/sleepAnnotationService.js
- backend/services/annotators/screenTimeAnnotationService.js
- backend/services/annotators/srlAnnotationService.js
- backend/services/alignmentService.js
- backend/services/contextManagerService.js
- backend/services/cronService.js
- backend/utils/stats.js (untracked)
- postgres/initdb/013_cluster_diagnostics.sql (untracked)

### Frontend
- src/components/ScoreBoard.tsx
- src/components/AdminClusterDiagnosticsPanel.tsx (untracked)
- src/pages/Home.tsx
- src/models/scores.ts
- src/routes/index.tsx
- src/redux/results.ts

## Flags

- Security Focus: no
- Performance Critical: no
- Strict Mode: no
- Framework: React + Node.js/Express + PostgreSQL

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report
