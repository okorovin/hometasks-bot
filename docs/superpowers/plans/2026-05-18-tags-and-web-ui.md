# Tags & Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add free-form tags for task grouping + full React/Ant Design web interface with Fastify API, deployed as a single container.

**Architecture:** API-first — Fastify API exposes REST endpoints over existing service layer. Bot and web both use same services. Auth via one-time token from bot → JWT. Single process: bot + Fastify + scheduler.

**Tech Stack:** Fastify 5, @fastify/jwt, @fastify/static, @fastify/cors, React 19, Ant Design 5, Vite 6, React Router 7

**Note:** No test runner is configured in this project. Verification is done via `npm run build` (TypeScript compilation) and manual testing.

---

## File Structure

### New files
```
src/
  api/
    index.ts              — Fastify instance creation, plugin/route registration
    plugins/
      auth.ts             — JWT verification plugin for /api/* routes
      static.ts           — @fastify/static serving web/dist/
    routes/
      auth.ts             — POST /api/auth/token, GET /api/auth/me
      tasks.ts            — Task CRUD + done/postpone
      tags.ts             — Tag CRUD + assign to task
  services/
    tag.service.ts        — Tag CRUD, assign/remove tags from tasks
    auth.service.ts       — One-time token store, JWT helpers
  bot/
    commands/
      tags.ts             — /tags and /tag <name> commands
      web.ts              — /web command (generate auth link)
    keyboards/
      tag-keyboard.ts     — Tag selection keyboard
web/
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  src/
    main.tsx
    App.tsx
    api/
      client.ts           — Fetch wrapper with JWT auth
    pages/
      Login.tsx
      Dashboard.tsx
      Tasks.tsx
      Tags.tsx
    components/
      AppLayout.tsx        — Ant Layout + Sider + menu
      TaskCard.tsx         — Card component for dashboard
      TaskModal.tsx        — Edit/create modal
      TagBadge.tsx         — Colored tag badge
```

### Modified files
```
prisma/schema.prisma               — Add Tag, TaskTag models + relations
src/config/index.ts                 — Add JWT_SECRET, WEB_URL, PORT
src/index.ts                        — Start Fastify alongside bot
src/services/llm.service.ts         — Add tags to ParsedTask, update prompts
src/services/task.service.ts        — Include tags in queries
src/bot/handlers/message.ts         — Auto-assign LLM-parsed tags on create
src/bot/handlers/callback.ts        — Handle tag keyboard callbacks
src/bot/formatters/task.ts          — Show tags in card/list
src/bot/keyboards/task-card.ts      — Add Tags button to card keyboard
src/bot/commands/index.ts           — Register /tags, /tag, /web commands
package.json                        — Add fastify dependencies
Dockerfile                          — Add web/ build step
```

---

### Task 1: Prisma schema — Tag & TaskTag models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add Tag and TaskTag models to schema**

Add to `prisma/schema.prisma`:

```prisma
model Tag {
    id     Int    @id @default(autoincrement())
    userId Int    @map("user_id")
    name   String
    color  String?

    user     User      @relation(fields: [userId], references: [id])
    taskTags TaskTag[]

    @@unique([userId, name])
    @@map("tags")
}

model TaskTag {
    taskId Int @map("task_id")
    tagId  Int @map("tag_id")

    task Task @relation(fields: [taskId], references: [id])
    tag  Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

    @@id([taskId, tagId])
    @@map("task_tags")
}
```

Add relations to existing models:

In `User` model, add: `tags Tag[]`

In `Task` model, add: `taskTags TaskTag[]`

- [ ] **Step 2: Generate Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean compilation

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Tag and TaskTag models to schema"
```

---

### Task 2: Tag service

**Files:**
- Create: `src/services/tag.service.ts`

- [ ] **Step 1: Create tag service**

Create `src/services/tag.service.ts`:

```typescript
import { getPrisma } from "../db/index.js"
import type { Tag } from "@prisma/client"

export async function createTag(userId: number, name: string, color?: string): Promise<Tag> {
    const prisma = getPrisma()
    return prisma.tag.upsert({
        where: { userId_name: { userId, name: name.toLowerCase().trim() } },
        update: {},
        create: { userId, name: name.toLowerCase().trim(), color: color ?? null },
    })
}

export async function getUserTags(userId: number): Promise<(Tag & { _count: { taskTags: number } })[]> {
    const prisma = getPrisma()
    return prisma.tag.findMany({
        where: { userId },
        include: { _count: { select: { taskTags: true } } },
        orderBy: { name: "asc" },
    })
}

export async function getTagById(tagId: number): Promise<Tag | null> {
    const prisma = getPrisma()
    return prisma.tag.findUnique({ where: { id: tagId } })
}

export async function updateTag(tagId: number, data: { name?: string; color?: string | null }): Promise<Tag> {
    const prisma = getPrisma()
    const updateData: { name?: string; color?: string | null } = {}
    if (data.name !== undefined) updateData.name = data.name.toLowerCase().trim()
    if (data.color !== undefined) updateData.color = data.color
    return prisma.tag.update({ where: { id: tagId }, data: updateData })
}

export async function deleteTag(tagId: number): Promise<void> {
    const prisma = getPrisma()
    // TaskTag entries cascade-deleted via onDelete: Cascade
    await prisma.tag.delete({ where: { id: tagId } })
}

export async function setTaskTags(taskId: number, tagIds: number[]): Promise<void> {
    const prisma = getPrisma()
    await prisma.taskTag.deleteMany({ where: { taskId } })
    if (tagIds.length > 0) {
        await prisma.taskTag.createMany({
            data: tagIds.map(tagId => ({ taskId, tagId })),
        })
    }
}

export async function addTagToTask(taskId: number, tagId: number): Promise<void> {
    const prisma = getPrisma()
    await prisma.taskTag.upsert({
        where: { taskId_tagId: { taskId, tagId } },
        update: {},
        create: { taskId, tagId },
    })
}

export async function removeTagFromTask(taskId: number, tagId: number): Promise<void> {
    const prisma = getPrisma()
    await prisma.taskTag.deleteMany({ where: { taskId, tagId } })
}

export async function getTasksByTag(userId: number, tagName: string): Promise<number[]> {
    const prisma = getPrisma()
    const tag = await prisma.tag.findUnique({
        where: { userId_name: { userId, name: tagName.toLowerCase().trim() } },
        include: { taskTags: { select: { taskId: true } } },
    })
    if (!tag) return []
    return tag.taskTags.map(tt => tt.taskId)
}

export async function getTagsForTask(taskId: number): Promise<Tag[]> {
    const prisma = getPrisma()
    const taskTags = await prisma.taskTag.findMany({
        where: { taskId },
        include: { tag: true },
    })
    return taskTags.map(tt => tt.tag)
}

