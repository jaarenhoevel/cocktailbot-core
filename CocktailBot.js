import Controller from "./Controller.js";

class CocktailBot {
    constructor(config, reservoirs) {
        this.config = config;
        this.reservoirs = reservoirs;
        
        this.status = {
            drink: null,
            ready: false,
            activeOutput: null
        }

        this.controller = new Controller(config);
        this.controller.connect()
        .then(() => {
            this.status.ready = true;
            this.setActiveOutput("default").catch(err => console.log(err));
        }).catch(err => {
            console.log(err);    
        });
    }

    async makeDrink(drink, amount) {
        if (!this.status.ready) throw new Error("CocktailBot not ready!");
        if (!drink) throw new Error("No drink specified!");
        if (this.status.activeOutput === null) throw new Error("Select active output!");

        const availableAmount = this.getDrinkAmount(drink);
        if (availableAmount < amount) console.log("Not enough ressources for drink! Trying anyways...");

        if (availableAmount === 0) throw new Error("Can't produce requested drink!");

        const simpleRecipe = [];

        // Create simple recipe with just ingredient id and amount
        drink.ingredients.forEach(ingredient => {
            simpleRecipe.push({
                ingredientId: ingredient.id,
                amount: amount * ingredient.portion
            });
        });

        await this.asyncEach(simpleRecipe, async ({ ingredientId, amount }) => {
            try {
                await this.pumpIngredient(ingredientId, amount)
            } catch (err) {
                console.log(err);
            }
            return true;
        });

        this.status.ready = true;

        this.backwash(); // no await here since drink is already finished
    }

    async pumpIngredient(ingredientId, amount) {
        const ingredientReservoirs = this.getReservoirsByIngredient(ingredientId);

        const { reversePumpTime = 2500, pumpTimeout= 10000 } = this.config;

        if (ingredientReservoirs.length === 0) throw new Error(`No reservoirs for ingredient ${ingredientId}`);

        const startWeight = await this.controller.getWeight();

        let success = false;

        await this.asyncEach(ingredientReservoirs, async (reservoir) => {
            // Open reservoir valves
            await this.setReservoir(reservoir, true);
            
            // Start pumping
            await this.startPump();

            success = false;

            // Wait for weight or timeout
            try {
                await this.waitForWeight(startWeight + amount, pumpTimeout);
                success = true;
            } catch (err) {
                console.log(err);
            }

            // Stop pump
            await this.stopPump();

            // Pump backwards
            if (reversePumpTime !== 0) {
                await this.startPump("backward");
                await this.delay(reversePumpTime);
                await this.stopPump();
            }

            // Close reservoir valves
            await this.setReservoir(reservoir, false);

            // Substract weight gain from reservoir amount
            reservoir.amount -= await this.controller.getWeight() - startWeight;

            // Check if pumping was successful
            if (success) {
                // Return false to stop every loop
                return false;
            } else {
                // Continue with next reservoir
                return true;
            }
        });

        if (success) return;

        // Reject if all reservoirs have been tried
        throw new Error(`Could not pump ${amount}ml of ${ingredientId}!`);
    }

    async backwash() {
        const {backwashTime = 5000} = this.config;

        const freshWaterReservoir = this.getReservoirsByIngredient("backwash_water_fresh").shift();
        const usedWaterReservoir = this.getReservoirsByIngredient("backwash_water_used").shift();

        if (!this.status.ready) throw new Error("CocktailBot not ready!");
        if (!freshWaterReservoir || !usedWaterReservoir) throw new Error("Can't backwash because there are no backwash water reservoirs!");

        this.status.ready = false;

        // Close output valves
        const currentOutput = this.status.activeOutput;
        await this.setActiveOutput(null);
        
        // Open fresh and used water reservoir valves
        await Promise.all([this.setReservoir(freshWaterReservoir, true), this.setReservoir(usedWaterReservoir, true)]);

        // Pump forwards for backwash time
        await this.startPump();
        await this.delay(backwashTime);

        // Close fresh water reservoir valves
        await this.setReservoir(freshWaterReservoir, false);
        
        // Check if there is a air valve at the end
        const endAirValves = this.getAuxValvesByFunction("end_air_valve");
        if (endAirValves.length > 0) {
            // Open end air valve
            const promises = [];
            endAirValves.forEach(valve => {
                promises.push(this.controller.setRelay(valve.relayId, true)); 
            });
            await Promise.all(promises);
            
            // Wait for backwash time
            this.delay(backwashTime);

            // Close end air valves again
            promises.length = 0;
            endAirValves.forEach(valve => {
                promises.push(this.controller.setRelay(valve.relayId, false)); 
            });
            await Promise.all(promises);
        }

        this.stopPump();

        // Restore previously active output
        await this.setActiveOutput(currentOutput);

        this.status.ready = true;
    }

