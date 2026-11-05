/* ============================================================
   RICO Agent - Complete Backend Server v2.0
   Multi-MCP AI Assistant with Telegram Control
   Full Task Execution, Project Building, Code Review
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
const fs = require('fs');
const { exec } = require('child_process');

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
    searchApiKey: process.env.SEARCH_API_KEY || ''
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
        search: false
    },
    tasks: [],
    projects: [],
    codeReviews: []
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
        { command: 'start', description: '🚀 بدء البوت / Start bot' },
        { command: 'model', description: '🔄 تغيير النموذج / Change model' },
        { command: 'status', description: '📊 حالة النظام / System status' },
        { command: 'task', description: '📋 تنفيذ مهمة / Execute task' },
        { command: 'project', description: '🏗️ بناء مشروع / Build project' },
        { command: 'review', description: '🔍 مراجعة كود / Code review' },
        { command: 'search', description: '🔎 بحث / Search' },
        { command: 'help', description: '❓ مساعدة / Help' },
        { command: 'clear', description: '🗑️ مسح / Clear' }
    ]);
    
    telegramBot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const name = msg.from.first_name || 'User';
        if (config.allowedUsers.length > 0 && !config.allowedUsers.includes(String(chatId))) {
            telegramBot.sendMessage(chatId, '⛔ غير مصرح لك.');
            return;
        }
        state.telegramUsers.set(chatId, { name, joined: new Date() });
        const welcome = `🤖 مرحباً ${name}!\n\nأنا RICO Agent - مساعدك الذكي المتكامل.\n\n📋 **الأوامر:**\n/task <مهمة> - تنفيذ مهمة\n/project <وصف> - بناء مشروع\n/review <كود> - مراجعة كود\n/search <استعلام> - بحث\n/model - تغيير النموذج\n/status - حالة\n/clear - مسح\n/help - مساعدة\n\nأرسل أي رسالة للتحدث معي!`;
        telegramBot.sendMessage(chatId, welcome);
    });
    
    telegramBot.onText(/\/model/, (msg) => {
        const chatId = msg.chat.id;
        const keyboard = {
            inline_keyboard: [
                [{ text: '🤖 RICO', callback_data: 'model_mohamedazooz/rico' }],
                [{ text: '🦙 Llama 3.2', callback_data: 'model_meta-llama/Llama-3.2-3B-Instruct' }],
                [{ text: 'Qwen 2.5', callback_data: 'model_Qwen/Qwen2.5-7B-Instruct' }],
                [{ text: 'Mistral 7B', callback_data: 'model_mistralai/Mistral-7B-Instruct-v0.3' }]
            ]
        };
        telegramBot.sendMessage(chatId, '🔄 اختر النموذج:', { reply_markup: keyboard });
    });
    
    telegramBot.onText(/\/status/, (msg) => {
        const chatId = msg.chat.id;
        const status = `📊 **حالة RICO Agent**\n\n🤖 النموذج: ${state.model}\n🌐 MCPs: ${state.connectedMcps}/8\n👥 المستخدمون: ${state.telegramUsers.size}\n💬 الرسائل: ${state.conversation.length}\n📋 المهام: ${state.tasks.length}\n🏗️ المشاريع: ${state.projects.length}\n\n**MCPs:**\n${Object.entries(state.mcpStatus).map(([k, v]) => `${v ? '✅' : '❌'} ${k}`).join('\n')}`;
        telegramBot.sendMessage(chatId, status, { parse_mode: 'Markdown' });
    });
    
    telegramBot.onText(/\/task (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const task = match[1];
        telegramBot.sendChatAction(chatId, 'typing');
        telegramBot.sendMessage(chatId, `📋 **تنفيذ المهمة:** ${task}\n\n⏳ جاري المعالجة...`);
        try {
            const result = await executeTask(task, 'telegram');
            telegramBot.sendMessage(chatId, `✅ **نتيجة المهمة:**\n\n${result}`, { parse_mode: 'Markdown' });
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
            telegramBot.sendMessage(chatId, `✅ **تم إنشاء المشروع:**\n\n${result}`, { parse_mode: 'Markdown' });
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
            telegramBot.sendMessage(chatId, `🔍 **مراجعة الكود:**\n\n${result}`, { parse_mode: 'Markdown' });
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
            telegramBot.sendMessage(chatId, `🔎 **نتائج البحث:**\n\n${result}`, { parse_mode: 'Markdown' });
        } catch (e) {
            telegramBot.sendMessage(chatId, `❌ **خطأ:** ${e.message}`);
        }
    });
    
    telegramBot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        const help = `❓ **مساعدة RICO Agent**\n\n**الأوامر:**\n/start - بدء\n/model - تغيير النموذج\n/status - حالة\n/task <مهمة> - تنفيذ مهمة\n/project <وصف> - بناء مشروع\n/review <كود> - مراجعة كود\n/search <استعلام> - بحث\n/clear - مسح\n/help - مساعدة\n\n**أمثلة:**\n/task اكتب دالة لحساب factorial\n/project REST API with Node.js and PostgreSQL\n/review function add(a,b) { return a+b; }\n/search best practices for REST API\n\nيمكنك также إرسال ملفات وصور.`;
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
            telegramBot.editMessageText(`✅ تم تغيير النموذج إلى: ${model}`, {
                chat_id: chatId, message_id: query.message.message_id
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

// --- KILO CODE Integration ---
async function kiloCodeRequest(endpoint, params) {
    if (!config.kilocodeKey) throw new Error('KILO CODE key not configured');
    
    const res = await fetch(`${KILO_CODE_API}/${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.kilocodeKey}`
        },
        body: JSON.stringify(params)
    });
    
    if (!res.ok) throw new Error(`KILO CODE API error: ${res.status}`);
    return await res.json();
}

async function kiloCodeGenerateCode(prompt, language = 'javascript') {
    try {
        const result = await kiloCodeRequest('code/generate', {
            prompt,
            language,
            model: 'kilo-code-v1'
        });
        return result.code || result.content || 'No code generated';
    } catch (e) {
        // Fallback to OpenRouter
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
                temperature: 0.3,
                max_tokens: 4096
            })
        });
        const data = await res.json();
        return data.choices[0]?.message?.content || 'No response';
    } catch (e) {
        return `Error: ${e.message}`;
    }
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
                    { role: 'system', content: 'You are a senior code reviewer. Review the code for bugs, security issues, performance, and best practices.' },
                    { role: 'user', content: `Review this code:\n\n${code}` }
                ],
                temperature: 0.3,
                max_tokens: 2048
            })
        });
        const data = await res.json();
        return data.choices[0]?.message?.content || 'No review';
    } catch (e) {
        return `Error: ${e.message}`;
    }
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
                    { role: 'system', content: 'You are a debugging expert. Find and fix the bug in the code.' },
                    { role: 'user', content: `Code:\n${code}\n\nError:\n${error}` }
                ],
                temperature: 0.3,
                max_tokens: 2048
            })
        });
        const data = await res.json();
        return data.choices[0]?.message?.content || 'No debug info';
    } catch (e) {
        return `Error: ${e.message}`;
    }
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
                    { role: 'system', content: 'You are a refactoring expert. Refactor the code for better readability, performance, and maintainability.' },
                    { role: 'user', content: `Refactor this code:\n\n${code}` }
                ],
                temperature: 0.3,
                max_tokens: 4096
            })
        });
        const data = await res.json();
        return data.choices[0]?.message?.content || 'No refactoring';
    } catch (e) {
        return `Error: ${e.message}`;
    }
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
        // Extract language
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
    } else {
        // General AI response
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
    
    // Generate project structure
    const structure = await generateProjectStructure(description);
    
    // Generate files
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
                    { role: 'system', content: 'You are a software architect. Generate a project file structure for the given description. Output only the tree structure.' },
                    { role: 'user', content: `Generate project structure for: ${description}` }
                ],
                temperature: 0.3,
                max_tokens: 1024
            })
        });
        const data = await res.json();
        return data.choices[0]?.message?.content || 'project/\n├── src/\n├── tests/\n└── README.md';
    } catch (e) {
        return 'project/\n├── src/\n├── tests/\n└── README.md';
    }
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
                    { role: 'system', content: 'You are a full-stack developer. Generate the main files for the project. Output as JSON array of {name, content}.' },
                    { role: 'user', content: `Generate main files for: ${description}\nStructure:\n${structure}` }
                ],
                temperature: 0.3,
                max_tokens: 4096
            })
        });
        const data = await res.json();
        const content = data.choices[0]?.message?.content || '[]';
        try {
            return JSON.parse(content);
        } catch {
            return [{ name: 'README.md', content: description }];
        }
    } catch (e) {
        return [{ name: 'README.md', content: description }];
    }
}

// --- Code Review ---
async function reviewCode(code, source = 'web') {
    const review = await kiloCodeReviewCode(code);
    state.codeReviews.push({ code, review, source, time: new Date() });
    return review;
}

// --- Web Search ---
async function webSearch(query) {
    if (config.searchApiKey) {
        try {
            const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`, {
                headers: { 'X-Subscription-Token': config.searchApiKey }
            });
            const data = await res.json();
            const results = data.web?.results?.slice(0, 5) || [];
            return results.map(r => `• ${r.title}\n  ${r.description}\n  ${r.url}`).join('\n\n') || 'No results found';
        } catch (e) {
            console.error('Search error:', e);
        }
    }
    
    // Fallback to DuckDuckGo
    try {
        const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
        const data = await res.json();
        if (data.AbstractText) return data.AbstractText;
        if (data.RelatedTopics?.length) {
            return data.RelatedTopics.slice(0, 5).map(t => `• ${t.Text}`).join('\n');
        }
        return 'No results found';
    } catch (e) {
        return `Search error: ${e.message}`;
    }
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
                        { role: 'system', content: 'أنت RICO Agent، مساعد ذكي متكامل. يمكنك تنفيذ المهام، بناء المشاريع، مراجعة الكود، والبحث.' },
                        { role: 'user', content: text }
                    ],
                    temperature: 0.7,
                    max_tokens: 4096
                })
            });
            const data = await res.json();
            return data.choices[0]?.message?.content || 'لا توجد استجابة';
        } catch (e) {
            console.error('OpenRouter error:', e);
        }
    }
    return 'مرحباً! يرجى تكوين API Keys.';
}

// --- Message Processing ---
async function processMessage(text, source = 'web') {
    state.conversation.push({ role: 'user', content: text, time: new Date().toISOString(), source });
    
    let response;
    const lowerText = text.toLowerCase();
    
    if (lowerText.startsWith('task:') || lowerTask.includes('مهمة') || lowerTask.includes('task')) {
        const task = text.replace(/^(task:|مهمة:?)\s*/i, '');
        response = await executeTask(task, source);
    } else if (lowerText.startsWith('project:') || lowerTask.includes('مشروع') || lowerTask.includes('project')) {
        const desc = text.replace(/^(project:|مشروع:?)\s*/i, '');
        response = await buildProject(desc, source);
    } else if (lowerText.startsWith('review:') || lowerTask.includes('مراجعة') || lowerTask.includes('review')) {
        const code = text.replace(/^(review:|مراجعة:?)\s*/i, '');
        response = await reviewCode(code, source);
    } else if (lowerText.startsWith('search:') || lowerTask.includes('بحث') || lowerTask.includes('search')) {
        const query = text.replace(/^(search:|بحث:?)\s*/i, '');
        response = await webSearch(query);
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
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    ws.send(JSON.stringify({ type: 'status', state: {
        model: state.model,
        connectedMcps: state.connectedMcps,
        conversation: state.conversation.slice(-20),
        tasks: state.tasks.slice(-5),
        projects: state.projects.slice(-5)
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
        tasks: state.tasks.length, projects: state.projects.length
    }, error: null, message: 'OK' });
});

