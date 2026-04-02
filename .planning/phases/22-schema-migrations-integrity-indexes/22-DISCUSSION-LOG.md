# Phase 22: Schema Migrations — Integrity Indexes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 22-Schema Migrations — Integrity Indexes
**Areas discussed:** Data cleanup, appendEvent fix, Migration strategy (all delegated to Claude)

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Data cleanup | How to handle existing duplicate sequences/versions before adding UNIQUE constraints | |
| appendEvent fix | DB-level sequence vs MAX()+1 with UNIQUE constraint retry | |
| Migration strategy | Single vs separate migrations per concern | |
| You decide all | Pure infrastructure — Claude has enough context | ✓ |

**User's choice:** You decide all
**Notes:** User confirmed this is pure infrastructure work and delegated all implementation decisions.

---

## Claude's Discretion

All four gray areas were delegated:
- Data cleanup: Two-phase migration (fix data first, then add constraints)
- appendEvent: Keep MAX()+1 with retry on UNIQUE violation
- Migration strategy: Two migrations (constraints + data cleanup, then indexes)
- Seed version: Partial unique index with WHERE parent_seed_id IS NOT NULL

## Deferred Ideas

None — discussion stayed within phase scope.
