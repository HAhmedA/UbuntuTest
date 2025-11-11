import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useReduxDispatch } from '../redux'
import { loadStudentMoodHistory, MoodHistoryData } from '../redux/results'
import './MoodHistory.css'

const MoodHistory = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const dispatch = useReduxDispatch()
    
    const [historyData, setHistoryData] = useState<MoodHistoryData | null>(null)
    const [loading, setLoading] = useState(true)
    
    useEffect(() => {
        if (id) {
            setLoading(true)
            dispatch(loadStudentMoodHistory(id))
                .then((result: any) => {
                    setHistoryData(result.payload)
                    setLoading(false)
                })
                .catch(() => {
                    setLoading(false)
                })
        }
    }, [id, dispatch])
    
    if (loading) {
        return (
            <div className='mood-history-wrapper'>
                <div className='mood-history-container'>
                    <div className='mood-history-loading'>Loading...</div>
                </div>
            </div>
        )
    }
    
    if (!historyData || !historyData.data || historyData.data.length === 0) {
        return (
            <div className='mood-history-wrapper'>
                <div className='mood-history-container'>
                    <button className='mood-history-back' onClick={() => navigate('/')}>
                        ← Back
                    </button>
                    <h1 className='mood-history-title'>Mood History</h1>
                    <div className='mood-history-no-data'>No survey responses yet</div>
                </div>
            </div>
        )
    }
    
    // Format dates for display - show all data over time
    const formattedData = historyData.data.map(item => ({
        ...item,
        date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }))
    
    // Generate colors for each construct
    const colors = [
        '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
        '#06B6D4', '#EC4899', '#84CC16', '#F97316', '#6366F1',
        '#14B8A6', '#A855F7', '#F43F5E', '#0EA5E9'
    ]
    
    return (
        <div className='mood-history-wrapper'>
            <div className='mood-history-container'>
                <button className='mood-history-back' onClick={() => navigate('/')}>
                    ← Back
                </button>
                <h1 className='mood-history-title'>
                    Mood History Over Time
                </h1>
                
                <div className='mood-history-charts'>
                    {historyData.constructs.map((construct, index) => {
                        const constructData = formattedData
                            .map(item => ({
                                date: item.date,
                                value: (item as any)[construct.name] !== null && (item as any)[construct.name] !== undefined 
                                    ? Number((item as any)[construct.name]) 
                                    : null
                            }))
                            .filter(item => item.value !== null)
                        
                        if (constructData.length === 0) {
                            return null
                        }
                        
                        return (
                            <div key={construct.name} className='mood-history-chart-container'>
                                <h3 className='mood-history-chart-title'>{construct.title}</h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={constructData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis 
                                            dataKey="date" 
                                            tick={{ fontSize: 12 }}
                                            angle={-45}
                                            textAnchor="end"
                                            height={60}
                                        />
                                        <YAxis 
                                            domain={[1, 5]}
                                            tick={{ fontSize: 12 }}
                                            label={{ value: 'Rating', angle: -90, position: 'insideLeft' }}
                                        />
                                        <Tooltip />
                                        <Legend />
                                        <Line 
                                            type="monotone" 
                                            dataKey="value" 
                                            stroke={colors[index % colors.length]} 
                                            strokeWidth={2}
                                            dot={{ r: 4 }}
                                            activeDot={{ r: 6 }}
                                            name={construct.name}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

export default MoodHistory

