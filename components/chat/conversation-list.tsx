'use client'

import { useState } from 'react'
import { Search, MessageSquarePlus, LogOut, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ConversationWithDetails, Profile } from '@/lib/types'
import { useSearchUsers, useCreateConversation } from '@/hooks/use-chat'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { isToday, isYesterday, differenceInCalendarDays } from 'date-fns'
import {
  getConversationDisplayName,
  getConversationInitials,
  isGroupConversation,
} from '@/lib/conversation-utils'
import { CreateGroupDialog } from './create-group-dialog'

interface ConversationListProps {
  conversations: ConversationWithDetails[]
  selectedId: string | null
  onSelect: (id: string) => void
  isLoading?: boolean
  currentUserId: string | undefined
  onConversationCreated: () => void | Promise<void>
}

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()

  if (isToday(date)) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (isYesterday(date)) {
    return 'Yesterday'
  }
  const daysAgo = differenceInCalendarDays(now, date)
  if (daysAgo > 0 && daysAgo < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function ConversationItem({
  conversation,
  isSelected,
  onClick
}: {
  conversation: ConversationWithDetails
  isSelected: boolean
  onClick: () => void
}) {
  const { last_message, unread_count } = conversation
  const displayName = getConversationDisplayName(conversation)
  const initials = getConversationInitials(conversation)
  const isGroup = isGroupConversation(conversation)
  const memberCount = conversation.members?.length ?? 0

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors',
        isSelected ? 'bg-primary/10' : 'hover:bg-secondary'
      )}
    >
      <div className="relative">
        <Avatar className="h-12 w-12">
          <AvatarFallback className={cn(
            'font-medium',
            isGroup ? 'bg-violet-500/20 text-violet-600 dark:text-violet-400' : 'bg-primary/20 text-primary'
          )}>
            {isGroup ? <Users className="h-5 w-5" /> : initials}
          </AvatarFallback>
        </Avatar>
        {!isGroup && conversation.other_user?.is_online && (
          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-card bg-online" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className={cn(
            'font-medium truncate',
            unread_count > 0 ? 'text-foreground' : 'text-foreground'
          )}>
            {displayName}
          </span>
          {last_message && (
            <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
              {formatTime(last_message.created_at)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className={cn(
            'truncate text-sm',
            unread_count > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'
          )}>
            {isGroup && memberCount > 0 && !last_message
              ? `${memberCount} members`
              : last_message?.text || 'No messages yet'}
          </p>
          {unread_count > 0 && (
            <span className="ml-2 flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

function ConversationListSkeleton() {
  return (
    <div className="space-y-1 p-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg p-3">
          <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-3 w-36 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

function NewChatDialog({
  currentUserId,
  onClose,
  onConversationCreated,
  onSelectConversation
}: {
  currentUserId: string
  onClose: () => void
  onConversationCreated: () => void | Promise<void>
  onSelectConversation: (id: string) => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const { users, loading, searchUsers } = useSearchUsers(currentUserId)
  const { createConversation } = useCreateConversation()
  const [creating, setCreating] = useState(false)

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setSearchQuery(query)
    searchUsers(query)
  }

  const handleSelectUser = async (user: Profile) => {
    setCreating(true)
    try {
      const conversation = await createConversation(currentUserId, user.id)
      if (conversation) {
        // Await the refresh to ensure the new conversation is in the client-side list
        await onConversationCreated()
        onSelectConversation(conversation.id)
      }
    } catch (error) {
      console.error('Failed to create or select conversation:', error)
    } finally {
      setCreating(false)
      onClose()
    }
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-card">
      <div className="flex items-center gap-2 border-b p-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <span className="font-medium">New Chat</span>
      </div>
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={handleSearch}
            className="pl-9 bg-secondary border-0"
            autoFocus
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center p-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : users.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {searchQuery ? 'No users found' : 'Search for users to start a chat'}
          </p>
        ) : (
          users.map(user => (
            <button
              key={user.id}
              onClick={() => handleSelectUser(user)}
              disabled={creating}
              className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-secondary disabled:opacity-50"
            >
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/20 text-primary font-medium">
                  {user.avatar_initials}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium">{user.display_name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  isLoading = false,
  currentUserId,
  onConversationCreated
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const router = useRouter()

  const filteredConversations = conversations.filter(conv =>
    getConversationDisplayName(conv).toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="relative flex h-full flex-col bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <h1 className="text-xl font-semibold text-foreground">Messages</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowNewGroup(true)}
            className="text-muted-foreground hover:text-foreground"
            title="New group"
          >
            <Users className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowNewChat(true)}
            className="text-muted-foreground hover:text-foreground"
            title="New chat"
          >
            <MessageSquarePlus className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-foreground"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-secondary border-0"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <ConversationListSkeleton />
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="rounded-full bg-muted p-4 mb-3">
              <MessageSquarePlus className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {searchQuery ? 'Try a different search term' : 'Start a new conversation'}
            </p>
            {!searchQuery && (
              <Button
                variant="link"
                className="mt-2"
                onClick={() => setShowNewChat(true)}
              >
                Start a new chat
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-0.5 p-2">
            {filteredConversations.map(conversation => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isSelected={selectedId === conversation.id}
                onClick={() => onSelect(conversation.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* New chat dialog */}
      {showNewChat && currentUserId && (
        <NewChatDialog
          currentUserId={currentUserId}
          onClose={() => setShowNewChat(false)}
          onConversationCreated={onConversationCreated}
          onSelectConversation={onSelect}
        />
      )}
      {showNewGroup && currentUserId && (
        <CreateGroupDialog
          currentUserId={currentUserId}
          onClose={() => setShowNewGroup(false)}
          onCreated={(id) => {
            onConversationCreated()
            onSelect(id)
          }}
        />
      )}
    </div>
  )
}
