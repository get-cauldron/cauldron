/**
 * Live Pipeline E2E Test
 *
 * A single test that boots the full Cauldron stack and drives a URL shortener
 * project through the entire pipeline using real LLM calls.
 *
 * - Simulated user: Claude Haiku (Anthropic) — never same provider as interviewer
 * - Pipeline models: ultra-cheap (mistral-small-latest, gemini-2.5-flash)
 * - Infrastructure: self-contained Docker + dev servers
 *
 * Run: pnpm -F @get-cauldron/web test:live
 *
 * Prerequisites:
 * - API keys set: MISTRAL_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY
 * - Docker available
 * - Ports 3000, 3001, 5435, 6380, 8290 available
 */
import { test, expect } from '@playwright/test';
import { LiveInfra } from './helpers/live-infra';
import { getSimulatedAnswer, findMatchingChip } from './helpers/simulated-user';
import { ROUTES } from './helpers/routes';

// ────────────────────────────────────────────────────────────────────────────
// Configuration — swap models and project concept here
// ────────────────────────────────────────────────────────────────────────────

const LIVE_CONFIG = {
  project: {
    name: 'URL Shortener Library',
    description:
      'A TypeScript library with shorten(url) and expand(code) functions using an in-memory store',
  },

  simulatedUser: {
    model: 'claude-haiku-4-5',
    persona: `You are a developer who wants a URL shortener library in TypeScript.
Key requirements: shorten(url) returns a short code, expand(code) returns original URL,
in-memory Map storage, collision-resistant codes (nanoid or similar), input validation.
Answer concisely (1-3 sentences). If asked about constraints, mention: no external DB,
no HTTP server, just a pure library. If asked about success criteria, mention: unit tests
should cover round-trip shorten→expand, duplicate URLs, and invalid input.`,
  },

  models: {
    interview: ['mistral-small-latest'],
    holdout: ['gemini-2.5-flash'],
    implementation: ['mistral-small-latest'],
    evaluation: ['gemini-2.5-flash'],
    decomposition: ['mistral-small-latest'],
    context_assembly: ['mistral-small-latest'],
    conflict_resolution: ['mistral-small-latest'],
  },

  perspectiveModels: {
    'henry-wu': 'mistral-small-latest',
    occam: 'mistral-small-latest',
    'heist-o-tron': 'mistral-small-latest',
    hickam: 'mistral-small-latest',
    kirk: 'mistral-small-latest',
  },

  scoringModel: 'mistral-small-latest',

  timeouts: {
    interview: 5 * 60_000,
    crystallize: 5 * 60_000,
    holdouts: 3 * 60_000,
    decomposition: 3 * 60_000,
    execution: 15 * 60_000,
    evaluation: 5 * 60_000,
    evolution: 10 * 60_000,
  },

  budget: { limitCents: 1500 },
  maxInterviewTurns: 15,
};

// ────────────────────────────────────────────────────────────────────────────
// Pre-flight: skip if API keys are missing
// ────────────────────────────────────────────────────────────────────────────

