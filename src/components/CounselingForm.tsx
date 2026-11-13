import React, { useState, useEffect, useRef } from 'react';
import { CATEGORIES } from '../constants';
import { AttachmentItem, CounselingRecord } from '../types';
import { cleanDateStr, cleanTimeStr, getTodayLocalStr, splitDateTime, pad2 } from '../utils/dateTime';
import { exportToNeis } from '../utils/excelExport';
import { getNextCaseNumber, stepCaseNumber } from '../utils/caseNumberUtils';
import { generateIntelligentClinicalAdvice } from '../utils/clinicalAdvice';

interface CounselingFormProps {
  records: CounselingRecord[];
  editRecord: CounselingRecord | null;
  defaultCounselor: string;
  onSaveCounselor: (name: string) => void;
  onSubmit: (record: CounselingRecord, files: File[], existingAttachments: AttachmentItem[]) => Promise<void>;
  onCancelEdit: () => void;
}

export const CounselingForm: React.FC<CounselingFormProps> = ({
  records,
  editRecord,
  defaultCounselor,
  onSaveCounselor,
  onSubmit,
  onCancelEdit
}) => {
  const [rowNum, setRowNum] = useState<number | undefined>(undefined);
  const [counselor, setCounselor] = useState(defaultCounselor || '');
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');
  const [classNum, setClassNum] = useState('');
  const [gender, setGender] = useState('남');
  const [birth, setBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [caseNum, setCaseNum] = useState('2026-');
  const [session, setSession] = useState<number | string>(1);

  const [date, setDate] = useState(getTodayLocalStr());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [media, setMedia] = useState('면담');

  const [big, setBig] = useState(Object.keys(CATEGORIES)[0]);
  const [mid, setMid] = useState(Object.keys(CATEGORIES[Object.keys(CATEGORIES)[0]])[0] || '');
  const [small, setSmall] = useState(CATEGORIES[Object.keys(CATEGORIES)[0]][Object.keys(CATEGORIES[Object.keys(CATEGORIES)[0]])[0]]?.[0] || '');

  const [nextDate, setNextDate] = useState('');
  const [nextTime, setNextTime] = useState('');

  const [neisTitle, setNeisTitle] = useState('');
  const [neisContent, setNeisContent] = useState('');
  const [content, setContent] = useState('');

  const [existingAttachments, setExistingAttachments] = useState<AttachmentItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (defaultCounselor && !counselor) {
      setCounselor(defaultCounselor);
    }
  }, [defaultCounselor]);

  useEffect(() => {
    if (editRecord) {
      setRowNum(editRecord.rowNum);
      setName(editRecord.name || '');
      setSchool(editRecord.school || '');
      setGrade(editRecord.grade || '');
      setClassNum(editRecord.classNum || '');
      setGender(editRecord.gender || '남');
      setBirth(editRecord.birth || '');
      setPhone(editRecord.phone || '');
      setParentPhone(editRecord.parentPhone || '');
      setCounselor(editRecord.counselor || defaultCounselor || '');
      setCaseNum(editRecord.caseNum || '2026-');
      setSession(editRecord.session || 1);

      setDate(cleanDateStr(editRecord.date) || getTodayLocalStr());
      setStartTime(cleanTimeStr(editRecord.startTime) || '');
      setEndTime(cleanTimeStr(editRecord.endTime) || '');
      setMedia(editRecord.media || '면담');

      const b = editRecord.big || Object.keys(CATEGORIES)[0];
      setBig(b);
      const m = editRecord.mid || (CATEGORIES[b] ? Object.keys(CATEGORIES[b])[0] : '');
      setMid(m);
      const s = editRecord.small || (CATEGORIES[b] && CATEGORIES[b][m] ? CATEGORIES[b][m][0] : '');
      setSmall(s);

      const nextInfo = splitDateTime(editRecord.nextAppointment);
      setNextDate(nextInfo.date || '');
      setNextTime(nextInfo.time || '');

      setNeisTitle(editRecord.neisTitle || '');
      setNeisContent(editRecord.neisContent || '');
      setContent(editRecord.content || '');

      setExistingAttachments(editRecord.attachments || []);
      setSelectedFiles([]);
    }
  }, [editRecord, defaultCounselor]);

  const [aiAdvice, setAiAdvice] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const handleBigChange = (newBig: string) => {
    setBig(newBig);
    const mids = CATEGORIES[newBig] ? Object.keys(CATEGORIES[newBig]) : [];
    const newMid = mids[0] || '';
    setMid(newMid);
    const smalls = (CATEGORIES[newBig] && CATEGORIES[newBig][newMid]) || [];
    const newSmall = smalls[0] || '';
    setSmall(newSmall);
    updateAutoNeis(newMid, newSmall, session, newBig);
  };

  const handleMidChange = (newMid: string) => {
    setMid(newMid);
    const smalls = (CATEGORIES[big] && CATEGORIES[big][newMid]) || [];
    const newSmall = smalls[0] || '';
    setSmall(newSmall);
    updateAutoNeis(newMid, newSmall, session, big);
  };

  const handleSmallChange = (newSmall: string) => {
    setSmall(newSmall);
    updateAutoNeis(mid, newSmall, session, big);
  };

  const updateAutoNeis = (m: string, s: string, sess: number | string, currentBig?: string) => {
    if (!m && !s) return;
    const b = currentBig !== undefined ? currentBig : big;
    let actionWord = '상담함.';
    if (b === '자문' || m.includes('자문') || s.includes('자문')) {
      actionWord = '자문함.';
    } else if (b === '검사' || m.includes('검사') || s.includes('검사')) {
      actionWord = '심리검사 실시함.';
    } else if (b === '교육' || m.includes('연수') || m.includes('교육')) {
      actionWord = '교육/연수 진행함.';
    } else if (b === '의뢰') {
      actionWord = '전문기관 연계 및 의뢰함.';
    } else if (b === '연구') {
      actionWord = '연구/업무 수행함.';
    }

    setNeisContent(`${m}(${s}) 주제로 제 ${sess}회기 ${actionWord}`);
  };

  const handleGenerateAiAdvice = async () => {
    if (!content.trim()) {
      alert('상담 내용을 먼저 작성해주세요.');
      return;
    }
    setIsAiLoading(true);
    setAiError(null);
    try {
      const advice = generateIntelligentClinicalAdvice({
        studentName: name.trim() || '익명',
        school: school.trim(),
        grade: grade.trim(),
        session: session,
        category: `${big} > ${mid} (${small})`,
        media: media,
        content: content.trim()
      });
      setAiAdvice(advice);
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || 'AI 조언을 생성하는 중 오류가 발생했습니다.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCopyAiAdvice = () => {
    if (!aiAdvice) return;
    navigator.clipboard.writeText(aiAdvice);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleAppendToContent = () => {
    if (!aiAdvice) return;
    const divider = content.trim() ? '\n\n' : '';
    const appended = `${content}${divider}[AI 슈퍼바이저 임상 소견 및 조언]\n${aiAdvice}`;
    setContent(appended);
  };

  const updateNeisTitleAuto = (c: string, sess: number | string) => {
    if (c && sess) {
      setNeisTitle(`${c}-${sess}`);
    }
  };

  const handleNameInput = (typedName: string) => {
    setName(typedName);
    if (!typedName.trim()) return;

    const matched = records.filter(r => r.name === typedName.trim());
    if (matched.length > 0) {
      const last = matched[matched.length - 1];
      setSchool(last.school || '');
      setGrade(last.grade || '');
      setClassNum(last.classNum || '');
      setGender(last.gender || '남');
      setBirth(last.birth || '');
      setPhone(last.phone || '');
      setParentPhone(last.parentPhone || '');
      setCaseNum(last.caseNum || '2026-');
      const nextSession = Number(last.session || 0) + 1;
      setSession(nextSession);

      updateNeisTitleAuto(last.caseNum || '2026-', nextSession);
      updateAutoNeis(mid, small, nextSession, big);
    }
  };

  const handleStartTimeChange = (val: string) => {
    setStartTime(val);
    if (!val) return;
    const parts = val.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const d = new Date();
      d.setHours(parts[0], parts[1] + 40, 0, 0);
      setEndTime(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
    }
  };

  const removeSelectedFile = (idx: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const removeExistingAttachment = (idx: number) => {
    setExistingAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const handleReset = () => {
    setRowNum(undefined);
    setName('');
    setSchool('');
    setGrade('');
    setClassNum('');
    setGender('남');
    setBirth('');
    setPhone('');
    setParentPhone('');
    setCaseNum('2026-');
    setSession(1);
    setDate(getTodayLocalStr());
    setStartTime('');
    setEndTime('');
    setMedia('면담');
    const firstBig = Object.keys(CATEGORIES)[0];
    const firstMid = Object.keys(CATEGORIES[firstBig])[0];
    const firstSmall = CATEGORIES[firstBig][firstMid][0];
    setBig(firstBig);
    setMid(firstMid);
    setSmall(firstSmall);
    setNextDate('');
    setNextTime('');
    setNeisTitle('2026--1');
    updateAutoNeis(firstMid, firstSmall, 1, firstBig);
    setContent('');
    setAiAdvice('');
    setAiError(null);
    setExistingAttachments([]);
    setSelectedFiles([]);
    onCancelEdit();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('성명을 입력하세요');
      return;
    }
    if (!counselor.trim()) {
      alert('상담자 성명을 입력하세요');
      return;
    }

    onSaveCounselor(counselor.trim());

    const nextApptStr = (nextDate && nextTime) ? `${nextDate} ${nextTime}` : (nextDate || '');

    const recordPayload: CounselingRecord = {
      rowNum,
      counselor: counselor.trim(),
      name: name.trim(),
      school: school.trim(),
      grade: grade.trim(),
      classNum: classNum.trim(),
      gender: gender,
      birth: birth.trim(),
      phone: phone.trim(),
      parentPhone: parentPhone.trim(),
      caseNum: caseNum.trim(),
      session: session,
      date: date,
      startTime: startTime,
      endTime: endTime,
      media: media,
      big: big,
      mid: mid,
      small: small,
      nextAppointment: nextApptStr,
      neisTitle: neisTitle.trim(),
      neisContent: neisContent.trim(),
      content: content.trim()
    };

    setIsSubmitting(true);
    try {
      await onSubmit(recordPayload, selectedFiles, existingAttachments);
      handleReset();
    } catch (err: any) {
      alert(`저장 중 오류: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const studentNames = Array.from(new Set(records.map(r => r.name).filter(Boolean)));
  const isEditMode = rowNum !== undefined;

  return (
    <div id="regPage">
      <form id="mainForm" onSubmit={handleSubmit}>
        <input type="hidden" name="rowNum" value={rowNum || ''} />

        {/* 상담자 정보 */}
        <div className="card">
          <div className="card-title">
            <span>상담자 정보</span>
            {isEditMode && (
              <span style={{ fontSize: '0.8rem', color: '#166534', background: '#dcfce7', padding: '3px 8px', borderRadius: '6px' }}>
                제 {session}회기 수정 중
              </span>
            )}
          </div>
          <div className="input-group">
            <label>상담자 성명</label>
            <input
              type="text"
              name="counselor"
              id="counselorName"
              required
              placeholder="성명을 입력하세요"
              value={counselor}
              onChange={(e) => {
                setCounselor(e.target.value);
                onSaveCounselor(e.target.value);
              }}
            />
          </div>
        </div>

        {/* 내담자 정보 */}
        <div className="card">
          <div className="card-title">내담자 정보</div>
          <div className="form-grid">
            <div className="input-group">
              <label>성명</label>
              <input
                type="text"
                name="name"
                id="stdName"
                list="studentList"
                autoComplete="off"
                required
                value={name}
                onChange={(e) => handleNameInput(e.target.value)}
              />
              <datalist id="studentList">
                {studentNames.map(n => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div className="input-group">
              <label>학교</label>
              <input
                type="text"
                name="school"
                id="school"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>학년/반/성별</label>
              <div style={{ display: 'flex', gap: '5px' }}>
                <input
                  type="text"
                  name="grade"
                  id="grade"
                  placeholder="학년"
                  style={{ flex: 1 }}
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                />
                <input
                  type="text"
                  name="classNum"
                  id="classNum"
                  placeholder="반"
                  style={{ flex: 1 }}
                  value={classNum}
                  onChange={(e) => setClassNum(e.target.value)}
                />
                <select
                  name="gender"
                  id="gender"
                  style={{ flex: 1.2 }}
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="남">남</option>
                  <option value="여">여</option>
                </select>
              </div>
            </div>
            <div className="input-group">
              <label>생년월일</label>
              <input
                type="text"
                name="birth"
                id="birth"
                placeholder="YYMMDD"
                value={birth}
                onChange={(e) => setBirth(e.target.value)}
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label>내담자 연락처</label>
              <input
                type="text"
                name="phone"
                id="phone"
                placeholder="010-0000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>학부모 연락처</label>
              <input
                type="text"
                name="parentPhone"
                id="parentPhone"
                placeholder="010-0000-0000"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
              />
            </div>
            <div className="input-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <label style={{ margin: 0 }}>사례번호</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const next = getNextCaseNumber(records, 'normal');
                      setCaseNum(next);
                      updateNeisTitleAuto(next, session);
                    }}
                    title="일반 상담 다음 사례번호 자동 채번"
                    style={{
                      border: 'none',
                      background: 'var(--accent-light)',
                      color: 'var(--accent)',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    +일반
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = getNextCaseNumber(records, 'roaming');
                      setCaseNum(next);
                      updateNeisTitleAuto(next, session);
                    }}
                    title="순회상담 다음 사례번호 자동 채번"
                    style={{
                      border: 'none',
                      background: '#E3F2FD',
                      color: '#3A86C8',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    +순회
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const stepped = stepCaseNumber(caseNum, -1);
                      setCaseNum(stepped);
                      updateNeisTitleAuto(stepped, session);
                    }}
                    title="사례번호 1 감소"
                    style={{
                      border: '1px solid var(--border)',
                      background: '#ffffff',
                      fontSize: '0.68rem',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const stepped = stepCaseNumber(caseNum, +1);
                      setCaseNum(stepped);
                      updateNeisTitleAuto(stepped, session);
                    }}
                    title="사례번호 1 증가"
                    style={{
                      border: '1px solid var(--border)',
                      background: '#ffffff',
                      fontSize: '0.68rem',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    ▲
                  </button>
                </div>
              </div>
              <input
                type="text"
                name="caseNum"
                id="caseNum"
                value={caseNum}
                onChange={(e) => {
                  setCaseNum(e.target.value);
                  updateNeisTitleAuto(e.target.value, session);
                }}
              />
            </div>
            <div className="input-group">
              <label>회기</label>
              <input
                type="number"
                name="session"
                id="session"
                value={session}
                onChange={(e) => {
                  const val = e.target.value;
                  setSession(val);
                  updateNeisTitleAuto(caseNum, val);
                  updateAutoNeis(mid, small, val, big);
                }}
              />
            </div>
          </div>
        </div>

        {/* 상담 일시 및 유형 */}
        <div className="card">
          <div className="card-title">상담 일시 및 유형</div>
          <div className="form-grid">
            <div className="input-group">
              <label>상담 날짜</label>
              <input
                type="date"
                name="date"
                id="currDate"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>상담 시간</label>
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                <input
                  type="time"
                  id="startTime"
                  name="startTime"
                  value={startTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                />
                <span style={{ color: 'var(--text-sub)' }}>~</span>
                <input
                  type="time"
                  id="endTime"
                  name="endTime"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="input-group">
              <label>상담 매체</label>
              <select
                name="media"
                id="media"
                value={media}
                onChange={(e) => setMedia(e.target.value)}
              >
                <option value="면담">면담</option>
                <option value="전화상담">전화상담</option>
                <option value="사이버상담">사이버상담</option>
              </select>
            </div>
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label>대분류</label>
              <select
                name="big"
                id="bigS"
                value={big}
                onChange={(e) => handleBigChange(e.target.value)}
              >
                {Object.keys(CATEGORIES).map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>중분류</label>
              <select
                name="mid"
                id="midS"
                value={mid}
                onChange={(e) => handleMidChange(e.target.value)}
              >
                {CATEGORIES[big] && Object.keys(CATEGORIES[big]).map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>소분류</label>
              <select
                name="small"
                id="smallS"
                value={small}
                onChange={(e) => handleSmallChange(e.target.value)}
              >
                {CATEGORIES[big] && CATEGORIES[big][mid] && CATEGORIES[big][mid].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 다음 상담 약속 */}
        <div className="card" style={{ border: '2px solid var(--accent)', background: '#fffdf5' }}>
          <div className="card-title" style={{ color: '#d19a00' }}>📅 다음 상담 약속</div>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="input-group">
              <label>다음 상담 날짜</label>
              <input
                type="date"
                name="nextDate"
                id="nextDate"
                style={{ borderColor: '#f5e0a3' }}
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>다음 상담 시간</label>
              <input
                type="time"
                name="nextTime"
                id="nextTime"
                style={{ borderColor: '#f5e0a3' }}
                value={nextTime}
                onChange={(e) => setNextTime(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* 상담 내용 기록 */}
        <div className="card">
          <div className="card-title">상담 내용 기록</div>
          <div className="input-group" style={{ marginBottom: '12px' }}>
            <label>🏷️ 나이스 제목 (자동 생성)</label>
            <input
              type="text"
              name="neisTitle"
              id="neisTitle"
              style={{ background: '#f8fafc' }}
              value={neisTitle}
              onChange={(e) => setNeisTitle(e.target.value)}
            />
          </div>
          <div className="input-group" style={{ marginBottom: '12px' }}>
            <label>📝 나이스 요약 (자동 생성)</label>
            <textarea
              name="neisContent"
              id="neisContent"
              style={{ height: '60px', background: '#f8fafc' }}
              value={neisContent}
              onChange={(e) => setNeisContent(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>📒 상세 상담 내용 (구글 시트 저장용)</label>
            <textarea
              name="content"
              id="mainContent"
              placeholder="상세한 상담 내용을 기록하세요."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          {/* AI 슈퍼바이저의 임상 소견 및 슈퍼비전 */}
          <div
            className="ai-counseling-advice-card"
            style={{
              marginTop: '16px',
              marginBottom: '16px',
              background: 'linear-gradient(145deg, #ffffff 0%, #fffbfd 100%)',
              border: '1.5px solid rgba(224, 101, 139, 0.35)',
              borderRadius: '14px',
              padding: '16px 18px',
              boxShadow: '0 4px 14px rgba(224, 101, 139, 0.08)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem' }}>🎓</span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    AI 슈퍼바이저 임상 소견 &amp; 슈퍼비전 조언 창
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-sub)' }}>
                    AI 슈퍼바이저 관점 심리역동 분석 및 개입 전략
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={handleGenerateAiAdvice}
                  disabled={isAiLoading || !content.trim()}
                  className="btn"
                  style={{
                    background: isAiLoading ? '#e2e8f0' : 'linear-gradient(135deg, #E0658B 0%, #f472b6 100%)',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    boxShadow: isAiLoading ? 'none' : '0 2px 6px rgba(224, 101, 139, 0.3)',
                    cursor: (!content.trim() || isAiLoading) ? 'not-allowed' : 'pointer'
                  }}
                  title={!content.trim() ? '상담 내용을 먼저 작성해주세요.' : 'AI 슈퍼바이저 소견 및 조언 생성'}
                >
                  {isAiLoading ? '⏳ 분석 및 조언 작성 중...' : aiAdvice ? '🔄 다시 생성하기' : '✨ AI 슈퍼바이저 조언 생성'}
                </button>
              </div>
            </div>

            {aiError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '10px' }}>
                ⚠️ {aiError}
              </div>
            )}

            {aiAdvice ? (
              <div style={{ background: '#fff', border: '1px solid rgba(224, 101, 139, 0.25)', borderRadius: '10px', padding: '14px', marginTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--accent)' }}>
                    💡 AI 슈퍼바이저 종합 소견서
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={handleCopyAiAdvice}
                      className="btn"
                      style={{ background: '#f1f5f9', color: '#334155', fontSize: '0.75rem', padding: '4px 10px', borderRadius: '6px' }}
                    >
                      {isCopied ? '✅ 복사 완료' : '📋 전체 복사'}
                    </button>
                    <button
                      type="button"
                      onClick={handleAppendToContent}
                      className="btn"
                      style={{ background: 'var(--accent-light)', color: 'var(--accent)', fontSize: '0.75rem', padding: '4px 10px', borderRadius: '6px', fontWeight: 800 }}
                      title="상담 내용 기록란 맨 아래에 AI 조언을 덧붙입니다"
                    >
                      📝 상담내용에 덧붙이기
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: '0.88rem',
                    lineHeight: '1.75',
                    color: '#1e293b',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '420px',
                    overflowY: 'auto',
                    paddingRight: '6px'
                  }}
                >
                  {aiAdvice}
                </div>
              </div>
            ) : !isAiLoading && (
              <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', fontSize: '0.82rem', color: '#64748b', textAlign: 'center' }}>
                💡 위의 [📒 상세 상담 내용]에 학생과의 면담 내용을 적고 <strong>[✨ AI 슈퍼바이저 조언 생성]</strong>을 누르면,
                AI 슈퍼바이저의 <strong>회기 핵심 요약, 심리역동 소견, 차기 회기 개입 전략 및 담임·학부모 연계 조언</strong>이 자동 작성됩니다.
              </div>
            )}
          </div>

          <div className={`attachment-box ${isDragOver ? 'drag-over' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label htmlFor="attachments" style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                📎 상담 첨부파일
              </label>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: 700 }}>
                {selectedFiles.length + existingAttachments.length > 0 
                  ? `총 ${selectedFiles.length + existingAttachments.length}개 파일` 
                  : '등록된 파일 없음'}
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              id="attachments"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            {/* Custom Interactive File Dropzone & Button */}
            <div
              className="custom-file-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  setSelectedFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
                }
              }}
            >
              <button
                type="button"
                className="custom-file-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <span>📁</span>
                <span>파일 찾아보기 / 선택</span>
              </button>

              <div className={`custom-file-status ${selectedFiles.length > 0 ? 'has-files' : ''}`}>
                {selectedFiles.length > 0 ? (
                  <span>✅ 새로 추가할 파일 {selectedFiles.length}개가 선택되었습니다 (클릭하여 추가 파일 선택 가능)</span>
                ) : (
                  <span>클릭하거나 파일을 마우스로 끌어다 놓으세요 (문서, 사진, PDF, 검사결과지 등)</span>
                )}
              </div>
            </div>

            <div className="attachment-sub" style={{ marginTop: '8px', fontSize: '0.76rem', color: 'var(--text-sub)' }}>
              💡 여러 파일을 동시에 선택할 수 있으며, 구글 드라이브와 안전하게 연동 저장됩니다.
            </div>

            <div id="attachmentPreview" className="attachment-list">
              {existingAttachments.length > 0 && (
                <>
                  <div className="attachment-sub" style={{ fontWeight: 800, color: 'var(--text-main)', marginTop: '4px' }}>
                    📁 저장된 기존 첨부파일 ({existingAttachments.length}개)
                  </div>
                  {existingAttachments.map((file, idx) => (
                    <div key={idx} className="attachment-item">
                      <div className="attachment-meta">
                        <div className="attachment-name">
                          <span>📄</span>
                          <span>{file.name || '첨부파일'}</span>
                        </div>
                        <div className="attachment-sub">{file.mimeType || '저장된 파일'}</div>
                      </div>
                      <div className="attachment-actions">
                        {file.url && (
                          <a
                            className="btn"
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: '#e0f2fe', color: '#0369a1', padding: '6px 14px', fontSize: '0.78rem', borderRadius: '999px' }}
                          >
                            열기
                          </a>
                        )}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => removeExistingAttachment(idx)}
                          style={{ background: '#fee2e2', color: '#b91c1c', padding: '6px 14px', fontSize: '0.78rem', borderRadius: '999px' }}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {selectedFiles.length > 0 && (
                <>
                  <div className="attachment-sub" style={{ fontWeight: 800, color: '#166534', marginTop: existingAttachments.length ? '10px' : '4px' }}>
                    ✨ 새로 업로드할 파일 ({selectedFiles.length}개)
                  </div>
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="attachment-item" style={{ borderLeft: '3px solid #10b981' }}>
                      <div className="attachment-meta">
                        <div className="attachment-name">
                          <span>📎</span>
                          <span>{file.name || `파일 ${idx + 1}`}</span>
                        </div>
                        <div className="attachment-sub">
                          {file.type || '파일 형식'} · {Math.round((file.size || 0) / 1024)}KB
                        </div>
                      </div>
                      <div className="attachment-actions">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => removeSelectedFile(idx)}
                          style={{ background: '#fee2e2', color: '#b91c1c', padding: '6px 14px', fontSize: '0.78rem', borderRadius: '999px' }}
                        >
                          제외
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {existingAttachments.length === 0 && selectedFiles.length === 0 && (
                <div className="attachment-empty">선택되거나 등록된 파일이 없습니다.</div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
            <button
              type="submit"
              id="saveBtn"
              className="btn btn-save"
              disabled={isSubmitting}
              style={{ background: isEditMode ? '#166534' : 'var(--primary)' }}
            >
              {isSubmitting ? '저장 중...' : isEditMode ? '📝 수정하여 저장' : '💾 저장'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="btn"
              style={{ background: '#e2e8f0', color: '#475569', height: '50px', flex: 0.5 }}
            >
              🍀 취소
            </button>
            <button
              type="button"
              onClick={() => exportToNeis(records)}
              className="btn btn-neis"
            >
              📥 나이스 파일
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
