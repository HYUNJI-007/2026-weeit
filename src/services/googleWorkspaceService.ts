import { cleanDateStr, cleanTimeStr, pad2 } from '../utils/dateTime';

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/tasks'
];

const DEFAULT_GOOGLE_OAUTH_CLIENT_ID = (
  import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ||
  '843699697382-l4nbohu1kt0r7p3i482lr611m3f3jlpc.apps.googleusercontent.com'
).trim();

const REDIRECT_PENDING_KEY = 'wee_google_redirect_return';

let cachedAccessToken: string | null = null;
let authSource: 'gis' | 'direct-redirect' | null = null;
let cachedEmail: string | null = null;

export interface AuthAttemptDiag {
  method: 'gis-popup' | 'direct-oauth-redirect';
  startedAt: string;
  durationMs: number;
  outcome: 'success' | 'error';
  code?: string;
  message?: string;
}

let lastAuthAttempt: AuthAttemptDiag | null = null;
let activeAuthAbortFn: (() => void) | null = null;

export function cancelPendingGoogleLogin(): void {
  if (activeAuthAbortFn) {
    try {
      activeAuthAbortFn();
    } catch {
      // ignore
    }
    activeAuthAbortFn = null;
  }
}

export function isValidOAuthClientId(val?: string): boolean {
  return /\.apps\.googleusercontent\.com$/i.test((val || '').trim());
}

export function resolveOAuthClientId(customClientId?: string): string {
  const trimmed = (customClientId || '').trim();
  if (isValidOAuthClientId(trimmed)) {
    return trimmed;
  }
  return DEFAULT_GOOGLE_OAUTH_CLIENT_ID;
}

export function hasCustomOAuthClientId(customClientId?: string): boolean {
  return (
    isValidOAuthClientId(customClientId) ||
    isValidOAuthClientId(import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID)
  );
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (resp: {
              access_token?: string;
              error?: string;
              error_description?: string;
              scope?: string;
            }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => { requestAccessToken: (overrideConfig?: { prompt?: string }) => void };
          revoke?: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
  accessRole?: 'freeBusyReader' | 'reader' | 'writer' | 'owner' | string;
}

export interface GoogleTaskListEntry {
  id: string;
  title: string;
}

export interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status: 'needsAction' | 'completed';
  completed?: string;
  updated?: string;
  etag?: string;
}

export interface ParsedPublicCalendar {
  id: string;
  label: string;
  color?: string;
}

export interface NormalizedGoogleEvent {
  id: string;
  googleEventId: string;
  googleCalendarId: string;
  calendarLabel: string;
  title: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  color?: string;
  canEdit: boolean;
  htmlLink?: string;
  description?: string;
  location?: string;
}

export interface AuthEnvironmentDiag {
  origin: string;
  hostname: string;
  isInIframe: boolean;
  gisLoaded: boolean;
  hasToken: boolean;
  authSource: 'gis' | 'direct-redirect' | null;
  cachedEmail: string | null;
  localStorageAvailable: boolean;
  activeClientIdPrefix: string;
  lastAttempt: AuthAttemptDiag | null;
}

export interface ConnectionDiagReport {
  timestamp: string;
  env: AuthEnvironmentDiag;
  calendarListCheck: { status: 'ok' | 'error' | 'skipped'; detail: string };
  taskListsCheck: { status: 'ok' | 'error' | 'skipped'; detail: string };
  publicCalendarChecks: Array<{ id: string; label: string; status: 'ok' | 'error'; detail: string }>;
  gasBridgeCheck?: { status: 'ok' | 'error' | 'skipped'; detail: string };
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const cleaned = cleanDateStr(dateStr);
  if (!cleaned) return dateStr;
  const [y, m, d] = cleaned.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function getLocalIsoOffsetSuffix(): string {
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const hh = pad2(Math.floor(absMin / 60));
  const mm = pad2(absMin % 60);
  return `${sign}${hh}:${mm}`;
}

export function parsePublicCalendarConfig(raw: string): ParsedPublicCalendar[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const parts = entry.split(':').map(x => x.trim());
      const id = parts[0] || '';
      const label = parts[1] || '구글';
      const rawColor = parts[2] || '';
      const color = /^#[0-9a-fA-F]{3,8}$/.test(rawColor) ? rawColor : undefined;
      return { id, label, color };
    })
    .filter(item => !!item.id);
}

