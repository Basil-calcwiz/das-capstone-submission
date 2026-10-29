export class MemoryRepository {
  #events = new Map();
  #tiers = new Map();
  #bookings = new Map();

  async findEventById(id) {
    return this.#events.get(id) || null;
  }

  async findAllEvents() {
    return Array.from(this.#events.values());
  }

  async saveEvent(event) {
    this.#events.set(event.id, event);
    return event;
  }

  async findTierById(id) {
    return this.#tiers.get(id) || null;
  }

  async findTiersByEventId(eventId) {
    return Array.from(this.#tiers.values()).filter((t) => t.eventId === eventId);
  }

  async saveTier(tier) {
    this.#tiers.set(tier.id, tier);
    return tier;
  }

  async findBookingById(id) {
    return this.#bookings.get(id) || null;
  }

  async findBookingByReference(reference) {
    for (const booking of this.#bookings.values()) {
      if (booking.reference === reference) return booking;
    }
    return null;
  }

  async saveBooking(booking) {
    this.#bookings.set(booking.id, booking);
    return booking;
  }
}