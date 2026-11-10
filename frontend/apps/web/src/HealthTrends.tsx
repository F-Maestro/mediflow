import { useMemo, useState } from 'react';
import { useVisit } from '@mediflow/shared';

type Metric = 'bloodPressure' | 'heartRate' | 'weight' | 'temperature';
const COLORS = ['#102b2d', '#12a99e'];
const metricLabels: Record<Metric, string> = { bloodPressure: 'Blood pressure', heartRate: 'Heart rate', weight: 'Weight', temperature: 'Temperature' };
const HEALTH_TREND_CUTOFF = Date.now() - 183 * 24 * 60 * 60 * 1000;

export function HealthTrends() {
  const { state, T } = useVisit();
  const [metric, setMetric] = useState<Metric>('bloodPressure');
  const readings = useMemo(() => (state.vitalReadings ?? []).filter(item => Date.parse(item.recordedAt) >= HEALTH_TREND_CUTOFF).sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt)), [state.vitalReadings]);
  const series = metric === 'bloodPressure'
    ? [{ name: 'Systolic', color: COLORS[0], values: readings.map(r => r.bloodPressureSystolic) }, { name: 'Diastolic', color: COLORS[1], values: readings.map(r => r.bloodPressureDiastolic) }]
    : [{ name: metricLabels[metric], color: COLORS[metric === 'weight' ? 1 : 0], values: readings.map(r => metric === 'heartRate' ? r.heartRate : metric === 'weight' ? r.weightKg : r.temperatureC) }];
  const points = series.map(item => item.values.map((value, i) => value == null ? null : ({ x: readings.length < 2 ? 50 : 12 + i * (76 / (readings.length - 1)), value })).filter((v): v is { x: number; value: number } => v !== null));
  const all = points.flat().map(point => point.value);
  const min = all.length ? Math.min(...all) : 0; const max = all.length ? Math.max(...all) : 1; const span = Math.max(max - min, max * .08, 1);
  const y = (value: number) => 82 - ((value - (min - span * .15)) / (span * 1.3)) * 64;
  const unit = metric === 'heartRate' ? 'bpm' : metric === 'weight' ? 'kg' : metric === 'temperature' ? '°C' : 'mmHg';
  const latest = readings[readings.length - 1];
  return <section className="card health-trends-card" aria-labelledby="health-trends-title">
    <div className="overview-section-heading"><div><p className="eyebrow">{T('dash.health')}</p><h2 id="health-trends-title">{T('dash.healthTrends')}</h2><p className="health-trends-subtitle">{T('dash.lastRecordedVisits')}</p></div>
      <label className="health-trend-select-label" htmlFor="health-trend-metric">{T('dash.selectMeasure')}<select id="health-trend-metric" className="health-trend-select" value={metric} onChange={e => setMetric(e.target.value as Metric)}>{(Object.keys(metricLabels) as Metric[]).map(key => <option key={key} value={key}>{metricLabels[key]}</option>)}</select></label>
    </div>
    {all.length === 0 ? <p className="health-trend-empty">{T('dash.noTrendReadings')}</p> : <>
      <div className="health-trend-chart" role="img" aria-label={`${metricLabels[metric]} readings over the last six months`}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[18, 39, 60, 81].map(line => <line key={line} x1="4" x2="96" y1={line} y2={line} stroke="currentColor" strokeOpacity=".14" strokeWidth=".45" />)}
          {points.map((list, seriesIndex) => <g key={seriesIndex}>
            {list.length > 1 && <polyline fill="none" stroke={series[seriesIndex].color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" points={list.map(p => `${p.x},${y(p.value)}`).join(' ')} />}
            {list.map((point, i) => <circle key={i} cx={point.x} cy={y(point.value)} r="1.25" fill="white" stroke={series[seriesIndex].color} strokeWidth=".55" />)}
          </g>)}
        </svg>
        <div className="health-trend-dates">{readings.filter((_, i) => readings.length <= 6 || i === 0 || i === readings.length - 1 || i % Math.ceil(readings.length / 5) === 0).map(r => <span key={r.id}>{new Date(r.recordedAt).toLocaleDateString(undefined, { month: 'short' })}</span>)}</div>
      </div>
      <div className="health-trend-legend">{series.map((item, i) => { const value = metric === 'bloodPressure' ? (i === 0 ? latest?.bloodPressureSystolic : latest?.bloodPressureDiastolic) : (metric === 'heartRate' ? latest?.heartRate : metric === 'weight' ? latest?.weightKg : latest?.temperatureC); return <span key={item.name}><i style={{ backgroundColor: item.color }} />{item.name} · {value ?? '—'} {unit}</span>; })}</div>
      <p className="health-trend-note">{T('dash.trendCareNote')}</p>
      {readings.length < 2 && <p className="health-trend-empty compact">{T('dash.needMoreReadings')}</p>}
    </>}
  </section>;
}
