'use client'

import { useState } from 'react'
import type { ConversationWithDetails, Profile } from '@/lib/types'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowLeft, Phone, Video, MoreVertical, Users, Lock, BellOff, ShieldAlert, Flag, Archive, ArchiveRestore, Timer, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getConversationDisplayName,
  getConversationInitials,
  isGroupConversation,
} from '@/lib/conversation-utils'
import { DISAPPEAR_OPTIONS } from '@/hooks/use-chat'

interface ChatHeaderProps {
  conversation?: ConversationWithDetails | null
  user?: Profile | null
  onBack?: () => void
  showBackButton?: boolean
  onOpenGroupInfo?: () => void
  presenceStatus?: string | null
  typingLabel?: string | null
  isMuted?: boolean
  onToggleMute?: () => void
  isArchived?: boolean
  onToggleArchive?: () => void
  isBlocked?: boolean
  onToggleBlock?: () => void
  onReport?: () => void
  isEncrypted?: boolean
  canEncrypt?: boolean
  onToggleEncryption?: () => void
  disappearAfter?: number | null
  onSetDisappearAfter?: (seconds: number | null) => void
}

const PRESENCE_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  online:  { label: 'Online',      dot: 'bg-green-500',  bg: 'bg-green-500/15',  text: 'text-green-600 dark:text-green-400' },
  away:    { label: 'Away 🌙',     dot: 'bg-yellow-400', bg: 'bg-yellow-400/15', text: 'text-yellow-600 dark:text-yellow-400' },
  busy:    { label: 'Busy 🔴',     dot: 'bg-red-500',    bg: 'bg-red-500/15',    text: 'text-red-600 dark:text-red-400' },
  sleepy:  { label: 'Sleepy 😴',   dot: 'bg-blue-400',   bg: 'bg-blue-400/15',   text: 'text-blue-600 dark:text-blue-400' },
  vibing:  { label: 'Vibing 🎵',   dot: 'bg-purple-500', bg: 'bg-purple-500/15', text: 'text-purple-600 dark:text-purple-400' },
  brb:     { label: 'BRB ⏰',      dot: 'bg-orange-400', bg: 'bg-orange-400/15', text: 'text-orange-600 dark:text-orange-400' },
  offline: { label: 'Offline',     dot: 'bg-gray-400',   bg: 'bg-gray-400/15',   text: 'text-gray-500' },
}

function disappearLabel(seconds: number | null): string {
  const opt = DISAPPEAR_OPTIONS.find(o => o.seconds === seconds)
  return opt?.label ?? 'Off'
}

