"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useChatCache } from "@/components/chat/chat-provider";
import type { Profile, Conversation, Message, ConversationWithDetails, ConversationMemberWithProfile, ConversationMemberRole } from "@/lib/types";
import type { User, RealtimeChannel, RealtimePresenceState } from "@supabase/supabase-js";

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

async function enrichConversation(
  supabase: ReturnType<typeof createClient>,
  conv: Conversation,
  userId: string
): Promise<ConversationWithDetails> {
  const { data: memberRows } = await supabase
    .from("conversation_members")
    .select("id, conversation_id, user_id, role, joined_at")
    .eq("conversation_id", conv.id);

  const memberUserIds = memberRows?.map((m) => m.user_id) ?? [];
  let profileMap = new Map<string, Profile>();

  if (memberUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", memberUserIds);
    profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);
  }

  const members: ConversationMemberWithProfile[] =
    memberRows?.map((m) => ({
      ...m,
      role: m.role as ConversationMemberRole,
      profile:
        profileMap.get(m.user_id) ||
        ({
          id: m.user_id,
          display_name: "Unknown",
          avatar_initials: "??",
          is_online: false,
          created_at: "",
          updated_at: "",
        } as Profile),
    })) ?? [];

  const myMembership = members.find((m) => m.user_id === userId);
  const isGroup = conv.type === "group";

  let other_user: Profile | null = null;
  if (!isGroup) {
    const otherId =
      conv.participant_1 === userId ? conv.participant_2 : conv.participant_1;
    if (otherId) {
      other_user =
        members.find((m) => m.user_id === otherId)?.profile ||
        profileMap.get(otherId) ||
        null;
    }
    if (!other_user && otherId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", otherId)
        .single();
      other_user = profile;
    }
  }

  const { data: lastMessage } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conv.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conv.id)
    .neq("sender_id", userId)
    .neq("status", "read");

  return {
    ...conv,
    type: conv.type ?? "direct",
    members,
    my_role: myMembership?.role,
    other_user,
    last_message: lastMessage || null,
    unread_count: count || 0,
  };
}

export function useConversations(userId: string | undefined) {
  const [conversations, setConversations] = useState<ConversationWithDetails[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!userId) return;

    const supabase = createClient();

    const { data: memberships } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", userId);

    let convs: Conversation[] = [];

    if (memberships?.length) {
      const ids = [...new Set(memberships.map((m) => m.conversation_id))];
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .in("id", ids);
      if (data) convs = data as Conversation[];
    }

    // Fallback/Merge with participant columns to handle new direct chats that might not have member rows yet
    const { data: participantData } = await supabase
      .from("conversations")
      .select("*")
      .or(`participant_1.eq.${userId},participant_2.eq.${userId}`);
    
    if (participantData) {
      // Merge and remove duplicates by ID
      const participantConvs = participantData as Conversation[];
      const existingIds = new Set(convs.map(c => c.id));
      participantConvs.forEach(c => {
        if (!existingIds.has(c.id)) {
          convs.push(c);
        }
      });
    }

    if (convs.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    // Sort by updated_at descending
    convs.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());

    const conversationsWithDetails = await Promise.all(
      convs.map((conv) => enrichConversation(supabase, conv as Conversation, userId))
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
  const { getMessagesFromCache, setConversationMessages, addMessageToCache, updateMessageInCache } = useChatCache();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  // Sync state with cache
  useEffect(() => {
    if (conversationId) {
      const cached = getMessagesFromCache(conversationId);
      if (cached) {
        setMessages(cached);
      } else {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
  }, [conversationId, getMessagesFromCache]);

  const fetchMessages = useCallback(async (force = false) => {
    if (!conversationId || !userId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    // Don't fetch if already fetched for this conversation unless forced
    if (!force && fetchedRef.current === conversationId && getMessagesFromCache(conversationId)) {
      return;
    }

    const supabase = createClient();
    if (!getMessagesFromCache(conversationId)) {
      setLoading(true);
    }
    
    const { data } = await supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (data) {
      setConversationMessages(conversationId, data || []);
      setMessages(data || []);
      fetchedRef.current = conversationId;
    }
    
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
  }, [conversationId, userId, getMessagesFromCache, setConversationMessages]);

  useEffect(() => {
    if (!conversationId || !userId) {
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

          // Update both local state (for immediate UI) and cache
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) {
              return prev;
            }
            return [...prev, newMessage];
          });
          addMessageToCache(conversationId, newMessage);

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
          updateMessageInCache(conversationId, updatedMessage);
        }
      )
      .subscribe();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [conversationId, userId, fetchMessages, addMessageToCache, updateMessageInCache]);

  return { messages, loading, refetch: () => fetchMessages(true) };
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

      // Check if conversation already exists (direct chat between these two)
      const { data: existing, error: searchError } = await supabase
        .from("conversations")
        .select("*")
        .eq("type", "direct")
        .or(
          `and(participant_1.eq.${userId},participant_2.eq.${otherUserId}),and(participant_1.eq.${otherUserId},participant_2.eq.${userId})`
        )
        .maybeSingle();

      if (searchError) {
        console.error("Error searching for existing conversation:", searchError);
      }

      if (existing) {
        return existing;
      }

      // Create new conversation
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          type: "direct",
          participant_1: userId,
          participant_2: otherUserId,
          created_by: userId, // Set creator for RLS policies
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating conversation:", error);
        return null;
      }

      // Add members
      const { error: membersError } = await supabase.from("conversation_members").insert([
        { conversation_id: data.id, user_id: userId, role: "member" },
        { conversation_id: data.id, user_id: otherUserId, role: "member" },
      ]);

      if (membersError) {
        console.error("Error adding conversation members. This often means the RLS policy in scripts/fix_chat_creation_rls.sql needs to be applied:", membersError);
        // We still return the conversation if creation succeeded but members failed,
        // as the fallback logic in useConversations handles participant columns.
      }

      return data;
    },
    []
  );

  return { createConversation };
}

