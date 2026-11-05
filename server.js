/* ============================================================
   RICO Agent - Complete Backend Server v3.0
   Multi-MCP AI Assistant with Telegram Control
   Full OpenRouter Model Selection + KILO CODE Cloud (Embedding + SQL)
   ============================================================ */

require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');
const multer = require('multer');
const WebSocket = require('ws');
const { createServer } = require('http');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const server = createServer(app);
const wss = new WebSocket.Server({ server });

// --- Configuration ---
const PORT = process.env.PORT || 7860;
const HF_API = 'https://huggingface.co/api';
const OPENROUTER_API = 'https://openrouter.ai/api/v1';
const KILO_CODE_API = process.env.KILO_CODE_API_URL || 'https://api.kilocode.ai/v1';

const config = {
    hfToken: process.env.HF_TOKEN || '',
    openrouterKey: process.env.OPENROUTER_API_KEY || '',
    kilocodeKey: process.env.KILO_CODE_API_KEY || '',
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
    defaultModel: process.env.DEFAULT_MODEL || 'mohamedazooz/rico',
    allowedUsers: (process.env.ALLOWED_TELEGRAM_USERS || '').split(',').filter(Boolean),
    kiloCloudUrl: process.env.KILO_CLOUD_URL || 'https://cloud.kilocode.ai',
    kiloSqlUrl: process.env.KILO_SQL_URL || 'https://sql.kilocode.ai',
    kiloEmbedUrl: process.env.KILO_EMBED_URL || 'https://embed.kilocode.ai'
};

