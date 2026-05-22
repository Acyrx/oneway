"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/lib/types";
import { X, MapPin, Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateCalendarEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  userId: string;
  messageId?: string;
  participants: Profile[];
  onEventCreated: () => void;
}

export default function CreateCalendarEventModal({
  isOpen,
  onClose,
  conversationId,
  userId,
  messageId,
  participants,
  onEventCreated,
}: CreateCalendarEventModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    []
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleParticipant = (participantId: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(participantId)
        ? prev.filter((id) => id !== participantId)
        : [...prev, participantId]
    );
  };

  const handleCreate = async () => {
    setError(null);

    if (!title.trim()) {
      setError("Please provide an event title.");
      return;
    }
    if (!startTime) {
      setError("Please provide a start time.");
      return;
    }
    if (endTime && new Date(endTime) <= new Date(startTime)) {
      setError("End time must be after start time.");
      return;
    }

    setCreating(true);
    const supabase = createClient();

    try {
      // Create event
      const { data: event, error: eventError } = await supabase
        .from("calendar_events")
        .insert({
          conversation_id: conversationId, // ← fixed: was chat_id
          message_id: messageId ?? null,
          created_by: userId,
          title: title.trim(),
          description: description.trim() || null,
          start_time: startTime,
          end_time: endTime || null,
          location: location.trim() || null,
          is_all_day: isAllDay,
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // Add creator + selected participants
      // De-duplicate in case creator is also in selectedParticipants
      const otherParticipants = selectedParticipants.filter(
        (id) => id !== userId
      );
      const participantsToAdd = [
        { event_id: event.id, user_id: userId, response_status: "accepted" },
        ...otherParticipants.map((id) => ({
          event_id: event.id,
          user_id: id,
          response_status: "pending",
        })),
      ];

      const { error: participantsError } = await supabase
        .from("calendar_event_participants")
        .insert(participantsToAdd);

      if (participantsError) throw participantsError;

      // Reset
      setTitle("");
      setDescription("");
      setStartTime("");
      setEndTime("");
      setIsAllDay(false);
      setLocation("");
      setSelectedParticipants([]);
      onEventCreated();
    } catch (err) {
      console.error("Error creating calendar event:", err);
      setError("Failed to create event. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (creating) return;
    setError(null);
    onClose();
  };

  const inputClass = cn(
    "w-full px-3 py-2 text-sm rounded-lg border bg-secondary text-foreground",
    "placeholder:text-muted-foreground",
    "focus:outline-none focus:ring-2 focus:ring-primary/30 border-border"
  );

  // Other participants (exclude self — creator is always added as accepted)
  const otherParticipants = participants.filter((p) => p.id !== userId);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Create Event
            </h2>
          </div>
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
              placeholder="Event title..."
              className={inputClass}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Description{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Event description..."
              rows={3}
              className={cn(inputClass, "resize-none")}
            />
          </div>

          {/* All day toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              id="isAllDay"
              checked={isAllDay}
              onChange={(e) => {
                setIsAllDay(e.target.checked);
                setStartTime("");
                setEndTime("");
              }}
              className="w-4 h-4 rounded border-border accent-primary"
            />
            <span className="text-sm text-foreground">All day event</span>
          </label>

          {/* Start time */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Start {isAllDay ? "date" : "time"}{" "}
                <span className="text-destructive">*</span>
              </span>
            </label>
            <input
              type={isAllDay ? "date" : "datetime-local"}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* End time — only for non-all-day */}
          {!isAllDay && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  End time{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </span>
              </label>
              <input
                type="datetime-local"
                value={endTime}
                min={startTime || undefined}
                onChange={(e) => setEndTime(e.target.value)}
                className={inputClass}
              />
            </div>
          )}

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                Location{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add a location..."
              className={inputClass}
            />
          </div>

          {/* Invite participants */}
          {otherParticipants.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Invite participants
              </label>
              <div className="space-y-1 max-h-32 overflow-y-auto rounded-lg border border-border p-2 bg-secondary/50">
                {otherParticipants.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-secondary cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedParticipants.includes(p.id)}
                      onChange={() => toggleParticipant(p.id)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                    <span className="text-sm text-foreground">
                      {p.display_name ?? "Unknown"}
                    </span>
                  </label>
                ))}
              </div>
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
            {creating ? "Creating..." : "Create Event"}
          </button>
        </div>
      </div>
    </div>
  );
}
