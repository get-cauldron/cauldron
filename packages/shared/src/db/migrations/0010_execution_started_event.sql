-- Migration: add execution_started to event_type enum
-- Breakpoints: true

ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'execution_started';
