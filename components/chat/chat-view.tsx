"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ConversationList } from "@/components/chat/conversation-list";
import { ChatHeader } from "@/components/chat/chat-header";
import { MessageThread } from "@/components/chat/message-thread";
import { MessageInput } from "@/components/chat/message-input";
import { MessageSquare } from "lucide-react";
import {
  useUser,
  useConversations,
  useMessages,
  useSendMessage,
  useSendGif,
  usePresenceWithStatus,
  useTypingIndicator,
  useEditMessage,
  usePinnedMessages,
  useFileUpload,
  useSendVoiceNote,
  useBlockedUsers,
  useMutedConversations,
  useE2EEncryption,
  useArchivedConversations,
  useChatFolders,
  usePushNotifications,
  useStarredMessages,
  useDisappearingMessages,
} from "@/hooks/use-chat";
import { createClient } from "@/lib/supabase/client";
import CreatePollModal from "../CreatePollModal";
import CreateTaskModal from "../CreateTaskModal";
import CreateCalendarEventModal from "../CreateCalendarEventModal";
import CreateReminderModal from "../CreateReminderModal";
import { GroupInfoPanel } from "./group-info-panel";
import { ThreadPanel } from "./thread-panel";
import {
  getMemberProfiles,
  isGroupConversation,
} from "@/lib/conversation-utils";
import type {
  Message,
  Profile,
  Poll,
  Task,
  CalendarEvent,
  Reminder,
} from "@/lib/types";
import { isEncryptedPayload } from "@/lib/encryption";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductivityType = "poll" | "task" | "calendar_event" | "reminder";

interface ProductivityModal {
  type: ProductivityType;
  messageId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatView() {
  const router = useRouter();
  const { user, profile, loading: userLoading } = useUser();
  const {
    conversations,
    loading: convsLoading,
    refetch,
    markConversationRead,
  } = useConversations(user?.id);

  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);

  const {
    messages,
    loading: messagesLoading,
    refetch: refetchMessages,
  } = useMessages(selectedConversationId, user?.id);
  const { sendMessage, sending } = useSendMessage();
  const { sendGif } = useSendGif();
  const { presenceMap, myStatus, updateStatus } = usePresenceWithStatus(user?.id);
  const { editMessage } = useEditMessage();
  const { pinnedMessages, pinMessage, unpinMessage } = usePinnedMessages(selectedConversationId);
  const { uploadFile } = useFileUpload();
  const { sendVoiceNote } = useSendVoiceNote();
  const { blockedIds, blockUser, unblockUser, reportUser } = useBlockedUsers(user?.id);
  const { mutedIds, muteConversation, unmuteConversation } = useMutedConversations(user?.id);
  const { archivedIds, archiveConversation, unarchiveConversation } = useArchivedConversations(user?.id);
  const { folders, createFolder, deleteFolder, addToFolder } = useChatFolders(user?.id);
  const { permission, requestPermission, subscribeToPush, showLocalNotification } = usePushNotifications(user?.id);
  const { starredIds, starMessage, unstarMessage } = useStarredMessages(user?.id);
  const { disappearAfter, setDisappearAfter, getExpiresAt } = useDisappearingMessages(selectedConversationId);

  // Typing indicator for the selected conversation
  const { typingUsers, sendTyping } = useTypingIndicator(
    selectedConversationId,
    user?.id,
    profile?.display_name
  );

  // Build typing label shown in header / input
  const typingLabel = (() => {
    if (!typingUsers.size) return null;
    const names = [...typingUsers.values()];
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return "Several people are typing...";
  })();

  // ── Enriched data with real-time presence ──────────────────────────────────
  const enrichedConversations = conversations.map((conv) => {
    const members = conv.members?.map((m) => {
      const pInfo = presenceMap.get(m.user_id);
      return {
        ...m,
        profile: {
          ...m.profile,
          is_online: !!pInfo?.isOnline,
          presence_status: pInfo?.status ?? 'online',
        },
      };
    });

    let other_user = conv.other_user;
    if (other_user) {
      const pInfo = presenceMap.get(other_user.id);
      other_user = {
        ...other_user,
        is_online: !!pInfo?.isOnline,
        presence_status: pInfo?.status ?? 'online',
      };
    }

    return { ...conv, members, other_user };
  });

  const selectedConversation = enrichedConversations.find(
    (c) => c.id === selectedConversationId
  );

