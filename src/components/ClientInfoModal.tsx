import React, { useState, useEffect } from 'react';
import { CounselingRecord } from '../types';
import { cleanDateStr, cleanTimeStr, splitDateTime } from '../utils/dateTime';
import { postUpdateRecordPayload } from '../services/googleSyncService';

interface ClientInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  records: CounselingRecord[];
  scriptUrl: string;
  onReload: () => Promise<void>;
  onNameMigrated?: (fromName: string, toName: string) => void;
}

export const ClientInfoModal: React.FC<ClientInfoModalProps> = ({
  isOpen,
  onClose,
  studentName,
  records,
  scriptUrl,
  onReload,
  onNameMigrated
}) => {
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');
  const [classNum, setClassNum] = useState('');
  const [gender, setGender] = useState('남');
  const [birth, setBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [caseNum, setCaseNum] = useState('2026-');

  const [statusText, setStatusText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const matchedRecords = records.filter(r => r.name === studentName);

  useEffect(() => {
    if (matchedRecords.length > 0) {
      const latest = matchedRecords[matchedRecords.length - 1];
      setName(latest.name || '');
      setSchool(latest.school || '');
      setGrade(latest.grade || '');
      setClassNum(latest.classNum || '');
      setGender(latest.gender || '남');
      setBirth(latest.birth || '');
      setPhone(latest.phone || '');
      setParentPhone(latest.parentPhone || '');
      setCaseNum(latest.caseNum || '2026-');
      setStatusText('');
    }
  }, [studentName, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      alert('성명을 입력해주세요.');
      return;
    }
    if (matchedRecords.length === 0) {
      alert('해당 내담자의 기록을 찾을 수 없습니다.');
      return;
    }

    if (!confirm(`이 내담자의 모든 상담기록(${matchedRecords.length}건)에 수정된 인적사항이 반영됩니다. 계속하시겠습니까?`)) {
      return;
    }

    setIsSaving(true);
    let successCount = 0;

    const overrides = {
      name: name.trim(),
      school: school.trim(),
      grade: grade.trim(),
      classNum: classNum.trim(),
      gender: gender,
      birth: birth.trim(),
      phone: phone.trim(),
      parentPhone: parentPhone.trim(),
      caseNum: caseNum.trim()
    };

    try {
      for (let i = 0; i < matchedRecords.length; i++) {
        const r = matchedRecords[i];
        setStatusText(`저장 중... (${i + 1}/${matchedRecords.length})`);

        const nextInfo = splitDateTime(r.nextAppointment);

        const payload = {
          rowNum: r.rowNum || '',
          counselor: r.counselor || '',
          name: overrides.name,
          school: overrides.school,
          grade: overrides.grade,
          classNum: overrides.classNum,
          gender: overrides.gender,
          birth: overrides.birth,
          phone: overrides.phone,
          parentPhone: overrides.parentPhone,
          caseNum: overrides.caseNum,
          session: r.session || 1,
          date: cleanDateStr(r.date),
          startTime: cleanTimeStr(r.startTime),
          endTime: cleanTimeStr(r.endTime),
          media: r.media || '면담',
          big: r.big || '',
          mid: r.mid || '',
          small: r.small || '',
          nextDate: nextInfo.date || '',
          nextTime: nextInfo.time || '',
          neisTitle: r.neisTitle || '',
          neisContent: r.neisContent || '',
          content: r.content || '',
          existingAttachments: JSON.stringify(r.attachments || []),
          attachments: []
        };

        await postUpdateRecordPayload(scriptUrl, payload);
        successCount++;
      }

      if (onNameMigrated && studentName !== overrides.name) {
        onNameMigrated(studentName, overrides.name);
      }

      await onReload();
      alert(`✅ ${successCount}건의 기록에 인적사항이 반영되었습니다.`);
      onClose();
    } catch (err: any) {
      console.error(err);
      alert(`${successCount}건 저장 후 오류가 발생했습니다: ${err.message || err}`);
    } finally {
      setIsSaving(false);
      setStatusText('');
    }
  };

  return (
    <div
      id="clientInfoModal"
      className="no-print"
      style={{
        display: 'flex',
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 9999,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '24px',
          width: '90%',
          maxWidth: '420px',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)'
        }}
      >
        <div className="card-title" style={{ marginBottom: '4px' }}>
          ✏️ 내담자 인적사항 수정
        </div>
        <p style={{ color: 'var(--text-sub)', fontSize: '0.8rem', margin: '0 0 16px' }}>
          여기서 수정하면 이 내담자의 모든 상담기록에 함께 반영됩니다.
        </p>

        <div className="form-grid">
          <div className="input-group">
            <label>성명</label>
            <input
              type="text"
              id="editInfoName"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>학교</label>
            <input
              type="text"
              id="editInfoSchool"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>학년/반/성별</label>
            <div style={{ display: 'flex', gap: '5px' }}>
              <input
                type="text"
                id="editInfoGrade"
                placeholder="학년"
                style={{ flex: 1 }}
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              />
              <input
                type="text"
                id="editInfoClassNum"
                placeholder="반"
                style={{ flex: 1 }}
                value={classNum}
                onChange={(e) => setClassNum(e.target.value)}
              />
              <select
                id="editInfoGender"
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
              id="editInfoBirth"
              placeholder="YYMMDD"
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>내담자 연락처</label>
            <input
              type="text"
              id="editInfoPhone"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>학부모 연락처</label>
            <input
              type="text"
              id="editInfoParentPhone"
              placeholder="010-0000-0000"
              value={parentPhone}
              onChange={(e) => setParentPhone(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>사례번호</label>
            <input
              type="text"
              id="editInfoCaseNum"
              placeholder="2026-"
              value={caseNum}
              onChange={(e) => setCaseNum(e.target.value)}
            />
          </div>
        </div>

        <div id="editInfoStatus" style={{ fontSize: '0.85rem', color: 'var(--text-sub)', marginTop: '10px', minHeight: '18px' }}>
          {statusText}
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button
            type="button"
            className="btn"
            style={{ flex: 1, background: '#64748b', color: '#fff' }}
            onClick={onClose}
            disabled={isSaving}
          >
            취소
          </button>
          <button
            type="button"
            id="saveClientInfoBtn"
            className="btn btn-save"
            style={{ flex: 1 }}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
};
