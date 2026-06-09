import { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { motion } from 'framer-motion';
import { Code2, Trophy, Flame, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import api from '../api';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

export default function Dashboard() {
  const { user, setUser } = useUser();
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState('');
  
  // Use local state for the input fields, initialized from the logged-in user
  const [localCfHandle, setLocalCfHandle] = useState(user?.cfHandle || '');
  const [localLcUsername, setLocalLcUsername] = useState(user?.lcUsername || '');
  const [localLcSession, setLocalLcSession] = useState(user?.lcSession || '');

  // Keep them synced if the user object updates from the server
  useEffect(() => {
    setLocalCfHandle(user?.cfHandle || '');
    setLocalLcUsername(user?.lcUsername || '');
    setLocalLcSession(user?.lcSession || '');
  }, [user]);

  // Sync / Fetch user
  const handleSync = async () => {
    if (!localCfHandle && !localLcUsername) {
      setError('Please provide at least one handle to sync.');
      return;
    }
    setError('');
    setIsSyncing(true);
    try {
      const res = await api.post('/sync', {
        cfHandle: localCfHandle,
        lcUsername: localLcUsername,
        lcSession: localLcSession
      });
      if (res.data.success) {
        setUser(res.data.user);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to sync data');
    } finally {
      setIsSyncing(false);
    }
  };



  const [ratingData, setRatingData] = useState([]);

  useEffect(() => {
    if (user?.cfHandle) {
      axios.get(`https://codeforces.com/api/user.rating?handle=${user.cfHandle}`)
        .then(res => {
          if (res.data.status === 'OK') {
            const history = res.data.result.map(contest => {
              const date = new Date(contest.ratingUpdateTimeSeconds * 1000);
              const month = date.toLocaleString('default', { month: 'short' });
              const year = date.getFullYear().toString().slice(-2);
              return {
                name: `${month} '${year}`,
                rating: contest.newRating,
                timestamp: contest.ratingUpdateTimeSeconds
              };
            });
            setRatingData(history);
          }
        })
        .catch(err => console.error("Failed to fetch rating history", err));
    } else {
      queueMicrotask(() => setRatingData([]));
    }
  }, [user?.cfHandle]);

  const [radarData, setRadarData] = useState([]);

  useEffect(() => {
    const topicHandle = user?.cfHandle;
    if (topicHandle) {
      api.get(`/analysis/${topicHandle}/topics`)
        .then(res => {
          if (res.data && res.data.topics) {
            const coreTopics = [
              'Implementation',
              'Math',
              'Greedy',
              'Dynamic Programming (DP)',
              'Data Structures',
              'Graphs',
              'DFS / BFS',
              'Trees',
            ];
            
            const formatted = coreTopics.map(topic => {
              const topicData = res.data.allTopics?.find(t => t.topic === topic) || res.data.topics?.find(t => t.topic === topic);
              return {
                subject: topic.replace('Dynamic Programming (DP)', 'DP').replace('Data Structures', 'DS'),
                A: topicData ? topicData.masteryScore : 0,
                fullMark: 100
              };
            });
            setRadarData(formatted);
          }
        })
        .catch(err => console.error("Failed to fetch topic summary", err));
    } else {
      queueMicrotask(() => setRadarData([]));
    }
  }, [user?.cfHandle, user?.lcUsername]);

  const [dailyProblem, setDailyProblem] = useState(null);

  useEffect(() => {
    if (user?.username) {
      api.get(`/daily/${user.username}`)
        .then(res => setDailyProblem(res.data.problem))
        .catch(err => console.error("Failed to fetch daily problem", err));
    }
  }, [user?.username]);



  const hasData = user != null;
  const cfSolvedCount = user?.cfSolvedCount || 0;
  const lcSolvedCount = user?.lcTotalSolved || 0;
  const totalSolved = user?.totalSolved ?? (cfSolvedCount + lcSolvedCount);

  return (
    <div className="space-y-8 pb-12">
      {/* Header & Sync Section */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
      >
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">Dashboard</h1>
          <p className="text-zinc-400">Analyze your competitive programming journey.</p>
        </div>

        <Card className="w-full md:w-auto min-w-[320px] p-4 bg-zinc-900/80 border-zinc-800">
          <div className="flex flex-col space-y-3">
             <div className="flex space-x-2">
                <Input 
                  placeholder="Codeforces handle" 
                  value={localCfHandle} 
                  onChange={(e) => { setLocalCfHandle(e.target.value.trim()); setError(''); }} 
                />
                <Input 
                  placeholder="LeetCode username" 
                  value={localLcUsername} 
                  onChange={(e) => { setLocalLcUsername(e.target.value.trim()); setError(''); }} 
                />
             </div>
             <div className="flex flex-col space-y-1">
                <Input 
                  type="password"
                  placeholder="LEETCODE_SESSION Cookie (Optional for full sync)" 
                  value={localLcSession} 
                  onChange={(e) => { setLocalLcSession(e.target.value.trim()); setError(''); }} 
                  className="text-sm"
                />
                <p className="text-xs text-zinc-500 pl-1">
                  How to find this: Press F12 &rarr; Application &rarr; Cookies &rarr; leetcode.com &rarr; copy LEETCODE_SESSION value.
                </p>
             </div>
             {error && <p className="text-red-400 text-sm flex items-center gap-1"><AlertCircle size={14}/>{error}</p>}
             <Button onClick={handleSync} isLoading={isSyncing} className="w-full">
                <RefreshCw size={16} className={cn("mr-2", isSyncing && "animate-spin")} />
                Sync Profiles
             </Button>
          </div>
        </Card>
      </motion.div>

      {!hasData && !isSyncing && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-zinc-700/50 rounded-3xl"
        >
          <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mb-4 text-zinc-400">
             <Trophy size={32} />
          </div>
          <h2 className="text-xl font-semibold mb-2">No data yet</h2>
          <p className="text-zinc-500 max-w-md">Enter your Codeforces and LeetCode handles above and hit sync to start analyzing your competitive programming progress.</p>
        </motion.div>
      )}

      {hasData && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ staggerChildren: 0.1 }}
          className="space-y-8"
        >
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Code2 size={64} />
              </div>
              <CardHeader>
                <p className="text-zinc-400 font-medium">Total Solved (CF + LC)</p>
              </CardHeader>
              <div className="text-5xl font-bold text-white tracking-tight">
                 {totalSolved}
                 <span className="text-blue-400 text-xl font-medium ml-2">+{cfSolvedCount} CF</span>
              </div>
            </Card>

            <Card className="relative overflow-hidden group border-blue-500/20 bg-blue-900/10">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-blue-400">
                <Trophy size={64} />
              </div>
              <CardHeader>
                <p className="text-blue-400 font-medium">Codeforces Rating</p>
              </CardHeader>
              <div className="flex items-baseline gap-2">
                <div className="text-5xl font-bold text-white tracking-tight">{user.cfRating || 'N/A'}</div>
                <div className="text-zinc-400 text-sm">Max: {user.cfMaxRating || 'N/A'}</div>
              </div>
              <p className="text-sm mt-2 text-zinc-400 capitalize">{user.cfRank || 'Unrated'}</p>
            </Card>

            <Card className="relative overflow-hidden group border-orange-500/20 bg-orange-900/10">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-orange-400">
                <Flame size={64} />
              </div>
              <CardHeader>
                <p className="text-orange-400 font-medium">LeetCode Solved</p>
              </CardHeader>
              <div className="text-5xl font-bold text-white tracking-tight mb-2">{user.lcTotalSolved || 0}</div>
              <div className="flex gap-3 text-sm font-medium">
                 <span className="text-emerald-400">Easy: {user.lcEasySolved || 0}</span>
                 <span className="text-yellow-400">Med: {user.lcMediumSolved || 0}</span>
                 <span className="text-red-400">Hard: {user.lcHardSolved || 0}</span>
              </div>
            </Card>
          </div>

          {dailyProblem && (
            <Card className="relative overflow-hidden border-zinc-800 group">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 via-purple-600/5 to-transparent opacity-50" />
              <div className="absolute -right-12 -top-12 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl group-hover:bg-indigo-600/20 transition-colors" />
              
              <div className="relative p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                      <Flame size={16} className="text-orange-400 animate-pulse" />
                    </div>
                    <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">Daily Challenge</span>
                  </div>
                  
                  <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-indigo-200 transition-colors">
                    {dailyProblem.name}
                  </h3>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                      dailyProblem.platform === 'LEETCODE' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {dailyProblem.platform}
                    </span>
                    {dailyProblem.rating && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-zinc-800 text-zinc-400 rounded">
                        Rating: {dailyProblem.rating}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <a 
                    href={dailyProblem.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] active:scale-95"
                  >
                    Solve Now
                    <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            </Card>
          )}

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="h-[400px] flex flex-col">
              <CardHeader>
                <CardTitle>Rating History</CardTitle>
                <p className="text-sm text-zinc-400">Your Codeforces rating progression over time.</p>
              </CardHeader>
              <div className="flex-1 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ratingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="name" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} domain={['dataMin - 100', 'dataMax + 100']} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                      itemStyle={{ color: '#3b82f6' }}
                    />
                    <Line type="monotone" dataKey="rating" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="h-[400px] flex flex-col">
              <CardHeader>
                <CardTitle>Topic Strengths</CardTitle>
                <p className="text-sm text-zinc-400">Canonical Codeforces topic coverage.</p>
              </CardHeader>
              <div className="flex-1 w-full mt-4 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                    <PolarGrid stroke="#27272a" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                    <PolarRadiusAxis angle={30} domain={['dataMin - 5', 'dataMax + 5']} tick={false} axisLine={false} />
                    <Radar name="Strength" dataKey="A" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.3} strokeWidth={2} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </motion.div>
      )}
    </div>
  );
}
