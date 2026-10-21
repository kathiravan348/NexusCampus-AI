import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../../components/layout/Shell';
import { 
  Search, 
  PlayCircle, 
  Clock, 
  BookOpen, 
  Star, 
  Plus, 
  Trash2, 
  Edit, 
  Layers, 
  Sparkles, 
  FileQuestion, 
  X 
} from 'lucide-react';
import { useDialog } from '../../core/dialog';

interface CourseItem {
  id: string;
  code: string;
  title: string;
  category: string;
  progress: number;
  lessons: number;
  hours: string;
  instructor: string;
  thumbnail: string;
  status: 'published' | 'draft';
}

const initialCourses: CourseItem[] = [
  {
    id: 'CRS-101',
    code: 'CS-301',
    title: 'Introduction to Artificial Intelligence & Neural Networks',
    category: 'Computer Science',
    progress: 85,
    lessons: 12,
    hours: '4h 30m',
    instructor: 'Dr. Alan Turing',
    thumbnail: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=600&q=80',
    status: 'published'
  },
  {
    id: 'CRS-102',
    code: 'SE-204',
    title: 'Advanced Cloud Distributed Systems Architecture',
    category: 'Software Engineering',
    progress: 30,
    lessons: 24,
    hours: '12h 15m',
    instructor: 'Prof. Margaret Hamilton',
    thumbnail: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=600&q=80',
    status: 'published'
  },
  {
    id: 'CRS-103',
    code: 'MTH-310',
    title: 'Discrete Mathematics & Modern Cryptography',
    category: 'Applied Mathematics',
    progress: 0,
    lessons: 48,
    hours: '22h 00m',
    instructor: 'Dr. Katherine Johnson',
    thumbnail: 'https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=600&q=80',
    status: 'published'
  },
  {
    id: 'CRS-104',
    code: 'SEC-402',
    title: 'Cybersecurity Incident Response & Red Team Ops',
    category: 'Cybersecurity',
    progress: 100,
    lessons: 8,
    hours: '3h 45m',
    instructor: 'Kevin Mitnick',
    thumbnail: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=600&q=80',
    status: 'published'
  }
];

