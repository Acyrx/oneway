"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  Conversation,
  Message,
  ConversationWithDetails,
} from "@/lib/types";
import type { User, RealtimeChannel } from "@supabase/supabase-js";

export const MESSAGE_SELECT = `
  *,
  replied_to_message:reply_to (
    id,
    text,
    message_type,
    file_url,
    file_name,
    sender:sender_id (
      id,
      display_name
    )
  )
`;

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        setProfile(profile);
      }

      setLoading(false);
    }

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, profile, loading };
}

export function useConversations(userId: string | undefined) {
  const [conversations, setConversations] = useState<ConversationWithDetails[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!userId) return;

    const supabase = createClient();

    // Fetch conversations where user is a participant
    const { data: convs } = await supabase
      .from("conversations")
      .select("*")
      .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
      .order("updated_at", { ascending: false });

    if (!convs) {
      setConversations([]);
      setLoading(false);
      return;
    }

    // Get all other user IDs
    const otherUserIds = convs.map((c) =>
      c.participant_1 === userId ? c.participant_2 : c.participant_1
    );

    // Fetch profiles for other users
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", otherUserIds);

    const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

    // Fetch last message for each conversation
    const conversationsWithDetails: ConversationWithDetails[] =
      await Promise.all(
        convs.map(async (conv) => {
          const otherId =
            conv.participant_1 === userId
              ? conv.participant_2
              : conv.participant_1;

          const { data: lastMessage } = await supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          // Count unread messages (messages from other user that aren't read)
          const { count } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .eq("sender_id", otherId)
            .neq("status", "read");

          return {
            ...conv,
            other_user: profileMap.get(otherId) || {
              id: otherId,
              display_name: "Unknown",
              avatar_initials: "??",
              is_online: false,
              created_at: "",
              updated_at: "",
            },
            last_message: lastMessage || null,
            unread_count: count || 0,
          };
        })
      );

    setConversations(conversationsWithDetails);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return { conversations, loading, refetch: fetchConversations };
}

export function useMessages(
  conversationId: string | null,
  userId: string | undefined
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    if (!conversationId || !userId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    setLoading(true);
    const { data } = await supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    setMessages(data || []);
    setLoading(false);

    if (data && data.length > 0) {
      const unreadIds = data
        .filter((m) => m.sender_id !== userId && m.status !== "read")
        .map((m) => m.id);

      if (unreadIds.length > 0) {
        await supabase
          .from("messages")
          .update({ status: "read" })
          .in("id", unreadIds);
      }
    }
  }, [conversationId, userId]);

  useEffect(() => {
    if (!conversationId || !userId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let channel: RealtimeChannel | null = null;

    fetchMessages();

    // Subscribe to real-time updates for this conversation
    channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const { data: fullMessage } = await supabase
            .from("messages")
            .select(MESSAGE_SELECT)
            .eq("id", payload.new.id)
            .single();

          const newMessage = (fullMessage ?? payload.new) as Message;

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) {
              return prev;
            }
            return [...prev, newMessage];
          });

          if (newMessage.sender_id !== userId) {
            await supabase
              .from("messages")
              .update({ status: "read" })
              .eq("id", newMessage.id);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedMessage = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updatedMessage.id
                ? { ...m, ...updatedMessage, replied_to_message: m.replied_to_message }
                : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [conversationId, userId, fetchMessages]);

  return { messages, loading, refetch: fetchMessages };
}

export function useSendMessage() {
  const [sending, setSending] = useState(false);

  const sendMessage = useCallback(
    async (
      conversationId: string,
      senderId: string,
      text: string,
      replyTo?: string | null
    ): Promise<Message | null> => {
      setSending(true);
      const supabase = createClient();

      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          text: text.trim(),
          reply_to: replyTo ?? null,
          status: "sent",
        })
        .select(MESSAGE_SELECT)
        .single();

      setSending(false);

      if (error) {
        console.error("Error sending message:", error);
        return null;
      }

      return data;
    },
    []
  );

  return { sendMessage, sending };
}

export function useCreateConversation() {
  const createConversation = useCallback(
    async (
      userId: string,
      otherUserId: string
    ): Promise<Conversation | null> => {
      const supabase = createClient();

      // Check if conversation already exists
      const { data: existing } = await supabase
        .from("conversations")
        .select("*")
        .or(
          `and(participant_1.eq.${userId},participant_2.eq.${otherUserId}),and(participant_1.eq.${otherUserId},participant_2.eq.${userId})`
        )
        .single();

      if (existing) {
        return existing;
      }

      // Create new conversation
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          participant_1: userId,
          participant_2: otherUserId,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating conversation:", error);
        return null;
      }

      return data;
    },
    []
  );

  return { createConversation };
}

export function useSearchUsers(currentUserId: string | undefined) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const searchUsers = useCallback(
    async (query: string) => {
      if (!currentUserId || !query.trim()) {
        setUsers([]);
        return;
      }

      setLoading(true);
      const supabase = createClient();

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .neq("id", currentUserId)
        .ilike("display_name", `%${query}%`)
        .limit(10);

      setUsers(data || []);
      setLoading(false);
    },
    [currentUserId]
  );

  return { users, loading, searchUsers };
}

export function useSendGif() {
  const [sending, setSending] = useState(false);

  const sendGif = useCallback(
    async (
      conversationId: string,
      senderId: string,
      gifUrl: string
    ): Promise<Message | null> => {
      setSending(true);
      const supabase = createClient();

      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          text: "GIF",
          message_type: "gif",
          file_url: gifUrl,
          file_name: "gif",
          file_size: 0,
          file_type: "image/gif",
          status: "sent",
        })
        .select()
        .single();

      setSending(false);

      if (error) {
        console.error("Error sending GIF:", error);
        return null;
      }

      // Update conversation's updated_at
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      return data;
    },
    []
  );

  return { sendGif, sending };
}
