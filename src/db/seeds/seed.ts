import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from '../connection';
import { createSavingsGoal, fundSavingsGoal } from '../../queries/savings-goal.queries';
import { createExpenseWithMembers, settleExpenseMember } from '../../queries/shared-expense.queries';

const daysAgo = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

// Usuarios, wallets, balances iniciales y transacciones históricas decorativas
// (no afectan balances reales — son solo para que el historial no se vea vacío).
// Corre en su propia transacción y confirma antes de devolver el control, para que
// las funciones reales de savings-goals/shared-expenses vean los datos ya persistidos.
async function seedBaseData(): Promise<{ hernanWallet: string; richardWallet: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      'TRUNCATE shared_expense_members, shared_expenses, savings_goals, transactions, balances, wallets, users CASCADE'
    );

    const passwordHash = await bcrypt.hash('Test1234', 10);

    const {
      rows: [hernan],
    } = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id`,
      ['hernan@nexopay.com', passwordHash, 'Hernán', 'Albornoz']
    );

    const {
      rows: [richard],
    } = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id`,
      ['richard@nexopay.com', passwordHash, 'Richard', 'González']
    );

    const {
      rows: [hernanWallet],
    } = await client.query(`INSERT INTO wallets (user_id) VALUES ($1) RETURNING id`, [hernan.id]);

    const {
      rows: [richardWallet],
    } = await client.query(`INSERT INTO wallets (user_id) VALUES ($1) RETURNING id`, [richard.id]);

    const balances = [
      [hernanWallet.id, 'ARS', 150000],
      [hernanWallet.id, 'USD', 500],
      [hernanWallet.id, 'EUR', 300],
      [richardWallet.id, 'ARS', 80000],
      [richardWallet.id, 'USD', 200],
      [richardWallet.id, 'EUR', 150],
    ];

    for (const [walletId, currency, amount] of balances) {
      await client.query(`INSERT INTO balances (wallet_id, currency_code, amount) VALUES ($1, $2, $3)`, [
        walletId,
        currency,
        amount,
      ]);
    }

    const transactions: [string, string, string, string, number, number, number, string | null, Date][] = [
      [hernanWallet.id, 'buy', 'ARS', 'USD', 50000, 50, 0.001, null, daysAgo(30)],
      [hernanWallet.id, 'buy', 'ARS', 'EUR', 55000, 50, 0.000909, null, daysAgo(28)],
      [hernanWallet.id, 'sell', 'USD', 'ARS', 30, 30000, 1000, null, daysAgo(25)],
      [hernanWallet.id, 'exchange', 'USD', 'EUR', 22, 20, 0.909091, null, daysAgo(20)],
      [hernanWallet.id, 'transfer_out', 'ARS', 'ARS', 10000, 10000, 1, richardWallet.id, daysAgo(15)],
      [richardWallet.id, 'transfer_in', 'ARS', 'ARS', 10000, 10000, 1, hernanWallet.id, daysAgo(15)],
      [hernanWallet.id, 'buy', 'ARS', 'USD', 100000, 100, 0.001, null, daysAgo(12)],
      [richardWallet.id, 'buy', 'ARS', 'USD', 40000, 40, 0.001, null, daysAgo(14)],
      [richardWallet.id, 'sell', 'EUR', 'ARS', 55, 60500, 1100, null, daysAgo(11)],
      [richardWallet.id, 'transfer_out', 'USD', 'USD', 100, 100, 1, hernanWallet.id, daysAgo(10)],
      [hernanWallet.id, 'transfer_in', 'USD', 'USD', 100, 100, 1, richardWallet.id, daysAgo(10)],
      [hernanWallet.id, 'sell', 'EUR', 'ARS', 50, 55000, 1100, null, daysAgo(7)],
      [richardWallet.id, 'buy', 'ARS', 'EUR', 44000, 40, 0.000909, null, daysAgo(8)],
      [richardWallet.id, 'buy', 'ARS', 'USD', 30000, 30, 0.001, null, daysAgo(5)],
      [hernanWallet.id, 'buy', 'ARS', 'EUR', 33000, 30, 0.000909, null, daysAgo(3)],
      [richardWallet.id, 'sell', 'USD', 'ARS', 20, 20000, 1000, null, daysAgo(2)],
      [hernanWallet.id, 'exchange', 'EUR', 'USD', 20, 22, 1.1, null, daysAgo(1)],
    ];

    for (const [
      walletId,
      type,
      currFrom,
      currTo,
      amountFrom,
      amountTo,
      rate,
      relatedWalletId,
      createdAt,
    ] of transactions) {
      await client.query(
        `INSERT INTO transactions
          (wallet_id, type, currency_from, currency_to, amount_from, amount_to, exchange_rate, related_wallet_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [walletId, type, currFrom, currTo, amountFrom, amountTo, rate, relatedWalletId, createdAt]
      );
    }

    await client.query('COMMIT');

    return { hernanWallet: hernanWallet.id, richardWallet: richardWallet.id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Crea las metas y las fondea a través de fundSavingsGoal — así cada aporte deja
// su transacción savings_goal_fund real en el ledger y debita el balance de verdad,
// en vez de simular un current_amount > 0 sin ningún movimiento que lo respalde.
async function seedSavingsGoals(hernanWallet: string, richardWallet: string): Promise<void> {
  const europaGoal = await createSavingsGoal({
    walletId: hernanWallet,
    title: 'Viaje a Europa',
    targetAmount: 5000,
    currencyCode: 'USD',
    targetDate: new Date('2026-12-31'),
  });
  await fundSavingsGoal(europaGoal.id, hernanWallet, 150);

  const autoGoal = await createSavingsGoal({
    walletId: hernanWallet,
    title: 'Auto nuevo',
    targetAmount: 10000,
    currencyCode: 'USD',
    targetDate: new Date('2027-06-30'),
  });
  await fundSavingsGoal(autoGoal.id, hernanWallet, 150);

  const emergencyGoal = await createSavingsGoal({
    walletId: hernanWallet,
    title: 'Fondo de emergencia',
    targetAmount: 100,
    currencyCode: 'USD',
  });
  await fundSavingsGoal(emergencyGoal.id, hernanWallet, 100); // se completa

  const notebookGoal = await createSavingsGoal({
    walletId: richardWallet,
    title: 'Notebook nueva',
    targetAmount: 1000,
    currencyCode: 'USD',
    targetDate: new Date('2026-09-01'),
  });
  await fundSavingsGoal(notebookGoal.id, richardWallet, 80);

  const brasilGoal = await createSavingsGoal({
    walletId: richardWallet,
    title: 'Vacaciones en Brasil',
    targetAmount: 2000,
    currencyCode: 'USD',
    targetDate: new Date('2026-11-15'),
  });
  await fundSavingsGoal(brasilGoal.id, richardWallet, 80);

  // Cancelada: no implica ningún movimiento de plata (nunca se fondeó), así que
  // un UPDATE de estado directo no rompe la consistencia del ledger.
  const englishGoal = await createSavingsGoal({
    walletId: richardWallet,
    title: 'Curso de inglés',
    targetAmount: 500,
    currencyCode: 'USD',
  });
  await pool.query(`UPDATE savings_goals SET status = 'cancelled' WHERE id = $1`, [englishGoal.id]);
}

// Crea los gastos compartidos y salda los que correspondan a través de
// settleExpenseMember — el saldo queda respaldado por transacciones reales
// (shared_expense_paid / shared_expense_received) y balances debitados/acreditados.
async function seedSharedExpenses(hernanWallet: string, richardWallet: string): Promise<void> {
  // Pendiente: hernán crea la cena (su parte queda auto-saldada), richard todavía debe la suya.
  await createExpenseWithMembers({
    creatorWalletId: hernanWallet,
    title: 'Cena equipo NexoPay',
    totalAmount: 6000,
    currencyCode: 'ARS',
    members: [
      { walletId: hernanWallet, amountOwed: 3000 },
      { walletId: richardWallet, amountOwed: 3000 },
    ],
  });

  // Saldado: richard crea el alquiler, hernán liquida su parte de verdad.
  const meetingRoomExpense = await createExpenseWithMembers({
    creatorWalletId: richardWallet,
    title: 'Alquiler sala de reuniones',
    totalAmount: 10000,
    currencyCode: 'ARS',
    members: [
      { walletId: richardWallet, amountOwed: 5000 },
      { walletId: hernanWallet, amountOwed: 5000 },
    ],
  });
  await settleExpenseMember(meetingRoomExpense.id, hernanWallet);
}

async function seed(): Promise<void> {
  try {
    const { hernanWallet, richardWallet } = await seedBaseData();
    await seedSavingsGoals(hernanWallet, richardWallet);
    await seedSharedExpenses(hernanWallet, richardWallet);

    console.log('Seed ejecutado correctamente.');
    console.log('');
    console.log('Usuarios de prueba:');
    console.log('  hernan@nexopay.com  /  Test1234');
    console.log('  richard@nexopay.com /  Test1234');
  } catch (err) {
    console.error('Error al ejecutar el seed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
