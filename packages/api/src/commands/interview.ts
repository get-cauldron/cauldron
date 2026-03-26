import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { bootstrap } from '../bootstrap.js';
import { readPlanningArtifacts } from '../context-bridge.js';
import { writeSeedDraft } from '../review/seed-writer.js';
import { InterviewFSM } from '@cauldron/engine';

/**
 * Interview command — starts or resumes a Socratic interview session (D-06, D-07).
 *
 * GSD bridging (D-07): reads .planning/ artifacts and injects them as prior context
 * before the FSM starts asking questions.
 *
 * Usage: cauldron interview --project-id <id> [--project-root <path>] [--phase <id>]
 */
export async function interviewCommand(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(3), // skip 'node', 'cli.ts', 'interview'
    options: {
      'project-id': { type: 'string' },
      'project-root': { type: 'string' },
      phase: { type: 'string' },
    },
    allowPositionals: false,
    strict: false,
  });

  const projectId = values['project-id'] as string | undefined;
  const projectRoot = (values['project-root'] as string | undefined) ?? process.cwd();
  const phase = values['phase'] as string | undefined;

  if (!projectId) {
    console.error('Error: --project-id is required');
    console.error('Usage: cauldron interview --project-id <id> [--project-root <path>] [--phase <id>]');
    process.exit(1);
  }

  // Bootstrap all engine dependencies
  const deps = await bootstrap(projectRoot);

  // D-07: Read GSD planning artifacts for prior context
  const priorContext = await readPlanningArtifacts(projectRoot, phase);

  // D-04: Use brownfield mode when prior context exists (project has prior decisions)
  const mode = priorContext ? 'brownfield' : 'greenfield';

  // Create and start the interview FSM
  const fsm = new InterviewFSM(deps.db, deps.gateway, deps.config, deps.logger);
  const interview = await fsm.startOrResume(projectId, { mode, projectPath: projectRoot });

  deps.logger.info({ projectId, interviewId: interview.id, mode }, 'Interview started/resumed');

  // Set up readline for interactive input
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (prompt: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });

  console.log('\nCauldron Socratic Interview');
  console.log('===========================');
  if (priorContext) {
    console.log('Prior GSD planning context loaded. Starting in brownfield mode.');
  }

  // Generate the first question before entering the loop
  console.log('\nGenerating first question...');
  const openingResult = await fsm.submitAnswer(interview.id, projectId, {
    userAnswer: priorContext
      ? `[Prior context from .planning/]\n${priorContext}\n\n[User answer]\nHello, I'd like to build this project.`
      : 'Hello, I would like to build a new project.',
  });

  let phase_status = interview.phase;

  if (openingResult.thresholdMet) {
    console.log('\nAmbiguity threshold already met from prior context! Transitioning to review...');
    phase_status = 'reviewing';
  } else if (openingResult.nextQuestion) {
    const q = openingResult.nextQuestion;
    const scorePercent = (openingResult.scores.overall * 100).toFixed(0);
    console.log(`\nClarity score: ${scorePercent}% (threshold: 80%)\n`);
    console.log(`[${q.selectedCandidate.perspective}] ${q.selectedCandidate.question}`);
    if (q.mcOptions.length > 0) {
      console.log('\nOptions:');
      q.mcOptions.forEach((opt: string, i: number) => {
        console.log(`  ${i + 1}. ${opt}`);
      });
      console.log('  (or type a custom answer)');
    }
  }

  // Interview turn loop
  while (phase_status === 'gathering') {
    const userAnswer = await askQuestion('\nYour answer: ');

    const result = await fsm.submitAnswer(interview.id, projectId, {
      userAnswer,
    });

    // Display score progress
    const score = result.scores.overall;
    const scorePercent = (score * 100).toFixed(0);
    console.log(`\nClarity score: ${scorePercent}% (threshold: 80%)`);

    if (result.thresholdMet) {
      console.log('\nAmbiguity threshold met! Transitioning to review...');
      phase_status = 'reviewing';
    } else if (result.nextQuestion) {
      const q = result.nextQuestion;
      console.log(`\n[${q.selectedCandidate.perspective}] ${q.selectedCandidate.question}`);
      if (q.mcOptions.length > 0) {
        console.log('\nOptions:');
        q.mcOptions.forEach((opt: string, i: number) => {
          console.log(`  ${i + 1}. ${opt}`);
        });
        console.log('  (or type a custom answer)');
      }
    } else {
      // No next question and threshold not met — shouldn't happen, but exit gracefully
      phase_status = 'reviewing';
    }
  }

  rl.close();

  // Generate seed summary
  console.log('\nGenerating seed summary...');
  const summary = await fsm.generateSummary(interview.id, projectId);

  // Write seed draft file for review
  const draftPath = await writeSeedDraft(projectRoot, projectId, summary);

  console.log(`\nSeed draft written to: ${draftPath}`);
  console.log(`Review and edit the file, then run:`);
  console.log(`  pnpm exec tsx packages/api/src/cli.ts crystallize --project-id ${projectId}`);

  process.exit(0);
}
