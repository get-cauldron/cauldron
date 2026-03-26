/**
 * Automated interview runner for testing/dogfooding.
 *
 * Runs the InterviewFSM directly (not via CLI stdin) with predefined answers,
 * allowing the interview to converge without interactive input.
 */
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

// Load env vars
dotenvConfig({ path: resolve(homedir(), '.env') });

// Strip stray quotes
for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'HOLDOUT_ENCRYPTION_KEY']) {
  const val = process.env[key];
  if (val) {
    process.env[key] = val.replace(/^"|"$/g, '');
  }
}

import { db, ensureMigrations } from '@cauldron/shared';
import { loadConfig, LLMGateway, InterviewFSM } from '@cauldron/engine';
import { writeSeedDraft } from '../packages/api/src/review/seed-writer.js';
import pino from 'pino';

const PROJECT_ROOT = resolve(homedir(), 'Projects/cli-renamer-fixture');
const CAULDRON_ROOT = resolve(homedir(), 'Code/cauldron');
const PROJECT_ID = process.argv[2] ?? '19f16539-9bd0-4ef9-a9c9-2528e5673247';

// Predefined answers for the CLI renamer project
const ANSWERS = [
  // Answer to "what's the core thing" / goal questions
  'A CLI tool that recursively renames files by replacing a pattern in filenames. Given a directory, a find pattern, and a replace string, it renames matching files by substituting the pattern in the filename.',
  // Constraints
  'TypeScript, Node.js built-ins only (no external npm dependencies), Unix/macOS, must support --dry-run flag for previewing changes without applying them.',
  // Success criteria / acceptance criteria
  'Accepts --dir (target directory), --find (pattern to search in filename), --replace (replacement string), --dry-run (preview only) flags. Prints "old -> new" for each rename. Prints summary: "N files renamed" (or "N files would be renamed" in dry-run). Exits 0 on success, 1 on error.',
  // Edge cases / error handling
  'Handle: missing --dir exits with error; --dir does not exist exits with error; no matching files prints "0 files renamed" and exits 0; files with same renamed target (conflict) — skip with warning; permission errors — skip with warning.',
  // Performance and additional details
  'Works recursively through all subdirectories by default. Handles filenames with spaces and special characters. The tool should be runnable via: node dist/index.js --dir ./path --find old --replace new. TypeScript source compiled to dist/.',
  // Fallback in case more turns are needed
  'No web interface, no database, no configuration file needed. Pure CLI tool, zero runtime dependencies, ships as compiled JavaScript. The dry-run output is identical to real output but prefixed with "[dry-run]".',
  'Exit code 0 for success (including 0 matches found), exit code 1 for invalid arguments or unrecoverable errors. Verbose output shows each file rename as it happens.',
  'The rename operation is atomic per-file (rename syscall). No partial renames if interrupted. Alphabetical processing order for deterministic output.',
];

async function main() {
  console.log(`Running automated interview for project: ${PROJECT_ID}`);
  console.log(`Project root: ${PROJECT_ROOT}`);

  await ensureMigrations();

  const config = await loadConfig(CAULDRON_ROOT);
  const logger = pino({ level: 'error' });
  const gateway = await LLMGateway.create({ db, config, logger, validateKeys: true });

  const fsm = new InterviewFSM(db, gateway, config, logger);

  // Start or resume the interview
  const interview = await fsm.startOrResume(PROJECT_ID, { mode: 'greenfield', projectPath: PROJECT_ROOT });
  console.log(`Interview ID: ${interview.id}, Phase: ${interview.phase}`);

  // If interview already in reviewing phase, skip to summary generation
  if (interview.phase === 'reviewing') {
    console.log('Interview already in reviewing phase — skipping to summary generation.');
  } else {
    // Submit opening answer
    let result = await fsm.submitAnswer(interview.id, PROJECT_ID, {
      userAnswer: 'Hello, I would like to build a new project: a CLI file renamer tool.',
    });

    let turnCount = 0;
    console.log(`\nTurn 0 - Clarity: ${(result.scores.overall * 100).toFixed(0)}%`);
    console.log(`  Scores: goal=${(result.scores.goalClarity * 100).toFixed(0)}% constraint=${(result.scores.constraintClarity * 100).toFixed(0)}% criteria=${(result.scores.successCriteriaClarity * 100).toFixed(0)}%`);

    if (result.thresholdMet) {
      console.log('Threshold met on opening!');
    } else if (result.nextQuestion) {
      console.log(`  Next question [${result.nextQuestion.selectedCandidate.perspective}]: ${result.nextQuestion.selectedCandidate.question.substring(0, 100)}...`);
    }

    // Loop until threshold met or answers exhausted
    while (!result.thresholdMet && turnCount < ANSWERS.length) {
      const answer = ANSWERS[turnCount];
      console.log(`\nSubmitting answer ${turnCount + 1}: ${answer.substring(0, 80)}...`);

      result = await fsm.submitAnswer(interview.id, PROJECT_ID, { userAnswer: answer });
      turnCount++;

      const scorePercent = (result.scores.overall * 100).toFixed(0);
      console.log(`  Clarity: ${scorePercent}% (goal=${(result.scores.goalClarity * 100).toFixed(0)}% constraint=${(result.scores.constraintClarity * 100).toFixed(0)}% criteria=${(result.scores.successCriteriaClarity * 100).toFixed(0)}%)`);

      if (result.thresholdMet) {
        console.log(`\nThreshold met after ${turnCount} turns! Score: ${scorePercent}%`);
        break;
      }

      if (result.nextQuestion) {
        console.log(`  Next question [${result.nextQuestion.selectedCandidate.perspective}]: ${result.nextQuestion.selectedCandidate.question.substring(0, 100)}...`);
      }
    }

    if (!result.thresholdMet) {
      console.log(`\nWarning: Threshold not met after ${turnCount} turns. Final score: ${(result.scores.overall * 100).toFixed(0)}%`);
      console.log('Proceeding to generate summary anyway...');
    }
  }

  // Generate seed summary
  console.log('\nGenerating seed summary...');
  const summary = await fsm.generateSummary(interview.id, PROJECT_ID);

  // Write seed draft
  const draftPath = await writeSeedDraft(PROJECT_ROOT, PROJECT_ID, summary);
  console.log(`\nSeed draft written to: ${draftPath}`);
  console.log(`Interview ID: ${interview.id}`);
  console.log(`Final score: ${(result.scores.overall * 100).toFixed(0)}%`);
  console.log(`Turns taken: ${turnCount}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
