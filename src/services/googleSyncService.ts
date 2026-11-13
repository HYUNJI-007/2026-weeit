import { COL, DEFAULT_SCRIPT_URL } from '../constants';
import { AttachmentItem, CounselingRecord, StoredCardRecord } from '../types';
import { cleanDateStr, cleanTimeStr, splitDateTime } from '../utils/dateTime';

export function safeParseAttachments(raw: any): AttachmentItem[] {
  if (!raw) return [];
  let parsed = raw;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      name: String(item.name || ''),
      url: String(item.url || ''),
      fileId: String(item.fileId || ''),
      mimeType: String(item.mimeType || '')
    }))
    .filter(item => item.name || item.url || item.fileId);
}

export function readFileAsBase64(file: File): Promise<AttachmentItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64: result.includes(',') ? result.split(',')[1] : result,
        size: file.size
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const LOCAL_STORAGE_RECORDS_KEY = 'wee_records_cache_v2';
const LOCAL_STORAGE_CARDS_KEY = 'wee_cards_v1';
const LOCAL_STORAGE_CONFIG_KEY = 'wee_app_config_v1';

export interface AppConfig {
  scriptUrl: string;
  sheetUrl: string;
  driveUrl: string;
  calendarUrl?: string;
  password?: string;
  counselorName?: string;
}

export function getAppConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore
  }
  return {
    scriptUrl: DEFAULT_SCRIPT_URL,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1QAFntUfI4Spq-O3oLbIWbMUjPTNHKVOSmaKoEoqcx54/edit?gid=0#gid=0',
    driveUrl: 'https://drive.google.com/drive/folders/1-xx6wdycxamPft46y_xGhud11wHwQIGH?usp=drive_link',
    calendarUrl: 'https://hyunji-007.github.io/Calendar/'
  };
}

export function saveAppConfig(config: AppConfig): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

export function getCachedRecords(): CounselingRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_RECORDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore
  }
  return [];
}

export function cacheRecords(records: CounselingRecord[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('Failed to cache records:', e);
  }
}

