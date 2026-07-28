/**
 * One-time Gmail authorization.
 *
 * Prerequisites (env, e.g. in .env):
 *   GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET from a Google Cloud OAuth client of
 *   type "Desktop app" (Gmail API must be enabled for the project).
 *
 * Run:  npm run gmail:auth
 * Then open the printed URL, authorize, and copy the refresh token it prints
 * into env as GMAIL_REFRESH_TOKEN (locally and on your host).
 */
import "dotenv/config"
import http from "node:http"
import { google } from "googleapis"
import { GMAIL_READONLY_SCOPE } from "../services/gmail.service.js"

const PORT = 3111
const REDIRECT_URI = `http://localhost:${PORT}`

const clientId = process.env.GMAIL_CLIENT_ID
const clientSecret = process.env.GMAIL_CLIENT_SECRET

if (!clientId || !clientSecret) {
    console.error(
        "Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET. Set them in .env first.",
    )
    process.exit(1)
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)

const authUrl = oauth2.generateAuthUrl({
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // force refresh_token even on re-auth
    scope: [GMAIL_READONLY_SCOPE],
})

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", REDIRECT_URI)
    if (!url.searchParams.has("code")) {
        res.writeHead(400).end("Missing authorization code.")
        return
    }

    const code = url.searchParams.get("code")!
    try {
        const { tokens } = await oauth2.getToken(code)
        res.writeHead(200, { "Content-Type": "text/plain" }).end(
            "Authorization complete. You can close this tab and return to the terminal.",
        )

        if (tokens.refresh_token) {
            console.log("\n=== GMAIL_REFRESH_TOKEN ===\n")
            console.log(tokens.refresh_token)
            console.log("\nAdd it to your env as GMAIL_REFRESH_TOKEN.\n")
        } else {
            console.error(
                "\nNo refresh_token returned. Remove this app's access at " +
                    "https://myaccount.google.com/permissions and run again " +
                    "(refresh tokens are only issued on first consent).\n",
            )
        }
    } catch (err) {
        res.writeHead(500).end("Failed to exchange code. Check the terminal.")
        console.error(err)
    } finally {
        server.close()
        setTimeout(() => process.exit(0), 100)
    }
})

server.listen(PORT, () => {
    console.log("Open this URL in your browser to authorize Gmail access:\n")
    console.log(authUrl)
    console.log(`\nWaiting for the redirect on ${REDIRECT_URI} ...`)
})