  const otherUserId = selectedConversation?.other_user?.id ?? null;
  const { isEnabled: isEncrypted, toggleEncryption, encrypt, decrypt, canEncrypt } = useE2EEncryption(
    selectedConversationId,
    user?.id,
    otherUserId
  );

  // ── UI state ───────────────────────────────────────────────────────────────
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [productivityModal, setProductivityModal] =
    useState<ProductivityModal | null>(null);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [openThreadMessageId, setOpenThreadMessageId] = useState<string | null>(null);
  const [mentionedConvIds, setMentionedConvIds] = useState<Set<string>>(new Set());

  // ── Productivity data keyed by message.id ─────────────────────────────────
  const [polls, setPolls] = useState<Record<string, Poll>>({});
  const [tasks, setTasks] = useState<Record<string, Task>>({});
  const [calendarEvents, setCalendarEvents] = useState<
    Record<string, CalendarEvent>
  >({});
  const [reminders, setReminders] = useState<Record<string, Reminder>>({});
  const [decryptedTexts, setDecryptedTexts] = useState<Record<string, string>>({});

  // ── Browser Notifications ──────────────────────────────────────────────────
  useEffect(() => {
    const totalUnread = enrichedConversations.reduce(
      (acc, conv) => acc + (conv.unread_count || 0),
      0
    );

    if (totalUnread > 0) {
      document.title = `(${totalUnread}) Messages`;
    } else {
      document.title = "Messages";
    }

    const lastUnread = parseInt(sessionStorage.getItem("lastUnreadCount") || "0");
    if (totalUnread > lastUnread && selectedConversationId && !mutedIds.has(selectedConversationId)) {
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.type = "sine";
        osc.frequency.setValueAtTime(1046, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(784, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.28);
        osc.onended = () => ctx.close();
      } catch (_e) {}
    }
    sessionStorage.setItem("lastUnreadCount", totalUnread.toString());
  }, [enrichedConversations, mutedIds, selectedConversationId]);

  // ── Decrypt encrypted messages ─────────────────────────────────────────────
  useEffect(() => {
    if (!messages.length) return;
    const encrypted = messages.filter(m => isEncryptedPayload(m.text));
    if (!encrypted.length) return;

    encrypted.forEach(async (m) => {
      const senderPubKey = m.sender_id === user?.id
        ? null
        : selectedConversation?.other_user?.public_key ?? null;
      const plain = await decrypt(m.text, senderPubKey);
      setDecryptedTexts(prev => {
        if (prev[m.id] === plain) return prev;
        return { ...prev, [m.id]: plain };
      });
    });
  }, [messages, decrypt, user?.id, selectedConversation?.other_user?.public_key]);

  // ── Push notifications — request permission on first load ──────────────────
  useEffect(() => {
    if (!user || permission !== 'default') return;
    const asked = sessionStorage.getItem('push_asked');
    if (asked) return;
    sessionStorage.setItem('push_asked', '1');
    requestPermission().then(granted => {
      if (granted) subscribeToPush();
    });
  }, [user, permission, requestPermission, subscribeToPush]);

  // ── Mention detection — track which conversations mention current user ──────
  useEffect(() => {
    if (!profile || !messages.length || !selectedConversationId) return;
    const myName = profile.display_name.toLowerCase();
    const hasMention = messages.some(m =>
      m.sender_id !== user?.id && m.text?.toLowerCase().includes(`@${myName}`)
    );
    if (hasMention) {
      setMentionedConvIds(prev => new Set([...prev, selectedConversationId]));
    }
  }, [messages, profile, user?.id, selectedConversationId]);

  // Clear mention badge when user opens the conversation
  useEffect(() => {
    if (selectedConversationId) {
      setMentionedConvIds(prev => {
        if (!prev.has(selectedConversationId)) return prev;
        const n = new Set(prev); n.delete(selectedConversationId); return n;
      });
    }
  }, [selectedConversationId]);

  // Keep unread count at 0 while this conversation is open
  useEffect(() => {
    if (selectedConversationId && messages.length > 0) {
      markConversationRead(selectedConversationId);
    }
  }, [messages, selectedConversationId, markConversationRead]);

