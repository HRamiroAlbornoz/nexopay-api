import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClient, mockPoolQuery } = vi.hoisted(() => {
  const mockClient = { query: vi.fn(), release: vi.fn() };
  const mockPoolQuery = vi.fn();
  return { mockClient, mockPoolQuery };
});

vi.mock('../../src/db/connection', () => ({
  default: {
    connect: vi.fn().mockResolvedValue(mockClient),
    query: mockPoolQuery,
  },
}));

import { createSavingsGoal, getSavingsGoalsByWalletId, fundSavingsGoal } from '../../src/queries/savings-goal.queries';

const mockGoal = {
  id: 'goal-1',
  wallet_id: 'wallet-1',
  title: 'Viaje a Europa',
  target_amount: 1000,
  current_amount: 200,
  currency_code: 'USD',
  status: 'active' as const,
  target_date: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('createSavingsGoal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crea una meta nueva con current_amount en 0', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ ...mockGoal, current_amount: 0 }] });

    const goal = await createSavingsGoal({
      walletId: 'wallet-1',
      title: 'Viaje a Europa',
      targetAmount: 1000,
      currencyCode: 'USD',
    });

    expect(goal.current_amount).toBe(0);
    expect(mockPoolQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO savings_goals'), [
      'wallet-1',
      'Viaje a Europa',
      1000,
      'USD',
      null,
    ]);
  });
});

describe('getSavingsGoalsByWalletId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve las metas de la wallet', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [mockGoal] });

    const goals = await getSavingsGoalsByWalletId('wallet-1');

    expect(goals).toEqual([mockGoal]);
  });
});

describe('fundSavingsGoal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanza GOAL_NOT_FOUND cuando la meta no existe', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // SELECT goal FOR UPDATE

    await expect(fundSavingsGoal('goal-1', 'wallet-1', 100)).rejects.toMatchObject({
      code: 'GOAL_NOT_FOUND',
      httpStatus: 404,
    });

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('lanza GOAL_NOT_ACTIVE cuando la meta ya está completed o cancelled', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ ...mockGoal, status: 'completed' }] }); // SELECT goal

    await expect(fundSavingsGoal('goal-1', 'wallet-1', 100)).rejects.toMatchObject({
      code: 'GOAL_NOT_ACTIVE',
      httpStatus: 422,
    });

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('lanza AMOUNT_EXCEEDS_REMAINING cuando el monto supera lo que falta para completar la meta', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [mockGoal] }); // SELECT goal (current_amount: 200, target: 1000, remaining: 800)

    await expect(fundSavingsGoal('goal-1', 'wallet-1', 900)).rejects.toMatchObject({
      code: 'AMOUNT_EXCEEDS_REMAINING',
      httpStatus: 422,
    });

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('lanza INSUFFICIENT_BALANCE cuando el saldo es menor al monto a fondear', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [mockGoal] }) // SELECT goal
      .mockResolvedValueOnce({ rows: [{ amount: 50 }] }); // SELECT balance FOR UPDATE

    await expect(fundSavingsGoal('goal-1', 'wallet-1', 100)).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      httpStatus: 422,
    });

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('fondea la meta y mantiene el estado active cuando no llega al target', async () => {
    const updatedGoal = { ...mockGoal, current_amount: 300, status: 'active' as const };
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [mockGoal] }) // SELECT goal (current_amount: 200, target: 1000)
      .mockResolvedValueOnce({ rows: [{ amount: 500 }] }) // SELECT balance
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE balances (debit)
      .mockResolvedValueOnce({ rows: [updatedGoal], rowCount: 1 }) // UPDATE savings_goals
      .mockResolvedValueOnce({ rows: [{ id: 'tx-1' }] }) // INSERT transactions
      .mockResolvedValueOnce(undefined); // COMMIT

    const { goal, transaction } = await fundSavingsGoal('goal-1', 'wallet-1', 100);

    expect(goal.status).toBe('active');
    expect(transaction.id).toBe('tx-1');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.query).not.toHaveBeenCalledWith('ROLLBACK');
  });

  it('marca la meta como completed cuando current_amount alcanza target_amount', async () => {
    const almostDoneGoal = { ...mockGoal, current_amount: 950, target_amount: 1000 };
    const completedGoal = { ...almostDoneGoal, current_amount: 1000, status: 'completed' as const };
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [almostDoneGoal] }) // SELECT goal
      .mockResolvedValueOnce({ rows: [{ amount: 500 }] }) // SELECT balance
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE balances (debit)
      .mockResolvedValueOnce({ rows: [completedGoal], rowCount: 1 }) // UPDATE savings_goals
      .mockResolvedValueOnce({ rows: [{ id: 'tx-2' }] }) // INSERT transactions
      .mockResolvedValueOnce(undefined); // COMMIT

    const { goal } = await fundSavingsGoal('goal-1', 'wallet-1', 50);

    expect(goal.status).toBe('completed');
  });

  it('lanza BALANCE_NOT_FOUND cuando el UPDATE de balances no afecta ninguna fila', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [mockGoal] }) // SELECT goal
      .mockResolvedValueOnce({ rows: [{ amount: 500 }] }) // SELECT balance
      .mockResolvedValueOnce({ rowCount: 0 }); // UPDATE balances (debit) afecta 0 filas

    await expect(fundSavingsGoal('goal-1', 'wallet-1', 100)).rejects.toMatchObject({
      code: 'BALANCE_NOT_FOUND',
      httpStatus: 500,
    });

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('libera el cliente de la pool incluso cuando ocurre un error', async () => {
    mockClient.query.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ rows: [] });

    await expect(fundSavingsGoal('goal-1', 'wallet-1', 100)).rejects.toThrow();

    expect(mockClient.release).toHaveBeenCalledOnce();
  });
});
