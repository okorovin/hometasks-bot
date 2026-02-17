# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Respond in Russian. All UI text in the app must be in English.

## Commands

```bash
npm run dev          # Start bot in dev mode (tsx watch)
npm run build        # TypeScript compilation (tsc -b)
npm run start        # Start compiled bot (node dist/index.js)
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run Prisma migrations
npm run db:push      # Push schema to database
```

No test runner is configured.

## Tech Stack

- **Node.js 22** (LTS) + **TypeScript ~5.7** (strict mode)
- **grammY 1.40** — Telegram bot framework (long-polling)
- **Prisma 7** + `@prisma/adapter-pg` — ORM with PostgreSQL
- **pino** — structured logging
- **OpenAI SDK** — LLM integration (provider-agnostic, OpenAI-compatible)
- **dotenv** — environment configuration
- **Stripe** (`@stripe/react-stripe-js`) for payment methods

## Architecture

```
src/
  bot/            # Telegram bot (grammY)
    commands/     # /add, /today, /inbox, etc.
    handlers/     # message.ts (text/forward → task), callback.ts (inline buttons)
    keyboards/    # Inline keyboard builders
    middleware/   # Auth whitelist
    formatters/   # Task card formatting
  services/       # Business logic (task, reminder, repeat, user, llm)
  scheduler/      # 60s interval: reminders, digest, overdue
  db/             # Prisma client initialization
  config/         # Environment variables
  utils/          # Date math, error notifier, pagination
  logger.ts       # pino logger
  index.ts        # Entry point
prisma/
  schema.prisma   # Database schema
```

### Key Patterns

**Services:** Pure async functions (no classes) that use Prisma for DB access.

**Task lifecycle:** Message → LLM parse → create task → send card → inline buttons edit in-place.

**Scheduler:** `setInterval(60s)` processes due reminders, daily digest, overdue notifications.

**Auth:** Middleware checks `ctx.from.id` against `ALLOWED_TELEGRAM_IDS` env.

**Error handling:** Errors sent to user in Telegram with deduplication (5min window).

**Quiet hours:** 22:00–09:00 by default, reminders postponed to 09:05.

## Code Style

- 4-space indent, named exports
- `.js` extensions in imports (NodeNext module resolution)
- Prefer `interface` over `type` where possible


## 🔒 Core Rules (NON-NEGOTIABLE)

### 1. Save Session State After Every Important Change (in SESSION_LOG.md)
- After completing any meaningful task (new feature, refactor, bugfix, config change), update **`SESSION_LOG.md`** (separate file in the project root) and the **Project Description** above if the scope or logic changed.
- Include: what was done, which files were touched, current project state.
- If `SESSION_LOG.md` doesn't exist, create it using the template format.
- Reason: battery dies, internet drops, session crashes — the next session must pick up exactly where this one left off.

### 2. Double-Check Yourself (Minimum Twice)
- Before implementing any task, create a plan and **review it twice** for correctness, edge cases, and missed requirements.
- After writing code, **re-read your own output** and ask: "Does this actually solve the task? Did I miss anything?"
- When planning multi-step work, enumerate the steps, then re-examine each step critically before proceeding.

### 3. Be Skeptical of Your Own Conclusions
- After reaching any conclusion (architectural decision, debugging hypothesis, root cause analysis), actively try to disprove it.
- Ask yourself: "What if I'm wrong? What's the alternative explanation?"
- If you're unsure, say so. Don't present guesses as facts.

### 4. NEVER Perform Destructive Actions Without Confirmation
- **Never overwrite, delete, or significantly restructure existing working code** without explicitly asking the user first.
- Before replacing any code block, confirm: "This will replace [X]. The current version [does Y]. Proceed?"
- If a refactor could break existing functionality, warn the user and get approval.
- When in doubt, create a new file or branch rather than modifying the original.

