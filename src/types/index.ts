export interface CounselingRecord {
  rowNum?: number;
  name: string;             // 내담자 성명
  school: string;           // 학교
  grade: string;            // 학년
  classNum: string;         // 반
  gender: string;           // 성별 (남/여)
  birth: string;            // 생년월일 (YYMMDD)
  phone: string;            // 내담자 연락처
  parentPhone: string;      // 학부모 연락처
  counselor: string;        // 상담자
  caseNum: string;          // 사례번호 (예: 2026-01 또는 2026-R01)
  big: string;              // 대분류
  mid: string;              // 중분류
  small: string;            // 소분류
  date: string;             // 상담 날짜 (YYYY-MM-DD)
  startTime: string;        // 시작 시간 (HH:mm)
  endTime: string;          // 종료 시간 (HH:mm)
  session: number | string; // 회기
  neisTitle: string;        // 나이스 제목
  content: string;          // 상세 상담 내용
  neisContent: string;      // 나이스 요약
  nextAppointment: string;  // 다음 상담 일시 (YYYY-MM-DD HH:mm)
  media: string;            // 상담 매체 (면담, 전화상담, 사이버상담)
  attachments?: AttachmentItem[]; // 첨부파일
  rawAttachments?: string;
}

export interface AttachmentItem {
  name: string;
  url?: string;
  fileId?: string;
  mimeType?: string;
  base64?: string;
  size?: number;
}

export interface CareCardData {
  name: string;
  author: string;
  mgmtStart: string;
  location: string;
  mgmtEnd: string;
  method: string;
  caseNum: string;
  school: string;
  grade: string;
  classNum: string;
  gender: string[];
  route: string[];
  intakeDate: string;
  areas: string[];
  startDate: string;
  total: string;
  mainProblem: string;
  closeDate: string;
  closeReason: string[];
  goal: string[];
  linkStatus: string[];
  linkOrgs: string[];
  linkReason: string;
  other7: string;
  inc1: boolean;
  inc2: boolean;
  inc3: boolean;
  inc4: boolean;
  inc5: boolean;
  inc6: boolean;
  inc7: boolean;
  note1: string;
  note2: string;
  note3: string;
  note4: string;
  note5: string;
  note6: string;
  note7: string;
  [key: string]: any;
}

export interface StoredCardRecord {
  v: CareCardData;
  edited: Record<string, boolean>;
  updatedAt: number;
}

export interface ClientProfile {
  name: string;
  school: string;
  grade: string;
  classNum: string;
  gender: string;
  birth: string;
  phone: string;
  parentPhone: string;
  caseNum: string;
  recordsCount: number;
  lastDate: string;
}
