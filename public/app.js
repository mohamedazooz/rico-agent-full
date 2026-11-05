/* ============================================================
   RICO Agent - Frontend Application
   Connects to backend API for full functionality
   ============================================================ */

const API_BASE = window.location.origin;

// --- State ---
const state = {
    model: 'mohamedazooz/rico',
    language: 'ar',
    theme: 'dark',
    conversation: [],
    attachedFiles: [],
    connectedMcps: 0,
    mcpStatus: {},
    voiceRecognition: null,
    isListening: false
};

// --- DOM Elements ---
const els = {
    appContainer: document.querySelector('.app-container'),
    modelSelect: document.getElementById('modelSelect'),
    connectionStatus: document.getElementById('connectionStatus'),
    mcpBadge: document.getElementById('mcpBadge'),
    messages: document.getElementById('messages'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    fileInput: document.getElementById('fileInput'),
    filePreview: document.getElementById('filePreview'),
    attachBtn: document.getElementById('attachBtn'),
    voiceInputBtn: document.getElementById('voiceInputBtn'),
    langToggleBtn: document.getElementById('langToggleBtn'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    welcomeName: document.getElementById('welcomeName'),
    welcomeMessage: document.getElementById('welcomeMessage'),
    welcomeTime: document.getElementById('welcomeTime')
};

// --- Translations ---
const translations = {
    ar: {
        connectionStatus: 'جاري الاتصال...',
        allConnected: 'جميع الخوادم متصلة',
        welcomeName: 'RICO Agent',
        welcomeMessage: 'مرحباً! أنا <strong>RICO Agent</strong> - مساعدك الذكي المتكامل.<br><br>أرسل أي رسالة للتحدث معي، أو استخدم Telegram للتحكم عن بعد.',
        typing: 'جاري الكتابة...',
        errorMessage: 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.',
        enterSend: 'إرسال',
        shiftEnter: 'سطر جديد'
    },
    en: {
        connectionStatus: 'Connecting...',
        allConnected: 'All servers connected',
        welcomeName: 'RICO Agent',
        welcomeMessage: 'Hello! I am <strong>RICO Agent</strong> - your intelligent assistant.<br><br>Send any message to chat, or use Telegram for remote control.',
        typing: 'Typing...',
        errorMessage: 'Sorry, an error occurred. Please try again.',
        enterSend: 'Send',
        shiftEnter: 'New line'
    }
};

function t(key) { return translations[state.language][key] || key; }

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadStatus();
    initUI();
    initVoiceRecognition();
    loadConversation();
    applyTheme();
    
    const now = new Date();
    els.welcomeTime.textContent = now.toLocaleTimeString(state.language === 'ar' ? 'ar-SA' : 'en-US', {
        hour: '2-digit', minute: '2-digit'
    });
    els.welcomeName.textContent = t('welcomeName');
    els.welcomeMessage.innerHTML = t('welcomeMessage');
});

function initUI() {
    els.modelSelect.value = state.model;
    els.modelSelect.addEventListener('change', async (e) => {
        state.model = e.target.value;
        await fetch(`${API_BASE}/api/model`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: state.model })
        });
    });

    els.sendBtn.addEventListener('click', sendMessage);
    els.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    els.messageInput.addEventListener('input', autoResizeTextarea);

    els.attachBtn.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', handleFileSelect);

    els.voiceInputBtn.addEventListener('click', toggleVoiceInput);
    els.langToggleBtn.addEventListener('click', toggleLanguage);
    els.themeToggleBtn.addEventListener('click', toggleTheme);
}

function autoResizeTextarea() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
}

