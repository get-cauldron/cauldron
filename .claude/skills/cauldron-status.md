# /cauldron:status

Show the current state of all beads for a seed.

## Usage
1. Health check: `pnpm exec tsx packages/cli/src/cli.ts health`
   - If this fails, run `docker compose up -d` and retry
2. Run: `pnpm exec tsx packages/cli/src/cli.ts status --seed-id <SEED_ID>`
   - Add `--logs` to tail recent events
3. Review the bead table: Title, Status, Agent, Duration
   - "NEEDS REVIEW" means a merge conflict needs resolution via /cauldron:resolve

## Next Steps
- If beads are failed: investigate with /cauldron:status --logs, then /cauldron:kill or /cauldron:execute --resume
- If NEEDS REVIEW: use /cauldron:resolve <bead-id>
