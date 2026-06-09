require('dotenv').config();
const express = require('express');
const cors = require('cors');

const syncRoutes = require('./routes/sync');
const problemRoutes = require('./routes/problems');
const userRoutes = require('./routes/users');
const aiAnalysisRoutes = require('./routes/aiAnalysis');
const authRoutes = require('./routes/auth');
const dailyRoutes = require('./routes/daily');
const notesRoutes = require('./routes/notes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.use('/api/sync', syncRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/users', userRoutes);
app.use('/api/recommendations', userRoutes); // handled in users route for now
app.use('/api/analysis', userRoutes);
app.use('/api/ai', aiAnalysisRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api/notes', notesRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