// --- API Calls ---
async function loadStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/status`);
        const data = await res.json();
        if (data.success) {
            state.model = data.data.model;
            state.connectedMcps = data.data.connectedMcps;
            state.mcpStatus = data.data.mcpStatus;
            updateConnectionStatus();
            updateMCPBadge();
        }
    } catch (e) {
        console.error('Failed to load status:', e);
    }
}

async function loadConversation() {
    try {
        const res = await fetch(`${API_BASE}/api/conversation`);
        const data = await res.json();
        if (data.success && data.data) {
            state.conversation = data.data;
            state.conversation.forEach(msg => {
                addMessage(msg.role, msg.content, false, false);
            });
        }
    } catch (e) {
        console.error('Failed to load conversation:', e);
    }
}

// --- Chat Functions ---
function addMessage(role, content, isToolResult = false, save = true) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatarIcon = role === 'assistant' 
        ? '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>'
        : '<path d="M22 12h-4v-4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4H2v2h4v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4h-4z"/>';
    
    const time = new Date().toLocaleTimeString(state.language === 'ar' ? 'ar-SA' : 'en-US', {
        hour: '2-digit', minute: '2-digit'
    });
    
    messageDiv.innerHTML = `
        <div class="message-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${avatarIcon}</svg>
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="sender-name">${role === 'assistant' ? 'RICO Agent' : 'أنت'}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-text">${formatMessage(content)}</div>
        </div>
    `;
    
    els.messages.appendChild(messageDiv);
    els.messages.scrollTop = els.messages.scrollHeight;
}

function formatMessage(text) {
    return text
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

async function sendMessage() {
    const text = els.messageInput.value.trim();
    if (!text) return;
    
    els.messageInput.value = '';
    els.messageInput.style.height = 'auto';
    
    addMessage('user', text);
    const typingMsg = addMessage('assistant', t('typing'), false, false);
    
    try {
        const res = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        const data = await res.json();
        typingMsg.remove();
        
        if (data.success) {
            addMessage('assistant', data.data.response);
        } else {
            addMessage('assistant', t('errorMessage'));
        }
    } catch (e) {
        typingMsg.remove();
        addMessage('assistant', t('errorMessage'));
        console.error('Send message error:', e);
    }
}

// --- File Handling ---
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            state.attachedFiles.push({
                name: file.name,
                type: file.type,
                size: file.size,
                data: event.target.result
            });
            renderFilePreview();
        };
        reader.readAsDataURL(file);
    });
    e.target.value = '';
}

function renderFilePreview() {
    if (state.attachedFiles.length === 0) {
        els.filePreview.className = 'file-preview hidden';
        els.filePreview.innerHTML = '';
        return;
    }
    els.filePreview.className = 'file-preview';
    els.filePreview.innerHTML = state.attachedFiles.map((file, index) => `
        <div class="file-item">
            <span>📎 ${file.name}</span>
            <button class="remove-file" onclick="removeAttachedFile(${index})">×</button>
        </div>
    `).join('');
}

window.removeAttachedFile = (index) => {
    state.attachedFiles.splice(index, 1);
    renderFilePreview();
};

// --- Voice Input ---
function initVoiceRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        state.voiceRecognition = new SpeechRecognition();
        state.voiceRecognition.continuous = false;
        state.voiceRecognition.interimResults = true;
        state.voiceRecognition.lang = state.language === 'ar' ? 'ar-SA' : 'en-US';
        
        state.voiceRecognition.onstart = () => {
            state.isListening = true;
            els.voiceInputBtn.style.background = 'var(--accent-danger)';
        };
        
        state.voiceRecognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            els.messageInput.value = transcript;
            autoResizeTextarea.call(els.messageInput);
        };
        
        state.voiceRecognition.onend = () => {
            state.isListening = false;
            els.voiceInputBtn.style.background = '';
        };
    }
}

function toggleVoiceInput() {
    if (!state.voiceRecognition) {
        alert('Voice input not supported');
        return;
    }
    if (state.isListening) {
        state.voiceRecognition.stop();
    } else {
        state.voiceRecognition.lang = state.language === 'ar' ? 'ar-SA' : 'en-US';
        state.voiceRecognition.start();
    }
}

// --- UI Updates ---
function updateConnectionStatus() {
    const allConnected = state.connectedMcps >= 6;
    els.connectionStatus.textContent = allConnected ? t('allConnected') : t('connectionStatus');
    els.connectionStatus.className = `status-badge ${allConnected ? 'connected' : ''}`;
}

function updateMCPBadge() {
    els.mcpBadge.textContent = `${state.connectedMcps}/7`;
}

function toggleLanguage() {
    state.language = state.language === 'ar' ? 'en' : 'ar';
    document.dir = state.language === 'ar' ? 'rtl' : 'ltr';
    els.welcomeName.textContent = t('welcomeName');
    els.welcomeMessage.innerHTML = t('welcomeMessage');
}

function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
}

// --- WebSocket ---
const ws = new WebSocket(`ws://${window.location.host}`);
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'new_message') {
        // Handle new message from Telegram
    }
    if (data.type === 'status_update') {
        state.connectedMcps = data.state.connectedMcps;
        updateConnectionStatus();
        updateMCPBadge();
    }
};

// --- Copy styles.css ---
const style = document.createElement('style');
style.textContent = `
    .file-preview { margin-top: 8px; padding: 8px; background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 6px; }
    .file-item { display: flex; align-items: center; justify-content: space-between; font-size: 12px; gap: 8px; }
    .remove-file { background: var(--accent-danger); color: white; border: none; border-radius: 4px; width: 20px; height: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; }
    [data-theme="light"] {
        --bg-primary: #ffffff; --bg-secondary: #f6f8fa; --bg-tertiary: #eaeef2; --bg-hover: #d0d7de;
        --fg-primary: #24292f; --fg-secondary: #57606a; --fg-muted: #8c959f;
        --accent-primary: #0969da; --accent-secondary: #8250df; --accent-success: #1a7f37;
        --accent-warning: #9a6700; --accent-danger: #cf222e; --border-color: #d0d7de; --border-hover: #afb8c1;
    }
`;
document.head.appendChild(style);