/** Ensure tags exist for user, create if needed. Returns tag records. */
export async function ensureTags(userId: number, tagNames: string[]): Promise<Tag[]> {
    const tags: Tag[] = []
    for (const name of tagNames) {
        const tag = await createTag(userId, name)
        tags.push(tag)
    }
    return tags
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean compilation

- [ ] **Step 3: Commit**

```bash
git add src/services/tag.service.ts
git commit -m "feat: add tag service with CRUD and task assignment"
```

---

### Task 3: Extend task queries to include tags

**Files:**
- Modify: `src/services/task.service.ts`
- Modify: `src/bot/formatters/task.ts`

- [ ] **Step 1: Add taskTags include to all task queries**

In `src/services/task.service.ts`, update every `include` that currently has `{ repeatRule: true }` to include tags:

```typescript
include: { repeatRule: true, taskTags: { include: { tag: true } } },
```

Apply this change to: `getTaskById`, `getToday`, `getInbox`, `getOverdue`, `getWeek`, `getUpcoming`, `getAll`.

Also in `completeTask`, update the final `findUnique` and the `task.update` includes.

- [ ] **Step 2: Update formatTaskCard to show tags**

In `src/bot/formatters/task.ts`, update the `TaskWithRepeat` type and `formatTaskCard`:

```typescript
import type { Task, RepeatRule, Tag, TaskTag } from "@prisma/client"

type TaskWithRepeat = Task & {
    repeatRule?: RepeatRule | null
    taskTags?: (TaskTag & { tag: Tag })[]
}
```

In `formatTaskCard`, after the repeat line, add:

```typescript
const tagNames = task.taskTags?.map(tt => tt.tag.name) ?? []
const tagsStr = tagNames.length > 0 ? tagNames.join(", ") : "—"
lines.push(`🏷 Tags: ${tagsStr}`)
```

Also update `formatTaskListItem` to accept `TaskWithRepeat` (it already does, just extend the type).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean compilation

- [ ] **Step 4: Commit**

```bash
git add src/services/task.service.ts src/bot/formatters/task.ts
git commit -m "feat: include tags in task queries and card display"
```

---

### Task 4: LLM auto-tag parsing

**Files:**
- Modify: `src/services/llm.service.ts`
- Modify: `src/bot/handlers/message.ts`

- [ ] **Step 1: Extend ParsedTask and LLM prompts**

In `src/services/llm.service.ts`:

Update `ParsedTask` interface:

```typescript
export interface ParsedTask {
    title: string
    dueAt: string | null
    notes: string | null
    tags: string[]
}
```

In `SYSTEM_PROMPT`, add to the JSON description:

```
- "tags": array of 0-3 short tag strings for categorization (e.g. ["дом"], ["работа", "срочно"]). Only include tags when the context is clear. Common categories: дом, работа, покупки, здоровье, учёба, финансы.
```

In `FORWARD_SYSTEM_PROMPT`, add the same tags field description.

Update both `parseTaskFromText` and `parseTaskFromForward` return to include:

```typescript
tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
```

Update the fallback returns to include `tags: []`.

- [ ] **Step 2: Auto-assign tags on task creation in message handler**

In `src/bot/handlers/message.ts`, add import:

```typescript
import * as tagService from "../../services/tag.service.js"
```

After `const task = await taskService.createTask(...)`, add:

```typescript
// Auto-assign LLM-parsed tags
if (parsed.tags.length > 0) {
    const tags = await tagService.ensureTags(user.id, parsed.tags)
    await tagService.setTaskTags(task.id, tags.map(t => t.id))
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean compilation

- [ ] **Step 4: Commit**

```bash
git add src/services/llm.service.ts src/bot/handlers/message.ts
git commit -m "feat: LLM auto-parses tags on task creation"
```

---

### Task 5: Bot — tag keyboard & callbacks

**Files:**
- Create: `src/bot/keyboards/tag-keyboard.ts`
- Modify: `src/bot/keyboards/task-card.ts`
- Modify: `src/bot/handlers/callback.ts`
- Modify: `src/bot/handlers/message.ts`

- [ ] **Step 1: Create tag selection keyboard**

Create `src/bot/keyboards/tag-keyboard.ts`:

```typescript
import { InlineKeyboard } from "grammy"
import type { Tag } from "@prisma/client"

export function tagSelectionKeyboard(
    taskId: number,
    allTags: Tag[],
    activeTagIds: Set<number>,
): InlineKeyboard {
    const kb = new InlineKeyboard()

    for (let i = 0; i < allTags.length; i++) {
        const tag = allTags[i]!
        const isActive = activeTagIds.has(tag.id)
        const prefix = isActive ? "✅ " : ""
        const action = isActive ? "tag_remove" : "tag_add"
        kb.text(`${prefix}${tag.name}`, `${action}:${taskId}:${tag.id}`)
        if (i % 2 === 1) kb.row()
    }
    if (allTags.length % 2 === 1) kb.row()

    kb.text("➕ New tag", `tag_new:${taskId}`)
    kb.text("← Back", `back:${taskId}`)

    return kb
}
```

- [ ] **Step 2: Add Tags button to task card keyboard**

In `src/bot/keyboards/task-card.ts`, update `taskCardKeyboard`:

```typescript
export function taskCardKeyboard(task: Task): InlineKeyboard {
    const kb = new InlineKeyboard()
    kb.text("✅ Done", `done:${task.id}`)
    kb.text("⏰ Postpone", `postpone:${task.id}`)
    kb.row()
    kb.text("📅 Set due", `setdue:${task.id}`)
    kb.text("🔁 Repeat", `repeat:${task.id}`)
    kb.row()
    kb.text("🏷 Tags", `tags:${task.id}`)
    kb.text("✏️ Edit", `edit:${task.id}`)
    kb.text("🗑 Delete", `delete:${task.id}`)
    return kb
}
```

- [ ] **Step 3: Add tag callback handlers**

In `src/bot/handlers/callback.ts`, add imports:

```typescript
import * as tagService from "../../services/tag.service.js"
import { tagSelectionKeyboard } from "../keyboards/tag-keyboard.js"
```

Add cases to the switch in `handleCallback`:

```typescript
case "tags":
    await handleTagsMenu(ctx, taskId, user.id)
    break
case "tag_add":
    await handleTagAdd(ctx, taskId, parseInt(parts[2]!, 10), user.id, user.timezone)
    break
case "tag_remove":
    await handleTagRemove(ctx, taskId, parseInt(parts[2]!, 10), user.id, user.timezone)
    break
case "tag_new":
    await handleTagNew(ctx, taskId)
    break
```

Add handler functions:

```typescript
async function handleTagsMenu(ctx: Context, taskId: number, userId: number): Promise<void> {
    const allTags = await tagService.getUserTags(userId)
    const taskTags = await tagService.getTagsForTask(taskId)
    const activeTagIds = new Set(taskTags.map(t => t.id))
    await ctx.editMessageReplyMarkup({
        reply_markup: tagSelectionKeyboard(taskId, allTags, activeTagIds),
    })
}

async function handleTagAdd(ctx: Context, taskId: number, tagId: number, userId: number, timezone: string): Promise<void> {
    await tagService.addTagToTask(taskId, tagId)
    await handleTagsMenu(ctx, taskId, userId)
}

async function handleTagRemove(ctx: Context, taskId: number, tagId: number, userId: number, timezone: string): Promise<void> {
    await tagService.removeTagFromTask(taskId, tagId)
    await handleTagsMenu(ctx, taskId, userId)
}

async function handleTagNew(ctx: Context, taskId: number): Promise<void> {
    if (!ctx.from) return
    awaitingInput.set(ctx.from.id, { action: "new_tag", taskId })
    await ctx.reply("🏷 Send the tag name:")
}
```

- [ ] **Step 4: Handle "new_tag" awaiting input in message handler**

In `src/bot/handlers/message.ts`, add to `handlePendingInput` function, after the `set_due_date` block:

```typescript
} else if (pending.action === "new_tag") {
    const tag = await tagService.createTag(user.id, text)
    await tagService.addTagToTask(pending.taskId, tag.id)
    await ctx.reply(`✅ Tag "${tag.name}" added!`)
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Clean compilation

- [ ] **Step 6: Commit**

```bash
git add src/bot/keyboards/tag-keyboard.ts src/bot/keyboards/task-card.ts src/bot/handlers/callback.ts src/bot/handlers/message.ts
git commit -m "feat: tag selection keyboard and callbacks in bot"
```

---

### Task 6: Bot — /tags, /tag, /web commands

**Files:**
- Create: `src/bot/commands/tags.ts`
- Create: `src/bot/commands/web.ts`
- Modify: `src/bot/commands/index.ts`

- [ ] **Step 1: Create /tags and /tag commands**

Create `src/bot/commands/tags.ts`:

```typescript
import type { Context } from "grammy"
import { getOrCreateUser } from "../../services/user.service.js"
import * as tagService from "../../services/tag.service.js"
import * as taskService from "../../services/task.service.js"
import { formatTaskListItem } from "../formatters/task.js"
import { paginate, taskListKeyboard } from "../../utils/pagination.js"

export async function tagsCommand(ctx: Context): Promise<void> {
    if (!ctx.from) return

    const user = await getOrCreateUser(BigInt(ctx.from.id))
    const tags = await tagService.getUserTags(user.id)

    if (tags.length === 0) {
        await ctx.reply("🏷 No tags yet. Tags are created automatically when you add tasks.")
        return
    }

    const lines = tags.map(t => `🏷 <b>${escapeHtml(t.name)}</b> — ${t._count.taskTags} task(s)`)
    await ctx.reply(`🏷 <b>Your tags</b>:\n\n${lines.join("\n")}`, { parse_mode: "HTML" })
}

export async function tagFilterCommand(ctx: Context): Promise<void> {
    if (!ctx.from) return

    const user = await getOrCreateUser(BigInt(ctx.from.id))
    const tagName = ctx.message?.text?.replace(/^\/tag\s*/, "").trim()

    if (!tagName) {
        await ctx.reply("Usage: /tag <name>\nExample: /tag дом")
        return
    }

    const taskIds = await tagService.getTasksByTag(user.id, tagName)
    if (taskIds.length === 0) {
        await ctx.reply(`🏷 No active tasks with tag "${tagName}".`)
        return
    }

    const allTasks = await taskService.getAll(user.id)
    const filtered = allTasks.filter(t => taskIds.includes(t.id))

    const page = 1
    const { items, totalPages, total } = paginate(filtered, page)
    const pageOffset = (page - 1) * 5
    const lines = items.map((t, i) => formatTaskListItem(t, user.timezone, pageOffset + i))

    const text = `🏷 <b>Tag: ${escapeHtml(tagName)}</b> (${total} tasks):\n\n${lines.join("\n")}`
    const kb = taskListKeyboard(items, `tagfilter_${tagName}`, page, totalPages, pageOffset)
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb })
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
```

- [ ] **Step 2: Create /web command (placeholder — full auth in Task 8)**

Create `src/bot/commands/web.ts`:

```typescript
import type { Context } from "grammy"
import { getOrCreateUser } from "../../services/user.service.js"
import { generateToken } from "../../services/auth.service.js"
import { config } from "../../config/index.js"

export async function webCommand(ctx: Context): Promise<void> {
    if (!ctx.from) return

    const user = await getOrCreateUser(BigInt(ctx.from.id))
    const token = generateToken(user.id)
    const url = `${config.WEB_URL}/login?token=${token}`

    await ctx.reply(
        `🌐 Open the web interface:\n\n${url}\n\n⏱ Link expires in 5 minutes.`,
        { link_preview_options: { is_disabled: true } },
    )
}
```

- [ ] **Step 3: Register commands**

In `src/bot/commands/index.ts`, add imports and registrations:

```typescript
import { tagsCommand, tagFilterCommand } from "./tags.js"
import { webCommand } from "./web.js"
```

In `registerCommands`, add:

```typescript
bot.command("tags", tagsCommand)
bot.command("tag", tagFilterCommand)
bot.command("web", webCommand)
```

In `setCommandsMenu`, add to the commands array:

```typescript
{ command: "tags", description: "List all tags" },
{ command: "tag", description: "Filter tasks by tag" },
{ command: "web", description: "Open web interface" },
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Will fail because `auth.service.ts` doesn't exist yet. This is expected — Task 7 creates it. For now, just commit the files.

- [ ] **Step 5: Commit**

```bash
git add src/bot/commands/tags.ts src/bot/commands/web.ts src/bot/commands/index.ts
git commit -m "feat: add /tags, /tag, /web bot commands"
```

---

### Task 7: Config, dependencies, auth service

**Files:**
- Modify: `package.json`
- Modify: `src/config/index.ts`
- Create: `src/services/auth.service.ts`

- [ ] **Step 1: Install Fastify dependencies**

Run:

```bash
npm install fastify @fastify/jwt @fastify/static @fastify/cors
```

- [ ] **Step 2: Update config**

In `src/config/index.ts`, add:

```typescript
JWT_SECRET: requireEnv("JWT_SECRET"),
WEB_URL: optionalEnv("WEB_URL", "http://localhost:3000"),
PORT: parseInt(optionalEnv("PORT", "3000"), 10),
```

- [ ] **Step 3: Create auth service**

Create `src/services/auth.service.ts`:

```typescript
import { randomUUID } from "crypto"

interface PendingToken {
    userId: number
    expiresAt: number
}

const pendingTokens = new Map<string, PendingToken>()

const TOKEN_TTL_MS = 5 * 60 * 1000 // 5 minutes

export function generateToken(userId: number): string {
    const token = randomUUID()
    pendingTokens.set(token, {
        userId,
        expiresAt: Date.now() + TOKEN_TTL_MS,
    })
    return token
}

export function validateToken(token: string): number | null {
    const pending = pendingTokens.get(token)
    if (!pending) return null
    if (Date.now() > pending.expiresAt) {
        pendingTokens.delete(token)
        return null
    }
    pendingTokens.delete(token) // one-time use
    return pending.userId
}

// Cleanup expired tokens every 10 minutes
setInterval(() => {
    const now = Date.now()
    for (const [token, data] of pendingTokens) {
        if (now > data.expiresAt) pendingTokens.delete(token)
    }
}, 10 * 60 * 1000)
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Clean compilation

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/config/index.ts src/services/auth.service.ts
git commit -m "feat: add Fastify deps, config, auth service with one-time tokens"
```

---

### Task 8: Fastify API — setup, auth routes, static

**Files:**
- Create: `src/api/index.ts`
- Create: `src/api/plugins/auth.ts`
- Create: `src/api/plugins/static.ts`
- Create: `src/api/routes/auth.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create Fastify instance**

Create `src/api/index.ts`:

```typescript
import Fastify from "fastify"
import fastifyCors from "@fastify/cors"
import { config } from "../config/index.js"
import { logger } from "../logger.js"
import { authPlugin } from "./plugins/auth.js"
import { staticPlugin } from "./plugins/static.js"
import { authRoutes } from "./routes/auth.js"
import { taskRoutes } from "./routes/tasks.js"
import { tagRoutes } from "./routes/tags.js"

export async function createApi(): Promise<ReturnType<typeof Fastify>> {
    const app = Fastify({ logger: false })

    await app.register(fastifyCors, { origin: true })
    await app.register(authPlugin)
    await app.register(authRoutes, { prefix: "/api/auth" })
    await app.register(taskRoutes, { prefix: "/api/tasks" })
    await app.register(tagRoutes, { prefix: "/api/tags" })
    await app.register(staticPlugin)

    return app
}

export async function startApi(): Promise<void> {
    const app = await createApi()
    const address = await app.listen({ port: config.PORT, host: "0.0.0.0" })
    logger.info(`API server listening on ${address}`)
}
```

- [ ] **Step 2: Create JWT auth plugin**

Create `src/api/plugins/auth.ts`:

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import fp from "fastify-plugin"
import fastifyJwt from "@fastify/jwt"
import { config } from "../../config/index.js"

declare module "@fastify/jwt" {
    interface FastifyJWT {
        payload: { userId: number }
        user: { userId: number }
    }
}

async function auth(app: FastifyInstance): Promise<void> {
    await app.register(fastifyJwt, { secret: config.JWT_SECRET })

    app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            await request.jwtVerify()
        } catch {
            reply.status(401).send({ error: "Unauthorized" })
        }
    })
}

