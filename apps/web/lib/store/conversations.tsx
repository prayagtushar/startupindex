"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { newId } from "@/lib/id";
import { truncate } from "@/lib/format";
import type { RetrievalTrace, Source } from "@/lib/types";
import { readStored, removeStored, writeStored } from "@/lib/storage";

const STORAGE_KEY = "conversations";
const ACTIVE_KEY = "active-conversation";

export type MessageStatus = "streaming" | "complete" | "error";
export type Feedback = "up" | "down" | null;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  trace?: RetrievalTrace;
  status?: MessageStatus;
  error?: string;
  feedback?: Feedback;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ConversationsContextValue {
  conversations: Conversation[]; 
  activeId: string | null;
  active: Conversation | null;
  hydrated: boolean;
  newConversation: () => string;
  selectConversation: (id: string) => void;
  setActiveId: (id: string | null) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  clearAll: () => void;
  appendMessage: (convId: string, msg: ChatMessage) => void;
  updateMessage: (
    convId: string,
    msgId: string,
    patch: Partial<ChatMessage>,
  ) => void;
}

const ConversationsContext = createContext<ConversationsContextValue | null>(
  null,
);

export function ConversationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  
  useEffect(() => {
    try {
      const raw = readStored(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Conversation[]) : [];
      if (Array.isArray(parsed)) setConversations(parsed);
      const a = readStored(ACTIVE_KEY);
      if (a) setActiveIdState(a);
    } catch {
      
    }
    setHydrated(true);
  }, []);

  
  
  useEffect(() => {
    if (!hydrated) return;
    try {
      writeStored(STORAGE_KEY, JSON.stringify(conversations));
    } catch {
      
    }
  }, [conversations, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (activeId) writeStored(ACTIVE_KEY, activeId);
      else removeStored(ACTIVE_KEY);
    } catch {
      
    }
  }, [activeId, hydrated]);

  const newConversation = useCallback(() => {
    const id = newId();
    const now = Date.now();
    setConversations((prev) => [
      { id, title: "", messages: [], createdAt: now, updatedAt: now },
      ...prev,
    ]);
    setActiveIdState(id);
    return id;
  }, []);

  const selectConversation = useCallback(
    (id: string) => setActiveIdState(id),
    [],
  );
  const setActiveId = useCallback((id: string | null) => setActiveIdState(id), []);

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setActiveIdState((prev) => (prev === id ? null : prev));
  }, []);

  const renameConversation = useCallback((id: string, title: string) => {
    const clean = title.trim();
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: clean || c.title } : c)),
    );
  }, []);

  const clearAll = useCallback(() => {
    setConversations([]);
    setActiveIdState(null);
  }, []);

  const appendMessage = useCallback((convId: string, msg: ChatMessage) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        
        const title =
          c.title || (msg.role === "user" ? truncate(msg.content, 60) : c.title);
        return {
          ...c,
          title,
          messages: [...c.messages, msg],
          updatedAt: Date.now(),
        };
      }),
    );
  }, []);

  const updateMessage = useCallback(
    (convId: string, msgId: string, patch: Partial<ChatMessage>) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c;
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === msgId ? { ...m, ...patch } : m,
            ),
            updatedAt: Date.now(),
          };
        }),
      );
    },
    [],
  );

  const sorted = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );
  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const value = useMemo<ConversationsContextValue>(
    () => ({
      conversations: sorted,
      activeId,
      active,
      hydrated,
      newConversation,
      selectConversation,
      setActiveId,
      deleteConversation,
      renameConversation,
      clearAll,
      appendMessage,
      updateMessage,
    }),
    [
      sorted,
      activeId,
      active,
      hydrated,
      newConversation,
      selectConversation,
      setActiveId,
      deleteConversation,
      renameConversation,
      clearAll,
      appendMessage,
      updateMessage,
    ],
  );

  return (
    <ConversationsContext.Provider value={value}>
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversations(): ConversationsContextValue {
  const ctx = useContext(ConversationsContext);
  if (!ctx)
    throw new Error(
      "useConversations must be used within <ConversationsProvider>",
    );
  return ctx;
}
