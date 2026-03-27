# /cauldron:crystallize

Finalize a seed from the reviewed draft file. The seed becomes immutable after crystallization.

## Usage
1. Health check: `pnpm exec tsx packages/cli/src/cli.ts health`
   - If this fails, run `docker compose up -d` and retry
2. Ensure a seed draft exists at .cauldron/review/seed-draft-{projectId}.json (created by /cauldron:interview)
3. Run: `pnpm exec tsx packages/cli/src/cli.ts crystallize --project-id <PROJECT_ID>`
4. On success, prints the crystallized seed ID

## Next Steps
- Run /cauldron:seal --seed-id <SEED_ID> --generate to create holdout tests
- Or skip holdouts and go directly to /cauldron:decompose --project-id <PROJECT_ID>
