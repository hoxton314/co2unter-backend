import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Open SQLite database
const db = new Database('./database.db', { verbose: console.log });

// Create a table if it doesn't exist
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE
    )
`);

app.get('/', (_req: Request, _res: Response) => {
    _res.send('Express + TypeScript + SQLite Server');
});


app.get('/users', (_req: Request, res: Response) => {
    try {
        const stmt = db.prepare('SELECT * FROM users');
        const users = stmt.all();
        res.json(users);
    } catch (err) {
        if (err instanceof Error) {
            res.status(500).send(`Error retrieving users: ${err.message}`);
        } else {
            res.status(500).send('An unknown error occurred');
        }
    }
});

app.use((_req: Request, res: Response) => {
    res.status(404).send("Not found");
});

app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
