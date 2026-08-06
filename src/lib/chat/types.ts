export type ChatCitation = {
  sourceId: string
  sourceType: 'obsidian' | 'sop'
  title: string
  reason: string
  excerpt: string
  relativePath?: string
  sectionName?: string
  book?: string
  chapter?: number
}

export type ChatMessageRole = 'user' | 'assistant'

export type ChatMessage = {
  id: string
  conversationId: string
  role: ChatMessageRole
  content: string
  citations: ChatCitation[]
  provider: string | null
  model: string | null
  createdAt: string
}

export type ChatConversationSummary = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export type ChatSendMessageRequest = {
  message: string
}

export type ChatSendMessageResponse = {
  userMessage: ChatMessage
  status: 'queued' | 'succeeded'
  jobId?: string
  assistantMessage?: ChatMessage
}
