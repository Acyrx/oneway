"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { X, Send, CornerDownRight } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Message, Profile } from "@/lib/types";

interface ThreadNode {
  message: Message;
  children: ThreadNode[];
  depth: number;
}

function buildTree(rootId: string, allMessages: Message[], depth = 0): ThreadNode | null {
  const root = allMessages.find(m => m.id === rootId);
  if (!root) return null;
  const children = allMessages
    .filter(m => m.reply_to === rootId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(m => buildTree(m.id, allMessages, depth + 1))
    .filter((n): n is ThreadNode => n !== null);
  return { message: root, children, depth };
}

function countDescendants(node: ThreadNode): number {
  return node.children.reduce((acc, c) => acc + 1 + countDescendants(c), 0);
}

function getMessagePreview(msg: Message): string {
  const type = msg.message_type;
  if (!type || type === "text") return msg.text?.trim().slice(0, 80) || "Message";
  if (type === "image") return "📷 Photo";
  if (type === "gif") return "GIF";
  if (type === "file") return `📎 ${msg.file_name || "File"}`;
  if (type === "voice_note") return "🎤 Voice note";
  if (type === "poll") return "📊 Poll";
  if (type === "task") return "✅ Task";
  if (type === "calendar_event") return "📅 Event";
  if (type === "reminder") return "⏰ Reminder";
  return msg.text?.trim() || "Message";
}

function ThreadMessageBubble({
  node,
  profileById,
  currentUserId,
  onReplyToNode,
}: {
  node: ThreadNode;
  profileById: Map<string, Profile>;
  currentUserId: string;
  onReplyToNode: (messageId: string) => void;
}) {
  const { message, children, depth } = node;
  const sender = profileById.get(message.sender_id);
  const isSelf = message.sender_id === currentUserId;
  const indent = Math.min(depth, 4) * 20;

  return (
    <div style={{ paddingLeft: `${indent}px` }}>
      {depth > 0 && (
        <div
          className="flex items-center gap-1 mb-0.5 ml-1"
          style={{ paddingLeft: 0 }}
        >
          <CornerDownRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
        </div>
      )}

      <div className="flex gap-2.5 py-2 group">
        <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5">
          <AvatarFallback className={cn(
            "text-[10px] font-medium",
            isSelf ? "bg-primary/20 text-primary" : "bg-secondary text-foreground"
          )}>
            {sender?.avatar_initials ?? "?"}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className={cn(
              "text-xs font-semibold",
              isSelf ? "text-primary" : "text-foreground"
            )}>
              {isSelf ? "You" : sender?.display_name ?? "Unknown"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(message.created_at), "h:mm a")}
            </span>
          </div>

          <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap break-words leading-snug">
            {getMessagePreview(message)}
          </p>

          {message.file_url && message.message_type === "image" && (
            <img
              src={message.file_url}
              alt="Photo"
              className="mt-1.5 rounded-lg max-w-[180px] max-h-[180px] object-cover"
            />
          )}

          <button
            onClick={() => onReplyToNode(message.id)}
            className="mt-1 text-[10px] text-primary/60 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Reply
          </button>
        </div>
      </div>

      {children.map(child => (
        <ThreadMessageBubble
          key={child.message.id}
          node={child}
          profileById={profileById}
          currentUserId={currentUserId}
          onReplyToNode={onReplyToNode}
        />
      ))}
    </div>
  );
}

interface ThreadPanelProps {
  rootMessageId: string;
  allMessages: Message[];
  memberProfiles: Profile[];
  currentUserId: string;
  otherUser: Profile | null;
  onClose: () => void;
  onSendReply: (text: string, replyToId: string) => Promise<void>;
}

export function ThreadPanel({
  rootMessageId,
  allMessages,
  memberProfiles,
  currentUserId,
  otherUser,
  onClose,
  onSendReply,
}: ThreadPanelProps) {
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingToId, setReplyingToId] = useState(rootMessageId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const profileById = useMemo(() => {
    const map = new Map<string, Profile>();
    memberProfiles.forEach(p => map.set(p.id, p));
    if (otherUser) map.set(otherUser.id, otherUser);
    return map;
  }, [memberProfiles, otherUser]);

  const tree = useMemo(
    () => buildTree(rootMessageId, allMessages),
    [rootMessageId, allMessages]
  );

  const replyCount = useMemo(
    () => tree ? countDescendants(tree) : 0,
    [tree]
  );

  const replyingToMsg = useMemo(
    () => allMessages.find(m => m.id === replyingToId),
    [allMessages, replyingToId]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
    }
  }, [replyText]);

  const handleSend = async () => {
    const trimmed = replyText.trim();
    if (!trimmed || sending) return;
    setSending(true);
    await onSendReply(trimmed, replyingToId);
    setReplyText("");
    setSending(false);
  };

  if (!tree) return null;

  const rootSender = profileById.get(tree.message.sender_id);
  const replyingSenderName = replyingToId !== rootMessageId
    ? (() => {
        const s = profileById.get(replyingToMsg?.sender_id ?? "");
        return s?.display_name ?? "Unknown";
      })()
    : null;

  return (
    <div className="flex flex-col h-full border-l bg-card w-full md:w-[360px] flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h3 className="font-semibold text-foreground text-sm">Thread</h3>
          {replyCount > 0 && (
            <p className="text-xs text-muted-foreground">{replyCount} {replyCount === 1 ? "reply" : "replies"}</p>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Thread content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Root message */}
        <div className="pb-3 border-b mb-3">
          <div className="flex gap-2.5">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback className="text-xs font-medium bg-primary/20 text-primary">
                {rootSender?.avatar_initials ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {tree.message.sender_id === currentUserId ? "You" : rootSender?.display_name ?? "Unknown"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(tree.message.created_at), "h:mm a")}
                </span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words mt-0.5">
                {getMessagePreview(tree.message)}
              </p>
              {tree.message.file_url && tree.message.message_type === "image" && (
                <img
                  src={tree.message.file_url}
                  alt="Photo"
                  className="mt-1.5 rounded-lg max-w-[200px] max-h-[200px] object-cover"
                />
              )}
            </div>
          </div>
        </div>

        {/* Thread replies */}
        {replyCount > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </p>
            {tree.children.map(child => (
              <ThreadMessageBubble
                key={child.message.id}
                node={child}
                profileById={profileById}
                currentUserId={currentUserId}
                onReplyToNode={setReplyingToId}
              />
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Reply input */}
      <div className="border-t p-3">
        {replyingSenderName && (
          <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground">
            <CornerDownRight className="h-3 w-3" />
            <span>Replying to <span className="font-medium text-foreground">{replyingSenderName}</span></span>
            <button
              onClick={() => setReplyingToId(rootMessageId)}
              className="ml-auto text-primary hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="Reply in thread..."
            rows={1}
            className="flex-1 resize-none rounded-xl border-0 bg-secondary px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 max-h-[100px]"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!replyText.trim() || sending}
            className={cn(
              "h-9 w-9 rounded-full flex-shrink-0",
              replyText.trim() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {sending
              ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              : <Send className="h-3.5 w-3.5" />
            }
          </Button>
        </div>
      </div>
    </div>
  );
}
