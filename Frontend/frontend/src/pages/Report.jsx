import React from 'react';
import { useNavigate } from 'react-router-dom';

const GLASS_STYLE = "bg-dark-800/50 backdrop-blur-xl border border-slate-700/50 shadow-2xl";
const GRADIENT_TEXT = "bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-fuchsia-400 font-extrabold";

const Report = () => {
  const navigate = useNavigate();

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
          <h1 className={`text-5xl mb-2 ${GRADIENT_TEXT}`}>System Analytics Report</h1>
          <p className="text-slate-400">Real-time performance and usage metrics</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[
            { label: "Active Users", value: "1,284", delta: "+12%", color: "primary" },
            { label: "Total Queries", value: "45.2k", delta: "+5.4%", color: "blue" },
            { label: "Response Time", value: "320ms", delta: "-10ms", color: "fuchsia" }
          ].map((stat, i) => (
            <div key={i} className={`${GLASS_STYLE} p-6 rounded-3xl`}>
              <p className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-2">{stat.label}</p>
              <div className="flex items-end gap-3">
                <span className="text-3xl font-bold text-white">{stat.value}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-${stat.color}-500/10 text-${stat.color}-400 mb-1`}>
                  {stat.delta}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className={`${GLASS_STYLE} p-8 rounded-3xl`}>
          <h3 className="text-xl font-bold text-white mb-6">Weekly Activity</h3>
          <div className="h-48 flex items-end gap-2 justify-between">
            {[40, 70, 45, 90, 65, 80, 55].map((h, i) => (
              <div key={i} className="flex-1 bg-gradient-to-t from-primary-600 to-primary-400 rounded-t-lg transition-all hover:opacity-80" style={{ height: `${h}%` }}></div>
            ))}
          </div>
          <div className="flex justify-between mt-4 text-xs text-slate-500 font-bold">
            <span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Report;
