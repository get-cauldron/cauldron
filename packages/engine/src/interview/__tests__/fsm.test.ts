import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @get-cauldron/shared to avoid requiring a DB connection at import time
vi.mock('@get-cauldron/shared', () => ({
  interviews: { projectId: 'project_id' },
  seeds: { interviewId: 'interview_id', id: 'id', status: 'status', version: 'version' },
  db: {},
  appendEvent: vi.fn().mockResolvedValue({ id: 'event-1', sequenceNumber: 1 }),
}));

import { InterviewFSM, assertValidTransition, detectInterviewMode, VALID_TRANSITIONS } from '../fsm.js';

// ─── Mock child_process ───────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
const mockExecSync = vi.mocked(execSync);

// ─── Helpers to build mock DB ─────────────────────────────────────────────────

function makeMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  };
}

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const mockConfig = {
  models: {
    interview: ['claude-sonnet-4-6'],
    holdout: ['gemini-2.5-pro'],
    implementation: ['claude-sonnet-4-6'],
    evaluation: ['gemini-2.0-flash'],
  },
  budget: { defaultLimitCents: 1000 },
};

const mockGateway = {
  generateObject: vi.fn(),
  generateText: vi.fn(),
  streamText: vi.fn(),
  streamObject: vi.fn(),
};

// ─── assertValidTransition ────────────────────────────────────────────────────

describe('assertValidTransition', () => {
  it('allows gathering -> reviewing', () => {
    expect(() => assertValidTransition('gathering', 'reviewing')).not.toThrow();
  });

  it('allows gathering -> gathering (self-loop)', () => {
    expect(() => assertValidTransition('gathering', 'gathering')).not.toThrow();
  });

  it('allows reviewing -> approved', () => {
    expect(() => assertValidTransition('reviewing', 'approved')).not.toThrow();
  });

  it('allows approved -> crystallized', () => {
    expect(() => assertValidTransition('approved', 'crystallized')).not.toThrow();
  });

  it('throws on gathering -> crystallized (invalid skip)', () => {
    expect(() => assertValidTransition('gathering', 'crystallized')).toThrow(
      'Invalid FSM transition: gathering -> crystallized',
    );
  });

  it('throws on reviewing -> gathering (backwards)', () => {
    expect(() => assertValidTransition('reviewing', 'gathering')).toThrow(
      'Invalid FSM transition: reviewing -> gathering',
    );
  });

  it('throws on crystallized -> reviewing (terminal)', () => {
    expect(() => assertValidTransition('crystallized', 'reviewing')).toThrow(
      'Invalid FSM transition: crystallized -> reviewing',
    );
  });

  it('VALID_TRANSITIONS export has correct structure', () => {
    expect(VALID_TRANSITIONS.gathering).toContain('reviewing');
    expect(VALID_TRANSITIONS.gathering).toContain('gathering');
    expect(VALID_TRANSITIONS.reviewing).toContain('approved');
    expect(VALID_TRANSITIONS.approved).toContain('crystallized');
    expect(VALID_TRANSITIONS.crystallized).toHaveLength(0);
  });
});

// ─── detectInterviewMode ──────────────────────────────────────────────────────

describe('detectInterviewMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns brownfield when git commits exist', () => {
    mockExecSync.mockReturnValue('42\n' as any);
    const result = detectInterviewMode('/some/project');
    expect(result).toBe('brownfield');
    expect(mockExecSync).toHaveBeenCalledWith(
      'git rev-list --count HEAD 2>/dev/null',
      expect.objectContaining({ cwd: '/some/project', encoding: 'utf-8' }),
    );
  });

  it('returns greenfield when no commits (count=0)', () => {
    mockExecSync.mockReturnValue('0\n' as any);
    const result = detectInterviewMode('/empty/project');
    expect(result).toBe('greenfield');
  });

  it('returns greenfield when execSync throws (no git repo)', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
    const result = detectInterviewMode('/no/git');
    expect(result).toBe('greenfield');
  });

  it('uses process.cwd() when no projectPath provided', () => {
    mockExecSync.mockReturnValue('5\n' as any);
    detectInterviewMode();
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cwd: process.cwd() }),
    );
  });
});

// ─── InterviewFSM ─────────────────────────────────────────────────────────────

