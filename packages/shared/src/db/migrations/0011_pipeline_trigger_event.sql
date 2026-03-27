-- Migration: add pipeline_trigger to event_type enum
-- Breakpoints: true

ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'pipeline_trigger';