export const authPlugin = fp(auth)

declare module "fastify" {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    }
}
```

Note: also install `fastify-plugin`:

```bash
npm install fastify-plugin
```

- [ ] **Step 3: Create static file plugin**

Create `src/api/plugins/static.ts`:

```typescript
import type { FastifyInstance } from "fastify"
import fp from "fastify-plugin"
import fastifyStatic from "@fastify/static"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { existsSync } from "fs"

const __dirname = dirname(fileURLToPath(import.meta.url))

async function staticFiles(app: FastifyInstance): Promise<void> {
    const webDist = resolve(__dirname, "../../../web/dist")

    if (!existsSync(webDist)) {
        // In dev mode, web may not be built yet
        return
    }

    await app.register(fastifyStatic, {
        root: webDist,
        wildcard: false,
    })

    // SPA fallback: serve index.html for non-API routes
    app.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith("/api/")) {
            reply.status(404).send({ error: "Not found" })
        } else {
            reply.sendFile("index.html")
        }
    })
}

export const staticPlugin = fp(staticFiles)
```

- [ ] **Step 4: Create auth routes**

Create `src/api/routes/auth.ts`:

```typescript
import type { FastifyInstance } from "fastify"
import { validateToken } from "../../services/auth.service.js"
import { getPrisma } from "../../db/index.js"

