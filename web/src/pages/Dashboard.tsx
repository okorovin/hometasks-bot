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