describe('InterviewFSM.startOrResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates new interview when no existing interview — calls detectInterviewMode when no mode provided', async () => {
    mockExecSync.mockReturnValue('0\n' as any);

    const db = makeMockDb();
    db.limit.mockResolvedValueOnce([]); // no existing interview

    const newInterview = {
      id: 'interview-1',
      projectId: 'project-1',
      mode: 'greenfield',
      status: 'active',
      phase: 'gathering',
      transcript: [],
      ambiguityScoresHistory: [],
      currentAmbiguityScore: null,
      turnCount: 0,
      createdAt: new Date(),
      completedAt: null,
    };
    db.returning.mockResolvedValueOnce([newInterview]); // insert returning
    db.returning.mockResolvedValueOnce([{ id: 'event-1', sequenceNumber: 1 }]); // appendEvent returning

    const fsm = new InterviewFSM(db as any, mockGateway as any, mockConfig as any, mockLogger as any);
    const result = await fsm.startOrResume('project-1');

    expect(result.mode).toBe('greenfield');
    expect(result.status).toBe('active');
    expect(db.insert).toHaveBeenCalled();
  });

  it('creates interview with provided mode — does NOT call detectInterviewMode', async () => {
    const db = makeMockDb();
    db.limit.mockResolvedValueOnce([]); // no existing

    const newInterview = {
      id: 'interview-2',
      projectId: 'project-2',
      mode: 'brownfield',
      status: 'active',
      phase: 'gathering',
      transcript: [],
      ambiguityScoresHistory: [],
      currentAmbiguityScore: null,
      turnCount: 0,
      createdAt: new Date(),
      completedAt: null,
    };
    db.returning.mockResolvedValueOnce([newInterview]);
    db.returning.mockResolvedValueOnce([{ id: 'event-1', sequenceNumber: 1 }]);

    const fsm = new InterviewFSM(db as any, mockGateway as any, mockConfig as any, mockLogger as any);
    await fsm.startOrResume('project-2', { mode: 'brownfield' });

    // execSync should NOT have been called (no auto-detection)
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('resumes paused interview by setting status to active', async () => {
    const db = makeMockDb();
    const pausedInterview = {
      id: 'interview-3',
      projectId: 'project-3',
      status: 'paused',
      phase: 'gathering',
      mode: 'greenfield',
      transcript: [],
      ambiguityScoresHistory: [],
      currentAmbiguityScore: null,
      turnCount: 2,
      createdAt: new Date(),
      completedAt: null,
    };
    db.limit.mockResolvedValueOnce([pausedInterview]);
    db.where.mockReturnThis(); // for update().where()

    const fsm = new InterviewFSM(db as any, mockGateway as any, mockConfig as any, mockLogger as any);
    const result = await fsm.startOrResume('project-3');

    expect(result.status).toBe('active');
    expect(db.update).toHaveBeenCalled();
    expect(db.set).toHaveBeenCalledWith({ status: 'active' });
  });
});

