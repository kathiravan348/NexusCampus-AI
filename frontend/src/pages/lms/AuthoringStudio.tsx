import { useState } from 'react';
import { Shell } from '../../components/layout/Shell';
import { Plus, Image as ImageIcon, Video, Type, Save, CheckCircle2, LayoutTemplate, MessageSquarePlus } from 'lucide-react';

export function AuthoringStudio() {
  const [activeSlide, setActiveSlide] = useState(1);

  return (
    <Shell>
      <div className="flex flex-col h-full gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-fg-0">Content Studio</h1>
            <p className="text-sm text-fg-2 mt-1">AI-assisted authoring environment.</p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-bg-2 border border-line-soft hover:bg-bg-3 text-fg-0 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <Save className="w-4 h-4" /> Save Draft
            </button>
            <button className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Publish Lesson
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[250px_1fr_300px] gap-6">
          
          {/* Left: Slide Navigator */}
          <div className="bg-bg-1 border border-line rounded-xl flex flex-col shadow-sm">
            <div className="p-4 border-b border-line flex justify-between items-center">
              <h2 className="font-bold text-fg-0">Slides</h2>
              <button className="p-1.5 bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {[1, 2, 3, 4].map((slide) => (
                <div 
                  key={slide} 
                  onClick={() => setActiveSlide(slide)}
                  className={`aspect-video rounded-lg border-2 cursor-pointer relative overflow-hidden transition-all ${activeSlide === slide ? 'border-primary ring-2 ring-primary/20' : 'border-line-soft hover:border-line'}`}
                >
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-2 text-fg-2">
                    <LayoutTemplate className="w-6 h-6 mb-1 opacity-50" />
                    <span className="text-xs font-medium">Slide {slide}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Middle: Canvas */}
          <div className="bg-bg-1 border border-line rounded-xl shadow-sm flex flex-col overflow-hidden relative">
            {/* Toolbar */}
            <div className="h-12 border-b border-line flex items-center px-4 gap-2 bg-bg-2">
              <button className="p-1.5 text-fg-1 hover:text-fg-0 hover:bg-bg-3 rounded-md transition-colors" title="Add Text">
                <Type className="w-4 h-4" />
              </button>
              <button className="p-1.5 text-fg-1 hover:text-fg-0 hover:bg-bg-3 rounded-md transition-colors" title="Add Image">
                <ImageIcon className="w-4 h-4" />
              </button>
              <button className="p-1.5 text-fg-1 hover:text-fg-0 hover:bg-bg-3 rounded-md transition-colors" title="Add Video">
                <Video className="w-4 h-4" />
              </button>
              <div className="w-px h-6 bg-line-soft mx-2" />
              <button className="p-1.5 text-primary hover:bg-primary/10 rounded-md transition-colors flex items-center gap-1.5 text-xs font-medium" title="Generate with AI">
                <MessageSquarePlus className="w-4 h-4" /> AI Generate
              </button>
            </div>
            
            {/* Slide Area */}
            <div className="flex-1 bg-bg-0 p-8 overflow-y-auto flex items-center justify-center">
              <div className="w-full max-w-2xl aspect-video bg-white dark:bg-bg-2 rounded-lg shadow-md border border-line p-10 flex flex-col relative group">
                {activeSlide === 1 ? (
                  <>
                    <h1 className="text-4xl font-bold text-fg-0 mb-6 focus:outline-none" contentEditable suppressContentEditableWarning>Introduction to Docker</h1>
                    <p className="text-lg text-fg-1 focus:outline-none" contentEditable suppressContentEditableWarning>Containerization allows developers to package applications with all of their dependencies into a single, standardized unit for software development.</p>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-fg-2 border-2 border-dashed border-line-soft m-8 rounded-xl bg-bg-1/50">
                    <Plus className="w-8 h-8 mb-2" />
                    <p className="text-sm font-medium">Click to add content or use AI Generate</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: AI Assistant Panel */}
          <div className="bg-bg-1 border border-line rounded-xl flex flex-col shadow-sm">
            <div className="p-4 border-b border-line bg-gradient-to-r from-primary/10 to-secondary/10">
              <h2 className="font-bold text-fg-0 flex items-center gap-2">
                <MessageSquarePlus className="w-4 h-4 text-primary" /> Co-Pilot
              </h2>
              <p className="text-xs text-fg-1 mt-1">Let AI help you build this lesson.</p>
            </div>
            <div className="flex-1 p-4 space-y-4">
              <div className="bg-bg-2 rounded-lg p-3 border border-line-soft hover:border-primary/50 cursor-pointer transition-colors">
                <p className="text-sm text-fg-0 font-medium">Generate Quiz</p>
                <p className="text-xs text-fg-2 mt-1">Create a 3-question MCQ based on Slide 1</p>
              </div>
              <div className="bg-bg-2 rounded-lg p-3 border border-line-soft hover:border-primary/50 cursor-pointer transition-colors">
                <p className="text-sm text-fg-0 font-medium">Simplify Text</p>
                <p className="text-xs text-fg-2 mt-1">Make the current slide content easier to understand for 8th graders</p>
              </div>
              <div className="bg-bg-2 rounded-lg p-3 border border-line-soft hover:border-primary/50 cursor-pointer transition-colors">
                <p className="text-sm text-fg-0 font-medium">Suggest Images</p>
                <p className="text-xs text-fg-2 mt-1">Find relevant diagrams for "Containerization"</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </Shell>
  );
}
