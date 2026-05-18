const API_BASE = "/api"

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const jwt = localStorage.getItem("jwt")
    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string>),
    }
    if (options.body) headers["Content-Type"] = "application/json"
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
    exchangeToken: (token: string) =>
        request<{ token: string }>("/auth/token", {
            method: "POST",
            body: JSON.stringify({ token }),
        }),
    getMe: () => request<{ id: number; timezone: string }>("/auth/me"),
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