export function ChatHeader({
  conversation,
  user,
  onBack,
  showBackButton,
  onOpenGroupInfo,
  presenceStatus,
  typingLabel,
  isMuted,
  onToggleMute,
  isArchived,
  onToggleArchive,
  isBlocked,
  onToggleBlock,
  onReport,
  isEncrypted,
  canEncrypt,
  onToggleEncryption,
  disappearAfter,
  onSetDisappearAfter,
}: ChatHeaderProps) {
  const [reportConfirm, setReportConfirm] = useState(false)
  const [showTimerOptions, setShowTimerOptions] = useState(false)
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

  const isOnline = !!displayUser?.is_online
  const effectiveStatus = isOnline ? (presenceStatus ?? 'online') : 'offline'
  const pConf = PRESENCE_CONFIG[effectiveStatus] ?? PRESENCE_CONFIG.offline

  const subtitle = typingLabel
    ? typingLabel
    : isGroup
      ? `${memberCount} participant${memberCount !== 1 ? 's' : ''}${conversation?.my_role === 'admin' ? ' · Admin' : ''}`
      : pConf.label

  const hasOptions = onToggleMute || onToggleArchive || onToggleBlock || onReport || (canEncrypt && onToggleEncryption) || onSetDisappearAfter

  return (
    <header className="flex items-center gap-2 sm:gap-3 border-b bg-card px-3 sm:px-4 py-2.5 sm:py-3">
      {/* Back button (mobile) */}
      {showBackButton && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-10 w-10 md:hidden text-muted-foreground hover:text-foreground flex-shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
      )}

      {/* Avatar + name + status row */}
      <button
        type="button"
        onClick={isGroup ? onOpenGroupInfo : undefined}
        className={cn(
          'flex items-center gap-2.5 min-w-0 flex-1 text-left',
          isGroup && 'hover:opacity-80 transition-opacity cursor-pointer'
        )}
      >
        {/* Avatar with presence dot */}
        <div className="relative flex-shrink-0">
          <Avatar className="h-9 w-9 sm:h-10 sm:w-10">
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
          {/* Presence dot — always show for DMs */}
          {!isGroup && (
            <span className={cn(
              "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card transition-colors",
              pConf.dot,
              isOnline && effectiveStatus === 'online' && 'status-pulse'
            )} />
          )}
        </div>

        {/* Name + subtitle */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h2 className="font-semibold text-foreground truncate text-sm sm:text-base">{title}</h2>
            {isEncrypted && <Lock className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />}
            {isMuted && <BellOff className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
            {/* Disappearing messages indicator */}
            {disappearAfter && (
              <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium">
                <Timer className="h-2.5 w-2.5" />
                {disappearLabel(disappearAfter)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {/* Presence status pill for non-online / non-group */}
            {!isGroup && !typingLabel && effectiveStatus !== 'online' && (
              <span className={cn(
                'text-[11px] font-medium px-1.5 py-0.5 rounded-full',
                pConf.bg, pConf.text
              )}>
                {pConf.label}
              </span>
            )}
            {/* Subtitle text */}
            <p className={cn(
              'text-xs truncate',
              typingLabel ? 'text-primary animate-pulse' : 'text-muted-foreground'
            )}>
              {effectiveStatus === 'online' || isGroup ? subtitle : ''}
            </p>
          </div>
        </div>
      </button>

      {/* Action buttons */}
      <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
        {!isGroup && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground hidden sm:flex"
            >
              <Phone className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground hidden sm:flex"
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

        {hasOptions && (
          <DropdownMenu onOpenChange={(open) => { if (!open) { setReportConfirm(false); setShowTimerOptions(false) } }}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {onToggleMute && (
                <DropdownMenuItem onClick={onToggleMute}>
                  <BellOff className="mr-2 h-4 w-4" />
                  {isMuted ? 'Unmute conversation' : 'Mute conversation'}
                </DropdownMenuItem>
              )}

              {onToggleArchive && (
                <DropdownMenuItem onClick={onToggleArchive}>
                  {isArchived
                    ? <ArchiveRestore className="mr-2 h-4 w-4" />
                    : <Archive className="mr-2 h-4 w-4" />}
                  {isArchived ? 'Unarchive' : 'Archive conversation'}
                </DropdownMenuItem>
              )}

              {/* Disappearing messages — inline expandable */}
              {onSetDisappearAfter && (
                <>
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); setShowTimerOptions(v => !v) }}
                    className="flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Timer className="h-4 w-4" />
                      Disappearing messages
                    </span>
                    <span className={cn(
                      "text-xs transition-transform",
                      showTimerOptions ? "rotate-90" : ""
                    )}>▶</span>
                  </DropdownMenuItem>
                  {showTimerOptions && DISAPPEAR_OPTIONS.map(opt => (
                    <DropdownMenuItem
                      key={String(opt.seconds)}
                      onClick={() => onSetDisappearAfter(opt.seconds as number | null)}
                      className="flex items-center justify-between pl-8"
                    >
                      <span>{opt.label}</span>
                      {disappearAfter === opt.seconds && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {canEncrypt && onToggleEncryption && (
                <DropdownMenuItem onClick={onToggleEncryption}>
                  <Lock className={cn('mr-2 h-4 w-4', isEncrypted && 'text-green-500')} />
                  {isEncrypted ? 'Disable encryption' : 'Enable encryption'}
                </DropdownMenuItem>
              )}

              {(onToggleMute || onSetDisappearAfter || (canEncrypt && onToggleEncryption)) && (onToggleBlock || onReport) && (
                <DropdownMenuSeparator />
              )}

              {onToggleBlock && (
                <DropdownMenuItem
                  onClick={onToggleBlock}
                  className={isBlocked ? '' : 'text-destructive focus:text-destructive'}
                >
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  {isBlocked ? 'Unblock user' : 'Block user'}
                </DropdownMenuItem>
              )}

              {onReport && (
                <>
                  {reportConfirm ? (
                    <DropdownMenuItem
                      onClick={() => { onReport(); setReportConfirm(false) }}
                      className="text-destructive focus:text-destructive"
                    >
                      <Flag className="mr-2 h-4 w-4" />
                      Confirm report
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={(e) => { e.preventDefault(); setReportConfirm(true) }}
                      className="text-destructive focus:text-destructive"
                    >
                      <Flag className="mr-2 h-4 w-4" />
                      Report user
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  )
}
