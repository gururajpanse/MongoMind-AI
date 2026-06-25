// =============================================================
//  MongoMind AI — script.js
//  Chat logic, scroll animations, UI interactivity
// =============================================================

// ─── CONFIG ──────────────────────────────────────────────────
const API_BASE = 'http://localhost:8000';  // ← Flask server URL

// Persist thread_id in localStorage so memory survives page reloads
if (!localStorage.getItem('mongomind_thread_id')) {
  localStorage.setItem('mongomind_thread_id', 'thread_' + Date.now());
}
let   threadId        = localStorage.getItem('mongomind_thread_id');
let   isWaiting       = false;   // prevent double sends
let   isBackendOnline = false;

// ─── DOM REFERENCES ───────────────────────────────────────────
const chatMessages  = document.getElementById('chatMessages');
const chatInput     = document.getElementById('chatInput');
const sendBtn       = document.getElementById('sendBtn');
const clearBtn      = document.getElementById('clearBtn');
const statusDot     = document.getElementById('statusDot');
const statusText    = document.getElementById('statusText');
const threadIdEl    = document.getElementById('threadId');
const navbar        = document.getElementById('navbar');
const navToggle     = document.getElementById('navToggle');
const navLinks      = document.getElementById('navLinks');
const toast         = document.getElementById('toast');

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (threadIdEl) threadIdEl.textContent = threadId.slice(-8).toUpperCase();

  checkHealth();             // check backend on load
  initScrollAnimations();    // scroll reveal
  initNavbar();              // sticky nav
  initChatInput();           // textarea auto-resize + Enter key
  renderWelcomeMessage();    // show initial bot message

  // Re-check health every 30 seconds
  setInterval(checkHealth, 30000);
});

// ─── HEALTH CHECK ─────────────────────────────────────────────
async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      setStatus(true);
    } else {
      setStatus(false);
    }
  } catch {
    setStatus(false);
  }
}

function setStatus(online) {
  isBackendOnline = online;
  if (!statusDot || !statusText) return;
  if (online) {
    statusDot.classList.remove('offline');
    statusText.textContent = 'Agent Online';
  } else {
    statusDot.classList.add('offline');
    statusText.textContent = 'Demo Mode (Backend Offline)';
  }
}

// ─── SEND MESSAGE ─────────────────────────────────────────────
async function sendMessage(text) {
  const message = (text || chatInput.value).trim();
  if (!message || isWaiting) return;

  // Clear input
  if (!text) { chatInput.value = ''; autoResizeInput(); }

  isWaiting = true;
  sendBtn.disabled = true;

  // Add user message
  appendMessage('user', message);
  scrollToBottom();

  // Show typing indicator
  const typingEl = showTypingIndicator();
  scrollToBottom();

  // Get AI response
  let response;
  try {
    response = await callAPI(message);
  } catch (err) {
    response = 'Sorry, something went wrong. Please try again.';
    showToast('Connection error — showing demo response.', 'error');
  }

  // Remove typing indicator
  typingEl.remove();

  // Display AI response
  appendMessage('ai', response);
  scrollToBottom();

  isWaiting = false;
  sendBtn.disabled = false;
  chatInput.focus();
}

// ─── API CALL ──────────────────────────────────────────────────
async function callAPI(message) {
  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, thread_id: threadId }),
      signal: AbortSignal.timeout(30000)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    // Accept various response field names from backend
    return data.response || data.message || data.answer || data.content || JSON.stringify(data);

  } catch (err) {
    console.warn('Backend unavailable, using demo mode:', err.message);
    return getDemoResponse(message);
  }
}

