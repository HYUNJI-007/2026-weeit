import React, { useState } from 'react';
import { X, Copy, Check, ExternalLink, ShieldCheck, Database, KeyRound } from 'lucide-react';
import { AppConfig } from '../services/googleSyncService';
import { DEFAULT_SCRIPT_URL, DEFAULT_SHEET_URL, DEFAULT_DRIVE_URL } from '../constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onSaveConfig: (newConfig: AppConfig) => void;
  onTestConnection: (scriptUrl: string) => Promise<boolean>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onTestConnection
}) => {
  const [scriptUrl, setScriptUrl] = useState(config.scriptUrl || DEFAULT_SCRIPT_URL);
  const [sheetUrl, setSheetUrl] = useState(config.sheetUrl || DEFAULT_SHEET_URL);
  const [driveUrl, setDriveUrl] = useState(config.driveUrl || DEFAULT_DRIVE_URL);
  const [calendarUrl, setCalendarUrl] = useState(config.calendarUrl || 'https://hyunji-007.github.io/Calendar/');
  const [password, setPassword] = useState(config.password || '0627');
  const [counselorName, setCounselorName] = useState(config.counselorName || '');
  
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'gasGuide'>('config');

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveConfig({
      scriptUrl: scriptUrl.trim(),
      sheetUrl: sheetUrl.trim(),
      driveUrl: driveUrl.trim(),
      calendarUrl: calendarUrl.trim(),
      password: password.trim(),
      counselorName: counselorName.trim()
    });
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const ok = await onTestConnection(scriptUrl.trim());
      if (ok) {
        setTestResult({ ok: true, msg: '✅ 구글 시트 Web App 연결 성공! 양방향 데이터 연동이 가능합니다.' });
      } else {
        setTestResult({ ok: false, msg: '⚠️ 응답을 받았으나 데이터 형식을 확인해주세요.' });
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: `❌ 연결 실패: ${err.message || 'URL을 다시 확인해주세요.'}` });
    } finally {
      setTesting(false);
    }
  };

  const gasScriptCode = `/**
 * Wee-It 2026 구글 스프레드시트 · 캘린더 · TODO 양방향 연동 Apps Script
 * [설치 및 업데이트 방법]
 * 1. 연동할 구글 스프레드시트 열기 > 상단 메뉴 [확장 프로그램] > [Apps Script] 클릭
 * 2. 기존 코드 전체를 지우고 아래 코드를 그대로 붙여넣기 후 저장(Ctrl+S)
 * 3. (선택 - Google Tasks 연동 시) 좌측 [서비스(+)] 클릭 > [Google Tasks API] 선택 후 [추가]
 * 4. 우측 상단 [배포] > [새 배포] 클릭 (유형: 웹 앱 / 다음 사용자로 실행: 나 / 액세스 권한: 모든 사용자 필수!)
 * 5. 권한 승인 팝업이 뜨면 [고급] > [안전하지 않은 페이지로 이동] > 모두 허용
 * 6. 발급된 "웹 앱 URL"을 Wee-It [설정]에 입력 (기존 URL 업데이트 시에도 반드시 [새 배포] 진행!)
 */

function parseYmdDate_(ymd, addDays) {
  var p = String(ymd || '').split('-');
  var y = Number(p[0]), m = Number(p[1]) - 1, d = Number(p[2]) + (addDays || 0);
  return new Date(y, m, d);
}

function parseYmdHmDate_(ymd, hm) {
  var dp = String(ymd || '').split('-');
  var tp = String(hm || '09:00').split(':');
  return new Date(Number(dp[0]), Number(dp[1]) - 1, Number(dp[2]), Number(tp[0] || 9), Number(tp[1] || 0), 0);
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var action = (e && e.parameter && e.parameter.action) || '';

  // 1) 구글 캘린더 & Tasks(할 일) 통합 불러오기 (쿠키/팝업 불필요 브릿지)
  if (action === 'getCalendarAndTasks') {
    try {
      var tz = Session.getScriptTimeZone() || 'Asia/Seoul';
      var now = new Date();
      var startDt = (e.parameter.timeMin)
        ? new Date(e.parameter.timeMin)
        : new Date(now.getFullYear(), now.getMonth() - 1, 1);
      var endDt = (e.parameter.timeMax)
        ? new Date(e.parameter.timeMax)
        : new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);

      var allCals = CalendarApp.getAllCalendars();
      var calendars = [];
      var events = [];

      for (var c = 0; c < allCals.length; c++) {
        var cal = allCals[c];
        var calId = cal.getId();
        var calName = cal.getName();
        var isOwned = cal.isOwnedByMe();
        var isPrimary = false;
        try { isPrimary = cal.isMyPrimaryCalendar(); } catch (errP) {}
        var calColor = '';
        try { calColor = cal.getColor() || ''; } catch (errC) {}

        calendars.push({
          id: calId,
          summary: calName,
          primary: isPrimary,
          backgroundColor: calColor,
          accessRole: isOwned ? 'owner' : 'reader'
        });

        try {
          var calEvents = cal.getEvents(startDt, endDt);
          for (var i = 0; i < calEvents.length; i++) {
            var ev = calEvents[i];
            var evObj = {
              id: ev.getId(),
              calendarId: calId,
              calendarLabel: calName,
              summary: ev.getTitle() || '(제목 없음)',
              description: ev.getDescription() || '',
              location: ev.getLocation() || '',
              canEdit: isOwned,
              color: calColor
            };
            if (ev.isAllDayEvent()) {
              evObj.start = { date: Utilities.formatDate(ev.getAllDayStartDate(), tz, 'yyyy-MM-dd') };
              evObj.end = { date: Utilities.formatDate(ev.getAllDayEndDate(), tz, 'yyyy-MM-dd') };
            } else {
              evObj.start = { dateTime: Utilities.formatDate(ev.getStartTime(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX") };
              evObj.end = { dateTime: Utilities.formatDate(ev.getEndTime(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX") };
            }
            events.push(evObj);
          }
        } catch (errEv) {}
      }

      var taskLists = [];
      var tasks = [];
      var tasksSupported = false;
      var tasksError = '';

      if (typeof Tasks !== 'undefined' && Tasks.Tasklists && Tasks.Tasks) {
        try {
          tasksSupported = true;
          var tlRes = Tasks.Tasklists.list({ maxResults: 20 });
          var rawLists = (tlRes && tlRes.items) ? tlRes.items : [];
          for (var l = 0; l < rawLists.length; l++) {
            var tl = rawLists[l];
            taskLists.push({ id: tl.id, title: tl.title });
            var tRes = Tasks.Tasks.list(tl.id, { showCompleted: true, showHidden: true, maxResults: 100 });
            var rawTasks = (tRes && tRes.items) ? tRes.items : [];
            for (var t = 0; t < rawTasks.length; t++) {
              var tk = rawTasks[t];
              if (tk.title) {
                tasks.push({
                  id: tk.id,
                  title: tk.title,
                  notes: tk.notes || '',
                  due: tk.due || '',
                  status: tk.status || 'needsAction',
                  updated: tk.updated || '',
                  taskListId: tl.id
                });
              }
            }
          }
        } catch (errT) {
          tasksError = errT.toString();
        }
      } else {
        tasksError = 'Apps Script 편집기 좌측 [서비스(+)]에서 Google Tasks API를 추가하면 할 일(To Do)도 양방향 연동됩니다.';
      }

      return ContentService.createTextOutput(JSON.stringify({
        ok: true,
        calendars: calendars,
        events: events,
        taskLists: taskLists,
        tasks: tasks,
        tasksSupported: tasksSupported,
        tasksError: tasksError
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (calErr) {
      return ContentService.createTextOutput(JSON.stringify({
        ok: false,
        message: calErr.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 2) 관리카드 불러오기 요청
  if (action === 'getCards') {
    var cardSheet = ss.getSheetByName('관리카드');
    if (!cardSheet) {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, cards: {} }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var cardData = cardSheet.getDataRange().getValues();
    var cards = {};
    for (var i = 1; i < cardData.length; i++) {
      var name = cardData[i][0];
      var jsonStr = cardData[i][1];
      if (name && jsonStr) {
        try { cards[name] = JSON.parse(jsonStr); } catch (err) {}
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, cards: cards }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 3) 기본 상담 데이터 불러오기 요청
  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var payload = JSON.parse(e.postData.contents);

    // 캘린더 일정 생성
    if (payload.action === 'createCalendarEvent') {
      var targetCal = (!payload.calendarId || payload.calendarId === 'primary')
        ? CalendarApp.getDefaultCalendar()
        : (CalendarApp.getCalendarById(payload.calendarId) || CalendarApp.getDefaultCalendar());
      var createdEv;
      if (payload.allDay) {
        var sDt = parseYmdDate_(payload.startDate, 0);
        var endYmd = (payload.endDate && payload.endDate >= payload.startDate) ? payload.endDate : payload.startDate;
        var eDtExcl = parseYmdDate_(endYmd, 1);
        createdEv = targetCal.createAllDayEvent(payload.summary || '새 일정', sDt, eDtExcl);
      } else {
        var endD = (payload.endDate && payload.endDate >= payload.startDate) ? payload.endDate : payload.startDate;
        var sTimeDt = parseYmdHmDate_(payload.startDate, payload.startTime || '09:00');
        var eTimeDt = parseYmdHmDate_(endD, payload.endTime || '10:00');
        createdEv = targetCal.createEvent(payload.summary || '새 일정', sTimeDt, eTimeDt);
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, eventId: createdEv.getId() }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 캘린더 일정 수정/이동
    if (payload.action === 'updateCalendarEvent') {
      var uCal = (!payload.calendarId || payload.calendarId === 'primary')
        ? CalendarApp.getDefaultCalendar()
        : (CalendarApp.getCalendarById(payload.calendarId) || CalendarApp.getDefaultCalendar());
      var uEv = uCal.getEventById(payload.eventId);
      if (!uEv) throw new Error('일정을 찾을 수 없습니다.');
      if (payload.summary !== undefined) uEv.setTitle(payload.summary);
      if (payload.allDay) {
        var usDt = parseYmdDate_(payload.startDate, 0);
        var uEndYmd = (payload.endDate && payload.endDate >= payload.startDate) ? payload.endDate : payload.startDate;
        var ueDtExcl = parseYmdDate_(uEndYmd, 1);
        uEv.setAllDayDates(usDt, ueDtExcl);
      } else {
        var uEndD = (payload.endDate && payload.endDate >= payload.startDate) ? payload.endDate : payload.startDate;
        var usTimeDt = parseYmdHmDate_(payload.startDate, payload.startTime || '09:00');
        var ueTimeDt = parseYmdHmDate_(uEndD, payload.endTime || '10:00');
        uEv.setTime(usTimeDt, ueTimeDt);
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 캘린더 일정 삭제
    if (payload.action === 'deleteCalendarEvent') {
      var dCal = (!payload.calendarId || payload.calendarId === 'primary')
        ? CalendarApp.getDefaultCalendar()
        : (CalendarApp.getCalendarById(payload.calendarId) || CalendarApp.getDefaultCalendar());
      var dEv = dCal.getEventById(payload.eventId);
      if (dEv) dEv.deleteEvent();
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Google Tasks 생성/수정/삭제
    if (payload.action === 'createTask' || payload.action === 'updateTask' || payload.action === 'deleteTask') {
      if (typeof Tasks === 'undefined' || !Tasks.Tasks) {
        throw new Error('Apps Script 편집기 좌측 [서비스(+)]에서 Google Tasks API를 먼저 추가해 주세요.');
      }
      var listId = payload.taskListId || '@default';
      if (payload.action === 'createTask') {
        var newTaskObj = { title: payload.title, status: 'needsAction' };
        if (payload.notes) newTaskObj.notes = payload.notes;
        if (payload.dueDate) newTaskObj.due = payload.dueDate + 'T00:00:00.000Z';
        var inserted = Tasks.Tasks.insert(newTaskObj, listId);
        return ContentService.createTextOutput(JSON.stringify({ success: true, task: inserted }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      if (payload.action === 'updateTask') {
        var patchObj = {};
        if (payload.title !== undefined) patchObj.title = payload.title;
        if (payload.notes !== undefined) patchObj.notes = payload.notes;
        if (payload.dueDate !== undefined) patchObj.due = payload.dueDate ? (payload.dueDate + 'T00:00:00.000Z') : null;
        if (payload.done !== undefined) {
          patchObj.status = payload.done ? 'completed' : 'needsAction';
          if (!payload.done) patchObj.completed = null;
        }
        var patched = Tasks.Tasks.patch(patchObj, listId, payload.taskId);
        return ContentService.createTextOutput(JSON.stringify({ success: true, task: patched }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      if (payload.action === 'deleteTask') {
        Tasks.Tasks.remove(listId, payload.taskId);
        return ContentService.createTextOutput(JSON.stringify({ success: true }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 관리카드 개별 저장
    if (payload.action === 'saveCard') {
      var cardSheet = ss.getSheetByName('관리카드');
      if (!cardSheet) {
        cardSheet = ss.insertSheet('관리카드');
        cardSheet.appendRow(['내담자성명', '카드데이터JSON', '최종수정시각']);
      }
      var cardRows = cardSheet.getDataRange().getValues();
      var foundRow = -1;
      for (var r = 1; r < cardRows.length; r++) {
        if (cardRows[r][0] === payload.name) {
          foundRow = r + 1;
          break;
        }
      }
      var cardPayloadStr = JSON.stringify(payload.card);
      var nowStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
      if (foundRow > 0) {
        cardSheet.getRange(foundRow, 2, 1, 2).setValues([[cardPayloadStr, nowStr]]);
      } else {
        cardSheet.appendRow([payload.name, cardPayloadStr, nowStr]);
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: '관리카드 저장 완료' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 기본 상담기록 저장
    var sheet = ss.getSheets()[0];
    var rowNum = payload.rowNum ? Number(payload.rowNum) : null;

    // 첨부파일 드라이브 업로드 처리
    var uploadedAttachments = [];
    if (payload.existingAttachments) {
      try {
        uploadedAttachments = JSON.parse(payload.existingAttachments);
      } catch (err) {}
    }
    if (payload.attachments && payload.attachments.length > 0) {
      var folder;
      var folders = DriveApp.getFoldersByName("Wee-It_첨부파일");
      if (folders.hasNext()) {
        folder = folders.next();
      } else {
        folder = DriveApp.createFolder("Wee-It_첨부파일");
      }
      for (var i = 0; i < payload.attachments.length; i++) {
        var f = payload.attachments[i];
        var decoded = Utilities.base64Decode(f.base64);
        var blob = Utilities.newBlob(decoded, f.mimeType, f.name);
        var driveFile = folder.createFile(blob);
        driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        uploadedAttachments.push({
          name: f.name,
          url: driveFile.getUrl(),
          fileId: driveFile.getId(),
          mimeType: f.mimeType
        });
      }
    }

    var nextAppointmentStr = (payload.nextDate && payload.nextTime)
      ? (payload.nextDate + ' ' + payload.nextTime)
      : (payload.nextDate || '');

    var rowValues = [
      payload.name || '',
      payload.school || '',
      payload.grade || '',
      payload.classNum || '',
      payload.gender || '남',
      payload.birth || '',
      payload.phone || '',
      payload.parentPhone || '',
      payload.counselor || '',
      payload.caseNum || '2026-',
      payload.big || '',
      payload.mid || '',
      payload.small || '',
      payload.date || '',
      payload.startTime || '',
      payload.endTime || '',
      payload.session || 1,
      payload.neisTitle || '',
      payload.content || '',
      payload.neisContent || '',
      nextAppointmentStr,
      '',
      payload.media || '면담',
      JSON.stringify(uploadedAttachments)
    ];

    if (rowNum && rowNum >= 2) {
      sheet.getRange(rowNum, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, message: '저장 완료되었습니다.' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const copyScript = () => {
    navigator.clipboard.writeText(gasScriptCode);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[99998] p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-800">
              구글 양방향 연동 및 시스템 설정
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-slate-200 bg-white px-6">
          <button
            onClick={() => setActiveTab('config')}
            className={`py-3 px-4 font-bold text-sm border-b-2 cursor-pointer transition-colors ${
              activeTab === 'config'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            기본 연동 설정
          </button>
          <button
            onClick={() => setActiveTab('gasGuide')}
            className={`py-3 px-4 font-bold text-sm border-b-2 cursor-pointer transition-colors ${
              activeTab === 'gasGuide'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            구글 스프레드시트 배포 스크립트 (GAS)
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm flex-1">
          {activeTab === 'config' ? (
            <>
              {/* Google Apps Script Web App URL */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  🌐 Google Apps Script 웹 앱 URL (양방향 연동 엔드포인트)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={scriptUrl}
                    onChange={(e) => setScriptUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-1 h-10 px-3 border border-slate-300 rounded-lg text-xs font-mono focus:border-emerald-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg border border-slate-300 text-xs transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {testing ? '테스트 중...' : '연결 테스트'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  기본 연동 URL이 자동으로 세팅되어 있습니다. 다른 시트나 개인 구글 계정으로 연결하려면 변경할 수 있습니다.
                </p>
                {testResult && (
                  <div className={`mt-2 p-2.5 rounded-lg text-xs font-medium ${testResult.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {testResult.msg}
                  </div>
                )}
              </div>

              {/* Google Sheets URL */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  🗃️ Wee DB 구글 스프레드시트 바로가기 URL
                </label>
                <input
                  type="text"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-xs font-mono focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Google Drive URL */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  📁 첨부파일/스캔본 구글 드라이브 폴더 바로가기 URL
                </label>
                <input
                  type="text"
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-xs font-mono focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Google Calendar Web URL */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  📆 구글 캘린더 연동 웹 URL
                </label>
                <input
                  type="text"
                  value={calendarUrl}
                  onChange={(e) => setCalendarUrl(e.target.value)}
                  placeholder="https://hyunji-007.github.io/Calendar/"
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-xs font-mono focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Counselor Name Default */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    👤 기본 상담자 성명
                  </label>
                  <input
                    type="text"
                    value={counselorName}
                    onChange={(e) => setCounselorName(e.target.value)}
                    placeholder="예: 전문상담교사 홍길동"
                    className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                {/* Password Setting */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    🔒 프로그램 잠금 암호
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="기본값: 0627"
                      className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded-lg text-sm font-mono tracking-widest focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900 leading-relaxed space-y-1">
                <p className="font-bold">💡 시트 · 구글 캘린더 · Google Tasks 통합 양방향 연동 (쿠키·팝업 불필요)</p>
                <p>
                  구글 스프레드시트의 <strong>[확장 프로그램] &gt; [Apps Script]</strong>에 아래 코드를 붙여넣고, <strong>[배포] &gt; [새 배포] &gt; [웹 앱]</strong>(액세스 권한: 모든 사용자)으로 배포하시면 Chrome 서드파티 쿠키 차단 환경에서도 캘린더 연동까지 안전하게 동작합니다.
                </p>
                <p className="text-[11px] text-emerald-800">
                  ※ To Do(할 일)까지 Apps Script로 연동하려면 편집기 좌측 <strong>[서비스(+)] → Google Tasks API</strong>를 추가한 뒤 [새 배포]를 진행하세요.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">Google Apps Script 전체 소스코드</span>
                <button
                  onClick={copyScript}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-xs cursor-pointer"
                >
                  {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedScript ? '복사 완료!' : '전체 코드 복사'}
                </button>
              </div>

              <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono overflow-x-auto max-h-72 leading-snug">
                {gasScriptCode}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg font-bold text-xs cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-md cursor-pointer"
          >
            설정 저장
          </button>
        </div>
      </div>
    </div>
  );
};
