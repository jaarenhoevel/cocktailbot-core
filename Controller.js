class Controller {
    constructor(config) {
        this.config = config;

        this.ready = false;
    }

    async connect() {
        throw new Error("There was an error connecting to the controller board");
    }
}

export default Controller;