"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreatePollModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  userId: string;
  messageId: string;
  onPollCreated: () => void;
}

export default function CreatePollModal({
  isOpen,
  onClose,
  conversationId,
  userId,
  messageId,
  onPollCreated,
}: CreatePollModalProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const addOption = () => {
    if (options.length < 10) setOptions([...options, ""]);
  };

  const removeOption = (index: number) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, value: string) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  };

  const handleCreate = async () => {
    setError(null);
    const validOptions = options.map((o) => o.trim()).filter(Boolean);

    if (!question.trim()) {
      setError("Please enter a question.");
      return;
    }
    if (validOptions.length < 2) {
      setError("Please provide at least 2 options.");
      return;
    }

    setCreating(true);
    const supabase = createClient();

    try {
      // Create poll — use conversation_id not chat_id
      const { data: poll, error: pollError } = await supabase
        .from("polls")
        .insert({
          conversation_id: conversationId, // ← fixed
          message_id: messageId,
          created_by: userId,
          question: question.trim(),
          allow_multiple: allowMultiple,
          expires_at: expiresAt || null,
          status: "active",
        })
        .select()
        .single();

      if (pollError) throw pollError;

      // Create poll options
      const { error: optionsError } = await supabase
        .from("poll_options")
        .insert(
          validOptions.map((opt, index) => ({
            poll_id: poll.id,
            option_text: opt,
            order_index: index,
          }))
        );

      if (optionsError) throw optionsError;

      // Reset and close
      setQuestion("");
      setOptions(["", ""]);
      setAllowMultiple(false);
      setExpiresAt("");
      onPollCreated();
    } catch (err) {
      console.error("Error creating poll:", err);
      setError("Failed to create poll. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (creating) return;
    setError(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            Create Poll
          </h2>
          <button
            onClick={handleClose}
            disabled={creating}
            className="p-1 hover:bg-secondary rounded-lg transition-colors text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Question */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Question <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question..."
              className={cn(
                "w-full px-3 py-2 text-sm rounded-lg border bg-secondary text-foreground",
                "placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 border-border"
              )}
            />
          </div>

          {/* Options */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Options <span className="text-destructive">*</span>
            </label>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 text-center shrink-0">
                    {index + 1}
                  </span>
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => updateOption(index, e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm rounded-lg border bg-secondary text-foreground",
                      "placeholder:text-muted-foreground",
                      "focus:outline-none focus:ring-2 focus:ring-primary/30 border-border"
                    )}
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => removeOption(index)}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}

              {options.length < 10 && (
                <button
                  onClick={addOption}
                  className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors mt-1"
                >
                  <Plus className="w-4 h-4" />
                  Add option
                </button>
              )}
            </div>
          </div>

          {/* Allow multiple */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              id="allowMultiple"
              checked={allowMultiple}
              onChange={(e) => setAllowMultiple(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-primary"
            />
            <span className="text-sm text-foreground">
              Allow multiple selections
            </span>
          </label>

          {/* Expiry */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Expires at{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className={cn(
                "w-full px-3 py-2 text-sm rounded-lg border bg-secondary text-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 border-border"
              )}
            />
          </div>

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
            {creating ? "Creating..." : "Create Poll"}
          </button>
        </div>
      </div>
    </div>
  );
}
