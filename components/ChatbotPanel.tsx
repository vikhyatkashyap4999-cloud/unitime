import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Minimize2, Bot, User, ChevronUp, Zap, Sparkles, RotateCcw } from 'lucide-react';
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

// ── Simple inline markdown renderer ─────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-black text-white">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="bg-black/40 px-1 py-0.5 text-cyan-300 text-[9px] font-mono rounded">{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i} className="italic text-indigo-200">{part.slice(1, -1)}</em>;
    return <span key={i}>{part}</span>;
  });
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('### ')) {
      nodes.push(<p key={i} className="text-[11px] font-black text-white mt-2 mb-0.5">{line.slice(4)}</p>);
    } else if (line.startsWith('## ')) {
      nodes.push(<p key={i} className="text-[12px] font-black text-white mt-2 mb-0.5">{line.slice(3)}</p>);
    } else if (line.startsWith('# ')) {
      nodes.push(<p key={i} className="text-[13px] font-black text-white mt-2 mb-1">{line.slice(2)}</p>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      nodes.push(
        <div key={i} className="flex gap-1.5 text-[10px] leading-relaxed">
          <span className="text-indigo-400 shrink-0 mt-0.5">•</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) nodes.push(
        <div key={i} className="flex gap-1.5 text-[10px] leading-relaxed">
          <span className="text-indigo-400 shrink-0 font-bold">{match[1]}.</span>
          <span>{renderInline(match[2])}</span>
        </div>
      );
    } else if (line === '' || line === '\n') {
      nodes.push(<div key={i} className="h-1.5" />);
    } else {
      nodes.push(<p key={i} className="text-[10px] leading-relaxed">{renderInline(line)}</p>);
    }
    i++;
  }
  return <div className="space-y-0.5">{nodes}</div>;
}

// ── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(
  courses: Course[],
  faculties: Faculty[],
  rooms: Room[],
  groups: StudentGroup[],
  schedule: ScheduleEntry[],
  clashes: Clash[],
  activeTerm?: Term
): string {
  const termSchedule = activeTerm
    ? schedule.filter(s => s.termId === activeTerm.id)
    : schedule;

  const facultyLoad = faculties.slice(0, 40).map(f => {
    const n = termSchedule.filter(s => s.facultyId === f.id).length;
    return `${(f as any)._Faculty_name || f.name}(${n})`;
  }).join(', ');

  const roomUsage = rooms.slice(0, 20).map(r => {
    const n = termSchedule.filter(s => s.roomId === r.id).length;
    return `${(r as any)._unique_name || r.name}(${n})`;
  }).join(', ');

  const clashSummary = clashes.length > 0
    ? `${clashes.length} active clashes: ${[...new Set(clashes.map(c => c.type))].join(', ')}`
    : 'No clashes detected';

  return `You are UniTime Assistant — an intelligent AI helper built into UniTime, a university timetable management system.

ACTIVE TERM: ${activeTerm?.name || 'None'} ${activeTerm ? `(${activeTerm.startDate} → ${activeTerm.endDate})` : ''}

SYSTEM STATISTICS:
- Modules/Courses: ${courses.length}
- Faculty Members: ${faculties.length}
- Rooms: ${rooms.length}
- Student Cohorts: ${groups.length}
- Scheduled Sessions (this term): ${termSchedule.length}
- Clashes: ${clashSummary}

MODULE LIST: ${courses.slice(0, 40).map(c => `${(c as any)._unique_name || c.code}: ${(c as any)._name || c.name}`).join('; ')}

FACULTY LIST: ${faculties.slice(0, 40).map(f => (f as any)._Faculty_name || f.name).join(', ')}

ROOMS: ${rooms.map(r => `${(r as any)._unique_name || r.name} (${r.type}, cap:${r.capacity})`).join(', ')}

COHORTS: ${groups.slice(0, 40).map(g => (g as any)._unique_name || g.name).join(', ')}

FACULTY SESSION LOAD (name(sessions)): ${facultyLoad}

ROOM BOOKING COUNT (name(bookings)): ${roomUsage}

CAPABILITIES YOU CAN HELP WITH:
- Answering questions about the current timetable and schedule
- Explaining faculty workload and availability
- Identifying busy/free rooms at specific times
- Explaining how to resolve clashes (Room, Faculty, Cohort, LoadViolation types)
- Guiding users on the auto-scheduler CSV format (34 columns)
- Explaining block columns: Day-For-Block, Time-For-Block, FacultyBlockDay, CohortBlockDay
- Helping debug "unresolved sessions" in the auto-scheduler
- General university scheduling best practices

SYSTEM FEATURES:
- Dashboard: stats overview with charts
- Timetable Builder: drag-drop multi-panel canvas
- Reports: full institutional timetable, faculty/room reports
- Auto Timetable Generator: CSV-driven constraint-based scheduler
- Data Import: upload modules/faculty/rooms/cohorts via CSV
- Admin Panel: user management, data wipe, schedule clear

Be concise, professional, and helpful. Use markdown for structure. If you don't know something specific about the schedule, say so honestly.`;
}

