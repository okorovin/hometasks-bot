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
