import { searchEvents, summarizeEvent } from '../domain/eventSearch.js';
import { DomainError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('VALIDATION', `${field} is required`);
  }
  return value.trim();
}

function requireWholeNumber(value, field, min) {
  if (!Number.isInteger(value) || value < min) {
    throw new DomainError('VALIDATION', `${field} must be a whole number of at least ${min}`);
  }
  return value;
}

export class EventService {
  #repo;

  constructor(repository) {
    this.#repo = repository;
  }

  async createEvent(data = {}) {
    const title = requireText(data.title, 'Title');
    const city = requireText(data.city, 'City');
    const startsAtRaw = data.startsAt || data.date;
    const date = new Date(startsAtRaw);
    if (!startsAtRaw || Number.isNaN(date.getTime())) {
      throw new DomainError('VALIDATION', 'startsAt must be a valid date');
    }

    const event = {
      id: newId(),
      organizerId: data.organizerId || 'organizer_1',
      title,
      city,
      venue: String(data.venue ?? '').trim(),
      startsAt: date.toISOString(),
      status: 'draft',
      tierIds: [],
    };

    return await this.#repo.saveEvent(event);
  }

  async addTier(eventId, data = {}) {
    const event = await this.#repo.findEventById(eventId);
    if (!event) throw new DomainError('NOT_FOUND', 'Event not found');

    const name = requireText(data.name, 'Tier name');
    const priceCents = requireWholeNumber(data.priceCents, 'priceCents', 0);
    const capacity = requireWholeNumber(data.capacity, 'capacity', 1);

    const tier = {
      id: newId(),
      eventId,
      name,
      priceCents,
      capacity,
      sold: 0,
    };

    if (!Array.isArray(event.tierIds)) {
      event.tierIds = [];
    }
    event.tierIds.push(tier.id);
    await this.#repo.saveEvent(event);

    return await this.#repo.saveTier(tier);
  }

  async publishEvent(eventId) {
    const event = await this.#repo.findEventById(eventId);
    if (!event) throw new DomainError('NOT_FOUND', 'Event not found');

    const tiers = await this.#repo.findTiersByEventId(eventId);
    if (!tiers || tiers.length === 0) {
      throw new DomainError('INVALID_STATE', 'Add at least one ticket tier before publishing');
    }

    event.status = 'published';
    return await this.#repo.saveEvent(event);
  }

  async searchEvents(criteria = {}, sortBy = 'date') {
    const events = await this.#repo.findAllEvents();
    const publishedEvents = events.filter((e) => e.status === 'published');

    const summaries = await Promise.all(
      publishedEvents.map(async (event) => {
        const tiers = await this.#repo.findTiersByEventId(event.id);
        return summarizeEvent(event, tiers);
      })
    );

    return searchEvents(summaries, criteria, sortBy);
  }
}