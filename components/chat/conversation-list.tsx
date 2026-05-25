'use client'

import { useState } from 'react'
import { Search, MessageSquarePlus, LogOut, Users, ChevronDown, BellOff, Archive, FolderPlus, X as XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ConversationWithDetails, Profile, PresenceStatus, ChatFolder } from '@/lib/types'
import { useSearchUsers, useCreateConversation } from '@/hooks/use-chat'
import { isEncryptedPayload } from '@/lib/encryption'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { isToday, isYesterday, differenceInCalendarDays } from 'date-fns'
import {
  getConversationDisplayName,
  getConversationInitials,
  isGroupConversation,
} from '@/lib/conversation-utils'
import { CreateGroupDialog } from './create-group-dialog'
import { StatusBar } from './status-bar'

const PRESENCE_STATUSES: { value: PresenceStatus; label: string; dot: string }[] = [
  { value: 'online',  label: 'Online',   dot: 'bg-online' },
  { value: 'away',    label: 'Away 🌙',   dot: 'bg-yellow-400' },
  { value: 'busy',    label: 'Busy 🔴',   dot: 'bg-red-500' },
  { value: 'sleepy',  label: 'Sleepy 😴', dot: 'bg-blue-400' },
  { value: 'vibing',  label: 'Vibing 🎵', dot: 'bg-purple-500' },
  { value: 'brb',     label: 'BRB ⏰',    dot: 'bg-orange-400' },
]

function getStatusDotClass(status: PresenceStatus): string {
  return PRESENCE_STATUSES.find(s => s.value === status)?.dot ?? 'bg-online'
}

interface ConversationListProps {
  conversations: ConversationWithDetails[]
  selectedId: string | null
  onSelect: (id: string) => void
  isLoading?: boolean
  currentUserId: string | undefined
  currentUserProfile?: Profile | null
  onConversationCreated: () => void | Promise<void>
  myStatus?: PresenceStatus
  onStatusChange?: (status: PresenceStatus) => void
  mutedConversationIds?: Set<string>
  archivedConversationIds?: Set<string>
  mentionedConversationIds?: Set<string>
  folders?: ChatFolder[]
  onCreateFolder?: (name: string, emoji?: string) => Promise<string | null>
  onDeleteFolder?: (folderId: string) => void
  onAddToFolder?: (folderId: string, conversationId: string) => void
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

function getLastMessagePreview(msg: import('@/lib/types').Message): string {
  const type = msg.message_type
  if (type === 'image') return '📷 Photo'
  if (type === 'voice_note') return '🎤 Voice note'
  if (type === 'gif') return '🎞 GIF'
  if (type === 'file') return `📎 ${msg.file_name || 'File'}`
  if (type === 'poll') return '📊 Poll'
  if (type === 'task') return '✅ Task'
  if (type === 'calendar_event') return '📅 Event'
  if (type === 'reminder') return '⏰ Reminder'
  if (msg.text && isEncryptedPayload(msg.text)) return '🔒 Encrypted message'
  return msg.text || ''
}

function ConversationItem({
  conversation,
  isSelected,
  onClick,
  otherUserStatus,
  isMuted,
  isMentioned,
}: {
  conversation: ConversationWithDetails
  isSelected: boolean
  onClick: () => void
  otherUserStatus?: PresenceStatus
  isMuted?: boolean
  isMentioned?: boolean
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
          <span className={cn("absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-card", getStatusDotClass(otherUserStatus ?? 'online'))} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn(
              'truncate',
              unread_count > 0 ? 'font-semibold text-foreground' : 'font-medium text-foreground'
            )}>
              {displayName}
            </span>
            {isMuted && <BellOff className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
          </div>
          {last_message && (
            <span className={cn(
              'text-xs ml-2 flex-shrink-0',
              unread_count > 0 ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'
            )}>
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
              : last_message
                ? getLastMessagePreview(last_message)
                : 'No messages yet'}
          </p>
          <div className="flex items-center gap-1 ml-1.5 flex-shrink-0">
            {isMentioned && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-400 text-yellow-900 text-[10px] font-bold">
                @
              </span>
            )}
            {unread_count > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 px-1.5 text-xs font-bold text-white">
                {unread_count > 99 ? '99+' : unread_count}
              </span>
            )}
          </div>
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
  currentUserProfile,
  onConversationCreated,
  myStatus = 'online',
  onStatusChange,
  mutedConversationIds,
  archivedConversationIds,
  mentionedConversationIds,
  folders = [],
  onCreateFolder,
  onDeleteFolder,
  onAddToFolder,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [showStatusPicker, setShowStatusPicker] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'archived' | string>('all')
  const [showFolderCreate, setShowFolderCreate] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderEmoji, setNewFolderEmoji] = useState('📁')
  const [showArchivedSection, setShowArchivedSection] = useState(false)
  const router = useRouter()

  const activeConversations = conversations.filter(c => !archivedConversationIds?.has(c.id))
  const archivedConversations = conversations.filter(c => archivedConversationIds?.has(c.id))

