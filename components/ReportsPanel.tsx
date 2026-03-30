import React, { useState } from 'react';
import { FileText, Download, Table, AlertTriangle, Calendar, Users, Briefcase, List, Trash2, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { ScheduleEntry, Course, Faculty, Room, StudentGroup, Term, Clash, UserAccount, Role } from '../types';
import { DataService } from '../services/dataService';

interface ReportsPanelProps {
  schedule: ScheduleEntry[];
  courses: Course[];
  faculties: Faculty[];
  rooms: Room[];
  groups: StudentGroup[];
  terms: Term[];
  clashes: Clash[];
  currentUser: UserAccount;
  activeTermId?: string;
  onDeleteEntry?: (id: string) => void;
}

const ReportsPanel: React.FC<ReportsPanelProps> = ({
  schedule,
  courses,
  faculties,
  rooms,
  groups,
  terms,
  clashes,
  currentUser,
  activeTermId,
  onDeleteEntry
}) => {
  const [activeReportTab, setActiveReportTab] = useState<'reports' | 'entries'>('reports');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string>('day');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const isAdmin = currentUser.role === Role.ADMIN || currentUser.role === Role.SUPER_ADMIN;

  const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon: React.FC<{ field: string }> = ({ field }) => {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  
  const downloadCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      alert("No data available for this report.");
      return;
    }
    
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(fieldName => {
          const value = row[fieldName] || '';
          const escaped = ('' + value).replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(',')
      )
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getFilteredSchedule = () => {
    return activeTermId 
      ? schedule.filter(s => s.termId === activeTermId)
      : schedule;
  };

  const getFullTimetableData = (filteredSchedule: ScheduleEntry[]) => {
    const rows: any[] = [];
    filteredSchedule.forEach((s, index) => {
      const eventId = index + 1;
      const course = courses.find(c => c.id === s.courseId);
      const faculty = faculties.find(f => f.id === s.facultyId);
      const room = rooms.find(r => r.id === s.roomId);
      
      const sessionGroups = groups.filter(g => s.groupIds?.includes(g.id));
      
      if (sessionGroups.length === 0) {
        rows.push({
          '_event_id': eventId,
          '_day_of_week': s.day.substring(0, 3), 
          '_start_time': s.startTime,
          '_end_time': s.endTime,
          '_weeks': 'Jan-25',
          '_event_type': s.category || 'Explo',
          'Module Unique ID': (course as any)?._unique_name || course?.code || '',
          'Module': (course as any)?._name || course?.name || '',
          'Room': (room as any)?._unique_name || room?.name || '',
          'Staff_ID': (faculty as any)?._Faculty_ID || faculty?.id || '',
          'Staff_Name': (faculty as any)?._Faculty_name || faculty?.name || '',
          'Group': ''
        });
      } else {
        sessionGroups.forEach(g => {
          rows.push({
            '_event_id': eventId,
            '_day_of_week': s.day.substring(0, 3), 
            '_start_time': s.startTime,
            '_end_time': s.endTime,
            '_weeks': 'Jan-25',
            '_event_type': s.category || 'Explo',
            'Module Unique ID': (course as any)?._unique_name || course?.code || '',
            'Module': (course as any)?._name || course?.name || '',
            'Room': (room as any)?._unique_name || room?.name || '',
            'Staff_ID': (faculty as any)?._Faculty_ID || faculty?.id || '',
            'Staff_Name': (faculty as any)?._Faculty_name || faculty?.name || '',
            'Group': (g as any)._unique_name || g.name
          });
        });
      }
    });
    return rows;
  };

  const reportCards = [
    {
      id: 'full',
      title: 'Full Institutional Timetable',
      description: 'Complete list of all scheduled sessions across all colleges and departments.',
      icon: <Table className="w-5 h-5" />,
      action: () => downloadCSV(getFullTimetableData(getFilteredSchedule()), 'Full_University_Timetable')
    },
    {
      id: 'clashes',
      title: 'Conflict & Clash Report',
      description: 'Audit log of all current room, faculty, and group overlaps that require attention.',
      icon: <AlertTriangle className="w-5 h-5" />,
      action: () => {
        const data = clashes.map(c => ({
          'Type': c.type,
          'Message': c.message,
          'Status': 'Unresolved'
        }));
        downloadCSV(data, 'Institutional_Clash_Report');
      }
    },
    {
      id: 'resources',
      title: 'Resource Utilization',
      description: 'Summary of room capacity vs student enrollment for scheduled sessions.',
      icon: <Calendar className="w-5 h-5" />,
      action: () => {
        const data = getFilteredSchedule().map(s => {
          const room = rooms.find(r => r.id === s.roomId);
          const selectedGroups = groups.filter(g => s.groupIds?.includes(g.id));
          const totalStudents = selectedGroups.reduce((sum, g) => sum + (g.studentCount || 0), 0);
          const groupNames = selectedGroups.map(g => g.name).join(', ');
          
          return {
            'Room': room?.name,
            'Capacity': room?.capacity,
            'Groups': groupNames,
            'Total Students': totalStudents,
            'Utilization %': room ? Math.round(totalStudents / room.capacity * 100) : 0
          };
        });
        downloadCSV(data, 'Resource_Utilization_Report');
      }
    },
    {
      id: 'faculty_load',
      title: 'Faculty Load Report',
      description: 'Audit of faculty teaching hours and subject allocation for the active term.',
      icon: <Briefcase className="w-5 h-5" />,
      action: () => {
        const filteredSchedule = getFilteredSchedule();
        const data = faculties.map(f => {
          const facultySessions = filteredSchedule.filter(s => s.facultyId === f.id);
          const totalWeeklyMinutes = facultySessions.reduce((acc, s) => {
             return acc + (DataService.getDuration(s.startTime, s.endTime) * 60);
          }, 0);
          
          return {
            '_Faculty_ID': (f as any)?._Faculty_ID || f.id,
            '_Faculty_name': (f as any)?._Faculty_name || f.name,
            '_deptName': (f as any)?._deptName || f.department,
            'Faculty Load': Math.round(totalWeeklyMinutes / 60)
          };
        });
        downloadCSV(data, 'Faculty_Load_Report');
      }
    }
  ];

  // Build schedule entries for the table view
  const activeSchedule = activeTermId ? schedule.filter(s => s.termId === activeTermId) : schedule;

  const enrichedEntries = activeSchedule.map(s => {
    const course = courses.find(c => c.id === s.courseId);
    const faculty = faculties.find(f => f.id === s.facultyId);
    const room = rooms.find(r => r.id === s.roomId);
    const sessionGroups = groups.filter(g => s.groupIds?.includes(g.id));
    return { ...s, course, faculty, room, sessionGroups };
  });

  const searchedEntries = enrichedEntries.filter(e => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.day?.toLowerCase().includes(q) ||
      e.startTime?.includes(q) ||
      e.course?.name?.toLowerCase().includes(q) ||
      (e.course as any)?._name?.toLowerCase().includes(q) ||
      e.faculty?.name?.toLowerCase().includes(q) ||
      (e.faculty as any)?._Faculty_name?.toLowerCase().includes(q) ||
      e.room?.name?.toLowerCase().includes(q) ||
      e.sessionGroups.some(g => g.name?.toLowerCase().includes(q)) ||
      e.category?.toLowerCase().includes(q)
    );
  });

  const sortedEntries = [...searchedEntries].sort((a, b) => {
    let aVal: any, bVal: any;
    if (sortField === 'day') {
      aVal = DAY_ORDER.indexOf(a.day); bVal = DAY_ORDER.indexOf(b.day);
      if (aVal === bVal) { aVal = a.startTime; bVal = b.startTime; }
    } else if (sortField === 'time') {
      aVal = a.startTime; bVal = b.startTime;
    } else if (sortField === 'course') {
      aVal = ((a.course as any)?._name || a.course?.name || '').toLowerCase();
      bVal = ((b.course as any)?._name || b.course?.name || '').toLowerCase();
    } else if (sortField === 'faculty') {
      aVal = ((a.faculty as any)?._Faculty_name || a.faculty?.name || '').toLowerCase();
      bVal = ((b.faculty as any)?._Faculty_name || b.faculty?.name || '').toLowerCase();
    } else if (sortField === 'room') {
      aVal = (a.room?.name || '').toLowerCase();
      bVal = (b.room?.name || '').toLowerCase();
    } else if (sortField === 'category') {
      aVal = (a.category || '').toLowerCase();
      bVal = (b.category || '').toLowerCase();
    } else {
      aVal = ''; bVal = '';
    }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const ThBtn: React.FC<{ field: string; label: string; className?: string }> = ({ field, label, className }) => (
    <th
      className={`px-3 py-2 text-left text-[11px] font-bold text-[#333] uppercase tracking-wide cursor-pointer hover:bg-[#e8e8e8] select-none ${className || ''}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">{label}<SortIcon field={field} /></div>
    </th>
  );

  return (
    <div className="space-y-4 p-2">
      {/* Header */}
      <div className="flex justify-between items-end border-b-2 border-[#185baf] pb-1 mx-2 mb-0">
        <div>
          <h2 className="text-[16px] font-black text-[#185baf] uppercase tracking-wide">Reports & Analytics</h2>
          <p className="text-[10px] text-[#666] font-bold uppercase tracking-widest">
            {activeTermId ? terms.find(t => t.id === activeTermId)?.name : 'All Terms'}
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex mx-2 border-b border-[#ccc]">
        <button
          onClick={() => setActiveReportTab('reports')}
          className={`flex items-center gap-2 px-5 py-2 text-[12px] font-bold border-b-2 transition-all ${
            activeReportTab === 'reports'
              ? 'border-[#185baf] text-[#185baf] bg-white'
              : 'border-transparent text-[#666] hover:text-[#185baf] hover:bg-[#f5f5f5]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" /> CSV Reports
        </button>
        <button
          onClick={() => setActiveReportTab('entries')}
          className={`flex items-center gap-2 px-5 py-2 text-[12px] font-bold border-b-2 transition-all ${
            activeReportTab === 'entries'
              ? 'border-[#185baf] text-[#185baf] bg-white'
              : 'border-transparent text-[#666] hover:text-[#185baf] hover:bg-[#f5f5f5]'
          }`}
        >
          <List className="w-3.5 h-3.5" />
          Schedule Entries
          <span className="ml-1 bg-[#185baf] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm">
            {activeSchedule.length}
          </span>
        </button>
      </div>

      {/* ── CSV REPORTS TAB ── */}
      {activeReportTab === 'reports' && (
        <>
          <div className="px-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            {reportCards.map((report) => (
              <div
                key={report.id}
                className="bg-[#f0f0f0] border-2 border-[#185baf] shadow-md flex flex-col justify-between"
              >
                <div className="p-4 bg-white flex-1">
                  <div className="flex items-center gap-3 border-b border-[#eee] pb-3 mb-3">
                    <div className="w-10 h-10 bg-[#f0f0f0] border-2 border-[#185baf] flex items-center justify-center text-[#185baf] shrink-0">
                      {report.icon}
                    </div>
                    <div>
                      <h3 className="text-[12px] font-black text-[#185baf] uppercase tracking-wide">{report.title}</h3>
                      <p className="text-[9px] text-[#666] font-bold uppercase tracking-widest mt-0.5">System Audit</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#333] font-medium leading-relaxed">{report.description}</p>
                </div>
                <div className="p-2 bg-[#e0e0e0] border-t border-[#ccc]">
                  <button
                    onClick={report.action}
                    className="w-full py-1.5 btn-primary text-sm flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download CSV Report
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mx-2 mt-2 bg-[#185baf] p-4 border border-[#00479b] shadow-md text-white flex gap-4 items-center">
            <div className="w-12 h-12 bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="text-[11px] font-black uppercase tracking-wider">Custom Reporting Service</h4>
              <p className="text-[10px] text-[#e0e0e0] mt-1 font-bold leading-relaxed">
                Need a specific layout or data format? Our team can configure custom templates.
              </p>
            </div>
            <div>
              <button className="bg-white text-[#185baf] border flex items-center gap-1 border-[#185baf] px-4 py-1.5 text-[11px] font-bold uppercase hover:bg-[#f0f0f0] transition-colors leading-none tracking-wider whitespace-nowrap">
                Request Custom Template
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── SCHEDULE ENTRIES TAB ── */}
      {activeReportTab === 'entries' && (
        <div className="mx-2 space-y-3">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-white border border-[#ccc] px-2 py-1.5 min-w-[260px]">
              <Search className="w-3.5 h-3.5 text-[#999]" />
              <input
                type="text"
                placeholder="Search by course, faculty, room, group, day..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="text-xs outline-none w-full text-[#333] placeholder:text-[#aaa]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-[#999] hover:text-[#333] text-xs font-bold">✕</button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-[#666] uppercase tracking-wider">
                {sortedEntries.length} of {activeSchedule.length} entries
              </span>
              {isAdmin && sortedEntries.length > 0 && (
                <span className="text-[10px] text-[#ac2925] font-bold uppercase tracking-wider border border-[#ac2925] px-2 py-0.5">
                  Admin: Delete enabled
                </span>
              )}
            </div>
          </div>

          {/* Table */}
          {sortedEntries.length === 0 ? (
            <div className="py-16 bg-[#f9f9f9] border border-[#ccc] flex flex-col items-center justify-center text-center">
              <List className="w-8 h-8 text-[#ccc] mb-3" />
              <p className="text-[12px] font-bold text-[#666] uppercase tracking-wide">
                {activeSchedule.length === 0 ? 'No schedule entries for this term' : 'No entries match your search'}
              </p>
            </div>
          ) : (
            <div className="bg-white border border-[#ccc] shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-[#f0f0f0] sticky top-0 z-10 border-b-2 border-[#185baf]">
                      <tr>
                        <th className="px-3 py-2 text-[11px] font-bold text-[#185baf] uppercase w-8">#</th>
                        <ThBtn field="day" label="Day" />
                        <ThBtn field="time" label="Time" />
                        <ThBtn field="course" label="Module" />
                        <th className="px-3 py-2 text-[11px] font-bold text-[#333] uppercase tracking-wide">Module ID</th>
                        <ThBtn field="faculty" label="Faculty" />
                        <th className="px-3 py-2 text-[11px] font-bold text-[#333] uppercase tracking-wide">Staff ID</th>
                        <ThBtn field="room" label="Room" />
                        <th className="px-3 py-2 text-[11px] font-bold text-[#333] uppercase tracking-wide">Groups</th>
                        <th className="px-3 py-2 text-[11px] font-bold text-[#333] uppercase tracking-wide">Weeks</th>
                        <ThBtn field="category" label="Type" />
                        {isAdmin && onDeleteEntry && (
                          <th className="px-3 py-2 text-[11px] font-bold text-[#ac2925] uppercase tracking-wide text-right">Delete</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eee]">
                      {sortedEntries.map((entry, idx) => (
                        <tr key={entry.id} className="hover:bg-[#f5f8ff] transition-colors">
                          <td className="px-3 py-2 text-[#999] font-bold">{idx + 1}</td>
                          <td className="px-3 py-2 font-bold text-[#185baf] whitespace-nowrap">{entry.day}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]">
                            {entry.startTime} – {entry.endTime}
                          </td>
                          <td className="px-3 py-2 font-bold text-[#333] max-w-[180px] truncate" title={(entry.course as any)?._name || entry.course?.name || '—'}>
                            {(entry.course as any)?._name || entry.course?.name || <span className="text-[#ccc]">—</span>}
                          </td>
                          <td className="px-3 py-2 text-[#666] font-mono text-[10px]">
                            {(entry.course as any)?._unique_name || entry.course?.code || '—'}
                          </td>
                          <td className="px-3 py-2 text-[#333] max-w-[160px] truncate" title={(entry.faculty as any)?._Faculty_name || entry.faculty?.name || '—'}>
                            {(entry.faculty as any)?._Faculty_name || entry.faculty?.name || <span className="text-[#ccc]">—</span>}
                          </td>
                          <td className="px-3 py-2 text-[#666] font-mono text-[10px]">
                            {(entry.faculty as any)?._Faculty_ID || entry.faculty?.id || '—'}
                          </td>
                          <td className="px-3 py-2 text-[#333] whitespace-nowrap">
                            {(entry.room as any)?._unique_name || entry.room?.name || <span className="text-[#ccc]">—</span>}
                          </td>
                          <td className="px-3 py-2 max-w-[200px]">
                            <div className="flex flex-wrap gap-1">
                              {entry.sessionGroups.length > 0
                                ? entry.sessionGroups.map(g => (
                                    <span key={g.id} className="bg-[#e8f0fe] text-[#185baf] text-[9px] font-bold px-1.5 py-0.5 border border-[#c5d6f8] whitespace-nowrap">
                                      {(g as any)._unique_name || g.name}
                                    </span>
                                  ))
                                : <span className="text-[#ccc]">—</span>
                              }
                            </div>
                          </td>
                          <td className="px-3 py-2 text-[#666] text-[10px] whitespace-nowrap">
                            {Array.isArray(entry.weeks) && entry.weeks.length > 0
                              ? entry.weeks.length > 5
                                ? `Wk ${entry.weeks[0]}–${entry.weeks[entry.weeks.length - 1]} (${entry.weeks.length})`
                                : entry.weeks.map(w => `W${w}`).join(', ')
                              : <span className="text-[#ccc]">—</span>
                            }
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 uppercase border ${
                              entry.category === 'Lab'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : entry.category === 'Seminar'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : entry.category === 'Tutorial'
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                              {entry.category || 'Theory'}
                            </span>
                          </td>
                          {isAdmin && onDeleteEntry && (
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => {
                                  if (confirm(`Delete this ${entry.day} ${entry.startTime} session for "${(entry.course as any)?._name || entry.course?.name || 'Unknown'}"?`)) {
                                    onDeleteEntry(entry.id);
                                  }
                                }}
                                className="p-1.5 text-[#ac2925] hover:bg-[#fdecea] border border-transparent hover:border-[#ac2925] transition-all"
                                title="Delete this entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="px-3 py-2 bg-[#f9f9f9] border-t border-[#eee] flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#666] uppercase tracking-wider">
                  Showing {sortedEntries.length} entries
                  {searchQuery && ` matching "${searchQuery}"`}
                </span>
                {!isAdmin && (
                  <span className="text-[10px] text-[#999] font-bold uppercase tracking-wider">
                    View only — contact an admin to delete entries
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportsPanel;
