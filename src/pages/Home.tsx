import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Surveys from '../components/Surveys'
import { useReduxSelector, useReduxDispatch } from '../redux'
import { load } from '../redux/surveys'
import './Home.css'

const Home = () => {
    const user = useReduxSelector(state => state.auth.user)
    const surveys = useReduxSelector(state => state.surveys.surveys)
    const surveysStatus = useReduxSelector(state => state.surveys.status)
    const dispatch = useReduxDispatch()
    const isAdmin = user?.role === 'admin' || user?.email === 'admin@example.com'
    const title = isAdmin ? 'My Surveys' : 'Available Surveys'
    
    // Load surveys if not already loaded
    useEffect(() => {
        if (surveysStatus === 'idle' && surveys.length === 0) {
            dispatch(load())
        }
    }, [surveysStatus, dispatch, surveys.length])
    
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
                    <h1 className='mood-title'>Your mood</h1>
                </div>
                
                <div className='mood-cards-container'>
                    <div className='mood-card'>
                        <h2 className='mood-card-title'>Mood today</h2>
                        <p className='mood-card-description'>Answer the survey to see your mood today</p>
                        <div className='mood-card-placeholder'></div>
                    </div>
                    
                    <div className='mood-card'>
                        <h2 className='mood-card-title'>Mood over the last 7 days</h2>
                        <p className='mood-card-description'>This is a placeholder for card content. Description goes here.</p>
                        <div className='mood-card-placeholder'></div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Home;