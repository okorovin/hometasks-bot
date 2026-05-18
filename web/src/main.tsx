import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { ConfigProvider } from "antd"
import App from "./App"

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ConfigProvider theme={{ token: { colorPrimary: "#1677ff" } }}>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </ConfigProvider>
    </StrictMode>,
)