export function useCreateGroup() {
  const [creating, setCreating] = useState(false);

  const createGroup = useCallback(
    async (
      userId: string,
      name: string,
      memberIds: string[]
    ): Promise<Conversation | null> => {
      const trimmed = name.trim();
      const uniqueMembers = [...new Set(memberIds.filter((id) => id !== userId))];
      if (!trimmed || uniqueMembers.length === 0) return null;

      setCreating(true);
      const supabase = createClient();

      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .insert({
          type: "group",
          name: trimmed,
          created_by: userId,
          participant_1: userId,
          participant_2: null,
        })
        .select()
        .single();

      if (convError || !conv) {
        console.error("Error creating group:", convError);
        setCreating(false);
        return null;
      }

      const memberRows = [
        { conversation_id: conv.id, user_id: userId, role: "admin" as const },
        ...uniqueMembers.map((id) => ({
          conversation_id: conv.id,
          user_id: id,
          role: "member" as const,
        })),
      ];

      const { error: membersError } = await supabase
        .from("conversation_members")
        .insert(memberRows);

      if (membersError) {
        console.error("Error adding group members:", membersError);
        await supabase.from("conversations").delete().eq("id", conv.id);
        setCreating(false);
        return null;
      }

      setCreating(false);
      return conv as Conversation;
    },
    []
  );

  return { createGroup, creating };
}

export function useGroupManagement(conversationId: string | null) {
  const addMembers = useCallback(
    async (userId: string, newMemberIds: string[]) => {
      if (!conversationId) return { error: "No conversation" };

      const supabase = createClient();
      const unique = [...new Set(newMemberIds.filter((id) => id !== userId))];
      if (!unique.length) return { error: null };

      const rows = unique.map((id) => ({
        conversation_id: conversationId,
        user_id: id,
        role: "member" as const,
      }));

      const { error } = await supabase.from("conversation_members").insert(rows);
      if (error) console.error("Error adding members:", error);
      return { error };
    },
    [conversationId]
  );

  const removeMember = useCallback(
    async (memberUserId: string) => {
      if (!conversationId) return { error: "No conversation" };
      const supabase = createClient();
      const { error } = await supabase
        .from("conversation_members")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("user_id", memberUserId);
      if (error) console.error("Error removing member:", error);
      return { error };
    },
    [conversationId]
  );

  const setMemberRole = useCallback(
    async (memberUserId: string, role: ConversationMemberRole) => {
      if (!conversationId) return { error: "No conversation" };
      const supabase = createClient();
      const { error } = await supabase
        .from("conversation_members")
        .update({ role })
        .eq("conversation_id", conversationId)
        .eq("user_id", memberUserId);
      if (error) console.error("Error updating role:", error);
      return { error };
    },
    [conversationId]
  );

  const updateGroupName = useCallback(
    async (name: string) => {
      if (!conversationId) return { error: "No conversation" };
      const supabase = createClient();
      const { error } = await supabase
        .from("conversations")
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq("id", conversationId);
      if (error) console.error("Error updating group name:", error);
      return { error };
    },
    [conversationId]
  );

  const leaveGroup = useCallback(
    async (userId: string) => {
      if (!conversationId) return { error: "No conversation" };
      const supabase = createClient();
      const { error } = await supabase
        .from("conversation_members")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("user_id", userId);
      if (error) console.error("Error leaving group:", error);
      return { error };
    },
    [conversationId]
  );

  return {
    addMembers,
    removeMember,
    setMemberRole,
    updateGroupName,
    leaveGroup,
  };
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
export function useOnlinePresence(userId: string | undefined) {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) {
      setOnlineUserIds(new Set());
      return;
    }

    const supabase = createClient();
    // Use a single channel for all online status tracking
    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const ids = new Set<string>();
        Object.keys(state).forEach((key) => {
          ids.add(key);
        });
        setOnlineUserIds(ids);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        setOnlineUserIds((prev) => new Set([...prev, key]));
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return onlineUserIds;
}
