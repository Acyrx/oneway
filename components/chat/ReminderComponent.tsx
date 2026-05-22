"use client";

import { useState, useEffect, useCallback } from "react";
import { Reminder } from "@/lib/types";
import { formatDistanceToNow, format, isPast } from "date-fns";
import {
  Bell,
  BellOff,
  Check,
  Clock,
  MessageCircle,
  AlertCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface RemindersPanelProps {
  userId: string;
  onBack: () => void;
  onNavigateToChat?: (conversationId: string) => void;
}

export default function RemindersPanel({
  userId,
  onBack,
  onNavigateToChat,
}: RemindersPanelProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [conversationNames, setConversationNames] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "completed" | "all">(
    "active"
  );

  // ── Fetch reminders ────────────────────────────────────────────────────────
  const fetchReminders = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("reminders")
      .select("*")
      .eq("user_id", userId)
      .order("remind_at", { ascending: true });

    if (error) {
      console.error("Error fetching reminders:", error);
      return;
    }

    setReminders(data ?? []);

    // Fetch conversation names for all unique conversation_ids
    const conversationIds = [
      ...new Set((data ?? []).map((r) => r.conversation_id)),
    ];
    if (conversationIds.length > 0) {
      const { data: convData } = await supabase
        .from("conversations")
        .select("id, participant_1, participant_2")
        .in("id", conversationIds);

      if (convData) {
        // Get other participant profiles to use as conversation name
        const otherUserIds = convData.map((c) =>
          c.participant_1 === userId ? c.participant_2 : c.participant_1
        );

        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", otherUserIds);

        const profileMap = new Map(
          profiles?.map((p) => [p.id, p.display_name]) ?? []
        );

        const names: Record<string, string> = {};
        convData.forEach((c) => {
          const otherId =
            c.participant_1 === userId ? c.participant_2 : c.participant_1;
          names[c.id] = profileMap.get(otherId) ?? "Conversation";
        });
        setConversationNames(names);
      }
    }
  }, [userId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await fetchReminders();
      setLoading(false);
    }
    init();

    // Real-time updates
    const supabase = createClient();
    const channel = supabase
      .channel(`reminders:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reminders",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setReminders((prev) => {
              if (prev.some((r) => r.id === (payload.new as Reminder).id))
                return prev;
              return [...prev, payload.new as Reminder].sort(
                (a, b) =>
                  new Date(a.remind_at).getTime() -
                  new Date(b.remind_at).getTime()
              );
            });
          } else if (payload.eventType === "UPDATE") {
            setReminders((prev) =>
              prev.map((r) =>
                r.id === (payload.new as Reminder).id
                  ? (payload.new as Reminder)
                  : r
              )
            );
          } else if (payload.eventType === "DELETE") {
            setReminders((prev) =>
              prev.filter((r) => r.id !== (payload.old as Reminder).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchReminders, userId]);

  // ── Toggle complete ────────────────────────────────────────────────────────
  const toggleComplete = async (reminder: Reminder) => {
    const supabase = createClient();
    const nowCompleted = !reminder.is_completed;

    // Optimistic update
    setReminders((prev) =>
      prev.map((r) =>
        r.id === reminder.id
          ? {
              ...r,
              is_completed: nowCompleted,
              completed_at: nowCompleted ? new Date().toISOString() : null,
            }
          : r
      )
    );

    const { error } = await supabase
      .from("reminders")
      .update({
        is_completed: nowCompleted,
        completed_at: nowCompleted ? new Date().toISOString() : null,
      })
      .eq("id", reminder.id)
      .eq("user_id", userId);

    if (error) {
      console.error("Error updating reminder:", error);
      // Revert on error
      setReminders((prev) =>
        prev.map((r) =>
          r.id === reminder.id
            ? {
                ...r,
                is_completed: reminder.is_completed,
                completed_at: reminder.completed_at,
              }
            : r
        )
      );
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const activeReminders = reminders.filter((r) => !r.is_completed);
  const completedReminders = reminders.filter((r) => r.is_completed);
  const overdueReminders = activeReminders.filter((r) =>
    isPast(new Date(r.remind_at))
  );
  const upcomingReminders = activeReminders.filter(
    (r) => !isPast(new Date(r.remind_at))
  );

  const filteredReminders =
    filter === "all"
      ? reminders
      : filter === "active"
      ? activeReminders
      : completedReminders;

  const filters: { key: typeof filter; label: string; count: number }[] = [
    { key: "active", label: "Active", count: activeReminders.length },
    { key: "completed", label: "Done", count: completedReminders.length },
    { key: "all", label: "All", count: reminders.length },
  ];

  // ── Render reminder row ────────────────────────────────────────────────────
  const renderReminder = (reminder: Reminder) => {
    const isOverdue =
      !reminder.is_completed && isPast(new Date(reminder.remind_at));
    const chatName = conversationNames[reminder.conversation_id];

    return (
      <div
        key={reminder.id}
        className={cn(
          "rounded-xl p-4 border transition-all",
          reminder.is_completed
            ? "border-border bg-secondary/30 opacity-70"
            : isOverdue
            ? "border-destructive/30 bg-destructive/5"
            : "border-border bg-card"
        )}
      >
        <div className="flex items-start gap-3">
          {/* Complete toggle */}
          <button
            onClick={() => toggleComplete(reminder)}
            className={cn(
              "mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
              reminder.is_completed
                ? "bg-primary border-primary"
                : isOverdue
                ? "border-destructive hover:bg-destructive/10"
                : "border-muted-foreground/40 hover:border-primary"
            )}
          >
            {reminder.is_completed && (
              <Check className="w-3 h-3 text-primary-foreground" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-sm font-medium leading-snug",
                reminder.is_completed
                  ? "line-through text-muted-foreground"
                  : "text-foreground"
              )}
            >
              {reminder.reminder_text}
            </p>

            <div className="flex flex-wrap items-center gap-3 mt-2">
              {/* Time */}
              <div
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  isOverdue
                    ? "text-destructive font-medium"
                    : "text-muted-foreground"
                )}
              >
                {isOverdue ? (
                  <AlertCircle className="w-3.5 h-3.5" />
                ) : (
                  <Clock className="w-3.5 h-3.5" />
                )}
                <span>
                  {reminder.is_completed && reminder.completed_at
                    ? `Completed ${formatDistanceToNow(
                        new Date(reminder.completed_at),
                        { addSuffix: true }
                      )}`
                    : isOverdue
                    ? `Overdue by ${formatDistanceToNow(
                        new Date(reminder.remind_at)
                      )}`
                    : format(new Date(reminder.remind_at), "MMM d, h:mm a")}
                </span>
              </div>

              {/* Conversation link */}
              {chatName && (
                <button
                  onClick={() => onNavigateToChat?.(reminder.conversation_id)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <MessageCircle className="w-3 h-3" />
                  <span>{chatName}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 hover:bg-secondary rounded-lg transition-colors"
            aria-label="Back"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Bell className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Reminders</h2>
              {!loading && activeReminders.length > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {activeReminders.length} active
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-4 pt-3 pb-2 flex gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors",
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-accent"
            )}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-4 animate-pulse"
              >
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-muted rounded w-3/4" />
                    <div className="h-2.5 bg-muted rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredReminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <BellOff className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No reminders</p>
            <p className="text-xs mt-1">
              {filter === "active"
                ? "All caught up"
                : filter === "completed"
                ? "No completed reminders"
                : "Create a reminder to get started"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filter === "active" && overdueReminders.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-destructive uppercase tracking-wider px-1 pt-1">
                  Overdue
                </p>
                {overdueReminders.map(renderReminder)}
              </>
            )}

            {filter === "active" && upcomingReminders.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">
                  Upcoming
                </p>
                {upcomingReminders.map(renderReminder)}
              </>
            )}

            {filter !== "active" && filteredReminders.map(renderReminder)}
          </div>
        )}
      </div>
    </div>
  );
}
