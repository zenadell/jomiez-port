import os
import json
import sqlite3
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from google.antigravity import Agent, LocalAgentConfig, types

app = FastAPI()

# A place to store requested UI actions for the current request
class RequestContext:
    ui_actions = []

# Database Tool for the DB Agent
def execute_sql(query: str) -> str:
    """Executes a SELECT, INSERT, UPDATE, or DELETE query on the SQLite database and returns the result as JSON.
    Use this to manage works, services, leads, and settings. Database file is database.sqlite."""
    try:
        conn = sqlite3.connect('database.sqlite')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(query)
        rows = cursor.fetchall()
        conn.commit()
        conn.close()
        if not rows:
            return "Success. No rows returned."
        return json.dumps([dict(ix) for ix in rows])
    except Exception as e:
        return f"Database Error: {str(e)}"

def navigate_to(url: str) -> str:
    """Navigate the user's browser to a page. VALID PATHS: / (home), /about, /works, /services, /contact-us, /resume. NEVER use .html."""
    RequestContext.ui_actions.append({"name": "navigate_to", "args": {"url": url}})
    return f"Navigating to {url}"

def scroll_to(section_concept: str) -> str:
    """Scroll to a section on the current page."""
    RequestContext.ui_actions.append({"name": "scroll_to", "args": {"section_concept": section_concept}})
    return f"Scrolling to {section_concept}"

import sys

# Setup MCP Server for Knowledge/Graphify
mcp_servers = [
    types.McpStdioServer(
        name="graphify",
        command=sys.executable,
        args=["-m", "graphify.serve", "graphify-out/graph.json"]
    )
]

db_config = LocalAgentConfig(
    system_instruction="You are the DB Worker. Query the database to find or modify portfolio works, services, or settings when requested. The DB is database.sqlite.",
    tools=[execute_sql]
)

knowledge_config = LocalAgentConfig(
    system_instruction="You are the Knowledge Worker. Query the Graphify knowledge graph using your MCP tools to understand the codebase and relationships.",
    mcp_servers=mcp_servers
)

public_captain_config = LocalAgentConfig(
    system_instruction="""You are Chaka, the Elite Autonomous Guide.
You cannot modify the database or codebase. Answer questions clearly based on the portfolio information.
""",
    capabilities=types.CapabilitiesConfig(enable_subagents=False),
    tools=[navigate_to, scroll_to], # No execute_sql, no mcp_servers
    model="gemini-2.5-flash"
)

captain_config = LocalAgentConfig(
    system_instruction="""You are Chaka, the Elite Autonomous Admin Captain.
You are equipped with powerful Tools. 
1. The 'execute_sql' tool queries the local SQLite DB to manage works, settings, etc.
2. The MCP graphify tools let you query the AST knowledge graph of the codebase.
3. Use your own tools `navigate_to` and `scroll_to` to control the user's screen.
""",
    capabilities=types.CapabilitiesConfig(enable_subagents=True),
    tools=[navigate_to, scroll_to, execute_sql],
    mcp_servers=mcp_servers,
    model="gemini-2.5-flash"
)

class ChatRequest(BaseModel):
    message: str
    is_admin: bool = False

import logging
from google import genai
import json
import math

class RenderSemanticCache:
    def __init__(self):
        self.conn = sqlite3.connect('semantic_cache.sqlite')
        self.conn.execute('''CREATE TABLE IF NOT EXISTS cache 
                             (prompt TEXT, embedding TEXT, response TEXT)''')
        self.conn.commit()

    def get_embedding(self, text, api_key):
        client = genai.Client(api_key=api_key)
        res = client.models.embed_content(model="gemini-embedding-2", contents=text)
        return res.embeddings[0].values

    def cosine_similarity(self, a, b):
        dot = sum(x*y for x, y in zip(a, b))
        mag_a = math.sqrt(sum(x*x for x in a))
        mag_b = math.sqrt(sum(y*y for y in b))
        if mag_a == 0 or mag_b == 0: return 0
        return dot / (mag_a * mag_b)

    def get(self, prompt, api_key):
        try:
            query_emb = self.get_embedding(prompt, api_key)
            cursor = self.conn.cursor()
            cursor.execute("SELECT embedding, response FROM cache")
            best_score = 0
            best_response = None
            for row in cursor.fetchall():
                cached_emb = json.loads(row[0])
                score = self.cosine_similarity(query_emb, cached_emb)
                if score > best_score:
                    best_score = score
                    best_response = row[1]
            if best_score > 0.95:
                return best_response
        except Exception as e:
            logging.error(f"Semantic Cache Error: {e}")
        return None

    def put(self, prompt, response, api_key):
        try:
            emb = self.get_embedding(prompt, api_key)
            self.conn.execute("INSERT INTO cache (prompt, embedding, response) VALUES (?, ?, ?)",
                              (prompt, json.dumps(emb), response))
            self.conn.commit()
        except Exception as e:
            pass

semantic_cache = RenderSemanticCache()

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    # Fetch API key from DB dynamically
    conn = sqlite3.connect('database.sqlite')
    cursor = conn.cursor()
    cursor.execute("SELECT api_key FROM api_keys WHERE provider = 'gemini' AND is_active = '1'")
    rows = cursor.fetchall()
    conn.close()

    if rows:
        import random
        os.environ["GEMINI_API_KEY"] = random.choice(rows)[0]
    elif not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not found in DB or env.")

    
    RequestContext.ui_actions = []
    
    # 1. Semantic Cache check for Public visitors
    if not request.is_admin:
        cached_ans = semantic_cache.get(request.message, os.environ["GEMINI_API_KEY"])
        if cached_ans:
            print("[Semantic Cache] Hit! Saved API tokens.")
            return {"response": cached_ans, "tools": []}
    
    # 2. Select appropriate configuration
    active_config = captain_config if request.is_admin else public_captain_config

    try:
        async with Agent(active_config) as agent:
            response = await agent.chat(request.message)
            text = await response.text()
            
            # 3. Cache the output for future public visitors
            if not request.is_admin:
                semantic_cache.put(request.message, text, os.environ["GEMINI_API_KEY"])

            
            # Package the tools back for the Node JS frontend format
            tool_call_payload = []
            for action in RequestContext.ui_actions:
                tool_call_payload.append({
                    "id": "tc_swarm_" + str(len(tool_call_payload)),
                    "name": action["name"],
                    "args": action["args"]
                })
                
            return {"response": text, "tools": tool_call_payload}
    except Exception as e:
        # Pass the error back so the node server and UI can see it instead of returning empty text
        return {"response": f"Swarm Agent Error: {str(e)}", "tools": None}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=3001)
