"use client";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Check, CheckCheck, Pin, Pencil, Forward, X, Play, Pause, Lock, Star, MessageCircle, Timer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  format,
  isToday,
  isYesterday,
  differenceInCalendarDays,
} from "date-fns";
import type {
  Message,
  Profile,
  Poll,
  Task,
  CalendarEvent,
  Reminder,
  PinnedMessage,
  ConversationWithDetails,
} from "@/lib/types";

import PollComponent from "@/components/PollComponent";
import TaskComponent from "@/components/chat/TaskComponent";
import CalendarEventComponent from "@/components/CalendarEventComponent";
import ReminderComponent from "@/components/ReminderComponent";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MessageThreadProps {
  messages: Message[];
  currentUserId: string;
  otherUser: Profile | null;
  isGroup?: boolean;
  memberProfiles?: Profile[];
  isLoading?: boolean;
  polls?: Record<string, Poll>;
  tasks?: Record<string, Task>;
  calendarEvents?: Record<string, CalendarEvent>;
  reminders?: Record<string, Reminder>;
  participants?: Profile[];
  pinnedMessages?: PinnedMessage[];
  conversations?: ConversationWithDetails[];
  blockedUserIds?: Set<string>;
  decryptedTexts?: Record<string, string>;
  isEncrypted?: boolean;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onReplyTo?: (message: Message) => void;
  onOpenThread?: (message: Message) => void;
  onEditMessage?: (messageId: string, newText: string) => Promise<boolean>;
  onPinMessage?: (message: Message) => Promise<void>;
  onUnpinMessage?: (messageId: string) => Promise<void>;
  onForwardMessage?: (message: Message, targetConversationId: string) => Promise<void>;
  starredMessageIds?: Set<string>;
  onStarMessage?: (message: Message) => void;
  onUnstarMessage?: (messageId: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(dateString: string): string {
  return format(new Date(dateString), "h:mm a");
}

function formatDateHeader(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  const daysAgo = differenceInCalendarDays(now, date);
  if (daysAgo > 0 && daysAgo < 7) return format(date, "EEEE");
  return format(date, "EEEE, MMMM d");
}

function getDateKey(dateString: string): string {
  return format(new Date(dateString), "yyyy-MM-dd");
}

function buildReplyCounts(messages: Message[]): Record<string, number> {
  const counts: Record<string, number> = {};
  messages.forEach((m) => {
    if (m.reply_to) counts[m.reply_to] = (counts[m.reply_to] || 0) + 1;
  });
  return counts;
}

function getReplyPreviewText(repliedTo: NonNullable<Message["replied_to_message"]>): string {
  const type = repliedTo.message_type;
  if (type === "gif") return "GIF";
  if (type === "file") return repliedTo.file_name || "File";
  if (type === "image") return "Photo";
  if (type === "poll") return "Poll";
  if (type === "task") return "Task";
  if (type === "calendar_event") return "Calendar event";
  if (type === "reminder") return "Reminder";
  return repliedTo.text?.trim() || "Message";
}

function getReplySenderName(
  repliedTo: NonNullable<Message["replied_to_message"]>,
  currentUserId: string,
  otherUser: Profile | null,
  profileById: Map<string, Profile>
): string {
  const senderId = repliedTo.sender?.id;
  if (senderId === currentUserId) return "You";
  if (senderId && profileById.has(senderId)) return profileById.get(senderId)!.display_name;
  return repliedTo.sender?.display_name ?? otherUser?.display_name ?? "Unknown";
}

// ─── Small UI pieces ─────────────────────────────────────────────────────────

function MessageStatus({ status }: { status: Message["status"] }) {
  switch (status) {
    case "sending": return <span className="text-xs text-muted-foreground">Sending...</span>;
    case "sent": return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
    case "delivered": return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
    case "read": return <CheckCheck className="h-3.5 w-3.5 text-primary" />;
    default: return null;
  }
}

function MessageThreadSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className={cn("flex gap-2", i % 2 === 0 ? "justify-start" : "justify-end")}>
            {i % 2 === 0 && <div className="h-8 w-8 animate-pulse rounded-full bg-muted flex-shrink-0" />}
            <div
              className={cn("animate-pulse rounded-2xl", i % 2 === 0 ? "bg-muted" : "bg-primary/20")}
              style={{ width: `${Math.random() * 150 + 100}px`, height: "40px" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyChat({ otherUser }: { otherUser: Profile | null }) {
  if (!otherUser) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Select a conversation to start chatting</p>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <Avatar className="h-16 w-16 mb-4">
        <AvatarFallback className="bg-primary/20 text-primary text-xl font-medium">
          {otherUser.avatar_initials}
        </AvatarFallback>
      </Avatar>
      <h3 className="text-lg font-semibold text-foreground">{otherUser.display_name}</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Start a conversation with {otherUser.display_name.split(" ")[0]}
      </p>
    </div>
  );
}

function ReplyPreview({
  repliedTo,
  isSent,
  currentUserId,
  otherUser,
  profileById,
  onJumpToMessage,
}: {
  repliedTo: NonNullable<Message["replied_to_message"]>;
  isSent: boolean;
  currentUserId: string;
  otherUser: Profile | null;
  profileById: Map<string, Profile>;
  onJumpToMessage: (messageId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onJumpToMessage(repliedTo.id)}
      className={cn(
        "w-full text-left mb-2 rounded-md px-2.5 py-1.5 border-l-4 transition-colors",
        "hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        isSent ? "bg-black/15 border-l-emerald-300/90" : "bg-black/5 border-l-primary dark:bg-white/10"
      )}
    >
      <p className={cn("text-xs font-semibold leading-tight", isSent ? "text-emerald-100" : "text-primary")}>
        {getReplySenderName(repliedTo, currentUserId, otherUser, profileById)}
      </p>
      <p className={cn("text-xs truncate mt-0.5 leading-tight", isSent ? "text-white/80" : "text-muted-foreground")}>
        {getReplyPreviewText(repliedTo)}
      </p>
    </button>
  );
}

function MessageText({
  text,
  profileById,
  currentUserId,
}: {
  text: string;
  profileById?: Map<string, Profile>;
  currentUserId?: string;
}) {
  const profiles = profileById ? Array.from(profileById.values()) : [];
  const names = profiles.map(p => p.display_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  names.push("assistant");
  const regex = names.length
    ? new RegExp(`(@(?:${names.join("|")}))`, "gi")
    : /(@assistant\b)/gi;

  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {text.split(regex).map((part, i) => {
        if (part.startsWith("@")) {
          const name = part.slice(1).toLowerCase();
          const profile = profiles.find(p => p.display_name.toLowerCase() === name);
          const isSelf = profile?.id === currentUserId;
          return (
            <mark
              key={i}
              className={isSelf
                ? "bg-yellow-200 dark:bg-yellow-800/60 text-yellow-900 dark:text-yellow-200 rounded px-0.5 font-semibold not-italic"
                : "bg-transparent text-primary font-semibold not-italic"}
            >
              {part}
            </mark>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function fmtAudio(s: number): string {
  if (!Number.isFinite(s) || Number.isNaN(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function parseVoiceNoteDuration(text: string | null | undefined): number {
  const match = text?.match(/Voice note \((\d+):(\d{2})\)/);
  if (!match) return 0;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function VoiceNotePlayer({ url, isSent, durationHint = 0 }: { url: string; isSent: boolean; durationHint?: number }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(durationHint);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggle = () => {
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); } else { audioRef.current.play(); }
    setIsPlaying(!isPlaying);
  };

  const effectiveDuration = duration > 0 ? duration : durationHint;
  const progress = effectiveDuration > 0 ? (elapsed / effectiveDuration) * 100 : 0;

  return (
    <div className="flex items-center gap-2 min-w-[180px] max-w-[260px]">
      <button
        onClick={toggle}
        className={cn(
          "p-2 rounded-full flex-shrink-0",
          isSent ? "bg-white/20 hover:bg-white/30" : "bg-primary/20 hover:bg-primary/30"
        )}
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <div className="flex-1 space-y-1">
        <div
          className={cn("h-1 rounded-full overflow-hidden cursor-pointer", isSent ? "bg-white/20" : "bg-black/10")}
          onClick={(e) => {
            if (!audioRef.current || !effectiveDuration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            audioRef.current.currentTime = pct * effectiveDuration;
          }}
        >
          <div
            className={cn("h-full rounded-full transition-all", isSent ? "bg-white/80" : "bg-primary")}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <p className={cn("text-[10px]", isSent ? "text-white/70" : "text-muted-foreground")}>
          {isPlaying ? fmtAudio(elapsed) : fmtAudio(effectiveDuration)}
        </p>
      </div>
      <audio
        ref={audioRef}
        src={url}
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration;
          if (d && Number.isFinite(d)) setDuration(d);
        }}
        onTimeUpdate={() => {
          const t = audioRef.current?.currentTime ?? 0;
          setElapsed(t);
          if (effectiveDuration > 0) {
            // also refine duration from currentTime if we only had a hint
          }
        }}
        onEnded={() => { setIsPlaying(false); setElapsed(0); }}
      />
    </div>
  );
}

// ─── Forward Dialog ───────────────────────────────────────────────────────────

function ForwardDialog({
  message,
  conversations,
  onClose,
  onForward,
}: {
  message: Message;
  conversations: ConversationWithDetails[];
  onClose: () => void;
  onForward: (targetConversationId: string) => Promise<void>;
}) {
  const [forwarding, setForwarding] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const handleForward = async (convId: string) => {
    setForwarding(convId);
    await onForward(convId);
    setForwarding(null);
    setDone(prev => new Set([...prev, convId]));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-foreground">Forward message</h3>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-full">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.map((conv) => {
            const name = conv.type === "group"
              ? (conv.name ?? "Group")
              : (conv.other_user?.display_name ?? "User");
            const initials = conv.type === "group"
              ? (conv.name?.[0]?.toUpperCase() ?? "G")
              : (conv.other_user?.avatar_initials ?? "?");
            const isDone = done.has(conv.id);

            return (
              <button
                key={conv.id}
                onClick={() => !isDone && handleForward(conv.id)}
                disabled={forwarding === conv.id}
                className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-secondary transition-colors disabled:opacity-50"
              >
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarFallback className="bg-primary/20 text-primary font-medium text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 font-medium text-sm text-foreground truncate">{name}</span>
                {isDone && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                {forwarding === conv.id && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
        <div className="p-3 border-t">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pinned messages banner ───────────────────────────────────────────────────

function PinnedMessagesBanner({
  pinnedMessages,
  onJumpToMessage,
  onUnpin,
}: {
  pinnedMessages: PinnedMessage[];
  onJumpToMessage: (messageId: string) => void;
  onUnpin?: (messageId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!pinnedMessages.length) return null;

  const latest = pinnedMessages[0];
  const previewText =
    latest.message_type === "gif" ? "GIF" :
    latest.message_type === "poll" ? "Poll" :
    latest.message_type === "task" ? "Task" :
    latest.message_type === "calendar_event" ? "Calendar event" :
    latest.message_type === "reminder" ? "Reminder" :
    latest.message_text?.slice(0, 60) || "Pinned message";

  return (
    <div className="border-b bg-card">
      <button
        type="button"
        onClick={() => {
          if (pinnedMessages.length === 1) {
            onJumpToMessage(latest.message_id);
          } else {
            setExpanded(v => !v);
          }
        }}
        className="flex w-full items-center gap-2 px-4 py-2 hover:bg-secondary/50 transition-colors"
      >
        <Pin className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs text-primary font-semibold">
            {pinnedMessages.length === 1 ? "Pinned message" : `${pinnedMessages.length} pinned messages`}
          </p>
          <p className="text-xs text-muted-foreground truncate">{previewText}</p>
        </div>
        {pinnedMessages.length > 1 && (
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {expanded ? "▲" : "▼"}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t bg-muted/30 max-h-48 overflow-y-auto">
          {pinnedMessages.map((pm) => {
            const text =
              pm.message_type === "gif" ? "GIF" :
              pm.message_type === "poll" ? "Poll" :
              pm.message_type === "task" ? "Task" :
              pm.message_type === "calendar_event" ? "Calendar event" :
              pm.message_type === "reminder" ? "Reminder" :
              pm.message_text?.slice(0, 80) || "Message";
            return (
              <div key={pm.id} className="flex items-center gap-2 px-4 py-2 hover:bg-secondary/50 group">
                <button
                  type="button"
                  onClick={() => { onJumpToMessage(pm.message_id); setExpanded(false); }}
                  className="flex-1 text-left min-w-0"
                >
                  <p className="text-xs text-foreground truncate">{text}</p>
                </button>
                {onUnpin && (
                  <button
                    type="button"
                    onClick={() => onUnpin(pm.message_id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded-full transition-opacity"
                    title="Unpin"
                  >
                    <X className="h-3 w-3 text-red-500" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

interface BubbleProps {
  message: Message;
  isSent: boolean;
  isBlocked: boolean;
  currentUserId: string;
  otherUser: Profile | null;
  profileById: Map<string, Profile>;
  onJumpToMessage: (messageId: string) => void;
  polls?: Record<string, Poll>;
  tasks?: Record<string, Task>;
  calendarEvents?: Record<string, CalendarEvent>;
  reminders?: Record<string, Reminder>;
  participants?: Profile[];
  decryptedText?: string;
  isEditing: boolean;
  editDraft: string;
  onEditDraftChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
}

function MessageBubble({
  message,
  isSent,
  isBlocked,
  currentUserId,
  otherUser,
  profileById,
  onJumpToMessage,
  polls = {},
  tasks = {},
  calendarEvents = {},
  reminders = {},
  participants = [],
  decryptedText,
  isEditing,
  editDraft,
  onEditDraftChange,
  onEditSave,
  onEditCancel,
}: BubbleProps) {
  const type = message.message_type;

  // Blocked user message
  if (isBlocked) {
    return (
      <div className={cn("rounded-2xl px-4 py-2.5 italic text-sm", isSent ? "bg-message-sent text-message-sent-foreground/60 rounded-br-md" : "bg-message-received text-message-received-foreground/60 rounded-bl-md")}>
        🚫 This message is hidden
      </div>
    );
  }

  const replyPreview = message.replied_to_message ? (
    <ReplyPreview
      repliedTo={message.replied_to_message}
      isSent={isSent}
      currentUserId={currentUserId}
      otherUser={otherUser}
      profileById={profileById}
      onJumpToMessage={onJumpToMessage}
    />
  ) : null;

  if (type === "gif" && message.file_url) {
    return (
      <div className={cn("rounded-2xl overflow-hidden max-w-[280px]", isSent ? "bg-message-sent rounded-br-md" : "bg-message-received rounded-bl-md")}>
        {replyPreview}
        <div className={replyPreview ? "px-2 pb-2" : ""}>
          <img src={message.file_url} alt="GIF" className="rounded-xl max-w-[240px] max-h-[240px] object-contain" loading="lazy" />
        </div>
      </div>
    );
  }

  if (type === "image" && message.file_url) {
    return (
      <div className={cn("rounded-2xl overflow-hidden max-w-[280px]", isSent ? "bg-message-sent rounded-br-md" : "bg-message-received rounded-bl-md")}>
        {replyPreview && <div className="px-2 pt-2">{replyPreview}</div>}
        <a href={message.file_url} target="_blank" rel="noopener noreferrer">
          <img
            src={message.file_url}
            alt={message.file_name ?? "Photo"}
            className="max-w-[260px] max-h-[300px] object-cover cursor-pointer hover:opacity-95 transition-opacity"
            loading="lazy"
          />
        </a>
      </div>
    );
  }

  if (type === "voice_note" && message.file_url) {
    return (
      <div className={cn("rounded-2xl px-3 py-2.5", isSent ? "bg-message-sent text-message-sent-foreground rounded-br-md" : "bg-message-received text-message-received-foreground rounded-bl-md")}>
        {replyPreview}
        <VoiceNotePlayer
          url={message.file_url}
          isSent={isSent}
          durationHint={parseVoiceNoteDuration(message.text)}
        />
      </div>
    );
  }

  if (type === "poll") {
    const poll = polls[message.id];
    return (
      <div>
        {replyPreview}
        {poll ? <PollComponent poll={poll} userId={currentUserId} /> : (
          <div className="text-sm text-gray-500 italic p-2 bg-gray-50 dark:bg-gray-800 rounded">{message.text || "Loading poll..."}</div>
        )}
      </div>
    );
  }

  if (type === "task") {
    const task = tasks[message.id];
    return (
      <div>
        {replyPreview}
        {task ? <TaskComponent task={task} userId={currentUserId} /> : (
          <div className="text-sm text-gray-500 italic p-2 bg-gray-50 dark:bg-gray-800 rounded">Setting up task...</div>
        )}
      </div>
    );
  }

  if (type === "calendar_event") {
    const event = calendarEvents[message.id];
    return (
      <div>
        {replyPreview}
        {event ? <CalendarEventComponent event={event} userId={currentUserId} /> : (
          <div className="text-sm text-gray-500 italic p-2 bg-gray-50 dark:bg-gray-800 rounded">Setting up event...</div>
        )}
      </div>
    );
  }

  if (type === "reminder") {
    const reminder = reminders[message.id];
    return (
      <div>
        {replyPreview}
        {reminder ? <ReminderComponent reminder={reminder} userId={currentUserId} /> : (
          <div className="text-sm text-gray-500 italic p-2 bg-gray-50 dark:bg-gray-800 rounded">Setting up reminder...</div>
        )}
      </div>
    );
  }

  // Default text/file bubble
  return (
    <div className={cn("rounded-2xl px-4 py-2.5", isSent ? "bg-message-sent text-message-sent-foreground rounded-br-md" : "bg-message-received text-message-received-foreground rounded-bl-md")}>
      {replyPreview}

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={editDraft}
            onChange={(e) => onEditDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEditSave(); }
              if (e.key === "Escape") onEditCancel();
            }}
            className="w-full min-w-[160px] resize-none rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-white/50"
            rows={Math.max(1, editDraft.split("\n").length)}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={onEditCancel} className="text-xs px-2 py-0.5 rounded opacity-70 hover:opacity-100">Cancel</button>
            <button onClick={onEditSave} className="text-xs px-2 py-0.5 rounded bg-white/20 hover:bg-white/30">Save</button>
          </div>
        </div>
      ) : (
        <>
          {(!type || type === "text") && (
            <div>
              <MessageText
                text={decryptedText ?? message.text ?? ""}
                profileById={profileById}
                currentUserId={currentUserId}
              />
              <div className="flex items-center gap-1 mt-0.5">
                {message.edited_at && <span className="text-[10px] opacity-60">(edited)</span>}
                {decryptedText && decryptedText !== message.text && (
                  <Lock className="h-2.5 w-2.5 opacity-50" />
                )}
              </div>
            </div>
          )}

          {type === "file" && message.file_url && (
            <a
              href={message.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 p-2 bg-black bg-opacity-10 rounded hover:bg-opacity-20 transition-colors"
            >
              <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{message.file_name || "File"}</p>
                {message.file_size && (
                  <p className="text-xs opacity-75">{(message.file_size / 1024 / 1024).toFixed(2)} MB</p>
                )}
              </div>
            </a>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MessageThread({
  messages,
  currentUserId,
  otherUser,
  isGroup = false,
  memberProfiles = [],
  isLoading = false,
  polls = {},
  tasks = {},
  calendarEvents = {},
  reminders = {},
  participants = [],
  pinnedMessages = [],
  conversations = [],
  blockedUserIds = new Set(),
  decryptedTexts = {},
  isEncrypted = false,
  onDeleteMessage,
  onReplyTo,
  onOpenThread,
  onEditMessage,
  onPinMessage,
  onUnpinMessage,
  onForwardMessage,
  starredMessageIds = new Set(),
  onStarMessage,
  onUnstarMessage,
}: MessageThreadProps) {
  const profileById = useMemo(() => {
    const map = new Map<string, Profile>();
    memberProfiles.forEach((p) => map.set(p.id, p));
    if (otherUser) map.set(otherUser.id, otherUser);
    return map;
  }, [memberProfiles, otherUser]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);

  const pinnedMessageIds = useMemo(() => new Set(pinnedMessages.map((p) => p.message_id)), [pinnedMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const scrollToMessage = (messageId: string) => {
    const el = document.getElementById(`message-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);
    window.setTimeout(() => setHighlightedMessageId(null), 1600);
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!onDeleteMessage) return;
    if (!confirm("Are you sure you want to delete this message?")) return;
    setDeletingMessageId(messageId);
    await onDeleteMessage(messageId);
    setDeletingMessageId(null);
  };

  const handleStartEdit = (message: Message) => {
    setEditingMessageId(message.id);
    setEditDraft(message.text ?? "");
  };

  const handleEditSave = async () => {
    if (!editingMessageId || !onEditMessage) return;
    if (!editDraft.trim()) { setEditingMessageId(null); return; }
    await onEditMessage(editingMessageId, editDraft);
    setEditingMessageId(null);
    setEditDraft("");
  };

  const handleEditCancel = () => {
    setEditingMessageId(null);
    setEditDraft("");
  };

  const handlePin = async (message: Message) => {
    if (pinnedMessageIds.has(message.id)) {
      await onUnpinMessage?.(message.id);
    } else {
      await onPinMessage?.(message);
    }
  };

  const displayMessages = useMemo(() => {
    const now = Date.now();
    const byId = new Map(messages.map((m) => [m.id, m]));
    return messages
      .filter(m => !m.expires_at || new Date(m.expires_at).getTime() > now)
      .map((message) => {
        if (message.replied_to_message || !message.reply_to) return message;
        const parent = byId.get(message.reply_to);
        if (!parent) return message;
        return {
          ...message,
          replied_to_message: {
            id: parent.id,
            text: parent.text,
            message_type: parent.message_type,
            file_url: parent.file_url,
            file_name: parent.file_name,
            sender: {
              id: parent.sender_id,
              display_name:
                parent.sender_id === currentUserId ? "You" :
                profileById.get(parent.sender_id)?.display_name ?? otherUser?.display_name,
            },
          },
        };
      });
  }, [messages, currentUserId, otherUser, profileById]);

  if (isLoading) return <MessageThreadSkeleton />;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Pinned messages banner */}
      <PinnedMessagesBanner
        pinnedMessages={pinnedMessages}
        onJumpToMessage={scrollToMessage}
        onUnpin={onUnpinMessage}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 scroll-touch overscroll-contain">
        {displayMessages.length === 0 ? (
          <EmptyChat otherUser={otherUser} />
        ) : (
          <>
            <div className="space-y-6">
              {(() => {
                const groupedMessages: { date: string; messages: Message[] }[] = [];
                let currentGroup: { date: string; messages: Message[] } | null = null;
                displayMessages.forEach((message) => {
                  const dateKey = getDateKey(message.created_at);
                  if (!currentGroup || currentGroup.date !== dateKey) {
                    currentGroup = { date: dateKey, messages: [] };
                    groupedMessages.push(currentGroup);
                  }
                  currentGroup.messages.push(message);
                });

                const replyCounts = buildReplyCounts(displayMessages);

                return groupedMessages.map((group) => (
                  <div key={group.date}>
                    <div className="flex items-center justify-center mb-4">
                      <span className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                        {formatDateHeader(group.messages[0].created_at)}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {group.messages.map((message, index) => {
                        const isSent = message.sender_id === currentUserId;
                        const prevMessage = group.messages[index - 1];
                        const showAvatar = !isSent && (!prevMessage || prevMessage.sender_id !== message.sender_id);
                        const showSenderName = isGroup && !isSent && showAvatar;
                        const senderProfile = profileById.get(message.sender_id);
                        const replyCount = replyCounts[message.id] ?? 0;
                        const isPinned = pinnedMessageIds.has(message.id);
                        const isEditingThis = editingMessageId === message.id;
                        const canEdit = isSent && (!message.message_type || message.message_type === "text");

                        return (
                          <div
                            key={message.id}
                            id={`message-${message.id}`}
                            className={cn(
                              "flex gap-2 scroll-mt-4 rounded-lg transition-colors duration-500",
                              isSent ? "justify-end" : "justify-start",
                              highlightedMessageId === message.id && "bg-primary/10 ring-2 ring-primary/30"
                            )}
                          >
                            {/* Avatar */}
                            {!isSent && (
                              <div className="w-8 flex-shrink-0">
                                {showAvatar && (senderProfile || otherUser) && (
                                  <Avatar className="h-8 w-8">
                                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-medium">
                                      {(senderProfile ?? otherUser)!.avatar_initials}
                                    </AvatarFallback>
                                  </Avatar>
                                )}
                              </div>
                            )}

                            <div className={cn("message-bubble space-y-1", isSent ? "items-end" : "items-start")}>
                              {showSenderName && senderProfile && (
                                <p className="text-xs font-medium text-primary px-1 mb-0.5">
                                  {senderProfile.display_name}
                                </p>
                              )}

                              {/* Bubble + hover actions */}
                              <div className="relative group">
                                {isPinned && !isEditingThis && (
                                  <div className={cn("absolute -top-1 z-10", isSent ? "-left-4" : "-right-4")}>
                                    <Pin className="h-3 w-3 text-primary" />
                                  </div>
                                )}

                                <MessageBubble
                                  message={message}
                                  isSent={isSent}
                                  isBlocked={!isSent && blockedUserIds.has(message.sender_id)}
                                  currentUserId={currentUserId}
                                  otherUser={otherUser}
                                  profileById={profileById}
                                  onJumpToMessage={scrollToMessage}
                                  polls={polls}
                                  tasks={tasks}
                                  calendarEvents={calendarEvents}
                                  reminders={reminders}
                                  participants={participants}
                                  decryptedText={decryptedTexts[message.id]}
                                  isEditing={isEditingThis}
                                  editDraft={editDraft}
                                  onEditDraftChange={setEditDraft}
                                  onEditSave={handleEditSave}
                                  onEditCancel={handleEditCancel}
                                />

                                {/* Hover action buttons */}
                                {!isEditingThis && (
                                  <div className={cn(
                                    "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5",
                                    isSent ? "-left-28" : "-right-28"
                                  )}>
                                    {/* Reply */}
                                    {onReplyTo && (
                                      <button
                                        onClick={() => onReplyTo(message)}
                                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                                        title="Reply"
                                      >
                                        <svg className="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                        </svg>
                                      </button>
                                    )}

                                    {/* Star/Unstar */}
                                    {(onStarMessage || onUnstarMessage) && (
                                      <button
                                        onClick={() => {
                                          if (starredMessageIds.has(message.id)) {
                                            onUnstarMessage?.(message.id);
                                          } else {
                                            onStarMessage?.(message);
                                          }
                                        }}
                                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                                        title={starredMessageIds.has(message.id) ? "Unstar" : "Star"}
                                      >
                                        <Star className={cn("w-4 h-4", starredMessageIds.has(message.id) ? "text-yellow-500 fill-yellow-400" : "text-gray-600 dark:text-gray-300")} />
                                      </button>
                                    )}

                                    {/* Forward */}
                                    {onForwardMessage && conversations.length > 0 && (
                                      <button
                                        onClick={() => setForwardingMessage(message)}
                                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                                        title="Forward"
                                      >
                                        <Forward className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                      </button>
                                    )}

                                    {/* Pin/Unpin */}
                                    {(onPinMessage || onUnpinMessage) && (
                                      <button
                                        onClick={() => handlePin(message)}
                                        className={cn(
                                          "p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full",
                                          isPinned && "text-primary"
                                        )}
                                        title={isPinned ? "Unpin" : "Pin"}
                                      >
                                        <Pin className={cn("w-4 h-4", isPinned ? "text-primary" : "text-gray-600 dark:text-gray-300")} />
                                      </button>
                                    )}

                                    {/* Edit (own text messages only) */}
                                    {canEdit && onEditMessage && (
                                      <button
                                        onClick={() => handleStartEdit(message)}
                                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                                        title="Edit"
                                      >
                                        <Pencil className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                      </button>
                                    )}

                                    {/* Delete (own messages only) */}
                                    {isSent && onDeleteMessage && (
                                      <button
                                        onClick={() => handleDeleteMessage(message.id)}
                                        disabled={deletingMessageId === message.id}
                                        className="p-1 hover:bg-red-100 rounded-full disabled:opacity-50"
                                        title="Delete"
                                      >
                                        <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Thread reply count */}
                              {replyCount > 0 && onOpenThread && (
                                <button
                                  type="button"
                                  onClick={() => onOpenThread(message)}
                                  className={cn(
                                    "flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-lg border mt-0.5 transition-colors",
                                    isSent
                                      ? "border-white/30 text-white/90 bg-white/10 hover:bg-white/20"
                                      : "border-primary/20 text-primary bg-primary/5 hover:bg-primary/10"
                                  )}
                                >
                                  <MessageCircle className="h-3 w-3" />
                                  {replyCount} {replyCount === 1 ? "reply" : "replies"}
                                </button>
                              )}

                              {/* Timestamp + status */}
                              <div className={cn("flex items-center gap-1 px-1", isSent ? "justify-end" : "justify-start")}>
                                {starredMessageIds.has(message.id) && (
                                  <Star className="h-2.5 w-2.5 text-yellow-500 fill-yellow-400 flex-shrink-0" />
                                )}
                                {message.expires_at && (
                                  <span title="Disappearing message">
                                    <Timer className="h-2.5 w-2.5 text-amber-500 flex-shrink-0" />
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground">{formatTime(message.created_at)}</span>
                                {isSent && <MessageStatus status={message.status} />}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Forward dialog */}
      {forwardingMessage && (
        <ForwardDialog
          message={forwardingMessage}
          conversations={conversations}
          onClose={() => setForwardingMessage(null)}
          onForward={async (targetConversationId) => {
            await onForwardMessage?.(forwardingMessage, targetConversationId);
          }}
        />
      )}
    </div>
  );
}
