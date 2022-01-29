import Controller from "./Controller.js";

class CocktailBot {
    constructor(config, reservoirs) {
        this.config = config;
        this.reservoirs = reservoirs;
        
        this.controller = new Controller(config);
        this.controller.connect().then(() => this.busy = false).catch(error => {
            console.log(error.message);    
        });

        this.busy = true;
    }

    getDrinkAmount(drink) {
        const recipe = drink.ingredients;
        var minAmount = Number.MAX_SAFE_INTEGER;

        recipe.forEach(ingredient => {
            var available = this.getIngredientAmount * (1 / ingredient.amount);
            if (available < minAmount) minAmount = available;
        });
    }

    getIngredientAmount(ingredient) {
        var amount = 0;
        this.getReservoirByIngredient(ingredient).forEach(reservoir => amount += reservoir.amount);

        return amount;
    }

    getReservoirByIngredient(ingredient) {
        return this.reservoirs.filter(reservoir => reservoir.content === ingredient);
    }

}

export default CocktailBot;