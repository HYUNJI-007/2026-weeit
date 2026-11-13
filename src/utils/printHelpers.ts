import { CATEGORIES, SIGNATURE_STAMP } from '../constants';
import { CareCardData, CounselingRecord } from '../types';
import { cleanDateStr, cleanTimeStr, formatGradeDisplay, formatNextAppointment } from './dateTime';

export function printCounselingReport(r: CounselingRecord): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.');
    return;
  }

  const content = `
  <!DOCTYPE html>
  <html lang="ko">
  <head>
      <meta charset="UTF-8">
      <title>개인상담기록지 - ${r.name || ''}</title>
      <style>
          @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
          body { font-family: 'Pretendard', sans-serif; padding: 12px; color: black; }
          h1 { text-align: center; text-decoration: underline; margin-bottom: 18px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; table-layout: fixed; }
          th, td { border: 1px solid black; padding: 10px; text-align: center; font-size: 11pt; word-break: break-all; }
          th { background: #f2f2f2; width: 15%; font-weight: bold; }
          .content-box { border: 1px solid black; min-height: 500px; padding: 14px; text-align: left; white-space: pre-wrap; font-size: 11pt; line-height: 1.6; }
          .footer { text-align: right; margin-top: 18px; font-weight: bold; font-size: 12pt; }
          @page { size: A4; margin: 10mm; }
      </style>
  </head>
  <body>
      <h1>개 인 상 담 기 록 지</h1>
      <table>
          <tr>
              <th>내담자</th><td>${r.name || ''}</td>
              <th>학교/학년</th><td>${r.school || ''} / ${formatGradeDisplay(r.grade)}</td>
              <th>회기</th><td>제 ${r.session || ''}회기</td>
          </tr>
          <tr>
              <th>상담자</th><td>${r.counselor || ''}</td>
              <th>상담일시</th><td colspan="3">${cleanDateStr(r.date)} (${cleanTimeStr(r.startTime)} ~ ${cleanTimeStr(r.endTime)})</td>
          </tr>
          <tr>
              <th>상담유형</th><td colspan="3">${r.big || ''} &gt; ${r.mid || ''} (${r.small || ''})</td>
              <th>상담매체</th><td>${r.media || '-'}</td>
          </tr>
      </table>

      <div class="content-box"><strong>[상담 내용]</strong><br><br>${String(r.content || '').replace(/\n/g, '<br>')}</div>

      <table style="margin-top:-1px;">
          <tr>
              <th style="width:20%">다음 상담 약속</th>
              <td style="text-align:left; padding-left:15px;">${formatNextAppointment(r.nextAppointment)}</td>
          </tr>
      </table>

      <div class="footer">상담자 : ${r.counselor || ''} <span style="display:inline-block; position:relative; width:24px; height:20px; vertical-align:middle; margin-left:2px;"><span style="position:relative; z-index:1;">(인)</span><img id="printSignature" src="${SIGNATURE_STAMP}" alt="서명" style="position:absolute; left:50%; top:52%; transform:translate(-50%, -50%); width:30px; height:30px; object-fit:contain; opacity:0.95;"></span></div>
  </body>
  </html>
  `;

  printWindow.document.write(content);
  printWindow.document.close();

  const signImg = printWindow.document.getElementById('printSignature') as HTMLImageElement;
  const doPrint = () => {
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  if (signImg && !signImg.complete) {
    signImg.onload = () => setTimeout(doPrint, 150);
    signImg.onerror = () => setTimeout(doPrint, 150);
  } else {
    setTimeout(doPrint, 300);
  }
}

