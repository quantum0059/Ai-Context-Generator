-- ContextForge Database Schema
-- Run this SQL in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Context packages table
create table if not exists context_packages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  spec_id text not null,
  project_name text not null,
  spec jsonb not null,
  package_version text not null,
  project_spec_version text not null,
  generated_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Subscriptions table
create table if not exists subscriptions (
  user_id text primary key,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null,
  created_at timestamptz not null default now()
);

-- Processed Stripe webhook events (idempotency / replay protection).
-- The webhook handler records every event id it has applied so Stripe's
-- at-least-once redelivery cannot double-apply a subscription change.
create table if not exists processed_stripe_events (
  event_id text primary key,
  event_type text not null,
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_context_packages_user_id on context_packages(user_id);
create index if not exists idx_context_packages_created_at on context_packages(created_at);
create index if not exists idx_subscriptions_status on subscriptions(status);

-- Row Level Security (RLS) policies
alter table context_packages enable row level security;
alter table subscriptions enable row level security;

-- processed_stripe_events is written only by the server (service role) from the
-- Stripe webhook and is never read by end users, so RLS stays enabled with no
-- public policy (deny-by-default for anon/authenticated clients).
alter table processed_stripe_events enable row level security;

-- Users can only see their own packages
create policy "Users can view own packages"
  on context_packages for select
  using (auth.uid()::text = user_id);

-- Users can only insert their own packages
create policy "Users can insert own packages"
  on context_packages for insert
  with check (auth.uid()::text = user_id);

-- Users can only delete their own packages
create policy "Users can delete own packages"
  on context_packages for delete
  using (auth.uid()::text = user_id);

-- Users can only see their own subscriptions
create policy "Users can view own subscriptions"
  on subscriptions for select
  using (auth.uid()::text = user_id);

-- Users can only insert their own subscriptions
create policy "Users can insert own subscriptions"
  on subscriptions for insert
  with check (auth.uid()::text = user_id);

-- Users can only update their own subscriptions
create policy "Users can update own subscriptions"
  on subscriptions for update
  using (auth.uid()::text = user_id);

-- Git connections table
create table if not exists git_connections (
  user_id text not null,
  provider text not null check (provider in ('github', 'gitlab')),
  provider_user_id text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  primary key (user_id, provider)
);

-- Repository pushes table
create table if not exists repository_pushes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  provider text not null check (provider in ('github', 'gitlab')),
  spec_id text not null,
  repository_id text not null,
  repository_name text not null,
  branch_name text not null,
  pr_url text,
  status text not null check (status in ('success', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_git_connections_user_id on git_connections(user_id);
create index if not exists idx_repository_pushes_user_id on repository_pushes(user_id);
create index if not exists idx_repository_pushes_created_at on repository_pushes(created_at);

-- Row Level Security (RLS) policies for Git integration
alter table git_connections enable row level security;
alter table repository_pushes enable row level security;

-- Users can only see their own git connections
create policy "Users can view own git connections"
  on git_connections for select
  using (auth.uid()::text = user_id);

-- Users can only insert their own git connections
create policy "Users can insert own git connections"
  on git_connections for insert
  with check (auth.uid()::text = user_id);

-- Users can only update their own git connections
create policy "Users can update own git connections"
  on git_connections for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- Users can only delete their own git connections
create policy "Users can delete own git connections"
  on git_connections for delete
  using (auth.uid()::text = user_id);

-- Users can only see their own repository pushes
create policy "Users can view own repository pushes"
  on repository_pushes for select
  using (auth.uid()::text = user_id);

-- Users can only insert their own repository pushes
create policy "Users can insert own repository pushes"
  on repository_pushes for insert
  with check (auth.uid()::text = user_id);

-- Users can only update their own repository pushes
create policy "Users can update own repository pushes"
  on repository_pushes for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- Users can only delete their own repository pushes
create policy "Users can delete own repository pushes"
  on repository_pushes for delete
  using (auth.uid()::text = user_id);

