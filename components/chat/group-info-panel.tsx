"use client";

import { useState } from "react";
import {
  X,
  UserPlus,
  Shield,
  ShieldOff,
  UserMinus,
  LogOut,
  Search,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type {
  ConversationWithDetails,
  Profile,
  ConversationMemberRole,
} from "@/lib/types";
import { useSearchUsers, useGroupManagement } from "@/hooks/use-chat";

interface GroupInfoPanelProps {
  conversation: ConversationWithDetails;
  currentUserId: string;
  onClose: () => void;
  onUpdated: () => void;
  onLeftGroup: () => void;
}

export function GroupInfoPanel({
  conversation,
  currentUserId,
  onClose,
  onUpdated,
  onLeftGroup,
}: GroupInfoPanelProps) {
  const [groupName, setGroupName] = useState(conversation.name ?? "");
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedToAdd, setSelectedToAdd] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);

  const isAdmin = conversation.my_role === "admin";
  const members = conversation.members ?? [];
  const existingIds = new Set(members.map((m) => m.user_id));

  const { addMembers, removeMember, setMemberRole, updateGroupName, leaveGroup } =
    useGroupManagement(conversation.id);
  const { users, loading, searchUsers } = useSearchUsers(currentUserId);

  const availableUsers = users.filter((u) => !existingIds.has(u.id));

  const handleSaveName = async () => {
    if (!isAdmin || groupName.trim() === conversation.name) return;
    setBusy(true);
    await updateGroupName(groupName);
    setBusy(false);
    onUpdated();
  };

  const handleAddMembers = async () => {
    if (!selectedToAdd.length) return;
    setBusy(true);
    await addMembers(
      currentUserId,
      selectedToAdd.map((p) => p.id)
    );
    setBusy(false);
    setSelectedToAdd([]);
    setShowAddMembers(false);
    onUpdated();
  };

  const handleRemove = async (userId: string) => {
    if (!confirm("Remove this member from the group?")) return;
    setBusy(true);
    await removeMember(userId);
    setBusy(false);
    onUpdated();
  };

  const handleToggleAdmin = async (
    userId: string,
    currentRole: ConversationMemberRole
  ) => {
    const newRole = currentRole === "admin" ? "member" : "admin";
    if (
      currentRole === "admin" &&
      members.filter((m) => m.role === "admin").length <= 1
    ) {
      alert("The group must have at least one admin.");
      return;
    }
    setBusy(true);
    await setMemberRole(userId, newRole);
    setBusy(false);
    onUpdated();
  };

  const handleLeave = async () => {
    if (!confirm("Leave this group?")) return;
    setBusy(true);
    await leaveGroup(currentUserId);
    setBusy(false);
    onLeftGroup();
    onClose();
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="font-semibold">Group info</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Group name
          </label>
          <div className="flex gap-2 mt-1">
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              disabled={!isAdmin || busy}
              className="bg-secondary border-0"
            />
            {isAdmin && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || groupName.trim() === conversation.name}
                onClick={handleSaveName}
              >
                Save
              </Button>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {members.length} participants
            </span>
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1"
                onClick={() => setShowAddMembers(!showAddMembers)}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add
              </Button>
            )}
          </div>

          {showAddMembers && isAdmin && (
            <div className="mb-4 rounded-lg border p-3 space-y-3 bg-muted/30">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    searchUsers(e.target.value);
                  }}
                  className="pl-9 bg-background border-0"
                />
              </div>
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Searching...
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {availableUsers.map((user) => {
                    const picked = selectedToAdd.some((p) => p.id === user.id);
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() =>
                          setSelectedToAdd((prev) =>
                            picked
                              ? prev.filter((p) => p.id !== user.id)
                              : [...prev, user]
                          )
                        }
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md p-2 text-sm",
                          picked ? "bg-primary/10" : "hover:bg-secondary"
                        )}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {user.avatar_initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="flex-1 text-left">
                          {user.display_name}
                        </span>
                        {picked && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}
              <Button
                size="sm"
                className="w-full"
                disabled={!selectedToAdd.length || busy}
                onClick={handleAddMembers}
              >
                Add {selectedToAdd.length || ""} member
                {selectedToAdd.length === 1 ? "" : "s"}
              </Button>
            </div>
          )}

          <ul className="space-y-1">
            {members.map((member) => {
              const isSelf = member.user_id === currentUserId;
              const canManage = isAdmin && !isSelf;

              return (
                <li
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-secondary/50"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/20 text-primary text-sm">
                      {member.profile.avatar_initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {member.profile.display_name}
                      {isSelf && (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          (You)
                        </span>
                      )}
                    </p>
                    {member.role === "admin" && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Group admin
                      </span>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={
                          member.role === "admin"
                            ? "Remove admin"
                            : "Make admin"
                        }
                        disabled={busy}
                        onClick={() =>
                          handleToggleAdmin(member.user_id, member.role)
                        }
                      >
                        {member.role === "admin" ? (
                          <ShieldOff className="h-4 w-4" />
                        ) : (
                          <Shield className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        title="Remove member"
                        disabled={busy}
                        onClick={() => handleRemove(member.user_id)}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="border-t p-4">
        <Button
          variant="outline"
          className="w-full text-destructive hover:text-destructive gap-2"
          onClick={handleLeave}
          disabled={busy}
        >
          <LogOut className="h-4 w-4" />
          Leave group
        </Button>
      </div>
    </div>
  );
}
