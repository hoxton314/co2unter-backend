import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import cors from 'cors';
import axios from 'axios';
import bodyParser from 'body-parser';
import {parkiMiejskie, ParkiKieszonkowe} from './parks'
dotenv.config();


const app = express();
const port = process.env.PORT || 3000;
const axiosInstance = axios.create({
    timeout: 10000, // Set timeout to 10 seconds or more as needed
});

app.use(bodyParser.json());

app.use(bodyParser.urlencoded({ extended: true }));

const corsOptions = {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
};

app.use(cors(corsOptions));

// Open SQLite database
const db = new Database('./database.db', { verbose: console.log });

const tableExists = (tableName: string) => {
    const query = `SELECT name FROM sqlite_master WHERE type='table' AND name=?`;
    const result = db.prepare(query).get(tableName);
    return !!result; // Returns true if the table exists, false otherwise
};

// Delete data if the table exists
if (tableExists('parks')) {
    db.prepare('DELETE FROM parks').run();
}

if (tableExists('trees_absorption')) {
    db.prepare('DELETE FROM trees_absorption').run();
}

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
            co2_absorbed_kgs: 22 // kgs
        },
        {
            name: 'Medium Tree',
            co2_absorbed_kgs: 9 // kgs (average)
        },
        {
            name: 'Small Seedling',
            co2_absorbed_kgs: 0.5 // kgs (average)
        }
    ];
};


const fetchParkData = async () => {
    try {
        console.log('park2!!!!')

        let parksResponse
        let pocketParksResponse
        try {
            const res1 = await axiosInstance.get('https://api.um.krakow.pl/opendata-srodowisko-parki-miejskie/v1/parki-miejskie-powierzchnia');
            const res2 = await axiosInstance.get('https://api.um.krakow.pl/opendata-srodowisko-parki-kieszonkowe/v1/parki-kieszonkowe-powierzchnia');

            parksResponse = res1.data
            pocketParksResponse = res2.data
        } catch (e) {
            parksResponse = parkiMiejskie
            pocketParksResponse = ParkiKieszonkowe
        }

        // Map parks data
        console.log(parksResponse)
        console.log(pocketParksResponse)
        const parksData = parksResponse.value.map((park: any) => ({
            name: park.Nazwa,
            area: park.Powierzchnia_ha,
            co2_absorbed_tons: calculateCo2Absorption(park.Powierzchnia_ha),
        }));

        // Map pocket parks data
        const pocketParksData = pocketParksResponse.value.map((pocketPark: any) => ({
            name: pocketPark.NAZWA,
            area: pocketPark.POW_HA,
            co2_absorbed_tons: calculateCo2Absorption(pocketPark.POW_HA),
        }));

        // Combine both parks data sets
        const combinedData = [...parksData, ...pocketParksData];

        // Prepare insertion into the 'parks' table
        const insertParks = db.prepare('INSERT INTO parks (name, area, co2_absorbed_tons) VALUES (?, ?, ?)');
        for (const { name, area, co2_absorbed_tons } of combinedData) {
            insertParks.run(name, area, co2_absorbed_tons);
        }

        // Fetch tree category data and insert into the 'trees_absorption' table
        const treeData = getTreeCategoryData();
        const insertTrees = db.prepare('INSERT INTO trees_absorption (name, co2_absorbed_kgs) VALUES (?, ?)');
        for (const { name, co2_absorbed_kgs } of treeData) {
            insertTrees.run(name, co2_absorbed_kgs);
        }
        console.log('CO2 absorption data and park data inserted successfully');
    } catch (error) {
        console.error('Error fetching or inserting park data:', error);
    }
};

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
    otherCarUsage: number;
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
    flyingHabit: {
        rarely: 0.2,
        occasionally: 0.6,
        regularly: 3,
        custom: 0, // Custom will be handled below
    },
    flyingAmount: {
        domestic: 0.1,
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
        rarely: 7000,
        occasionally: 35000,
        regularly: 87500,
        custom: 0,
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
    },
    carType: {
      electric: 15 * 0.68,
      gas: 16,
      diesel: 19,
      fuel: 20,
    },
};

app.post('/calculate-emission', async (req: Request<{}, {}, EmissionInput>, res: Response) => {
    const data: any = req.body;

    let allEmissions = 0;

    // housing emissions
    const emissionsHousing = emissionFactors.housing[data.housing] / data.inhabitants;
    const emissionsElectricity = data.electricityUsage * 0.72 * 365 / 1000;
    const emissionsDiet = emissionFactors.diet[data.diet];
    const emissionsShopping = emissionFactors.shopping[data.shopping];
    const emissionsCommute = emissionFactors.dailyCommute[data.dailyCommute];
    const emissionsOtherCarUsage = data.otherCarUsage * 50 * emissionFactors.carType[data.carType] / 100000;
    const emissionFlights = emissionFactors.flyingHabit[data.flyingHabit];

    let emissionFlightsCalculated = 0;
    if (data.flyingHabit === 'custom') {
        emissionFlightsCalculated =
            emissionFactors.flyingAmount.domestic * data.flyingAmount.innerCountry +
            emissionFactors.flyingAmount.european * data.flyingAmount.european +
            emissionFactors.flyingAmount.intercontinental * data.flyingAmount.intercontinental;
    }

    console.log(emissionsHousing)
    console.log(emissionsElectricity)
    console.log(emissionsDiet)
    console.log(emissionsShopping)
    console.log(emissionsCommute)
    console.log(emissionsOtherCarUsage)
    console.log(emissionFlights)
    console.log(emissionFlightsCalculated)

    allEmissions = emissionsHousing + emissionsElectricity + emissionsDiet + emissionsShopping + emissionsCommute + emissionsOtherCarUsage + emissionFlights + emissionFlightsCalculated;

    try {
        // Fetch tree absorption rates from the database and type the response correctly
        const treeAbsorptionRates: any[] = db.prepare('SELECT name, co2_absorbed_kgs FROM trees_absorption').all();

        console.log(treeAbsorptionRates)
        const oldTreeAbsorption = treeAbsorptionRates.find(e => e.name === 'Old Tree').co2_absorbed_kgs
        const mediumTreeAbsorption = treeAbsorptionRates.find(e => e.name === 'Medium Tree').co2_absorbed_kgs
        const smallTreeAbsorption = treeAbsorptionRates.find(e => e.name === 'Small Seedling').co2_absorbed_kgs

        // Send the response back including total emissions and trees required
        res.send({
            oldTreesAbsorption: allEmissions * 1000 / oldTreeAbsorption,
            mediumTreeAbsorption: allEmissions * 1000 / mediumTreeAbsorption,
            smallTreeAbsorption: allEmissions * 1000 / smallTreeAbsorption,
            totalEmissions: allEmissions, // in tons
        });
    } catch (error) {
        console.error('Error fetching tree data:', error);
        res.status(500).json({ error: 'Error calculating tree absorption' });
    }
});

app.get('/trees', async (req: Request<{}, {}, EmissionInput>, res: Response) => {
    const trees: any[] = db.prepare('SELECT name, co2_absorbed_kgs FROM trees_absorption').all();
    res.json({
        trees: trees,
    })
});

app.get('/parks', async (req: Request<{}, {}, EmissionInput>, res: Response) => {
    const parks: any[] = db.prepare('SELECT name, area, co2_absorbed_tons FROM parks').all();
    res.json({
        parks: parks,
    })
});

app.use((_req: Request, res: Response) => {
    res.status(404).send("Not found");
});

app.listen(port, () => {
    console.log(`[server]: Server is running at PORT: ${port}`);
});
