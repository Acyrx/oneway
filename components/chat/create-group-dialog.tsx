"use client";

import { useState } from "react";
import { Search, Users, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { useSearchUsers, useCreateGroup } from "@/hooks/use-chat";

interface CreateGroupDialogProps {
  currentUserId: string;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

export function CreateGroupDialog({
  currentUserId,
  onClose,
  onCreated,
}: CreateGroupDialogProps) {
  const [groupName, setGroupName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<Profile[]>([]);
  const { users, loading, searchUsers } = useSearchUsers(currentUserId);
  const { createGroup, creating } = useCreateGroup();

  const toggleUser = (user: Profile) => {
    setSelected((prev) => {
      const exists = prev.some((p) => p.id === user.id);
      if (exists) return prev.filter((p) => p.id !== user.id);
      return [...prev, user];
    });
  };

  const handleCreate = async () => {
    const conv = await createGroup(
      currentUserId,
      groupName,
      selected.map((p) => p.id)
    );
    if (conv) {
      onCreated(conv.id);
      onClose();
    }
  };

  const canCreate =
    groupName.trim().length > 0 && selected.length > 0 && !creating;

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <span className="font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          New group
        </span>
        <Button
          size="sm"
          disabled={!canCreate}
          onClick={handleCreate}
        >
          {creating ? "Creating..." : "Create"}
        </Button>
      </div>

      <div className="p-4 space-y-4 border-b">
        <Input
          placeholder="Group name"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          className="bg-secondary border-0"
          autoFocus
        />

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selected.map((user) => (
              <span
                key={user.id}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium"
              >
                {user.display_name}
                <button
                  type="button"
                  onClick={() => toggleUser(user)}
                  className="hover:opacity-70"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search friends to add..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchUsers(e.target.value);
            }}
            className="pl-9 bg-secondary border-0"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex justify-center p-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : users.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {searchQuery
              ? "No users found"
              : "Search for friends to add to the group"}
          </p>
        ) : (
          users.map((user) => {
            const isSelected = selected.some((p) => p.id === user.id);
            return (
              <button
                key={user.id}
                type="button"
                onClick={() => toggleUser(user)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors",
                  isSelected ? "bg-primary/10" : "hover:bg-secondary"
                )}
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/20 text-primary font-medium">
                    {user.avatar_initials}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 font-medium">{user.display_name}</span>
                {isSelected && (
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
