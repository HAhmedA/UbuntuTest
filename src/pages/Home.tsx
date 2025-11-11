import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Surveys from '../components/Surveys'
import { useReduxSelector, useReduxDispatch } from '../redux'
import { load } from '../redux/surveys'
import { loadStudentMood, ConstructStat } from '../redux/results'
import './Home.css'

const Home = () => {
    const user = useReduxSelector(state => state.auth.user)
    const surveys = useReduxSelector(state => state.surveys.surveys)
    const surveysStatus = useReduxSelector(state => state.surveys.status)
    const dispatch = useReduxDispatch()
    const navigate = useNavigate()
    const isAdmin = user?.role === 'admin' || user?.email === 'admin@example.com'
    const title = isAdmin ? 'My Surveys' : 'Available Surveys'
    
    const [moodToday, setMoodToday] = useState<{ constructs: ConstructStat[]; hasData: boolean; totalResponses: number } | null>(null)
    const [mood7Days, setMood7Days] = useState<{ constructs: ConstructStat[]; hasData: boolean; totalResponses: number } | null>(null)
    const [loadingToday, setLoadingToday] = useState(false)
    const [loading7Days, setLoading7Days] = useState(false)
    
    // Load surveys if not already loaded
    useEffect(() => {
        if (surveysStatus === 'idle' && surveys.length === 0) {
            dispatch(load())
        }
    }, [surveysStatus, dispatch, surveys.length])
    
    // Load mood data for students
    useEffect(() => {
        if (!isAdmin && surveys.length > 0) {
            const firstSurvey = surveys[0]
            setLoadingToday(true)
            setLoading7Days(true)
            
            dispatch(loadStudentMood({ surveyId: firstSurvey.id, period: 'today' }))
                .then((result: any) => {
                    if (result.type === 'results/loadStudentMood/fulfilled') {
                        setMoodToday({ 
                            constructs: result.payload.constructs || [], 
                            hasData: result.payload.hasData || false,
                            totalResponses: result.payload.totalResponses || 0
                        })
                    } else {
                        setMoodToday({ constructs: [], hasData: false, totalResponses: 0 })
                    }
                    setLoadingToday(false)
                })
                .catch((error) => {
                    setMoodToday({ constructs: [], hasData: false, totalResponses: 0 })
                    setLoadingToday(false)
                })
            
            dispatch(loadStudentMood({ surveyId: firstSurvey.id, period: '7days' }))
                .then((result: any) => {
                    if (result.type === 'results/loadStudentMood/fulfilled') {
                        setMood7Days({ 
                            constructs: result.payload.constructs || [], 
                            hasData: result.payload.hasData || false,
                            totalResponses: result.payload.totalResponses || 0
                        })
                    } else {
                        setMood7Days({ constructs: [], hasData: false, totalResponses: 0 })
                    }
                    setLoading7Days(false)
                })
                .catch((error) => {
                    setMood7Days({ constructs: [], hasData: false, totalResponses: 0 })
                    setLoading7Days(false)
                })
        }
    }, [isAdmin, surveys, dispatch])
    
    // Add class to parent main element for student mood layout
    useEffect(() => {
        if (!isAdmin) {
            const mainElement = document.querySelector('.sjs-app__content')
            if (mainElement) {
                mainElement.classList.add('mood-content-override')
            }
            return () => {
                if (mainElement) {
                    mainElement.classList.remove('mood-content-override')
                }
            }
        }
    }, [isAdmin])
    
    // Get first survey for "Fill Survey" button
    const firstSurvey = surveys.length > 0 ? surveys[0] : null
    
    const handleCardClick = (period: 'today' | '7days') => {
        if (firstSurvey) {
            navigate(`/mood-history/${firstSurvey.id}?period=${period}`)
        }
    }
    
    const renderConstructs = (constructs: ConstructStat[], hasData: boolean) => {
        // Show "No survey responses yet" if no data or no constructs
        if (!hasData || constructs.length === 0) {
            return <div className='mood-no-data'>No survey responses yet</div>
        }
        
        // Filter out constructs that have no data (all null values)
        const constructsWithData = constructs.filter(c => 
            c.average !== null || c.min !== null || c.max !== null
        )
        
        if (constructsWithData.length === 0) {
            return <div className='mood-no-data'>No survey responses yet</div>
        }
        
        return (
            <div className='mood-constructs-grid'>
                {constructs.map((construct) => (
                    <div key={construct.name} className='mood-construct-item'>
                        <div className='mood-construct-name'>{construct.name}</div>
                        <div className='mood-construct-stats'>
                            <div className='mood-stat'>
                                <span className='mood-stat-label'>Avg:</span>
                                <span className='mood-stat-value'>{construct.average !== null ? construct.average.toFixed(1) : 'N/A'}</span>
                            </div>
                            <div className='mood-stat'>
                                <span className='mood-stat-label'>Min:</span>
                                <span className='mood-stat-value'>{construct.min !== null ? construct.min : 'N/A'}</span>
                            </div>
                            <div className='mood-stat'>
                                <span className='mood-stat-label'>Max:</span>
                                <span className='mood-stat-value'>{construct.max !== null ? construct.max : 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )
    }
    
    // For admin users, show the surveys list
    if (isAdmin) {
        return (
            <div className='sjs-client-app__content--surveys-list'>
                <h1>{title}</h1>
                <Surveys/>
            </div>
        )
    }
    
    // For student users, show the mood tracking layout
    return (
        <div className='mood-home-wrapper'>
            <div className='mood-home-container'>
                <div className='mood-home-header'>
                    {firstSurvey && (
                        <Link to={`/run/${firstSurvey.id}`} className='fill-survey-button'>
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M2.5 5H17.5M2.5 10H17.5M2.5 15H17.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                            <span>Fill Survey</span>
                        </Link>
                    )}
                    <h1 className='mood-title'>Overview</h1>
                </div>
                
                <div className='mood-cards-container'>
                    <div 
                        className='mood-card mood-card-clickable' 
                        onClick={() => handleCardClick('today')}
                    >
                        <h2 className='mood-card-title'>Mood today</h2>
                        <p className='mood-card-description'>
                            Your mood statistics for today{moodToday && moodToday.totalResponses > 0 ? `, based on ${moodToday.totalResponses} ${moodToday.totalResponses === 1 ? 'response' : 'responses'}` : ''}
                        </p>
                        <div className='mood-card-content'>
                            {loadingToday ? (
                                <div className='mood-loading'>Loading...</div>
                            ) : moodToday ? (
                                renderConstructs(moodToday.constructs, moodToday.hasData)
                            ) : (
                                <div className='mood-no-data'>No survey responses yet</div>
                            )}
                        </div>
                    </div>
                    
                    <div 
                        className='mood-card mood-card-clickable' 
                        onClick={() => handleCardClick('7days')}
                    >
                        <h2 className='mood-card-title'>Mood over the last 7 days</h2>
                        <p className='mood-card-description'>
                            Your mood statistics over the past week{mood7Days && mood7Days.totalResponses > 0 ? `, based on ${mood7Days.totalResponses} ${mood7Days.totalResponses === 1 ? 'response' : 'responses'}` : ''}
                        </p>
                        <div className='mood-card-content'>
                            {loading7Days ? (
                                <div className='mood-loading'>Loading...</div>
                            ) : mood7Days ? (
                                renderConstructs(mood7Days.constructs, mood7Days.hasData)
                            ) : (
                                <div className='mood-no-data'>No survey responses yet</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Home;