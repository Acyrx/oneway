'use client'

import type { ConversationWithDetails, Profile } from '@/lib/types'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Phone, Video, MoreVertical, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getConversationDisplayName,
  getConversationInitials,
  isGroupConversation,
} from '@/lib/conversation-utils'

interface ChatHeaderProps {
  conversation?: ConversationWithDetails | null
  user?: Profile | null
  onBack?: () => void
  showBackButton?: boolean
  onOpenGroupInfo?: () => void
}

export function ChatHeader({
  conversation,
  user,
  onBack,
  showBackButton,
  onOpenGroupInfo,
}: ChatHeaderProps) {
  const isGroup = conversation ? isGroupConversation(conversation) : false
  const displayUser = user ?? conversation?.other_user

  if (!displayUser && !isGroup) {
    return (
      <header className="flex items-center gap-3 border-b bg-card px-4 py-3">
        <span className="text-muted-foreground">Select a conversation</span>
      </header>
    )
  }

  const title = conversation
    ? getConversationDisplayName(conversation)
    : displayUser?.display_name ?? 'Chat'
  const initials = conversation
    ? getConversationInitials(conversation)
    : displayUser?.avatar_initials ?? '??'
  const memberCount = conversation?.members?.length ?? 0
  const subtitle = isGroup
    ? `${memberCount} participants${conversation?.my_role === 'admin' ? ' · You are admin' : ''}`
    : displayUser?.is_online
      ? 'Online'
      : 'Offline'

  return (
    <header className="flex items-center gap-3 border-b bg-card px-4 py-3">
      {showBackButton && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-9 w-9 md:hidden text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
      )}

      <button
        type="button"
        onClick={isGroup ? onOpenGroupInfo : undefined}
        className={cn(
          'flex items-center gap-3 min-w-0 flex-1 text-left',
          isGroup && 'hover:opacity-80 transition-opacity cursor-pointer'
        )}
      >
        <div className="relative flex-shrink-0">
          <Avatar className="h-10 w-10">
            <AvatarFallback
              className={
                isGroup
                  ? 'bg-violet-500/20 text-violet-600 dark:text-violet-400 font-medium'
                  : 'bg-primary/20 text-primary font-medium'
              }
            >
              {isGroup ? <Users className="h-4 w-4" /> : initials}
            </AvatarFallback>
          </Avatar>
          {!isGroup && displayUser?.is_online && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-online" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-foreground truncate">{title}</h2>
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        </div>
      </button>

      <div className="flex items-center gap-1 flex-shrink-0">
        {!isGroup && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
            >
              <Phone className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
            >
              <Video className="h-4 w-4" />
            </Button>
          </>
        )}
        {isGroup && onOpenGroupInfo && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            onClick={onOpenGroupInfo}
            title="Group info"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        )}
      </div>
    </header>
  )
}