export function printStatisticsReport(records: CounselingRecord[], counselorName: string): void {
  if (!records || records.length === 0) {
    alert('인쇄할 통계 데이터가 없습니다.');
    return;
  }

  const printWindow = window.open('', '_blank', 'width=1000,height=800');
  if (!printWindow) {
    alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.');
    return;
  }

  const now = new Date();
  const printDateTime = now.toLocaleString('ko-KR');
  const counselor = counselorName || '-';

  const bigLabels = Object.keys(CATEGORIES);
  const totalCount = records.length;

  const summaryRows = bigLabels.map(big => {
    const count = records.filter(r => r.big === big).length;
    return `
        <tr>
            <th>${big}</th>
            <td>${count}건</td>
        </tr>
    `;
  }).join('');

  let detailRows = '';

  bigLabels.forEach(big => {
    const bigRecords = records.filter(r => r.big === big);
    const mids = Object.keys(CATEGORIES[big]);

    const bigRowCount = mids.reduce((sum, mid) => {
      return sum + CATEGORIES[big][mid].length;
    }, 0);

    detailRows += `
        <tr class="section-row">
            <td colspan="3">● ${big} 총계</td>
            <td>${bigRecords.length}건</td>
        </tr>
    `;

    let bigRendered = false;

    mids.forEach(mid => {
      const midRecords = bigRecords.filter(r => r.mid === mid);
      const smalls = CATEGORIES[big][mid];
      const midRowCount = smalls.length;

      smalls.forEach((small, idx) => {
        const smallCount = midRecords.filter(r => r.small === small).length;

        detailRows += `<tr>`;

        if (!bigRendered) {
          detailRows += `
              <td rowspan="${bigRowCount}" style="vertical-align: middle; font-weight: 700; background: #fff;">
                  ${big}
              </td>
          `;
          bigRendered = true;
        }

        if (idx === 0) {
          detailRows += `
              <td rowspan="${midRowCount}" style="vertical-align: middle; font-weight: 600; background: #fcfcf9;">
                  ${mid}
              </td>
          `;
        }

        detailRows += `
            <td style="text-align:left; padding-left:10px;">${small}</td>
            <td>${smallCount}</td>
        </tr>
        `;
      });
    });
  });

  const content = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>상담 실적 통계 보고서</title>
    <style>
        @page { size: A4; margin: 10mm; }
        body {
            font-family: sans-serif;
            padding: 12px;
            color: black;
            font-size: 11pt;
            line-height: 1.5;
        }
        h1 {
            text-align: center;
            text-decoration: underline;
            margin-bottom: 10px;
            font-size: 20pt;
        }
        .sub-title {
            text-align: center;
            margin-bottom: 18px;
            font-size: 11pt;
            font-weight: 600;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
            table-layout: fixed;
        }
        th, td {
            border: 1px solid black;
            padding: 9px;
            text-align: center;
            font-size: 10.5pt;
            word-break: break-word;
            vertical-align: middle;
        }
        th {
            background: #f2f2f2;
            font-weight: bold;
        }
        .org-name {
            font-size: 9pt;
            line-height: 1.25;
            word-break: keep-all;
            overflow-wrap: anywhere;
        }
        .section-title {
            font-weight: bold;
            margin: 18px 0 8px;
            font-size: 11.5pt;
        }
        .section-row td {
            background: #f2f2f2;
            font-weight: bold;
        }
        .section-row td:first-child {
            text-align: left;
            padding-left: 12px;
        }
        .footer {
            text-align: right;
            margin-top: 20px;
            font-weight: bold;
            font-size: 12pt;
        }
        .note {
            margin-top: 8px;
            font-size: 10pt;
            color: #333;
        }
    </style>
</head>
<body>
    <h1>상 담 실 적 통 계 보 고 서</h1>
    <div class="sub-title">경기도구리남양주교육지원청 Wee센터</div>

    <table>
        <tr>
            <th style="width:18%;">기관명</th>
            <td class="org-name" style="width:32%;">경기도구리남양주교육지원청 Wee센터</td>
            <th style="width:18%;">출력일시</th>
            <td style="width:32%;">${printDateTime}</td>
        </tr>
        <tr>
            <th>작성자</th>
            <td>${counselor}</td>
            <th>총 건수</th>
            <td>${totalCount}건</td>
        </tr>
    </table>

    <div class="section-title">1. 대분류별 실적 요약</div>
    <table>
        <tr>
            <th style="width:55%;">대분류</th>
            <th style="width:45%;">건수</th>
        </tr>
        ${summaryRows}
    </table>

    <div class="section-title">2. 세부 실적 현황</div>
    <table>
        <thead>
            <tr>
                <th style="width:18%;">대분류</th>
                <th style="width:24%;">중분류</th>
                <th style="width:42%;">소분류</th>
                <th style="width:16%;">건수</th>
            </tr>
        </thead>
        <tbody>
            ${detailRows}
        </tbody>
    </table>

    <div class="note">※ 본 보고서는 Wee-It 2026 시스템에 저장된 상담 데이터를 기준으로 자동 출력되었습니다.</div>
    <div class="footer">작성자 : ${counselor} <span style="display:inline-block; position:relative; width:24px; height:20px; vertical-align:middle; margin-left:2px;"><span style="position:relative; z-index:1;">(인)</span><img id="statSignature" src="${SIGNATURE_STAMP}" alt="서명" style="position:absolute; left:50%; top:52%; transform:translate(-50%, -50%); width:30px; height:30px; object-fit:contain; opacity:0.95;"></span></div>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(content);
  printWindow.document.close();

  const statSignImg = printWindow.document.getElementById('statSignature') as HTMLImageElement;
  const doStatPrint = () => {
    printWindow.focus();
    printWindow.print();
  };

  if (statSignImg && !statSignImg.complete) {
    statSignImg.onload = () => setTimeout(doStatPrint, 150);
    statSignImg.onerror = () => setTimeout(doStatPrint, 150);
  } else {
    setTimeout(doStatPrint, 300);
  }

  printWindow.onafterprint = function () {
    printWindow.close();
  };
}