export function initGoogleOAuth(
  onAuthSuccess?: (token: string, email: string | null) => void,
  onAuthDisconnected?: () => void
): () => void {
  loadGisScript().catch(() => {});

  if (cachedAccessToken) {
    onAuthSuccess?.(cachedAccessToken, cachedEmail);
  } else {
    onAuthDisconnected?.();
  }

  return () => {};
}

function loadGisScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      let tries = 0;
      const timer = setInterval(() => {
        tries++;
        if (window.google?.accounts?.oauth2) {
          clearInterval(timer);
          resolve();
        } else if (tries > 30) {
          clearInterval(timer);
          reject(new Error('Google 로그인 스크립트를 불러오지 못했습니다.'));
        }
      }, 150);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
      } else {
        reject(new Error('Google Identity Services 초기화에 실패했습니다.'));
      }
    };
    script.onerror = () => reject(new Error('Google 로그인 스크립트 네트워크 로드 실패'));
    document.head.appendChild(script);
  });
}

export function consumeGoogleRedirectPending(): boolean {
  if (typeof window === 'undefined') return false;
  let pending = false;
  try {
    const raw = sessionStorage.getItem(REDIRECT_PENDING_KEY);
    if (raw) {
      sessionStorage.removeItem(REDIRECT_PENDING_KEY);
      const ts = Number(raw);
      if (Number.isFinite(ts) && Date.now() - ts < 10 * 60 * 1000) {
        pending = true;
      }
    }
  } catch {
    // ignore
  }
  const hash = window.location.hash || '';
  if (hash.includes('access_token=') || hash.includes('error=')) {
    pending = true;
  }
  return pending;
}

export function startDirectGoogleOAuthRedirect(customClientId?: string): void {
  const clientId = resolveOAuthClientId(customClientId);
  if (!isValidOAuthClientId(clientId)) {
    throw new Error('직접 OAuth 리다이렉트를 사용하려면 유효한 Google OAuth Client ID가 필요합니다.');
  }
  const state = `wee_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    sessionStorage.setItem('wee_direct_oauth_state', state);
    sessionStorage.setItem(REDIRECT_PENDING_KEY, String(Date.now()));
  } catch {
    // ignore
  }
  const redirectUri = `${window.location.origin}/`;
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=token` +
    `&scope=${encodeURIComponent(SCOPES.join(' '))}` +
    `&include_granted_scopes=true` +
    `&prompt=${encodeURIComponent('select_account consent')}` +
    `&state=${encodeURIComponent(state)}`;
  window.location.assign(authUrl);
}

export function consumeDirectOAuthHashResult(): {
  accessToken: string;
  via: 'direct-redirect';
  email: string | null;
} | null {
  if (typeof window === 'undefined' || !window.location.hash) return null;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash.includes('access_token=') && !hash.includes('error=')) return null;

  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const err = params.get('error');
  const errDesc = params.get('error_description');

  // Clean hash from URL immediately
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    sessionStorage.removeItem('wee_direct_oauth_state');
    sessionStorage.removeItem(REDIRECT_PENDING_KEY);
  } catch {
    // ignore
  }

  if (err) {
    const wrapped: any = new Error(errDesc || err);
    wrapped.code = `gis/${err}`;
    lastAuthAttempt = {
      method: 'direct-oauth-redirect',
      startedAt: new Date().toISOString(),
      durationMs: 0,
      outcome: 'error',
      code: wrapped.code,
      message: wrapped.message
    };
    throw wrapped;
  }

  if (accessToken) {
    cachedAccessToken = accessToken;
    authSource = 'direct-redirect';
    lastAuthAttempt = {
      method: 'direct-oauth-redirect',
      startedAt: new Date().toISOString(),
      durationMs: 0,
      outcome: 'success'
    };
    return { accessToken, via: 'direct-redirect', email: cachedEmail };
  }
  return null;
}

