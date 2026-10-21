import { useState } from 'react';
import { Shell } from '../../components/layout/Shell';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Clock, AlertCircle, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';

const questions = [
  {
    id: 1,
    text: "What is the primary advantage of using Docker containers over traditional virtual machines?",
    options: [
      "Containers include a full guest operating system",
      "Containers share the host OS kernel making them lightweight",
      "Containers provide better hardware-level virtualization",
      "Containers are only compatible with Linux"
    ],
    answer: 1
  },
  {
    id: 2,
    text: "Which command is used to build a Docker image from a Dockerfile?",
    options: [
      "docker run",
      "docker pull",
      "docker build",
      "docker create"
    ],
    answer: null
  }
];

export function QuizEngine() {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(questions[currentQuestion].answer);

  const handleSelect = (idx: number) => {
    setSelectedAnswer(idx);
    // In a real app we'd save this to state mapping questionId -> answer
  };

  const nextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
      setSelectedAnswer(questions[currentQuestion + 1].answer);
    }
  };

  const prevQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
      setSelectedAnswer(questions[currentQuestion - 1].answer);
    }
  };

  const q = questions[currentQuestion];

  return (
    <Shell>
      <div className="flex flex-col h-full gap-6 max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between bg-bg-1 border border-line rounded-xl p-4 shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-fg-0">Module 1 Assessment: Containerization</h1>
            <p className="text-xs text-fg-2 mt-1">CS405 - Software Engineering</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-xs font-semibold text-fg-2 uppercase">Time Remaining</span>
              <div className="flex items-center gap-1.5 text-lg font-bold text-primary font-mono">
                <Clock className="w-5 h-5" /> 14:23
              </div>
            </div>
            <Button variant="destructive" className="gap-2">End Test</Button>
          </div>
        </div>

        {/* Main Quiz Area */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_250px] gap-6 min-h-0">
          
          <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar">
            <Card className="flex-1 flex flex-col">
              <CardHeader className="border-b border-line pb-4 bg-bg-2">
                <div className="flex justify-between items-center">
                  <Badge variant="info">Question {currentQuestion + 1} of {questions.length}</Badge>
                  <button className="text-fg-2 hover:text-warning flex items-center gap-1 text-xs font-medium transition-colors">
                    <AlertCircle className="w-3.5 h-3.5" /> Flag for review
                  </button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-8">
                <h2 className="text-xl font-medium text-fg-0 leading-relaxed mb-8">
                  {q.text}
                </h2>

                <div className="space-y-3">
                  {q.options.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelect(idx)}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all flex items-start gap-4 ${
                        selectedAnswer === idx 
                          ? 'border-primary bg-primary/5 shadow-sm' 
                          : 'border-line hover:border-line-soft hover:bg-bg-2'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                        selectedAnswer === idx ? 'border-primary bg-primary' : 'border-line-soft'
                      }`}>
                        {selectedAnswer === idx && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <span className={`text-base leading-snug ${selectedAnswer === idx ? 'font-medium text-primary' : 'text-fg-1'}`}>
                        {opt}
                      </span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between items-center">
              <Button variant="outline" onClick={prevQuestion} disabled={currentQuestion === 0} className="gap-2">
                <ChevronLeft className="w-4 h-4" /> Previous
              </Button>
              {currentQuestion === questions.length - 1 ? (
                <Button className="gap-2 bg-success hover:bg-success/90">
                  <CheckCircle2 className="w-4 h-4" /> Submit Assessment
                </Button>
              ) : (
                <Button onClick={nextQuestion} className="gap-2">
                  Next Question <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Navigator Sidebar */}
          <Card className="h-fit">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm">Question Navigator</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                {[...Array(20)].map((_, i) => (
                  <button 
                    key={i} 
                    onClick={() => { if (i < questions.length) { setCurrentQuestion(i); setSelectedAnswer(questions[i].answer); } }}
                    className={`
                      aspect-square rounded flex items-center justify-center text-xs font-semibold border transition-all
                      ${i === currentQuestion ? 'border-primary bg-primary text-white scale-110 shadow-sm' : 
                        i < 2 ? 'bg-success/10 border-success/20 text-success' : 'bg-bg-2 border-line-soft text-fg-2 hover:bg-bg-3'}
                    `}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <div className="mt-6 space-y-2 border-t border-line pt-4">
                <div className="flex items-center gap-2 text-xs text-fg-1">
                  <div className="w-3 h-3 rounded bg-success/20 border border-success/30" /> Answered (2)
                </div>
                <div className="flex items-center gap-2 text-xs text-fg-1">
                  <div className="w-3 h-3 rounded bg-bg-2 border border-line-soft" /> Not Answered (18)
                </div>
                <div className="flex items-center gap-2 text-xs text-fg-1">
                  <div className="w-3 h-3 rounded border-2 border-warning text-warning flex items-center justify-center"><AlertCircle className="w-2 h-2" /></div> Flagged (0)
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </Shell>
  );
}