export function printCareCardReport(cardHtml: string): void {
  const w = window.open('', '_blank');
  if (!w) {
    alert('팝업이 차단되어 인쇄 창을 열 수 없습니다.');
    return;
  }
  const html = `<!DOCTYPE html>
  <html>
  <head>
      <meta charset="UTF-8">
      <title>개인상담 기록물 관리카드</title>
      <style>
          @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
          body { font-family:'Pretendard', sans-serif; margin:0; padding:6px; color:#000; }
          .cc { width:100%; border-collapse:collapse; table-layout:fixed; margin-bottom:12px; font-size:10pt; }
          .cc th, .cc td { border:1px solid #000; padding:5px 6px; text-align:center; vertical-align:middle; word-break:break-all; }
          .cc th { background:#f2f2f2; font-weight:700; }
          .cc .band { background:#e5e5e5; font-size:11pt; }
          .cc .ttl { font-size:15pt; font-weight:800; line-height:1.6; }
          .cc .y { background:#fff8d6; }
          .cc .l { text-align:left; }
          .cc .cl { display:inline-block; margin:2px 10px 2px 0; white-space:nowrap; }
          .cc-note { border:1px solid #000; background:#f2f2f2; padding:7px 10px; font-size:8.5pt; line-height:1.6; font-weight:700; }
          @page { size:A4; margin:12mm; }
      </style>
  </head>
  <body>
      ${cardHtml}
  </body>
  </html>`;

  w.document.write(html);
  w.document.close();
  setTimeout(function () {
    w.focus();
    w.print();
    w.close();
  }, 400);
}

