import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '../context/UserContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { BrainCircuit, CheckCircle2, ExternalLink, Lightbulb, RefreshCw, Target, TrendingUp, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../api';

const levelStyles = {
  weak: {
    label: 'Weak',
    text: 'text-red-300',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    bar: 'bg-red-400',
  },
  medium: {
    label: 'Medium',
    text: 'text-yellow-300',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    bar: 'bg-yellow-400',
  },
  strong: {
    label: 'Strong',
    text: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    bar: 'bg-emerald-400',
  },
};

export default function Recommendations() {
  const { user, cfHandle } = useUser();
  const [topics, setTopics] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [predictionSource, setPredictionSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handle = (cfHandle || '').trim();
  const topicHandle = user?.cfHandle || handle;
  const isSyncedHandle = Boolean(user?.cfHandle && handle && user.cfHandle === handle);
  const hasSyncedProfile = isSyncedHandle;

  const fetchAiInsights = useCallback(async () => {
    if (!hasSyncedProfile) {
      setTopics([]);
      setRecommendations([]);
      setPredictionSource('');
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    setTopics([]);
    setRecommendations([]);
    setPredictionSource('');
    try {
      const topicRequest = api.get(`/analysis/${topicHandle}/topics`);
      const recommendationRequest = isSyncedHandle
        ? api.get(`/ai/recommendations/${handle}`, {
            params: { limit: 12 },
          })
        : Promise.resolve({ data: { recommendations: [], predictionSource: 'Codeforces sync required' } });
      const [masteryRes, recommendationsRes] = await Promise.all([topicRequest, recommendationRequest]);

      setTopics(masteryRes.data.topics || []);
      setPredictionSource(recommendationsRes.data.predictionSource || 'topic-summary');
      setRecommendations(recommendationsRes.data.recommendations || []);
    } catch (err) {
      setTopics([]);
      setRecommendations([]);
      setPredictionSource('');
      setError(err.response?.data?.error || err.message || 'Failed to load AI insights');
    } finally {
      setLoading(false);
    }
  }, [handle, hasSyncedProfile, isSyncedHandle, topicHandle]);



  useEffect(() => {
    const timer = setTimeout(() => fetchAiInsights(), 0);
    return () => clearTimeout(timer);
  }, [fetchAiInsights]);

  const topicBuckets = useMemo(() => {
    return topics.reduce((buckets, topic) => {
      if (topic.level === 'weak' || topic.level === 'medium' || topic.level === 'strong') {
        buckets[topic.level] = [...(buckets[topic.level] || []), topic];
      }
      return buckets;
    }, { weak: [], medium: [], strong: [] });
  }, [topics]);

  if (!hasSyncedProfile) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Lightbulb size={48} className="text-zinc-600 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Sync A Profile First</h2>
        <p className="text-zinc-500">Topic strength uses your synced Codeforces solved history.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 text-white">Topic Mastery</h1>
          <p className="text-zinc-400">Weak and strong topics from your canonical Codeforces solved history.</p>
        </div>
        <Button onClick={fetchAiInsights} isLoading={loading} variant="outline">
          <RefreshCw size={16} className="mr-2" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard level="weak" count={topicBuckets.weak.length} />
        <SummaryCard level="medium" count={topicBuckets.medium.length} />
        <SummaryCard level="strong" count={topicBuckets.strong.length} />
      </div>



      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {['weak', 'medium', 'strong'].map(level => (
          <TopicColumn
            key={level}
            level={level}
            topics={topicBuckets[level]}
            loading={loading}
          />
        ))}
      </div>

      <div className="flex items-end justify-between gap-4 pt-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">AI Recommendations</h2>
          <p className="text-zinc-400 mt-1">
            {isSyncedHandle
              ? 'Codeforces recommendations ranked by weak topic fit, rating fit, solve probability, and popularity.'
              : 'Sync Codeforces to see canonical topic mastery and trained AI problem recommendations.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading ? (
          [...Array(6)].map((_, index) => (
            <Card key={index} className="h-56 flex flex-col justify-between">
              <div>
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/4 mb-4" />
                <Skeleton className="h-8 w-full rounded" />
              </div>
              <Skeleton className="h-10 w-full mt-4" />
            </Card>
          ))
        ) : recommendations.length > 0 ? (
          recommendations.map((problem, index) => (
            <RecommendationCard key={problem.problemId} problem={problem} index={index} />
          ))
        ) : (
          <div className="col-span-full py-12 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">
            <CheckCircle2 size={32} className="mx-auto mb-2 opacity-50" />
            <p>No AI recommendations available yet. Sync Codeforces and refresh.</p>
          </div>
        )}
      </div>
    </div>
  );
}


function SummaryCard({ level, count }) {
  const style = levelStyles[level];

  return (
    <Card className={`p-4 ${style.bg} ${style.border}`}>
      <div className={`flex items-center gap-3 ${style.text}`}>
        {level === 'strong' ? <TrendingUp size={20} /> : level === 'medium' ? <Activity size={20} /> : <Target size={20} />}
        <span className="text-sm font-medium">{style.label} Topics</span>
      </div>
      <div className="text-4xl font-bold mt-3">{count}</div>
    </Card>
  );
}

function TopicColumn({ level, topics, loading }) {
  const style = levelStyles[level];

  return (
    <Card className={`p-4 ${style.border}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`font-semibold ${style.text}`}>{style.label}</h3>
        <span className="text-xs text-zinc-500">{topics.length} topics</span>
      </div>

      <div className="space-y-3">
        {loading ? (
          [...Array(5)].map((_, index) => <Skeleton key={index} className="h-12 w-full rounded-lg" />)
        ) : topics.length > 0 ? (
          topics.slice(0, 8).map(topic => (
            <div key={topic.tag} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-zinc-100">{topic.tag}</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div className={`h-full ${style.bar}`} style={{ width: `${topic.masteryScore}%` }} />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-zinc-500 py-6 text-center">No {style.label.toLowerCase()} topics detected.</p>
        )}
      </div>
    </Card>
  );
}

function RecommendationCard({ problem, index }) {
  const probability = Math.round((problem.predictedSolveProbability || 0) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Card className="h-full flex flex-col justify-between hover:border-blue-500/50 transition-colors">
        <div>
          <div className="flex justify-between items-start gap-3 mb-3">
            <h3 className="font-semibold text-lg leading-tight text-zinc-100">{problem.name}</h3>
            <span className="text-xs font-bold px-2 py-1 bg-blue-500/20 text-blue-300 rounded">
              {problem.recommendationScore}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-xs font-medium text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">CF {problem.problemId}</span>
            <span className="text-xs font-medium text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded">{problem.rating || 'Unrated'}</span>
          </div>
        </div>

        <Button className="w-full mt-auto group" asChild>
          <a href={problem.url} target="_blank" rel="noopener noreferrer">
            Solve Problem <ExternalLink size={14} className="ml-2 opacity-50 group-hover:opacity-100 transition-opacity" />
          </a>
        </Button>
      </Card>
    </motion.div>
  );
}

function formatCompact(value) {
  return typeof value === 'number' ? value.toFixed(1) : 'N/A';
}

function formatPercent(value) {
  return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : 'N/A';
}
