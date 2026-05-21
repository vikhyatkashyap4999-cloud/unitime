import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Minimize2, Bot, User, ChevronUp, RotateCcw, Sparkles } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import type { Course, Faculty, Room, StudentGroup, ScheduleEntry, Clash, Term } from '../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tokens?: number;
}

interface SessionUsage {
  totalTokens: number;
  requestCount: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  courses: Course[];
  faculties: Faculty[];
  rooms: Room[];
  groups: StudentGroup[];
  schedule: ScheduleEntry[];
  clashes: Clash[];
  activeTerm?: Term;
}

const DAILY_REQ_LIMIT = 1500;

const SUGGESTIONS = [
  'How many sessions are scheduled this term?',
  'Which faculty has the most sessions?',
  'Are there any scheduling clashes?',
  'Which rooms are most used?',
  'How do I use the auto-scheduler?',
  'What cohorts are in the system?',
  'How do I resolve a faculty clash?',
  'What is the CSV format for auto-scheduling?',
];

// ── Inline markdown renderer ─────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-bold text-[#0f172a]">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="bg-[#f1f5f9] px-1 py-0.5 text-[#0891b2] text-[9px] font-mono rounded border border-[#e2e8f0]">{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i} className="italic text-[#475569]">{part.slice(1, -1)}</em>;
    return <span key={i}>{part}</span>;
  });
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    if (line.startsWith('### '))
      nodes.push(<p key={i} className="text-[11px] font-bold text-[#0f172a] mt-2 mb-0.5">{line.slice(4)}</p>);
    else if (line.startsWith('## '))
      nodes.push(<p key={i} className="text-[12px] font-bold text-[#0f172a] mt-2 mb-0.5">{line.slice(3)}</p>);
    else if (line.startsWith('# '))
      nodes.push(<p key={i} className="text-[13px] font-bold text-[#0f172a] mt-2 mb-1">{line.slice(2)}</p>);
    else if (line.startsWith('- ') || line.startsWith('* '))
      nodes.push(
        <div key={i} className="flex gap-1.5 text-[10px] leading-relaxed text-[#334155]">
          <span className="text-[#185baf] shrink-0 mt-0.5 font-bold">•</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
    else if (/^\d+\.\s/.test(line)) {
      const m = line.match(/^(\d+)\.\s(.*)$/);
      if (m) nodes.push(
        <div key={i} className="flex gap-1.5 text-[10px] leading-relaxed text-[#334155]">
          <span className="text-[#185baf] shrink-0 font-bold">{m[1]}.</span>
          <span>{renderInline(m[2])}</span>
        </div>
      );
    } else if (line.trim() === '')
      nodes.push(<div key={i} className="h-1" />);
    else
      nodes.push(<p key={i} className="text-[10px] leading-relaxed text-[#334155]">{renderInline(line)}</p>);
  });
  return <div className="space-y-0.5">{nodes}</div>;
}

// ── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  courses: Course[], faculties: Faculty[], rooms: Room[],
  groups: StudentGroup[], schedule: ScheduleEntry[], clashes: Clash[], activeTerm?: Term
): string {
  const termSchedule = activeTerm ? schedule.filter(s => s.termId === activeTerm.id) : schedule;

  const facultyLoad = faculties.slice(0, 40).map(f => {
    const n = termSchedule.filter(s => s.facultyId === f.id).length;
    return `${(f as any)._Faculty_name || f.name}(${n}sessions)`;
  }).join(', ');

  const roomUsage = rooms.slice(0, 20).map(r => {
    const n = termSchedule.filter(s => s.roomId === r.id).length;
    return `${(r as any)._unique_name || r.name}(${n}bookings)`;
  }).join(', ');

  return `You are UniTime Assistant — an intelligent AI helper built into UniTime, a university timetable management system.

ACTIVE TERM: ${activeTerm?.name || 'None'} ${activeTerm ? `(${activeTerm.startDate} → ${activeTerm.endDate})` : ''}

STATISTICS:
- Modules: ${courses.length} | Faculty: ${faculties.length} | Rooms: ${rooms.length} | Cohorts: ${groups.length}
- Sessions (this term): ${termSchedule.length} | Clashes: ${clashes.length > 0 ? `${clashes.length} (${[...new Set(clashes.map(c => c.type))].join(', ')})` : 'None'}

MODULES: ${courses.slice(0, 40).map(c => `${(c as any)._unique_name || c.code}:${(c as any)._name || c.name}`).join('; ')}
FACULTY: ${faculties.slice(0, 40).map(f => (f as any)._Faculty_name || f.name).join(', ')}
ROOMS: ${rooms.map(r => `${(r as any)._unique_name || r.name}(${r.type},cap:${r.capacity})`).join(', ')}
COHORTS: ${groups.slice(0, 40).map(g => (g as any)._unique_name || g.name).join(', ')}
FACULTY LOAD: ${facultyLoad}
ROOM USAGE: ${roomUsage}

Help with: timetable questions, faculty workload, room availability, clash resolution, auto-scheduler CSV format, block columns (Day-For-Block, FacultyBlockDay, CohortBlockDay), unresolved session debugging, and general UniTime usage.

Be concise, professional, and helpful. Use markdown formatting for clarity.`;
}

