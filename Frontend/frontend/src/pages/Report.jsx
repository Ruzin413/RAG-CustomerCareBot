import React from 'react';
import { useNavigate } from 'react-router-dom';

const GLASS_STYLE = "bg-dark-800/50 backdrop-blur-xl border border-slate-700/50 shadow-2xl";
const GRADIENT_TEXT = "bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-fuchsia-400 font-extrabold";

const Report = () => {
  const navigate = useNavigate();

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
            <span className="text-[10px] font-bold text-primary-400 uppercase tracking-[0.2em]">Live Analytics Stream</span>
          </div>

          <div className="w-full flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="text-center md:text-left">
              <h1 className={`text-5xl md:text-6xl mb-3 tracking-tight ${GRADIENT_TEXT}`}>
                System Analytics
              </h1>
              <p className="text-slate-400 font-medium">Real-time performance and usage metrics</p>
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