export async function authRoutes(app: FastifyInstance): Promise<void> {
    // Exchange one-time token for JWT
    app.post<{ Body: { token: string } }>("/token", async (request, reply) => {
        const { token } = request.body ?? {}
        if (!token) {
            return reply.status(400).send({ error: "Token required" })
        }

        const userId = validateToken(token)
        if (userId === null) {
            return reply.status(401).send({ error: "Invalid or expired token" })
        }

        const jwt = app.jwt.sign({ userId }, { expiresIn: "7d" })
        return { token: jwt }
    })

    // Get current user info
    app.get("/me", { onRequest: [app.authenticate] }, async (request) => {
        const prisma = getPrisma()
        const user = await prisma.user.findUnique({
            where: { id: request.user.userId },
        })
        if (!user) throw new Error("User not found")
        return {
            id: user.id,
            timezone: user.timezone,
            digestTime: user.digestTime,
        }
    })
}
```

- [ ] **Step 5: Integrate Fastify into main entry point**

In `src/index.ts`, update:

```typescript
import { logger } from "./logger.js"
import { getPrisma } from "./db/index.js"
import { createBot } from "./bot/index.js"
import { setCommandsMenu } from "./bot/commands/index.js"
import { startScheduler, stopScheduler } from "./scheduler/index.js"
import { startApi } from "./api/index.js"

async function main(): Promise<void> {
    logger.info("Starting Home Tasks Bot...")

    // Test DB connection
    const prisma = getPrisma()
    await prisma.$connect()
    logger.info("Database connected")

    // Start API server (non-blocking)
    await startApi()

    // Create and start bot
    const bot = createBot()
    logger.info("Bot created, starting long-polling...")

    // Start scheduler
    startScheduler(bot)

    // Graceful shutdown
    const shutdown = async (signal: string) => {
        logger.info(`Received ${signal}, shutting down...`)
        stopScheduler()
        bot.stop()
        await prisma.$disconnect()
        process.exit(0)
    }

    process.on("SIGINT", () => shutdown("SIGINT"))
    process.on("SIGTERM", () => shutdown("SIGTERM"))

    // Set commands menu (non-critical, don't crash if fails)
    try {
        await setCommandsMenu(bot)
        logger.info("Bot commands menu set")
    } catch (err) {
        logger.warn({ err }, "Failed to set commands menu")
    }

    // Start bot (this blocks)
    await bot.start({
        onStart: () => {
            logger.info("Bot is running!")
        },
    })
}

main().catch((err) => {
    logger.fatal({ err }, "Failed to start bot")
    process.exit(1)
})
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Will fail because task/tag routes don't exist yet. Create empty stubs first if needed, or proceed to Task 9.

- [ ] **Step 7: Commit**

```bash
git add src/api/ src/index.ts package.json package-lock.json
git commit -m "feat: Fastify API setup with auth, JWT, static serving"
```

---

### Task 9: Fastify API — task routes

**Files:**
- Create: `src/api/routes/tasks.ts`

- [ ] **Step 1: Create task routes**

Create `src/api/routes/tasks.ts`:

```typescript
import type { FastifyInstance } from "fastify"
import * as taskService from "../../services/task.service.js"
import * as tagService from "../../services/tag.service.js"
import { getPrisma } from "../../db/index.js"

export async function taskRoutes(app: FastifyInstance): Promise<void> {
    // All routes require auth
    app.addHook("onRequest", app.authenticate)

    // List tasks with optional filters
    app.get<{
        Querystring: { status?: string; tag?: string; search?: string }
    }>("/", async (request) => {
        const { userId } = request.user
        const { status, tag, search } = request.query
        const prisma = getPrisma()

        const where: Record<string, unknown> = { userId }

        if (status === "ACTIVE" || status === "DONE") {
            where.status = status
        } else {
            where.status = "ACTIVE"
        }

        if (search) {
            where.title = { contains: search, mode: "insensitive" }
        }

        if (tag) {
            const tagIds = await tagService.getTasksByTag(userId, tag)
            where.id = { in: tagIds }
        }

        const tasks = await prisma.task.findMany({
            where,
            orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
            include: {
                repeatRule: true,
                taskTags: { include: { tag: true } },
            },
        })

        return tasks.map(formatTaskResponse)
    })

    // Get single task
    app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
        const task = await taskService.getTaskById(parseInt(request.params.id, 10))
        if (!task || task.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Task not found" })
        }
        return formatTaskResponse(task)
    })

    // Create task
    app.post<{
        Body: { title: string; notes?: string; dueAt?: string; tagIds?: number[] }
    }>("/", async (request) => {
        const { userId } = request.user
        const { title, notes, dueAt, tagIds } = request.body

        const task = await taskService.createTask({
            userId,
            title,
            notes: notes ?? null,
            dueAt: dueAt ? new Date(dueAt) : null,
        })

        if (tagIds && tagIds.length > 0) {
            await tagService.setTaskTags(task.id, tagIds)
        }

        const fullTask = await taskService.getTaskById(task.id)
        return formatTaskResponse(fullTask!)
    })

    // Update task
    app.patch<{
        Params: { id: string }
        Body: { title?: string; notes?: string; dueAt?: string | null }
    }>("/:id", async (request, reply) => {
        const taskId = parseInt(request.params.id, 10)
        const task = await taskService.getTaskById(taskId)
        if (!task || task.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Task not found" })
        }

        const prisma = getPrisma()
        const data: Record<string, unknown> = {}
        if (request.body.title !== undefined) data.title = request.body.title
        if (request.body.notes !== undefined) data.notes = request.body.notes
        if (request.body.dueAt !== undefined) {
            data.dueAt = request.body.dueAt ? new Date(request.body.dueAt) : null
        }

        await prisma.task.update({ where: { id: taskId }, data })
        const updated = await taskService.getTaskById(taskId)
        return formatTaskResponse(updated!)
    })

    // Complete task
    app.post<{ Params: { id: string } }>("/:id/done", async (request, reply) => {
        const taskId = parseInt(request.params.id, 10)
        const task = await taskService.getTaskById(taskId)
        if (!task || task.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Task not found" })
        }

        const result = await taskService.completeTask(taskId)
        return formatTaskResponse(result)
    })

    // Postpone task
    app.post<{
        Params: { id: string }
        Body: { minutes: number }
    }>("/:id/postpone", async (request, reply) => {
        const taskId = parseInt(request.params.id, 10)
        const task = await taskService.getTaskById(taskId)
        if (!task || task.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Task not found" })
        }

        const result = await taskService.postponeTask(taskId, request.body.minutes)
        return formatTaskResponse(result)
    })

    // Delete task (soft)
    app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
        const taskId = parseInt(request.params.id, 10)
        const task = await taskService.getTaskById(taskId)
        if (!task || task.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Task not found" })
        }

        await taskService.deleteTask(taskId)
        return { ok: true }
    })

    // Set tags on task
    app.post<{
        Params: { id: string }
        Body: { tagIds: number[] }
    }>("/:id/tags", async (request, reply) => {
        const taskId = parseInt(request.params.id, 10)
        const task = await taskService.getTaskById(taskId)
        if (!task || task.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Task not found" })
        }

        await tagService.setTaskTags(taskId, request.body.tagIds)
        const updated = await taskService.getTaskById(taskId)
        return formatTaskResponse(updated!)
    })
}

function formatTaskResponse(task: Record<string, unknown>): Record<string, unknown> {
    const t = task as Record<string, unknown>
    const taskTags = (t.taskTags as Array<{ tag: { id: number; name: string; color: string | null } }>) ?? []
    return {
        id: t.id,
        title: t.title,
        notes: t.notes,
        status: t.status,
        dueAt: t.dueAt,
        createdAt: t.createdAt,
        doneAt: t.doneAt,
        sourceType: t.sourceType,
        repeatRule: t.repeatRule ?? null,
        tags: taskTags.map(tt => ({ id: tt.tag.id, name: tt.tag.name, color: tt.tag.color })),
    }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean compilation

- [ ] **Step 3: Commit**

```bash
git add src/api/routes/tasks.ts
git commit -m "feat: task REST API routes"
```

---

### Task 10: Fastify API — tag routes

**Files:**
- Create: `src/api/routes/tags.ts`

- [ ] **Step 1: Create tag routes**

Create `src/api/routes/tags.ts`:

```typescript
import type { FastifyInstance } from "fastify"
import * as tagService from "../../services/tag.service.js"

