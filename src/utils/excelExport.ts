import * as XLSX from 'xlsx';
import { CATEGORIES } from '../constants';
import { CounselingRecord } from '../types';
import { cleanDateStr, calcCounselTimeParts } from './dateTime';

function toTemplateGrade(value: any): string {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '해당없음';
  if (raw === '해당없음' || raw === '혼합') return raw;

  const match = raw.match(/\d+/);
  if (match) {
    const n = Number(match[0]);
    if (n >= 1 && n <= 6) return `${n}학년`;
  }
  return raw;
}

function toTemplateGender(value: any): string {
  const raw = String(value == null ? '' : value).trim();
  if (raw === '남' || raw === '여' || raw === '혼성') return raw;
  return raw || '';
}

function buildReferenceSheetData(): any[][] {
  const rows: any[][] = [];

  rows.push([null, null, null]);
  rows.push([null, '상담분류', null]);
  rows.push([null, '전문상담', null]);
  rows.push([null, '순회상담', null]);

  rows.push([null, null, null]);
  rows.push([null, 'Wee설치여부', null]);
  rows.push([null, 'Wee클래스', null]);
  rows.push([null, '일반', null]);
  rows.push([null, 'Wee센터', null]);

  rows.push([null, null, null]);
  rows.push([null, '대분류', null]);
  Object.keys(CATEGORIES).forEach(big => {
    rows.push([null, big, null]);
  });

  rows.push([null, null, null]);
  rows.push([null, '중분류 상위 대분류', '중분류']);
  Object.keys(CATEGORIES).forEach(big => {
    let first = true;
    Object.keys(CATEGORIES[big]).forEach(mid => {
      rows.push([first ? big : null, mid, null]);
      first = false;
    });
  });

  rows.push([null, null, null]);
  rows.push([null, '상담구분 상위 중분류', '상담구분']);
  Object.keys(CATEGORIES).forEach(big => {
    Object.keys(CATEGORIES[big]).forEach(mid => {
      let first = true;
      CATEGORIES[big][mid].forEach(small => {
        rows.push([first ? mid : null, small, null]);
        first = false;
      });
    });
  });

  rows.push([null, null, null]);
  rows.push([null, '학년', null]);
  rows.push([null, '해당없음', null]);
  rows.push([null, '1학년', null]);
  rows.push([null, '2학년', null]);
  rows.push([null, '3학년', null]);
  rows.push([null, '4학년', null]);
  rows.push([null, '5학년', null]);
  rows.push([null, '6학년', null]);
  rows.push([null, '혼합', null]);

  rows.push([null, null, null]);
  rows.push([null, '성별', null]);
  rows.push([null, '남', null]);
  rows.push([null, '여', null]);
  rows.push([null, '혼성', null]);

  rows.push([null, null, null]);
  rows.push([null, '상담사소속', null]);
  rows.push([null, '전문상담교사', null]);
  rows.push([null, '전문상담순회교사', null]);
  rows.push([null, 'Wee카운슬러', null]);
  rows.push([null, '학생상담자원봉사자', null]);
  rows.push([null, '교사', null]);
  rows.push([null, '전문상담사', null]);
  rows.push([null, '사회복지사', null]);
  rows.push([null, '교육복지사', null]);
  rows.push([null, '임상심리사', null]);
  rows.push([null, '그외', null]);

  rows.push([null, null, null]);
  rows.push([null, '상담매체구분', null]);
  rows.push([null, '면담', null]);
  rows.push([null, '전화상담', null]);
  rows.push([null, '사이버상담', null]);

  return rows;
}

export function exportToNeis(records: CounselingRecord[]): boolean {
  if (!records || records.length === 0) {
    alert('내보낼 데이터가 없습니다.');
    return false;
  }

  const headers = [
    '*상담분류',
    '*Wee설치여부',
    '*대분류',
    '*중분류',
    '*상담구분',
    '*상담인원',
    '*학년도',
    '*상담일자',
    '학년',
    '성별',
    '*상담제목',
    '*상담내용',
    '*상담시간(시)',
    '*상담시간(분)',
    '*상담사소속',
    '*상담매체구분',
    '피상담학교'
  ];

  const inputRows = records.map(r => {
    const caseNum = String(r.caseNum || '').trim().toUpperCase();
    const counselType = caseNum.includes('R') ? '순회상담' : '전문상담';

    const timeParts = calcCounselTimeParts(r.startTime, r.endTime);
    const dateRaw = cleanDateStr(r.date);
    const uploadDate = dateRaw ? dateRaw.replace(/-/g, '') : '';

    const gradeValue = toTemplateGrade(r.grade);
    const genderValue = toTemplateGender(r.gender);

    const neisTitle = String(r.neisTitle || `${r.caseNum || ''}-${r.session || ''}`).trim();
    const neisContent = String(r.neisContent || r.content || '').trim();

    return [
      counselType,
      'Wee센터',
      r.big || '',
      r.mid || '',
      r.small || '',
      '1',
      '2026',
      uploadDate,
      gradeValue,
      genderValue,
      neisTitle,
      neisContent,
      String(timeParts.hour),
      String(timeParts.min),
      '전문상담순회교사',
      r.media || '면담',
      r.school || ''
    ];
  });

  const wb = XLSX.utils.book_new();

  const inputWs = XLSX.utils.aoa_to_sheet([headers, ...inputRows]);
  inputWs['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 18 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 8 },
    { wch: 18 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
    { wch: 14 }, { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(wb, inputWs, '입력');

  const refWs = XLSX.utils.aoa_to_sheet(buildReferenceSheetData());
  refWs['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, refWs, '참조');

  XLSX.writeFile(wb, '상담관리_업로드서식_2026.xlsx');
  return true;
}
