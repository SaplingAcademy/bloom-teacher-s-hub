-- COMPLETE DATABASE SCHEMA FOR BLOOM TEACHER'S HUB
-- Target Platform: Supabase (PostgreSQL)
-- Includes: RLS Policies, Automatic Profile Triggers, Indexes, and Default Seeds

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =========================================================================
-- 1. DROP EXISTING TABLE TRIGGERS & TABLES (IF ANY) FOR CLEAN INSTALL
-- =========================================================================
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user cascade;
drop function if exists public.set_updated_at cascade;

-- =========================================================================
-- 2. CREATE CORE TABLES
-- =========================================================================

-- Tabela 1: profiles (Extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_url text,
  bio text,
  languages_taught text[] default '{}',
  timezone text default 'America/Sao_Paulo',
  locale text default 'pt-BR',
  onboarding_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 1.1: teacher_profiles (New main teacher profile table)
create table if not exists public.teacher_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_url text,
  preferred_language text default 'pt-BR',
  timezone text default 'America/Sao_Paulo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


-- Tabela 2: settings (or teacher_settings)
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade unique not null,
  currency text default 'BRL',
  default_class_duration integer default 60,
  week_starts_on smallint default 1,
  booking_link_slug text unique,
  invoice_branding jsonb default '{}',
  notification_preferences jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 3: packages
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  price integer not null, -- Price in cents
  frequency text default 'monthly', -- monthly, custom, etc.
  duration integer default 60, -- lesson duration in minutes
  lessons integer default 4, -- number of lessons in package
  method text default 'online', -- online, in_person
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 4: students
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.teacher_profiles(id) on delete cascade not null,
  full_name text not null,
  email text,
  phone text,
  avatar_url text,
  language_studied text not null default 'English',
  level text, -- CEFR: A1, A2, B1, B2, C1, C2
  focus text, -- Course focus (Business, General, Conversation, etc.)
  type text default 'Private', -- Private, Group
  status text default 'Active', -- Active, Paused, Trial, Lead
  schedule text, -- human readable schedule description
  group_size integer default 1,
  package_id uuid references public.packages(id) on delete set null,
  lessons_remaining integer default 0,
  lessons_delivered integer default 0,
  notes text, -- General student notes
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 4.1: student_schedules (Class days & times per student)
create table if not exists public.student_schedules (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade not null,
  weekday text not null,
  start_time time,
  end_time time,
  created_at timestamptz default now(),
  constraint student_schedules_student_id_weekday_key unique (student_id, weekday)
);

-- Tabela 4.2: student_packages (Historical & active package assignments)
create table if not exists public.student_packages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade not null,
  package_id uuid references public.packages(id) on delete restrict not null,
  teacher_id uuid references auth.users(id) on delete cascade not null,
  started_at date not null default current_date,
  ended_at date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tabela 5: leads
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  full_name text not null,
  email text,
  phone text,
  source text, -- instagram, whatsapp, website, referral, other
  stage text default 'new', -- new, contacted, trial, won, lost
  notes text,
  converted_student_id uuid references public.students(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 6: lessons
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  level text, -- CEFR
  language text,
  skill_focus text[] default '{}',
  content jsonb default '{}',
  duration_minutes integer default 60,
  is_template boolean default false,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 7: calendar_events (classes / lessons calendar)
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id) on delete cascade not null,
  student_id uuid references public.students(id) on delete set null,
  schedule_id uuid references public.student_schedules(id) on delete set null,
  student_name text,
  level text,
  focus text,
  date date not null,
  start_time text not null, -- "HH:MM"
  end_time text not null, -- "HH:MM"
  duration integer default 60,
  type text default 'Private', -- Private, Group
  delivery_mode text default 'Online', -- Online, In person
  location_link text,
  status text default 'Scheduled', -- Scheduled, Completed, Cancelled, Needs Prep, etc.
  attendance_recorded boolean default false,
  attendance_status text, -- Present, Absent, Excused
  notes text,
  homework_title text,
  lesson_plan_url text,
  is_recurring boolean default false,
  recurrence_series_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint calendar_events_unique_occurrence unique (student_id, schedule_id, date)
);