export async function tagRoutes(app: FastifyInstance): Promise<void> {
    app.addHook("onRequest", app.authenticate)

    // List all user tags
    app.get("/", async (request) => {
        const tags = await tagService.getUserTags(request.user.userId)
        return tags.map(t => ({
            id: t.id,
            name: t.name,
            color: t.color,
            taskCount: t._count.taskTags,
        }))
    })

    // Create tag
    app.post<{ Body: { name: string; color?: string } }>("/", async (request) => {
        const tag = await tagService.createTag(
            request.user.userId,
            request.body.name,
            request.body.color,
        )
        return tag
    })

    // Update tag
    app.patch<{
        Params: { id: string }
        Body: { name?: string; color?: string | null }
    }>("/:id", async (request, reply) => {
        const tagId = parseInt(request.params.id, 10)
        const tag = await tagService.getTagById(tagId)
        if (!tag || tag.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Tag not found" })
        }
        const updated = await tagService.updateTag(tagId, request.body)
        return updated
    })

    // Delete tag
    app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
        const tagId = parseInt(request.params.id, 10)
        const tag = await tagService.getTagById(tagId)
        if (!tag || tag.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Tag not found" })
        }
        await tagService.deleteTag(tagId)
        return { ok: true }
    })
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean compilation

- [ ] **Step 3: Commit**

```bash
git add src/api/routes/tags.ts
git commit -m "feat: tag REST API routes"
```

---

### Task 11: React scaffold — Vite + Ant Design + Router

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.ts`
- Create: `web/tsconfig.json`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/api/client.ts`
- Create: `web/src/components/AppLayout.tsx`

- [ ] **Step 1: Create web/package.json**

```json
{
    "name": "hometasks-web",
    "private": true,
    "type": "module",
    "scripts": {
        "dev": "vite",
        "build": "tsc -b && vite build",
        "preview": "vite preview"
    },
    "dependencies": {
        "antd": "^5.25.0",
        "react": "^19.1.0",
        "react-dom": "^19.1.0",
        "react-router-dom": "^7.6.0"
    },
    "devDependencies": {
        "@types/react": "^19.1.0",
        "@types/react-dom": "^19.1.0",
        "@vitejs/plugin-react": "^4.4.0",
        "typescript": "^5.9.0",
        "vite": "^6.3.0"
    }
}
```

- [ ] **Step 2: Create web/vite.config.ts**

```typescript
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            "/api": "http://localhost:3000",
        },
    },
})
```

- [ ] **Step 3: Create web/tsconfig.json**

```json
{
    "compilerOptions": {
        "target": "ES2020",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "strict": true,
        "jsx": "react-jsx",
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "outDir": "./dist",
        "rootDir": "./src"
    },
    "include": ["src"]
}
```

- [ ] **Step 4: Create web/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Home Tasks</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 5: Create web/src/main.tsx**

```tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { ConfigProvider } from "antd"
import App from "./App"

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ConfigProvider theme={{ token: { colorPrimary: "#1677ff" } }}>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </ConfigProvider>
    </StrictMode>,
)
```

- [ ] **Step 6: Create web/src/App.tsx**

```tsx
import { Routes, Route, Navigate } from "react-router-dom"
import { AppLayout } from "./components/AppLayout"
import { Login } from "./pages/Login"
import { Dashboard } from "./pages/Dashboard"
import { Tasks } from "./pages/Tasks"
import { Tags } from "./pages/Tags"

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const token = localStorage.getItem("jwt")
    if (!token) return <Navigate to="/login" replace />
    return <>{children}</>
}

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route
                path="/*"
                element={
                    <ProtectedRoute>
                        <AppLayout>
                            <Routes>
                                <Route path="/" element={<Dashboard />} />
                                <Route path="/tasks" element={<Tasks />} />
                                <Route path="/tags" element={<Tags />} />
                            </Routes>
                        </AppLayout>
                    </ProtectedRoute>
                }
            />
        </Routes>
    )
}
```

- [ ] **Step 7: Create web/src/api/client.ts**

```typescript
const API_BASE = "/api"

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const jwt = localStorage.getItem("jwt")
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
    }
    if (jwt) headers["Authorization"] = `Bearer ${jwt}`

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

    if (res.status === 401) {
        localStorage.removeItem("jwt")
        window.location.href = "/login"
        throw new Error("Unauthorized")
    }

    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
    }

    return res.json() as Promise<T>
}

export const api = {
    // Auth
    exchangeToken: (token: string) =>
        request<{ token: string }>("/auth/token", {
            method: "POST",
            body: JSON.stringify({ token }),
        }),
    getMe: () => request<{ id: number; timezone: string }>("/auth/me"),

    // Tasks
    getTasks: (params?: Record<string, string>) => {
        const qs = params ? "?" + new URLSearchParams(params).toString() : ""
        return request<TaskResponse[]>(`/tasks${qs}`)
    },
    getTask: (id: number) => request<TaskResponse>(`/tasks/${id}`),
    createTask: (data: { title: string; notes?: string; dueAt?: string; tagIds?: number[] }) =>
        request<TaskResponse>("/tasks", { method: "POST", body: JSON.stringify(data) }),
    updateTask: (id: number, data: { title?: string; notes?: string; dueAt?: string | null }) =>
        request<TaskResponse>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    completeTask: (id: number) =>
        request<TaskResponse>(`/tasks/${id}/done`, { method: "POST" }),
    postponeTask: (id: number, minutes: number) =>
        request<TaskResponse>(`/tasks/${id}/postpone`, {
            method: "POST",
            body: JSON.stringify({ minutes }),
        }),
    deleteTask: (id: number) =>
        request<{ ok: boolean }>(`/tasks/${id}`, { method: "DELETE" }),
    setTaskTags: (id: number, tagIds: number[]) =>
        request<TaskResponse>(`/tasks/${id}/tags`, {
            method: "POST",
            body: JSON.stringify({ tagIds }),
        }),

    // Tags
    getTags: () => request<TagResponse[]>("/tags"),
    createTag: (data: { name: string; color?: string }) =>
        request<TagResponse>("/tags", { method: "POST", body: JSON.stringify(data) }),
    updateTag: (id: number, data: { name?: string; color?: string | null }) =>
        request<TagResponse>(`/tags/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteTag: (id: number) =>
        request<{ ok: boolean }>(`/tags/${id}`, { method: "DELETE" }),
}

