import { useState } from 'react';
import { Shell } from '../../components/layout/Shell';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Plus, GripVertical, Video, FileText, HelpCircle, Save, CheckCircle2, ChevronRight, Settings } from 'lucide-react';

const initialModules = [
  {
    id: 1, title: 'Introduction to the Course', expanded: true, lessons: [
      { id: 101, title: 'Welcome Message', type: 'video', duration: '5:00' },
      { id: 102, title: 'Syllabus Overview', type: 'document', duration: '10 mins read' }
    ]
  },
  {
    id: 2, title: 'Core Concepts', expanded: false, lessons: [
      { id: 201, title: 'Understanding the Basics', type: 'video', duration: '15:20' },
      { id: 202, title: 'Module 1 Quiz', type: 'quiz', duration: '10 questions' }
    ]
  }
];

export function CourseBuilder() {
  const [modules, setModules] = useState(initialModules);

  const toggleModule = (id: number) => {
    setModules(modules.map(m => m.id === id ? { ...m, expanded: !m.expanded } : m));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="w-4 h-4 text-primary" />;
      case 'document': return <FileText className="w-4 h-4 text-info" />;
      case 'quiz': return <HelpCircle className="w-4 h-4 text-warning" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <Shell>
      <div className="flex flex-col h-full gap-6 max-w-5xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-fg-0">Course Builder</h1>
            <p className="text-sm text-fg-2 mt-1">Structure your course curriculum via drag-and-drop.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2"><Save className="w-4 h-4" /> Save Draft</Button>
            <Button className="gap-2"><CheckCircle2 className="w-4 h-4" /> Publish Syllabus</Button>
          </div>
        </div>

        <Card className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-bg-0 border-dashed border-2 border-line-soft">
          
          <div className="space-y-4">
            {modules.map((module) => (
              <div key={module.id} className="bg-bg-1 border border-line rounded-lg shadow-sm overflow-hidden transition-all">
                
                {/* Module Header */}
                <div className="flex items-center p-3 bg-bg-2 border-b border-line gap-3 group">
                  <div className="cursor-grab text-fg-2 hover:text-fg-0">
                    <GripVertical className="w-5 h-5" />
                  </div>
                  <button onClick={() => toggleModule(module.id)} className="p-1 hover:bg-bg-3 rounded transition-colors">
                    <ChevronRight className={`w-4 h-4 transition-transform ${module.expanded ? 'rotate-90' : ''}`} />
                  </button>
                  <div className="font-semibold text-sm flex-1 text-fg-0">Section {module.id}: {module.title}</div>
                  
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7"><Plus className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><Settings className="w-4 h-4" /></Button>
                  </div>
                </div>

                {/* Lessons List */}
                {module.expanded && (
                  <div className="p-2 space-y-2 bg-bg-0/50">
                    {module.lessons.map((lesson) => (
                      <div key={lesson.id} className="flex items-center gap-3 p-3 bg-bg-1 border border-line-soft rounded-md group hover:border-primary/30 transition-colors">
                        <div className="cursor-grab text-line-soft group-hover:text-fg-2 transition-colors">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <div className="p-1.5 bg-bg-2 rounded">
                          {getIcon(lesson.type)}
                        </div>
                        <span className="text-sm font-medium text-fg-0 flex-1">{lesson.title}</span>
                        <span className="text-xs text-fg-2">{lesson.duration}</span>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-6 px-2 text-xs">Edit</Button>
                      </div>
                    ))}
                    
                    <button className="w-full mt-2 py-3 border-2 border-dashed border-line-soft hover:border-primary/50 hover:bg-primary/5 rounded-md flex items-center justify-center gap-2 text-sm font-medium text-fg-2 transition-all">
                      <Plus className="w-4 h-4" /> Add Lesson
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <Button variant="outline" className="w-full mt-6 py-6 border-dashed gap-2 font-semibold">
            <Plus className="w-5 h-5" /> Add New Section
          </Button>
          
        </Card>
      </div>
    </Shell>
  );
}
