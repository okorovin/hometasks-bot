import { useState, useEffect, useCallback } from "react"
import { Table, Button, Input, ColorPicker, Popconfirm, Typography, Space, message, Tag } from "antd"
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons"
import { api } from "../api/client"
import type { TagResponse } from "../api/client"

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
            render: (_: unknown, record: TagResponse) => (
                <Tag color={record.color ?? undefined}>{record.name}</Tag>
            ),
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
