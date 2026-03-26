# /cauldron:resolve

Resolve a merge conflict for a bead. The conflict file is at .cauldron/review/conflict-{beadId}.diff.

## Usage
1. Health check: `pnpm exec tsx packages/api/src/cli.ts health`
   - If this fails, run `docker compose up -d` and retry
2. Find the conflict file: .cauldron/review/conflict-{beadId}.diff
3. Edit the file to resolve conflicts
4. Run: `pnpm exec tsx packages/api/src/cli.ts resolve <BEAD_ID>`
5. The bead will be re-queued for merge

## Next Steps
- Run /cauldron:status to verify the bead is back in the merge queue