### 5. Mandatory Full Testing After Significant Code Changes
- After writing or modifying any meaningful chunk of code, **run the full relevant test suite** — not partial, not "should be fine."
- If no tests exist, write them first (or ask the user about testing strategy).
- Report test results explicitly. Don't skip this step, ever. Don't say "tests should pass" — actually run them.
- If tests fail, fix the issues before moving on.

### 6. Understand the Environment First
- At the start of a new project or session, inspect and understand:
    - OS, runtime versions (Node, Python, etc.), package manager
    - Project structure, existing dependencies, build system
    - Current deployment target (local? cloud? which provider?)
- **Ask the user** where they plan to deploy before making architectural decisions. Mismatched environments mean rewrites later.

### 7. Document Everything in This File
- This CLAUDE.md is the single source of truth for the project.
- When project description, logic, architecture, or scope changes — **rewrite the Project Description section** to reflect the current state (not the original state).
- When session-significant events happen — **append to `SESSION_LOG.md`**.
- The goal: any new session reading this file should fully understand what the project is, what state it's in, and what was done last.

### 8. Log Every User Prompt (in PROMPT_LOG.md)
- Every time the user sends a prompt, **append it to `PROMPT_LOG.md`** (separate file in the project root).
- Include a sequential number, timestamp, and the prompt text (summarize if extremely long, but keep the intent clear).
- If `PROMPT_LOG.md` doesn't exist, create it using the template format.
- This creates a full audit trail of everything the user asked for across sessions.
- Never skip this step — do it BEFORE starting to work on the request.

### 9. Always Use Context7 MCP or Latest Documentation
- Before writing or modifying code that uses any library, framework, or API, **look up the latest documentation** via Context7 MCP or official docs.
- Do NOT rely on training data for syntax, API signatures, or configuration — it may be outdated.
- If Context7 MCP is not available, fetch official docs via web or local references.
- The goal: zero bugs from outdated API usage or deprecated patterns.

### 10. Use Playwright for Web UI Testing After UI Changes
- After any change to the UI (HTML, CSS, components, layouts, interactions), **run Playwright tests** to verify the UI works correctly.
- If Playwright tests don't exist yet for the affected area, write them before considering the change complete.
- Cover at minimum: page loads, critical user flows, visual regressions, interactive elements.
- Do not skip this even for "small" UI tweaks — visual bugs compound.

### 11. Always Use Superpowers — Add Relevant Subagents and Skills
- The **obra/superpowers** plugin is mandatory for this project. Use it actively.
- When starting a task, evaluate which superpowers skills or subagents are relevant (TDD, systematic debugging, code review, etc.) and invoke them.
- When a task would benefit from delegation — use subagents (e.g., test-writing subagent, review subagent).
- Don't just have superpowers installed — actually use them. Check available skills before each significant task and pick the right ones.

### 12. Research Latest Best Practices Before Tech Decisions
- Before choosing a technology, library, architecture pattern, or approach — **search for current best practices** (2024–2025+).
- Do NOT default to "the way it's always been done." Check if there are newer, better-maintained, or more performant alternatives.
- This applies to: frameworks, libraries, database choices, deployment strategies, testing tools, CI/CD setups, API design, security practices.
- Use Context7 MCP, official docs, or web search to verify that the chosen technology is actively maintained, not deprecated, and considered current best practice.
- When presenting a tech decision to the user, briefly mention what alternatives were considered and why this choice is recommended.

---

## 🛡️ Safety Checklist (Before Any Action)

```
□ Did user send a new prompt? → Log it in PROMPT_LOG.md FIRST
□ Is this a destructive action? → Ask user first
□ Does this change project logic/scope? → Update Project Description
□ Did I just complete something significant? → Update SESSION_LOG.md
□ Did I write new code? → Run tests
□ Am I using a library/API? → Check Context7 MCP or latest docs
□ Did I change the UI? → Run Playwright tests
□ Am I confident in my plan? → Review it again
□ Am I sure about my conclusion? → Try to disprove it
□ Is there a Superpowers skill for this task? → Use it
□ Am I making a tech decision? → Research latest best practices first
```
