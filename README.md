# 🧠 MongoMind AI

**An Agentic RAG System Powered by MongoDB Atlas Vector Search**

MongoMind AI is an intelligent Retrieval-Augmented Generation (RAG) agent that answers questions and summarizes content from MongoDB's official documentation. Built with a LangGraph agentic workflow, it autonomously decides when and which tools to invoke — combining semantic vector search with full-document retrieval — all while maintaining persistent conversational memory across sessions.

---

## ✨ Features

- **🔍 Semantic Search** — Retrieves the most relevant documentation chunks using MongoDB Atlas Vector Search with cosine similarity
- **📚 Document Summarization** — Fetches and summarizes full documentation pages on demand
- **🤖 Agentic Reasoning** — LangGraph-powered workflow that autonomously routes between tools based on query intent
- **💾 Persistent Memory** — Multi-turn conversation history stored in MongoDB via LangGraph checkpointing
- **⚡ Real-Time Chat UI** — Responsive frontend with live health monitoring, session management, and offline fallback
- **🌐 REST API** — Clean Flask API with `/chat` and `/health` endpoints

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (HTML/CSS/JS)                   │
│                     http://localhost:8080                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP (POST /chat, GET /health)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Flask REST API (server.py)                  │
│                     http://localhost:8000                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   LangGraph Agentic Workflow                    │
│                                                                 │
│   ┌───────┐    ┌───────────┐    ┌──────────┐                   │
│   │ START │───▶│   Agent   │───▶│   END    │                   │
│   └───────┘    │  (LLM)    │    └──────────┘                   │
│                └─────┬─────┘         ▲                         │
│                      │ tool needed?  │ no more tools           │
│                      ▼               │                         │
│                ┌───────────┐─────────┘                         │
│                │   Tools   │                                    │
│                └─────┬─────┘                                   │
│                      │                                         │
│          ┌───────────┴───────────┐                              │
│          ▼                       ▼                              │
│  ┌──────────────┐    ┌──────────────────┐                      │
│  │ Vector Search│    │ Document Lookup  │                      │
│  │   (Q&A)      │    │ (Summarization) │                      │
│  └──────┬───────┘    └────────┬─────────┘                      │
│         │                     │                                 │
└─────────┼─────────────────────┼─────────────────────────────────┘
          │                     │
          ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MongoDB Atlas (Cloud)                         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ chunked_docs │  │  full_docs   │  │ checkpointer (memory) │ │
│  │ + vs_index   │  │              │  │                       │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### How It Works

1. **User sends a query** via the chat frontend → hits the Flask `/chat` endpoint
2. **LangGraph Agent** receives the query and reasons about which tool to use:
   - `get_information_for_question_answering` — Embeds the query using VoyageAI, performs vector search on `chunked_docs` (top 5 results, 150 candidates), and returns semantically relevant context
   - `get_page_content_for_summarization` — Fetches a full documentation page from `full_docs` by title for summarization
3. **Tool results** are fed back into the agent, which generates a grounded response using **Groq LLM (Llama 4 Scout 17B)**
4. **Conversation state** is persisted in MongoDB via `MongoDBSaver`, enabling multi-turn memory across sessions

---

## 🛠️ Tech Stack

| Component | Technology |
|---|---|
| **Vector Database** | MongoDB Atlas Vector Search (cosine similarity, 512-dim) |
| **Embeddings** | VoyageAI (`voyage-3-lite`) |
| **LLM** | Groq (`meta-llama/llama-4-scout-17b-16e-instruct`) |
| **Agent Framework** | LangGraph + LangChain |
| **Memory** | MongoDB Checkpointer (`langgraph-checkpoint-mongodb`) |
| **Backend API** | Flask + Flask-CORS |
| **Frontend** | HTML, CSS, JavaScript (Bootstrap 5, Tailwind CSS, Font Awesome) |
| **Package Manager** | uv |

---

## 📁 Project Structure

```
MongoMind-AI/
├── server.py           # Flask API — wraps the LangGraph agent
├── main.py             # Standalone CLI version of the RAG agent
├── data.py             # Data ingestion script (embeddings + upload to MongoDB)
├── key_param.py        # Configuration — loads API keys from environment variables
├── pyproject.toml      # Python project metadata and dependencies
├── .env.example        # Template for required environment variables
├── .gitignore          # Git ignore rules
├── frontend/
│   ├── index.html      # Chat UI — landing page with hero, features, and chat
│   ├── style.css       # Styling — dark theme, glassmorphism, animations
│   └── script.js       # Chat logic — API calls, health checks, demo fallback
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.12**
- **MongoDB Atlas** account with a cluster set up
- **API Keys**: [VoyageAI](https://www.voyageai.com/), [Groq](https://console.groq.com/)
- **uv** (recommended) or pip

### 1. Clone the Repository

```bash
git clone https://github.com/gururajpanse/MongoMind-AI.git
cd MongoMind-AI
```

### 2. Set Up Environment Variables

Copy the example file and fill in your actual keys:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
VOYAGE_API_KEY=your_voyage_api_key
GROQ_API_KEY=your_groq_api_key
MONGODB_URI=your_mongodb_connection_string
```

### 3. Create Virtual Environment & Install Dependencies

```bash
python -m venv .venv

# Windows
.venv\Scripts\Activate

# macOS/Linux
source .venv/bin/activate
```

Install packages:

```bash
pip install flask flask-cors langchain-groq datasets langchain langgraph langgraph-checkpoint-mongodb pymongo voyageai
```

### 4. Upload Data to MongoDB (First Time Only)

> Skip this step if you have already uploaded `full_docs` and `chunked_docs` to your MongoDB Atlas cluster.

```bash
python data.py
```

This will:
- Load MongoDB documentation datasets from HuggingFace
- Generate VoyageAI embeddings for each chunk
- Upload documents to `ai_agents.full_docs` and `ai_agents.chunked_docs`
- Create a vector search index (`vs_index`) on the `chunked_docs` collection

### 5. Run the Backend Server

```bash
python server.py
```

The Flask API will start on **http://localhost:8000**. You should see:

```
[*] Initialising MongoMind AI agent...
[OK] Agent is ready!
[*] Starting Flask server on http://localhost:8000
```

### 6. Run the Frontend

Open a **new terminal** and run:

```bash
python -m http.server 8080 -d frontend
```

### 7. Open in Browser

Navigate to **http://localhost:8080** — the status indicator will show **"Agent Online"** once the backend is connected.

---

## 💬 Usage

### Web Chat Interface

Simply type your question in the chat box. Example queries:

- *"What are the best practices for data backups in MongoDB?"*
- *"How does MongoDB Atlas Vector Search work?"*
- *"Summarize the MongoDB aggregation pipeline documentation"*

The agent will autonomously retrieve relevant documentation and generate a grounded answer.

### CLI Mode

You can also run the agent directly from the command line:

```bash
python main.py
```

This executes predefined queries and prints the agent's reasoning and final answers to the console.

---

## 🔑 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check — returns agent status and model info |
| `POST` | `/chat` | Send a message to the agent |

### POST `/chat` — Request

```json
{
  "message": "What is a replica set in MongoDB?",
  "thread_id": "session_123"
}
```

### POST `/chat` — Response

```json
{
  "response": "A replica set in MongoDB is a group of...",
  "thread_id": "session_123"
}
```

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  Built with 🍃 MongoDB Atlas &nbsp;·&nbsp; 🦜 LangGraph &nbsp;·&nbsp; ⚡ Groq &nbsp;·&nbsp; 🚀 VoyageAI
</p>
