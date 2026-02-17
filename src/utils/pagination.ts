import { InlineKeyboard } from "grammy"

const PAGE_SIZE = 5

export interface PaginatedResult<T> {
    items: T[]
    page: number
    totalPages: number
    total: number
}

export function paginate<T>(
    items: T[],
    page: number,
): PaginatedResult<T> {
    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const safePage = Math.max(1, Math.min(page, totalPages))
    const start = (safePage - 1) * PAGE_SIZE
    const end = start + PAGE_SIZE

    return {
        items: items.slice(start, end),
        page: safePage,
        totalPages,
        total,
    }
}

export function paginationKeyboard(
    prefix: string,
    page: number,
    totalPages: number,
): InlineKeyboard {
    const kb = new InlineKeyboard()

    if (page > 1) {
        kb.text("← Back", `${prefix}:page:${page - 1}`)
    }
    if (totalPages > 1) {
        kb.text(`${page}/${totalPages}`, `noop`)
    }
    if (page < totalPages) {
        kb.text("Next →", `${prefix}:page:${page + 1}`)
    }

    return kb
}
