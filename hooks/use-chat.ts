"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useChatCache } from "@/components/chat/chat-provider";
import type { Profile, Conversation, Message, ConversationWithDetails, ConversationMemberWithProfile, ConversationMemberRole, PresenceStatus, UserPresenceInfo, PinnedMessage, ChatFolder } from "@/lib/types";
import type { User, RealtimeChannel } from "@supabase/supabase-js";
import { getOrCreateKeyPair, encryptText, decryptText, isEncryptedPayload } from "@/lib/encryption";

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

    const supabase = createClient();
    // Listen for changes in conversations or messages to update the list and unread counts
    const channel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          fetchConversations();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversations]);

  const markConversationRead = useCallback((conversationId: string) => {
    setConversations(prev =>
      prev.map(c => c.id === conversationId ? { ...c, unread_count: 0 } : c)
    );
  }, []);

  return { conversations, loading, refetch: fetchConversations, markConversationRead };
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
      replyTo?: string | null,
      expiresAt?: string | null
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
          expires_at: expiresAt ?? null,
        })
        .select(MESSAGE_SELECT)
        .single();

      setSending(false);

      if (error) {
        console.error("Error sending message:", error);
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
      gifUrl: string,
      expiresAt?: string | null
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
          expires_at: expiresAt ?? null,
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
    const channel = supabase.channel('online-users', {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const ids = new Set<string>();
        Object.keys(state).forEach((key) => ids.add(key));
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
          await channel.track({ user_id: userId, online_at: new Date().toISOString() });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return onlineUserIds;
}

export function usePresenceWithStatus(userId: string | undefined) {
  const [presenceMap, setPresenceMap] = useState<Map<string, UserPresenceInfo>>(new Map());
  const [myStatus, setMyStatus] = useState<PresenceStatus>('online');
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase.channel('user-presence', {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ user_id: string; status: PresenceStatus }>();
        const map = new Map<string, UserPresenceInfo>();
        Object.entries(state).forEach(([key, presences]) => {
          const p = (presences as unknown[])[0] as { status?: PresenceStatus };
          map.set(key, { isOnline: true, status: p?.status ?? 'online' });
        });
        setPresenceMap(map);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        const p = (newPresences as unknown[])[0] as { status?: PresenceStatus };
        setPresenceMap(prev => {
          const next = new Map(prev);
          next.set(key, { isOnline: true, status: p?.status ?? 'online' });
          return next;
        });
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setPresenceMap(prev => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: userId, status: 'online' });
          const sb = createClient();
          await sb.from('profiles').update({ is_online: true, presence_status: 'online' }).eq('id', userId);
        }
      });

    const handleUnload = () => {
      createClient().from('profiles').update({ is_online: false }).eq('id', userId);
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      createClient().from('profiles').update({ is_online: false }).eq('id', userId);
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const updateStatus = useCallback(async (status: PresenceStatus) => {
    setMyStatus(status);
    if (channelRef.current && userId) {
      await channelRef.current.track({ user_id: userId, status });
    }
    const sb = createClient();
    await sb.from('profiles').update({ presence_status: status }).eq('id', userId);
  }, [userId]);

  return { presenceMap, myStatus, updateStatus };
}