// ─── DEMO RESPONSES ───────────────────────────────────────────
function getDemoResponse(message) {
  const msg = message.toLowerCase();

  if (msg.includes('backup') || msg.includes('back up')) {
    return `Based on the MongoDB documentation I retrieved, here are the best practices for data backups:\n\n1. **Enable Continuous Cloud Backup** — MongoDB Atlas provides continuous cloud backups with point-in-time recovery (PITR), allowing you to restore data to any second within your backup window.\n\n2. **Use Scheduled Snapshots** — Configure automated nightly snapshots with a retention period that fits your needs (daily, weekly, monthly).\n\n3. **Test Restores Regularly** — Periodically verify your backups by doing test restores to a staging environment.\n\n4. **Enable Cluster-to-Cluster Sync** — For critical systems, use Atlas's cluster sync feature to maintain a live replica in another region.\n\n5. **Use Mongodump for Custom Backups** — For self-hosted MongoDB, use \`mongodump\` for logical backups alongside filesystem-level snapshots.`;
  }

  if (msg.includes('vector') || msg.includes('search') || msg.includes('embedding')) {
    return `MongoDB Atlas Vector Search allows you to store and query high-dimensional vector embeddings directly in your database.\n\n**How it works with MongoMind AI:**\n\n1. Your documents are chunked and embedded using **VoyageAI** (voyage-3-lite model, 512 dimensions)\n2. Embeddings are stored in MongoDB Atlas with a \`$vectorSearch\` index\n3. At query time, your question is embedded and compared using **cosine similarity**\n4. The top 5 most semantically similar chunks are retrieved as context\n5. The context is passed to the **LLM (Groq + Llama 4)** to generate a grounded answer\n\nThis RAG approach ensures the AI answers based on real MongoDB documentation rather than hallucinating.`;
  }

  if (msg.includes('langgraph') || msg.includes('graph') || msg.includes('workflow') || msg.includes('agent')) {
    return `**LangGraph** is the orchestration layer that powers MongoMind AI's agentic behavior.\n\nThe agent workflow consists of:\n\n🔵 **START** → Agent Node → (decides if tool is needed)\n🟢 **Tool Node** → (executes vector search or document retrieval)\n🔄 **Loop back** → Agent processes tool results\n⬛ **END** → Final answer returned to user\n\nKey features:\n- **Persistent memory** via MongoDB checkpointing (conversation history across sessions)\n- **Conditional edges** — the agent only calls tools when necessary\n- **Two tools available:** \`get_information_for_question_answering\` and \`get_page_content_for_summarization\``;
  }

  if (msg.includes('mongodb') || msg.includes('atlas') || msg.includes('database')) {
    return `MongoDB Atlas is the cloud database platform powering MongoMind AI. Here's how it's used in this project:\n\n**Collections:**\n- \`chunked_docs\` — stores document chunks with VoyageAI embeddings for vector search\n- \`full_docs\` — stores complete MongoDB documentation pages for summarization\n- **LangGraph checkpoint collection** — stores conversation state for memory persistence\n\n**Atlas Vector Search Index:**\n- Index name: \`vs_index\`\n- Field: \`embedding\` (512-dimensional vectors)\n- Similarity metric: Cosine similarity\n- Candidates evaluated: 150 (returns top 5)`;
  }

  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
    return `Hello! 👋 I'm **MongoMind AI**, your intelligent assistant for MongoDB documentation and best practices.\n\nI can help you with:\n- 🔍 Searching MongoDB documentation via vector search\n- 📚 Summarizing documentation pages\n- 🤖 Explaining LangGraph agent workflows\n- 💡 Best practices for MongoDB Atlas\n\nWhat would you like to know about MongoDB today?`;
  }

  const defaults = [
    `I searched through the MongoDB documentation using vector embeddings and retrieved the most relevant context. Based on the retrieved documents, let me provide you with a comprehensive answer.\n\nMongoDB's architecture is designed for high availability and horizontal scalability. The **replica set** is the fundamental unit, consisting of a primary node that handles all write operations and secondary nodes that replicate data asynchronously.\n\nFor your specific question, I'd recommend checking the official Atlas documentation for the most up-to-date guidance. Would you like me to search for anything more specific?`,

    `Using RAG (Retrieval-Augmented Generation), I've found relevant information from the MongoDB documentation corpus.\n\nThe key insight here is that MongoDB's document model is flexible — documents in the same collection don't need to have the same set of fields. This schema flexibility is one of MongoDB's most powerful features for rapidly evolving applications.\n\nIs there a specific aspect you'd like me to dig deeper into? I can retrieve more targeted documentation using vector search.`
  ];

  return defaults[Math.floor(Math.random() * defaults.length)];
}

