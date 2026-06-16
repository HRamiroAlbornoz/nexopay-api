import 'dotenv/config';
import app from './src/app';
import { env } from './src/env';

app.listen(env.PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${env.PORT}`);
});
