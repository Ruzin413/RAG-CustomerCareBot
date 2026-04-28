import React from 'react';
import { useNavigate } from 'react-router-dom';

const GLASS_STYLE = "bg-dark-800/50 backdrop-blur-xl border border-slate-700/50 shadow-2xl";
const GRADIENT_TEXT = "bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-fuchsia-400 font-extrabold";

const History = () => {
  const navigate = useNavigate();

  const historyItems = [
    { type: 'Query', text: 'How do I reset my password?', date: '2026-04-27 12:30', status: 'Resolved' },
    { type: 'Support', text: 'Payment failure on checkout', date: '2026-04-26 15:45', status: 'Pending' },
    { type: 'Query', text: 'Working hours of support team', date: '2026-04-26 10:20', status: 'Resolved' },
    { type: 'Complaint', text: 'App is crashing on iOS', date: '2026-04-25 18:12', status: 'In Progress' }
  ];

  return (
    <div className="min-h-screen bg-dark-950 p-6 flex flex-col items-center overflow-hidden relative">
      {/* Background Blobs */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-primary-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>

      <div className="w-full max-w-5xl relative z-10">
        <header className="w-full flex flex-col items-center mb-16">
          {/* System Status Pill */}
          <div className="mb-6 flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/20 backdrop-blur-md">
            <div className="w-2 h-2 rounded-full bg-primary-500 shadow-[0_0_8px_rgba(var(--primary-rgb),0.8)]"></div>
            <span className="text-[10px] font-bold text-primary-400 uppercase tracking-[0.2em]">Archive Sync Secure</span>
          </div>

          <div className="w-full flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="text-center md:text-left">
              <h1 className={`text-5xl md:text-6xl mb-3 tracking-tight ${GRADIENT_TEXT}`}>
                Interaction History
              </h1>
              <p className="text-slate-400 font-medium">Review your past conversations and support tickets</p>
            </div>
            
            <button 
              onClick={() => navigate('/')}
              className="group relative px-8 py-3.5 rounded-2xl bg-dark-900 text-slate-300 border border-slate-700/50 transition-all hover:border-primary-500/50 hover:text-white shadow-xl flex items-center gap-3 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary-600/10 to-indigo-600/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <span className="text-lg transition-transform group-hover:-translate-x-1">←</span>
              <span className="font-bold text-xs uppercase tracking-widest">Return to Portal</span>
            </button>
          </div>
        </header>

        <div className="space-y-4">
          {historyItems.map((item, i) => (
            <div key={i} className={`${GLASS_STYLE} p-6 rounded-3xl flex items-center justify-between group hover:border-primary-500/30 transition-all cursor-pointer`}>
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 rounded-2xl bg-dark-900 flex items-center justify-center text-xl">
                  {item.type === 'Query' ? '💬' : item.type === 'Support' ? '🛠️' : '⚠️'}
                </div>
                <div>
                  <h4 className="text-white font-bold">{item.text}</h4>
                  <p className="text-slate-500 text-sm">{item.date} • {item.type}</p>
                </div>
              </div>
              <span className={`px-4 py-1 rounded-full text-xs font-bold uppercase ${
                item.status === 'Resolved' ? 'bg-green-500/10 text-green-400' : 
                item.status === 'Pending' ? 'bg-amber-500/10 text-amber-500' : 'bg-primary-500/10 text-primary-400'
              }`}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default History;
