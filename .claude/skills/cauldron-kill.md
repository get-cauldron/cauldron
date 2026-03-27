# /cauldron:kill

Abort a stuck or misbehaving bead. Marks it as failed.

## Usage
1. Health check: `pnpm exec tsx packages/cli/src/cli.ts health`
   - If this fails, run `docker compose up -d` and retry
2. Run: `pnpm exec tsx packages/cli/src/cli.ts kill <BEAD_ID>`
3. Confirms the bead was marked as failed

## Next Steps
- Run /cauldron:execute --resume to re-dispatch remaining beads
- Run /cauldron:status to see updated bead states
