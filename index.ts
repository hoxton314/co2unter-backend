import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import cors from 'cors';
import axios from 'axios';
import bodyParser from 'body-parser';
import {parkiMiejskie, ParkiKieszonkowe, Events} from './parks'
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

if (tableExists('events')) {
    db.prepare('DELETE FROM events').run();
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

db.exec(`
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        location TEXT NOT NULL,
        co2_emissions REAL NOT NULL
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

        const events = Events.events
        const insertEvents = db.prepare('INSERT INTO events (name, date, location, co2_emissions) VALUES (?, ?, ?, ?)');
        for (const { name, date, location, co2_emissions } of events) {
            insertEvents.run(name, date, location, co2_emissions);
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
    household: {
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

const getEmissions = (req: any) => {
    const data: any = req.body;

    let allEmissions = 0;

    console.log(req.body)
    // housing emissions
    const emissionsHousing = (data.household && data.inhabitants) ? emissionFactors.household[data.household] / data.inhabitants : 0;
    const emissionsElectricity = data.electricityUsage ? (data.electricityUsage * 0.72 * 365 / 1000) : 0;
    const emissionsDiet = data.diet ? emissionFactors.diet[data.diet] : 0;
    const emissionsShopping = data.shopping ? emissionFactors.shopping[data.shopping] : 0;
    const emissionsCommute = data.dailyCommute ? emissionFactors.dailyCommute[data.dailyCommute] : 0;
    const emissionsOtherCarUsage = (data.carType && data.otherCarUsage) ? data.otherCarUsage * 50 * emissionFactors.carType[data.carType] / 100000 : 0;

    //flights
    let emissionFlights = 0
    if(typeof data.flyingHabit === 'string') emissionFactors.flyingHabit[data.flyingHabit];
    if (data.flyingHabit === 'object') {
        emissionFlights =
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

    allEmissions = emissionsHousing + emissionsElectricity + emissionsDiet + emissionsShopping + emissionsCommute + emissionsOtherCarUsage + emissionFlights;

    try {
        // Fetch tree absorption rates from the database and type the response correctly
        const treeAbsorptionRates: any[] = db.prepare('SELECT name, co2_absorbed_kgs FROM trees_absorption').all();

        const oldTreeAbsorption = treeAbsorptionRates.find(e => e.name === 'Old Tree').co2_absorbed_kgs
        const mediumTreeAbsorption = treeAbsorptionRates.find(e => e.name === 'Medium Tree').co2_absorbed_kgs
        const smallTreeAbsorption = treeAbsorptionRates.find(e => e.name === 'Small Seedling').co2_absorbed_kgs

        // Send the response back including total emissions and trees required
        return {
            oldTreesAbsorption: allEmissions * 1000 / oldTreeAbsorption,
            mediumTreeAbsorption: allEmissions * 1000 / mediumTreeAbsorption,
            smallTreeAbsorption: allEmissions * 1000 / smallTreeAbsorption,
            totalEmissions: allEmissions, // in tons
        }
    } catch (error) {
        console.error('Error fetching tree data:', error);
        return { error: 'Error calculating tree absorption' }
    }
}

app.post('/calculate-emission', async (req: Request<{}, {}, EmissionInput>, res: Response) => {
    const response = getEmissions(req)
    res.send(response)
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


app.get('/events', async (req: Request<{}, {}, EmissionInput>, res: Response) => {
    const events: any[] = db.prepare('SELECT name, date, location, co2_emissions FROM events').all();
    const parks: any[] = db.prepare('SELECT name, area, co2_absorbed_tons FROM parks').all();

    // Create extraEvents with the closest park for each event
    const extraEvents = events.map(event => {
        const eventEmissionsInTons = event.co2_emissions / 1000; // Convert kg to tons

        // Find the closest park based on CO2 absorbed
        const closestPark = parks.reduce((closest, park) => {
            const parkEmissions = park.co2_absorbed_tons;
            const currentDiff = Math.abs(parkEmissions - eventEmissionsInTons);

            // If there's no closest park yet, or the current one is closer, update closest
            if (!closest || currentDiff < Math.abs(closest.co2_absorbed_tons - eventEmissionsInTons)) {
                return park;
            }
            return closest;
        }, null);

        // Return the event with the closest park included
        return {
            ...event,
            park: closestPark,
        };
    });

    res.json({
        events: extraEvents,
    });
});


app.use((_req: Request, res: Response) => {
    res.status(404).send("Not found");
});

app.listen(port, () => {
    console.log(`[server]: Server is running at PORT: ${port}`);
});
