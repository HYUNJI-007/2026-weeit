import React, { useState, useEffect, useMemo } from 'react';
import { CounselingRecord } from '../types';

export interface MemoTopic {
  id: string;
  name: string;
  icon: string;
}

export interface CounselingMemo {
  id: string;
  title: string;
  content: string;
  category: string; // matches topic.id or topic.name
  studentName?: string;
  color: 'pink' | 'yellow' | 'purple' | 'blue' | 'green';
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

interface MemoViewProps {
  records: CounselingRecord[];
  onSelectStudent: (studentName: string) => void;
}

export const DEFAULT_MEMO_TOPICS: MemoTopic[] = [
  { id: 'topic-call', name: '학부모·담임 통화', icon: '📞' },
  { id: 'topic-crisis', name: '위기·안전 점검', icon: '🚨' },
  { id: 'topic-supervision', name: '상담·슈퍼비전', icon: '💡' },
  { id: 'topic-admin', name: '행정·공문 업무', icon: '📋' },
  { id: 'topic-free', name: '자유 메모', icon: '☕' },
];

const PRESET_ICONS = [
  '📞', '🚨', '💡', '📋', '☕', '🏫', '👥', '🎯', 
  '📑', '🩺', '💬', '🌟', '📝', '📅', '🔍', '🔔',
  '❤️', '⚡', '🚩', '🤝', '📚', '🎒', '🛡️', '✨'
];

const COLOR_MAP: Record<CounselingMemo['color'], { bg: string; border: string; accent: string; label: string }> = {
  pink: { bg: '#fff0f5', border: 'rgba(224, 101, 139, 0.35)', accent: '#E0658B', label: '로즈' },
  yellow: { bg: '#fffdeb', border: 'rgba(245, 158, 11, 0.35)', accent: '#d97706', label: '레몬' },
  purple: { bg: '#f7f4ff', border: 'rgba(130, 101, 189, 0.35)', accent: '#8265BD', label: '라벤더' },
  blue: { bg: '#f0f9ff', border: 'rgba(56, 189, 248, 0.35)', accent: '#0284c7', label: '스카이' },
  green: { bg: '#f0fdf4', border: 'rgba(74, 222, 128, 0.35)', accent: '#16a34a', label: '민트' },
};

export const MemoView: React.FC<MemoViewProps> = ({ records, onSelectStudent }) => {
  // Custom Topics State (User can add, edit, rename, delete)
  const [topics, setTopics] = useState<MemoTopic[]>(() => {
    try {
      const saved = localStorage.getItem('wee_memo_topics_v3');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_MEMO_TOPICS;
  });

  useEffect(() => {
    localStorage.setItem('wee_memo_topics_v3', JSON.stringify(topics));
  }, [topics]);

  // Topic Helper: resolves any category (legacy or new id/name) to active topic meta
  const getTopicMeta = (cat: string): MemoTopic => {
    const byId = topics.find(t => t.id === cat);
    if (byId) return byId;
    const byName = topics.find(t => t.name === cat);
    if (byName) return byName;

    // Legacy fallback keys
    if (cat === '통화') return topics.find(t => t.name.includes('통화')) || { id: 'call', name: '학부모·담임 통화', icon: '📞' };
    if (cat === '위기') return topics.find(t => t.name.includes('위기')) || { id: 'crisis', name: '위기·안전 점검', icon: '🚨' };
    if (cat === '아이디어') return topics.find(t => t.name.includes('상담') || t.name.includes('슈퍼비전')) || { id: 'supervision', name: '상담·슈퍼비전', icon: '💡' };
    if (cat === '행정') return topics.find(t => t.name.includes('행정')) || { id: 'admin', name: '행정·공문 업무', icon: '📋' };
    if (cat === '자유') return topics.find(t => t.name.includes('자유')) || { id: 'free', name: '자유 메모', icon: '☕' };

    return { id: cat, name: cat, icon: '📌' };
  };

  // Memos State
  const [memos, setMemos] = useState<CounselingMemo[]>(() => {
    try {
      const saved = localStorage.getItem('wee_counseling_memos_v2');
      if (saved) return JSON.parse(saved);
      const old = localStorage.getItem('oneul_quick_memos_v2');
      if (old) {
        const parsedOld = JSON.parse(old);
        if (Array.isArray(parsedOld)) {
          return parsedOld
            .filter((m: any) => m.id !== 'memo-1' && m.id !== 'memo-2')
            .map((m: any) => ({
              id: m.id || `memo-${Date.now()}-${Math.random()}`,
              title: m.title || '상담 메모',
              content: m.text || '',
              category: 'topic-free',
              color: (m.color as any) || 'pink',
              isPinned: !!m.isPinned,
              createdAt: m.createdAt || Date.now(),
              updatedAt: m.createdAt || Date.now(),
            }));
        }
      }
      return [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('wee_counseling_memos_v2', JSON.stringify(memos));
  }, [memos]);

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Form State
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<string>(() => topics[0]?.id || 'topic-call');
  const [studentNameInput, setStudentNameInput] = useState('');
  const [colorInput, setColorInput] = useState<CounselingMemo['color']>('pink');
  const [isPinnedInput, setIsPinnedInput] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Topic Manager Modal State
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicIcon, setNewTopicIcon] = useState('📌');
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editTopicName, setEditTopicName] = useState('');
  const [editTopicIcon, setEditTopicIcon] = useState('');

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Student names for autocomplete
  const studentNames = useMemo(() => {
    return Array.from(new Set(records.map(r => r.name?.trim()).filter(Boolean)));
  }, [records]);

  // Handle Edit Memo
  const handleStartEdit = (memo: CounselingMemo) => {
    const meta = getTopicMeta(memo.category);
    setEditingMemoId(memo.id);
    setTitleInput(memo.title);
    setContentInput(memo.content);
    setCategoryInput(meta.id);
    setStudentNameInput(memo.studentName || '');
    setColorInput(memo.color);
    setIsPinnedInput(memo.isPinned);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelForm = () => {
    setEditingMemoId(null);
    setTitleInput('');
    setContentInput('');
    setCategoryInput(topics[0]?.id || 'topic-call');
    setStudentNameInput('');
    setColorInput('pink');
    setIsPinnedInput(false);
    setIsFormOpen(false);
  };

  // Submit Memo Form
  const handleSaveMemo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contentInput.trim() && !titleInput.trim()) {
      showToast('메모 제목 또는 내용을 입력해 주세요.');
      return;
    }

    const now = Date.now();

    if (editingMemoId) {
      setMemos(prev =>
        prev.map(m =>
          m.id === editingMemoId
            ? {
                ...m,
                title: titleInput.trim() || '상담 메모',
                content: contentInput.trim(),
                category: categoryInput,
                studentName: studentNameInput.trim() || undefined,
                color: colorInput,
                isPinned: isPinnedInput,
                updatedAt: now,
              }
            : m
        )
      );
      showToast('메모가 수정되었습니다 ✨');
    } else {
      const newMemo: CounselingMemo = {
        id: `memo-${now}`,
        title: titleInput.trim() || '상담 메모',
        content: contentInput.trim(),
        category: categoryInput,
        studentName: studentNameInput.trim() || undefined,
        color: colorInput,
        isPinned: isPinnedInput,
        createdAt: now,
        updatedAt: now,
      };
      setMemos(prev => [newMemo, ...prev]);
      showToast('새 메모가 등록되었습니다 📌');
    }

    handleCancelForm();
  };

  const handleDeleteMemo = (id: string) => {
    if (confirm('이 메모를 삭제하시겠습니까?')) {
      setMemos(prev => prev.filter(m => m.id !== id));
      showToast('메모가 삭제되었습니다.');
      if (editingMemoId === id) handleCancelForm();
    }
  };

  const handleTogglePin = (id: string) => {
    setMemos(prev =>
      prev.map(m => (m.id === id ? { ...m, isPinned: !m.isPinned } : m))
    );
  };

  const handleCopyMemo = (memo: CounselingMemo) => {
    const meta = getTopicMeta(memo.category);
    const studentTag = memo.studentName ? `[내담자: ${memo.studentName}]\n` : '';
    const categoryTag = `[${meta.icon} ${meta.name}]\n`;
    const fullText = `${categoryTag}${studentTag}${memo.title ? `${memo.title}\n` : ''}${memo.content}`;

    navigator.clipboard.writeText(fullText);
    setCopiedId(memo.id);
    showToast('메모가 클립보드에 복사되었습니다 📋');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // --- Topic Manager Actions ---
  const handleAddNewTopic = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newTopicName.trim();
    if (!name) {
      showToast('주제 명칭을 입력해 주세요.');
      return;
    }
    if (topics.some(t => t.name === name)) {
      showToast('이미 동일한 이름의 주제가 있습니다.');
      return;
    }

    const newTopic: MemoTopic = {
      id: `topic-${Date.now()}`,
      name,
      icon: newTopicIcon || '📌'
    };

    setTopics(prev => [...prev, newTopic]);
    setNewTopicName('');
    showToast(`새 주제 "${name}"이(가) 추가되었습니다 ✨`);
  };

  const handleStartEditTopic = (topic: MemoTopic) => {
    setEditingTopicId(topic.id);
    setEditTopicName(topic.name);
    setEditTopicIcon(topic.icon);
  };

  const handleSaveEditTopic = (id: string) => {
    const name = editTopicName.trim();
    if (!name) {
      showToast('주제 명칭을 입력해 주세요.');
      return;
    }

    setTopics(prev =>
      prev.map(t => (t.id === id ? { ...t, name, icon: editTopicIcon || t.icon } : t))
    );
    setEditingTopicId(null);
    showToast('주제 내용이 수정되었습니다.');
  };

  const handleDeleteTopic = (id: string, name: string) => {
    if (topics.length <= 1) {
      showToast('최소 1개 이상의 주제가 유지되어야 합니다.');
      return;
    }

    const relatedCount = memos.filter(m => {
      const meta = getTopicMeta(m.category);
      return meta.id === id;
    }).length;

    const confirmMsg = relatedCount > 0
      ? `"${name}" 주제를 삭제하시겠습니까?\n이 주제를 사용하는 메모 ${relatedCount}개는 "자유 메모"로 변경됩니다.`
      : `"${name}" 주제를 삭제하시겠습니까?`;

    if (confirm(confirmMsg)) {
      setTopics(prev => prev.filter(t => t.id !== id));
      // Reassign memos that used this deleted topic to another remaining topic
      const fallbackTopicId = topics.find(t => t.id !== id)?.id || 'topic-free';
      setMemos(prev =>
        prev.map(m => {
          const meta = getTopicMeta(m.category);
          return meta.id === id ? { ...m, category: fallbackTopicId } : m;
        })
      );
      if (activeCategoryFilter === id) {
        setActiveCategoryFilter('all');
      }
      showToast('주제가 삭제되었습니다.');
    }
  };

  const handleResetDefaultTopics = () => {
    if (confirm('모든 주제를 초기 기본 상태(5가지 주제)로 되돌리시겠습니까?')) {
      setTopics(DEFAULT_MEMO_TOPICS);
      showToast('기본 주제 목록으로 초기화되었습니다.');
    }
  };

  // Filtered & Sorted Memos
  const filteredMemos = useMemo(() => {
    let result = memos;

    if (activeCategoryFilter !== 'all') {
      result = result.filter(m => {
        const meta = getTopicMeta(m.category);
        return meta.id === activeCategoryFilter || meta.name === activeCategoryFilter;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        m =>
          m.title.toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q) ||
          (m.studentName && m.studentName.toLowerCase().includes(q))
      );
    }

    return [...result].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [memos, activeCategoryFilter, searchQuery, topics]);

  return (
    <div id="memoPage" style={{ position: 'relative' }}>
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

      {/* Header Banner Card */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="card-title" style={{ margin: 0, paddingBottom: 0, border: 'none' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.35rem' }}>📌</span>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)' }}>
                MEMO
              </h2>
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  color: 'var(--accent)',
                  background: 'var(--accent-light)',
                  padding: '2px 10px',
                  borderRadius: '12px'
                }}
              >
                총 {memos.length}개
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-sub)' }}>
              중요한 내용들을 편리하게 기록하고 주제를 자유롭게 관리하세요.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }} className="no-print">
            {/* Topic Management Button */}
            <button
              type="button"
              className="btn"
              onClick={() => setIsTopicModalOpen(true)}
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#334155',
                fontWeight: 800,
                fontSize: '0.82rem',
                padding: '8px 16px',
                borderRadius: '9999px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="메모의 주제(카테고리) 추가 및 편집"
            >
              <span>⚙️ 카테고리 편집</span>
            </button>

            {/* Create Memo Button */}
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (isFormOpen && !editingMemoId) {
                  setIsFormOpen(false);
                } else {
                  handleCancelForm();
                  setIsFormOpen(true);
                }
              }}
              style={{
                background: isFormOpen && !editingMemoId ? '#f1f5f9' : 'linear-gradient(135deg, #E0658B 0%, #f472b6 100%)',
                color: isFormOpen && !editingMemoId ? 'var(--text-main)' : '#ffffff',
                fontWeight: 800,
                fontSize: '0.84rem',
                padding: '8px 18px',
                borderRadius: '9999px',
                boxShadow: isFormOpen && !editingMemoId ? 'none' : '0 3px 8px rgba(224, 101, 139, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>{isFormOpen && !editingMemoId ? '✕ 닫기' : '✏️ 새 메모 작성'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Memo Creation / Edit Drawer Card */}
      {isFormOpen && (
        <div
          className="card"
          style={{
            marginBottom: '18px',
            border: '2px solid var(--accent)',
            background: 'linear-gradient(145deg, #ffffff 0%, #fffcfd 100%)',
            boxShadow: '0 4px 16px rgba(224, 101, 139, 0.1)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #fce7f3', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.2rem' }}>{editingMemoId ? '✏️' : '📝'}</span>
              <span style={{ fontWeight: 900, fontSize: '0.96rem', color: 'var(--text-main)' }}>
                {editingMemoId ? '메모 수정하기' : '새 상담 메모 등록'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCancelForm}
              style={{ border: 'none', background: 'transparent', color: 'var(--text-sub)', fontSize: '0.9rem', cursor: 'pointer' }}
            >
              ✕ 닫기
            </button>
          </div>

          <form onSubmit={handleSaveMemo}>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '12px' }}>
              <div className="input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>메모 주제 (분류)</label>
                  <button
                    type="button"
                    onClick={() => setIsTopicModalOpen(true)}
                    style={{ border: 'none', background: 'transparent', color: '#2563eb', fontSize: '0.74rem', cursor: 'pointer', fontWeight: 800 }}
                  >
                    + 주제 편집
                  </button>
                </div>
                <select
                  value={categoryInput}
                  onChange={e => setCategoryInput(e.target.value)}
                  style={{ height: '38px', fontWeight: 700 }}
                >
                  {topics.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.icon} {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label>연계 내담자 (선택사항)</label>
                <input
                  type="text"
                  placeholder="내담자 학생 성명 (사례관리 연동)"
                  list="memoStudentList"
                  value={studentNameInput}
                  onChange={e => setStudentNameInput(e.target.value)}
                  style={{ height: '38px' }}
                />
                <datalist id="memoStudentList">
                  {studentNames.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              <div className="input-group">
                <label>스티커 색상</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', height: '38px' }}>
                  {Object.entries(COLOR_MAP).map(([key, val]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setColorInput(key as any)}
                      title={val.label}
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        background: val.bg,
                        border: colorInput === key ? `2.5px solid ${val.accent}` : '1.5px solid rgba(0,0,0,0.12)',
                        cursor: 'pointer',
                        transform: colorInput === key ? 'scale(1.2)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="input-group" style={{ marginBottom: '12px' }}>
              <label>메모 제목</label>
              <input
                type="text"
                placeholder="제목을 입력하세요."
                value={titleInput}
                onChange={e => setTitleInput(e.target.value)}
                style={{ height: '38px', fontWeight: 700 }}
              />
            </div>

            <div className="input-group" style={{ marginBottom: '14px' }}>
              <label>메모 상세 내용</label>
              <textarea
                placeholder="상세 내용을 자유롭게 작성하세요..."
                value={contentInput}
                onChange={e => setContentInput(e.target.value)}
                style={{ height: '140px', padding: '12px', resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', cursor: 'pointer', fontWeight: 800 }}>
                <input
                  type="checkbox"
                  checked={isPinnedInput}
                  onChange={e => setIsPinnedInput(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                />
                <span>📌 고정</span>
              </label>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="btn"
                  style={{ background: '#f1f5f9', color: 'var(--text-sub)', borderRadius: '9999px', padding: '8px 18px' }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn"
                  style={{
                    background: 'var(--accent)',
                    color: '#ffffff',
                    borderRadius: '9999px',
                    padding: '8px 22px',
                    fontWeight: 800,
                    boxShadow: '0 3px 8px rgba(224, 101, 139, 0.25)'
                  }}
                >
                  {editingMemoId ? '수정 완료' : '💾 메모 등록'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: '18px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          {/* Dynamic Category Chips from Editable Topics */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('all')}
              style={{
                border: '1.5px solid',
                borderColor: activeCategoryFilter === 'all' ? 'var(--accent)' : 'var(--border)',
                background: activeCategoryFilter === 'all' ? 'var(--accent)' : '#ffffff',
                color: activeCategoryFilter === 'all' ? '#ffffff' : 'var(--text-sub)',
                padding: '6px 14px',
                borderRadius: '9999px',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              🌸 전체 ({memos.length})
            </button>

            {topics.map(t => {
              const count = memos.filter(m => {
                const meta = getTopicMeta(m.category);
                return meta.id === t.id;
              }).length;
              const isSelected = activeCategoryFilter === t.id;

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveCategoryFilter(t.id)}
                  style={{
                    border: '1.5px solid',
                    borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                    background: isSelected ? 'var(--accent-light)' : '#ffffff',
                    color: isSelected ? 'var(--accent)' : 'var(--text-main)',
                    padding: '6px 14px',
                    borderRadius: '9999px',
                    fontSize: '0.82rem',
                    fontWeight: isSelected ? 900 : 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <span>{t.icon} {t.name}</span>
                  <span style={{ fontSize: '0.74rem', marginLeft: '4px', opacity: 0.8 }}>({count})</span>
                </button>
              );
            })}

            {/* Quick Manage Topic Button */}
            <button
              type="button"
              onClick={() => setIsTopicModalOpen(true)}
              style={{
                border: '1px dashed #cbd5e1',
                background: '#f8fafc',
                color: '#64748b',
                padding: '6px 12px',
                borderRadius: '9999px',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="새로운 주제 추가 또는 기존 주제 수정"
            >
              <span>⚙️ 카테고리 편집</span>
            </button>
          </div>

          {/* Search Input & View Mode */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: '1 1 240px', maxWidth: '360px' }}>
            <input
              type="text"
              placeholder="🔍 검색"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                height: '38px',
                fontSize: '0.84rem',
                borderRadius: '9999px',
                padding: '0 16px',
                border: searchQuery ? '1.5px solid var(--accent)' : '1.5px solid var(--border)'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="btn"
                style={{ padding: '6px 12px', fontSize: '0.76rem', background: '#f1f5f9', color: '#475569', borderRadius: '9999px', whiteSpace: 'nowrap' }}
              >
                ✕ 초기화
              </button>
            )}

            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '2px' }} className="no-print">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="카드 그리드 보기"
                style={{
                  border: 'none',
                  background: viewMode === 'grid' ? '#ffffff' : 'transparent',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                ▦
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="리스트 목록 보기"
                style={{
                  border: 'none',
                  background: viewMode === 'list' ? '#ffffff' : 'transparent',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                ≡
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Memos Display Board */}
      {filteredMemos.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-sub)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📌</div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
            {searchQuery ? `"${searchQuery}"에 일치하는 메모가 없습니다.` : '작성된 상담 메모가 없습니다.'}
          </h3>
          <p style={{ margin: '6px 0 16px', fontSize: '0.84rem' }}>
            상담 진행 중 기록할 전화 내용이나 관찰 메모를 상단의 <strong>[✏️ 새 메모 작성]</strong> 버튼을 눌러 등록해보세요.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setSearchQuery('');
              setActiveCategoryFilter('all');
              handleCancelForm();
              setIsFormOpen(true);
            }}
            style={{ background: 'var(--accent)', color: '#ffffff', borderRadius: '9999px', padding: '8px 22px', fontWeight: 800 }}
          >
            + 첫 번째 메모 작성하기
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid Board View */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px'
          }}
        >
          {filteredMemos.map(memo => {
            const theme = COLOR_MAP[memo.color || 'pink'] || COLOR_MAP.pink;
            const categoryMeta = getTopicMeta(memo.category);
            const dateObj = new Date(memo.createdAt);
            const dateLabel = `${dateObj.getFullYear()}.${String(dateObj.getMonth() + 1).padStart(2, '0')}.${String(dateObj.getDate()).padStart(2, '0')} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;

            return (
              <div
                key={memo.id}
                style={{
                  background: theme.bg,
                  border: `1.5px solid ${theme.border}`,
                  borderRadius: '16px',
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  boxShadow: memo.isPinned ? '0 4px 14px rgba(0,0,0,0.08)' : '0 2px 6px rgba(0,0,0,0.02)',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Header Row: Category Badge + Pinned + Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      onClick={() => setActiveCategoryFilter(categoryMeta.id)}
                      title={`"${categoryMeta.name}" 주제로 필터`}
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: '#ffffff',
                        border: `1px solid ${theme.border}`,
                        color: theme.accent,
                        cursor: 'pointer'
                      }}
                    >
                      {categoryMeta.icon} {categoryMeta.name}
                    </span>
                    {memo.isPinned && (
                      <span title="상단 고정된 중요 메모" style={{ fontSize: '0.9rem' }}>
                        📌
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleTogglePin(memo.id)}
                      title={memo.isPinned ? '상단 고정 해제' : '상단 고정'}
                      style={{
                        border: 'none',
                        background: memo.isPinned ? 'rgba(0,0,0,0.08)' : 'transparent',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '6px',
                        color: memo.isPinned ? '#e11d48' : '#94a3b8'
                      }}
                    >
                      📌
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyMemo(memo)}
                      title="메모 전체 텍스트 복사"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '6px',
                        color: '#64748b'
                      }}
                    >
                      {copiedId === memo.id ? '✅' : '📋'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartEdit(memo)}
                      title="메모 수정"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '6px',
                        color: '#64748b'
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemo(memo.id)}
                      title="메모 삭제"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '6px',
                        color: '#ef4444'
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Title */}
                <h4 style={{ margin: '0 0 6px 0', fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.4 }}>
                  {memo.title}
                </h4>

                {/* Content */}
                <div
                  style={{
                    fontSize: '0.84rem',
                    color: '#334155',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    flex: 1,
                    marginBottom: '12px'
                  }}
                >
                  {memo.content}
                </div>

                {/* Footer: Student Link + Date */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: `1px dashed ${theme.border}`,
                    paddingTop: '8px',
                    marginTop: 'auto'
                  }}
                >
                  {memo.studentName ? (
                    <button
                      type="button"
                      onClick={() => onSelectStudent(memo.studentName!)}
                      title={`${memo.studentName} 내담자의 사례관리 페이지로 바로가기`}
                      style={{
                        border: `1px solid ${theme.border}`,
                        background: '#ffffff',
                        color: theme.accent,
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span>👤 {memo.studentName}</span>
                      <span style={{ fontSize: '0.68rem', opacity: 0.8 }}>→ 사례관리</span>
                    </button>
                  ) : (
                    <span />
                  )}

                  <span style={{ color: 'var(--text-sub)', fontSize: '0.72rem' }}>
                    {dateLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List Table View */
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <table className="stat-table" style={{ margin: 0 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ width: '14%', padding: '10px' }}>주제</th>
                <th style={{ width: '22%', padding: '10px' }}>제목</th>
                <th style={{ width: '36%', padding: '10px' }}>내용</th>
                <th style={{ width: '12%', padding: '10px' }}>내담자</th>
                <th style={{ width: '16%', padding: '10px' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredMemos.map(memo => {
                const categoryMeta = getTopicMeta(memo.category);
                const d = new Date(memo.createdAt);
                const dateLabel = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

                return (
                  <tr key={memo.id} style={{ background: memo.isPinned ? '#fff9fb' : '#ffffff' }}>
                    <td style={{ fontWeight: 800, color: 'var(--accent)' }}>
                      {memo.isPinned && '📌 '}
                      {categoryMeta.icon} {categoryMeta.name}
                    </td>
                    <td style={{ textAlign: 'left', fontWeight: 800 }}>{memo.title}</td>
                    <td style={{ textAlign: 'left', color: '#475569', fontSize: '0.82rem' }}>
                      <div style={{ maxHeight: '42px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {memo.content}
                      </div>
                    </td>
                    <td>
                      {memo.studentName ? (
                        <button
                          type="button"
                          onClick={() => onSelectStudent(memo.studentName!)}
                          style={{
                            border: '1px solid var(--accent)',
                            background: 'var(--accent-light)',
                            color: 'var(--accent)',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            fontSize: '0.74rem',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          {memo.studentName}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleCopyMemo(memo)}
                          title="복사"
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: '0.74rem', background: '#f1f5f9' }}
                        >
                          {copiedId === memo.id ? '✅' : '📋'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(memo)}
                          title="수정"
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: '0.74rem', background: 'var(--accent-light)', color: 'var(--accent)' }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMemo(memo.id)}
                          title="삭제"
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: '0.74rem', background: '#fee2e2', color: '#b91c1c' }}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Topic Manager Modal */}
      {isTopicModalOpen && (
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
          onClick={() => {
            setIsTopicModalOpen(false);
            setEditingTopicId(null);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              maxWidth: '540px',
              width: '92%',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: '20px',
              padding: '24px',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.22)',
              border: '1px solid var(--border)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.3rem' }}>⚙️</span>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)' }}>
                  메모 카테고리 추가 및 편집
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsTopicModalOpen(false);
                  setEditingTopicId(null);
                }}
                style={{ border: 'none', background: 'transparent', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-sub)' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-sub)', lineHeight: 1.5, marginBottom: '16px' }}>
              상담 업무에 맞게 원하는 카테고리를 새로 추가하거나, 기존에 등록된 카테고리의 명칭과 아이콘을 자유롭게 수정·삭제할 수 있습니다.
            </p>

            {/* Add New Topic Form */}
            <form
              onSubmit={handleAddNewTopic}
              style={{
                background: '#f8fafc',
                border: '1.5px dashed #cbd5e1',
                borderRadius: '14px',
                padding: '14px',
                marginBottom: '18px'
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '8px' }}>
                + 새 카테고리 추가하기
              </div>

              {/* Icon presets */}
              <div style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                  아이콘 선택 (클릭):
                </span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {PRESET_ICONS.map(icon => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setNewTopicIcon(icon)}
                      style={{
                        border: newTopicIcon === icon ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: newTopicIcon === icon ? '#eff6ff' : '#ffffff',
                        borderRadius: '6px',
                        padding: '3px 6px',
                        fontSize: '1rem',
                        cursor: 'pointer'
                      }}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="예: 집단상담, 학업중단숙려제, 외부연계..."
                  value={newTopicName}
                  onChange={e => setNewTopicName(e.target.value)}
                  style={{
                    flex: 1,
                    height: '38px',
                    fontSize: '0.84rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    padding: '0 12px'
                  }}
                />
                <button
                  type="submit"
                  className="btn"
                  style={{
                    background: '#2563eb',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    padding: '0 18px',
                    borderRadius: '8px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {newTopicIcon} 주제 추가
                </button>
              </div>
            </form>

            {/* List of Existing Topics */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '8px' }}>
                현재 등록된 카테고리 목록 ({topics.length}개)
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {topics.map(topic => {
                  const isEditing = editingTopicId === topic.id;
                  const memoCount = memos.filter(m => {
                    const meta = getTopicMeta(m.category);
                    return meta.id === topic.id;
                  }).length;

                  if (isEditing) {
                    return (
                      <div
                        key={topic.id}
                        style={{
                          background: '#eff6ff',
                          border: '1.5px solid #3b82f6',
                          borderRadius: '10px',
                          padding: '10px 12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={editTopicIcon}
                            onChange={e => setEditTopicIcon(e.target.value)}
                            style={{ width: '48px', height: '36px', textAlign: 'center', fontSize: '1.1rem', borderRadius: '6px', border: '1px solid #93c5fd' }}
                            title="아이콘 이모지 직접 입력"
                          />
                          <input
                            type="text"
                            value={editTopicName}
                            onChange={e => setEditTopicName(e.target.value)}
                            style={{ flex: 1, height: '36px', fontSize: '0.84rem', fontWeight: 800, borderRadius: '6px', border: '1px solid #93c5fd', padding: '0 10px' }}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEditTopic(topic.id)}
                            className="btn"
                            style={{ background: '#2563eb', color: '#fff', fontSize: '0.78rem', padding: '6px 12px', borderRadius: '6px', whiteSpace: 'nowrap' }}
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTopicId(null)}
                            className="btn"
                            style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.78rem', padding: '6px 10px', borderRadius: '6px', whiteSpace: 'nowrap' }}
                          >
                            취소
                          </button>
                        </div>
                        {/* Preset quick icons when editing */}
                        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                          {PRESET_ICONS.slice(0, 10).map(icon => (
                            <button
                              key={icon}
                              type="button"
                              onClick={() => setEditTopicIcon(icon)}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.9rem' }}
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={topic.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>{topic.icon}</span>
                        <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                          {topic.name}
                        </span>
                        <span style={{ fontSize: '0.74rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '8px' }}>
                          {memoCount}건
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => handleStartEditTopic(topic)}
                          className="btn"
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            color: '#334155',
                            fontSize: '0.74rem',
                            padding: '4px 10px',
                            borderRadius: '6px'
                          }}
                          title="카테고리 제목 및 아이콘 편집"
                        >
                          ✏️ 수정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTopic(topic.id, topic.name)}
                          className="btn"
                          style={{
                            background: '#fee2e2',
                            border: '1px solid #fecaca',
                            color: '#dc2626',
                            fontSize: '0.74rem',
                            padding: '4px 10px',
                            borderRadius: '6px'
                          }}
                          title="카테고리 삭제"
                        >
                          🗑️ 삭제
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
              <button
                type="button"
                onClick={handleResetDefaultTopics}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#64748b',
                  fontSize: '0.78rem',
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }}
              >
                기본 카테고리 목록으로 초기화
              </button>

              <button
                type="button"
                className="btn"
                onClick={() => {
                  setIsTopicModalOpen(false);
                  setEditingTopicId(null);
                }}
                style={{
                  background: 'var(--accent)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  borderRadius: '9999px',
                  padding: '8px 24px'
                }}
              >
                완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
