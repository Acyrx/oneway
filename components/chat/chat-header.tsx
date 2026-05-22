'use client'

import type { Profile } from '@/lib/types'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Phone, Video, MoreVertical } from 'lucide-react'

interface ChatHeaderProps {
  user: Profile | null
  onBack?: () => void
  showBackButton?: boolean
}

export function ChatHeader({ user, onBack, showBackButton }: ChatHeaderProps) {
  if (!user) {
    return (
      <header className="flex items-center gap-3 border-b bg-card px-4 py-3">
        <span className="text-muted-foreground">Select a conversation</span>
      </header>
    )
  }

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
      
      <div className="relative">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary/20 text-primary font-medium">
            {user.avatar_initials}
          </AvatarFallback>
        </Avatar>
        {user.is_online && (
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-online" />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <h2 className="font-semibold text-foreground truncate">{user.display_name}</h2>
        <p className="text-xs text-muted-foreground">
          {user.is_online ? 'Online' : 'Offline'}
        </p>
      </div>
      
      <div className="flex items-center gap-1">
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
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
