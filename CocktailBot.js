import Controller from "./Controller.js";

class CocktailBot {
    constructor(config, reservoirs) {
        this.config = config;
        this.reservoirs = reservoirs;
        
        this.status = {
            drink: null,
            ready: false,
        }

        this.controller = new Controller(config);
        this.controller.connect().then(() => this.status.ready = true).catch(error => {
            console.log(error.message);    
        });
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
        this.getReservoirByIngredient(ingredient).forEach(reservoir => amount += reservoir.amount);

        return amount;
    }

    getReservoirByIngredient(ingredient) {
        return this.reservoirs.filter(reservoir => reservoir.content === ingredient);
    }

    async startPump(pumpId) {
        if (!this.config.pumps.hasOwnProperty(pumpId)) throw new Error("No such pump!");
        const pump = this.config.pumps[pumpId];

        const relayIds = [];
        relayIds.push(pump.relayId);
        pump.valves.forEach(valve => relayIds.push(valve.relayId));

        const promises = [];
        relayIds.forEach(relayId => promises.push(this.controller.setRelay(relayId, true)));

        await Promise.all(promises);
    }

    async setActiveOutput(activeOutputId) {
        const promises = [];
        
        Object.keys(this.config.outputs).forEach(outputId => {
            promises.push(this.controller.setRelay(this.config.outputs[outputId].relayId, outputId === activeOutputId));
        });

        await Promise.all(promises);
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

}

export default CocktailBot;