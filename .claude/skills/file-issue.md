# /file-issue

Interactively capture bug reports and enhancement requests, then file them as GitHub issues on zakkeown/cauldron with appropriate labels.

Use this skill whenever the user mentions filing an issue, reporting a bug, requesting a feature, suggesting an enhancement, or wants to capture an idea as a GitHub issue. Also use when they say things like "we should track this", "open an issue for...", or "log this as a bug".

## Issue Types

| Type | Label | Fields |
|------|-------|--------|
| bug | `bug` | title, description, severity, priority, repro steps |
| enhancement | `enhancement` | title, description, priority |

## Workflow

### 1. Determine the type

If the user hasn't made it obvious, ask: "Is this a bug or an enhancement?"

### 2. Gather details interactively

Ask focused questions to build up the issue. Don't dump a form — have a conversation. Start with whatever the user already told you and fill in the gaps.

**For bugs**, make sure you have:
- **Title**: concise summary of what's broken
- **Description**: what's happening vs what should happen
- **Severity**: critical (blocks work), major (painful workaround), minor (cosmetic / low-impact)
- **Priority**: high (fix now), medium (fix soon), low (fix eventually)
- **Repro steps**: numbered steps to reproduce. If the user gives you a rough description, help them tighten it into clear steps. Ask clarifying questions if the repro is ambiguous — a good bug report saves debugging time later.

**For enhancements**, make sure you have:
- **Title**: concise summary of what's being proposed
- **Description**: what the enhancement does and why it matters
- **Priority**: high (needed soon), medium (would be nice soon), low (backlog)

You don't need to ask each field one-at-a-time if the user front-loads context. Adapt — if they give you a paragraph describing a bug, extract what you can and only ask about what's missing.

### 3. Confirm before filing

Present a preview of the issue in this format and ask for confirmation:

```
Type: bug | enhancement
Title: ...
Priority: high | medium | low
Severity: critical | major | minor  (bugs only)

---
<issue body that will be filed>
---

Labels: bug/enhancement
```

The issue body should be well-structured markdown:

**Bug body template:**
```markdown
## Description
<what's happening vs what should happen>

## Severity
<critical | major | minor> — <brief justification>

## Priority
<high | medium | low>

## Steps to Reproduce
1. ...
2. ...
3. ...

## Expected Behavior
<what should happen>

## Actual Behavior
<what happens instead>
```

**Enhancement body template:**
```markdown
## Description
<what the enhancement does and why it matters>

## Priority
<high | medium | low>

## Proposed Approach
<if the user mentioned how, include it — otherwise omit this section>
```

### 4. File the issue

Once confirmed, use `gh issue create`:

```bash
gh issue create \
  --repo zakkeown/cauldron \
  --title "<title>" \
  --label "<bug|enhancement>" \
  --body "<body>"
```

Use a heredoc for the body to preserve formatting:
```bash
gh issue create \
  --repo zakkeown/cauldron \
  --title "Title here" \
  --label "bug" \
  --body "$(cat <<'EOF'
## Description
...

## Severity
...
EOF
)"
```

### 5. Report back

After filing, show the issue URL so the user can verify it looks right.

## Edge Cases

- If the user wants to file multiple issues at once, handle them one at a time — confirm and file each before moving to the next.
- If the user changes their mind mid-conversation ("actually this is an enhancement, not a bug"), adapt without starting over.
- If `gh` auth fails, tell the user to run `! gh auth login` to authenticate.
