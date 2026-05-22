"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/lib/types";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  userId: string;
  messageId?: string;
  participants: Profile[];
  onTaskCreated: () => void;
}

export default function CreateTaskModal({
  isOpen,
  onClose,
  conversationId,
  userId,
  messageId,
  participants,
  onTaskCreated,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<
    "low" | "medium" | "high" | "urgent"
  >("medium");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async () => {
    setError(null);

    if (!title.trim()) {
      setError("Please provide a task title.");
      return;
    }

    setCreating(true);
    const supabase = createClient();

    try {
      const { error: insertError } = await supabase.from("tasks").insert({
        conversation_id: conversationId, // ← fixed: was chat_id
        message_id: messageId ?? null,
        created_by: userId,
        assigned_to: assignedTo || null,
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate || null,
        priority,
        status: "pending",
      });

      if (insertError) throw insertError;

      // Reset
      setTitle("");
      setDescription("");
      setAssignedTo("");
      setDueDate("");
      setPriority("medium");
      onTaskCreated();
    } catch (err) {
      console.error("Error creating task:", err);
      setError("Failed to create task. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (creating) return;
    setError(null);
    onClose();
  };

  const priorityOptions = [
    {
      value: "low",
      label: "Low",
      className: "text-green-600 dark:text-green-400",
    },
    {
      value: "medium",
      label: "Medium",
      className: "text-amber-600 dark:text-amber-400",
    },
    {
      value: "high",
      label: "High",
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      value: "urgent",
      label: "Urgent",
      className: "text-red-600 dark:text-red-400",
    },
  ] as const;

  const inputClass = cn(
    "w-full px-3 py-2 text-sm rounded-lg border bg-secondary text-foreground",
    "placeholder:text-muted-foreground",
    "focus:outline-none focus:ring-2 focus:ring-primary/30 border-border"
  );

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">
            Create Task
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
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              className={inputClass}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Task description..."
              rows={3}
              className={cn(inputClass, "resize-none")}
            />
          </div>

          {/* Assign to */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Assign to
            </label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className={inputClass}
            >
              <option value="">Unassigned</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === userId ? "Me" : p.display_name ?? "Unknown"}
                </option>
              ))}
            </select>
          </div>

          {/* Due date */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Due date{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Priority
            </label>
            <div className="grid grid-cols-4 gap-2">
              {priorityOptions.map(({ value, label, className }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPriority(value)}
                  className={cn(
                    "px-3 py-2 text-xs font-medium rounded-lg border transition-all",
                    priority === value
                      ? cn("border-current bg-current/10", className)
                      : "border-border text-muted-foreground hover:bg-secondary"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
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
            {creating ? "Creating..." : "Create Task"}
          </button>
        </div>
      </div>
    </div>
  );
}
