import { join, dirname } from 'path'
import { Low, JSONFile } from 'lowdb'
import { fileURLToPath } from 'url'
import express from 'express';
import cors from 'cors';

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

const processes = {};

const app = express();
app.use(cors());
app.use(express.json());

// RESTful API //

// Drinks
app.get('/drinks', (req, res) => {    
    const { available = false, minAmount = 1} = req.query;

    var d = {};
    var drinks = menu.getDrinks();
    Object.keys(drinks).forEach(id => {
        const availableAmount = bot.getDrinkAmount(drinks[id]);
        if ( !available || availableAmount >= minAmount) {
            d[id] = drinks[id];
            d[id].available = availableAmount;
        }
    });

    res.status(200).send(d);
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

    const processStatus = {
        "status": "running",
        "start": Date.now,
        "progress": null,
        "errors": []
    };

    const processId = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

    processes[processId] = processStatus;

    bot.makeDrink(drink, amount, (progress) => processStatus.progress = progress).then(() => {
        processStatus.status = "finished";
    }).catch(err => {
        processStatus.errors.push(err);
    });

    res.status(200).send({"success": "Production started!", "processId": processId});
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
    if (!localdb.data.reservoirs[req.params.reservoirId]) {
        res.status(400).send({"error": "No such reservoir!"});
        return;
    }

    const { content, amount } = req.body;
    const reservoir = localdb.data.reservoirs[req.params.reservoirId];

    if (content !== undefined) reservoir.content = content;
    if (amount !== undefined) reservoir.amount = amount;

    res.status(200).send({"success": "Reservoir updated!"});
});

app.post('/reservoirs/:reservoirId/refill', (req, res) => {
    if (!localdb.data.reservoirs[req.params.reservoirId]) {
        res.status(400).send({"error": "No such reservoir!"});
        return;
    }

    const { time = 10 } = req.body;
    const reservoir = localdb.data.reservoirs[req.params.reservoirId];

    const stopRefilling = bot.refillReservoir(reservoir);

    if (!stopRefilling) {
        res.status(500).send({"error": "Bot not ready!"});
        return;
    }

    setTimeout(stopRefilling, time * 1000);

    res.status(200).send({"success": "Refilling started!"});
});

app.get('/status', (req, res) => {
    res.status(200).send(bot.status);
});

// Set output
app.patch('/status', (req, res) => {
    const { selectedOutput = null } = req.body;

    if (!selectedOutput) {
        res.status(400).send({"error": "No output specified!"});
        return;
    }

    if (!bot.config.outputs.hasOwnProperty(selectedOutput)) res.status(400).send({"error": "No such output!"});

    bot.status.selectedOutput = selectedOutput;
    res.send({"success": "Selected output!"});
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

// Processes
app.get('/processes', (req, res) => {
    res.status(200).send(processes);
});

app.get('/processes/:processId', (req, res) => {    
    const process = processes[req.params.processId]
    if (!process) {
        res.status(404).send({"error": "No such process!"});
        return;
    }
    res.status(200).send(process);
});

app.listen(8080);

// Write local db content to localdb.json
//await localdb.write()