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
