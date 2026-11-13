import React, { useState } from 'react';
import {
  GoogleCalendarListEntry,
  GoogleTaskListEntry,
  ConnectionDiagReport,
  runConnectionDiagnostics,
  getAuthDiagnostics,
  hasCustomOAuthClientId
} from '../services/googleWorkspaceService';

export interface GoogleConfirmState {
  title: string;
  description: string;
  confirmLabel: string;
  secondaryLabel?: string;
  onConfirm: () => Promise<void> | void;
  onSecondary?: () => void;
}

export interface EditableCalendarEvent {
  id: string;
  title: string;
  rawTitle: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  category: string;
  source?: 'counseling' | 'custom' | 'google';
  googleCalendarId?: string;
  googleEventId?: string;
}

export interface EditableTodoItem {
  id: string;
  text: string;
  detail?: string;
  date: string;
  done: boolean;
  googleTaskId?: string;
  googleTaskListId?: string;
}

interface CalendarSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  needsGoogleAuth: boolean;
  isLoggingIn: boolean;
  isInIframe: boolean;
  googleEmail: string | null;
  googleErrorMsg: string | null;
  calendarList: GoogleCalendarListEntry[];
  selectedCalendarIds: string[];
  onChangeSelectedCalendarIds: (ids: string[]) => void;
  taskLists: GoogleTaskListEntry[];
  selectedTaskListId: string;
  onChangeSelectedTaskListId: (id: string) => void;
  unsyncedLocalTodosCount: number;
  onGoogleLoginGIS: () => void;
  onGoogleLogout: () => void;
  onRequestPushLocalTodos: () => void;
  gcalCalId: string;
  onChangeGcalCalId: (val: string) => void;
  gcalApiKey: string;
  onChangeGcalApiKey: (val: string) => void;
  gcalClientId: string;
  onChangeGcalClientId: (val: string) => void;
  scriptUrl?: string;
  useGasCalendarSync: boolean;
  gasTasksSupported: boolean;
  onConnectGas: () => void;
  onDisconnectGas: () => void;
  onCancelLogin: () => void;
  onStartDirectOAuthRedirect: () => void;
  onSaveAndSync: () => void;
}

