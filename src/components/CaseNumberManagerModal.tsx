import React, { useState, useMemo } from 'react';
import { CounselingRecord } from '../types';
import { cleanDateStr, cleanTimeStr, splitDateTime, pad2 } from '../utils/dateTime';
import { postUpdateRecordPayload } from '../services/googleSyncService';
import { parseCaseNumber, findDuplicateCaseNumbers } from '../utils/caseNumberUtils';

interface CaseNumberManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: CounselingRecord[];
  scriptUrl: string;
  onReload: () => Promise<void>;
}

interface StudentCaseRow {
  name: string;
  school: string;
  grade: string;
  classNum: string;
  currentCaseNum: string;
  newCaseNum: string;
  sessionCount: number;
  records: CounselingRecord[];
}

export const CaseNumberManagerModal: React.FC<CaseNumberManagerModalProps> = ({
  isOpen,
  onClose,
  records,
  scriptUrl,
  onReload
}) => {
  // Aggregate students
  const initialStudentRows: StudentCaseRow[] = useMemo(() => {
    const studentMap = new Map<string, CounselingRecord[]>();
    records.forEach(r => {
      const n = (r.name || '').trim();
      if (!n) return;
      if (!studentMap.has(n)) studentMap.set(n, []);
      studentMap.get(n)!.push(r);
    });

    const rows: StudentCaseRow[] = [];
    studentMap.forEach((studentRecords, name) => {
      // Find latest record for basic info
      const latest = studentRecords[studentRecords.length - 1];
      const caseNum = (latest.caseNum || '').trim();

      rows.push({
        name,
        school: latest.school || '',
        grade: latest.grade || '',
        classNum: latest.classNum || '',
        currentCaseNum: caseNum,
        newCaseNum: caseNum,
        sessionCount: studentRecords.length,
        records: studentRecords
      });
    });

    // Default sort by case number, then name
    rows.sort((a, b) => {
      if (a.currentCaseNum && b.currentCaseNum) {
        return a.currentCaseNum.localeCompare(b.currentCaseNum, undefined, { numeric: true });
      }
      if (a.currentCaseNum) return -1;
      if (b.currentCaseNum) return 1;
      return a.name.localeCompare(b.name);
    });

    return rows;
  }, [records]);

  const [studentRows, setStudentRows] = useState<StudentCaseRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'normal' | 'roaming' | 'duplicate'>('all');

  // Initialize or reset when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setStudentRows(initialStudentRows);
      setSaveProgress('');
    }
  }, [isOpen, initialStudentRows]);

  // Compute duplicate warnings in real-time
  const duplicateCases = useMemo(() => {
    const counts = new Map<string, string[]>();
    studentRows.forEach(row => {
      const cn = row.newCaseNum.trim();
      if (!cn) return;
      if (!counts.has(cn)) counts.set(cn, []);
      counts.get(cn)!.push(row.name);
    });

    const dups = new Set<string>();
    counts.forEach((names, cn) => {
      if (names.length > 1) {
        dups.add(cn);
      }
    });
    return dups;
  }, [studentRows]);

  if (!isOpen) return null;

  // Handle inline change of a single student's case number
  const handleCaseNumChange = (name: string, value: string) => {
    setStudentRows(prev =>
      prev.map(row => (row.name === name ? { ...row, newCaseNum: value } : row))
    );
  };

  // Auto Renumbering: Sequential numbering
  const handleAutoSequentialRenumber = (type: 'all' | 'normal' | 'roaming') => {
    if (!confirm('현재 명단 순서대로 사례번호를 순차 재부여하시겠습니까?\n(수정 후 [일괄 저장]을 눌러야 스프레드시트에 최종 반영됩니다.)')) {
      return;
    }

    let normalCounter = 1;
    let roamCounter = 1;

    setStudentRows(prev =>
      prev.map(row => {
        const parsed = parseCaseNumber(row.currentCaseNum);
        const isRoaming = parsed ? parsed.isRoaming : (row.school && row.school.includes('순회'));

        if (type === 'normal' && isRoaming) return row;
        if (type === 'roaming' && !isRoaming) return row;

        if (isRoaming) {
          const numStr = pad2(roamCounter++);
          return { ...row, newCaseNum: `2026-R${numStr}` };
        } else {
          const numStr = pad2(normalCounter++);
          return { ...row, newCaseNum: `2026-${numStr}` };
        }
      })
    );
  };

  // Reset changes
  const handleReset = () => {
    setStudentRows(initialStudentRows);
    setSaveProgress('');
  };

  // Count changed students
  const changedCount = studentRows.filter(
    row => row.currentCaseNum.trim() !== row.newCaseNum.trim()
  ).length;

  // Save all modified case numbers to Google Sheets
  const handleSaveAll = async () => {
    const changedRows = studentRows.filter(
      row => row.currentCaseNum.trim() !== row.newCaseNum.trim()
    );

    if (changedRows.length === 0) {
      alert('변경된 사례번호가 없습니다.');
      return;
    }

    if (duplicateCases.size > 0) {
      const confirmDup = confirm(
        `⚠️ 중복된 사례번호(${Array.from(duplicateCases).join(', ')})가 존재합니다.\n그대로 저장하시겠습니까?`
      );
      if (!confirmDup) return;
    }

    if (
      !confirm(
        `총 ${changedRows.length}명의 내담자 사례번호를 수정하여 스프레드시트에 저장합니다. 계속하시겠습니까?`
      )
    ) {
      return;
    }

    setIsSaving(true);
    let totalUpdatedRecords = 0;

    try {
      for (let sIdx = 0; sIdx < changedRows.length; sIdx++) {
        const student = changedRows[sIdx];
        setSaveProgress(`저장 중: ${student.name} (${sIdx + 1}/${changedRows.length}명)`);

        for (const rec of student.records) {
          const nextInfo = splitDateTime(rec.nextAppointment);

          const payload = {
            rowNum: rec.rowNum || '',
            counselor: rec.counselor || '',
            name: rec.name,
            school: rec.school,
            grade: rec.grade,
            classNum: rec.classNum,
            gender: rec.gender,
            birth: rec.birth,
            phone: rec.phone,
            parentPhone: rec.parentPhone,
            caseNum: student.newCaseNum.trim(),
            session: rec.session || 1,
            date: cleanDateStr(rec.date),
            startTime: cleanTimeStr(rec.startTime),
            endTime: cleanTimeStr(rec.endTime),
            media: rec.media || '면담',
            big: rec.big || '',
            mid: rec.mid || '',
            small: rec.small || '',
            nextDate: nextInfo.date || '',
            nextTime: nextInfo.time || '',
            neisTitle: rec.neisTitle || '',
            neisContent: rec.neisContent || '',
            content: rec.content || '',
            existingAttachments: JSON.stringify(rec.attachments || []),
            attachments: []
          };

          await postUpdateRecordPayload(scriptUrl, payload);
          totalUpdatedRecords++;
        }
      }

      await onReload();
      alert(`✅ 성공! ${changedRows.length}명의 사례번호(총 ${totalUpdatedRecords}회기 기록)가 정상 반영되었습니다.`);
      onClose();
    } catch (err: any) {
      console.error(err);
      alert(`저장 중 오류가 발생했습니다: ${err.message || err}`);
    } finally {
      setIsSaving(false);
      setSaveProgress('');
    }
  };

  // Filtered rows for display
  const displayedRows = studentRows.filter(row => {
    if (filterType === 'all') return true;
    const isRoaming = /R/i.test(row.newCaseNum) || (row.school && row.school.includes('순회'));
    if (filterType === 'roaming') return isRoaming;
    if (filterType === 'normal') return !isRoaming;
    if (filterType === 'duplicate') return duplicateCases.has(row.newCaseNum.trim());
    return true;
  });

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(5px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          padding: '24px 28px',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
          border: '1px solid var(--border)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🔢</span>
              사례번호 일괄 관리 및 조정 도구
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-sub)' }}>
              학생별 사례번호를 직접 수정하거나 순차적으로 자동 재부여할 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: '#f1f1f5',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              cursor: 'pointer',
              color: 'var(--text-sub)',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* Action Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', background: '#f8fafc', padding: '12px 14px', borderRadius: '12px', marginBottom: '14px', border: '1px solid var(--border)' }}>
          {/* Quick Renumber Buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              onClick={() => handleAutoSequentialRenumber('normal')}
              style={{
                background: 'var(--accent-light)',
                color: 'var(--accent)',
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 800,
                border: '1px solid rgba(224, 101, 139, 0.3)'
              }}
            >
              🔮 일반 순차정리 (2026-01~)
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => handleAutoSequentialRenumber('roaming')}
              style={{
                background: '#E3F2FD',
                color: '#3A86C8',
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 800,
                border: '1px solid #c2e0f8'
              }}
            >
              ✈️ 순회 순차정리 (2026-R01~)
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleReset}
              style={{
                background: '#ffffff',
                color: 'var(--text-sub)',
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                border: '1px solid var(--border)'
              }}
            >
              ↩️ 되돌리기
            </button>
          </div>

          {/* Filter Chips */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: 700 }}>보기:</span>
            <button
              type="button"
              onClick={() => setFilterType('all')}
              style={{
                border: 'none',
                background: filterType === 'all' ? 'var(--text-main)' : 'transparent',
                color: filterType === 'all' ? '#fff' : 'var(--text-sub)',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              전체 ({studentRows.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('duplicate')}
              style={{
                border: 'none',
                background: filterType === 'duplicate' ? '#ef4444' : 'transparent',
                color: filterType === 'duplicate' ? '#fff' : duplicateCases.size > 0 ? '#ef4444' : 'var(--text-sub)',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              중복 {duplicateCases.size > 0 ? `(${duplicateCases.size}건)` : '(0)'}
            </button>
          </div>
        </div>

        {/* Duplicate Warning Alert if present */}
        {duplicateCases.size > 0 && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 14px', borderRadius: '8px', fontSize: '0.8rem', color: '#991b1b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span>
            <span>
              <strong>중복 사례번호 발견:</strong> {Array.from(duplicateCases).join(', ')} 번호가 2명 이상의 내담자에게 중복 배정되어 있습니다. 번호를 조정해 주세요.
            </span>
          </div>
        )}

        {/* Students Table */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <table className="stat-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 10 }}>
              <tr>
                <th style={{ padding: '9px 10px', width: '50px' }}>No</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>성명</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>학교 / 학년</th>
                <th style={{ padding: '9px 10px', width: '70px' }}>회기수</th>
                <th style={{ padding: '9px 10px', width: '130px' }}>기존 사례번호</th>
                <th style={{ padding: '9px 10px', width: '170px' }}>변경할 사례번호</th>
                <th style={{ padding: '9px 10px', width: '90px' }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '24px', color: 'var(--text-sub)' }}>
                    해당 조건의 내담자가 없습니다.
                  </td>
                </tr>
              ) : (
                displayedRows.map((row, idx) => {
                  const isChanged = row.currentCaseNum.trim() !== row.newCaseNum.trim();
                  const isDup = duplicateCases.has(row.newCaseNum.trim());

                  return (
                    <tr
                      key={row.name}
                      style={{
                        background: isDup ? '#fff5f5' : isChanged ? '#fefce8' : '#ffffff'
                      }}
                    >
                      <td style={{ color: 'var(--text-sub)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 800, textAlign: 'left' }}>{row.name}</td>
                      <td style={{ textAlign: 'left', color: 'var(--text-sub)', fontSize: '0.8rem' }}>
                        {row.school || '-'} {row.grade ? `(${row.grade}학년)` : ''}
                      </td>
                      <td style={{ fontWeight: 700 }}>{row.sessionCount}회</td>
                      <td style={{ color: 'var(--text-sub)', fontWeight: 600 }}>
                        {row.currentCaseNum || '(없음)'}
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.newCaseNum}
                          onChange={e => handleCaseNumChange(row.name, e.target.value)}
                          placeholder="2026-XX"
                          style={{
                            height: '32px',
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderColor: isDup ? '#ef4444' : isChanged ? 'var(--accent)' : 'var(--border)',
                            background: '#ffffff'
                          }}
                        />
                      </td>
                      <td>
                        {isDup ? (
                          <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 800, background: '#fee2e2', padding: '2px 6px', borderRadius: '4px' }}>
                            중복
                          </span>
                        ) : isChanged ? (
                          <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 800, background: '#fef3c7', padding: '2px 6px', borderRadius: '4px' }}>
                            수정됨
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700 }}>
                            유지
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-sub)' }}>
            {saveProgress ? (
              <span style={{ color: 'var(--accent)', fontWeight: 800 }}>⏳ {saveProgress}</span>
            ) : changedCount > 0 ? (
              <span>
                총 <strong style={{ color: 'var(--accent)' }}>{changedCount}명</strong>의 사례번호가 변경 예정입니다.
              </span>
            ) : (
              <span>수정할 사례번호를 입력하거나 자동정리 버튼을 눌러주세요.</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={isSaving}
              style={{ background: '#f1f5f9', color: 'var(--text-sub)', padding: '9px 18px' }}
            >
              닫기
            </button>
            <button
              type="button"
              className="btn btn-save"
              onClick={handleSaveAll}
              disabled={isSaving || changedCount === 0}
              style={{
                background: changedCount > 0 ? 'var(--accent)' : '#cbd5e1',
                color: '#ffffff',
                padding: '9px 24px',
                cursor: changedCount > 0 && !isSaving ? 'pointer' : 'not-allowed'
              }}
            >
              {isSaving ? '저장 중...' : `일괄 저장 (${changedCount}명)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
