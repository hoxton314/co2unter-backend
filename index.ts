import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import cors from 'cors';
import axios from 'axios';


dotenv.config();


const app = express();
const port = process.env.PORT || 3000;

const corsOptions = {
    origin: 'https://co2unter.hoxton.dev',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // If you need to allow cookies or authorization headers
};

app.use(cors(corsOptions));

// Open SQLite database
const db = new Database('./database.db', { verbose: console.log });

// Create a table if it doesn't exist
db.exec(`
    CREATE TABLE IF NOT EXISTS parks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        area TEXT NOT NULL,
        co2_absorbed_tons REAL
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS trees_absorption (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        co2_absorbed_kgs REAL NOT NULL
    )
`);

const calculateCo2Absorption = (area: number): number => {
    const absorptionRate = 8.2; // tons of CO2 per hectare
    return area * absorptionRate;
};



app.get('/', (_req: Request, _res: Response) => {
    _res.send('Express + TypeScript + SQLite Server');
});

const getTreeCategoryData = () => {
    return [
        {
            name: 'Old Tree',
            co2_absorbed_kgs: 22 // tons
        },
        {
            name: 'Medium Tree',
            co2_absorbed_kgs: 9 // tons (average)
        },
        {
            name: 'Small Seedling',
            co2_absorbed_kgs: 0.5 // ton (average)
        }
    ];
};


const fetchParkData = async () => {
    try {
        const parksResponse = await axios.get('https://api.um.krakow.pl/opendata-srodowisko-parki-miejskie/v1/parki-miejskie-powierzchnia');
        const pocketParksResponse = await axios.get('https://api.um.krakow.pl/opendata-srodowisko-parki-kieszonkowe/v1/parki-kieszonkowe-powierzchnia');

        const parksData = parksResponse.data.value.map((park: any) => ({
            name: park.Nazwa,
            area: park.Powierzchnia_ha,
            co2_absorbed_tons: calculateCo2Absorption(park.Powierzchnia_ha),
        }));

        const pocketParksData = pocketParksResponse.data.value.map((pocketPark: any) => ({
            name: pocketPark.NAZWA,
            area: pocketPark.POW_HA,
            co2_absorbed_tons: calculateCo2Absorption(pocketPark.POW_HA),
        }));

        const combinedData = [...parksData, ...pocketParksData];
        const insert = db.prepare('INSERT INTO parks (name, area, co2_absorbed_tons) VALUES (?, ?, ?)');
        for (const { name, area, co2_absorbed_tons } of combinedData) {
            insert.run(name, area, co2_absorbed_tons);
        }

        const treeData = getTreeCategoryData();
        const insertCo2Absorption = db.prepare('INSERT INTO trees_absorption (name, co2_absorbed_kgs) VALUES (?, ?)');
        for (const { name, co2_absorbed_kgs } of treeData) {
            insertCo2Absorption.run(name, co2_absorbed_kgs);
        }

        console.log('CO2 absorption data inserted successfully');

        console.log('Data inserted successfully');
    } catch (error) {
        console.error('Error fetching park data:', error);
    }
};

// Call the fetch function
fetchParkData();

app.use((_req: Request, res: Response) => {
    res.status(404).send("Not found");
});

app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
