"use client";

import { useState, useEffect } from "react";
import { CalendarEvent, CalendarEventParticipant } from "@/lib/types";
import { format } from "date-fns";
import { Calendar, MapPin, Users, Check, X, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

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

  // Fetch participants from Supabase
  useEffect(() => {
    const supabase = createClient();

    async function fetchParticipants() {
      setLoading(true);
      const { data, error } = await supabase
        .from("calendar_event_participants")
        .select("*")
        .eq("event_id", event.id);

      if (error) {
        console.error("Error fetching participants:", error);
      } else {
        setParticipants(data ?? []);
      }
      setLoading(false);
    }

    fetchParticipants();

    // Real-time updates
    const channel = supabase
      .channel(`calendar_event_participants:${event.id}`)
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

  const userParticipant = participants.find((p) => p.user_id === userId);
  const responseStatus = userParticipant?.response_status ?? "pending";

  const handleResponse = async (
    status: CalendarEventParticipant["response_status"]
  ) => {
    if (updating) return;
    setUpdating(true);

    const supabase = createClient();

    try {
      if (userParticipant) {
        // Update existing row
        const { error } = await supabase
          .from("calendar_event_participants")
          .update({ response_status: status })
          .eq("event_id", event.id)
          .eq("user_id", userId);

        if (error) throw error;

        setParticipants((prev) =>
          prev.map((p) =>
            p.user_id === userId ? { ...p, response_status: status } : p
          )
        );
      } else {
        // Insert new row
        const { data, error } = await supabase
          .from("calendar_event_participants")
          .insert({
            event_id: event.id,
            user_id: userId,
            response_status: status,
          })
          .select()
          .single();

        if (error) throw error;

        setParticipants((prev) => [...prev, data as CalendarEventParticipant]);
      }
    } catch (error) {
      console.error("Error updating response:", error);
    } finally {
      setUpdating(false);
    }
  };

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

  const startDate = new Date(event.start_time);
  const endDate = event.end_time ? new Date(event.end_time) : null;
  const isPast = startDate < new Date();
  const badge = getResponseBadge(responseStatus);

  const acceptedCount = participants.filter(
    (p) => p.response_status === "accepted"
  ).length;
  const declinedCount = participants.filter(
    (p) => p.response_status === "declined"
  ).length;

  return (
    <div
      className={cn(
        "w-72 rounded-xl bg-card border border-border p-4 shadow-sm",
        isPast && "opacity-60"
      )}
    >
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

      <h4 className="text-sm font-semibold text-card-foreground mb-1 leading-relaxed">
        {event.title}
      </h4>

      {event.description && (
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          {event.description}
        </p>
      )}

      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span>
            {event.is_all_day
              ? format(startDate, "MMM d, yyyy")
              : `${format(startDate, "MMM d, yyyy h:mm a")}${
                  endDate ? ` – ${format(endDate, "h:mm a")}` : ""
                }`}
          </span>
        </div>

        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{event.location}</span>
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
