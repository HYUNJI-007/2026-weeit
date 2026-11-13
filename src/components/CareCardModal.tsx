import React, { useState, useEffect } from 'react';
import { CareCardData, CounselingRecord, StoredCardRecord } from '../types';
import { CATEGORIES, LIST_ITEMS } from '../constants';
import { cleanDateStr } from '../utils/dateTime';
import { printCareCardReport } from '../utils/printHelpers';
import { getLocalCards, saveLocalCards, postCardToGoogle } from '../services/googleSyncService';

interface CareCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  records: CounselingRecord[];
  scriptUrl: string;
}

const DEFAULT_SCHOOL = '학교';
const CARD_DEFAULTS = {
  author: '전문상담교사 박현지',
  location: '',
  method: '파쇄'
};

const AUTO_KEYS = ['caseNum', 'school', 'grade', 'classNum', 'gender', 'intakeDate', 'startDate', 'total', 'areas', 'inc2', 'inc3', 'inc5', 'mgmtStart', 'mgmtEnd'];

export const CareCardModal: React.FC<CareCardModalProps> = ({
  isOpen,
  onClose,
  studentName,
  records,
  scriptUrl
}) => {
  const [card, setCard] = useState<CareCardData | null>(null);
  const [editedKeys, setEditedKeys] = useState<Record<string, boolean>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const getAreas = () => {
    try {
      return CATEGORIES['상담']['개인상담'].slice();
    } catch (e) {
      return ['학업', '진로', '성격', '대인관계', '기타'];
    }
  };

  const computeAuto = (name: string) => {
    const recs = records
      .filter(r => r.name === name)
      .map(r => ({ r, d: cleanDateStr(r.date) }))
      .sort((a, b) => (a.d || '9999').localeCompare(b.d || '9999'));

    if (recs.length === 0) return { auto: {} as Partial<CareCardData>, lastDate: '' };

    const personal = recs.filter(x => x.r.mid === '개인상담');
    const base = personal.length ? personal : recs;
    const last = recs[recs.length - 1];
    const firstAll = recs.find(x => x.d);
    const firstBase = base.find(x => x.d);

    const areaList = getAreas();
    const areas = new Set<string>();
    base.forEach(x => {
      const a = x.r.small;
      if (a && areaList.includes(a)) areas.add(a);
    });

    const caseNum = recs.slice().reverse().map(x => x.r.caseNum).find(Boolean) || '';
    const start = firstBase ? firstBase.d : '';
    const ym = start.match(/^(\d{4})-(\d{2})/);
    const gender = last.r.gender;

    let hasStudentConsent = false;
    let hasParentConsent = false;
    recs.forEach(x => {
      (x.r.attachments || []).forEach(att => {
        if (att.name && att.name.includes('[학생동의서]')) hasStudentConsent = true;
        if (att.name && att.name.includes('[학부모동의서]')) hasParentConsent = true;
      });
    });

    const auto: Partial<CareCardData> = {
      caseNum: caseNum,
      school: last.r.school || DEFAULT_SCHOOL,
      grade: String(last.r.grade || '').replace(/학년$/, ''),
      classNum: String(last.r.classNum || '').replace(/반$/, ''),
      gender: (gender === '남' || gender === '여') ? [gender] : [],
      intakeDate: firstAll ? firstAll.d : '',
      startDate: start,
      total: String(base.length),
      areas: areaList.filter(a => areas.has(a)),
      inc2: hasStudentConsent,
      inc3: hasParentConsent,
      inc5: true,
      mgmtStart: ym ? `${ym[1]}. ${+ym[2]}.` : '',
      mgmtEnd: ym ? `${+ym[1] + 10}. ${+ym[2]}. (10년 보관)` : ''
    };

    return { auto, lastDate: last.d || '' };
  };

  const blankValues = (): CareCardData => {
    const v: any = {
      name: studentName,
      author: CARD_DEFAULTS.author,
      location: CARD_DEFAULTS.location,
      method: CARD_DEFAULTS.method,
      mgmtStart: '',
      mgmtEnd: '',
      caseNum: '',
      school: '',
      grade: '',
      classNum: '',
      gender: [],
      route: [],
      intakeDate: '',
      areas: [],
      startDate: '',
      total: '',
      mainProblem: '',
      closeDate: '',
      closeReason: [],
      goal: [],
      linkStatus: [],
      linkOrgs: [],
      linkReason: '',
      other7: ''
    };
    for (let i = 1; i <= 7; i++) {
      v['inc' + i] = false;
      v['note' + i] = '';
    }
    return v;
  };

  useEffect(() => {
    if (!isOpen || !studentName) return;

    const store = getLocalCards();
    const saved = store[studentName];
    const { auto } = computeAuto(studentName);

    const initial: CareCardData = {
      ...blankValues(),
      ...CARD_DEFAULTS,
      ...auto,
      name: studentName
    };

    let edited: Record<string, boolean> = {};

    if (saved && saved.v) {
      edited = saved.edited || {};
      Object.keys(saved.v).forEach(k => {
        if (!AUTO_KEYS.includes(k) || edited[k]) {
          (initial as any)[k] = saved.v[k];
        }
      });
    }

    if (!edited['mgmtEnd'] && initial.mgmtStart) {
      const m = String(initial.mgmtStart).match(/(\d{4})\D+(\d{1,2})/);
      if (m) {
        initial.mgmtEnd = `${+m[1] + 10}. ${+m[2]}. (10년 보관)`;
      }
    }

    setCard(initial);
    setEditedKeys(edited);
    setIsDirty(false);
    setStatusMsg('☁️ 저장하면 구글 시트와 이 브라우저에 함께 저장됩니다.');
  }, [isOpen, studentName]);

  if (!isOpen || !card) return null;

  const handleFieldChange = (key: string, value: any) => {
    setCard(prev => {
      if (!prev) return null;
      const next = { ...prev, [key]: value };
      if (key === 'mgmtStart' && !editedKeys['mgmtEnd']) {
        const m = String(value).match(/(\d{4})\D+(\d{1,2})/);
        if (m) {
          next.mgmtEnd = `${+m[1] + 10}. ${+m[2]}. (10년 보관)`;
        }
      }
      return next;
    });

    if (AUTO_KEYS.includes(key)) {
      setEditedKeys(prev => ({ ...prev, [key]: true }));
    }
    setIsDirty(true);
  };

  const handleGroupToggle = (groupKey: string, opt: string, single: boolean) => {
    setCard(prev => {
      if (!prev) return null;
      const currentList: string[] = (prev as any)[groupKey] || [];
      let nextList: string[];

      if (single) {
        nextList = currentList.includes(opt) ? [] : [opt];
      } else {
        if (currentList.includes(opt)) {
          nextList = currentList.filter(x => x !== opt);
        } else {
          nextList = [...currentList, opt];
        }
      }

      const next = { ...prev, [groupKey]: nextList };

      if (groupKey === 'closeReason' && nextList.length > 0 && !next.closeDate) {
        const { lastDate } = computeAuto(studentName);
        if (lastDate) next.closeDate = lastDate;
      }

      return next;
    });

    if (AUTO_KEYS.includes(groupKey)) {
      setEditedKeys(prev => ({ ...prev, [groupKey]: true }));
    }
    setIsDirty(true);
  };

  const handleRefillAuto = () => {
    if (!confirm('자동으로 채워지는 항목을 상담기록 기준으로 다시 채웁니다.\n(직접 고친 값이 있으면 덮어써집니다. 주 호소 문제 등 직접 쓴 내용은 그대로 둡니다.)')) {
      return;
    }
    const { auto } = computeAuto(studentName);
    setCard(prev => {
      if (!prev) return null;
      return {
        ...prev,
        ...auto
      };
    });
    setEditedKeys({});
    setIsDirty(true);
    setStatusMsg('🔄 자동 항목을 다시 계산하여 반영했습니다.');
  };

  const handleSave = async () => {
    if (!card) return;
    setStatusMsg('저장 중...');

    const rec: StoredCardRecord = {
      v: card,
      edited: editedKeys,
      updatedAt: Date.now()
    };

    const store = getLocalCards();
    store[studentName] = rec;
    saveLocalCards(store);
    setIsDirty(false);

    try {
      await postCardToGoogle(scriptUrl, studentName, rec);
      setStatusMsg('✅ 저장됨 (구글 시트 + 이 브라우저)');
    } catch (err: any) {
      console.error(err);
      setStatusMsg(`⚠️ 이 브라우저에는 저장했지만 구글 시트 저장에 실패했어요: ${err.message || err}`);
    }
  };

  const generatePrintHtml = () => {
    if (!card) return '';

    const tx = (val: string) => val || '';
    const grp = (list: string[] | undefined, opts: string[]) => {
      return opts.map(o => {
        const on = (list || []).includes(o);
        return `<span class="cl">${on ? '☑' : '☐'} ${o}</span>`;
      }).join('');
    };
    const bx = (val: boolean) => (val ? '☑' : '☐');

    const fmtMD = (iso: string) => {
      const m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})/);
      return m ? `${+m[1]}월 ${+m[2]}일` : '월 &nbsp;&nbsp;&nbsp;&nbsp; 일';
    };

    let listRows = '';
    LIST_ITEMS.forEach((t, i) => {
      const n = i + 1;
      const label = n === 7 ? `기타 자료( ${card.other7 || ''} )` : t;
      listRows += `
        <tr class="li">
          <td>${n}</td>
          <td class="l">${label}</td>
          <td>${bx((card as any)['inc' + n])}</td>
          <td>${tx((card as any)['note' + n])}</td>
        </tr>
      `;
    });

    return `
      <table class="cc">
          <colgroup><col style="width:30%"><col style="width:10%"><col style="width:12%"><col style="width:24%"><col style="width:24%"></colgroup>
          <tr><td class="ttl" rowspan="6">개인상담 기록물<br>관리 카드</td><th class="band" colspan="4">기록물 관리 정보</th></tr>
          <tr><th colspan="2">기록 작성자</th><td colspan="2">${tx(card.author)}</td></tr>
          <tr><th rowspan="2">기록물<br>보관</th><th class="y">시작</th><td class="y" colspan="2">${tx(card.mgmtStart)}</td></tr>
          <tr><th>위치</th><td colspan="2">${tx(card.location)}</td></tr>
          <tr><th class="y" rowspan="2">종료<br>(폐기)</th><th class="y">일시</th><td class="y" colspan="2">${tx(card.mgmtEnd)}</td></tr>
          <tr><th>방법</th><td colspan="2">${tx(card.method)}</td></tr>
      </table>

      <table class="cc">
          <colgroup><col style="width:11%"><col style="width:13%"><col style="width:22%"><col style="width:20%"><col style="width:13%"><col style="width:21%"></colgroup>
          <tr><th rowspan="2">학생<br>인적사항</th><th>이름</th><td colspan="2"><b>${tx(card.name)}</b></td><th>사례번호</th><td>${tx(card.caseNum)}</td></tr>
          <tr><th>소속</th><td>${tx(card.school)}</td>
              <td>${card.grade || '&nbsp;&nbsp;'}학년 ${card.classNum || '&nbsp;&nbsp;'}반</td>
              <th>성별</th><td>${grp(card.gender, ['남', '여'])}</td></tr>
      </table>

      <table class="cc">
          <colgroup><col style="width:11%"><col style="width:17%"><col style="width:16%"><col style="width:56%"></colgroup>
          <tr><th rowspan="10">상담<br>진행도</th><th class="hm">과정(일시)</th><th class="hm" colspan="2">내용</th></tr>
          <tr><th>접수</th><th>신청 경로</th><td class="l">${grp(card.route, ['자발신청', '의뢰(부모, 교사, 기타)'])}</td></tr>
          <tr><td class="dtc" data-label="접수 일자">${fmtMD(card.intakeDate)}</td><th>상담 영역</th><td class="l">${grp(card.areas, getAreas())}</td></tr>
          <tr><th>시작</th><th>상담 회기</th><td>총 ( ${card.total || '&nbsp;&nbsp;&nbsp;'} )회기 진행</td></tr>
          <tr><td class="dtc" data-label="시작 일자">${fmtMD(card.startDate)}</td><th>주 호소<br>문제</th><td class="l" style="white-space:pre-wrap;">${tx(card.mainProblem)}</td></tr>
          <tr><th>종결</th><th>종결사유</th><td class="l">${grp(card.closeReason, ['목표 달성', '졸업', '중도 종결', '외부연계'])}</td></tr>
          <tr><td class="dtc" rowspan="4" data-label="종결 일자">${fmtMD(card.closeDate)}</td><th>목표 달성<br>여부</th><td class="l">${grp(card.goal, ['호전', '부분호전', '변화 미미'])}</td></tr>
          <tr><th>연계 여부</th><td class="l">${grp(card.linkStatus, ['연계 처리', '연계 미처리'])}</td></tr>
          <tr><th>연계 기관</th><td class="l">${grp(card.linkOrgs, ['청소년상담복지센터', '정신건강복지센터', 'Wee센터', '병의원'])}</td></tr>
          <tr><th>연계 사유</th><td class="l" style="white-space:pre-wrap;">${tx(card.linkReason)}</td></tr>
      </table>

      <table class="cc">
          <colgroup><col style="width:11%"><col style="width:8%"><col style="width:53%"><col style="width:12%"><col style="width:16%"></colgroup>
          <tr><th rowspan="8">상담<br>기록물<br>목록</th><th class="hm">구분</th><th class="hm">항목</th><th class="hm">포함 여부</th><th class="hm">비고</th></tr>
          ${listRows}
      </table>

      <div class="cc-note">※ 본 기록물은 상담 운영에 관한 행정적 관리 정보를 기록한 문서이며, 상담의 구체적 내용은 포함하지 않음.<br>&nbsp;&nbsp;&nbsp;&nbsp;기록물 요청 시에는 최소한의 정보(개인상담 기록물 관리카드만)에 한하여 제공함을 원칙으로 함.</div>
    `;
  };

  const handlePrint = () => {
    const html = generatePrintHtml();
    printCareCardReport(html);
  };

  const handleClose = () => {
    if (isDirty && !confirm('저장하지 않은 수정 내용이 있습니다. 닫으시겠어요?')) {
      return;
    }
    onClose();
  };

  return (
    <div
      id="careCardModal"
      className="no-print"
      style={{
        display: 'block',
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 9998,
        overflow: 'auto',
        padding: '20px 10px'
      }}
    >
      <div
        style={{
          maxWidth: '880px',
          margin: '0 auto',
          background: '#fff',
          borderRadius: '14px',
          padding: '18px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)'
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: '8px',
            position: 'sticky',
            top: 0,
            background: '#fff',
            padding: '6px 0',
            zIndex: 2
          }}
        >
          <div className="card-title" style={{ margin: 0, border: 'none', padding: 0, flex: 1, minWidth: '160px' }}>
            📇 개인상담 기록물 관리카드
          </div>
          <button
            type="button"
            className="btn btn-save"
            style={{ height: '40px', flex: 'none', padding: '0 16px' }}
            onClick={handleSave}
          >
            💾 저장
          </button>
          <button
            type="button"
            className="btn"
            style={{ background: '#64748b', color: '#fff', height: '40px', padding: '0 14px' }}
            onClick={handlePrint}
          >
            🖨️ 인쇄
          </button>
          <button
            type="button"
            className="btn"
            style={{ background: '#f1f8f3', color: 'var(--primary-dark)', border: '1px solid #bfe0c8', height: '40px', padding: '0 14px' }}
            onClick={handleRefillAuto}
          >
            🔄 자동 항목 다시 채우기
          </button>
          <button
            type="button"
            className="btn"
            style={{ background: '#e2e8f0', color: '#475569', height: '40px', padding: '0 14px' }}
            onClick={handleClose}
          >
            닫기
          </button>
        </div>

        <div id="careCardStatus" style={{ fontSize: '0.8rem', color: 'var(--text-sub)', minHeight: '18px', marginBottom: '8px' }}>
          {statusMsg}
        </div>

        <div id="careCardBody">
          <p className="auto-hint">
            💡 이름·사례번호·학교·학년/반·성별·접수/시작일·회기 수·상담 영역(기존 소분류)·기록지 포함 여부는 상담기록에서 자동으로 채워졌어요. 직접 고치면 그 값으로 고정됩니다.
          </p>

          {/* 기록물 관리 정보 */}
          <table className="cc">
            <colgroup>
              <col style={{ width: '30%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '24%' }} />
            </colgroup>
            <tbody>
              <tr>
                <td className="ttl" rowSpan={6}>
                  개인상담 기록물<br />관리 카드
                </td>
                <th className="band" colSpan={4}>기록물 관리 정보</th>
              </tr>
              <tr>
                <th colSpan={2}>기록 작성자</th>
                <td colSpan={2}>
                  <input
                    type="text"
                    value={card.author || ''}
                    onChange={(e) => handleFieldChange('author', e.target.value)}
                  />
                </td>
              </tr>
              <tr>
                <th rowSpan={2}>기록물<br />보관</th>
                <th className="y">시작</th>
                <td className="y" colSpan={2}>
                  <input
                    type="text"
                    value={card.mgmtStart || ''}
                    onChange={(e) => handleFieldChange('mgmtStart', e.target.value)}
                  />
                </td>
              </tr>
              <tr>
                <th>위치</th>
                <td colSpan={2}>
                  <input
                    type="text"
                    value={card.location || ''}
                    onChange={(e) => handleFieldChange('location', e.target.value)}
                  />
                </td>
              </tr>
              <tr>
                <th className="y" rowSpan={2}>종료<br />(폐기)</th>
                <th className="y">일시</th>
                <td className="y" colSpan={2}>
                  <input
                    type="text"
                    value={card.mgmtEnd || ''}
                    onChange={(e) => handleFieldChange('mgmtEnd', e.target.value)}
                  />
                </td>
              </tr>
              <tr>
                <th>방법</th>
                <td colSpan={2}>
                  <input
                    type="text"
                    value={card.method || ''}
                    onChange={(e) => handleFieldChange('method', e.target.value)}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          {/* 학생 인적사항 */}
          <table className="cc">
            <colgroup>
              <col style={{ width: '11%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '21%' }} />
            </colgroup>
            <tbody>
              <tr>
                <th rowSpan={2}>학생<br />인적사항</th>
                <th>이름</th>
                <td colSpan={2}><b>{card.name}</b></td>
                <th>사례번호</th>
                <td>
                  <input
                    type="text"
                    value={card.caseNum || ''}
                    onChange={(e) => handleFieldChange('caseNum', e.target.value)}
                  />
                </td>
              </tr>
              <tr>
                <th>소속</th>
                <td>
                  <input
                    type="text"
                    value={card.school || ''}
                    onChange={(e) => handleFieldChange('school', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="gd"
                    value={card.grade || ''}
                    onChange={(e) => handleFieldChange('grade', e.target.value)}
                  />
                  학년{' '}
                  <input
                    type="text"
                    className="gd"
                    value={card.classNum || ''}
                    onChange={(e) => handleFieldChange('classNum', e.target.value)}
                  />
                  반
                </td>
                <th>성별</th>
                <td>
                  {['남', '여'].map(g => (
                    <label key={g} className="cl">
                      <input
                        type="checkbox"
                        checked={(card.gender || []).includes(g)}
                        onChange={() => handleGroupToggle('gender', g, true)}
                      />
                      {g}
                    </label>
                  ))}
                </td>
              </tr>
            </tbody>
          </table>

          {/* 상담 진행도 */}
          <table className="cc">
            <colgroup>
              <col style={{ width: '11%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '56%' }} />
            </colgroup>
            <tbody>
              <tr>
                <th rowSpan={10}>상담<br />진행도</th>
                <th className="hm">과정(일시)</th>
                <th className="hm" colSpan={2}>내용</th>
              </tr>
              <tr>
                <th>접수</th>
                <th>신청 경로</th>
                <td className="l">
                  {['자발신청', '의뢰(부모, 교사, 기타)'].map(r => (
                    <label key={r} className="cl">
                      <input
                        type="checkbox"
                        checked={(card.route || []).includes(r)}
                        onChange={() => handleGroupToggle('route', r, true)}
                      />
                      {r}
                    </label>
                  ))}
                </td>
              </tr>
              <tr>
                <td className="dtc" data-label="접수 일자">
                  <input
                    type="date"
                    value={card.intakeDate || ''}
                    onChange={(e) => handleFieldChange('intakeDate', e.target.value)}
                  />
                </td>
                <th>상담 영역</th>
                <td className="l">
                  {getAreas().map(area => (
                    <label key={area} className="cl">
                      <input
                        type="checkbox"
                        checked={(card.areas || []).includes(area)}
                        onChange={() => handleGroupToggle('areas', area, false)}
                      />
                      {area}
                    </label>
                  ))}
                </td>
              </tr>
              <tr>
                <th>시작</th>
                <th>상담 회기</th>
                <td>
                  총 ({' '}
                  <input
                    type="text"
                    className="sm"
                    value={card.total || ''}
                    onChange={(e) => handleFieldChange('total', e.target.value)}
                  />{' '}
                  )회기 진행
                </td>
              </tr>
              <tr>
                <td className="dtc" data-label="시작 일자">
                  <input
                    type="date"
                    value={card.startDate || ''}
                    onChange={(e) => handleFieldChange('startDate', e.target.value)}
                  />
                </td>
                <th>주 호소<br />문제</th>
                <td>
                  <textarea
                    value={card.mainProblem || ''}
                    onChange={(e) => handleFieldChange('mainProblem', e.target.value)}
                  />
                </td>
              </tr>
              <tr>
                <th>종결</th>
                <th>종결사유</th>
                <td className="l">
                  {['목표 달성', '졸업', '중도 종결', '외부연계'].map(cr => (
                    <label key={cr} className="cl">
                      <input
                        type="checkbox"
                        checked={(card.closeReason || []).includes(cr)}
                        onChange={() => handleGroupToggle('closeReason', cr, true)}
                      />
                      {cr}
                    </label>
                  ))}
                </td>
              </tr>
              <tr>
                <td className="dtc" rowSpan={4} data-label="종결 일자">
                  <input
                    type="date"
                    value={card.closeDate || ''}
                    onChange={(e) => handleFieldChange('closeDate', e.target.value)}
                  />
                </td>
                <th>목표 달성<br />여부</th>
                <td className="l">
                  {['호전', '부분호전', '변화 미미'].map(g => (
                    <label key={g} className="cl">
                      <input
                        type="checkbox"
                        checked={(card.goal || []).includes(g)}
                        onChange={() => handleGroupToggle('goal', g, true)}
                      />
                      {g}
                    </label>
                  ))}
                </td>
              </tr>
              <tr>
                <th>연계 여부</th>
                <td className="l">
                  {['연계 처리', '연계 미처리'].map(ls => (
                    <label key={ls} className="cl">
                      <input
                        type="checkbox"
                        checked={(card.linkStatus || []).includes(ls)}
                        onChange={() => handleGroupToggle('linkStatus', ls, true)}
                      />
                      {ls}
                    </label>
                  ))}
                </td>
              </tr>
              <tr>
                <th>연계 기관</th>
                <td className="l">
                  {['청소년상담복지센터', '정신건강복지센터', 'Wee센터', '병의원'].map(org => (
                    <label key={org} className="cl">
                      <input
                        type="checkbox"
                        checked={(card.linkOrgs || []).includes(org)}
                        onChange={() => handleGroupToggle('linkOrgs', org, false)}
                      />
                      {org}
                    </label>
                  ))}
                </td>
              </tr>
              <tr>
                <th>연계 사유</th>
                <td>
                  <textarea
                    value={card.linkReason || ''}
                    onChange={(e) => handleFieldChange('linkReason', e.target.value)}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          {/* 상담 기록물 목록 */}
          <table className="cc">
            <colgroup>
              <col style={{ width: '11%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '53%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <tbody>
              <tr>
                <th rowSpan={8}>상담<br />기록물<br />목록</th>
                <th className="hm">구분</th>
                <th className="hm">항목</th>
                <th className="hm">포함 여부</th>
                <th className="hm">비고</th>
              </tr>
              {LIST_ITEMS.map((itemTitle, idx) => {
                const num = idx + 1;
                const incKey = `inc${num}`;
                const noteKey = `note${num}`;

                return (
                  <tr key={num} className="li">
                    <td>{num}</td>
                    <td className="l">
                      {num === 7 ? (
                        <>
                          기타 자료({ ' ' }
                          <input
                            type="text"
                            className="md"
                            value={card.other7 || ''}
                            onChange={(e) => handleFieldChange('other7', e.target.value)}
                          />{' '}
                          )
                        </>
                      ) : (
                        itemTitle
                      )}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean((card as any)[incKey])}
                        onChange={(e) => handleFieldChange(incKey, e.target.checked)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={(card as any)[noteKey] || ''}
                        onChange={(e) => handleFieldChange(noteKey, e.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="cc-note">
            ※ 본 기록물은 상담 운영에 관한 행정적 관리 정보를 기록한 문서이며, 상담의 구체적 내용은 포함하지 않음.<br />
            &nbsp;&nbsp;&nbsp;&nbsp;기록물 요청 시에는 최소한의 정보(개인상담 기록물 관리카드만)에 한하여 제공함을 원칙으로 함.
          </div>
        </div>
      </div>
    </div>
  );
};
