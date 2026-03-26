import React, { useState, useMemo } from 'react';
import { Room, ScheduleEntry, DayOfWeek, StudentGroup } from '../types';
import { DAYS, TIME_SLOTS, TOTAL_WEEKS } from '../constants';
import { Search, MapPin, Clock, RefreshCw, Calendar } from 'lucide-react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { formatTime12h } from '../services/utils';

interface RoomAvailabilityToolProps {
  rooms: Room[];
  schedule: ScheduleEntry[];
  groups: StudentGroup[];
  isOpen: boolean;
  onClose: () => void;
}

const RoomAvailabilityTool: React.FC<RoomAvailabilityToolProps> = ({ rooms, schedule, groups, isOpen, onClose }) => {
  const [day, setDay] = useState<DayOfWeek>('Monday');
  const [week, setWeek] = useState(1);
  const [startTimeFilter, setStartTimeFilter] = useState('08:00');
  const [endTimeFilter, setEndTimeFilter] = useState('21:00');
  const [searchQuery, setSearchQuery] = useState('');
  const dragControls = useDragControls();

  const filteredTimeSlots = useMemo(() => {
    return TIME_SLOTS.filter(t => t >= startTimeFilter && t <= endTimeFilter);
  }, [startTimeFilter, endTimeFilter]);

  const filteredRooms = useMemo(() => {
    if (!searchQuery) return rooms;
    return rooms.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.type.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [rooms, searchQuery]);

  const getSlotUsage = (roomId: string, time: string) => {
    const sessions = schedule.filter(s => 
      s.roomId === roomId && 
      s.day === day && 
      s.weeks.includes(week) &&
      time >= s.startTime && time < s.endTime
    );

    if (sessions.length === 0) return { status: 'free' };
    if (sessions.length > 1) return { status: 'conflict', sessions };
    return { status: 'busy', session: sessions[0] };
  };

  if (!isOpen) return null;

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
          {/* Header Title Bar */}
          <div 
            className="bg-[#185baf] text-white px-3 py-1.5 flex justify-between items-center cursor-move border-b border-[#185baf]"
            onPointerDown={(e) => dragControls.start(e)}
            style={{ touchAction: 'none' }}
          >
            <div className="flex items-center gap-2">
               <MapPin className="w-4 h-4 text-white" />
               <h2 className="text-[12px] font-bold tracking-wide uppercase">Room Usage Chart</h2>
            </div>
            <div className="flex items-center gap-4">
               <div className="flex gap-4 items-center mr-4 pr-4 border-r border-white/20 text-[9px] font-bold uppercase tracking-widest text-white/80">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-[#d9534f] border border-white/40" /> Busy</div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-[#5cb85c] border border-white/40" /> Free</div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-[#7f1d1d] border border-white/40" /> Conflict</div>
               </div>
               <button onClick={onClose} className="bg-[#d9534f] text-white px-2 py-0.5 hover:bg-[#c9302c] border border-white/20 font-bold text-xs" title="Close">
                 ✕
               </button>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="p-3 bg-[#f0f0f0] border-b border-[#ccc] flex items-center gap-4 flex-wrap">
             <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[#666] uppercase tracking-wide">Day</span>
                <select 
                  value={day} 
                  onChange={e => setDay(e.target.value as DayOfWeek)}
                  className="bg-white text-black border border-[#ccc] px-2 py-1 text-xs font-bold outline-none uppercase focus:border-[#185baf] cursor-pointer"
                >
                  {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
             </div>

             <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[#666] uppercase tracking-wide text-nowrap">From</span>
                <select 
                  value={startTimeFilter} 
                  onChange={e => setStartTimeFilter(e.target.value)}
                  className="bg-white text-black border border-[#ccc] px-2 py-1 text-xs font-bold outline-none uppercase focus:border-[#185baf] cursor-pointer"
                >
                  {TIME_SLOTS.map(t => <option key={t} value={t}>{formatTime12h(t)}</option>)}
                </select>

                <span className="text-[10px] font-bold text-[#666] uppercase tracking-wide text-nowrap">To</span>
                <select 
                  value={endTimeFilter} 
                  onChange={e => setEndTimeFilter(e.target.value)}
                  className="bg-white text-black border border-[#ccc] px-2 py-1 text-xs font-bold outline-none uppercase focus:border-[#185baf] cursor-pointer"
                >
                  {TIME_SLOTS.map(t => <option key={t} value={t}>{formatTime12h(t)}</option>)}
                </select>
             </div>

             <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[#666] uppercase tracking-wide text-nowrap">Target Week</span>
                <select 
                  value={week} 
                  onChange={e => setWeek(Number(e.target.value))}
                  className="bg-white text-black border border-[#ccc] px-2 py-1 text-xs font-bold outline-none uppercase focus:border-[#185baf] cursor-pointer"
                >
                  {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map(w => <option key={w} value={w}>Week {w}</option>)}
                </select>
             </div>

             <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999] z-10" />
                <input 
                  type="text"
                  placeholder="SEARCH ROOMS..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-white text-black border border-[#ccc] pl-9 pr-4 py-1 text-xs font-bold outline-none focus:border-[#185baf] placeholder:text-[#ccc] uppercase tracking-widest"
                />
             </div>

             <button className="flex items-center gap-2 bg-white hover:bg-[#e6e6e6] text-[#333] px-3 py-1 text-[10px] font-bold border border-[#ccc] uppercase tracking-widest transition-all">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
             </button>
          </div>

          {/* Grid Chart */}
          <div className="flex-1 overflow-auto custom-scrollbar bg-white p-1">
             <div className="w-full">
                <table className="w-full border-collapse table-fixed">
                   <thead className="sticky top-0 z-20">
                      <tr>
                         <th className="bg-[#f9f9f9] border-r border-b border-[#ccc] p-1.5 w-[120px] sticky left-0 z-30 text-[9px] font-bold text-[#666] uppercase tracking-widest text-left">Room</th>
                         {filteredTimeSlots.map(t => (
                            <th key={t} className={`bg-[#fdfdfd] border-b border-[#ccc] p-1 text-[9px] font-bold text-[#999] uppercase tracking-tighter ${t.endsWith(':00') ? 'border-r border-[#e0e0e0]' : 'border-r border-[#f5f5f5]'}`}>
                               {t.endsWith(':00') ? formatTime12h(t).split(':')[0] : ''}
                            </th>
                         ))}
                      </tr>
                   </thead>
                   <tbody>
                      {filteredRooms.map(room => (
                         <tr key={room.id} className="group hover:bg-[#f5faff]">
                            <td className="bg-[#f9f9f9] border-r border-b border-[#ccc] px-2 py-1 sticky left-0 z-10 w-[120px]">
                               <div className="text-[10px] font-bold text-[#185baf] uppercase tracking-tight truncate">{room.name}</div>
                               <div className="text-[8px] text-[#999] font-bold uppercase tracking-tight truncate">{room.type}</div>
                            </td>
                            {filteredTimeSlots.map(t => {
                               const usage = getSlotUsage(room.id, t);
                               let bgColor = 'bg-white';
                               let content = null;

                               if (usage.status === 'free') {
                                  bgColor = 'bg-[#5cb85c]/10 hover:bg-[#5cb85c]/20';
                               } else if (usage.status === 'busy') {
                                  bgColor = 'bg-[#d9534f] border-[#d9534f]';
                                  const groupIds = usage.session!.groupIds || [];
                                  const firstGroup = groups.find(g => g.id === groupIds[0]);
                                  content = <span className="text-[7px] font-bold text-white uppercase tracking-tighter pointer-events-none scale-90">{firstGroup?.name.substring(0, 4)}</span>;
                               } else if (usage.status === 'conflict') {
                                  bgColor = 'bg-[#7f1d1d]';
                                  content = <span className="text-[7px] font-bold text-white uppercase tracking-tighter scale-90">!!!</span>;
                               }

                               return (
                                  <td 
                                    key={t} 
                                    className={`border-b border-[#eee] p-0 h-8 transition-colors ${bgColor} ${t.endsWith(':00') ? 'border-r border-[#e0e0e0]' : 'border-r border-[#f5f5f5]'}`} 
                                    title={usage.status === 'busy' ? `${usage.session?.startTime} - ${usage.session?.endTime}` : ''}
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
          </div>

          {/* Footer Info */}
          <div className="px-4 py-1.5 bg-[#f0f0f0] border-t border-[#ccc] flex justify-between items-center text-[10px] text-[#333]">
             <div className="flex items-center gap-3 font-bold uppercase tracking-widest">
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-[#666]" /> Jan-May 2026</span>
                <span className="w-px h-3 bg-[#ccc]" />
                <span>{day} (Week {week})</span>
             </div>
             <div className="text-[9px] text-[#999] font-bold uppercase tracking-widest italic">
                Each slot = 30-min. Hover for details.
             </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default RoomAvailabilityTool;
