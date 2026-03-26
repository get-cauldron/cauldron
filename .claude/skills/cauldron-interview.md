# /cauldron:interview

Start or resume a Socratic interview for a project. Reads .planning/ artifacts as prior context to avoid re-asking decided questions.

## Usage
1. Health check: `pnpm exec tsx packages/api/src/cli.ts health`
   - If this fails, run `docker compose up -d` and retry
2. Run: `pnpm exec tsx packages/api/src/cli.ts interview --project-id <PROJECT_ID> --project-root <PATH>`
   - Add `--phase <PHASE_ID>` to scope context reading to a specific phase
3. Answer questions interactively until the ambiguity score reaches <= 0.2
4. When the interview reaches the reviewing phase, a seed draft is written to .cauldron/review/

## Next Steps
- Review the seed draft file in .cauldron/review/seed-draft-{projectId}.json
- Edit if needed, then run /cauldron:crystallize