export function googleSignInWithGIS(customClientId?: string): Promise<{
  accessToken: string;
  via: 'gis';
  email: string | null;
}> {
  const clientId = resolveOAuthClientId(customClientId);
  if (!clientId) {
    return Promise.reject(new Error('Google OAuth Client ID가 설정되어 있지 않습니다.'));
  }

  const startedAt = new Date().toISOString();
  const openedAt = Date.now();

  const runTokenClient = (
    resolve: (v: { accessToken: string; via: 'gis'; email: string | null }) => void,
    reject: (e: any) => void
  ) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      reject(new Error('Google OAuth2 클라이언트를 사용할 수 없습니다.'));
      return;
    }

    let settled = false;
    let focusWatchTimer: number | null = null;
    let safetyTimer: number | null = null;

    const cleanup = () => {
      if (focusWatchTimer !== null) {
        window.clearTimeout(focusWatchTimer);
        focusWatchTimer = null;
      }
      if (safetyTimer !== null) {
        window.clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      window.removeEventListener('focus', onWindowFocus);
      activeAuthAbortFn = null;
    };

    const finishError = (err: any) => {
      if (settled) return;
      settled = true;
      cleanup();
      lastAuthAttempt = {
        method: 'gis-popup',
        startedAt,
        durationMs: Date.now() - openedAt,
        outcome: 'error',
        code: String(err?.code || 'unknown'),
        message: String(err?.message || '')
      };
      reject(err);
    };

    const onWindowFocus = () => {
      // Give GIS up to 2.5s after focus returns to deliver token/error_callback
      if (focusWatchTimer !== null) window.clearTimeout(focusWatchTimer);
      focusWatchTimer = window.setTimeout(() => {
        if (!settled && Date.now() - openedAt > 1200) {
          const err: any = new Error(
            '로그인 창에서 토큰이 전달되지 않고 창이 닫혔습니다. 브라우저 팝업 차단 또는 서드파티 쿠키 설정을 확인해 주세요.'
          );
          err.code = 'gis/popup-closed';
          err.elapsedMs = Date.now() - openedAt;
          finishError(err);
        }
      }, 2500);
    };

    activeAuthAbortFn = () => {
      const err: any = new Error('사용자가 Google 로그인 대기 상태를 취소했습니다.');
      err.code = 'gis/user-cancelled';
      finishError(err);
    };

    safetyTimer = window.setTimeout(() => {
      const err: any = new Error('Google 로그인 응답 시간이 초과되었습니다 (60초).');
      err.code = 'gis/timeout';
      finishError(err);
    }, 60000);

    window.addEventListener('focus', onWindowFocus);

    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES.join(' '),
      callback: (resp) => {
        if (settled) return;
        if (resp.error) {
          const errObj: any = new Error(resp.error_description || resp.error);
          errObj.code = `gis/${resp.error}`;
          finishError(errObj);
          return;
        }
        if (!resp.access_token) {
          finishError(new Error('Google 액세스 토큰을 받지 못했습니다.'));
          return;
        }
        settled = true;
        cleanup();
        cachedAccessToken = resp.access_token;
        authSource = 'gis';
        lastAuthAttempt = {
          method: 'gis-popup',
          startedAt,
          durationMs: Date.now() - openedAt,
          outcome: 'success'
        };
        resolve({
          accessToken: resp.access_token,
          via: 'gis',
          email: cachedEmail
        });
      },
      error_callback: (err) => {
        const elapsedMs = Date.now() - openedAt;
        const rawType = err?.type || 'unknown';
        const wrapped: any = new Error(err?.message || rawType);
        if (rawType === 'popup_failed_to_open') {
          wrapped.code = 'gis/popup-blocked';
        } else if (rawType === 'popup_closed') {
          wrapped.code = 'gis/popup-closed';
          wrapped.elapsedMs = elapsedMs;
        } else {
          wrapped.code = `gis/${rawType}`;
        }
        finishError(wrapped);
      }
    });

    try {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (syncErr) {
      finishError(syncErr);
    }
  };

  if (window.google?.accounts?.oauth2) {
    return new Promise((resolve, reject) => runTokenClient(resolve, reject));
  }

  return loadGisScript().then(
    () => new Promise((resolve, reject) => runTokenClient(resolve, reject))
  );
}

