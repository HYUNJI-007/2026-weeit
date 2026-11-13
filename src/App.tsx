/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { LockScreen } from './components/LockScreen';
import { Header } from './components/Header';
import { CounselingForm } from './components/CounselingForm';
import { CaseManagement } from './components/CaseManagement';
import { StatisticsView } from './components/StatisticsView';
import { CalendarView } from './components/CalendarView';
import { CareCardModal } from './components/CareCardModal';
import { ClientInfoModal } from './components/ClientInfoModal';
import { SettingsModal } from './components/SettingsModal';
import { MemoView } from './components/MemoView';
import { CounselingRecord, AttachmentItem } from './types';
import { 
  getAppConfig, saveAppConfig, AppConfig, 
  fetchSpreadsheetRecords, getCachedRecords, 
  submitCounselingRecord, syncCardsWithGoogle, getLocalCards, saveLocalCards 
} from './services/googleSyncService';
import { consumeGoogleRedirectPending } from './services/googleWorkspaceService';

export default function App() {
  const [isReturningFromGoogleRedirect] = useState<boolean>(() => consumeGoogleRedirectPending());
  const [isLocked, setIsLocked] = useState(!isReturningFromGoogleRedirect);
  const [activeTab, setActiveTab] = useState<'reg' | 'case' | 'stat' | 'cal' | 'memo'>(
    isReturningFromGoogleRedirect ? 'cal' : 'reg'
  );
  const [calendarInitialMode, setCalendarInitialMode] = useState<'counseling' | 'google'>('counseling');
  
  const [config, setConfig] = useState<AppConfig>(getAppConfig());
  const [records, setRecords] = useState<CounselingRecord[]>(getCachedRecords());
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);

  const [editRecord, setEditRecord] = useState<CounselingRecord | null>(null);

  const [careCardStudent, setCareCardStudent] = useState<string | null>(null);
  const [clientInfoStudent, setClientInfoStudent] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [defaultCounselor, setDefaultCounselor] = useState<string>(() => {
    return localStorage.getItem('wee_counselor') || config.counselorName || '';
  });

  const handleSaveCounselor = (name: string) => {
    setDefaultCounselor(name);
    localStorage.setItem('wee_counselor', name);
  };

  const hasCareCard = (studentName: string): boolean => {
    const store = getLocalCards();
    return !!store[studentName];
  };

  const handleNameMigrated = (fromName: string, toName: string) => {
    if (!fromName || !toName || fromName === toName) return;
    const store = getLocalCards();
    if (store[fromName]) {
      store[toName] = store[fromName];
      delete store[fromName];
      saveLocalCards(store);
    }
  };

  const loadData = async (silent = false) => {
    if (!silent) setSyncStatus('syncing');
    try {
      const data = await fetchSpreadsheetRecords(config.scriptUrl);
      setRecords(data);
      setSyncStatus('synced');
      
      const now = new Date();
      setLastSyncedTime(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`);
      
      syncCardsWithGoogle(config.scriptUrl).catch(() => {});
    } catch (err) {
      console.error('loadData error:', err);
      setSyncStatus('error');
    }
  };

  useEffect(() => {
    loadData(true);
  }, [config.scriptUrl]);

  const handleSubmitRecord = async (
    record: CounselingRecord, 
    files: File[], 
    existingAttachments: AttachmentItem[]
  ) => {
    const res = await submitCounselingRecord(config.scriptUrl, record, files, existingAttachments);
    alert(res.message || '저장되었습니다.');
    setEditRecord(null);
    await loadData(false);
  };

  const [selectedCaseStudent, setSelectedCaseStudent] = useState<string>('');

  const handleSelectStudentFromOther = (studentName: string) => {
    setSelectedCaseStudent(studentName);
    setActiveTab('case');
    window.scrollTo(0, 0);
  };

  return (
    <>
      {/* Lock Screen */}
      {isLocked && (
        <LockScreen
          onUnlock={() => setIsLocked(false)}
          customPassword={config.password}
        />
      )}

    <div className="app-mac-window">
      {/* Mac Window Bar */}
      <div className="mac-window-bar no-print">
        <div className="mac-dots">
          <span className="mac-dot close" title="닫기"></span>
          <span className="mac-dot minimize" title="최소화"></span>
          <span className="mac-dot maximize" title="최대화"></span>
          <span className="mac-title">Wee-It 2026</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-sub)' }}>
          <span style={{ fontWeight: 800, color: 'var(--accent)' }}>🌸 Oneul Edition</span>
        </div>
      </div>

      {/* Header */}
      <Header
        config={config}
        syncStatus={syncStatus}
        lastSyncedTime={lastSyncedTime}
        onRefresh={() => loadData(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLock={() => setIsLocked(true)}
      />

      {/* Main Container */}
      <div className="container">
        {/* Navigation Tabs - Original 4 tabs preserved with Oneul styling */}
        <nav className="no-print">
          <button
            type="button"
            className={`nav-btn ${activeTab === 'reg' ? 'active' : ''}`}
            onClick={() => setActiveTab('reg')}
          >
            📝 상담기록
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'case' ? 'active' : ''}`}
            onClick={() => setActiveTab('case')}
          >
            🗂️ 사례관리
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'stat' ? 'active' : ''}`}
            onClick={() => setActiveTab('stat')}
          >
            📊 실적통계
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'cal' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('cal');
              setCalendarInitialMode('counseling');
            }}
          >
            📅 일정달력
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'memo' ? 'active' : ''}`}
            onClick={() => setActiveTab('memo')}
          >
            📌 메모
          </button>
        </nav>

        {/* Tab 1: Counseling Form */}
        {activeTab === 'reg' && (
          <CounselingForm
            records={records}
            editRecord={editRecord}
            defaultCounselor={defaultCounselor}
            onSaveCounselor={handleSaveCounselor}
            onSubmit={handleSubmitRecord}
            onCancelEdit={() => setEditRecord(null)}
          />
        )}

        {/* Tab 2: Case Management */}
        {activeTab === 'case' && (
          <CaseManagement
            records={records}
            scriptUrl={config.scriptUrl}
            onEditRecord={(rec) => {
              setEditRecord(rec);
              setActiveTab('reg');
              window.scrollTo(0, 0);
            }}
            onOpenCareCard={(name) => setCareCardStudent(name)}
            onOpenClientInfoEdit={(name) => setClientInfoStudent(name)}
            onReload={() => loadData(true)}
            hasCareCard={hasCareCard}
            initialSelectedStudent={selectedCaseStudent}
          />
        )}

        {/* Tab 3: Statistics */}
        {activeTab === 'stat' && (
          <StatisticsView
            records={records}
            counselorName={defaultCounselor}
          />
        )}

        {/* Tab 4: Calendar (Integrated with Google Calendar within the same tab) */}
        {activeTab === 'cal' && (
          <CalendarView
            records={records}
            onSelectStudent={(studentName) => handleSelectStudentFromOther(studentName)}
            googleCalendarUrl={config.calendarUrl || 'https://hyunji-007.github.io/Calendar/'}
            initialMode={calendarInitialMode}
            scriptUrl={config.scriptUrl}
          />
        )}

        {/* Tab 5: Memos */}
        {activeTab === 'memo' && (
          <MemoView
            records={records}
            onSelectStudent={(studentName) => handleSelectStudentFromOther(studentName)}
          />
        )}

        {/* Footer Copyright */}
        <div className="copyright">© 2026 Hyun. Oneul Calendar & Wee-It 2026. All rights reserved.</div>
      </div>
    </div>

      {/* Care Card Modal */}
      {careCardStudent && (
        <CareCardModal
          isOpen={!!careCardStudent}
          onClose={() => setCareCardStudent(null)}
          studentName={careCardStudent}
          records={records}
          scriptUrl={config.scriptUrl}
        />
      )}

      {/* Client Info Batch Edit Modal */}
      {clientInfoStudent && (
        <ClientInfoModal
          isOpen={!!clientInfoStudent}
          onClose={() => setClientInfoStudent(null)}
          studentName={clientInfoStudent}
          records={records}
          scriptUrl={config.scriptUrl}
          onReload={() => loadData(true)}
          onNameMigrated={handleNameMigrated}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaveConfig={(newConfig) => {
          setConfig(newConfig);
          saveAppConfig(newConfig);
        }}
        onTestConnection={async (url) => {
          try {
            const data = await fetchSpreadsheetRecords(url);
            return Array.isArray(data);
          } catch (e) {
            return false;
          }
        }}
      />
    </>
  );
}