const missingKeys = LiveInfra.checkApiKeys();
const SKIP = missingKeys.length > 0;
if (SKIP) {
  console.warn(
    `[pipeline-live] Skipping: missing API keys: ${missingKeys.join(', ')}`
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Test suite
// ────────────────────────────────────────────────────────────────────────────

test.describe('Live Pipeline E2E', () => {
  test.skip(() => SKIP, 'Requires API keys: MISTRAL, ANTHROPIC, GOOGLE');
  test.describe.configure({ mode: 'serial' });

  const infra = new LiveInfra({
    models: LIVE_CONFIG.models,
    budget: LIVE_CONFIG.budget,
    timeouts: LIVE_CONFIG.timeouts,
    perspectiveModels: LIVE_CONFIG.perspectiveModels,
    scoringModel: LIVE_CONFIG.scoringModel,
  });

  let projectId: string;
  let testFailed = false;

  test.beforeAll(async () => {
    await infra.start();
  });

  test.afterAll(async () => {
    await infra.stop(testFailed);
  });

  // ── Stage 1: Create Project ─────────────────────────────────────────────

  test('Stage 1: Create project via UI', async ({ page }) => {
    try {
      await page.goto(ROUTES.newProject);

      // Wait for Next.js to finish compiling before interacting
      await expect(page.getByText('Compiling')).toBeHidden({ timeout: 60_000 });

      // Fill in project name and description
      const nameInput = page.getByRole('textbox', { name: /project name/i });
      await expect(nameInput).toBeVisible({ timeout: 10_000 });
      await nameInput.fill(LIVE_CONFIG.project.name);

      const descInput = page.getByRole('textbox', { name: /description/i });
      await descInput.fill(LIVE_CONFIG.project.description);

      // Click create — retry if the server returns an error (dev mode compilation race)
      await expect(async () => {
        const errorText = page.getByText('is not valid JSON');
        if (await errorText.isVisible({ timeout: 500 }).catch(() => false)) {
          // Previous attempt returned HTML instead of JSON — retry
          console.log('[pipeline-live] Create returned HTML error, retrying...');
        }
        const createButton = page.getByRole('button', { name: /start building/i });
        await expect(createButton).toBeEnabled({ timeout: 3000 });
        await createButton.click();
        // Confirm redirect happened
        await page.waitForURL(/\/projects\/[\w-]+\/interview/, { timeout: 10_000 });
      }).toPass({ timeout: 30_000, intervals: [5_000] });

      // Extract project ID from URL
      const url = page.url();
      const match = url.match(/\/projects\/([\w-]+)\/interview/);
      expect(match).toBeTruthy();
      projectId = match![1];

      console.log(`[pipeline-live] Project created: ${projectId}`);
    } catch (err) {
      testFailed = true;
      throw err;
    }
  });

  // ── Stage 2: Interview Loop ─────────────────────────────────────────────

  test('Stage 2: Complete interview with simulated user', async ({ page }) => {
    try {
      expect(projectId).toBeTruthy();

      // Warm up the interview page — Next.js dev mode can 500 on first load
      // while routes are still compiling. Retry until the page loads cleanly.
      // Don't use networkidle — HMR websockets keep network busy indefinitely.
      await page.goto(ROUTES.interview(projectId));

      // Wait for Next.js compilation to finish (first load from cleared cache is slow)
      console.log('[pipeline-live] Waiting for page compilation...');
      await expect(page.getByText('Compiling')).toBeHidden({ timeout: 120_000 });

      // If the page shows a server error, reload and wait again
      await expect(async () => {
        const hasError = await page.getByText(/500|Internal Server Error|Unexpected end of JSON/i)
          .isVisible({ timeout: 2000 }).catch(() => false);
        if (hasError) {
          console.log('[pipeline-live] Interview page returned error — reloading...');
          await page.reload();
          await page.waitForTimeout(5000);
          throw new Error('Page not ready');
        }
        await expect(page.getByText('AMBIGUITY SCORE')).toBeVisible({ timeout: 15_000 });
      }).toPass({ timeout: 90_000, intervals: [10_000] });

      console.log('[pipeline-live] Interview page loaded cleanly');

      // Capture browser console errors for debugging
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          console.log(`[browser:error] ${msg.text()}`);
        }
      });
      page.on('pageerror', (err) => {
        console.log(`[browser:pageerror] ${err.message}`);
      });

      // Wait for the auto-start to create the interview.
      // The auto-start may complete before we can observe "Interview not started",
      // so we handle both cases: either we catch it appearing then disappearing,
      // or we confirm the interview is already active (gathering state visible).
      console.log('[pipeline-live] Waiting for interview to become active...');

      let readinessAttempts = 0;
      await expect(async () => {
        readinessAttempts++;
        // Interview is truly ready when ALL of these hold:
        // 1. "Interview not started" text is gone (auto-start completed)
        // 2. "gathering" phase is visible in the progress indicator
        // 3. Send button is enabled (interview exists in DB, input is wired)
        // 4. No Next.js compilation in progress
        //
        // In dev mode, HMR can leave the page in a bad state. If we've been
        // waiting a while, reload the page to re-trigger the auto-start effect.
        if (readinessAttempts > 0 && readinessAttempts % 10 === 0) {
          console.log(`[pipeline-live] Readiness stalled after ${readinessAttempts} attempts — reloading page...`);
          await page.reload();
          await page.waitForTimeout(3000);
        }

        const notStarted = page.getByText('Interview not started');
        const isNotStartedVisible = await notStarted.isVisible().catch(() => false);
        if (isNotStartedVisible) {
          console.log('[pipeline-live] Saw "Interview not started" — waiting for auto-start...');
          throw new Error('Interview not yet started');
        }

        const compiling = page.getByText('Compiling');
        const isCompiling = await compiling.isVisible().catch(() => false);
        if (isCompiling) {
          console.log('[pipeline-live] Next.js still compiling — waiting...');
          throw new Error('Still compiling');
        }

        const gathering = page.getByText('gathering');
        const isGathering = await gathering.isVisible().catch(() => false);
        if (!isGathering) {
          console.log('[pipeline-live] gathering not visible yet');
          throw new Error('Gathering not visible');
        }

        // Verify Send button exists (it's disabled when empty — that's correct)
        const sendBtn = page.getByRole('button', { name: /send answer/i });
        const isSendVisible = await sendBtn.isVisible().catch(() => false);
        if (!isSendVisible) {
          console.log('[pipeline-live] Send button not visible — interview input not rendered');
          throw new Error('Send button not visible');
        }

        console.log('[pipeline-live] gathering visible: true, send button visible: true');
      }).toPass({ timeout: 90_000, intervals: [2_000] });

      console.log('[pipeline-live] Interview active. Sending first message...');

      // Stabilization pause — let React settle after all conditions passed
      await page.waitForTimeout(2000);

      // Send the first message. This is the most fragile step due to dev mode races:
      // - React controlled inputs need native value setter
      // - Auto-start may not have completed
      // - sendAnswer can fail if interview doesn't exist yet
      // Strategy: retry with page reload on failure.
      await expect(async () => {
        // Ensure the input is visible and interactable
        const input = page.getByRole('textbox', { name: /interview answer input/i });
        const isInputVisible = await input.isVisible().catch(() => false);
        if (!isInputVisible) {
          console.log('[pipeline-live] Input not visible — reloading page...');
          await page.reload();
          await page.waitForTimeout(3000);
          throw new Error('Input not visible after reload');
        }

        // Use native value setter to trigger React onChange
        await input.evaluate((el: HTMLInputElement, text: string) => {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
          )!.set!;
          nativeInputValueSetter.call(el, text);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, LIVE_CONFIG.project.description);
        await page.waitForTimeout(500);

        const btn = page.getByRole('button', { name: /send answer/i });
        const isEnabled = await btn.isEnabled().catch(() => false);
        if (!isEnabled) {
          console.log('[pipeline-live] Send button still disabled — reloading page...');
          await page.reload();
          await page.waitForTimeout(3000);
          throw new Error('Send button disabled');
        }
        await btn.click();

        // Wait for either a perspective avatar (AI question) or Thinking indicator
        // This confirms the send actually worked end-to-end
        const aiQuestion = page.locator('[title="henry-wu"], [title="occam"], [title="heist-o-tron"], [title="hickam"], [title="kirk"]');
        const thinking = page.getByText('Thinking...');
        await expect(aiQuestion.or(thinking)).toBeVisible({ timeout: 15_000 });
      }).toPass({ timeout: 60_000, intervals: [5_000] });

      console.log('[pipeline-live] First message sent, AI responding...');

      // Wait for the first AI question to fully appear
      await expect(async () => {
        const hasAvatar = await page.locator('[title="henry-wu"], [title="occam"], [title="heist-o-tron"], [title="hickam"], [title="kirk"]').count();
        console.log(`[pipeline-live] Perspective avatars: ${hasAvatar}`);
        expect(hasAvatar).toBeGreaterThan(0);
      }).toPass({ timeout: 90_000, intervals: [3_000] });

      console.log('[pipeline-live] Interview started — first question visible');

      const conversationHistory: Array<{ question: string; answer: string }> = [];
      let turn = 0;
      let crystallized = false;

      // AI messages are ChatBubble components with role="system" — they have
      // perspective avatars with a title attribute (henry-wu, occam, heist-o-tron, hickam, kirk)
      const perspectiveTitles = ['henry-wu', 'occam', 'heist-o-tron', 'hickam', 'kirk'];
      const perspectiveSelector = perspectiveTitles
        .map((p) => `[title="${p}"]`)
        .join(', ');

      while (turn < LIVE_CONFIG.maxInterviewTurns && !crystallized) {
        turn++;
        console.log(`[pipeline-live] Interview turn ${turn}...`);

        // Check if the phase has left 'gathering' (server auto-transitioned to reviewing)
        const reviewText = page.getByText('Review the seed summary above');
        if (await reviewText.isVisible({ timeout: 1000 }).catch(() => false)) {
          console.log('[pipeline-live] Phase transitioned to reviewing — interview complete');
          crystallized = true;
          break;
        }

        // Find AI messages by their perspective avatar (system messages have one)
        const aiMessages = page.locator(`div:has(${perspectiveSelector})`).filter({
          has: page.locator('p'),
        });

        // Wait for at least `turn` AI messages OR phase transition to reviewing
        await expect(async () => {
          // Check for reviewing phase first
          if (await reviewText.isVisible().catch(() => false)) return; // exit toPass
          const count = await aiMessages.count();
          expect(count).toBeGreaterThanOrEqual(turn);
        }).toPass({ timeout: LIVE_CONFIG.timeouts.interview / LIVE_CONFIG.maxInterviewTurns });

        // Re-check reviewing phase after wait
        if (await reviewText.isVisible({ timeout: 500 }).catch(() => false)) {
          console.log('[pipeline-live] Phase transitioned to reviewing — interview complete');
          crystallized = true;
          break;
        }

        // Extract the question text from the last AI message
        const lastMessage = aiMessages.last();
        const questionText = await lastMessage.locator('p').first().innerText();
        console.log(`[pipeline-live] Q${turn}: ${questionText.slice(0, 100)}...`);

        // Check if clarity banner appeared (ClarityBanner has role="status")
        const clarityBanner = page.locator('[role="status"]').filter({
          hasText: /clarity|crystallize/i,
        });
        if (await clarityBanner.isVisible({ timeout: 1000 }).catch(() => false)) {
          console.log('[pipeline-live] Clarity threshold met — crystallizing');
          const crystallizeButton = page.getByRole('button', { name: /crystallize seed/i });
          await crystallizeButton.click();
          crystallized = true;
          break;
        }

        // Generate simulated user answer via Haiku
        const answer = await getSimulatedAnswer(
          questionText,
          LIVE_CONFIG.simulatedUser,
          conversationHistory,
        );
        console.log(`[pipeline-live] A${turn}: ${answer.slice(0, 100)}...`);

        // Check for MC chips
        const mcGroup = page.locator('[aria-label="Multiple-choice suggestions"]');
        const chipTexts: string[] = [];
        if (await mcGroup.isVisible({ timeout: 1000 }).catch(() => false)) {
          const chips = mcGroup.locator('button');
          const chipCount = await chips.count();
          for (let i = 0; i < chipCount; i++) {
            chipTexts.push(await chips.nth(i).innerText());
          }
        }

        const matchingChip = findMatchingChip(answer, chipTexts);

        if (matchingChip) {
          console.log(`[pipeline-live] Clicking MC chip: "${matchingChip}"`);
          await page.getByText(matchingChip, { exact: true }).click();
        } else {
          // Type freeform answer — use native value setter to trigger React onChange
          const answerInput = page.getByRole('textbox', { name: /interview answer input/i });
          await expect(answerInput).toBeVisible({ timeout: 5000 });
          await answerInput.evaluate((el: HTMLInputElement, text: string) => {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype, 'value'
            )!.set!;
            nativeInputValueSetter.call(el, text);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, answer);

          const sendButton = page.getByRole('button', { name: /send answer/i });
          await expect(sendButton).toBeEnabled({ timeout: 2000 });
          await sendButton.click();
        }

        conversationHistory.push({ question: questionText, answer });

        // Wait for "Thinking..." indicator to appear and disappear
        const thinkingIndicator = page.getByText('Thinking...');
        await thinkingIndicator.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
        await thinkingIndicator.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});

        // Check for clarity banner or reviewing phase after the turn
        if (await clarityBanner.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('[pipeline-live] Clarity threshold met — crystallizing');
          const crystallizeButton = page.getByRole('button', { name: /crystallize seed/i });
          await crystallizeButton.click();
          crystallized = true;
        } else if (await reviewText.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('[pipeline-live] Phase transitioned to reviewing — interview complete');
          crystallized = true;
        }
      }

      expect(crystallized).toBe(true);
      console.log(`[pipeline-live] Interview completed in ${turn} turns`);

      // ── Seed Approval (inline) ──────────────────────────────────────────
      // Handle seed approval in the same page context to avoid stale state
      // from navigating to a fresh page.
      console.log('[pipeline-live] Waiting for seed approval card...');

      // Wait for the SEED SUMMARY card to appear (needs summary data to load)
      const seedCard = page.getByText(/seed summary/i);
      await expect(seedCard).toBeVisible({
        timeout: LIVE_CONFIG.timeouts.crystallize,
      });

      // Wait for any Next.js compilation to finish before interacting
      await expect(page.getByText('Compiling')).toBeHidden({ timeout: 60_000 });

      // Click "Crystallize Seed" button in the SeedApprovalCard
      const crystallizeButton = page.getByRole('button', { name: /crystallize seed/i });
      await expect(crystallizeButton).toBeVisible({ timeout: 60_000 });
      await crystallizeButton.click();

      console.log('[pipeline-live] Seed crystallized, waiting for holdout review...');

      // Check for crystallization error — if the mutation failed, the error banner appears
      // and we should retry clicking the button
      const errorBanner = page.locator('[role="alert"]').filter({ hasText: /crystallization failed/i });
      const holdoutReview = page.getByText(/holdout test review/i);

      // Poll for either holdout review (success) or error banner (failure with retry)
      await expect(async () => {
        if (await holdoutReview.isVisible().catch(() => false)) return;
        if (await errorBanner.isVisible().catch(() => false)) {
          console.log('[pipeline-live] Crystallization failed, retrying...');
          // Wait for any compilation to finish before retry
          await expect(page.getByText('Compiling')).toBeHidden({ timeout: 30_000 });
          const retryButton = page.getByRole('button', { name: /crystallize seed/i });
          if (await retryButton.isVisible().catch(() => false)) {
            await retryButton.click();
          }
          throw new Error('Retrying crystallization');
        }
        throw new Error('Waiting for holdout review or error');
      }).toPass({ timeout: LIVE_CONFIG.timeouts.crystallize });

      console.log('[pipeline-live] Seed approved and crystallized');
    } catch (err) {
      testFailed = true;
      throw err;
    }
  });

  // ── Stage 3: (Placeholder — seed approval now handled in Stage 2) ──────

  test('Stage 3: Verify seed crystallized', async ({ page }) => {
    try {
      expect(projectId).toBeTruthy();
      await page.goto(ROUTES.interview(projectId));

      // Verify we're past the reviewing phase — holdout section should be visible
      await expect(
        page.getByText(/holdout test review/i).or(page.getByText(/crystallized/i))
      ).toBeVisible({ timeout: 30_000 });

      console.log('[pipeline-live] Seed crystallization verified');
    } catch (err) {
      testFailed = true;
      throw err;
    }
  });

  // ── Stage 4: Approve and Seal Holdouts ──────────────────────────────────

  test('Stage 4: Approve holdout scenarios and seal vault', async ({ page }) => {
    try {
      expect(projectId).toBeTruthy();
      await page.goto(ROUTES.interview(projectId));

      // Wait for holdout cards to render
      const holdoutHeading = page.getByText('HOLDOUT TEST REVIEW');
      await expect(holdoutHeading).toBeVisible({
        timeout: LIVE_CONFIG.timeouts.holdouts,
      });

      // Find all expand buttons for holdout scenarios
      const expandButtons = page.getByRole('button', { name: /expand scenario/i });
      await expect(async () => {
        const count = await expandButtons.count();
        expect(count).toBeGreaterThan(0);
      }).toPass({ timeout: LIVE_CONFIG.timeouts.holdouts });

      const holdoutCount = await expandButtons.count();
      console.log(`[pipeline-live] Found ${holdoutCount} holdout scenarios`);

      // Expand, approve, and collapse each card one at a time.
      // Collapsing after approval keeps the list compact so later cards remain visible.
      for (let i = 0; i < holdoutCount; i++) {
        // Re-query expand buttons each iteration (DOM changes after collapse)
        const expandBtn = page.getByRole('button', { name: /expand scenario/i }).nth(i);
        await expandBtn.scrollIntoViewIfNeeded();
        await expandBtn.click();
        await page.waitForTimeout(300);

        // Find the Approve button inside the expanded content
        const approveBtn = page.getByRole('button', { name: /^approve$/i }).last();
        if (await approveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await approveBtn.scrollIntoViewIfNeeded();
          await approveBtn.click();
          await page.waitForTimeout(300);
        }
        console.log(`[pipeline-live] Approved holdout ${i + 1}/${holdoutCount}`);

        // Collapse the card to keep the list compact
        const collapseBtn = page.getByRole('button', { name: /collapse scenario/i }).first();
        if (await collapseBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await collapseBtn.click();
          await page.waitForTimeout(200);
        }
      }

      // Click "Seal Holdout Tests" button
      const sealButton = page.getByRole('button', { name: /seal holdout/i });
      await sealButton.scrollIntoViewIfNeeded();
      await expect(sealButton).toBeVisible({ timeout: 10_000 });
      await sealButton.click();

      // Wait for seal confirmation
      await page.waitForTimeout(5000);
      console.log('[pipeline-live] Holdouts approved and sealed');
    } catch (err) {
      testFailed = true;
      throw err;
    }
  });

  // ── Stage 5: Decompose and Execute Beads ────────────────────────────────

  test('Stage 5: Trigger decomposition and execute beads', async ({ page }) => {
    try {
      expect(projectId).toBeTruthy();

      // Navigate to execution page
      await page.goto(ROUTES.execution(projectId));

      // Wait for Next.js to finish compiling
      await expect(page.getByText('Compiling')).toBeHidden({ timeout: 60_000 });

      // Find and click the "Start Decomposition" button
      const startButton = page.getByRole('button', { name: /start decomposition/i });
      await expect(startButton).toBeVisible({ timeout: 30_000 });
      await startButton.click();
      console.log('[pipeline-live] Triggered decomposition...');

      // Wait for button to disappear (decomposition completed and beads rendered)
      await expect(startButton).toBeHidden({ timeout: LIVE_CONFIG.timeouts.decomposition });

      // Wait for bead nodes to appear in the DAG (react-flow renders .react-flow__node)
      await expect(async () => {
        const beadNodes = page.locator('.react-flow__node');
        const count = await beadNodes.count();
        expect(count).toBeGreaterThan(0);
      }).toPass({ timeout: LIVE_CONFIG.timeouts.decomposition });

      const nodeCount = await page.locator('.react-flow__node').count();
      console.log(`[pipeline-live] DAG rendered with ${nodeCount} beads`);

      // Wait for all beads to finish executing
      console.log('[pipeline-live] Waiting for bead execution...');

      await expect(async () => {
        await page.reload();
        await page.waitForTimeout(2000);

        // Check bead statuses — react-flow nodes contain status text or color indicators
        const pendingBeads = page.locator('.react-flow__node').filter({
          hasText: /pending|executing|claimed/i,
        });
        const pendingCount = await pendingBeads.count();

        const completedBeads = page.locator('.react-flow__node').filter({
          hasText: /completed/i,
        });
        const completedCount = await completedBeads.count();

        const failedBeads = page.locator('.react-flow__node').filter({
          hasText: /failed/i,
        });
        const failedCount = await failedBeads.count();

        console.log(`[pipeline-live] Beads: ${completedCount} completed, ${failedCount} failed, ${pendingCount} pending`);

        // All beads should be done (completed or failed, not pending/executing)
        expect(pendingCount).toBe(0);
      }).toPass({
        timeout: LIVE_CONFIG.timeouts.execution,
        intervals: [10_000],
      });

      console.log('[pipeline-live] All beads executed');
    } catch (err) {
      testFailed = true;
      throw err;
    }
  });

  // ── Stage 6: Evaluation and Evolution ───────────────────────────────────

  test('Stage 6: Reach terminal state (evaluation/evolution)', async ({ page }) => {
    try {
      expect(projectId).toBeTruthy();

      // Navigate to evolution page
      await page.goto(ROUTES.evolution(projectId));

      console.log('[pipeline-live] Waiting for evaluation/evolution...');

      await expect(async () => {
        await page.reload();
        await page.waitForTimeout(3000);

        // Look for any terminal state text on the evolution page
        const terminalIndicators = [
          page.getByText(/goal.?met/i),
          page.getByText(/converged/i),
          page.getByText(/budget.?exceeded/i),
          page.getByText(/halted/i),
          page.getByText(/evolution.*complete/i),
        ];

        let foundTerminal = false;
        for (const indicator of terminalIndicators) {
          if (await indicator.isVisible().catch(() => false)) {
            const text = await indicator.innerText();
            console.log(`[pipeline-live] Terminal state reached: ${text}`);
            foundTerminal = true;
            break;
          }
        }

        if (!foundTerminal) {
          const evolutionEvents = page.getByText(/generation|evolution.*started|lateral/i);
          const eventCount = await evolutionEvents.count();
          console.log(`[pipeline-live] Evolution events visible: ${eventCount}`);
        }

        expect(foundTerminal).toBe(true);
      }).toPass({
        timeout: LIVE_CONFIG.timeouts.evaluation + LIVE_CONFIG.timeouts.evolution,
        intervals: [15_000],
      });

      console.log('[pipeline-live] Pipeline reached terminal state — test passed!');
    } catch (err) {
      testFailed = true;
      throw err;
    }
  });
});
