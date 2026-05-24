"use client";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Check, CheckCheck } from "lucide-react";
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
} from "@/lib/types";

// ─── External sub-components (you provide these) ────────────────────────────
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
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onReplyTo?: (message: Message) => void;
  onOpenThread?: (message: Message) => void;
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
  if (daysAgo > 0 && daysAgo < 7) {
    return format(date, "EEEE");
  }

  return format(date, "EEEE, MMMM d");
}

function getDateKey(dateString: string): string {
  return format(new Date(dateString), "yyyy-MM-dd");
}

function buildReplyCounts(messages: Message[]): Record<string, number> {
  const counts: Record<string, number> = {};
  messages.forEach((m) => {
    if (m.reply_to) {
      counts[m.reply_to] = (counts[m.reply_to] || 0) + 1;
    }
  });
  return counts;
}

function getReplyPreviewText(
  repliedTo: NonNullable<Message["replied_to_message"]>
): string {
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
  if (senderId && profileById.has(senderId)) {
    return profileById.get(senderId)!.display_name;
  }
  return repliedTo.sender?.display_name ?? otherUser?.display_name ?? "Unknown";
}

// ─── Small UI pieces ─────────────────────────────────────────────────────────

function MessageStatus({ status }: { status: Message["status"] }) {
  switch (status) {
    case "sending":
      return <span className="text-xs text-muted-foreground">Sending...</span>;
    case "sent":
      return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
    case "delivered":
      return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
    case "read":
      return <CheckCheck className="h-3.5 w-3.5 text-primary" />;
    default:
      return null;
  }
}

function MessageThreadSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex gap-2",
              i % 2 === 0 ? "justify-start" : "justify-end"
            )}
          >
            {i % 2 === 0 && (
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted flex-shrink-0" />
            )}
            <div
              className={cn(
                "animate-pulse rounded-2xl",
                i % 2 === 0 ? "bg-muted" : "bg-primary/20"
              )}
              style={{
                width: `${Math.random() * 150 + 100}px`,
                height: "40px",
              }}
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
        <p className="text-sm text-muted-foreground">
          Select a conversation to start chatting
        </p>
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
      <h3 className="text-lg font-semibold text-foreground">
        {otherUser.display_name}
      </h3>
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
        isSent
          ? "bg-black/15 border-l-emerald-300/90"
          : "bg-black/5 border-l-primary dark:bg-white/10"
      )}
    >
      <p
        className={cn(
          "text-xs font-semibold leading-tight",
          isSent ? "text-emerald-100" : "text-primary"
        )}
      >
        {getReplySenderName(repliedTo, currentUserId, otherUser, profileById)}
      </p>
      <p
        className={cn(
          "text-xs truncate mt-0.5 leading-tight",
          isSent ? "text-white/80" : "text-muted-foreground"
        )}
      >
        {getReplyPreviewText(repliedTo)}
      </p>
    </button>
  );
}

