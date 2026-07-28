# Gmail Hourly Digest — Design

**Date:** 2026-07-28
**Status:** Approved (brainstorming)

## Goal

Once per hour, the bot checks the user's Gmail and, if new emails arrived, sends
a Telegram message listing them (subject + sender + time + snippet). All UI text
in English.

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Gmail access | Gmail API (`googleapis`), scope `gmail.readonly` |
| Auth setup | One-time CLI script → `refresh_token` stored in env |
| "New" definition | Emails since last check (cursor by `internalDate`), each shown once |
| Users | Single Gmail account, single Telegram recipient |
| Summarization | None — subject/from/time/snippet only (no LLM) |

## Configuration (env — all optional; feature off if unset)

```
GMAIL_CLIENT_ID=          # Google Cloud OAuth client (Desktop app)
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=      # obtained via `npm run gmail:auth`
GMAIL_NOTIFY_TELEGRAM_ID= # recipient chat id; default = single ALLOWED_TELEGRAM_IDS entry
```

Feature is **enabled** only when `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and
`GMAIL_REFRESH_TOKEN` are all present. Otherwise the scheduler skips the Gmail
job and the bot behaves exactly as before.

`GMAIL_NOTIFY_TELEGRAM_ID`: if unset, default to the single value in
`ALLOWED_TELEGRAM_IDS`. If multiple ids are configured and this var is unset,
log a warning and disable the digest (ambiguous recipient).

## One-time authorization

New script `src/scripts/gmail-auth.ts`, wired as `npm run gmail:auth`:

1. Reads `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` from env.
2. Starts a temporary loopback HTTP server on `http://localhost:<port>`.
3. Prints/opens the Google consent URL (`access_type=offline`, `prompt=consent`,
   scope `gmail.readonly`).
4. On redirect callback, exchanges the code and prints the `refresh_token`.
5. User copies `refresh_token` into env (locally and on Railway).

Google Cloud setup (manual, documented in SESSION_LOG): create project → enable
Gmail API → OAuth client of type **Desktop app** → copy client id/secret.

## Cursor / "what is new"

New Prisma model, single row:

```prisma
model GmailState {
    id              Int      @id @default(1)
    lastInternalDate BigInt  @map("last_internal_date")  // ms since epoch
    updatedAt       DateTime @updatedAt @map("updated_at")

    @@map("gmail_state")
}
```

Check algorithm (`fetchNewEmails()`):

1. Load cursor `lastInternalDate` (ms). If no row exists → **first run**: create
   row with cursor = now, return `[]` (do not dump history).
2. `messages.list` with `q = "in:inbox after:<floor(cursorMs/1000)>"`.
3. For each returned id, `messages.get` (format `metadata`, headers
   `Subject`, `From`, `Date`; also read `internalDate` and `snippet`).
4. Filter to `internalDate > cursorMs` (boundary-second dedupe).
5. Sort ascending by `internalDate`.
6. New cursor = max `internalDate` among the batch (only if non-empty).
7. Return parsed list; caller persists the new cursor **after** a successful
   Telegram send (so a send failure doesn't skip emails next hour).

> Implementation note: confirm against current Gmail API docs that `after:`
> accepts a Unix timestamp (seconds) and that `internalDate`/`snippet` are
> returned as documented, before finalizing the query. (Project rule #9.)

## Message format

HTML parse mode, sent via the existing `bot` instance to `GMAIL_NOTIFY_TELEGRAM_ID`:

```
📬 3 new emails

1. <b>Subject line here</b>
   from Sender Name — 14:32
   short snippet of the body…

2. …
```

- Cap at 15 emails; if more, append `…and N more`.
- Subject truncated to a sane length; snippet truncated (~120 chars).
- HTML-escape subject/from/snippet.
- Sender: prefer display name from `From` header, fall back to bare address.
- Time formatted in the user's timezone (config default `Europe/Moscow`).

## Scheduler integration

Reuse the existing 60s scheduler loop (`src/scheduler/index.ts`):

- Keep module-level `lastGmailCheck: number | null`.
- Each tick: if feature enabled AND (not in quiet hours) AND
  (`lastGmailCheck` null OR `now - lastGmailCheck >= 1h`) → run Gmail job,
  set `lastGmailCheck = now`.
- **Quiet hours (22:00–09:00, config default):** skip the check entirely — do
  NOT advance the cursor. Overnight emails accumulate and are delivered in the
  first post-09:00 run as a single digest. No nighttime pings.
- Job errors are caught and routed through the existing error notifier; the
  cursor is only advanced after a successful send.

## Files

**New**
- `src/services/gmail.service.ts` — OAuth2 client factory, `fetchNewEmails()`,
  cursor load/save, digest formatter (or split formatter into `bot/formatters/`).
- `src/scripts/gmail-auth.ts` — one-time refresh-token CLI.

**Modified**
- `src/scheduler/index.ts` — hourly Gmail job + quiet-hours gate.
- `src/config/index.ts` — new optional env vars + `gmailEnabled` derived flag.
- `prisma/schema.prisma` — `GmailState` model (apply via `db push`).
- `.env.example` — new vars.
- `package.json` — add `googleapis` dependency + `gmail:auth` script.

## Out of scope (YAGNI)

- LLM summarization of email bodies.
- Multiple users / multiple Gmail accounts.
- Web UI configuration for Gmail.
- Attachments, labels beyond INBOX, threading.
- Marking emails read / any write access (readonly scope only).

## Testing

No test runner configured. Verification plan:
- Run `npm run gmail:auth` and confirm a `refresh_token` is obtained.
- With feature env set, manually trigger the job (or shorten interval) and
  confirm: first run is silent (cursor init), a freshly sent test email appears
  in the next digest exactly once, quiet-hours skip works, and disabling env
  cleanly no-ops the job.
```