-- Tabela 8: folders (file manager structure)
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  parent_id uuid references public.folders(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 9: resources (files & attachments)
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  file_url text,
  file_type text, -- pdf, image, audio, video, etc.
  file_size_bytes bigint,
  level text,
  language text,
  tags text[] default '{}',
  folder_id uuid references public.folders(id) on delete set null,
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 10: invoices
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  student_id uuid references public.students(id) on delete cascade not null,
  invoice_number text not null,
  description text,
  amount_cents integer not null,
  currency text default 'BRL',
  status text default 'draft', -- draft, sent, paid, overdue, cancelled
  due_date date not null,
  paid_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 11: invoice_items
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete cascade not null,
  description text not null,
  quantity integer default 1 not null,
  unit_amount_cents integer not null,
  created_at timestamptz default now()
);

-- Tabela 12: payments
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  invoice_id uuid references public.invoices(id) on delete set null,
  amount_cents integer not null,
  currency text default 'BRL',
  method text, -- pix, card, cash, transfer, other
  external_id text,
  received_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Tabela 13: expense_categories
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  color text,
  created_at timestamptz default now()
);

-- Tabela 14: expenses
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  description text not null,
  amount_cents integer not null,
  currency text default 'BRL',
  date date not null,
  category_id uuid references public.expense_categories(id) on delete set null,
  recurring boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 15: task_categories
create table if not exists public.task_categories (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  color text,
  created_at timestamptz default now()
);

-- Tabela 16: priorities
create table if not exists public.priorities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  level integer default 1
);

-- Tabela 17: tasks
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  status text default 'pending', -- pending, completed
  due_date timestamptz,
  category_id uuid references public.task_categories(id) on delete set null,
  priority_id uuid references public.priorities(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 18: community_posts
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  content text not null,
  tags text[] default '{}',
  likes_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 19: comments
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.community_posts(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 20: reactions (likes/claps/etc. on posts or comments)
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  type text not null, -- like, love, clap, standard
  created_at timestamptz default now(),
  constraint only_one_target check (
    (post_id is not null and comment_id is null) or
    (post_id is null and comment_id is not null)
  ),
  unique (user_id, post_id),
  unique (user_id, comment_id)
);

-- Tabela 21: notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  message text not null,
  type text default 'info', -- info, alert, achievement, system
  read boolean default false,
  created_at timestamptz default now()
);

