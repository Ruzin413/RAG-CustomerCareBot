import { useNavigate } from 'react-router-dom'

const Report = () => {
  const navigate = useNavigate()

  const stats = [
    { label: 'Total Queries', value: '1,247', change: '+12%', up: true },
    { label: 'Resolved by AI', value: '1,089', change: '87.3%', up: true },
    { label: 'Avg. Response Time', value: '195ms', change: '-18ms', up: true },
    { label: 'Escalations', value: '158', change: '-3%', up: true },
  ]

  const recentActivity = [
    { time: '2 min ago', event: 'Knowledge base "Ehajiri" updated with 12 new chunks', type: 'kb' },
    { time: '15 min ago', event: 'Admin verified 3 interactions for Ehajiri system', type: 'verify' },
    { time: '1 hr ago', event: 'New document "Employee_Guide.pdf" ingested (84 chunks)', type: 'upload' },
    { time: '3 hrs ago', event: 'System health check passed — all services operational', type: 'health' },
    { time: '6 hrs ago', event: 'Cross-encoder re-ranker threshold adjusted to -8.0', type: 'config' },
  ]

  const typeColors = {
    kb: 'bg-blue-50 text-blue-600 border-blue-100',
    verify: 'bg-green-50 text-green-600 border-green-100',
    upload: 'bg-purple-50 text-purple-600 border-purple-100',
    health: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    config: 'bg-amber-50 text-amber-600 border-amber-100',
  }

  const typeLabels = { kb: 'KB Update', verify: 'Verified', upload: 'Ingestion', health: 'System', config: 'Config' }

  return (
    <div className="min-h-screen bg-surface-100">
      {/* Header */}
      <nav className="bg-white border-b border-surface-300 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold">
                S
              </div>
              <span className="text-xl font-bold text-surface-900 tracking-tight">Support Center</span>
              <span className="px-2 py-0.5 rounded bg-surface-100 text-surface-500 text-[10px] font-bold uppercase tracking-widest border border-surface-200">
                Report
              </span>
            </div>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-surface-500 hover:text-primary-600 hover:bg-surface-50 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Chat
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">System Report</h1>
          <p className="text-surface-500 text-sm">Overview of AI assistant performance and system activity.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <div key={stat.label} className="card-white p-6 space-y-3">
              <p className="text-[10px] font-bold text-surface-400 uppercase tracking-widest">{stat.label}</p>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold text-surface-900 tracking-tight">{stat.value}</span>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${stat.up ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                  {stat.change}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Pipeline Overview */}
          <div className="lg:col-span-2 card-white p-6 space-y-6">
            <h3 className="text-sm font-bold text-surface-900 uppercase tracking-widest border-b border-surface-100 pb-4">3-Stage RAG Pipeline</h3>
            <div className="space-y-4">
              {[
                { stage: 'Stage 0', name: 'Intent Classification', desc: 'Heuristic-based detection of greeting, goodbye, navigate, and FAQ intents.', status: 'Active', color: 'bg-blue-500' },
                { stage: 'Stage 1', name: 'RAG Retrieval + Re-ranking', desc: 'FAISS vector search (all-MiniLM-L6-v2) with Cross-Encoder re-ranking (ms-marco-MiniLM-L-6-v2).', status: 'Active', color: 'bg-purple-500' },
                { stage: 'Stage 2', name: 'Grounded Generation', desc: 'Qwen2-0.5B-Instruct with strict anti-hallucination prompting and extractive fallback.', status: 'Active', color: 'bg-emerald-500' },
                { stage: 'Stage 3', name: 'Fallback', desc: 'Logs unanswered queries for admin review. Returns polite "not found" response.', status: 'Standby', color: 'bg-amber-500' },
              ].map((item) => (
                <div key={item.stage} className="flex items-start gap-4 p-4 bg-surface-50 rounded-xl border border-surface-200">
                  <div className={`w-2 h-2 rounded-full mt-2 ${item.color} flex-shrink-0`}></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-surface-400 uppercase">{item.stage}</span>
                      <span className="text-xs font-bold text-surface-900">{item.name}</span>
                    </div>
                    <p className="text-[11px] text-surface-500 leading-relaxed">{item.desc}</p>
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex-shrink-0 ${item.status === 'Active' ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-1 card-white p-6 space-y-4">
            <h3 className="text-sm font-bold text-surface-900 uppercase tracking-widest border-b border-surface-100 pb-4">Recent Activity</h3>
            <div className="space-y-3">
              {recentActivity.map((item, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-surface-300 mt-2 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-surface-700 leading-relaxed">{item.event}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-surface-400">{item.time}</span>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${typeColors[item.type]}`}>
                        {typeLabels[item.type]}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tech Stack */}
        <div className="card-white p-6 space-y-4">
          <h3 className="text-sm font-bold text-surface-900 uppercase tracking-widest border-b border-surface-100 pb-4">Technology Stack</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { name: 'FastAPI', role: 'Backend' },
              { name: 'FAISS', role: 'Vector Store' },
              { name: 'Qwen2-0.5B', role: 'Generation' },
              { name: 'MiniLM-L6', role: 'Embeddings' },
              { name: 'Cross-Encoder', role: 'Re-ranking' },
              { name: 'React + Vite', role: 'Frontend' },
            ].map((tech) => (
              <div key={tech.name} className="p-4 bg-surface-50 rounded-xl border border-surface-200 text-center">
                <p className="text-xs font-bold text-surface-900">{tech.name}</p>
                <p className="text-[10px] text-surface-400 mt-1">{tech.role}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

export default Report
