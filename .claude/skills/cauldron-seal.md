# /cauldron:seal

Generate, review, and seal holdout tests. Two-step process: generate scenarios, then seal after review.

## Usage

### Step 1: Generate holdout scenarios
1. Health check: `pnpm exec tsx packages/api/src/cli.ts health`
2. Run: `pnpm exec tsx packages/api/src/cli.ts seal --seed-id <SEED_ID> --generate`
3. Review the holdout draft at .cauldron/review/holdout-draft-{seedId}.json
4. Set `approved: false` on any scenarios to reject

### Step 2: Seal the vault
1. Run: `pnpm exec tsx packages/api/src/cli.ts seal --seed-id <SEED_ID>`
2. Approved scenarios are encrypted and sealed

## Next Steps
- Run /cauldron:decompose --project-id <PROJECT_ID> to decompose the seed
