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

app.get('/ingredients', (req, res) => {    
    res.status(200).send(menu.getIngredients());
});

app.get('/reservoirs', (req, res) => {
    res.status(200).send(bot.reservoirs);
});

app.get('/status', (req, res) => {
    res.status(200).send(bot.status);
});

app.get('/config', (req, res) => {
    res.status(200).send(bot.config);
});

app.get('/test', (req, res) => {
    const drinks = menu.getDrinks();
    
    bot.makeDrink(drinks.mojito, 100)
    .then(() => {
        res.status(200).send("Success");
    })
    .catch(err => {
        res.status(500).send(err.message);
        console.log(err);
    });
});

app.listen(8080);

// Write local db content to localdb.json
//await localdb.write()