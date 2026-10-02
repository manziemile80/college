import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Bell, Shield, Database, MessageSquare, ScrollText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AuditLog } from '@/types/database';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function Settings() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

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
        {/* Header */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-secondary">Administration</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="mt-1 text-sm sm:text-base text-muted-foreground">
            Configure system preferences and notifications
          </p>
        </div>

        {/* Settings Sections */}
        <div className="grid gap-6">
          {/* Notifications */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>Configure SMS and email notification settings</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="sms-notifications">SMS Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Send SMS to parents when scores are updated
                  </p>
                </div>
                <Switch id="sms-notifications" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="email-notifications">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Send email summaries to parents weekly
                  </p>
                </div>
                <Switch id="email-notifications" />
              </div>
            </CardContent>
          </Card>

          {/* SMS Gateway */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10">
                  <MessageSquare className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <CardTitle>SMS Gateway</CardTitle>
                  <CardDescription>Configure your SMS provider (Twilio / Africa's Talking)</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                <p>
                  SMS gateway integration requires API keys. Please configure your SMS provider
                  credentials to enable parent notifications.
                </p>
                <p className="mt-2">
                  Supported providers: <strong>Twilio</strong>, <strong>Africa's Talking</strong>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                  <Shield className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <CardTitle>Security</CardTitle>
                  <CardDescription>Manage security and access settings</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="two-factor">Two-Factor Authentication</Label>
                  <p className="text-sm text-muted-foreground">
                    Require 2FA for admin accounts
                  </p>
                </div>
                <Switch id="two-factor" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="session-timeout">Session Timeout</Label>
                  <p className="text-sm text-muted-foreground">
                    Auto-logout after 30 minutes of inactivity
                  </p>
                </div>
                <Switch id="session-timeout" defaultChecked />
              </div>
            </CardContent>
          </Card>

          {/* Database */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
                  <Database className="h-5 w-5 text-info" />
                </div>
                <div>
                  <CardTitle>Database</CardTitle>
                  <CardDescription>Database information and maintenance</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Database Name</span>
                  <span className="font-medium">conduct</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="inline-flex items-center gap-1 text-success font-medium">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    Connected
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audit Logs */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                  <ScrollText className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <CardTitle>System Activity Logs</CardTitle>
                  <CardDescription>
                    Recent sensitive actions — role changes, enrollment changes and discipline reviews
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {logsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : logs.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No activity recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
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
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                          </TableCell>
                          <TableCell className="font-medium capitalize">
                            {log.action.replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{log.entity}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
