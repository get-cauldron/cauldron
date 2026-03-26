# /cauldron:decompose

Decompose a crystallized seed into a molecule/bead DAG for parallel execution.

## Usage
1. Health check: `pnpm exec tsx packages/api/src/cli.ts health`
   - If this fails, run `docker compose up -d` and retry
2. Run: `pnpm exec tsx packages/api/src/cli.ts decompose --project-id <PROJECT_ID>`
   - Optionally: `--seed-id <SEED_ID>` to decompose a specific seed
3. Prints the number of beads created

## Next Steps
- Run /cauldron:execute --project-id <PROJECT_ID> to start bead execution
- Run /cauldron:status to view the bead DAG
