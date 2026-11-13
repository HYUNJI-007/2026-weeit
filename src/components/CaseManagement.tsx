import React, { useState } from 'react';
import { CounselingRecord, AttachmentItem } from '../types';
import { cleanDateStr, cleanTimeStr, formatGradeDisplay, formatNextAppointment, getRecordDateTimeMs } from '../utils/dateTime';
import { printCounselingReport, printStudentAllSessionsReport, printAllRecordsRoster } from '../utils/printHelpers';
import { readFileAsBase64, postUpdateRecordPayload } from '../services/googleSyncService';
import { CaseNumberManagerModal } from './CaseNumberManagerModal';

interface CaseManagementProps {
  records: CounselingRecord[];
  scriptUrl: string;
  onEditRecord: (record: CounselingRecord) => void;
  onOpenCareCard: (studentName: string) => void;
  onOpenClientInfoEdit: (studentName: string) => void;
  onReload: () => Promise<void>;
  hasCareCard: (name: string) => boolean;
  initialSelectedStudent?: string;
}

export const CaseManagement: React.FC<CaseManagementProps> = ({
  records,
  scriptUrl,
  onEditRecord,
  onOpenCareCard,
  onOpenClientInfoEdit,
  onReload,
  hasCareCard,
  initialSelectedStudent
}) => {
  const [searchName, setSearchName] = useState('');
  const [selectedName, setSelectedName] = useState<string>(initialSelectedStudent || '');
  const [isRosterCollapsed, setIsRosterCollapsed] = useState(false);
  const [rosterSort, setRosterSort] = useState<'recent' | 'name'>('recent');
  const [isCaseNumberModalOpen, setIsCaseNumberModalOpen] = useState(false);
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');

  React.useEffect(() => {
    if (initialSelectedStudent) {
      setSelectedName(initialSelectedStudent);
    }
  }, [initialSelectedStudent]);

  const [studentConsentFiles, setStudentConsentFiles] = useState<File[]>([]);
  const [parentConsentFiles, setParentConsentFiles] = useState<File[]>([]);
  const [isConsentUploading, setIsConsentUploading] = useState<'student' | 'parent' | null>(null);
  const [consentMsg, setConsentMsg] = useState<{ kind: 'student' | 'parent'; text: string } | null>(null);

  const studentMap = new Map<string, CounselingRecord[]>();
  records.forEach(r => {
    const n = r.name.trim();
    if (!n) return;
    if (!studentMap.has(n)) studentMap.set(n, []);
    studentMap.get(n)!.push(r);
  });

  const rosterList = Array.from(studentMap.entries()).map(([name, recs]) => {
    const dates = recs.map(r => cleanDateStr(r.date)).filter(Boolean).sort();
    const last = recs[recs.length - 1];
    return {
      name,
      recs,
      count: recs.length,
      lastDate: dates.length ? dates[dates.length - 1] : '',
      info: last
    };
  });

  let filteredRoster = rosterList.slice();
  const query = (searchName && searchName !== selectedName) ? searchName : '';
  if (query) {
    filteredRoster = filteredRoster.filter(x => x.name.includes(query));
  }
  if (rosterSort === 'name') {
    filteredRoster.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  } else {
    filteredRoster.sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || '') || a.name.localeCompare(b.name, 'ko'));
  }

  const currentStudentRecords = selectedName
    ? (studentMap.get(selectedName) || []).slice().sort((a, b) => {
        const ta = getRecordDateTimeMs(a.date, a.startTime);
        const tb = getRecordDateTimeMs(b.date, b.startTime);
        if (ta !== tb) return tb - ta;
        return Number(b.rowNum || 0) - Number(a.rowNum || 0);
      })
    : [];

  const currentStudentInfo = currentStudentRecords[0] || null;

  const TAG_STUDENT = '[학생동의서]';
  const TAG_PARENT = '[학부모동의서]';

  const getConsentItems = (kind: 'student' | 'parent') => {
    const tag = kind === 'student' ? TAG_STUDENT : TAG_PARENT;
    const items: { item: AttachmentItem; rec: CounselingRecord }[] = [];
    currentStudentRecords.forEach(r => {
      (r.attachments || []).forEach(att => {
        if (att.name && att.name.includes(tag)) {
          items.push({ item: att, rec: r });
        }
      });
    });
    return items;
  };

  const studentConsentList = getConsentItems('student');
  const parentConsentList = getConsentItems('parent');

  const handleSelectStudent = (name: string) => {
    setSelectedName(name);
    setSearchName(name);
    setIsRosterCollapsed(true);
    setSessionSearchQuery('');
  };

  const handleConsentUpload = async (kind: 'student' | 'parent') => {
    const files = kind === 'student' ? studentConsentFiles : parentConsentFiles;
    if (files.length === 0) {
      setConsentMsg({ kind, text: '업로드할 파일을 먼저 선택해주세요.' });
      return;
    }
    if (!currentStudentInfo) return;

    setIsConsentUploading(kind);
    setConsentMsg({ kind, text: '업로드 중... 잠시만 기다려주세요.' });

    try {
      const tag = kind === 'student' ? TAG_STUDENT : TAG_PARENT;
      const filePayloads = await Promise.all(files.map(readFileAsBase64));
      filePayloads.forEach(f => {
        if (!f.name.includes(tag)) {
          f.name = `${tag} ${f.name}`;
        }
      });

      const targetRecord = currentStudentRecords[currentStudentRecords.length - 1];
      const existing = targetRecord.attachments || [];

      const payload = {
        rowNum: targetRecord.rowNum,
        counselor: targetRecord.counselor || '',
        name: targetRecord.name,
        school: targetRecord.school,
        grade: targetRecord.grade,
        classNum: targetRecord.classNum,
        gender: targetRecord.gender,
        birth: targetRecord.birth,
        phone: targetRecord.phone,
        parentPhone: targetRecord.parentPhone,
        caseNum: targetRecord.caseNum,
        session: targetRecord.session,
        date: cleanDateStr(targetRecord.date),
        startTime: cleanTimeStr(targetRecord.startTime),
        endTime: cleanTimeStr(targetRecord.endTime),
        media: targetRecord.media || '면담',
        big: targetRecord.big,
        mid: targetRecord.mid,
        small: targetRecord.small,
        nextDate: '',
        nextTime: '',
        neisTitle: targetRecord.neisTitle,
        neisContent: targetRecord.neisContent,
        content: targetRecord.content,
        existingAttachments: JSON.stringify(existing),
        attachments: filePayloads
      };

      await postUpdateRecordPayload(scriptUrl, payload);
      await onReload();

      if (kind === 'student') setStudentConsentFiles([]);
      else setParentConsentFiles([]);

      setConsentMsg({ kind, text: '' });
    } catch (err: any) {
      console.error(err);
      setConsentMsg({ kind, text: `⚠️ 업로드 실패: ${err.message || err}` });
    } finally {
      setIsConsentUploading(null);
    }
  };

  const handleRemoveConsent = async (kind: 'student' | 'parent', item: AttachmentItem, rec: CounselingRecord) => {
    const cleanNm = item.name.replace(/\[.*?\]/g, '').trim() || '동의서';
    if (!confirm(`"${cleanNm}" 파일을 동의서 목록에서 삭제할까요?\n(구글 드라이브의 원본 파일은 그대로 남아 있을 수 있습니다.)`)) {
      return;
    }
    try {
      const remaining = (rec.attachments || []).filter(a => a.name !== item.name);
      const payload = {
        rowNum: rec.rowNum,
        counselor: rec.counselor || '',
        name: rec.name,
        school: rec.school,
        grade: rec.grade,
        classNum: rec.classNum,
        gender: rec.gender,
        birth: rec.birth,
        phone: rec.phone,
        parentPhone: rec.parentPhone,
        caseNum: rec.caseNum,
        session: rec.session,
        date: cleanDateStr(rec.date),
        startTime: cleanTimeStr(rec.startTime),
        endTime: cleanTimeStr(rec.endTime),
        media: rec.media || '면담',
        big: rec.big,
        mid: rec.mid,
        small: rec.small,
        nextDate: '',
        nextTime: '',
        neisTitle: rec.neisTitle,
        neisContent: rec.neisContent,
        content: rec.content,
        existingAttachments: JSON.stringify(remaining),
        attachments: []
      };

      await postUpdateRecordPayload(scriptUrl, payload);
      await onReload();
    } catch (err: any) {
      alert(`삭제 오류: ${err.message || err}`);
    }
  };

  return (
    <div id="casePage">
      {/* Search Bar */}
      <div className="card no-print">
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            id="searchName"
            placeholder="내담자 이름을 입력하세요."
            style={{ flex: 1 }}
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const match = rosterList.find(x => x.name === searchName.trim());
                if (match) handleSelectStudent(match.name);
              }
            }}
          />
          <button
            className="btn"
            type="button"
            onClick={() => {
              const match = rosterList.find(x => x.name === searchName.trim());
              if (match) handleSelectStudent(match.name);
            }}
            style={{ background: '#2563eb', color: '#ffffff', fontWeight: 800, padding: '9px 20px', borderRadius: '10px' }}
          >
            조회
          </button>
        </div>
      </div>

      {/* Roster Card */}
      <div className={`card no-print ${isRosterCollapsed ? 'collapsed' : ''}`} id="rosterCard">
        <div className="card-title">
          <span>
            👥 내담자 명단{' '}
            <span id="rosterCount" style={{ fontSize: '0.8rem', color: 'var(--text-sub)', fontWeight: 600 }}>
              {isRosterCollapsed && selectedName ? `· 선택: ${selectedName}` : query ? `(${filteredRoster.length} / 총 ${rosterList.length}명)` : `(총 ${rosterList.length}명)`}
            </span>
          </span>
          <span style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              onClick={() => printAllRecordsRoster(records)}
              style={{
                background: '#e0f2fe',
                color: '#0369a1',
                border: '1px solid #bae6fd',
                fontSize: '0.8rem',
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: '8px'
              }}
              title="센터 및 학교 전체 상담·자문 누적 기록 대장 인쇄"
            >
              📚 전체 상담대장 출력
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setIsCaseNumberModalOpen(true)}
              style={{
                background: '#f1f5f9',
                color: '#334155',
                border: '1px solid #cbd5e1',
                fontSize: '0.8rem',
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: '8px'
              }}
              title="사례번호 일괄 수정, 중복 확인 및 순차 자동 재부여"
            >
              🔢 사례번호 일괄 조정
            </button>
            <select
              id="rosterSort"
              value={rosterSort}
              onChange={(e) => setRosterSort(e.target.value as any)}
              style={{ width: 'auto', height: '34px', fontSize: '0.8rem' }}
            >
              <option value="recent">최근 상담순</option>
              <option value="name">이름순</option>
            </select>
            <button
              type="button"
              id="rosterToggle"
              className="btn"
              onClick={() => setIsRosterCollapsed(!isRosterCollapsed)}
              style={{
                background: '#f8fafc',
                color: 'var(--text-main)',
                border: '1px solid var(--border)',
                fontSize: '0.8rem',
                padding: '7px 14px',
                borderRadius: '8px',
                fontWeight: 700
              }}
            >
              {isRosterCollapsed ? '▼ 명단 펼치기' : '▲ 접기'}
            </button>
          </span>
        </div>

        <div id="rosterList" className="roster-grid">
          {filteredRoster.length === 0 ? (
            <div className="roster-empty">
              {rosterList.length ? '일치하는 내담자가 없습니다.' : '불러온 상담 기록이 없습니다.'}
            </div>
          ) : (
            filteredRoster.map(item => {
              const info = item.info;
              const school = info.school || '';
              const grade = formatGradeDisplay(info.grade);
              const cls = info.classNum ? `${info.classNum}반` : '';
              const line1 = [school, grade, cls].filter(Boolean).join(' ');
              const last = item.lastDate ? item.lastDate.slice(5).replace('-', '/') : '-';
              const cardBadge = hasCareCard(item.name) ? ' · 📇' : '';

              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => handleSelectStudent(item.name)}
                  className={`roster-item ${item.name === selectedName ? 'active' : ''}`}
                >
                  <div className="roster-name">
                    {item.name}
                    {info.gender && (
                      <span style={{ fontWeight: 600, color: 'var(--text-sub)', fontSize: '.8rem' }}>
                        {' '}({info.gender})
                      </span>
                    )}
                  </div>
                  <div className="roster-sub">
                    {line1 || '-'}<br />
                    사례 {info.caseNum || '-'} · {item.count}회기 · 최근 {last}{cardBadge}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Target History */}
      <div id="historyTarget">
        {currentStudentInfo ? (
          <>
            {/* Case Header */}
            <div className="case-header">
              <div className="case-badge">
                <span className="case-badge-label">사례번호</span>
                <span className="case-badge-number">{currentStudentInfo.caseNum || '-'}</span>
              </div>
              <button
                type="button"
                className="btn no-print"
                onClick={() => onOpenClientInfoEdit(currentStudentInfo.name)}
                style={{
                  marginLeft: '8px',
                  background: '#f8fafc',
                  color: '#334155',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  padding: '7px 14px',
                  borderRadius: '999px'
                }}
                title="이 내담자의 사례번호 및 인적사항 수정"
              >
                ✏️ 사례번호 변경
              </button>
              <button
                type="button"
                className="btn no-print"
                onClick={() => onOpenCareCard(currentStudentInfo.name)}
                style={{
                  marginLeft: '8px',
                  background: '#fff',
                  color: 'var(--text-sub)',
                  border: '1.5px solid var(--border)',
                  fontSize: '0.8rem',
                  padding: '7px 14px',
                  borderRadius: '999px',
                  fontWeight: 700
                }}
              >
                📇 기록물 관리카드
              </button>
              <button
                type="button"
                className="btn no-print"
                onClick={() => printStudentAllSessionsReport(currentStudentInfo.name, currentStudentRecords)}
                style={{
                  marginLeft: '8px',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1.5px solid #bfdbfe',
                  fontSize: '0.8rem',
                  padding: '7px 14px',
                  borderRadius: '999px',
                  fontWeight: 800,
                  boxShadow: '0 1px 3px rgba(37, 99, 235, 0.12)'
                }}
                title="이 내담자의 1회기부터 전 회기까지 모든 상담기록지 일괄 인쇄"
              >
                🖨️ 전 회기 일괄 출력 ({currentStudentRecords.length}회기)
              </button>
            </div>

            {/* Info Box */}
            <div className="info-box" style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn no-print"
                onClick={() => onOpenClientInfoEdit(currentStudentInfo.name)}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: '#2563eb',
                  color: '#fff',
                  fontSize: '0.75rem',
                  padding: '6px 12px',
                  borderRadius: '8px'
                }}
              >
                ✏️ 인적사항 수정
              </button>
              <div><strong>성명:</strong> {currentStudentInfo.name} ({currentStudentInfo.gender || '-'})</div>
              <div><strong>생년월일:</strong> {currentStudentInfo.birth || '-'}</div>
              <div><strong>학교:</strong> {currentStudentInfo.school || '-'}</div>
              <div><strong>학년/반:</strong> {currentStudentInfo.grade ? `${currentStudentInfo.grade}학년` : '-'} {currentStudentInfo.classNum ? `${currentStudentInfo.classNum}반` : ''}</div>
              <div><strong>내담자 연락처:</strong> {currentStudentInfo.phone || '-'}</div>
              <div><strong>학부모 연락처:</strong> {currentStudentInfo.parentPhone || '-'}</div>
              <div><strong>진행회기:</strong> 총 {currentStudentRecords.length}회기</div>
            </div>

            {/* 상담 동의서(스캔본) 전용 카드 */}
            <div className="card no-print" id="consentCard" style={{ marginTop: '14px' }}>
              <div className="card-title">
                <span>📄 상담 동의서 (스캔본)</span>
                <span style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--text-sub)' }}>
                  사진·PDF 가능 · 여러 장 선택 가능
                </span>
              </div>

              <div className="consent-grid">
                {/* 학생용 */}
                <div className="consent-slot">
                  <div className="consent-head">
                    <b>학생용 상담 동의서</b>
                    <span className={`consent-badge ${studentConsentList.length ? 'ok' : 'no'}`}>
                      {studentConsentList.length ? '제출 완료' : '미제출'}
                    </span>
                  </div>
                  <div className="consent-files">
                    {studentConsentList.length > 0 ? (
                      studentConsentList.map((x, i) => {
                        const nm = x.item.name.replace(TAG_STUDENT, '').trim() || '동의서';
                        return (
                          <span key={i} className="consent-chip">
                            {x.item.url ? (
                              <a href={x.item.url} target="_blank" rel="noopener noreferrer">📎 {nm}</a>
                            ) : (
                              <span>📎 {nm}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveConsent('student', x.item, x.rec)}
                              title="목록에서 삭제"
                            >
                              ✕
                            </button>
                          </span>
                        );
                      })
                    ) : (
                      <span style={{ color: 'var(--text-sub)', fontSize: '.8rem' }}>아직 업로드된 파일이 없습니다.</span>
                    )}
                  </div>
                  <div className="consent-up">
                    <input
                      type="file"
                      id="consentFile_student"
                      accept="image/*,.pdf"
                      multiple
                      style={{ padding: '8px', height: 'auto', flex: 1, minWidth: 0 }}
                      onChange={(e) => setStudentConsentFiles(Array.from(e.target.files || []))}
                    />
                    <button
                      type="button"
                      className="btn"
                      disabled={isConsentUploading === 'student'}
                      onClick={() => handleConsentUpload('student')}
                      style={{ background: 'var(--primary)', color: '#fff', padding: '9px 14px', whiteSpace: 'nowrap' }}
                    >
                      {isConsentUploading === 'student' ? '업로드...' : '⬆️ 업로드'}
                    </button>
                  </div>
                  {consentMsg?.kind === 'student' && (
                    <div className="consent-msg">{consentMsg.text}</div>
                  )}
                </div>

                {/* 학부모용 */}
                <div className="consent-slot">
                  <div className="consent-head">
                    <b>학부모용 상담 동의서</b>
                    <span className={`consent-badge ${parentConsentList.length ? 'ok' : 'no'}`}>
                      {parentConsentList.length ? '제출 완료' : '미제출'}
                    </span>
                  </div>
                  <div className="consent-files">
                    {parentConsentList.length > 0 ? (
                      parentConsentList.map((x, i) => {
                        const nm = x.item.name.replace(TAG_PARENT, '').trim() || '동의서';
                        return (
                          <span key={i} className="consent-chip">
                            {x.item.url ? (
                              <a href={x.item.url} target="_blank" rel="noopener noreferrer">📎 {nm}</a>
                            ) : (
                              <span>📎 {nm}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveConsent('parent', x.item, x.rec)}
                              title="목록에서 삭제"
                            >
                              ✕
                            </button>
                          </span>
                        );
                      })
                    ) : (
                      <span style={{ color: 'var(--text-sub)', fontSize: '.8rem' }}>아직 업로드된 파일이 없습니다.</span>
                    )}
                  </div>
                  <div className="consent-up">
                    <input
                      type="file"
                      id="consentFile_parent"
                      accept="image/*,.pdf"
                      multiple
                      style={{ padding: '8px', height: 'auto', flex: 1, minWidth: 0 }}
                      onChange={(e) => setParentConsentFiles(Array.from(e.target.files || []))}
                    />
                    <button
                      type="button"
                      className="btn"
                      disabled={isConsentUploading === 'parent'}
                      onClick={() => handleConsentUpload('parent')}
                      style={{ background: 'var(--primary)', color: '#fff', padding: '9px 14px', whiteSpace: 'nowrap' }}
                    >
                      {isConsentUploading === 'parent' ? '업로드...' : '⬆️ 업로드'}
                    </button>
                  </div>
                  {consentMsg?.kind === 'parent' && (
                    <div className="consent-msg">{consentMsg.text}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Session Search & Quick Filter Bar */}
            {(() => {
              const availableSessions = Array.from(
                new Set(currentStudentRecords.map(r => Number(r.session)).filter(n => !isNaN(n) && n > 0))
              ).sort((a, b) => a - b);

              const cleanSessionQuery = sessionSearchQuery.trim();
              const sessionNumQuery = cleanSessionQuery.match(/\d+/)?.[0];

              const displayedStudentRecords = currentStudentRecords.filter(r => {
                if (!cleanSessionQuery) return true;
                if (sessionNumQuery) {
                  return String(r.session) === sessionNumQuery;
                }
                return String(r.session).includes(cleanSessionQuery);
              });

              return (
                <>
                  <div
                    className="card no-print"
                    style={{
                      marginTop: '16px',
                      marginBottom: '16px',
                      padding: '16px 20px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '16px',
                      background: '#f8fafc',
                      boxShadow: '0 1px 4px rgba(0, 0, 0, 0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>🔎</span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.94rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>회기별 기록 검색 &amp; 바로가기</span>
                            <span style={{ fontSize: '0.78rem', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '12px', fontWeight: 800 }}>
                              총 {currentStudentRecords.length}회기
                            </span>
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-sub)', marginTop: '2px' }}>
                            검색창에 회기 번호를 입력하거나 아래 회기 번호 버튼을 누르면 해당 회기 기록만 즉시 표시됩니다.
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 240px', maxWidth: '340px' }}>
                        <input
                          type="text"
                          placeholder="회기 검색"
                          value={sessionSearchQuery}
                          onChange={(e) => setSessionSearchQuery(e.target.value)}
                          style={{
                            height: '38px',
                            fontSize: '0.84rem',
                            textAlign: 'center',
                            borderRadius: '9999px',
                            padding: '0 16px',
                            border: sessionSearchQuery ? '1.5px solid #2563eb' : '1.5px solid var(--border)',
                            boxShadow: sessionSearchQuery ? '0 0 0 3px rgba(37, 99, 235, 0.15)' : 'none'
                          }}
                        />
                        {sessionSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setSessionSearchQuery('')}
                            className="btn"
                            style={{
                              padding: '6px 14px',
                              fontSize: '0.78rem',
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              color: '#475569',
                              borderRadius: '9999px',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            ✕ 전체
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Compact Session Navigator: Dropdown + Steppers + Quick Shortcuts */}
                    {(() => {
                      const currentSessionIdx = sessionNumQuery ? availableSessions.indexOf(Number(sessionNumQuery)) : -1;
                      const handlePrevSession = () => {
                        if (currentSessionIdx > 0) {
                          setSessionSearchQuery(String(availableSessions[currentSessionIdx - 1]));
                        }
                      };
                      const handleNextSession = () => {
                        if (currentSessionIdx !== -1 && currentSessionIdx < availableSessions.length - 1) {
                          setSessionSearchQuery(String(availableSessions[currentSessionIdx + 1]));
                        } else if (currentSessionIdx === -1 && availableSessions.length > 0) {
                          setSessionSearchQuery(String(availableSessions[0]));
                        }
                      };

                      return (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px', alignItems: 'center' }}>
                          {/* Session Dropdown Selector */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 220px' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-sub)', whiteSpace: 'nowrap' }}>
                              회기 선택:
                            </span>
                            <select
                              value={sessionNumQuery || ''}
                              onChange={(e) => setSessionSearchQuery(e.target.value)}
                              style={{
                                height: '36px',
                                fontSize: '0.84rem',
                                fontWeight: 700,
                                borderRadius: '9999px',
                                padding: '0 14px',
                                border: '1.5px solid',
                                borderColor: sessionSearchQuery ? '#2563eb' : 'var(--border)',
                                background: sessionSearchQuery ? '#eff6ff' : '#ffffff',
                                color: sessionSearchQuery ? '#1d4ed8' : 'var(--text-main)',
                                cursor: 'pointer',
                                flex: 1
                              }}
                            >
                              <option value="">전체 회기 목록 보기 ({currentStudentRecords.length}회기)</option>
                              {availableSessions.map(sess => {
                                const matchRec = currentStudentRecords.find(r => Number(r.session) === sess);
                                const dateStr = matchRec ? cleanDateStr(matchRec.date) : '';
                                const midStr = matchRec?.mid ? ` · ${matchRec.mid}` : '';
                                return (
                                  <option key={sess} value={String(sess)}>
                                    제 {sess}회기 {dateStr ? `(${dateStr}${midStr})` : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          {/* Stepper Buttons (Previous / Next) */}
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              disabled={!sessionNumQuery || currentSessionIdx <= 0}
                              onClick={handlePrevSession}
                              title="이전 회기 보기"
                              style={{
                                border: '1px solid var(--border)',
                                background: '#ffffff',
                                color: 'var(--text-main)',
                                padding: '6px 12px',
                                borderRadius: '9999px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                opacity: (!sessionNumQuery || currentSessionIdx <= 0) ? 0.4 : 1
                              }}
                            >
                              ◀ 이전
                            </button>

                            <button
                              type="button"
                              disabled={currentSessionIdx === -1 || currentSessionIdx >= availableSessions.length - 1}
                              onClick={handleNextSession}
                              title="다음 회기 보기"
                              style={{
                                border: '1px solid var(--border)',
                                background: '#ffffff',
                                color: 'var(--text-main)',
                                padding: '6px 12px',
                                borderRadius: '9999px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                opacity: (currentSessionIdx === -1 || currentSessionIdx >= availableSessions.length - 1) ? 0.4 : 1
                              }}
                            >
                              다음 ▶
                            </button>
                          </div>

                          {/* Quick Jump Shortcuts */}
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              onClick={() => setSessionSearchQuery('1')}
                              style={{
                                border: '1px solid var(--border)',
                                background: sessionNumQuery === '1' ? '#2563eb' : '#ffffff',
                                color: sessionNumQuery === '1' ? '#ffffff' : 'var(--text-sub)',
                                padding: '6px 12px',
                                borderRadius: '9999px',
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              1회기
                            </button>
                            {availableSessions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setSessionSearchQuery(String(availableSessions[availableSessions.length - 1]))}
                                style={{
                                  border: '1px solid var(--border)',
                                  background: sessionNumQuery === String(availableSessions[availableSessions.length - 1]) ? '#2563eb' : '#ffffff',
                                  color: sessionNumQuery === String(availableSessions[availableSessions.length - 1]) ? '#ffffff' : 'var(--text-sub)',
                                  padding: '6px 12px',
                                  borderRadius: '9999px',
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                최근({availableSessions[availableSessions.length - 1]}회기)
                              </button>
                            )}
                            {sessionSearchQuery && (
                              <button
                                type="button"
                                onClick={() => setSessionSearchQuery('')}
                                style={{
                                  border: '1px solid #cbd5e1',
                                  background: '#f1f5f9',
                                  color: '#334155',
                                  padding: '6px 12px',
                                  borderRadius: '9999px',
                                  fontSize: '0.76rem',
                                  fontWeight: 800,
                                  cursor: 'pointer'
                                }}
                              >
                                ✕ 전체
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {sessionSearchQuery && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '8px 14px',
                          background: '#eff6ff',
                          borderRadius: '10px',
                          fontSize: '0.82rem',
                          color: '#1d4ed8',
                          fontWeight: 800,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          border: '1px solid #bfdbfe'
                        }}
                      >
                        <span>
                          🎯 {sessionNumQuery ? `제 ${sessionNumQuery}회기` : `"${sessionSearchQuery}"`} 검색 결과: {displayedStudentRecords.length}건
                        </span>
                        <button
                          type="button"
                          onClick={() => setSessionSearchQuery('')}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#2563eb',
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                            fontWeight: 800
                          }}
                        >
                          전체 회기 목록으로 초기화
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Render filtered session logs */}
                  {displayedStudentRecords.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-sub)' }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🔍</div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                        {sessionSearchQuery ? `제 ${sessionSearchQuery}회기에 해당하는 상담 기록이 없습니다.` : '기록이 없습니다.'}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSessionSearchQuery('')}
                        className="btn"
                        style={{ marginTop: '12px', background: '#2563eb', color: '#fff', fontSize: '0.8rem', borderRadius: '9999px' }}
                      >
                        전체 회기 목록 보기
                      </button>
                    </div>
                  ) : (
                    displayedStudentRecords.map((r, idx) => {
                      let diaryType = '상담일지';
                      if (r.big === '자문') diaryType = '자문일지';
                      else if (r.big === '검사') diaryType = '검사일지';
                      else if (r.big === '교육') diaryType = '교육일지';
                      if (r.mid === '학부모상담') diaryType = '학부모 상담일지';

                      const normalAttachments = (r.attachments || []).filter(
                        it => !(it.name && (it.name.includes(TAG_STUDENT) || it.name.includes(TAG_PARENT)))
                      );

                      const isSearchedSession = sessionNumQuery && String(r.session) === sessionNumQuery;

                      return (
                        <div
                          key={r.rowNum || idx}
                          id={`session-card-${r.session}`}
                          className="card"
                          style={{
                            border: isSearchedSession ? '2px solid #2563eb' : undefined,
                            boxShadow: isSearchedSession ? '0 4px 16px rgba(37, 99, 235, 0.15)' : undefined
                          }}
                        >
                          <div className="card-title">
                            <span>
                              제 {r.session || ''}회기 {diaryType} ({cleanDateStr(r.date)})
                              {isSearchedSession && (
                                <span style={{ marginLeft: '8px', fontSize: '0.78rem', color: '#fff', background: '#2563eb', padding: '2px 8px', borderRadius: '12px' }}>
                                  선택된 회기
                                </span>
                              )}
                            </span>
                            <div>
                      <button
                        className="btn no-print"
                        onClick={() => onEditRecord(r)}
                        style={{ background: '#3b82f6', color: 'white', fontSize: '0.75rem', padding: '6px 12px', marginRight: '5px', borderRadius: '6px' }}
                      >
                        ✏️ 수정
                      </button>
                      <button
                        className="btn no-print"
                        onClick={() => printCounselingReport(r)}
                        style={{ background: '#64748b', color: 'white', fontSize: '0.75rem', padding: '6px 12px' }}
                      >
                        🖨️ 기록지 인쇄
                      </button>
                    </div>
                  </div>

                  <table className="stat-table">
                    <tbody>
                      <tr>
                        <th style={{ width: '15%' }}>상담자</th>
                        <td style={{ width: '35%' }}>{r.counselor || ''}</td>
                        <th style={{ width: '15%' }}>상담일시</th>
                        <td style={{ width: '35%' }}>{cleanDateStr(r.date)} ({cleanTimeStr(r.startTime)} ~ {cleanTimeStr(r.endTime)})</td>
                      </tr>
                      <tr>
                        <th style={{ width: '15%' }}>상담유형</th>
                        <td style={{ width: '35%', textAlign: 'left', paddingLeft: '15px' }}>
                          {r.big || ''} &gt; {r.mid || ''} ({r.small || ''})
                        </td>
                        <th style={{ width: '15%' }}>상담매체</th>
                        <td style={{ width: '35%' }}>
                          {r.media || '-'}
                        </td>
                      </tr>
                      <tr>
                        <td
                          colSpan={4}
                          style={{
                            textAlign: 'left',
                            padding: '20px',
                            whiteSpace: 'pre-line',
                            minHeight: '150px',
                            background: '#fff',
                            lineHeight: 1.6
                          }}
                        >
                          {r.content || ''}
                        </td>
                      </tr>
                      {r.nextAppointment && (
                        <tr>
                          <th>다음약속</th>
                          <td
                            colSpan={3}
                            style={{
                              color: '#d19a00',
                              fontWeight: 'bold',
                              textAlign: 'left',
                              paddingLeft: '15px',
                              background: '#fffdf5'
                            }}
                          >
                            📅 {formatNextAppointment(r.nextAppointment)}
                          </td>
                        </tr>
                      )}
                      {normalAttachments.length > 0 && (
                        <tr>
                          <th>첨부파일</th>
                          <td colSpan={3} style={{ textAlign: 'left', padding: '12px 15px', background: '#fff' }}>
                            {normalAttachments.map((item, i) => (
                              item.url ? (
                                <a
                                  key={i}
                                  className="link-chip"
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  📎 {item.name || '첨부파일'}
                                </a>
                              ) : (
                                <span
                                  key={i}
                                  className="link-chip"
                                  style={{ background: '#f1f5f9', color: '#475569' }}
                                >
                                  📎 {item.name || '첨부파일'}
                                </span>
                              )
                            ))}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </>
      );
    })()}
  </>
        ) : (
          <div className="card">기록이 없습니다.</div>
        )}
      </div>

      {/* Case Number Manager Modal */}
      {isCaseNumberModalOpen && (
        <CaseNumberManagerModal
          isOpen={isCaseNumberModalOpen}
          onClose={() => setIsCaseNumberModalOpen(false)}
          records={records}
          scriptUrl={scriptUrl}
          onReload={onReload}
        />
      )}
    </div>
  );
};
