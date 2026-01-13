import { useState, useEffect, useRef, useCallback } from 'react'
import './Chatbot.css'

interface Message {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    created_at: string
}

interface ChatbotProps {
    isLoggedIn: boolean
}

const Chatbot = ({ isLoggedIn }: ChatbotProps) => {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState<Message[]>([])
    const [inputValue, setInputValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [hasMore, setHasMore] = useState(false)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [cooldown, setCooldown] = useState(false)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // Scroll to bottom of messages
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    // Load initial greeting when opened
    useEffect(() => {
        if (isOpen && isLoggedIn && messages.length === 0) {
            loadInitialGreeting()
        }
    }, [isOpen, isLoggedIn])

    // Scroll to bottom when messages change
    useEffect(() => {
        scrollToBottom()
    }, [messages, scrollToBottom])

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus()
        }
    }, [isOpen])

    const loadInitialGreeting = async () => {
        setIsLoading(true)
        try {
            const response = await fetch('/api/chat/initial', {
                credentials: 'include'
            })
            const data = await response.json()

            if (data.greeting) {
                setSessionId(data.sessionId)
                setMessages([{
                    id: 'initial',
                    role: 'assistant',
                    content: data.greeting,
                    created_at: new Date().toISOString()
                }])
            }
        } catch (error) {
            console.error('Failed to load initial greeting:', error)
            setMessages([{
                id: 'error',
                role: 'assistant',
                content: "Hello! I'm here to help you with your learning journey. How can I assist you today?",
                created_at: new Date().toISOString()
            }])
        } finally {
            setIsLoading(false)
        }
    }

    const loadMoreHistory = async () => {
        if (!sessionId || isLoadingMore || !hasMore) return

        setIsLoadingMore(true)
        const oldestMessage = messages[0]

        try {
            const response = await fetch(
                `/api/chat/history?sessionId=${sessionId}&limit=20&before=${oldestMessage?.id}`,
                { credentials: 'include' }
            )
            const data = await response.json()

            if (data.messages && data.messages.length > 0) {
                setMessages(prev => [...data.messages, ...prev])
                setHasMore(data.hasMore)
            } else {
                setHasMore(false)
            }
        } catch (error) {
            console.error('Failed to load history:', error)
        } finally {
            setIsLoadingMore(false)
        }
    }

    const handleScroll = () => {
        const container = messagesContainerRef.current
        if (container && container.scrollTop === 0 && hasMore && !isLoadingMore) {
            loadMoreHistory()
        }
    }

    const sendMessage = async () => {
        if (!inputValue.trim() || isLoading || cooldown) return

        const userMessage = inputValue.trim()
        setInputValue('')

        // Add user message immediately
        const userMsgId = `user-${Date.now()}`
        setMessages(prev => [...prev, {
            id: userMsgId,
            role: 'user',
            content: userMessage,
            created_at: new Date().toISOString()
        }])

        // Start cooldown
        setCooldown(true)
        setTimeout(() => setCooldown(false), 1500)

        setIsLoading(true)

        try {
            const response = await fetch('/api/chat/message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ message: userMessage })
            })
            const data = await response.json()

            if (data.sessionId) {
                setSessionId(data.sessionId)
            }

            setMessages(prev => [...prev, {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: data.response || "I couldn't process that. Please try again.",
                created_at: new Date().toISOString()
            }])
        } catch (error) {
            console.error('Failed to send message:', error)
            setMessages(prev => [...prev, {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: "Please, try again later.",
                created_at: new Date().toISOString()
            }])
        } finally {
            setIsLoading(false)
        }
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    const handleReset = async () => {
        if (isLoading) return

        setIsLoading(true)
        try {
            const response = await fetch('/api/chat/reset', {
                method: 'POST',
                credentials: 'include'
            })
            const data = await response.json()

            if (data.success) {
                setSessionId(data.sessionId)
                setMessages([{
                    id: 'reset-greeting',
                    role: 'assistant',
                    content: data.greeting,
                    created_at: new Date().toISOString()
                }])
                setHasMore(false)
            }
        } catch (error) {
            console.error('Failed to reset session:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const toggleChat = () => {
        setIsOpen(!isOpen)
    }

    // Don't render if not logged in
    if (!isLoggedIn) return null

    return (
        <div className={`chatbot-container ${isOpen ? 'open' : ''}`}>
            {/* Floating bubble button */}
            <button
                className="chatbot-bubble"
                onClick={toggleChat}
                aria-label={isOpen ? 'Close chat' : 'Open chat'}
            >
                {isOpen ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21 11.5C21.0034 12.8199 20.6951 14.1219 20.1 15.3C19.3944 16.7118 18.3098 17.8992 16.9674 18.7293C15.6251 19.5594 14.0782 19.9994 12.5 20C11.1801 20.0034 9.87812 19.6951 8.7 19.1L3 21L4.9 15.3C4.30493 14.1219 3.99656 12.8199 4 11.5C4.00061 9.92179 4.44061 8.37488 5.27072 7.03258C6.10083 5.69028 7.28825 4.6056 8.7 3.90003C9.87812 3.30496 11.1801 2.99659 12.5 3.00003H13C15.0843 3.11502 17.053 3.99479 18.5291 5.47089C20.0052 6.94699 20.885 8.91568 21 11V11.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </button>

            {/* Chat window */}
            {isOpen && (
                <div className="chatbot-window">
                    <div className="chatbot-header">
                        <div className="chatbot-header-info">
                            <div className="chatbot-avatar">🎓</div>
                            <div className="chatbot-header-text">
                                <h3>Learning Assistant</h3>
                                <span className="chatbot-status">Online</span>
                            </div>
                        </div>
                        <button
                            className="chatbot-reset-btn"
                            onClick={handleReset}
                            disabled={isLoading}
                            title="New conversation"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 4V1L8 5L12 9V6C15.31 6 18 8.69 18 12C18 13.01 17.75 13.97 17.3 14.8L18.76 16.26C19.54 15.03 20 13.57 20 12C20 7.58 16.42 4 12 4ZM12 18C8.69 18 6 15.31 6 12C6 10.99 6.25 10.03 6.7 9.2L5.24 7.74C4.46 8.97 4 10.43 4 12C4 16.42 7.58 20 12 20V23L16 19L12 15V18Z" fill="currentColor" />
                            </svg>
                        </button>
                    </div>

                    <div
                        className="chatbot-messages"
                        ref={messagesContainerRef}
                        onScroll={handleScroll}
                    >
                        {isLoadingMore && (
                            <div className="chatbot-loading-more">Loading older messages...</div>
                        )}

                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`chatbot-message ${msg.role}`}
                            >
                                <div className="chatbot-message-content">
                                    {msg.content}
                                </div>
                            </div>
                        ))}

                        {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                            <div className="chatbot-message assistant">
                                <div className="chatbot-message-content typing">
                                    <span className="typing-dot"></span>
                                    <span className="typing-dot"></span>
                                    <span className="typing-dot"></span>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    <div className="chatbot-input-container">
                        <input
                            ref={inputRef}
                            type="text"
                            className="chatbot-input"
                            placeholder="Type a message..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyPress={handleKeyPress}
                            disabled={isLoading}
                            maxLength={5000}
                        />
                        <button
                            className="chatbot-send-btn"
                            onClick={sendMessage}
                            disabled={isLoading || !inputValue.trim() || cooldown}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Chatbot
