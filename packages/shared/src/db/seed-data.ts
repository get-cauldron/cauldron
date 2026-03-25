import { db } from './client.js';
import * as schema from './schema/index.js';

export async function seedDevData() {
  // Insert example project
  const [project] = await db.insert(schema.projects).values({
    name: 'CLI Bulk Renamer',
    description: 'A CLI tool for bulk file renaming with pattern matching — the v1 test case',
  }).returning();

  if (!project) {
    throw new Error('Failed to insert project');
  }

  // Insert example seed (crystallized)
  const [seed] = await db.insert(schema.seeds).values({
    projectId: project.id,
    version: 1,
    status: 'crystallized',
    goal: 'Build a CLI tool that renames files in bulk using glob patterns and regex substitution',
    constraints: ['Must be a standalone Node.js CLI', 'Must support dry-run mode', 'Must handle >10k files without memory issues'],
    acceptanceCriteria: ['Glob pattern matches target files', 'Regex substitution renames correctly', 'Dry-run shows preview without writing', 'Error on conflicting target names'],
    ontologySchema: { entities: ['File', 'Pattern', 'RenameOperation'] },
    evaluationPrinciples: [{ name: 'correctness', weight: 0.5 }, { name: 'usability', weight: 0.3 }, { name: 'performance', weight: 0.2 }],
    exitConditions: { maxGenerations: 10, ambiguityThreshold: 0.2 },
    ambiguityScore: 0.15,
    crystallizedAt: new Date(),
  }).returning();

  if (!seed) {
    throw new Error('Failed to insert seed');
  }

  // Insert example beads
  const [beadA] = await db.insert(schema.beads).values({
    seedId: seed.id,
    title: 'CLI argument parser',
    spec: 'Parse glob pattern, regex, and flags from CLI arguments using commander.js',
    status: 'completed',
    completedAt: new Date(),
  }).returning();

  const [beadB] = await db.insert(schema.beads).values({
    seedId: seed.id,
    title: 'File matcher',
    spec: 'Use glob to find matching files in target directory',
    status: 'pending',
  }).returning();

  if (!beadA || !beadB) {
    throw new Error('Failed to insert beads');
  }

  // Insert example edge (A blocks B)
  await db.insert(schema.beadEdges).values({
    fromBeadId: beadA.id,
    toBeadId: beadB.id,
    edgeType: 'blocks',
  });

  // Insert example events
  await db.insert(schema.events).values([
    { projectId: project.id, type: 'interview_started', payload: {}, sequenceNumber: 1 },
    { projectId: project.id, type: 'interview_completed', payload: {}, sequenceNumber: 2 },
    { projectId: project.id, seedId: seed.id, type: 'seed_crystallized', payload: { version: 1 }, sequenceNumber: 3 },
  ]);

  console.log(`Seeded project: ${project.name} (${project.id})`);
  console.log(`Seeded seed: ${seed.id} (v${seed.version})`);
  console.log(`Seeded ${2} beads with 1 edge`);
  console.log(`Seeded ${3} events`);
}
