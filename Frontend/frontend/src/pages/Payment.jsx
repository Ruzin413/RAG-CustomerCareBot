import React from 'react';
import { useNavigate } from 'react-router-dom';

const GLASS_STYLE = "bg-dark-800/50 backdrop-blur-xl border border-slate-700/50 shadow-2xl";
const GRADIENT_TEXT = "bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-fuchsia-400 font-extrabold";

const Payment = () => {
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
            <span className="text-[10px] font-bold text-primary-400 uppercase tracking-[0.2em]">Secure Ledger Online</span>
          </div>

          <div className="w-full flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="text-center md:text-left">
              <h1 className={`text-5xl md:text-6xl mb-3 tracking-tight ${GRADIENT_TEXT}`}>
                Billing & Payments
              </h1>
              <p className="text-slate-400 font-medium">Manage your subscription and billing details</p>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className={`${GLASS_STYLE} p-8 rounded-3xl relative overflow-hidden group`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-primary-500/20 transition-all"></div>
            <h3 className="text-xl font-bold text-white mb-2">Current Plan</h3>
            <div className="text-4xl font-black text-white mb-4">Pro Plan <span className="text-primary-400 text-lg">$49/mo</span></div>
            <p className="text-slate-400 text-sm mb-8">Next billing date: May 15, 2026</p>
            <button className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white font-bold transition-all shadow-lg shadow-primary-900/40">
              Upgrade Plan
            </button>
          </div>

          <div className={`${GLASS_STYLE} p-8 rounded-3xl`}>
            <h3 className="text-xl font-bold text-white mb-6">Payment Methods</h3>
            <div className="space-y-4 mb-8">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-dark-900 border border-slate-700">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-6 bg-slate-700 rounded-md"></div>
                  <span className="text-white font-medium">•••• 4242</span>
                </div>
                <span className="text-xs text-slate-500 font-bold uppercase">Primary</span>
              </div>
            </div>
            <button className="w-full py-4 rounded-2xl border border-slate-700 text-slate-300 hover:bg-dark-700 font-bold transition-all">
              Add New Method
            </button>
          </div>
        </div>

        <div className="mt-12">
          <h3 className="text-xl font-bold text-white mb-6">Recent Transactions</h3>
          <div className={`${GLASS_STYLE} rounded-3xl overflow-hidden`}>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-700/50 bg-dark-900/50">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">ID</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Date</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Amount</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {[
                  { id: '#INV-9021', date: 'Apr 15, 2026', amount: '$49.00', status: 'Paid' },
                  { id: '#INV-8834', date: 'Mar 15, 2026', amount: '$49.00', status: 'Paid' }
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-dark-800/30 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-300">{row.id}</td>
                    <td className="px-6 py-4 text-sm text-slate-300">{row.date}</td>
                    <td className="px-6 py-4 text-sm text-white font-bold">{row.amount}</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-[10px] font-bold uppercase">{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Payment;
