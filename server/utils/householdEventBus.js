/**
 * Real-Time Household Event Bus (U-01)
 * Broadcasts state mutations (meal_plan, pantry, recipes, shopping) to connected
 * household SSE clients (Web, Mobile, and Family Hub) in <100ms.
 */
const EventEmitter = require('events');

class HouseholdEventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(0);
    }

    emitHouseholdEvent(householdId, eventType, payload = {}) {
        if (!householdId) return;
        const channel = `household:${String(householdId)}`;
        this.emit(channel, {
            type: eventType,
            householdId: String(householdId),
            timestamp: Date.now(),
            ...payload
        });
    }

    subscribeHousehold(householdId, listener) {
        const channel = `household:${String(householdId)}`;
        this.on(channel, listener);
        return () => this.off(channel, listener);
    }
}

const householdBus = new HouseholdEventBus();

module.exports = { householdBus, HouseholdEventBus };
