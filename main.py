import os
import asyncio
import random
from datetime import datetime
from telegram import Bot
from telegram.ext import Application, MessageHandler, filters
import anthropic

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
CHANNEL_ID = "@alfaportalvip"
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY")

PROMOS = [
    {"name": "Stake", "url": "alfaportal-vip.com", "type": "casino"},
    {"name": "1Win", "url": "alfaportal-vip.com", "type": "betting"},
    {"name": "Binance", "url": "alfaportal-vip.com", "type": "crypto"},
    {"name": "Bybit", "url": "alfaportal-vip.com", "type": "crypto"},
]

TEMPLATES = [
    "🎰 {name} — Exclusive bonus available now!\n💎 VIP deals only at: {url}",
    "🔥 Big wins happening on {name}!\n🚀 Join the elite: {url}",
    "💰 {name} — Top platform for serious players\n⚡ Access VIP now: {url}",
    "📈 {name} crypto action is heating up!\n💎 Get VIP access: {url}",
    "🏆 {name} — Where winners play\n🎯 VIP Status awaits: {url}",
]

async def post_content(bot):
    promo = random.choice(PROMOS)
    template = random.choice(TEMPLATES)
    message = template.format(name=promo["name"], url=promo["url"])
    await bot.send_message(chat_id=CHANNEL_ID, text=message)
    print(f"Posted at {datetime.now()}: {promo['name']}")

async def auto_reply(update, context):
    if ANTHROPIC_KEY:
        client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
        msg = update.message.text
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            system="You are Alfa Portal VIP assistant. Reply briefly in the same language as the user. Always mention alfaportal-vip.com for more info.",
            messages=[{"role": "user", "content": msg}]
        )
        await update.message.reply_text(response.content[0].text)

async def scheduler(bot):
    HOURS = [9, 15, 21]
    while True:
        now = datetime.now()
        if now.hour in HOURS and now.minute == 0:
            await post_content(bot)
            await asyncio.sleep(61)
        await asyncio.sleep(30)

async def main():
    bot = Bot(token=BOT_TOKEN)
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, auto_reply))
    asyncio.create_task(scheduler(bot))
    await app.run_polling()

if __name__ == "__main__":
    asyncio.run(main())
