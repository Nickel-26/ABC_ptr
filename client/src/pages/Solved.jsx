import { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';
import { Search, Save, ExternalLink, Loader2, CheckCircle, Bookmark } from 'lucide-react';
import api from '../api';

export default function Solved() {
  const { user } = useUser();
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [bookmarkFilter, setBookmarkFilter] = useState('ALL');
  
  // State to handle note saving UI
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);

  useEffect(() => {
    if (user?.username) {
      api.get(`/notes/${user.username}`)
        .then(res => setProblems(res.data))
        .catch(err => console.error('Failed to fetch solved problems:', err))
        .finally(() => setLoading(false));
    }
  }, [user]);

  const handleNoteChange = (problemId, newNote) => {
    setProblems(prev => prev.map(p => 
      p.problem.id === problemId ? { ...p, note: newNote } : p
    ));
  };

  const toggleBookmark = async (problemId, currentStatus) => {
    try {
      setProblems(prev => prev.map(p => 
        p.problem.id === problemId ? { ...p, isBookmarked: !currentStatus } : p
      ));
      await api.post(`/notes/${user.username}/bookmark`, { problemId, isBookmarked: !currentStatus });
    } catch (err) {
      console.error('Failed to toggle bookmark:', err);
      setProblems(prev => prev.map(p => 
        p.problem.id === problemId ? { ...p, isBookmarked: currentStatus } : p
      ));
    }
  };

  const saveNote = async (problemId, content) => {
    setSavingId(problemId);
    try {
      await api.post(`/notes/${user.username}`, { problemId, content });
      setSavedId(problemId);
      setTimeout(() => setSavedId(null), 2000);
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      setSavingId(null);
    }
  };

  const filteredProblems = problems.filter(p => {
    const matchesSearch = p.problem.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.problem.tags?.some(pt => pt.tag.name.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesPlatform = platformFilter === 'ALL' || p.problem.platform === platformFilter;
    const matchesBookmark = bookmarkFilter === 'ALL' || (bookmarkFilter === 'BOOKMARKED' && p.isBookmarked);
    return matchesSearch && matchesPlatform && matchesBookmark;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Solved Problems</h1>
        <p className="text-gray-400 mt-2">Track your progress and write personal notes for problems you've solved.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or tag..."
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-indigo-500 outline-none"
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
        >
          <option value="ALL">All Platforms</option>
          <option value="CODEFORCES">Codeforces</option>
          <option value="LEETCODE">LeetCode</option>
        </select>
        <select
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-indigo-500 outline-none"
          value={bookmarkFilter}
          onChange={(e) => setBookmarkFilter(e.target.value)}
        >
          <option value="ALL">All Problems</option>
          <option value="BOOKMARKED">Bookmarked Only</option>
        </select>
      </div>

      <div className="grid gap-4">
        {filteredProblems.map((item) => (
          <div key={item.submissionId} className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="md:w-1/4 space-y-2">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <button onClick={() => toggleBookmark(item.problem.id, item.isBookmarked)} className="focus:outline-none shrink-0">
                      <Bookmark className={`w-4 h-4 transition-colors ${item.isBookmarked ? 'text-yellow-400 fill-yellow-400' : 'text-gray-500 hover:text-gray-300'}`} />
                    </button>
                    <span className="truncate">{item.problem.name}</span>
                    <a href={item.problem.url} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-indigo-400 transition-colors shrink-0">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase rounded ${
                      item.problem.platform === 'LEETCODE' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-blue-500/10 text-blue-500'
                    }`}>
                      {item.problem.platform}
                    </span>
                    {item.problem.rating && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-gray-700 text-gray-300 rounded">
                        {item.problem.rating}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-500">
                      {new Date(item.submittedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-1">
                  {item.problem.tags?.slice(0, 3).map(pt => (
                    <span key={pt.tag.id} className="px-1.5 py-0.5 text-[10px] bg-gray-700/50 text-gray-400 rounded">
                      {pt.tag.name}
                    </span>
                  ))}
                  {(item.problem.tags?.length || 0) > 3 && (
                    <span className="px-1.5 py-0.5 text-[10px] bg-gray-700/50 text-gray-400 rounded">
                      +{(item.problem.tags?.length || 0) - 3}
                    </span>
                  )}
                </div>
              </div>

              <div className="md:w-3/4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Note</label>
                  <button
                    onClick={() => saveNote(item.problem.id, item.note)}
                    disabled={savingId === item.problem.id}
                    className="flex items-center text-xs font-bold text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                  >
                    {savingId === item.problem.id ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : savedId === item.problem.id ? (
                      <CheckCircle className="w-3 h-3 mr-1 text-green-400" />
                    ) : (
                      <Save className="w-3 h-3 mr-1" />
                    )}
                    {savedId === item.problem.id ? 'Saved' : 'Save'}
                  </button>
                </div>
                <textarea
                  className="w-full h-20 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
                  placeholder="Personal notes..."
                  value={item.note}
                  onChange={(e) => handleNoteChange(item.problem.id, e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
        {filteredProblems.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No problems found matching your filters.
          </div>
        )}
      </div>
    </div>
  );
}