// ─── APPEND MESSAGE ───────────────────────────────────────────
function appendMessage(role, text) {
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const msgEl = document.createElement('div');
  msgEl.className = `message ${role}`;
  msgEl.innerHTML = `
    <div class="message-avatar">${role === 'ai' ? 'M' : '👤'}</div>
    <div class="message-content">
      <div class="message-bubble">${formatMessageText(text)}</div>
      <div class="message-time">${role === 'ai' ? 'MongoMind AI' : 'You'} · ${now}</div>
    </div>
  `;

  chatMessages.appendChild(msgEl);
}

// Format message: support **bold** and newlines
function formatMessageText(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:0.88em;">$1</code>')
    .replace(/\n/g, '<br>');
}

// ─── TYPING INDICATOR ─────────────────────────────────────────
function showTypingIndicator() {
  const el = document.createElement('div');
  el.className = 'typing-indicator';
  el.innerHTML = `
    <div class="message-avatar" style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#00ED64,#00b341);color:#000;font-weight:900;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 0 12px rgba(0,237,100,0.25);">M</div>
    <div class="typing-bubble">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  chatMessages.appendChild(el);
  return el;
}

// ─── WELCOME MESSAGE ──────────────────────────────────────────
function renderWelcomeMessage() {
  appendMessage('ai',
    `👋 Welcome to **MongoMind AI**!\n\nI'm an intelligent agent powered by MongoDB Atlas Vector Search, LangGraph, and Groq LLM. I can answer questions about MongoDB and retrieve information from the official documentation.\n\nTry one of the sample prompts below or ask me anything about MongoDB! 🍃`
  );
}

// ─── CLEAR CHAT ───────────────────────────────────────────────
function clearChat() {
  chatMessages.innerHTML = '';
  // Generate a NEW thread_id and save it, so memory is fresh
  threadId = 'thread_' + Date.now();
  localStorage.setItem('mongomind_thread_id', threadId);
  if (threadIdEl) threadIdEl.textContent = threadId.slice(-8).toUpperCase();
  renderWelcomeMessage();
  showToast('Chat cleared. New session started.', 'info');
}

// ─── SAMPLE PROMPTS ───────────────────────────────────────────
function useSamplePrompt(text) {
  chatInput.value = text;
  autoResizeInput();
  chatInput.focus();
  // Scroll to chat section
  document.getElementById('chat').scrollIntoView({ behavior: 'smooth' });
}

// ─── SCROLL HELPERS ───────────────────────────────────────────
function scrollToBottom() {
  chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

// ─── SCROLL ANIMATIONS ────────────────────────────────────────
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        // Stagger children
        const children = entry.target.querySelectorAll('.stagger-child');
        children.forEach((child, i) => {
          child.style.transitionDelay = `${i * 0.1}s`;
          child.classList.add('visible');
        });
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
}

// ─── NAVBAR ───────────────────────────────────────────────────
function initNavbar() {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  // Mobile toggle
  if (navToggle) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      // Animate hamburger
      const spans = navToggle.querySelectorAll('span');
      if (navLinks.classList.contains('open')) {
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
      } else {
        spans[0].style.transform = '';
        spans[1].style.opacity = '';
        spans[2].style.transform = '';
      }
    });

    // Close menu on link click
    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        const spans = navToggle.querySelectorAll('span');
        spans[0].style.transform = '';
        spans[1].style.opacity = '';
        spans[2].style.transform = '';
      });
    });
  }
}

// ─── CHAT INPUT BEHAVIOR ──────────────────────────────────────
function initChatInput() {
  if (!chatInput) return;

  // Auto-resize textarea
  chatInput.addEventListener('input', autoResizeInput);

  // Send on Enter (Shift+Enter for new line)
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function autoResizeInput() {
  if (!chatInput) return;
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
}

// ─── TOAST NOTIFICATIONS ──────────────────────────────────────
function showToast(message, type = 'info') {
  if (!toast) return;
  const icons = { success: '✅', error: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type]}</span> ${message}`;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.classList.remove('show'); }, 3500);
}

// ─── SMOOTH SCROLL FOR CTA ────────────────────────────────────
function scrollToChat() {
  const chatSection = document.getElementById('chat');
  if (chatSection) chatSection.scrollIntoView({ behavior: 'smooth' });
}
