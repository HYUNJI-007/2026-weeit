import React, { useState, useMemo } from 'react';
import { CATEGORIES } from '../constants';
import { CounselingRecord } from '../types';
import { printStatisticsReport } from '../utils/printHelpers';
import { cleanDateStr } from '../utils/dateTime';

interface StatisticsViewProps {
  records: CounselingRecord[];
  counselorName: string;
}

export const StatisticsView: React.FC<StatisticsViewProps> = ({ records, counselorName }) => {
  const [periodFilter, setPeriodFilter] = useState<'all' | '1m' | '3m' | 'year'>('all');

  // Filter records based on selected period
  const filteredRecords = useMemo(() => {
    if (periodFilter === 'all') return records;

    const now = new Date();
    return records.filter(r => {
      const dStr = cleanDateStr(r.date);
      if (!dStr) return false;
      const recDate = new Date(dStr);
      if (isNaN(recDate.getTime())) return true;

      if (periodFilter === '1m') {
        const diffMs = now.getTime() - recDate.getTime();
        return diffMs >= 0 && diffMs <= 30 * 24 * 60 * 60 * 1000;
      }
      if (periodFilter === '3m') {
        const diffMs = now.getTime() - recDate.getTime();
        return diffMs >= 0 && diffMs <= 90 * 24 * 60 * 60 * 1000;
      }
      if (periodFilter === 'year') {
        return recDate.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [records, periodFilter]);

  const bigLabels = Object.keys(CATEGORIES);
  const totalCount = filteredRecords.length;

  // Unique clients count
  const uniqueStudents = useMemo(() => {
    return Array.from(new Set(filteredRecords.map(r => r.name.trim()).filter(Boolean)));
  }, [filteredRecords]);

  const avgSessions = uniqueStudents.length > 0
    ? (totalCount / uniqueStudents.length).toFixed(1)
    : '0';

  const colorPalette = [
    '#E0658B', // Oneul Rose
    '#8265BD', // Wee Purple
    '#3A86C8', // 순회 Blue
    '#43A047', // To Do Green
    '#FF9800', // Warm Amber
    '#00ACC1', // Teal
    '#E91E63', // Deep Pink
    '#607D8B'  // Blue Grey
  ];

  // 1. Big category statistics
  const bigStats = useMemo(() => {
    return bigLabels.map((big, i) => {
      const count = filteredRecords.filter(r => r.big === big).length;
      const percentage = totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : '0';
      return {
        big,
        count,
        percentage: Number(percentage),
        color: colorPalette[i % colorPalette.length]
      };
    });
  }, [filteredRecords, totalCount, bigLabels]);

  const topBig = useMemo(() => {
    const sorted = [...bigStats].sort((a, b) => b.count - a.count);
    return sorted[0]?.count > 0 ? sorted[0] : null;
  }, [bigStats]);

  // Donut chart slices calculation
  let cumulativePercent = 0;
  const slices = bigStats.map(stat => {
    const startAngle = (cumulativePercent / 100) * 360;
    cumulativePercent += stat.percentage;
    const endAngle = (cumulativePercent / 100) * 360;

    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;

    const cx = 150;
    const cy = 150;
    const r = 110;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    const largeArc = stat.percentage > 50 ? 1 : 0;
    const pathData = totalCount === 0 || stat.count === 0
      ? ''
      : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    return {
      ...stat,
      pathData
    };
  });

  // 2. Top Mid categories for horizontal bar chart
  const topMidStats = useMemo(() => {
    const map = new Map<string, { mid: string; big: string; count: number }>();
    filteredRecords.forEach(r => {
      const mid = r.mid?.trim();
      if (!mid) return;
      if (!map.has(mid)) {
        map.set(mid, { mid, big: r.big || '', count: 0 });
      }
      map.get(mid)!.count += 1;
    });

    const list = Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const maxCount = list[0]?.count || 1;

    return list.map((item, idx) => ({
      ...item,
      percentage: totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0,
      barWidth: Math.max(8, Math.round((item.count / maxCount) * 100)),
      color: colorPalette[idx % colorPalette.length]
    }));
  }, [filteredRecords, totalCount]);

  // 3. Media distribution
  const mediaStats = useMemo(() => {
    const counts = {
      '면담': filteredRecords.filter(r => (r.media || '면담') === '면담').length,
      '전화상담': filteredRecords.filter(r => r.media === '전화상담').length,
      '사이버상담': filteredRecords.filter(r => r.media === '사이버상담').length,
    };
    return [
      { label: '🗣️ 대면 면담', count: counts['면담'], color: '#E0658B' },
      { label: '📞 전화상담', count: counts['전화상담'], color: '#8265BD' },
      { label: '💻 사이버상담', count: counts['사이버상담'], color: '#3A86C8' },
    ];
  }, [filteredRecords]);

  // 4. Gender distribution
  const genderStats = useMemo(() => {
    const male = filteredRecords.filter(r => r.gender === '남').length;
    const female = filteredRecords.filter(r => r.gender === '여').length;
    const other = totalCount - (male + female);
    return {
      male,
      female,
      other,
      malePct: totalCount > 0 ? Math.round((male / totalCount) * 100) : 0,
      femalePct: totalCount > 0 ? Math.round((female / totalCount) * 100) : 0,
    };
  }, [filteredRecords, totalCount]);

  return (
    <div id="statPage">
      {/* Top Header Card */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="card-title" style={{ margin: 0, paddingBottom: 0, border: 'none' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.25rem' }}>📊</span>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)' }}>
                상담 실적 및 통계 분석 대시보드
              </h2>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-sub)' }}>
              경기도구리남양주교육지원청 Wee센터 및 학교 Wee클래스 누적 실적 현황
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Period Filter Buttons */}
            <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '9999px' }} className="no-print">
              {[
                { id: 'all', label: '전체' },
                { id: 'year', label: '올해' },
                { id: '3m', label: '최근 3개월' },
                { id: '1m', label: '최근 1개월' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPeriodFilter(tab.id as any)}
                  style={{
                    border: 'none',
                    background: periodFilter === tab.id ? '#ffffff' : 'transparent',
                    color: periodFilter === tab.id ? 'var(--accent)' : 'var(--text-sub)',
                    fontWeight: periodFilter === tab.id ? 800 : 600,
                    fontSize: '0.78rem',
                    padding: '5px 12px',
                    borderRadius: '9999px',
                    cursor: 'pointer',
                    boxShadow: periodFilter === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn no-print"
              onClick={() => printStatisticsReport(filteredRecords, counselorName)}
              style={{
                background: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
                color: 'white',
                fontSize: '0.82rem',
                fontWeight: 800,
                padding: '8px 16px',
                borderRadius: '9999px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(51, 65, 85, 0.2)'
              }}
            >
              <span>🖨️</span>
              <span>통계 보고서 인쇄</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Metric Summary Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '18px'
        }}
      >
        {/* Card 1 */}
        <div
          className="card"
          style={{
            margin: 0,
            padding: '18px 20px',
            borderLeft: '4px solid var(--accent)',
            background: 'linear-gradient(145deg, #ffffff 0%, #fffbfd 100%)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-sub)' }}>총 상담 건수</span>
            <span style={{ fontSize: '1.25rem' }}>🌸</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '6px' }}>
            {totalCount}<span style={{ fontSize: '1rem', fontWeight: 700, marginLeft: '3px', color: 'var(--text-sub)' }}>건</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--accent)', fontWeight: 700, marginTop: '4px' }}>
            기록된 누적 상담 및 자문
          </div>
        </div>

        {/* Card 2 */}
        <div
          className="card"
          style={{
            margin: 0,
            padding: '18px 20px',
            borderLeft: '4px solid #8265BD',
            background: 'linear-gradient(145deg, #ffffff 0%, #fbf9ff 100%)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-sub)' }}>관리 내담자 수</span>
            <span style={{ fontSize: '1.25rem' }}>👥</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '6px' }}>
            {uniqueStudents.length}<span style={{ fontSize: '1rem', fontWeight: 700, marginLeft: '3px', color: 'var(--text-sub)' }}>명</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#8265BD', fontWeight: 700, marginTop: '4px' }}>
            등록 학생 및 내담자
          </div>
        </div>

        {/* Card 3 */}
        <div
          className="card"
          style={{
            margin: 0,
            padding: '18px 20px',
            borderLeft: '4px solid #3A86C8',
            background: 'linear-gradient(145deg, #ffffff 0%, #f7faff 100%)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-sub)' }}>최다 상담 영역</span>
            <span style={{ fontSize: '1.25rem' }}>🎯</span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {topBig ? topBig.big : '-'}<span style={{ fontSize: '0.9rem', fontWeight: 700, marginLeft: '4px', color: '#3A86C8' }}>{topBig ? `(${topBig.count}건)` : ''}</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: 700, marginTop: '4px' }}>
            전체의 {topBig ? topBig.percentage : 0}% 점유
          </div>
        </div>

        {/* Card 4 */}
        <div
          className="card"
          style={{
            margin: 0,
            padding: '18px 20px',
            borderLeft: '4px solid #43A047',
            background: 'linear-gradient(145deg, #ffffff 0%, #f8fff9 100%)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-sub)' }}>평균 상담 회기</span>
            <span style={{ fontSize: '1.25rem' }}>📈</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '6px' }}>
            {avgSessions}<span style={{ fontSize: '1rem', fontWeight: 700, marginLeft: '3px', color: 'var(--text-sub)' }}>회기 / 인</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#43A047', fontWeight: 700, marginTop: '4px' }}>
            지속 상담 및 심층 개입도
          </div>
        </div>
      </div>

      {/* Main Charts Row: 2 Balanced Large Columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: '18px',
          marginBottom: '18px'
        }}
      >
        {/* Chart 1: Donut Chart with Redesigned Larger Sizing & Legend */}
        <div className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--text-main)' }}>
              🔮 대분류별 실적 분포
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-sub)' }}>
              총 {bigStats.length}개 유형
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '24px',
              flexWrap: 'wrap',
              flex: 1,
              padding: '10px 0'
            }}
          >
            {/* SVG Donut */}
            <div style={{ position: 'relative', width: '240px', height: '240px', flexShrink: 0 }}>
              <svg viewBox="0 0 300 300" style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.06))' }}>
                {totalCount === 0 ? (
                  <circle cx="150" cy="150" r="110" fill="#f1f5f9" />
                ) : (
                  slices.map((slice, i) => (
                    slice.pathData ? (
                      <path
                        key={i}
                        d={slice.pathData}
                        fill={slice.color}
                        style={{ transition: 'all 0.3s ease' }}
                      />
                    ) : null
                  ))
                )}
                {/* Center Hole */}
                <circle cx="150" cy="150" r="70" fill="white" />
              </svg>

              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none'
                }}
              >
                <span style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>
                  {totalCount}
                </span>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-sub)' }}>
                  총 실적(건)
                </span>
              </div>
            </div>

            {/* Redesigned Legend with Progress & Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '190px', flex: 1 }}>
              {bigStats.map((item, i) => (
                <div
                  key={i}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    background: item.count > 0 ? '#f8fafc' : 'transparent',
                    border: '1px solid',
                    borderColor: item.count > 0 ? '#e2e8f0' : 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: item.color }} />
                      <span style={{ fontWeight: 800, color: 'var(--text-main)' }}>{item.big}</span>
                    </div>
                    <span style={{ color: 'var(--text-sub)', fontWeight: 800, fontSize: '0.8rem' }}>
                      {item.count}건 <span style={{ color: item.color }}>({item.percentage}%)</span>
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ width: '100%', height: '5px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${item.percentage}%`,
                        height: '100%',
                        backgroundColor: item.color,
                        borderRadius: '999px',
                        transition: 'width 0.4s ease'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart 2: Top Mid-Categories Horizontal Bar Chart */}
        <div className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--text-main)' }}>
              🏆 주요 상담 주제 (중분류 TOP 6)
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-sub)' }}>
              가장 많이 의뢰·진행된 주제
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, justifyContent: 'center' }}>
            {topMidStats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-sub)', fontSize: '0.86rem' }}>
                기록된 상담 주제 데이터가 없습니다.
              </div>
            ) : (
              topMidStats.map((item, idx) => (
                <div key={item.mid} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: idx < 3 ? 'var(--accent)' : '#94a3b8',
                          color: '#fff',
                          fontSize: '0.7rem',
                          fontWeight: 900,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span style={{ fontWeight: 800, color: 'var(--text-main)' }}>{item.mid}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-sub)', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>
                        {item.big}
                      </span>
                    </div>

                    <span style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.84rem' }}>
                      {item.count}건 <span style={{ color: 'var(--text-sub)', fontSize: '0.78rem', fontWeight: 600 }}>({item.percentage}%)</span>
                    </span>
                  </div>

                  {/* Horizontal Bar */}
                  <div style={{ width: '100%', height: '10px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${item.barWidth}%`,
                        height: '100%',
                        background: `linear-gradient(90deg, ${item.color} 0%, ${item.color}dd 100%)`,
                        borderRadius: '999px',
                        transition: 'width 0.4s ease'
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Secondary Distribution Row: Media & Gender */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '18px',
          marginBottom: '20px'
        }}
      >
        {/* Media Distribution */}
        <div className="card" style={{ margin: 0, padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 900, color: 'var(--text-main)' }}>
              📞 상담 매체별 진행 분포
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {mediaStats.map(item => {
              const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
              return (
                <div key={item.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '4px', fontWeight: 700 }}>
                    <span>{item.label}</span>
                    <span>{item.count}건 ({pct}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '7px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        backgroundColor: item.color,
                        borderRadius: '999px'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gender Distribution */}
        <div className="card" style={{ margin: 0, padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 900, color: 'var(--text-main)' }}>
              🚻 내담자 성별 분포
            </h4>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ flex: 1, padding: '12px', background: '#eff6ff', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.78rem', color: '#1d4ed8', fontWeight: 800 }}>남학생</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#1e3a8a', marginTop: '2px' }}>
                {genderStats.male}<span style={{ fontSize: '0.8rem', fontWeight: 600 }}>건</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 700 }}>{genderStats.malePct}%</div>
            </div>

            <div style={{ flex: 1, padding: '12px', background: '#fff1f2', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.78rem', color: '#be123c', fontWeight: 800 }}>여학생</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#881337', marginTop: '2px' }}>
                {genderStats.female}<span style={{ fontSize: '0.8rem', fontWeight: 600 }}>건</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#f43f5e', fontWeight: 700 }}>{genderStats.femalePct}%</div>
            </div>
          </div>

          <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${genderStats.malePct}%`, height: '100%', background: '#3b82f6' }} title={`남학생 ${genderStats.malePct}%`} />
            <div style={{ width: `${genderStats.femalePct}%`, height: '100%', background: '#f43f5e' }} title={`여학생 ${genderStats.femalePct}%`} />
          </div>
        </div>
      </div>

      {/* Detailed Breakdown Result Table */}
      <div className="card">
        <div className="card-title">
          <span>📚 대·중·소분류별 상세 실적 통계 대장</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-sub)', fontWeight: 600 }}>
            {periodFilter === 'all' ? '전체 누적' : periodFilter === 'year' ? '올해 실적' : periodFilter === '3m' ? '최근 3개월' : '최근 1개월'} 기준
          </span>
        </div>

        <div id="statResult" style={{ overflowX: 'auto' }}>
          <table className="stat-table" style={{ marginTop: '10px', borderRadius: '12px', overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ width: '20%', padding: '12px 10px' }}>대분류</th>
                <th style={{ width: '25%', padding: '12px 10px' }}>중분류</th>
                <th style={{ width: '40%', padding: '12px 10px' }}>소분류</th>
                <th style={{ width: '15%', padding: '12px 10px' }}>건수</th>
              </tr>
            </thead>
            <tbody>
              {bigLabels.map(big => {
                const bigRecords = filteredRecords.filter(r => r.big === big);
                const mids = Object.keys(CATEGORIES[big]);
                const bigRowCount = mids.reduce((sum, mid) => sum + CATEGORIES[big][mid].length, 0);

                let bigRendered = false;

                return (
                  <React.Fragment key={big}>
                    <tr style={{ fontWeight: 'bold', background: '#fdf2f6', color: 'var(--accent)' }}>
                      <td colSpan={3} style={{ textAlign: 'left', paddingLeft: '18px', borderLeft: '4px solid var(--accent)' }}>
                        ● {big} 총계
                      </td>
                      <td style={{ fontWeight: 900 }}>{bigRecords.length}건</td>
                    </tr>

                    {mids.map(mid => {
                      const midRecords = bigRecords.filter(r => r.mid === mid);
                      const smalls = CATEGORIES[big][mid];
                      const midRowCount = smalls.length;

                      return smalls.map((small, idx) => {
                        const smallCount = midRecords.filter(r => r.small === small).length;

                        const isFirstBig = !bigRendered;
                        if (isFirstBig) bigRendered = true;

                        return (
                          <tr key={`${big}-${mid}-${small}`}>
                            {isFirstBig && (
                              <td
                                rowSpan={bigRowCount}
                                style={{ verticalAlign: 'middle', fontWeight: 800, background: '#ffffff', color: 'var(--text-main)' }}
                              >
                                {big}
                              </td>
                            )}
                            {idx === 0 && (
                              <td
                                rowSpan={midRowCount}
                                style={{ verticalAlign: 'middle', fontWeight: 700, background: '#fcfcfd', color: '#475569' }}
                              >
                                {mid}
                              </td>
                            )}
                            <td style={{ textAlign: 'left', paddingLeft: '14px', color: smallCount > 0 ? 'var(--text-main)' : '#94a3b8' }}>
                              {small}
                            </td>
                            <td style={{ fontWeight: smallCount > 0 ? 800 : 400, color: smallCount > 0 ? 'var(--accent)' : '#94a3b8' }}>
                              {smallCount}
                            </td>
                          </tr>
                        );
                      });
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
