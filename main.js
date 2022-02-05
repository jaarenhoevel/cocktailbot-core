import { join, dirname } from 'path'
import { Low, JSONFile } from 'lowdb'
import { fileURLToPath } from 'url'
import express from 'express';

import Menu from './Menu.js';
import CocktailBot from './CocktailBot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use JSON file for storage
const db = new Low(new JSONFile(join(__dirname, 'db.json')))
const localdb = new Low(new JSONFile(join(__dirname, 'localdb.json')))

await db.read()
await localdb.read()

// Use defaults if db is empty
db.data ||= { ingredients: {}, drinks: {} }
localdb.data ||= { config: { pumps: {}, outputs: {} }, reservoirs: [], ingredients: {}, drinks: {} }

// Initiate cocktail bot
const menu = new Menu(db, localdb);
const bot = new CocktailBot(localdb.data.config, localdb.data.reservoirs);

const app = express();
app.use(express.json());

// RESTful API

app.get('/drinks', (req, res) => {    
    const { available, minAmount = 1} = req.query;
    
    if (available) {
        var availableDrinks = {};
        var drinks = menu.getDrinks();
        Object.keys(drinks).forEach(id => {
            const available = bot.getDrinkAmount(drinks[id]);
            if ( available > minAmount) {
                availableDrinks[id] = drinks[id];
                availableDrinks[id].available = available;
            }
        });
        
        res.status(200).send(availableDrinks);
    } else {
        res.status(200).send(menu.getDrinks());
    }
});

app.get('/drinks/:drinkId', (req, res) => {    
    const drink = menu.getDrink(req.params.drinkId);
    if (!drink) {
        res.status(404).send({"error": "No such drink!"});
        return;
    }
    res.status(200).send(drinks[req.params.drinkId]);
});

app.patch('/drinks/:drinkId', (req, res) => {
    const { amount = -1 } = req.body;
    const drink = menu.getDrink(req.params.drinkId);

    if (!drink) {
        res.status(404).send({"error": "No such drink!"});
        return;
    }

    if (amount <= 0) {
        res.status(400).send({"error": "No amount specified!"});
        return;
    }

    bot.makeDrink(drink, amount).catch(err => {
        console.log(err);
    });

    res.status(200).send({"success": "Production started!"});
});

app.get('/ingredients', (req, res) => {    
    res.status(200).send(menu.getIngredients());
});

app.get('/reservoirs', (req, res) => {
    res.status(200).send(bot.reservoirs);
});

app.get('/status', (req, res) => {
    res.status(200).send(bot.status);
});

app.patch('/status', (req, res) => {
    const { activeOutput = null } = req.body;

    if (!activeOutput) {
        res.status(400).send({"error": "No output specified!"});
        return;
    }

    bot.setActiveOutput(activeOutput).then(() => {
        res.status(200).send({"success": "Output set!"});
    }).catch(err => {
        res.status(500).send({"error": err.message});
    });
});

app.get('/config', (req, res) => {
    res.status(200).send(bot.config);
});

app.listen(8080);

// Write local db content to localdb.json
//await localdb.write()