-- Tabela 22: onboarding (Stores structured question answers)
create table if not exists public.onboarding (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade unique not null,
  answers jsonb default '{}'::jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 23: growth_metrics
create table if not exists public.growth_metrics (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  metric_name text not null, -- revenue, hours_taught, new_students
  value numeric not null,
  date date not null,
  created_at timestamptz default now()
);

-- Tabela 24: business_goals
create table if not exists public.business_goals (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  target_value numeric not null,
  current_value numeric default 0,
  metric_name text not null,
  deadline date,
  completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 25: analytics
create table if not exists public.analytics (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  event_name text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Tabela 26: ranking (Leaderboard points)
create table if not exists public.ranking (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade unique not null,
  points integer default 0 not null,
  rank integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela 27: achievements
create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null,
  badge_url text,
  points integer default 0 not null
);

-- Tabela 28: teacher_achievements (Unlocked achievements join table)
create table if not exists public.teacher_achievements (
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  achievement_id uuid references public.achievements(id) on delete cascade not null,
  unlocked_at timestamptz default now(),
  primary key (teacher_id, achievement_id)
);

-- =========================================================================
-- 3. CREATE TRIGGER FUNCTIONS & TRIGGER BINDINGS
-- =========================================================================

-- Trigger to automatically update the 'updated_at' column on row updates
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Bind set_updated_at trigger to tables
drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_teacher_profiles on public.teacher_profiles;
create trigger set_updated_at_teacher_profiles before update on public.teacher_profiles for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_settings on public.settings;
create trigger set_updated_at_settings before update on public.settings for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_packages on public.packages;
create trigger set_updated_at_packages before update on public.packages for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_students on public.students;
create trigger set_updated_at_students before update on public.students for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_leads on public.leads;
create trigger set_updated_at_leads before update on public.leads for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_lessons on public.lessons;
create trigger set_updated_at_lessons before update on public.lessons for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_calendar_events on public.calendar_events;
create trigger set_updated_at_calendar_events before update on public.calendar_events for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_folders on public.folders;
create trigger set_updated_at_folders before update on public.folders for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_resources on public.resources;
create trigger set_updated_at_resources before update on public.resources for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_invoices on public.invoices;
create trigger set_updated_at_invoices before update on public.invoices for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_expenses on public.expenses;
create trigger set_updated_at_expenses before update on public.expenses for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_tasks on public.tasks;
create trigger set_updated_at_tasks before update on public.tasks for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_community_posts on public.community_posts;
create trigger set_updated_at_community_posts before update on public.community_posts for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_comments on public.comments;
create trigger set_updated_at_comments before update on public.comments for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_onboarding on public.onboarding;
create trigger set_updated_at_onboarding before update on public.onboarding for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_business_goals on public.business_goals;
create trigger set_updated_at_business_goals before update on public.business_goals for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_ranking on public.ranking;
create trigger set_updated_at_ranking before update on public.ranking for each row execute function public.set_updated_at();

-- Trigger to automatically create a profile, default settings, ranking, and teacher profile on new auth.users signup
create or replace function public.handle_new_user()
returns trigger as $$
declare
  default_name text;
  default_avatar text;
begin
  default_name := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'Educator');
  default_avatar := coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '');

  -- Insert profile
  insert into public.profiles (id, full_name, avatar_url, onboarding_completed)
  values (new.id, default_name, default_avatar, false)
  on conflict (id) do nothing;

  -- Insert teacher profile
  insert into public.teacher_profiles (id, full_name, avatar_url, preferred_language, timezone)
  values (new.id, default_name, default_avatar, 'pt-BR', 'America/Sao_Paulo')
  on conflict (id) do nothing;

  -- Insert settings
  insert into public.settings (teacher_id)
  values (new.id)
  on conflict (teacher_id) do nothing;

  -- Insert ranking
  insert into public.ranking (teacher_id, points)
  values (new.id, 0)
  on conflict (teacher_id) do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Bind trigger to auth.users table
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Trigger function to synchronize teacher_profiles to profiles for backwards compatibility
create or replace function public.sync_teacher_profile_to_profiles()
returns trigger as $$
begin
  update public.profiles
  set 
    full_name = new.full_name,
    avatar_url = new.avatar_url,
    updated_at = new.updated_at
  where id = new.id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Bind synchronization trigger
drop trigger if exists sync_teacher_profile_to_profiles_trigger on public.teacher_profiles;
create trigger sync_teacher_profile_to_profiles_trigger
  after update on public.teacher_profiles
  for each row
  execute function public.sync_teacher_profile_to_profiles();


-- =========================================================================
-- 4. CONFIGURE ROW LEVEL SECURITY (RLS) & POLICIES
-- =========================================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.teacher_profiles enable row level security;
alter table public.settings enable row level security;
alter table public.packages enable row level security;
alter table public.students enable row level security;
alter table public.leads enable row level security;
alter table public.lessons enable row level security;
alter table public.calendar_events enable row level security;
alter table public.folders enable row level security;
alter table public.resources enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.task_categories enable row level security;
alter table public.priorities enable row level security;
alter table public.tasks enable row level security;
alter table public.community_posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.onboarding enable row level security;
alter table public.growth_metrics enable row level security;
alter table public.business_goals enable row level security;
alter table public.analytics enable row level security;
alter table public.ranking enable row level security;
alter table public.achievements enable row level security;
alter table public.teacher_achievements enable row level security;

-- 4.1 Profiles policies (SELECT allowed for all authenticated users to show name/avatar in forum)
drop policy if exists "Allow SELECT for all authenticated users" on public.profiles;
drop policy if exists "Allow UPDATE for owner" on public.profiles;
create policy "Allow SELECT for all authenticated users" on public.profiles for select to authenticated using (true);
create policy "Allow UPDATE for owner" on public.profiles for update to authenticated using (auth.uid() = id);

-- 4.1b Teacher Profiles policies (Strict owner-only access for SELECT and UPDATE)
drop policy if exists "Allow SELECT for owner" on public.teacher_profiles;
drop policy if exists "Allow UPDATE for owner" on public.teacher_profiles;
create policy "Allow SELECT for owner" on public.teacher_profiles for select to authenticated using (auth.uid() = id);
create policy "Allow UPDATE for owner" on public.teacher_profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);


