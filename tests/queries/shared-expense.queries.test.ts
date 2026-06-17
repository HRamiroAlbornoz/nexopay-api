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

import {
  validateWalletsExist,
  createExpenseWithMembers,
  getSharedExpensesByWalletId,
  settleExpenseMember,
} from '../../src/queries/shared-expense.queries';

const mockExpense = {
  id: 'expense-1',
  created_by_wallet_id: 'wallet-creator',
  title: 'Cena equipo',
  total_amount: 300,
  currency_code: 'ARS',
  status: 'pending' as const,
  created_at: new Date(),
};

const mockMember = {
  id: 'member-payer',
  wallet_id: 'wallet-payer',
  amount_owed: 100,
  amount_paid: 0,
};

describe('validateWalletsExist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no lanza error cuando todas las wallets existen', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'wallet-1' }, { id: 'wallet-2' }] });

    await expect(validateWalletsExist(['wallet-1', 'wallet-2'])).resolves.toBeUndefined();
  });

  it('lanza INVALID_WALLETS cuando alguna wallet no existe', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'wallet-1' }] });

    await expect(validateWalletsExist(['wallet-1', 'wallet-ghost'])).rejects.toMatchObject({
      code: 'INVALID_WALLETS',
      httpStatus: 422,
    });
  });
});

describe('createExpenseWithMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crea el gasto con los miembros, marcando pagada la parte del creador', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'wallet-creator' }, { id: 'wallet-payer' }] }) // validateWalletsExist (via client)
      .mockResolvedValueOnce({ rows: [mockExpense] }) // INSERT shared_expenses
      .mockResolvedValueOnce({
        rows: [
          { id: 'member-creator', wallet_id: 'wallet-creator', amount_owed: 200, amount_paid: 200 },
          { id: 'member-payer', wallet_id: 'wallet-payer', amount_owed: 100, amount_paid: 0 },
        ],
      }) // INSERT shared_expense_members (unnest)
      .mockResolvedValueOnce(undefined); // COMMIT

    const expense = await createExpenseWithMembers({
      creatorWalletId: 'wallet-creator',
      title: 'Cena equipo',
      totalAmount: 300,
      currencyCode: 'ARS',
      members: [
        { walletId: 'wallet-creator', amountOwed: 200 },
        { walletId: 'wallet-payer', amountOwed: 100 },
      ],
    });

    expect(expense.members).toHaveLength(2);
    expect(expense.members.find((m) => m.wallet_id === 'wallet-creator')?.amount_paid).toBe(200);
    expect(expense.members.find((m) => m.wallet_id === 'wallet-payer')?.amount_paid).toBe(0);

    const insertMembersCall = mockClient.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO shared_expense_members')
    );
    expect(insertMembersCall?.[1]).toEqual(['expense-1', ['wallet-creator', 'wallet-payer'], [200, 100], [200, 0]]);
  });

  it('lanza INVALID_WALLETS y hace ROLLBACK si alguna wallet no existe', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'wallet-creator' }] }); // falta wallet-payer

    await expect(
      createExpenseWithMembers({
        creatorWalletId: 'wallet-creator',
        title: 'Cena equipo',
        totalAmount: 300,
        currencyCode: 'ARS',
        members: [
          { walletId: 'wallet-creator', amountOwed: 200 },
          { walletId: 'wallet-payer', amountOwed: 100 },
        ],
      })
    ).rejects.toMatchObject({ code: 'INVALID_WALLETS', httpStatus: 422 });

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });
});

describe('getSharedExpensesByWalletId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve los gastos con sus miembros agregados', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ ...mockExpense, members: [mockMember] }] });

    const expenses = await getSharedExpensesByWalletId('wallet-creator', 20, 0);

    expect(expenses[0].members).toEqual([mockMember]);
  });
});

