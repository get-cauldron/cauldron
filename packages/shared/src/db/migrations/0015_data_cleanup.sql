-- Migration 0015: Data cleanup before adding uniqueness constraints
-- Dedup event sequences: keep the row with the earliest UUID per (project_id, sequence_number)
DELETE FROM events
WHERE id NOT IN (
  SELECT DISTINCT ON (project_id, sequence_number)
    id
  FROM events
  ORDER BY project_id, sequence_number, id
);

-- Dedup seed versions: keep the row with the earliest UUID per (parent_id, version) where parent_id IS NOT NULL
DELETE FROM seeds
WHERE parent_id IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (parent_id, version)
      id
    FROM seeds
    WHERE parent_id IS NOT NULL
    ORDER BY parent_id, version, id
  );
