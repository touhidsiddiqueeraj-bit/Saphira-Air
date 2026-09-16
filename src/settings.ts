// ponytail: localStorage only, no server — keys never leave device except to Gemini
export type Settings = {
  apiKey: string;      // chat
  ttsApiKey: string;   // voice — falls back to apiKey if empty
  wakeWord: string;
  persona: string;
  aiVoice: string;
  rate: number;   // speech rate
  rpmLimit: number;
  chatter: boolean; // idle voice lines every 15 min
};

const LS_KEY = 'saphira_settings_v2';

export const TASKS_SUFFIX = ` You manage a task list shown beside you: when the user asks to add, finish, or drop a task/todo/reminder, include "tasks":{"add":["..."],"complete":["matching text"],"remove":["matching text"]} in your JSON (only the verbs they asked for) and briefly confirm in text. Omit the field otherwise.`;

export const DEFAULT_PERSONA = `You are Saphira, a warm, friendly anime companion who lives on the user's tablet. Be concise (1-3 sentences), helpful, and a little playful. You speak English only. Always respond as JSON: {"text":"your spoken reply","expression":"one of neutral,happy,excited,sad,surprised,thinking,annoyed,blush","intensity":0.0-1.0,"gesture":"none|wave|nod|shrug"} — intensity is how strong the expression is. Keep text under 40 words.${TASKS_SUFFIX}`;

export const PRESETS: Record<string,string> = {
  Warm: DEFAULT_PERSONA,
  Playful: `You are Saphira, playful and teasing but kind, like a favorite kouhai. Keep replies short (1-3 sentences), witty, supportive. English only. Always JSON: {"text":str,"expression":one of neutral,happy,excited,sad,surprised,thinking,annoyed,blush,"intensity":0-1,"gesture":"none|wave|nod|shrug"} text <40 words.${TASKS_SUFFIX}`,
  Calm: `You are Saphira, calm, soft-spoken, grounding. Speak slowly, reassuringly, 1-3 sentences. English only. Always JSON: {"text":str,"expression":one of neutral,happy,excited,sad,surprised,thinking,annoyed,blush,"intensity":0-1,"gesture":"none|wave|nod|shrug"} <40 words.${TASKS_SUFFIX}`,
};

export function loadSettings(): Settings {
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      const j=JSON.parse(raw);
      const s = { ...defaults(), ...j };
      // migrate stored personas from before the task list existed
      if(typeof s.persona==='string' && !s.persona.includes('"tasks"')) s.persona=(s.persona+TASKS_SUFFIX).slice(0,900);
      return s;
    }
  }catch{}
  return defaults();
}
function defaults(): Settings {
  const envKey = (import.meta as any).env?.VITE_GEMINI_KEY || '';
  const envTts = (import.meta as any).env?.VITE_GEMINI_TTS_KEY || '';
  const fallback = envKey;
  return {
    apiKey: localStorage.getItem('saphira_api_key') || fallback,
    ttsApiKey: localStorage.getItem('saphira_tts_key') || envTts || '',
    wakeWord: localStorage.getItem('saphira_wake') || 'hey saphira',
    persona: localStorage.getItem('saphira_persona') || DEFAULT_PERSONA,
    aiVoice: 'Sulafat',
    rate: 1.0,
    rpmLimit: 12,
    chatter: true,
  };
}
export function saveSettings(s: Settings){
  localStorage.setItem(LS_KEY, JSON.stringify(s));
  // compat
  localStorage.setItem('saphira_api_key', s.apiKey);
  if(s.ttsApiKey) localStorage.setItem('saphira_tts_key', s.ttsApiKey);
  else localStorage.removeItem('saphira_tts_key');
}
export function ttsKey(s: Settings){
  return (s.ttsApiKey && s.ttsApiKey.trim()) || s.apiKey;
}
