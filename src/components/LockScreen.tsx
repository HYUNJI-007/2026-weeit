import React, { useState, useEffect } from 'react';
import { APP_PASSWORD } from '../constants';

interface LockScreenProps {
  onUnlock: () => void;
  customPassword?: string;
}

export const LockScreen: React.FC<LockScreenProps> = ({ onUnlock, customPassword }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const targetPassword = customPassword || APP_PASSWORD;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (password === targetPassword) {
      setError('');
      onUnlock();
    } else {
      setError('암호가 올바르지 않습니다.');
      setPassword('');
      const input = document.getElementById('lockPassword');
      if (input) input.focus();
    }
  };

  useEffect(() => {
    const input = document.getElementById('lockPassword');
    if (input) input.focus();
  }, []);

  return (
    <div id="lockScreen">
      <div className="lock-card">
        <div className="lock-title">🔒 Wee-It 2026</div>
        <div className="lock-sub">암호를 입력해주세요.</div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            id="lockPassword"
            className="lock-input"
            placeholder="암호 입력"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <button
            type="submit"
            className="btn btn-save"
            style={{ width: '100%', height: '48px', fontSize: '1rem', marginTop: '4px' }}
          >
            암호 해제
          </button>
          <div id="lockError" className="lock-error">
            {error}
          </div>
        </form>
      </div>
    </div>
  );
};
