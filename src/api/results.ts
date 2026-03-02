import { api } from './client'

export const getTodaySRL = () =>
    api.get<{ submitted: boolean }>('/results/today').then(r => r.submitted)