export function formatGoogleAuthError(err: any): {
  message: string;
  isPopupBlocked: boolean;
  isCancelled: boolean;
} {
  const code = String(err?.code || '');
  const rawMsg = String(err?.message || '');
  const elapsedMs = typeof err?.elapsedMs === 'number' ? err.elapsedMs : null;

  if (code === 'gis/popup-closed') {
    const instantHint =
      elapsedMs !== null && elapsedMs < 1200
        ? `팝업이 열리자마자 닫혔습니다 (${elapsedMs}ms). 브라우저 팝업 차단 또는 확장프로그램 간섭을 확인해 주세요.`
        : '팝업에서 로그인 완료 전 창이 닫혔거나, Chrome 서드파티 쿠키 차단으로 토큰 전달이 중단되었습니다.';
    return {
      message: `Google OAuth 직접 연결이 완료되지 않았습니다 (${code}). ${instantHint}`,
      isPopupBlocked: false,
      isCancelled: true
    };
  }
  if (code === 'gis/popup-blocked') {
    return {
      message:
        '브라우저에서 Google OAuth 팝업이 차단되었습니다 (gis/popup-blocked). 주소창 오른쪽 팝업 차단을 허용한 뒤 다시 시도해 주세요.',
      isPopupBlocked: true,
      isCancelled: false
    };
  }
  if (code === 'gis/user-cancelled') {
    return {
      message: 'Google OAuth 로그인 대기를 취소했습니다.',
      isPopupBlocked: false,
      isCancelled: true
    };
  }
  if (code === 'gis/timeout') {
    return {
      message: 'Google OAuth 로그인 응답 시간이 초과되었습니다 (60초). 다시 시도해 주세요.',
      isPopupBlocked: false,
      isCancelled: true
    };
  }
  if (code === 'gis/access_denied') {
    return {
      message:
        'Google 권한 승인이 거부되었거나 테스트 허용되지 않은 계정입니다 (gis/access_denied). 허용된 Google 계정으로 로그인했는지 확인해 주세요.',
      isPopupBlocked: false,
      isCancelled: false
    };
  }

  return {
    message: `Google OAuth 연결 실패 (${code ? `${code}: ` : ''}${rawMsg || '알 수 없는 오류'})`,
    isPopupBlocked: false,
    isCancelled: false
  };
}

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export function clearAccessToken(): void {
  cachedAccessToken = null;
  authSource = null;
}

export function getCachedGoogleEmail(): string | null {
  return cachedEmail;
}

export async function logoutGoogle(): Promise<void> {
  const tokenToRevoke = cachedAccessToken;
  cachedAccessToken = null;
  authSource = null;
  cachedEmail = null;
  if (tokenToRevoke && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(tokenToRevoke);
    } catch {
      // ignore
    }
  }
}

export function getAuthDiagnostics(customClientId?: string): AuthEnvironmentDiag {
  let localStorageAvailable = false;
  try {
    const k = '__wee_test_ls__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    localStorageAvailable = true;
  } catch {
    localStorageAvailable = false;
  }

  const resolvedId = resolveOAuthClientId(customClientId);

  return {
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    hostname: typeof window !== 'undefined' ? window.location.hostname : '',
    isInIframe: typeof window !== 'undefined' && window.self !== window.top,
    gisLoaded: typeof window !== 'undefined' && !!window.google?.accounts?.oauth2,
    hasToken: !!cachedAccessToken,
    authSource,
    cachedEmail,
    localStorageAvailable,
    activeClientIdPrefix: resolvedId ? resolvedId.slice(0, 22) + '...' : 'none',
    lastAttempt: lastAuthAttempt
  };
}