function AssistantText({ text }: { text: string }) {
  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {text.split(/(@assistant\b)/gi).map((part, i) =>
        /@assistant\b/i.test(part) ? (
          <span key={i} className="text-blue-500 font-semibold">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

interface BubbleProps {
  message: Message;
  isSent: boolean;
  currentUserId: string;
  otherUser: Profile | null;
  profileById: Map<string, Profile>;
  onJumpToMessage: (messageId: string) => void;
  polls?: Record<string, Poll>;
  tasks?: Record<string, Task>;
  calendarEvents?: Record<string, CalendarEvent>;
  reminders?: Record<string, Reminder>;
  participants?: Profile[];
}

function MessageBubble({
  message,
  isSent,
  currentUserId,
  otherUser,
  profileById,
  onJumpToMessage,
  polls = {},
  tasks = {},
  calendarEvents = {},
  reminders = {},
  participants = [],
}: BubbleProps) {
  const type = message.message_type;

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

  // GIF — no bubble wrapper
  if (type === "gif" && message.file_url) {
    return (
      <div
        className={cn(
          "rounded-2xl overflow-hidden max-w-[280px]",
          isSent
            ? "bg-message-sent rounded-br-md"
            : "bg-message-received rounded-bl-md"
        )}
      >
        {replyPreview}
        <div className={replyPreview ? "px-2 pb-2" : ""}>
          <img
            src={message.file_url}
            alt="GIF"
            className="rounded-xl max-w-[240px] max-h-[240px] object-contain"
            loading="lazy"
          />
        </div>
      </div>
    );
  }

  // Productivity types — no bubble wrapper, just the component
  if (type === "poll") {
    const poll = polls[message.id];
    return (
      <div>
        {replyPreview}
        {poll ? (
          <PollComponent poll={poll} userId={currentUserId} />
        ) : (
          <div className="text-sm text-gray-500 italic p-2 bg-gray-50 dark:bg-gray-800 rounded">
            {message.text || "Loading poll..."}
          </div>
        )}
      </div>
    );
  }

  if (type === "task") {
    const task = tasks[message.id];
    return (
      <div>
        {replyPreview}
        {task ? (
          <TaskComponent
            task={task}
            userId={currentUserId}
            participants={participants}
          />
        ) : (
          <div className="text-sm text-gray-500 italic p-2 bg-gray-50 dark:bg-gray-800 rounded">
            Setting up task...
          </div>
        )}
      </div>
    );
  }

  if (type === "calendar_event") {
    const event = calendarEvents[message.id];
    return (
      <div>
        {replyPreview}
        {event ? (
          <CalendarEventComponent
            event={event}
            userId={currentUserId}
            participants={participants}
          />
        ) : (
          <div className="text-sm text-gray-500 italic p-2 bg-gray-50 dark:bg-gray-800 rounded">
            Setting up event...
          </div>
        )}
      </div>
    );
  }

  if (type === "reminder") {
    const reminder = reminders[message.id];
    return (
      <div>
        {replyPreview}
        {reminder ? (
          <ReminderComponent reminder={reminder} userId={currentUserId} />
        ) : (
          <div className="text-sm text-gray-500 italic p-2 bg-gray-50 dark:bg-gray-800 rounded">
            Setting up reminder...
          </div>
        )}
      </div>
    );
  }

  // Default bubble (text + file)
  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-2.5",
        isSent
          ? "bg-message-sent text-message-sent-foreground rounded-br-md"
          : "bg-message-received text-message-received-foreground rounded-bl-md"
      )}
    >
      {replyPreview}

      {(!type || type === "text") && (
        <AssistantText text={message.text ?? ""} />
      )}

      {type === "file" && message.file_url && (
        <a
          href={message.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-2 p-2 bg-black bg-opacity-10 rounded hover:bg-opacity-20 transition-colors"
        >
          <svg
            className="w-6 h-6 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {message.file_name || "File"}
            </p>
            {message.file_size && (
              <p className="text-xs opacity-75">
                {(message.file_size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>
        </a>
      )}
    </div>
  );
}

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
  onDeleteMessage,
  onReplyTo,
  onOpenThread,
}: MessageThreadProps) {
  const profileById = useMemo(() => {
    const map = new Map<string, Profile>();
    memberProfiles.forEach((p) => map.set(p.id, p));
    if (otherUser) map.set(otherUser.id, otherUser);
    return map;
  }, [memberProfiles, otherUser]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null
  );
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);

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

  const displayMessages = useMemo(() => {
    const byId = new Map(messages.map((m) => [m.id, m]));
    return messages.map((message) => {
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
              parent.sender_id === currentUserId
                ? "You"
                : profileById.get(parent.sender_id)?.display_name ??
                  otherUser?.display_name,
          },
        },
      };
    });
  }, [messages, currentUserId, otherUser, profileById]);

  if (isLoading) return <MessageThreadSkeleton />;
  if (displayMessages.length === 0) return <EmptyChat otherUser={otherUser} />;

  // Group by date
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

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="space-y-6">
        {groupedMessages.map((group) => (
          <div key={group.date}>
            {/* Date header */}
            <div className="flex items-center justify-center mb-4">
              <span className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                {formatDateHeader(group.messages[0].created_at)}
              </span>
            </div>

            {/* Messages */}
            <div className="space-y-3">
              {group.messages.map((message, index) => {
                const isSent = message.sender_id === currentUserId;
                const prevMessage = group.messages[index - 1];
                const showAvatar =
                  !isSent &&
                  (!prevMessage || prevMessage.sender_id !== message.sender_id);
                const showSenderName =
                  isGroup &&
                  !isSent &&
                  showAvatar;
                const senderProfile = profileById.get(message.sender_id);
                const replyCount = replyCounts[message.id] ?? 0;

                return (
                  <div
                    key={message.id}
                    id={`message-${message.id}`}
                    className={cn(
                      "flex gap-2 scroll-mt-4 rounded-lg transition-colors duration-500",
                      isSent ? "justify-end" : "justify-start",
                      highlightedMessageId === message.id &&
                        "bg-primary/10 ring-2 ring-primary/30"
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

                    <div
                      className={cn(
                        "max-w-[70%] space-y-1",
                        isSent ? "items-end" : "items-start"
                      )}
                    >
                      {showSenderName && senderProfile && (
                        <p className="text-xs font-medium text-primary px-1 mb-0.5">
                          {senderProfile.display_name}
                        </p>
                      )}
                      {/* Bubble + hover actions */}
                      <div className="relative group">
                        <MessageBubble
                          message={message}
                          isSent={isSent}
                          currentUserId={currentUserId}
                          otherUser={otherUser}
                          profileById={profileById}
                          onJumpToMessage={scrollToMessage}
                          polls={polls}
                          tasks={tasks}
                          calendarEvents={calendarEvents}
                          reminders={reminders}
                          participants={participants}
                        />

                        {/* Reply button (right side) */}
                        {onReplyTo && (
                          <button
                            onClick={() => onReplyTo(message)}
                            className={cn(
                              "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100",
                              "p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-opacity",
                              isSent ? "-left-8" : "-right-8" // ← flip based on side
                            )}
                            title="Reply"
                          >
                            <svg
                              className="w-4 h-4 text-gray-600 dark:text-gray-300"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                              />
                            </svg>
                          </button>
                        )}

                        {/* Delete button (left side, own messages only) */}
                        {isSent && onDeleteMessage && (
                          <button
                            onClick={() => handleDeleteMessage(message.id)}
                            disabled={deletingMessageId === message.id}
                            className="absolute -left-14 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded-full transition-opacity disabled:opacity-50"
                            title="Delete"
                          >
                            <svg
                              className="w-4 h-4 text-red-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Thread reply count */}
                      {replyCount > 0 && onOpenThread && (
                        <button
                          type="button"
                          onClick={() => onOpenThread(message)}
                          className={cn(
                            "text-[11px] px-2 py-0.5 rounded-full bg-black bg-opacity-10 hover:bg-opacity-20",
                            isSent ? "text-blue-50" : "text-gray-600"
                          )}
                        >
                          {replyCount} {replyCount === 1 ? "reply" : "replies"}
                        </button>
                      )}

                      {/* Timestamp + status */}
                      <div
                        className={cn(
                          "flex items-center gap-1 px-1",
                          isSent ? "justify-end" : "justify-start"
                        )}
                      >
                        <span className="text-[10px] text-muted-foreground">
                          {formatTime(message.created_at)}
                        </span>
                        {isSent && <MessageStatus status={message.status} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div ref={messagesEndRef} />
    </div>
  );
}
