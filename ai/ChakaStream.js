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

YOUR CURRENT MODE: ${mode}

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

        // Setup Chat Session lazily once key is verified
        let chatSession = null;

        ws.on('message', async (message) => {
            let data;
            try { data = JSON.parse(message); } catch(e) { return; }

            if(data.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' }));

            if(data.type === 'chaka_prompt') {
                const userText = data.text;
                let apiKey;

                try {
                    apiKey = await global.apiKeyManager.getNextKey('gemini');
                } catch(e) {
                    return ws.send(JSON.stringify({ type: 'error', message: 'No Gemini API Keys active in Admin.'}));
                }

                try {
                    const genAI = new GoogleGenerativeAI(apiKey);
                    const model = genAI.getGenerativeModel({
                        model: 'gemini-2.5-flash',
                        systemInstruction: generateSystemInstructions(origin),
                        tools: [{ functionDeclarations }]
                    });

                    if(!chatSession) {
                        chatSession = model.startChat({ history: [] });
                    }

                    // 1. Send text to Gemini
                    const result = await chatSession.sendMessage(userText);
                    const response = result.response;
                    const calls = response.functionCalls();

                    // 2. Intercept Function Calls
                    if (calls) {
                        for (const call of calls) {
                            let result = {};
                            
                            if (call.name === 'getSiteContext') {
                                // Manual orchestration of site context for Bidi stream
                                const settings = await new Promise(r => db.all("SELECT key, value FROM settings", [], (err, rows) => r(rows)));
                                const works = await new Promise(r => db.all("SELECT * FROM works ORDER BY id DESC", [], (err, rows) => r(rows)));
                                result = { settings, works };
                                
                                const funcResult = await chatSession.sendMessage([{
                                    functionResponse: { name: call.name, response: { result: result } }
                                }]);
                                yieldResponseVoice(funcResult.response.text(), ws);
                            }
                            else if (call.name === 'updateSiteSetting') {
                                const { key, value } = call.args;
                                console.log(`[Chaka God Mode] Updating setting: ${key} -> ${value}`);
                                await new Promise(r => db.run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?`, [key, value, value], r));
                                
                                const funcResult = await chatSession.sendMessage([{
                                    functionResponse: { name: call.name, response: { status: "Success", injected: value } }
                                }]);
                                yieldResponseVoice(funcResult.response.text(), ws);
                            }
                            else if (call.name === 'manageWorks') {
                                const { action, id, data } = call.args;
                                if (action === 'add') {
                                    const { title, description, client, category, thumbnail_url } = data;
                                    const slug = title.toLowerCase().replace(/[^a-z0-9]/g, '-');
                                    await new Promise(r => db.run(`INSERT INTO works (title, description, client, category, thumbnail_url, date, project_link, slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
                                        [title, description, client, category, thumbnail_url || '/uploads/default-work.jpg', new Date().toISOString().split('T')[0], '#', slug], r));
                                }
                                
                                const funcResult = await chatSession.sendMessage([{
                                    functionResponse: { name: call.name, response: { status: `Task ${action} executed successfully.` } }
                                }]);
                                yieldResponseVoice(funcResult.response.text(), ws);
                            }
                            else if (call.name === 'captureLead') {
                                const { name, email, project_scope, budget } = call.args;
                                await new Promise(r => db.run(`INSERT INTO client_leads (name, email, project_scope, budget) VALUES (?, ?, ?, ?)`, [name, email, project_scope, budget || 'Unknown'], r));
                                
                                const funcResult = await chatSession.sendMessage([{
                                    functionResponse: { name: call.name, response: { status: "Lead Saved!" } }
                                }]);
                                yieldResponseVoice(funcResult.response.text(), ws);
                            }
                            else if (call.name === 'saveUserInsight') {
                                const { insight_type, key, value } = call.args;
                                await new Promise(r => db.run(`INSERT INTO ai_memory (insight_type, key, value) VALUES (?, ?, ?)`, [insight_type || 'fact', key, value], r));
                                
                                const funcResult = await chatSession.sendMessage([{
                                    functionResponse: { name: call.name, response: { status: "Memory Stored!" } }
                                }]);
                                yieldResponseVoice(funcResult.response.text(), ws);
                            }
                        }
                    } else {
                        // 3. Just normal conversational response
                        yieldResponseVoice(response.text(), ws);
                    }

                } catch(err) {
                    console.error('[ChakaStream API Error]', err);
                    ws.send(JSON.stringify({ type: 'chaka_response_error' }));
                    // Try to trigger ApiKeyManager auto-rotation fail tracking here
                    if(err.status === 429) global.apiKeyManager.reportFailure('gemini', apiKey);
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
