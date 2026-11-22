import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Bell, Shield, Database, MessageSquare, ScrollText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AuditLog } from '@/types/database';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function Settings() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(true);

  useEffect(() => {
    supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setLogs((data as AuditLog[]) || []);
        setLogsLoading(false);
      });
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="Administration"
          title="Settings"
          description="Configure system preferences, notifications and security settings."
        />

        {/* Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-emerald-50">
                <Bell className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Configure SMS and email notification settings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4 rounded-[12px] border border-slate-200 bg-slate-50 p-4">
              <div className="min-w-0">
                <Label htmlFor="sms-notifications" className="text-[14px] font-semibold">SMS Notifications</Label>
                <p className="mt-0.5 text-[13px] text-slate-500">Send SMS to parents when scores are updated</p>
              </div>
              <Switch id="sms-notifications" checked={smsEnabled} onCheckedChange={setSmsEnabled} />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-[12px] border border-slate-200 bg-slate-50 p-4">
              <div className="min-w-0">
                <Label htmlFor="email-notifications" className="text-[14px] font-semibold">Email Notifications</Label>
                <p className="mt-0.5 text-[13px] text-slate-500">Send email summaries to parents weekly</p>
              </div>
              <Switch id="email-notifications" checked={emailEnabled} onCheckedChange={setEmailEnabled} />
            </div>
          </CardContent>
        </Card>

        {/* SMS Gateway */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-blue-50">
                <MessageSquare className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle>SMS Gateway</CardTitle>
                <CardDescription>Configure your SMS provider (Twilio / Africa's Talking)</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-500 space-y-2">
              <p>SMS gateway integration requires API keys. Please configure your SMS provider credentials to enable parent notifications.</p>
              <p className="font-medium text-slate-600">Supported providers: <span className="font-normal">Twilio</span>, <span className="font-normal">Africa's Talking</span></p>
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-red-50">
                <Shield className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <CardTitle>Security</CardTitle>
                <CardDescription>Manage security and access settings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4 rounded-[12px] border border-slate-200 bg-slate-50 p-4">
              <div className="min-w-0">
                <Label htmlFor="two-factor" className="text-[14px] font-semibold">Two-Factor Authentication</Label>
                <p className="mt-0.5 text-[13px] text-slate-500">Require 2FA for admin accounts</p>
              </div>
              <Switch id="two-factor" checked={twoFactor} onCheckedChange={setTwoFactor} />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-[12px] border border-slate-200 bg-slate-50 p-4">
              <div className="min-w-0">
                <Label htmlFor="session-timeout" className="text-[14px] font-semibold">Session Timeout</Label>
                <p className="mt-0.5 text-[13px] text-slate-500">Auto-logout after 30 minutes of inactivity</p>
              </div>
              <Switch id="session-timeout" checked={sessionTimeout} onCheckedChange={setSessionTimeout} />
            </div>
          </CardContent>
        </Card>

        {/* Database */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-cyan-50">
                <Database className="h-5 w-5 text-cyan-600" />
              </div>
              <div>
                <CardTitle>Database</CardTitle>
                <CardDescription>Database information and maintenance</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-[13px] text-slate-500">Database Name</span>
              <span className="text-[13px] font-medium text-slate-900">conduct</span>
            </div>
            <div className="flex justify-between rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-[13px] text-slate-500">Status</span>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-600">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />Connected
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Audit logs */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-amber-50">
                <ScrollText className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <CardTitle>System Activity Logs</CardTitle>
                <CardDescription>Recent sensitive actions — role changes, enrollment changes and discipline reviews</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {logsLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
            ) : logs.length === 0 ? (
              <div className="empty-state">
                <ScrollText className="h-10 w-10 text-slate-400 mb-3" />
                <p className="text-[14px] text-slate-500">No activity recorded yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Record</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-[13px] text-slate-500">
                        {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="text-[13px] font-medium text-slate-900 capitalize">
                        {log.action.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="text-[13px] text-slate-500">{log.entity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
