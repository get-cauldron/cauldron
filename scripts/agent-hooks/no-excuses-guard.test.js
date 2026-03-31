const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractMessageText,
  shouldBlockNoExcusesGuard,
} = require('./no-excuses-guard.js');

test('blocks classic pre-existing excuse language', () => {
  assert.equal(
    shouldBlockNoExcusesGuard({
      last_assistant_message:
        'I found a pre-existing issue in the workflow, so I left it as-is and did not fix it.',
    }),
    true
  );
});

test('blocks scope-dodge and follow-up language', () => {
  assert.equal(
    shouldBlockNoExcusesGuard({
      last_assistant_message:
        'The failing tests are outside the scope of this task and should be fixed in a follow-up.',
    }),
    true
  );
});

test('extracts nested assistant content for non-Claude payload shapes', () => {
  const payload = {
    hook_event_name: 'Stop',
    response: {
      message: {
        content: [
          {
            type: 'output_text',
            text: 'This is a known bug in legacy code, so I did not address it here.',
          },
        ],
      },
    },
  };

  assert.match(extractMessageText(payload), /known bug/i);
  assert.equal(shouldBlockNoExcusesGuard(payload), true);
});

test('allows neutral completion summaries', () => {
  assert.equal(
    shouldBlockNoExcusesGuard({
      last_assistant_message:
        'Implemented the fix, added coverage, and verified the command succeeds locally.',
    }),
    false
  );
});
