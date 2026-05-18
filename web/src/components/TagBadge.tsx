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
