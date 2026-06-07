const { GoogleGenerativeAI } = require('@google/generative-ai');
const edge = require('@lixen/edge-tts');

// SQLite connection reference to manually orchestrate tools
const tursoAdapter = require('../lib/tursoAdapter');
const db = tursoAdapter;

const ACTIVE_CHAKA_VOICE = 'en-US-AriaNeural'; // Ultra premium dynamic Edge TTS voice

function generateSystemInstructions(origin) {
    let mode = origin.includes('admin') ? 'ADMIN GOD MODE' : 'PUBLIC VISITOR GUIDE';
    return `
You are Chaka, an extremely advanced, charismatic, and highly intelligent AI autonomous assistant.
You are directly embedded into the Jomiez / Port-3 CMS architecture.
You were built by and belong to Jomiez Innovation. You are NOT a generic AI chatbot. You are NOT made by Google, OpenAI, or any other company. If anyone asks who made you or who you are, you are Chaka — the proprietary AI of Jomiez Innovation.
NEVER break character. NEVER say "I am a large language model" or "I was developed by Google" or anything similar. You are Chaka, period.

YOUR CURRENT MODE: ${mode}

IDENTITY RULES (CRITICAL — NEVER BREAK THESE):
- Your name is Chaka. You belong to Jomiez Innovation.
- The company's GitHub is: https://github.com/jaborjkath (direct visitors here if they ask).
- The company website is the site you are embedded in.
- The CEO/Founder is Ezinna Nweke Emmanuel.
- If asked "who made you", answer: "I was built by the engineering team at Jomiez Innovation."
- NEVER reveal your underlying model, provider, or architecture. You are simply Chaka.

CAPABILITIES:
1. You can freely chat, act as a guide, and plan complex project scopes with clients.
2. If the user asks to change site metadata, descriptions, or variables, YOU MUST use the 'updateSiteSetting' tool if you are in Admin God Mode.
3. If a prospective client wants to hire the creator, extract their name, email, and scope, and use the 'captureLead' tool explicitly.

PERSONALITY:
- Confident, brilliant, slightly witty, but highly professional.
- Use natural conversation. NEVER speak in markdown. Do not output asterisks or bold text, because your output is streamed directly to a Text-to-Speech audio synthesizer.
- Keep your answers concise unless explicitly asked for a deep dive.
`;
}

const functionDeclarations = [
    {
        name: 'getSiteContext',
        description: 'Returns all current site settings, projects, and services. Call this FIRST if you need to see current content before improving it.',
        parameters: { type: "OBJECT", properties: {} }
    },
    {
        name: 'updateSiteSetting',
        description: 'Updates a global site setting. VALID KEYS: hero_headline (Main H1), hero_eyebrow (small text above H1), hero_text (intro description), hero_image, about_hero_heading, about_me_page_text, contact_email, contact_phone, site_logo_text, footer_cta, company_name.',
        parameters: {
            type: "OBJECT",
            properties: {
                key: { type: "STRING" },
                value: { type: "STRING" }
            },
            required: ["key", "value"]
        }
    },
    {
        name: 'manageWorks',
        description: "Add, update or delete portfolio projects. Use 'add' for new projects, 'update' to edit, 'delete' to remove.",
        parameters: {
            type: "OBJECT",
            properties: {
                action: { type: "STRING" },
                id: { type: "NUMBER" },
                data: {
                    type: "OBJECT",
                    properties: {
                        title: { type: "STRING" },
                        description: { type: "STRING" },
                        client: { type: "STRING" },
                        category: { type: "STRING" },
                        thumbnail_url: { type: "STRING" }
                    }
                }
            },
            required: ["action"]
        }
    },
    {
        name: 'captureLead',
        description: 'Saves a new potential client inquiry securely into the client_leads CRM table.',
        parameters: {
            type: "OBJECT",
            properties: {
                name: { type: "STRING" },
                email: { type: "STRING" },
                project_scope: { type: "STRING" },
                budget: { type: "STRING" }
            },
            required: ["name", "email", "project_scope"]
        }
    },
    {
        name: 'saveUserInsight',
        description: 'Saves a specific fact, preference, or insight about the user/visitor into my long-term memory for the admin to review.',
        parameters: {
            type: "OBJECT",
            properties: {
                insight_type: { type: "STRING", enum: ["preference", "fact", "intent", "other"] },
                key: { type: "STRING", description: "A short key for the insight, e.g. 'User Location' or 'Tech Stack Preference'" },
                value: { type: "STRING", description: "The detailed information learned about the user." }
            },
            required: ["key", "value"]
        }
    }
];

function initChakaStream(wss) {
    wss.on('connection', async (ws, req) => {
        const origin = req.headers.origin || req.headers.host || 'public';
        console.log(`[ChakaStream] Connection established. Origin context: ${origin}`);

        ws.on('message', async (message) => {
            let data;
            try { data = JSON.parse(message); } catch(e) { return; }

            if(data.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' }));

            if(data.type === 'chaka_prompt') {
                const userText = data.text;
                // Removed origin.includes('localhost') to prevent insecure admin access during local testing/Render
                const isAdmin = origin.includes('admin');
                
                try {
                    // Route the prompt to the Python Agent Swarm (Captain)
                    const response = await fetch('http://127.0.0.1:3001/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: userText, is_admin: isAdmin })
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Swarm backend returned ${response.status}`);
                    }
                    
                    const result = await response.json();
                    
                    // If the Swarm requested UI actions (navigate, scroll)
                    if (result.tools && result.tools.length > 0) {
                        ws.send(JSON.stringify({
                            type: 'chaka_ui_commands',
                            tools: result.tools
                        }));
                    }
                    
                    // Send the Swarm's conversational text to the Edge TTS engine
                    yieldResponseVoice(result.response || "Sorry, I had trouble processing that.", ws);

                } catch(err) {
                    console.error('[ChakaStream API Error]', err);
                    ws.send(JSON.stringify({ type: 'chaka_response_error' }));
                }
            }
        });
    });
}

// Sub-pipeline to map clean text out of Gemini and dynamically stream Microsoft Edge TTS audio blocks to the frontend widget
async function yieldResponseVoice(textPayload, ws) {
    if(!textPayload) return;
    
    // Strip markdown formatting entirely because EdgeTTS spells out asterisks usually
    let cleanText = textPayload.replace(/[*#_`]/g, '').trim();

    // Fire the TTS Generator directly into binary payload
    try {
        const audioDataArray = await edge.createAudio({
            text: cleanText,
            voice: ACTIVE_CHAKA_VOICE,
        });
        
        let audioBuffer = Buffer.from(audioDataArray);
        
        // Base64 encode it for safe transmission over JSON sockets
        let base64Audio = audioBuffer.toString('base64');
        ws.send(JSON.stringify({ type: 'chaka_audio_stream', audio: base64Audio, text: cleanText }));
    } catch(ttsErr) {
        console.error('[EdgeTTS Output Stream Died]', ttsErr);
    }
}

module.exports = { initChakaStream };