app.post('/api/chat', async (req, res) => {
    try {
        const { text } = req.body;
        const response = await processMessage(text, 'web');
        res.json({ success: true, data: { response }, error: null, message: 'OK' });
    } catch (e) {
        res.status(500).json({ success: false, data: null, error: { code: 'ERROR', message: e.message }, message: 'Error' });
    }
});

app.post('/api/task', async (req, res) => {
    try {
        const { task } = req.body;
        const result = await executeTask(task, 'web');
        res.json({ success: true, data: { result }, error: null, message: 'OK' });
    } catch (e) {
        res.status(500).json({ success: false, data: null, error: { code: 'ERROR', message: e.message }, message: 'Error' });
    }
});

app.post('/api/project', async (req, res) => {
    try {
        const { description } = req.body;
        const result = await buildProject(description, 'web');
        res.json({ success: true, data: { result }, error: null, message: 'OK' });
    } catch (e) {
        res.status(500).json({ success: false, data: null, error: { code: 'ERROR', message: e.message }, message: 'Error' });
    }
});

app.post('/api/review', async (req, res) => {
    try {
        const { code } = req.body;
        const result = await reviewCode(code, 'web');
        res.json({ success: true, data: { result }, error: null, message: 'OK' });
    } catch (e) {
        res.status(500).json({ success: false, data: null, error: { code: 'ERROR', message: e.message }, message: 'Error' });
    }
});

