import React, { useMemo } from 'react';
import { MapPin, AlertTriangle, Clock, BookOpen, Database, Calendar } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, Tooltip, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, LabelList, Cell
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

const SCHOOL_COLORS = ['#185baf', '#0891b2', '#059669', '#d97706', '#7c3aed', '#e11d48', '#0d9488', '#ea580c'];

const Dashboard: React.FC<DashboardProps> = ({ courses, rooms, groups, schedule, clashes, activeTerm, faculties }) => {

  const effectiveSchedule = useMemo(() => {
    return activeTerm ? schedule.filter(s => s.termId === activeTerm.id) : schedule;
  }, [schedule, activeTerm]);

  const totalHours = useMemo(() => {
    return effectiveSchedule.reduce((acc, curr) => acc + DataService.getDuration(curr.startTime, curr.endTime), 0);
  }, [effectiveSchedule]);

  const dailyData = useMemo(() => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days.map((day, i) => {
      const daySessions = effectiveSchedule.filter(s => s.day === day);
      return {
        name: labels[i],
        sessions: daySessions.length,
        hours: Math.round(daySessions.reduce((a, c) => a + DataService.getDuration(c.startTime, c.endTime), 0)),
      };
    });
  }, [effectiveSchedule]);

  const schoolData = useMemo(() => {
    if (!faculties) return [];
    const deptMap = new Map<string, number>();
    effectiveSchedule.forEach(s => {
      const faculty = faculties.find(f => f.id === s.facultyId);
      const dept = (faculty as any)?._deptName || faculty?.department || 'General';
      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    });
    return Array.from(deptMap.entries())
      .map(([name, sessions]) => ({
        name: name.length > 24 ? name.slice(0, 22) + '…' : name,
        sessions,
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 8);
  }, [effectiveSchedule, faculties]);

  const facultyData = useMemo(() => {
    if (!faculties) return [];
    return faculties.map(f => {
      const load = effectiveSchedule
        .filter(s => s.facultyId === f.id)
        .reduce((acc, curr) => acc + DataService.getDuration(curr.startTime, curr.endTime), 0);
      return { name: f.name.split(' ').pop() as string, fullName: f.name, load: Math.round(load) };
    }).filter(f => f.load > 0).sort((a, b) => b.load - a.load).slice(0, 5);
  }, [faculties, effectiveSchedule]);

  const statCards = [
    { icon: BookOpen, title: 'COURSES', value: courses.length, sub: 'Modules', color: '#6366f1', grad: 'linear-gradient(135deg, #4338ca, #6366f1)', bg: '#eef2ff' },
    { icon: MapPin, title: 'ROOMS', value: rooms.length, sub: 'Venues', color: '#0891b2', grad: 'linear-gradient(135deg, #0e7490, #06b6d4)', bg: '#ecfeff' },
    { icon: Calendar, title: 'ENTRIES', value: effectiveSchedule.length, sub: 'Timetable', color: '#059669', grad: 'linear-gradient(135deg, #047857, #10b981)', bg: '#ecfdf5' },
    { icon: Clock, title: 'LOAD', value: `${Math.round(totalHours)}h`, sub: 'Weekly', color: '#d97706', grad: 'linear-gradient(135deg, #b45309, #f59e0b)', bg: '#fffbeb' },
    { icon: AlertTriangle, title: 'CLASHES', value: clashes.length, sub: 'Conflicts', color: '#e11d48', grad: 'linear-gradient(135deg, #be123c, #e11d48)', bg: '#fff1f2' },
  ];

  return (
    <div className="p-4 max-w-[1400px] mx-auto min-h-screen font-sans">

      <header className="p-4 mb-4 text-white flex justify-between items-center"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #185baf 100%)' }}>
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

      {/* Stat Boxes */}
      <div className="flex flex-wrap gap-2 mb-4">
        {statCards.map((stat) => (
          <div key={stat.title} className="flex min-w-[150px] flex-1 border overflow-hidden hover:shadow-md transition-shadow"
            style={{ borderColor: `${stat.color}30`, background: stat.bg }}>
            <div className="w-12 flex items-center justify-center shrink-0" style={{ background: stat.grad }}>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Left column: daily + school charts */}
        <div className="lg:col-span-2 flex flex-col gap-3">

          {/* Sessions Per Day */}
          <div className="bg-white border border-[#ccc] p-3 flex flex-col">
            <div className="flex justify-between items-center mb-3 border-b border-[#eee] pb-2">
              <h4 className="text-[12px] font-bold text-[#333] tracking-wide uppercase">Sessions Per Day</h4>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-[#185baf]" />
                <span className="text-[10px] font-bold text-[#555]">SESSION COUNT</span>
              </div>
            </div>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="name" axisLine={{ stroke: '#999' }} tickLine={false} tick={{ fontSize: 11, fill: '#666' }} dy={10} />
                  <YAxis axisLine={{ stroke: '#999' }} tickLine={false} tick={{ fontSize: 11, fill: '#666' }} />
                  <Tooltip
                    contentStyle={{ fontSize: '11px', fontWeight: 'bold', padding: '6px 10px' }}
                    formatter={(v: any) => [v, 'Sessions']}
                  />
                  <Line type="monotone" dataKey="sessions" stroke="#185baf" strokeWidth={2}
                    dot={{ r: 4, fill: '#185baf', strokeWidth: 0 }} activeDot={{ r: 6 }}>
                    <LabelList dataKey="sessions" position="top"
                      style={{ fontSize: 10, fontWeight: 'bold', fill: '#185baf' }}
                      formatter={(v: number) => v > 0 ? v : ''} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* School-wise Sessions */}
          <div className="bg-white border border-[#ccc] p-3 flex flex-col">
            <div className="flex justify-between items-center mb-3 border-b border-[#eee] pb-2">
              <h4 className="text-[12px] font-bold text-[#333] tracking-wide uppercase">School-wise Sessions</h4>
              <span className="text-[10px] font-bold text-[#888] uppercase">By Department</span>
            </div>
            <div className="h-[240px] w-full">
              {schoolData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={schoolData} layout="vertical" margin={{ top: 0, right: 55, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f0f0f0" />
                    <XAxis type="number" axisLine={{ stroke: '#ccc' }} tickLine={false} tick={{ fontSize: 9, fill: '#888' }} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false}
                      tick={{ fontSize: 10, fill: '#333', fontWeight: 'bold' }} width={160} />
                    <Tooltip
                      cursor={{ fill: '#f5f5f5' }}
                      contentStyle={{ fontSize: '11px', fontWeight: 'bold', padding: '6px 10px' }}
                      formatter={(v: any) => [v, 'Sessions']}
                    />
                    <Bar dataKey="sessions" barSize={16} radius={[0, 4, 4, 0]}>
                      {schoolData.map((_, i) => (
                        <Cell key={i} fill={SCHOOL_COLORS[i % SCHOOL_COLORS.length]} />
                      ))}
                      <LabelList dataKey="sessions" position="right"
                        style={{ fontSize: 10, fontWeight: 'bold', fill: '#333' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[10px] font-bold text-[#999] uppercase tracking-wider">
                  No school data available — schedule sessions to see breakdown.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3">

          {/* System Resources */}
          <div className="bg-[#f8f9fa] border border-[#ccc] p-3">
            <div className="flex items-center gap-2 mb-3 border-b border-[#ddd] pb-2">
              <Database className="w-4 h-4 text-[#555]" />
              <h4 className="text-[12px] font-bold text-[#333] tracking-wide uppercase">System Resources</h4>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Schedule Entries', value: effectiveSchedule.length, badge: 'Optimal', badgeColor: '#2e7d32', badgeBg: '#eafbef', badgeBorder: '#a5d6a7' },
                { label: 'Active Courses', value: courses.length, badge: 'Loaded', badgeColor: '#185baf', badgeBg: '#e8f2fc', badgeBorder: '#b2d1f7' },
                { label: 'Faculty Count', value: faculties?.length ?? 0, badge: 'Synced', badgeColor: '#7c3aed', badgeBg: '#f5f3ff', badgeBorder: '#c4b5fd' },
                { label: 'Rooms Active', value: rooms.length, badge: 'Ready', badgeColor: '#0891b2', badgeBg: '#ecfeff', badgeBorder: '#a5f3fc' },
              ].map(item => (
                <div key={item.label} className="bg-white border border-[#ccc] p-2.5 flex justify-between items-center">
                  <div>
                    <div className="text-[10px] font-bold text-[#666] tracking-wider uppercase">{item.label}</div>
                    <div className="text-[16px] font-bold text-[#333] leading-tight">{item.value}</div>
                  </div>
                  <span className="text-[9px] font-bold border px-1.5 py-0.5 uppercase"
                    style={{ color: item.badgeColor, background: item.badgeBg, borderColor: item.badgeBorder }}>
                    {item.badge}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Faculty Workloads */}
          <div className="bg-[#f8f9fa] border border-[#ccc] p-3 flex-1 flex flex-col">
            <h4 className="text-[12px] font-bold text-[#333] tracking-wide uppercase mb-3 border-b border-[#ddd] pb-2">
              Top Faculty Workloads
            </h4>
            <div className="flex-1 w-full min-h-[160px]">
              {facultyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={facultyData} layout="vertical" margin={{ top: 0, right: 40, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#eee" />
                    <XAxis type="number" axisLine={{ stroke: '#ccc' }} tickLine={false} tick={{ fontSize: 9, fill: '#888' }} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false}
                      tick={{ fontSize: 10, fill: '#333', fontWeight: 'bold' }} />
                    <Tooltip
                      cursor={{ fill: '#f0f0f0' }}
                      contentStyle={{ fontSize: '10px', fontWeight: 'bold', padding: '4px 8px' }}
                      formatter={(v: any, _: any, props: any) => [
                        `${v}h — ${props?.payload?.fullName || ''}`,
                        'Load'
                      ]}
                    />
                    <Bar dataKey="load" fill="#185baf" barSize={14} radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="load" position="right"
                        style={{ fontSize: 10, fontWeight: 'bold', fill: '#185baf' }}
                        formatter={(v: number) => `${v}h`} />
                    </Bar>
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
