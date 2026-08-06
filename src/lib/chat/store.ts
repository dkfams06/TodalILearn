import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { ChatCitation, ChatConversationSummary, ChatMessage } from './types'

type ChatMessageRow = {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  citations: unknown
  provider: string | null
  model: string | null
  created_at: string
}

function toChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    citations: (Array.isArray(row.citations) ? row.citations : []) as ChatCitation[],
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
  }
}

function truncateTitle(value: string, maximum = 60) {
  const trimmed = value.trim()
  return trimmed.length <= maximum ? trimmed : `${trimmed.slice(0, maximum).trimEnd()}…`
}

const messageColumns = 'id,conversation_id,role,content,citations,provider,model,created_at'

export async function createConversation(
  database: SupabaseClient,
  userId: string,
): Promise<ChatConversationSummary> {
  const { data, error } = await database
    .from('chat_conversations')
    .insert({ user_id: userId })
    .select('id,title,created_at,updated_at')
    .single()
  if (error) throw new Error(error.message)
  return { id: data.id, title: data.title, createdAt: data.created_at, updatedAt: data.updated_at }
}

export async function listConversations(
  database: SupabaseClient,
  userId: string,
): Promise<ChatConversationSummary[]> {
  const { data, error } = await database
    .from('chat_conversations')
    .select('id,title,created_at,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at,
  }))
}

export async function requireConversation(
  database: SupabaseClient,
  userId: string,
  conversationId: string,
) {
  const { data, error } = await database
    .from('chat_conversations')
    .select('id,title')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('대화를 찾지 못했습니다.')
  return data
}

export async function listMessages(
  database: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<ChatMessage[]> {
  await requireConversation(database, userId, conversationId)
  const { data, error } = await database
    .from('chat_messages')
    .select(messageColumns)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => toChatMessage(row as ChatMessageRow))
}

export async function insertUserMessage(
  database: SupabaseClient,
  conversationId: string,
  content: string,
): Promise<ChatMessage> {
  const trimmed = content.trim()
  if (!trimmed) throw new Error('메시지 내용이 필요합니다.')
  if (trimmed.length > 2_000) throw new Error('메시지는 2000자 이하여야 합니다.')

  const { count, error: countError } = await database
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
  if (countError) throw new Error(countError.message)

  const { data, error } = await database
    .from('chat_messages')
    .insert({ conversation_id: conversationId, role: 'user', content: trimmed })
    .select(messageColumns)
    .single()
  if (error) throw new Error(error.message)

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (!count) updates.title = truncateTitle(trimmed)
  const { error: updateError } = await database
    .from('chat_conversations')
    .update(updates)
    .eq('id', conversationId)
  if (updateError) throw new Error(updateError.message)

  return toChatMessage(data as ChatMessageRow)
}

export async function insertAssistantMessage(
  database: SupabaseClient,
  conversationId: string,
  { content, citations, provider, model }: {
    content: string
    citations: ChatCitation[]
    provider: string
    model: string
  },
): Promise<ChatMessage> {
  const { data, error } = await database
    .from('chat_messages')
    .insert({
      conversation_id: conversationId, role: 'assistant', content, citations, provider, model,
    })
    .select(messageColumns)
    .single()
  if (error) throw new Error(error.message)

  const { error: updateError } = await database
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)
  if (updateError) throw new Error(updateError.message)

  return toChatMessage(data as ChatMessageRow)
}

export async function loadHistoryExcluding(
  database: SupabaseClient,
  conversationId: string,
  excludeMessageId: string,
  limit = 12,
): Promise<ChatMessage[]> {
  const { data, error } = await database
    .from('chat_messages')
    .select(messageColumns)
    .eq('conversation_id', conversationId)
    .neq('id', excludeMessageId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => toChatMessage(row as ChatMessageRow)).reverse()
}
