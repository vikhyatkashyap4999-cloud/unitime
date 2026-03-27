import { ScheduleEntry, Faculty, Clash, Course, Room, StudentGroup, Term, UserAccount } from '../types';
import { supabase } from './supabase';

/**
 * DataService handles the heavy lifting of managing entries.
 */
export class DataService {
  private static STORAGE_KEY = 'unitime_full_dataset';

  static async loadAllEntries(termId?: string): Promise<ScheduleEntry[]> {
    try {
      if (supabase) {
        let query = supabase.from('schedule').select('*');
        if (termId) query = query.eq('termId', termId);
        const { data, error } = await query;
        if (!error && data) return data;
        if (error) console.warn('Supabase select error:', error);
      }
    } catch (err) {
      console.error('DataService.loadAllEntries crash:', err);
    }

    const saved = localStorage.getItem(this.STORAGE_KEY);
    const entries = saved ? JSON.parse(saved) : [];
    if (termId) {
      return entries.filter((e: ScheduleEntry) => e.termId === termId);
    }
    return entries;
  }

  static async saveEntries(entries: ScheduleEntry[], termId?: string): Promise<void> {
    try {
      if (supabase) {
        console.log('Syncing schedule to Supabase...', entries);
        // If we have a termId, only clear that term's schedule to prevent data loss for other terms
        let deleteQuery = supabase.from('schedule').delete();
        if (termId) {
          deleteQuery = deleteQuery.eq('termId', termId);
        } else {
          deleteQuery = deleteQuery.neq('id', '0');
        }
        
        const { error: deleteError } = await deleteQuery;
        if (deleteError) {
          console.error('Failed to clear schedule in Supabase:', deleteError);
        }
        
        const itemsToInsert = termId ? entries.map(e => ({ ...e, termId })) : entries;
        const { error: insertError } = await supabase.from('schedule').insert(itemsToInsert);
        if (insertError) {
          console.error('Failed to sync schedule with Supabase:', insertError);
          alert(`Supabase Error (Schedule): ${insertError.message}. Check if table "schedule" exists.`);
        } else {
          console.log('Successfully synced schedule to Supabase.');
        }
      }
    } catch (err) {
      console.error('DataService.saveEntries crash:', err);
    }

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(entries));
  }

  /**
   * Generic methods for other entities
   */
  static async loadEntity<T>(tableName: string, storageKey: string, defaultValue: T[], termId?: string): Promise<T[]> {
    try {
      if (supabase) {
        let query = supabase.from(tableName).select('*');
        // Users and Terms are global, don't filter by termId
        if (termId && tableName !== 'users' && tableName !== 'terms') {
          query = query.eq('termId', termId);
        }
        const { data, error } = await query;
        if (!error && data) return data as T[];
        if (error) console.warn(`Supabase load error for ${tableName}:`, error);
      }
    } catch (err) {
      console.error(`DataService.loadEntity(${tableName}) crash:`, err);
    }
    
    const saved = localStorage.getItem(storageKey);
    try {
      const data = saved ? JSON.parse(saved) : defaultValue;
      if (termId && tableName !== 'users' && tableName !== 'terms') {
        return data.filter((item: any) => item.termId === termId || !item.termId);
      }
      return data;
    } catch {
      return defaultValue;
    }
  }

  static async saveEntity<T extends { id: string, termId?: string }>(tableName: string, storageKey: string, data: T[], termId?: string): Promise<void> {
    try {
      if (supabase) {
        console.log(`Syncing ${tableName} to Supabase...`, data);
        
        // 1. Clear existing data for this term (if scoped)
        let deleteQuery = supabase.from(tableName).delete();
        if (termId && tableName !== 'users' && tableName !== 'terms') {
          deleteQuery = deleteQuery.eq('termId', termId);
        } else {
          deleteQuery = deleteQuery.not('id', 'is', null);
        }
        
        const { error: deleteError } = await deleteQuery;
        if (deleteError) {
          console.error(`Failed to clear ${tableName} in Supabase:`, deleteError);
        }

        // 2. Strict Whitelist Sanitization
        const SCHEMA_WHITELIST: Record<string, string[]> = {
          users: ['id', 'username', 'password', 'name', 'role', 'departmentScope', 'lastLogin'],
          terms: ['id', 'name', 'startDate', 'endDate', 'academicYear', 'isActive'],
          courses: ['id', 'termId', 'code', 'name', 'credits', 'department', 'duration', 'type', 'color'],
          faculties: ['id', 'facultyId', 'termId', 'name', 'department', 'availability', 'maxHoursPerWeek'],
          rooms: ['id', 'termId', 'name', 'capacity', 'type'],
          groups: ['id', 'termId', 'name', 'program', 'semester', 'studentCount'],
          schedule: ['id', 'termId', 'courseId', 'facultyId', 'roomId', 'groupIds', 'day', 'startTime', 'endTime', 'departmentId', 'weeks', 'category']
        };

        const sanitizedData = data.map((item: any) => {
          const schema = SCHEMA_WHITELIST[tableName] || [];
          if (schema.length === 0) return item;

          const newItem: any = {};
          schema.forEach(key => {
            if (item[key] !== undefined) newItem[key] = item[key];
          });
          
          if (termId && tableName !== 'users' && tableName !== 'terms') {
            newItem.termId = termId;
          }

          if (tableName === 'users' && newItem.lastLogin) {
            if (newItem.lastLogin === '-' || newItem.lastLogin.length < 5) newItem.lastLogin = null;
          }

          return newItem;
        });

        const { error: insertError } = await supabase.from(tableName).insert(sanitizedData);
        if (insertError) {
          console.error(`Failed to insert ${tableName} into Supabase:`, insertError);
          const msg = `Supabase Sync Error (${tableName}): ${insertError.message}`;
          alert(msg);
        } else {
          console.log(`Successfully synced ${tableName} to Supabase.`);
        }
      }
    } catch (err) {
      console.error(`Unexpected crash syncing ${tableName}:`, err);
    }
    
    localStorage.setItem(storageKey, JSON.stringify(data));
  }

  static getDuration(start: string, end: string): number {
    const [sH, sM] = start.split(':').map(Number);
    const [eH, eM] = end.split(':').map(Number);
    return (eH + eM / 60) - (sH + sM / 60);
  }

  static detectConflicts(schedule: ScheduleEntry[], facultyList: Faculty[] = []): Clash[] {
    const clashes: Clash[] = [];
    const roomMap = new Map<string, string>();
    const facultyMap = new Map<string, string>();
    const groupMap = new Map<string, string>();
    const loadTracker = new Map<string, number>();

    for (const entry of schedule) {
      const weeks = entry.weeks || [];
      const duration = this.getDuration(entry.startTime, entry.endTime);
      
      for (const week of weeks) {
        const baseKey = `${week}-${entry.day}-${entry.startTime}`;
        
        const roomKey = `${baseKey}-room-${entry.roomId}`;
        if (roomMap.has(roomKey)) {
          clashes.push({ type: 'Room', message: `Room Conflict @ ${entry.day} ${entry.startTime} (Week ${week})`, affectedIds: [entry.id, roomMap.get(roomKey)!] });
        } else {
          roomMap.set(roomKey, entry.id);
        }

        const facultyKey = `${baseKey}-faculty-${entry.facultyId}`;
        if (facultyMap.has(facultyKey)) {
          clashes.push({ type: 'Faculty', message: `Faculty Conflict @ ${entry.day} ${entry.startTime} (Week ${week})`, affectedIds: [entry.id, facultyMap.get(facultyKey)!] });
        } else {
          facultyMap.set(facultyKey, entry.id);
        }

        const groupIds = entry.groupIds || [];
        for (const gId of groupIds) {
          const groupKey = `${baseKey}-group-${gId}`;
          if (groupMap.has(groupKey)) {
            clashes.push({ type: 'Group', message: `Group Conflict @ ${entry.day} ${entry.startTime} (Week ${week})`, affectedIds: [entry.id, groupMap.get(groupKey)!] });
          } else {
            groupMap.set(groupKey, entry.id);
          }
        }

        const loadKey = `${week}-${entry.facultyId}`;
        const currentLoad = (loadTracker.get(loadKey) || 0) + duration;
        loadTracker.set(loadKey, currentLoad);
      }
    }

    if (facultyList.length > 0) {
      loadTracker.forEach((hours, key) => {
        const [week, fId] = key.split('-');
        const faculty = facultyList.find(f => f.id === fId);
        if (faculty && hours > faculty.maxHoursPerWeek) {
          clashes.push({
            type: 'LoadViolation',
            message: `${faculty.name} is over capacity in Week ${week} (${hours.toFixed(1)}h / ${faculty.maxHoursPerWeek}h limit)`,
            affectedIds: schedule.filter(s => s.facultyId === fId && (s.weeks || []).includes(Number(week))).map(s => s.id)
          });
        }
      });
    }

    return clashes;
  }
}
