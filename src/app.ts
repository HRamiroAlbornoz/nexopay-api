import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import routes from './routes';
import { errorHandler } from './middleware/error.middleware';
import walletRoutes from './routes/wallet.routes';

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

const app = express();

app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use('/api/wallet', walletRoutes);
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api', routes);

app.use(errorHandler);

export default app;
