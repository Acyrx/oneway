create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_initials text not null,
  is_online boolean default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Create conversations table for 1-to-1 chats
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  participant_1 uuid not null references public.profiles(id) on delete cascade,
  participant_2 uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint unique_participants unique (participant_1, participant_2),
  constraint different_participants check (participant_1 != participant_2)
);

-- Create messages table
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  status text not null default 'sent' check (status in ('sending', 'sent', 'delivered', 'read')),
  created_at timestamptz default now() not null
);


-- Create function to auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_initials)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    upper(left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), 2))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Create trigger for auto-creating profile
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Create function to update conversation timestamp when new message is added
create or replace function public.update_conversation_timestamp()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.conversations 
  set updated_at = now() 
  where id = new.conversation_id;
  return new;
end;
$$;

-- Create trigger for updating conversation timestamp
drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row
  execute function public.update_conversation_timestamp();


-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- RLS Policies for profiles (anyone can read, users can only modify their own)
create policy "profiles_select_all" on public.profiles 
  for select using (true);

create policy "profiles_insert_own" on public.profiles 
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles 
  for update using (auth.uid() = id);

-- RLS Policies for conversations (users can only see their own conversations)
create policy "conversations_select_own" on public.conversations 
  for select using (auth.uid() = participant_1 or auth.uid() = participant_2);

create policy "conversations_insert" on public.conversations 
  for insert with check (auth.uid() = participant_1 or auth.uid() = participant_2);

-- RLS Policies for messages (users can only see messages in their conversations)
create policy "messages_select_own_conversations" on public.messages 
  for select using (
    exists (
      select 1 from public.conversations c 
      where c.id = conversation_id 
      and (c.participant_1 = auth.uid() or c.participant_2 = auth.uid())
    )
  );

create policy "messages_insert_own" on public.messages 
  for insert with check (
    auth.uid() = sender_id 
    and exists (
      select 1 from public.conversations c 
      where c.id = conversation_id 
      and (c.participant_1 = auth.uid() or c.participant_2 = auth.uid())
    )
  );

create policy "messages_update_status" on public.messages 
  for update using (
    exists (
      select 1 from public.conversations c 
      where c.id = conversation_id 
      and (c.participant_1 = auth.uid() or c.participant_2 = auth.uid())
    )
  );


  -- Add new columns
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text',
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_size BIGINT,
ADD COLUMN IF NOT EXISTS file_type TEXT,
ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES public.messages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Add check constraint for message_type
ALTER TABLE public.messages
ADD CONSTRAINT messages_message_type_check
CHECK (
  message_type IN (
    'text',
    'gif',
    'sticker',
    'file',
    'image'
  )
);