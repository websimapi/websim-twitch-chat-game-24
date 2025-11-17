export class PlayerInventory {
    constructor() {
        this.logs = [];
        this.leaves = [];
    }

    getState() {
        return {
            logs: this.logs,
            leaves: this.leaves,
        };
    }

    loadState(state) {
        this.logs = state.logs || [];
        this.leaves = state.leaves || [];
    }
}