-- 4.2 Settings policies
drop policy if exists "Manage own settings" on public.settings;
create policy "Manage own settings" on public.settings for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- 4.3 Packages policies
drop policy if exists "Manage own packages" on public.packages;
create policy "Manage own packages" on public.packages for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- 4.4 Students policies
drop policy if exists "Manage own students" on public.students;
create policy "Manage own students" on public.students for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- 4.4b Student schedules policies
drop policy if exists "Manage own student schedules" on public.student_schedules;
drop policy if exists "Allow teachers SELECT on their students schedules" on public.student_schedules;
drop policy if exists "Allow teachers INSERT on their students schedules" on public.student_schedules;
drop policy if exists "Allow teachers UPDATE on their students schedules" on public.student_schedules;
drop policy if exists "Allow teachers DELETE on their students schedules" on public.student_schedules;

create policy "Allow teachers SELECT on their students schedules" on public.student_schedules
  for select to authenticated
  using (
    exists (
      select 1 from public.students
      where public.students.id = student_schedules.student_id
        and public.students.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers INSERT on their students schedules" on public.student_schedules
  for insert to authenticated
  with check (
    exists (
      select 1 from public.students
      where public.students.id = student_schedules.student_id
        and public.students.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers UPDATE on their students schedules" on public.student_schedules
  for update to authenticated
  using (
    exists (
      select 1 from public.students
      where public.students.id = student_schedules.student_id
        and public.students.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.students
      where public.students.id = student_schedules.student_id
        and public.students.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers DELETE on their students schedules" on public.student_schedules
  for delete to authenticated
  using (
    exists (
      select 1 from public.students
      where public.students.id = student_schedules.student_id
        and public.students.teacher_id = auth.uid()
    )
  );

-- 4.4c Student packages policies
alter table public.student_packages enable row level security;

drop policy if exists "Allow teachers SELECT on their student packages" on public.student_packages;
drop policy if exists "Allow teachers INSERT on their student packages" on public.student_packages;
drop policy if exists "Allow teachers UPDATE on their student packages" on public.student_packages;
drop policy if exists "Allow teachers DELETE on their student packages" on public.student_packages;

create policy "Allow teachers SELECT on their student packages" on public.student_packages
  for select to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = student_packages.student_id
        and s.teacher_id = auth.uid()
    )
    and exists (
      select 1 from public.packages p
      where p.id = student_packages.package_id
        and p.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers INSERT on their student packages" on public.student_packages
  for insert to authenticated
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = student_packages.student_id
        and s.teacher_id = auth.uid()
    )
    and exists (
      select 1 from public.packages p
      where p.id = student_packages.package_id
        and p.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers UPDATE on their student packages" on public.student_packages
  for update to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = student_packages.student_id
        and s.teacher_id = auth.uid()
    )
    and exists (
      select 1 from public.packages p
      where p.id = student_packages.package_id
        and p.teacher_id = auth.uid()
    )
  )
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = student_packages.student_id
        and s.teacher_id = auth.uid()
    )
    and exists (
      select 1 from public.packages p
      where p.id = student_packages.package_id
        and p.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers DELETE on their student packages" on public.student_packages
  for delete to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = student_packages.student_id
        and s.teacher_id = auth.uid()
    )
    and exists (
      select 1 from public.packages p
      where p.id = student_packages.package_id
        and p.teacher_id = auth.uid()
    )
  );

-- 4.5 Leads policies
drop policy if exists "Manage own leads" on public.leads;
create policy "Manage own leads" on public.leads for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- 4.6 Lessons policies
drop policy if exists "Manage own lessons" on public.lessons;
create policy "Manage own lessons" on public.lessons for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- 4.7 Calendar Events policies
drop policy if exists "Manage own calendar events" on public.calendar_events;
drop policy if exists "Allow teachers SELECT on their calendar events" on public.calendar_events;
drop policy if exists "Allow teachers INSERT on their calendar events" on public.calendar_events;
drop policy if exists "Allow teachers UPDATE on their calendar events" on public.calendar_events;
drop policy if exists "Allow teachers DELETE on their calendar events" on public.calendar_events;

create policy "Allow teachers SELECT on their calendar events" on public.calendar_events
  for select to authenticated
  using (teacher_id = auth.uid());

create policy "Allow teachers INSERT on their calendar events" on public.calendar_events
  for insert to authenticated
  with check (teacher_id = auth.uid());

create policy "Allow teachers UPDATE on their calendar events" on public.calendar_events
  for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "Allow teachers DELETE on their calendar events" on public.calendar_events
  for delete to authenticated
  using (teacher_id = auth.uid());

-- 4.8 Folders policies
drop policy if exists "Manage own folders" on public.folders;
create policy "Manage own folders" on public.folders for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- 4.9 Resources policies (SELECT also allows public files)
drop policy if exists "Read public resources or own" on public.resources;
drop policy if exists "Manage own resources" on public.resources;
drop policy if exists "Insert own resources" on public.resources;
drop policy if exists "Update own resources" on public.resources;
drop policy if exists "Delete own resources" on public.resources;

create policy "Read public resources or own" on public.resources for select to authenticated using (auth.uid() = teacher_id or is_public = true);
create policy "Insert own resources" on public.resources for insert to authenticated with check (auth.uid() = teacher_id);
create policy "Update own resources" on public.resources for update to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);
create policy "Delete own resources" on public.resources for delete to authenticated using (auth.uid() = teacher_id);

-- 4.10 Invoices policies
drop policy if exists "Manage own invoices" on public.invoices;
create policy "Manage own invoices" on public.invoices for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- 4.11 Invoice Items policies (inherits from invoices owner checks)
drop policy if exists "Manage own invoice items" on public.invoice_items;
create policy "Manage own invoice items" on public.invoice_items for all to authenticated using (
  exists (select 1 from public.invoices where invoices.id = invoice_id and invoices.teacher_id = auth.uid())
) with check (
  exists (select 1 from public.invoices where invoices.id = invoice_id and invoices.teacher_id = auth.uid())
);

-- 4.12 Payments policies
drop policy if exists "Manage own payments" on public.payments;
create policy "Manage own payments" on public.payments for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- 4.13 Expense Categories policies
drop policy if exists "Manage own expense categories" on public.expense_categories;
create policy "Manage own expense categories" on public.expense_categories for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- 4.14 Expenses policies
drop policy if exists "Manage own expenses" on public.expenses;
create policy "Manage own expenses" on public.expenses for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- 4.15 Task Categories policies
drop policy if exists "Manage own task categories" on public.task_categories;
create policy "Manage own task categories" on public.task_categories for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- 4.16 Priorities policies (global read-only)
drop policy if exists "Allow read priorities for all" on public.priorities;
create policy "Allow read priorities for all" on public.priorities for select to authenticated using (true);

-- 4.17 Tasks policies
drop policy if exists "Manage own tasks" on public.tasks;
create policy "Manage own tasks" on public.tasks for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- 4.18 Community Posts policies
drop policy if exists "Read all posts" on public.community_posts;
drop policy if exists "Manage own posts" on public.community_posts;
create policy "Read all posts" on public.community_posts for select to authenticated using (true);
create policy "Manage own posts" on public.community_posts for all to authenticated using (auth.uid() = author_id) with check (auth.uid() = author_id);

-- 4.19 Comments policies
drop policy if exists "Read all comments" on public.comments;
drop policy if exists "Manage own comments" on public.comments;
create policy "Read all comments" on public.comments for select to authenticated using (true);
create policy "Manage own comments" on public.comments for all to authenticated using (auth.uid() = author_id) with check (auth.uid() = author_id);

-- 4.20 Reactions policies
drop policy if exists "Read all reactions" on public.reactions;
drop policy if exists "Manage own reactions" on public.reactions;
create policy "Read all reactions" on public.reactions for select to authenticated using (true);
create policy "Manage own reactions" on public.reactions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4.21 Notifications policies
drop policy if exists "Manage own notifications" on public.notifications;
create policy "Manage own notifications" on public.notifications for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4.22 Onboarding policies
drop policy if exists "Manage own onboarding" on public.onboarding;
create policy "Manage own onboarding" on public.onboarding for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- 4.23 Growth Metrics policies
drop policy if exists "Manage own metrics" on public.growth_metrics;
create policy "Manage own metrics" on public.growth_metrics for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- 4.24 Business Goals policies
drop policy if exists "Manage own goals" on public.business_goals;
create policy "Manage own goals" on public.business_goals for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- 4.25 Analytics policies
drop policy if exists "Insert own analytics" on public.analytics;
drop policy if exists "Read own analytics" on public.analytics;
create policy "Insert own analytics" on public.analytics for insert to authenticated with check (auth.uid() = teacher_id);
create policy "Read own analytics" on public.analytics for select to authenticated using (auth.uid() = teacher_id);

-- 4.26 Ranking policies (global read-only to show leaderboard, update via owner check)
drop policy if exists "Read all rankings" on public.ranking;
drop policy if exists "Update own ranking" on public.ranking;
create policy "Read all rankings" on public.ranking for select to authenticated using (true);
create policy "Update own ranking" on public.ranking for update to authenticated using (auth.uid() = teacher_id);

-- 4.27 Achievements policies (global read-only)
drop policy if exists "Read all achievements" on public.achievements;
create policy "Read all achievements" on public.achievements for select to authenticated using (true);

-- 4.28 Teacher Achievements policies
drop policy if exists "Read all teacher achievements" on public.teacher_achievements;
drop policy if exists "Manage own achievements" on public.teacher_achievements;
create policy "Read all teacher achievements" on public.teacher_achievements for select to authenticated using (true);
create policy "Manage own achievements" on public.teacher_achievements for all to authenticated using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- =========================================================================
-- 5. SEED DATA FOR STATIC/CONFIG TABLES (PRIORITIES, ACHIEVEMENTS)
-- =========================================================================

-- Seed Priorities
insert into public.priorities (name, color, level)
values 
  ('low', '#94A3B8', 1),
  ('medium', '#F59E0B', 2),
  ('high', '#EF4444', 3)
on conflict (name) do update
set color = excluded.color, level = excluded.level;

-- Seed Achievements
insert into public.achievements (name, description, badge_url, points)
values 
  ('First Step', 'Created your profile and started onboarding.', 'onboarding_badge.png', 10),
  ('First Student', 'Added your first student to the hub.', 'student_badge.png', 20),
  ('Class Master', 'Delivered your first scheduled language class.', 'class_badge.png', 30),
  ('Invoice Sender', 'Issued your first payment invoice.', 'invoice_badge.png', 20),
  ('Discussion Starter', 'Created a community post in the forum.', 'forum_badge.png', 15)
on conflict (name) do update
set description = excluded.description, badge_url = excluded.badge_url, points = excluded.points;

-- =========================================================================
-- 6. CREATE INDEXES FOR CRITICAL SCENARIOS
-- =========================================================================
create index if not exists idx_students_teacher_status on public.students (teacher_id, status);
create index if not exists idx_student_schedules_student_id on public.student_schedules(student_id);
create index if not exists idx_student_schedules_teacher_id on public.student_schedules(teacher_id);
create index if not exists idx_student_schedules_weekday on public.student_schedules(weekday);

-- 6.2 student_schedules updated_at trigger
create or replace function public.set_updated_at_student_schedules()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_student_schedules_trigger on public.student_schedules;
create trigger set_updated_at_student_schedules_trigger
  before update on public.student_schedules
  for each row
  execute function public.set_updated_at_student_schedules();
create index if not exists idx_leads_teacher_stage on public.leads (teacher_id, stage);
create index if not exists idx_calendar_events_teacher_date on public.calendar_events (teacher_id, date);
create index if not exists idx_calendar_events_student_date on public.calendar_events (student_id, date);
create index if not exists idx_invoices_teacher_status on public.invoices (teacher_id, status);
create index if not exists idx_invoices_student on public.invoices (student_id);
create index if not exists idx_tasks_teacher_status on public.tasks (teacher_id, status);
create index if not exists idx_resources_teacher_folder on public.resources (teacher_id, folder_id);
create index if not exists idx_community_posts_created_at on public.community_posts (created_at desc);
create index if not exists idx_comments_post_created_at on public.comments (post_id, created_at);
