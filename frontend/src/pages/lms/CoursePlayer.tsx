import { useState } from 'react';
import { Shell } from '../../components/layout/Shell';
import { PlayCircle, CheckCircle2, Circle, MessageSquare, Bot, Send, ChevronLeft, Clock } from 'lucide-react';

const curriculum = [
  { id: 1, title: 'Introduction to Cloud Computing', duration: '12:45', completed: true },
  { id: 2, title: 'Understanding Virtualization', duration: '18:20', completed: true },
  { id: 3, title: 'Docker Containers Deep Dive', duration: '24:15', completed: false, active: true },
  { id: 4, title: 'Kubernetes Orchestration Basics', duration: '32:10', completed: false },
  { id: 5, title: 'Serverless Functions (AWS Lambda)', duration: '15:55', completed: false },
];

export function CoursePlayer() {
  const [activeTab, setActiveTab] = useState<'tutor' | 'forum'>('tutor');

  return (
    <Shell>
      <div className="flex flex-col gap-4 h-full">
        <div className="flex items-center gap-2 text-sm text-fg-2 hover:text-fg-0 cursor-pointer w-fit transition-colors" onClick={() => window.location.href='/lms'}>
          <ChevronLeft className="w-4 h-4" /> Back to Catalogue
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6 flex-1 min-h-0">
          
          {/* Main Player Area */}
          <div className="flex flex-col gap-6 overflow-y-auto pr-2 pb-4 custom-scrollbar">
            <div className="w-full aspect-video bg-black rounded-xl border border-line overflow-hidden relative shadow-md">
              <img src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80" alt="Video cover" className="w-full h-full object-cover opacity-60" />
              <div className="absolute inset-0 flex items-center justify-center">
                <button className="bg-primary/90 text-white rounded-full p-4 hover:scale-110 transition-transform shadow-lg backdrop-blur-sm">
                  <PlayCircle className="w-10 h-10" />
                </button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                <div className="h-full bg-primary w-1/3 relative">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow" />
                </div>
              </div>
            </div>

            <div>
              <h1 className="text-2xl font-bold text-fg-0 mb-2">Docker Containers Deep Dive</h1>
              <p className="text-fg-2 leading-relaxed">
                In this module, we will explore the fundamental concepts of containerization using Docker. You will learn how to build, run, and distribute container images, and understand the core differences between containers and traditional virtual machines.
              </p>
            </div>
            
            {/* AI Tutor & Forum Section */}
            <div className="bg-bg-1 border border-line rounded-xl shadow-sm flex flex-col h-[500px]">
              <div className="flex border-b border-line px-4 pt-4 gap-6">
                <button 
                  className={`pb-3 font-semibold text-sm border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'tutor' ? 'border-primary text-primary' : 'border-transparent text-fg-2 hover:text-fg-0'}`}
                  onClick={() => setActiveTab('tutor')}
                >
                  <Bot className="w-4 h-4" /> AI Nexus Tutor
                </button>
                <button 
                  className={`pb-3 font-semibold text-sm border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'forum' ? 'border-primary text-primary' : 'border-transparent text-fg-2 hover:text-fg-0'}`}
                  onClick={() => setActiveTab('forum')}
                >
                  <MessageSquare className="w-4 h-4" /> Discussion Forum
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {activeTab === 'tutor' ? (
                  <>
                    <div className="bg-primary/10 border border-primary/20 rounded-xl rounded-tl-none p-3 max-w-[85%] self-start">
                      <p className="text-sm text-fg-0">Hi there! I noticed you are watching the Docker module. I'm an AI trained on your institution's curriculum. Do you have any questions about containerization?</p>
                    </div>
                    <div className="bg-bg-2 border border-line-soft rounded-xl rounded-tr-none p-3 max-w-[85%] self-end">
                      <p className="text-sm text-fg-0">Yes, what is the difference between an image and a container?</p>
                    </div>
                    <div className="bg-primary/10 border border-primary/20 rounded-xl rounded-tl-none p-3 max-w-[85%] self-start">
                      <p className="text-sm text-fg-0">Great question! Think of a Docker **image** as a blueprint or a recipe—it's a static file containing the code, libraries, and dependencies. A **container** is the actual running instance of that image. You can run multiple containers from a single image!</p>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
                    <MessageSquare className="w-12 h-12 mb-3" />
                    <p>No discussions yet for this lesson.</p>
                    <p className="text-xs mt-1">Be the first to start a conversation!</p>
                  </div>
                )}
              </div>
              
              <div className="p-3 border-t border-line">
                <div className="relative">
                  <input type="text" placeholder={activeTab === 'tutor' ? "Ask the AI tutor a question..." : "Start a discussion..."} className="w-full bg-bg-2 border border-line-soft rounded-lg pl-4 pr-10 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                  <button className="absolute right-2 top-2 p-1.5 text-primary hover:bg-primary/10 rounded-md transition-colors">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Curriculum Sidebar */}
          <div className="bg-bg-1 border border-line rounded-xl flex flex-col shadow-sm max-h-[800px]">
            <div className="p-4 border-b border-line">
              <h2 className="font-bold text-fg-0">Course Content</h2>
              <div className="flex items-center gap-2 mt-2 text-xs font-medium text-fg-2">
                <span className="text-primary">40% Completed</span>
                <span className="w-1 h-1 bg-line rounded-full" />
                <span>2/5 Lessons</span>
              </div>
              <div className="w-full h-1.5 bg-bg-2 rounded-full overflow-hidden mt-3">
                <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: '40%' }} />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {curriculum.map((item, index) => (
                <div key={item.id} className={`flex gap-3 p-4 border-b border-line-soft cursor-pointer hover:bg-bg-2 transition-colors ${item.active ? 'bg-bg-2 border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'}`}>
                  <div className="mt-0.5">
                    {item.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    ) : item.active ? (
                      <PlayCircle className="w-5 h-5 text-primary" />
                    ) : (
                      <Circle className="w-5 h-5 text-line" />
                    )}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${item.active ? 'text-fg-0' : 'text-fg-1'}`}>
                      {index + 1}. {item.title}
                    </p>
                    <p className="text-xs text-fg-2 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {item.duration}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </Shell>
  );
}
