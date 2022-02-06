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

// RESTful API //

// Drinks
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
    res.status(200).send(drink);
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

app.put('/drinks/:drinkId', (req, res) => {
    if (!menu.validateDrink(req.body)) {
        res.status(400).send({"error": "Invalid drink!"});
        return;
    }
    
    if (!menu.putDrink(req.body)) {
        res.status(400).send({"success": "No such drink!"});
        return;
    }

    res.status(200).send({"success": "Drink edited!"});
});

app.post('/drinks/:drinkId', (req, res) => {
    if (!menu.validateDrink(req.body)) {
        res.status(400).send({"error": "Invalid drink!"});
        return;
    }
    
    if (!menu.putDrink(req.body)) {
        res.status(400).send({"success": "Drink ID is already used!"});
        return;
    }

    res.status(200).send({"success": "Drink added!"});
});

// Ingredients
app.get('/ingredients', (req, res) => {    
    res.status(200).send(menu.getIngredients());
});

app.get('/ingredients/:ingredientId', (req, res) => {
    const ingredient = menu.getIngredient(req.params.ingredientId);
    if (!ingredient) {
        res.status(404).send({"error": "No such ingredient!"});
        return;
    }
    res.status(200).send(ingredient);
});

app.put('/ingredients/:ingredientId', (req, res) => {
    if (!menu.validateIngredient(req.body)) {
        res.status(400).send({"error": "Invalid ingredient!"});
        return;
    }
    
    if (!menu.putIngredient(req.body)) {
        res.status(400).send({"success": "No such ingredient!"});
        return;
    }

    res.status(200).send({"success": "Ingredient edited!"});
});

app.post('/ingredients/:ingredientId', (req, res) => {
    if (!menu.validateIngredient(req.body)) {
        res.status(400).send({"error": "Invalid ingredient!"});
        return;
    }
    
    if (!menu.putIngredient(req.body)) {
        res.status(400).send({"success": "Ingredient ID is already used!"});
        return;
    }

    res.status(200).send({"success": "Ingredient added!"});
});

app.get('/reservoirs', (req, res) => {
    res.status(200).send(bot.reservoirs);
});

app.patch('/reservoirs/:reservoirId', (req, res) => {
    if (!localdb.data.config.reservoirs.hasOwnProperty(req.params.reservoirId)) {
        res.status(400).send({"error": "No such reservoir!"});
    }

    const { content, amount } = req.body;
    const reservoir = localdb.data.config.reservoirs[req.params.reservoirId];

    if (content !== undefined) reservoir.content = content;
    if (amount !== undefined) reservoir.amount = amount;

    res.status(200).send({"success": "Reservoir updated!"});
});

app.get('/status', (req, res) => {
    res.status(200).send(bot.status);
});

// Set output
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

app.get('/sensors/:sensorId', (req, res) => {
    if (req.params.sensorId === "scale") {
        bot.controller.getWeight().then(weight => {
            res.status(200).send({"weight": weight});
        }).catch(err => {
            res.status(500).send({"error": err.message});
        });
        return;  
    }

    if (req.params.sensorId === "temperature") {
        bot.controller.getTemperature().then(temperature => {
            res.status(200).send({"temperature": temperature});
        }).catch(err => {
            res.status(500).send({"error": err.message});
        });
        return;  
    }

    res.status(400).send({"error": "No such sensor!"});
});

app.patch('/sensors/:sensorId', (req, res) => {
    if (req.params.sensorId === "scale") {
        const { weight } = req.body;

        if (weight === undefined || weight < 0) {
            res.status(400).send({"error": "No weight specified!"});
            return;
        }

        if (weight === 0) {
            bot.controller.tareScale().then(() => {
                res.status(200).send({"success": "Scale tared!"});
            }).catch(err => {
                res.status(500).send({"error": err.message});
            });
            return; 
        }

        bot.controller.calibrateScale(parseInt(weight)).then(() => {
            res.status(200).send({"success": "Scale calibrated!"});
        }).catch(err => {
            res.status(500).send({"error": err.message});
        });
        return; 
    }

    if (req.params.sensorId === "temperature") {
        res.status(400).send({"error": "Can't calibrate temperature!"});
        return;
    }

    res.status(400).send({"error": "No such sensor!"});
});

app.listen(8080);

// Write local db content to localdb.json
//await localdb.write()