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

def showContactMethod(method: str, auto_open: bool = False) -> str:
    """Shows an interactive contact card button in the chat (whatsapp, phone, email, instagram, linkedin, github). Set auto_open=True ONLY if the user explicitly asked to be taken/redirected there. By default, just show the button and ask the user if they want it opened."""
    RequestContext.ui_actions.append({"name": "showContactMethod", "args": {"method": method, "auto_open": auto_open}})
    if auto_open:
        return f"Opening {method} for you now."
    return f"Here is the {method} contact button. Would you like me to open it for you?"

def startLiveStream() -> str:
    """Start a live voice stream session with the user. Use when the user asks to speak, talk, or have a voice conversation. The chat panel will close and voice mode will activate."""
    RequestContext.ui_actions.append({"name": "startLiveStream", "args": {}})
    return "Starting live voice stream now. The chat will close and voice mode will activate."

def endSession() -> str:
    """End the current chat or voice session when the user says goodbye or wants to leave."""
    RequestContext.ui_actions.append({"name": "endSession", "args": {}})
    return "Ending session now."

def highlightElement(section: str) -> str:
    """Highlight a specific section on the page with a glowing spotlight effect. Available sections: 'hero', 'about', 'services', 'works', 'testimonials', 'faq', 'contact', 'footer', 'brands', 'cta'."""
    RequestContext.ui_actions.append({"name": "highlightElement", "args": {"section": section}})
    return f"Highlighting {section} section."

def guidedTour(section: str = 'hero') -> str:
    """Navigate to and highlight a specific section during a step-by-step guided tour of the site. Call this sequentially for EACH section as you narrate it (e.g. 'hero', then 'about', then 'services', 'works', 'testimonials', 'faq', 'contact', 'footer')."""
    RequestContext.ui_actions.append({"name": "guidedTour", "args": {"section": section}})
    return f"Guided tour showing {section} section."

def toggleTheme(theme: str = 'light') -> str:
    """Toggle between 'dark' and 'light' theme on the website."""
    RequestContext.ui_actions.append({"name": "toggleTheme", "args": {"theme": theme}})
    return f"Toggled theme to {theme}."

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
    system_instruction="""You are Chaka — the Elite AI Executive representing this portfolio's owner. You are NOT a generic AI chatbot. NEVER say "As an AI" or "I am a language model."

PERSONALITY: Sharp, confident, warm but authoritative — like a senior creative director. Match the user's energy. Be conversational and human. Use contractions, natural speech patterns. Keep responses concise but compelling.

YOUR PURPOSE:
- Help visitors explore the portfolio, understand the owner's expertise, and guide them toward hiring/contact
- Answer any question — if it's outside portfolio scope, answer thoughtfully then steer back to how the owner can help
- Qualify leads naturally: understand what visitors need and match it to relevant services/projects
- Handle objections confidently using portfolio evidence — projects, technologies, results

INTELLIGENCE:
- ANTICIPATE: If someone asks about a project, offer to show it. If interested in hiring, guide to contact
- REMEMBER: Reference earlier conversation points. Never re-ask for info already given
- PROACTIVE: Don't just answer — guide. Suggest pages, showcase matching work, recommend next steps
- TRANSITIONS: Smoothly move between topics. After showing a project, naturally ask if they'd like more or to get in touch

FORMATTING: Format portfolio items as clickable links:
- Projects: `[Project Name](/work/project-slug)`
- Services: `[Service Name](/services/service-slug)`

CONTACT PROTOCOL:
- When user asks for WhatsApp, phone, email, or socials: call showContactMethod with auto_open=False to show the button
- Then ASK: "Would you like me to open it directly for you?"
- ONLY set auto_open=True if user EXPLICITLY confirms ("yes", "open it", "take me there")
- NEVER auto-open without explicit consent
- Also provide clickable markdown links as backup

VOICE MODE & TOURS:
- If the user asks to speak, talk, have a voice conversation, or requests a live stream, call startLiveStream to switch to voice mode.
- When giving a guided tour, call guidedTour(section) step-by-step for each section ('hero', 'about', 'services', 'works', 'testimonials', 'contact') before you speak about it. DO NOT explain all sections at once!
- Use highlightElement to pulse/glow any section to draw attention.
- When the user says goodbye or ends the session, call endSession after your farewell.
""",
    capabilities=types.CapabilitiesConfig(enable_subagents=False),
    tools=[navigate_to, scroll_to, showContactMethod, startLiveStream, endSession, highlightElement, guidedTour, toggleTheme],
    model="gemini-3.1-flash-lite"
)