describe('settleExpenseMember', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanza NOT_MEMBER cuando la wallet no es miembro del gasto', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // SELECT todos los miembros FOR UPDATE

    await expect(settleExpenseMember('expense-1', 'wallet-outsider')).rejects.toMatchObject({
      code: 'NOT_MEMBER',
      httpStatus: 403,
    });

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('lanza ALREADY_PAID cuando el miembro ya saldó su parte', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ ...mockMember, amount_paid: 100 }] }); // owed === paid

    await expect(settleExpenseMember('expense-1', 'wallet-payer')).rejects.toMatchObject({
      code: 'ALREADY_PAID',
      httpStatus: 422,
    });
  });

  it('lanza EXPENSE_NOT_FOUND si el gasto no existe', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [mockMember] }) // SELECT miembros
      .mockResolvedValueOnce({ rows: [] }); // SELECT expense -> no existe

    await expect(settleExpenseMember('expense-1', 'wallet-payer')).rejects.toMatchObject({
      code: 'EXPENSE_NOT_FOUND',
      httpStatus: 404,
    });
  });

  it('lanza INSUFFICIENT_BALANCE cuando el saldo del pagador no alcanza', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [mockMember] }) // SELECT miembros (owed:100, paid:0)
      .mockResolvedValueOnce({ rows: [mockExpense] }) // SELECT expense
      .mockResolvedValueOnce({ rows: [{ wallet_id: 'wallet-payer', amount: 50 }] }); // lockBalancesForUpdate

    await expect(settleExpenseMember('expense-1', 'wallet-payer')).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      httpStatus: 422,
    });

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('lanza BALANCE_NOT_FOUND cuando el débito no afecta ninguna fila', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [mockMember] })
      .mockResolvedValueOnce({ rows: [mockExpense] })
      .mockResolvedValueOnce({ rows: [{ wallet_id: 'wallet-payer', amount: 500 }] })
      .mockResolvedValueOnce({ rowCount: 0 }); // UPDATE balances (debit) afecta 0 filas

    await expect(settleExpenseMember('expense-1', 'wallet-payer')).rejects.toMatchObject({
      code: 'BALANCE_NOT_FOUND',
      httpStatus: 500,
    });
  });

  it('salda la deuda, registra ambas transacciones, y marca el gasto settled cuando todos pagaron', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [mockMember] }) // SELECT miembros: solo el pagador, sin nadie más pendiente
      .mockResolvedValueOnce({ rows: [mockExpense] }) // SELECT expense
      .mockResolvedValueOnce({ rows: [{ wallet_id: 'wallet-payer', amount: 500 }] }) // lockBalancesForUpdate
      .mockResolvedValueOnce({ rowCount: 1 }) // debitBalance
      .mockResolvedValueOnce({ rowCount: 1 }) // creditBalance
      .mockResolvedValueOnce(undefined) // UPDATE shared_expense_members (marcar pagado)
      .mockResolvedValueOnce(undefined) // UPDATE shared_expenses status='settled'
      .mockResolvedValueOnce({ rows: [{ id: 'tx-paid' }] }) // INSERT transactions (paid)
      .mockResolvedValueOnce(undefined) // INSERT transactions (received)
      .mockResolvedValueOnce(undefined); // COMMIT

    const { expense, transaction } = await settleExpenseMember('expense-1', 'wallet-payer');

    expect(expense.status).toBe('settled');
    expect(expense.members.find((m) => m.wallet_id === 'wallet-payer')?.amount_paid).toBe(100);
    expect(transaction.id).toBe('tx-paid');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.query).not.toHaveBeenCalledWith('ROLLBACK');

    const insertTxCalls = mockClient.query.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO transactions')
    );
    expect(insertTxCalls).toHaveLength(2);
    expect(insertTxCalls[0][1]).toEqual(['wallet-payer', 'ARS', 100, 'wallet-creator', 'expense-1']);
    expect(insertTxCalls[1][1]).toEqual(['wallet-creator', 'ARS', 100, 'wallet-payer', 'expense-1']);
  });

  it('mantiene el gasto pending cuando todavía hay otro miembro sin pagar', async () => {
    const otherMember = { id: 'member-other', wallet_id: 'wallet-other', amount_owed: 50, amount_paid: 0 };

    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [mockMember, otherMember] }) // SELECT miembros: 2 en total
      .mockResolvedValueOnce({ rows: [mockExpense] }) // SELECT expense
      .mockResolvedValueOnce({ rows: [{ wallet_id: 'wallet-payer', amount: 500 }] }) // lockBalancesForUpdate
      .mockResolvedValueOnce({ rowCount: 1 }) // debitBalance
      .mockResolvedValueOnce({ rowCount: 1 }) // creditBalance
      .mockResolvedValueOnce(undefined) // UPDATE shared_expense_members (marcar pagado)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-paid-2' }] }) // INSERT transactions (paid) — no hay UPDATE de status
      .mockResolvedValueOnce(undefined) // INSERT transactions (received)
      .mockResolvedValueOnce(undefined); // COMMIT

    const { expense } = await settleExpenseMember('expense-1', 'wallet-payer');

    expect(expense.status).toBe('pending');
  });

  it('libera el cliente de la pool incluso cuando ocurre un error', async () => {
    mockClient.query.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ rows: [] });

    await expect(settleExpenseMember('expense-1', 'wallet-payer')).rejects.toThrow();

    expect(mockClient.release).toHaveBeenCalledOnce();
  });
});
