import { assertTransition } from '../domain/bookingStateMachine.js';
import { DomainError } from '../domain/errors.js';
import { newId, referenceCode } from '../domain/ids.js';

export const MAX_TICKETS_PER_BOOKING = 10;

export class BookingService {
  #repo;
  #paymentGateway;

  constructor(repository, paymentGateway) {
    this.#repo = repository;
    this.#paymentGateway = paymentGateway;
  }

  async bookTickets({ userId, tierId, quantity }) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
      throw new DomainError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
    }

    const tier = await this.#repo.findTierById(tierId);
    if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');

    const seatsLeft = tier.capacity - tier.sold;
    if (seatsLeft < quantity) {
      const message = seatsLeft === 0 ? `${tier.name} is sold out` : `Only ${seatsLeft} ticket(s) left in ${tier.name}`;
      throw new DomainError('SOLD_OUT', message, { seatsLeft });
    }

    tier.sold += quantity;
    await this.#repo.saveTier(tier);

    let reference;
    do {
      reference = referenceCode();
    } while (await this.#repo.findBookingByReference(reference));

    const booking = {
      id: newId(),
      reference,
      userId,
      tierId,
      quantity,
      amountCents: tier.priceCents * quantity,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    return await this.#repo.saveBooking(booking);
  }

  async payBooking({ reference, userId, card, shouldFail = false }) {
    const booking = await this.#repo.findBookingByReference(reference);
    if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');

    if (booking.userId && userId && booking.userId !== userId) {
      throw new DomainError('FORBIDDEN', 'Cannot pay for another user booking');
    }

    assertTransition(booking.status, 'paid');

    const paymentResult = await this.#paymentGateway.charge({
      amountCents: booking.amountCents,
      card,
      shouldFail,
    });

    if (!paymentResult.success) {
      throw new DomainError('PAYMENT_DECLINED', paymentResult.message);
    }

    booking.status = 'paid';
    return await this.#repo.saveBooking(booking);
  }

  async cancelBooking({ reference, userId }) {
    const booking = await this.#repo.findBookingByReference(reference);
    if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');

    if (booking.userId && userId && booking.userId !== userId) {
      throw new DomainError('FORBIDDEN', 'Cannot cancel another user booking');
    }

    assertTransition(booking.status, 'cancelled');

    if (booking.status !== 'pending') {
      throw new DomainError('INVALID_STATE', 'Only unpaid bookings can be cancelled');
    }

    const tier = await this.#repo.findTierById(booking.tierId);
    if (tier) {
      tier.sold = Math.max(0, tier.sold - booking.quantity);
      await this.#repo.saveTier(tier);
    }

    booking.status = 'cancelled';
    return await this.#repo.saveBooking(booking);
  }
}
