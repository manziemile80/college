import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { buildScope, type Scope } from '@/lib/scope';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { BehaviorCategory } from '@/types/database';
import { BarChart3, Loader2, TrendingUp, TrendingDown, Calendar, ShieldCheck } from '@/lib/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Area } from 'recharts';

const categoryLabels: Record<BehaviorCategory, string> = {
  discipline: 'Discipline',
  respect: 'Respect',
  attendance: 'Attendance',
  participation: 'Participation',
};

const COLORS = ['#16A34A', '#0EA5E9', '#F59E0B', '#DC2626'];
const GREEN = '#16A34A';

export default function Reports() {
  const { user, roles } = useAuth();
  const [scope, setScope] = useState<Scope | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('month');
  const [categoryData, setCategoryData] = useState<{ name: string; average: number; count: number }[]>([]);
  const [trendData, setTrendData] = useState<{ date: string; score: number }[]>([]);
  const [distributionData, setDistributionData] = useState<{ name: string; value: number }[]>([]);
  const [stats, setStats] = useState({
    totalScores: 0,
    avgScore: 0,
    highestCategory: '',
    lowestCategory: '',
    daysWithActivity: 0,
  });

  useEffect(() => {
    let cancelled = false;
    buildScope(supabase, user?.id, roles).then((s) => { if (!cancelled) setScope(s); });
    return () => { cancelled = true; };
  }, [user?.id, roles]);

  useEffect(() => {
    if (scope) void fetchReportData();
  }, [timeRange, scope]);

  const fetchReportData = async () => {
    if (!scope) return;
    setLoading(true);
    try {
      const now = new Date();
      let startDate = new Date();
      if (timeRange === 'week') {
        startDate.setDate(now.getDate() - 7);
      } else if (timeRange === 'month') {
        startDate.setMonth(now.getMonth() - 1);
      } else {
        startDate.setFullYear(now.getFullYear() - 1);
      }

      const query = supabase
        .from('behavior_scores')
        .select('*')
        .gte('score_date', startDate.toISOString().split('T')[0]);
      const { data: rawScores } = scope.studentIds === null
        ? await query
        : await query.in('student_id', scope.studentIds.length ? scope.studentIds : ['00000000-0000-0000-0000-000000000000']);
      const scores = rawScores || [];

      if (scores.length === 0) {
        setCategoryData([]);
        setTrendData([]);
        setDistributionData([]);
        setStats({ totalScores: 0, avgScore: 0, highestCategory: '-', lowestCategory: '-', daysWithActivity: 0 });
        setLoading(false);
        return;
      }

      const categoryScores: Record<BehaviorCategory, number[]> = {
        discipline: [],
        respect: [],
        attendance: [],
        participation: [],
      };

      scores.forEach((s) => {
        categoryScores[s.category as BehaviorCategory].push(s.score);
      });

      const catData = Object.entries(categoryScores).map(([cat, arr]) => ({
        name: categoryLabels[cat as BehaviorCategory],
        average: arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0,
        count: arr.length,
      }));
      setCategoryData(catData);

      const dateGroups: Record<string, number[]> = {};
      scores.forEach((s) => {
        const date = s.score_date;
        if (!dateGroups[date]) dateGroups[date] = [];
        dateGroups[date].push(s.score);
      });

      const trend = Object.entries(dateGroups)
        .map(([date, arr]) => ({
          date,
          score: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(-30);
      setTrendData(trend);

      const distribution = [
        { name: 'Excellent (80-100)', value: scores.filter((s) => s.score >= 80).length },
        { name: 'Good (60-79)', value: scores.filter((s) => s.score >= 60 && s.score < 80).length },
        { name: 'Average (40-59)', value: scores.filter((s) => s.score >= 40 && s.score < 60).length },
        { name: 'Poor (0-39)', value: scores.filter((s) => s.score < 40).length },
      ];
      setDistributionData(distribution);

      const totalAvg = Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length);
      const sortedCats = [...catData].sort((a, b) => b.average - a.average);
      setStats({
        totalScores: scores.length,
        avgScore: totalAvg,
        highestCategory: sortedCats[0]?.name || '-',
        lowestCategory: sortedCats[sortedCats.length - 1]?.name || '-',
        daysWithActivity: Object.keys(dateGroups).length,
      });
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const emptyState = (msg: string) => (
    <div className="d-flex align-items-center justify-content-center h-50 text-muted bd-fs-sm">{msg}</div>
  );

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="Records"
          title="Reports"
          description="Analyze behavior trends, category averages and the score distribution over time."
          actions={
            <select
              className="form-select form-select-sm w-auto"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              aria-label="Select time range"
            >
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="year">Last year</option>
            </select>
          }
        />

        {loading ? (
          <div className="d-flex align-items-center justify-content-center py-8">
            <span className="spinner-border spinner-border-lg text-success" role="status" />
          </div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="row g-3 row-cols-1 row-cols-md-2 row-cols-xl-4">
              <div className="col">
                <div className="card h-100 d-flex align-items-center gap-4 p-4">
                  <div>
                    <p className="text-muted bd-fs-sm mb-0">Total Scores</p>
                    <p className="fw-bold text-main bd-fs-lg mb-0">{stats.totalScores}</p>
                  </div>
                  <div className="d-inline-flex align-items-center justify-content-center rounded-circle bg-success-subtle p-3 text-success"><BarChart3 className="fs-5" /></div>
                </div>
              </div>
              <div className="col">
                <div className="card h-100 d-flex align-items-center gap-4 p-4">
                  <div>
                    <p className="text-muted bd-fs-sm mb-0">Average Score</p>
                    <p className="fw-bold bd-fs-lg mb-0">{stats.avgScore}</p>
                  </div>
                  <div className="d-inline-flex align-items-center justify-content-center rounded-circle bg-success-subtle p-3 text-success">{stats.avgScore >= 0 ? <TrendingUp className="fs-5" /> : <TrendingDown className="fs-5" />}</div>
                </div>
              </div>
              <div className="col">
                <div className="card h-100 d-flex align-items-center gap-4 p-4">
                  <div className="min-w-0 flex-grow-1">
                    <p className="text-muted bd-fs-sm mb-0">Best Category</p>
                    <p className="fw-bold text-success bd-fs-lg mb-0 text-truncate">{stats.highestCategory}</p>
                  </div>
                  <div className="d-inline-flex align-items-center justify-content-center rounded-circle bg-success-subtle p-3 text-success"><ShieldCheck className="fs-5" /></div>
                </div>
              </div>
              <div className="col">
                <div className="card h-100 d-flex flex-column justify-content-center p-4">
                  <p className="text-muted bd-fs-sm mb-0">Needs Attention</p>
                  <p className="fw-bold text-warning bd-fs-lg mb-0 text-truncate">{stats.lowestCategory}</p>
                  <p className="mt-1 text-muted bd-fs-sm mb-0">Active days: {stats.daysWithActivity}</p>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="row g-3 row-cols-1 row-cols-lg-2 row-cols-xl-3">
              <div className="col">
                <div className="card h-100">
                  <div className="card-header py-3"><h5 className="mb-0 fw-semibold">Average Scores by Category</h5></div>
                  <div className="card-body">
                    {categoryData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={categoryData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                          <XAxis type="number" stroke="#475569" fontSize={12} />
                          <YAxis dataKey="name" type="category" stroke="#475569" fontSize={12} width={100} />
                          <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                          <Bar dataKey="average" fill={GREEN} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : emptyState('No data available')}
                  </div>
                </div>
              </div>

              <div className="col">
                <div className="card h-100">
                  <div className="card-header py-3"><h5 className="mb-0 fw-semibold">Score Distribution</h5></div>
                  <div className="card-body">
                    {distributionData.some((d) => d.value > 0) ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={distributionData}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={115}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {distributionData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                            formatter={(v) => [v, '']}
                          />
                          <Legend wrapperStyle={{ fontSize: 12, color: '#64748B' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : emptyState('No data available')}
                  </div>
                </div>
              </div>
            </div>

            {/* Trend chart */}
            <div className="card">
              <div className="card-header d-flex align-items-center gap-2 py-3">
                <Calendar className="text-success" />
                <h5 className="mb-0 fw-semibold">Score Trend Over Time</h5>
              </div>
              <div className="card-body">
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="date" stroke="#475569" fontSize={12} />
                      <YAxis stroke="#475569" fontSize={12} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                        labelStyle={{ color: '#0F172A' }}
                      />
                      <Area type="monotone" dataKey="score" stroke={GREEN} strokeWidth={2} fill={GREEN} fillOpacity={0.1} />
                      <Bar dataKey="score" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="d-flex align-items-center justify-content-center h-75 text-muted bd-fs-sm">
                    No data available for this time range
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