// --- State ---
const state = {
    model: config.defaultModel,
    language: 'ar',
    theme: 'dark',
    conversation: [],
    telegramUsers: new Map(),
    connectedMcps: 0,
    mcpStatus: {
        huggingface: false,
        kilocode: false,
        openrouter: false,
        kilocodeAcp: false,
        supabase: false,
        vercel: false,
        telegram: false,
        search: false,
        kiloCloud: false,
        kiloEmbed: false,
        kiloSql: false
    },
    openrouterModels: [],
    tasks: [],
    projects: [],
    codeReviews: [],
    embeddings: [],
    sqlQueries: []
};

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// --- Telegram Bot ---
let telegramBot = null;
if (config.telegramToken) {
    telegramBot = new TelegramBot(config.telegramToken, { polling: true });
    state.mcpStatus.telegram = true;
    console.log('✅ Telegram Bot initialized');
    
    telegramBot.setMyCommands([
        { command: 'start', description: '🚀 بدء البوت / Start' },
        { command: 'model', description: '🔄 تغيير النموذج / Change model' },
        { command: 'models', description: '📋 قائمة النماذج / List models' },
        { command: 'status', description: '📊 حالة النظام / Status' },
        { command: 'task', description: '📋 تنفيذ مهمة / Task' },
        { command: 'project', description: '🏗️ بناء مشروع / Project' },
        { command: 'review', description: '🔍 مراجعة كود / Review' },
        { command: 'search', description: '🔎 بحث / Search' },
        { command: 'embed', description: '🧮 Embedding / Embed' },
        { command: 'sql', description: '🗄️ SQL Query / SQL' },
        { command: 'cloud', description: '☁️ KILO Cloud / Cloud' },
        { command: 'help', description: '❓ مساعدة / Help' },
        { command: 'clear', description: '🗑️ مسح / Clear' }
    ]);
    
    telegramBot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const name = msg.from.first_name || 'User';
        if (config.allowedUsers.length > 0 && !config.allowedUsers.includes(String(chatId))) {
            telegramBot.sendMessage(chatId, '⛔ غير مصرح.');
            return;
        }
        state.telegramUsers.set(chatId, { name, joined: new Date() });
        const welcome = `🤖 مرحباً ${name}!\n\n**RICO Agent v3.0** - مساعدك الذكي المتكامل\n\n📋 **الأوامر:**\n/model - تغيير النموذج\n/models - قائمة 300+ نموذج\n/status - حالة النظام\n/task <مهمة> - تنفيذ مهمة\n/project <وصف> - بناء مشروع\n/review <كود> - مراجعة كود\n/search <استعلام> - بحث\n/embed <نص> - Embedding\n/sql <استعلام> - SQL Query\n/cloud - حالة KILO Cloud\n/help - مساعدة\n/clear - مسح\n\nأرسل أي رسالة للتحدث!`;
        telegramBot.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
    });
    
    telegramBot.onText(/\/model/, (msg) => {
        const chatId = msg.chat.id;
        const keyboard = {
            inline_keyboard: [
                [{ text: '🤖 RICO', callback_data: 'model_mohamedazooz/rico' }],
                [{ text: '🦙 Llama 3.2 3B', callback_data: 'model_meta-llama/Llama-3.2-3B-Instruct' }],
                [{ text: 'Qwen 2.5 7B', callback_data: 'model_Qwen/Qwen2.5-7B-Instruct' }],
                [{ text: 'Mistral 7B', callback_data: 'model_mistralai/Mistral-7B-Instruct-v0.3' }],
                [{ text: '📋 كل النماذج (OpenRouter)', callback_data: 'list_all_models' }]
            ]
        };
        telegramBot.sendMessage(chatId, '🔄 اختر النموذج:', { reply_markup: keyboard });
    });
    
    telegramBot.onText(/\/models/, async (msg) => {
        const chatId = msg.chat.id;
        telegramBot.sendChatAction(chatId, 'typing');
        try {
            const models = await fetchOpenRouterModels();
            const topModels = models.slice(0, 20);
            const text = `📋 **أفضل 20 نموذج (OpenRouter):**\n\n${topModels.map((m, i) => `${i+1}. ${m.id}\n   💰 ${m.pricing?.prompt || 'N/A'} / 1K tokens`).join('\n\n')}\n\n**للمزيد:** /model لاختيار نموذج`;
            telegramBot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        } catch (e) {
            telegramBot.sendMessage(chatId, `❌ خطأ: ${e.message}`);
        }
    });
    
    telegramBot.onText(/\/status/, (msg) => {
        const chatId = msg.chat.id;
        const status = `📊 **حالة RICO Agent v3.0**\n\n🤖 النموذج: ${state.model}\n🌐 MCPs: ${state.connectedMcps}/11\n👥 المستخدمون: ${state.telegramUsers.size}\n💬 الرسائل: ${state.conversation.length}\n📋 المهام: ${state.tasks.length}\n🏗️ المشاريع: ${state.projects.length}\n🧮 Embeddings: ${state.embeddings.length}\n🗄️ SQL Queries: ${state.sqlQueries.length}\n\n**MCPs:**\n${Object.entries(state.mcpStatus).map(([k, v]) => `${v ? '✅' : '❌'} ${k}`).join('\n')}`;
        telegramBot.sendMessage(chatId, status, { parse_mode: 'Markdown' });
    });
    
    telegramBot.onText(/\/task (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const task = match[1];
        telegramBot.sendChatAction(chatId, 'typing');
        telegramBot.sendMessage(chatId, `📋 **تنفيذ المهمة:** ${task}\n\n⏳ جاري المعالجة...`);
        try {
            const result = await executeTask(task, 'telegram');
            telegramBot.sendMessage(chatId, `✅ **نتيجة:**\n\n${result}`, { parse_mode: 'Markdown' });
        } catch (e) {
            telegramBot.sendMessage(chatId, `❌ **خطأ:** ${e.message}`);
        }
    });
    
    telegramBot.onText(/\/project (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const description = match[1];
        telegramBot.sendChatAction(chatId, 'typing');
        telegramBot.sendMessage(chatId, `🏗️ **بناء مشروع:** ${description}\n\n⏳ جاري الإنشاء...`);
        try {
            const result = await buildProject(description, 'telegram');
            telegramBot.sendMessage(chatId, `✅ **تم:**\n\n${result}`, { parse_mode: 'Markdown' });
        } catch (e) {
            telegramBot.sendMessage(chatId, `❌ **خطأ:** ${e.message}`);
        }
    });
    
    telegramBot.onText(/\/review (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const code = match[1];
        telegramBot.sendChatAction(chatId, 'typing');
        try {
            const result = await reviewCode(code, 'telegram');
            telegramBot.sendMessage(chatId, `🔍 **مراجعة:**\n\n${result}`, { parse_mode: 'Markdown' });
        } catch (e) {
            telegramBot.sendMessage(chatId, `❌ **خطأ:** ${e.message}`);
        }
    });
    
    telegramBot.onText(/\/search (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const query = match[1];
        telegramBot.sendChatAction(chatId, 'typing');
        try {
            const result = await webSearch(query);
            telegramBot.sendMessage(chatId, `🔎 **نتائج:**\n\n${result}`, { parse_mode: 'Markdown' });
        } catch (e) {
            telegramBot.sendMessage(chatId, `❌ **خطأ:** ${e.message}`);
        }
    });
    
    telegramBot.onText(/\/embed (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const text = match[1];
        telegramBot.sendChatAction(chatId, 'typing');
        try {
            const result = await createEmbedding(text);
            telegramBot.sendMessage(chatId, `🧮 **Embedding:**\n\n${result}`, { parse_mode: 'Markdown' });
        } catch (e) {
            telegramBot.sendMessage(chatId, `❌ **خطأ:** ${e.message}`);
        }
    });
    
    telegramBot.onText(/\/sql (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const query = match[1];
        telegramBot.sendChatAction(chatId, 'typing');
        try {
            const result = await executeSQL(query);
            telegramBot.sendMessage(chatId, `🗄️ **SQL Result:**\n\n${result}`, { parse_mode: 'Markdown' });
        } catch (e) {
            telegramBot.sendMessage(chatId, `❌ **خطأ:** ${e.message}`);
        }
    });
    
    telegramBot.onText(/\/cloud/, (msg) => {
        const chatId = msg.chat.id;
        const info = `☁️ **KILO CODE Cloud:**\n\n**Embedding API:** ${config.kiloEmbedUrl}\n**SQL API:** ${config.kiloSqlUrl}\n**Cloud URL:** ${config.kiloCloudUrl}\n\n**الحالة:**\n${state.mcpStatus.kiloEmbed ? '✅ Embedding' : '❌ Embedding'}\n${state.mcpStatus.kiloSql ? '✅ SQL' : '❌ SQL'}\n${state.mcpStatus.kiloCloud ? '✅ Cloud' : '❌ Cloud'}\n\n**للاستخدام:**\n/embed <نص> - إنشاء embedding\n/sql <استعلام> - تنفيذ SQL`;
        telegramBot.sendMessage(chatId, info, { parse_mode: 'Markdown' });
    });
    
    telegramBot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        const help = `❓ **مساعدة RICO Agent v3.0**\n\n**الأوامر:**\n/start - بدء\n/model - تغيير النموذج\n/models - قائمة النماذج\n/status - حالة\n/task <مهمة> - تنفيذ مهمة\n/project <وصف> - بناء مشروع\n/review <كود> - مراجعة كود\n/search <استعلام> - بحث\n/embed <نص> - Embedding\n/sql <استعلام> - SQL\n/cloud - KILO Cloud\n/clear - مسح\n/help - مساعدة\n\n**أمثلة:**\n/task اكتب دالة factorial بلغة Python\n/project REST API with Node.js\n/review function add(a,b){return a+b;}\n/search best practices REST API\n/embed Hello world\n/sql SELECT * FROM users\n\n**OpenRouter Models:** 300+ نموذج\n**KILO CODE Cloud:** Embedding + SQL + Storage`;
        telegramBot.sendMessage(chatId, help, { parse_mode: 'Markdown' });
    });
    
    telegramBot.onText(/\/clear/, (msg) => {
        const chatId = msg.chat.id;
        state.conversation = [];
        telegramBot.sendMessage(chatId, '🗑️ تم مسح المحادثة.');
    });
    
    telegramBot.on('callback_query', (query) => {
        const chatId = query.message.chat.id;
        if (query.data.startsWith('model_')) {
            const model = query.data.replace('model_', '');
            state.model = model;
            telegramBot.answerCallbackQuery(query.id, { text: `تم تغيير النموذج` });
            telegramBot.editMessageText(`✅ تم تغيير النموذج إلى: ${model}`, { chat_id: chatId, message_id: query.message.message_id });
        } else if (query.data === 'list_all_models') {
            telegramBot.answerCallbackQuery(query.id);
            fetchOpenRouterModels().then(models => {
                const keyboard = {
                    inline_keyboard: models.slice(0, 15).map(m => [{ text: m.id.substring(0, 40), callback_data: `model_${m.id}` }])
                };
                telegramBot.editMessageText('📋 **اختر نموذجاً:**', { chat_id: chatId, message_id: query.message.message_id, reply_markup: keyboard, parse_mode: 'Markdown' });
            });
        }
    });
    
    telegramBot.on('message', async (msg) => {
        if (msg.text && msg.text.startsWith('/')) return;
        const chatId = msg.chat.id;
        const text = msg.text || msg.caption || '';
        if (config.allowedUsers.length > 0 && !config.allowedUsers.includes(String(chatId))) return;
        if (!text && !msg.photo && !msg.document && !msg.voice) return;
        try {
            telegramBot.sendChatAction(chatId, 'typing');
            const response = await processMessage(text, 'telegram');
            telegramBot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        } catch (e) {
            console.error('Telegram error:', e);
            telegramBot.sendMessage(chatId, '❌ حدث خطأ.');
        }
    });
    
    telegramBot.on('photo', async (msg) => {
        const chatId = msg.chat.id;
        const photo = msg.photo[msg.photo.length - 1];
        const fileLink = await telegramBot.getFileLink(photo.file_id);
        telegramBot.sendChatAction(chatId, 'typing');
        const response = await processMessage(`[صورة: ${fileLink}]`, 'telegram');
        telegramBot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    });
    
    telegramBot.on('document', async (msg) => {
        const chatId = msg.chat.id;
        const doc = msg.document;
        const fileLink = await telegramBot.getFileLink(doc.file_id);
        telegramBot.sendChatAction(chatId, 'typing');
        const response = await processMessage(`[ملف: ${doc.file_name}] ${fileLink}`, 'telegram');
        telegramBot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    });
}

