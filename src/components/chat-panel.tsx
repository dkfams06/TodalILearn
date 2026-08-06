'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'

import type { ChatConversationSummary, ChatMessage, ChatSendMessageResponse } from '@/lib/chat/types'
import type { ExecutionMode } from '@/lib/execution/mode'
import type { ChatJobResponse, CompanionDevice } from '@/lib/execution/types'
import { getResponseError, readJsonResponse } from '@/lib/http/client'

function CitationList({ citations }: { citations: ChatMessage['citations'] }) {
  if (citations.length === 0) return null
  return (
    <div className="chat-citations">
      {citations.map((citation) => (
        <details className="chat-citation" key={citation.sourceId}>
          <summary>
            <strong>{citation.sourceId} · {citation.title}</strong>
            <small>{citation.reason}</small>
          </summary>
          <p className="result-content">{citation.excerpt}</p>
          <p className="source-locator">
            {citation.sourceType === 'obsidian'
              ? `${citation.relativePath} · ${citation.sectionName}`
              : `${citation.book} ${citation.chapter}장`}
          </p>
        </details>
      ))}
    </div>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={`chat-bubble chat-bubble-${message.role}`}>
      <p className="chat-bubble-content">{message.content}</p>
      <CitationList citations={message.citations} />
    </div>
  )
}