export function useTypingIndicator(
  conversationId: string | null,
  userId: string | undefined,
  displayName: string | undefined
) {
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!conversationId || !userId) return;
    const supabase = createClient();
    const channel = supabase.channel(`typing:${conversationId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.user_id === userId) return;
        setTypingUsers(prev => {
          const next = new Map(prev);
          next.set(payload.user_id, payload.display_name);
          return next;
        });
        const existing = timeoutsRef.current.get(payload.user_id);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
          setTypingUsers(prev => {
            const next = new Map(prev);
            next.delete(payload.user_id);
            return next;
          });
          timeoutsRef.current.delete(payload.user_id);
        }, 3000);
        timeoutsRef.current.set(payload.user_id, t);
      })
      .subscribe();

    return () => {
      channelRef.current = null;
      timeoutsRef.current.forEach(t => clearTimeout(t));
      timeoutsRef.current.clear();
      supabase.removeChannel(channel);
    };
  }, [conversationId, userId]);

  const sendTyping = useCallback(() => {
    if (!channelRef.current || !userId || !displayName) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: userId, display_name: displayName },
    });
  }, [userId, displayName]);

  return { typingUsers, sendTyping };
}

export function useEditMessage() {
  const editMessage = useCallback(async (messageId: string, newText: string): Promise<boolean> => {
    const supabase = createClient();
    const { error } = await supabase
      .from('messages')
      .update({ text: newText.trim(), edited_at: new Date().toISOString() })
      .eq('id', messageId);
    if (error) {
      const { error: e2 } = await supabase
        .from('messages')
        .update({ text: newText.trim() })
        .eq('id', messageId);
      return !e2;
    }
    return true;
  }, []);

  return { editMessage };
}

export function usePinnedMessages(conversationId: string | null) {
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);

  const fetchPinned = useCallback(async () => {
    if (!conversationId) return;
    const supabase = createClient();
    try {
      const { data } = await supabase
        .from('pinned_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('pinned_at', { ascending: false });
      setPinnedMessages(data ?? []);
    } catch {
      setPinnedMessages([]);
    }
  }, [conversationId]);

  useEffect(() => { fetchPinned(); }, [fetchPinned]);

  const pinMessage = useCallback(async (message: Message, pinnedBy: string): Promise<boolean> => {
    if (!conversationId) return false;
    const supabase = createClient();
    try {
      const { error } = await supabase.from('pinned_messages').insert({
        conversation_id: conversationId,
        message_id: message.id,
        pinned_by: pinnedBy,
        message_text: message.text,
        message_type: message.message_type ?? 'text',
      });
      if (!error) { await fetchPinned(); return true; }
    } catch { /* pinned_messages table may not exist yet */ }
    return false;
  }, [conversationId, fetchPinned]);

  const unpinMessage = useCallback(async (messageId: string): Promise<boolean> => {
    if (!conversationId) return false;
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('pinned_messages')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('message_id', messageId);
      if (!error) { await fetchPinned(); return true; }
    } catch { /* pinned_messages table may not exist yet */ }
    return false;
  }, [conversationId, fetchPinned]);

  return { pinnedMessages, pinMessage, unpinMessage, refetchPinned: fetchPinned };
}

export function useFileUpload() {
  const [uploading, setUploading] = useState(false);

  const uploadFile = useCallback(async (
    conversationId: string,
    senderId: string,
    file: File,
    expiresAt?: string | null
  ): Promise<Message | null> => {
    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split('.').pop() ?? 'bin';
    const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('chat-files')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      setUploading(false);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(uploadData.path);
    const isImage = file.type.startsWith('image/');

    const { data, error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: senderId,
      text: isImage ? 'Photo' : file.name,
      message_type: isImage ? 'image' : 'file',
      file_url: publicUrl,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      status: 'sent',
      expires_at: expiresAt ?? null,
    }).select(MESSAGE_SELECT).single();

    setUploading(false);
    if (error) { console.error('Message error:', error); return null; }

    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
    return data;
  }, []);

  return { uploadFile, uploading };
}

export function useSendVoiceNote() {
  const [uploading, setUploading] = useState(false);

  const sendVoiceNote = useCallback(async (
    conversationId: string,
    senderId: string,
    audioBlob: Blob,
    durationSeconds: number,
    expiresAt?: string | null
  ): Promise<Message | null> => {
    setUploading(true);
    const supabase = createClient();

    // Determine extension from the blob's actual MIME type
    const mimeType = audioBlob.type || 'audio/webm';
    const ext = mimeType.includes('ogg') ? 'ogg'
      : mimeType.includes('mp4') ? 'mp4'
      : 'webm';
    const path = `${conversationId}/voice-${Date.now()}.${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('chat-files')
      .upload(path, audioBlob, { contentType: mimeType, cacheControl: '3600', upsert: false });

    if (uploadError) {
      console.error('Voice upload error:', uploadError);
      setUploading(false);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(uploadData.path);
    const mins = Math.floor(durationSeconds / 60);
    const secs = (durationSeconds % 60).toString().padStart(2, '0');

    const { data, error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: senderId,
      text: `Voice note (${mins}:${secs})`,
      message_type: 'voice_note',
      file_url: publicUrl,
      file_name: `voice-note.${ext}`,
      file_size: audioBlob.size,
      file_type: mimeType,
      status: 'sent',
      expires_at: expiresAt ?? null,
    }).select(MESSAGE_SELECT).single();

    setUploading(false);
    if (error) { console.error('Voice message error:', error); return null; }

    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
    return data;
  }, []);

  return { sendVoiceNote, uploading };
}