    getDrinkAmount(drink) {
        const recipe = drink.ingredients;
        var minAmount = Number.MAX_SAFE_INTEGER;

        recipe.forEach(ingredient => {
            var available = this.getIngredientAmount(ingredient.id) * (1 / ingredient.portion);
            if (available < minAmount) minAmount = available;
        });

        return Math.floor(minAmount);
    }

    getIngredientAmount(ingredient) {
        var amount = 0;
        this.getReservoirsByIngredient(ingredient).forEach(reservoir => amount += reservoir.amount);

        return amount;
    }

    getReservoirsByIngredient(ingredient) {
        return this.reservoirs.filter(reservoir => reservoir.content === ingredient);
    }

    getAuxValvesByFunction(usage) {
        return this.config.auxValves.filter(valve => valve.function === usage);
    }

    async startPump(pumpId = "forward") {
        if (!this.config.pumps.hasOwnProperty(pumpId)) throw new Error("No such pump!");
        const pump = this.config.pumps[pumpId];

        const relayIds = [];
        relayIds.push(pump.relayId);
        pump.valves.forEach(valve => relayIds.push(valve.relayId));

        const promises = [];
        relayIds.forEach(relayId => promises.push(this.controller.setRelay(relayId, true)));

        await Promise.all(promises);
    }

    async setActiveOutput(activeOutputId = "default") {
        if (!this.config.outputs.hasOwnProperty(activeOutputId) && activeOutputId !== null) throw new Error("No such output!");
        const promises = [];
        
        Object.keys(this.config.outputs).forEach(outputId => {
            promises.push(this.controller.setRelay(this.config.outputs[outputId].relayId, outputId === activeOutputId));
        });

        await Promise.all(promises);

        this.status.activeOutput = activeOutputId;
    }

    async stopPump() {
        const relayIds = [];
        
        Object.keys(this.config.pumps).forEach(pumpId => {
            const pump = this.config.pumps[pumpId];

            relayIds.push(pump.relayId);
            pump.valves.forEach(valve => relayIds.push(valve.relayId));    
        });

        const promises = [];
        relayIds.forEach(relayId => promises.push(this.controller.setRelay(relayId, false)));

        await Promise.all(promises);
    }

    async setReservoir(reservoir, open) {       
        if (!reservoir.valves) throw new Error("No reservoir specified!");
        
        const relayIds = [];

        reservoir.valves.forEach(valve => {
            relayIds.push(valve.relayId);
        });

        const promises = [];
        relayIds.forEach(relayId => promises.push(this.controller.setRelay(relayId, open)));

        await Promise.all(promises);
    }

    async waitForWeight(targetWeight, timeout) {
        console.log(`Waiting for target weight of ${targetWeight}g with ${timeout}ms timeout`);
        
        return new Promise((resolve, reject) => {
            const interval = setInterval(async () => {
                const weight = await this.controller.getWeight();
                if (weight >= targetWeight) resolve();

                //console.log(`Current weight is ${weight}g, but we're waiting for at least ${targetWeight}g`);
            }, 500);
            
            setTimeout(() => {
                clearInterval(interval);
                reject(new Error("Timeout while waiting for weight change!"));
            }, timeout);
        });
    }

    delay(ms) {
        return new Promise((resolve, reject) => {
            setTimeout(resolve, ms);
        })
    }

    async asyncEach(array, callback) {
        for (let index = 0; index < array.length; index++) {
            const result = await callback(array[index], index, array);
            if (result !== true) return;
        }
    }

}

export default CocktailBot;