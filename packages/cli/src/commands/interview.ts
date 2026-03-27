import { createInterface } from 'node:readline';
import chalk from 'chalk';
import type { CLIClient } from '../trpc-client.js';
import { createSpinner, colorStatus, formatJson } from '../output.js';

interface Flags {
  json: boolean;
  projectId?: string;
}

/**
 * Interview command — starts or resumes a Socratic interview session (D-06, D-07).
 *
 * Uses tRPC client exclusively — no direct engine imports.
 *
 * Usage: cauldron interview --project <id> [--browser] [--json]
 */
export async function interviewCommand(
  client: CLIClient,
  args: string[],
  flags: Flags
): Promise<void> {
  const projectId = flags.projectId;
  const browserMode = args.includes('--browser');

  if (!projectId) {
    console.error(chalk.red('Error: --project <id> is required (or set CAULDRON_PROJECT_ID)'));
    process.exit(1);
    return;
  }

  if (browserMode) {
    const { execSync } = await import('node:child_process');
    const url = `http://localhost:3000/projects/${projectId}/interview`;
    console.log(chalk.cyan('Opening interview in browser:'), url);
    try {
      execSync(`open "${url}"`);
    } catch {
      console.log(chalk.gray('Could not auto-open browser. Visit:'), url);
    }
    return;
  }

  // Get current transcript/state
  const spinner = createSpinner('Loading interview state...').start();
  let state;
  try {
    state = await client.interview.getTranscript.query({ projectId });
    spinner.stop();
  } catch (err) {
    spinner.fail('Failed to load interview state');
    throw err;
  }

  if (flags.json) {
    console.log(formatJson(state));
    return;
  }

  console.log(chalk.cyan('\nCauldron Socratic Interview'));
  console.log(chalk.gray('==========================='));
  console.log(chalk.gray(`Status: ${colorStatus(state.status ?? 'gathering')}`));

  // If already past gathering phase, show summary
  if (state.phase !== 'gathering') {
    console.log(chalk.yellow(`\nInterview is in "${state.phase}" phase.`));
    if (state.phase === 'reviewing') {
      console.log(chalk.gray('Run: cauldron crystallize to finalize the seed.'));
    }
    return;
  }

  // Display current scores if available
  if (state.currentScores) {
    const score = (state.currentScores.overall * 100).toFixed(0);
    console.log(chalk.gray(`Clarity: ${score}% (threshold: 80%)\n`));
  }

  // Get transcript to display last question context
  const transcript = state.transcript;
  if (Array.isArray(transcript) && transcript.length > 0) {
    const lastEntry = transcript[transcript.length - 1];
    if (lastEntry && typeof lastEntry === 'object' && 'question' in lastEntry) {
      const q = lastEntry as { question: string; perspective?: string; mcOptions?: string[] };
      if (q.perspective) {
        console.log(chalk.cyan(`[${q.perspective}]`), chalk.white(q.question));
      } else {
        console.log(chalk.white(q.question));
      }
      if (Array.isArray(q.mcOptions) && q.mcOptions.length > 0) {
        console.log(chalk.gray('\nOptions:'));
        q.mcOptions.forEach((opt: string, i: number) => {
          console.log(chalk.gray(`  ${i + 1}.`), opt);
        });
        console.log(chalk.gray('  (or type a custom answer)'));
      }
    }
  }

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

  // Interview turn loop
  let currentPhase: string = state.phase;
  while (currentPhase === 'gathering') {
    const userAnswer = await askQuestion(chalk.cyan('\nYour answer: '));

    const answerSpinner = createSpinner('Processing answer...').start();
    let result;
    try {
      result = await client.interview.sendAnswer.mutate({ projectId, answer: userAnswer });
      answerSpinner.stop();
    } catch (err) {
      answerSpinner.fail('Failed to send answer');
      rl.close();
      throw err;
    }

    // Display score progress
    const score = ((result.currentScores?.overall ?? 0) * 100).toFixed(0);
    console.log(chalk.gray(`\nClarity: ${score}% (threshold: 80%)`));

    if (result.thresholdMet) {
      console.log(chalk.green('\nAmbiguity threshold met! Transitioning to review...'));
      currentPhase = 'reviewing';
    } else {
      // Get updated transcript for next question
      const updatedState = await client.interview.getTranscript.query({ projectId });
      currentPhase = updatedState.phase;

      if (currentPhase === 'gathering') {
        // Display next question from transcript
        const updatedTranscript = updatedState.transcript;
        if (Array.isArray(updatedTranscript) && updatedTranscript.length > 0) {
          const lastEntry = updatedTranscript[updatedTranscript.length - 1];
          if (lastEntry && typeof lastEntry === 'object' && 'question' in lastEntry) {
            const q = lastEntry as { question: string; perspective?: string; mcOptions?: string[] };
            console.log('');
            if (q.perspective) {
              console.log(chalk.cyan(`[${q.perspective}]`), chalk.white(q.question));
            } else {
              console.log(chalk.white(q.question));
            }
            if (Array.isArray(q.mcOptions) && q.mcOptions.length > 0) {
              console.log(chalk.gray('\nOptions:'));
              q.mcOptions.forEach((opt: string, i: number) => {
                console.log(chalk.gray(`  ${i + 1}.`), opt);
              });
              console.log(chalk.gray('  (or type a custom answer)'));
            }
          }
        }
      }
    }
  }

  rl.close();

  // Show summary after threshold met
  console.log(chalk.cyan('\nGenerating seed summary...'));
  const summarySpinner = createSpinner('Generating summary...').start();
  // eslint-disable-next-line prefer-const
  let summaryResult: { summary: unknown; phase: string; interviewId: string } | null = null;
  try {
    summaryResult = await client.interview.getSummary.query({ projectId }) as { summary: unknown; phase: string; interviewId: string };
    summarySpinner.succeed('Summary generated');
  } catch (err) {
    summarySpinner.fail('Failed to generate summary');
    throw err;
  }
  if (!summaryResult) return;

  const summaryText = typeof summaryResult.summary === 'string'
    ? summaryResult.summary
    : JSON.stringify(summaryResult.summary, null, 2);

  console.log(chalk.cyan('\nSeed Summary:'));
  console.log(chalk.gray('\u2500'.repeat(60)));
  console.log(summaryText);
  console.log(chalk.gray('\u2500'.repeat(60)));
  console.log(chalk.gray('\nReview the summary, then run:'));
  console.log(chalk.white(`  cauldron crystallize --project ${projectId}`));
}