export function useBlockedUsers(userId: string | undefined) {
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  const fetchBlocked = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    try {
      const { data } = await supabase.from('blocked_users').select('blocked_id').eq('blocker_id', userId);
      setBlockedIds(new Set(data?.map(r => r.blocked_id) ?? []));
    } catch { /* table may not exist */ }
  }, [userId]);

  useEffect(() => { fetchBlocked(); }, [fetchBlocked]);

  const blockUser = useCallback(async (targetId: string) => {
    if (!userId) return;
    const supabase = createClient();
    try {
      await supabase.from('blocked_users').insert({ blocker_id: userId, blocked_id: targetId });
      setBlockedIds(prev => new Set([...prev, targetId]));
    } catch { /* silently fail */ }
  }, [userId]);

  const unblockUser = useCallback(async (targetId: string) => {
    if (!userId) return;
    const supabase = createClient();
    try {
      await supabase.from('blocked_users').delete().eq('blocker_id', userId).eq('blocked_id', targetId);
      setBlockedIds(prev => { const next = new Set(prev); next.delete(targetId); return next; });
    } catch { /* silently fail */ }
  }, [userId]);

  const reportUser = useCallback(async (targetId: string, reason: string, details?: string) => {
    if (!userId) return false;
    const supabase = createClient();
    try {
      const { error } = await supabase.from('reports').insert({
        reporter_id: userId, reported_id: targetId, reason, details: details ?? null,
      });
      return !error;
    } catch { return false; }
  }, [userId]);

  return { blockedIds, blockUser, unblockUser, reportUser, isBlocked: (id: string) => blockedIds.has(id) };
}

export function useMutedConversations(userId: string | undefined) {
  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set());

  const fetchMuted = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    try {
      const { data } = await supabase.from('muted_conversations').select('conversation_id').eq('user_id', userId);
      setMutedIds(new Set(data?.map(r => r.conversation_id) ?? []));
    } catch { /* table may not exist */ }
  }, [userId]);

  useEffect(() => { fetchMuted(); }, [fetchMuted]);

  const muteConversation = useCallback(async (conversationId: string) => {
    if (!userId) return;
    const supabase = createClient();
    try {
      await supabase.from('muted_conversations').insert({ user_id: userId, conversation_id: conversationId });
      setMutedIds(prev => new Set([...prev, conversationId]));
    } catch { /* silently fail */ }
  }, [userId]);

  const unmuteConversation = useCallback(async (conversationId: string) => {
    if (!userId) return;
    const supabase = createClient();
    try {
      await supabase.from('muted_conversations').delete().eq('user_id', userId).eq('conversation_id', conversationId);
      setMutedIds(prev => { const next = new Set(prev); next.delete(conversationId); return next; });
    } catch { /* silently fail */ }
  }, [userId]);

  return {
    mutedIds,
    muteConversation,
    unmuteConversation,
    isMuted: (id: string) => mutedIds.has(id),
  };
}

export function useStarredMessages(userId: string | undefined) {
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());

  const fetchStarred = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    try {
      const { data } = await supabase
        .from('starred_messages')
        .select('message_id')
        .eq('user_id', userId);
      setStarredIds(new Set(data?.map(r => r.message_id) ?? []));
    } catch { /* table may not exist */ }
  }, [userId]);

  useEffect(() => { fetchStarred(); }, [fetchStarred]);

  const starMessage = useCallback(async (messageId: string, conversationId: string) => {
    if (!userId) return;
    const supabase = createClient();
    try {
      await supabase.from('starred_messages').insert({
        user_id: userId, message_id: messageId, conversation_id: conversationId,
      });
      setStarredIds(prev => new Set([...prev, messageId]));
    } catch { }
  }, [userId]);

  const unstarMessage = useCallback(async (messageId: string) => {
    if (!userId) return;
    const supabase = createClient();
    try {
      await supabase.from('starred_messages').delete()
        .eq('user_id', userId).eq('message_id', messageId);
      setStarredIds(prev => { const n = new Set(prev); n.delete(messageId); return n; });
    } catch { }
  }, [userId]);

  return { starredIds, starMessage, unstarMessage };
}

