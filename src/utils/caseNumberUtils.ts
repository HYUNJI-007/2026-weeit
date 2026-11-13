import { CounselingRecord } from '../types';
import { pad2 } from './dateTime';

/**
 * Extract case number info from string
 * Examples: "2026-01", "2026-R02", "2026-R12", "2025-05"
 */
export function parseCaseNumber(caseNum: string): {
  year: string;
  isRoaming: boolean;
  number: number;
  raw: string;
} | null {
  if (!caseNum) return null;
  const trimmed = caseNum.trim();
  
  // Pattern 1: Roaming (e.g. 2026-R01, 2026-r1, 2026-순회-01)
  const roamMatch = trimmed.match(/^(\d{4})[-_]?(?:R|순회)[-_]?(\d+)$/i);
  if (roamMatch) {
    return {
      year: roamMatch[1],
      isRoaming: true,
      number: parseInt(roamMatch[2], 10),
      raw: trimmed
    };
  }

  // Pattern 2: Normal (e.g. 2026-01, 2026-1)
  const normalMatch = trimmed.match(/^(\d{4})[-_]?(\d+)$/);
  if (normalMatch) {
    return {
      year: normalMatch[1],
      isRoaming: false,
      number: parseInt(normalMatch[2], 10),
      raw: trimmed
    };
  }

  return null;
}

/**
 * Calculate the next available case number based on existing records
 */
export function getNextCaseNumber(
  records: CounselingRecord[],
  type: 'normal' | 'roaming' = 'normal',
  targetYear: string = '2026'
): string {
  let maxNum = 0;

  // Use a map to track unique students' case numbers
  const studentCaseNums = new Set<string>();
  records.forEach(r => {
    if (r.caseNum) {
      studentCaseNums.add(r.caseNum.trim());
    }
  });

  studentCaseNums.forEach(cn => {
    const parsed = parseCaseNumber(cn);
    if (parsed) {
      // Check year and roaming type
      const yearMatch = parsed.year === targetYear;
      if (yearMatch) {
        if (type === 'roaming' && parsed.isRoaming) {
          if (parsed.number > maxNum) maxNum = parsed.number;
        } else if (type === 'normal' && !parsed.isRoaming) {
          if (parsed.number > maxNum) maxNum = parsed.number;
        }
      }
    }
  });

  const nextNum = maxNum + 1;
  const numStr = nextNum < 10 ? pad2(nextNum) : String(nextNum);

  if (type === 'roaming') {
    return `${targetYear}-R${numStr}`;
  }
  return `${targetYear}-${numStr}`;
}

/**
 * Increment or decrement a case number by delta (+1 or -1)
 */
export function stepCaseNumber(currentVal: string, delta: number): string {
  const parsed = parseCaseNumber(currentVal);
  if (!parsed) {
    // If empty or non-standard, return default
    return delta >= 0 ? '2026-01' : '2026-01';
  }

  const nextNumber = Math.max(1, parsed.number + delta);
  const numStr = nextNumber < 10 ? pad2(nextNumber) : String(nextNumber);

  if (parsed.isRoaming) {
    return `${parsed.year}-R${numStr}`;
  }
  return `${parsed.year}-${numStr}`;
}

/**
 * Detect duplicate case numbers across different students
 */
export interface DuplicateCaseInfo {
  caseNum: string;
  studentNames: string[];
}

export function findDuplicateCaseNumbers(records: CounselingRecord[]): DuplicateCaseInfo[] {
  const caseToStudents = new Map<string, Set<string>>();

  records.forEach(r => {
    const cn = (r.caseNum || '').trim();
    const name = (r.name || '').trim();
    if (!cn || !name) return;

    if (!caseToStudents.has(cn)) {
      caseToStudents.set(cn, new Set());
    }
    caseToStudents.get(cn)!.add(name);
  });

  const duplicates: DuplicateCaseInfo[] = [];
  caseToStudents.forEach((studentsSet, caseNum) => {
    if (studentsSet.size > 1) {
      duplicates.push({
        caseNum,
        studentNames: Array.from(studentsSet)
      });
    }
  });

  return duplicates;
}
