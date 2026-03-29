/**
 * Live Pipeline E2E Test
 *
 * A single test that boots the full Cauldron stack and drives a URL shortener
 * project through the entire pipeline using real LLM calls.
 *
 * - Simulated user: Claude Haiku (Anthropic) — never same provider as interviewer
 * - Pipeline models: ultra-cheap (gpt-4.1-mini, gemini-2.5-flash)
 * - Infrastructure: self-contained Docker + dev servers
 *
 * Run: pnpm -F @get-cauldron/web test:live
 *
 * Prerequisites:
 * - API keys set: OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY
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
    interview: ['gpt-4.1-mini'],
    holdout: ['gemini-2.5-flash'],
    implementation: ['gpt-4.1-mini'],
    evaluation: ['gemini-2.5-flash'],
    decomposition: ['gpt-4.1-mini'],
    context_assembly: ['gpt-4.1-mini'],
    conflict_resolution: ['gpt-4.1-mini'],
  },

  perspectiveModels: {
    researcher: 'gpt-4.1-mini',
    simplifier: 'gpt-4.1-mini',
    architect: 'gpt-4.1-mini',
    'breadth-keeper': 'gpt-4.1-mini',
    'seed-closer': 'gpt-4.1-mini',
  },

  scoringModel: 'gpt-4.1-mini',

  timeouts: {
    interview: 5 * 60_000,
    crystallize: 2 * 60_000,
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
  test.skip(() => SKIP, 'Requires API keys: OPENAI, ANTHROPIC, GOOGLE');
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

      // Fill in project name
      const nameInput = page.getByRole('textbox', { name: /project name/i });
      await expect(nameInput).toBeVisible({ timeout: 10_000 });
      await nameInput.fill(LIVE_CONFIG.project.name);

      // Fill in description
      const descInput = page.getByRole('textbox', { name: /description/i });
      await descInput.fill(LIVE_CONFIG.project.description);

      // Click create
      const createButton = page.getByRole('button', { name: /start building/i });
      await expect(createButton).toBeEnabled();
      await createButton.click();

      // Wait for redirect to interview page
      await page.waitForURL(/\/projects\/[\w-]+\/interview/, {
        timeout: 15_000,
      });

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
      await page.goto(ROUTES.interview(projectId));

      // Capture browser console errors for debugging
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          console.log(`[browser:error] ${msg.text()}`);
        }
      });
      page.on('pageerror', (err) => {
        console.log(`[browser:pageerror] ${err.message}`);
      });

      // Wait for Next.js to finish compiling before interacting
      console.log('[pipeline-live] Waiting for page to finish compiling...');
      await expect(page.getByText('Compiling')).toBeHidden({ timeout: 60_000 });

      // Wait for the auto-start to create the interview.
      // The auto-start useEffect fires startInterview (may take 1-2 retries in dev mode).
      // Wait until "Interview not started" text is gone (interview created + refetch done).
      console.log('[pipeline-live] Waiting for interview to be created...');
      await expect(async () => {
        const notStarted = await page.getByText('Interview not started').isVisible().catch(() => false);
        console.log(`[pipeline-live] not_started=${notStarted}`);
        expect(notStarted).toBe(false);
      }).toPass({ timeout: 60_000, intervals: [3_000] });

      console.log('[pipeline-live] Interview created. Sending first message...');

      // The interview is now active. Send the first message to trigger the opening question.
      const answerInput = page.getByRole('textbox', { name: /interview answer input/i });
      await expect(answerInput).toBeVisible({ timeout: 10_000 });
      await answerInput.fill(LIVE_CONFIG.project.description);
      await page.waitForTimeout(500);

      const sendButton = page.getByRole('button', { name: /send answer/i });
      await expect(sendButton).toBeEnabled({ timeout: 10_000 });
      await sendButton.click();
      console.log('[pipeline-live] First message sent, waiting for AI response...');

      // Wait for the first AI question to appear (perspective avatar = AI message)
      await expect(async () => {
        const hasAvatar = await page.locator('[title="researcher"], [title="simplifier"], [title="architect"], [title="breadth-keeper"], [title="seed-closer"]').count();
        console.log(`[pipeline-live] Perspective avatars: ${hasAvatar}`);
        expect(hasAvatar).toBeGreaterThan(0);
      }).toPass({ timeout: 90_000, intervals: [3_000] });

      console.log('[pipeline-live] Interview started — first question visible');

      const conversationHistory: Array<{ question: string; answer: string }> = [];
      let turn = 0;
      let crystallized = false;

      // AI messages are ChatBubble components with role="system" — they have
      // perspective avatars with a title attribute (researcher, architect, etc.)
      const perspectiveTitles = ['researcher', 'simplifier', 'architect', 'breadth-keeper', 'seed-closer'];
      const perspectiveSelector = perspectiveTitles
        .map((p) => `[title="${p}"]`)
        .join(', ');

      while (turn < LIVE_CONFIG.maxInterviewTurns && !crystallized) {
        turn++;
        console.log(`[pipeline-live] Interview turn ${turn}...`);

        // Find AI messages by their perspective avatar (system messages have one)
        // Each ChatBubble with role="system" has a div with justify-start and an avatar
        const aiMessages = page.locator(`div:has(${perspectiveSelector})`).filter({
          has: page.locator('p'), // message content is in a <p> tag
        });

        // Wait for at least `turn` AI messages to appear
        await expect(async () => {
          const count = await aiMessages.count();
          expect(count).toBeGreaterThanOrEqual(turn);
        }).toPass({ timeout: LIVE_CONFIG.timeouts.interview / LIVE_CONFIG.maxInterviewTurns });

        // Extract the question text from the last AI message's <p> tag
        const lastMessage = aiMessages.last();
        const questionText = await lastMessage.locator('p').innerText();
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

        // Check for MC chips — they're in a group with aria-label="Multiple-choice suggestions"
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
          // Type freeform answer
          const answerInput = page.getByRole('textbox', { name: /interview answer input/i });
          await expect(answerInput).toBeVisible({ timeout: 5000 });
          await answerInput.fill(answer);

          const sendButton = page.getByRole('button', { name: /send answer/i });
          await expect(sendButton).toBeEnabled({ timeout: 2000 });
          await sendButton.click();
        }

        conversationHistory.push({ question: questionText, answer });

        // Wait for "Thinking..." indicator to appear and disappear
        const thinkingIndicator = page.getByText('Thinking...');
        await thinkingIndicator.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
        await thinkingIndicator.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});

        // Check again for clarity banner after the turn
        if (await clarityBanner.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('[pipeline-live] Clarity threshold met — crystallizing');
          const crystallizeButton = page.getByRole('button', { name: /crystallize seed/i });
          await crystallizeButton.click();
          crystallized = true;
        }
      }

      expect(crystallized).toBe(true);
      console.log(`[pipeline-live] Interview completed in ${turn} turns`);
    } catch (err) {
      testFailed = true;
      throw err;
    }
  });

  // ── Stage 3: Approve Seed ───────────────────────────────────────────────

  test('Stage 3: Review and approve crystallized seed', async ({ page }) => {
    try {
      expect(projectId).toBeTruthy();
      await page.goto(ROUTES.interview(projectId));

      // The seed approval card should be visible (phase = reviewing)
      const seedCard = page.getByText(/seed summary/i);
      await expect(seedCard).toBeVisible({
        timeout: LIVE_CONFIG.timeouts.crystallize,
      });

      // Verify the seed has content
      const goalText = page.getByText(/goal/i);
      await expect(goalText).toBeVisible();

      // Click "Crystallize Seed" / "Approve" button
      const approveButton = page.getByRole('button', { name: /crystallize seed|approve/i });
      await expect(approveButton).toBeVisible();
      await approveButton.click();

      // Wait for phase to transition to crystallized — holdout cards should appear
      await expect(
        page.getByText(/holdout test review/i).or(page.getByText(/holdout/i))
      ).toBeVisible({ timeout: LIVE_CONFIG.timeouts.crystallize });

      console.log('[pipeline-live] Seed approved and crystallized');
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
      const holdoutSection = page.getByText(/holdout/i);
      await expect(holdoutSection).toBeVisible({
        timeout: LIVE_CONFIG.timeouts.holdouts,
      });

      // Find all holdout approve buttons
      const approveButtons = page.getByRole('button', { name: /^approve$/i });

      // Wait for at least one holdout card
      await expect(async () => {
        const count = await approveButtons.count();
        expect(count).toBeGreaterThan(0);
      }).toPass({ timeout: LIVE_CONFIG.timeouts.holdouts });

      const holdoutCount = await approveButtons.count();
      console.log(`[pipeline-live] Found ${holdoutCount} holdout scenarios`);

      // Approve each holdout
      for (let i = 0; i < holdoutCount; i++) {
        const btn = approveButtons.nth(0); // always click first available unapproved
        if (await btn.isVisible().catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(500);
        }
      }

      // Click "Seal Holdout Tests" button
      const sealButton = page.getByRole('button', { name: /seal holdout/i });
      await expect(sealButton).toBeVisible({ timeout: 10_000 });
      await sealButton.click();

      // Wait for seal confirmation
      await expect(
        page.getByText(/sealed/i).or(page.getByText(/seed crystallized/i))
      ).toBeVisible({ timeout: LIVE_CONFIG.timeouts.holdouts });

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

      // Look for a decomposition trigger button
      const triggerButton = page.getByRole('button', { name: /decompose|trigger|start/i });
      if (await triggerButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('[pipeline-live] Triggering decomposition...');
        await triggerButton.click();
      }

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