export function useArchivedConversations(userId: string | undefined) {
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

  const fetchArchived = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    try {
      const { data } = await supabase
        .from('archived_conversations')
        .select('conversation_id')
        .eq('user_id', userId);
      setArchivedIds(new Set(data?.map(r => r.conversation_id) ?? []));
    } catch { /* table may not exist */ }
  }, [userId]);

  useEffect(() => { fetchArchived(); }, [fetchArchived]);

  const archiveConversation = useCallback(async (conversationId: string) => {
    if (!userId) return;
    const supabase = createClient();
    try {
      await supabase.from('archived_conversations').insert({ user_id: userId, conversation_id: conversationId });
      setArchivedIds(prev => new Set([...prev, conversationId]));
    } catch { }
  }, [userId]);

  const unarchiveConversation = useCallback(async (conversationId: string) => {
    if (!userId) return;
    const supabase = createClient();
    try {
      await supabase.from('archived_conversations').delete()
        .eq('user_id', userId).eq('conversation_id', conversationId);
      setArchivedIds(prev => { const n = new Set(prev); n.delete(conversationId); return n; });
    } catch { }
  }, [userId]);

  return { archivedIds, archiveConversation, unarchiveConversation };
}

export function useChatFolders(userId: string | undefined) {
  const [folders, setFolders] = useState<ChatFolder[]>([]);

  const fetchFolders = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    try {
      const { data: folderRows } = await supabase
        .from('chat_folders').select('*').eq('user_id', userId).order('position');
      if (!folderRows?.length) { setFolders([]); return; }

      const { data: fcRows } = await supabase
        .from('folder_conversations').select('folder_id, conversation_id').eq('user_id', userId);

      const fcMap = new Map<string, Set<string>>();
      fcRows?.forEach(fc => {
        if (!fcMap.has(fc.folder_id)) fcMap.set(fc.folder_id, new Set());
        fcMap.get(fc.folder_id)!.add(fc.conversation_id);
      });

      setFolders(folderRows.map(f => ({ ...f, conversationIds: fcMap.get(f.id) ?? new Set() })));
    } catch { /* tables may not exist */ }
  }, [userId]);

  useEffect(() => { fetchFolders(); }, [fetchFolders]);

  const createFolder = useCallback(async (name: string, emoji?: string, color?: string): Promise<string | null> => {
    if (!userId) return null;
    const supabase = createClient();
    try {
      const { data, error } = await supabase.from('chat_folders').insert({
        user_id: userId, name, emoji: emoji ?? null,
        color: color ?? '#6366f1', position: folders.length,
      }).select().single();
      if (!error && data) {
        setFolders(prev => [...prev, { ...data, conversationIds: new Set() }]);
        return data.id as string;
      }
    } catch { }
    return null;
  }, [userId, folders.length]);

  const deleteFolder = useCallback(async (folderId: string) => {
    if (!userId) return;
    const supabase = createClient();
    try {
      await supabase.from('chat_folders').delete().eq('id', folderId).eq('user_id', userId);
      setFolders(prev => prev.filter(f => f.id !== folderId));
    } catch { }
  }, [userId]);

  const addToFolder = useCallback(async (folderId: string, conversationId: string) => {
    if (!userId) return;
    const supabase = createClient();
    try {
      await supabase.from('folder_conversations').insert({
        folder_id: folderId, conversation_id: conversationId, user_id: userId,
      });
      setFolders(prev => prev.map(f =>
        f.id === folderId
          ? { ...f, conversationIds: new Set([...f.conversationIds, conversationId]) }
          : f
      ));
    } catch { }
  }, [userId]);

  const removeFromFolder = useCallback(async (folderId: string, conversationId: string) => {
    if (!userId) return;
    const supabase = createClient();
    try {
      await supabase.from('folder_conversations').delete()
        .eq('folder_id', folderId).eq('conversation_id', conversationId).eq('user_id', userId);
      setFolders(prev => prev.map(f => {
        if (f.id !== folderId) return f;
        const n = new Set(f.conversationIds); n.delete(conversationId);
        return { ...f, conversationIds: n };
      }));
    } catch { }
  }, [userId]);

  return { folders, createFolder, deleteFolder, addToFolder, removeFromFolder };
}

