import { useCallback, useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { Search, ExternalLink, Code2, Flame, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../api';
import { useUser } from '../context/UserContext';

export default function ProblemExplorer() {
  const { cfHandle, lcUsername } = useUser();
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('CODEFORCES');
  const [tags, setTags] = useState([]);
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState('ALL');
  const [cfRatingMin, setCfRatingMin] = useState('');
  const [cfRatingMax, setCfRatingMax] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const resetFilters = () => {
    setSearch('');
    setTag('');
    setStatus('ALL');
    setCfRatingMin('');
    setCfRatingMax('');
    setDifficulty('');
    setPage(1);
  };

  const switchPlatform = (nextPlatform) => {
    setPlatform(nextPlatform);
    resetFilters();
  };

  const fetchProblems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const handle = platform === 'CODEFORCES' ? cfHandle : lcUsername;
      const res = await api.get('/problems/explorer', {
        params: {
          search,
          platform,
          page,
          limit: 20,
          tag,
          status,
          handle,
          cfRatingMin: platform === 'CODEFORCES' ? cfRatingMin : undefined,
          cfRatingMax: platform === 'CODEFORCES' ? cfRatingMax : undefined,
          difficulty: platform === 'LEETCODE' ? difficulty : undefined
        }
      });
      setProblems(res.data.data);
      setTotalPages(res.data.meta.totalPages);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch problems');
    } finally {
      setLoading(false);
    }
  }, [search, platform, page, tag, status, cfRatingMin, cfRatingMax, difficulty, cfHandle, lcUsername]);

  useEffect(() => {
    const timer = setTimeout(() => fetchProblems(), 300);
    return () => clearTimeout(timer);
  }, [fetchProblems]);

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const res = await api.get('/problems/tags', {
          params: { platform }
        });
        setTags(res.data);
      } catch (err) {
        console.error(err);
        setTags([]);
      }
    };
    fetchTags();
  }, [platform]);

  const statusLabel = platform === 'CODEFORCES'
    ? (cfHandle ? `for ${cfHandle}` : 'sync a Codeforces handle to use')
    : (lcUsername ? `for ${lcUsername}` : 'sync a LeetCode username to use');

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Problem Explorer</h1>
          <p className="text-zinc-400">Search platform problem sets with solved-state filters from your synced profile.</p>
        </div>
      </div>

      <Card className="p-4 bg-zinc-900/50 border-zinc-800 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
          <Input 
            placeholder="Search problems..." 
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          </div>
          <div className="flex gap-2">
           <Button 
             variant={platform === 'CODEFORCES' ? 'primary' : 'outline'} 
             onClick={() => switchPlatform('CODEFORCES')}
             size="sm"
             className={platform === 'CODEFORCES' ? 'bg-blue-600' : ''}
           >
             <Code2 size={14} className="mr-2" /> Codeforces
           </Button>
           <Button 
             variant={platform === 'LEETCODE' ? 'primary' : 'outline'} 
             onClick={() => switchPlatform('LEETCODE')}
             size="sm"
             className={platform === 'LEETCODE' ? 'bg-orange-500 hover:bg-orange-600' : ''}
           >
             <Flame size={14} className="mr-2" /> LeetCode
           </Button>
           <Button variant="ghost" onClick={resetFilters} size="sm">
             <RotateCcw size={14} className="mr-2" /> Reset
           </Button>
          </div>
        </div>

        {platform === 'CODEFORCES' ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Input
              type="number"
              min="800"
              step="100"
              placeholder="Min rating"
              value={cfRatingMin}
              onChange={(e) => { setCfRatingMin(e.target.value); setPage(1); }}
            />
            <Input
              type="number"
              min="800"
              step="100"
              placeholder="Max rating"
              value={cfRatingMax}
              onChange={(e) => { setCfRatingMax(e.target.value); setPage(1); }}
            />
            <select
              className="h-10 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              value={tag}
              onChange={(e) => { setTag(e.target.value); setPage(1); }}
            >
              <option value="">All topic tags</option>
              {tags.map(tagName => <option key={tagName} value={tagName}>{tagName}</option>)}
            </select>
            <select
              className="h-10 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              <option value="ALL">All Codeforces problems</option>
              <option value="SOLVED">Solved {statusLabel}</option>
              <option value="UNSOLVED">Unsolved {statusLabel}</option>
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              className="h-10 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              value={difficulty}
              onChange={(e) => { setDifficulty(e.target.value); setPage(1); }}
            >
              <option value="">All difficulties</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
            <select
              className="h-10 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              value={tag}
              onChange={(e) => { setTag(e.target.value); setPage(1); }}
            >
              <option value="">All topic tags</option>
              {tags.map(tagName => <option key={tagName} value={tagName}>{tagName}</option>)}
            </select>
            <select
              className="h-10 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              <option value="ALL">All LeetCode problems</option>
              <option value="SOLVED">Solved {statusLabel}</option>
              <option value="UNSOLVED">Unsolved {statusLabel}</option>
            </select>
          </div>
        )}
      </Card>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-surface/50 overflow-hidden">
         <div className="overflow-x-auto">
           <table className="w-full text-sm text-left">
             <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50 border-b border-zinc-800">
               <tr>
                 <th className="px-6 py-4 font-medium">Platform</th>
                 <th className="px-6 py-4 font-medium">Problem ID</th>
                 <th className="px-6 py-4 font-medium">Name</th>
                 <th className="px-6 py-4 font-medium">Difficulty/Rating</th>
                 <th className="px-6 py-4 font-medium">Tags</th>
                 <th className="px-6 py-4 font-medium text-right">Action</th>
               </tr>
             </thead>
             <tbody>
               {loading ? (
                 [...Array(5)].map((_, i) => (
                   <tr key={i} className="border-b border-zinc-800/50">
                     <td className="px-6 py-4"><Skeleton className="h-4 w-12" /></td>
                     <td className="px-6 py-4"><Skeleton className="h-4 w-16" /></td>
                     <td className="px-6 py-4"><Skeleton className="h-4 w-48" /></td>
                     <td className="px-6 py-4"><Skeleton className="h-4 w-12" /></td>
                     <td className="px-6 py-4"><Skeleton className="h-4 w-32" /></td>
                     <td className="px-6 py-4 text-right"><Skeleton className="h-8 w-8 ml-auto rounded-lg" /></td>
                   </tr>
                 ))
               ) : problems.length > 0 ? (
                 problems.map((prob, i) => (
                   <motion.tr 
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ delay: i * 0.05 }}
                     key={prob.id} 
                     className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                   >
                     <td className="px-6 py-4">
                       <span className={`px-2 py-1 rounded text-xs font-semibold ${prob.platform === 'CODEFORCES' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'}`}>
                         {prob.platform === 'CODEFORCES' ? 'CF' : 'LC'}
                       </span>
                     </td>
                     <td className="px-6 py-4 text-zinc-400 font-mono">{prob.problemId}</td>
                     <td className="px-6 py-4 font-medium text-zinc-200">{prob.name}</td>
                     <td className="px-6 py-4">
                        {prob.rating && <span className="text-purple-400">{prob.rating}</span>}
                        {prob.difficulty && (
                            <span className={
                                prob.difficulty === 'Easy' ? 'text-emerald-400' : 
                                prob.difficulty === 'Medium' ? 'text-yellow-400' : 'text-red-400'
                            }>{prob.difficulty}</span>
                        )}
                     </td>
                     <td className="px-6 py-4">
                       <div className="flex flex-wrap gap-1">
                         {prob.tags.slice(0, 3).map(tag => (
                           <span key={tag} className="px-2 py-0.5 rounded bg-zinc-800 text-xs text-zinc-400">{tag}</span>
                         ))}
                         {prob.tags.length > 3 && <span className="px-2 py-0.5 rounded bg-zinc-800 text-xs text-zinc-400">+{prob.tags.length - 3}</span>}
                       </div>
                     </td>
                     <td className="px-6 py-4 text-right">
                       <Button variant="ghost" size="icon" asChild>
                         <a href={prob.url} target="_blank" rel="noopener noreferrer">
                           <ExternalLink size={16} />
                         </a>
                       </Button>
                     </td>
                   </motion.tr>
                 ))
               ) : (
                 <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-zinc-500">No problems found.</td>
                 </tr>
               )}
             </tbody>
           </table>
         </div>
         {/* Pagination */}
         <div className="p-4 border-t border-zinc-800 flex justify-between items-center bg-zinc-900/50">
            <span className="text-sm text-zinc-400">Page {page} of {totalPages || 1}</span>
            <div className="space-x-2">
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                >
                    Previous
                </Button>
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || totalPages === 0 || loading}
                >
                    Next
                </Button>
            </div>
         </div>
      </div>
    </div>
  );
}