async function googleFetch(url: string, accessToken: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    cachedAccessToken = null;
    authSource = null;
    throw new Error('GOOGLE_TOKEN_EXPIRED');
  }

  if (!res.ok) {
    let errMsg = res.statusText;
    try {
      const errJson = await res.json();
      errMsg = errJson?.error?.message || JSON.stringify(errJson);
      if (res.status === 403) {
        if (/has not been used in project|is disabled/i.test(errMsg)) {
          errMsg = `Google Cloud 프로젝트에서 해당 API(Calendar/Tasks API)가 아직 활성화되지 않았습니다. (${errMsg})`;
        } else if (/insufficient|permission|scope/i.test(errMsg)) {
          errMsg = `Google 로그인 동의 화면에서 캘린더/할 일 권한 체크박스가 모두 허용되지 않았습니다. 다시 로그인해 모든 권한을 체크해 주세요. (${errMsg})`;
        }
      }
    } catch {
      errMsg = (await res.text().catch(() => '')) || res.statusText;
    }
    throw new Error(`Google API 오류 (${res.status}): ${errMsg}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

function normalizeGoogleCalendarEvent(
  ev: any,
  calendarId: string,
  calendarLabel: string,
  canEdit: boolean,
  customColor?: string
): NormalizedGoogleEvent | null {
  const startRaw = ev.start?.dateTime || ev.start?.date || '';
  const endRaw = ev.end?.dateTime || ev.end?.date || '';
  if (!startRaw) return null;

  const isAllDay = !ev.start?.dateTime;
  const startDate = cleanDateStr(startRaw);
  if (!startDate) return null;

  let finalEndDate: string | undefined;
  if (isAllDay) {
    const rawEndD = endRaw ? cleanDateStr(endRaw) : startDate;
    if (rawEndD && rawEndD > startDate) {
      const inclusiveEnd = addDaysToDateStr(rawEndD, -1);
      finalEndDate = inclusiveEnd > startDate ? inclusiveEnd : undefined;
    }
  } else if (endRaw) {
    const endDate = cleanDateStr(endRaw);
    if (endDate && endDate > startDate) {
      finalEndDate = endDate;
    }
  }

  const startTime = !isAllDay ? cleanTimeStr(startRaw) : undefined;
  const endTime = !isAllDay && endRaw ? cleanTimeStr(endRaw) : undefined;

  return {
    id: `gcal-${calendarId}-${ev.id}`,
    googleEventId: ev.id,
    googleCalendarId: calendarId,
    calendarLabel,
    title: `[${calendarLabel}] ${ev.summary || '(제목 없음)'}`,
    date: startDate,
    endDate: finalEndDate,
    startTime: startTime || undefined,
    endTime: endTime || undefined,
    allDay: isAllDay,
    color: customColor,
    canEdit,
    htmlLink: ev.htmlLink,
    description: ev.description,
    location: ev.location
  };
}

export async function fetchGoogleCalendarList(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const data = await googleFetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader',
    accessToken
  );
  const items: GoogleCalendarListEntry[] = Array.isArray(data?.items) ? data.items : [];
  const primaryCal = items.find(c => c.primary);
  if (primaryCal?.id && !cachedEmail && primaryCal.id.includes('@')) {
    cachedEmail = primaryCal.id;
  }
  return items;
}

export async function fetchGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<any[]> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId
  )}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(
    timeMax
  )}&singleEvents=true&orderBy=startTime&maxResults=250`;
  const data = await googleFetch(url, accessToken);
  return Array.isArray(data?.items) ? data.items : [];
}

export async function fetchNormalizedGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  calendarLabel: string,
  timeMin: string,
  timeMax: string,
  canEdit: boolean,
  customColor?: string
): Promise<NormalizedGoogleEvent[]> {
  const items = await fetchGoogleCalendarEvents(accessToken, calendarId, timeMin, timeMax);
  const result: NormalizedGoogleEvent[] = [];
  items.forEach((ev: any) => {
    const norm = normalizeGoogleCalendarEvent(ev, calendarId, calendarLabel, canEdit, customColor);
    if (norm) result.push(norm);
  });
  return result;
}

export async function fetchPublicGoogleCalendarEvents(
  calConfigRaw: string,
  apiKey: string,
  timeMin: string,
  timeMax: string
): Promise<{
  events: NormalizedGoogleEvent[];
  errors: string[];
  parsedCalendars: ParsedPublicCalendar[];
}> {
  const parsedCalendars = parsePublicCalendarConfig(calConfigRaw);
  const key = apiKey.trim();
  const events: NormalizedGoogleEvent[] = [];
  const errors: string[] = [];

  if (!key || parsedCalendars.length === 0) {
    return { events, errors, parsedCalendars };
  }

  for (const cal of parsedCalendars) {
    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        cal.id
      )}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(
        timeMax
      )}&singleEvents=true&orderBy=startTime&maxResults=250&key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          msg = j?.error?.message || msg;
        } catch {
          // ignore
        }
        errors.push(`[${cal.label}] ${msg}`);
        continue;
      }
      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      items.forEach((ev: any) => {
        const norm = normalizeGoogleCalendarEvent(ev, cal.id, cal.label, false, cal.color);
        if (norm) events.push(norm);
      });
    } catch (err: any) {
      errors.push(`[${cal.label}] ${err?.message || '네트워크 오류'}`);
    }
  }

  return { events, errors, parsedCalendars };
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  payload: {
    summary: string;
    allDay: boolean;
    startDate: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    description?: string;
  }
): Promise<any> {
  const body: any = {
    summary: payload.summary
  };
  if (payload.description) body.description = payload.description;

  if (payload.allDay) {
    const startD = payload.startDate;
    const inclusiveEnd = payload.endDate && payload.endDate >= startD ? payload.endDate : startD;
    const exclusiveEnd = addDaysToDateStr(inclusiveEnd, 1);
    body.start = { date: startD };
    body.end = { date: exclusiveEnd };
  } else {
    const offset = getLocalIsoOffsetSuffix();
    const startD = payload.startDate;
    const endD = payload.endDate && payload.endDate >= startD ? payload.endDate : startD;
    const st = payload.startTime || '09:00';
    const et = payload.endTime || '10:00';
    body.start = { dateTime: `${startD}T${st}:00${offset}`, timeZone: 'Asia/Seoul' };
    body.end = { dateTime: `${endD}T${et}:00${offset}`, timeZone: 'Asia/Seoul' };
  }

  return googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(body)
    }
  );
}

