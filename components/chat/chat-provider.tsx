"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import type { Message } from "@/lib/types";

interface ChatContextType {
    messageCache: Record<string, Message[]>;
    setConversationMessages: (conversationId: string, messages: Message[]) => void;
    addMessageToCache: (conversationId: string, message: Message) => void;
    updateMessageInCache: (conversationId: string, message: Message) => void;
    getMessagesFromCache: (conversationId: string) => Message[] | undefined;
    clearCache: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
    const [messageCache, setMessageCache] = useState<Record<string, Message[]>>({});

    const setConversationMessages = useCallback((conversationId: string, messages: Message[]) => {
        setMessageCache((prev) => ({
            ...prev,
            [conversationId]: messages,
        }));
    }, []);

    const addMessageToCache = useCallback((conversationId: string, message: Message) => {
        setMessageCache((prev) => {
            const existing = prev[conversationId] || [];
            if (existing.some((m) => m.id === message.id)) {
                return prev;
            }
            return {
                ...prev,
                [conversationId]: [...existing, message],
            };
        });
    }, []);

    const updateMessageInCache = useCallback((conversationId: string, message: Message) => {
        setMessageCache((prev) => {
            const existing = prev[conversationId] || [];
            return {
                ...prev,
                [conversationId]: existing.map((m) => (m.id === message.id ? { ...m, ...message } : m)),
            };
        });
    }, []);

    const getMessagesFromCache = useCallback((conversationId: string) => {
        return messageCache[conversationId];
    }, [messageCache]);

    const clearCache = useCallback(() => {
        setMessageCache({});
    }, []);

    return (
        <ChatContext.Provider
            value={{
                messageCache,
                setConversationMessages,
                addMessageToCache,
                updateMessageInCache,
                getMessagesFromCache,
                clearCache,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
}

export function useChatCache() {
    const context = useContext(ChatContext);
    if (context === undefined) {
        throw new Error("useChatCache must be used within a ChatProvider");
    }
    return context;
}