export interface TaskResponse {
    id: number
    title: string
    notes: string | null
    status: string
    dueAt: string | null
    createdAt: string
    doneAt: string | null
    sourceType: string
    repeatRule: { everyN: number; unit: string; active: boolean } | null
    tags: { id: number; name: string; color: string | null }[]
}

export interface TagResponse {
    id: number
    name: string
    color: string | null
    taskCount: number
}
```

- [ ] **Step 8: Create web/src/components/AppLayout.tsx**

```tsx
import { useState } from "react"
import { Layout, Menu } from "antd"
import {
    DashboardOutlined,
    UnorderedListOutlined,
    TagsOutlined,
    LogoutOutlined,
} from "@ant-design/icons"
import { useNavigate, useLocation } from "react-router-dom"

const { Sider, Content } = Layout

export function AppLayout({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = useState(false)
    const navigate = useNavigate()
    const location = useLocation()

    const menuItems = [
        { key: "/", icon: <DashboardOutlined />, label: "Dashboard" },
        { key: "/tasks", icon: <UnorderedListOutlined />, label: "Tasks" },
        { key: "/tags", icon: <TagsOutlined />, label: "Tags" },
        {
            key: "logout",
            icon: <LogoutOutlined />,
            label: "Logout",
            danger: true,
        },
    ]

    const onMenuClick = ({ key }: { key: string }) => {
        if (key === "logout") {
            localStorage.removeItem("jwt")
            navigate("/login")
        } else {
            navigate(key)
        }
    }

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <Sider
                collapsible
                collapsed={collapsed}
                onCollapse={setCollapsed}
                breakpoint="lg"
                theme="light"
            >
                <div style={{ padding: "16px", textAlign: "center", fontWeight: "bold", fontSize: collapsed ? 14 : 18 }}>
                    {collapsed ? "HT" : "Home Tasks"}
                </div>
                <Menu
                    mode="inline"
                    selectedKeys={[location.pathname]}
                    items={menuItems}
                    onClick={onMenuClick}
                />
            </Sider>
            <Content style={{ padding: 24, background: "#fff" }}>
                {children}
            </Content>
        </Layout>
    )
}
```

- [ ] **Step 9: Install dependencies and verify**

```bash
cd web && npm install && npm run build
```

Expected: Build succeeds (pages are stubs — create them in next tasks)

- [ ] **Step 10: Commit**

```bash
git add web/
git commit -m "feat: React scaffold with Vite, Ant Design, Router, API client"
```

---

### Task 12: Login page

**Files:**
- Create: `web/src/pages/Login.tsx`

- [ ] **Step 1: Create Login page**

```tsx
import { useEffect, useState } from "react"
import { Card, Input, Button, Typography, message, Spin } from "antd"
import { useNavigate, useSearchParams } from "react-router-dom"
import { api } from "../api/client"

const { Title, Text } = Typography

export function Login() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const [token, setToken] = useState("")
    const [loading, setLoading] = useState(false)

    const exchange = async (t: string) => {
        setLoading(true)
        try {
            const res = await api.exchangeToken(t)
            localStorage.setItem("jwt", res.token)
            navigate("/", { replace: true })
        } catch {
            message.error("Invalid or expired token. Request a new link via /web in the bot.")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        const urlToken = searchParams.get("token")
        if (urlToken) exchange(urlToken)
    }, [])

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5" }}>
            <Card style={{ width: 400 }}>
                <Title level={3} style={{ textAlign: "center" }}>Home Tasks</Title>
                {loading ? (
                    <div style={{ textAlign: "center" }}><Spin size="large" /></div>
                ) : (
                    <>
                        <Text>Send <b>/web</b> in the Telegram bot to get a login link.</Text>
                        <div style={{ marginTop: 16 }}>
                            <Input
                                placeholder="Or paste token here"
                                value={token}
                                onChange={e => setToken(e.target.value)}
                                onPressEnter={() => token && exchange(token)}
                            />
                            <Button
                                type="primary"
                                block
                                style={{ marginTop: 8 }}
                                onClick={() => exchange(token)}
                                disabled={!token}
                            >
                                Login
                            </Button>
                        </div>
                    </>
                )}
            </Card>
        </div>
    )
}
```

- [ ] **Step 2: Verify build**

```bash
cd web && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Login.tsx
git commit -m "feat: login page with auto token exchange"
```

---

### Task 13: Dashboard page

**Files:**
- Create: `web/src/pages/Dashboard.tsx`
- Create: `web/src/components/TaskCard.tsx`
- Create: `web/src/components/TaskModal.tsx`
- Create: `web/src/components/TagBadge.tsx`

- [ ] **Step 1: Create TagBadge component**

Create `web/src/components/TagBadge.tsx`:

```tsx
import { Tag } from "antd"

interface TagBadgeProps {
    name: string
    color?: string | null
}

const DEFAULT_COLORS = ["blue", "green", "orange", "purple", "cyan", "magenta", "gold", "lime"]

export function TagBadge({ name, color }: TagBadgeProps) {
    const fallbackColor = DEFAULT_COLORS[name.length % DEFAULT_COLORS.length]
    return <Tag color={color ?? fallbackColor}>{name}</Tag>
}
```

- [ ] **Step 2: Create TaskCard component**

Create `web/src/components/TaskCard.tsx`:

```tsx
import { Card, Button, Space, Typography, Popconfirm } from "antd"
import { CheckOutlined, ClockCircleOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons"
import { TagBadge } from "./TagBadge"
import type { TaskResponse } from "../api/client"

const { Text } = Typography

interface TaskCardProps {
    task: TaskResponse
    onDone: (id: number) => void
    onPostpone: (id: number) => void
    onEdit: (task: TaskResponse) => void
    onDelete: (id: number) => void
}

export function TaskCard({ task, onDone, onPostpone, onEdit, onDelete }: TaskCardProps) {
    const dueDate = task.dueAt ? new Date(task.dueAt).toLocaleString("ru-RU", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    }) : "No date"

    const isOverdue = task.dueAt && new Date(task.dueAt) < new Date()

    return (
        <Card
            size="small"
            style={{ marginBottom: 8, cursor: "pointer" }}
            onClick={() => onEdit(task)}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                    <Text strong>{task.title}</Text>
                    <br />
                    <Text type={isOverdue ? "danger" : "secondary"} style={{ fontSize: 12 }}>
                        {dueDate}
                    </Text>
                    {task.repeatRule?.active && (
                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                            🔁 {task.repeatRule.everyN === 1 ? "" : task.repeatRule.everyN}{task.repeatRule.unit.toLowerCase()}
                        </Text>
                    )}
                    <div style={{ marginTop: 4 }}>
                        {task.tags.map(t => <TagBadge key={t.id} name={t.name} color={t.color} />)}
                    </div>
                </div>
                <Space size="small" onClick={e => e.stopPropagation()}>
                    <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => onDone(task.id)} />
                    <Button size="small" icon={<ClockCircleOutlined />} onClick={() => onPostpone(task.id)} />
                    <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(task)} />
                    <Popconfirm title="Delete this task?" onConfirm={() => onDelete(task.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            </div>
        </Card>
    )
}
```

- [ ] **Step 3: Create TaskModal component**

Create `web/src/components/TaskModal.tsx`:

```tsx
import { useState, useEffect } from "react"
import { Modal, Input, DatePicker, Select, Space, message } from "antd"
import { api } from "../api/client"
import type { TaskResponse, TagResponse } from "../api/client"
import dayjs from "dayjs"

