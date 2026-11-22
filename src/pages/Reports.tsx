import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BehaviorCategory } from '@/types/database';
import { BarChart3, Loader2, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Area } from 'recharts';

const categoryLabels: Record<BehaviorCategory, string> = {
  discipline: 'Discipline',
  respect: 'Respect',
  attendance: 'Attendance',
  participation: 'Participation',
};

const COLORS = ['#059669', '#2563EB', '#D97706', '#DC2626'];

export default function Reports() {
  const { role } = useAuth();
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
    fetchReportData();
  }, [timeRange]);

  const fetchReportData = async () => {
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

      const { data: scores } = await supabase
        .from('behavior_scores')
        .select('*')
        .gte('score_date', startDate.toISOString().split('T')[0]);

      if (!scores || scores.length === 0) {
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

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="Records"
          title="Reports"
          description="Analyze behavior trends, category averages and the score distribution over time."
          actions={
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-100 sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Last 7 days</SelectItem>
                <SelectItem value="month">Last 30 days</SelectItem>
                <SelectItem value="year">Last year</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        {loading ? (
          <div className="d-flex align-items-center justify-content-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="row gap-5 sm:col-6 lg:col-3">
              <Card>
                <CardContent className="stat-card p-6">
                  <div className="d-flex align-items-center justify-content-between">
                    <div>
                      <p className="fs-13 text-slate-500">Total Scores</p>
                      <p className="stat-value">{stats.totalScores}</p>
                    </div>
                    <BarChart3 className="h-8 w-8 text-slate-400" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="stat-card p-6">
                  <div className="d-flex align-items-center justify-content-between">
                    <div>
                      <p className="fs-13 text-slate-500">Average Score</p>
                      <p className={`fs-32 fw-bold tracking-tight ${stats.avgScore >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{stats.avgScore}</p>
                    </div>
                    {stats.avgScore >= 0 ? <TrendingUp className="h-8 w-8 text-emerald-600" /> : <TrendingDown className="h-8 w-8 text-red-600" />}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="stat-card p-6">
                  <div>
                    <p className="fs-13 text-slate-500">Best Category</p>
                    <p className="fs-30 fw-bold text-emerald-600">{stats.highestCategory}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="stat-card p-6">
                  <div>
                    <p className="fs-13 text-slate-500">Needs Attention</p>
                    <p className="fs-30 fw-bold text-amber-600">{stats.lowestCategory}</p>
                    <p className="mt-1 fs-12.5 text-slate-500">Active days: {stats.daysWithActivity}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="row gap-5 lg:col-6">
              <Card>
                <CardHeader><CardTitle>Average Scores by Category</CardTitle></CardHeader>
                <CardContent>
                  {categoryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={categoryData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" stroke="#64748b" fontSize={12} />
                        <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={12} width={100} />
                        <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                        <Bar dataKey="average" fill="#059669" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="d-flex align-items-center justify-content-center h-[300px] fs-13 text-slate-500">No data available</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Score Distribution</CardTitle></CardHeader>
                <CardContent>
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
                        <Legend wrapperStyle={{ fontSize: 12, color: '#64748b' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="d-flex align-items-center justify-content-center h-[300px] fs-13 text-slate-500">No data available</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Trend chart */}
            <Card>
              <CardHeader>
                <div className="d-flex align-items-center gap-2">
                  <Calendar className="h-5 w-5 text-emerald-600" />
                  <CardTitle>Score Trend Over Time</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                      <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                        labelStyle={{ color: '#0f172a' }}
                      />
                      <Area type="monotone" dataKey="score" stroke="#059669" strokeWidth={2} fill="#059669" fillOpacity={0.1} />
                      <Bar dataKey="score" fill="#2563EB" radius={[4, 4, 0, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="d-flex align-items-center justify-content-center h-[320px] fs-13 text-slate-500">
                    No data available for this time range
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

