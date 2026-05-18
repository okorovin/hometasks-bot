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
