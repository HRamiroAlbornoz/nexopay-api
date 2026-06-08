import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from '../connection';

const daysAgo = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

async function seed(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      'TRUNCATE shared_expense_members, shared_expenses, savings_goals, transactions, balances, wallets, users CASCADE'
    );

    const passwordHash = await bcrypt.hash('Test1234', 10);

    const { rows: [hernan] } = await client.query(
      `INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id`,
      ['hernan@nexopay.com', passwordHash, 'Hernán Albornoz']
    );

    const { rows: [richard] } = await client.query(
      `INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id`,
      ['richard@nexopay.com', passwordHash, 'Richard González']
    );

    const { rows: [hernanWallet] } = await client.query(
      `INSERT INTO wallets (user_id) VALUES ($1) RETURNING id`,
      [hernan.id]
    );

    const { rows: [richardWallet] } = await client.query(
      `INSERT INTO wallets (user_id) VALUES ($1) RETURNING id`,
      [richard.id]
    );

    const balances = [
      [hernanWallet.id, 'ARS', 150000],
      [hernanWallet.id, 'USD', 500],
      [hernanWallet.id, 'EUR', 300],
      [richardWallet.id, 'ARS', 80000],
      [richardWallet.id, 'USD', 200],
      [richardWallet.id, 'EUR', 150],
    ];

    for (const [walletId, currency, amount] of balances) {
      await client.query(
        `INSERT INTO balances (wallet_id, currency_code, amount) VALUES ($1, $2, $3)`,
        [walletId, currency, amount]
      );
    }

    const transactions: [string, string, string, string, number, number, number, string | null, Date][] = [
      [hernanWallet.id,  'buy',          'ARS', 'USD', 50000, 50,    0.001,    null,             daysAgo(30)],
      [hernanWallet.id,  'buy',          'ARS', 'EUR', 55000, 50,    0.000909, null,             daysAgo(28)],
      [hernanWallet.id,  'sell',         'USD', 'ARS', 30,    30000, 1000,     null,             daysAgo(25)],
      [hernanWallet.id,  'exchange',     'USD', 'EUR', 22,    20,    0.909091, null,             daysAgo(20)],
      [hernanWallet.id,  'transfer_out', 'ARS', 'ARS', 10000, 10000, 1,        richardWallet.id, daysAgo(15)],
      [richardWallet.id, 'transfer_in',  'ARS', 'ARS', 10000, 10000, 1,        hernanWallet.id,  daysAgo(15)],
      [hernanWallet.id,  'buy',          'ARS', 'USD', 100000,100,   0.001,    null,             daysAgo(12)],
      [richardWallet.id, 'buy',          'ARS', 'USD', 40000, 40,    0.001,    null,             daysAgo(14)],
      [richardWallet.id, 'sell',         'EUR', 'ARS', 55,    60500, 1100,     null,             daysAgo(11)],
      [richardWallet.id, 'transfer_out', 'USD', 'USD', 100,   100,   1,        hernanWallet.id,  daysAgo(10)],
      [hernanWallet.id,  'transfer_in',  'USD', 'USD', 100,   100,   1,        richardWallet.id, daysAgo(10)],
      [hernanWallet.id,  'sell',         'EUR', 'ARS', 50,    55000, 1100,     null,             daysAgo(7)],
      [richardWallet.id, 'buy',          'ARS', 'EUR', 44000, 40,    0.000909, null,             daysAgo(8)],
      [richardWallet.id, 'buy',          'ARS', 'USD', 30000, 30,    0.001,    null,             daysAgo(5)],
      [hernanWallet.id,  'buy',          'ARS', 'EUR', 33000, 30,    0.000909, null,             daysAgo(3)],
      [richardWallet.id, 'sell',         'USD', 'ARS', 20,    20000, 1000,     null,             daysAgo(2)],
      [hernanWallet.id,  'exchange',     'EUR', 'USD', 20,    22,    1.1,      null,             daysAgo(1)],
    ];

    for (const [walletId, type, currFrom, currTo, amountFrom, amountTo, rate, relatedWalletId, createdAt] of transactions) {
      await client.query(
        `INSERT INTO transactions
          (wallet_id, type, currency_from, currency_to, amount_from, amount_to, exchange_rate, related_wallet_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [walletId, type, currFrom, currTo, amountFrom, amountTo, rate, relatedWalletId, createdAt]
      );
    }

    const savingsGoals = [
      [hernanWallet.id,  'Viaje a Europa',       5000, 500,  'USD', 'active',    '2026-12-31'],
      [hernanWallet.id,  'Auto nuevo',            10000,2000, 'USD', 'active',    '2027-06-30'],
      [hernanWallet.id,  'Fondo de emergencia',   1000, 1000, 'USD', 'completed', null],
      [richardWallet.id, 'Notebook nueva',        1000, 200,  'USD', 'active',    '2026-09-01'],
      [richardWallet.id, 'Vacaciones en Brasil',  2000, 800,  'USD', 'active',    '2026-11-15'],
      [richardWallet.id, 'Curso de inglés',       500,  100,  'USD', 'cancelled', null],
    ];

    for (const [walletId, title, target, current, currency, status, targetDate] of savingsGoals) {
      await client.query(
        `INSERT INTO savings_goals (wallet_id, title, target_amount, current_amount, currency_code, status, target_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [walletId, title, target, current, currency, status, targetDate]
      );
    }

    const { rows: [expensePending] } = await client.query(
      `INSERT INTO shared_expenses (created_by_wallet_id, title, total_amount, currency_code, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [hernanWallet.id, 'Cena equipo NexoPay', 6000, 'ARS', 'pending']
    );

    await client.query(
      `INSERT INTO shared_expense_members (expense_id, wallet_id, amount_owed, amount_paid)
       VALUES ($1, $2, $3, $4)`,
      [expensePending.id, hernanWallet.id, 3000, 3000]
    );
    await client.query(
      `INSERT INTO shared_expense_members (expense_id, wallet_id, amount_owed, amount_paid)
       VALUES ($1, $2, $3, $4)`,
      [expensePending.id, richardWallet.id, 3000, 0]
    );

    const { rows: [expenseSettled] } = await client.query(
      `INSERT INTO shared_expenses (created_by_wallet_id, title, total_amount, currency_code, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [richardWallet.id, 'Alquiler sala de reuniones', 10000, 'ARS', 'settled']
    );

    await client.query(
      `INSERT INTO shared_expense_members (expense_id, wallet_id, amount_owed, amount_paid)
       VALUES ($1, $2, $3, $4)`,
      [expenseSettled.id, hernanWallet.id, 5000, 5000]
    );
    await client.query(
      `INSERT INTO shared_expense_members (expense_id, wallet_id, amount_owed, amount_paid)
       VALUES ($1, $2, $3, $4)`,
      [expenseSettled.id, richardWallet.id, 5000, 5000]
    );

    await client.query('COMMIT');

    console.log('Seed ejecutado correctamente.');
    console.log('');
    console.log('Usuarios de prueba:');
    console.log('  hernan@nexopay.com  /  Test1234');
    console.log('  richard@nexopay.com /  Test1234');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al ejecutar el seed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