interface TaskModalProps {
    task: TaskResponse | null
    isNew: boolean
    open: boolean
    onClose: () => void
    onSaved: () => void
    tags: TagResponse[]
}

export function TaskModal({ task, isNew, open, onClose, onSaved, tags }: TaskModalProps) {
    const [title, setTitle] = useState("")
    const [notes, setNotes] = useState("")
    const [dueAt, setDueAt] = useState<dayjs.Dayjs | null>(null)
    const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (task) {
            setTitle(task.title)
            setNotes(task.notes ?? "")
            setDueAt(task.dueAt ? dayjs(task.dueAt) : null)
            setSelectedTagIds(task.tags.map(t => t.id))
        } else {
            setTitle("")
            setNotes("")
            setDueAt(null)
            setSelectedTagIds([])
        }
    }, [task, open])

    const handleSave = async () => {
        if (!title.trim()) return
        setLoading(true)
        try {
            if (isNew) {
                await api.createTask({
                    title: title.trim(),
                    notes: notes || undefined,
                    dueAt: dueAt?.toISOString(),
                    tagIds: selectedTagIds,
                })
            } else if (task) {
                await api.updateTask(task.id, {
                    title: title.trim(),
                    notes: notes || undefined,
                    dueAt: dueAt?.toISOString() ?? null,
                })
                await api.setTaskTags(task.id, selectedTagIds)
            }
            onSaved()
            onClose()
        } catch {
            message.error("Failed to save task")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            title={isNew ? "New Task" : "Edit Task"}
            open={open}
            onOk={handleSave}
            onCancel={onClose}
            confirmLoading={loading}
        >
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
                <Input
                    placeholder="Task title"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                />
                <Input.TextArea
                    placeholder="Notes (optional)"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                />
                <DatePicker
                    showTime
                    style={{ width: "100%" }}
                    placeholder="Due date"
                    value={dueAt}
                    onChange={setDueAt}
                />
                <Select
                    mode="multiple"
                    placeholder="Tags"
                    style={{ width: "100%" }}
                    value={selectedTagIds}
                    onChange={setSelectedTagIds}
                    options={tags.map(t => ({ value: t.id, label: t.name }))}
                />
            </Space>
        </Modal>
    )
}
```

Note: Install dayjs in web/:

```bash
cd web && npm install dayjs
```

- [ ] **Step 4: Create Dashboard page**

Create `web/src/pages/Dashboard.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react"
import { Typography, Button, message, Spin, Empty } from "antd"
import { PlusOutlined } from "@ant-design/icons"
import { api } from "../api/client"
import type { TaskResponse, TagResponse } from "../api/client"
import { TaskCard } from "../components/TaskCard"
import { TaskModal } from "../components/TaskModal"

const { Title } = Typography

export function Dashboard() {
    const [tasks, setTasks] = useState<TaskResponse[]>([])
    const [tags, setTags] = useState<TagResponse[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [editTask, setEditTask] = useState<TaskResponse | null>(null)
    const [isNew, setIsNew] = useState(false)

    const load = useCallback(async () => {
        try {
            const [t, tg] = await Promise.all([api.getTasks(), api.getTags()])
            setTasks(t)
            setTags(tg)
        } catch {
            message.error("Failed to load tasks")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000)

    const overdue = tasks.filter(t => t.dueAt && new Date(t.dueAt) < todayStart)
    const today = tasks.filter(t =>
        (t.dueAt && new Date(t.dueAt) >= todayStart && new Date(t.dueAt) < todayEnd) || !t.dueAt
    )
    const upcoming = tasks.filter(t =>
        t.dueAt && new Date(t.dueAt) >= todayEnd && new Date(t.dueAt) < weekEnd
    )

    const handleDone = async (id: number) => {
        await api.completeTask(id)
        load()
    }
    const handlePostpone = async (id: number) => {
        await api.postponeTask(id, 60)
        load()
    }
    const handleDelete = async (id: number) => {
        await api.deleteTask(id)
        load()
    }
    const handleEdit = (task: TaskResponse) => {
        setEditTask(task)
        setIsNew(false)
        setModalOpen(true)
    }
    const handleNew = () => {
        setEditTask(null)
        setIsNew(true)
        setModalOpen(true)
    }

    if (loading) return <Spin size="large" style={{ display: "block", margin: "100px auto" }} />

    const renderSection = (title: string, items: TaskResponse[], color?: string) => (
        items.length > 0 ? (
            <div style={{ marginBottom: 24 }}>
                <Title level={5} style={{ color }}>{title} ({items.length})</Title>
                {items.map(t => (
                    <TaskCard key={t.id} task={t}
                        onDone={handleDone} onPostpone={handlePostpone}
                        onEdit={handleEdit} onDelete={handleDelete} />
                ))}
            </div>
        ) : null
    )

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <Title level={3} style={{ margin: 0 }}>Dashboard</Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleNew}>New Task</Button>
            </div>

            {tasks.length === 0 ? (
                <Empty description="No tasks yet" />
            ) : (
                <>
                    {renderSection("⚠️ Overdue", overdue, "#ff4d4f")}
                    {renderSection("📋 Today & Inbox", today)}
                    {renderSection("📅 Upcoming", upcoming)}
                </>
            )}

            <TaskModal
                task={editTask}
                isNew={isNew}
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSaved={load}
                tags={tags}
            />
        </div>
    )
}
```

- [ ] **Step 5: Verify build**

```bash
cd web && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add web/src/
git commit -m "feat: dashboard page with task cards, modal, tag badges"
```

---

### Task 14: Tasks page

**Files:**
- Create: `web/src/pages/Tasks.tsx`

- [ ] **Step 1: Create Tasks page**

Create `web/src/pages/Tasks.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react"
import { Table, Select, Input, Button, Tag, Space, Typography, message, Popconfirm } from "antd"
import { PlusOutlined, CheckOutlined, DeleteOutlined } from "@ant-design/icons"
import { api } from "../api/client"
import type { TaskResponse, TagResponse } from "../api/client"
import { TaskModal } from "../components/TaskModal"
import { TagBadge } from "../components/TagBadge"

const { Title } = Typography
const { Search } = Input

export function Tasks() {
    const [tasks, setTasks] = useState<TaskResponse[]>([])
    const [tags, setTags] = useState<TagResponse[]>([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState("ACTIVE")
    const [tagFilter, setTagFilter] = useState<string | undefined>()
    const [searchText, setSearchText] = useState("")
    const [modalOpen, setModalOpen] = useState(false)
    const [editTask, setEditTask] = useState<TaskResponse | null>(null)
    const [isNew, setIsNew] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const params: Record<string, string> = {}
            if (statusFilter) params.status = statusFilter
            if (tagFilter) params.tag = tagFilter
            if (searchText) params.search = searchText

            const [t, tg] = await Promise.all([api.getTasks(params), api.getTags()])
            setTasks(t)
            setTags(tg)
        } catch {
            message.error("Failed to load tasks")
        } finally {
            setLoading(false)
        }
    }, [statusFilter, tagFilter, searchText])

    useEffect(() => { load() }, [load])

    const columns = [
        {
            title: "Title",
            dataIndex: "title",
            key: "title",
            render: (text: string, record: TaskResponse) => (
                <a onClick={() => { setEditTask(record); setIsNew(false); setModalOpen(true) }}>{text}</a>
            ),
        },
        {
            title: "Due",
            dataIndex: "dueAt",
            key: "dueAt",
            width: 160,
            render: (val: string | null) => val
                ? new Date(val).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                : "—",
            sorter: (a: TaskResponse, b: TaskResponse) => {
                if (!a.dueAt) return 1
                if (!b.dueAt) return -1
                return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
            },
        },
        {
            title: "Tags",
            key: "tags",
            width: 200,
            render: (_: unknown, record: TaskResponse) => (
                <>{record.tags.map(t => <TagBadge key={t.id} name={t.name} color={t.color} />)}</>
            ),
        },
        {
            title: "Status",
            dataIndex: "status",
            key: "status",
            width: 80,
            render: (val: string) => (
                <Tag color={val === "DONE" ? "green" : val === "ACTIVE" ? "blue" : "default"}>
                    {val}
                </Tag>
            ),
        },
        {
            title: "Actions",
            key: "actions",
            width: 100,
            render: (_: unknown, record: TaskResponse) => (
                <Space>
                    {record.status === "ACTIVE" && (
                        <Button size="small" type="primary" icon={<CheckOutlined />}
                            onClick={() => api.completeTask(record.id).then(load)} />
                    )}
                    <Popconfirm title="Delete?" onConfirm={() => api.deleteTask(record.id).then(load)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ]

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <Title level={3} style={{ margin: 0 }}>All Tasks</Title>
                <Button type="primary" icon={<PlusOutlined />}
                    onClick={() => { setEditTask(null); setIsNew(true); setModalOpen(true) }}>
                    New Task
                </Button>
            </div>

            <Space style={{ marginBottom: 16 }} wrap>
                <Select
                    style={{ width: 120 }}
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                        { value: "ACTIVE", label: "Active" },
                        { value: "DONE", label: "Done" },
                    ]}
                />
                <Select
                    style={{ width: 150 }}
                    placeholder="Filter by tag"
                    allowClear
                    value={tagFilter}
                    onChange={setTagFilter}
                    options={tags.map(t => ({ value: t.name, label: t.name }))}
                />
                <Search
                    placeholder="Search..."
                    style={{ width: 200 }}
                    onSearch={setSearchText}
                    allowClear
                />
            </Space>

            <Table
                dataSource={tasks}
                columns={columns}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 20 }}
                size="small"
            />

            <TaskModal
                task={editTask} isNew={isNew} open={modalOpen}
                onClose={() => setModalOpen(false)} onSaved={load} tags={tags}
            />
        </div>
    )
}
```

- [ ] **Step 2: Verify build**

```bash
cd web && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Tasks.tsx
git commit -m "feat: tasks page with table, filters, search"
```

---

### Task 15: Tags page

**Files:**
- Create: `web/src/pages/Tags.tsx`

- [ ] **Step 1: Create Tags page**

Create `web/src/pages/Tags.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react"
import { Table, Button, Input, ColorPicker, Popconfirm, Typography, Space, message } from "antd"
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons"
import { api } from "../api/client"
import type { TagResponse } from "../api/client"
import { TagBadge } from "../components/TagBadge"

