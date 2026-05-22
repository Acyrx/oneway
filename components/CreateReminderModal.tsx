"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/lib/types";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  userId: string;
  messageId: string;
  participants: Profile[];
  onReminderCreated: () => void;
}

export default function CreateReminderModal({
  isOpen,
  onClose,
  conversationId,
  userId,
  messageId,
  participants,
  onReminderCreated,
}: CreateReminderModalProps) {
  const [reminderText, setReminderText] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [selectedUser, setSelectedUser] = useState(userId);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async () => {
    setError(null);

    if (!reminderText.trim()) {
      setError("Please enter a reminder text.");
      return;
    }
    if (!remindAt) {
      setError("Please select a date and time.");
      return;
    }
    if (new Date(remindAt) <= new Date()) {
      setError("Reminder time must be in the future.");
      return;
    }

    setCreating(true);
    const supabase = createClient();

    try {
      const { error: insertError } = await supabase.from("reminders").insert({
        conversation_id: conversationId, // ← fixed: was chat_id
        message_id: messageId,
        created_by: userId,
        user_id: selectedUser,
        reminder_text: reminderText.trim(),
        remind_at: remindAt,
        is_completed: false,
      });

      if (insertError) throw insertError;

      // Reset
      setReminderText("");
      setRemindAt("");
      setSelectedUser(userId);
      onReminderCreated();
    } catch (err) {
      console.error("Error creating reminder:", err);
      setError("Failed to create reminder. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (creating) return;
    setError(null);
    onClose();
  };

  // Min datetime = now (no past reminders)
  const minDateTime = new Date(Date.now() + 60_000).toISOString().slice(0, 16);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            Create Reminder
          </h2>
          <button
            onClick={handleClose}
            disabled={creating}
            className="p-1 hover:bg-secondary rounded-lg transition-colors text-muted-foreground disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Reminder text */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Reminder text <span className="text-destructive">*</span>
            </label>
            <textarea
              value={reminderText}
              onChange={(e) => setReminderText(e.target.value)}
              placeholder="What should be reminded?"
              rows={3}
              className={cn(
                "w-full px-3 py-2 text-sm rounded-lg border bg-secondary text-foreground",
                "placeholder:text-muted-foreground resize-none",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 border-border"
              )}
            />
          </div>

          {/* Remind at */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Remind at <span className="text-destructive">*</span>
            </label>
            <input
              type="datetime-local"
              value={remindAt}
              min={minDateTime}
              onChange={(e) => setRemindAt(e.target.value)}
              className={cn(
                "w-full px-3 py-2 text-sm rounded-lg border bg-secondary text-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 border-border"
              )}
            />
          </div>

          {/* For (participant selector) */}
          {participants.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                For
              </label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className={cn(
                  "w-full px-3 py-2 text-sm rounded-lg border bg-secondary text-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-primary/30 border-border"
                )}
              >
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === userId ? "Me" : p.display_name ?? "Unknown"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={handleClose}
            disabled={creating}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {creating && (
              <div className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
            )}
            {creating ? "Creating..." : "Create Reminder"}
          </button>
        </div>
      </div>
    </div>
  );
}
