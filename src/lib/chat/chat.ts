import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { CLAUDE_SUBSCRIPTION_PROVIDER } from '@/lib/claude/print'
import { hybridSearch } from '@/lib/search/hybrid'
import type { KnowledgeSearchResult, SopSearchResult } from '@/lib/search/types'

import { insertAssistantMessage, loadHistoryExcluding } from './store'
import { synthesizeChatAnswer, type ChatHistoryTurn, type ChatSourceCandidate } from './synthesis'
import type { ChatCitation, ChatMessage } from './types'

function truncate(value: string, maximum: number) {
  const trimmed = value.trim()
  return trimmed.length <= maximum ? trimmed : `${trimmed.slice(0, maximum).trimEnd()}…`
}

type IndexedCandidate = {
  candidate: ChatSourceCandidate
  result: KnowledgeSearchResult | SopSearchResult
}

export async function answerChatMessage({
  database,
  userId,
  model,
  conversationId,
  userMessageId,
  message,
}: {
  database: SupabaseClient
  userId: string
  model: string
  conversationId: string
  userMessageId: string
  message: string
}): Promise<ChatMessage> {
  const [history, search] = await Promise.all([
    loadHistoryExcluding(database, conversationId, userMessageId),
    hybridSearch({ database, userId, query: message }),
  ])

  const knowledgeIndexed: IndexedCandidate[] = search.knowledgeResults.map((result, index) => ({
    candidate: {
      id: `K${index + 1}`,
      type: 'obsidian',
      title: result.title,
      locator: `${result.relativePath} @ ${result.contentStartOffset}-${result.contentEndOffset}`,
      reasons: result.reasons,
      excerpt: truncate(result.content, 3_000),
    },
    result,
  }))
  const sopIndexed: IndexedCandidate[] = search.sopResults.map((result, index) => ({
    candidate: {
      id: `S${index + 1}`,
      type: 'sop',
      title: result.title,
      locator: `${result.book} ${result.chapter}장 chunk ${result.chunkIndex}`,
      reasons: result.reasons,
      excerpt: truncate(result.content, 2_000),
    },
    result,
  }))
  const indexed = [...knowledgeIndexed, ...sopIndexed]
  const indexedById = new Map(indexed.map((entry) => [entry.candidate.id, entry]))

  const historyTurns: ChatHistoryTurn[] = history.map((entry) => ({
    role: entry.role,
    content: entry.content,
  }))

  const { result } = await synthesizeChatAnswer({
    model,
    history: historyTurns,
    message,
    sourceCandidates: indexed.map((entry) => entry.candidate),
  })

  const citations: ChatCitation[] = result.citations.flatMap((citation) => {
    const entry = indexedById.get(citation.sourceId)
    if (!entry) return []
    const { candidate, result: searchResult } = entry
    return [{
      sourceId: candidate.id,
      sourceType: candidate.type,
      title: candidate.title,
      reason: citation.reason,
      excerpt: candidate.excerpt,
      ...(searchResult.sourceType === 'obsidian'
        ? { relativePath: searchResult.relativePath, sectionName: searchResult.sectionName }
        : { book: searchResult.book, chapter: searchResult.chapter }),
    }]
  })

  return insertAssistantMessage(database, conversationId, {
    content: result.answer,
    citations,
    provider: CLAUDE_SUBSCRIPTION_PROVIDER,
    model,
  })
}
