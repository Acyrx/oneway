"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import EmojiPicker from "@/components/EmojiPicker";
import GifPicker from "@/components/GifPicker";
import { Message, Profile } from "@/lib/types";

interface MessageInputProps {
  onSend: (text: string) => void;
  onSendGif?: (gifUrl: string) => void;
  onCreateProductivity?: (
    type: "poll" | "task" | "calendar_event" | "reminder"
  ) => void;
  disabled?: boolean;
  isSending?: boolean;
  replyingTo?: Message | null;
  onCancelReply?: () => void;
  // To resolve the sender name in the reply preview
  currentUserId?: string;
  otherUser?: Profile | null;
}

export function MessageInput({
  onSend,
  onSendGif,
  onCreateProductivity,
  disabled,
  isSending,
  replyingTo,
  onCancelReply,
  currentUserId,
  otherUser,
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120
      )}px`;
    }
  }, [message]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || disabled || isSending) return;
    onSend(trimmed);
    setMessage("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const handleEmojiClick = (emoji: string) => {
    setMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handleGifSelect = (gifUrl: string) => {
    onSendGif?.(gifUrl);
    setShowGifPicker(false);
  };

  // Resolve the display name of whoever sent the message being replied to
  const replySenderName = replyingTo
    ? replyingTo.sender_id === currentUserId
      ? "You"
      : otherUser?.display_name ?? "Unknown"
    : null;

  const replyPreviewText = replyingTo
    ? replyingTo.message_type === "gif"
      ? "GIF"
      : replyingTo.message_type === "file"
      ? replyingTo.file_name || "File"
      : replyingTo.message_type === "image"
      ? "Photo"
      : replyingTo.text?.trim() || "Message"
    : "";

  return (
    <div className="border-t bg-card">
      {/* Reply preview banner */}
      {replyingTo && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 bg-muted/40">
          <div className="flex-1 min-w-0 border-l-4 border-primary pl-2.5 py-1 rounded-sm bg-background/60">
            <p className="text-xs font-semibold text-primary truncate">
              {replySenderName}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {replyPreviewText}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-1 hover:bg-secondary rounded-full text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-4">
        <div className="flex items-end gap-2">
          {/* Attachment */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground"
            disabled={disabled}
          >
            <Paperclip className="h-5 w-5" />
          </Button>

          {/* Textarea */}
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                setShowEmojiPicker(false);
                setShowGifPicker(false);
              }}
              placeholder="Type a message..."
              disabled={disabled}
              rows={1}
              className={cn(
                "w-full resize-none rounded-2xl border-0 bg-secondary px-4 py-2.5 pr-24 text-sm",
                "placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary/20",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "max-h-[120px]"
              )}
            />

            {/* Emoji + GIF buttons */}
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setShowEmojiPicker((v) => !v);
                  setShowGifPicker(false);
                }}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
                title="Emoji"
              >
                <svg
                  className="w-5 h-5 text-gray-600 dark:text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowGifPicker((v) => !v);
                  setShowEmojiPicker(false);
                }}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
                title="GIF"
              >
                <svg
                  className="w-5 h-5 text-gray-600 dark:text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </button>
            </div>

            <EmojiPicker
              onEmojiClick={handleEmojiClick}
              isOpen={showEmojiPicker}
              onClose={() => setShowEmojiPicker(false)}
            />
            <GifPicker
              onGifSelect={handleGifSelect}
              isOpen={showGifPicker}
              onClose={() => setShowGifPicker(false)}
            />
          </div>

          {/* Productivity menu */}
          {onCreateProductivity && (
            <div className="relative group">
              <button
                type="button"
                className="p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors"
                title="Productivity"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              </button>
              <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-50">
                <div className="bg-card rounded-lg shadow-lg border border-border p-2 min-w-[180px]">
                  {(
                    [
                      {
                        type: "poll",
                        label: "Create Poll",
                        icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
                      },
                      {
                        type: "task",
                        label: "Create Task",
                        icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
                      },
                      {
                        type: "calendar_event",
                        label: "Create Event",
                        icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
                      },
                      {
                        type: "reminder",
                        label: "Create Reminder",
                        icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
                      },
                    ] as const
                  ).map(({ type, label, icon }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => onCreateProductivity(type)}
                      className="w-full text-left px-3 py-2 hover:bg-secondary rounded text-sm flex items-center gap-2 text-foreground transition-colors"
                    >
                      <svg
                        className="w-4 h-4 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d={icon}
                        />
                      </svg>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Send */}
          <Button
            type="submit"
            size="icon"
            className={cn(
              "h-10 w-10 flex-shrink-0 rounded-full transition-all",
              message.trim()
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
            disabled={!message.trim() || disabled || isSending}
          >
            {isSending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
