"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Reminder } from "@/lib/types";
import { format, formatDistanceToNow } from "date-fns";
import { Bell, Clock, AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReminderComponentProps {
  reminder: Reminder;
  userId: string;
}

export default function ReminderComponent({
  reminder,
  userId,
}: ReminderComponentProps) {
  const [isCompleted, setIsCompleted] = useState(reminder.is_completed);
  const [completing, setCompleting] = useState(false);

  const isForMe = reminder.user_id === userId;
  const remindAt = new Date(reminder.remind_at);
  const isOverdue = remindAt < new Date() && !isCompleted;

  const handleComplete = async () => {
    if (!isForMe || completing || isCompleted) return;

    // Optimistic update
    setIsCompleted(true);
    setCompleting(true);

    const supabase = createClient();

    try {
      const { error } = await supabase
        .from("reminders")
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq("id", reminder.id)
        .eq("user_id", userId); // safety: only own reminders

      if (error) throw error;
    } catch (err) {
      console.error("Error completing reminder:", err);
      // Revert on error
      setIsCompleted(false);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div
      className={cn(
        "w-72 rounded-xl bg-card border p-4 shadow-sm transition-opacity",
        isCompleted && "opacity-60",
        isOverdue ? "border-destructive/40" : "border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              isOverdue
                ? "bg-destructive/10"
                : isCompleted
                ? "bg-emerald-500/10"
                : "bg-amber-500/10"
            )}
          >
            <Bell
              className={cn(
                "w-4 h-4",
                isOverdue
                  ? "text-destructive"
                  : isCompleted
                  ? "text-emerald-500"
                  : "text-amber-500"
              )}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Reminder
          </span>
        </div>

        {/* Status badge */}
        {isCompleted ? (
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            Completed
          </span>
        ) : isOverdue ? (
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-destructive/15 text-destructive flex items-center gap-1">
            <AlertCircle className="w-2.5 h-2.5" />
            Overdue
          </span>
        ) : null}
      </div>

      {/* Reminder text */}
      <p
        className={cn(
          "text-sm font-medium text-foreground leading-snug mb-3",
          isCompleted && "line-through text-muted-foreground"
        )}
      >
        {reminder.reminder_text}
      </p>

      {/* Time */}
      <div
        className={cn(
          "flex items-center gap-1.5 text-xs mb-3",
          isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
        )}
      >
        {isOverdue ? (
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Clock className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>
          {isCompleted
            ? `Reminded ${format(remindAt, "MMM d, yyyy h:mm a")}`
            : isOverdue
            ? `Overdue by ${formatDistanceToNow(remindAt)}`
            : format(remindAt, "MMM d, yyyy h:mm a")}
        </span>
      </div>

      {/* Complete button */}
      {isForMe && !isCompleted && (
        <button
          onClick={handleComplete}
          disabled={completing}
          className={cn(
            "w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg transition-all",
            "border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed",
            completing && "cursor-wait"
          )}
        >
          {completing ? (
            <div className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5 text-emerald-500" />
          )}
          {completing ? "Completing..." : "Mark as Complete"}
        </button>
      )}
    </div>
  );
}
