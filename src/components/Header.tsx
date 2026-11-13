import React from 'react';
import { AppConfig } from '../services/googleSyncService';

interface HeaderProps {
  config: AppConfig;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncedTime: string | null;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onLock: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  syncStatus,
  lastSyncedTime,
  onRefresh,
  onOpenSettings,
  onLock
}) => {
  return (
    <header className="no-print">
      <div className="header-title">
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontSize: '1.65rem', fontWeight: 900, letterSpacing: '-0.5px' }}>
          <span style={{ color: 'var(--accent)', fontSize: '0.85em' }}>♥</span>
          Wee-It 2026
          <span style={{ color: 'var(--accent)', fontSize: '0.85em' }}>♥</span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
          <span style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '0.78rem', background: 'var(--accent-light)', padding: '2px 8px', borderRadius: '12px' }}>
            Wee-Center
          </span>
          <small style={{ color: 'var(--text-sub)', fontWeight: 700, fontSize: '0.8rem' }}>
            경기도구리남양주교육지원청 Wee센터
          </small>
        </div>
      </div>

      <div className="header-links">
        {/* Sync Indicator */}
        <span
          onClick={onRefresh}
          title="클릭하여 구글 시트 데이터 새로고침"
          className="header-sync-btn"
          style={{
            background: syncStatus === 'syncing' ? '#eef6ff' : syncStatus === 'synced' ? 'var(--accent-light)' : '#fff8e6',
            color: syncStatus === 'syncing' ? '#1d4ed8' : syncStatus === 'synced' ? 'var(--accent)' : '#b45309',
            borderColor: syncStatus === 'syncing' ? '#93c5fd' : syncStatus === 'synced' ? 'rgba(224, 101, 139, 0.4)' : '#fcd34d',
          }}
        >
          <span style={{ fontSize: '0.9rem' }}>{syncStatus === 'syncing' ? '🔄' : syncStatus === 'synced' ? '☁️' : '⚠️'}</span>
          <span>{syncStatus === 'syncing' ? '동기화 중...' : syncStatus === 'synced' ? `연동됨 ${lastSyncedTime ? `(${lastSyncedTime})` : ''}` : '연동 대기'}</span>
        </span>

        {config.sheetUrl && (
          <a
            href={config.sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="header-link"
            title="Wee DB 구글 스프레드시트 열기"
          >
            <span style={{ fontSize: '0.95rem' }}>🗃️</span>
            <span>Wee DB</span>
          </a>
        )}

        {config.driveUrl && (
          <a
            href={config.driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="header-link"
            title="상담 첨부파일 구글 드라이브 열기"
          >
            <span style={{ fontSize: '0.95rem' }}>📁</span>
            <span>Drive</span>
          </a>
        )}

        <button
          type="button"
          onClick={onOpenSettings}
          title="시스템 설정 (비밀번호, 연동 URL 등)"
          className="header-link header-icon-btn"
        >
          <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>⚙️</span>
        </button>

        <button
          type="button"
          onClick={onLock}
          title="화면 잠금"
          className="header-link header-lock-btn header-icon-btn"
        >
          <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>🔒</span>
        </button>
      </div>
    </header>
  );
};
