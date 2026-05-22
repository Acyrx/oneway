"use client";

import { useState, useEffect } from "react";
import { Task, Profile } from "@/lib/types";
import { format } from "date-fns";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  User2,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface TaskComponentProps {
  task: Task;
  userId: string;
}

export default function TaskComponent({ task, userId }: TaskComponentProps) {
  const [status, setStatus] = useState(task.status);
  const [assigneeProfile, setAssigneeProfile] = useState<Profile | null>(null);
  const [updating, setUpdating] = useState(false);

  const isAssignedToMe = task.assigned_to === userId;
  const isCreator = task.created_by === userId;
  const canEdit = isCreator || isAssignedToMe;
  const isOverdue = task.due_date
    ? new Date(task.due_date) < new Date() && status !== "completed"
    : false;

  // ── Fetch assignee profile ─────────────────────────────────────────────────
  useEffect(() => {
    if (!task.assigned_to) return;

    const supabase = createClient();

    async function fetchAssignee() {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", task.assigned_to)
        .single();

      if (error) {
        console.error("Error fetching assignee:", error);
        return;
      }
      setAssigneeProfile(data);
    }

    fetchAssignee();
  }, [task.assigned_to]);

  // ── Real-time status sync ──────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`task:${task.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasks",
          filter: `id=eq.${task.id}`,
        },
        (payload) => {
          const updated = payload.new as Task;
          setStatus(updated.status);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [task.id]);

  // ── Status change ──────────────────────────────────────────────────────────
  const handleStatusChange = async (newStatus: Task["status"]) => {
    if (!canEdit || updating) return;

    // Optimistic update
    setStatus(newStatus);
    setUpdating(true);

    const supabase = createClient();

    const { error } = await supabase
      .from("tasks")
      .update({
        status: newStatus,
        completed_at:
          newStatus === "completed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    if (error) {
      console.error("Error updating task status:", error);
      // Revert on error
      setStatus(status);
    }

    setUpdating(false);
  };

  // ── Config helpers ─────────────────────────────────────────────────────────
  const getPriorityConfig = (priority: Task["priority"]) => {
    switch (priority) {
      case "urgent":
        return {
          label: "Urgent",
          className:
            "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20",
        };
      case "high":
        return {
          label: "High",
          className:
            "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20",
        };
      case "medium":
        return {
          label: "Medium",
          className:
            "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
        };
      case "low":
        return {
          label: "Low",
          className:
            "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20",
        };
    }
  };

  const getStatusConfig = (s: Task["status"]) => {
    switch (s) {
      case "completed":
        return {
          label: "Completed",
          icon: CheckCircle2,
          className: "text-green-600 dark:text-green-400",
        };
      case "in_progress":
        return {
          label: "In Progress",
          icon: ArrowRight,
          className: "text-primary",
        };
      case "cancelled":
        return {
          label: "Cancelled",
          icon: Circle,
          className: "text-muted-foreground",
        };
      case "pending":
        return {
          label: "Pending",
          icon: Clock,
          className: "text-amber-600 dark:text-amber-400",
        };
    }
  };

  const priorityConfig = getPriorityConfig(task.priority);
  const statusConfig = getStatusConfig(status);
  const StatusIcon = statusConfig.icon;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        "rounded-xl p-4 border bg-card w-72",
        isOverdue ? "border-red-500/30" : "border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <button
            onClick={() =>
              handleStatusChange(
                status === "completed" ? "pending" : "completed"
              )
            }
            disabled={!canEdit || updating}
            className={cn(
              "mt-0.5 shrink-0 transition-colors",
              statusConfig.className,
              canEdit && "hover:opacity-70",
              updating && "opacity-50 cursor-not-allowed"
            )}
          >
            <StatusIcon className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0">
            <h4
              className={cn(
                "text-sm font-semibold text-foreground leading-snug",
                status === "completed" && "line-through opacity-60"
              )}
            >
              {task.title}
            </h4>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {task.description}
              </p>
            )}
          </div>
        </div>

        <span
          className={cn(
            "px-2 py-0.5 text-[10px] font-semibold rounded-md shrink-0",
            priorityConfig.className
          )}
        >
          {priorityConfig.label}
        </span>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
        {assigneeProfile && (
          <div className="flex items-center gap-1.5">
            <User2 className="w-3.5 h-3.5" />
            <span>
              {assigneeProfile.id === userId
                ? "You"
                : assigneeProfile.display_name}
            </span>
          </div>
        )}

        {task.due_date && (
          <div
            className={cn(
              "flex items-center gap-1.5",
              isOverdue && "text-red-600 dark:text-red-400 font-medium"
            )}
          >
            {isOverdue ? (
              <AlertTriangle className="w-3.5 h-3.5" />
            ) : (
              <CalendarDays className="w-3.5 h-3.5" />
            )}
            <span>{format(new Date(task.due_date), "MMM d, yyyy")}</span>
            {isOverdue && <span className="text-[10px]">(Overdue)</span>}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {canEdit && status !== "completed" && status !== "cancelled" && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          {status !== "in_progress" && (
            <button
              onClick={() => handleStatusChange("in_progress")}
              disabled={updating}
              className="px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              Start
            </button>
          )}
          <button
            onClick={() => handleStatusChange("completed")}
            disabled={updating}
            className="px-3 py-1.5 text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-50"
          >
            Complete
          </button>
          {isCreator && (
            <button
              onClick={() => handleStatusChange("cancelled")}
              disabled={updating}
              className="px-3 py-1.5 text-xs font-medium bg-secondary text-muted-foreground rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {status === "completed" && canEdit && (
        <div className="mt-3 pt-3 border-t border-border">
          <button
            onClick={() => handleStatusChange("pending")}
            disabled={updating}
            className="px-3 py-1.5 text-xs font-medium bg-secondary text-muted-foreground rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
          >
            Reopen
          </button>
        </div>
      )}
    </div>
  );
}
