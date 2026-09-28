-- ==============================================================================
-- Supabase Schema: Conversion History with Strict FIFO Rotation (Max 5 records)
-- Database Agent: konchewa-backend-agent
-- ==============================================================================

-- Enable pgcrypto for gen_random_uuid() if not already available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Table: conversion_history
CREATE TABLE IF NOT EXISTS conversion_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name TEXT NOT NULL,
    conversion_type TEXT NOT NULL CHECK (conversion_type IN ('heightmap', 'svg')),
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    stl_size_bytes INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index on created_at for fast descending ordering
CREATE INDEX IF NOT EXISTS idx_conversion_history_created_at 
ON conversion_history (created_at DESC);

-- 2. Trigger Function: fn_limit_history_fifo
-- Enforces strict FIFO rotation: at any time, only the 5 most recent records
-- (ordered by created_at DESC) are retained. Any older records are deleted atomically.
CREATE OR REPLACE FUNCTION fn_limit_history_fifo()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM conversion_history
    WHERE id NOT IN (
        SELECT id FROM conversion_history ORDER BY created_at DESC LIMIT 5
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger: trg_limit_history_fifo
-- Fires AFTER INSERT to atomically prune old history entries
DROP TRIGGER IF EXISTS trg_limit_history_fifo ON conversion_history;
CREATE TRIGGER trg_limit_history_fifo
AFTER INSERT ON conversion_history
FOR EACH STATEMENT
EXECUTE FUNCTION fn_limit_history_fifo();

-- 4. Row Level Security (RLS) Configuration for Supabase
ALTER TABLE conversion_history ENABLE ROW LEVEL SECURITY;

-- Allow public / anonymous and authenticated access for local and mobile app use
DROP POLICY IF EXISTS "Allow read access to conversion_history" ON conversion_history;
CREATE POLICY "Allow read access to conversion_history"
ON conversion_history
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow insert access to conversion_history" ON conversion_history;
CREATE POLICY "Allow insert access to conversion_history"
ON conversion_history
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete access to conversion_history" ON conversion_history;
CREATE POLICY "Allow delete access to conversion_history"
ON conversion_history
FOR DELETE
TO anon, authenticated
USING (true);