describe('InterviewFSM.submitAnswer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls scoreTranscript and runActivePerspectives in parallel, then rankCandidates', async () => {
    const db = makeMockDb();
    const interview = {
      id: 'interview-4',
      projectId: 'project-4',
      status: 'active',
      phase: 'gathering',
      mode: 'greenfield',
      transcript: [],
      ambiguityScoresHistory: [],
      currentAmbiguityScore: null,
      turnCount: 0,
      createdAt: new Date(),
      completedAt: null,
    };
    db.where.mockResolvedValueOnce([interview]); // select().from().where()

    const mockScores = {
      goalClarity: 0.5,
      constraintClarity: 0.4,
      successCriteriaClarity: 0.3,
      overall: 0.41,
      reasoning: 'early',
    };

    const mockCandidates = [
      { perspective: 'henry-wu', question: 'What is the goal?', rationale: 'Need goal', model: 'claude' },
      { perspective: 'heist-o-tron', question: 'What are constraints?', rationale: 'Need constraints', model: 'claude' },
    ];

    const mockRanked = {
      selectedCandidate: mockCandidates[0],
      mcOptions: ['Option A', 'Option B', 'Option C'],
      selectionRationale: 'Most important question',
    };

    // Mock gateway calls
    // Stage A (parallel): scoreTranscript + runContrarianAnalysis
    // Stage B: runActivePerspectives (3 perspectives for early turn: henry-wu, occam, hickam) + rankCandidates
    mockGateway.generateObject
      .mockResolvedValueOnce({ object: mockScores }) // scoreTranscript (Stage A)
      .mockResolvedValueOnce({ object: { framings: [{ hypothesis: 'H', alternative: 'A', reasoning: 'R' }] } }) // contrarian (Stage A)
      .mockResolvedValueOnce({ object: { question: 'What is the goal?', rationale: 'Need goal' } }) // henry-wu (Stage B)
      .mockResolvedValueOnce({ object: { question: 'What are constraints?', rationale: 'Need constraints' } }) // occam (Stage B)
      .mockResolvedValueOnce({ object: { question: 'What are constraints?', rationale: 'Need constraints' } }) // hickam (Stage B)
      .mockResolvedValueOnce({ object: { selectedIndex: 0, mcOptions: mockRanked.mcOptions, selectionRationale: mockRanked.selectionRationale } }); // rankCandidates

    // Mock update
    db.where.mockResolvedValue(undefined);

    const fsm = new InterviewFSM(db as any, mockGateway as any, mockConfig as any, mockLogger as any);
    const result = await fsm.submitAnswer('interview-4', 'project-4', { userAnswer: 'Build a CLI tool' });

    expect(mockGateway.generateObject).toHaveBeenCalled();
    expect(result.scores).toBeDefined();
    expect(result.turn.userAnswer).toBe('Build a CLI tool');
    expect(result.turn.turnNumber).toBe(1);
    expect(result.thresholdMet).toBe(false); // 0.41 < 0.8
  });

  it('sets thresholdMet=true and nextQuestion=null when score >= 0.8', async () => {
    const db = makeMockDb();
    const interview = {
      id: 'interview-5',
      projectId: 'project-5',
      status: 'active',
      phase: 'gathering',
      mode: 'greenfield',
      // High existing scores to trigger late-turn perspectives (2 perspectives: seed-closer + architect)
      currentAmbiguityScore: {
        goalClarity: 0.85,
        constraintClarity: 0.8,
        successCriteriaClarity: 0.82,
        overall: 0.83,
        reasoning: 'good',
      },
      transcript: [],
      ambiguityScoresHistory: [],
      turnCount: 3,
      createdAt: new Date(),
      completedAt: null,
    };
    db.where.mockResolvedValueOnce([interview]);

    const highScores = {
      goalClarity: 0.9,
      constraintClarity: 0.85,
      successCriteriaClarity: 0.8,
      overall: 0.855,
      reasoning: 'clear',
    };

    // With late-turn (overall >= 0.7), selectActivePerspectives returns 2 perspectives (kirk + heist-o-tron)
    // Stage A (parallel): scorer + contrarian; Stage B: 2 perspectives + ranker
    mockGateway.generateObject
      .mockResolvedValueOnce({ object: highScores }) // scorer (Stage A)
      .mockResolvedValueOnce({ object: { framings: [{ hypothesis: 'H', alternative: 'A', reasoning: 'R' }] } }) // contrarian (Stage A)
      .mockResolvedValueOnce({ object: { question: 'Q1', rationale: 'R1' } }) // kirk perspective (Stage B)
      .mockResolvedValueOnce({ object: { question: 'Q2', rationale: 'R2' } }) // heist-o-tron perspective (Stage B)
      .mockResolvedValueOnce({ object: { selectedIndex: 0, mcOptions: ['A', 'B', 'C'], selectionRationale: 'Best' } }); // ranker

    db.where.mockResolvedValue(undefined);

    const fsm = new InterviewFSM(db as any, mockGateway as any, mockConfig as any, mockLogger as any);
    const result = await fsm.submitAnswer('interview-5', 'project-5', { userAnswer: 'Clear answer' });

    expect(result.thresholdMet).toBe(true);
    expect(result.nextQuestion).toBeNull();
  });
});

describe('InterviewFSM.requestEarlyCrystallization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns warning with currentScore, gap, and weakestDimensions, then transitions to reviewing', async () => {
    const db = makeMockDb();
    const interview = {
      id: 'interview-6',
      projectId: 'project-6',
      status: 'active',
      phase: 'gathering',
      mode: 'greenfield',
      currentAmbiguityScore: {
        goalClarity: 0.5,
        constraintClarity: 0.4,
        successCriteriaClarity: 0.3,
        overall: 0.41,
        reasoning: 'early',
      },
      transcript: [],
      ambiguityScoresHistory: [],
      turnCount: 1,
      createdAt: new Date(),
      completedAt: null,
    };
    db.where.mockResolvedValueOnce([interview]);
    db.where.mockResolvedValue(undefined); // update().where()

    const fsm = new InterviewFSM(db as any, mockGateway as any, mockConfig as any, mockLogger as any);
    const warning = await fsm.requestEarlyCrystallization('interview-6');

    expect(warning.currentScore).toBe(0.41);
    expect(warning.threshold).toBe(0.8);
    expect(warning.gap).toBeCloseTo(0.39);
    expect(warning.weakestDimensions).toHaveLength(2);
    expect(warning.message).toContain('41%');
    expect(db.update).toHaveBeenCalled();
    expect(db.set).toHaveBeenCalledWith({ phase: 'reviewing' });
  });
});

