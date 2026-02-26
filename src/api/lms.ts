// LMS / Moodle admin API client
// Admin-only endpoints for connection status and student sync.

import { api } from './client'

export interface MoodleConnectionStatus {
    connected: boolean
    sitename: string | null
    username?: string
    moodleConfigured: boolean
    error?: string
}

export interface StudentLmsSyncStatus {
    userId: string
    name: string
    email: string
    hasMoodleData: boolean
    lastSync: string | null
}

export interface SyncAllResult {
    total: number
    synced: number
    skipped: { email: string; reason: string }[]
}

export interface SyncStudentResult {
    synced: number
    days: string[]
}

export const getMoodleConnectionStatus = () =>
    api.get<MoodleConnectionStatus>('/lms/admin/connection-status')

export const getStudentSyncStatus = () =>
    api.get<StudentLmsSyncStatus[]>('/lms/admin/sync-status')

export const syncAllStudents = () =>
    api.post<SyncAllResult>('/lms/admin/sync-all', {})

export const syncStudent = (userId: string) =>
    api.post<SyncStudentResult | { skipped: true; reason: string }>(`/lms/admin/sync/${userId}`, {})