  const tabFiltered = (() => {
    if (activeTab === 'unread') return activeConversations.filter(c => c.unread_count > 0)
    if (activeTab === 'archived') return archivedConversations
    const folder = folders.find(f => f.id === activeTab)
    if (folder) return activeConversations.filter(c => folder.conversationIds.has(c.id))
    return activeConversations
  })()

  const filteredConversations = tabFiltered.filter(conv =>
    getConversationDisplayName(conv).toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="relative flex h-full flex-col bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-3 sm:p-4 pt-safe">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Messages</h1>
          {/* Status picker */}
          {onStatusChange && (
            <div className="relative">
              <button
                onClick={() => setShowStatusPicker(v => !v)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary hover:bg-secondary/80 transition-colors text-xs"
                title="Change status"
              >
                <span className={cn("h-2 w-2 rounded-full flex-shrink-0", getStatusDotClass(myStatus))} />
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
              {showStatusPicker && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-card rounded-xl shadow-lg border border-border p-1 min-w-[160px]">
                  {PRESENCE_STATUSES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => { onStatusChange(s.value); setShowStatusPicker(false); }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-secondary transition-colors",
                        myStatus === s.value && "bg-secondary font-medium"
                      )}
                    >
                      <span className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0", s.dot)} />
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
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

      {/* Status bar */}
      <StatusBar userId={currentUserId} profile={currentUserProfile} />

      {/* Search */}
      <div className="px-3 pt-3 pb-1">
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

      {/* Folder tabs */}
      <div className="flex items-center gap-1 px-3 pb-2 overflow-x-auto scrollbar-hide">
        {([
          { id: 'all', label: 'All', emoji: '' },
          { id: 'unread', label: 'Unread', emoji: '' },
          ...folders.map(f => ({ id: f.id, label: f.name, emoji: f.emoji ?? '' })),
          { id: 'archived', label: 'Archived', emoji: '' },
        ] as { id: string; label: string; emoji: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0',
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
            )}
          >
            {tab.id === 'archived' && <Archive className="h-3 w-3" />}
            {tab.emoji && <span>{tab.emoji}</span>}
            {tab.label}
            {tab.id !== 'all' && tab.id !== 'unread' && tab.id !== 'archived' && onDeleteFolder && (
              <button
                onClick={e => { e.stopPropagation(); onDeleteFolder(tab.id); if (activeTab === tab.id) setActiveTab('all'); }}
                className="ml-0.5 opacity-60 hover:opacity-100"
              >
                <XIcon className="h-2.5 w-2.5" />
              </button>
            )}
          </button>
        ))}
        {/* Create folder button */}
        {onCreateFolder && (
          <button
            onClick={() => setShowFolderCreate(true)}
            className="flex-shrink-0 p-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="New folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Folder create inline form */}
      {showFolderCreate && (
        <div className="mx-3 mb-2 p-2.5 bg-secondary rounded-xl flex items-center gap-2">
          <input
            value={newFolderEmoji}
            onChange={e => setNewFolderEmoji(e.target.value)}
            className="w-8 text-center bg-transparent text-sm focus:outline-none"
            maxLength={2}
          />
          <input
            autoFocus
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={async e => {
              if (e.key === 'Enter' && newFolderName.trim()) {
                await onCreateFolder?.(newFolderName.trim(), newFolderEmoji)
                setNewFolderName(''); setShowFolderCreate(false)
              }
              if (e.key === 'Escape') { setShowFolderCreate(false); setNewFolderName('') }
            }}
            placeholder="Folder name…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <button
            onClick={async () => {
              if (newFolderName.trim()) {
                await onCreateFolder?.(newFolderName.trim(), newFolderEmoji)
                setNewFolderName(''); setShowFolderCreate(false)
              }
            }}
            className="text-primary text-xs font-medium"
          >
            Create
          </button>
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto scroll-touch pb-safe">
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
              <div key={conversation.id} className="relative group/item">
                <ConversationItem
                  conversation={conversation}
                  isSelected={selectedId === conversation.id}
                  onClick={() => onSelect(conversation.id)}
                  otherUserStatus={conversation.other_user?.presence_status as PresenceStatus | undefined}
                  isMuted={mutedConversationIds?.has(conversation.id)}
                  isMentioned={mentionedConversationIds?.has(conversation.id)}
                />
                {/* Folder assign hover button */}
                {onAddToFolder && folders.length > 0 && activeTab !== 'archived' && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 transition-opacity z-10">
                    <div className="relative group/folder">
                      <button className="p-1 rounded bg-secondary/80 text-muted-foreground hover:text-foreground text-[10px]" title="Add to folder">
                        📁
                      </button>
                      <div className="absolute right-0 top-full mt-1 hidden group-hover/folder:block bg-card rounded-lg shadow-lg border border-border p-1 min-w-[140px] z-50">
                        {folders.map(f => (
                          <button
                            key={f.id}
                            onClick={() => onAddToFolder(f.id, conversation.id)}
                            className="flex w-full items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-secondary"
                          >
                            <span>{f.emoji ?? '📁'}</span>
                            <span className="truncate">{f.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