// ── Component ────────────────────────────────────────────────────────────────

const ChatbotPanel: React.FC<Props> = ({
  isOpen, onClose, courses, faculties, rooms, groups, schedule, clashes, activeTerm,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [usage, setUsage]             = useState<SessionUsage>({ totalTokens: 0, requestCount: 0 });
  const [error, setError]             = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const aiRef          = useRef<GoogleGenAI | null>(null);

  const apiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();

  useEffect(() => {
    if (apiKey) aiRef.current = new GoogleGenAI({ apiKey });
  }, [apiKey]);

  useEffect(() => {
    if (messages.length > 0) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen && !isMinimized) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen, isMinimized]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading || !aiRef.current) return;
    setError('');
    setIsMinimized(false);

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const history = [...messages, userMsg].map(m => ({
        role: m.role === 'assistant' ? 'model' as const : 'user' as const,
        parts: [{ text: m.content }],
      }));

      const response = await aiRef.current.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: history,
        config: {
          systemInstruction: buildSystemPrompt(courses, faculties, rooms, groups, schedule, clashes, activeTerm),
          maxOutputTokens: 1024,
          temperature: 0.7,
        },
      });

      const responseText = response.text || 'Sorry, I could not generate a response.';
      const tokenCount   = (response.usageMetadata as any)?.totalTokenCount || 0;

      setUsage(prev => ({ totalTokens: prev.totalTokens + tokenCount, requestCount: prev.requestCount + 1 }));
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: responseText, timestamp: new Date(), tokens: tokenCount }]);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('429'))
        setError('Daily quota exceeded. Free tier: 1,500 requests/day. Try again tomorrow.');
      else if (msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('invalid'))
        setError('Invalid API key. Check GEMINI_API_KEY in Vercel environment variables.');
      else
        setError(`Error: ${msg || 'Unknown error.'}`);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, courses, faculties, rooms, groups, schedule, clashes, activeTerm]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  if (!isOpen || !apiKey) return null;

  const reqPct    = Math.min(100, (usage.requestCount / DAILY_REQ_LIMIT) * 100);
  const remaining = Math.max(0, DAILY_REQ_LIMIT - usage.requestCount);
  const reqColor  = reqPct > 80 ? '#dc2626' : reqPct > 50 ? '#d97706' : '#16a34a';
  const termScheduleCount = activeTerm ? schedule.filter(s => s.termId === activeTerm.id).length : schedule.length;

  return (
    <div
      className="fixed z-[980] flex flex-col overflow-hidden"
      style={{
        top: 42,
        right: 8,
        width: 420,
        height: isMinimized ? 'auto' : 580,
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1)',
      }}
    >
      {/* ── Header ── */}
      <div
        className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 border-b border-[#0a2d6e]"
        style={{ background: 'linear-gradient(180deg, #1e6ad4 0%, #185baf 60%, #124a99 100%)' }}
      >
        <div className="w-7 h-7 flex items-center justify-center shrink-0 bg-white/20 border border-white/30">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black text-white uppercase tracking-[0.12em]">UniTime AI Assistant</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
            <span className="text-[8px] text-blue-200 font-medium">Gemini 1.5 Flash · Free Tier</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); setUsage({ totalTokens: 0, requestCount: 0 }); setError(''); }}
              title="Clear chat"
              className="p-1.5 text-white/60 hover:text-white hover:bg-white/15 transition-all">
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
          <button onClick={() => setIsMinimized(m => !m)} title={isMinimized ? 'Expand' : 'Minimise'}
            className="p-1.5 text-white/60 hover:text-white hover:bg-white/15 transition-all">
            {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onClose} title="Close"
            className="p-1.5 text-white/60 hover:text-white hover:bg-white/15 transition-all">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* ── Usage bar ── */}
          <div className="shrink-0 px-4 py-2 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] font-black text-[#64748b] uppercase tracking-widest">Daily Quota</span>
              <span className="text-[8px] font-bold" style={{ color: reqColor }}>
                {remaining.toLocaleString()} requests remaining
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-[#e2e8f0]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${reqPct}%`, background: `linear-gradient(90deg, ${reqColor}cc, ${reqColor})` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[7px] text-[#94a3b8]">
                {usage.requestCount} used · {usage.totalTokens.toLocaleString()} tokens this session
              </span>
              <span className="text-[7px] text-[#94a3b8]">1,500 / day free</span>
            </div>
          </div>

          {/* ── Messages ── */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 custom-scrollbar bg-[#f8fafc]">

            {messages.length === 0 && (
              <div className="flex flex-col gap-3">
                {/* Welcome card */}
                <div className="bg-white border border-[#e2e8f0] p-3 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 flex items-center justify-center bg-[#185baf]">
                      <Sparkles className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-[#0f172a] uppercase tracking-wide">Ask Me Anything</p>
                      <p className="text-[8px] text-[#64748b]">Context-aware of your live timetable</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-[#f1f5f9]">
                    {[
                      { label: 'Faculty', value: faculties.length },
                      { label: 'Rooms', value: rooms.length },
                      { label: 'Sessions', value: termScheduleCount },
                    ].map(s => (
                      <div key={s.label} className="text-center bg-[#f8fafc] border border-[#e2e8f0] py-1.5">
                        <p className="text-[14px] font-black text-[#185baf]">{s.value}</p>
                        <p className="text-[7px] font-bold text-[#64748b] uppercase tracking-wider">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Suggestions */}
                <div>
                  <p className="text-[8px] font-black text-[#94a3b8] uppercase tracking-widest mb-1.5">Suggested Questions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTIONS.map(q => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="px-2.5 py-1 text-[9px] font-medium text-[#185baf] bg-white border border-[#bfdbfe] hover:bg-[#eff6ff] hover:border-[#185baf] transition-all text-left leading-tight"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div
                  className="w-6 h-6 shrink-0 flex items-center justify-center mt-0.5"
                  style={{
                    background: msg.role === 'user' ? '#185baf' : '#f1f5f9',
                    border: msg.role === 'assistant' ? '1px solid #e2e8f0' : 'none',
                  }}
                >
                  {msg.role === 'user'
                    ? <User className="w-3 h-3 text-white" />
                    : <Bot className="w-3 h-3 text-[#185baf]" />
                  }
                </div>

                {/* Bubble */}
                <div className={`flex flex-col gap-0.5 max-w-[82%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className="px-3 py-2"
                    style={msg.role === 'user' ? {
                      background: 'linear-gradient(135deg, #1e6ad4, #185baf)',
                      color: 'white',
                    } : {
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    }}
                  >
                    {msg.role === 'user'
                      ? <p className="text-[10px] leading-relaxed whitespace-pre-wrap text-white">{msg.content}</p>
                      : renderMarkdown(msg.content)
                    }
                  </div>
                  <span className="text-[7px] text-[#94a3b8] px-1">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {msg.tokens ? ` · ${msg.tokens.toLocaleString()} tokens` : ''}
                  </span>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 flex items-center justify-center bg-[#f1f5f9] border border-[#e2e8f0]">
                  <Bot className="w-3 h-3 text-[#185baf]" />
                </div>
                <div className="px-3 py-3 bg-white border border-[#e2e8f0] flex items-center gap-1 shadow-sm">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#185baf]"
                      style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="px-3 py-2 text-[9px] font-medium text-[#dc2626] bg-[#fef2f2] border border-[#fecaca]">
                ⚠ {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input ── */}
          <div className="shrink-0 p-3 border-t border-[#e2e8f0] bg-white">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about timetable, faculty, rooms, clashes…"
                rows={1}
                disabled={isLoading}
                className="flex-1 text-[10px] text-[#0f172a] placeholder-[#94a3b8] px-3 py-2 resize-none border border-[#cbd5e1] focus:outline-none focus:border-[#185baf] transition-colors bg-[#f8fafc] disabled:opacity-50"
                style={{ maxHeight: 80 }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                className="p-2.5 text-white transition-all disabled:opacity-30 hover:opacity-90 active:scale-95 shrink-0"
                style={{ background: 'linear-gradient(135deg, #1e6ad4, #185baf)' }}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[7px] text-[#cbd5e1] mt-1.5">
              Enter to send · Shift+Enter for new line · Context-aware of your live timetable
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatbotPanel;
