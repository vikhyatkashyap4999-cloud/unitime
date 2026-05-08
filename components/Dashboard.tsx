import React, { useMemo } from 'react';
import { 
  Users, MapPin, AlertTriangle, Clock, BookOpen, Database, Zap, FileText
} from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, Tooltip, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';
import { Course, Room, StudentGroup, ScheduleEntry, Clash, Term, Faculty } from '../types';
import { DataService } from '../services/dataService';

interface DashboardProps {
  courses: Course[];
  rooms: Room[];
  groups: StudentGroup[];
  schedule: ScheduleEntry[];
  clashes: Clash[];
  activeTerm?: Term;
  faculties?: Faculty[];
}

const Dashboard: React.FC<DashboardProps> = ({ courses, rooms, groups, schedule, clashes, activeTerm, faculties }) => {

  const effectiveSchedule = useMemo(() => {
    return activeTerm
      ? schedule.filter(s => s.termId === activeTerm.id)
      : schedule;
  }, [schedule, activeTerm]);

  const totalHours = useMemo(() => {
    return effectiveSchedule.reduce((acc, curr) => {
      const duration = DataService.getDuration(curr.startTime, curr.endTime);
      return acc + duration;
    }, 0);
  }, [effectiveSchedule]);

  const data = [
    { name: 'Mon', hours: effectiveSchedule.filter(s => s.day === 'Monday').reduce((a, c) => a + DataService.getDuration(c.startTime, c.endTime), 0) },
    { name: 'Tue', hours: effectiveSchedule.filter(s => s.day === 'Tuesday').reduce((a, c) => a + DataService.getDuration(c.startTime, c.endTime), 0) },
    { name: 'Wed', hours: effectiveSchedule.filter(s => s.day === 'Wednesday').reduce((a, c) => a + DataService.getDuration(c.startTime, c.endTime), 0) },
    { name: 'Thu', hours: effectiveSchedule.filter(s => s.day === 'Thursday').reduce((a, c) => a + DataService.getDuration(c.startTime, c.endTime), 0) },
    { name: 'Fri', hours: effectiveSchedule.filter(s => s.day === 'Friday').reduce((a, c) => a + DataService.getDuration(c.startTime, c.endTime), 0) },
    { name: 'Sat', hours: effectiveSchedule.filter(s => s.day === 'Saturday').reduce((a, c) => a + DataService.getDuration(c.startTime, c.endTime), 0) },
  ];

  const facultyData = useMemo(() => {
    if (!faculties) return [];
    return faculties.map(f => {
      const load = effectiveSchedule.filter(s => s.facultyId === f.id).reduce((acc, curr) => acc + DataService.getDuration(curr.startTime, curr.endTime), 0);
      return {
        name: f.name.split(' ').pop(), // Last name for brevity
        fullName: f.name,
        load
      };
    }).filter(f => f.load > 0).sort((a, b) => b.load - a.load).slice(0, 5);
  }, [faculties, effectiveSchedule]);

  const statCards = [
    { icon: BookOpen, title: 'COURSES', value: courses.length, sub: 'Modules', color: '#6366f1', grad: 'linear-gradient(135deg, #4338ca, #6366f1)', bg: '#eef2ff' },
    { icon: MapPin, title: 'ROOMS', value: rooms.length, sub: 'Venues', color: '#0891b2', grad: 'linear-gradient(135deg, #0e7490, #06b6d4)', bg: '#ecfeff' },
    { icon: Users, title: 'STUDENTS', value: groups.length, sub: 'Enrolled', color: '#059669', grad: 'linear-gradient(135deg, #047857, #10b981)', bg: '#ecfdf5' },
    { icon: Clock, title: 'LOAD', value: `${Math.round(totalHours)}h`, sub: 'Weekly', color: '#d97706', grad: 'linear-gradient(135deg, #b45309, #f59e0b)', bg: '#fffbeb' },
    { icon: AlertTriangle, title: 'CLASHES', value: clashes.length, sub: 'Conflicts', color: '#e11d48', grad: 'linear-gradient(135deg, #be123c, #e11d48)', bg: '#fff1f2' },
  ];

  return (
    <div className="p-4 max-w-[1400px] mx-auto min-h-screen font-sans">
      {/* Gradient Header */}
      <header className="p-4 mb-4 text-white flex justify-between items-center" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #185baf 100%)' }}>
        <div>
          <h2 className="text-[18px] font-black tracking-wide uppercase">System Overview</h2>
          <p className="text-[11px] font-bold text-blue-200 uppercase tracking-wide mt-0.5">
            Active Term: <span className="text-white">{activeTerm?.name || 'All Terms'}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-300">System Operational</span>
          </div>
          <button className="px-5 py-1.5 bg-white/10 backdrop-blur-sm text-white text-[11px] font-bold border border-white/20 uppercase tracking-wide hover:bg-white/20 transition-colors">
            SYSTEM ONLINE
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 mb-4">
        {statCards.map((stat) => (
          <div key={stat.title} className="flex min-w-[150px] flex-1 border overflow-hidden hover:shadow-md transition-shadow" style={{ borderColor: `${stat.color}30`, background: stat.bg }}>
            <div className="w-12 flex items-center justify-center" style={{ background: stat.grad }}>
              <stat.icon className="w-5 h-5 text-white" />
            </div>
            <div className="p-2 pl-3 flex flex-col justify-center">
              <span className="text-[10px] font-bold tracking-wide" style={{ color: stat.color }}>{stat.title}</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[15px] font-bold text-[#333]">{stat.value}</span>
                <span className="text-[10px] text-[#777]">{stat.sub}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <div className="lg:col-span-2 flex flex-col gap-2">
          {/* Main Graph */}
          <div className="bg-white border border-[#ccc] p-3 flex flex-col">
            <div className="flex justify-between items-center mb-4 border-b border-[#eee] pb-2">
              <h4 className="text-[12px] font-bold text-[#333] tracking-wide uppercase">Campus Utilization (%)</h4>
              <div className="flex items-center gap-4 text-[10px] font-bold">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-[#185baf]"></div> <span className="text-[#555]">NORMAL</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-[#d9534f]"></div> <span className="text-[#555]">HIGH</span></div>
              </div>
            </div>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="name" axisLine={{ stroke: '#999' }} tickLine={false} tick={{ fontSize: 11, fill: '#666' }} dy={10} />
                  <YAxis axisLine={{ stroke: '#999' }} tickLine={false} tick={{ fontSize: 11, fill: '#666' }} ticks={[0, 10, 20, 30, 40, 50]} />
                  <Line type="monotone" dataKey="hours" stroke="#185baf" strokeWidth={2} dot={{ r: 3, fill: '#185baf' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Efficiency Bar */}
          <div className="bg-white border border-[#c8ddf8] p-3 flex flex-col justify-center h-[90px]" style={{ background: 'linear-gradient(135deg, #f0f6ff 0%, #e8f2fe 100%)' }}>
            <div className="flex items-center justify-between mb-3 border-b border-[#c8ddf8] pb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#185baf]" />
                <h4 className="text-[12px] font-bold tracking-wide uppercase text-[#185baf]">Resource Efficiency</h4>
              </div>
            </div>
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider mb-2">
              <span className="text-[#5a7ba8]">Global Utilization</span>
              <span className="text-[#185baf]">0%</span>
            </div>
            <div className="w-full h-2 bg-[#c8ddf8] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: '0%', background: 'linear-gradient(90deg, #185baf, #0891b2)' }}></div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {/* System Resources */}
          <div className="bg-[#f8f9fa] border border-[#ccc] p-3">
            <div className="flex items-center gap-2 mb-4 border-b border-[#ddd] pb-2">
              <Database className="w-4 h-4 text-[#555]" />
              <h4 className="text-[12px] font-bold text-[#333] tracking-wide uppercase">System Resources</h4>
            </div>
            
            <div className="bg-white border border-[#ccc] p-3 mb-3">
              <div className="flex justify-between items-start mb-1">
                <span className="text-[10px] font-bold text-[#666] tracking-wider uppercase">Database Load</span>
                <span className="text-[9px] font-bold text-[#2e7d32] border border-[#a5d6a7] px-1 bg-[#eafbef] uppercase">Optimal</span>
              </div>
              <div className="text-[18px] font-bold text-[#333]">{effectiveSchedule.length}</div>
              <div className="text-[9px] font-bold text-[#999] text-right uppercase mt-[-10px]">Records</div>
            </div>

            <div className="bg-white border border-[#ccc] p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-[#666] tracking-wider uppercase">Local Cache</span>
                <span className="text-[10px] font-bold text-[#185baf] border border-[#b2d1f7] px-1 bg-[#e8f2fc]">0%</span>
              </div>
              <div className="w-full h-1.5 bg-[#e9ecef] mb-1">
                <div className="h-full bg-[#185baf]" style={{ width: '0%' }}></div>
              </div>
              <div className="text-[9px] font-bold text-[#999] uppercase">1 KB / 5.0 MB</div>
            </div>
          </div>

          {/* Faculty Workload */}
          <div className="bg-[#f8f9fa] border border-[#ccc] p-3 flex-1 flex flex-col">
            <h4 className="text-[12px] font-bold text-[#333] tracking-wide uppercase mb-3 border-b border-[#ddd] pb-2">Top Faculty Workloads</h4>
            
            <div className="flex-1 w-full min-h-[140px]">
              {facultyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={facultyData} layout="vertical" margin={{ top: 0, right: 10, left: -25, bottom: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#eee" />
                    <XAxis type="number" axisLine={{ stroke: '#ccc' }} tickLine={false} tick={{ fontSize: 9, fill: '#666' }} />
                    <YAxis dataKey="name" type="category" axisLine={{ stroke: '#ccc' }} tickLine={false} tick={{ fontSize: 10, fill: '#333', fontWeight: 'bold' }} />
                    <Tooltip cursor={{fill: '#eee'}} contentStyle={{ fontSize: '10px', fontWeight: 'bold', padding: '4px 8px' }} />
                    <Bar dataKey="load" fill="#185baf" barSize={14} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[10px] font-bold text-[#999] uppercase tracking-wider">
                  No load data available.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