export async function updateGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  updates: {
    summary?: string;
    allDay: boolean;
    startDate: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
  }
): Promise<any> {
  const body: any = {};
  if (updates.summary !== undefined) body.summary = updates.summary;

  if (updates.allDay) {
    const startD = updates.startDate;
    const inclusiveEnd = updates.endDate && updates.endDate >= startD ? updates.endDate : startD;
    const exclusiveEnd = addDaysToDateStr(inclusiveEnd, 1);
    body.start = { date: startD, dateTime: null };
    body.end = { date: exclusiveEnd, dateTime: null };
  } else {
    const offset = getLocalIsoOffsetSuffix();
    const startD = updates.startDate;
    const endD = updates.endDate && updates.endDate >= startD ? updates.endDate : startD;
    const st = updates.startTime || '09:00';
    const et = updates.endTime || '10:00';
    body.start = { dateTime: `${startD}T${st}:00${offset}`, date: null, timeZone: 'Asia/Seoul' };
    body.end = { dateTime: `${endD}T${et}:00${offset}`, date: null, timeZone: 'Asia/Seoul' };
  }

  return googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events/${encodeURIComponent(eventId)}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify(body)
    }
  );
}

export async function deleteGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events/${encodeURIComponent(eventId)}`,
    accessToken,
    {
      method: 'DELETE'
    }
  );
}

export async function fetchGoogleTaskLists(accessToken: string): Promise<GoogleTaskListEntry[]> {
  const data = await googleFetch(
    'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
    accessToken
  );
  return Array.isArray(data?.items) ? data.items : [];
}

export async function fetchGoogleTasks(
  accessToken: string,
  taskListId = '@default'
): Promise<GoogleTaskItem[]> {
  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
    taskListId
  )}/tasks?showCompleted=true&showHidden=true&maxResults=100`;
  const data = await googleFetch(url, accessToken);
  return Array.isArray(data?.items) ? data.items : [];
}

export async function createGoogleTask(
  accessToken: string,
  taskListId: string,
  payload: { title: string; notes?: string; dueDate?: string }
): Promise<GoogleTaskItem> {
  const body: any = {
    title: payload.title,
    status: 'needsAction'
  };
  if (payload.notes) body.notes = payload.notes;
  if (payload.dueDate) body.due = `${payload.dueDate}T00:00:00.000Z`;

  return googleFetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(body)
    }
  );
}

export async function updateGoogleTask(
  accessToken: string,
  taskListId: string,
  taskId: string,
  updates: { title?: string; notes?: string; dueDate?: string; done?: boolean }
): Promise<GoogleTaskItem> {
  const body: any = {};
  if (updates.title !== undefined) body.title = updates.title;
  if (updates.notes !== undefined) body.notes = updates.notes;
  if (updates.dueDate !== undefined) {
    body.due = updates.dueDate ? `${updates.dueDate}T00:00:00.000Z` : null;
  }
  if (updates.done !== undefined) {
    body.status = updates.done ? 'completed' : 'needsAction';
    if (!updates.done) {
      body.completed = null;
    }
  }

  return googleFetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(
      taskId
    )}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify(body)
    }
  );
}

