---
title: RICO Agent Full
emoji: 🤖
colorFrom: indigo
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
models:
  - mohamedazooz/rico
tags:
  - ai-agent
  - telegram-bot
  - mcp
  - multi-model
  - docker
---

# RICO Agent Full - Complete AI Assistant

## نظرة عامة

RICO Agent Full هي منصة متكاملة لـ AI Agent مع:
- 🤖 **واجهة ويب** - chat interface with multi-MCP support
- 📱 **Telegram Bot** - تحكم عن بعد من Telegram
- 🔄 **تبديل النماذج** - switch between multiple AI models
- 🗄️ **MCPs** - 7 servers (HF, KILO CODE, OpenRouter, ACP, Supabase, Vercel, Telegram)
- 🐳 **Docker** - deployed on Hugging Face Spaces

## التثبيت

### متغيرات البيئة (.env)
```env
HF_TOKEN=hf_...
OPENROUTER_API_KEY=sk-or-v1-...
KILO_CODE_API_KEY=kc_...
TELEGRAM_BOT_TOKEN=your_bot_token
ALLOWED_TELEGRAM_USERS=123456789
DEFAULT_MODEL=mohamedazooz/rico
PORT=7860
```

### تشغيل محلي
```bash
npm install
cp .env.example .env
# Edit .env with your keys
npm start
```

### Docker
```bash
docker build -t rico-agent .
docker run -p 7860:7860 --env-file .env rico-agent
```

## أوامر Telegram Bot
- `/start` - بدء البوت
- `/model` - تغيير النموذج
- `/status` - حالة النظام
- `/clear` - مسح المحادثة
- `/export` - تصدير
- `/help` - مساعدة

## API Endpoints
- `GET /api/status` - حالة النظام
- `POST /api/chat` - إرسال رسالة
- `POST /api/model` - تغيير النموذج
- `GET /api/conversation` - المحادثة
- `DELETE /api/conversation` - مسح المحادثة
- `GET /api/mcp-status` - حالة MCPs
- `GET /health` - فحص صحة

## WebSocket
الاتصال (ws://host:port) للتحديثات في الوقت الفعلي.

## GitHub
هذا المشروع منشور على GitHub: [ rico-agent-full ]

## الترخيص
MIT License
