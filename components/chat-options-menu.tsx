"use client";

import { useEffect, useRef } from "react";
import {
  Ban,
  ListTodo,
  Bell,
  Settings,
  Calendar,
  Trash2,
  VolumeX,
  Pin,
  PinOff,
  Flag,
  Archive,
  Shield,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatOptionsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onViewTasks: () => void;
  onViewReminders: () => void;
  onPinChat: () => void;
  onOpenCalendar: () => void;
  onOpenChatSettings: () => void;
  onOpenPrivacy: () => void;
  onArchiveChat: () => void;
  onInviteUsers?: () => void;
  chatType: "direct" | "group";
  isPinned?: boolean;
}

export default function ChatOptionsMenu({
  isOpen,
  onClose,
  onViewTasks,
  onViewReminders,
  onPinChat,
  onOpenCalendar,
  onOpenChatSettings,
  onOpenPrivacy,
  onArchiveChat,
  onInviteUsers,
  chatType,
  isPinned = false,
}: ChatOptionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  type MenuItem =
    | {
        icon: React.ComponentType<{ className?: string }>;
        label: string;
        onClick: () => void;
        color: string;
        bgColor: string;
        description?: string;
      }
    | { divider: true };

  const menuItems: MenuItem[] = [
    {
      icon: ListTodo,
      label: "View Tasks",
      description: "See all tasks in this chat",
      onClick: () => {
        onViewTasks();
        onClose();
      },
      color: "text-primary",
      bgColor: "group-hover:bg-primary/10",
    },
    {
      icon: Bell,
      label: "Reminders",
      description: "View your reminders",
      onClick: () => {
        onViewReminders();
        onClose();
      },
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "group-hover:bg-amber-500/10",
    },
    {
      icon: Calendar,
      label: "Calendar",
      description: "View events and schedule",
      onClick: () => {
        onOpenCalendar();
        onClose();
      },
      color: "text-chart-1",
      bgColor: "group-hover:bg-chart-1/10",
    },
    { divider: true },
    ...(chatType === "group"
      ? [
          {
            icon: UserPlus,
            label: "Add People",
            description: "Invite members to group",
            onClick: () => {
              onInviteUsers?.();
              onClose();
            },
            color: "text-primary",
            bgColor: "group-hover:bg-primary/10",
          } as MenuItem,
        ]
      : []),
    {
      icon: isPinned ? PinOff : Pin,
      label: isPinned ? "Unpin Chat" : "Pin Chat",
      description: isPinned ? "Remove from pinned" : "Keep at top of list",
      onClick: () => {
        onPinChat();
        onClose();
      },
      color: "text-foreground",
      bgColor: "group-hover:bg-secondary",
    },
    {
      icon: VolumeX,
      label: "Mute Notifications",
      onClick: () => onClose(),
      color: "text-foreground",
      bgColor: "group-hover:bg-secondary",
    },
    {
      icon: Archive,
      label: "Archive Chat",
      onClick: () => {
        onArchiveChat();
        onClose();
      },
      color: "text-foreground",
      bgColor: "group-hover:bg-secondary",
    },
    { divider: true },
    {
      icon: Settings,
      label: "Chat Settings",
      description: "Customize this conversation",
      onClick: () => {
        onOpenChatSettings();
        onClose();
      },
      color: "text-foreground",
      bgColor: "group-hover:bg-secondary",
    },
    {
      icon: Shield,
      label: "Privacy",
      description: "Manage privacy settings",
      onClick: () => {
        onOpenPrivacy();
        onClose();
      },
      color: "text-foreground",
      bgColor: "group-hover:bg-secondary",
    },
    { divider: true },
    {
      icon: Flag,
      label: "Report",
      onClick: () => onClose(),
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "group-hover:bg-amber-500/10",
    },
    ...(chatType === "direct"
      ? [
          {
            icon: Ban,
            label: "Block User",
            onClick: () => onClose(),
            color: "text-destructive",
            bgColor: "group-hover:bg-destructive/10",
          } as MenuItem,
        ]
      : []),
    {
      icon: Trash2,
      label: chatType === "group" ? "Leave Group" : "Delete Chat",
      onClick: () => onClose(),
      color: "text-destructive",
      bgColor: "group-hover:bg-destructive/10",
    },
  ];

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-12 z-40 w-64 bg-card rounded-xl border border-border shadow-xl py-1 animate-in fade-in slide-in-from-top-2 duration-200"
    >
      {menuItems.map((item, i) => {
        if ("divider" in item && item.divider) {
          return (
            <div key={`div-${i}`} className="my-1 border-t border-border" />
          );
        }
        const menuItem = item as Exclude<MenuItem, { divider: true }>;
        const Icon = menuItem.icon;
        return (
          <button
            key={i}
            onClick={menuItem.onClick}
            className="group w-full flex items-center gap-3 px-3 py-2 hover:bg-secondary/50 transition-colors text-left"
          >
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                menuItem.bgColor
              )}
            >
              <Icon className={cn("w-4 h-4", menuItem.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <span
                className={cn(
                  "text-sm font-medium block",
                  menuItem.color === "text-destructive"
                    ? "text-destructive"
                    : "text-foreground"
                )}
              >
                {menuItem.label}
              </span>
              {menuItem.description && (
                <span className="text-[10px] text-muted-foreground block mt-0.5 leading-tight">
                  {menuItem.description}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