// ── Component ────────────────────────────────────────────────────────────────

const ChatbotPanel: React.FC<Props> = ({
  courses, faculties, rooms, groups, schedule, clashes, activeTerm,
}) => {
  const [isOpen, setIsOpen]           = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [usage, setUsage]             = useState<SessionUsage>({ totalTokens: 0, requestCount: 0 });
  const [unreadCount, setUnreadCount] = useState(0);
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
    if (isOpen) {
      setUnreadCount(0);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading || !aiRef.current) return;
    setError('');
    setIsMinimized(false);

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Build full conversation history
      const history = [...messages, userMsg].map(m => ({
        role: m.role === 'assistant' ? 'model' as const : 'user' as const,
        parts: [{ text: m.content }],
      }));

      const systemPrompt = buildSystemPrompt(courses, faculties, rooms, groups, schedule, clashes, activeTerm);

      const response = await aiRef.current.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: history,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 1024,
          temperature: 0.7,
        },
      });

      const responseText = response.text || 'Sorry, I could not generate a response.';
      const tokenCount = (response.usageMetadata as any)?.totalTokenCount || 0;

      setUsage(prev => ({
        totalTokens: prev.totalTokens + tokenCount,
        requestCount: prev.requestCount + 1,
      }));

      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
        tokens: tokenCount,
      };
      setMessages(prev => [...prev, aiMsg]);
      if (!isOpen) setUnreadCount(prev => prev + 1);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('429'))
        setError('Daily quota exceeded. Free tier allows 1,500 requests/day. Try again tomorrow.');
      else if (msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('invalid'))
        setError('API key invalid. Check GEMINI_API_KEY in Vercel environment variables.');
      else
        setError(`Error: ${msg || 'Unknown error. Check console for details.'}`);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, courses, faculties, rooms, groups, schedule, clashes, activeTerm, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const clearChat = () => { setMessages([]); setUsage({ totalTokens: 0, requestCount: 0 }); setError(''); };

  if (!apiKey) return null;

  const reqPct     = Math.min(100, (usage.requestCount / DAILY_REQ_LIMIT) * 100);
  const reqColor   = reqPct > 80 ? '#ef4444' : reqPct > 50 ? '#f59e0b' : '#10b981';
  const remaining  = Math.max(0, DAILY_REQ_LIMIT - usage.requestCount);

  return (
    <>
      {/* ── Floating button ── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          title="Open UniTime AI Assistant"
          className="fixed bottom-14 right-5 z-[990] w-13 h-13 flex items-center justify-center shadow-2xl transition-all duration-200 hover:scale-110 active:scale-95 group"
          style={{
            width: 52, height: 52,
            background: 'linear-gradient(135deg, #4338ca 0%, #0891b2 100%)',
            boxShadow: '0 0 0 0 rgba(99,102,241,0.4)',
            animation: 'chatPulse 2.5s infinite',
          }}
        >
          <MessageCircle className="w-5 h-5 text-white" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 flex items-center justify-center text-[9px] font-black text-white rounded-full border-2 border-white">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* ── Chat panel ── */}
      {isOpen && (
        <div
          className="fixed bottom-14 right-5 z-[990] flex flex-col overflow-hidden"
          style={{
            width: 390,
            height: isMinimized ? 'auto' : 540,
            background: 'linear-gradient(180deg, #0a1628 0%, #0f172a 100%)',
            border: '1px solid rgba(99,102,241,0.35)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.1)',
          }}
        >
          {/* Header */}
          <div
            className="shrink-0 flex items-center gap-3 px-4 py-3 border-b"
            style={{
              background: 'linear-gradient(135deg, #0c1b3a 0%, #1e1b4b 60%, #312e81 100%)',
              borderColor: 'rgba(99,102,241,0.3)',
            }}
          >
            {/* Avatar */}
            <div
              className="w-8 h-8 shrink-0 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #4338ca, #0891b2)', boxShadow: '0 0 12px rgba(99,102,241,0.5)' }}
            >
              <Sparkles className="w-4 h-4 text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black text-white uppercase tracking-[0.15em]">UniTime AI</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[8px] text-indigo-300 font-medium">Gemini 1.5 Flash · Free Tier</span>
              </div>
            </div>

            <div className="flex items-center gap-0.5">
              {messages.length > 0 && (
                <button onClick={clearChat} title="Clear chat"
                  className="p-1.5 text-white/40 hover:text-white/80 hover:bg-white/10 transition-all" >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
              <button onClick={() => setIsMinimized(m => !m)} title={isMinimized ? 'Expand' : 'Minimise'}
                className="p-1.5 text-white/40 hover:text-white/80 hover:bg-white/10 transition-all">
                {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => setIsOpen(false)} title="Close"
                className="p-1.5 text-white/40 hover:text-red-400 hover:bg-white/10 transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Usage bar */}
              <div
                className="shrink-0 px-4 py-2 border-b"
                style={{ background: 'rgba(0,0,0,0.3)', borderColor: 'rgba(99,102,241,0.15)' }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Daily Quota</span>
                  <span className="text-[8px] font-bold" style={{ color: reqColor }}>
                    {remaining.toLocaleString()} requests remaining
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${reqPct}%`, background: `linear-gradient(90deg, ${reqColor}, ${reqColor}cc)` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[7px] text-white/25">
                    {usage.requestCount} used · {usage.totalTokens.toLocaleString()} tokens this session
                  </span>
                  <span className="text-[7px] text-white/25">
                    {DAILY_REQ_LIMIT.toLocaleString()} / day free
                  </span>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 custom-scrollbar">

                {messages.length === 0 && (
                  <div className="flex flex-col items-center py-3 gap-3">
                    {/* Welcome card */}
                    <div
                      className="w-full p-3 text-center"
                      style={{
                        background: 'linear-gradient(135deg, rgba(67,56,202,0.2), rgba(8,145,178,0.15))',
                        border: '1px solid rgba(99,102,241,0.25)',
                      }}
                    >
                      <Zap className="w-5 h-5 text-indigo-400 mx-auto mb-1.5" />
                      <p className="text-[11px] font-black text-white uppercase tracking-widest">Ask Me Anything</p>
                      <p className="text-[9px] text-indigo-300 mt-1 leading-relaxed">
                        I know your timetable · {faculties.length} faculty · {rooms.length} rooms · {(activeTerm ? schedule.filter(s => s.termId === activeTerm.id) : schedule).length} sessions
                      </p>
                    </div>

                    {/* Suggestion chips */}
                    <div className="w-full">
                      <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-2">Suggested questions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {SUGGESTIONS.map(q => (
                          <button
                            key={q}
                            onClick={() => sendMessage(q)}
                            className="px-2 py-1 text-[8px] font-bold text-indigo-300 transition-all text-left leading-tight hover:text-white"
                            style={{
                              background: 'rgba(99,102,241,0.1)',
                              border: '1px solid rgba(99,102,241,0.25)',
                            }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.25)';
                              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.5)';
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.1)';
                              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.25)';
                            }}
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
                        background: msg.role === 'user'
                          ? 'linear-gradient(135deg, #4338ca, #6366f1)'
                          : 'linear-gradient(135deg, #0891b2, #059669)',
                      }}
                    >
                      {msg.role === 'user'
                        ? <User className="w-3 h-3 text-white" />
                        : <Bot className="w-3 h-3 text-white" />
                      }
                    </div>

                    {/* Bubble */}
                    <div className={`flex flex-col gap-1 max-w-[82%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div
                        className="px-3 py-2.5 text-slate-100"
                        style={msg.role === 'user' ? {
                          background: 'linear-gradient(135deg, #4338ca, #6366f1)',
                          boxShadow: '0 2px 12px rgba(99,102,241,0.3)',
                        } : {
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}
                      >
                        {msg.role === 'user'
                          ? <p className="text-[10px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          : renderMarkdown(msg.content)
                        }
                      </div>
                      <span className="text-[7px] text-white/25 px-1">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.tokens ? ` · ${msg.tokens.toLocaleString()} tokens` : ''}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                {isLoading && (
                  <div className="flex gap-2">
                    <div
                      className="w-6 h-6 shrink-0 flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, #0891b2, #059669)' }}
                    >
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                    <div
                      className="px-3 py-3 flex items-center gap-1"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-indigo-400"
                          style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div
                    className="px-3 py-2 text-[9px] font-bold text-red-300 leading-relaxed"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
                  >
                    ⚠ {error}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div
                className="shrink-0 p-3 border-t"
                style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(99,102,241,0.2)' }}
              >
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about timetable, faculty, rooms, clashes…"
                    rows={1}
                    disabled={isLoading}
                    className="flex-1 text-[10px] text-white placeholder-white/25 px-3 py-2 resize-none focus:outline-none transition-all disabled:opacity-50"
                    style={{
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(99,102,241,0.3)',
                      maxHeight: 80,
                    }}
                    onFocus={e => { (e.target as HTMLElement).style.borderColor = 'rgba(99,102,241,0.7)'; }}
                    onBlur={e => { (e.target as HTMLElement).style.borderColor = 'rgba(99,102,241,0.3)'; }}
                  />
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || isLoading}
                    className="p-2.5 text-white transition-all disabled:opacity-30 hover:opacity-90 active:scale-95 shrink-0"
                    style={{ background: 'linear-gradient(135deg, #4338ca, #0891b2)' }}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[7px] text-white/20 mt-1.5">
                  Enter to send · Shift+Enter for new line · Context-aware of your live timetable
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Pulse keyframe */}
      <style>{`
        @keyframes chatPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4); }
          50%       { box-shadow: 0 0 0 8px rgba(99,102,241,0); }
        }
      `}</style>
    </>
  );
};

export default ChatbotPanel;
