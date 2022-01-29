class Menu {
    constructor(db, localdb) {
        this.db = db;
        this.localdb = localdb;
    }

    getIngredients() {
        return this.db.data.ingredients;
    }

    getDrinks() {
        return this.db.data.drinks;
    }
}

export default Menu;