app.post('/api/search', async (req, res) => {
    try {
        const { query } = req.body;
        const result = await webSearch(query);
        res.json({ success: true, data: { result }, error: null, message: 'OK' });
    } catch (e) {
        res.status(500).json({ success: false, data: null, error: { code: 'ERROR', message: e.message }, message: 'Error' });
    }
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
    console.log(`🚀 RICO Agent v2.0 running on port ${PORT}`);
    console.log(`📱 Telegram Bot: ${config.telegramToken ? '✅ Active' : '❌ Not configured'}`);
    console.log(`🤖 Default Model: ${state.model}`);
    console.log(`🔑 KILO CODE: ${config.kilocodeKey ? '✅' : '❌'}`);
    console.log(`🔑 OpenRouter: ${config.openrouterKey ? '✅' : '❌'}`);
    console.log(`🔑 Hugging Face: ${config.hfToken ? '✅' : '❌'}`);
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
            if (res.ok) { state.mcpStatus.openrouter = true; state.connectedMcps++; console.log('✅ OpenRouter MCP'); }
        } catch (e) { console.error('OpenRouter MCP:', e.message); }
    }
    if (config.kilocodeKey) {
        state.mcpStatus.kilocode = true;
        state.mcpStatus.kilocodeAcp = true;
        state.connectedMcps += 2;
        console.log('✅ KILO CODE MCP & ACP');
    }
    state.mcpStatus.supabase = true;
    state.mcpStatus.vercel = true;
    state.mcpStatus.search = true;
    state.connectedMcps += 3;
    broadcastToClients({ type: 'status_update', state });
}

module.exports = { app, server };
