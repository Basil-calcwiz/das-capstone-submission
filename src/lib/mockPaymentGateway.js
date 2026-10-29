export class MockPaymentGateway {
  async charge({ amountCents, card, shouldFail = false }) {
    if (shouldFail || card?.number === 'declined') {
      return { success: false, code: 'PAYMENT_DECLINED', message: 'The payment was declined' };
    }
    return { success: true, transactionId: `tx_${Math.random().toString(36).substring(2, 9)}` };
  }
}