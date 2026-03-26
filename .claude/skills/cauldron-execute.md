# /cauldron:execute

Start the Inngest execution engine. Dispatches ready beads for parallel agent execution. This is a long-running process.

## Usage
1. Health check: `pnpm exec tsx packages/api/src/cli.ts health`
   - If this fails, run `docker compose up -d` and retry
2. Run: `pnpm exec tsx packages/api/src/cli.ts execute --project-id <PROJECT_ID>`
   - Add `--resume` to re-dispatch failed/pending beads without restarting from scratch
   - Add `--seed-id <SEED_ID>` to target a specific seed
3. The process stays alive while beads execute. Monitor with /cauldron:status in another terminal.
4. Ctrl-C to stop.

## Next Steps
- Monitor progress: /cauldron:status --seed-id <SEED_ID>
- If a bead is stuck: /cauldron:kill <bead-id>
- If execution was interrupted: /cauldron:execute --resume
