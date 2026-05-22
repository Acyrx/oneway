"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ConversationList } from "./conversation-list";
import { ChatHeader } from "./chat-header";
import { MessageThread } from "./message-thread";
import { MessageInput } from "./message-input";
import { MessageSquare } from "lucide-react";
import {
  useUser,
  useConversations,
  useMessages,
  useSendMessage,
  useSendGif,
} from "@/hooks/use-chat";
import { createClient } from "@/lib/supabase/client";
import CreatePollModal from "../CreatePollModal";
import CreateTaskModal from "../CreateTaskModal";
import CreateCalendarEventModal from "../CreateCalendarEventModal";
import CreateReminderModal from "../CreateReminderModal";
import type {
  Message,
  Profile,
  Poll,
  Task,
  CalendarEvent,
  Reminder,
} from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductivityType = "poll" | "task" | "calendar_event" | "reminder";

interface ProductivityModal {
  type: ProductivityType;
  messageId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatView() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const {
    conversations,
    loading: convsLoading,
    refetch,
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

  // ── UI state ───────────────────────────────────────────────────────────────
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [productivityModal, setProductivityModal] =
    useState<ProductivityModal | null>(null);

  // ── Productivity data keyed by message.id ─────────────────────────────────
  const [polls, setPolls] = useState<Record<string, Poll>>({});
  const [tasks, setTasks] = useState<Record<string, Task>>({});
  const [calendarEvents, setCalendarEvents] = useState<
    Record<string, CalendarEvent>
  >({});
  const [reminders, setReminders] = useState<Record<string, Reminder>>({});

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
              [reminder.message_id]: reminder,
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
              [reminder.message_id]: reminder,
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
  const selectedConversation = conversations.find(
    (c) => c.id === selectedConversationId
  );
  const otherUser: Profile | null = selectedConversation?.other_user ?? null;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setReplyingTo(null);
  };

  const handleBackToList = () => {
    setSelectedConversationId(null);
    setReplyingTo(null);
  };

  const handleSendMessage = async (text: string) => {
    if (!selectedConversationId || !user) return;
    await sendMessage(
      selectedConversationId,
      user.id,
      text,
      replyingTo?.id ?? null
    );
    setReplyingTo(null);
    await refetchMessages();
    refetch();
  };

  const handleSendGif = async (gifUrl: string) => {
    if (!selectedConversationId || !user) return;
    await sendGif(selectedConversationId, user.id, gifUrl);
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

  const handleOpenThread = (message: Message) => {
    console.log("Open thread for:", message.id);
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
    await refetchMessages();
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

    await refetchMessages();
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

    await refetchMessages();
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

  // Participants list for modals (both users in the conversation)
  const participants: Profile[] = otherUser ? [otherUser] : [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-background">
      {/* Conversation List */}
      <aside
        className={cn(
          "w-full md:w-80 lg:w-96 border-r flex-shrink-0",
          selectedConversationId ? "hidden md:block" : "block"
        )}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selectedConversationId}
          onSelect={handleSelectConversation}
          isLoading={convsLoading}
          currentUserId={user.id}
          onConversationCreated={refetch}
        />
      </aside>

      {/* Chat Area */}
      <main
        className={cn(
          "flex flex-1 flex-col",
          !selectedConversationId ? "hidden md:flex" : "flex"
        )}
      >
        {selectedConversationId && otherUser ? (
          <>
            <ChatHeader
              user={otherUser}
              onBack={handleBackToList}
              showBackButton={true}
            />
            <MessageThread
              messages={messages}
              currentUserId={user.id}
              otherUser={otherUser}
              isLoading={messagesLoading}
              polls={polls}
              tasks={tasks}
              calendarEvents={calendarEvents}
              reminders={reminders}
              onDeleteMessage={handleDeleteMessage}
              onReplyTo={setReplyingTo}
              onOpenThread={handleOpenThread}
            />
            <MessageInput
              onSend={handleSendMessage}
              isSending={sending}
              onSendGif={handleSendGif}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
              currentUserId={user.id}
              otherUser={otherUser}
              onCreateProductivity={handleCreateProductivity}
            />
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