describe('InterviewFSM.approveAndCrystallize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transitions reviewing -> approved -> crystallized and returns seed', async () => {
    // Build a more granular mock that can handle chained calls
    const mockSeed = {
      id: 'seed-1',
      projectId: 'project-7',
      version: 1,
      status: 'crystallized',
      goal: 'Build a tool',
      createdAt: new Date(),
    };
    const interview = {
      id: 'interview-7',
      projectId: 'project-7',
      status: 'active',
      phase: 'reviewing',
      mode: 'greenfield',
      currentAmbiguityScore: {
        goalClarity: 0.85,
        constraintClarity: 0.8,
        successCriteriaClarity: 0.82,
        overall: 0.823,
        reasoning: 'good',
      },
      transcript: [],
      ambiguityScoresHistory: [],
      turnCount: 3,
      createdAt: new Date(),
      completedAt: null,
    };

    let selectCallCount = 0;
    const db = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return Promise.resolve([interview]); // get interview
          if (selectCallCount === 2) return Promise.resolve([]); // check existing seeds
          return Promise.resolve([{ max: 0 }]); // appendEvent maxSeq
        }),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          return Promise.resolve([interview]);
        }),
      })),
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockImplementation(() => {
          return Promise.resolve([mockSeed]);
        }),
      })),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };

    const summary = {
      goal: 'Build a tool',
      constraints: ['TypeScript'],
      acceptanceCriteria: ['Tests pass'],
      ontologySchema: { entities: [] },
      evaluationPrinciples: ['Correctness'],
      exitConditions: { allPassed: true },
    };

    const fsm = new InterviewFSM(db as any, mockGateway as any, mockConfig as any, mockLogger as any);
    // Should resolve without throwing
    await expect(fsm.approveAndCrystallize('interview-7', 'project-7', summary)).resolves.not.toThrow();
  });

  it('throws when interview is not in reviewing phase', async () => {
    const db = makeMockDb();
    const interview = {
      id: 'interview-8',
      phase: 'gathering',
      status: 'active',
      mode: 'greenfield',
      currentAmbiguityScore: null,
      transcript: [],
      ambiguityScoresHistory: [],
      turnCount: 0,
      createdAt: new Date(),
      completedAt: null,
    };
    db.where.mockResolvedValueOnce([interview]);

    const fsm = new InterviewFSM(db as any, mockGateway as any, mockConfig as any, mockLogger as any);
    await expect(
      fsm.approveAndCrystallize('interview-8', 'project-8', {} as any),
    ).rejects.toThrow("Cannot crystallize: interview is in phase 'gathering', expected 'reviewing'");
  });
});

describe('InterviewFSM.pause', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets status to paused on active interview', async () => {
    const db = makeMockDb();
    const interview = { id: 'interview-9', status: 'active' };
    db.where.mockResolvedValueOnce([interview]);
    db.where.mockResolvedValue(undefined);

    const fsm = new InterviewFSM(db as any, mockGateway as any, mockConfig as any, mockLogger as any);
    await fsm.pause('interview-9');

    expect(db.update).toHaveBeenCalled();
    expect(db.set).toHaveBeenCalledWith({ status: 'paused' });
  });

  it('throws when trying to pause a non-active interview', async () => {
    const db = makeMockDb();
    const interview = { id: 'interview-10', status: 'paused' };
    db.where.mockResolvedValueOnce([interview]);

    const fsm = new InterviewFSM(db as any, mockGateway as any, mockConfig as any, mockLogger as any);
    await expect(fsm.pause('interview-10')).rejects.toThrow("Cannot pause interview in status 'paused'");
  });
});

describe('InterviewFSM.abandon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets status to abandoned', async () => {
    const db = makeMockDb();
    const interview = { id: 'interview-11', status: 'active' };
    db.where.mockResolvedValueOnce([interview]);
    db.where.mockResolvedValue(undefined);

    const fsm = new InterviewFSM(db as any, mockGateway as any, mockConfig as any, mockLogger as any);
    await fsm.abandon('interview-11');

    expect(db.set).toHaveBeenCalledWith({ status: 'abandoned' });
  });

  it('throws when trying to abandon a completed interview', async () => {
    const db = makeMockDb();
    const interview = { id: 'interview-12', status: 'completed' };
    db.where.mockResolvedValueOnce([interview]);

    const fsm = new InterviewFSM(db as any, mockGateway as any, mockConfig as any, mockLogger as any);
    await expect(fsm.abandon('interview-12')).rejects.toThrow(
      "Cannot abandon interview in status 'completed'",
    );
  });
});