  // ── Show notification for new messages in other conversations ───────────────
  useEffect(() => {
    if (!profile) return;
    conversations.forEach(conv => {
      if (conv.id === selectedConversationId) return;
      if (mutedIds.has(conv.id)) return;
      if ((conv.unread_count ?? 0) === 0) return;
      const senderName = conv.other_user?.display_name ?? conv.name ?? 'Someone';
      const preview = conv.last_message?.text?.slice(0, 50) ?? 'New message';
      showLocalNotification(senderName, preview, conv.id);
    });
  }, [conversations]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auth redirect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, userLoading, router]);

  // Reset productivity maps when switching conversations
  useEffect(() => {
    setPolls({});
    setTasks({});
    setCalendarEvents({});
    setReminders({});
  }, [selectedConversationId]);

  // ── Fetch productivity data whenever messages change ───────────────────────
  useEffect(() => {
    if (!messages.length || !selectedConversationId) return;

    const supabase = createClient();

    const ids = (type: string) =>
      messages.filter((m) => m.message_type === type).map((m) => m.id);

    const pollIds = ids("poll");
    const taskIds = ids("task");
    const calIds = ids("calendar_event");
    const remIds = ids("reminder");

    async function fetchProductivityData() {
      if (pollIds.length) {
        const { data } = await supabase
          .from("polls")
          .select("*, poll_options(*), poll_votes(*)")
          .eq("conversation_id", selectedConversationId)
          .in("message_id", pollIds);
        if (data?.length) {
          const map: Record<string, Poll> = {};
          data.forEach((p) => {
            if (p.message_id) map[p.message_id] = p as Poll;
          });
          setPolls((prev) => ({ ...prev, ...map }));
        }
      }

      if (taskIds.length) {
        const { data } = await supabase
          .from("tasks")
          .select("*")
          .eq("conversation_id", selectedConversationId)
          .in("message_id", taskIds);
        if (data?.length) {
          const map: Record<string, Task> = {};
          data.forEach((t) => {
            if (t.message_id) map[t.message_id] = t as Task;
          });
          setTasks((prev) => ({ ...prev, ...map }));
        }
      }

      if (calIds.length) {
        const { data } = await supabase
          .from("calendar_events")
          .select("*")
          .eq("conversation_id", selectedConversationId)
          .in("message_id", calIds);
        if (data?.length) {
          const map: Record<string, CalendarEvent> = {};
          data.forEach((e) => {
            if (e.message_id) map[e.message_id] = e as CalendarEvent;
          });
          setCalendarEvents((prev) => ({ ...prev, ...map }));
        }
      }

      if (remIds.length) {
        const { data } = await supabase
          .from("reminders")
          .select("*")
          .eq("conversation_id", selectedConversationId)
          .in("message_id", remIds);
        if (data?.length) {
          const map: Record<string, Reminder> = {};
          data.forEach((r) => {
            if (r.message_id) map[r.message_id] = r as Reminder;
          });
          setReminders((prev) => ({ ...prev, ...map }));
        }
      }
    }

    fetchProductivityData();
  }, [messages, selectedConversationId]);

  // Retry fetch when message exists but record not loaded yet (race with realtime)
  useEffect(() => {
    if (!selectedConversationId || !messages.length) return;

    const missingCalIds = messages
      .filter(
        (m) => m.message_type === "calendar_event" && !calendarEvents[m.id]
      )
      .map((m) => m.id);
    const missingRemIds = messages
      .filter((m) => m.message_type === "reminder" && !reminders[m.id])
      .map((m) => m.id);

    if (!missingCalIds.length && !missingRemIds.length) return;

    const supabase = createClient();
    let cancelled = false;

    const retry = async () => {
      if (cancelled) return;

      if (missingCalIds.length) {
        const { data } = await supabase
          .from("calendar_events")
          .select("*")
          .eq("conversation_id", selectedConversationId)
          .in("message_id", missingCalIds);
        if (data?.length) {
          const map: Record<string, CalendarEvent> = {};
          data.forEach((e) => {
            if (e.message_id) map[e.message_id] = e as CalendarEvent;
          });
          setCalendarEvents((prev) => ({ ...prev, ...map }));
        }
      }

      if (missingRemIds.length) {
        const { data } = await supabase
          .from("reminders")
          .select("*")
          .eq("conversation_id", selectedConversationId)
          .in("message_id", missingRemIds);
        if (data?.length) {
          const map: Record<string, Reminder> = {};
          data.forEach((r) => {
            if (r.message_id) map[r.message_id] = r as Reminder;
          });
          setReminders((prev) => ({ ...prev, ...map }));
        }
      }
    };

    const t1 = setTimeout(retry, 500);
    const t2 = setTimeout(retry, 1500);
    const t3 = setTimeout(retry, 3000);

    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [messages, selectedConversationId, calendarEvents, reminders]);

  // Realtime: load events/reminders when the other user creates them
  useEffect(() => {
    if (!selectedConversationId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`productivity:${selectedConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "calendar_events",
          filter: `conversation_id=eq.${selectedConversationId}`,
        },
        (payload) => {
          const event = payload.new as CalendarEvent;
          if (event.message_id) {
            setCalendarEvents((prev) => ({
              ...prev,
              [event.message_id!]: event,
            }));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "calendar_events",
          filter: `conversation_id=eq.${selectedConversationId}`,
        },
        (payload) => {
          const event = payload.new as CalendarEvent;
          if (event.message_id) {
            setCalendarEvents((prev) => ({
              ...prev,
              [event.message_id!]: event,
            }));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "reminders",
          filter: `conversation_id=eq.${selectedConversationId}`,
        },
        (payload) => {
          const reminder = payload.new as Reminder;
          if (reminder.message_id) {
            setReminders((prev) => ({
              ...prev,
              [reminder.message_id!]: reminder,
            }));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "reminders",
          filter: `conversation_id=eq.${selectedConversationId}`,
        },
        (payload) => {
          const reminder = payload.new as Reminder;
          if (reminder.message_id) {
            setReminders((prev) => ({
              ...prev,
              [reminder.message_id!]: reminder,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConversationId]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const otherUser: Profile | null = selectedConversation?.other_user ?? null;
  const isGroup = selectedConversation
    ? isGroupConversation(selectedConversation)
    : false;
  const canShowChat =
    selectedConversationId &&
    (isGroup || otherUser);
  const chatParticipants: Profile[] = selectedConversation
    ? getMemberProfiles(selectedConversation).filter((p) => p.id !== user?.id)
    : otherUser
      ? [otherUser]
      : [];

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    markConversationRead(id);
    setReplyingTo(null);
    setShowGroupInfo(false);
    setOpenThreadMessageId(null);
  };

  const handleSendThreadReply = async (text: string, replyToId: string) => {
    if (!selectedConversationId || !user) return;
    await sendMessage(selectedConversationId, user.id, text, replyToId);
    refetch();
  };

  const handleBackToList = () => {
    setSelectedConversationId(null);
    setReplyingTo(null);
    setShowGroupInfo(false);
  };

  const handleSendMessage = async (text: string) => {
    if (!selectedConversationId || !user) return;
    const payload = await encrypt(text);
    await sendMessage(
      selectedConversationId,
      user.id,
      payload,
      replyingTo?.id ?? null,
      getExpiresAt()
    );
    setReplyingTo(null);
    refetch();
  };

  const handleSendFile = async (file: File) => {
    if (!selectedConversationId || !user) return;
    await uploadFile(selectedConversationId, user.id, file, getExpiresAt());
    refetch();
  };

  const handleSendVoiceNote = async (blob: Blob, duration: number) => {
    if (!selectedConversationId || !user) return;
    await sendVoiceNote(selectedConversationId, user.id, blob, duration, getExpiresAt());
    refetch();
  };

  const handleSendGif = async (gifUrl: string) => {
    if (!selectedConversationId || !user) return;
    await sendGif(selectedConversationId, user.id, gifUrl, getExpiresAt());
    refetch();
  };

  const handleDeleteMessage = async (messageId: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("sender_id", user!.id);
    if (error) console.error("Error deleting message:", error);
  };

  const handleEditMessage = async (messageId: string, newText: string): Promise<boolean> => {
    return editMessage(messageId, newText);
  };

  const handlePinMessage = async (message: Message) => {
    if (!user) return;
    await pinMessage(message, user.id);
  };

  const handleUnpinMessage = async (messageId: string) => {
    await unpinMessage(messageId);
  };

  const handleForwardMessage = async (message: Message, targetConversationId: string) => {
    if (!user) return;
    const supabase = createClient();
    const text = message.message_type === "gif"
      ? "GIF"
      : message.message_type === "poll" ? "📊 Poll"
      : message.message_type === "task" ? "✅ Task"
      : message.message_type === "calendar_event" ? "📅 Event"
      : message.message_type === "reminder" ? "⏰ Reminder"
      : message.text ?? "";
    await supabase.from("messages").insert({
      conversation_id: targetConversationId,
      sender_id: user.id,
      text,
      message_type: "text",
      status: "sent",
    });
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", targetConversationId);
    refetch();
  };

  const handleOpenThread = (message: Message) => {
    setOpenThreadMessageId(message.id);
  };

  // Creates the placeholder message then opens the matching modal
  const handleCreateProductivity = async (type: ProductivityType) => {
    if (!selectedConversationId || !user) return;

    const supabase = createClient();

    const { data: msg, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: selectedConversationId,
        sender_id: user.id,
        text: "",
        message_type: type,
        status: "sent",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating productivity message:", error);
      return;
    }

    setProductivityModal({ type, messageId: msg.id });
    refetch();
  };

  // Remove placeholder message when user closes the modal without saving
  const handleProductivityModalClose = async () => {
    if (!productivityModal || !user) {
      setProductivityModal(null);
      return;
    }

    const messageId = productivityModal.messageId;
    setProductivityModal(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("sender_id", user.id);

    if (error) {
      console.error("Error removing productivity placeholder:", error);
      return;
    }

    refetch();
  };

  // Called when any modal successfully creates its record
  const handleProductivityCreated = async () => {
    if (!productivityModal) return;

    const { type, messageId } = productivityModal;
    setProductivityModal(null);

    const supabase = createClient();

    if (type === "poll") {
      const { data } = await supabase
        .from("polls")
        .select("*, poll_options(*), poll_votes(*)")
        .eq("message_id", messageId)
        .single();
      if (data) {
        setPolls((prev) => ({ ...prev, [messageId]: data as Poll }));
      }
    } else if (type === "task") {
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("message_id", messageId)
        .single();
      if (data) {
        setTasks((prev) => ({ ...prev, [messageId]: data as Task }));
      }
    } else if (type === "calendar_event") {
      const { data } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("message_id", messageId)
        .single();
      if (data) {
        setCalendarEvents((prev) => ({
          ...prev,
          [messageId]: data as CalendarEvent,
        }));
      }
    } else if (type === "reminder") {
      const { data } = await supabase
        .from("reminders")
        .select("*")
        .eq("message_id", messageId)
        .single();
      if (data) {
        setReminders((prev) => ({ ...prev, [messageId]: data as Reminder }));
      }
    }

    refetch();
  };

  // ── Loading / auth guards ──────────────────────────────────────────────────
  if (userLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  const participants: Profile[] = chatParticipants;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {/* Conversation List */}
      <aside
        className={cn(
          "w-full md:w-80 lg:w-96 border-r flex-shrink-0",
          selectedConversationId ? "hidden md:block" : "block"
        )}
      >
        <ConversationList
          conversations={enrichedConversations}
          selectedId={selectedConversationId}
          onSelect={handleSelectConversation}
          isLoading={convsLoading}
          currentUserId={user.id}
          currentUserProfile={profile}
          onConversationCreated={refetch}
          myStatus={myStatus}
          onStatusChange={updateStatus}
          mutedConversationIds={mutedIds}
          archivedConversationIds={archivedIds}
          mentionedConversationIds={mentionedConvIds}
          folders={folders}
          onCreateFolder={createFolder}
          onDeleteFolder={deleteFolder}
          onAddToFolder={addToFolder}
        />
      </aside>

      {/* Chat Area */}
      <main
        className={cn(
          "flex flex-1 flex-col",
          !selectedConversationId ? "hidden md:flex" : "flex"
        )}
      >
        {canShowChat && selectedConversation ? (
          <>
            <ChatHeader
              conversation={selectedConversation}
              user={otherUser}
              onBack={handleBackToList}
              showBackButton={true}
              onOpenGroupInfo={() => setShowGroupInfo(true)}
              presenceStatus={otherUser ? (presenceMap.get(otherUser.id)?.status ?? undefined) : undefined}
              typingLabel={typingLabel}
              disappearAfter={disappearAfter}
              onSetDisappearAfter={!isGroup ? setDisappearAfter : undefined}
              isMuted={selectedConversationId ? mutedIds.has(selectedConversationId) : false}
              onToggleMute={selectedConversationId ? () => {
                if (mutedIds.has(selectedConversationId)) {
                  unmuteConversation(selectedConversationId);
                } else {
                  muteConversation(selectedConversationId);
                }
              } : undefined}
              isBlocked={otherUser ? blockedIds.has(otherUser.id) : false}
              onToggleBlock={otherUser ? () => {
                if (blockedIds.has(otherUser.id)) {
                  unblockUser(otherUser.id);
                } else {
                  blockUser(otherUser.id);
                }
              } : undefined}
              onReport={otherUser ? () => reportUser(otherUser.id, 'inappropriate_content') : undefined}
              isEncrypted={isEncrypted}
              canEncrypt={canEncrypt}
              isArchived={selectedConversationId ? archivedIds.has(selectedConversationId) : false}
              onToggleArchive={selectedConversationId ? () => {
                if (archivedIds.has(selectedConversationId)) {
                  unarchiveConversation(selectedConversationId);
                } else {
                  archiveConversation(selectedConversationId);
                }
              } : undefined}
              onToggleEncryption={toggleEncryption}
            />
            <div className="flex flex-1 overflow-hidden">
            <MessageThread
              messages={messages}
              currentUserId={user.id}
              otherUser={otherUser}
              isGroup={isGroup}
              memberProfiles={
                selectedConversation.members?.map((m) => m.profile) ?? []
              }
              isLoading={messagesLoading}
              polls={polls}
              tasks={tasks}
              calendarEvents={calendarEvents}
              reminders={reminders}
              participants={participants}
              pinnedMessages={pinnedMessages}
              conversations={enrichedConversations.filter(c => c.id !== selectedConversationId)}
              blockedUserIds={blockedIds}
              decryptedTexts={decryptedTexts}
              isEncrypted={isEncrypted}
              onDeleteMessage={handleDeleteMessage}
              onReplyTo={setReplyingTo}
              onOpenThread={handleOpenThread}
              onEditMessage={handleEditMessage}
              onPinMessage={handlePinMessage}
              onUnpinMessage={handleUnpinMessage}
              onForwardMessage={handleForwardMessage}
              starredMessageIds={starredIds}
              onStarMessage={(msg) => starMessage(msg.id, msg.conversation_id)}
              onUnstarMessage={unstarMessage}
            />
            {openThreadMessageId && (
              <ThreadPanel
                rootMessageId={openThreadMessageId}
                allMessages={messages}
                memberProfiles={selectedConversation.members?.map(m => m.profile) ?? []}
                currentUserId={user.id}
                otherUser={otherUser}
                onClose={() => setOpenThreadMessageId(null)}
                onSendReply={handleSendThreadReply}
              />
            )}
            </div>
            <MessageInput
              onSend={handleSendMessage}
              isSending={sending}
              onSendGif={handleSendGif}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
              onTyping={sendTyping}
              typingLabel={typingLabel ?? undefined}
              currentUserId={user.id}
              otherUser={otherUser}
              memberProfiles={
                selectedConversation.members?.map((m) => m.profile) ?? []
              }
              isGroup={isGroup}
              onCreateProductivity={handleCreateProductivity}
              onSendFile={handleSendFile}
              onSendVoiceNote={handleSendVoiceNote}
            />
            {showGroupInfo && isGroup && (
              <GroupInfoPanel
                conversation={selectedConversation}
                currentUserId={user.id}
                onClose={() => setShowGroupInfo(false)}
                onUpdated={refetch}
                onLeftGroup={() => {
                  setSelectedConversationId(null);
                  refetch();
                }}
              />
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center bg-secondary/30">
            <div className="rounded-full bg-muted p-6 mb-4">
              <MessageSquare className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              Welcome to Messages
            </h2>
            <p className="text-sm text-muted-foreground mt-2 text-center max-w-sm">
              Select a conversation from the list to start chatting
            </p>
          </div>
        )}
      </main>

      {/* ── Productivity modals ── */}
      {productivityModal && selectedConversationId && (
        <>
          {productivityModal.type === "poll" && (
            <CreatePollModal
              isOpen
              onClose={handleProductivityModalClose}
              conversationId={selectedConversationId}
              userId={user.id}
              messageId={productivityModal.messageId}
              onPollCreated={handleProductivityCreated}
            />
          )}

          {productivityModal.type === "task" && (
            <CreateTaskModal
              isOpen
              onClose={handleProductivityModalClose}
              conversationId={selectedConversationId}
              userId={user.id}
              messageId={productivityModal.messageId}
              participants={participants}
              onTaskCreated={handleProductivityCreated}
            />
          )}

          {productivityModal.type === "calendar_event" && (
            <CreateCalendarEventModal
              isOpen
              onClose={handleProductivityModalClose}
              conversationId={selectedConversationId}
              userId={user.id}
              messageId={productivityModal.messageId}
              participants={participants}
              onEventCreated={handleProductivityCreated}
            />
          )}

          {productivityModal.type === "reminder" && (
            <CreateReminderModal
              isOpen
              onClose={handleProductivityModalClose}
              conversationId={selectedConversationId}
              userId={user.id}
              messageId={productivityModal.messageId}
              participants={participants}
              onReminderCreated={handleProductivityCreated}
            />
          )}
        </>
      )}
    </div>
  );
}