export function ChatPanel() {
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('local')
  const [mainDevice, setMainDevice] = useState<CompanionDevice | null>(null)
  const threadEndRef = useRef<HTMLDivElement | null>(null)

  async function loadConversations() {
    const response = await fetch('/api/chat/conversations', { cache: 'no-store' })
    const body = await readJsonResponse<{ conversations?: ChatConversationSummary[]; error?: string }>(response)
    if (!response.ok || !body.conversations) {
      throw new Error(getResponseError(body, '대화 목록을 불러오지 못했습니다.'))
    }
    setConversations(body.conversations)
    return body.conversations
  }

  async function openConversation(id: string) {
    setError(null)
    setIsLoadingMessages(true)
    try {
      const response = await fetch(`/api/chat/conversations/${id}`, { cache: 'no-store' })
      const body = await readJsonResponse<{ messages?: ChatMessage[]; error?: string }>(response)
      if (!response.ok || !body.messages) {
        throw new Error(getResponseError(body, '대화를 불러오지 못했습니다.'))
      }
      setActiveId(id)
      setMessages(body.messages)
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : '대화를 불러오지 못했습니다.')
    } finally {
      setIsLoadingMessages(false)
    }
  }

  async function startConversation() {
    setError(null)
    try {
      const response = await fetch('/api/chat/conversations', { method: 'POST' })
      const body = await readJsonResponse<ChatConversationSummary | { error?: string }>(response)
      if (!response.ok || !('id' in body)) {
        throw new Error(getResponseError(body, '새 대화를 만들지 못했습니다.'))
      }
      setConversations((current) => [body, ...current])
      setActiveId(body.id)
      setMessages([])
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '새 대화를 만들지 못했습니다.')
    }
  }

  useEffect(() => {
    let cancelled = false
    async function loadDevices() {
      try {
        const response = await fetch('/api/devices', { cache: 'no-store' })
        const body = await readJsonResponse<{
          mode: ExecutionMode
          devices: CompanionDevice[]
          error?: string
        }>(response)
        if (!response.ok) throw new Error(getResponseError(body, 'PC 상태를 확인하지 못했습니다.'))
        if (cancelled) return
        setExecutionMode(body.mode)
        setMainDevice(body.devices.find((device) => device.online) ?? null)
      } catch (deviceError) {
        if (!cancelled) setError(deviceError instanceof Error ? deviceError.message : 'PC 상태를 확인하지 못했습니다.')
      }
    }
    async function init() {
      try {
        const response = await fetch('/api/chat/conversations', { cache: 'no-store' })
        const body = await readJsonResponse<{ conversations?: ChatConversationSummary[]; error?: string }>(response)
        if (!response.ok || !body.conversations) {
          throw new Error(getResponseError(body, '대화 목록을 불러오지 못했습니다.'))
        }
        if (cancelled) return
        setConversations(body.conversations)
        const first = body.conversations[0]
        if (!first) return
        setIsLoadingMessages(true)
        const messagesResponse = await fetch(`/api/chat/conversations/${first.id}`, { cache: 'no-store' })
        const messagesBody = await readJsonResponse<{ messages?: ChatMessage[]; error?: string }>(messagesResponse)
        if (!messagesResponse.ok || !messagesBody.messages) {
          throw new Error(getResponseError(messagesBody, '대화를 불러오지 못했습니다.'))
        }
        if (cancelled) return
        setActiveId(first.id)
        setMessages(messagesBody.messages)
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : '대화 목록을 불러오지 못했습니다.')
      } finally {
        if (!cancelled) setIsLoadingMessages(false)
      }
    }
    void loadDevices()
    void init()
    const interval = window.setInterval(() => void loadDevices(), 15_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function waitForAssistantMessage(jobId: string) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2_000))
      const response = await fetch(`/api/jobs/${jobId}`)
      const job = await readJsonResponse<ChatJobResponse | { error?: string }>(response)
      if (!response.ok || !('status' in job)) {
        throw new Error(getResponseError(job, '작업 상태를 확인하지 못했습니다.'))
      }
      if (job.status === 'succeeded' && job.result) return job.result
      if (job.status === 'failed' || job.status === 'cancelled') {
        throw new Error(job.error || 'Windows PC에서 응답을 만들지 못했습니다.')
      }
    }
    throw new Error('응답 대기 시간이 초과되었습니다.')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || isSending) return

    let conversationId = activeId
    setError(null)
    setIsSending(true)
    setDraft('')
    try {
      if (!conversationId) {
        const response = await fetch('/api/chat/conversations', { method: 'POST' })
        const body = await readJsonResponse<ChatConversationSummary | { error?: string }>(response)
        if (!response.ok || !('id' in body)) {
          throw new Error(getResponseError(body, '새 대화를 만들지 못했습니다.'))
        }
        conversationId = body.id
        setActiveId(body.id)
        setConversations((current) => [body, ...current])
      }

      const response = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const body = await readJsonResponse<ChatSendMessageResponse | { error?: string }>(response)
      if (!response.ok || !('userMessage' in body)) {
        throw new Error(getResponseError(body, '메시지를 보내지 못했습니다.'))
      }
      setMessages((current) => [...current, body.userMessage])

      let assistantMessage: ChatMessage
      if (body.status === 'succeeded' && body.assistantMessage) {
        assistantMessage = body.assistantMessage
      } else {
        if (!body.jobId) throw new Error('작업 ID를 받지 못했습니다.')
        assistantMessage = await waitForAssistantMessage(body.jobId)
      }
      setMessages((current) => [...current, assistantMessage])
      void loadConversations()
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '메시지를 보내지 못했습니다.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <article className="card wide chat-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">자료 채팅</p>
          <h2>내 자료와 대화하기</h2>
          <p className="muted">옵시디언 원본과 예언의 신 자료에 근거해 자유롭게 질문하고 답을 받습니다.</p>
        </div>
        <button onClick={() => void startConversation()} type="button">새 대화</button>
      </div>

      {executionMode === 'web' ? (
        <p className={mainDevice ? 'success-message' : 'error-message'}>
          메인 PC · {mainDevice ? `${mainDevice.deviceName} 온라인` : '오프라인 — Companion을 실행해 주세요.'}
        </p>
      ) : null}

      <div className="chat-layout">
        <aside className="chat-conversations">
          {conversations.length > 0 ? (
            <ul className="saved-sermon-list">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    className={`saved-sermon-item${activeId === conversation.id ? ' active' : ''}`}
                    onClick={() => void openConversation(conversation.id)}
                    type="button"
                  >
                    <strong>{conversation.title || '(제목 없음)'}</strong>
                    <small>{new Date(conversation.updatedAt).toLocaleString('ko-KR')}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="muted">아직 대화가 없습니다. 새 대화를 시작해 보세요.</p>}
        </aside>

        <div className="chat-thread-wrap">
          <div className="chat-thread">
            {isLoadingMessages ? <p className="muted">불러오는 중…</p> : null}
            {messages.map((message) => <ChatBubble key={message.id} message={message} />)}
            <div ref={threadEndRef} />
          </div>

          {error ? <p className="error-message">{error}</p> : null}

          <form className="chat-form" onSubmit={submit}>
            <textarea
              maxLength={2_000}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="예: 요한복음 3장에서 말하는 거듭남에 대해 다른 자료들은 뭐라고 하나요?"
              rows={2}
              value={draft}
            />
            <div className="form-actions">
              <button
                disabled={isSending || draft.trim().length === 0 || (executionMode === 'web' && !mainDevice)}
                type="submit"
              >
                {isSending ? '응답 생성 중…' : '보내기'}
              </button>
              <span className="muted">Claude 구독 호출은 보통 15초~1분이 걸립니다.</span>
            </div>
          </form>
        </div>
      </div>
    </article>
  )
}
