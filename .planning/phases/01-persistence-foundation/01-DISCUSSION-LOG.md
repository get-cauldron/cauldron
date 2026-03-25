# Phase 1: Persistence Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 01-persistence-foundation
**Areas discussed:** Schema design, Event sourcing, Monorepo layout, Dev environment

---

## Schema Design

### Seed Storage
| Option | Description | Selected |
|--------|-------------|----------|
| Structured columns | Decompose seed fields into typed columns. Queryable, validates at DB level. | ✓ |
| JSONB blob | Store entire seed as JSONB. Flexible but harder to query. | |
| Hybrid | Key fields as columns, full YAML as JSONB alongside. | |

**User's choice:** Structured columns
**Notes:** None

### DAG Edge Modeling
| Option | Description | Selected |
|--------|-------------|----------|
| Edge table | Separate BeadEdge table with (from, to, type). Standard graph-in-RDBMS. | ✓ |
| Adjacency in bead row | depends_on JSONB array in each bead row. | |
| You decide | Claude picks. | |

**User's choice:** Edge table
**Notes:** None

### Evolution Lineage
| Option | Description | Selected |
|--------|-------------|----------|
| parent_id only | Simple FK on seed table. Recursive CTE when needed. | ✓ |
| Closure table | Separate table with (ancestor, descendant, depth). O(1) queries. | |
| You decide | Claude picks. | |

**User's choice:** parent_id only
**Notes:** None

### Holdout Storage
| Option | Description | Selected |
|--------|-------------|----------|
| DB blob | Encrypted ciphertext in holdout_vault table. | ✓ |
| Filesystem | Encrypted files on disk, DB tracks paths. | |
| You decide | Claude picks. | |

**User's choice:** DB blob
**Notes:** None

---

## Event Sourcing

### ES Strictness
| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid | Events append-only + materialized views for queries. | ✓ |
| Pure event sourcing | All state derived by replay. No read models. | |
| Events as audit log | Traditional CRUD + events for observability. | |

**User's choice:** Hybrid
**Notes:** None

### Event Scope
| Option | Description | Selected |
|--------|-------------|----------|
| Pipeline milestones | ~15-20 event types for key pipeline moments. | ✓ |
| Everything | Every agent action, LLM call, file write. | |
| You decide | Claude picks. | |

**User's choice:** Pipeline milestones
**Notes:** None

### Snapshotting
| Option | Description | Selected |
|--------|-------------|----------|
| Not in v1 | Event streams short enough for fast replay. | |
| Build it now | Periodic snapshots from day one. | ✓ |
| You decide | Claude picks. | |

**User's choice:** Build it now
**Notes:** User wants the pattern established early for future scale, even though v1 volumes are low.

---

## Monorepo Layout

### Package Split
| Option | Description | Selected |
|--------|-------------|----------|
| 4-package split | web, api, engine, shared | ✓ |
| 3-package split | web, server (api+engine), shared | |
| You decide | Claude picks. | |

**User's choice:** 4-package split
**Notes:** None

### Shared Types Strategy
| Option | Description | Selected |
|--------|-------------|----------|
| Drizzle schema as source | DB schema generates TS types. Single source of truth. | ✓ |
| Zod schemas as source | Zod defines domain types, Drizzle derived from Zod. | |
| You decide | Claude picks. | |

**User's choice:** Drizzle schema as source
**Notes:** None

### Inngest Worker Location
| Option | Description | Selected |
|--------|-------------|----------|
| In engine package | Inngest functions in packages/engine. Separate process. | ✓ |
| In api package | Co-located with tRPC routes. One process. | |
| You decide | Claude picks. | |

**User's choice:** In engine package
**Notes:** None

---

## Dev Environment

### Docker Scope
| Option | Description | Selected |
|--------|-------------|----------|
| Services only | Docker runs PG/Redis/Inngest. App runs natively. | |
| Everything containerized | Docker runs all services AND app code. | ✓ |
| You decide | Claude picks. | |

**User's choice:** Everything containerized
**Notes:** User wants consistent environment across machines despite slower iteration.

### Test Data
| Option | Description | Selected |
|--------|-------------|----------|
| Seed scripts | TypeScript scripts via pnpm db:seed. Deterministic. | ✓ |
| Migration fixtures | Test data in Drizzle migrations. | |
| You decide | Claude picks. | |

**User's choice:** Seed scripts
**Notes:** None

---

## Claude's Discretion

- Table/column naming conventions
- Drizzle migration organization
- Docker Compose service naming
- Vitest configuration
- ESLint/Prettier/TypeScript config

## Deferred Ideas

None — discussion stayed within phase scope
