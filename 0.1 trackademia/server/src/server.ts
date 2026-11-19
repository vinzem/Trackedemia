import { app } from './app';
const port = Number(new URL(process.env.BACKEND_URL || 'http://localhost:4000').port) || 4000;
app.listen(port, () => console.log(`Trackademia API on :${port}`));
