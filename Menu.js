class Menu {
    constructor(db, localdb) {
        this.db = db;
        this.localdb = localdb;

        this.drinks = {};
        this.ingredients = {};

        this.mergeDatabases();
    }

    mergeDatabases() {
        // Populate merged database with entrys from global database
        this.drinks = this.db.data.drinks;
        this.ingredients = this.db.data.ingredients;

        // Add all entries from local db to merged database
        Object.keys(this.localdb.data.drinks).forEach(drinkId => {
            this.drinks[drinkId] = this.localdb.data.drinks[drinkId];
        });

        Object.keys(this.localdb.data.ingredients).forEach(ingredientId => {
            this.ingredients[ingredientId] = this.localdb.data.ingredients[ingredientId];
        });
    }

    getIngredients() {
        return this.ingredients;
    }

    getIngredient(ingredientId) {
        return this.ingredients[ingredientId];
    }

    addIngredient(ingredientId, ingredient) {
        if (this.ingredients.hasOwnProperty(ingredientId)) return false;
        if (!this.validateIngredient(ingredient)) return false;
        this.localdb.data.ingredients[ingredientId] = ingredient;
        
        this.mergeDatabases();
        return true;
    }

    putIngredient(ingredientId, ingredient) {
        if (!this.ingredients.hasOwnProperty(ingredientId)) return false;
        if (!this.validateIngredient(ingredient)) return false;
        this.localdb.data.ingredients[ingredientId] = ingredient;
    
        this.mergeDatabases();
        return true;
    }

    getDrinks() {
        return this.drinks;
    }

    getDrink(drinkId) {
        return this.drinks[drinkId];
    }

    addDrink(drinkId, drink) {
        if (this.drinks.hasOwnProperty(drinkId)) return false;
        if (!this.validateDrink(drink)) return false;
        this.localdb.data.drinks[drinkId] = drink;
        
        this.mergeDatabases();
        return true;
    }

    putDrink(drinkId, drink) {
        if (!this.drinks.hasOwnProperty(drinkId)) return false;
        if (!this.validateDrink(drink)) return false;
        this.localdb.data.drinks[drinkId] = drink;
        
        this.mergeDatabases();
        return true;
    }

    validateDrink(drink) {
        const { ingredients = null, name = null } = drink;

        if (!ingredients || !name) return false;

        const ingredientSum = 0;

        ingredients.forEach((ingredient) => {
            ingredientSum += ingredient.portion;
            if (!this.ingredients.hasOwnProperty(ingredient.id)) return false;
        });

        return ingredientSum === 1;
    }

    validateIngredient(ingredient) {
        const { name = null, proof = 0 } = ingredient;

        if (!name) return false;

        return proof >= 0 && proof <= 1;
    }
}

export default Menu;