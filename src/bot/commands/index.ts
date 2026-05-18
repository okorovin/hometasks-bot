import type { Bot } from "grammy"
import { addCommand } from "./add.js"
import { todayCommand } from "./today.js"
import { inboxCommand } from "./inbox.js"
import { overdueCommand } from "./overdue.js"
import { weekCommand } from "./week.js"
import { allCommand } from "./all.js"
import { settingsCommand } from "./settings.js"
import { helpCommand } from "./help.js"
import { tagsCommand, tagFilterCommand } from "./tags.js"
import { webCommand } from "./web.js"

export function registerCommands(bot: Bot): void {
    bot.command("start", helpCommand)
    bot.command("help", helpCommand)
    bot.command("add", addCommand)
    bot.command("today", todayCommand)
    bot.command("inbox", inboxCommand)
    bot.command("overdue", overdueCommand)
    bot.command("week", weekCommand)
    bot.command("all", allCommand)
    bot.command("settings", settingsCommand)
    bot.command("tags", tagsCommand)
    bot.command("tag", tagFilterCommand)
    bot.command("web", webCommand)
}

export async function setCommandsMenu(bot: Bot): Promise<void> {
    await bot.api.setMyCommands([
        { command: "add", description: "Add a new task" },
        { command: "today", description: "Tasks due today" },
        { command: "inbox", description: "Tasks without due date" },
        { command: "overdue", description: "Overdue tasks" },
        { command: "week", description: "Tasks for next 7 days" },
        { command: "all", description: "All active tasks" },
        { command: "settings", description: "Bot settings" },
        { command: "tags", description: "List all tags" },
        { command: "tag", description: "Filter tasks by tag" },
        { command: "web", description: "Open web interface" },
        { command: "help", description: "Help" },
    ])
}
