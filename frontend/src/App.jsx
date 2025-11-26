import React, { useState, useEffect } from 'react';

// --- AUTH COMPONENT ---
const Auth = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password');
  const [role, setRole] = useState('student');

  const authCall = async (endpoint) => {
    try {
      const res = await fetch(`http://localhost:4000/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          password, 
          role, 
          institutionName: role === 'institution_admin' ? 'My New University' : undefined 
        })
      });
      const data = await res.json();
      if (data.token) onLogin(data);
      else alert(data.error || 'Error');
    } catch (e) { console.error(e); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6 text-center text-blue-600">Audelas Login</h1>
        
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-2">Role</label>
          <select value={role} onChange={e => setRole(e.target.value)} className="w-full p-2 border rounded">
            <option value="student">Student</option>
            <option value="institution_admin">Institution Admin</option>
          </select>
        </div>
        
        <input className="w-full p-3 border rounded mb-3" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input className="w-full p-3 border rounded mb-6" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        
        <div className="flex gap-4">
          <button onClick={() => authCall('login')} className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Login</button>
          <button onClick={() => authCall('register')} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300">Register</button>
        </div>
      </div>
    </div>
  );
};

// --- STUDENT DASHBOARD ---
const StudentDashboard = ({ token, user, logout }) => {
  const [programs, setPrograms] = useState([]);
  const [scores, setScores] = useState([]);
  // MVP: Hardcode instId to 1 for browsing logic
  const [instId, setInstId] = useState(1); 

  useEffect(() => {
    const fetchData = async () => {
      // 1. Fetch programs
      const pRes = await fetch(`http://localhost:4000/institutions/${instId}/programs?limit=5`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const pData = await pRes.json();
      setPrograms(pData.data || []);

      // 2. Fetch my scores
      const sRes = await fetch(`http://localhost:4000/students/me/scores`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const sData = await sRes.json();
      setScores(sData || []);
    };
    fetchData();
  }, [token, instId]);

  const apply = async (programId) => {
    await fetch('http://localhost:4000/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ programId })
    });
    alert('Applied! Scores updated.');
    window.location.reload(); // Simple refresh to see new scores
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <h1 className="text-3xl font-bold text-gray-800">Student Portal</h1>
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm">{user.email}</span>
          <button onClick={logout} className="text-red-500 hover:underline">Logout</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Browse Programs */}
        <div className="bg-white p-6 rounded shadow border">
          <h2 className="text-xl font-bold mb-4">Available Programs</h2>
          {programs.map(p => (
            <div key={p.id} className="border-b py-4 last:border-0 flex justify-between items-center">
              <div>
                <div className="font-bold text-lg">{p.name}</div>
                <div className="text-sm text-gray-500">{p.tags.join(', ')}</div>
              </div>
              <button onClick={() => apply(p.id)} className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700">
                Apply
              </button>
            </div>
          ))}
        </div>

        {/* Intelligence Scores */}
        <div className="bg-white p-6 rounded shadow border">
          <h2 className="text-xl font-bold mb-4">Intelligence Scores</h2>
          {scores.length === 0 && <p className="text-gray-500">No activity yet. Apply to programs to see scores.</p>}
          {scores.map(s => (
            <div key={s.id} className="mb-4 p-4 bg-gray-50 rounded border">
              <div className="font-bold text-lg mb-2">{s.program.name}</div>
              <div className="flex justify-between text-sm">
                <div className="text-center">
                  <div className="font-bold text-blue-600">{s.fitScore.toFixed(0)}</div>
                  <div className="text-gray-500 text-xs">FIT</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-purple-600">{s.engagementScore.toFixed(0)}</div>
                  <div className="text-gray-500 text-xs">ENGAGEMENT</div>
                </div>
                <div className="text-center">
                  <div className={`font-bold ${s.yieldRiskScore > 50 ? 'text-red-600' : 'text-green-600'}`}>
                    {s.yieldRiskScore.toFixed(0)}
                  </div>
                  <div className="text-gray-500 text-xs">RISK</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- INSTITUTION DASHBOARD ---
const InstitutionDashboard = ({ token, logout }) => {
  const [inst, setInst] = useState(null);
  const [funnel, setFunnel] = useState([]);
  const [risks, setRisks] = useState([]);

  useEffect(() => {
    const init = async () => {
      // 1. Get My Institution
      const meRes = await fetch('http://localhost:4000/institutions/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const myInst = await meRes.json();
      setInst(myInst);

      if (myInst?.id) {
        // 2. Get Funnel
        const fRes = await fetch(`http://localhost:4000/institutions/${myInst.id}/analytics/funnel`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFunnel(await fRes.json());

        // 3. Get High Risk Students
        const rRes = await fetch(`http://localhost:4000/institutions/${myInst.id}/high-risk-students?limit=5`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setRisks(await rRes.json());
      }
    };
    init();
  }, [token]);

  if (!inst) return <div className="p-10 text-center">Loading Institution Profile...</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <h1 className="text-3xl font-bold text-gray-800">{inst.name} Dashboard</h1>
        <button onClick={logout} className="text-red-500 hover:underline">Logout</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Funnel Analytics */}
        <div className="bg-white p-6 rounded shadow border">
          <h2 className="text-xl font-bold mb-4">Admission Funnel</h2>
          {funnel.length === 0 ? <p className="text-gray-500">No data available.</p> : funnel.map(f => (
            <div key={f.status} className="flex justify-between border-b py-3 last:border-0">
              <span className="font-semibold text-gray-600">{f.status}</span>
              <span className="font-bold text-blue-600 text-xl">{f._count.status}</span>
            </div>
          ))}
        </div>

        {/* Risk Monitor */}
        <div className="bg-white p-6 rounded shadow border border-l-4 border-l-red-500">
          <h2 className="text-xl font-bold mb-2 text-red-700">At-Risk High Performers</h2>
          <p className="text-sm text-gray-500 mb-6">Students with High Fit (>70) but High Risk (>50)</p>
          
          {risks.length === 0 && <p className="text-gray-500">No high-risk students detected.</p>}
          {risks.map(r => (
            <div key={r.id} className="mb-4 pb-4 border-b last:border-0">
              <div className="font-bold text-lg">{r.student.studentProfile?.name || 'Unknown Student'}</div>
              <div className="text-sm text-gray-600 mb-1">Target: {r.program.name}</div>
              <div className="flex gap-4 text-xs font-mono">
                <span className="text-green-700 bg-green-100 px-2 py-1 rounded">FIT: {r.fitScore.toFixed(0)}</span>
                <span className="text-red-700 bg-red-100 px-2 py-1 rounded">RISK: {r.yieldRiskScore.toFixed(0)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- MAIN ENTRY ---
export default function App() {
  const [authData, setAuthData] = useState(null);

  if (!authData) return <Auth onLogin={setAuthData} />;

  return authData.user.role === 'STUDENT' 
    ? <StudentDashboard token={authData.token} user={authData.user} logout={() => setAuthData(null)} />
    : <InstitutionDashboard token={authData.token} user={authData.user} logout={() => setAuthData(null)} />;
}