export function printStudentAllSessionsReport(studentName: string, records: CounselingRecord[]): void {
  if (!records || records.length === 0) {
    alert('인쇄할 상담 기록이 없습니다.');
    return;
  }

  // Sort sessions chronologically (회기 오름차순)
  const sorted = records.slice().sort((a, b) => {
    const sA = Number(a.session) || 0;
    const sB = Number(b.session) || 0;
    if (sA !== sB) return sA - sB;
    return (a.date || '').localeCompare(b.date || '');
  });

  const firstRec = sorted[0];
  const lastRec = sorted[sorted.length - 1];
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.');
    return;
  }

  const sessionCardsHtml = sorted.map((r) => {
    return `
    <div class="session-page">
      <div class="header-band">
        <h2>개 인 상 담 기 록 지 (제 ${r.session || '1'}회기)</h2>
        <span class="sub-date">사례번호: ${r.caseNum || '-'} | 일자: ${cleanDateStr(r.date)}</span>
      </div>

      <table class="form-table">
        <tr>
          <th style="width:15%">내담자</th><td style="width:20%">${r.name || studentName}</td>
          <th style="width:15%">학교/학년</th><td style="width:25%">${r.school || ''} ${formatGradeDisplay(r.grade)} ${r.classNum ? `${r.classNum}반` : ''}</td>
          <th style="width:10%">회기</th><td style="width:15%">제 ${r.session || ''}회기</td>
        </tr>
        <tr>
          <th>상담자</th><td>${r.counselor || ''}</td>
          <th>상담일시</th><td colspan="3">${cleanDateStr(r.date)} (${cleanTimeStr(r.startTime)} ~ ${cleanTimeStr(r.endTime)})</td>
        </tr>
        <tr>
          <th>상담유형</th><td colspan="3">${r.big || ''} &gt; ${r.mid || ''} (${r.small || ''})</td>
          <th>상담매체</th><td>${r.media || '-'}</td>
        </tr>
      </table>

      <div class="content-title"><strong>[상담 기록 내용]</strong></div>
      <div class="content-box">${String(r.content || '(기록된 내용이 없습니다)').replace(/\n/g, '<br>')}</div>

      <table class="form-table next-table">
        <tr>
          <th style="width:20%">다음 상담 약속</th>
          <td style="text-align:left; padding-left:14px;">${formatNextAppointment(r.nextAppointment)}</td>
        </tr>
      </table>

      <div class="footer-sign">
        상담자 : ${r.counselor || ''} 
        <span class="stamp-wrap">
          <span class="stamp-text">(인)</span>
          <img class="stamp-img" src="${SIGNATURE_STAMP}" alt="서명">
        </span>
      </div>
    </div>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
  <html lang="ko">
  <head>
    <meta charset="UTF-8">
    <title>${studentName} - 전 회기 개인상담 기록철 (총 ${sorted.length}회기)</title>
    <style>
      @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
      * { box-sizing: border-box; }
      body {
        font-family: 'Pretendard', sans-serif;
        margin: 0;
        padding: 12px;
        color: #111;
        background: #fff;
        font-size: 11pt;
      }
      .summary-cover {
        border: 2px solid #222;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 25px;
        background: #fafafa;
        page-break-after: always;
      }
      .summary-cover h1 {
        text-align: center;
        font-size: 20pt;
        letter-spacing: -0.5px;
        margin-top: 5px;
        margin-bottom: 18px;
        text-decoration: underline;
      }
      .session-page {
        page-break-after: always;
        margin-bottom: 25px;
        padding-top: 10px;
      }
      .session-page:last-child {
        page-break-after: auto;
      }
      .header-band {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        border-bottom: 2px solid #333;
        padding-bottom: 8px;
        margin-bottom: 12px;
      }
      .header-band h2 {
        margin: 0;
        font-size: 15pt;
        font-weight: 800;
      }
      .sub-date {
        font-size: 10pt;
        color: #555;
        font-weight: 600;
      }
      .form-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 12px;
        table-layout: fixed;
      }
      .form-table th, .form-table td {
        border: 1px solid #333;
        padding: 8px 10px;
        text-align: center;
        font-size: 10pt;
        word-break: break-all;
      }
      .form-table th {
        background: #f1f3f5;
        font-weight: 700;
      }
      .content-title {
        font-size: 10.5pt;
        font-weight: bold;
        margin-bottom: 6px;
      }
      .content-box {
        border: 1px solid #333;
        min-height: 480px;
        padding: 14px 16px;
        text-align: left;
        white-space: pre-wrap;
        font-size: 10.5pt;
        line-height: 1.65;
        background: #fff;
      }
      .next-table {
        margin-top: -1px;
      }
      .footer-sign {
        text-align: right;
        margin-top: 16px;
        font-weight: bold;
        font-size: 11pt;
      }
      .stamp-wrap {
        display: inline-block;
        position: relative;
        width: 26px;
        height: 22px;
        vertical-align: middle;
        margin-left: 2px;
      }
      .stamp-text {
        position: relative;
        z-index: 1;
      }
      .stamp-img {
        position: absolute;
        left: 50%;
        top: 52%;
        transform: translate(-50%, -50%);
        width: 32px;
        height: 32px;
        object-fit: contain;
        opacity: 0.95;
      }
      @page {
        size: A4;
        margin: 12mm;
      }
      @media print {
        body { padding: 0; }
        .summary-cover { page-break-after: always; }
        .session-page { page-break-after: always; }
        .session-page:last-child { page-break-after: auto; }
      }
    </style>
  </head>
  <body>
    <div class="summary-cover">
      <h1>개인상담 통합 누적 기록철</h1>
      <table class="form-table" style="margin-top:15px;">
        <tr>
          <th style="width:20%">내담자 성명</th>
          <td style="width:30%">${studentName} (${firstRec.gender || '-'})</td>
          <th style="width:20%">사례번호</th>
          <td style="width:30%; font-weight:bold; font-size:11pt;">${firstRec.caseNum || '-'}</td>
        </tr>
        <tr>
          <th>소속 학교</th>
          <td>${firstRec.school || '-'}</td>
          <th>학년 / 반</th>
          <td>${formatGradeDisplay(firstRec.grade)} ${firstRec.classNum ? `${firstRec.classNum}반` : ''}</td>
        </tr>
        <tr>
          <th>생년월일</th>
          <td>${firstRec.birth || '-'}</td>
          <th>학생 연락처</th>
          <td>${firstRec.phone || '-'}</td>
        </tr>
        <tr>
          <th>학부모 연락처</th>
          <td>${firstRec.parentPhone || '-'}</td>
          <th>총 진행 회기</th>
          <td style="font-weight:bold; color:#b91c1c;">총 ${sorted.length}회기 완료</td>
        </tr>
        <tr>
          <th>상담 진행 기간</th>
          <td colspan="3">${cleanDateStr(firstRec.date)} ~ ${cleanDateStr(lastRec.date)}</td>
        </tr>
        <tr>
          <th>담당 상담자</th>
          <td colspan="3">${firstRec.counselor || ''}</td>
        </tr>
      </table>

      <h3 style="margin-top:22px; margin-bottom:8px; font-size:11pt;">■ 회기별 진행 내역 요약</h3>
      <table class="form-table">
        <thead>
          <tr>
            <th style="width:10%">회기</th>
            <th style="width:18%">일자 및 시간</th>
            <th style="width:12%">매체</th>
            <th style="width:30%">상담 유형</th>
            <th style="width:30%">나이스/핵심 주제</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(r => `
            <tr>
              <td>제 ${r.session}회기</td>
              <td>${cleanDateStr(r.date)}<br><small style="color:#666">${cleanTimeStr(r.startTime)}~${cleanTimeStr(r.endTime)}</small></td>
              <td>${r.media || '면담'}</td>
              <td style="text-align:left; font-size:9pt;">${r.big || ''} &gt; ${r.mid || ''}</td>
              <td style="text-align:left; font-size:9pt;">${r.neisContent || r.small || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="margin-top:20px; font-size:9pt; color:#666;">
        ※ 본 기록철은 Wee-It 2026 상담사례관리 시스템에서 일괄 생성된 공식 누적 개인상담 일지입니다.
      </div>
    </div>

    ${sessionCardsHtml}
  </body>
  </html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 400);
}

export function printAllRecordsRoster(records: CounselingRecord[], counselorName?: string): void {
  if (!records || records.length === 0) {
    alert('인쇄할 전체 상담 기록이 없습니다.');
    return;
  }

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.');
    return;
  }

  // Sort by date ascending
  const sorted = records.slice().sort((a, b) => {
    const da = cleanDateStr(a.date);
    const db = cleanDateStr(b.date);
    if (da !== db) return da.localeCompare(db);
    return (Number(a.session) || 0) - (Number(b.session) || 0);
  });

  const now = new Date();
  const printDateTime = now.toLocaleString('ko-KR');
  const uniqueStudents = new Set(sorted.map(r => r.name.trim()).filter(Boolean)).size;

  const countByBig: Record<string, number> = {};
  sorted.forEach(r => {
    const b = r.big || '기타';
    countByBig[b] = (countByBig[b] || 0) + 1;
  });

  const summaryStats = Object.entries(countByBig)
    .map(([k, v]) => `<strong>${k}:</strong> ${v}건`)
    .join(' · ');

  const rowsHtml = sorted.map((r, idx) => {
    const dateFormatted = cleanDateStr(r.date);
    const timeFormatted = r.startTime ? `${cleanTimeStr(r.startTime)}~${cleanTimeStr(r.endTime)}` : '';
    const studentInfo = `${r.name || '-'}${r.gender ? `(${r.gender})` : ''}<br><span style="font-size:8.5pt; color:#555;">${r.school || ''} ${formatGradeDisplay(r.grade)}</span>`;
    const catFormatted = `${r.big || ''} &gt; ${r.mid || ''}<br><span style="font-size:8.5pt; color:#666;">(${r.small || '-'})</span>`;
    const noteSummary = (r.content || r.neisContent || '').slice(0, 100);

    return `
    <tr>
      <td style="font-weight:600;">${idx + 1}</td>
      <td>${dateFormatted}<br><span style="font-size:8.5pt; color:#666;">${timeFormatted}</span></td>
      <td>${studentInfo}</td>
      <td style="font-weight:700;">${r.caseNum || '-'}<br><span style="font-size:8.5pt; font-weight:normal; color:#2563eb;">${r.session ? `제${r.session}회기` : '-'}</span></td>
      <td style="text-align:left; font-size:9pt;">${catFormatted}</td>
      <td>${r.media || '-'}</td>
      <td style="text-align:left; font-size:9pt; line-height:1.4;">
        ${noteSummary}${noteSummary.length >= 100 ? '...' : ''}
      </td>
      <td>${r.counselor || counselorName || ''}</td>
    </tr>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
  <html lang="ko">
  <head>
    <meta charset="UTF-8">
    <title>전체 상담·자문 기록 총괄 대장</title>
    <style>
      @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
      * { box-sizing: border-box; }
      body {
        font-family: 'Pretendard', sans-serif;
        margin: 0;
        padding: 10px;
        color: #111;
        background: #fff;
        font-size: 10pt;
      }
      h1 {
        text-align: center;
        font-size: 18pt;
        font-weight: 800;
        letter-spacing: -0.5px;
        margin-bottom: 6px;
        text-decoration: underline;
      }
      .sub-info {
        display: flex;
        justify-content: space-between;
        margin-bottom: 12px;
        font-size: 9.5pt;
        color: #444;
        font-weight: 500;
        border-bottom: 1px solid #ccc;
        padding-bottom: 6px;
      }
      .stat-summary-bar {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        padding: 8px 12px;
        border-radius: 6px;
        margin-bottom: 12px;
        font-size: 9pt;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        margin-bottom: 16px;
      }
      th, td {
        border: 1px solid #333;
        padding: 6px 8px;
        text-align: center;
        font-size: 9pt;
        word-break: break-all;
        vertical-align: middle;
      }
      th {
        background: #f1f3f5;
        font-weight: 700;
        font-size: 9.5pt;
      }
      .footer-sign {
        text-align: right;
        margin-top: 18px;
        font-weight: bold;
        font-size: 11pt;
      }
      .stamp-wrap {
        display: inline-block;
        position: relative;
        width: 26px;
        height: 22px;
        vertical-align: middle;
        margin-left: 2px;
      }
      .stamp-text {
        position: relative;
        z-index: 1;
      }
      .stamp-img {
        position: absolute;
        left: 50%;
        top: 52%;
        transform: translate(-50%, -50%);
        width: 30px;
        height: 30px;
        object-fit: contain;
        opacity: 0.95;
      }
      @page {
        size: A4 landscape;
        margin: 10mm;
      }
      @media print {
        body { padding: 0; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <h1>전 체 상 담 · 자 문 기 록 총 괄 대 장</h1>
    <div class="sub-info">
      <span>기관명: 경기도구리남양주교육지원청 Wee센터</span>
      <span>출력일시: ${printDateTime}</span>
      <span>총 내담자: ${uniqueStudents}명 / 누적 기록: 총 ${sorted.length}건</span>
    </div>

    <div class="stat-summary-bar">
      📊 <strong>대분류별 통계 요약:</strong> ${summaryStats}
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:5%">연번</th>
          <th style="width:13%">상담일시</th>
          <th style="width:14%">내담자(학교/학년)</th>
          <th style="width:13%">사례번호/회기</th>
          <th style="width:18%">상담유형(대>중>소)</th>
          <th style="width:7%">매체</th>
          <th style="width:22%">주요 상담 내용 요약</th>
          <th style="width:8%">상담자</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="footer-sign">
      작성 및 확인자 : ${counselorName || (sorted[0] && sorted[0].counselor) || '전문상담교사'}
      <span class="stamp-wrap">
        <span class="stamp-text">(인)</span>
        <img class="stamp-img" src="${SIGNATURE_STAMP}" alt="서명">
      </span>
    </div>
  </body>
  </html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 400);
}
