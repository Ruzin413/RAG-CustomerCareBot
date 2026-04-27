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
    <div className="min-h-screen bg-dark-950 p-8 flex flex-col items-center">
      <div className="w-full max-w-4xl">
        <button 
          onClick={() => navigate('/')}
          className="mb-8 px-6 py-2 rounded-xl bg-dark-800 text-slate-300 hover:text-white border border-slate-700 transition-all"
        >
          ← Back to Chat
        </button>

        <header className="mb-12">
          <h1 className={`text-5xl mb-2 ${GRADIENT_TEXT}`}>Interaction History</h1>
          <p className="text-slate-400">Review your past conversations and support tickets</p>
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
