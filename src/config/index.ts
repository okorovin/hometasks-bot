import "dotenv/config"

function requireEnv(key: string): string {
    const value = process.env[key]
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`)
    }
    return value
}

function optionalEnv(key: string, defaultValue: string): string {
    return process.env[key] ?? defaultValue
}

export const config = {
    BOT_TOKEN: requireEnv("BOT_TOKEN"),
    DATABASE_URL: requireEnv("DATABASE_URL"),
    ALLOWED_TELEGRAM_IDS: requireEnv("ALLOWED_TELEGRAM_IDS")
        .split(",")
        .map((id) => BigInt(id.trim())),

    LLM_BASE_URL: optionalEnv("LLM_BASE_URL", "https://api.openai.com/v1"),
    LLM_API_KEY: optionalEnv("LLM_API_KEY", ""),
    LLM_MODEL: optionalEnv("LLM_MODEL", "gpt-4o-mini"),

    WHISPER_MODEL: optionalEnv("WHISPER_MODEL", "whisper-1"),

    JWT_SECRET: requireEnv("JWT_SECRET"),
    WEB_URL: optionalEnv("WEB_URL", "http://localhost:3000"),
    PORT: parseInt(optionalEnv("PORT", "3000"), 10),

    // Gmail hourly digest (optional; feature disabled unless all three are set)
    GMAIL_CLIENT_ID: optionalEnv("GMAIL_CLIENT_ID", ""),
    GMAIL_CLIENT_SECRET: optionalEnv("GMAIL_CLIENT_SECRET", ""),
    GMAIL_REFRESH_TOKEN: optionalEnv("GMAIL_REFRESH_TOKEN", ""),
    // Recipient chat id; defaults to the single ALLOWED_TELEGRAM_IDS entry when empty
    GMAIL_NOTIFY_TELEGRAM_ID: optionalEnv("GMAIL_NOTIFY_TELEGRAM_ID", ""),

    NODE_ENV: optionalEnv("NODE_ENV", "development"),
} as const
