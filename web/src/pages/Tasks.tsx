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
