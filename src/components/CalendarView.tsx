import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CounselingRecord } from '../types';
import { cleanDateStr, cleanTimeStr, splitDateTime, pad2 } from '../utils/dateTime';
import {
  initGoogleOAuth,
  googleSignInWithGIS,
  cancelPendingGoogleLogin,
  startDirectGoogleOAuthRedirect,
  consumeDirectOAuthHashResult,
  hasCustomOAuthClientId,
  formatGoogleAuthError,
  logoutGoogle,
  getAccessToken,
  clearAccessToken,
  getCachedGoogleEmail,
  parsePublicCalendarConfig,
  addDaysToDateStr,
  fetchGoogleCalendarList,
  fetchNormalizedGoogleCalendarEvents,
  fetchPublicGoogleCalendarEvents,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  fetchGoogleTaskLists,
  fetchGoogleTasks,
  createGoogleTask,
  updateGoogleTask,
  deleteGoogleTask,
  fetchGasCalendarAndTasks,
  createGasCalendarEvent,
  updateGasCalendarEvent,
  deleteGasCalendarEvent,
  createGasTask,
  updateGasTask,
  deleteGasTask,
  GoogleCalendarListEntry,
  GoogleTaskListEntry,
  GoogleTaskItem,
  NormalizedGoogleEvent
} from '../services/googleWorkspaceService';
import {
  CalendarSettingsModal,
  EventEditModal,
  TodoEditModal,
  GoogleConfirmModal,
  GoogleConfirmState,
  EditableCalendarEvent,
  EditableTodoItem
} from './CalendarModals';

interface CalendarViewProps {
  records: CounselingRecord[];
  onSelectStudent: (studentName: string) => void;
  googleCalendarUrl?: string;
  scriptUrl?: string;
  initialMode?: 'counseling' | 'google';
}

export type FilterCategory = '전체' | 'Wee' | '순회' | 'To Do' | string;

export interface CalendarEventItem {
  id: string;
  title: string;
  rawTitle?: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  category: string;
  studentName?: string;
  counselingType?: 'completed' | 'appointment' | 'custom' | 'google';
  source?: 'counseling' | 'custom' | 'google';
  googleCalendarId?: string;
  googleEventId?: string;
  calendarLabel?: string;
  canEdit?: boolean;
  customColor?: string;
}

export interface ToDoItem {
  id: string;
  text: string;
  detail?: string;
  date: string;
  done: boolean;
  createdAt: number;
  googleTaskId?: string;
  googleTaskListId?: string;
}

const FILTER_CONFIG: Record<string, { emoji: string; bg: string; color: string }> = {
  '전체': { emoji: '🌸', bg: '#FFE8EE', color: '#E0658B' },
  'Wee': { emoji: '🔮', bg: '#EFEAF8', color: '#8265BD' },
  '순회': { emoji: '✈️', bg: '#E3F2FD', color: '#3A86C8' },
  'To Do': { emoji: '🍀', bg: '#E8F5E9', color: '#43A047' },
  'default': { emoji: '📌', bg: '#FFE8EE', color: '#E0658B' }
};

function getCategoryMeta(category: string, customColor?: string) {
  if (FILTER_CONFIG[category]) {
    return FILTER_CONFIG[category];
  }
  if (customColor) {
    return {
      emoji: '📅',
      bg: `${customColor}33`,
      color: '#334155'
    };
  }
  return FILTER_CONFIG['default'];
}

