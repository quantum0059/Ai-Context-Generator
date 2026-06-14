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

-- Indexes for performance
create index if not exists idx_context_packages_user_id on context_packages(user_id);
create index if not exists idx_context_packages_created_at on context_packages(created_at);
create index if not exists idx_subscriptions_status on subscriptions(status);

-- Row Level Security (RLS) policies
alter table context_packages enable row level security;
alter table subscriptions enable row level security;

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