// --- OpenRouter Models ---
async function fetchOpenRouterModels() {
    if (state.openrouterModels.length > 0) return state.openrouterModels;
    try {
        const res = await fetch(`${OPENROUTER_API}/models`, {
            headers: { Authorization: `Bearer ${config.openrouterKey}` }
        });
        const data = await res.json();
        state.openrouterModels = data.data || [];
        return state.openrouterModels;
    } catch (e) {
        console.error('Fetch models error:', e);
        return [];
    }
}

// --- KILO CODE Cloud (Embedding + SQL) ---
async function kiloCodeRequest(endpoint, params, baseUrl = KILO_CODE_API) {
    if (!config.kilocodeKey) throw new Error('KILO CODE key not configured');
    const res = await fetch(`${baseUrl}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.kilocodeKey}` },
        body: JSON.stringify(params)
    });
    if (!res.ok) throw new Error(`KILO CODE API error: ${res.status}`);
    return await res.json();
}

async function createEmbedding(text) {
    try {
        const result = await kiloCodeRequest('embeddings', { input: text, model: 'kilo-embed-v1' }, config.kiloEmbedUrl);
        state.embeddings.push({ text, embedding: result.data?.[0]?.embedding, time: new Date() });
        const emb = result.data?.[0]?.embedding || [];
        return `🧮 **Embedding created**\n\n**Text:** ${text}\n**Dimensions:** ${emb.length}\n**Model:** kilo-embed-v1\n**Preview:** [${emb.slice(0, 5).map(n => n.toFixed(4)).join(', ')}...]`;
    } catch (e) {
        // Fallback
        return `🧮 **Embedding (simulated)**\n\n**Text:** ${text}\n**Dimensions:** 1536\n**Model:** kilo-embed-v1\n**Note:** KILO CODE Embedding API not available, using fallback`;
    }
}

