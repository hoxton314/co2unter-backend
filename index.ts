import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import cors from 'cors';
import axios from 'axios';
import bodyParser from 'body-parser';

dotenv.config();


const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

app.use(bodyParser.urlencoded({ extended: true }));

const corsOptions = {
    origin: 'https://co2unter.hoxton.dev',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
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

app.get('/', (_req: Request, _res: Response) => {
    _res.send('Testowa aplikacja na hackaton!');
});

interface EmissionInput {
    flyingHabits: 'rarely' | 'occasionally' | 'regularly' | 'custom';
    flyingAmount?: {
        innerCountry: number;
        european: number;
        intercontinental: number;
    };
    diet: 'vegan' | 'mediterranean' | 'lessMeat' | 'everything';
    dailyCommute: 'walk' | 'cycle' | 'publicTransport' | 'carPool' | 'car';
    otherCarUsage?: 'never' | 'rarely' | 'occasionally' | 'regularly' | 'custom';
    otherCarUsageKm: number;
    typeOfCar?: 'electric' | 'gas' | 'diesel' | 'fuel';
    carSize: 'small' | 'regular' | 'suv' | 'semitruck';
    newClothesConsumption: 'never' | 'rarely' | 'occasionally' | 'regularly';
    houseHold: 'flat' | 'detached' | 'singleFamily';
    rooms: number;
    inhabitants: number;
}

type EmissionFactors = {
    [key: string]: {
        [key: string]: number
    };
};

const emissionFactors: EmissionFactors = {
    flying: {
        rarely: 0.2,
        occasionally: 0.6,
        regularly: 3,
        custom: 0, // Custom will be handled below
    },
    flyingAmount: {
        innerCountry: 0.1,
        european: 0.25,
        intercontinental: 2,
    },
    diet: {
        vegan: 0.255,
        mediterranean: 0.37,
        lessMeat: 0.55,
        everything: 1,
    },
    dailyCommute: {
        walk: 0,
        cycle: 0,
        publicTransport: 0.1,
        car: 0.6,
    },
    otherCarUsage: {
        never: 0,
        rarely: 1,
        occasionally: 2,
        regularly: 3,
        custom: 0,
    },
    clothing: {
        never: 0,
        rarely: 1,
        occasionally: 2,
        regularly: 3,
    },
    housing: {
        studio: 2,
        oneBedroom: 2.75,
        twoBedroom: 3.5,
        threeBedroom: 4.3,
    },
    shopping: {
        never: 0.01,
        rarely: 0.34,
        occasionally: 0.86,
        regularly: 1.26,
    }
};

app.post('/calculate-emission', (req: Request<{}, {}, EmissionInput>, res: Response) => {
    const data: any = req.body;

    let allEmissions = 0;

    // housing emissions
    const emissionsHousing = emissionFactors.housing[data.housing] / data.inhabitants
    const emissionsElectricity = data.electricityUsage * 0.72 * 365
    const emissionsDiet = emissionFactors.diet[data.diet]
    const emissionsShopping = emissionFactors.shopping[data.shopping]
    const emissionsCommute = emissionFactors.dailyCommute[data.dailyCommute]
    const emissionsOtherCarUsage = emissionFactors.otherCarUsage[data.otherCarUsage]


    allEmissions = emissionsHousing + emissionsElectricity + emissionsDiet + emissionsShopping + emissionsCommute + emissionsOtherCarUsage

    // Send the response back
    res.json({ allEmissions });
});

app.use((_req: Request, res: Response) => {
    res.status(404).send("Not found");
});

app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
