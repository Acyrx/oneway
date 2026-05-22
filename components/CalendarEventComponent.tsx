"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { CalendarEvent, CalendarEventParticipant } from "@/lib/types";
import { format } from "date-fns";
import { Calendar, MapPin, Users, Check, X, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarEventComponentProps {
  event: CalendarEvent;
  userId: string;
}

export default function CalendarEventComponent({
  event,
  userId,
}: CalendarEventComponentProps) {
  const [participants, setParticipants] = useState<CalendarEventParticipant[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // ── Fetch participants + real-time sync ───────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    async function fetchParticipants() {
      setLoading(true);
      const { data, error } = await supabase
        .from("calendar_event_participants")
        .select("*")
        .eq("event_id", event.id);

      if (error) console.error("Error fetching participants:", error);
      else setParticipants(data ?? []);
      setLoading(false);
    }

    fetchParticipants();

    const channel = supabase
      .channel(`cal_event_participants:${event.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calendar_event_participants",
          filter: `event_id=eq.${event.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setParticipants((prev) => {
              if (
                prev.some(
                  (p) => p.id === (payload.new as CalendarEventParticipant).id
                )
              )
                return prev;
              return [...prev, payload.new as CalendarEventParticipant];
            });
          } else if (payload.eventType === "UPDATE") {
            setParticipants((prev) =>
              prev.map((p) =>
                p.id === (payload.new as CalendarEventParticipant).id
                  ? (payload.new as CalendarEventParticipant)
                  : p
              )
            );
          } else if (payload.eventType === "DELETE") {
            setParticipants((prev) =>
              prev.filter(
                (p) => p.id !== (payload.old as CalendarEventParticipant).id
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [event.id]);

  // ── Response handler ──────────────────────────────────────────────────────
  const userParticipant = participants.find((p) => p.user_id === userId);
  const responseStatus = userParticipant?.response_status ?? "pending";

  const handleResponse = async (
    status: CalendarEventParticipant["response_status"]
  ) => {
    if (updating) return;
    setUpdating(true);

    const supabase = createClient();

    // Optimistic update
    setParticipants((prev) =>
      userParticipant
        ? prev.map((p) =>
            p.user_id === userId ? { ...p, response_status: status } : p
          )
        : [
            ...prev,
            {
              id: `temp-${Date.now()}`,
              event_id: event.id,
              user_id: userId,
              response_status: status,
              created_at: new Date().toISOString(),
            },
          ]
    );

    try {
      if (userParticipant) {
        const { error } = await supabase
          .from("calendar_event_participants")
          .update({ response_status: status })
          .eq("event_id", event.id)
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("calendar_event_participants")
          .insert({
            event_id: event.id,
            user_id: userId,
            response_status: status,
          });
        if (error) throw error;
      }
    } catch (err) {
      console.error("Error updating response:", err);
      // Revert optimistic update
      setParticipants((prev) =>
        userParticipant
          ? prev.map((p) => (p.user_id === userId ? userParticipant : p))
          : prev.filter((p) => p.user_id !== userId)
      );
    } finally {
      setUpdating(false);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const startDate = new Date(event.start_time);
  const endDate = event.end_time ? new Date(event.end_time) : null;
  const isPast = startDate < new Date();
  const acceptedCount = participants.filter(
    (p) => p.response_status === "accepted"
  ).length;
  const declinedCount = participants.filter(
    (p) => p.response_status === "declined"
  ).length;

  const getResponseBadge = (status: string) => {
    switch (status) {
      case "accepted":
        return {
          label: "Going",
          className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        };
      case "declined":
        return {
          label: "Declined",
          className: "bg-red-500/15 text-red-600 dark:text-red-400",
        };
      case "tentative":
        return {
          label: "Maybe",
          className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        };
      default:
        return {
          label: "Pending",
          className: "bg-muted text-muted-foreground",
        };
    }
  };

  const badge = getResponseBadge(responseStatus);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        "w-72 rounded-xl bg-card border border-border p-4 shadow-sm",
        isPast && "opacity-60"
      )}
    >
      {/* Title row */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4 text-primary" />
          </div>
          <span className="text-xs font-medium text-primary uppercase tracking-wide">
            Event
          </span>
        </div>
        {userParticipant && (
          <span
            className={cn(
              "px-2 py-0.5 text-[10px] font-semibold rounded-full",
              badge.className
            )}
          >
            {badge.label}
          </span>
        )}
      </div>

      <h4 className="text-sm font-semibold text-card-foreground mb-1 leading-snug">
        {event.title}
      </h4>
      {event.description && (
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          {event.description}
        </p>
      )}

      {/* Meta */}
      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span>
            {event.is_all_day
              ? `${format(startDate, "MMM d, yyyy")} · All day`
              : `${format(startDate, "MMM d, yyyy h:mm a")}${
                  endDate ? ` – ${format(endDate, "h:mm a")}` : ""
                }`}
          </span>
        </div>

        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span className="animate-pulse">Loading...</span>
          </div>
        ) : participants.length > 0 ? (
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>
              {acceptedCount} going
              {declinedCount > 0 && `, ${declinedCount} declined`}
            </span>
          </div>
        ) : null}
      </div>

      {/* Response buttons */}
      {!isPast && (
        <div className="flex items-center gap-1.5 pt-2 border-t border-border">
          <button
            onClick={() => handleResponse("accepted")}
            disabled={updating || responseStatus === "accepted"}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-all",
              responseStatus === "accepted"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "hover:bg-secondary text-card-foreground"
            )}
          >
            <Check className="w-3 h-3" />
            Accept
          </button>
          <button
            onClick={() => handleResponse("tentative")}
            disabled={updating || responseStatus === "tentative"}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-all",
              responseStatus === "tentative"
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "hover:bg-secondary text-card-foreground"
            )}
          >
            <HelpCircle className="w-3 h-3" />
            Maybe
          </button>
          <button
            onClick={() => handleResponse("declined")}
            disabled={updating || responseStatus === "declined"}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-all",
              responseStatus === "declined"
                ? "bg-red-500/15 text-red-600 dark:text-red-400"
                : "hover:bg-secondary text-card-foreground"
            )}
          >
            <X className="w-3 h-3" />
            Decline
          </button>
        </div>
      )}
    </div>
  );
}