export function CourseCatalogue() {
  const [courses, setCourses] = useState<CourseItem[]>(initialCourses);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const navigate = useNavigate();
  const { openDialog, openConfirm } = useDialog();

  const categories = ['All', 'Computer Science', 'Software Engineering', 'Applied Mathematics', 'Cybersecurity'];

  // CREATE: Publish New Course Modal
  const handleOpenPublishModal = () => {
    openDialog(
      'publish-course-modal',
      ({ onClose }) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const title = (form.elements.namedItem('title') as HTMLInputElement).value;
            const code = (form.elements.namedItem('code') as HTMLInputElement).value;
            const category = (form.elements.namedItem('category') as HTMLSelectElement).value;
            const instructor = (form.elements.namedItem('instructor') as HTMLInputElement).value;
            const lessons = parseInt((form.elements.namedItem('lessons') as HTMLInputElement).value);
            const hours = (form.elements.namedItem('hours') as HTMLInputElement).value;

            const newCourse: CourseItem = {
              id: `CRS-${Math.floor(100 + Math.random() * 900)}`,
              code: code || `CRS-${Math.floor(100 + Math.random() * 900)}`,
              title,
              category,
              instructor: instructor || 'Dr. Alan Turing',
              lessons: isNaN(lessons) ? 10 : lessons,
              hours: hours || '6h 00m',
              progress: 0,
              thumbnail: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80',
              status: 'published'
            };

            setCourses(prev => [newCourse, ...prev]);
            onClose();
          }}
          className="flex flex-col gap-4"
        >
          <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Publish a new digital syllabus to the institutional learning center.</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Course Title *</label>
              <input 
                name="title"
                type="text"
                required
                placeholder="e.g. Distributed Consensus & Blockchain Protocol"
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Course Code *</label>
                <input 
                  name="code"
                  type="text"
                  required
                  placeholder="e.g. CS-405"
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs font-mono text-fg-0 outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Academic Category</label>
                <select 
                  name="category"
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                >
                  <option value="Computer Science">Computer Science</option>
                  <option value="Software Engineering">Software Engineering</option>
                  <option value="Applied Mathematics">Applied Mathematics</option>
                  <option value="Cybersecurity">Cybersecurity</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Lead Instructor</label>
                <input 
                  name="instructor"
                  type="text"
                  defaultValue="Dr. Alan Turing"
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Total Lessons</label>
                <input 
                  name="lessons"
                  type="number"
                  defaultValue={12}
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Duration</label>
                <input 
                  name="hours"
                  type="text"
                  defaultValue="8h 30m"
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 hover:bg-bg-3 rounded-xl border border-line"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Publish Course
            </button>
          </div>
        </form>
      ),
      {},
      { title: 'M11: Publish New Academic Course', size: 'md' }
    );
  };

  // UPDATE: Edit Course Modal
  const handleEditCourse = (course: CourseItem) => {
    openDialog(
      `edit-course-${course.id}`,
      ({ onClose }) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const title = (form.elements.namedItem('title') as HTMLInputElement).value;
            const category = (form.elements.namedItem('category') as HTMLSelectElement).value;
            const instructor = (form.elements.namedItem('instructor') as HTMLInputElement).value;

            setCourses(prev => prev.map(c => {
              if (c.id === course.id) {
                return { ...c, title, category, instructor };
              }
              return c;
            }));

            onClose();
          }}
          className="flex flex-col gap-4"
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Course Title</label>
              <input 
                name="title"
                type="text"
                defaultValue={course.title}
                required
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Category</label>
                <select 
                  name="category"
                  defaultValue={course.category}
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                >
                  <option value="Computer Science">Computer Science</option>
                  <option value="Software Engineering">Software Engineering</option>
                  <option value="Applied Mathematics">Applied Mathematics</option>
                  <option value="Cybersecurity">Cybersecurity</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Instructor</label>
                <input 
                  name="instructor"
                  type="text"
                  defaultValue={course.instructor}
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 hover:bg-bg-3 rounded-xl border border-line"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm"
            >
              Save Changes
            </button>
          </div>
        </form>
      ),
      {},
      { title: `Edit ${course.code} — ${course.title}`, size: 'md' }
    );
  };

  // DELETE: Archive Course
  const handleArchiveCourse = (course: CourseItem) => {
    openConfirm({
      title: `Archive Course: ${course.code}?`,
      message: `Are you sure you want to archive "${course.title}"? Enrolled students will retain access to historical quiz records.`,
      variant: 'danger',
      confirmLabel: 'Confirm Archive',
      onConfirm: () => {
        setCourses(prev => prev.filter(c => c.id !== course.id));
      }
    });
  };

  const filteredCourses = courses.filter(course => {
    const matchesSearch = 
      !searchQuery ||
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.instructor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.category.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'All' || course.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary">
                M11
              </span>
              <h1 className="text-2xl font-bold text-fg-0">LMS Learning Center & Catalog</h1>
            </div>
            <p className="text-sm text-fg-2">
              Browse academic courseware, interactive lecture player, curriculum builder, and assessments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-fg-2" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search courses..." 
                className="w-full md:w-64 bg-bg-1 border border-line rounded-xl pl-10 pr-8 py-2 text-xs focus:border-primary outline-none transition-all shadow-sm"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-fg-2 hover:text-fg-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={handleOpenPublishModal}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Publish Course
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-bg-1 border border-line text-fg-2 hover:text-fg-0 hover:bg-bg-2'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Course Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {filteredCourses.map((course) => (
            <div 
              key={course.id} 
              className="bg-bg-1 border border-line rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col"
            >
              <div className="h-40 overflow-hidden relative cursor-pointer" onClick={() => navigate('/lms/player')}>
                <img 
                  src={course.thumbnail} 
                  alt={course.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <PlayCircle className="w-12 h-12 text-white" />
                </div>
                <div className="absolute top-3 left-3 bg-bg-1/90 backdrop-blur-xs text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-line text-fg-0">
                  {course.code}
                </div>
                {course.progress === 100 && (
                  <div className="absolute top-3 right-3 bg-success text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
                    COMPLETED
                  </div>
                )}
              </div>

              <div className="p-5 flex-1 flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                    {course.category}
                  </span>
                  <div className="flex items-center gap-1 text-warning">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span className="text-xs font-bold text-fg-1">4.9</span>
                  </div>
                </div>

                <h3 
                  onClick={() => navigate('/lms/player')}
                  className="font-bold text-fg-0 line-clamp-2 mb-1 group-hover:text-primary transition-colors cursor-pointer text-sm"
                >
                  {course.title}
                </h3>
                <p className="text-xs text-fg-2 mb-4">{course.instructor}</p>
                
                <div className="mt-auto space-y-3">
                  <div className="flex items-center justify-between text-xs text-fg-2">
                    <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {course.lessons} Lessons</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {course.hours}</span>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-fg-2">Progress</span>
                      <span className="text-primary font-bold">{course.progress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-bg-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${course.progress === 100 ? 'bg-success' : 'bg-primary'}`}
                        style={{ width: `${course.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Workable Card Actions Bar */}
                  <div className="pt-3 border-t border-line flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => navigate('/lms/course-builder')}
                        className="px-2 py-1 bg-bg-2 hover:bg-bg-3 text-fg-1 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1"
                        title="Edit Course Syllabus & Modules"
                      >
                        <Layers className="w-3 h-3 text-primary" /> Syllabus
                      </button>
                      <button
                        onClick={() => navigate('/lms/quiz')}
                        className="px-2 py-1 bg-bg-2 hover:bg-bg-3 text-fg-1 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1"
                        title="Open Quiz Assessment Engine"
                      >
                        <FileQuestion className="w-3 h-3 text-secondary" /> Quiz
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditCourse(course)}
                        className="p-1 text-fg-2 hover:text-primary rounded"
                        title="Edit Course"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleArchiveCourse(course)}
                        className="p-1 text-fg-2 hover:text-error rounded"
                        title="Archive Course"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
