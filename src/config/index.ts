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

    NODE_ENV: optionalEnv("NODE_ENV", "development"),
} as const
