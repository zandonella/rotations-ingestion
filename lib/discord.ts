import dotenv from 'dotenv';
dotenv.config();

export default async function discordAlert(message: string) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        console.warn('DISCORD_WEBHOOK_URL not set, skipping alert');
        return;
    }
    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: message,
            }),
        });
    } catch (error) {
        console.error('Error sending Discord alert:', error);
        return;
    }
}