function daysBetween(startStr: string, endStr: string): number {
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const s = new Date(sy, sm - 1, sd).getTime();
  const e = new Date(ey, em - 1, ed).getTime();
  return Math.max(0, Math.round((e - s) / 86400000));
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  records,
  onSelectStudent,
  scriptUrl = ''
}) => {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  // View year and month state
  const [currentYear, setCurrentYear] = useState<number>(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(now.getMonth());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('전체');
  const [isPanelExpanded, setIsPanelExpanded] = useState<boolean>(true);
  const [rightTab, setRightTab] = useState<'all' | 'events' | 'todos'>('all');

  // Drag over day state
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // Google Sync & Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [gcalCalId, setGcalCalId] = useState(() => localStorage.getItem('gcal_calid') || '');
  const [gcalApiKey, setGcalApiKey] = useState(() => localStorage.getItem('gcal_apikey') || '');
  const [gcalClientId, setGcalClientId] = useState(() => localStorage.getItem('gcal_clientid') || '');
  const [isSyncing, setIsSyncing] = useState(false);

  // Google Workspace OAuth Auth & Selection State (Token cached in memory only)
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [useGasCalendarSync, setUseGasCalendarSync] = useState<boolean>(
    () => localStorage.getItem('wee_use_gas_cal_sync') === 'true'
  );
  const [gasTasksSupported, setGasTasksSupported] = useState<boolean>(false);
  const [calendarList, setCalendarList] = useState<GoogleCalendarListEntry[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gcal_selected_calendars');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return ['primary'];
  });
  const [taskLists, setTaskLists] = useState<GoogleTaskListEntry[]>([]);
  const [selectedTaskListId, setSelectedTaskListId] = useState<string>(
    () => localStorage.getItem('gtask_selected_list') || '@all'
  );
  const [syncNewTodoToGoogle, setSyncNewTodoToGoogle] = useState<boolean>(true);
  const [newEventTargetCal, setNewEventTargetCal] = useState<string>('auto');
  const [newTodoTargetList, setNewTodoTargetList] = useState<string>('auto');

  const [googleConfirm, setGoogleConfirm] = useState<GoogleConfirmState | null>(null);
  const [isConfirmBusy, setIsConfirmBusy] = useState<boolean>(false);
  const [editingEvent, setEditingEvent] = useState<EditableCalendarEvent | null>(null);
  const [editingTodo, setEditingTodo] = useState<EditableTodoItem | null>(null);
  const [googleErrorMsg, setGoogleErrorMsg] = useState<string | null>(null);
  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
  const isGasBridgeReady = useGasCalendarSync && !!scriptUrl.trim();
  const isCalendarRemoteReady = !needsGoogleAuth || isGasBridgeReady;
  const isTasksRemoteReady = !needsGoogleAuth || (isGasBridgeReady && gasTasksSupported);

  // Google Calendar Cached Events
  const [googleEvents, setGoogleEvents] = useState<CalendarEventItem[]>(() => {
    try {
      const saved = localStorage.getItem('oneul_google_cached_events');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Custom User Events
  const [customEvents, setCustomEvents] = useState<CalendarEventItem[]>(() => {
    try {
      const saved = localStorage.getItem('oneul_custom_events_v2');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // To-Do items
  const [todos, setTodos] = useState<ToDoItem[]>(() => {
    try {
      const saved = localStorage.getItem('oneul_todos_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            t =>
              t.id !== 'todo-1' &&
              t.id !== 'todo-2' &&
              !t.text?.includes('위(Wee) 클래스 주간 상담 실적') &&
              !t.text?.includes('순회상담 학교 방문 일정 확인')
          );
        }
      }
      return [];
    } catch {
      return [];
    }
  });

  // Form inputs
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventCategory, setNewEventCategory] = useState<'Wee' | '순회' | 'default'>('Wee');
  const [newEventAllDay, setNewEventAllDay] = useState(false);
  const [newEventStartTime, setNewEventStartTime] = useState('14:00');
  const [newEventEndTime, setNewEventEndTime] = useState('14:50');
  const [newEventIsMultiDay, setNewEventIsMultiDay] = useState(false);
  const [newEventStartDate, setNewEventStartDate] = useState(todayStr);
  const [newEventEndDate, setNewEventEndDate] = useState(todayStr);

  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoDetail, setNewTodoDetail] = useState('');
  const [newTodoDate, setNewTodoDate] = useState(todayStr);

  // Sync date inputs when selected date changes
  useEffect(() => {
    if (!newEventIsMultiDay) {
      setNewEventStartDate(selectedDateStr);
      setNewEventEndDate(selectedDateStr);
    }
  }, [selectedDateStr, newEventIsMultiDay]);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  // Helper: check if event is active on a specific date
  const isEventOnDate = (ev: CalendarEventItem, targetDate: string): boolean => {
    if (!ev.date) return false;
    const start = cleanDateStr(ev.date);
    const end = ev.endDate ? cleanDateStr(ev.endDate) : start;
    if (!end || end <= start) {
      return start === targetDate;
    }
    return start <= targetDate && targetDate <= end;
  };

  // Parsed custom calendar configs from gcalCalId (ID:Label:#Color)
  const parsedPublicCalendars = useMemo(() => parsePublicCalendarConfig(gcalCalId), [gcalCalId]);
  const publicCalMetaMap = useMemo(() => {
    const map = new Map<string, { label: string; color?: string }>();
    parsedPublicCalendars.forEach(c => map.set(c.id, { label: c.label, color: c.color }));
    return map;
  }, [parsedPublicCalendars]);

  // Filter chips: standard + any extra custom labels from gcalCalId
  const filterChips = useMemo(() => {
    const base: string[] = ['전체', 'Wee', '순회'];
    parsedPublicCalendars.forEach(c => {
      if (c.label && !c.label.includes('휴일') && !base.includes(c.label) && c.label !== 'To Do') {
        base.push(c.label);
      }
    });
    base.push('To Do');
    return base;
  }, [parsedPublicCalendars]);

  // Writable Google Calendars for OAuth creation
  const writableCalendars = useMemo(
    () => calendarList.filter(c => c.accessRole === 'owner' || c.accessRole === 'writer'),
    [calendarList]
  );

  // Persist State to LocalStorage
  useEffect(() => {
    localStorage.setItem('oneul_todos_v2', JSON.stringify(todos));
  }, [todos]);

  useEffect(() => {
    localStorage.setItem('oneul_custom_events_v2', JSON.stringify(customEvents));
  }, [customEvents]);

  useEffect(() => {
    localStorage.setItem('gcal_selected_calendars', JSON.stringify(selectedCalendarIds));
  }, [selectedCalendarIds]);

  useEffect(() => {
    localStorage.setItem('gtask_selected_list', selectedTaskListId);
  }, [selectedTaskListId]);

  useEffect(() => {
    localStorage.setItem('wee_use_gas_cal_sync', useGasCalendarSync ? 'true' : 'false');
  }, [useGasCalendarSync]);

  useEffect(() => {
    const unsubscribe = initGoogleOAuth(
      (_token, email) => {
        setGoogleEmail(email || getCachedGoogleEmail());
        setNeedsGoogleAuth(false);
      },
      () => {
        setGoogleEmail(null);
        setNeedsGoogleAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Apply theme accent color dynamically
  useEffect(() => {
    const meta = getCategoryMeta(activeFilter);
    document.documentElement.style.setProperty('--cal-accent', meta.color);
    document.documentElement.style.setProperty('--cal-accent-light', meta.bg);
  }, [activeFilter]);

  // Convert NormalizedGoogleEvent -> CalendarEventItem
  const mapNormalizedGoogleEvent = useCallback(
    (ev: NormalizedGoogleEvent): CalendarEventItem => {
      const customMeta = publicCalMetaMap.get(ev.googleCalendarId);
      const label = customMeta?.label || ev.calendarLabel;
      const isRoaming = /순회/i.test(label) || /순회/i.test(ev.title);
      const isWee = /wee/i.test(label) || /wee/i.test(ev.title);
      const category = isRoaming
        ? '순회'
        : isWee
          ? 'Wee'
          : customMeta?.label && !customMeta.label.includes('휴일')
            ? customMeta.label
            : 'default';

      const cleanTitle = ev.title.startsWith(`[${ev.calendarLabel}] `)
        ? ev.title.slice(ev.calendarLabel.length + 3)
        : ev.title;

      return {
        id: ev.id,
        title: `[${label}] ${cleanTitle}`,
        rawTitle: cleanTitle,
        date: ev.date,
        endDate: ev.endDate,
        startTime: ev.startTime,
        endTime: ev.endTime,
        allDay: ev.allDay,
        category,
        source: 'google',
        counselingType: 'google',
        googleCalendarId: ev.googleCalendarId,
        googleEventId: ev.googleEventId,
        calendarLabel: label,
        canEdit: ev.canEdit,
        customColor: customMeta?.color || ev.color
      };
    },
    [publicCalMetaMap]
  );

  // Sync Public Google Calendars via API Key (works without OAuth login)
  const syncPublicCalendars = useCallback(
    async (silent = false) => {
      if (!gcalApiKey.trim() || !gcalCalId.trim()) return 0;
      setIsSyncing(true);
      if (!silent) showToast('공개 구글 캘린더 일정 불러오는 중...');
      try {
        const timeMin = new Date(currentYear, currentMonth - 1, 1).toISOString();
        const timeMax = new Date(currentYear, currentMonth + 2, 0).toISOString();
        const { events, errors } = await fetchPublicGoogleCalendarEvents(
          gcalCalId,
          gcalApiKey,
          timeMin,
          timeMax
        );
        const mapped = events.map(mapNormalizedGoogleEvent);
        setGoogleEvents(mapped);
        localStorage.setItem('oneul_google_cached_events', JSON.stringify(mapped));
        if (errors.length > 0) {
          const errSummary = errors.join(' / ');
          setGoogleErrorMsg(`공개 캘린더 조회 일부 실패: ${errSummary}`);
          if (!silent) showToast(`일부 공개 캘린더 조회 실패 (${mapped.length}건 불러옴)`);
        } else if (!silent) {
          showToast(`공개 구글 캘린더 ${mapped.length}개 일정 동기화 완료! ✨`);
        }
        return mapped.length;
      } catch (err: any) {
        if (!silent) showToast(err?.message || '공개 캘린더 동기화 실패');
        return 0;
      } finally {
        setIsSyncing(false);
      }
    },
    [gcalApiKey, gcalCalId, currentYear, currentMonth, mapNormalizedGoogleEvent, showToast]
  );

  // Helper to resolve Google OAuth error / expiration
  const handleGoogleError = useCallback(
    (err: any, fallbackMsg: string) => {
      if (err?.message === 'GOOGLE_TOKEN_EXPIRED') {
        clearAccessToken();
        setNeedsGoogleAuth(true);
        const msg = 'Google 로그인 세션이 만료되었습니다. 다시 로그인해 주세요.';
        setGoogleErrorMsg(msg);
        showToast(msg);
      } else {
        console.error(err);
        const msg = err?.message || fallbackMsg;
        setGoogleErrorMsg(msg);
        showToast(msg);
      }
    },
    [showToast]
  );

  // Sync Google Calendar Events & Google Tasks (TODOs) using OAuth token
  const syncWithGoogleOAuth = useCallback(
    async (token: string, silent = false) => {
      setIsSyncing(true);
      setGoogleErrorMsg(null);
      if (!silent) showToast('구글 캘린더 & 할 일(TODO) 동기화 중...');

      const errors: string[] = [];
      let syncedEventCount = 0;
      let syncedTaskCount = 0;

      try {
        const timeMin = new Date(currentYear, currentMonth - 1, 1).toISOString();
        const timeMax = new Date(currentYear, currentMonth + 2, 0).toISOString();

        const [calListRes, taskListRes] = await Promise.allSettled([
          fetchGoogleCalendarList(token),
          fetchGoogleTaskLists(token)
        ]);

        // 1. Sync Google Calendar Events independently
        if (calListRes.status === 'fulfilled') {
          const calEntries = calListRes.value;
          setCalendarList(calEntries);
          const primaryEntry = calEntries.find(c => c.primary);
          if (primaryEntry?.id && primaryEntry.id.includes('@')) {
            setGoogleEmail(prev => prev || primaryEntry.id);
          }

          const targetCalIds = selectedCalendarIds.length > 0 ? selectedCalendarIds : ['primary'];
          const fetchedEvents: CalendarEventItem[] = [];
          const seenKeys = new Set<string>();

          for (const cid of targetCalIds) {
            const calMeta = calEntries.find(c => c.id === cid || (cid === 'primary' && c.primary));
            const actualId = calMeta?.id || cid;
            const customCfg = publicCalMetaMap.get(actualId) || publicCalMetaMap.get(cid);
            const label = customCfg?.label || calMeta?.summary || (cid === 'primary' ? '내 캘린더' : '구글');
            const canEdit = calMeta?.accessRole === 'owner' || calMeta?.accessRole === 'writer';

            try {
              const items = await fetchNormalizedGoogleCalendarEvents(
                token,
                actualId,
                label,
                timeMin,
                timeMax,
                canEdit,
                customCfg?.color || calMeta?.backgroundColor
              );
              items.forEach(norm => {
                const mapped = mapNormalizedGoogleEvent(norm);
                if (!seenKeys.has(mapped.id)) {
                  seenKeys.add(mapped.id);
                  fetchedEvents.push(mapped);
                }
              });
            } catch (err: any) {
              if (err?.message === 'GOOGLE_TOKEN_EXPIRED') throw err;
              errors.push(`[${label}] ${err?.message || '일정 조회 실패'}`);
            }
          }

          // Also merge any extra public calendars from gcalCalId that weren't fetched above
          if (gcalApiKey.trim() && parsedPublicCalendars.length > 0) {
            const extraCals = parsedPublicCalendars.filter(
              pc => !targetCalIds.includes(pc.id) && !(primaryEntry && pc.id === primaryEntry.id && targetCalIds.includes('primary'))
            );
            if (extraCals.length > 0) {
              const extraConfig = extraCals
                .map(c => `${c.id}:${c.label}${c.color ? `:${c.color}` : ''}`)
                .join(',');
              const pubRes = await fetchPublicGoogleCalendarEvents(
                extraConfig,
                gcalApiKey,
                timeMin,
                timeMax
              );
              pubRes.events.forEach(norm => {
                const mapped = mapNormalizedGoogleEvent(norm);
                if (!seenKeys.has(mapped.id)) {
                  seenKeys.add(mapped.id);
                  fetchedEvents.push(mapped);
                }
              });
            }
          }

          syncedEventCount = fetchedEvents.length;
          setGoogleEvents(fetchedEvents);
          localStorage.setItem('oneul_google_cached_events', JSON.stringify(fetchedEvents));
        } else {
          if (calListRes.reason?.message === 'GOOGLE_TOKEN_EXPIRED') throw calListRes.reason;
          errors.push(`캘린더 조회 실패: ${calListRes.reason?.message || '권한을 확인해 주세요'}`);
        }

        // 2. Sync Google Tasks (TODOs) independently
        if (taskListRes.status === 'fulfilled') {
          const tLists = taskListRes.value;
          setTaskLists(tLists);

          const activeSetting = selectedTaskListId || '@all';
          const listsToFetch =
            activeSetting === '@all'
              ? tLists.length > 0
                ? tLists.map(l => l.id)
                : ['@default']
              : [activeSetting];

          const allFetchedTasks: Array<{ task: GoogleTaskItem; listId: string }> = [];
          for (const lid of listsToFetch) {
            try {
              const gTasks = await fetchGoogleTasks(token, lid);
              gTasks.forEach(gt => {
                if (gt.title && gt.title.trim()) {
                  allFetchedTasks.push({ task: gt, listId: lid });
                }
              });
            } catch (err: any) {
              if (err?.message === 'GOOGLE_TOKEN_EXPIRED') throw err;
              errors.push(`할 일 목록(${lid}) 조회 실패: ${err?.message || ''}`);
            }
          }

          syncedTaskCount = allFetchedTasks.length;
          const remoteTaskIds = new Set(allFetchedTasks.map(x => x.task.id));
          const fetchedListIdSet = new Set(listsToFetch);

          setTodos(prev => {
            const localOnly = prev.filter(t => !t.googleTaskId);
            const otherLists = prev.filter(
              t =>
                t.googleTaskId &&
                activeSetting !== '@all' &&
                t.googleTaskListId &&
                !fetchedListIdSet.has(t.googleTaskListId) &&
                remoteTaskIds.has(t.googleTaskId)
            );
            const existingByTaskId = new Map<string, ToDoItem>();
            prev.forEach(t => {
              if (t.googleTaskId) existingByTaskId.set(t.googleTaskId, t);
            });

            const syncedItems: ToDoItem[] = allFetchedTasks.map(({ task: gt, listId }) => {
              const existing = existingByTaskId.get(gt.id);
              const dueDate = gt.due ? gt.due.substring(0, 10) : '';
              return {
                id: existing?.id || `gtask-${gt.id}`,
                text: gt.title.trim(),
                detail: gt.notes || '',
                date: dueDate,
                done: gt.status === 'completed',
                createdAt:
                  existing?.createdAt || (gt.updated ? new Date(gt.updated).getTime() : Date.now()),
                googleTaskId: gt.id,
                googleTaskListId: listId
              };
            });

            return [...syncedItems, ...otherLists, ...localOnly];
          });
        } else {
          if (taskListRes.reason?.message === 'GOOGLE_TOKEN_EXPIRED') throw taskListRes.reason;
          errors.push(
            `Google Tasks(할 일) 조회 실패: ${taskListRes.reason?.message || '권한을 확인해 주세요'}`
          );
        }

        if (errors.length > 0) {
          setGoogleErrorMsg(errors.join(' / '));
          if (!silent) {
            showToast(`부분 동기화 완료 (일정 ${syncedEventCount}건, TODO ${syncedTaskCount}건)`);
          }
        } else if (!silent) {
          showToast(`구글 일정 ${syncedEventCount}건 · TODO ${syncedTaskCount}건 동기화 완료! ✨`);
        }
      } catch (err) {
        handleGoogleError(err, '구글 캘린더/할 일 동기화 중 오류가 발생했습니다.');
      } finally {
        setIsSyncing(false);
      }
    },
    [
      currentYear,
      currentMonth,
      selectedCalendarIds,
      selectedTaskListId,
      gcalApiKey,
      parsedPublicCalendars,
      publicCalMetaMap,
      mapNormalizedGoogleEvent,
      handleGoogleError,
      showToast
    ]
  );

  // Sync Google Calendar Events & Google Tasks via Apps Script (GAS) Bridge (cookie-free)
  const syncWithGasBridge = useCallback(
    async (silent = false): Promise<boolean> => {
      if (!scriptUrl.trim()) return false;
      setIsSyncing(true);
      setGoogleErrorMsg(null);
      if (!silent) showToast('Apps Script 브릿지로 구글 캘린더 동기화 중...');

      try {
        const timeMin = new Date(currentYear, currentMonth - 1, 1).toISOString();
        const timeMax = new Date(currentYear, currentMonth + 2, 0).toISOString();
        const gasRes = await fetchGasCalendarAndTasks(scriptUrl, timeMin, timeMax);

        setCalendarList(gasRes.calendars);
        setGasTasksSupported(gasRes.tasksSupported);
        const primaryEntry = gasRes.calendars.find(c => c.primary);
        if (primaryEntry?.id && primaryEntry.id.includes('@')) {
          setGoogleEmail(prev => prev || primaryEntry.id);
        }

        const activeCalIds = new Set(selectedCalendarIds.length > 0 ? selectedCalendarIds : ['primary']);
        const filteredEvents: CalendarEventItem[] = [];
        const seenKeys = new Set<string>();

        gasRes.events.forEach(norm => {
          const isPrimaryCal = primaryEntry && norm.googleCalendarId === primaryEntry.id;
          const isIncluded =
            activeCalIds.has(norm.googleCalendarId) ||
            (activeCalIds.has('primary') && isPrimaryCal);
          if (!isIncluded) return;

          const mapped = mapNormalizedGoogleEvent(norm);
          if (!seenKeys.has(mapped.id)) {
            seenKeys.add(mapped.id);
            filteredEvents.push(mapped);
          }
        });

        setGoogleEvents(filteredEvents);
        localStorage.setItem('oneul_google_cached_events', JSON.stringify(filteredEvents));

        let syncedTaskCount = 0;
        if (gasRes.tasksSupported) {
          setTaskLists(gasRes.taskLists);
          const activeSetting = selectedTaskListId || '@all';
          const filteredRemoteTasks =
            activeSetting === '@all'
              ? gasRes.tasks
              : gasRes.tasks.filter(t => t.taskListId === activeSetting);

          syncedTaskCount = filteredRemoteTasks.length;
          const remoteTaskIds = new Set(filteredRemoteTasks.map(t => t.id));

          setTodos(prev => {
            const localOnly = prev.filter(t => !t.googleTaskId);
            const otherLists = prev.filter(
              t =>
                t.googleTaskId &&
                activeSetting !== '@all' &&
                t.googleTaskListId &&
                t.googleTaskListId !== activeSetting &&
                remoteTaskIds.has(t.googleTaskId)
            );
            const existingByTaskId = new Map<string, ToDoItem>();
            prev.forEach(t => {
              if (t.googleTaskId) existingByTaskId.set(t.googleTaskId, t);
            });

            const syncedItems: ToDoItem[] = filteredRemoteTasks.map(gt => {
              const existing = existingByTaskId.get(gt.id);
              const dueDate = gt.due ? gt.due.substring(0, 10) : '';
              return {
                id: existing?.id || `gtask-${gt.id}`,
                text: gt.title.trim(),
                detail: gt.notes || '',
                date: dueDate,
                done: gt.status === 'completed',
                createdAt:
                  existing?.createdAt || (gt.updated ? new Date(gt.updated).getTime() : Date.now()),
                googleTaskId: gt.id,
                googleTaskListId: gt.taskListId
              };
            });

            return [...syncedItems, ...otherLists, ...localOnly];
          });
        }

        if (!silent) {
          showToast(
            gasRes.tasksSupported
              ? `Apps Script 연동 완료! 일정 ${filteredEvents.length}건 · TODO ${syncedTaskCount}건 ✨`
              : `Apps Script 캘린더 ${filteredEvents.length}건 연동 완료! ✨`
          );
        }
        return true;
      } catch (err: any) {
        if (err?.code === 'GAS_CALENDAR_NOT_INSTALLED') {
          setUseGasCalendarSync(false);
        }
        setGoogleErrorMsg(err?.message || 'Apps Script 연동에 실패했습니다.');
        if (!silent) showToast(err?.message || 'Apps Script 연동에 실패했습니다.');
        return false;
      } finally {
        setIsSyncing(false);
      }
    },
    [
      scriptUrl,
      currentYear,
      currentMonth,
      selectedCalendarIds,
      selectedTaskListId,
      mapNormalizedGoogleEvent,
      showToast
    ]
  );

  // Auto-sync when viewing month or selection changes (OAuth -> GAS Bridge -> Public Calendars)
  useEffect(() => {
    const token = getAccessToken();
    if (token && !needsGoogleAuth) {
      syncWithGoogleOAuth(token, true);
    } else if (useGasCalendarSync && scriptUrl.trim()) {
      syncWithGasBridge(true);
    } else if (gcalApiKey.trim() && gcalCalId.trim()) {
      syncPublicCalendars(true);
    }
  }, [currentYear, currentMonth, selectedCalendarIds, selectedTaskListId, useGasCalendarSync, scriptUrl]);

  // Direct Google OAuth2 (GIS) Login - invoked synchronously on click
  const handleGoogleLoginGIS = () => {
    setIsLoggingIn(true);
    setGoogleErrorMsg(null);
    googleSignInWithGIS(gcalClientId)
      .then(async res => {
        if (res) {
          setNeedsGoogleAuth(false);
          await syncWithGoogleOAuth(res.accessToken, false);
        }
      })
      .catch((err: any) => {
        const info = formatGoogleAuthError(err);
        setGoogleErrorMsg(info.message);
        showToast(info.isCancelled ? '직접 연결이 완료되지 않았습니다.' : info.message);
      })
      .finally(() => {
        setIsLoggingIn(false);
      });
  };

  const handleCancelLogin = () => {
    cancelPendingGoogleLogin();
    setIsLoggingIn(false);
    showToast('Google OAuth 로그인 대기를 취소했습니다.');
  };

  const handleStartDirectOAuthRedirect = () => {
    setGoogleErrorMsg(null);
    try {
      startDirectGoogleOAuthRedirect(gcalClientId);
    } catch (err: any) {
      setGoogleErrorMsg(err?.message || '직접 OAuth 리다이렉트를 시작할 수 없습니다.');
      showToast(err?.message || '직접 OAuth 리다이렉트를 시작할 수 없습니다.');
    }
  };

  // Complete any pending direct OAuth hash sign-in on mount
  useEffect(() => {
    let active = true;
    try {
      const hashRes = consumeDirectOAuthHashResult();
      if (hashRes && active) {
        setGoogleEmail(hashRes.email);
        setNeedsGoogleAuth(false);
        syncWithGoogleOAuth(hashRes.accessToken, false);
      }
    } catch (hashErr: any) {
      if (active) {
        const info = formatGoogleAuthError(hashErr);
        setGoogleErrorMsg(info.message);
      }
    }
    return () => {
      active = false;
    };
  }, []);

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setGoogleEmail(null);
    setNeedsGoogleAuth(true);
    if (!useGasCalendarSync) {
      setCalendarList([]);
      setTaskLists([]);
    }
    setGoogleErrorMsg(null);
    showToast('Google OAuth 계정 연결이 해제되었습니다.');
  };

  const handleConnectGas = async () => {
    if (!scriptUrl.trim()) {
      showToast('먼저 상단 [설정]에서 Google Apps Script 웹 앱 URL을 입력해 주세요.');
      return;
    }
    setUseGasCalendarSync(true);
    const ok = await syncWithGasBridge(false);
    if (!ok) {
      setIsSettingsOpen(true);
    }
  };

  const handleDisconnectGas = () => {
    setUseGasCalendarSync(false);
    if (needsGoogleAuth) {
      setCalendarList([]);
      setTaskLists([]);
    }
    showToast('Apps Script 캘린더 브릿지 연결이 해제되었습니다.');
  };

  // Convert Wee-It Counseling Records into Calendar Events
  const counselingEvents = useMemo(() => {
    const list: CalendarEventItem[] = [];
    const completedSet = new Set<string>();

    (records || []).forEach((rec, idx) => {
      const d = cleanDateStr(rec.date);
      const t = cleanTimeStr(rec.startTime);
      if (d) {
        const isRoaming =
          (rec.caseNum && /R/i.test(rec.caseNum)) || (rec.school && rec.school.includes('순회'));
        const category: 'Wee' | '순회' = isRoaming ? '순회' : 'Wee';
        const sessionTxt = rec.session ? ` (${rec.session}회기)` : '';

        list.push({
          id: `rec-done-${rec.rowNum || idx}`,
          title: `${rec.name}${sessionTxt}`,
          date: d,
          startTime: t,
          endTime: cleanTimeStr(rec.endTime),
          allDay: !t,
          category,
          studentName: rec.name,
          counselingType: 'completed',
          source: 'counseling'
        });
        completedSet.add(`${rec.name}|${d}`);
      }
    });

    (records || []).forEach((rec, idx) => {
      if (rec.nextAppointment) {
        const nextInfo = splitDateTime(rec.nextAppointment);
        if (nextInfo.date && !completedSet.has(`${rec.name}|${nextInfo.date}`)) {
          const isRoaming =
            (rec.caseNum && /R/i.test(rec.caseNum)) || (rec.school && rec.school.includes('순회'));
          const category: 'Wee' | '순회' = isRoaming ? '순회' : 'Wee';

          list.push({
            id: `rec-appt-${rec.rowNum || idx}`,
            title: `[예약] ${rec.name}`,
            date: nextInfo.date,
            startTime: nextInfo.time,
            allDay: !nextInfo.time,
            category,
            studentName: rec.name,
            counselingType: 'appointment',
            source: 'counseling'
          });
        }
      }
    });

    return list;
  }, [records]);

  const allEvents = useMemo(() => {
    return [...counselingEvents, ...customEvents, ...googleEvents];
  }, [counselingEvents, customEvents, googleEvents]);

  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
  const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear(y => y - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear(y => y + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const handleGoToToday = () => {
    const todayDate = new Date();
    setCurrentYear(todayDate.getFullYear());
    setCurrentMonth(todayDate.getMonth());
    setSelectedDateStr(todayStr);
    setNewTodoDate(todayStr);
    setIsPanelExpanded(true);
    showToast('오늘 날짜로 이동했습니다 ☁️');
  };

  const handleSelectDay = (dateStr: string) => {
    setSelectedDateStr(dateStr);
    setNewTodoDate(dateStr);
    if (!isPanelExpanded) {
      setIsPanelExpanded(true);
    }
  };

  // Add Event (Creates in Google Calendar when a Google Calendar is chosen, else local custom event)
  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) {
      showToast('일정 제목을 입력해 주세요.');
      return;
    }

    const title = newEventTitle.trim();
    const start = newEventIsMultiDay ? newEventStartDate || selectedDateStr : selectedDateStr;
    const rawEnd = newEventIsMultiDay ? newEventEndDate || start : start;
    const finalEnd = rawEnd && rawEnd > start ? rawEnd : undefined;

    const token = getAccessToken();
    const defaultWritable =
      writableCalendars.find(c => selectedCalendarIds.includes(c.id)) ||
      writableCalendars.find(c => c.primary) ||
      writableCalendars[0];

    const resolvedTargetCalId =
      newEventTargetCal === 'local'
        ? null
        : newEventTargetCal === 'auto'
          ? defaultWritable?.id || null
          : newEventTargetCal;

    if (token && !needsGoogleAuth && resolvedTargetCalId) {
      try {
        await createGoogleCalendarEvent(token, resolvedTargetCalId, {
          summary: title,
          allDay: newEventAllDay,
          startDate: start,
          endDate: finalEnd || start,
          startTime: newEventStartTime,
          endTime: newEventEndTime
        });
        setNewEventTitle('');
        setNewEventIsMultiDay(false);
        showToast('Google 캘린더에 새 일정이 등록되었습니다! ☁️📅');
        await syncWithGoogleOAuth(token, true);
        return;
      } catch (err) {
        handleGoogleError(err, 'Google 캘린더 등록 실패로 로컬 일정으로 저장됩니다.');
      }
    } else if (isGasBridgeReady && resolvedTargetCalId) {
      try {
        await createGasCalendarEvent(scriptUrl, resolvedTargetCalId, {
          summary: title,
          allDay: newEventAllDay,
          startDate: start,
          endDate: finalEnd || start,
          startTime: newEventStartTime,
          endTime: newEventEndTime
        });
        setNewEventTitle('');
        setNewEventIsMultiDay(false);
        showToast('Apps Script를 통해 Google 캘린더에 일정이 등록되었습니다! 🚀📅');
        await syncWithGasBridge(true);
        return;
      } catch (err) {
        handleGoogleError(err, 'Apps Script 캘린더 등록 실패로 로컬 일정으로 저장됩니다.');
      }
    }

    const item: CalendarEventItem = {
      id: `custom-${Date.now()}`,
      title,
      rawTitle: title,
      date: start,
      endDate: finalEnd,
      startTime: newEventAllDay ? undefined : newEventStartTime,
      endTime: newEventAllDay ? undefined : newEventEndTime,
      allDay: newEventAllDay,
      category: newEventCategory,
      source: 'custom',
      counselingType: 'custom',
      canEdit: true
    };

    setCustomEvents(prev => [...prev, item]);
    setNewEventTitle('');
    setNewEventIsMultiDay(false);
    showToast(finalEnd ? '여러 날에 걸친 기간 일정이 등록되었습니다 🗓️' : '새 일정이 등록되었습니다 🌸');
  };

  // Edit Event (Custom or Google Calendar)
  const handleSaveEditedEvent = (updated: {
    title: string;
    allDay: boolean;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    category: 'Wee' | '순회' | 'default';
  }) => {
    if (!editingEvent) return;
    const target = editingEvent;
    const finalEnd = updated.endDate > updated.startDate ? updated.endDate : undefined;

    if (target.source === 'google' && target.googleCalendarId && target.googleEventId) {
      setEditingEvent(null);
      setGoogleConfirm({
        title: 'Google 캘린더 일정 수정 확인',
        description: `Google 캘린더의 일정 "${target.rawTitle || target.title}"을(를) "${updated.title}"(으)로 수정하시겠습니까?`,
        confirmLabel: 'Google 캘린더에 수정 반영',
        onConfirm: async () => {
          const token = getAccessToken();
          if (token) {
            try {
              await updateGoogleCalendarEvent(token, target.googleCalendarId!, target.googleEventId!, {
                summary: updated.title,
                allDay: updated.allDay,
                startDate: updated.startDate,
                endDate: updated.endDate,
                startTime: updated.startTime,
                endTime: updated.endTime
              });
              showToast('Google 캘린더 일정이 수정되었습니다! ✨');
              await syncWithGoogleOAuth(token, true);
            } catch (err) {
              handleGoogleError(err, 'Google 캘린더 일정 수정에 실패했습니다.');
            }
            return;
          }

          if (isGasBridgeReady) {
            try {
              await updateGasCalendarEvent(
                scriptUrl,
                target.googleCalendarId!,
                target.googleEventId!,
                {
                  summary: updated.title,
                  allDay: updated.allDay,
                  startDate: updated.startDate,
                  endDate: updated.endDate,
                  startTime: updated.startTime,
                  endTime: updated.endTime
                }
              );
              showToast('Apps Script를 통해 Google 캘린더 일정이 수정되었습니다! ✨');
              await syncWithGasBridge(true);
            } catch (err) {
              handleGoogleError(err, 'Apps Script 캘린더 일정 수정에 실패했습니다.');
            }
            return;
          }

          setNeedsGoogleAuth(true);
          showToast('Google 로그인 또는 Apps Script 브릿지 연결이 필요합니다.');
        }
      });
      return;
    }

    setCustomEvents(prev =>
      prev.map(ev =>
        ev.id === target.id
          ? {
              ...ev,
              title: updated.title,
              rawTitle: updated.title,
              date: updated.startDate,
              endDate: finalEnd,
              startTime: updated.allDay ? undefined : updated.startTime,
              endTime: updated.allDay ? undefined : updated.endTime,
              allDay: updated.allDay,
              category: updated.category
            }
          : ev
      )
    );
    setEditingEvent(null);
    showToast('일정이 수정되었습니다 🌸');
  };

  // Delete Event (Custom or Google Calendar - uses custom confirmation modal)
  const handleDeleteEvent = (ev: CalendarEventItem) => {
    if (ev.source === 'google' && ev.googleCalendarId && ev.googleEventId) {
      setGoogleConfirm({
        title: 'Google 캘린더 일정 삭제 확인',
        description: `Google 캘린더에서 "${ev.rawTitle || ev.title}" 일정을 영구 삭제하시겠습니까?`,
        confirmLabel: 'Google 캘린더에서 삭제',
        onConfirm: async () => {
          const token = getAccessToken();
          if (token) {
            try {
              await deleteGoogleCalendarEvent(token, ev.googleCalendarId!, ev.googleEventId!);
              setGoogleEvents(prev => prev.filter(item => item.id !== ev.id));
              showToast('Google 캘린더에서 일정이 삭제되었습니다.');
            } catch (err) {
              handleGoogleError(err, 'Google 캘린더 일정 삭제에 실패했습니다.');
            }
            return;
          }

          if (isGasBridgeReady) {
            try {
              await deleteGasCalendarEvent(scriptUrl, ev.googleCalendarId!, ev.googleEventId!);
              setGoogleEvents(prev => prev.filter(item => item.id !== ev.id));
              showToast('Apps Script를 통해 Google 캘린더 일정이 삭제되었습니다.');
            } catch (err) {
              handleGoogleError(err, 'Apps Script 캘린더 일정 삭제에 실패했습니다.');
            }
            return;
          }

          setNeedsGoogleAuth(true);
          showToast('Google 로그인 또는 Apps Script 브릿지 연결이 필요합니다.');
        }
      });
      return;
    }

    setGoogleConfirm({
      title: '일정 삭제 확인',
      description: `"${ev.title}" 일정을 삭제하시겠습니까?`,
      confirmLabel: '삭제하기',
      onConfirm: () => {
        setCustomEvents(prev => prev.filter(e => e.id !== ev.id));
        showToast('일정이 삭제되었습니다.');
      }
    });
  };

  // Add To-Do (optionally creates in Google Tasks when connected)
  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle.trim()) {
      showToast('할 일 제목을 입력해 주세요.');
      return;
    }

    const title = newTodoTitle.trim();
    const detail = newTodoDetail.trim();
    const targetDate = newTodoDate || selectedDateStr;
    const token = getAccessToken();
    const listId =
      newTodoTargetList !== 'auto'
        ? newTodoTargetList
        : selectedTaskListId && selectedTaskListId !== '@all'
          ? selectedTaskListId
          : taskLists[0]?.id || '@default';

    if (syncNewTodoToGoogle && token && !needsGoogleAuth) {
      try {
        const created = await createGoogleTask(token, listId, {
          title,
          notes: detail || undefined,
          dueDate: targetDate || undefined
        });

        const item: ToDoItem = {
          id: `gtask-${created.id}`,
          text: created.title || title,
          detail: created.notes || detail,
          date: created.due ? created.due.substring(0, 10) : targetDate,
          done: created.status === 'completed',
          createdAt: Date.now(),
          googleTaskId: created.id,
          googleTaskListId: listId
        };

        setTodos(prev => [item, ...prev]);
        setNewTodoTitle('');
        setNewTodoDetail('');
        showToast('To Do가 Google 캘린더(Tasks)에도 함께 등록되었습니다 ☁️🍀');
        return;
      } catch (err) {
        handleGoogleError(err, 'Google Tasks 등록에 실패하여 로컬에만 저장됩니다.');
      }
    } else if (syncNewTodoToGoogle && isGasBridgeReady && gasTasksSupported) {
      try {
        const created = await createGasTask(scriptUrl, listId, {
          title,
          notes: detail || undefined,
          dueDate: targetDate || undefined
        });

        const item: ToDoItem = {
          id: `gtask-${created.id}`,
          text: created.title || title,
          detail: created.notes || detail,
          date: created.due ? created.due.substring(0, 10) : targetDate,
          done: created.status === 'completed',
          createdAt: Date.now(),
          googleTaskId: created.id,
          googleTaskListId: listId
        };

        setTodos(prev => [item, ...prev]);
        setNewTodoTitle('');
        setNewTodoDetail('');
        showToast('Apps Script를 통해 Google Tasks에도 등록되었습니다 🚀🍀');
        return;
      } catch (err) {
        handleGoogleError(err, 'Apps Script Tasks 등록에 실패하여 로컬에만 저장됩니다.');
      }
    }

    const item: ToDoItem = {
      id: `todo-${Date.now()}`,
      text: title,
      detail,
      date: targetDate,
      done: false,
      createdAt: Date.now()
    };

    setTodos(prev => [item, ...prev]);
    setNewTodoTitle('');
    setNewTodoDetail('');
    showToast('To Do가 추가되었습니다 🍀');
  };

  // Save Edited To-Do
  const handleSaveEditedTodo = (updated: { text: string; detail: string; date: string }) => {
    if (!editingTodo) return;
    const target = editingTodo;

    if (target.googleTaskId) {
      setEditingTodo(null);
      setGoogleConfirm({
        title: 'Google Tasks 할 일 수정 확인',
        description: `Google 캘린더(Tasks)에 연동된 할 일 "${target.text}"의 내용을 수정하시겠습니까?`,
        confirmLabel: 'Google에도 반영',
        secondaryLabel: '이 앱에서만 수정',
        onConfirm: async () => {
          const token = getAccessToken();
          const listId = target.googleTaskListId || selectedTaskListId || '@default';
          if (token) {
            try {
              await updateGoogleTask(token, listId, target.googleTaskId!, {
                title: updated.text,
                notes: updated.detail,
                dueDate: updated.date
              });
              setTodos(prev =>
                prev.map(t =>
                  t.id === target.id
                    ? { ...t, text: updated.text, detail: updated.detail, date: updated.date }
                    : t
                )
              );
              showToast('Google Tasks 할 일이 수정되었습니다 ☁️✨');
            } catch (err) {
              handleGoogleError(err, 'Google Tasks 수정에 실패했습니다.');
            }
            return;
          }

          if (isGasBridgeReady && gasTasksSupported) {
            try {
              await updateGasTask(scriptUrl, listId, target.googleTaskId!, {
                title: updated.text,
                notes: updated.detail,
                dueDate: updated.date
              });
              setTodos(prev =>
                prev.map(t =>
                  t.id === target.id
                    ? { ...t, text: updated.text, detail: updated.detail, date: updated.date }
                    : t
                )
              );
              showToast('Apps Script를 통해 Google Tasks 할 일이 수정되었습니다 🚀✨');
            } catch (err) {
              handleGoogleError(err, 'Apps Script Tasks 수정에 실패했습니다.');
            }
            return;
          }

          setNeedsGoogleAuth(true);
          showToast('Google 로그인이 필요합니다.');
        },
        onSecondary: () => {
          setTodos(prev =>
            prev.map(t =>
              t.id === target.id
                ? { ...t, text: updated.text, detail: updated.detail, date: updated.date }
                : t
            )
          );
          showToast('이 앱에서 To Do가 수정되었습니다.');
        }
      });
      return;
    }

    setTodos(prev =>
      prev.map(t =>
        t.id === target.id
          ? { ...t, text: updated.text, detail: updated.detail, date: updated.date }
          : t
      )
    );
    setEditingTodo(null);
    showToast('To Do가 수정되었습니다 🍀');
  };

  // Toggle To-Do
  const handleToggleTodo = (id: string) => {
    const target = todos.find(t => t.id === id);
    if (!target) return;
    const nextDone = !target.done;

    if (target.googleTaskId) {
      setGoogleConfirm({
        title: 'Google Tasks 상태 변경 확인',
        description: `구글 캘린더(Tasks)에 연동된 할 일 "${target.text}"을(를) [${nextDone ? '완료' : '진행 중'}] 상태로 변경하시겠습니까?`,
        confirmLabel: 'Google에도 반영',
        secondaryLabel: '이 앱에서만 변경',
        onConfirm: async () => {
          const token = getAccessToken();
          const listId = target.googleTaskListId || selectedTaskListId || '@default';
          if (token) {
            try {
              await updateGoogleTask(token, listId, target.googleTaskId!, { done: nextDone });
              setTodos(prev => prev.map(t => (t.id === id ? { ...t, done: nextDone } : t)));
              showToast(nextDone ? 'Google Tasks 완료 처리되었습니다 ✨' : 'Google Tasks 진행 중으로 변경되었습니다.');
            } catch (err) {
              handleGoogleError(err, 'Google Tasks 상태 변경에 실패했습니다.');
            }
            return;
          }

          if (isGasBridgeReady && gasTasksSupported) {
            try {
              await updateGasTask(scriptUrl, listId, target.googleTaskId!, { done: nextDone });
              setTodos(prev => prev.map(t => (t.id === id ? { ...t, done: nextDone } : t)));
              showToast(nextDone ? 'Google Tasks 완료 처리되었습니다 ✨' : 'Google Tasks 진행 중으로 변경되었습니다.');
            } catch (err) {
              handleGoogleError(err, 'Apps Script Tasks 상태 변경에 실패했습니다.');
            }
            return;
          }

          showToast('Google 로그인이 필요합니다. 로그인 후 다시 시도해 주세요.');
          setNeedsGoogleAuth(true);
        },
        onSecondary: () => {
          setTodos(prev => prev.map(t => (t.id === id ? { ...t, done: nextDone } : t)));
          showToast(nextDone ? 'To Do 완료! 수고하셨습니다 ✨' : 'To Do를 다시 진행 중으로 변경했습니다.');
        }
      });
      return;
    }

    setTodos(prev =>
      prev.map(t => {
        if (t.id === id) {
          showToast(nextDone ? 'To Do 완료! 수고하셨습니다 ✨' : 'To Do를 다시 진행 중으로 변경했습니다.');
          return { ...t, done: nextDone };
        }
        return t;
      })
    );
  };

  // Delete To-Do
  const handleDeleteTodo = (id: string) => {
    const target = todos.find(t => t.id === id);
    if (!target) return;

    if (target.googleTaskId) {
      setGoogleConfirm({
        title: 'Google Tasks 삭제 확인',
        description: `구글 캘린더(Tasks)에 연동된 할 일 "${target.text}"을(를) Google 계정에서 영구 삭제하시겠습니까?`,
        confirmLabel: 'Google에서도 삭제',
        secondaryLabel: '이 앱에서만 삭제',
        onConfirm: async () => {
          const token = getAccessToken();
          const listId = target.googleTaskListId || selectedTaskListId || '@default';
          if (token) {
            try {
              await deleteGoogleTask(token, listId, target.googleTaskId!);
              setTodos(prev => prev.filter(t => t.id !== id));
              showToast('Google Tasks에서 할 일이 삭제되었습니다.');
            } catch (err) {
              handleGoogleError(err, 'Google Tasks 삭제에 실패했습니다.');
            }
            return;
          }

          if (isGasBridgeReady && gasTasksSupported) {
            try {
              await deleteGasTask(scriptUrl, listId, target.googleTaskId!);
              setTodos(prev => prev.filter(t => t.id !== id));
              showToast('Apps Script를 통해 Google Tasks에서 삭제되었습니다.');
            } catch (err) {
              handleGoogleError(err, 'Apps Script Tasks 삭제에 실패했습니다.');
            }
            return;
          }

          showToast('Google 로그인이 필요합니다. 로그인 후 다시 시도해 주세요.');
          setNeedsGoogleAuth(true);
        },
        onSecondary: () => {
          setTodos(prev => prev.filter(t => t.id !== id));
          showToast('이 앱에서 To Do가 삭제되었습니다.');
        }
      });
      return;
    }

    setTodos(prev => prev.filter(t => t.id !== id));
    showToast('To Do가 삭제되었습니다.');
  };

  const unsyncedLocalTodos = useMemo(() => todos.filter(t => !t.googleTaskId), [todos]);

  const handleRequestPushLocalTodos = () => {
    if (unsyncedLocalTodos.length === 0) {
      showToast('모든 To Do가 이미 Google Tasks와 연동되어 있습니다.');
      return;
    }
    const token = getAccessToken();
    const canPushViaOAuth = !!(token && !needsGoogleAuth);
    const canPushViaGas = isGasBridgeReady && gasTasksSupported;
    if (!canPushViaOAuth && !canPushViaGas) {
      showToast('먼저 Google 계정 로그인 또는 Google Tasks가 활성화된 Apps Script 브릿지를 연결해 주세요.');
      return;
    }

    const previewNames = unsyncedLocalTodos
      .slice(0, 5)
      .map(t => `• ${t.text}${t.date ? ` (${t.date})` : ''}`)
      .join('\n');
    const extraLine = unsyncedLocalTodos.length > 5 ? `\n외 ${unsyncedLocalTodos.length - 5}건` : '';

    setGoogleConfirm({
      title: '로컬 To Do를 Google Tasks에 일괄 등록',
      description: `연동되지 않은 로컬 To Do ${unsyncedLocalTodos.length}건을 Google 캘린더(Tasks)에 등록하시겠습니까?\n\n${previewNames}${extraLine}`,
      confirmLabel: `${unsyncedLocalTodos.length}건 Google에 등록`,
      onConfirm: async () => {
        const listId =
          selectedTaskListId && selectedTaskListId !== '@all'
            ? selectedTaskListId
            : taskLists[0]?.id || '@default';
        let successCount = 0;
        const updatedMap = new Map<string, { googleTaskId: string; googleTaskListId: string }>();

        try {
          for (const item of unsyncedLocalTodos) {
            const created = canPushViaOAuth && token
              ? await createGoogleTask(token, listId, {
                  title: item.text,
                  notes: item.detail || undefined,
                  dueDate: item.date || undefined
                })
              : await createGasTask(scriptUrl, listId, {
                  title: item.text,
                  notes: item.detail || undefined,
                  dueDate: item.date || undefined
                });
            if (item.done && created?.id) {
              if (canPushViaOAuth && token) {
                await updateGoogleTask(token, listId, created.id, { done: true });
              } else {
                await updateGasTask(scriptUrl, listId, created.id, { done: true });
              }
            }
            if (created?.id) {
              updatedMap.set(item.id, { googleTaskId: created.id, googleTaskListId: listId });
              successCount++;
            }
          }

          setTodos(prev =>
            prev.map(t => {
              const linked = updatedMap.get(t.id);
              return linked ? { ...t, ...linked } : t;
            })
          );
          showToast(`${successCount}건의 To Do가 Google Tasks에 연동되었습니다! ✨`);
        } catch (err) {
          handleGoogleError(err, '일부 To Do 연동 중 오류가 발생했습니다.');
        }
      }
    });
  };

  // Drag and Drop Handling
  const handleDragStart = (e: React.DragEvent, type: 'event' | 'todo', id: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', JSON.stringify({ type, id }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDate !== dateStr) {
      setDragOverDate(dateStr);
    }
  };

  const handleDragLeave = (dateStr: string) => {
    if (dragOverDate === dateStr) {
      setDragOverDate(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverDate(null);

    const raw = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      if (data.type === 'todo') {
        const target = todos.find(t => t.id === data.id);
        if (!target || target.date === targetDateStr) return;

        if (target.googleTaskId) {
          setGoogleConfirm({
            title: 'Google Tasks 마감일 변경 확인',
            description: `구글 캘린더(Tasks)에 연동된 할 일 "${target.text}"의 날짜를 ${targetDateStr}로 변경하시겠습니까?`,
            confirmLabel: 'Google에도 반영',
            secondaryLabel: '이 앱에서만 이동',
            onConfirm: async () => {
              const token = getAccessToken();
              const listId = target.googleTaskListId || selectedTaskListId || '@default';
              if (token) {
                try {
                  await updateGoogleTask(token, listId, target.googleTaskId!, { dueDate: targetDateStr });
                  setTodos(prev =>
                    prev.map(t => (t.id === data.id ? { ...t, date: targetDateStr } : t))
                  );
                  showToast(`Google Tasks 마감일이 ${targetDateStr}로 변경되었습니다 🍀`);
                } catch (err) {
                  handleGoogleError(err, 'Google Tasks 날짜 변경에 실패했습니다.');
                }
                return;
              }

              if (isGasBridgeReady && gasTasksSupported) {
                try {
                  await updateGasTask(scriptUrl, listId, target.googleTaskId!, { dueDate: targetDateStr });
                  setTodos(prev =>
                    prev.map(t => (t.id === data.id ? { ...t, date: targetDateStr } : t))
                  );
                  showToast(`Apps Script를 통해 Google Tasks 마감일이 ${targetDateStr}로 변경되었습니다 🍀`);
                } catch (err) {
                  handleGoogleError(err, 'Apps Script Tasks 날짜 변경에 실패했습니다.');
                }
                return;
              }

              showToast('Google 로그인이 필요합니다. 로그인 후 다시 시도해 주세요.');
              setNeedsGoogleAuth(true);
            },
            onSecondary: () => {
              setTodos(prev =>
                prev.map(t => (t.id === data.id ? { ...t, date: targetDateStr } : t))
              );
              showToast(`To Do가 ${targetDateStr}로 이동되었습니다 🍀`);
            }
          });
          return;
        }

        setTodos(prev =>
          prev.map(t => (t.id === data.id ? { ...t, date: targetDateStr } : t))
        );
        showToast(`To Do가 ${targetDateStr}로 이동되었습니다 🍀`);
      } else if (data.type === 'event') {
        const targetCustom = customEvents.find(ev => ev.id === data.id);
        if (targetCustom) {
          if (targetCustom.date === targetDateStr) return;
          const spanDays = targetCustom.endDate ? daysBetween(targetCustom.date, targetCustom.endDate) : 0;
          const nextEnd = spanDays > 0 ? addDaysToDateStr(targetDateStr, spanDays) : undefined;
          setCustomEvents(prev =>
            prev.map(ev => (ev.id === data.id ? { ...ev, date: targetDateStr, endDate: nextEnd } : ev))
          );
          showToast(`일정이 ${targetDateStr}로 이동되었습니다 🌸`);
          return;
        }

        const targetGoogle = googleEvents.find(ev => ev.id === data.id);
        if (targetGoogle && targetGoogle.canEdit && targetGoogle.googleCalendarId && targetGoogle.googleEventId) {
          if (targetGoogle.date === targetDateStr) return;
          const spanDays = targetGoogle.endDate ? daysBetween(targetGoogle.date, targetGoogle.endDate) : 0;
          const nextEnd = spanDays > 0 ? addDaysToDateStr(targetDateStr, spanDays) : targetDateStr;

          setGoogleConfirm({
            title: 'Google 캘린더 일정 날짜 이동 확인',
            description: `Google 캘린더의 일정 "${targetGoogle.rawTitle || targetGoogle.title}"을(를) ${targetDateStr}(으)로 이동하시겠습니까?`,
            confirmLabel: 'Google 캘린더에 반영',
            onConfirm: async () => {
              const token = getAccessToken();
              if (token) {
                try {
                  await updateGoogleCalendarEvent(
                    token,
                    targetGoogle.googleCalendarId!,
                    targetGoogle.googleEventId!,
                    {
                      allDay: !!targetGoogle.allDay,
                      startDate: targetDateStr,
                      endDate: nextEnd,
                      startTime: targetGoogle.startTime,
                      endTime: targetGoogle.endTime
                    }
                  );
                  showToast(`Google 캘린더 일정이 ${targetDateStr}로 이동되었습니다 ☁️📅`);
                  await syncWithGoogleOAuth(token, true);
                } catch (err) {
                  handleGoogleError(err, 'Google 캘린더 일정 이동에 실패했습니다.');
                }
                return;
              }

              if (isGasBridgeReady) {
                try {
                  await updateGasCalendarEvent(
                    scriptUrl,
                    targetGoogle.googleCalendarId!,
                    targetGoogle.googleEventId!,
                    {
                      allDay: !!targetGoogle.allDay,
                      startDate: targetDateStr,
                      endDate: nextEnd,
                      startTime: targetGoogle.startTime,
                      endTime: targetGoogle.endTime
                    }
                  );
                  showToast(`Apps Script를 통해 Google 캘린더 일정이 ${targetDateStr}로 이동되었습니다 🚀📅`);
                  await syncWithGasBridge(true);
                } catch (err) {
                  handleGoogleError(err, 'Apps Script 캘린더 일정 이동에 실패했습니다.');
                }
                return;
              }

              setNeedsGoogleAuth(true);
              showToast('Google 로그인이 필요합니다.');
            }
          });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Manual Refresh / Sync
  const handleSyncGoogle = async () => {
    const token = getAccessToken();
    if (token && !needsGoogleAuth) {
      await syncWithGoogleOAuth(token, false);
      return;
    }

    if (useGasCalendarSync && scriptUrl.trim()) {
      await syncWithGasBridge(false);
      return;
    }

    if (gcalApiKey.trim() && gcalCalId.trim()) {
      await syncPublicCalendars(false);
    } else {
      showToast('Wee-It 상담 데이터가 반영되었습니다. 구글 연동은 로그인 또는 ⚙️ 설정을 이용해 주세요.');
    }
  };

  const handleSaveGoogleSettings = async () => {
    localStorage.setItem('gcal_calid', gcalCalId);
    localStorage.setItem('gcal_apikey', gcalApiKey);
    localStorage.setItem('gcal_clientid', gcalClientId);
    setIsSettingsOpen(false);
    showToast('구글 연동 설정이 저장되었습니다 ☁️');
    await handleSyncGoogle();
  };

  const selectedDayEvents = allEvents.filter(e => isEventOnDate(e, selectedDateStr));
  const selectedDayTodos = todos.filter(t => t.date === selectedDateStr);

  const selectedDateKorean = useMemo(() => {
    if (!selectedDateStr) return '';
    const [y, m, d] = selectedDateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return `${y}년 ${m}월 ${d}일 (${dayNames[dateObj.getDay()]})`;
  }, [selectedDateStr]);

  return (
    <div id="calPage" style={{ position: 'relative' }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(51, 49, 62, 0.94)',
            color: '#ffffff',
            padding: '10px 24px',
            borderRadius: '30px',
            fontSize: '0.88rem',
            fontWeight: 800,
            zIndex: 99999,
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            pointerEvents: 'none',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.2s ease'
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Main Oneul Calendar Window Widget */}
      <div className="oneul-widget">
        {/* Mac OS Window Bar */}
        <div className="oneul-mac-bar">
          <div className="oneul-mac-dots">
            <span className="oneul-mac-dot close"></span>
            <span className="oneul-mac-dot minimize"></span>
            <span className="oneul-mac-dot maximize"></span>
            <span className="oneul-mac-title">Oneul Calendar & Wee-It 2026</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.78rem' }}>
            <span style={{ color: '#8265BD', fontWeight: 800 }}>
              🔮 Wee {counselingEvents.filter(e => e.category === 'Wee').length}건
            </span>
            <span style={{ color: '#3A86C8', fontWeight: 800 }}>
              ✈️ 순회 {counselingEvents.filter(e => e.category === '순회').length}건
            </span>
            <span style={{ color: '#43A047', fontWeight: 800 }}>
              🍀 To Do {todos.filter(t => !t.done).length}건
            </span>
          </div>
        </div>

        {/* Calendar Body */}
        <div className="oneul-main-content">
          {/* Left Column */}
          <div className="oneul-left">
            {/* Header */}
            <div className="oneul-header">
              <div className="oneul-month-nav">
                <button
                  type="button"
                  className="oneul-nav-btn"
                  onClick={handlePrevMonth}
                  title="이전 달"
                  style={{ width: '34px', height: '34px', padding: 0, justifyContent: 'center', borderRadius: '50%' }}
                >
                  ❮
                </button>
                <button
                  type="button"
                  className="oneul-nav-btn"
                  onClick={handleNextMonth}
                  title="다음 달"
                  style={{ width: '34px', height: '34px', padding: 0, justifyContent: 'center', borderRadius: '50%' }}
                >
                  ❯
                </button>
                <button
                  type="button"
                  className="oneul-nav-btn"
                  onClick={handleGoToToday}
                  style={{ background: '#f8fafc', fontWeight: 800, borderRadius: '9999px', padding: '7px 16px' }}
                >
                  🌷 Today
                </button>
                <span className="oneul-month-label" style={{ marginLeft: '8px' }}>
                  {currentYear}년 {currentMonth + 1}월
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="oneul-nav-btn"
                  onClick={handleSyncGoogle}
                  disabled={isSyncing}
                  style={{
                    borderRadius: '9999px',
                    padding: '7px 16px',
                    height: '34px',
                    minWidth: '50px',
                    justifyContent: 'center'
                  }}
                  title="새로고침 / 구글 동기화"
                >
                  {isSyncing ? '⏳' : '🔄'}
                </button>
                <button
                  type="button"
                  className="oneul-nav-btn"
                  onClick={() => setIsSettingsOpen(true)}
                  style={{
                    borderRadius: '9999px',
                    padding: '7px 16px',
                    height: '34px',
                    minWidth: '50px',
                    justifyContent: 'center'
                  }}
                  title="구글 캘린더 & TODO 연동 설정"
                >
                  ⚙️
                </button>
                <button
                  type="button"
                  className="oneul-nav-btn"
                  onClick={() => setIsPanelExpanded(!isPanelExpanded)}
                  style={{
                    background: isPanelExpanded ? 'var(--cal-accent-light)' : '#ffffff',
                    color: isPanelExpanded ? 'var(--cal-accent)' : 'var(--cal-text-sub)',
                    borderColor: isPanelExpanded ? 'var(--cal-accent)' : 'var(--cal-border)',
                    fontWeight: 800,
                    borderRadius: '9999px',
                    padding: '7px 16px',
                    height: '34px',
                    minWidth: '50px',
                    justifyContent: 'center'
                  }}
                  title="상세 패널 열기/닫기"
                >
                  📋
                </button>
              </div>
            </div>

            {/* Filter Bar Chips + Google Sign-In */}
            <div className="oneul-filter-bar" style={{ alignItems: 'center' }}>
              {filterChips.map(cat => {
                const meta = getCategoryMeta(cat);
                const isActive = activeFilter === cat;

                return (
                  <button
                    key={cat}
                    type="button"
                    className={`oneul-tag-btn ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setActiveFilter(cat);
                      if (cat === 'To Do') {
                        setRightTab('todos');
                        setIsPanelExpanded(true);
                      }
                    }}
                    style={{
                      background: isActive ? meta.bg : '#ffffff',
                      color: isActive ? meta.color : 'var(--cal-text-sub)',
                      borderColor: isActive ? meta.color : 'var(--cal-border)',
                      fontWeight: isActive ? 900 : 700
                    }}
                  >
                    <span>{meta.emoji}</span>
                    <span>{cat}</span>
                  </button>
                );
              })}

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {needsGoogleAuth ? (
                  <>
                    {isGasBridgeReady && (
                      <button
                        type="button"
                        onClick={() => setIsSettingsOpen(true)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 12px',
                          borderRadius: '9999px',
                          background: '#f0fdf4',
                          border: '1px solid #86efac',
                          color: '#15803d',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                        title="Apps Script 브릿지로 Google 캘린더 연동됨 (클릭하여 설정)"
                      >
                        <span>🚀</span>
                        <span>GAS 연동됨</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="gsi-material-button"
                      onClick={handleGoogleLoginGIS}
                      disabled={isLoggingIn}
                      title="Google OAuth 직접 연결로 캘린더 및 TODO(Tasks) 연동"
                    >
                      <div className="gsi-material-button-state"></div>
                      <div className="gsi-material-button-content-wrapper">
                        <div className="gsi-material-button-icon">
                          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                            <path fill="none" d="M0 0h48v48H0z"></path>
                          </svg>
                        </div>
                        <span className="gsi-material-button-contents">
                          {isLoggingIn ? 'OAuth 연결 중...' : 'Google OAuth 직접 연결'}
                        </span>
                      </div>
                    </button>
                    {isLoggingIn && (
                      <button
                        type="button"
                        onClick={handleCancelLogin}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '9999px',
                          background: '#fef2f2',
                          border: '1px solid #fca5a5',
                          color: '#b91c1c',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        ✕ 취소
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '9999px',
                      background: '#ecfdf5',
                      border: '1px solid #a7f3d0',
                      color: '#047857',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                    title="Google Calendar & Tasks 연동됨 (클릭하여 설정 열기)"
                  >
                    <span>☁️</span>
                    <span>{googleEmail?.split('@')[0] || 'Google 연동됨'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Persistent Google Error / Fallback Helper Banner */}
            {googleErrorMsg && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  marginBottom: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '0.8rem',
                  color: '#991b1b'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ fontWeight: 700, lineHeight: 1.45 }}>⚠️ {googleErrorMsg}</div>
                  <button
                    type="button"
                    onClick={() => setGoogleErrorMsg(null)}
                    style={{ border: 'none', background: 'transparent', color: '#991b1b', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 800 }}
                  >
                    ✕
                  </button>
                </div>
                {needsGoogleAuth && (
                  <>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={handleGoogleLoginGIS}
                        disabled={isLoggingIn}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #f87171',
                          color: '#b91c1c',
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          padding: '5px 12px',
                          borderRadius: '9999px',
                          cursor: 'pointer'
                        }}
                      >
                        🔄 Google OAuth 직접 연결
                      </button>
                      {scriptUrl.trim() && !useGasCalendarSync && (
                        <button
                          type="button"
                          onClick={handleConnectGas}
                          style={{
                            background: '#f0fdf4',
                            border: '1px solid #86efac',
                            color: '#15803d',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            padding: '5px 12px',
                            borderRadius: '9999px',
                            cursor: 'pointer'
                          }}
                        >
                          🚀 Apps Script로 연결 (쿠키 불필요)
                        </button>
                      )}
                      {isLoggingIn && (
                        <button
                          type="button"
                          onClick={handleCancelLogin}
                          style={{
                            background: '#ffffff',
                            border: '1px solid #fca5a5',
                            color: '#b91c1c',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            padding: '5px 12px',
                            borderRadius: '9999px',
                            cursor: 'pointer'
                          }}
                        >
                          ✕ 로그인 대기 취소
                        </button>
                      )}
                      {!isInIframe && hasCustomOAuthClientId(gcalClientId) && (
                        <button
                          type="button"
                          onClick={handleStartDirectOAuthRedirect}
                          disabled={isLoggingIn}
                          style={{
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            color: '#1e293b',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            padding: '5px 12px',
                            borderRadius: '9999px',
                            cursor: 'pointer'
                          }}
                        >
                          🔗 OAuth 리다이렉트 연결
                        </button>
                      )}
                      {isInIframe && (
                        <a
                          href={window.location.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            color: '#1e293b',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            padding: '5px 12px',
                            borderRadius: '9999px',
                            textDecoration: 'none'
                          }}
                        >
                          새 탭에서 열어 연동하기 ↗
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsSettingsOpen(true)}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          color: '#475569',
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          padding: '5px 12px',
                          borderRadius: '9999px',
                          cursor: 'pointer'
                        }}
                      >
                        🔍 연결 진단 열기
                      </button>
                    </div>
                    <div style={{ fontSize: '0.73rem', color: '#7f1d1d', lineHeight: 1.4 }}>
                      • &quot;확인하지 않은 앱&quot; 화면이 뜨면 <strong>고급 → 이동</strong>을 누른 뒤 권한을 체크해 주세요.
                      {' · '}Chrome 서드파티 쿠키 차단으로 로그인이 안 되면 <strong>[Apps Script로 연결]</strong>을 이용해 주세요.
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Weekday Names Header */}
            <div className="oneul-weekday-grid">
              <div className="oneul-weekday sun">일</div>
              <div className="oneul-weekday">월</div>
              <div className="oneul-weekday">화</div>
              <div className="oneul-weekday">수</div>
              <div className="oneul-weekday">목</div>
              <div className="oneul-weekday">금</div>
              <div className="oneul-weekday sat">토</div>
            </div>

            {/* 7 Columns Dynamic Days Grid */}
            <div className="oneul-days-grid">
              {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                <div key={`empty-${idx}`} style={{ minHeight: '90px', background: 'transparent' }} />
              ))}

              {Array.from({ length: daysInCurrentMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const dateStr = `${currentYear}-${pad2(currentMonth + 1)}-${pad2(dayNum)}`;
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDateStr;
                const colIdx = (firstDayOfWeek + idx) % 7;
                const isSun = colIdx === 0;
                const isSat = colIdx === 6;
                const isDragOver = dragOverDate === dateStr;

                const isTodoOnly = activeFilter === 'To Do';
                const dayEvents = isTodoOnly
                  ? []
                  : allEvents
                      .filter(e => isEventOnDate(e, dateStr))
                      .filter(
                        e =>
                          activeFilter === '전체' ||
                          e.category === activeFilter ||
                          e.calendarLabel === activeFilter
                      );

                const dayTodos =
                  activeFilter === '전체' || isTodoOnly
                    ? todos.filter(t => t.date === dateStr)
                    : [];

                const totalItemsCount = dayEvents.length + dayTodos.length;
                let renderedCount = 0;

                return (
                  <div
                    key={dateStr}
                    className={`oneul-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${isSun ? 'sun' : ''} ${isSat ? 'sat' : ''}`}
                    style={{
                      border: isDragOver ? '2px dashed var(--cal-accent)' : undefined,
                      background: isDragOver ? 'rgba(224, 101, 139, 0.15)' : undefined
                    }}
                    onClick={() => handleSelectDay(dateStr)}
                    onDragOver={e => handleDragOver(e, dateStr)}
                    onDragLeave={() => handleDragLeave(dateStr)}
                    onDrop={e => handleDrop(e, dateStr)}
                  >
                    <div className="oneul-day-num">{dayNum}</div>

                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                      {dayEvents.slice(0, 2).map(ev => {
                        const meta = getCategoryMeta(ev.category, ev.customColor);
                        renderedCount++;

                        const isMultiDay = !!(ev.endDate && ev.endDate > ev.date);
                        const isStart = ev.date === dateStr;
                        const isEnd = ev.endDate === dateStr;
                        const isMiddle = isMultiDay && !isStart && !isEnd;

                        const prefix = isMultiDay
                          ? isStart
                            ? '🚩 '
                            : isEnd
                              ? '🏁 '
                              : '↔ '
                          : ev.startTime
                            ? `${ev.startTime} `
                            : '';

                        return (
                          <div
                            key={ev.id}
                            className="oneul-event-text"
                            draggable={ev.source === 'custom' || (ev.source === 'google' && !!ev.canEdit)}
                            onDragStart={e => handleDragStart(e, 'event', ev.id)}
                            onClick={e => {
                              e.stopPropagation();
                              handleSelectDay(dateStr);
                            }}
                            title={
                              isMultiDay
                                ? `${ev.title} (기간: ${ev.date} ~ ${ev.endDate})`
                                : `${ev.title} (클릭 시 상세 보기)`
                            }
                            style={{
                              backgroundColor: meta.bg,
                              color: meta.color,
                              fontWeight: isMultiDay ? 800 : 700,
                              borderRadius: isMultiDay
                                ? isStart
                                  ? '9999px 4px 4px 9999px'
                                  : isEnd
                                    ? '4px 9999px 9999px 4px'
                                    : '4px'
                                : undefined,
                              borderLeft: isMultiDay && isStart ? `3px solid ${meta.color}` : undefined,
                              borderRight: isMultiDay && isEnd ? `3px solid ${meta.color}` : undefined,
                              opacity: isMiddle ? 0.92 : 1
                            }}
                          >
                            {prefix}
                            {ev.title}
                          </div>
                        );
                      })}

                      {dayTodos.map(td => {
                        if (renderedCount >= 2) return null;
                        const meta = FILTER_CONFIG['To Do'];
                        renderedCount++;

                        return (
                          <div
                            key={td.id}
                            className={`oneul-event-text ${td.done ? 'completed' : ''}`}
                            draggable
                            onDragStart={e => handleDragStart(e, 'todo', td.id)}
                            onClick={e => {
                              e.stopPropagation();
                              handleToggleTodo(td.id);
                            }}
                            title={`${td.text} (클릭 시 완료 토글 / 드래그하여 날짜 이동)`}
                            style={{
                              backgroundColor: meta.bg,
                              color: meta.color
                            }}
                          >
                            {td.done ? '✓ ' : '🍀 '}
                            {td.text}
                          </div>
                        );
                      })}

                      {totalItemsCount > renderedCount && (
                        <div className="oneul-more-badge">+{totalItemsCount - renderedCount}개</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="oneul-cheer-bar">
              ✨ Believe in yourself. Today is going to be a wonderful day! 🤍
            </div>
          </div>

          {/* Right Column: Sliding Drawer Panel */}
          <div className={`oneul-right ${!isPanelExpanded ? 'collapsed' : ''}`}>
            {isPanelExpanded && (
              <div className="oneul-panel-inner">
                {/* Panel Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexShrink: 0 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: 'var(--cal-text-main)' }}>
                      {selectedDateKorean}
                    </h3>
                    <div style={{ fontSize: '0.78rem', color: 'var(--cal-text-sub)', marginTop: '2px', fontWeight: 700 }}>
                      일정 {selectedDayEvents.length}건 · To Do {selectedDayTodos.length}건
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPanelExpanded(false)}
                    style={{
                      border: 'none',
                      background: '#f1f1f5',
                      color: 'var(--cal-text-sub)',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.85rem'
                    }}
                    title="패널 닫기"
                  >
                    ✕
                  </button>
                </div>

                {/* Panel Tabs */}
                <div className="oneul-panel-tabs">
                  <button
                    type="button"
                    className={`oneul-panel-tab ${rightTab === 'all' ? 'active' : ''}`}
                    onClick={() => setRightTab('all')}
                  >
                    🌸 전체
                  </button>
                  <button
                    type="button"
                    className={`oneul-panel-tab ${rightTab === 'events' ? 'active' : ''}`}
                    onClick={() => setRightTab('events')}
                  >
                    📅 일정
                  </button>
                  <button
                    type="button"
                    className={`oneul-panel-tab ${rightTab === 'todos' ? 'active' : ''}`}
                    onClick={() => setRightTab('todos')}
                  >
                    🍀 To Do
                  </button>
                </div>

                {/* Tab 1: 전체 */}
                {rightTab === 'all' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
                    {selectedDayEvents.length === 0 && selectedDayTodos.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--cal-text-sub)', fontSize: '0.86rem' }}>
                        선택된 날짜에 등록된 일정이 없습니다.
                      </div>
                    ) : (
                      <>
                        {selectedDayEvents.map(ev => {
                          const meta = getCategoryMeta(ev.category, ev.customColor);
                          const isEditable = ev.source === 'custom' || (ev.source === 'google' && !!ev.canEdit);

                          return (
                            <div
                              key={ev.id}
                              className="oneul-card-item"
                              style={{ borderLeft: `4px solid ${meta.color}` }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: meta.bg, color: meta.color }}>
                                      {meta.emoji} {ev.calendarLabel || ev.category}
                                    </span>
                                    {ev.startTime && (
                                      <span style={{ fontSize: '0.75rem', color: 'var(--cal-text-sub)', fontWeight: 700 }}>
                                        {ev.startTime} {ev.endTime ? `~ ${ev.endTime}` : ''}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--cal-text-main)' }}>
                                    {ev.title}
                                  </div>
                                  {ev.endDate && ev.endDate > ev.date && (
                                    <div style={{ fontSize: '0.74rem', color: '#2563eb', fontWeight: 800, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <span>🗓️</span>
                                      <span>기간 일정: {ev.date} ~ {ev.endDate}</span>
                                    </div>
                                  )}
                                </div>

                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                                  {ev.studentName && (
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        onSelectStudent(ev.studentName!);
                                      }}
                                      title="해당 학생의 전체 사례관리 탭으로 이동"
                                      style={{
                                        fontSize: '0.72rem',
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        border: '1px solid rgba(224, 101, 139, 0.3)',
                                        background: 'var(--accent-light)',
                                        color: 'var(--accent)',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      🗂️ 사례관리
                                    </button>
                                  )}
                                  {isEditable && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditingEvent({
                                            id: ev.id,
                                            title: ev.title,
                                            rawTitle: ev.rawTitle || ev.title,
                                            date: ev.date,
                                            endDate: ev.endDate,
                                            startTime: ev.startTime,
                                            endTime: ev.endTime,
                                            allDay: ev.allDay,
                                            category: ev.category,
                                            source: ev.source,
                                            googleCalendarId: ev.googleCalendarId,
                                            googleEventId: ev.googleEventId
                                          })
                                        }
                                        title="일정 수정"
                                        style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteEvent(ev)}
                                        title="일정 삭제"
                                        style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}
                                      >
                                        ✕
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {selectedDayTodos.map(td => (
                          <div
                            key={td.id}
                            className="oneul-card-item"
                            style={{ borderLeft: '4px solid #43A047', display: 'flex', alignItems: 'center', gap: '8px' }}
                          >
                            <input
                              type="checkbox"
                              checked={td.done}
                              onChange={() => handleToggleTodo(td.id)}
                              style={{ width: '18px', height: '18px', accentColor: '#43A047', cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1, minWidth: 0, textDecoration: td.done ? 'line-through' : 'none', opacity: td.done ? 0.6 : 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--cal-text-main)' }}>
                                  {td.text}
                                </span>
                                {td.googleTaskId && (
                                  <span
                                    title="Google 캘린더(Tasks)와 연동됨"
                                    style={{
                                      fontSize: '0.68rem',
                                      fontWeight: 800,
                                      padding: '1px 6px',
                                      borderRadius: '9999px',
                                      background: '#e0f2fe',
                                      color: '#0369a1'
                                    }}
                                  >
                                    ☁️ Google
                                  </span>
                                )}
                              </div>
                              {td.detail && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--cal-text-sub)' }}>{td.detail}</div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditingTodo(td)}
                              title="수정"
                              style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTodo(td.id)}
                              title="삭제"
                              style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* Tab 2: 일정 (Events) */}
                {rightTab === 'events' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
                    <form onSubmit={handleAddEvent} className="oneul-quick-form">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 900, color: 'var(--cal-text-main)' }}>
                          📅 새 일정 등록 ({selectedDateStr})
                        </span>
                        {isCalendarRemoteReady && writableCalendars.length > 0 && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#0369a1', background: '#e0f2fe', padding: '2px 7px', borderRadius: '9999px' }}>
                            {needsGoogleAuth ? '🚀 GAS 연동' : '☁️ Google 연동'}
                          </span>
                        )}
                      </div>

                      <input
                        type="text"
                        placeholder="새 일정 제목 입력"
                        value={newEventTitle}
                        onChange={e => setNewEventTitle(e.target.value)}
                        style={{ height: '36px', fontSize: '0.84rem' }}
                      />

                      {isCalendarRemoteReady && writableCalendars.length > 0 && (
                        <select
                          value={newEventTargetCal}
                          onChange={e => setNewEventTargetCal(e.target.value)}
                          style={{ height: '34px', fontSize: '0.8rem', borderRadius: '9999px', padding: '0 12px' }}
                        >
                          <option value="auto">
                            ☁️ Google 캘린더 ({writableCalendars[0]?.summary || '기본'})에 등록
                          </option>
                          {writableCalendars.map(cal => (
                            <option key={cal.id} value={cal.id}>
                              📅 {cal.summary} {cal.primary ? '(기본)' : ''}
                            </option>
                          ))}
                          <option value="local">📌 이 앱 로컬 일정으로만 저장</option>
                        </select>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '2px 0' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 800, color: 'var(--cal-text-main)' }}>
                          <input
                            type="checkbox"
                            checked={newEventIsMultiDay}
                            onChange={e => {
                              setNewEventIsMultiDay(e.target.checked);
                              if (e.target.checked && !newEventEndDate) {
                                setNewEventEndDate(selectedDateStr);
                              }
                            }}
                            style={{ width: '16px', height: '16px', accentColor: 'var(--cal-accent)' }}
                          />
                          🗓️ 여러 일에 걸친 일정 (기간/다일)
                        </label>
                      </div>

                      {newEventIsMultiDay && (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            type="date"
                            value={newEventStartDate || selectedDateStr}
                            onChange={e => setNewEventStartDate(e.target.value)}
                            style={{ height: '36px', fontSize: '0.8rem', flex: 1, borderRadius: '9999px', padding: '0 12px', border: '1px solid var(--cal-border)' }}
                          />
                          <span style={{ fontSize: '0.8rem', color: 'var(--cal-text-sub)' }}>~</span>
                          <input
                            type="date"
                            value={newEventEndDate || selectedDateStr}
                            onChange={e => setNewEventEndDate(e.target.value)}
                            style={{ height: '36px', fontSize: '0.8rem', flex: 1, borderRadius: '9999px', padding: '0 12px', border: '1px solid var(--cal-border)' }}
                          />
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                          value={newEventCategory}
                          onChange={e => setNewEventCategory(e.target.value as any)}
                          style={{ height: '36px', fontSize: '0.82rem', flex: 1, borderRadius: '9999px', padding: '0 12px' }}
                        >
                          <option value="Wee">🔮 Wee (위센터 상담)</option>
                          <option value="순회">✈️ 순회 (순회상담)</option>
                          <option value="default">📌 일반 일정</option>
                        </select>

                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={newEventAllDay}
                            onChange={e => setNewEventAllDay(e.target.checked)}
                            style={{ width: '16px', height: '16px' }}
                          />
                          종일
                        </label>
                      </div>

                      {!newEventAllDay && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="time"
                            value={newEventStartTime}
                            onChange={e => setNewEventStartTime(e.target.value)}
                            style={{ height: '36px', fontSize: '0.82rem', flex: 1, borderRadius: '9999px', padding: '0 10px' }}
                          />
                          <span style={{ fontSize: '0.8rem', color: 'var(--cal-text-sub)' }}>~</span>
                          <input
                            type="time"
                            value={newEventEndTime}
                            onChange={e => setNewEventEndTime(e.target.value)}
                            style={{ height: '36px', fontSize: '0.82rem', flex: 1, borderRadius: '9999px', padding: '0 10px' }}
                          />
                        </div>
                      )}

                      <button
                        type="submit"
                        className="btn"
                        style={{
                          background: 'var(--cal-accent)',
                          color: '#ffffff',
                          padding: '8px 16px',
                          fontSize: '0.85rem',
                          fontWeight: 800,
                          borderRadius: '9999px'
                        }}
                      >
                        일정 추가
                      </button>
                    </form>

                    {/* Events List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--cal-text-sub)' }}>
                        등록된 일정 ({selectedDayEvents.length}건)
                      </div>
                      {selectedDayEvents.map(ev => {
                        const meta = getCategoryMeta(ev.category, ev.customColor);
                        const isEditable = ev.source === 'custom' || (ev.source === 'google' && !!ev.canEdit);

                        return (
                          <div key={ev.id} className="oneul-card-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: meta.bg, color: meta.color, marginRight: '6px' }}>
                                  {meta.emoji} {ev.calendarLabel || ev.category}
                                </span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--cal-text-main)' }}>
                                  {ev.title}
                                </span>
                                {ev.startTime && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--cal-text-sub)', marginTop: '2px' }}>
                                    {ev.startTime} {ev.endTime ? `~ ${ev.endTime}` : ''}
                                  </div>
                                )}
                              </div>

                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                {ev.studentName && (
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      onSelectStudent(ev.studentName!);
                                    }}
                                    title="해당 학생의 전체 사례관리 탭으로 이동"
                                    style={{
                                      fontSize: '0.72rem',
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      border: '1px solid rgba(224, 101, 139, 0.3)',
                                      background: 'var(--accent-light)',
                                      color: 'var(--accent)',
                                      fontWeight: 800,
                                      cursor: 'pointer',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    🗂️ 사례관리 이동
                                  </button>
                                )}
                                {isEditable && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditingEvent({
                                          id: ev.id,
                                          title: ev.title,
                                          rawTitle: ev.rawTitle || ev.title,
                                          date: ev.date,
                                          endDate: ev.endDate,
                                          startTime: ev.startTime,
                                          endTime: ev.endTime,
                                          allDay: ev.allDay,
                                          category: ev.category,
                                          source: ev.source,
                                          googleCalendarId: ev.googleCalendarId,
                                          googleEventId: ev.googleEventId
                                        })
                                      }
                                      title="수정"
                                      style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteEvent(ev)}
                                      title="삭제"
                                      style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}
                                    >
                                      ✕
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tab 3: To Do */}
                {rightTab === 'todos' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
                    <form onSubmit={handleAddTodo} className="oneul-quick-form">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 900, color: 'var(--cal-text-main)' }}>
                          🍀 오늘 할 일 입력 ☘️
                        </span>
                        {isTasksRemoteReady && (
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0369a1', background: '#e0f2fe', padding: '2px 7px', borderRadius: '9999px' }}>
                            {needsGoogleAuth ? '🚀 GAS Tasks 연동' : '☁️ Google Tasks 연동'}
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="할 일 제목 입력"
                        value={newTodoTitle}
                        onChange={e => setNewTodoTitle(e.target.value)}
                        style={{ height: '36px', fontSize: '0.84rem' }}
                      />
                      <input
                        type="text"
                        placeholder="세부 메모 (선택사항)"
                        value={newTodoDetail}
                        onChange={e => setNewTodoDetail(e.target.value)}
                        style={{ height: '34px', fontSize: '0.82rem' }}
                      />
                      {isTasksRemoteReady ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: 'var(--cal-text-sub)', cursor: 'pointer', fontWeight: 700 }}>
                            <input
                              type="checkbox"
                              checked={syncNewTodoToGoogle}
                              onChange={e => setSyncNewTodoToGoogle(e.target.checked)}
                              style={{ width: '15px', height: '15px', accentColor: '#0284c7' }}
                            />
                            <span>Google 캘린더(Tasks)에도 함께 등록</span>
                          </label>
                          {syncNewTodoToGoogle && taskLists.length > 1 && (
                            <select
                              value={newTodoTargetList}
                              onChange={e => setNewTodoTargetList(e.target.value)}
                              style={{ height: '32px', fontSize: '0.76rem', borderRadius: '8px', padding: '0 8px' }}
                            >
                              <option value="auto">기본 할 일 목록에 저장</option>
                              {taskLists.map(tl => (
                                <option key={tl.id} value={tl.id}>
                                  📋 {tl.title}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f8fafc', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--cal-text-sub)', fontWeight: 700 }}>
                              Google 연동 시 TODO가 캘린더와 동기화됩니다
                            </span>
                            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={handleGoogleLoginGIS}
                                disabled={isLoggingIn}
                                style={{
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  color: '#1e293b',
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  padding: '4px 8px',
                                  borderRadius: '9999px',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {isLoggingIn ? '연결 중...' : '연결하기'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsSettingsOpen(true)}
                                title="Google 연동 설정 열기"
                                style={{
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  color: '#475569',
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  padding: '4px 7px',
                                  borderRadius: '9999px',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                ⚙️
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="date"
                          value={newTodoDate}
                          onChange={e => setNewTodoDate(e.target.value)}
                          style={{ height: '36px', fontSize: '0.82rem', flex: 1 }}
                        />
                        <button
                          type="submit"
                          className="btn"
                          style={{
                            background: '#43A047',
                            color: '#ffffff',
                            padding: '8px 16px',
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            borderRadius: '8px'
                          }}
                        >
                          추가
                        </button>
                      </div>
                    </form>

                    {isTasksRemoteReady && unsyncedLocalTodos.length > 0 && (
                      <button
                        type="button"
                        onClick={handleRequestPushLocalTodos}
                        style={{
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          color: '#1d4ed8',
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          padding: '7px 12px',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          textAlign: 'center'
                        }}
                      >
                        ☁️ 미연동 로컬 할 일 {unsyncedLocalTodos.length}건 Google에 등록하기
                      </button>
                    )}

                    {/* Selected Day To-Dos */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--cal-text-sub)' }}>
                        선택일 To Do ({selectedDayTodos.length}건)
                      </div>
                      {selectedDayTodos.map(td => (
                        <div
                          key={td.id}
                          className="oneul-card-item"
                          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                          <input
                            type="checkbox"
                            checked={td.done}
                            onChange={() => handleToggleTodo(td.id)}
                            style={{ width: '18px', height: '18px', accentColor: '#43A047', cursor: 'pointer' }}
                          />
                          <div style={{ flex: 1, minWidth: 0, textDecoration: td.done ? 'line-through' : 'none', opacity: td.done ? 0.55 : 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--cal-text-main)' }}>
                                {td.text}
                              </span>
                              {td.googleTaskId && (
                                <span
                                  title="Google 캘린더(Tasks)와 연동됨"
                                  style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 800,
                                    padding: '1px 6px',
                                    borderRadius: '9999px',
                                    background: '#e0f2fe',
                                    color: '#0369a1'
                                  }}
                                >
                                  ☁️ Google
                                </span>
                              )}
                            </div>
                            {td.detail && (
                              <div style={{ fontSize: '0.74rem', color: 'var(--cal-text-sub)' }}>{td.detail}</div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingTodo(td)}
                            title="수정"
                            style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTodo(td.id)}
                            title="삭제"
                            style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      {/* All Incomplete To-Dos */}
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--cal-text-sub)', marginTop: '12px' }}>
                        미완료 할 일 전체 ({todos.filter(t => !t.done && t.date !== selectedDateStr).length}건)
                      </div>
                      {todos
                        .filter(t => !t.done && t.date !== selectedDateStr)
                        .map(td => (
                          <div
                            key={td.id}
                            className="oneul-card-item"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fafafa' }}
                          >
                            <input
                              type="checkbox"
                              checked={td.done}
                              onChange={() => handleToggleTodo(td.id)}
                              style={{ width: '17px', height: '17px', accentColor: '#43A047', cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--cal-text-main)' }}>
                                  {td.text}
                                </span>
                                {td.googleTaskId && (
                                  <span
                                    style={{
                                      fontSize: '0.66rem',
                                      fontWeight: 800,
                                      padding: '1px 5px',
                                      borderRadius: '9999px',
                                      background: '#e0f2fe',
                                      color: '#0369a1'
                                    }}
                                  >
                                    ☁️
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--cal-text-sub)' }}>
                                {td.date ? `기한: ${td.date}` : '기한 없음'}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditingTodo(td)}
                              title="수정"
                              style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTodo(td.id)}
                              title="삭제"
                              style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings & Diagnostics Modal */}
      <CalendarSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        needsGoogleAuth={needsGoogleAuth}
        isLoggingIn={isLoggingIn}
        isInIframe={isInIframe}
        googleEmail={googleEmail}
        googleErrorMsg={googleErrorMsg}
        calendarList={calendarList}
        selectedCalendarIds={selectedCalendarIds}
        onChangeSelectedCalendarIds={setSelectedCalendarIds}
        taskLists={taskLists}
        selectedTaskListId={selectedTaskListId}
        onChangeSelectedTaskListId={setSelectedTaskListId}
        unsyncedLocalTodosCount={unsyncedLocalTodos.length}
        onGoogleLoginGIS={handleGoogleLoginGIS}
        onGoogleLogout={handleGoogleLogout}
        onRequestPushLocalTodos={handleRequestPushLocalTodos}
        gcalCalId={gcalCalId}
        onChangeGcalCalId={setGcalCalId}
        gcalApiKey={gcalApiKey}
        onChangeGcalApiKey={setGcalApiKey}
        gcalClientId={gcalClientId}
        onChangeGcalClientId={setGcalClientId}
        scriptUrl={scriptUrl}
        useGasCalendarSync={useGasCalendarSync}
        gasTasksSupported={gasTasksSupported}
        onConnectGas={handleConnectGas}
        onDisconnectGas={handleDisconnectGas}
        onCancelLogin={handleCancelLogin}
        onStartDirectOAuthRedirect={handleStartDirectOAuthRedirect}
        onSaveAndSync={handleSaveGoogleSettings}
      />

      {/* Event Edit Modal */}
      <EventEditModal
        key={editingEvent?.id || 'none'}
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        onSave={handleSaveEditedEvent}
      />

      {/* To-Do Edit Modal */}
      <TodoEditModal
        key={editingTodo?.id || 'none'}
        todo={editingTodo}
        onClose={() => setEditingTodo(null)}
        onSave={handleSaveEditedTodo}
      />

      {/* Explicit Confirmation Modal */}
      <GoogleConfirmModal
        confirmState={googleConfirm}
        isBusy={isConfirmBusy}
        onConfirm={async () => {
          if (!googleConfirm) return;
          setIsConfirmBusy(true);
          try {
            await googleConfirm.onConfirm();
          } finally {
            setIsConfirmBusy(false);
            setGoogleConfirm(null);
          }
        }}
        onSecondary={
          googleConfirm?.onSecondary
            ? () => {
                googleConfirm.onSecondary?.();
                setGoogleConfirm(null);
              }
            : undefined
        }
        onCancel={() => {
          if (!isConfirmBusy) setGoogleConfirm(null);
        }}
      />
    </div>
  );
};
