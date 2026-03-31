#!/usr/bin/env node

const DEFLECTION_PATTERNS = [
  /\bpre[-\s]?existing\s+(?:issue|bug|problem|error|failure|regression|flakiness|defect)\b/i,
  /\b(?:known|legacy|upstream|inherited)\s+(?:issue|bug|problem|error|failure|regression|flakiness|defect)\b/i,
  /\b(?:issue|bug|problem|error|failure|regression|tests?|build|workflow)\b[^.\n]{0,60}\b(?:was|were|is|are)\s+already\s+(?:broken|failing)\b/i,
  /\b(?:already|previously)\s+(?:existed|broken|failing)\b/i,
  /\b(?:this|it)\s+(?:predates?|pre[-\s]?dates?)\s+(?:my|these|the)\s+changes\b/i,
  /\bexisted\s+prior\s+to\b/i,
  /\b(?:not|isn'?t|wasn'?t)\s+(?:introduced|caused|created|triggered)\s+by\b/i,
  /\b(?:not|isn'?t|wasn'?t)\s+(?:my|our|the|these)\s+(?:fault|change|changes|regression|issue)\b/i,
  /\b(?:unrelated|not related)\s+to\s+(?:my|our|the|these)\s+changes\b/i,
  /\b(?:outside|beyond|out of)\s+(?:the\s+)?scope\b/i,
  /\b(?:should|can|needs?\s+to)\s+be\s+(?:fixed|handled|addressed|resolved)\s+(?:later|separately|elsewhere|in a follow[- ]?up)\b/i,
  /\b(?:separate|follow[- ]?up|future)\s+(?:issue|task|work|fix|change)\b/i,
  /\b(?:left|leaving|kept|keeping)\s+(?:it|this|that)\s+as[- ]is\b/i,
  /\b(?:did not|didn't|will not|won't)\s+(?:fix|address|resolve)\b/i,
];

const CORRECTION = [
  'Stop.',
  'Do not explain a bug, failing test, broken workflow, missing dependency, or unsafe behavior away as pre-existing, known, upstream, legacy, unrelated, or out of scope.',
  'If you discovered it while doing the task, you own the next move now: investigate root cause, fix it, or keep working until you have a concrete fix attempt.',
  'Do not defer it to a follow-up, future task, or someone else.',
].join(' ');

const PREFERRED_STRING_KEYS = new Set([
  'last_assistant_message',
  'assistant_message',
  'message',
  'text',
  'content',
  'output_text',
]);

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function collectCandidateStrings(value, path = [], out = []) {
  if (typeof value === 'string') {
    const joinedPath = path.join('.');
    const key = path[path.length - 1] ?? '';
    if (
      path.length === 0 ||
      PREFERRED_STRING_KEYS.has(key) ||
      /assistant|message|content|text|output/i.test(joinedPath)
    ) {
      out.push(value);
    }
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectCandidateStrings(entry, [...path, String(index)], out));
    return out;
  }

  if (!value || typeof value !== 'object') {
    return out;
  }

  for (const [key, nested] of Object.entries(value)) {
    collectCandidateStrings(nested, [...path, key], out);
  }

  return out;
}

function extractMessageText(payload) {
  if (!payload || typeof payload !== 'object') {
    return typeof payload === 'string' ? normalizeText(payload) : '';
  }

  const exactMatches = [];
  for (const key of PREFERRED_STRING_KEYS) {
    const value = payload[key];
    if (typeof value === 'string') {
      exactMatches.push(value);
    }
  }

  const recursiveMatches = collectCandidateStrings(payload);
  return [...new Set([...exactMatches, ...recursiveMatches].map(normalizeText).filter(Boolean))].join('\n\n');
}

function shouldBlockNoExcusesGuard(payload) {
  const message = typeof payload === 'string' ? normalizeText(payload) : extractMessageText(payload);
  if (!message) {
    return false;
  }

  return DEFLECTION_PATTERNS.some((pattern) => pattern.test(message));
}

function readStdin(timeoutMs = 3000) {
  return new Promise((resolve) => {
    let input = '';
    const timeout = setTimeout(() => resolve(input), timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => {
      clearTimeout(timeout);
      resolve(input);
    });
    process.stdin.on('error', () => {
      clearTimeout(timeout);
      resolve(input);
    });
  });
}

async function main() {
  const rawInput = await readStdin();
  if (!rawInput.trim()) {
    return;
  }

  let payload = rawInput;
  try {
    payload = JSON.parse(rawInput);
  } catch {
    payload = rawInput;
  }

  if (!shouldBlockNoExcusesGuard(payload)) {
    return;
  }

  process.stdout.write(JSON.stringify({ decision: 'block', reason: CORRECTION }));
}

module.exports = {
  CORRECTION,
  DEFLECTION_PATTERNS,
  extractMessageText,
  shouldBlockNoExcusesGuard,
};

if (require.main === module) {
  main().catch(() => process.exit(0));
}