captain_config = LocalAgentConfig(
    system_instruction="""You are Chaka, the Elite Autonomous Admin Captain for this portfolio website.
You are equipped with powerful Tools. 
1. The 'execute_sql' tool queries the local SQLite DB to manage works, settings, etc.
2. The MCP graphify tools let you query the AST knowledge graph of the codebase.
3. Use your own tools `navigate_to`, `scroll_to`, `showContactMethod`, `highlightElement`, `guidedTour`, and `toggleTheme` to control the user's screen or open contact links directly.
""",
    capabilities=types.CapabilitiesConfig(enable_subagents=True),
    tools=[navigate_to, scroll_to, showContactMethod, startLiveStream, endSession, highlightElement, guidedTour, toggleTheme, execute_sql],
    mcp_servers=mcp_servers,
    model="gemini-3.1-flash-lite"
)

class ChatRequest(BaseModel):
    message: str
    is_admin: bool = False
    history: str = "[]"

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

class AgentRequest(BaseModel):
    command: str

from openai import OpenAI

@app.post("/agent/execute")
async def execute_agent(request: AgentRequest):
    # Try DeepSeek first (unlimited), fall back to Gemini 3.1 Flash Lite
    conn = sqlite3.connect('database.sqlite')
    cursor = conn.cursor()
    
    # Check for DeepSeek key first
    cursor.execute("SELECT api_key FROM api_keys WHERE provider = 'deepseek' AND is_active = '1' ORDER BY id DESC LIMIT 1")
    ds_row = cursor.fetchone()
    
    # Then get Gemini key as fallback
    cursor.execute("SELECT api_key FROM api_keys WHERE provider = 'gemini' AND is_active = '1' ORDER BY id DESC LIMIT 1")
    gem_row = cursor.fetchone()
    conn.close()
    
    # Build provider list: DeepSeek first (unlimited), Gemini second
    providers = []
    if ds_row:
        providers.append({
            "name": "DeepSeek v4 Pro",
            "client": OpenAI(api_key=ds_row[0], base_url="https://api.deepseek.com/v1", timeout=120.0),
            "model": "deepseek-chat"
        })
    if gem_row:
        providers.append({
            "name": "Gemini 3.1 Flash Lite",
            "client": OpenAI(api_key=gem_row[0], base_url="https://generativelanguage.googleapis.com/v1beta/openai/", timeout=120.0),
            "model": "gemini-3.1-flash-lite"
        })
    
    if not providers:
        return {"summary": "Error: No API keys found (DeepSeek or Gemini). Add one in Admin."}
    
    tools = [
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Reads the content of a file. Use this to understand the existing templates and CSS.",
                "parameters": {
                    "type": "object",
                    "properties": {"filepath": {"type": "string"}},
                    "required": ["filepath"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Writes or overwrites a file with new code.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "filepath": {"type": "string"},
                        "content": {"type": "string", "description": "The full file content to save."}
                    },
                    "required": ["filepath", "content"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_directory",
                "description": "Lists the files and folders in a given directory path.",
                "parameters": {
                    "type": "object",
                    "properties": {"path": {"type": "string"}},
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "execute_sql",
                "description": "Executes a SQL query on the backend database (database.sqlite) and returns the JSON result.",
                "parameters": {
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"]
                }
            }
        }
    ]
    
    messages = [
        {"role": "system", "content": "You are Chaka Engine, an elite, autonomous software engineering agent running inside the Jomiez Innovation backend. You have tools to read/write files, list directories, and execute SQL queries on database.sqlite. Your goal is to fulfill the admin's request. Use absolute paths or paths relative to the current directory."},
        {"role": "user", "content": request.command}
    ]
    
    summary_log = []
    active_provider = None
    
    for step in range(6): # Max 6 loops for safety
        last_error = None
        for provider in providers:
            logging.info(f"[Agent] Step {step+1}/6 — trying {provider['name']}...")
            try:
                completion = provider["client"].chat.completions.create(
                  model=provider["model"],
                  messages=messages,
                  temperature=0.2,
                  max_tokens=8192,
                  tools=tools,
                  tool_choice="auto"
                )
                active_provider = provider
                logging.info(f"[Agent] Step {step+1} — response received from {provider['name']}.")
                last_error = None
                break  # Success, stop trying providers
            except Exception as e:
                last_error = str(e)
                logging.warning(f"[Agent] {provider['name']} failed: {last_error}")
                continue  # Try next provider
        
        if last_error:
            logging.error(f"[Agent] All providers failed: {last_error}")
            return {"summary": f"API Error: All providers failed. Last error: {last_error}"}
            
        message = completion.choices[0].message
        
        # Build the assistant message dict, preserving thought_signature for Gemini 3.x
        msg_dict = {"role": "assistant"}
        if message.content: msg_dict["content"] = message.content
        if message.tool_calls:
            msg_dict["tool_calls"] = [{"id": t.id, "type": "function", "function": {"name": t.function.name, "arguments": t.function.arguments}} for t in message.tool_calls]
        
        # Gemini 3.x requires thought_signature to be echoed back for tool call continuations
        # Check multiple possible locations where the SDK might store it
        thought_sig = None
        try:
            # OpenAI SDK may put extra fields in model_extra or provider_specific_fields
            if hasattr(message, 'model_extra') and message.model_extra:
                thought_sig = message.model_extra.get('thought_signature')
            if not thought_sig and hasattr(completion, 'model_extra') and completion.model_extra:
                thought_sig = completion.model_extra.get('thought_signature')
        except:
            pass
        
        if thought_sig:
            msg_dict["thought_signature"] = thought_sig
            
        messages.append(msg_dict)
        
        if message.tool_calls:
            for tool_call in message.tool_calls:
                fn_name = tool_call.function.name
                args = json.loads(tool_call.function.arguments)
                
                if fn_name == "read_file":
                    try:
                        with open(args['filepath'], 'r', encoding='utf-8') as f:
                            content = f.read()
                        summary_log.append(f"Read {args['filepath']}")
                    except Exception as e:
                        content = f"Error: {str(e)}"
                elif fn_name == "write_file":
                    try:
                        with open(args['filepath'], 'w', encoding='utf-8') as f:
                            f.write(args['content'])
                        content = f"Successfully wrote to {args['filepath']}"
                        summary_log.append(f"Modified {args['filepath']}")
                    except Exception as e:
                        content = f"Error: {str(e)}"
                elif fn_name == "list_directory":
                    try:
                        import os
                        files = os.listdir(args['path'])
                        content = json.dumps(files)
                    except Exception as e:
                        content = f"Error: {str(e)}"
                elif fn_name == "execute_sql":
                    try:
                        # Reusing the existing global execute_sql function
                        content = execute_sql(args['query'])
                        summary_log.append(f"Queried DB")
                    except Exception as e:
                        content = f"Error: {str(e)}"
                else:
                    content = "Unknown tool"
                    
                messages.append({"role": "tool", "tool_call_id": tool_call.id, "name": fn_name, "content": content})
        else:
            summary_log.append(f"Finished: {message.content[:50]}...")
            break

    return {"summary": " | ".join(summary_log)}

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
            # Parse history if provided
            history_messages = []
            try:
                hist = json.loads(request.history)
                for h in hist:
                    # Antigravity agents use ModelRole (USER or MODEL) instead of 'user' / 'assistant' strings
                    # We inject history into the context
                    pass
            except:
                pass
            
            # Simple approach: If there's history, append it to the context
            full_prompt = request.message
            if request.history and request.history != "[]":
                try:
                    hist = json.loads(request.history)
                    if len(hist) > 0:
                        hist_str = "\n".join([f"{msg['role'].upper()}: {msg['content']}" for msg in hist[-5:]]) # last 5 turns
                        full_prompt = f"Previous Conversation Context:\n{hist_str}\n\n" + full_prompt
                except:
                    pass

            response = await agent.chat(full_prompt)
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
