import dotenv from 'dotenv';
dotenv.config();

type DiscordLogLevel = 'ERROR' | 'WARN' | 'OK';
type IssueLevel = Exclude<DiscordLogLevel, 'OK'>;
type LoggedIssue = {
    level: IssueLevel;
    context: string;
};

const levelColors: Record<DiscordLogLevel, number> = {
    ERROR: 0xed4245,
    WARN: 0xfee75c,
    OK: 0x57f287,
};

function truncate(value: string, maxLength: number) {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength - 3)}...`;
}

function oneLine(value: string) {
    return value.replace(/\s+/g, ' ').trim();
}

function getMentionRoleId() {
    const roleId = process.env.DISCORD_MENTION_ROLE_ID?.trim();
    return roleId || undefined;
}

export class DiscordLogger {
    private errorCount = 0;
    private warningCount = 0;
    private issues: LoggedIssue[] = [];
    private missingWebhookWarned = false;
    private readonly scriptName: string;

    constructor(scriptName: string) {
        this.scriptName = scriptName;
    }

    get hasIssues() {
        return this.issues.length > 0;
    }

    error(context: string) {
        this.errorCount += 1;
        this.recordIssue('ERROR', context);
    }

    warn(context: string) {
        this.warningCount += 1;
        this.recordIssue('WARN', context);
    }

    async finish() {
        if (this.hasIssues) {
            const level = this.errorCount > 0 ? 'ERROR' : 'WARN';

            await this.queueMessage(
                level,
                this.formatIssueSummary(),
            );
            return;
        }

        await this.queueMessage(
            'OK',
            'Processing completed with no errors or warnings.',
        );
    }

    private recordIssue(level: IssueLevel, context: string) {
        this.issues.push({ level, context: oneLine(context) });
    }

    private formatIssueSummary() {
        const overview = `Overview: ${this.errorCount} error${
            this.errorCount === 1 ? '' : 's'
        }, ${this.warningCount} warning${
            this.warningCount === 1 ? '' : 's'
        }.`;
        const footer = '\nCheck stored logs for details.';
        const codeBlockOverhead = '\n```\n\n```'.length;
        const maxCodeLength = 2048 - overview.length - footer.length - codeBlockOverhead;
        const issueLines = this.issues
            .map(
                (issue, index) =>
                    `${index + 1}. [${issue.level}] ${truncate(
                        issue.context,
                        140,
                    )}`,
            )
            .join('\n');

        return `${overview}\n\`\`\`\n${truncate(
            issueLines,
            maxCodeLength,
        )}\n\`\`\`${footer}`;
    }

    private async queueMessage(
        level: DiscordLogLevel,
        context: string,
    ) {
        await this.sendMessage(level, context).catch((error: unknown) => {
            console.warn('Failed to send Discord webhook message:', error);
        });
    }

    private async sendMessage(
        level: DiscordLogLevel,
        context: string,
    ) {
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

        if (!webhookUrl) {
            if (!this.missingWebhookWarned) {
                console.warn(
                    'DISCORD_WEBHOOK_URL is not set; skipping Discord webhook messages.',
                );
                this.missingWebhookWarned = true;
            }
            return;
        }

        const roleId = getMentionRoleId();
        const mentionRoleId = roleId && level !== 'OK' ? roleId : undefined;
        const content = mentionRoleId ? `<@&${mentionRoleId}>` : undefined;

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content,
                allowed_mentions: mentionRoleId
                    ? {
                          roles: [mentionRoleId],
                      }
                    : undefined,
                embeds: [
                    {
                        title: `${level}: ${this.scriptName}`,
                        description: truncate(context, 2048),
                        color: levelColors[level],
                        timestamp: new Date().toISOString(),
                    },
                ],
            }),
        });

        if (!response.ok) {
            const responseText = await response.text();
            throw new Error(
                `Discord webhook failed with HTTP ${response.status}: ${responseText}`,
            );
        }
    }
}
