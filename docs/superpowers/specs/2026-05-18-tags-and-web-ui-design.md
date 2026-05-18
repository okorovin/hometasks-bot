# Tags & Web UI — Design Spec

**Date:** 2026-05-18
**Status:** Approved

## Overview

Add free-form tags for task grouping + full-featured web interface (React/Ant Design/Fastify) for managing tasks. The bot remains the primary interface but the web UI provides equal capabilities.

## Decisions

| Decision | Choice |
|---|---|
| Tag model | Free-form tags (user types any text) |
| Tag assignment | LLM auto-parses at creation + manual button on card |
| Web functionality | Full management (create, edit, done, postpone, repeat, delete, tags) |
| Web auth | One-time link from `/web` bot command → JWT |
| Deploy | Single container — Fastify serves API + static React build |
| Project structure | Monorepo, `web/` with its own `package.json` |
| Architecture | API-first — shared services layer used by both bot and API |

## 1. Tags — Data Model

### New Prisma models

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
    tag  Tag  @relation(fields: [tagId], references: [id])

    @@id([taskId, tagId])
    @@map("task_tags")
}
```

Relations to add:
- `User` gets `tags Tag[]`
- `Task` gets `taskTags TaskTag[]`

Tags are scoped per user (`@@unique([userId, name])`). Created automatically on first use. Color is optional (for web UI badges), default null. Deleting a tag cascade-deletes its `TaskTag` entries (tasks lose the tag, not deleted themselves).

## 2. Tags — Bot Integration

### At task creation (LLM)
- Extend LLM prompt to include: "If the text implies a context (home, work, shopping, etc.), return a `tags` field as `string[]` in the JSON response"
- Example input: "помыть пылесос" → `{ title: "Помыть пылесос", tags: ["дом"] }`
- If a returned tag doesn't exist for the user, create it automatically

### Tag button on task card
- New button `🏷 Tags` in `taskCardKeyboard`
- Press → show inline keyboard:
  - Existing user tags as toggle buttons (highlighted if already on task)
  - "➕ New tag" button → bot asks for tag name as text input

### Display in task card
- `formatTaskCard` adds line: `🏷 Tags: дом, покупки` (or `🏷 Tags: —`)

### New bot commands
- `/tag дом` — show active tasks with this tag
- `/tags` — list all tags with task counts

## 3. Fastify API

### Setup
- Fastify starts in the same process as the bot (in `index.ts`)
- Single port: `PORT` env var, default `3000`
- Lives in `src/api/`

### Auth flow
1. User sends `/web` command in bot
2. Bot generates UUID token, stores in memory Map with 5-minute TTL
3. Bot replies with link: `https://domain.com/login?token=xxx`
4. Frontend calls `POST /api/auth/token` with the token
5. API validates, returns JWT (7-day expiry)
6. All subsequent requests use `Authorization: Bearer <jwt>` header
7. Fastify auth plugin validates JWT on all `/api/*` routes except `/api/auth/token`

### Endpoints

```
Auth:
  POST /api/auth/token          — exchange one-time token for JWT
  GET  /api/auth/me             — current user info

Tasks:
  GET    /api/tasks             — list tasks (query: status, tag, search, dueDate)
  GET    /api/tasks/:id         — single task with tags and repeat rule
  POST   /api/tasks             — create task
  PATCH  /api/tasks/:id         — update (title, notes, dueAt, status)
  POST   /api/tasks/:id/done    — complete (with repeat logic)
  POST   /api/tasks/:id/postpone — postpone (body: minutes)
  DELETE /api/tasks/:id         — soft delete

Tags:
  GET    /api/tags              — all user tags
  POST   /api/tags              — create tag
  PATCH  /api/tags/:id          — rename / change color
  DELETE /api/tags/:id          — delete tag
  POST   /api/tasks/:id/tags    — assign tags to task (body: { tagIds: number[] })

Static:
  GET /* — serve web/dist/ (built React app)
```

### Route implementation
Routes are thin wrappers over existing services (`task.service`, `repeat.service`, etc.). No business logic in routes.

## 4. React Frontend

### Stack
- React 19, Ant Design 5, Vite, React Router
- White theme (Ant default)
- `web/` directory with its own `package.json`

### Pages

**Login (`/login`)**
- Auto-processes `?token=xxx` from URL
- Fallback: manual token input field
- On success → redirect to `/`

**Dashboard (`/`)**
- Three vertical sections:
  - ⚠️ **Overdue** (red header) — tasks with dueAt < today
  - 📋 **Today + Inbox** — today's tasks + no-date tasks
  - 📅 **Upcoming** — next 7 days
- Each task is an Ant `Card`:
  - Title, due date, tags as colored `Tag` badges
  - Action buttons: Done, Postpone, Edit, Delete
  - Click card → modal with full editing (title, notes, dueAt, tags, repeat)

**All Tasks (`/tasks`)**
- Ant `Table` with filters:
  - Tags (multi-select)
  - Status (Active / Done / All)
  - Search by title
  - Date range picker
- Sortable by date, title
- "➕ New task" button

**Tags (`/tags`)**
- List of tags with task counts
- Inline editing: name, color (color picker)
- Delete with confirmation

### Layout
- Ant `Layout` with `Sider` (nav menu) + `Content`
- Menu items: Dashboard, Tasks, Tags
- Responsive: Sider collapses to burger on mobile
- JWT stored in localStorage; 401 → redirect to `/login`

## 5. Project Structure

```
hometasks-bot/
  src/
    index.ts            — starts bot + Fastify + scheduler
    api/
      index.ts          — Fastify instance, plugin registration
      plugins/
        auth.ts         — JWT verification plugin
        static.ts       — serve web/dist/
      routes/
        auth.ts         — POST /api/auth/token, GET /api/auth/me
        tasks.ts        — CRUD + done/postpone
        tags.ts         — CRUD + assign to task
    bot/                — (existing, add tag keyboard + /web command)
    services/
      tag.service.ts    — new: CRUD tags, assign/remove from tasks
      task.service.ts   — existing, extend with tag includes
      ...existing...
    db/
  web/
    package.json        — React, Ant Design, Vite dependencies
    vite.config.ts
    src/
      main.tsx
      App.tsx
      api/              — API client (fetch wrapper with JWT)
      pages/
        Login.tsx
        Dashboard.tsx
        Tasks.tsx
        Tags.tsx
      components/
        TaskCard.tsx
        TaskModal.tsx
        TagBadge.tsx
        Layout.tsx
    index.html
  prisma/
    schema.prisma       — add Tag, TaskTag models
  Dockerfile            — extend: build web/, copy web/dist/
```

## 6. Deployment

Single Docker container on Railway:
1. Dockerfile builds both backend (`tsc`) and frontend (`cd web && npm ci && npm run build`)
2. Fastify serves `web/dist/` as static files
3. Railway exposes one port (PORT env)
4. Need env vars: `JWT_SECRET`, `WEB_URL` (for bot to generate links)
