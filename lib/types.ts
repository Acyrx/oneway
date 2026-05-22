export type Profile = {
  id: string;
  display_name: string;
  avatar_initials: string;
  is_online: boolean;
  created_at: string;
  updated_at: string;
};

export type Conversation = {
  id: string;
  participant_1: string;
  participant_2: string;
  created_at: string;
  updated_at: string;
};

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  status: "sending" | "sent" | "delivered" | "read";
  message_type?: "text" | "gif" | "file" | "image";
  file_url?: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  reply_to?: string | null;
  replied_to_message?: {
    id: string;
    text: string;
    message_type?: string;
    file_url?: string;
    file_name?: string;
    sender?: {
      id?: string;
      display_name?: string;
    };
  } | null;
  created_at: string;
}

export type ConversationWithDetails = Conversation & {
  other_user: Profile;
  last_message: Message | null;
  unread_count: number;
};

export type MessageWithSender = Message & {
  sender: Profile;
};

export interface Poll {
  id: string;
  chat_id: string;
  message_id: string;
  created_by: string;
  question: string;
  allow_multiple: boolean;
  expires_at: string | null;
  status: "active" | "closed";
  options: PollOption[];
}

export interface PollOption {
  id: string;
  poll_id: string;
  option_text: string;
  order_index: number;
  votes: number;
  voted_by_user: boolean;
}

export interface PollVote {
  id: string;
  poll_id: string;
  option_id: string;
  user_id: string;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  chat_id: string;
  message_id: string | null;
  created_by: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  is_all_day: boolean;
}

export interface CalendarEventParticipant {
  id: string;
  event_id: string;
  user_id: string;
  response_status: "pending" | "accepted" | "declined" | "tentative";
}

export interface Task {
  id: string;
  chat_id: string;
  message_id: string | null;
  created_by: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Reminder {
  conversation_id(conversation_id: any): void;
  id: string;
  chat_id: string;
  message_id: string | null;
  created_by: string;
  user_id: string;
  reminder_text: string;
  remind_at: string;
  is_completed: boolean;
  completed_at: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: "message" | "mention" | "poll" | "task" | "reminder" | "event";
  title: string;
  body: string | null;
  chat_id: string | null;
  read: boolean;
  created_at: string;
}

export interface Channel {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
  memberCount: number;
  lastActivity: string;
}

export interface ReplySuggestion {
  suggestion: string;
  tone: "friendly" | "professional" | "casual" | "empathetic" | "playful";
  explanation?: string;
}

export interface Status {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string | null;
  expires_at: string;
  created_at: string;
  user?: Profile;
  view_count?: number;
  has_viewed?: boolean;
}