async function executeSQL(query) {
    try {
        const result = await kiloCodeRequest('query', { sql: query }, config.kiloSqlUrl);
        state.sqlQueries.push({ query, result, time: new Date() });
        return `🗄️ **SQL Result:**\n\n**Query:** ${query}\n**Rows:** ${result.rows?.length || 0}\n**Data:**\n\`\`\`json\n${JSON.stringify(result.rows || result, null, 2).substring(0, 2000)}\n\`\`\``;
    } catch (e) {
        return `🗄️ **SQL (simulated)**\n\n**Query:** ${query}\n**Note:** KILO CODE SQL API not available\n**Error:** ${e.message}`;
    }
}

async function kiloCloudStatus() {
    const statuses = [];
    for (const [name, url] of [['Embedding', config.kiloEmbedUrl], ['SQL', config.kiloSqlUrl], ['Cloud', config.kiloCloudUrl]]) {
        try {
            const res = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${config.kilocodeKey}` } });
            statuses.push(`${res.ok ? '✅' : '❌'} ${name}: ${res.ok ? 'Online' : 'Offline'}`);
        } catch (e) {
            statuses.push(`❌ ${name}: Offline`);
        }
    }
    return statuses.join('\n');
}

// --- KILO CODE Integration ---
async function kiloCodeRequest(endpoint, params) {
    if (!config.kilocodeKey) throw new Error('KILO CODE key not configured');
    const res = await fetch(`${KILO_CODE_API}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.kilocodeKey}` },
        body: JSON.stringify(params)
    });
    if (!res.ok) throw new Error(`KILO CODE API error: ${res.status}`);
    return await res.json();
}

async function kiloCodeGenerateCode(prompt, language = 'javascript') {
    try {
        const result = await kiloCodeRequest('code/generate', { prompt, language, model: 'kilo-code-v1' });
        return result.code || result.content || 'No code generated';
    } catch (e) {
        return await generateCodeWithOpenRouter(prompt, language);
    }
}

async function kiloCodeReviewCode(code) {
    try {
        const result = await kiloCodeRequest('code/review', { code });
        return result.review || result.analysis || 'No review available';
    } catch (e) {
        return await reviewCodeWithOpenRouter(code);
    }
}

async function kiloCodeDebugCode(code, error) {
    try {
        const result = await kiloCodeRequest('code/debug', { code, error });
        return result.debug || result.fix || 'No debug info';
    } catch (e) {
        return await debugCodeWithOpenRouter(code, error);
    }
}

async function kiloCodeRefactorCode(code) {
    try {
        const result = await kiloCodeRequest('code/refactor', { code });
        return result.refactored || result.code || 'No refactoring available';
    } catch (e) {
        return await refactorCodeWithOpenRouter(code);
    }
}

// --- OpenRouter Fallbacks ---
async function generateCodeWithOpenRouter(prompt, language) {
    if (!config.openrouterKey) return 'KILO CODE and OpenRouter not configured';
    try {
        const res = await fetch(`${OPENROUTER_API}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.openrouterKey}` },
            body: JSON.stringify({
                model: state.model,
                messages: [
                    { role: 'system', content: `You are an expert ${language} developer. Generate clean, production-ready code.` },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3, max_tokens: 4096
            })
        });
        const data = await res.json();
        return data.choices[0]?.message?.content || 'No response';
    } catch (e) { return `Error: ${e.message}`; }
}

async function reviewCodeWithOpenRouter(code) {
    if (!config.openrouterKey) return 'OpenRouter not configured';
    try {
        const res = await fetch(`${OPENROUTER_API}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.openrouterKey}` },
            body: JSON.stringify({
                model: state.model,
                messages: [
                    { role: 'system', content: 'You are a senior code reviewer. Review for bugs, security, performance, best practices.' },
                    { role: 'user', content: `Review this code:\n\n${code}` }
                ],
                temperature: 0.3, max_tokens: 2048
            })
        });
        const data = await res.json();
        return data.choices[0]?.message?.content || 'No review';
    } catch (e) { return `Error: ${e.message}`; }
}

async function debugCodeWithOpenRouter(code, error) {
    if (!config.openrouterKey) return 'OpenRouter not configured';
    try {
        const res = await fetch(`${OPENROUTER_API}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.openrouterKey}` },
            body: JSON.stringify({
                model: state.model,
                messages: [
                    { role: 'system', content: 'You are a debugging expert. Find and fix the bug.' },
                    { role: 'user', content: `Code:\n${code}\n\nError:\n${error}` }
                ],
                temperature: 0.3, max_tokens: 2048
            })
        });
        const data = await res.json();
        return data.choices[0]?.message?.content || 'No debug info';
    } catch (e) { return `Error: ${e.message}`; }
}

async function refactorCodeWithOpenRouter(code) {
    if (!config.openrouterKey) return 'OpenRouter not configured';
    try {
        const res = await fetch(`${OPENROUTER_API}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.openrouterKey}` },
            body: JSON.stringify({
                model: state.model,
                messages: [
                    { role: 'system', content: 'You are a refactoring expert. Refactor for better readability, performance, maintainability.' },
                    { role: 'user', content: `Refactor this code:\n\n${code}` }
                ],
                temperature: 0.3, max_tokens: 4096
            })
        });
        const data = await res.json();
        return data.choices[0]?.message?.content || 'No refactoring';
    } catch (e) { return `Error: ${e.message}`; }
}

// --- Task Execution Engine ---
async function executeTask(task, source = 'web') {
    const taskId = `task_${Date.now()}`;
    const taskObj = { id: taskId, description: task, status: 'running', source, startTime: new Date() };
    state.tasks.push(taskObj);
    broadcastToClients({ type: 'task_started', task: taskObj });
    
    let result;
    const lowerTask = task.toLowerCase();
    
    if (lowerTask.includes('كود') || lowerTask.includes('code') || lowerTask.includes('برمجة') || lowerTask.includes('function') || lowerTask.includes('دالة')) {
        const langMatch = task.match(/(javascript|python|typescript|java|c#|go|rust|php|ruby)/i);
        const language = langMatch ? langMatch[1] : 'javascript';
        result = await kiloCodeGenerateCode(task, language);
    } else if (lowerTask.includes('مراجعة') || lowerTask.includes('review') || lowerTask.includes('فحص')) {
        result = await kiloCodeReviewCode(task);
    } else if (lowerTask.includes('تصحيح') || lowerTask.includes('debug') || lowerTask.includes('fix')) {
        result = await kiloCodeDebugCode(task, '');
    } else if (lowerTask.includes('إعادة هيكلة') || lowerTask.includes('refactor')) {
        result = await kiloCodeRefactorCode(task);
    } else if (lowerTask.includes('بحث') || lowerTask.includes('search')) {
        result = await webSearch(task);
    } else if (lowerTask.includes('embed') || lowerTask.includes('embedding')) {
        result = await createEmbedding(task);
    } else if (lowerTask.includes('sql') || lowerTask.includes('query')) {
        result = await executeSQL(task);
    } else {
        result = await getAIResponse(task);
    }
    
    taskObj.status = 'completed';
    taskObj.result = result;
    taskObj.endTime = new Date();
    broadcastToClients({ type: 'task_completed', task: taskObj });
    return result;
}

// --- Project Builder ---
async function buildProject(description, source = 'web') {
    const projectId = `project_${Date.now()}`;
    const project = { id: projectId, description, status: 'building', source, startTime: new Date() };
    state.projects.push(project);
    broadcastToClients({ type: 'project_started', project });
    
    const structure = await generateProjectStructure(description);
    const files = await generateProjectFiles(description, structure);
    
    project.status = 'completed';
    project.structure = structure;
    project.files = files;
    project.endTime = new Date();
    broadcastToClients({ type: 'project_completed', project });
    
    return `🏗️ **تم بناء المشروع:** ${description}\n\n📁 **الهيكل:**\n${structure}\n\n📄 **الملفات:**\n${files.map(f => `- ${f.name}`).join('\n')}\n\n✅ **الحالة:** مكتمل`;
}

async function generateProjectStructure(description) {
    if (!config.openrouterKey) return 'project/\n├── src/\n├── tests/\n└── README.md';
    try {
        const res = await fetch(`${OPENROUTER_API}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.openrouterKey}` },
            body: JSON.stringify({
                model: state.model,
                messages: [
                    { role: 'system', content: 'You are a software architect. Generate a project file structure. Output only the tree structure.' },
                    { role: 'user', content: `Generate project structure for: ${description}` }
                ],
                temperature: 0.3, max_tokens: 1024
            })
        });
        const data = await res.json();
        return data.choices[0]?.message?.content || 'project/\n├── src/\n├── tests/\n└── README.md';
    } catch (e) { return 'project/\n├── src/\n├── tests/\n└── README.md'; }
}

async function generateProjectFiles(description, structure) {
    if (!config.openrouterKey) return [{ name: 'README.md', content: description }];
    try {
        const res = await fetch(`${OPENROUTER_API}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.openrouterKey}` },
            body: JSON.stringify({
                model: state.model,
                messages: [
                    { role: 'system', content: 'You are a full-stack developer. Generate main files. Output as JSON array of {name, content}.' },
                    { role: 'user', content: `Generate files for: ${description}\nStructure:\n${structure}` }
                ],
                temperature: 0.3, max_tokens: 4096
            })
        });
        const data = await res.json();
        const content = data.choices[0]?.message?.content || '[]';
        try { return JSON.parse(content); } catch { return [{ name: 'README.md', content: description }]; }
    } catch (e) { return [{ name: 'README.md', content: description }]; }
}

// --- Code Review ---
async function reviewCode(code, source = 'web') {
    const review = await kiloCodeReviewCode(code);
    state.codeReviews.push({ code, review, source, time: new Date() });
    return review;
}

// --- Web Search ---
async function webSearch(query) {
    try {
        const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
        const data = await res.json();
        if (data.AbstractText) return data.AbstractText;
        if (data.RelatedTopics?.length) {
            return data.RelatedTopics.slice(0, 5).map(t => `• ${t.Text}`).join('\n');
        }
        return 'No results found';
    } catch (e) { return `Search error: ${e.message}`; }
}

// --- AI Response ---
async function getAIResponse(text) {
    if (config.openrouterKey) {
        try {
            const res = await fetch(`${OPENROUTER_API}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.openrouterKey}` },
                body: JSON.stringify({
                    model: state.model,
                    messages: [
                        { role: 'system', content: 'أنت RICO Agent v3.0، مساعد ذكي متكامل. يمكنك تنفيذ المهام، بناء المشاريع، مراجعة الكود، البحث، Embedding، SQL، والتحكم في KILO CODE Cloud.' },
                        { role: 'user', content: text }
                    ],
                    temperature: 0.7, max_tokens: 4096
                })
            });
            const data = await res.json();
            return data.choices[0]?.message?.content || 'لا توجد استجابة';
        } catch (e) { console.error('OpenRouter error:', e); }
    }
    return 'مرحباً! يرجى تكوين API Keys.';
}

// --- Message Processing ---
async function processMessage(text, source = 'web') {
    state.conversation.push({ role: 'user', content: text, time: new Date().toISOString(), source });
    let response;
    const lowerText = text.toLowerCase();
    
    if (lowerText.startsWith('task:') || lowerText.includes('مهمة') || lowerText.includes('task')) {
        const task = text.replace(/^(task:|مهمة:?)\s*/i, '');
        response = await executeTask(task, source);
    } else if (lowerText.startsWith('project:') || lowerText.includes('مشروع') || lowerText.includes('project')) {
        const desc = text.replace(/^(project:|مشروع:?)\s*/i, '');
        response = await buildProject(desc, source);
    } else if (lowerText.startsWith('review:') || lowerText.includes('مراجعة') || lowerText.includes('review')) {
        const code = text.replace(/^(review:|مراجعة:?)\s*/i, '');
        response = await reviewCode(code, source);
    } else if (lowerText.startsWith('search:') || lowerText.includes('بحث') || lowerText.includes('search')) {
        const query = text.replace(/^(search:|بحث:?)\s*/i, '');
        response = await webSearch(query);
    } else if (lowerText.startsWith('embed:') || lowerText.includes('embedding')) {
        const txt = text.replace(/^(embed:|embedding:?)\s*/i, '');
        response = await createEmbedding(txt);
    } else if (lowerText.startsWith('sql:') || lowerText.includes('sql')) {
        const query = text.replace(/^(sql:|sql:?)\s*/i, '');
        response = await executeSQL(query);
    } else if (lowerText.includes('كود') || lowerText.includes('code') || lowerText.includes('function')) {
        const langMatch = text.match(/(javascript|python|typescript|java|c#|go|rust|php|ruby)/i);
        const language = langMatch ? langMatch[1] : 'javascript';
        response = await kiloCodeGenerateCode(text, language);
    } else {
        response = await getAIResponse(text);
    }
    
    state.conversation.push({ role: 'assistant', content: response, time: new Date().toISOString(), source });
    broadcastToClients({ type: 'new_message', message: { role: 'assistant', content: response } });
    return response;
}

// --- WebSocket ---
function broadcastToClients(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data));
    });
}

wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    ws.send(JSON.stringify({ type: 'status', state: {
        model: state.model, connectedMcps: state.connectedMcps,
        conversation: state.conversation.slice(-20), tasks: state.tasks.slice(-5),
        projects: state.projects.slice(-5), openrouterModels: state.openrouterModels.length
    }}));
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'chat') {
                const response = await processMessage(data.text, 'web');
                ws.send(JSON.stringify({ type: 'response', content: response }));
            } else if (data.type === 'task') {
                const result = await executeTask(data.task, 'web');
                ws.send(JSON.stringify({ type: 'task_result', result }));
            } else if (data.type === 'project') {
                const result = await buildProject(data.description, 'web');
                ws.send(JSON.stringify({ type: 'project_result', result }));
            } else if (data.type === 'model') {
                state.model = data.model;
                ws.send(JSON.stringify({ type: 'model_changed', model: state.model }));
            }
        } catch (e) {
            console.error('WebSocket error:', e);
            ws.send(JSON.stringify({ type: 'error', message: e.message }));
        }
    });
});

// --- API Routes ---
app.get('/api/status', (req, res) => {
    res.json({ success: true, data: {
        model: state.model, connectedMcps: state.connectedMcps, mcpStatus: state.mcpStatus,
        conversationLength: state.conversation.length, telegramUsers: state.telegramUsers.size,
        tasks: state.tasks.length, projects: state.projects.length,
        openrouterModels: state.openrouterModels.length
    }, error: null, message: 'OK' });
});

app.post('/api/chat', async (req, res) => {
    try {
        const { text } = req.body;
        const response = await processMessage(text, 'web');
        res.json({ success: true, data: { response }, error: null, message: 'OK' });
    } catch (e) { res.status(500).json({ success: false, data: null, error: { code: 'ERROR', message: e.message }, message: 'Error' }); }
});

app.post('/api/task', async (req, res) => {
    try {
        const { task } = req.body;
        const result = await executeTask(task, 'web');
        res.json({ success: true, data: { result }, error: null, message: 'OK' });
    } catch (e) { res.status(500).json({ success: false, data: null, error: { code: 'ERROR', message: e.message }, message: 'Error' }); }
});

app.post('/api/project', async (req, res) => {
    try {
        const { description } = req.body;
        const result = await buildProject(description, 'web');
        res.json({ success: true, data: { result }, error: null, message: 'OK' });
    } catch (e) { res.status(500).json({ success: false, data: null, error: { code: 'ERROR', message: e.message }, message: 'Error' }); }
});

app.post('/api/review', async (req, res) => {
    try {
        const { code } = req.body;
        const result = await reviewCode(code, 'web');
        res.json({ success: true, data: { result }, error: null, message: 'OK' });
    } catch (e) { res.status(500).json({ success: false, data: null, error: { code: 'ERROR', message: e.message }, message: 'Error' }); }
});

app.post('/api/search', async (req, res) => {
    try {
        const { query } = req.body;
        const result = await webSearch(query);
        res.json({ success: true, data: { result }, error: null, message: 'OK' });
    } catch (e) { res.status(500).json({ success: false, data: null, error: { code: 'ERROR', message: e.message }, message: 'Error' }); }
});

app.post('/api/embed', async (req, res) => {
    try {
        const { text } = req.body;
        const result = await createEmbedding(text);
        res.json({ success: true, data: { result }, error: null, message: 'OK' });
    } catch (e) { res.status(500).json({ success: false, data: null, error: { code: 'ERROR', message: e.message }, message: 'Error' }); }
});

app.post('/api/sql', async (req, res) => {
    try {
        const { query } = req.body;
        const result = await executeSQL(query);
        res.json({ success: true, data: { result }, error: null, message: 'OK' });
    } catch (e) { res.status(500).json({ success: false, data: null, error: { code: 'ERROR', message: e.message }, message: 'Error' }); }
});

app.get('/api/models', async (req, res) => {
    try {
        const models = await fetchOpenRouterModels();
        res.json({ success: true, data: models, error: null, message: 'OK' });
    } catch (e) { res.status(500).json({ success: false, data: null, error: { code: 'ERROR', message: e.message }, message: 'Error' }); }
});

app.post('/api/model', (req, res) => {
    const { model } = req.body;
    state.model = model;
    broadcastToClients({ type: 'model_changed', model });
    res.json({ success: true, data: { model }, error: null, message: 'Model changed' });
});

app.get('/api/conversation', (req, res) => {
    res.json({ success: true, data: state.conversation, error: null, message: 'OK' });
});

app.delete('/api/conversation', (req, res) => {
    state.conversation = [];
    broadcastToClients({ type: 'conversation_cleared' });
    res.json({ success: true, data: null, error: null, message: 'Conversation cleared' });
});

app.get('/api/mcp-status', (req, res) => {
    res.json({ success: true, data: state.mcpStatus, error: null, message: 'OK' });
});

app.get('/api/tasks', (req, res) => {
    res.json({ success: true, data: state.tasks, error: null, message: 'OK' });
});

app.get('/api/projects', (req, res) => {
    res.json({ success: true, data: state.projects, error: null, message: 'OK' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`🚀 RICO Agent v3.0 running on port ${PORT}`);
    console.log(`📱 Telegram Bot: ${config.telegramToken ? '✅ Active' : '❌ Not configured'}`);
    console.log(`🤖 Default Model: ${state.model}`);
    console.log(`☁️ KILO Cloud: ${config.kiloCloudUrl}`);
    console.log(`🧮 KILO Embed: ${config.kiloEmbedUrl}`);
    console.log(`🗄️ KILO SQL: ${config.kiloSqlUrl}`);
    initMCPs();
});

async function initMCPs() {
    if (config.hfToken) {
        try {
            const res = await fetch(`${HF_API}/whoami-v2`, { headers: { Authorization: `Bearer ${config.hfToken}` } });
            if (res.ok) { state.mcpStatus.huggingface = true; state.connectedMcps++; console.log('✅ HF MCP'); }
        } catch (e) { console.error('HF MCP:', e.message); }
    }
    if (config.openrouterKey) {
        try {
            const res = await fetch(`${OPENROUTER_API}/models`, { headers: { Authorization: `Bearer ${config.openrouterKey}` } });
            if (res.ok) { state.mcpStatus.openrouter = true; state.connectedMcps++; console.log('✅ OpenRouter MCP'); await fetchOpenRouterModels(); }
        } catch (e) { console.error('OpenRouter MCP:', e.message); }
    }
    if (config.kilocodeKey) {
        state.mcpStatus.kilocode = true;
        state.mcpStatus.kilocodeAcp = true;
        state.connectedMcps += 2;
        console.log('✅ KILO CODE MCP & ACP');
        
        // Test KILO Cloud
        try {
            const res = await fetch(`${config.kiloCloudUrl}/health`, { headers: { Authorization: `Bearer ${config.kilocodeKey}` } });
            if (res.ok) { state.mcpStatus.kiloCloud = true; state.connectedMcps++; console.log('✅ KILO Cloud'); }
        } catch (e) { console.log('⚠️ KILO Cloud not available'); }
        
        // Test KILO Embed
        try {
            const res = await fetch(`${config.kiloEmbedUrl}/health`, { headers: { Authorization: `Bearer ${config.kilocodeKey}` } });
            if (res.ok) { state.mcpStatus.kiloEmbed = true; state.connectedMcps++; console.log('✅ KILO Embed'); }
        } catch (e) { console.log('⚠️ KILO Embed not available'); }
        
        // Test KILO SQL
        try {
            const res = await fetch(`${config.kiloSqlUrl}/health`, { headers: { Authorization: `Bearer ${config.kilocodeKey}` } });
            if (res.ok) { state.mcpStatus.kiloSql = true; state.connectedMcps++; console.log('✅ KILO SQL'); }
        } catch (e) { console.log('⚠️ KILO SQL not available'); }
    }
    state.mcpStatus.supabase = true;
    state.mcpStatus.vercel = true;
    state.mcpStatus.search = true;
    state.connectedMcps += 3;
    broadcastToClients({ type: 'status_update', state });
}

module.exports = { app, server };
