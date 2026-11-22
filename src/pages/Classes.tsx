import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Class } from '@/types/database';
import { Plus, Search, BookOpen, Loader2, Users, Trash2, Pencil, ArrowUpRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function Classes() {
  const { user, role } = useAuth();
  const canManage = role === 'admin' || role === 'teacher';
  const [classes, setClasses] = useState<Class[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const [name, setName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear().toString());

  const [editing, setEditing] = useState<Class | null>(null);
  const [editName, setEditName] = useState('');
  const [editGrade, setEditGrade] = useState('');
  const [editYear, setEditYear] = useState('');

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [fromClass, setFromClass] = useState<string>('');
  const [toClass, setToClass] = useState<string>('');
  const [promoting, setPromoting] = useState(false);
  const [eligibleCount, setEligibleCount] = useState<number>(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: classesData } = await supabase
        .from('classes')
        .select('*')
        .order('name');

      if (classesData) {
        setClasses(classesData as Class[]);

        const counts: Record<string, number> = {};
        for (const cls of classesData) {
          const { count } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('class_id', cls.id);
          counts[cls.id] = count || 0;
        }
        setStudentCounts(counts);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      const { error } = await supabase.from('classes').insert({
        name,
        grade_level: gradeLevel,
        academic_year: academicYear,
        teacher_id: user?.id || null,
      });

      if (error) throw error;

      toast.success('Class created successfully');
      setIsAddDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error('Failed to create class', { description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setGradeLevel('');
    setAcademicYear(new Date().getFullYear().toString());
  };

  const handleDeleteClass = async (cls: Class) => {
    if (!confirm(`Delete class "${cls.name}"? Students linked to it will be unassigned.`)) return;
    const { error } = await supabase.from('classes').delete().eq('id', cls.id);
    if (error) return toast.error('Failed to delete', { description: error.message });
    toast.success('Class deleted');
    fetchData();
  };

  const openEdit = (cls: Class) => {
    setEditing(cls);
    setEditName(cls.name);
    setEditGrade(cls.grade_level);
    setEditYear(cls.academic_year);
  };

  const handleEditSave = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from('classes')
      .update({ name: editName, grade_level: editGrade, academic_year: editYear })
      .eq('id', editing.id);
    if (error) return toast.error('Failed to update', { description: error.message });
    toast.success('Class updated');
    setEditing(null);
    fetchData();
  };

  useEffect(() => {
    if (!fromClass) { setEligibleCount(0); return; }
    setEligibleCount(studentCounts[fromClass] || 0);
  }, [fromClass, studentCounts]);

  const handlePromote = async () => {
    if (!fromClass || !toClass || fromClass === toClass) {
      return toast.error('Select different source and destination classes');
    }
    if (!confirm(`Promote ALL ${eligibleCount} student(s) from this class to the new class?`)) return;
    setPromoting(true);
    const { error, count } = await supabase
      .from('students')
      .update({ class_id: toClass }, { count: 'exact' })
      .eq('class_id', fromClass);
    setPromoting(false);
    if (error) return toast.error('Promotion failed', { description: error.message });
    toast.success(`Promoted ${count ?? eligibleCount} student(s)`);
    setPromoteOpen(false);
    setFromClass(''); setToClass('');
    fetchData();
  };

  const filteredClasses = classes.filter((cls) =>
    cls.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cls.grade_level.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="School"
          title="Classes"
          description="Manage class sections, grades, student counts and year assignments."
          actions={canManage ? (
            <div className="d-flex flex-wrap gap-2">
              <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="secondary" className="gap-2"><ArrowUpRight className="h-4 w-4" />Promote Students</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md w-[calc(100%-1rem)]">
                  <DialogHeader><DialogTitle>Promote Students to Next Class</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-3">
                    <div className="space-y-2">
                      <Label>From Class</Label>
                      <Select value={fromClass} onValueChange={setFromClass}>
                        <SelectTrigger><SelectValue placeholder="Select source class (e.g., S1)" /></SelectTrigger>
                        <SelectContent>
                          {classes.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name} ({studentCounts[c.id] || 0} students)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>To Class</Label>
                      <Select value={toClass} onValueChange={setToClass}>
                        <SelectTrigger><SelectValue placeholder="Select destination class (e.g., S2)" /></SelectTrigger>
                        <SelectContent>
                          {classes.filter(c => c.id !== fromClass).map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-3 fs-13 text-slate-600">
                      <strong>{eligibleCount}</strong> eligible student(s) will be moved.
                    </div>
                    <div className="d-flex justify-content-end gap-2">
                      <Button variant="outline" onClick={() => setPromoteOpen(false)}>Cancel</Button>
                      <Button onClick={handlePromote} disabled={promoting || !fromClass || !toClass}>
                        {promoting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}Promote
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2"><Plus className="h-4 w-4" />Add Class</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto w-[calc(100%-1rem)]">
                  <DialogHeader><DialogTitle>Create New Class</DialogTitle></DialogHeader>
                  <form onSubmit={handleAddClass} className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Class Name</Label>
                      <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Class 5A" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gradeLevel">Grade Level</Label>
                      <Input id="gradeLevel" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} placeholder="e.g., Grade 5" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="academicYear">Academic Year</Label>
                      <Input id="academicYear" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="e.g., 2024-2025" required />
                    </div>
                    <div className="d-flex justify-content-end gap-3 pt-2">
                      <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                      <Button type="submit" disabled={formLoading}>
                        {formLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Creating...</> : 'Create Class'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          ) : undefined}
        />

        <div className="position-relative w-100 sm:max-w-xs">
          <Search className="position-absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search classes..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>

        {loading ? (
          <div className="d-flex align-items-center justify-content-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
        ) : filteredClasses.length === 0 ? (
          <Card><CardContent className="d-flex d-flex flex-column align-items-center justify-content-center py-12">
            <BookOpen className="h-12 w-12 text-slate-400 mb-4" />
            <h3 className="fs-18 fw-semibold text-slate-900">No classes found</h3>
            <p className="fs-13 text-slate-500">{searchQuery ? 'Try adjusting your search' : 'Create your first class to get started'}</p>
          </CardContent></Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Grade Level</TableHead>
                  <TableHead>Academic Year</TableHead>
                  <TableHead className="text-end">Students</TableHead>
                  {canManage && <TableHead className="text-end">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClasses.map((cls) => (
                  <TableRow key={cls.id}>
                    <TableCell>
                      <div className="d-flex align-items-center gap-3">
                        <div className="d-flex h-9 w-9 align-items-center justify-content-center rounded-lg bg-emerald-50 text-emerald-600">
                          <BookOpen className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="fw-medium text-slate-900">{cls.name}</p>
                          <p className="fs-12.5 text-slate-500">{cls.grade_level}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600">{cls.grade_level}</TableCell>
                    <TableCell className="text-slate-600">{cls.academic_year}</TableCell>
                    <TableCell className="text-end">
                      <span className="d-inline-flex align-items-center gap-1.5 fs-13 text-slate-600">
                        <Users className="h-4 w-4 text-emerald-600" />{studentCounts[cls.id] || 0} students
                      </span>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-end">
                        <div className="d-flex justify-content-end gap-1.5">
                          <Button variant="edit" size="sm" onClick={() => openEdit(cls)} className="gap-1.5">
                            <Pencil className="h-4 w-4" />Edit
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteClass(cls)} className="gap-1.5">
                            <Trash2 className="h-4 w-4" />Delete
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="sm:max-w-md w-[calc(100%-1rem)]">
            <DialogHeader><DialogTitle>Edit Class</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Class Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Grade Level</Label>
                <Input value={editGrade} onChange={(e) => setEditGrade(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Academic Year</Label>
                <Input value={editYear} onChange={(e) => setEditYear(e.target.value)} />
              </div>
              <div className="d-flex justify-content-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={handleEditSave}>Save</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}


