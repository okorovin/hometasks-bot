import { useEffect, useState } from "react"
import { Card, Input, Button, Typography, message, Spin } from "antd"
import { useNavigate, useSearchParams } from "react-router-dom"
import { api } from "../api/client"

const { Title, Text } = Typography

export function Login() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const [token, setToken] = useState("")
    const [loading, setLoading] = useState(false)

    const exchange = async (t: string) => {
        setLoading(true)
        try {
            const res = await api.exchangeToken(t)
            localStorage.setItem("jwt", res.token)
            navigate("/", { replace: true })
        } catch {
            message.error("Invalid or expired token. Request a new link via /web in the bot.")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        const urlToken = searchParams.get("token")
        if (urlToken) exchange(urlToken)
    }, [])

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5" }}>
            <Card style={{ width: 400 }}>
                <Title level={3} style={{ textAlign: "center" }}>Home Tasks</Title>
                {loading ? (
                    <div style={{ textAlign: "center" }}><Spin size="large" /></div>
                ) : (
                    <>
                        <Text>Send <b>/web</b> in the Telegram bot to get a login link.</Text>
                        <div style={{ marginTop: 16 }}>
                            <Input
                                placeholder="Or paste token here"
                                value={token}
                                onChange={e => setToken(e.target.value)}
                                onPressEnter={() => token && exchange(token)}
                            />
                            <Button
                                type="primary"
                                block
                                style={{ marginTop: 8 }}
                                onClick={() => exchange(token)}
                                disabled={!token}
                            >
                                Login
                            </Button>
                        </div>
                    </>
                )}
            </Card>
        </div>
    )
}