export function usePushNotifications(userId: string | undefined) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setPermission(Notification.permission);
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    const perm = await Notification.requestPermission();
    setPermission(perm);
    return perm === 'granted';
  }, []);

  const subscribeToPush = useCallback(async () => {
    if (!userId || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.warn('NEXT_PUBLIC_VAPID_PUBLIC_KEY not set — push disabled');
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });

      const { keys } = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } };
      const supabase = createClient();
      await supabase.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: keys?.p256dh ?? '',
        auth: keys?.auth ?? '',
        user_agent: navigator.userAgent.slice(0, 200),
      });
      setSubscribed(true);
    } catch (err) {
      console.error('Push subscription error:', err);
    }
  }, [userId]);

  const showLocalNotification = useCallback((title: string, body: string, tag?: string) => {
    if (permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;
    try {
      new Notification(title, { body, tag: tag ?? 'lumi', icon: '/apple-icon.png' });
    } catch { }
  }, [permission]);

  return { permission, subscribed, requestPermission, subscribeToPush, showLocalNotification };
}

export function useE2EEncryption(
  conversationId: string | null,
  userId: string | undefined,
  otherUserId?: string | null
) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [myKeys, setMyKeys] = useState<{ publicKeyStr: string; privateKeyStr: string } | null>(null);
  const [otherPublicKey, setOtherPublicKey] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    setIsEnabled(localStorage.getItem(`lumi_e2e:${conversationId}`) === 'true');
  }, [conversationId]);

  useEffect(() => {
    if (!userId) return;
    getOrCreateKeyPair().then(async (keys) => {
      setMyKeys(keys);
      const supabase = createClient();
      await supabase.from('profiles').update({ public_key: keys.publicKeyStr }).eq('id', userId);
    });
  }, [userId]);

  useEffect(() => {
    if (!otherUserId) { setOtherPublicKey(null); return; }
    const supabase = createClient();
    supabase.from('profiles').select('public_key').eq('id', otherUserId).single()
      .then(({ data }) => setOtherPublicKey(data?.public_key ?? null));
  }, [otherUserId]);

  const toggleEncryption = useCallback(() => {
    if (!conversationId) return;
    const next = !isEnabled;
    setIsEnabled(next);
    localStorage.setItem(`lumi_e2e:${conversationId}`, next.toString());
  }, [conversationId, isEnabled]);

  const encrypt = useCallback(async (text: string): Promise<string> => {
    if (!isEnabled || !myKeys || !otherPublicKey) return text;
    try { return await encryptText(text, myKeys.privateKeyStr, otherPublicKey); } catch { return text; }
  }, [isEnabled, myKeys, otherPublicKey]);

  const decrypt = useCallback(async (text: string, senderPubKey?: string | null): Promise<string> => {
    if (!myKeys) return text;
    const pubKey = senderPubKey ?? otherPublicKey;
    if (!pubKey || !isEncryptedPayload(text)) return text;
    try { return await decryptText(text, myKeys.privateKeyStr, pubKey); } catch { return text; }
  }, [myKeys, otherPublicKey]);

  return {
    isEnabled,
    toggleEncryption,
    encrypt,
    decrypt,
    canEncrypt: !!(myKeys && otherPublicKey),
    myPublicKey: myKeys?.publicKeyStr ?? null,
  };
}

export const DISAPPEAR_OPTIONS = [
  { label: 'Off', seconds: null },
  { label: '1 hour', seconds: 3600 },
  { label: '24 hours', seconds: 86400 },
  { label: '7 days', seconds: 604800 },
  { label: '30 days', seconds: 2592000 },
] as const;

export function useDisappearingMessages(conversationId: string | null) {
  const [disappearAfter, setDisappearAfterState] = useState<number | null>(null);

  useEffect(() => {
    if (!conversationId) { setDisappearAfterState(null); return; }
    const supabase = createClient();
    supabase
      .from('conversations')
      .select('disappear_after')
      .eq('id', conversationId)
      .single()
      .then(({ data }) => setDisappearAfterState(data?.disappear_after ?? null));
  }, [conversationId]);

  const setDisappearAfter = useCallback(async (seconds: number | null) => {
    if (!conversationId) return;
    const supabase = createClient();
    await supabase
      .from('conversations')
      .update({ disappear_after: seconds })
      .eq('id', conversationId);
    setDisappearAfterState(seconds);
  }, [conversationId]);

  const getExpiresAt = useCallback((): string | null => {
    if (!disappearAfter) return null;
    return new Date(Date.now() + disappearAfter * 1000).toISOString();
  }, [disappearAfter]);

  return { disappearAfter, setDisappearAfter, getExpiresAt };
}
