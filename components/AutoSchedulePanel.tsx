import React, { useState, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import { Download, Upload, Zap, CheckCircle, AlertTriangle, FileText, X, ChevronDown, ChevronUp, MapPin, Clock, Coffee, Calendar } from 'lucide-react';
import type { Course, Faculty, Room, StudentGroup, ScheduleEntry, Term, UserAccount } from '../types';
import {
  runAutoScheduler,
  COURSE_TEMPLATE_CSV,
  ROOM_CAMPUS_TEMPLATE_CSV,
  type CourseAssignment,
  type UnresolvedSession,
  type SchedulerResult,
} from '../utils/autoScheduler';

interface Props {
  courses: Course[];
  faculties: Faculty[];
  rooms: Room[];
  groups: StudentGroup[];
  terms: Term[];
  activeTermId: string | null;
  onApplySchedule: (entries: Omit<ScheduleEntry, 'id' | 'departmentId'>[]) => Promise<void>;
  currentUser: UserAccount;
}

type Stage = 'idle' | 'running' | 'done';

function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function getTermWeeks(term: Term | undefined): number[] {
  if (!term?.startDate || !term?.endDate) return Array.from({ length: 20 }, (_, i) => i + 1);
  const ms = new Date(term.endDate).getTime() - new Date(term.startDate).getTime();
  const n = Math.max(1, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)));
  return Array.from({ length: n }, (_, i) => i + 1);
}

