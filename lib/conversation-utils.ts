import type { Conversation, ConversationWithDetails, Profile } from "@/lib/types";

export function getGroupInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "GR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function isGroupConversation(
  conv: Pick<Conversation, "type">
): boolean {
  return conv.type === "group";
}

export function getConversationDisplayName(
  conv: ConversationWithDetails
): string {
  if (isGroupConversation(conv)) {
    return conv.name?.trim() || "Group";
  }
  return conv.other_user?.display_name ?? "Unknown";
}

export function getConversationInitials(
  conv: ConversationWithDetails
): string {
  if (isGroupConversation(conv)) {
    return getGroupInitials(conv.name ?? "Group");
  }
  return conv.other_user?.avatar_initials ?? "??";
}

export function getMemberProfiles(
  conv: ConversationWithDetails | undefined
): Profile[] {
  if (!conv?.members?.length) {
    return conv?.other_user ? [conv.other_user] : [];
  }
  return conv.members.map((m) => m.profile);
}

export function getProfileById(
  members: Profile[],
  userId: string
): Profile | undefined {
  return members.find((p) => p.id === userId);
}
