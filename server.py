r"""
server.py -- MongoMind AI Flask Backend API
Wraps the LangGraph agent and exposes HTTP endpoints for the frontend.

Run with:
    .venv\Scripts\python.exe server.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS

import key_param
from pymongo import MongoClient
from langchain.agents import tool
from typing import List, Annotated
from typing_extensions import TypedDict
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import ToolMessage
from langgraph.graph import END, StateGraph, START, add_messages
from langgraph.checkpoint.mongodb import MongoDBSaver
import voyageai

# ─── FLASK APP SETUP ────────────────────────────────────────────
app = Flask(__name__)
CORS(app)  # Allow requests from the frontend (any origin)

# ─── AGENT STATE ────────────────────────────────────────────────
class GraphState(TypedDict):
    messages: Annotated[List, add_messages]

# ─── GLOBAL OBJECTS (initialised once on startup) ────────────────
mongodb_client = None
agent_app      = None   # compiled LangGraph application


# ─── MONGODB ─────────────────────────────────────────────────────
def init_mongodb():
    client       = MongoClient(key_param.mongodb_uri)
    DB_NAME      = "ai_agents"
    vs_collection   = client[DB_NAME]["chunked_docs"]
    full_collection = client[DB_NAME]["full_docs"]
    return client, vs_collection, full_collection


# ─── EMBEDDING ───────────────────────────────────────────────────
def generate_embedding(text: str) -> List[float]:
    voyage_client = voyageai.Client(api_key=key_param.voyage_api_key)
    return voyage_client.embed(text, model="voyage-3-lite", input_type="query").embeddings[0]


# ─── TOOLS ───────────────────────────────────────────────────────
@tool
def get_information_for_question_answering(user_query: str) -> str:
    """Retrieve relevant documents for a user query using vector search."""
    query_embedding = generate_embedding(user_query)
    _, vs_collection, _ = init_mongodb()

    pipeline = [
        {
            "$vectorSearch": {
                "index": "vs_index",
                "path": "embedding",
                "queryVector": query_embedding,
                "numCandidates": 150,
                "limit": 5,
            }
        },
        {
            "$project": {
                "_id": 0,
                "body": 1,
                "score": {"$meta": "vectorSearchScore"},
            }
        },
    ]

    results  = vs_collection.aggregate(pipeline)
    context  = "\n\n".join([doc.get("body", "") for doc in results])
    return context


@tool
def get_page_content_for_summarization(user_query: str) -> str:
    """Retrieve the content of a documentation page for summarization."""
    _, _, full_collection = init_mongodb()
    document = full_collection.find_one({"title": user_query}, {"_id": 0, "body": 1})
    return document["body"] if document else "Document not found"


# ─── GRAPH NODES ─────────────────────────────────────────────────
def agent_node(state: GraphState, llm_with_tools) -> GraphState:
    result = llm_with_tools.invoke(state["messages"])
    return {"messages": [result]}


def tool_node(state: GraphState, tools_by_name: dict) -> GraphState:
    result     = []
    tool_calls = state["messages"][-1].tool_calls
    for call in tool_calls:
        observation = tools_by_name[call["name"]].invoke(call["args"])
        result.append(ToolMessage(content=observation, tool_call_id=call["id"]))
    return {"messages": result}


def route_tools(state: GraphState):
    messages = state.get("messages", [])
    if not messages:
        raise ValueError("No messages found in state")
    last = messages[-1]
    if hasattr(last, "tool_calls") and len(last.tool_calls) > 0:
        return "tools"
    return END


# ─── BUILD GRAPH ─────────────────────────────────────────────────
def build_agent():
    """Build and return a compiled LangGraph application (called once on startup)."""
    client, _, _ = init_mongodb()

    tools_list = [
        get_information_for_question_answering,
        get_page_content_for_summarization,
    ]
    tools_by_name = {t.name: t for t in tools_list}

    llm = ChatGroq(
        api_key=key_param.groq_api_key,
        temperature=0,
        model="meta-llama/llama-4-scout-17b-16e-instruct",
    )

    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You are a helpful AI assistant."
            " You are provided with tools to answer questions and summarize technical documentation related to MongoDB."
            " Think step-by-step and use these tools to get the information required to answer the user query."
            " Do not re-run tools unless absolutely necessary."
            " If you are not able to get enough information using the tools, reply with I DON'T KNOW."
            " You have access to the following tools: {tool_names}.",
        ),
        MessagesPlaceholder(variable_name="messages"),
    ])
    prompt = prompt.partial(tool_names=", ".join([t.name for t in tools_list]))

    llm_with_tools = prompt | llm.bind_tools(tools_list)

    graph = StateGraph(GraphState)
    graph.add_node("agent", lambda state: agent_node(state, llm_with_tools))
    graph.add_node("tools", lambda state: tool_node(state, tools_by_name))
    graph.add_edge(START, "agent")
    graph.add_edge("tools", "agent")
    graph.add_conditional_edges("agent", route_tools, {"tools": "tools", END: END})

    checkpointer = MongoDBSaver(client)   # ← memory stored in MongoDB
    return graph.compile(checkpointer=checkpointer)


# ─── ROUTES ──────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    """Health check — frontend polls this to show 'Agent Online'."""
    return jsonify({"status": "ok", "agent": "MongoMind AI", "model": "llama-4-scout"}), 200


@app.route("/chat", methods=["POST"])
def chat():
    """
    Accepts: { "message": "...", "thread_id": "..." }
    Returns: { "response": "..." }

    The thread_id is the conversation ID — messages with the same thread_id
    are remembered by LangGraph via MongoDBSaver (persistent memory).
    """
    data      = request.get_json(force=True)
    message   = data.get("message", "").strip()
    thread_id = data.get("thread_id", "default")

    if not message:
        return jsonify({"error": "No message provided"}), 400

    try:
        config = {"configurable": {"thread_id": thread_id}}
        input_ = {"messages": [("user", message)]}

        # Stream through the graph and collect final output
        final_value = None
        for output in agent_app.stream(input_, config):
            for _, value in output.items():
                final_value = value

        # Extract the last AI message content
        response_text = final_value["messages"][-1].content if final_value else "I couldn't process your request."
        return jsonify({"response": response_text, "thread_id": thread_id}), 200

    except Exception as e:
        print(f"[ERROR] /chat failed: {e}")
        return jsonify({"error": str(e), "response": "Sorry, something went wrong on the server."}), 500


# ─── STARTUP ─────────────────────────────────────────────────────
if __name__ == "__main__":
    print("[*] Initialising MongoMind AI agent...")
    agent_app = build_agent()
    print("[OK] Agent is ready!")
    print("[*] Starting Flask server on http://localhost:8000")
    app.run(host="0.0.0.0", port=8000, debug=False)