export const CalendarSettingsModal: React.FC<CalendarSettingsModalProps> = ({
  isOpen,
  onClose,
  needsGoogleAuth,
  isLoggingIn,
  isInIframe,
  googleEmail,
  googleErrorMsg,
  calendarList,
  selectedCalendarIds,
  onChangeSelectedCalendarIds,
  taskLists,
  selectedTaskListId,
  onChangeSelectedTaskListId,
  unsyncedLocalTodosCount,
  onGoogleLoginGIS,
  onGoogleLogout,
  onRequestPushLocalTodos,
  gcalCalId,
  onChangeGcalCalId,
  gcalApiKey,
  onChangeGcalApiKey,
  gcalClientId,
  onChangeGcalClientId,
  scriptUrl,
  useGasCalendarSync,
  gasTasksSupported,
  onConnectGas,
  onDisconnectGas,
  onCancelLogin,
  onStartDirectOAuthRedirect,
  onSaveAndSync
}) => {
  const [diagReport, setDiagReport] = useState<ConnectionDiagReport | null>(null);
  const [isRunningDiag, setIsRunningDiag] = useState(false);

  if (!isOpen) return null;

  const envDiag = getAuthDiagnostics(gcalClientId);
  const hasValidCustomClientId = hasCustomOAuthClientId(gcalClientId);
  const displayAccount =
    googleEmail ||
    calendarList.find(c => c.primary)?.id ||
    'Google 계정';

  const handleRunDiagnostics = async () => {
    setIsRunningDiag(true);
    try {
      const report = await runConnectionDiagnostics({
        calIdRaw: gcalCalId,
        apiKey: gcalApiKey,
        customClientId: gcalClientId,
        scriptUrl
      });
      setDiagReport(report);
    } finally {
      setIsRunningDiag(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          padding: '24px 28px',
          maxWidth: '580px',
          width: '92%',
          boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
          maxHeight: '88vh',
          overflowY: 'auto'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'var(--cal-text-main)' }}>
            ⚙️ 구글 캘린더 & TODO 연동 설정
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--cal-text-sub)' }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: '0.83rem', color: 'var(--cal-text-sub)', lineHeight: 1.5, marginBottom: '14px' }}>
          Google 계정으로 로그인하면 내 <strong>Google Calendar</strong> 일정(조회·등록·수정·삭제·이동)과 <strong>Google Tasks(할 일)</strong>를 달력 및 TODO 패널과 양방향으로 연동할 수 있습니다.
        </p>

        {/* Google Account Auth Section */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px', marginBottom: '14px' }}>
          <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--cal-text-main)', marginBottom: '10px' }}>
            ☁️ Google OAuth 직접 연결 (Calendar &amp; Tasks)
          </div>

          {needsGoogleAuth ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="gsi-material-button"
                  onClick={onGoogleLoginGIS}
                  disabled={isLoggingIn}
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

                {hasValidCustomClientId && !isInIframe && (
                  <button
                    type="button"
                    onClick={onStartDirectOAuthRedirect}
                    disabled={isLoggingIn}
                    style={{
                      background: '#f0fdf4',
                      border: '1px solid #86efac',
                      color: '#166534',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      padding: '9px 14px',
                      borderRadius: '9999px',
                      cursor: 'pointer'
                    }}
                  >
                    🔗 OAuth 리다이렉트 연결 (쿠키 불필요)
                  </button>
                )}

                {isLoggingIn && (
                  <button
                    type="button"
                    onClick={onCancelLogin}
                    style={{
                      background: '#fef2f2',
                      border: '1px solid #fca5a5',
                      color: '#b91c1c',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      padding: '9px 14px',
                      borderRadius: '9999px',
                      cursor: 'pointer'
                    }}
                  >
                    ✕ 로그인 대기 취소
                  </button>
                )}

                {isInIframe && (
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      color: '#1d4ed8',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      padding: '9px 14px',
                      borderRadius: '9999px',
                      textDecoration: 'none'
                    }}
                  >
                    새 탭에서 열어 연동하기 ↗
                  </a>
                )}
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--cal-text-sub)', lineHeight: 1.5 }}>
                • Firebase 없이 <strong>Google OAuth 2.0 직접 연결</strong>로 내 비공개 캘린더와 Google Tasks(할 일)를 동기화합니다.
                <br />• &quot;확인하지 않은 앱&quot; 화면이 뜨면 <strong>고급 → 이동</strong>을 누른 뒤 권한을 모두 체크해 주세요.
                <br />• Chrome 서드파티 쿠키 차단으로 팝업 토큰 전달이 막힐 때는 아래 <strong>[고급 설정]</strong>에 본인 OAuth Client ID를 넣어 <strong>[OAuth 리다이렉트 연결]</strong>을 쓰거나 <strong>[Apps Script 브릿지]</strong>를 이용할 수 있습니다.
              </div>

              {googleErrorMsg && (
                <div style={{ width: '100%', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 12px', fontSize: '0.78rem', color: '#991b1b', fontWeight: 700, lineHeight: 1.45 }}>
                  ⚠️ {googleErrorMsg}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#047857' }}>
                  ✅ 연결된 계정: {displayAccount}
                </div>
                <button
                  type="button"
                  onClick={onGoogleLogout}
                  style={{
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    cursor: 'pointer'
                  }}
                >
                  연결 해제
                </button>
              </div>

              {/* Select Google Task List */}
              {taskLists.length > 0 && (
                <div className="input-group">
                  <label>연동할 Google Tasks(할 일) 목록</label>
                  <select
                    value={selectedTaskListId}
                    onChange={e => onChangeSelectedTaskListId(e.target.value)}
                    style={{ height: '36px', fontSize: '0.82rem' }}
                  >
                    <option value="@all">🍀 모든 할 일 목록 (전체 연동)</option>
                    {taskLists.map(tl => (
                      <option key={tl.id} value={tl.id}>
                        📋 {tl.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Select Google Calendars */}
              {calendarList.length > 0 && (
                <div className="input-group">
                  <label>표시할 Google 캘린더 선택</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto', background: '#fff', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    {calendarList.map(cal => {
                      const checked =
                        selectedCalendarIds.includes(cal.id) ||
                        (cal.primary && selectedCalendarIds.includes('primary'));
                      const isWritable = cal.accessRole === 'owner' || cal.accessRole === 'writer';
                      return (
                        <label key={cal.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--cal-text-main)' }}>
                          <input
                            type="checkbox"
                            checked={!!checked}
                            onChange={e => {
                              const next = e.target.checked
                                ? Array.from(new Set([...selectedCalendarIds.filter(id => !(cal.primary && id === 'primary')), cal.id]))
                                : selectedCalendarIds.filter(id => id !== cal.id && !(cal.primary && id === 'primary'));
                              onChangeSelectedCalendarIds(next.length > 0 ? next : ['primary']);
                            }}
                            style={{ width: '15px', height: '15px' }}
                          />
                          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: cal.backgroundColor || '#3b82f6', flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, flex: 1 }}>
                            {cal.summary}
                            {cal.primary ? ' (기본)' : ''}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: isWritable ? '#047857' : '#64748b', fontWeight: 700 }}>
                            {isWritable ? '편집가능' : '읽기전용'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {unsyncedLocalTodosCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRequestPushLocalTodos();
                  }}
                  style={{
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    color: '#1d4ed8',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    padding: '8px 12px',
                    borderRadius: '10px',
                    cursor: 'pointer'
                  }}
                >
                  ☁️ 미연동 로컬 To Do {unsyncedLocalTodosCount}건 Google Tasks에 등록
                </button>
              )}
            </div>
          )}
        </div>

        {/* Google Apps Script (GAS) Bridge Section — Cookie-Free & Popup-Free */}
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px', padding: '14px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#14532d' }}>
              🚀 Apps Script(GAS)로 캘린더 &amp; TODO 연동 (서드파티 쿠키·팝업 불필요)
            </div>
            {useGasCalendarSync && (
              <span style={{ fontSize: '0.7rem', fontWeight: 800, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '9999px', border: '1px solid #86efac' }}>
                ✅ 활성
              </span>
            )}
          </div>

          <p style={{ fontSize: '0.75rem', color: '#166534', lineHeight: 1.5, margin: '0 0 10px 0' }}>
            Chrome 브라우저 보안 정책으로 Google OAuth 로그인이 막힐 때, 기존 스프레드시트 연동에 쓰는 <strong>Apps Script 웹 앱 URL</strong>을 통해 쿠키·팝업 없이 캘린더와 할 일을 바로 동기화합니다.
          </p>

          {!useGasCalendarSync ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
              <button
                type="button"
                onClick={onConnectGas}
                disabled={!scriptUrl?.trim()}
                style={{
                  background: scriptUrl?.trim() ? '#15803d' : '#cbd5e1',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  padding: '8px 14px',
                  borderRadius: '9999px',
                  cursor: scriptUrl?.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                🚀 Apps Script 브릿지로 연결하기
              </button>
              <div style={{ fontSize: '0.72rem', color: '#166534', lineHeight: 1.45 }}>
                {scriptUrl?.trim() ? (
                  <>
                    ※ 처음 연결 시 상단 <strong>[설정] → [구글 스프레드시트 배포 스크립트 (GAS)]</strong> 탭에서 최신 코드를 복사해 Apps Script <strong>[배포] → [새 배포]</strong>로 업데이트해 주세요.
                  </>
                ) : (
                  <>※ 먼저 상단 <strong>[설정]</strong>에서 Google Apps Script 웹 앱 URL을 입력해 주세요.</>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#15803d' }}>
                  ✅ Apps Script 브릿지 연결됨 ({gasTasksSupported ? '캘린더 + Tasks 활성' : '캘린더 활성 · Tasks API 미추가'})
                </div>
                <button
                  type="button"
                  onClick={onDisconnectGas}
                  style={{
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    cursor: 'pointer'
                  }}
                >
                  브릿지 해제
                </button>
              </div>

              {!gasTasksSupported && (
                <div style={{ fontSize: '0.72rem', color: '#854d0e', background: '#fefce8', border: '1px solid #fde047', borderRadius: '8px', padding: '7px 10px', lineHeight: 1.45 }}>
                  💡 Google Tasks(할 일)까지 함께 연동하려면 Apps Script 편집기 좌측 <strong>[서비스(+)] → Google Tasks API</strong>를 추가하고 [새 배포]로 업데이트하세요.
                </div>
              )}

              {needsGoogleAuth && taskLists.length > 0 && (
                <div className="input-group">
                  <label>연동할 Google Tasks(할 일) 목록</label>
                  <select
                    value={selectedTaskListId}
                    onChange={e => onChangeSelectedTaskListId(e.target.value)}
                    style={{ height: '36px', fontSize: '0.82rem' }}
                  >
                    <option value="@all">🍀 모든 할 일 목록 (전체 연동)</option>
                    {taskLists.map(tl => (
                      <option key={tl.id} value={tl.id}>
                        📋 {tl.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {needsGoogleAuth && calendarList.length > 0 && (
                <div className="input-group">
                  <label>표시할 Google 캘린더 선택</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '130px', overflowY: 'auto', background: '#fff', padding: '8px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                    {calendarList.map(cal => {
                      const checked =
                        selectedCalendarIds.includes(cal.id) ||
                        (cal.primary && selectedCalendarIds.includes('primary'));
                      const isWritable = cal.accessRole === 'owner' || cal.accessRole === 'writer';
                      return (
                        <label key={cal.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--cal-text-main)' }}>
                          <input
                            type="checkbox"
                            checked={!!checked}
                            onChange={e => {
                              const next = e.target.checked
                                ? Array.from(new Set([...selectedCalendarIds.filter(id => !(cal.primary && id === 'primary')), cal.id]))
                                : selectedCalendarIds.filter(id => id !== cal.id && !(cal.primary && id === 'primary'));
                              onChangeSelectedCalendarIds(next.length > 0 ? next : ['primary']);
                            }}
                            style={{ width: '15px', height: '15px' }}
                          />
                          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: cal.backgroundColor || '#3b82f6', flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, flex: 1 }}>
                            {cal.summary}
                            {cal.primary ? ' (기본)' : ''}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: isWritable ? '#047857' : '#64748b', fontWeight: 700 }}>
                            {isWritable ? '편집가능' : '읽기전용'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {needsGoogleAuth && gasTasksSupported && unsyncedLocalTodosCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRequestPushLocalTodos();
                  }}
                  style={{
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    color: '#1d4ed8',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    padding: '8px 12px',
                    borderRadius: '10px',
                    cursor: 'pointer'
                  }}
                >
                  ☁️ 미연동 로컬 To Do {unsyncedLocalTodosCount}건 Google Tasks에 등록
                </button>
              )}
            </div>
          )}
        </div>

        {/* Advanced Settings: Public Calendar ID / API Key / Optional Client ID */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <details
            open={!!(gcalCalId || gcalApiKey || gcalClientId)}
            style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px' }}
          >
            <summary style={{ cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, color: 'var(--cal-text-sub)' }}>
              고급 설정: Google OAuth Client ID / 공개 캘린더 ID · API Key
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
              <div className="input-group">
                <label>구글 캘린더 ID (형식: ID:별칭:#색상, 쉼표로 구분)</label>
                <textarea
                  value={gcalCalId}
                  onChange={e => onChangeGcalCalId(e.target.value)}
                  placeholder="예: xxx@group.calendar.google.com:Wee:#AFB4FF, ko.south_korea#holiday@group.v.calendar.google.com:휴일"
                  style={{ height: '72px', fontSize: '0.79rem', fontFamily: 'monospace' }}
                />
              </div>
              <div className="input-group">
                <label>Google API Key (공개 캘린더 조회용)</label>
                <input
                  type="text"
                  value={gcalApiKey}
                  onChange={e => onChangeGcalApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  style={{ height: '38px', fontSize: '0.82rem', fontFamily: 'monospace' }}
                />
              </div>
              <div className="input-group">
                <label>사용자 지정 Google OAuth Client ID (선택사항 · 비워두면 기본 앱 설정 사용)</label>
                <input
                  type="text"
                  value={gcalClientId}
                  onChange={e => onChangeGcalClientId(e.target.value)}
                  placeholder="xxxx.apps.googleusercontent.com"
                  style={{ height: '38px', fontSize: '0.82rem', fontFamily: 'monospace' }}
                />
              </div>
            </div>
          </details>

          {/* Live Diagnostics */}
          <details style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, color: 'var(--cal-text-sub)' }}>
              🔍 연결 상태 진단 (로그인/API 오류 원인 확인)
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', fontSize: '0.75rem', color: '#334155' }}>
              <div>• 접속 주소: <code>{envDiag.origin}</code> ({envDiag.isInIframe ? 'iframe 임베드' : '독립 탭'})</div>
              <div>• 활성 Client ID: <code>{envDiag.activeClientIdPrefix}</code></div>
              <div>• GIS SDK 로드: {envDiag.gisLoaded ? '✅ 완료' : '⏳ 미로드'} · 로컬저장소: {envDiag.localStorageAvailable ? '✅ 가능' : '❌ 차단됨'}</div>
              <div>• 메모리 OAuth 토큰: {envDiag.hasToken ? `✅ 보유 (${envDiag.authSource || 'unknown'})` : '❌ 없음'} · Apps Script URL: {scriptUrl?.trim() ? '✅ 설정됨' : '❌ 미설정'}</div>
              {envDiag.lastAttempt && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
                  <div>• 최근 로그인 시도: <strong>{envDiag.lastAttempt.method}</strong> ({envDiag.lastAttempt.durationMs}ms) → {envDiag.lastAttempt.outcome}</div>
                  {envDiag.lastAttempt.code && <div>• 오류 코드: <code>{envDiag.lastAttempt.code}</code></div>}
                </div>
              )}

              <button
                type="button"
                onClick={handleRunDiagnostics}
                disabled={isRunningDiag}
                style={{
                  alignSelf: 'flex-start',
                  background: '#ffffff',
                  border: '1px solid #94a3b8',
                  color: '#0f172a',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  padding: '6px 12px',
                  borderRadius: '9999px',
                  cursor: 'pointer'
                }}
              >
                {isRunningDiag ? '진단 실행 중...' : '🔍 실시간 Google API 진단 실행'}
              </button>

              {diagReport && (
                <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px', lineHeight: 1.55 }}>
                  <div style={{ fontWeight: 800, marginBottom: '4px' }}>진단 결과 ({diagReport.timestamp})</div>
                  <div>• Calendar API: {diagReport.calendarListCheck.status === 'ok' ? '✅' : diagReport.calendarListCheck.status === 'skipped' ? '⏭️' : '❌'} {diagReport.calendarListCheck.detail}</div>
                  <div>• Tasks API: {diagReport.taskListsCheck.status === 'ok' ? '✅' : diagReport.taskListsCheck.status === 'skipped' ? '⏭️' : '❌'} {diagReport.taskListsCheck.detail}</div>
                  {diagReport.gasBridgeCheck && (
                    <div>• Apps Script 브릿지: {diagReport.gasBridgeCheck.status === 'ok' ? '✅' : diagReport.gasBridgeCheck.status === 'skipped' ? '⏭️' : '❌'} {diagReport.gasBridgeCheck.detail}</div>
                  )}
                  {diagReport.publicCalendarChecks.map(chk => (
                    <div key={chk.id}>
                      • 공개 캘린더 [{chk.label}]: {chk.status === 'ok' ? '✅' : '❌'} {chk.detail}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>

          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', fontSize: '0.78rem', color: 'var(--cal-text-main)', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 800, marginBottom: '4px' }}>💡 팁:</div>
            <div>• Google Tasks에 등록한 할 일은 Google 캘린더 웹/앱의 &apos;Tasks(할 일)&apos;에도 자동으로 표시됩니다.</div>
            <div style={{ marginTop: '2px' }}>• 일정이나 할 일을 달력 위 다른 날짜로 드래그 &amp; 드롭해 날짜를 이동할 수 있습니다.</div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button
              type="button"
              className="btn"
              onClick={onClose}
              style={{ flex: 1, background: '#f1f5f9', color: 'var(--text-sub)', borderRadius: '9999px', padding: '10px 18px' }}
            >
              닫기
            </button>
            <button
              type="button"
              className="btn"
              onClick={onSaveAndSync}
              style={{ flex: 2, background: 'var(--accent)', color: '#ffffff', borderRadius: '9999px', padding: '10px 18px' }}
            >
              저장 및 동기화
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface EventEditModalProps {
  event: EditableCalendarEvent | null;
  onClose: () => void;
  onSave: (updated: {
    title: string;
    allDay: boolean;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    category: 'Wee' | '순회' | 'default';
  }) => void;
}

export const EventEditModal: React.FC<EventEditModalProps> = ({ event, onClose, onSave }) => {
  const [title, setTitle] = useState(event?.rawTitle || '');
  const [allDay, setAllDay] = useState(!!event?.allDay);
  const [startDate, setStartDate] = useState(event?.date || '');
  const [endDate, setEndDate] = useState(event?.endDate || event?.date || '');
  const [startTime, setStartTime] = useState(event?.startTime || '09:00');
  const [endTime, setEndTime] = useState(event?.endTime || '10:00');
  const [category, setCategory] = useState<'Wee' | '순회' | 'default'>(
    event?.category === 'Wee' || event?.category === '순회' ? event.category : 'default'
  );

  if (!event) return null;

  const isGoogle = event.source === 'google';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 9999
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          padding: '24px',
          maxWidth: '420px',
          width: '92%',
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: 'var(--cal-text-main)' }}>
            📅 {isGoogle ? 'Google 일정 수정' : '일정 수정'}
          </h4>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: '1.1rem', cursor: 'pointer', color: 'var(--cal-text-sub)' }}
          >
            ✕
          </button>
        </div>

        <div className="input-group">
          <label>일정 제목</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="일정 제목"
          />
        </div>

        {!isGoogle && (
          <div className="input-group">
            <label>분류</label>
            <select value={category} onChange={e => setCategory(e.target.value as any)}>
              <option value="Wee">🔮 Wee (위센터 상담)</option>
              <option value="순회">✈️ 순회 (순회상담)</option>
              <option value="default">📌 일반 일정</option>
            </select>
          </div>
        )}

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer', color: 'var(--cal-text-main)' }}>
          <input
            type="checkbox"
            checked={allDay}
            onChange={e => setAllDay(e.target.checked)}
            style={{ width: '16px', height: '16px' }}
          />
          하루 종일 (기간 일정)
        </label>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            style={{ flex: 1, fontSize: '0.82rem' }}
          />
          <span style={{ color: 'var(--cal-text-sub)' }}>~</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            style={{ flex: 1, fontSize: '0.82rem' }}
          />
        </div>

        {!allDay && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              style={{ flex: 1, fontSize: '0.82rem' }}
            />
            <span style={{ color: 'var(--cal-text-sub)' }}>~</span>
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              style={{ flex: 1, fontSize: '0.82rem' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            style={{ flex: 1, background: '#f1f5f9', color: 'var(--text-sub)', borderRadius: '9999px' }}
          >
            취소
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!title.trim() || !startDate) return;
              onSave({
                title: title.trim(),
                allDay,
                startDate,
                endDate: endDate >= startDate ? endDate : startDate,
                startTime,
                endTime,
                category
              });
            }}
            style={{ flex: 2, background: 'var(--accent)', color: '#ffffff', borderRadius: '9999px' }}
          >
            {isGoogle ? 'Google 캘린더에 수정 반영' : '일정 저장'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface TodoEditModalProps {
  todo: EditableTodoItem | null;
  onClose: () => void;
  onSave: (updated: { text: string; detail: string; date: string }) => void;
}

export const TodoEditModal: React.FC<TodoEditModalProps> = ({ todo, onClose, onSave }) => {
  const [text, setText] = useState(todo?.text || '');
  const [detail, setDetail] = useState(todo?.detail || '');
  const [date, setDate] = useState(todo?.date || '');

  if (!todo) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 9999
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          padding: '24px',
          maxWidth: '420px',
          width: '92%',
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: 'var(--cal-text-main)' }}>
            🍀 {todo.googleTaskId ? 'Google Tasks 할 일 수정' : 'To Do 수정'}
          </h4>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: '1.1rem', cursor: 'pointer', color: 'var(--cal-text-sub)' }}
          >
            ✕
          </button>
        </div>

        <div className="input-group">
          <label>할 일 제목</label>
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="할 일 제목"
          />
        </div>

        <div className="input-group">
          <label>마감일</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>세부 메모</label>
          <textarea
            value={detail}
            onChange={e => setDetail(e.target.value)}
            placeholder="세부 메모 입력"
            style={{ height: '78px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            style={{ flex: 1, background: '#f1f5f9', color: 'var(--text-sub)', borderRadius: '9999px' }}
          >
            취소
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!text.trim()) return;
              onSave({
                text: text.trim(),
                detail: detail.trim(),
                date
              });
            }}
            style={{ flex: 2, background: '#43A047', color: '#ffffff', borderRadius: '9999px' }}
          >
            {todo.googleTaskId ? 'Google Tasks에 수정 반영' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface GoogleConfirmModalProps {
  confirmState: GoogleConfirmState | null;
  isBusy: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  onSecondary?: () => void;
}

export const GoogleConfirmModal: React.FC<GoogleConfirmModalProps> = ({
  confirmState,
  isBusy,
  onConfirm,
  onCancel,
  onSecondary
}) => {
  if (!confirmState) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 10000
      }}
      onClick={() => {
        if (!isBusy) onCancel();
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          padding: '24px',
          maxWidth: '440px',
          width: '92%',
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.24)',
          border: '1px solid var(--border)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 10px 0', fontSize: '1.05rem', fontWeight: 900, color: 'var(--cal-text-main)' }}>
          ☁️ {confirmState.title}
        </h3>
        <p style={{ margin: '0 0 18px 0', fontSize: '0.86rem', color: 'var(--cal-text-sub)', lineHeight: 1.55, whiteSpace: 'pre-line' }}>
          {confirmState.description}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            className="btn"
            disabled={isBusy}
            onClick={onConfirm}
            style={{
              background: 'var(--accent)',
              color: '#ffffff',
              borderRadius: '9999px',
              padding: '10px 16px',
              fontWeight: 800
            }}
          >
            {isBusy ? '처리 중...' : confirmState.confirmLabel}
          </button>
          {confirmState.secondaryLabel && onSecondary && (
            <button
              type="button"
              className="btn"
              disabled={isBusy}
              onClick={onSecondary}
              style={{
                background: '#eff6ff',
                color: '#1d4ed8',
                borderRadius: '9999px',
                padding: '9px 16px',
                fontWeight: 800
              }}
            >
              {confirmState.secondaryLabel}
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={isBusy}
            onClick={onCancel}
            style={{
              background: '#f1f5f9',
              color: 'var(--text-sub)',
              borderRadius: '9999px',
              padding: '9px 16px',
              fontWeight: 800
            }}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
};