export async function deleteGoogleTask(
  accessToken: string,
  taskListId: string,
  taskId: string
): Promise<void> {
  await googleFetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(
      taskId
    )}`,
    accessToken,
    {
      method: 'DELETE'
    }
  );
}

// =========================================================================
// Google Apps Script (GAS) Bridge — 100% Cookie-Free & Popup-Free Fallback
// =========================================================================

export interface GasCalendarAndTasksResult {
  calendars: GoogleCalendarListEntry[];
  events: NormalizedGoogleEvent[];
  taskLists: GoogleTaskListEntry[];
  tasks: Array<GoogleTaskItem & { taskListId: string }>;
  tasksSupported: boolean;
  tasksError?: string;
}

export async function fetchGasCalendarAndTasks(
  scriptUrl: string,
  timeMin: string,
  timeMax: string
): Promise<GasCalendarAndTasksResult> {
  const url = (scriptUrl || '').trim();
  if (!url) {
    throw new Error('Google Apps Script 웹 앱 URL이 설정되어 있지 않습니다.');
  }
  const sep = url.includes('?') ? '&' : '?';
  const endpoint = `${url}${sep}action=getCalendarAndTasks&timeMin=${encodeURIComponent(
    timeMin
  )}&timeMax=${encodeURIComponent(timeMax)}`;

  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`Apps Script 응답 오류 (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (Array.isArray(data)) {
    const err: any = new Error(
      '현재 연결된 Google Apps Script URL이 구버전(시트 전용)입니다. 상단 [설정] → [구글 스프레드시트 배포 스크립트 (GAS)] 탭에서 최신 코드를 복사해 새 배포로 업데이트해 주세요.'
    );
    err.code = 'GAS_CALENDAR_NOT_INSTALLED';
    throw err;
  }
  if (!data || !data.ok) {
    throw new Error(data?.message || 'Apps Script에서 캘린더/할 일 데이터를 불러오지 못했습니다.');
  }

  const calendars: GoogleCalendarListEntry[] = Array.isArray(data.calendars) ? data.calendars : [];
  const rawEvents: any[] = Array.isArray(data.events) ? data.events : [];
  const events: NormalizedGoogleEvent[] = [];

  rawEvents.forEach((ev: any) => {
    const calId = String(ev.calendarId || 'primary');
    const calLabel = String(ev.calendarLabel || '구글');
    const canEdit = ev.canEdit !== false;
    const norm = normalizeGoogleCalendarEvent(ev, calId, calLabel, canEdit, ev.color);
    if (norm) events.push(norm);
  });

  const taskLists: GoogleTaskListEntry[] = Array.isArray(data.taskLists) ? data.taskLists : [];
  const tasks: Array<GoogleTaskItem & { taskListId: string }> = Array.isArray(data.tasks)
    ? data.tasks
    : [];

  return {
    calendars,
    events,
    taskLists,
    tasks,
    tasksSupported: !!data.tasksSupported,
    tasksError: data.tasksError
  };
}