export async function fetchSpreadsheetRecords(scriptUrl: string): Promise<CounselingRecord[]> {
  const url = (scriptUrl || DEFAULT_SCRIPT_URL).trim();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`구글 서버 응답 실패 (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('불러온 데이터 형식이 올바르지 않습니다.');
  }

  // Row 0 is header row, row 1 onwards is actual record
  const records: CounselingRecord[] = data.slice(1).map((r, idx) => {
    const rowNum = idx + 2; // In sheet, header is row 1
    const rawAttachments = r[COL.ATTACHMENTS];
    return {
      rowNum: rowNum,
      name: String(r[COL.NAME] || '').trim(),
      school: String(r[COL.SCHOOL] || '').trim(),
      grade: String(r[COL.GRADE] || '').trim(),
      classNum: String(r[COL.CLASS_NUM] || '').trim(),
      gender: String(r[COL.GENDER] || '남').trim(),
      birth: String(r[COL.BIRTH] || '').trim(),
      phone: String(r[COL.PHONE] || '').trim(),
      parentPhone: String(r[COL.PARENT_PHONE] || '').trim(),
      counselor: String(r[COL.COUNSELOR] || '').trim(),
      caseNum: String(r[COL.CASE_NUM] || '2026-').trim(),
      big: String(r[COL.BIG] || '').trim(),
      mid: String(r[COL.MID] || '').trim(),
      small: String(r[COL.SMALL] || '').trim(),
      date: cleanDateStr(r[COL.DATE]),
      startTime: cleanTimeStr(r[COL.START_TIME]),
      endTime: cleanTimeStr(r[COL.END_TIME]),
      session: r[COL.SESSION] || 1,
      neisTitle: String(r[COL.NEIS_TITLE] || '').trim(),
      content: String(r[COL.CONTENT] || '').trim(),
      neisContent: String(r[COL.NEIS_CONTENT] || '').trim(),
      nextAppointment: String(r[COL.NEXT_APPOINTMENT] || '').trim(),
      media: String(r[COL.MEDIA] || '면담').trim(),
      rawAttachments: rawAttachments,
      attachments: safeParseAttachments(rawAttachments)
    };
  }).filter(r => r.name);

  cacheRecords(records);
  return records;
}

export async function submitCounselingRecord(
  scriptUrl: string,
  record: CounselingRecord,
  newFiles: File[],
  existingAttachments: AttachmentItem[]
): Promise<{ success: boolean; message: string }> {
  const url = (scriptUrl || DEFAULT_SCRIPT_URL).trim();

  const filePayloads = await Promise.all(newFiles.map(readFileAsBase64));

  const nextInfo = splitDateTime(record.nextAppointment);

  const payload = {
    rowNum: record.rowNum || '',
    counselor: record.counselor || '',
    name: record.name || '',
    school: record.school || '',
    grade: record.grade || '',
    classNum: record.classNum || '',
    gender: record.gender || '남',
    birth: record.birth || '',
    phone: record.phone || '',
    parentPhone: record.parentPhone || '',
    caseNum: record.caseNum || '2026-',
    session: record.session || 1,
    date: cleanDateStr(record.date),
    startTime: cleanTimeStr(record.startTime),
    endTime: cleanTimeStr(record.endTime),
    media: record.media || '면담',
    big: record.big || '',
    mid: record.mid || '',
    small: record.small || '',
    nextDate: nextInfo.date || '',
    nextTime: nextInfo.time || '',
    neisTitle: record.neisTitle || '',
    neisContent: record.neisContent || '',
    content: record.content || '',
    existingAttachments: JSON.stringify(existingAttachments || []),
    attachments: filePayloads
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`저장 서버 오류 (HTTP ${response.status})`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || '저장 중 오류가 발생했습니다.');
  }

  return result;
}

export async function postUpdateRecordPayload(scriptUrl: string, payload: any): Promise<void> {
  const url = (scriptUrl || DEFAULT_SCRIPT_URL).trim();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!result || !result.success) {
    throw new Error(result?.message || '저장 중 오류가 발생했습니다.');
  }
}

export function getLocalCards(): Record<string, StoredCardRecord> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CARDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore
  }
  return {};
}

export function saveLocalCards(cards: Record<string, StoredCardRecord>): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_CARDS_KEY, JSON.stringify(cards));
  } catch (e) {
    console.error('Failed to save cards:', e);
  }
}

export async function postCardToGoogle(scriptUrl: string, name: string, rec: StoredCardRecord): Promise<void> {
  const url = (scriptUrl || DEFAULT_SCRIPT_URL).trim();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'saveCard', name: name, card: rec })
  });
  const j = await res.json();
  if (!j || !j.success) throw new Error(j?.message || '구글 시트 저장 실패');
}

export async function syncCardsWithGoogle(scriptUrl: string): Promise<boolean> {
  const url = (scriptUrl || DEFAULT_SCRIPT_URL).trim();
  try {
    const res = await fetch(`${url}?action=getCards`);
    const j = await res.json();
    if (j && !Array.isArray(j) && j.ok && j.cards) {
      const store = getLocalCards();
      const remoteCards = j.cards;
      const pushes: string[] = [];

      Object.keys(remoteCards).forEach(n => {
        const rc = remoteCards[n];
        if (!store[n] || (rc.updatedAt || 0) > (store[n].updatedAt || 0)) {
          store[n] = rc;
        }
      });

      Object.keys(store).forEach(n => {
        const rc = remoteCards[n];
        if (!rc || (store[n].updatedAt || 0) > (rc.updatedAt || 0)) {
          pushes.push(n);
        }
      });

      saveLocalCards(store);

      for (const n of pushes) {
        try {
          await postCardToGoogle(url, n, store[n]);
        } catch (e) {
          console.error(e);
        }
      }
      return true;
    }
  } catch (e) {
    console.warn('syncCardsWithGoogle error:', e);
  }
  return false;
}