const { Title } = Typography

export function Tags() {
    const [tags, setTags] = useState<TagResponse[]>([])
    const [loading, setLoading] = useState(true)
    const [newTagName, setNewTagName] = useState("")

    const load = useCallback(async () => {
        try {
            setTags(await api.getTags())
        } catch {
            message.error("Failed to load tags")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const handleCreate = async () => {
        if (!newTagName.trim()) return
        await api.createTag({ name: newTagName.trim() })
        setNewTagName("")
        load()
    }

    const handleRename = async (id: number, name: string) => {
        await api.updateTag(id, { name })
        load()
    }

    const handleColorChange = async (id: number, color: string) => {
        await api.updateTag(id, { color })
        load()
    }

    const handleDelete = async (id: number) => {
        await api.deleteTag(id)
        load()
    }

    const columns = [
        {
            title: "Tag",
            key: "preview",
            width: 120,
            render: (_: unknown, record: TagResponse) => <TagBadge name={record.name} color={record.color} />,
        },
        {
            title: "Name",
            dataIndex: "name",
            key: "name",
            render: (val: string, record: TagResponse) => (
                <Input
                    defaultValue={val}
                    size="small"
                    style={{ width: 200 }}
                    onBlur={e => {
                        if (e.target.value !== val) handleRename(record.id, e.target.value)
                    }}
                    onPressEnter={e => {
                        const input = e.target as HTMLInputElement
                        if (input.value !== val) handleRename(record.id, input.value)
                    }}
                />
            ),
        },
        {
            title: "Color",
            key: "color",
            width: 80,
            render: (_: unknown, record: TagResponse) => (
                <ColorPicker
                    size="small"
                    value={record.color ?? undefined}
                    onChange={(_, hex) => handleColorChange(record.id, hex)}
                />
            ),
        },
        {
            title: "Tasks",
            dataIndex: "taskCount",
            key: "taskCount",
            width: 80,
        },
        {
            title: "",
            key: "actions",
            width: 60,
            render: (_: unknown, record: TagResponse) => (
                <Popconfirm title="Delete this tag?" onConfirm={() => handleDelete(record.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
            ),
        },
    ]

    return (
        <div>
            <Title level={3}>Tags</Title>

            <Space style={{ marginBottom: 16 }}>
                <Input
                    placeholder="New tag name"
                    value={newTagName}
                    onChange={e => setNewTagName(e.target.value)}
                    onPressEnter={handleCreate}
                    style={{ width: 200 }}
                />
                <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                    Add Tag
                </Button>
            </Space>

            <Table
                dataSource={tags}
                columns={columns}
                rowKey="id"
                loading={loading}
                pagination={false}
                size="small"
            />
        </div>
    )
}
```

- [ ] **Step 2: Verify build**

```bash
cd web && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Tags.tsx
git commit -m "feat: tags management page with inline edit and color picker"
```

---

### Task 16: Update Dockerfile

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Update Dockerfile to build frontend**

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Build frontend
COPY web ./web
RUN cd web && npm ci && npm run build

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist

ENV NODE_ENV=production

CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]
```

- [ ] **Step 2: Verify backend build**

Run: `npm run build`
Expected: Clean compilation

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "feat: update Dockerfile to build and serve frontend"
```

---

### Task 17: Final integration & env vars

**Files:**
- Modify: `.env` (local)

- [ ] **Step 1: Add required env vars**

Add to `.env`:

```
JWT_SECRET=<generate a random 32+ char string>
WEB_URL=http://localhost:3000
PORT=3000
```

For Railway, add the same vars in the dashboard. `WEB_URL` should be the public Railway URL.

- [ ] **Step 2: Run full backend build**

```bash
npm run build
```

- [ ] **Step 3: Run full frontend build**

```bash
cd web && npm install && npm run build
```

- [ ] **Step 4: Test locally**

```bash
npm run dev
```

Verify:
1. Bot starts and responds to commands
2. `http://localhost:3000` serves the web app
3. `/web` command in bot generates a link
4. Login works via the link
5. Dashboard shows tasks
6. Tags page works
7. Creating/editing tasks in web works

- [ ] **Step 5: Push schema to DB**

```bash
npx prisma db push
```

- [ ] **Step 6: Final commit**

```bash
git add .env.example
git commit -m "feat: add env vars for web UI and JWT auth"
```

---

## Summary

| Task | Description | Estimated Steps |
|------|-------------|----------------|
| 1 | Prisma schema — Tag & TaskTag | 4 |
| 2 | Tag service | 3 |
| 3 | Extend task queries + display | 4 |
| 4 | LLM auto-tag parsing | 4 |
| 5 | Bot tag keyboard & callbacks | 6 |
| 6 | Bot /tags, /tag, /web commands | 5 |
| 7 | Config, deps, auth service | 5 |
| 8 | Fastify setup, auth routes, static | 7 |
| 9 | Task API routes | 3 |
| 10 | Tag API routes | 3 |
| 11 | React scaffold | 10 |
| 12 | Login page | 3 |
| 13 | Dashboard page | 6 |
| 14 | Tasks page | 3 |
| 15 | Tags page | 3 |
| 16 | Dockerfile update | 3 |
| 17 | Final integration | 6 |