async function postGasAction(scriptUrl: string, payload: Record<string, any>): Promise<any> {
  const url = (scriptUrl || '').trim();
  if (!url) {
    throw new Error('Google Apps Script 웹 앱 URL이 설정되어 있지 않습니다.');
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error(`Apps Script 요청 오류 (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (!data || !data.success) {
    throw new Error(data?.message || 'Apps Script 작업 처리에 실패했습니다.');
  }
  return data;
}

export async function createGasCalendarEvent(
  scriptUrl: string,
  calendarId: string,
  payload: {
    summary: string;
    allDay: boolean;
    startDate: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
  }
): Promise<any> {
  return postGasAction(scriptUrl, {
    action: 'createCalendarEvent',
    calendarId,
    ...payload
  });
}

export async function updateGasCalendarEvent(
  scriptUrl: string,
  calendarId: string,
  eventId: string,
  updates: {
    summary?: string;
    allDay: boolean;
    startDate: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
  }
): Promise<any> {
  return postGasAction(scriptUrl, {
    action: 'updateCalendarEvent',
    calendarId,
    eventId,
    ...updates
  });
}

export async function deleteGasCalendarEvent(
  scriptUrl: string,
  calendarId: string,
  eventId: string
): Promise<any> {
  return postGasAction(scriptUrl, {
    action: 'deleteCalendarEvent',
    calendarId,
    eventId
  });
}

export async function createGasTask(
  scriptUrl: string,
  taskListId: string,
  payload: { title: string; notes?: string; dueDate?: string }
): Promise<GoogleTaskItem> {
  const res = await postGasAction(scriptUrl, {
    action: 'createTask',
    taskListId: taskListId || '@default',
    ...payload
  });
  return res.task;
}

export async function updateGasTask(
  scriptUrl: string,
  taskListId: string,
  taskId: string,
  updates: { title?: string; notes?: string; dueDate?: string; done?: boolean }
): Promise<GoogleTaskItem> {
  const res = await postGasAction(scriptUrl, {
    action: 'updateTask',
    taskListId: taskListId || '@default',
    taskId,
    ...updates
  });
  return res.task;
}

export async function deleteGasTask(
  scriptUrl: string,
  taskListId: string,
  taskId: string
): Promise<any> {
  return postGasAction(scriptUrl, {
    action: 'deleteTask',
    taskListId: taskListId || '@default',
    taskId
  });
}

export async function runConnectionDiagnostics(options: {
  calIdRaw: string;
  apiKey: string;
  customClientId?: string;
  scriptUrl?: string;
}): Promise<ConnectionDiagReport> {
  const env = getAuthDiagnostics(options.customClientId);
  const token = cachedAccessToken;
  let calendarListCheck: ConnectionDiagReport['calendarListCheck'] = {
    status: 'skipped',
    detail: 'OAuth 로그인 토큰 없음'
  };
  let taskListsCheck: ConnectionDiagReport['taskListsCheck'] = {
    status: 'skipped',
    detail: 'OAuth 로그인 토큰 없음'
  };

  if (token) {
    try {
      const cals = await fetchGoogleCalendarList(token);
      calendarListCheck = {
        status: 'ok',
        detail: `성공 (${cals.length}개 캘린더 접근 가능)`
      };
    } catch (e: any) {
      calendarListCheck = {
        status: 'error',
        detail: e?.message || 'Calendar API 오류'
      };
    }

    try {
      const tlists = await fetchGoogleTaskLists(token);
      taskListsCheck = {
        status: 'ok',
        detail: `성공 (${tlists.length}개 할 일 목록 접근 가능)`
      };
    } catch (e: any) {
      taskListsCheck = {
        status: 'error',
        detail: e?.message || 'Tasks API 오류'
      };
    }
  }

  const publicCalendarChecks: ConnectionDiagReport['publicCalendarChecks'] = [];
  const parsed = parsePublicCalendarConfig(options.calIdRaw);
  const key = options.apiKey.trim();

  if (key && parsed.length > 0) {
    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
    for (const cal of parsed) {
      try {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            cal.id
          )}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(
            timeMax
          )}&singleEvents=true&maxResults=5&key=${encodeURIComponent(key)}`
        );
        if (res.ok) {
          const data = await res.json();
          publicCalendarChecks.push({
            id: cal.id,
            label: cal.label,
            status: 'ok',
            detail: `200 OK (${data?.summary || cal.label}, 이번 달 ${Array.isArray(data?.items) ? data.items.length : 0}건+)`
          });
        } else {
          let errMsg = `HTTP ${res.status}`;
          try {
            const j = await res.json();
            errMsg = j?.error?.message || errMsg;
          } catch {}
          publicCalendarChecks.push({
            id: cal.id,
            label: cal.label,
            status: 'error',
            detail: errMsg
          });
        }
      } catch (e: any) {
        publicCalendarChecks.push({
          id: cal.id,
          label: cal.label,
          status: 'error',
          detail: e?.message || '네트워크 오류'
        });
      }
    }
  }

  let gasBridgeCheck: ConnectionDiagReport['gasBridgeCheck'] = {
    status: 'skipped',
    detail: 'Apps Script URL 없음'
  };
  if (options.scriptUrl && options.scriptUrl.trim()) {
    try {
      const now = new Date();
      const tMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const tMax = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
      const gasRes = await fetchGasCalendarAndTasks(options.scriptUrl.trim(), tMin, tMax);
      gasBridgeCheck = {
        status: 'ok',
        detail: `연동 준비 완료 (캘린더 ${gasRes.calendars.length}개 · 일정 ${gasRes.events.length}건 · Tasks ${gasRes.tasksSupported ? `${gasRes.tasks.length}건` : '서비스 미활성'})`
      };
    } catch (e: any) {
      gasBridgeCheck = {
        status: 'error',
        detail: e?.message || 'Apps Script 미지원'
      };
    }
  }

  return {
    timestamp: new Date().toLocaleTimeString('ko-KR'),
    env,
    calendarListCheck,
    taskListsCheck,
    publicCalendarChecks,
    gasBridgeCheck
  };
}
