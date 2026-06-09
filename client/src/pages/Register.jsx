import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { UserPlus, Loader2 } from 'lucide-react';
import api from '../api';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [cfHandle, setCfHandle] = useState('');
  const [lcUsername, setLcUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useUser();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/register', { 
        username, 
        password,
        cfHandle: cfHandle.trim() || undefined,
        lcUsername: lcUsername.trim() || undefined
      });
      login({
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
      }, res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh] py-12">
      <div className="w-full max-w-md p-8 space-y-8 bg-gray-800 rounded-xl border border-gray-700 shadow-2xl">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-white">Create Account</h2>
          <p className="mt-2 text-sm text-gray-400">Start tracking your CP progress</p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="p-3 text-sm text-red-400 bg-red-900/50 border border-red-800 rounded-lg">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300">Username *</label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 mt-1 text-white bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300">Password *</label>
              <input
                type="password"
                required
                className="w-full px-3 py-2 mt-1 text-white bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="pt-4 border-t border-gray-700">
              <label className="block text-sm font-medium text-gray-300">Codeforces Handle (Optional)</label>
              <input
                type="text"
                className="w-full px-3 py-2 mt-1 text-white bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                value={cfHandle}
                onChange={(e) => setCfHandle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300">LeetCode Username (Optional)</label>
              <input
                type="text"
                className="w-full px-3 py-2 mt-1 text-white bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                value={lcUsername}
                onChange={(e) => setLcUsername(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-gray-900 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><UserPlus className="w-5 h-5 mr-2" /> Sign Up</>}
          </button>
        </form>
        
        <p className="text-center text-sm text-gray-400">
          Already have an account? <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