const AutoSchedulePanel: React.FC<Props> = ({
  courses, faculties, rooms, groups, terms, activeTermId, onApplySchedule,
}) => {
  const courseFileRef = useRef<HTMLInputElement>(null);
  const roomFileRef   = useRef<HTMLInputElement>(null);
  const [courseFileName, setCourseFileName] = useState('');
  const [roomFileName,   setRoomFileName]   = useState('');
  const [assignments, setAssignments]       = useState<CourseAssignment[]>([]);
  const [roomCampusMap, setRoomCampusMap]   = useState<Map<string, string>>(new Map());
  const [parseError, setParseError]         = useState('');

  const [defDays,  setDefDays]  = useState<'Mon-Fri' | 'Tue-Sat'>('Mon-Fri');
  const [defStart, setDefStart] = useState<8 | 10>(8);
  const [defEnd,   setDefEnd]   = useState<16 | 18>(16);
  const [defLunch, setDefLunch] = useState<12 | 13 | 14>(13);

  const [stage,        setStage]        = useState<Stage>('idle');
  const [progress,     setProgress]     = useState(0);
  const [label,        setLabel]        = useState('');
  const [result,       setResult]       = useState<SchedulerResult | null>(null);
  const [showUnresolved, setShowUnresolved] = useState(false);
  const [applying,     setApplying]     = useState(false);

  const activeTerm = terms.find(t => t.id === activeTermId);

  const parseCourseFile = useCallback((file: File) => {
    setParseError('');
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data as Record<string, string>[];
        if (!rows.length) { setParseError('Course file is empty'); return; }
        const parsed: CourseAssignment[] = rows.map(r => {
          const cohorts = Array.from({ length: 12 }, (_, i) => (r[`Cohort${i + 1}`] || '').trim()).filter(Boolean);
          return {
            facultyId:   (r.FacultyID   || '').trim(),
            facultyName: (r.FacultyName || '').trim(),
            courseCode:  (r.CourseCode  || '').trim(),
            courseName:  (r.CourseName  || '').trim(),
            credits:     Math.max(1, parseInt(r.Credits) || 1),
            category:    (r.Category    || 'Theory').trim(),
            campus:      (r.Campus      || '').trim(),
            cohorts,
            fixedRoom:   (r.FixedRoom   || '').trim(),
            workingDays: ((r.WorkingDays || '').trim() || defDays) as any,
            timeStart:   parseInt(r.TimeStart) || defStart,
            timeEnd:     parseInt(r.TimeEnd)   || defEnd,
            lunchStart:  parseInt(r.LunchStart) || defLunch,
          };
        }).filter(a => a.courseCode && a.facultyId);
        if (!parsed.length) { setParseError('No valid rows found — check column headers match template'); return; }
        setAssignments(parsed);
        setCourseFileName(file.name);
        setResult(null);
      },
      error: (e) => setParseError(e.message),
    });
  }, [defDays, defStart, defEnd, defLunch]);

  const parseRoomFile = useCallback((file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data as Record<string, string>[];
        const map = new Map<string, string>();
        rows.forEach(r => {
          const name = (r.RoomName || '').trim();
          const campus = (r.Campus || '').trim();
          if (name && campus) map.set(name, campus);
        });
        setRoomCampusMap(map);
        setRoomFileName(file.name);
      },
    });
  }, []);

  const handleGenerate = async () => {
    if (!assignments.length) return;
    setStage('running');
    setProgress(0);
    setLabel('Starting…');
    setResult(null);
    const weeks = getTermWeeks(activeTerm);
    const res = await runAutoScheduler(
      assignments, roomCampusMap, courses, faculties, rooms, groups,
      activeTermId || '', weeks,
      (placed, total, lbl) => {
        setProgress(total > 0 ? Math.round((placed / total) * 100) : 0);
        setLabel(lbl);
      },
    );
    setResult(res);
    setStage('done');
    setProgress(100);
    setLabel('Complete');
  };

  const handleApply = async () => {
    if (!result) return;
    setApplying(true);
    const toApply = result.entries.map(({ id: _id, departmentId: _d, ...rest }) => rest);
    await onApplySchedule(toApply as any);
    setApplying(false);
    alert(`✅ ${result.entries.length} sessions applied to the timetable. Switch to Timetable Builder to view them.`);
  };

  // Pill-style toggle chip
  const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wide border transition-all ${
        active
          ? 'text-white border-transparent shadow-sm'
          : 'bg-white text-[#64748b] border-[#e2e8f0] hover:border-[#94a3b8]'
      }`}
      style={active ? { background: 'linear-gradient(135deg, #d97706, #f59e0b)' } : {}}
    >
      {children}
    </button>
  );

  const pct = progress;
  const isReady = assignments.length > 0 && stage !== 'running';

  // Step card accent colors
  const STEP_GRADS = [
    'linear-gradient(135deg, #4338ca, #6366f1)',   // Step 1 — indigo
    'linear-gradient(135deg, #7c3aed, #a855f7)',   // Step 2 — violet
    'linear-gradient(135deg, #d97706, #f59e0b)',   // Step 3 — amber
  ];

  const StepHeader = ({ n, label: lbl, grad }: { n: string; label: string; grad: string }) => (
    <div className="flex items-center gap-2.5 mb-3 pb-2.5 border-b border-[#f1f5f9]">
      <div className="w-6 h-6 flex items-center justify-center text-[11px] font-black text-white shrink-0 shadow-sm" style={{ background: grad }}>{n}</div>
      <span className="text-[12px] font-black text-[#0f172a] uppercase tracking-wide">{lbl}</span>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto bg-[#f0f4f8] custom-scrollbar">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-4 overflow-hidden relative" style={{ background: 'linear-gradient(135deg, #0c1b3a 0%, #1e1b4b 35%, #312e81 65%, #4338ca 100%)' }}>
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 75% 50%, rgba(99,102,241,0.3) 0%, transparent 60%), radial-gradient(circle at 20% 80%, rgba(139,92,246,0.2) 0%, transparent 50%)' }} />
        <div className="absolute right-0 top-0 bottom-0 w-40 opacity-[0.05]" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, white 0px, white 1px, transparent 1px, transparent 12px)' }} />
        <div className="relative px-5 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-[17px] font-black text-white tracking-tight flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-300" /> Auto Timetable Generator
            </h2>
            <p className="text-[11px] text-indigo-200 font-medium mt-0.5">
              Upload assignments → configure constraints → generate a clash-free timetable
            </p>
          </div>
          {activeTerm ? (
            <div className="bg-white/10 border border-white/20 px-3 py-2">
              <p className="text-[9px] font-bold text-indigo-300 uppercase tracking-widest">Active Term</p>
              <p className="text-[13px] font-black text-white">{activeTerm.name}</p>
            </div>
          ) : (
            <div className="bg-white/10 border border-white/20 px-3 py-2">
              <p className="text-[9px] font-bold text-indigo-300 uppercase tracking-widest">No Active Term</p>
              <p className="text-[11px] font-bold text-white/60">Set one in Terms tab</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* Step 1 — Download Templates */}
          <div className="bg-white border border-[#e2e8f0] shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-3">
              <StepHeader n="1" label="Download Templates" grad={STEP_GRADS[0]} />
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => downloadCSV('course_assignment_template.csv', COURSE_TEMPLATE_CSV)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity shadow-sm"
                  style={{ background: STEP_GRADS[0] }}
                >
                  <Download className="w-3.5 h-3.5" /> Course Template
                </button>
                <button
                  onClick={() => downloadCSV('room_campus_template.csv', ROOM_CAMPUS_TEMPLATE_CSV)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[#4338ca] text-[10px] font-black uppercase tracking-widest border-2 border-[#6366f1] hover:bg-[#eef2ff] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Room-Campus Template
                </button>
              </div>
              <div className="bg-[#eef2ff] border border-[#c7d2fe] px-3 py-2 text-[9px] text-[#4338ca] leading-relaxed">
                <strong>Course Template:</strong> one row per course-faculty combination. Multiple cohorts sharing a session → fill Cohort1, Cohort2… on the same row.<br />
                <strong>Room-Campus Template:</strong> maps each room name to its campus code (K1, K2, AB…).
              </div>
            </div>
          </div>

          {/* Step 2 — Upload Files */}
          <div className="bg-white border border-[#e2e8f0] shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-3 space-y-3">
              <StepHeader n="2" label="Upload Files" grad={STEP_GRADS[1]} />

              {/* Course file upload zone */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <FileText className="w-3 h-3 text-[#7c3aed]" />
                  <span className="text-[10px] font-black text-[#334155] uppercase tracking-widest">Course Assignment File</span>
                  <span className="text-[9px] font-bold text-[#e11d48] ml-0.5">Required</span>
                </div>
                {assignments.length > 0 ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 border-2 border-[#a855f7] bg-[#faf5ff]">
                    <CheckCircle className="w-4 h-4 text-[#7c3aed] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-[#7c3aed] truncate">{courseFileName}</p>
                      <p className="text-[9px] text-[#a855f7]">{assignments.length} course assignments ready</p>
                    </div>
                    <button onClick={() => { setCourseFileName(''); setAssignments([]); setResult(null); }} className="p-1 text-[#7c3aed] hover:bg-[#ede9fe] transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => courseFileRef.current?.click()}
                    className="w-full flex flex-col items-center gap-2 px-4 py-5 border-2 border-dashed border-[#c4b5fd] bg-[#faf5ff] hover:bg-[#f5f3ff] hover:border-[#7c3aed] transition-all group"
                  >
                    <Upload className="w-5 h-5 text-[#c4b5fd] group-hover:text-[#7c3aed] transition-colors" />
                    <span className="text-[10px] font-black text-[#94a3b8] group-hover:text-[#7c3aed] uppercase tracking-widest transition-colors">Click to upload CSV</span>
                  </button>
                )}
                <input ref={courseFileRef} type="file" accept=".csv" className="hidden"
                  onChange={e => e.target.files?.[0] && parseCourseFile(e.target.files[0])} />
              </div>

              {/* Room-campus file upload zone */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MapPin className="w-3 h-3 text-[#0891b2]" />
                  <span className="text-[10px] font-black text-[#334155] uppercase tracking-widest">Room-Campus Mapping</span>
                  <span className="text-[9px] font-bold text-[#94a3b8] ml-0.5">(optional)</span>
                </div>
                {roomCampusMap.size > 0 ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 border-2 border-[#06b6d4] bg-[#ecfeff]">
                    <CheckCircle className="w-4 h-4 text-[#0891b2] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-[#0891b2] truncate">{roomFileName}</p>
                      <p className="text-[9px] text-[#06b6d4]">{roomCampusMap.size} rooms mapped</p>
                    </div>
                    <button onClick={() => { setRoomFileName(''); setRoomCampusMap(new Map()); }} className="p-1 text-[#0891b2] hover:bg-[#cffafe] transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => roomFileRef.current?.click()}
                    className="w-full flex flex-col items-center gap-2 px-4 py-4 border-2 border-dashed border-[#a5f3fc] bg-[#ecfeff] hover:bg-[#cffafe] hover:border-[#0891b2] transition-all group"
                  >
                    <Upload className="w-4 h-4 text-[#a5f3fc] group-hover:text-[#0891b2] transition-colors" />
                    <span className="text-[10px] font-black text-[#94a3b8] group-hover:text-[#0891b2] uppercase tracking-widest transition-colors">Click to upload CSV</span>
                  </button>
                )}
                <input ref={roomFileRef} type="file" accept=".csv" className="hidden"
                  onChange={e => e.target.files?.[0] && parseRoomFile(e.target.files[0])} />
              </div>

              {parseError && (
                <div className="flex items-center gap-2 px-3 py-2 border border-[#fecdd3] bg-[#fff1f2] text-[#e11d48]">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[10px] font-bold">{parseError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Step 3 — Default Constraints */}
          <div className="bg-white border border-[#e2e8f0] shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-3 space-y-3">
              <StepHeader n="3" label="Default Constraints" grad={STEP_GRADS[2]} />
              <p className="text-[9px] text-[#94a3b8] -mt-1 mb-2">Applied when CSV columns are left blank</p>

              {/* Working Days */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Calendar className="w-3 h-3 text-[#d97706]" />
                  <span className="text-[10px] font-black text-[#334155] uppercase tracking-widest">Working Days</span>
                </div>
                <div className="flex gap-2">
                  <Chip active={defDays === 'Mon-Fri'} onClick={() => setDefDays('Mon-Fri')}>Mon – Fri</Chip>
                  <Chip active={defDays === 'Tue-Sat'} onClick={() => setDefDays('Tue-Sat')}>Tue – Sat</Chip>
                </div>
              </div>

              {/* Time Window */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-3 h-3 text-[#d97706]" />
                  <span className="text-[10px] font-black text-[#334155] uppercase tracking-widest">Time Window</span>
                </div>
                <div className="flex gap-2">
                  <Chip active={defStart === 8}  onClick={() => { setDefStart(8);  setDefEnd(16); }}>8 am – 4 pm</Chip>
                  <Chip active={defStart === 10} onClick={() => { setDefStart(10); setDefEnd(18); }}>10 am – 6 pm</Chip>
                </div>
              </div>

              {/* Lunch Break */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Coffee className="w-3 h-3 text-[#d97706]" />
                  <span className="text-[10px] font-black text-[#334155] uppercase tracking-widest">Lunch Break</span>
                </div>
                <div className="flex gap-2">
                  <Chip active={defLunch === 12} onClick={() => setDefLunch(12)}>12 – 1 pm</Chip>
                  <Chip active={defLunch === 13} onClick={() => setDefLunch(13)}>1 – 2 pm</Chip>
                  <Chip active={defLunch === 14} onClick={() => setDefLunch(14)}>2 – 3 pm</Chip>
                </div>
              </div>
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!isReady}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 text-[13px] font-black uppercase tracking-widest text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
            style={{ background: isReady ? 'linear-gradient(135deg, #4338ca, #7c3aed, #0891b2)' : '#94a3b8' }}
          >
            <Zap className="w-5 h-5" />
            {stage === 'running' ? 'Generating…' : 'Generate Timetable'}
          </button>
        </div>

        {/* ── RIGHT COLUMN ─────────────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* Progress / Results */}
          {(stage === 'running' || stage === 'done') && (
            <div className="bg-white border border-[#e2e8f0] shadow-sm overflow-hidden">
              {/* Result header */}
              <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center gap-2"
                style={{ background: stage === 'done' ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)' : 'linear-gradient(135deg, #eff6ff, #dbeafe)' }}>
                <div className={`w-2 h-2 rounded-full ${stage === 'running' ? 'animate-pulse bg-[#3b82f6]' : 'bg-[#059669]'}`} />
                <p className="text-[12px] font-black uppercase tracking-wide" style={{ color: stage === 'done' ? '#059669' : '#185baf' }}>
                  {stage === 'running' ? 'Generating…' : '✓ Generation Complete'}
                </p>
              </div>

              <div className="p-4 space-y-4">
                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-medium text-[#64748b] truncate max-w-[70%]">{label}</span>
                    <span className="text-[16px] font-black" style={{ color: pct === 100 ? '#059669' : '#4338ca' }}>{pct}%</span>
                  </div>
                  <div className="h-3 bg-[#f1f5f9] overflow-hidden">
                    <div className="h-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        background: pct === 100
                          ? 'linear-gradient(90deg, #059669, #10b981)'
                          : 'linear-gradient(90deg, #4338ca, #7c3aed, #0891b2)',
                      }}
                    />
                  </div>
                  {result && (
                    <p className="text-[9px] text-[#94a3b8] font-bold">
                      {result.entries.length} of {result.stats.totalSessions} sessions placed
                    </p>
                  )}
                </div>

                {/* Stat cards */}
                {result && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 text-center border-2 border-[#a7f3d0]" style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)' }}>
                      <CheckCircle className="w-5 h-5 text-[#059669] mx-auto mb-1" />
                      <p className="text-[24px] font-black text-[#059669] leading-none">{result.stats.placed}</p>
                      <p className="text-[9px] font-black text-[#059669] uppercase tracking-widest mt-1">Placed</p>
                    </div>
                    <div className="p-3 text-center border-2"
                      style={{
                        background: result.stats.unresolvedCount > 0 ? 'linear-gradient(135deg, #fffbeb, #fef3c7)' : 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
                        borderColor: result.stats.unresolvedCount > 0 ? '#fde68a' : '#a7f3d0',
                      }}>
                      <AlertTriangle className={`w-5 h-5 mx-auto mb-1 ${result.stats.unresolvedCount > 0 ? 'text-[#d97706]' : 'text-[#059669]'}`} />
                      <p className={`text-[24px] font-black leading-none ${result.stats.unresolvedCount > 0 ? 'text-[#d97706]' : 'text-[#059669]'}`}>
                        {result.stats.unresolvedCount}
                      </p>
                      <p className={`text-[9px] font-black uppercase tracking-widest mt-1 ${result.stats.unresolvedCount > 0 ? 'text-[#d97706]' : 'text-[#059669]'}`}>
                        Unresolved
                      </p>
                    </div>
                    <div className="p-3 text-center border-2 border-[#c7d2fe]" style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)' }}>
                      <Zap className="w-5 h-5 text-[#4338ca] mx-auto mb-1" />
                      <p className="text-[24px] font-black text-[#4338ca] leading-none">{result.stats.totalSessions}</p>
                      <p className="text-[9px] font-black text-[#4338ca] uppercase tracking-widest mt-1">Total</p>
                    </div>
                  </div>
                )}

                {/* Apply button */}
                {result && result.entries.length > 0 && (
                  <button
                    onClick={handleApply}
                    disabled={applying}
                    className="w-full flex items-center justify-center gap-2 py-3 text-[11px] font-black uppercase tracking-widest text-white shadow-sm hover:opacity-90 transition-all disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #059669, #0d9488, #10b981)' }}
                  >
                    <CheckCircle className="w-4 h-4" />
                    {applying ? 'Applying…' : `Apply ${result.entries.length} Sessions to Timetable`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Unresolved table */}
          {result && result.unresolved.length > 0 && (
            <div className="bg-white border-2 border-[#fde68a] overflow-hidden shadow-sm">
              <button
                onClick={() => setShowUnresolved(s => !s)}
                className="w-full flex items-center justify-between px-4 py-3 hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)' }}
              >
                <span className="text-[10px] font-black text-[#d97706] uppercase tracking-widest flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {result.unresolved.length} Unresolved Course{result.unresolved.length > 1 ? 's' : ''}
                </span>
                {showUnresolved ? <ChevronUp className="w-3.5 h-3.5 text-[#d97706]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#d97706]" />}
              </button>
              {showUnresolved && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b-2 border-[#fde68a]" style={{ background: 'linear-gradient(135deg, #fef3c7, #fffbeb)' }}>
                        <th className="px-3 py-2 text-left font-black text-[#92400e] uppercase tracking-wider">Course</th>
                        <th className="px-3 py-2 text-left font-black text-[#92400e] uppercase tracking-wider">Faculty</th>
                        <th className="px-3 py-2 text-left font-black text-[#92400e] uppercase tracking-wider">Cohorts</th>
                        <th className="px-3 py-2 text-left font-black text-[#92400e] uppercase tracking-wider">Sessions</th>
                        <th className="px-3 py-2 text-left font-black text-[#92400e] uppercase tracking-wider">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#fef3c7]">
                      {result.unresolved.map((u: UnresolvedSession, i: number) => (
                        <tr key={i} className="hover:bg-[#fffbeb] transition-colors">
                          <td className="px-3 py-2 font-bold text-[#0f172a]">
                            {u.courseCode}
                            <span className="block text-[9px] font-normal text-[#64748b]">{u.courseName}</span>
                          </td>
                          <td className="px-3 py-2 text-[#475569]">{u.facultyName}</td>
                          <td className="px-3 py-2 text-[#475569] max-w-[120px]"><span className="truncate block">{u.cohorts.join(', ')}</span></td>
                          <td className="px-3 py-2">
                            <span className={`font-black text-[11px] ${u.sessionsPlaced === 0 ? 'text-[#e11d48]' : 'text-[#d97706]'}`}>
                              {u.sessionsPlaced}/{u.sessionsNeeded}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[#64748b]">{u.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Idle state */}
          {stage === 'idle' && (
            <div className="relative overflow-hidden border border-[#e2e8f0] shadow-sm" style={{ background: 'linear-gradient(135deg, #0c1b3a, #1e1b4b, #312e81)' }}>
              <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 50% 40%, rgba(99,102,241,0.25) 0%, transparent 60%)' }} />
              <div className="relative px-6 py-10 text-center">
                <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.2)', border: '2px solid rgba(99,102,241,0.3)' }}>
                  <Zap className="w-8 h-8 text-indigo-300" />
                </div>
                <p className="text-[13px] font-black text-white uppercase tracking-widest">Results Appear Here</p>
                <p className="text-[10px] text-indigo-300 mt-1.5">Upload a course template and click Generate</p>
              </div>
            </div>
          )}

          {/* Column reference */}
          <div className="bg-white border border-[#e2e8f0] shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#f1f5f9] flex items-center gap-2" style={{ background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)' }}>
              <FileText className="w-3.5 h-3.5 text-[#64748b]" />
              <span className="text-[11px] font-black text-[#0f172a] uppercase tracking-wide">Template Column Reference</span>
            </div>
            <div className="p-4 grid grid-cols-2 gap-1.5">
              {([
                ['FacultyID',    'e.g. 600001',                   '#4338ca', '#eef2ff', '#c7d2fe'],
                ['FacultyName',  'e.g. John Smith',               '#4338ca', '#eef2ff', '#c7d2fe'],
                ['CourseCode',   'e.g. CS301',                    '#7c3aed', '#f5f3ff', '#ddd6fe'],
                ['CourseName',   'e.g. Data Structures',          '#7c3aed', '#f5f3ff', '#ddd6fe'],
                ['Credits',      '3 = 3 sessions / week',         '#059669', '#ecfdf5', '#a7f3d0'],
                ['Category',     'Theory / Lab / Tutorial',       '#059669', '#ecfdf5', '#a7f3d0'],
                ['Campus',       'K1, K2, AB, RD…',              '#0891b2', '#ecfeff', '#a5f3fc'],
                ['Cohort1–12',   'shared cohorts on one row',     '#0891b2', '#ecfeff', '#a5f3fc'],
                ['FixedRoom',    'optional specific room',         '#d97706', '#fffbeb', '#fde68a'],
                ['WorkingDays',  'Mon-Fri or Tue-Sat',            '#d97706', '#fffbeb', '#fde68a'],
                ['TimeStart',    '8 or 10',                       '#e11d48', '#fff1f2', '#fecdd3'],
                ['TimeEnd',      '16 or 18',                      '#e11d48', '#fff1f2', '#fecdd3'],
                ['LunchStart',   '12, 13, or 14',                 '#64748b', '#f8fafc', '#e2e8f0'],
              ] as const).map(([col, desc, color, bg, border]) => (
                <div key={col} className="flex items-start gap-1.5 py-1">
                  <span className="text-[9px] font-black px-1.5 py-0.5 border shrink-0" style={{ color, background: bg, borderColor: border }}>{col}</span>
                  <span className="text-[9px] text-[#64748b] leading-tight pt-0.5">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoSchedulePanel;
