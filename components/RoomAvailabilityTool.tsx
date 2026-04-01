import React, { useState, useMemo } from 'react';
import { Room, ScheduleEntry, DayOfWeek, StudentGroup, Faculty, ViewType } from '../types';
import { DAYS, TIME_SLOTS, TOTAL_WEEKS } from '../constants';
import { Search, MapPin, Clock, RefreshCw, Calendar, Users, User, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { formatTime12h } from '../services/utils';

type ResourceType = 'Room' | 'Faculty' | 'Cohort';

interface ResourceFinderProps {
  rooms: Room[];
  faculties: Faculty[];
  groups: StudentGroup[];
  schedule: ScheduleEntry[];
  isOpen: boolean;
  onClose: () => void;
  onCellDoubleClick: (resourceType: ViewType, resourceId: string, day: DayOfWeek, time: string) => void;
}

const ResourceFinder: React.FC<ResourceFinderProps> = ({
  rooms, faculties, groups, schedule, isOpen, onClose, onCellDoubleClick
}) => {
  const [resourceType, setResourceType] = useState<ResourceType>('Room');
  const [day, setDay] = useState<DayOfWeek>('Monday');
  const [week, setWeek] = useState(1);
  const [startTimeFilter, setStartTimeFilter] = useState('08:00');
  const [endTimeFilter, setEndTimeFilter] = useState('21:00');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const dragControls = useDragControls();

  const filteredTimeSlots = useMemo(() => {
    return TIME_SLOTS.filter(t => t >= startTimeFilter && t <= endTimeFilter);
  }, [startTimeFilter, endTimeFilter]);

  const resources = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (resourceType === 'Room') {
      return rooms
        .filter(r => !q || r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q))
        .map(r => ({ id: r.id, name: r.name, sub: `${r.type} · Cap: ${r.capacity}` }));
    }
    if (resourceType === 'Faculty') {
      return faculties
        .filter(f => !q || f.name.toLowerCase().includes(q) || (f.facultyId || '').toLowerCase().includes(q))
        .map(f => ({ id: f.id, name: f.name, sub: f.department }));
    }
    // Cohort
    return groups
      .filter(g => !q || g.name.toLowerCase().includes(q) || g.program.toLowerCase().includes(q))
      .map(g => ({ id: g.id, name: g.name, sub: `${g.program} · Sem ${g.semester}` }));
  }, [resourceType, rooms, faculties, groups, searchQuery]);

  const getSlotUsage = (resourceId: string, time: string) => {
    const sessions = schedule.filter(s => {
      const matchesResource =
        (resourceType === 'Room' && s.roomId === resourceId) ||
        (resourceType === 'Faculty' && s.facultyId === resourceId) ||
        (resourceType === 'Cohort' && s.groupIds?.includes(resourceId));
      return matchesResource && s.day === day && s.weeks.includes(week) && time >= s.startTime && time < s.endTime;
    });
    if (sessions.length === 0) return { status: 'free' as const };
    if (sessions.length > 1) return { status: 'conflict' as const, sessions };
    return { status: 'busy' as const, session: sessions[0] };
  };

  const viewTypeMap: Record<ResourceType, ViewType> = {
    Room: 'Room',
    Faculty: 'Faculty',
    Cohort: 'Group',
  };

  const typeConfig: Record<ResourceType, { label: string; icon: React.ReactNode; color: string }> = {
    Room:    { label: 'Room',    icon: <MapPin className="w-3.5 h-3.5" />,  color: '#185baf' },
    Faculty: { label: 'Faculty', icon: <User className="w-3.5 h-3.5" />,   color: '#5b6bbf' },
    Cohort:  { label: 'Cohort',  icon: <Users className="w-3.5 h-3.5" />,  color: '#185b7a' },
  };

  if (!isOpen) return null;

  const current = typeConfig[resourceType];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={onClose} />

        <motion.div
          drag
          dragMomentum={false}
          dragListener={false}
          dragControls={dragControls}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-[#f0f0f0] shadow-2xl w-full max-w-[1200px] border-2 border-[#185baf] relative pointer-events-auto flex flex-col"
          style={{ height: '80vh' }}
        >
          {/* Title Bar */}
          <div
            className="bg-[#185baf] text-white px-3 py-1.5 flex justify-between items-center cursor-move"
            onPointerDown={(e) => dragControls.start(e)}
            style={{ touchAction: 'none' }}
          >
            <div className="flex items-center gap-2">
              {current.icon}
              <h2 className="text-[12px] font-bold tracking-wide uppercase">{current.label} Usage Chart</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex gap-4 items-center mr-4 pr-4 border-r border-white/20 text-[9px] font-bold uppercase tracking-widest text-white/80">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-[#d9534f] border border-white/40" /> Busy</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-[#5cb85c] border border-white/40" /> Free</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-[#7f1d1d] border border-white/40" /> Conflict</div>
                <div className="flex items-center gap-1.5 border-l border-white/20 pl-4 text-white/60">Double-click cell → create event</div>
              </div>
              <button onClick={onClose} className="bg-[#d9534f] text-white px-2 py-0.5 hover:bg-[#c9302c] border border-white/20 font-bold text-xs">✕</button>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="p-3 bg-[#f0f0f0] border-b border-[#ccc] flex items-center gap-4 flex-wrap">

            {/* Resource Type Dropdown */}
            <div className="relative">
              <button
                onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
                className="flex items-center gap-2 bg-white border border-[#ccc] px-3 py-1 text-[11px] font-bold text-[#185baf] uppercase tracking-widest hover:border-[#185baf] transition-colors min-w-[110px] justify-between"
              >
                <span className="flex items-center gap-1.5">{current.icon}{current.label}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {typeDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-[#ccc] shadow-lg z-50 min-w-[110px]">
                  {(['Room', 'Faculty', 'Cohort'] as ResourceType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => { setResourceType(type); setTypeDropdownOpen(false); setSearchQuery(''); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors text-left
                        ${resourceType === type ? 'bg-[#185baf] text-white' : 'text-[#333] hover:bg-[#e6e6e6]'}`}
                    >
                      {typeConfig[type].icon}{typeConfig[type].label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[#666] uppercase tracking-wide">Day</span>
              <select value={day} onChange={e => setDay(e.target.value as DayOfWeek)} className="bg-white text-black border border-[#ccc] px-2 py-1 text-xs font-bold outline-none focus:border-[#185baf] cursor-pointer">
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[#666] uppercase tracking-wide text-nowrap">From</span>
              <select value={startTimeFilter} onChange={e => setStartTimeFilter(e.target.value)} className="bg-white text-black border border-[#ccc] px-2 py-1 text-xs font-bold outline-none focus:border-[#185baf] cursor-pointer">
                {TIME_SLOTS.map(t => <option key={t} value={t}>{formatTime12h(t)}</option>)}
              </select>
              <span className="text-[10px] font-bold text-[#666] uppercase tracking-wide text-nowrap">To</span>
              <select value={endTimeFilter} onChange={e => setEndTimeFilter(e.target.value)} className="bg-white text-black border border-[#ccc] px-2 py-1 text-xs font-bold outline-none focus:border-[#185baf] cursor-pointer">
                {TIME_SLOTS.map(t => <option key={t} value={t}>{formatTime12h(t)}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[#666] uppercase tracking-wide text-nowrap">Week</span>
              <select value={week} onChange={e => setWeek(Number(e.target.value))} className="bg-white text-black border border-[#ccc] px-2 py-1 text-xs font-bold outline-none focus:border-[#185baf] cursor-pointer">
                {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map(w => <option key={w} value={w}>Week {w}</option>)}
              </select>
            </div>

            <div className="flex-1 min-w-[180px] relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999] z-10" />
              <input
                type="text"
                placeholder={`SEARCH ${resourceType.toUpperCase()}S...`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-white text-black border border-[#ccc] pl-9 pr-4 py-1 text-xs font-bold outline-none focus:border-[#185baf] placeholder:text-[#ccc] uppercase tracking-widest"
              />
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-auto custom-scrollbar bg-white p-1">
            <table className="w-full border-collapse table-fixed">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="bg-[#f9f9f9] border-r border-b border-[#ccc] p-1.5 w-[140px] sticky left-0 z-30 text-[9px] font-bold text-[#666] uppercase tracking-widest text-left">
                    {resourceType}
                  </th>
                  {filteredTimeSlots.map(t => (
                    <th key={t} className={`bg-[#fdfdfd] border-b border-[#ccc] p-1 text-[9px] font-bold text-[#999] uppercase tracking-tighter ${t.endsWith(':00') ? 'border-r border-[#e0e0e0]' : 'border-r border-[#f5f5f5]'}`}>
                      {t.endsWith(':00') ? formatTime12h(t).split(':')[0] : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resources.map(resource => (
                  <tr key={resource.id} className="group hover:bg-[#f5faff]">
                    <td className="bg-[#f9f9f9] border-r border-b border-[#ccc] px-2 py-1 sticky left-0 z-10 w-[140px]">
                      <div className="text-[10px] font-bold text-[#185baf] uppercase tracking-tight truncate">{resource.name}</div>
                      <div className="text-[8px] text-[#999] font-bold uppercase tracking-tight truncate">{resource.sub}</div>
                    </td>
                    {filteredTimeSlots.map(t => {
                      const usage = getSlotUsage(resource.id, t);
                      let bgColor = 'bg-[#5cb85c]/10 hover:bg-[#5cb85c]/30 cursor-pointer';
                      let content: React.ReactNode = null;

                      if (usage.status === 'busy') {
                        bgColor = 'bg-[#d9534f] hover:bg-[#c9302c] cursor-pointer';
                        const firstGroup = groups.find(g => g.id === (usage.session!.groupIds || [])[0]);
                        content = <span className="text-[7px] font-bold text-white uppercase tracking-tighter pointer-events-none">{firstGroup?.name.substring(0, 5)}</span>;
                      } else if (usage.status === 'conflict') {
                        bgColor = 'bg-[#7f1d1d] hover:bg-[#6f0d0d] cursor-pointer';
                        content = <span className="text-[7px] font-bold text-white uppercase tracking-tighter">!!!</span>;
                      }

                      const titleText = usage.status === 'free'
                        ? `${resource.name} — ${formatTime12h(t)} — Free. Double-click to create event.`
                        : usage.status === 'busy'
                        ? `${resource.name} — ${formatTime12h(usage.session!.startTime)} to ${formatTime12h(usage.session!.endTime)} — Busy. Double-click to open timetable.`
                        : `CONFLICT at ${resource.name} — ${formatTime12h(t)}`;

                      return (
                        <td
                          key={t}
                          title={titleText}
                          onDoubleClick={() => {
                            onCellDoubleClick(viewTypeMap[resourceType], resource.id, day, t);
                            onClose();
                          }}
                          className={`border-b border-[#eee] p-0 h-8 transition-colors select-none ${bgColor} ${t.endsWith(':00') ? 'border-r border-[#e0e0e0]' : 'border-r border-[#f5f5f5]'}`}
                        >
                          <div className="w-full h-full flex items-center justify-center overflow-hidden">
                            {content}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-4 py-1.5 bg-[#f0f0f0] border-t border-[#ccc] flex justify-between items-center">
            <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-[#333]">
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-[#666]" />{day} · Week {week}</span>
              <span className="w-px h-3 bg-[#ccc]" />
              <span>{resources.length} {resourceType}s shown</span>
            </div>
            <div className="text-[9px] text-[#999] font-bold uppercase tracking-widest italic">
              Double-click any cell to create event or open timetable
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ResourceFinder;
